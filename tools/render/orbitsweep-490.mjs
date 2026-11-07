// Copyright (c) Meta Platforms, Inc. and affiliates.

// orbitsweep-490.mjs — GH-490 ORBIT SWEEP mirror (finale-review cure lane).
//
// The 489 side of the finale review failed on three between-register
// failure classes the register gates never see (orbitsweep-489.mjs header);
// the 490 side PASSED — but the maintainer passed it on 8 extracted
// frames, not the 540 the orbit sweeps. This mirror runs the SAME
// failure-class judges over the 490 finale orbits (72 bearings per orbit,
// capture-490/finale-orbit session laws: cinema boot, joy_lowrect GI +
// photo-tex settle, EMPTY-TABLE law, venue lighting — no orbit preset) so
// the class can never ship silently on either table:
//   · furniture-as-lamp (blown fraction inside the pocket-furniture mask +
//     non-lamp frame blown fraction);
//   · rail identity (bright-saturated color / colored-bright median; the
//     490 rails are the owner-ruled mahogany family, hex 0x8a667a);
//   · black-void census inside cloth.
// The 490 tree is FROZEN (fix-490-chinese8-visual @ 6cd246ff) — the tool
// lives on the 489 cure branch and points at the finale worktree via
// --web; mask classification uses that tree's stable names/hexes (no tags
// on a frozen tree). Boot-analog median-luma window is DISABLED (1.0):
// deriving a JOY-dossier net-luma family is its own round — the lamp-read
// class rides the blown-fraction judges, which transfer as-is.
//
// Modes:
//   --sweep [--orbits corner,fulltable] [--frames N] [--out DIR]
//       capture + judge; exit 0 green, 3 red (any frame fails any judge)
//   --judge-only --out DIR         re-judge an existing capture
//   --red-arm                      verify the pinned PRE-CURE red basis
//       (tools/render/fixtures/orbitsweep-489-red-basis.json) still FIRES
//       all three failure classes at their recorded bearings under the
//       CURRENT judge windows — the cammatch stale-fixture precedent: a
//       judge/threshold regression can never pass silently.
// Ports: OB_E2E_PORT/OB_E2E_CDP_PORT pin; else claims 26760-26789 (the 490
// finale band, free since the finale capture retired).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2)); // FIX10 (Fable pass 1): the run's view of the argv is the =-expanded view the parse consumed
const argOf = (k, d) => { const i = args.lastIndexOf(k); return i >= 0 ? args[i + 1] : d; };
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value
// FIX3 (P2 (a)): the load-time --pack existence check moved back INTO the judge path, after the stale report is
// removed — a refusal must never come before the prior verdict is invalidated (the in-function read keeps mustExist)

// review orbit-cure r1 P2: no machine-specific default — the 490 finale
// tree is a per-machine worktree, so --web is REQUIRED for capture modes
// (judge-only re-judges an existing capture without any web tree).
// FIX3 (P2 (a)): the destination is resolved and the prior verdict removed BEFORE the --web existence check
const { invalidatePrior: __invalidatePrior } = await import('./lib/serve-check.mjs');
const { manifestOrbitNames: __manifestNames, removeManifest: __removeManifest, writeManifest: __writeManifest, resolveJudgeOrbits: __resolveJudgeOrbits, requireOrbitReport: __requireOrbitReport, readOrbitMeta: __readOrbitMeta } = await import('./lib/orbit-manifest.mjs');
const { validateSelection: __validateSelection } = await import('./lib/mode-outputs.mjs'); const { optPresent: __optPresent, optValue: __optValue } = await import('./lib/argv.mjs'); // FIX8 (review round 8 on #731 P2 B): a selection is validated BEFORE any deletion path is built from it // FIX7 (Fable passes 2 + 3): one manifest module for both drivers
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'orbitsweep-490', value: ['--out', '--web', '--pack', '--frames', '--orbits'], bool: ['--sweep', '--judge-only', '--red-arm', '--encoded', '--encoded-selftest'] });
const OUT = __P.value('--out') ?? '/tmp/ob-orbitsweep-490';
// the per-orbit judge reports of THIS run's orbit names only (`--orbits`, default corner,fulltable; plain tokens) — never every
// subdirectory of a shared --out (refuter pass 3: `--out /tmp` would have removed sibling tools' report.json)
const KNOWN_ORBITS = ['corner', 'fulltable']; // the capture names GEO defines (asserted against GEO below) — ONE known list for the load-time invalidation names, the manifest and --orbits (Fable pass 4)
// FIX7 (review round 7 on #731 P2 A): each mode invalidates ONLY its own output set — sweep / judge, encoded and red-arm
// results coexist under one --out; a run without exactly one mode flag removes nothing (the mode refusal follows)
// ONE resolver for the mode: the same priority chain the run executes (sweep > judge-only > red-arm > encoded; refuter pass on
// FIX7: an exactly-one rule here beside the chain below let `--sweep --judge-only` invalidate nothing and then RUN the sweep)
const __modeEarly = __P.has('--sweep') ? 'sweep' : __P.has('--judge-only') ? 'judge-only' : __P.has('--red-arm') ? 'red-arm' : __P.has('--encoded') ? 'encoded' : null; // over the parsed argv (FIX10)
// FIX8 (review round 8 on #731 P2 B; Fable pass 1 — the two-tier rule): TIER 1, the mode's FIXED-NAME artefacts under the literal
// --out are the first effect (the RED/GREEN report, the encoded bars + cfg) — a prior verdict of this tool never survives a
// refused run (FIX3); TIER 2, the artefacts DERIVED from a selection (the per-orbit report.json of the --orbits names) are removed
// only after the selection is validated against KNOWN_ORBITS — `--judge-only --orbits unrelated --out X` refuses with
// X/unrelated/report.json byte-identical (it used to be removed first). `--orbits` is read as the run reads it (last occurrence, `=` form).
const __FIXED = {
  // capture-manifest.json is NOT in this set (Fable pass 2 on FIX7): it is the capture's completion record and is removed at the
  // capture session's first write below — a refused --sweep leaves the last complete capture judgeable, a crashed one leaves no manifest
  sweep: [path.join(OUT, 'orbitsweep-490-report.json')],
  'judge-only': [path.join(OUT, 'orbitsweep-490-report.json')],
  encoded: [path.join(OUT, 'encoded-bars-490.json'), path.join(OUT, 'encoded-cfg-490.json')],
  'red-arm': [], // its output set is the whole encoded-selftest/ directory (template, synthetic clips, per-case cfg + bars verdicts) — removed below as a directory
};
const __ORBITS_RAW = __P.value('--orbits'); // FIX9 (P2 A): the VALUE is read by the writer's reader BEFORE the first effect — a blank / whitespace / `=`-empty / trailing --orbits is refused by name with nothing removed (it owns nothing)
const __TIER1 = __invalidatePrior(__FIXED[__modeEarly] || [], 'orbitsweep-490');
const __ORBITS_ARG = __ORBITS_RAW !== null ? __validateSelection({ values: __ORBITS_RAW, known: KNOWN_ORBITS, what: 'orbit', tag: 'orbitsweep-490', removed: __TIER1 }) : null; // tier 2's known-set check (a well-formed unknown name) comes after tier 1
// FIX7 (Fable pass 2): a default --judge-only judges the LAST capture's manifest orbits, so it invalidates exactly those per-orbit
// reports (the manifest is a read-only input of that mode; absent / unreadable → the default names, and judge() refuses by name)
const __manifestOrbits = () => { const o = __manifestNames(OUT, { mode: __modeEarly, args, known: KNOWN_ORBITS, explicit: __ORBITS_ARG !== null }); return o ? o.join(',') : null; };
const __orbitReports = (o) => { const names = String(__ORBITS_ARG ? __ORBITS_ARG.join(',') : __manifestOrbits() || 'corner,fulltable').split(',').map((x) => x.trim()).filter((x) => /^[A-Za-z0-9_-]+$/.test(x)); return names.map((n) => path.join(o, n, 'report.json')); };
if (__modeEarly === 'sweep' || __modeEarly === 'judge-only') __invalidatePrior(__orbitReports(OUT), 'orbitsweep-490'); // tier 2
if (__modeEarly === 'red-arm') { const st = path.join(OUT, 'encoded-selftest'); if (fs.existsSync(st)) { fs.rmSync(st, { recursive: true, force: true }); console.error(`[orbitsweep-490] prior artefact(s) invalidated before any guard: ${st}/ (the red-arm selftest's own output directory)`); } }
// structural-490.json carries the STORED measurements a --judge-only rerun re-verdicts AND the prior verdict (`fails`): the
// verdict is removed here — only for the two modes that re-verdict it — the measurements stay (removing the file would
// starve --judge-only of its evidence)
if (__modeEarly === 'sweep' || __modeEarly === 'judge-only') { const st = path.join(OUT, 'structural-490.json'); try { if (fs.existsSync(st)) { const j = JSON.parse(fs.readFileSync(st, 'utf8')); if (j && Object.prototype.hasOwnProperty.call(j, 'fails')) { delete j.fails; j.verdict_invalidated = 'prior structural verdict removed before any guard (FIX3); measurements kept for --judge-only'; fs.writeFileSync(st, JSON.stringify(j, null, 2)); console.error(`[orbitsweep-490] prior structural verdict invalidated before any guard: ${st}`); } } } catch (e) { console.error(`[orbitsweep-490] REFUSED — could not invalidate the prior structural verdict at ${st}: ${e.message}`); process.exit(2); } }
const webDir = __pathOpt('--web', { tag: 'orbitsweep-490', mustExist: 'dir' }) ? path.resolve(__pathOpt('--web', { tag: 'orbitsweep-490', mustExist: 'dir' })) : null;
const FRAMES = Number(__stringOpt('--frames', { default: 72, tag: 'orbitsweep-490' }));
const ORBITS = __ORBITS_ARG ? [...__ORBITS_ARG] : ['corner', 'fulltable']; // FIX8: the validated selection (never a raw split)
const JUDGE_PY = path.join(HERE, 'orbitsweep-judge.py');
// GH-490 BLOCKER-CURE (finale adversarial review): the 490 side did NOT
// survive the five-lens review — 7 blockers. The sweep gains the rows the
// escape classes were missing: leg identity + LEG-COUNT (B4/B7),
// INTERIOR-MATERIAL ordering (B2), and driver-side STRUCTURAL rows
// (bed-inside-blinds B6, block/ring clearance B3, bag light-trap field
// B2, leg stance census B4, sock/blind clearance + gathering ring B5).
// Red-armed on the measured 6cd246ff pre-cure basis (fixture below).
const RED_BASIS = path.join(HERE,
  'fixtures/orbitsweep-490-red-basis-blockers.json');
const W = 1600, H = 1000;

// finale-orbit.mjs GEO (490) verbatim — the orbit the owner reviews
const GEO = {
  fulltable: { center: [0, 0, -0.12], r: 2.9, h: 1.35, fov: 42 },
  corner: { center: [0.678, 1.318, -0.02], r: 0.46, h: 0.40, fov: 36 },
  orbitPreset: null, // venue rig = the reviewed state (finale-orbit law)
};
{ const k = Object.keys(GEO).filter((x) => x !== 'orbitPreset'); if (k.length !== KNOWN_ORBITS.length || k.some((x) => !KNOWN_ORBITS.includes(x))) throw new Error(`KNOWN_ORBITS ${KNOWN_ORBITS} != GEO orbits ${k}`); } // one known list (Fable pass 4)

// Photo-derived judge windows (derivations in orbitsweep-judge.py header).
const WINDOWS = {
  table: '490',
  boot_l_med_max: 1.0, // disabled — see header (blown judges carry the class)
  boot_blown_frac_max: 0.08,
  rail_magenta_frac_max: 0.10,
  // colored-bright bound: washed-neutral grazing legitimately reaches
  // V ~0.60 (GM2025 far-rail top V0.60 S0.13) — rail_v_med_max only
  // fires when the median is also SATURATED (S > 0.30: the identity
  // break); a neutral flare is capped separately at rail_flare_v_max
  // (the disclosed residual-1 silver class, bounded at the pre-cure
  // disclosed magnitude + margin so it can never grow past what the
  // owner reviewed under disclosure)
  rail_v_med_max: 0.62,
  // 489 IDENTITY round mirror: the flare-cap posture (rail_flare_v_max
  // 0.78) is retired judge-side for the per-bearing-band identity
  // windows. The 490 bands are NOT a JOY-dossier derivation (that
  // derivation is its own round) — they PIN the sealed owner-passed
  // finale state (green sweep 2026-08-21 @6cd246ff: rail v_med
  // 0.071-0.196 corner / 0.086-0.110 fulltable, bright-frac <= 0.0004
  // everywhere) with generous margins, so the white-wash class can
  // never grow onto the 490 side silently. Leg/apron/seam rows
  // auto-skip on this table (the frozen tree's mask carries no
  // leg/apron classes; junction columns = 0) — disclosed in the
  // identity-round record.
  rail_v_med_max_band: { side: 0.21, end: 0.21, oblique: 0.21, close: 0.30 },
  rail_bright_frac_max_band: { side: 0.10, end: 0.10, oblique: 0.10,
    close: 0.10 },
  void_count_max: 0,
  blown_frame_frac_max: 0.005,
  // review orbit-cure r4 P2: a renamed mesh / lost material tag must FAIL
  // the frame, never zero-pass the judges it blinds — per-orbit minimum
  // subsampled mask populations (floors ~40-60%% of the measured minima:
  // 489 corner boot 12.4k / fulltable 2.0k; 490 corner 19.8k / 4.2k)
  mask_min_px: { corner: { boot: 8000, rail: 2000, cloth: 5000 },
    fulltable: { boot: 1600, rail: 5000, cloth: 20000 } },
  // ---- BLOCKER-CURE rows (dossier-joy-q8 derivations) ----
  // (e) leg identity — JOY amber-gold family: tpt_q8_leg_macro H 25.7-26.6
  // S 0.53 V 0.49-0.55; tpt hero legs H 24.5-27.3. Ceiling H 34 sits
  // between the family (+ venue-warmth margin) and the REJECTED
  // olive-khaki render (H 38.8-39.6, WB ruled out by the in-frame
  // champagne-band control) — red-fires by construction. Spread rows
  // disabled (no JOY spread derivation; identity axis = hue).
  leg_min_px: { corner: 1500, fulltable: 600 },
  leg: { h_med: [16, 34], s_med_max: 0.68, v_med: [0.12, 0.88],
    spread_min: 0.0, spread_min_close: 0.0 },
  // (h) B4 leg count: 6-leg truth (src_csy arena mid-side leg) — side
  // bearings must read >= 3 screen-x clusters incl. one mid-table.
  leg_count: { min_clusters: 3, mid_frac: 0.22, gap_px: 40,
    mid_required: true, d_side_max: 25 },
  // (i) B2 interior ordering GUARDS: dossier macros hole/cloth
  // 0.04-0.06 (drop = darkest element). The hole/ann-floor rows judge
  // on the corner-diagonal arc az_hole (the only bearings where the
  // shaft is visible at the 42° orbit elevation); the ann ceiling
  // holds over the whole over-table arc. These rows GUARD the cured
  // ordering — the B2 red-arm axis is STRUCTURAL (the bag light-trap
  // field rows: red basis med 0.652/p95 3.397 vs the ≤0.45-ratio/0.58
  // windows) plus the cammatch joy-macro:hole armed neighborhood
  // (0.36-0.52 cured basis; any escape re-arms RED) — measured this
  // round: the red tree's bore CENTER already read dark (0.12-0.15),
  // so a pixel hole row alone cannot carry the class.
  interior: { hole_ratio_max: 0.55, ann_ratio: [0.25, 2.6],
    az: [95, 200], az_hole: [133, 152], min_rpx: 100 },
  // aggregate coverage floors for the NEW classes (mask-loss guard):
  // fulltable side/oblique bearings carry legs on >=30% of frames;
  // corner carries legs at some bearings and MUST carry interior rows
  // on the bore-visible arc (review blocker-cure r2 P2: without the
  // floor, missing/off-screen bore projections left both interior
  // ratios unset and the B2 image rows could silently pass; the
  // default 72-frame corner run measures 4 hole rows + ~20 ann rows).
  agg_min_frac: { fulltable: { leg: 0.3 },
    corner: { leg: 0.05, interior: 0.04 } },
  // ---- driver-side STRUCTURAL rows (asserted post-capture) ----
  structural: {
    legs_count: 6, mid_pair_tol: 0.011,
    // B6: the bed edge must never protrude past the blind OUTER faces
    // (the visible-ledge law; the cured outline hides INSIDE the boxes)
    bed_outer_tuck_min: 0.0005,
    block_ring_gap_min: 0.0008, // B3 z-fight floor (authored 1.4 mm)
    // B2 light-trap field: the near-rim continuity band legitimately
    // reaches the fading cap (0.55); the DEEP band (y <= -0.008) must
    // sit well under the lit ring floor
    bag_p95_max: 0.58, bag_deep_med_ratio_max: 0.45,
    sock_blind_clearance_min: 0.0002, // B5 drape clamp
    ring_gold_count: 4,      // B5 gathering rings (one per corner)
    // ---- PASS-3 rows (adversarial pass #3 cure lane) ----
    // B4: middle-pocket leather boots (dossier 中袋 anatomy) — two
    // tabs, hem draped past the window band, full-depth wider than
    // the visible sock band; side gathering rings at the gather.
    // The two hem/half-width bounds below are the MOLDED-CAP family's
    // (the anatomy this tool was written against, still the one on the
    // frozen 490 tree and in the pinned pass-3 red basis). A boot that
    // publishes userData.cn8MidAnatomy = 'bayplate' is the flat bay
    // cover instead and is judged against bayplateWindows(), derived
    // from docs/geometry/cn8-middle-furniture-definition.json — see the
    // judge. midboot_count applies to both: two middles, two covers.
    midboot_count: 2,
    midboot_hem_y_max: -0.090,    // hem must reach below the band
    midboot_halfwidth_min: 0.050, // covers the sock at every azimuth
    midring_count: 2,
    midring_y_max: -0.145,        // at the gather, not the bare hoop
    // M4: studded gathering rings (14 per corner ring; floor w/ margin)
    ringstud_min: 48,
  },
  // ---- SHIPPED-ENCODE bars (pass-3 structural mandate): censuses on
  // the ENCODED mp4 deliverables — the clip/glow families the five-lens
  // review measured on shipped bytes while every gate judged fresh PNG
  // captures. Windows pin the measured f4d8dd34 encode state + margin.
  encoded: {
    pocketing: {
      // netted-ball sock ROI: the pass-2 netball-chroma claim, on encode.
      // netball_max re-derived (sway-cure fix round, 2026-08-23): the
      // literal 0 was the f4d8dd34 encode's own read on a STATIC
      // post-catch sock; the sway-visibility cure sweeps knit voids
      // across the gold netted ball and the gold/void/knit AA junctions
      // transiently graze the g>=12 census (measured: 2-5 px on 4 of
      // 387 frames, g<=15 — a different family from the stain, which
      // reads 1052 px on the 00b6d7c0 basis). The bound now carries the
      // pass-2 capture instrument's OWN authored family tolerance
      // (check-490-pass2 netball_green_px_max = 60): stain basis 1052
      // and the selftest's seeded 3600-px defect both still fire with
      // 17x+ margin.
      sock_roi: [620, 570, 1120, 1000], green_thresh: 12, netball_max: 60,
      // mouth-transit green flash (bounce-spill family, ledger row):
      // disclosure BOUND — the family may not grow past the booked
      // magnitude and may never appear outside the transit windows
      mouth_roi: [700, 300, 1050, 560], base_frames: [61, 74],
      moved_thresh: 40, flash_thresh: 20,
      flash_windows: [[75, 80], [255, 268]],
      flash_peak_max: 13000, flash_outside_max: 300,
      body_segs: [[61, 183], [230, 386]], // 387 frames, 0-indexed
      // authored still-card ranges (leading title card + slow-mo card):
      // excluded from the per-frame scene/netball censuses (review r7 P1
      // — the r6 card-based exclusion must name BOTH cards)
      card_segs: [[0, 60], [184, 229]],
      expected_frames: 387, // exact authored length (review r9 P1 identity)
      // motion segs exclude the authored still holds (155-183 realtime
      // tail hold, 358-386 slow tail hold) — the dup census judges only
      // the LIVE gameplay windows (the dedup-scan law on encode)
      motion_segs: [[61, 154], [230, 357]],
      dup_frac_max: 0.02,
      // progress floor 0.08: the shipped realtime seg measures 0.1538
      // (the ball moves ~1/4 of the window, then settles — the sway is
      // sub-MAD); loops/dithered freezes read 0.0. Deliberate headroom:
      // staging varies potT and the moving fraction with it.
      progress_frac_min: 0.08,
    },
    fulltable: { clip_g_max: 64, blown_frac_max: 0.005, body: [61, 660],
      dup_frac_max: 0.02, expected_frames: 690 },
    corner: { blown_frac_max: 0.005, body: [61, 510],
      dup_frac_max: 0.02, expected_frames: 540 },
  },
};

const MODE = __modeEarly; // the one resolver (FIX7): the mode the invalidation used is the mode that runs
if (!MODE) {
  console.error('mode required: --sweep | --judge-only | --red-arm | '
    + '--encoded --pack <dir>');
  process.exit(2);
}
// review orbit-cure r5 P2 (scoped by pass-3 review r7 P2): a zero/negative/
// non-finite count would judge nothing and exit GREEN — the gate refuses
// instead. CAPTURE modes only: running it before mode dispatch let
// `--encoded --frames 0` exit before the encoded stale-report
// invalidation, retaining a prior green verdict.
if ((MODE === 'sweep' || MODE === 'judge-only')
  && (!Number.isInteger(FRAMES) || FRAMES < 1)) {
  console.error(`--frames must be a positive integer (got ${FRAMES})`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// encoded: SHIPPED-ENCODE bars — run the clip/glow-family censuses on the
// ENCODED mp4 deliverables (the bytes the owner watches), not on fresh PNG
// captures. The five-lens pass-3 review measured every escape on shipped
// encodes while all gates judged captures; this mode closes that plane.
//   --encoded --pack <dir>   dir holding 490-joy-q8-{fulltable,corner}
//                            -orbit.mp4 + 490-joy-q8-pocketing-30fps.mp4
// ---------------------------------------------------------------------------
if (MODE === 'encoded') {
  // review pass-3 r2 P2 + r3 P2 (the compare-490 r42-r13 law transferred): a reused --out must never retain a PRIOR run's
  // verdict through ANY refusal — including a missing --pack. FIX7 (Fable pass 2): that removal IS the mode-scoped set at
  // load — one removal site per artefact; nothing is removed here.
  fs.mkdirSync(OUT, { recursive: true });
  const pack = __pathOpt('--pack', { tag: 'orbitsweep-490', mustExist: 'dir' });
  if (!pack) { console.error('--pack <dir> required'); process.exit(2); }
  const files = {
    pocketing: path.join(pack, '490-joy-q8-pocketing-30fps.mp4'),
    fulltable: path.join(pack, '490-joy-q8-fulltable-orbit.mp4'),
    corner: path.join(pack, '490-joy-q8-corner-orbit.mp4'),
  };
  for (const [k, f] of Object.entries(files)) {
    if (!fs.existsSync(f) || fs.statSync(f).size === 0) {
      console.error(`[encoded] missing/empty ${k}: ${f}`);
      process.exit(2); // dataless-read refusal (hydrate_490 law)
    }
  }
  const cfg = { files, windows: WINDOWS.encoded,
    out: path.join(OUT, 'encoded-bars-490.json') };
  const cfgPath = path.join(OUT, 'encoded-cfg-490.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  try {
    execFileSync('python3', [JUDGE_PY, '--encoded', cfgPath],
      { stdio: ['ignore', 'inherit', 'inherit'] });
  } catch (err) {
    // review pass-3 r3 P2: preserve the judge's status split — exit 3 is
    // a WRITTEN red verdict; every other failure (input refusal exit 2,
    // crash) propagates as invalid evidence, never a visual red.
    if (err && err.status === 3) {
      console.error('[encoded] RED');
      process.exit(3);
    }
    console.error(`[encoded] REFUSED (judge exit ${err && err.status})`);
    process.exit(2);
  }
  console.log('[encoded] GREEN -> ' + cfg.out);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// red-arm: replay the pinned pre-cure measurements through the CURRENT
// windows — all three failure classes must fire at their recorded bearings.
// ---------------------------------------------------------------------------
if (MODE === 'red-arm') {
  // BLOCKER-CURE basis: the measured pre-cure state of the 6cd246ff
  // tree (finale adversarial review, 2026-08-21) — structural dumps +
  // the 24-bearing red sweep. EVERY blocker row must fire through the
  // CURRENT windows (the cammatch stale-fixture precedent: a window/
  // judge regression can never pass silently).
  const basis = JSON.parse(fs.readFileSync(RED_BASIS, 'utf8'));
  const m = basis.measured;
  const fired = [];
  const missing = [];
  const expect = (tag, cond) => (cond ? fired : missing).push(tag);
  // structural rows replay through the SAME judge the sweep uses
  const structWhy = judgeStructural(m.structural, WINDOWS.structural);
  for (const tag of ['legs_count', 'legs_mid_pair_missing',
    'bed_outside_blinds', 'block_ring_zfight', 'bag_trap_p95',
    'bag_trap_ratio', 'sock_through_blind', 'ring_gold_missing']) {
    expect(`structural:${tag}`,
      structWhy.some((wf) => wf.startsWith(tag.split(':')[0])
        && wf.includes(tag.replace('structural:', '').split(':')[0])));
  }
  // pixel rows
  expect('leg_hue', !(WINDOWS.leg.h_med[0] <= m.leg_h_med
    && m.leg_h_med <= WINDOWS.leg.h_med[1]));
  // B2 red-arms structurally (bag_trap rows above) + cammatch nbhd —
  // the red tree's bore CENTER was already dark (0.12-0.15 measured),
  // so no pixel hole expectation ships here (fixture provenance note).
  expect('leg_count_low',
    m.leg_clusters_side < WINDOWS.leg_count.min_clusters);
  expect('leg_mid_missing', !m.leg_mid_cluster);
  // ---- PASS-3 red basis (fix-490-chinese8-visual @ f4d8dd34, the
  // pass-2 sealed tree): the middle-boot/midring/stud rows must fire
  // on its measured structural dump, and the SHIPPED-ENCODE bars must
  // fire on their pinned defect-family magnitudes (fixture provenance
  // in-file). A judge/threshold regression can never pass silently.
  {
    const p3 = JSON.parse(fs.readFileSync(path.join(HERE,
      'fixtures/orbitsweep-490-pass3-red-basis.json'), 'utf8'));
    const w3 = judgeStructural(p3.measured.structural, WINDOWS.structural);
    for (const tag of ['midboot_missing', 'midring_high',
      'ringstud_missing']) {
      expect(`pass3:${tag}`, w3.some((wf) => wf.startsWith(tag)));
    }
    const e = p3.measured.encode;
    const ew = WINDOWS.encoded;
    expect('encode:netball_green',
      e.netball_green_max > ew.pocketing.netball_max);
    expect('encode:mouth_flash_outside',
      e.mouth_outside_max > ew.pocketing.flash_outside_max);
    expect('encode:marking_clip',
      e.marking_clip_max > ew.fulltable.clip_g_max);
    expect('encode:blown_frac',
      e.blown_frac_max > ew.fulltable.blown_frac_max);
  }
  for (const t of fired) console.log(`[red-arm] ${t}: FIRES`);
  for (const t of missing) console.log(`[red-arm] ${t}: MISSING`);
  if (missing.length) {
    console.error('[red-arm] pinned red basis no longer fires — judge/'
      + 'threshold regression');
    process.exit(4);
  }
  // review pass-3 r6 P2: the scalar replay above proves the WINDOWS
  // still condemn the pinned bases — the encoded SELFTEST additionally
  // exercises the real measurement pipeline end-to-end: synthetic
  // full-length clips with every defect class seeded run through the
  // same --encoded entry a shipped pack takes, and must fire each bar
  // (exit 3) / refuse invalid evidence (exit 2).
  {
    const st = path.join(OUT, 'encoded-selftest');
    fs.mkdirSync(st, { recursive: true });
    fs.writeFileSync(path.join(st, 'cfg-template.json'),
      JSON.stringify({ windows: WINDOWS.encoded }, null, 1));
    try {
      execFileSync('python3', [JUDGE_PY, '--encoded-selftest', st],
        { stdio: ['ignore', 'inherit', 'inherit'] });
    } catch (err) {
      console.error(`[red-arm] encoded selftest FAILED (exit ${
        err && err.status}) — the measurement pipeline no longer fires `
        + 'its own seeded defects');
      process.exit(4);
    }
  }
  console.log(`[red-arm] OK — all ${fired.length} blocker rows fire on the `
    + '6cd246ff basis');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// capture session (finale-orbit.mjs laws verbatim)
// ---------------------------------------------------------------------------
if (MODE === 'sweep' && !webDir) {
  console.error('--web <dir> required for --sweep: point at the 490 finale '
    + 'tree web/ (fix-490-chinese8-visual @ 6cd246ff)');
  process.exit(2);
}
const cdp = MODE === 'sweep'
  ? await import(pathToFileURL(path.join(webDir, 'tools/cdp.mjs')).href)
  : null;
const { launchChrome, sleep, spawnStaticServer, stopStaticServer } = cdp ?? {};

const HIDE_OVERLAYS = `(() => {
  __test.aim(Math.PI * 1.5);
  window.__dbg.scene.traverse((o) => {
    const hex = o.material && o.material.color
      && o.material.color.getHexString && o.material.color.getHexString();
    if (hex === 'dff1ff' || hex === '76afee') o.visible = false;
    if (/^obAim/.test(o.name || '')
      || (o.parent && /^obAim/.test(o.parent.name || ''))) {
      if (o.layers) o.layers.disableAll();
      if (o.material) o.material.visible = false;
    }
  });
  const st = document.createElement('style');
  st.textContent = 'body > :not(canvas) { display: none !important; }';
  document.head.appendChild(st);
  return true;
})()`;
const HIDE_BALLS = `(() => {
  const zero = (o) => { o.scale.setScalar(0); o.updateMatrixWorld(true); };
  const ballGroups = new Set();
  window.__dbg.scene.traverse((o) => {
    if (o.name === 'obCueStick') zero(o);
    if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry'
      && Math.abs(o.position.y) < 0.2 && Math.abs(o.position.x) < 1.6
      && Math.abs(o.position.z) < 0.95) {
      if (o.parent && o.parent !== window.__dbg.scene) ballGroups.add(o.parent);
      else zero(o);
    }
  });
  for (const g of ballGroups) for (const c of g.children) zero(c);
  const gu = window.__gi && window.__gi.uniforms;
  if (gu && gu.uSphereCount) gu.uSphereCount.value = 0;
  return true;
})()`;
const PER_FRAME_HIDE = `(() => {
  window.__dbg.scene.traverse((o) => {
    if (/^obAim/.test(o.name || '')
      || (o.parent && /^obAim/.test(o.parent.name || ''))) o.visible = false;
  });
  return true;
})()`;

// mask pass: swap every mesh material for a flat unlit class color, shoot,
// restore. Class colors are curve-proof primaries (pure channels survive any
// monotone per-channel encode). Alpha-tested materials keep their silhouette
// through alphaMap + alphaTest on the replacement.
const MASK_SWAP = `(() => {
  const T = window.__dbg.scene;
  const CLASS_RGB = { boot: [1, 0, 0], cloth: [0, 1, 0], railwood: [0, 0, 1],
    lampface: [1, 1, 0], fallwall: [1, 0, 1], apron: [0, 1, 1],
    leg: [1, 1, 1], other: [0.35, 0.35, 0.35] };
  window.__maskSaved = [];
  T.traverse((o) => {
    if (!o.isMesh || !o.material || o.visible === false) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const src = mats[0];
    let cls = 'other';
    // frozen 490 tree: names/hexes are the stable classification surface
    // review orbit-cure r1 P2 + r2 P2 + r3 P1: the primary pocket covers
    // are the cn8cap-* family (band/roll/skirt/seat) and the R82 corner
    // build's cn8r82-* furniture — but CLOTH classifies FIRST because
    // several cn8r82-* meshes (wallface/tongue/endroll/rollface) are
    // clothMat corner-jaw cloth. The cloth fingerprint is the CLOTH-CLASS
    // sheen weight (clothMat ships 0.46; the cn8 leather params carry a
    // faint 0.05 sheen that must NOT steal the caps into cloth).
    if (src.sheen !== undefined && src.sheen >= 0.2) cls = 'cloth';
    else if (/^cn8-leg-/.test(o.name || '')) cls = 'leg'; // B4/B7 rows
    else if (/^cn8(?:-(?:net|fallbag|ring)|cap-|r82-)/.test(o.name || '')) cls = 'boot';
    else if (src.userData && src.userData.obClass) cls = src.userData.obClass;
    else if (src.color && src.color.getHexString
      && src.color.getHexString() === '8a667a') cls = 'railwood';
    else if (src.isMeshBasicMaterial && src.color
      && (src.color.r > 2 || src.color.g > 2)) cls = 'lampface';
    const rgb = CLASS_RGB[cls] ?? CLASS_RGB.other;
    const rep = new window.__maskBasicCtor();
    rep.color.setRGB(rgb[0], rgb[1], rgb[2]);
    rep.toneMapped = false;
    rep.fog = false;
    rep.side = src.side;
    // review orbit-cure r3 P2: preserve transparency semantics —
    //  · alpha-cut sources keep their REAL alpha channel (an RGBA map's
    //    alpha drives MeshBasic alphaTest through rep.map; painting the
    //    color white and tinting via rep.color keeps the mask flat only
    //    when the map is not bound, so alpha-cut meshes bind the source
    //    alphaMap when one exists, else the map as alphaMap — an
    //    approximation only for maps whose alpha rides luma);
    //  · pure effect overlays (transparent, no alpha-test: AO/shadow
    //    cards, faded discs) are HIDDEN for the mask pass instead of
    //    going opaque over unrelated classes — the classes behind them
    //    are the truth the judges want.
    if (src.transparent && !(src.alphaTest > 0)) {
      window.__maskSaved.push([o, o.material, o.visible]);
      o.visible = false;
      rep.dispose();
      return;
    }
    if (src.alphaTest > 0) {
      // review orbit-cure r6 P2: coverage may live in map.a (fallMatMid) —
      // an alphaMap samples GREEN, so bind the SOURCE MAP itself: three's
      // alphaTest reads diffuseColor.a after the map sample, preserving
      // the real holes. The map RGB modulates the class color; the
      // judge's dominance classifier tolerates that for this content
      // (knit/canvas texels are bright by construction), and a dark
      // texel falls to 'other', never into a wrong class.
      if (src.alphaMap) {
        rep.alphaMap = src.alphaMap;
      } else if (src.map) {
        rep.map = src.map;
      }
      rep.alphaTest = src.alphaTest;
    }
    window.__maskSaved.push([o, o.material, o.visible]);
    o.material = rep;
  });
  return window.__maskSaved.length;
})()`;
const MASK_RESTORE = `(() => {
  for (const [o, m, vis] of window.__maskSaved || []) {
    if (o.material && o.material !== m) o.material.dispose();
    o.material = m;
    if (vis !== undefined) o.visible = vis;
  }
  window.__maskSaved = [];
  return true;
})()`;


// ---- BLOCKER-CURE structural probe (driver-side rows) ----------------
const STRUCT_PROBE = `(() => {
  const T = window.__dbg.scene;
  const OF = [1.2735, 0.6335]; // +/+ corner O_f (L/2+C, W/2+C)
  const meshes = {};
  const legs = new Map();
  let ringGold = 0;
  let ringStud = 0;
  const midboot = [];
  const midring = [];
  T.traverse((o) => {
    if (!o.isMesh) return;
    if (/^cn8-leg-/.test(o.name || '')) {
      legs.set(o.position.x.toFixed(4) + ',' + o.position.z.toFixed(4),
        [o.position.x, o.position.z]);
    } else if (/^cn8-ring-gold-/.test(o.name || '')) ringGold += 1;
    else if (/^cn8-ringstud-/.test(o.name || '')) ringStud += 1;
    else if (/^cn8cap-boot-|^cn8-mid-leather-[0-9]+$/.test(o.name || '')) midboot.push(o); // (template literal: no \d escapes)
    else if (/^cn8-ring-iron-/.test(o.name || '')) midring.push(o);
    else if (['cn8-bed', 'cn8-blind-long-p', 'cn8-blind-long-pE', 'cn8-blind-end-p',
      'cn8r82-block-5', 'cn8r82-ring-5', 'cn8-net-low-5', 'cn8-net-5',
      'cn8-fallbag-5'].includes(o.name)) meshes[o.name] = o;
  });
  const bb = (m) => { m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox;
    return { x0: b.min.x + m.position.x, x1: b.max.x + m.position.x,
      z0: b.min.z + m.position.z, z1: b.max.z + m.position.z }; };
  const out = { legs: [...legs.values()], ring_gold_count: ringGold,
    ringstud_count: ringStud };
  // GH-490 PASS-3 B4 rows: the middle-pocket boot tabs + relocated
  // side gathering rings (dossier mid-pocket anatomy). Vertices are
  // authored in WORLD coords (mesh at origin), so reads are direct.
  out.midring_y = midring.map((m) => +m.position.y.toFixed(4));
  out.midboot = midboot.map((m) => {
    const pp = m.geometry.getAttribute('position');
    let hemY = 1e9;
    let halfw = 0;
    let halfwFace = 0;
    for (let i = 0; i < pp.count; i++) {
      const y = pp.getY(i) + m.position.y;
      const ax = Math.abs(pp.getX(i) + m.position.x);
      hemY = Math.min(hemY, y);
      halfwFace = Math.max(halfwFace, ax);
      if (y < -0.06) halfw = Math.max(halfw, ax);
    }
    // anat selects WHICH contract the judge applies (see table.js
    // cn8MidAnatomy). The molded family hung its skirt deep inside the
    // pocket, so its half-width was only meaningful below the visible
    // band (y < -0.06); the bay cover is a rail-face plate whose whole
    // face is the measured width. Both reads always ship, so a re-judge
    // of an old capture can still apply either rule.
    return {
      // r12-APPROVED (card 17b): the moulded leather body cn8-mid-leather-* is
      // judged against ITS contract (r12Windows); the plate tag and the
      // molded-cap windows stay for the pinned bases
      anat: /^cn8-mid-leather-/.test(m.name || '') ? 'r12'
        : (m.userData && m.userData.cn8MidAnatomy) || 'molded',
      hem_y: +hemY.toFixed(4),
      halfw: +halfw.toFixed(4),
      halfw_face: +halfwFace.toFixed(4),
    };
  });
  const bed = meshes['cn8-bed'];
  // r12: the long blind is two halves ending on the middle cut planes; either
  // half carries the same z extents (the r36 one-piece name is the pinned trees')
  const bl = meshes['cn8-blind-long-p'] || meshes['cn8-blind-long-pE'];
  const be = meshes['cn8-blind-end-p'];
  if (bed && bl && be) {
    const bbb = bb(bed);
    out.bed_max_x = Math.max(Math.abs(bbb.x0), Math.abs(bbb.x1));
    out.bed_max_z = Math.max(Math.abs(bbb.z0), Math.abs(bbb.z1));
    out.blind_inner_x = Math.min(Math.abs(bb(be).x0), Math.abs(bb(be).x1));
    out.blind_inner_z = Math.min(Math.abs(bb(bl).z0), Math.abs(bb(bl).z1));
    out.blind_outer_x = Math.max(Math.abs(bb(be).x0), Math.abs(bb(be).x1));
    out.blind_outer_z = Math.max(Math.abs(bb(bl).z0), Math.abs(bb(bl).z1));
  }
  // B3: block/ring radial clearance about O_f. The leather SKIRT is
  // one tall quad (verts only at the hem −0.017/−0.018 and the crown),
  // so the built skirt surface radius per azimuth = the hem band's
  // OUTERMOST vertex (rOutAt); the block wall (verts −0.015..+0.006)
  // must sit >= the z-fight floor INSIDE it (max-vs-max per bin — the
  // horizontal hem under-fold never enters a max).
  const blk = meshes['cn8r82-block-5'];
  const rng = meshes['cn8r82-ring-5'];
  if (blk && rng) {
    // per-azimuth comparison via nearest-angle interpolation (a coarse
    // angular bin under-read the gap 1.4 -> 0.38 mm where rOutAt(ψ)
    // slopes across the bin — measured this round)
    const collect = (m, y0, y1) => {
      const p = m.geometry.getAttribute('position');
      const pts = [];
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) + m.position.y;
        if (y < y0 || y > y1) continue;
        const wx = p.getX(i) + m.position.x - OF[0];
        const wz = p.getZ(i) + m.position.z - OF[1];
        const r = Math.hypot(wx, wz);
        if (r < 0.05 || r > 0.12) continue;
        pts.push([Math.atan2(wz, wx), r]);
      }
      return pts.sort((a, b) => a[0] - b[0]);
    };
    // block side: keep the OUTERMOST vertex per 0.5° bucket (the wall's
    // outer chain — inner-chain/foot verts would over-read the gap and
    // hide a regression)
    const bucket = new Map();
    for (const [a, r] of collect(blk, -0.0155, 0.0065)) {
      const k = Math.round(a / 0.0087);
      if (!bucket.has(k) || r > bucket.get(k)[1]) bucket.set(k, [a, r]);
    }
    const blkPts = [...bucket.values()].sort((a, b) => a[0] - b[0]);
    // hem side: keep the OUTERMOST vertex per bucket too — the hem
    // depth carries BOTH the skirt's outer edge and the fold-under's
    // inner edge (a raw vert walk read the fold as a −4.4 mm gap)
    const hb = new Map();
    for (const [a, r] of collect(rng, -0.0185, -0.0165)) {
      const k = Math.round(a / 0.0087);
      if (!hb.has(k) || r > hb.get(k)[1]) hb.set(k, [a, r]);
    }
    const hemPts = [...hb.values()].sort((a, b) => a[0] - b[0]);
    let gap = 1e9;
    for (const [ah, rh] of hemPts) {
      // interpolate the BLOCK wall radius at the hem vertex's azimuth
      let lo = null; let hi = null;
      for (const [ab, rb] of blkPts) {
        if (ab <= ah && (!lo || ab > lo[0])) lo = [ab, rb];
        if (ab >= ah && (!hi || ab < hi[0])) hi = [ab, rb];
      }
      if (!lo || !hi) continue;
      if (hi[0] - lo[0] > 0.09) continue; // > ~5° apart: outside the wall span
      const t = hi[0] === lo[0] ? 0 : (ah - lo[0]) / (hi[0] - lo[0]);
      const rBlk = lo[1] + (hi[1] - lo[1]) * t;
      gap = Math.min(gap, rh - rBlk);
    }
    out.block_ring_gap = gap === 1e9 ? null : gap;
  }
  // B2: bag light-trap field vs the lit ring floor (indexed verts only)
  const bag = meshes['cn8-fallbag-5'];
  const net = meshes['cn8-net-5'];
  if (bag && net) {
    const fieldOf = (m, y0, y1) => {
      const p = m.geometry.getAttribute('position');
      const c = m.geometry.getAttribute('color');
      const idx = m.geometry.getIndex();
      const used = new Set();
      for (let i = 0; i < idx.count; i++) used.add(idx.getX(i));
      const vals = [];
      for (const vi of used) {
        const y = p.getY(vi);
        if (y < y0 || y > y1) continue;
        vals.push(c.getX(vi));
      }
      vals.sort((a, b) => a - b);
      return vals.length ? {
        med: vals[Math.floor(vals.length / 2)],
        p95: vals[Math.floor(vals.length * 0.95)], n: vals.length } : null;
    };
    out.bag_field = fieldOf(bag, -1, 1);
    out.bag_deep = fieldOf(bag, -1, -0.008); // below the continuity band
    out.ring_floor = fieldOf(net, 0.0002, 0.0012);
  }
  // B5: sock clearance against the blind planes (the drape clamp)
  const sock = meshes['cn8-net-low-5'];
  if (sock) {
    const p = sock.geometry.getAttribute('position');
    let clZ = 1e9;
    let clX = 1e9;
    for (let i = 0; i < p.count; i++) {
      const wx = p.getX(i) + sock.position.x;
      const wz = p.getZ(i) + sock.position.z;
      if (wx <= 1.23 + 0.0005) clZ = Math.min(clZ, 0.694 - wz);
      if (wz <= 0.59 + 0.0005) clX = Math.min(clX, 1.334 - wx);
    }
    out.sock_clear_long = clZ === 1e9 ? null : clZ;
    out.sock_clear_end = clX === 1e9 ? null : clX;
  }
  return JSON.stringify(out);
})()`;

// ---- BAY-COVER (bayplate) midboot windows, DERIVED from the drawing ----
// ADR-0015: the middle furniture has a machine-readable contract, so these
// bounds are read from it rather than re-typed here. Derived lazily so a
// run that never sees a tagged boot (any pre-migration --web tree) does
// not depend on the file at all.
//   half-width  >= BC-01 - BC-05  (drawn face half-width, less the drawn
//                                  back-face form tolerance)
//   hem reaches <= BC-09 - BC-07[depth] + BC-05  (the scallop's deepest
//                                  crest plane, same tolerance)
// review r8 P2-2: this function is only ever reached from inside capture(),
// i.e. AFTER Chrome, the static server and the port band are held. Exiting
// the process here skipped capture()'s finally and leaked the band, so a
// refusal now throws and the sweep entry point converts it to exit 2 once
// teardown has run. The refusal is still a refusal — never a fallback.
class Refusal extends Error {}
let BAYPLATE_SW = null;
function bayplateWindows() {
  if (BAYPLATE_SW) return BAYPLATE_SW;
  const p = path.resolve(HERE,
    '../../docs/geometry/cn8-middle-furniture-definition.json');
  if (!fs.existsSync(p)) {
    throw new Refusal('[orbitsweep-490] REFUSE: the scene publishes a '
      + "cn8MidAnatomy='bayplate' middle cover, but its contract "
      + `(${p}) is absent — this tool cannot derive the midboot windows `
      + 'and will not fall back to the retired molded-cap ones');
  }
  const geo = JSON.parse(fs.readFileSync(p, 'utf8'));
  const gf = (id) => {
    const f = geo.features.find((x) => x.id === id);
    if (!f || f.value_mm === undefined) {
      throw new Refusal(`[orbitsweep-490] REFUSE: ${geo.doc.number} carries no `
        + `feature ${id} — the drawing/gate chain is broken`);
    }
    return f.value_mm;
  };
  const tol = gf('BC-05');
  BAYPLATE_SW = {
    midboot_halfwidth_min: (gf('BC-01') - tol) / 1000,
    midboot_hem_y_max: (gf('BC-09') - gf('BC-07')[1] + tol) / 1000,
  };
  return BAYPLATE_SW;
}

let R12_SW = null;
/** r12-APPROVED (card 17b): the moulded body's windows from its contract —
 * the lower edge on LP-09 (the scallop crest line; the skirt strip hangs
 * below it) and the back spanning the slot DT-09. */
function r12Windows() {
  if (R12_SW) return R12_SW;
  const p = path.resolve(HERE,
    '../../docs/geometry/cn8-middle-furniture-definition.json');
  if (!fs.existsSync(p)) {
    throw new Refusal('[orbitsweep-490] REFUSE: the scene carries the r12 '
      + `middle leather body, but its contract (${p}) is absent`);
  }
  const geo = JSON.parse(fs.readFileSync(p, 'utf8'));
  const gf = (id) => {
    const f = geo.features.find((x) => x.id === id);
    if (!f || typeof f.value_mm !== 'number') {
      throw new Refusal(`[orbitsweep-490] REFUSE: ${geo.doc.number} carries no `
        + `scalar feature ${id} — the drawing/gate chain is broken`);
    }
    return f.value_mm;
  };
  R12_SW = {
    midboot_halfwidth_min: (gf('DT-09') - 0.5) / 1000,
    midboot_hem_y_max: (gf('LP-09') + 0.05) / 1000,
  };
  return R12_SW;
}

/** BLOCKER-CURE structural verdicts (pure function of probe + windows —
 * red-arm replays the pinned pre-cure measurements through it). */
function judgeStructural(st, sw) {
  const why = [];
  const legN = st.legs ? st.legs.length : (st.legs_count ?? 0);
  // review r11 P2: EXACT count — a stray seventh stance is as wrong as
  // a missing mid pair (the pixel census only floors)
  if (legN !== sw.legs_count) {
    why.push(`legs_count:${legN}!=${sw.legs_count}`);
  }
  const midPair = st.mid_pair ?? (st.legs
    && st.legs.filter(([x]) => Math.abs(x) <= sw.mid_pair_tol).length >= 2);
  if (!midPair) why.push('legs_mid_pair_missing');
  if (st.bed_max_x != null) {
    const outX = st.blind_outer_x ?? (st.blind_inner_x + 0.012);
    const outZ = st.blind_outer_z ?? (st.blind_inner_z + 0.012);
    if (st.bed_max_x > outX - sw.bed_outer_tuck_min
      || st.bed_max_z > outZ - sw.bed_outer_tuck_min) {
      why.push(`bed_outside_blinds:${st.bed_max_x.toFixed(4)}/`
        + `${st.bed_max_z.toFixed(4)}`);
    }
  } else why.push('bed_probe_missing');
  if (st.block_ring_gap == null) why.push('block_ring_probe_missing');
  else if (st.block_ring_gap < sw.block_ring_gap_min) {
    why.push(`block_ring_zfight:${(st.block_ring_gap * 1000).toFixed(2)}mm`);
  }
  const bagP95 = st.bag_field?.p95 ?? st.bag_p95;
  const bagDeepMed = st.bag_deep?.med ?? st.bag_deep_med
    ?? st.bag_field?.med ?? st.bag_med;
  const ringMed = st.ring_floor?.med ?? st.ring_floor_med;
  if (bagP95 == null || ringMed == null) why.push('bag_field_probe_missing');
  else {
    if (bagP95 > sw.bag_p95_max) {
      why.push(`bag_trap_p95:${bagP95.toFixed(3)}`);
    }
    if (bagDeepMed / ringMed > sw.bag_deep_med_ratio_max) {
      why.push(`bag_trap_ratio:${(bagDeepMed / ringMed).toFixed(3)}`);
    }
  }
  // review blocker-cure r4 P2: a missing sock probe (renamed mesh, no
  // eligible vertices) must FAIL, never default the clearance green
  if (st.sock_clear_long == null && st.sock_clear_end == null) {
    why.push('sock_probe_missing');
  } else {
    const scl = Math.min(st.sock_clear_long ?? 1, st.sock_clear_end ?? 1);
    if (scl < sw.sock_blind_clearance_min) {
      why.push(`sock_through_blind:${(scl * 1000).toFixed(1)}mm`);
    }
  }
  if ((st.ring_gold_count ?? 0) < sw.ring_gold_count) {
    why.push(`ring_gold_missing:${st.ring_gold_count ?? 0}`);
  }
  // ---- PASS-3 rows (B4 middle boots + rings, M4 studs). A basis
  // without the probes (any pre-pass-3 tree) reads count 0 / missing —
  // the rows fire, which IS the red-arm truth on f4d8dd34.
  const mb = st.midboot ?? [];
  if (mb.length !== sw.midboot_count) {
    why.push(`midboot_missing:${mb.length}!=${sw.midboot_count}`);
  }
  for (const t of mb) {
    // Anatomy migration (cn8-midpocket-exterior): a boot tagged
    // 'bayplate' is the flat rail-face bay cover, judged against ITS
    // drawing; anything else keeps the molded-cap windows byte-for-byte,
    // so the frozen 490 tree and the pinned red basis judge unchanged.
    const bay = t.anat === 'bayplate';
    const r12 = t.anat === 'r12';
    const bw = r12 ? r12Windows() : bay ? bayplateWindows() : sw;
    const hw = (bay || r12) ? (t.halfw_face ?? t.halfw) : t.halfw;
    if (t.hem_y > bw.midboot_hem_y_max) {
      why.push(`midboot_hem_short:${t.hem_y}`);
    }
    if (hw < bw.midboot_halfwidth_min) {
      why.push(`midboot_narrow:${hw}`);
    }
  }
  const mr = st.midring_y ?? [];
  if (mr.length !== sw.midring_count) {
    why.push(`midring_missing:${mr.length}!=${sw.midring_count}`);
  }
  for (const y of mr) {
    if (y > sw.midring_y_max) why.push(`midring_high:${y}`);
  }
  if ((st.ringstud_count ?? 0) < sw.ringstud_min) {
    why.push(`ringstud_missing:${st.ringstud_count ?? 0}`);
  }
  return why;
}

const waitFrame = (chrome) => chrome.eval(
  'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');

async function settle490(chrome) {
  const WANT = 'joy_lowrect';
  for (let i = 0; i < 150; i++) {
    const st = await chrome.eval(`(() => {
      const s = window.__gi && window.__gi.state;
      const rig = window.__lighting && window.__lighting.state
        && window.__lighting.state().fixture;
      return s ? JSON.stringify({ r: s.ready, f: s.fixture, b: s.baked,
        c: s.bakeClass, rig, rtex: window.__cn8ringtex }) : null;
    })()`).catch(() => null);
    if (st) {
      const v = JSON.parse(st);
      if (v.r && v.b && v.c === 'chinese8_9ft' && v.f === WANT
        && v.rig === WANT && v.rtex === 'photo') return;
    }
    await sleep(200);
  }
  throw new Error('490 GI/rig/photo-tex never settled');
}

async function capture() {
  let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
  let CDPP = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : null;
  let band = null;
  if (!PORT || !CDPP) {
    band = await cdp.claimPortBand(26760, 26789);
    PORT = band.http(0); CDPP = band.cdp(0);
  }
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?table=chinese8_pro_9ft&cinema=1&seed=7&look=default`,
    { port: CDPP, width: W, height: H });
  try {
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    let ready = false;
    for (let i = 0; i < 220 && !ready; i++) {
      await sleep(200);
      ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
    }
    if (!ready) throw new Error('app never ready');
    await settle490(chrome);
    await sleep(1200);
    await chrome.eval(HIDE_OVERLAYS);
    await chrome.eval(HIDE_BALLS);
    // publish a MeshBasicMaterial constructor for the mask swap (some
    // sources are Physical/Standard — the swap must not depend on the
    // source type exposing a Basic constructor)
    await chrome.eval(`import('three').then((T) => {
      window.__maskBasicCtor = T.MeshBasicMaterial; return true; })`);
    // BLOCKER-CURE structural probe (once per capture session)
    const structJson = await chrome.eval(STRUCT_PROBE);
    const structural = JSON.parse(structJson);
    const structWhy = judgeStructural(structural, WINDOWS.structural);
    fs.mkdirSync(OUT, { recursive: true });
    // FIX7 (Fable pass 2): the manifest is the capture's COMPLETION record — removed here, at the capture session's first write
    // (never at load: a refused --sweep must leave the last complete capture judgeable); a crash between here and the manifest
    // write below leaves none, and a default --judge-only then refuses by name instead of judging a half-captured set
    __removeManifest(OUT, 'orbitsweep-490');
    fs.writeFileSync(path.join(OUT, 'structural-490.json'), JSON.stringify(
      { tool: 'tools/render/orbitsweep-490.mjs', mode: MODE, structural, fails: structWhy, windows: WINDOWS.structural },
      null, 2));
    for (const wff of structWhy) console.error(`[structural] FAIL ${wff}`);
    if (!structWhy.length) console.log('[structural] all rows ok');
    if (structWhy.length) {
      // structural reds fail the sweep outright (exit 3 downstream)
      global.__structRed = true;
    }
    if (GEO.orbitPreset) {
      await chrome.eval(`(() => {
        window.__lighting?.apply?.('auto', ${GEO.orbitPreset.brightness});
        __dbg.renderer.toneMappingExposure *= ${GEO.orbitPreset.exposure_mul};
        return true;
      })()`);
      await sleep(900);
    }

    for (const orbitName of ORBITS) {
      const spec = GEO[orbitName];
      if (!spec) throw new Error(`unknown orbit ${orbitName}`);
      const dir = path.join(OUT, orbitName);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const meta = { orbit: orbitName, frames: FRAMES, w: W, h: H,
        windows: WINDOWS, poses: [] };
      // warm the guarded camerascript import
      const az0 = -Math.PI / 2;
      const p0 = { cam: [spec.center[0] + spec.r * Math.cos(az0),
        spec.center[1] + spec.r * Math.sin(az0), spec.h],
      look: spec.center, fov: spec.fov };
      let ok = false;
      for (let i = 0; i < 25 && !ok; i++) {
        ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(p0)})`);
        if (!ok) await sleep(200);
      }
      if (!ok) throw new Error('pose rejected');
      const t0 = Date.now();
      for (let i = 0; i < FRAMES; i++) {
        const az = -Math.PI / 2 + (2 * Math.PI * i) / FRAMES;
        const pose = { cam: [spec.center[0] + spec.r * Math.cos(az),
          spec.center[1] + spec.r * Math.sin(az), spec.h],
        look: spec.center, fov: spec.fov };
        await chrome.eval(`__test.cameraPose(${JSON.stringify(pose)})`);
        await chrome.eval(PER_FRAME_HIDE);
        await waitFrame(chrome);
        await waitFrame(chrome);
        await chrome.screenshot(path.join(dir, `f${String(i).padStart(3, '0')}.png`));
        // pocket-fall screen projections (void-census mouth exclusion)
        const falls = await chrome.eval(`(async () => {
          const T = await import('three');
          const tb = await import('./scene/table.js');
          // frozen 490 tree has no pocketVisualFalls export — the kernel
          // pocket set from makeGeom carries the mouth centres (scene
          // coords: .x along length, .z across width)
          const falls = tb.pocketVisualFalls?.(tb.activeTableId?.())
            ?? tb.makeGeom(tb.activeTableId()).pockets.map((pk) => ({
              x: pk.x, z: pk.z, r: pk.r ?? 0.055 }));
          const cam = window.__dbg.camera;
          cam.updateMatrixWorld(true);
          const out = [];
          const bores = [];
          const proj = (wx, wz, rr) => {
            const p = new T.Vector3(wx, 0.0, wz);
            const v = p.clone().project(cam);
            if (v.z > 1 || v.z < -1) return null;
            const sx = (v.x + 1) / 2 * ${W}, sy = (1 - v.y) / 2 * ${H};
            // review orbit-cure r4 P2: a single world-X offset collapses
            // to ~0 px at bearings looking along X — project BOTH table
            // axes and take the larger screen radius
            let rpx = 0;
            for (const ax of ['x', 'z']) {
              const q = p.clone(); q[ax] += rr;
              const vq = q.project(cam);
              rpx = Math.max(rpx, Math.hypot(((vq.x + 1) / 2 * ${W}) - sx,
                ((1 - vq.y) / 2 * ${H}) - sy));
            }
            return [Math.round(sx), Math.round(sy), Math.round(rpx)];
          };
          for (const f of falls) {
            const fx = f.x ?? f.cx ?? 0; const fz = f.z ?? f.cz ?? 0;
            const pr = proj(fx, fz, (f.r ?? 0.05) * 1.8);
            if (pr) out.push(pr);
            // BLOCKER-CURE B2: the corner VISUAL bore centres on O_f
            // (nose corner + 3.5 mm), NOT the kernel capture centre —
            // the interior-material rows sample about the bore
            if (Math.abs(fx) > 0.1) {
              const ox = Math.sign(fx) * (2.54 / 2 + 0.0035);
              const oz = Math.sign(fz) * (1.26 / 2 + 0.0035);
              // project at MID-SHAFT depth (−0.03): the visible dark
              // fall face sits below bed level — a y=0 projection at
              // the 42° orbit elevation lands on the lit near rim
              // (measured first-cut lesson, this round)
              const pd = new T.Vector3(ox, -0.03, oz);
              const vd = pd.clone().project(cam);
              if (vd.z <= 1 && vd.z >= -1) {
                const sx = (vd.x + 1) / 2 * ${W};
                const sy = (1 - vd.y) / 2 * ${H};
                let rpx = 0;
                for (const ax of ['x', 'z']) {
                  const q = pd.clone(); q[ax] += 0.029 * 1.8;
                  const vq = q.project(cam);
                  rpx = Math.max(rpx,
                    Math.hypot(((vq.x + 1) / 2 * ${W}) - sx,
                      ((1 - vq.y) / 2 * ${H}) - sy));
                }
                bores.push([Math.round(sx), Math.round(sy), Math.round(rpx)]);
              }
            }
          }
          return JSON.stringify({ falls: out, bores });
        })()`);
        // mask pass
        const n = await chrome.eval(MASK_SWAP);
        if (!n) throw new Error('mask swap touched nothing');
        await chrome.eval(PER_FRAME_HIDE);
        await waitFrame(chrome);
        await waitFrame(chrome);
        await chrome.screenshot(path.join(dir, `m${String(i).padStart(3, '0')}.png`));
        await chrome.eval(MASK_RESTORE);
        const fj = JSON.parse(falls);
        meta.poses.push({ i, az_deg: Math.round((az * 180) / Math.PI * 10) / 10,
          falls: fj.falls ?? fj, bores: fj.bores ?? [] });
        if ((i + 1) % 12 === 0) {
          console.log(`[${orbitName}] ${i + 1}/${FRAMES} `
            + `(${((Date.now() - t0) / (i + 1) / 1000).toFixed(2)} s/f)`);
        }
      }
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
      console.log(`[${orbitName}] captured ${FRAMES} bearings -> ${dir}`);
    }
    // review r11 P2: persist THIS run's orbit list — a later default
    // --judge-only must never mix a partial re-capture with another
    // run's leftover orbit dir (an invalid combined verdict)
    __writeManifest(OUT, { tool: 'tools/render/orbitsweep-490.mjs', mode: MODE, orbits: ORBITS, frames: FRAMES,
      when: new Date().toISOString() });
  } finally {
    const gone = await chrome.closeAndWait();
    if (gone === false) throw new Error('chrome teardown unconfirmed');
    await stopStaticServer(server);
    if (band) band.release();
  }
}

function judge() {
  // review orbit-cure r6 P3: a partial capture (--sweep --orbits corner)
  // must stay re-judgeable — without an explicit --orbits, judge-only
  // discovers the orbit dirs the capture actually wrote.
  // FIX7 (Fable passes 2 + 3): fail-closed manifest resolution — lib/orbit-manifest.mjs (shared with 489)
  const orbitList = __resolveJudgeOrbits({ OUT, ORBITS, mode: MODE, args, tag: 'orbitsweep-490', known: KNOWN_ORBITS, explicit: __ORBITS_ARG !== null }); // one reader: the validated load-time selection (space or = form)
  let red = !!global.__structRed;
  const all = { windows: WINDOWS, orbits: {}, provenance: null };
  try {
    const st = JSON.parse(fs.readFileSync(
      path.join(OUT, 'structural-490.json'), 'utf8'));
    // review blocker-cure r7 P2: judge-only re-verdicts the STORED
    // structural measurements under the CURRENT windows (the pixel
    // judge's own law) — a threshold change can never ride a stale
    // capture-time verdict.
    st.fails = st.structural
      ? judgeStructural(st.structural, WINDOWS.structural)
      : ['structural_data_missing'];
    st.windows = WINDOWS.structural;
    st.tool = 'tools/render/orbitsweep-490.mjs'; st.mode = MODE; // FIX7 (Fable pass 2): the re-verdicted structural file names its tool + mode
    delete st.verdict_invalidated; // the fresh verdict replaces the invalidation note (refuter pass 3)
    fs.writeFileSync(path.join(OUT, 'structural-490.json'),
      JSON.stringify(st, null, 2));
    all.structural = st;
    if (st.fails.length) red = true;
  } catch { /* judge-only rerun of a pre-structural capture */ }
  for (const orbitName of orbitList) {
    const dir = path.join(OUT, orbitName);
    const rep = path.join(dir, 'report.json');
    // judge under the DRIVER's current windows, not the capture-time copy
    // (a --judge-only rerun after a window change must re-verdict)
    const metaPath = path.join(dir, 'meta.json');
    const meta = __readOrbitMeta(metaPath, 'orbitsweep-490'); // Fable pass 4: a corrupt meta.json is refused by name
    meta.windows = WINDOWS;
    meta.mode = MODE; meta.tool = 'tools/render/orbitsweep-490.mjs'; // FIX7 (Fable pass 2): the per-orbit judge stamps its report.json from these
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    try {
      execFileSync('python3', [JUDGE_PY, dir], { stdio: ['ignore', 'inherit', 'inherit'] });
    } catch {
      red = true; // judge exits 3 on failing frames — report still written
    }
    __requireOrbitReport(rep, orbitName, 'orbitsweep-490'); // FIX7 (Fable pass 3): no report = refused by name, not an ENOENT crash
    const r = JSON.parse(fs.readFileSync(rep, 'utf8'));
    all.orbits[orbitName] = r;
    if (r.fail_frames.length) red = true;
    console.log(`[judge] ${orbitName}: ${r.fail_frames.length}/${r.frames.length}`
      + ` failing frames ${r.fail_frames.length ? JSON.stringify(r.fail_frames) : ''}`);
  }
  all.provenance = {
    tree_head: (() => {
      try {
        return webDir ? execFileSync('git', ['-C', webDir, 'rev-parse', 'HEAD'],
          { encoding: 'utf8' }).trim() : 'unavailable (judge-only)';
      } catch { return 'unavailable'; }
    })(),
    when: new Date().toISOString(),
    frames: FRAMES,
  };
  // The invocation that wrote this report, so the battery's known-red reader can tell its
  // own run's report from another run's at the same shared path (null outside the battery)
  all.run_id = process.env.OB_RUN_ID || null;
  all.mode = MODE; all.tool = 'tools/render/orbitsweep-490.mjs'; // FIX7: the RED/GREEN report names its tool + mode (so do structural-490.json, the per-orbit report.json via meta.json, and the encoded bars)
  fs.writeFileSync(path.join(OUT, 'orbitsweep-490-report.json'),
    JSON.stringify(all, null, 2));
  console.log(`[orbitsweep-490] ${red ? 'RED' : 'GREEN'} -> `
    + path.join(OUT, 'orbitsweep-490-report.json'));
  process.exit(red ? 3 : 0);
}

if (MODE === 'sweep') {
  // review r8 P2-2: capture()'s finally releases Chrome, the static server
  // and the port band; a contract refusal thrown from inside it must land
  // HERE, after that teardown, and only then become the exit-2 refusal.
  try {
    await capture();
  } catch (e) {
    if (e instanceof Refusal) { console.error(e.message); process.exit(2); }
    throw e;
  }
}
judge();
