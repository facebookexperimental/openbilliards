// Copyright (c) Meta Platforms, Inc. and affiliates.

// orbitsweep-489.mjs — GH-489 ORBIT SWEEP gate (finale-review cure lane).
//
// WHY THIS EXISTS: every pre-finale gate judged at REGISTER poses; the owner
// finale orbits sweep ALL bearings, and the 2026-08-21 maintainer review
// rejected the 489 side on three at-a-glance failures that live BETWEEN the
// registers (Drive finale-1to1-2026-08-21/489-xw101-corner-orbit.mp4):
//   1. the boot read as a LAMP (blown near-white + warm bloom halo) at
//      bright bearings (t7/t15 of the 450-frame orbit);
//   2. rail tops read bright saturated magenta at grazing bearings
//      (identity break vs the dossier's dark-mahogany family);
//   3. the obSnkSeamShadow cards read as black rectangular HOLES in the
//      cushion cloth near the jaws.
// This instrument renders the finale orbit geometry (72 bearings per orbit,
// corner + fulltable, the finale-orbit.mjs session laws verbatim: cinema
// boot, snooker settle, EMPTY-TABLE law, studio_xw101 preset) and judges
// EVERY frame with photo-derived windows (dossier-star-xw101; window
// derivations in the judge header). A mask pass per bearing classifies
// pixels by object class (material userData.obClass tags + mesh names), so
// the judges see classes, not regions.
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
//   --encoded --pack <dir>         489 PASS-4 CLOSURE: run the shipped-
//       encode bars DIRECTLY on the three 489 Drive deliverables
//       (sha-bound; the deliverable-plane row of record — pocketing
//       included, previously ungated on the encode plane).
// Ports: OB_E2E_PORT/OB_E2E_CDP_PORT pin; else claims 16700-16729 (undeclared space, GH-687; the lane band 9550-9579 is claimed by run-gate --band and arrives as pins — SNK-R30; the 489
// finale band, free since the finale capture retired).
// GH-687 (SNK-R30): one static server + one CDP port, pinned or band.http(0)/band.cdp(0)
export const PORT_INVENTORY = { http: 1, cdp: 1 };
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

// FIX3 (P2 (a)): the destination is resolved and the prior verdict removed BEFORE the --web existence check
const { invalidatePrior: __invalidatePrior } = await import('./lib/serve-check.mjs');
const { manifestOrbitNames: __manifestNames, removeManifest: __removeManifest, writeManifest: __writeManifest, resolveJudgeOrbits: __resolveJudgeOrbits, requireOrbitReport: __requireOrbitReport, readOrbitMeta: __readOrbitMeta } = await import('./lib/orbit-manifest.mjs');
const { validateSelection: __validateSelection } = await import('./lib/mode-outputs.mjs'); const { optPresent: __optPresent, optValue: __optValue } = await import('./lib/argv.mjs'); // FIX8 (review round 8 on #731 P2 B): a selection is validated BEFORE any deletion path is built from it // FIX7 (Fable pass 3): the 490 capture manifest ported — one module for both drivers
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'orbitsweep-489', value: ['--out', '--web', '--pack', '--frames', '--orbits'], bool: ['--sweep', '--judge-only', '--red-arm', '--encoded'] });
const OUT = __P.value('--out') ?? '/tmp/ob-orbitsweep-489';
// the per-orbit judge reports of THIS run's orbit names only (`--orbits`, default corner,fulltable; plain tokens) — never every
// subdirectory of a shared --out (refuter pass 3: `--out /tmp` would have removed sibling tools' report.json)
const KNOWN_ORBITS = ['corner', 'fulltable']; // the capture names GEO defines (asserted against GEO below) — ONE known list for the load-time invalidation names, the manifest and --orbits (Fable pass 4)
// FIX7 (review round 7 on #731 P2 A): each mode invalidates ONLY the artefacts it (re)produces — its own output set — so the
// sweep / judge, encoded and red-arm result sets coexist under one --out (the FIX3 cut removed the RED/GREEN report and the
// encoded bars in every mode; --red-arm verifies committed fixtures and regenerates neither). A run without exactly one mode
// flag has no output set and removes nothing (the mode refusal follows).
const __modeFlags = ['--sweep', '--judge-only', '--red-arm', '--encoded'].filter((f) => __P.has(f)); // over the parsed argv (FIX10) // ONE resolver (Fable pass 2 on FIX7): the exactly-one rule is computed once, here; the run's MODE below IS this value
const __modeEarly = __modeFlags.length === 1 ? __modeFlags[0].slice(2) : null;
// FIX8 (review round 8 on #731 P2 B; Fable pass 1 — the two-tier rule): TIER 1, the mode's FIXED-NAME artefacts under the literal
// --out are the first effect (FIX3); TIER 2, the per-orbit report.json DERIVED from --orbits only after the selection is validated
// against KNOWN_ORBITS (`--judge-only --orbits unrelated --out X` leaves X/unrelated/report.json byte-identical). `--orbits` is read
// as the run reads it (last occurrence, `=` form).
const __FIXED = {
  sweep: [path.join(OUT, 'orbitsweep-489-report.json')],
  'judge-only': [path.join(OUT, 'orbitsweep-489-report.json')],
  encoded: [path.join(OUT, 'encoded-bars-489.json'), path.join(OUT, 'encoded-cfg-489.json')],
  'red-arm': [], // verifies the pinned red basis against committed fixtures; writes nothing under --out
};
const __ORBITS_RAW = __P.value('--orbits'); // FIX9 (P2 A): the VALUE is read by the writer's reader BEFORE the first effect — a blank / whitespace / `=`-empty / trailing --orbits is refused by name with nothing removed (it owns nothing)
const __TIER1 = __invalidatePrior(__FIXED[__modeEarly] || [], 'orbitsweep-489');
const __ORBITS_ARG = __ORBITS_RAW !== null ? __validateSelection({ values: __ORBITS_RAW, known: KNOWN_ORBITS, what: 'orbit', tag: 'orbitsweep-489', removed: __TIER1 }) : null; // tier 2's known-set check (a well-formed unknown name) comes after tier 1
const __orbitReports = (o) => { const names = String(__ORBITS_ARG ? __ORBITS_ARG.join(',') : (__manifestNames(OUT, { mode: __modeEarly, args, known: KNOWN_ORBITS, explicit: __ORBITS_ARG !== null }) || ['corner', 'fulltable']).join(',')).split(',').map((x) => x.trim()).filter((x) => /^[A-Za-z0-9_-]+$/.test(x)); return names.map((n) => path.join(o, n, 'report.json')); };
if (__modeEarly === 'sweep' || __modeEarly === 'judge-only') __invalidatePrior(__orbitReports(OUT), 'orbitsweep-489'); // tier 2
const webDir = __pathOpt('--web', { tag: 'orbitsweep-489', mustExist: 'dir' }) ? path.resolve(__pathOpt('--web', { tag: 'orbitsweep-489', mustExist: 'dir' }))
  : path.resolve(HERE, '..', '..', 'web');
const FRAMES = Number(__stringOpt('--frames', { default: 75, tag: 'orbitsweep-489' }));
// review orbit-cure r5 P2: a zero/negative/non-finite count would judge
// nothing and exit GREEN — the gate refuses instead. Scoped to CAPTURE/
// JUDGE modes (the 490 pass-3 review r7 P2 lesson, ported at pass-4): a
// `--encoded --frames 0` invocation must reach the encoded stale-report
// invalidation, never exit before it and retain a prior green verdict.
if (!args.includes('--encoded')
  && (!Number.isInteger(FRAMES) || FRAMES < 1)) {
  console.error(`--frames must be a positive integer (got ${FRAMES})`);
  process.exit(2);
}
// 489 PASS-3 review r5 (continuous-orbit encode plane): the judged
// bearings must land ON shipped video frames — FRAMES has to divide the
// SELECTED orbits' shipped run lengths (600 fulltable / 450 corner;
// review r6 P2: a corner-only --frames 450 run is valid). Default 75
// (video steps of 8 / 6).
if (!args.includes('--encoded')) {
  const runLenOf = { fulltable: 600, corner: 450 };
  for (const o of String(argOf('--orbits', 'corner,fulltable')).split(',')) {
    const rl = runLenOf[o];
    if (rl && rl % FRAMES !== 0) {
      console.error(`--frames must divide ${o}'s shipped run length ${rl} `
        + `(got ${FRAMES})`);
      process.exit(2);
    }
  }
}
const ORBITS = __ORBITS_ARG ? [...__ORBITS_ARG] : ['corner', 'fulltable']; // FIX8: the validated selection (never a raw split)
const JUDGE_PY = path.join(HERE, 'orbitsweep-judge.py');
const RED_BASIS = path.join(HERE, 'fixtures', 'orbitsweep-489-red-basis.json');
const RED_BASIS_IDENTITY = path.join(HERE, 'fixtures',
  'orbitsweep-489-red-basis-identity.json');
const RED_BASIS_BLOCKERS = path.join(HERE, 'fixtures',
  'orbitsweep-489-red-basis-blockers.json');
const RED_BASIS_PASS2 = path.join(HERE, 'fixtures',
  'orbitsweep-489-red-basis-pass2.json');
const RED_BASIS_PASS3 = path.join(HERE, 'fixtures',
  'orbitsweep-489-red-basis-pass3.json');
const W = 1600, H = 1000;

// finale-orbit.mjs GEO (489) verbatim — the orbit the owner reviews
const GEO = {
  fulltable: { center: [0, 0, -0.12], r: 4.05, h: 1.65, fov: 42 },
  corner: { center: [0.90, 1.80, -0.02], r: 0.55, h: 0.34, fov: 36 },
  orbitPreset: { brightness: 1.4, exposure_mul: 1.0 },
};
{ const k = Object.keys(GEO).filter((x) => x !== 'orbitPreset'); if (k.length !== KNOWN_ORBITS.length || k.some((x) => !KNOWN_ORBITS.includes(x))) throw new Error(`KNOWN_ORBITS ${KNOWN_ORBITS} != GEO orbits ${k}`); } // one known list (Fable pass 4)

// Photo-derived judge windows (derivations in orbitsweep-judge.py header).
const WINDOWS = {
  table: '489',
  // boot median-luma ceiling: the montage boot medians 0.85 under the
  // full studio sweep, and the register-SEALED skirt read (3q raw dE
  // 3.9, photo-matched) itself medians 0.87 at skirt-dominant orbit
  // bearings with zero blown pixels — the window sits above the sealed
  // ceiling and well below the red state (0.92-0.97 blown medians)
  boot_l_med_max: 0.89,
  boot_blown_frac_max: 0.08,
  rail_magenta_frac_max: 0.10,
  // colored-bright bound (orbit-cure class): fires only when the median
  // is also SATURATED (S > 0.30: the plum-identity break)
  rail_v_med_max: 0.62,
  // 489 IDENTITY round: the orbit-cure neutral-flare cap (0.78, sweep-
  // median) was REJECTED at the second finale review — it admitted a
  // FULL-FACE silver wash. Replaced by DOSSIER-DERIVED per-bearing-band
  // identity windows (derivation chain in orbitsweep-judge.py header:
  // official video dolly sweep + product 3/4 + GM2025 4K + press side
  // elevation; v_med family 0.16-0.37, bright-frac family 0.00-0.34):
  // the rail median must stay in the dark-mahogany family at EVERY
  // bearing and the polish flare must stay a BAND (bright-frac limit),
  // never a wash. Red tree 1e1ec317 measured v_med 0.49-0.55 at every
  // fulltable bearing (bright-frac 0.13-0.28) and 0.64 at corner i24.
  rail_v_med_max_band: { side: 0.40, end: 0.43, oblique: 0.40, close: 0.55 },
  rail_bright_frac_max_band: { side: 0.35, end: 0.45, oblique: 0.40,
    close: 0.45 },
  // 489 IDENTITY round leg windows (dossier leg family derivation in the
  // judge header; red tree measured leg_s_med 0.786-0.803 = the
  // orange-tan mechanism, corner i24 spread 0.114 = the flat read)
  // spread floors: far bands 0.18 (dossier turned-shading family: GM2025
  // 0.26, video sweep 0.31-0.33, product 0.37-0.41, minus margin). The
  // close band keeps only a STRUCTURAL flat-sticker guard (0.06): at the
  // 0.55 m bearings the visible leg is a PARTIAL barrel section, the
  // measured spread is structurally ~0.08-0.10 for red and cured trees
  // alike (red i24 read 0.114 >= cured 0.102 — spread cannot separate
  // them there; the close-band identity axis is SATURATION, which is
  // armed and red-fires), and no dossier venue-close leg frame exists to
  // derive a tighter floor from.
  // 489 PASS-2 re-derivation: the identity round cut the saturation
  // ceiling at 0.76 — the sealed tree's own read (0.759) + 0.001, i.e.
  // ZERO headroom for lawful scene evolution: the pass-2 pocket cures
  // (whiter knit skirt, gather brass) shift the legs' REFLECTED env by
  // +0.002 and tripped the row at ten side bearings with no visual leg
  // change (A/B at 1x). The identity axis is the ORANGE-TAN red class at
  // 0.786-0.803 (red tree, pinned in the identity basis) — the ceiling
  // re-bases to 0.77: 0.011 of lawful headroom, 0.016 of red margin;
  // --red-arm verifies the identity basis still fires under it.
  leg: { h_med: [26, 46], s_med_max: 0.77, v_med: [0.30, 0.85],
    spread_min: 0.18, spread_min_close: 0.06 },
  leg_min_px: { corner: 4000, fulltable: 1500 },
  // apron guard (register-sealed identity — generous wash/blown ceiling)
  apron: { v_med_max: 0.55, s_med_max: 0.85 },
  // apron-sample coverage floor PER ORBIT (= per bearing band: bandOf
  // maps corner -> close, fulltable -> side/end/oblique). Every apron
  // row rides the same sample (wash/sat/stack/hue + the agg apron
  // coverage count); the judge consumes a scalar, so judge() resolves
  // the orbit's floor when it writes meta.windows.
  //   fulltable 1500 — the identity-round mask-presence floor, unchanged
  //   (the whole apron is in frame at every bearing: 75/75 judged in
  //   every seal, min 4193 px SNK-6 / 4405 red basis / 4830 SNK-7).
  //   corner 3900 — DERIVED, RULING R-C1 (ADDENDUM to ORDER-CRAFT-R3-
  //   SNK8): at the corner orbit's two coverage edges the apron enters
  //   and leaves the frame TRIM FIRST — the gold top moulding clears the
  //   boot before the plum face does — so the smallest samples are
  //   moulding-only slivers (trim share 0.84-1.00 by an H 20-60 census
  //   of the SNK-6/SNK-7 seal frames) whose median hue IS the dossier's
  //   apron-wood family (H 24-30) and whose V is the lit trim's
  //   (0.29-0.34), i.e. on the 0.30 brick-guard trigger: the ef3f1bd3
  //   seal fired apron_hue on corner f052 (1622 px, H 27.6, S 0.44,
  //   V 0.337; sha-identical frame, nothing brick), and every prior seal
  //   carried the class 0.01 under the trigger (f5/f51: H 30/24, V 0.29)
  //   with f52 at 1217-1230 px unjudged by ~280 px. Class ceiling:
  //   3169 px (SNK-7 f51, trim 0.84, V 0.294); the next coverage step is
  //   body-dominated with the trim dark (3611 px SNK-6 f50 trim 0.30
  //   V 0.235; 3967 px SNK-7 f6 V 0.227; 4672 px SNK-7 f50 V 0.239).
  //   Floor = equal proportional margin between the class ceiling (3169)
  //   and the nearest pinned-basis arm carrier above it (corner i47,
  //   4852 px, apron_stack within +-2 of the pinned i49; i48 at 3624 px
  //   cannot be kept with margin): sqrt(3169 x 4852) = 3921 -> 3900.
  //   Margins: the sliver class >= 23% below (f052 2.4x), i47 24% above,
  //   i7 (4487 px, the red basis' first post-mixture corner frame,
  //   H 8.7) 15% above; the apron_hue arms are untouched (corner i24
  //   20755 px = 5.3x, fulltable i33 4444 px = 3.0x its own 1500). The
  //   red basis' own corner coverage-edge mixtures (i5 2144 px H 17.3,
  //   i49 2397 px H 12) fall below the floor — --red-arm asserts that
  //   and replays f052. Not the hue-edge option: the brick body reads
  //   H 358-12 and the trim H 20-60 (an edge ~16 could be derived from
  //   that gap) but the pinned fulltable i33 arm reads H 20.6 and would
  //   stop firing by itself, and a hue edge cannot see the coverage
  //   class. Residual, disclosed not gated: mid-orbit frames f26-f28
  //   read trim-majority (0.49-0.63) at full coverage, H 21-22.5,
  //   V 0.18-0.23 — held off the row by the V trigger with 0.07-0.12
  //   margin in every seal (d69b7d33 f27's fail was voids).
  apron_min_px: { corner: 3900, fulltable: 1500 },
  // 489 IDENTITY round seam-glow bar (the cinelight-strip class, third
  // appearance): rail/apron junction columns carrying a white-hot pixel
  // (V >= 0.90, S <= 0.45). Reference junctions are dark/warm saturated
  // gold in every dossier frame; red tree measured 0.63-0.88 fulltable.
  seam_glow_frac_max: 0.10,
  seam_min_cols: 20,
  // aggregate row-coverage floors (review identity r1 P2: a wholly
  // missing leg/apron class or a junction-blind capture must fail at the
  // orbit level, never zero-pass by soft-skip). FRACTIONS of the
  // captured frame count (review identity r2 P2: absolute 72-frame floors
  // rejected valid --frames N short sweeps) — ~50%% of the measured
  // coverage rates (corner leg 24/72, apron 45/72, seam-judged 17/72;
  // fulltable 72/72 for all three, identical red and cured)
  // craft R3-SNK-6 (junction law, SPIKE-REPORT-CRAFT-R2.md §R3c.15.2): the
  // corner leather now runs out to the rail face − 13 mm and its skirt to
  // the apron plane, so from the CORNER orbit's bearings the rail/apron
  // junction columns beside the pocket are behind leather — the corner
  // capture is junction-blind BY CONSTRUCTION (the 1c4f0d06 seal sweep
  // read 0/75 seam-judged frames with 0 fail frames; the R3-SNK-5 sweep
  // read 17/72). The seam-glow class stays guaranteed by the FULLTABLE
  // orbit (floor 0.5, 75/75 judged); the corner floor is 0.
  agg_min_frac: { corner: { leg: 0.16, apron: 0.28, seam: 0.0,
    throat: 0.10, net: 0.05, purity: 0.5, kink: 0.10,
    // 489 PASS-2: the silhouette-bleed row must actually judge (a
    // capture that never sees a dark background field cannot clear the
    // halo class silently)
    silb: 0.2 },
    fulltable: { leg: 0.5, apron: 0.5, seam: 0.5 } },
  // ---- 489 BLOCKER-CURE round (finale adversarial review B8-B14;
  // derivations in the judge header, dossier ROIs in the derivation
  // fixture). Windows finalized against the pre-cure basis capture
  // (fixtures/orbitsweep-489-red-basis-blockers.json @ the a6c89460
  // visual bytes) and the dossier appearance families. ----
  // (h) throat: dossier top-down interior median sits AT/BELOW the lit
  // bed (net 1.13x, walls 0.64-0.87x, drop 0.58x); red tree 2.57-3.26.
  throat_cloth_ratio_max: 1.35,
  throat_blown_frac_max: 0.02,
  throat_min_px: 400,
  // (i) apron-stack: plum family renders (railwood-equivalent albedo
  // V0.12 renders v_med 0.37 under this rig) — ceilings sit above the
  // family, below the red brick read (0.44-0.50). Hue window wraps.
  apron_v_med_max_band: { side: 0.38, end: 0.38, oblique: 0.38, close: 0.42 },
  // brick guard: fires INSIDE the red band when the median VALUE also
  // sits above the dossier family (V >= 0.30) — hue alone cannot gate
  // (the dossier's own studio apron rows read H 28-36; press 326-338)
  apron_h_med_win: [345, 390],
  apron_hue_v_min: 0.30,
  // (j) green flank guard: no dossier frame shows green on rail bodies
  rail_green_frac_max: 0.06,
  // (k) junction mint wash (B12): RIDGE census — mint-signature cloth
  // (desaturated bright green: strip S0.48 V0.69 vs bed S0.84 V0.37)
  // that is ALSO a local bright ridge (>= +0.10 lum vs the cloth 10 px
  // above AND below): the lamp pool shares the strip's HSV but never
  // ridges
  junction_glow_frac_max: 0.02,
  junction_mint_s_max: 0.62,
  junction_mint_v_min: 0.55,
  // (l) close-zoom purity (B13): finalized from the basis capture
  // (red close frames dot 0.02-0.06 / hf 0.02-0.035 family) vs the
  // smooth-velvet dossier macro class
  cloth_dot_frac_max: 0.05,
  cloth_hf_mean_max: 0.05,
  // (m) collar silhouette kinks (B9): isolated-spike law (judge header
  // m); the geometric station law red-arms in check-pocket C9. Window 3:
  // the two structural arrises the detector legitimately sees at the
  // outside-diagonal bearings (the W1 wide-boot DROP EDGE — 裁定书: an
  // edge with a drop shadow, never a knife fade — plus the jaw-cloth
  // junction) read 3 isolated spikes at i7/i61 on the cured tree;
  // a low-poly regression reads 10+.
  sil_kink_deg: 8.0,
  sil_kink_count_max: 3,
  // (n) net anatomy (B14): the verdict lives in
  // check-pocket-construction C10 (raycast, red-proven); the sweep
  // gates net-class mask presence (agg_min_frac.net) and records the
  // width diagnostic (judge header n).
  // craft R3-SNK-2: the Magnum first course hangs UNDER the leather flap
  // (hidden hitch heads; no knit collar above the bed as the W-era sock
  // and the R3 seam loops had), so from the corner orbit the net-class
  // mask shows only THROUGH THE MOUTH: 30–65 stride-2 px in every one of
  // the 75 close-band frames (median 47) on the sealed construction,
  // where the seam-loop construction read up to 188. The presence floor
  // follows the construction: 25 (≈ half the median; the no-net class
  // reads 0, a lost tag reads 0). agg_min_frac.net 0.05 unchanged.
  net_min_px: 25,
  // 489 PASS-2 rows (adversarial pass #2 verdict, items 5+6):
  //   sil_bleed_max — boot silhouette-bleed (median near-band background
  //   lift vs far field; the studio_xw101 bloom halo measured up to
  //   0.215 on the be56a831 basis, the crisp control class reads
  //   <= 0.04);
  //   dline_clip_px_max — non-lamp G>=254 census (ledger row 6 "never
  //   clips" was false on 629/690 shipped fulltable frames; the cure is
  //   ZERO on every bearing of both orbits).
  sil_bleed_max: 0.035,
  dline_clip_px_max: 0,
  // 489 PASS-3 SHIPPED-ENCODE rows (adversarial pass #3 B1/B2 structural
  // mandate): the pass-2 dline row judged the pre-encode captures and the
  // shipped 4:2:0 bytes clipped anyway (630/690 frames G=255 tracing the
  // markings; corner R>=254 381/480 frames, peak 435 px). Every beauty
  // frame now round-trips through the exact shipped encoder settings
  // (encode.sh verbatim: libx264 crf 14 medium yuv420p) inside the gate
  // and the DECODED bytes are censused (orbitsweep-judge.py enc rows):
  //   enc_dline_clip_px_max — decoded G>=254 on/next to cloth = 0 on
  //     every bearing of both orbits (the plane the wording ships on).
  //     The encode pass (review r5 final form) encodes the FULL captured
  //     true-cadence run (600/450 frames) as ONE continuous stream with
  //     the shipped settings — the judged frames carry the
  //     deliverable's own GOP/reference/rate-control context;
  //   enc_rclip_px_max — decoded non-lamp R>=254 ceiling on the CHURN
  //     QUAD SUM (the decoded continuous corner run at the shipped
  //     R-clip peak bearing, video i96-99): per-frame maxima swing +-8%%
  //     run to run under the full-context encode (302/307 back-to-back
  //     cured captures) while the sum is stable — cured sums 1056-1087
  //     vs the shipped 1507; the 1250 ceiling holds +-17%% margin both
  //     ways and red-arms on the shipped basis. Per-bearing enc_rclip_px
  //     is RECORDED on all judged corner bearings (feeds the ledger-row
  //     magnitude wording).
  //   (churn persistence is RECORDED, not gated: measured on both trees,
  //   +-3 px adjacent-set persistence does not order defect vs cure —
  //   shipped 0.76-0.81 vs cured 0.57-0.73; the raw clip-set overlap is
  //   optical-flow-dominated on an orbiting camera. The B2 sparkle
  //   mechanism — the stitch specular flash — is cured at the material
  //   and the magnitude law rides the quad count ceiling.)
  //   enc_dline law refinement (measured on the cured tree): the armed
  //   ZERO applies at COMPONENT scale — no decoded G>=254 connected
  //   component may exceed spot scale (enc_dline_comp_max 8 px; the
  //   shipped defect traced the line BODY in 50-1000+ px components,
  //   e.g. ft i0 = 1114 px), and the per-frame total stays within the
  //   spot floor (enc_dline_total_max 12). Sub-spot blobs are the
  //   physical floor of white markings on green under 4:2:0 (a spot/AA
  //   pixel inherits its neighbours' green chroma, worst-case +38 —
  //   no visible-marking albedo can zero it; measured cured family
  //   0-5 px totals, max component 4).
  enc_dline_clip_px_max: 0,
  enc_dline_comp_max: 8,
  enc_dline_total_max: 12,
  //   enc_dline_screen_total_max — the review-r6 full-run SCREEN row:
  //     every decoded orbit frame (incl. the in-between bearings the
  //     mask grid does not sample) is censused maskless-except-lamp
  //     with the same component law; the total ceiling is looser than
  //     the per-bearing cloth-scoped 12 (no cloth-adjacency scoping in
  //     the screen) but far below the shipped line-body class
  //     (600-1100 px totals; the shipped basis' worst frame ft video
  //     i1 = 1006 px is exactly an in-between frame on the 75-grid).
  enc_dline_screen_total_max: 48,
  //   RULING R-S8-4 (R3-SNK-9) — ENCODER-BLOOM exclusion for the enc_dline
  //   census (orbitsweep-judge.py enc_bloom_component; red arm
  //   --selftest-bloom, run by --red-arm). The sealed 9c0437a3 corner
  //   f064 (az 217.2) read 16 px / comp 11: the LAST lit row of the
  //   bore's lamp-lit strip where it meets the cloth rim — under 4:2:0
  //   the straddling 2x2 chroma cell averages the warm glint's chroma
  //   with the cloth's; on decode the glint pixel keeps its own luma
  //   (full-resolution Y) and takes the averaged chroma: R -25..-36,
  //   G +7..+16 past 254, |dY| <= 4, the rows above un-shifted. Not a
  //   drawn line. Each census component is classified; a component is
  //   excluded ONLY when every signature condition holds (docstring in
  //   the judge); raw and excluded counts ride the report. The laws
  //   above (comp 8 / total 12 / screen 48) are unchanged.
  enc_bloom: {
    // ENCODER PROPERTY (yuv420p, the shipped pix_fmt): one Cb/Cr sample
    // per 2x2 luma cell — the chroma-sharing unit.
    chroma_cell_px: 2,
    // DERIVED: max Chebyshev distance from a decoded pixel to the cloth
    // pixel whose chroma it can carry = own-cell reach (cell-1 = 1) +
    // one neighbouring chroma sample (cell = 2; H.264 chroma deblocking
    // modifies p0/q0 = one sample each side of a block edge, and the
    // decoder's chroma upsampling footprint spans the adjacent sample)
    // = 3. Measured on the seal rims: 1 (every shifted pixel sits in the
    // straddling cell; rows two and three above are un-shifted).
    reach_px: 3,
    // DERIVED: = reach_px — a bloom band lies within reach of its cloth
    // partner on ONE side and of its un-shifted body on the other, so
    // its normal thickness cannot exceed reach; the classifier refuses
    // any component holding a (thick_max_px+1)^2 square. Length is
    // unbounded (a long rim gives a long band); the marking family is
    // separated by the body/mask conditions, not by length.
    thick_max_px: 3,
    // JUDGE LAW: the judge's own blown census, `max(r,g,b) >= 250`
    // (V >= 0.98), applied to the un-shifted BODY the rim abuts — a lit
    // glint saturates the tonemapper; the cured marking family stores
    // headroom (measured source V max 220 on the sealed fulltable
    // frames, decoded G max 238). Members themselves are admitted by
    // nearest-colour (body vs partner): the rim's anti-aliased end
    // pixels blend toward the cloth (measured f064 x802: V 249).
    highlight_v_min: 250,
    // DERIVED: majority class. The rim IS the cloth/furniture mask
    // boundary, whose anti-aliased blend is <= 1 px wide (measured
    // f068: one rim-row pixel classed cloth at the strip's end); a
    // 1 px sliver can never be the majority of a body band up to
    // reach_px deep. A marking on the cloth mesh is 100 % cloth-class.
    body_cloth_frac_max: 0.5,
    // DERIVED: crf 14 medium -> frame QP ~16-24 -> H.264 luma Qstep 5-10
    // (Qstep doubles every 6 QP: QP18 = 5, QP24 = 10) -> worst DC
    // reconstruction error Qstep/2 <= 5 -> 8 (next power of two);
    // measured |dY| <= 4 on the seal rims. Luma conservation is the
    // chroma-error signature: a drawn colour or a luma gain fails it.
    luma_tol: 8,
    // DERIVED: = luma_tol — the chroma partner must be green-dominant
    // (G >= R + m and G >= B + m) beyond the encoder's own
    // reconstruction noise; the highlight itself must NOT be
    // (G <= max(R,B) + m). Cloth measured (0,90,37): margins 53/90.
    green_dom_min: 8,
  },
  //   RULING V8-C1 (R3-SNK-9) — GEOMETRIC fall-disc scoping of the
  //   enc_dline census, a SEPARATE exclusion layer applied BEFORE the
  //   encoder-bloom classifier above (both apply; both are reported):
  //   pixels inside the projection of each render FALL DISC
  //   (web/scene/table.js pocketFallDiscs() — the kernel CEBP disc:
  //   corner R 0.0889 about (±(L/2 + 0.0476), ±(W/2 + 0.0476)), the
  //   slate-edge intersection 47.6 mm behind each nose line; middle the
  //   template centre with r 0.0496) plus a 1 px rim are not cloth a
  //   line can be drawn on — the fall interior is the pre-lit fall
  //   canvas, the glint and the net. The capture writes the polygons
  //   per VIDEO frame from the LIVE camera (capture(): FALL_POLY_EVAL,
  //   three.js in the page; meta.run_fall_polys[v] and
  //   poses[i].fall_polys, with the camera record meta.run_cams[v]);
  //   the judge rasterises them (orbitsweep-judge.py fall_mask()) and
  //   FAILS LOUD — fall_poly_missing — on any frame without them: an
  //   old capture is a judge item (V8-C1 pending), never GREEN. Red
  //   arm: --selftest-disc (run by --red-arm): a drawn line on cloth
  //   outside the disc still fires; the same line inside is excluded;
  //   the node-side three.js polygon must equal the judge's pinhole.
  enc_fallmask: {
    // DERIVED: 1 px rim — the fall edge's own anti-aliased boundary
    // pixel: the rasterised polygon's edge pixel blends fall and cloth
    // (one Chebyshev step), and it also absorbs the half-pixel
    // convention gap between three's continuous NDC->px map and the
    // integer raster. Row two is cloth.
    rim_px: 1,
    // DERIVED: per-frame viewport-fraction ceiling for the mask. A
    // horizontal disc foreshortens by cos θ = h/d at every point, so
    // its image area ≤ f²·h·πR²/d_min³ · 1/cos³φ (f = (H/2)/tan(fov/2)
    // = 1538.8 px at fov 36; h 0.34 = the corner orbit's eye height
    // over the bed; R 0.0889; d_min = √(h² + (r − δ − R)²) = 0.534 with
    // the eye radius r 0.55 and the kernel disc δ 0.049 from the orbit
    // centre; φ ≤ 13.7° with the disc at the look-at → 1.09): 8.9 % of
    // 1600×1000 for the corner orbit's near disc, each far disc ≤ 0.8 %,
    // the fulltable orbit's six discs < 0.3 % together. Measured with
    // the judge's rasteriser over the reconstructed 450-frame corner
    // run: 5.85 % (v165); fulltable 0.60 %. Ceiling: the one-
    // significant-figure envelope above the near-disc bound. A mask
    // past it is a projection defect (a wrong camera, a near-plane
    // straddle), not a fall.
    frac_max: 0.10,
    // DERIVED: 64 rim vertices — chord sagitta R(1 − cos(π/64)) =
    // 0.0889 × 0.0012 = 0.107 mm → 0.31 px at the corner orbit's
    // closest range (f/d_min = 2.88 px/mm), under the rim pixel.
    n_vertices: 64,
    // the fall disc lies in the bed plane: world y 0 (pocketFallDiscs()
    // returns plan {x, z, r}; three.y is up)
    plane_y: 0,
    // recorded polygon precision: 0.01 px (1/100 of a raster cell — the
    // raster is integer; the red arm's three-vs-pinhole agreement is
    // judged at this quantum)
    px_decimals: 2,
  },
  enc_rclip_px_max: 1250,
  //   489 PASS-4 CLOSURE (adversarial pass #4 B1 — the SPLIT churn law):
  //   the anchored quad (enc_rclip_px_max, video v156-159) watched only
  //   the shipped peak bearing, and the cured track's churn peak
  //   MIGRATED between judged bearings — measured on the shipped r4
  //   Drive bytes: sliding-quad max 1342 @ video v230-233 (az ~47.6°)
  //   vs 1068 at the anchor; per-frame peak 366 @ v232 vs 339 at the
  //   judged bearings. The anchored row keeps the specular-chain-flare
  //   separation (cured 1068 vs shipped 1507, cap 1250 unchanged); the
  //   FULL-TRACK row slides a 4-frame window over EVERY decoded track
  //   frame, records the argmax bearing, and caps the sum:
  //     enc_rclip_fulltrack_max 1450 — pass-4 multi-run swing study:
  //       Drive bytes / sweep replica / re-cut card encode all read
  //       1342 on the pinned deterministic rig; sealed cross-run family
  //       swing ±8% (cure-lane law) -> 1342 × 1.08 ≈ 1450; the shipped
  //       defect basis' own full-track quad reads 1557 (measured on its
  //       bytes, fixture churn_fulltrack) and fires at +7.4%;
  //     enc_rclip_fulltrack_comp_max 96 — element-census QUALIFIER: the
  //       largest R>=254 component on EVERY decoded track frame (review
  //       pass-4 r1 P2: never argmax-window-only) must stay at the
  //       booked element-family scale (whole-track measured 59 px
  //       cream/plum boundary line @ v232; defect bytes whole-track
  //       70 px @ v270, same family — the qualifier guards FORWARD
  //       against a new large-element class hiding under a green sum;
  //       the defect fires on the sum rows).
  enc_rclip_fulltrack_max: 1450,
  enc_rclip_fulltrack_comp_max: 96,
  void_count_max: 0,
  blown_frame_frac_max: 0.005,
  // review orbit-cure r4 P2: a renamed mesh / lost material tag must FAIL
  // the frame, never zero-pass the judges it blinds — per-orbit minimum
  // subsampled mask populations (floors ~40-60%% of the measured minima:
  // 489 corner boot 12.4k / fulltable 2.0k; 490 corner 19.8k / 4.2k)
  mask_min_px: { corner: { boot: 5000, rail: 2000, cloth: 5000 },
    fulltable: { boot: 800, rail: 5000, cloth: 20000 } },
  // ---- 489 PASS-4 CLOSURE SHIPPED-ENCODE bars (adversarial pass #4
  // B2): censuses run DIRECTLY on the three 489 Drive deliverables —
  // the row of record on the deliverable plane (the sweep's replica
  // census stays as the gate-time instrument on the tree; verified
  // byte-equivalent on the pinned rig, pass-4). The INDEX lead sentence
  // ("两桌的…主张都在编码后的交付字节上有闸") is made literally true by
  // this mode: 489-pocketing previously had NO encode gate at all.
  // Frame maps (encode.sh law): orbits = 60 card + track + 30 hold
  // (690 fulltable / 540 corner); pocketing = 60 card + 83 rt + 30 hold
  // + 45 slow card + 117 slow + 30 hold = 365.
  encoded: {
    fulltable: { expected_frames: 690, body: [60, 659],
      // the enc_dline laws on the DELIVERED bytes (green-dominant
      // proxy for the mask-scoped sweep census; measured shipped
      // family 5 px total / 4 px component @ v672-family)
      gdom_total_max: 12, gdom_comp_max: 8,
      // review pass-4 r3 P1: cloth-adjacent ANY-chroma clip law (a
      // neutral R=G=B=255 marking clip evades green-dominance) — same
      // ≤12/≤8 armed constants; measured shipped ft 6/4, co 2/2, pk 0/0
      dclip_total_max: 12, dclip_comp_max: 8,
      blown_frac_max: 0.005, dup_frac_max: 0.02,
      // review pass-4 r2 P1: full-history recurrence census (loop of ANY
      // period; the min-offset progress law alone missed period >= 18) —
      // measured shipped orbits 0/595 + 0/445 recurrent, loop ~0.97
      // review r5 P1 + r6 P2: the authored 1 s hold must BE the terminal
      // track frame (whole-frame MAD, genuine 0.025-0.036) AND stay
      // clean per 100x160 tile (localized-patch law, genuine 0.12);
      // review r6 P1: adjacent-step continuity (order law) — genuine
      // max ft 3.84 / co 7.45, a reorder seam reads 26+
      progress_frac_min: 0.60, recur_frac_max: 0.02, hold_mad_max: 1.0,
      hold_tile_mad_max: 1.0, adjacent_mad_max: 6.0,
      // review r10 P2 + r12 P2: title-card identity (intra stability +
      // text census) with a per-SLOT signature range — the crossing-cure
      // r9 re-cut plate reads 49,841 text px (inside the SEALED r8
      // window, which therefore stands unmoved; every other r9 plate
      // reads outside this range — corner 73,312, pk 50,888/52,041 —
      // so a swapped card fires). A conscious card re-cut updates
      // this pin.
      card_mad_max: 1.0, card_text_min: 49750, card_text_max: 50150,
      card_sig_max_dev: 4.0,
      scene_green_min: 0.10 },
    corner: { expected_frames: 540, body: [60, 509],
      gdom_total_max: 12, gdom_comp_max: 8,
      dclip_total_max: 12, dclip_comp_max: 8,
      blown_frac_max: 0.005, dup_frac_max: 0.02,
      progress_frac_min: 0.60, recur_frac_max: 0.02, hold_mad_max: 1.0,
      hold_tile_mad_max: 1.0, adjacent_mad_max: 10.0,
      // corner plate signature 73,312 text px (the crossing-cure r9
      // re-cut card: churn family cited from the delivered-bytes
      // census — anchor 443 (= the replica-track read, the pass-4
      // pinned-rig bit-identity precedent)/fulltrack 601 @v97-100/
      // dual peaks 158@v84 judged vs 172@v97 full-track/maxcomp 31
      // @v151 = gold skirt-band specular glint — plus the
      // ASBUILT-R9 crossing-cure note; the wedge-cure r8 plate read
      // 69,812 inside the previous [69200, 70400] window)
      card_mad_max: 1.0, card_text_min: 72700, card_text_max: 73900,
      card_sig_max_dev: 4.0,
      scene_green_min: 0.10,
      // the SPLIT churn law (B1) on the deliverable's own bytes:
      rclip_anchor: [156, 159], rclip_anchor_quad_max: 1250,
      rclip_fulltrack_max: 1450, rclip_fulltrack_comp_max: 96 },
    pocketing: { expected_frames: 365,
      card_segs: [[0, 59], [173, 217]],
      // motion segs = the live gameplay windows INCLUDING their static
      // pre-rolls (review r11 P1: the seg boundary must be MEASURED —
      // a wholesale pre-roll replacement now breaks at the 237->238
      // step; genuine boundary steps 0.001-0.005, pre-roll dups 0/19);
      // the DISCLOSED deterministic static tails (rt v89-142, slow
      // v274-334) sit outside them (dedup-scan law; capture-plane dups
      // 54/61 booked) and are anchored by the hold pairs instead
      motion_segs: [[60, 88], [218, 273]],
      dup_frac_max: 0.02,
      // measured shipped: rt 0.667 / slow 0.85 — floor with deliberate
      // headroom (the 490 progress-law posture)
      progress_frac_min: 0.30, scene_green_min: 0.25,
      // pass-4 booked row 1: red-ball lit-face R-clip during the mouth
      // approach (physically expected family; measured in-window peak
      // 10,136 @ v265, ramp v73-85 / v243-269, outside residual 54)
      redface_windows: [[73, 85], [243, 269]],
      redface_peak_max: 13000, redface_peak_min: 2000,
      redface_outside_max: 300,
      // pass-4 booked row 2: specular-arc G-clip (white highlight on
      // the red ball, 4:2:0 chroma-sharing identity; measured 28 px
      // total @ v257 / 18 px component @ v247). SCOPED apart from the
      // enc_dline cloth-marking laws — see the judge docstring.
      gclip_total_max: 36, gclip_comp_max: 24,
      // review r3 P1 pair: cloth-adjacent any-chroma clip (measured 0 —
      // the arc sits off-cloth) + moving∧near-repeat in-seg loop law
      // (genuine reads exactly 1: the lawful v86 post-swallow
      // state-return; a two-cycle loop reads 4)
      dclip_total_max: 12, dclip_comp_max: 8, moving_recur_max: 2,
      // review r5 P1 + r6 P2 + r7 P1: the authored holds AND the
      // disclosed deterministic static tails vs their terminal motion
      // frames (genuine 0.002-0.007 whole-frame / per-tile law — a
      // hard cut to any other static frame fires)
      // review r9 P1: the pre-roll statics join the covered timeline
      // (rt v61-69 vs v60, slow v219-237 vs v218 — genuine tile
      // <=0.031; a replaced anchor frame fires through its own span)
      hold_pairs: [[60, 61, 69], [88, 89, 142], [142, 143, 172],
        [218, 219, 237], [273, 274, 334], [334, 335, 364]],
      hold_mad_max: 1.0,
      // pk tile bound 0.5: genuine 0.05 (x10 margin); the closest
      // possible hard cut (pre-strike frame vs post-swallow tail,
      // both near-empty views) still reads 0.68 and fires
      hold_tile_mad_max: 0.5,
      // review r7 P1: neutral-white specular caps (booked family:
      // genuine 102 total @v84 / 68 comp @v265 + ~50% margin) + the
      // pocketing blown bar (the 0.005 orbit-family predicate)
      neutral_total_max: 160, neutral_comp_max: 104,
      blown_frac_max: 0.005,
      // review r8+r9 P1: event-shape law — the in-window R>=254 count
      // rises then falls with exactly one reversal (8%-of-peak jitter
      // tolerance) and peaks in the back half (genuine 0.833/0.846);
      // reordered/reversed events fail shape or peak position
      event_reversals_max: 1, event_peak_pos_min: 0.5,
      // review r10: card identity + per-seg motion adjacent ceiling
      // (genuine rt 3.05 / slow 2.34; a one-frame hard cut reads ~69)
      card_mad_max: 1.0,
      // review r12 P2: per-SLOT signature ranges (crossing-cure r9
      // re-cut: rt plate 50,888 px / slow plate 52,041 px,
      // non-overlapping with a gap at 51,430-51,500; both exclude the
      // fulltable plate's 49,841) — swapped cards read the sibling's
      // signature and fire
      card_slots: [[50330, 51430], [51500, 52590]],
      card_sig_max_dev: 4.0,
      // review r11 P2: the two pocketing cards must be DISTINCT plates
      // (genuine inter-card MAD 1.718; copying one over the other
      // reads ~0)
      card_distinct_min: 0.5,
      motion_adjacent_max: 6.0 },
  },
};

// review pass-4 r9 P2: the stale encoded-report invalidation precedes
// EVERY refusal — including the exclusive-mode refusal below — so a
// failed/ambiguous invocation can never leave a prior green verdict
// behind for artifact consumers.
// (FIX7: the pre-mode encoded-bars removal that lived here is subsumed by the mode-scoped map at load — it fired on ANY
// `--encoded` token, even beside a second mode flag that the exactly-one rule below refuses, half-removing the encoded set)
// review pass-4 r8 P2: EXACTLY one mode flag — a priority chain silently
// selected the earlier flag (`--red-arm --encoded ...` exited green
// without inspecting any mp4; a misconfigured CI invocation could
// certify the wrong mode).
const MODE = __modeEarly; // the one resolver (FIX7, Fable pass 2): the mode the invalidation used is the mode that runs
if (!MODE) {
  console.error(`exactly one mode flag required (got ${
    __modeFlags.length ? __modeFlags.join(' ') : 'none'}): `
    + '--sweep | --judge-only | --red-arm | --encoded --pack <dir>');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// encoded: 489 SHIPPED-ENCODE bars on the mp4 deliverables themselves
// (pass-4 closure B2 — the 490 --encoded posture mirrored): the sweep's
// replica-track census judges the TREE at gate time; this mode judges the
// BYTES THE OWNER WATCHES, sha-bound, and is the deliverable-plane row of
// record. 489-pocketing gains its first encode gate here (the pass-4
// booked red-face/specular-arc rows).
//   --encoded --pack <dir>   dir holding 489-xw101-{fulltable,corner}
//                            -orbit.mp4 + 489-xw101-pocketing-30fps.mp4
// ---------------------------------------------------------------------------
if (MODE === 'encoded') {
  // stale-report invalidation before EVERY refusal (the 490 review pass-3 r2/r3 law, ported): a reused --out must never retain
  // a prior run's verdict. FIX7 (Fable pass 2): that removal IS the mode-scoped set at load — one removal site per artefact;
  // nothing is removed here.
  fs.mkdirSync(OUT, { recursive: true });
  const pack = __pathOpt('--pack', { tag: 'orbitsweep-489', mustExist: 'dir' });
  if (!pack) { console.error('--pack <dir> required'); process.exit(2); }
  const files = {
    pocketing: path.join(pack, '489-xw101-pocketing-30fps.mp4'),
    fulltable: path.join(pack, '489-xw101-fulltable-orbit.mp4'),
    corner: path.join(pack, '489-xw101-corner-orbit.mp4'),
  };
  for (const [k, f] of Object.entries(files)) {
    if (!fs.existsSync(f) || fs.statSync(f).size === 0) {
      console.error(`[encoded] missing/empty ${k}: ${f}`);
      process.exit(2); // dataless-read refusal (hydrate law)
    }
  }
  const cfg = { files, windows: WINDOWS.encoded,
    out: path.join(OUT, 'encoded-bars-489.json') };
  const cfgPath = path.join(OUT, 'encoded-cfg-489.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  try {
    execFileSync('python3', [JUDGE_PY, '--encoded', cfgPath],
      { stdio: ['ignore', 'inherit', 'inherit'] });
  } catch (err) {
    // exit 3 is a WRITTEN red verdict; every other failure (input
    // refusal exit 2, crash) propagates as invalid evidence, never a
    // visual red (the 490 status-split law).
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
// windows. TWO bases (each round's rejected tree keeps its own coverage):
//   orbitsweep-489-red-basis.json           orbit-cure round @c3b6c10b
//     (boot-lamp / rail-magenta / voids / blown at the corner bearings)
//   orbitsweep-489-red-basis-identity.json  identity round @1e1ec317
//     (white rails / orange legs / seam glow at the fulltable + corner
//      bearings of the second finale review)
// A judge/threshold regression can never pass silently.
// ---------------------------------------------------------------------------
// kernel coords: x ACROSS the width, y along the length — az 0/180 =
// side-on flanks, az +-90 = end-on (pose-verified, identity lane)
const bandOf = (orbit, azDeg) => {
  if (orbit !== 'fulltable') return 'close';
  const a = Math.abs(azDeg) % 360;
  const dSide = Math.min(a, Math.abs(a - 180), Math.abs(a - 360));
  const dEnd = Math.min(Math.abs(a - 90), Math.abs(a - 270));
  if (dEnd <= 35) return 'end';
  if (dSide <= 35) return 'side';
  return 'oblique';
};
const railFires = (f) => {
  const band = bandOf(f.orbit, f.az_deg);
  const rvb = WINDOWS.rail_v_med_max_band[band];
  const rbb = WINDOWS.rail_bright_frac_max_band[band];
  return f.rail_magenta_frac > WINDOWS.rail_magenta_frac_max
    || (f.rail_v_med > WINDOWS.rail_v_med_max && f.rail_s_med > 0.30)
    || (f.rail_v_med > rvb)
    || (f.rail_bright_frac !== undefined && f.rail_bright_frac > rbb);
};
if (MODE === 'red-arm') {
  let ok = true;
  const check = (fired, need, label, tol = 2) => {
    for (const [k, list] of Object.entries(need)) {
      for (const [orbit, i] of list) {
        const hit = fired[k].some(([o, j]) => o === orbit
          && Math.abs(j - i) <= tol);
        console.log(`[red-arm:${label}] ${k} @ ${orbit} i${i}: `
          + `${hit ? 'FIRES' : 'MISSING'}`);
        if (!hit) ok = false;
      }
    }
    console.log(`[red-arm:${label}] fired counts: ${Object.entries(fired)
      .map(([k, v]) => `${k}=${v.length}`).join(' ')}`);
  };
  // ---- basis 1: orbit-cure round (@c3b6c10b) ----
  const basis = JSON.parse(fs.readFileSync(RED_BASIS, 'utf8'));
  const rows = basis.frames.filter((f) => f.orbit === 'corner');
  const fired = { boot: [], rail: [], voids: [], blown: [] };
  for (const f of rows) {
    if (f.boot_l_med > WINDOWS.boot_l_med_max
      || f.boot_blown_frac > WINDOWS.boot_blown_frac_max) {
      fired.boot.push([f.orbit, f.i]);
    }
    if (railFires(f)) fired.rail.push([f.orbit, f.i]);
    if (f.void_count > WINDOWS.void_count_max) fired.voids.push([f.orbit, f.i]);
    if (f.blown_frame_frac > WINDOWS.blown_frame_frac_max) {
      fired.blown.push([f.orbit, f.i]);
    }
  }
  // the maintainer's extracted-frame bearings, mapped to 72-frame indices:
  // t3 -> i5, t7 -> i24, t11 -> i43, t15 -> i62
  check(fired, {
    boot: [['corner', 24], ['corner', 62]],
    rail: [['corner', 5], ['corner', 62]],
    voids: [['corner', 62]],
    blown: [['corner', 24], ['corner', 62]],
  }, 'orbit-cure');
  // ---- basis 2: identity round (@1e1ec317) ----
  const basis2 = JSON.parse(fs.readFileSync(RED_BASIS_IDENTITY, 'utf8'));
  const fired2 = { rail_white: [], leg_sat: [], seam_glow: [], leg_flat: [] };
  for (const f of basis2.frames) {
    const band = bandOf(f.orbit, f.az_deg);
    if (f.rail_v_med > WINDOWS.rail_v_med_max_band[band]) {
      fired2.rail_white.push([f.orbit, f.i]);
    }
    if (f.leg_s_med !== null && f.leg_s_med > WINDOWS.leg.s_med_max) {
      fired2.leg_sat.push([f.orbit, f.i]);
    }
    if (f.leg_v_spread !== null && f.leg_v_spread < (band === 'close'
      ? WINDOWS.leg.spread_min_close : WINDOWS.leg.spread_min)) {
      fired2.leg_flat.push([f.orbit, f.i]);
    }
    if (f.seam_juncols >= WINDOWS.seam_min_cols
      && f.seam_glow_frac > WINDOWS.seam_glow_frac_max) {
      fired2.seam_glow.push([f.orbit, f.i]);
    }
  }
  // the second finale review's bearings: fulltable t8 family (i29 and
  // the side/oblique run) + corner t7 (i24)
  check(fired2, {
    rail_white: [['fulltable', 15], ['fulltable', 29], ['corner', 24]],
    leg_sat: [['fulltable', 15], ['fulltable', 29], ['corner', 24]],
    seam_glow: [['fulltable', 15], ['fulltable', 29], ['corner', 24]],
  }, 'identity');
  // ---- basis 3: blocker-cure round (@6c4e56f8 = a6c89460 visual bytes;
  // the finale adversarial review's B8-B14) ----
  const basis3 = JSON.parse(fs.readFileSync(RED_BASIS_BLOCKERS, 'utf8'));
  const fired3 = { throat_glow: [], apron_stack: [], apron_hue: [],
    junction_glow: [], cloth_dots: [], rail_green: [] };
  // RULING R-C1: the apron rows judge only samples at/above the ORBIT's
  // coverage floor (fixture rows carry apron_px; the fixture's nulls
  // stop at the capture-time scalar 1500) — the same predicate the
  // judge applies live
  const apronJudged = (f) => f.apron_px >= WINDOWS.apron_min_px[f.orbit];
  const apronHueFires = (f) => {
    if (f.apron_h_med == null || f.apron_v_med == null
      || f.apron_v_med < WINDOWS.apron_hue_v_min) return false;
    let ah = f.apron_h_med;
    if (ah < WINDOWS.apron_h_med_win[0]) ah += 360;
    return ah >= WINDOWS.apron_h_med_win[0]
      && ah <= WINDOWS.apron_h_med_win[1];
  };
  for (const f of basis3.frames) {
    const band = bandOf(f.orbit, f.az_deg);
    if (f.throat_cloth_ratio != null
      && (f.throat_cloth_ratio > WINDOWS.throat_cloth_ratio_max
        || f.throat_blown_frac > WINDOWS.throat_blown_frac_max)) {
      fired3.throat_glow.push([f.orbit, f.i]);
    }
    const avb = WINDOWS.apron_v_med_max_band[band];
    if (apronJudged(f) && f.apron_v_med != null && f.apron_v_med > avb) {
      fired3.apron_stack.push([f.orbit, f.i]);
    }
    if (apronJudged(f) && apronHueFires(f)) {
      fired3.apron_hue.push([f.orbit, f.i]);
    }
    if (f.rail_green_frac > WINDOWS.rail_green_frac_max) {
      fired3.rail_green.push([f.orbit, f.i]);
    }
    if (f.cloth_mint_frac > WINDOWS.junction_glow_frac_max) {
      fired3.junction_glow.push([f.orbit, f.i]);
    }
    if (f.cloth_dot_frac != null
      && (f.cloth_dot_frac > WINDOWS.cloth_dot_frac_max
        || (f.cloth_hf_mean ?? 0) > WINDOWS.cloth_hf_mean_max)) {
      fired3.cloth_dots.push([f.orbit, f.i]);
    }
  }
  // the adversarial review's bearings: B8 corner t13-17 -> i44-i60;
  // B9 corner t8.5 -> i26; B10 fulltable sides + corner; B12 corner
  // f378-416 -> i50 family; B13 corner t14-17; B14 net corner close
  check(fired3, {
    throat_glow: [['corner', 58], ['corner', 70]],
    // (R-C1: corner i49 itself is a 2397 px coverage-edge sample, below
    // the corner floor — the +-2 arm is carried by i47, 4852 px)
    apron_stack: [['fulltable', 3], ['fulltable', 33], ['corner', 49]],
    apron_hue: [['fulltable', 33], ['corner', 24]],
    rail_green: [['corner', 26]],
    junction_glow: [['corner', 46], ['corner', 50]],
    cloth_dots: [['corner', 52]],
    // (B9's red-arm is check-pocket-construction C9 — 24.15 deg max
    // station step on this basis' tree; the sweep kink row is the live
    // low-poly guard and reads 0-2 on red and cured trees alike.
    // B14-net red-arms in C10: 18.6 mm on the basis tree vs the 35 mm
    // law — the sweep's width read cannot carry a verdict, judge n.)
  }, 'blockers');
  // RULING R-C1 closer proof (no capture needed): the coverage floor
  // must be IN FORCE in this replay — the red basis' own corner
  // coverage-edge mixtures (i5 2144 px H 17.3 / i49 2397 px H 12,
  // red-bright, both below the floor) may no longer fire an apron row —
  // and the ruled frame (ef3f1bd3 corner f052 — DERIVED: the seal
  // sweep's own read, 1622 px, H 27.6, V 0.337) must be closed by
  // COVERAGE alone: it satisfies the hue+V predicate and is unjudged.
  const f052 = { orbit: 'corner', apron_px: 1622, apron_h_med: 27.6,
    apron_v_med: 0.337 };
  const edgeFired = [...fired3.apron_hue, ...fired3.apron_stack]
    .filter(([o, j]) => o === 'corner' && (j === 5 || j === 49));
  for (const [label, pass] of [
    ['red-basis edge mixtures corner i5/i49 unjudged', !edgeFired.length],
    ['f052 satisfies the hue+V predicate', apronHueFires(f052)],
    [`f052 unjudged under the corner floor (1622 < ${
      WINDOWS.apron_min_px.corner})`, !apronJudged(f052)],
  ]) {
    console.log(`[red-arm:R-C1] ${label}: ${pass ? 'OK' : 'FAIL'}`);
    if (!pass) ok = false;
  }
  // ---- basis 4: adversarial pass #2 (@be56a831 — the sealed finale
  // tree both new rows were derived against) ----
  const basis4 = JSON.parse(fs.readFileSync(RED_BASIS_PASS2, 'utf8'));
  const fired4 = { sil_bleed: [], dline_clip: [] };
  for (const f of basis4.frames) {
    if (f.sil_bleed != null && f.sil_bleed > WINDOWS.sil_bleed_max) {
      fired4.sil_bleed.push([f.orbit, f.i]);
    }
    if (f.gclip_px != null && f.gclip_px > WINDOWS.dline_clip_px_max) {
      fired4.dline_clip.push([f.orbit, f.i]);
    }
  }
  // pass-2 verdict bearings: bloom halo corner f114/f150 -> i8-i14
  // family; D-line clip fulltable f60/f110 -> i0/i5 family (91% of
  // fulltable bearings clipped on the shipped encode)
  check(fired4, basis4.expected ?? {
    sil_bleed: [['corner', 9], ['corner', 14]],
    dline_clip: [['fulltable', 0], ['fulltable', 5]],
  }, 'pass2');
  // ---- basis 5: adversarial pass #3 (@ the SHIPPED r3 finale bytes,
  // 6beba748) — the two shipped-encode rows replay against the decoded
  // shipped-video censuses (the falsified artifact itself is the red
  // basis: 630/690 fulltable frames G=255, corner R-clip peak 435 px).
  // The churn-persistence row does NOT arm on this basis (shipped
  // persistence 0.76-0.81 at +-3 px — the shipped defect class is the
  // magnitude row + the cured specular flash; see the fixture note).
  const basis5 = JSON.parse(fs.readFileSync(RED_BASIS_PASS3, 'utf8'));
  const fired5 = { enc_dline: [], enc_dline_total: [],
    enc_screen_total: [], enc_rclip: [], enc_rclip_fulltrack: [] };
  for (const f of basis5.frames) {
    // the THREE G thresholds arm INDEPENDENTLY (review pass3-r1 P2 +
    // r10 P2: a fixture row consumed by one branch must not shadow the
    // others — loosening any single window past its basis must break
    // the arm):
    //  - enc_dline: component-scale zero (the shipped line-body class:
    //    ft i0 = 1114 px total, largest component 693 px);
    //  - enc_dline_total: the per-frame spot-floor ceiling alone (the
    //    shipped corner frames read 14-23 px totals with <= 8 px
    //    components — pure-total fires, e.g. co i24 = 14/2);
    //  - enc_screen_total: the full-run screen ceiling (48) checked on
    //    its own — no shipped frame reads total > 48 with comp <= 8
    //    (measured scan of every 3rd shipped frame), so the arm rides
    //    the line-body rows' totals: raising the window past 1114
    //    breaks it.
    const compOver = Math.max(0,
      (f.enc_gclip_maxcomp ?? f.enc_gclip_px ?? 0)
      - WINDOWS.enc_dline_comp_max);
    if (compOver > WINDOWS.enc_dline_clip_px_max) {
      fired5.enc_dline.push([f.orbit, f.i]);
    } else if ((f.enc_gclip_px ?? 0) > WINDOWS.enc_dline_total_max) {
      fired5.enc_dline_total.push([f.orbit, f.i]);
    }
    if ((f.enc_gclip_px ?? 0) > WINDOWS.enc_dline_screen_total_max) {
      fired5.enc_screen_total.push([f.orbit, f.i]);
    }
  }
  // the armed R-clip law is the churn-quad SUM ceiling — replay the
  // shipped quad (co i96-99: 435+334+387+351 = 1507 px > 1250; the
  // cured full-context family sums 1056-1087)
  if ((basis5.churn?.counts ?? []).reduce((a2, c2) => a2 + c2, 0)
    > WINDOWS.enc_rclip_px_max) {
    fired5.enc_rclip.push(['corner', 96]);
  }
  // 489 PASS-4 CLOSURE: the SPLIT law's full-track half replays the
  // defect basis' own full-track sliding-quad maximum (measured on the
  // shipped r3 bytes, fixture churn_fulltrack: 1557 @ track i94-97) —
  // raising enc_rclip_fulltrack_max past the defect breaks this arm.
  // The comp qualifier does NOT arm on this basis (defect components
  // <= 30 px, BELOW the 96 cap by design — it guards forward; fixture
  // note).
  if ((basis5.churn_fulltrack?.quad_sum ?? 0)
    > WINDOWS.enc_rclip_fulltrack_max) {
    fired5.enc_rclip_fulltrack.push(
      ['corner', basis5.churn_fulltrack.track_i0]);
  }
  // review r9 P2: EXACT frame matching — the fixture's ft i0 and i1 are
  // distinct laws (i1 is the unsampled-frame case the screen row owns);
  // a +-2 tolerance would let i0 satisfy both.
  check(fired5, basis5.expected, 'pass3-encode', 0);
  // ---- arm 6: RULING R-S8-4 (R3-SNK-9) encoder-bloom exclusion. The
  // classifier runs on SYNTHETIC decoded planes (painted from the
  // measured seal colours + a real libx264 crf14 medium yuv420p round
  // trip): a drawn line / zero-headroom marking / blown white must
  // still count (enc_dline fires) and only the lit-glint rim is
  // excluded. Chrome-free; the LIVE windows are passed so the arm
  // exercises the constants the gate runs with.
  try {
    execFileSync('python3', [JUDGE_PY, '--selftest-bloom', JSON.stringify({
      enc_bloom: WINDOWS.enc_bloom,
      enc_dline_comp_max: WINDOWS.enc_dline_comp_max,
      enc_dline_total_max: WINDOWS.enc_dline_total_max,
    })], { stdio: ['ignore', 'inherit', 'inherit'] });
    console.log('[red-arm:bloom] OK');
  } catch (err) {
    console.error(`[red-arm:bloom] FAIL (judge exit ${err && err.status})`);
    ok = false;
  }
  // ---- arm 7: RULING V8-C1 (R3-SNK-9) geometric fall-disc scoping.
  // Chrome-free: three.js + web/scene/table.js are imported in node,
  // the sweep's corner camera is built from GEO at the sealed item's
  // bearing (9c0437a3 corner f064 = i64 of the 75-bearing grid, az
  // −90 + 4.8·64 = 217.2°) and the model's own pocketFallDiscs() are
  // projected with the SAME projectFallPolys the capture runs in the
  // page. The judge (--selftest-disc) must reproduce that polygon with
  // its pinhole to the recorded 0.01 px quantum, rasterise a mask
  // within frac_max that holds the sealed item's pixels, keep firing
  // on a drawn G=255 line on cloth OUTSIDE the disc, and exclude the
  // same line INSIDE it (enc_fallmask_px, no fire).
  try {
    const T = await import('three');
    const tb = await import(pathToFileURL(
      path.join(webDir, 'scene', 'table.js')).href);
    const discs = tb.pocketFallDiscs?.('wpbsa_snooker_12ft');
    if (!discs || !discs.length) throw new Error('pocketFallDiscs missing');
    const spec = GEO.corner;
    const iSeal = 64; // sealed 9c0437a3 corner f064 (the R-S8-4 item)
    const az = -Math.PI / 2 + (2 * Math.PI * iSeal) / 75;
    // camerascript applyPose law: kernel [kx, ky, h] -> three (ky, h,
    // kx) (coords.kPosToThree), lookAt with the default up (0, 1, 0);
    // PerspectiveCamera(fov, W/H) — the 1600×1000 device metrics
    const k2t = (k) => new T.Vector3(k[1], k[2], k[0]);
    const cam = new T.PerspectiveCamera(spec.fov, W / H, 0.01, 50);
    cam.position.copy(k2t([spec.center[0] + spec.r * Math.cos(az),
      spec.center[1] + spec.r * Math.sin(az), spec.h]));
    cam.lookAt(k2t(spec.center));
    cam.updateMatrixWorld(true);
    const fm = WINDOWS.enc_fallmask;
    const polys = projectFallPolys(T, cam, discs, W, H, fm.n_vertices,
      fm.plane_y, fm.px_decimals);
    execFileSync('python3', [JUDGE_PY, '--selftest-disc', JSON.stringify({
      w: W, h: H, enc_fallmask: fm,
      enc_dline_comp_max: WINDOWS.enc_dline_comp_max,
      enc_dline_total_max: WINDOWS.enc_dline_total_max,
      cam: { eye: cam.position.toArray(), look: k2t(spec.center).toArray(),
        up: [0, 1, 0], fov: spec.fov, aspect: W / H, near: cam.near },
      discs: discs.map((f) => ({ x: f.x, z: f.z, r: f.r })),
      polys_three: polys, orbit: 'corner', i: iSeal,
      az_deg: Math.round((az * 180) / Math.PI * 10) / 10,
      // the sealed item's pixels (9c0437a3 corner f064: the 11 px
      // component x792–802 y490 and the pair x828–829 y488) — the
      // ruling's mask must hold them
      seal_item_px: [[792, 490], [802, 490], [828, 488], [829, 488]],
    })], { stdio: ['ignore', 'inherit', 'inherit'] });
    console.log('[red-arm:disc] OK');
  } catch (err) {
    console.error(`[red-arm:disc] FAIL (${err && (err.status ?? err.message)})`);
    ok = false;
  }
  if (!ok) {
    console.error('[red-arm] a pinned red basis no longer fires — judge/'
      + 'threshold regression');
    process.exit(4);
  }
  console.log('[red-arm] OK — both rounds\' failure classes fire at their '
    + 'bearings');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// capture session (finale-orbit.mjs laws verbatim)
// ---------------------------------------------------------------------------
const cdp = await import(pathToFileURL(path.join(webDir, 'tools/cdp.mjs')).href);
const { launchChrome, sleep, spawnStaticServer, stopStaticServer } = cdp;

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
      && Math.abs(o.position.y) < 0.2 && Math.abs(o.position.x) < 2.2
      && Math.abs(o.position.z) < 1.2) {
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
    leg: [1, 1, 1], net: [1, 0.35, 0], other: [0.35, 0.35, 0.35] };
  window.__maskSaved = [];
  const bootNames = new Set(['obPocketCap', 'obPocketValance', 'obPocketEmboss']);
  T.traverse((o) => {
    if (!o.isMesh || !o.material || o.visible === false) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const src = mats[0];
    let cls = 'other';
    if (bootNames.has(o.name)) cls = 'boot';
    // 489 IDENTITY round: the turned gold legs get their own mask class
    // (white — all channels high survives the postfx channel-mixing; no
    // other class is neutral-bright) so the leg identity windows judge
    // LEG pixels, not the whole shared-material gold family.
    else if (o.name === 'obSnkLeg') cls = 'leg';
    else if (o.name === 'obPocketFallWall') cls = 'fallwall';
    // 489 BLOCKER-CURE round: the knitted sock gets its own class
    // (orange — R-dominant with a mid G that no other class carries
    // after the knit map modulates it) so the throat and net-presence
    // rows judge SOCK pixels, closing the B8 gate escape. review
    // blocker-r5 P2: the ring iron stays OUT of the class (it rides
    // 'other') — a surviving brass ring must never satisfy the sock
    // presence floor when the sock itself is missing; its rare glints
    // stay bounded by the blown_frame_frac guard.
    else if (o.name === 'obPocketNet') cls = 'net';
    // 489 PASS-2: the hem skirt is BOOT-family dressing in the mask —
    // net class would pollute the throat census at grazing bearings
    // (the projected mouth disc sweeps across the skirt) and the ring
    // law (sock-presence must never be satisfied by dressing alone)
    else if (o.name === 'obPocketNetSkirt') cls = 'boot';
    else if (src.userData && src.userData.obClass) cls = src.userData.obClass;
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

const waitFrame = (chrome) => chrome.eval(
  'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');

// RULING V8-C1 (R3-SNK-9): the render FALL DISC -> frame-pixel polygon
// projection. ONE function, run in TWO places from its own source text:
//   · in the PAGE (FALL_POLY_EVAL below) with the live capture camera
//     (window.__dbg.camera — the camera that rendered the frame) and
//     table.js pocketFallDiscs() of the active table;
//   · in NODE by --red-arm with three.js + table.js imported directly
//     (no browser), building the sweep's camera from GEO at a bearing,
//     to prove the judge's pinhole reproduces three's projection.
// Each disc rim is sampled as an N-gon in world space (y = planeY, the
// bed), transformed into CAMERA space, clipped against the near plane
// (Sutherland–Hodgman on z <= -near, BEFORE the perspective divide — a
// vertex behind the eye has no projection), then projected with the
// camera's own projectionMatrix (Vector3.applyMatrix4 performs the
// divide; this is exactly Vector3.project(cam)). Discs whose polygon
// bounding box misses the viewport are dropped (no pixel to mask).
// Pixel map: sx = (ndc.x + 1)/2·W, sy = (1 − ndc.y)/2·H (the void
// census' falls law), rounded to pxDecimals.
function projectFallPolys(T, cam, discs, W, H, N, planeY, pxDecimals) {
  cam.updateMatrixWorld(true);
  const near = -cam.near;
  const q = 10 ** pxDecimals;
  const polys = [];
  for (const f of discs) {
    const rim = [];
    for (let k = 0; k < N; k++) {
      const a = (2 * Math.PI * k) / N;
      rim.push(new T.Vector3(f.x + f.r * Math.cos(a), planeY,
        f.z + f.r * Math.sin(a)).applyMatrix4(cam.matrixWorldInverse));
    }
    const clipped = [];
    for (let k = 0; k < rim.length; k++) {
      const p = rim[k], p2 = rim[(k + 1) % rim.length];
      const pin = p.z <= near, qin = p2.z <= near;
      if (pin) clipped.push(p);
      if (pin !== qin) {
        clipped.push(p.clone().lerp(p2, (near - p.z) / (p2.z - p.z)));
      }
    }
    if (clipped.length < 3) continue;
    const poly = clipped.map((p) => {
      const v = p.clone().applyMatrix4(cam.projectionMatrix);
      return [Math.round((v.x + 1) / 2 * W * q) / q,
        Math.round((1 - v.y) / 2 * H * q) / q];
    });
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    if (Math.max(...xs) < 0 || Math.min(...xs) > W
      || Math.max(...ys) < 0 || Math.min(...ys) > H) continue;
    polys.push(poly);
  }
  return polys;
}
// page-side evaluation (capture loop, EVERY video frame): returns the
// polygons, the discs and the camera record (eye, fov, aspect, near and
// the 16-element column-major projection×view matrix) as JSON, or
// {error} when the model lacks pocketFallDiscs (a stale table.js cannot
// produce a V8-C1 capture — the caller throws, never writes a capture
// the judge would fail frame by frame).
const FALL_POLY_EVAL = `(async () => {
  const T = await import('three');
  const tb = await import('./scene/table.js');
  const discs = tb.pocketFallDiscs?.(tb.activeTableId?.());
  if (!discs || !discs.length) {
    return JSON.stringify({ error: 'pocketFallDiscs_missing' });
  }
  const cam = window.__dbg.camera;
  const projectFallPolys = ${projectFallPolys.toString()};
  const fm = ${JSON.stringify(WINDOWS.enc_fallmask)};
  const polys = projectFallPolys(T, cam, discs, ${W}, ${H}, fm.n_vertices,
    fm.plane_y, fm.px_decimals);
  return JSON.stringify({ polys,
    discs: discs.map((f) => ({ x: f.x, z: f.z, r: f.r, kernel: !!f.kernel })),
    cam: { eye: cam.position.toArray(), fov: cam.fov, aspect: cam.aspect,
      near: cam.near, pv_col_major: new T.Matrix4().multiplyMatrices(
        cam.projectionMatrix, cam.matrixWorldInverse).elements.slice() } });
})()`;

async function settle489(chrome) {
  await sleep(1500);
  const g = await chrome.eval("__settings.changeGame('snooker', { skipConfirm: true })");
  if (g !== true) throw new Error(`game switch failed: ${g}`);
  await sleep(2500);
  const active = await chrome.eval("import('./scene/table.js').then((t) => t.activeTableId())");
  if (active !== 'wpbsa_snooker_12ft') {
    const sw = await chrome.eval("__settings.changeEquipment('table_id',"
      + " 'wpbsa_snooker_12ft', { skipConfirm: true })");
    if (sw !== true) throw new Error(`table switch failed: ${sw}`);
    await sleep(1200);
  }
  // review orbit-cure r3 P2 + r4 P2: gi.ready/baked can still describe
  // the scripted pool boot while snooker assets load — require the
  // snooker bake class + the venue rig (the 490 settle law) before frame
  // zero, and THROW on timeout (a fall-through would capture the wrong
  // bake/rig and hand the judges a misleading verdict either way).
  let settled = false;
  for (let i = 0; i < 150 && !settled; i++) {
    const st = await chrome.eval(`(() => {
      const s = window.__gi && window.__gi.state;
      const rig = window.__lighting && window.__lighting.state
        && window.__lighting.state().fixture;
      return s ? JSON.stringify({ r: s.ready, b: s.baked, c: s.bakeClass,
        rig }) : null;
    })()`).catch(() => null);
    if (st) {
      const v = JSON.parse(st);
      settled = v.r && v.b && v.c === 'snooker_12ft'
        && v.rig === 'snooker_luminaire';
    }
    if (!settled) await sleep(300);
  }
  if (!settled) throw new Error('489 GI/rig never settled (snooker_12ft + '
    + 'snooker_luminaire required)');
  await sleep(1200);
}

async function capture() {
  let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
  let CDPP = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : null;
  let band = null;
  if (!PORT || !CDPP) {
    band = await cdp.claimPortBand(16700, 16729); // GH-687: the bandless DEFAULT claim lies in undeclared space (main's parking after 9530-9559 straddled the diamond band); the lane band 9550-9579 arrives as env pins from run-gate --band (SNK-R30)
    PORT = band.http(0); CDPP = band.cdp(0);
  }
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  // GH-489 SNK-R35 (review r9 P2 A): the served-tree identity is judged against the tree this run MEANS to serve (--web), never this checkout — one reader, cdp.mjs preflightServedTree
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?cinema=1&seed=7&look=default`,
    { port: CDPP, width: W, height: H, preflightWebDir: webDir });
  try {
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    let ready = false;
    for (let i = 0; i < 220 && !ready; i++) {
      await sleep(200);
      ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
    }
    if (!ready) throw new Error('app never ready');
    await settle489(chrome);
    await sleep(1200);
    await chrome.eval(HIDE_OVERLAYS);
    await chrome.eval(HIDE_BALLS);
    // publish a MeshBasicMaterial constructor for the mask swap (some
    // sources are Physical/Standard — the swap must not depend on the
    // source type exposing a Basic constructor)
    await chrome.eval(`import('three').then((T) => {
      window.__maskBasicCtor = T.MeshBasicMaterial; return true; })`);
    await chrome.eval(`(() => {
      window.__lighting?.apply?.('auto', ${GEO.orbitPreset.brightness});
      __dbg.renderer.toneMappingExposure *= ${GEO.orbitPreset.exposure_mul};
      return true;
    })()`);
    await sleep(900);
    // review orbit-cure r2 P2: the boot shading rides asynchronously
    // drained aOccl attributes — flush every pending occlusion bake
    // before frame zero (the offline-render.js law) so early bearings
    // can never render the (0,0) fallback on a cold machine.
    await chrome.eval('(window.__snkOccl?.flush?.(), true)');
    await sleep(300);

    __removeManifest(OUT, 'orbitsweep-489'); // FIX7 (Fable pass 3): the capture session's first write — a crash from here leaves no manifest, judge-only refuses by name
    for (const orbitName of ORBITS) {
      const spec = GEO[orbitName];
      if (!spec) throw new Error(`unknown orbit ${orbitName}`);
      const dir = path.join(OUT, orbitName);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const meta = { orbit: orbitName, frames: FRAMES, w: W, h: H,
        windows: WINDOWS, poses: [],
        // RULING V8-C1: per-video-frame fall-disc polygons + camera
        // records (filled in the run loop below)
        run_fall_polys: [], run_cams: [] };
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
      // 489 PASS-3 review r5 (both P1s, endgame): the sweep captures the
      // ENTIRE shipped orbit at true video cadence (600 ft / 450 co
      // frames) and the encode pass encodes it as ONE continuous run
      // with the shipped settings — the decoded frame at a judged
      // bearing carries the deliverable's own GOP structure, reference
      // chains, rate-control state and lookahead (no sampled-context
      // approximation left). Judged bearings sit ON video frames
      // (vStep = run/FRAMES, integer by the --frames guard); the mask
      // pass runs at the judged bearings only.
      const runLen = orbitName === 'corner' ? 450 : 600;
      const vStep = runLen / FRAMES;
      const runDir = path.join(dir, 'run');
      fs.mkdirSync(runDir, { recursive: true });
      for (let v = 0; v < runLen; v++) {
        const az = -Math.PI / 2 + (2 * Math.PI * v) / runLen;
        const pose = { cam: [spec.center[0] + spec.r * Math.cos(az),
          spec.center[1] + spec.r * Math.sin(az), spec.h],
        look: spec.center, fov: spec.fov };
        await chrome.eval(`__test.cameraPose(${JSON.stringify(pose)})`);
        await chrome.eval(PER_FRAME_HIDE);
        await waitFrame(chrome);
        await waitFrame(chrome);
        await chrome.screenshot(
          path.join(runDir, `v${String(v).padStart(4, '0')}.png`));
        // RULING V8-C1: the render fall-disc polygons of THIS video
        // frame, projected in the page with the camera that rendered
        // it (projectFallPolys — the same source text --red-arm runs in
        // node). Every video frame carries them: the screen pass judges
        // every decoded frame and the near disc moves ~120 px per
        // 75-grid step, so a nearest-bearing polygon would be wrong.
        const fp = JSON.parse(await chrome.eval(FALL_POLY_EVAL));
        if (fp.error) {
          throw new Error(`[${orbitName}] v${v}: ${fp.error} — table.js `
            + 'without pocketFallDiscs() cannot produce a V8-C1 capture');
        }
        if (v === 0) {
          meta.fall_discs = fp.discs;
          meta.fall_poly_law = { ...WINDOWS.enc_fallmask,
            source: 'page: projectFallPolys(window.__dbg.camera, '
              + 'pocketFallDiscs(activeTableId()))' };
        } else if (JSON.stringify(fp.discs)
          !== JSON.stringify(meta.fall_discs)) {
          throw new Error(`[${orbitName}] v${v}: fall discs changed mid-run`);
        }
        meta.run_fall_polys.push(fp.polys);
        meta.run_cams.push(fp.cam);
        if (v % vStep !== 0) {
          if ((v + 1) % 60 === 0) {
            console.log(`[${orbitName}] run ${v + 1}/${runLen} `
              + `(${((Date.now() - t0) / (v + 1) / 1000).toFixed(2)} s/f)`);
          }
          continue;
        }
        const i = v / vStep;
        fs.linkSync(path.join(runDir, `v${String(v).padStart(4, '0')}.png`),
          path.join(dir, `f${String(i).padStart(3, '0')}.png`));
        // pocket-fall screen projections (void-census mouth exclusion)
        const falls = await chrome.eval(`(async () => {
          const T = await import('three');
          const tb = await import('./scene/table.js');
          // SNK-R34: the RENDER FALL discs by name (pocketVisualFalls is the drop animation's aperture — the same discs on this table; the plate datum is pocketPlateDatums)
          const falls = tb.pocketFallDiscs?.(tb.activeTableId?.()) ?? tb.pocketVisualFalls?.(tb.activeTableId?.()) ?? [];
          const cam = window.__dbg.camera;
          cam.updateMatrixWorld(true);
          const out = [];
          for (const f of falls) {
            const p = new T.Vector3(f.x ?? f.cx ?? 0, 0.0, f.z ?? f.cz ?? 0);
            const v = p.clone().project(cam);
            if (v.z > 1 || v.z < -1) continue;
            const sx = (v.x + 1) / 2 * ${W}, sy = (1 - v.y) / 2 * ${H};
            // review orbit-cure r4 P2: a single world-X offset collapses
            // to ~0 px at bearings looking along X — project BOTH table
            // axes and take the larger screen radius
            let rpx = 0;
            for (const ax of ['x', 'z']) {
              const q = p.clone(); q[ax] += (f.r ?? 0.05) * 1.8;
              const vq = q.project(cam);
              rpx = Math.max(rpx, Math.hypot(((vq.x + 1) / 2 * ${W}) - sx,
                ((1 - vq.y) / 2 * ${H}) - sy));
            }
            out.push([Math.round(sx), Math.round(sy), Math.round(rpx)]);
          }
          return JSON.stringify(out);
        })()`);
        // mask pass
        const n = await chrome.eval(MASK_SWAP);
        if (!n) throw new Error('mask swap touched nothing');
        await chrome.eval(PER_FRAME_HIDE);
        await waitFrame(chrome);
        await waitFrame(chrome);
        await chrome.screenshot(path.join(dir, `m${String(i).padStart(3, '0')}.png`));
        await chrome.eval(MASK_RESTORE);
        meta.poses.push({ i, az_deg: Math.round((az * 180) / Math.PI * 10) / 10,
          falls: JSON.parse(falls),
          fall_polys: fp.polys }); // RULING V8-C1 (= run_fall_polys[v])
      }
      // (the churn quad needs no separate capture: it is the decoded
      // continuous corner run at video frames 96-99 — full shipped
      // reference history and lookahead by construction; encodePass
      // extracts it)
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
      console.log(`[${orbitName}] captured ${FRAMES} bearings -> ${dir}`);
    }
    // FIX7 (Fable pass 3): persist THIS run's orbit list (review r11 P2 on 490, ported) — the capture's completion record
    __writeManifest(OUT, { tool: 'tools/render/orbitsweep-489.mjs', mode: MODE, orbits: ORBITS, frames: FRAMES,
      when: new Date().toISOString() });
  } finally {
    const gone = await chrome.closeAndWait();
    if (gone === false) throw new Error('chrome teardown unconfirmed');
    await stopStaticServer(server);
    if (band) band.release();
  }
}

// 489 PASS-3 SHIPPED-ENCODE pass: round-trip the capture through the
// exact shipped encoder settings (encode.sh verbatim: h264 crf 14 medium,
// yuv420p) and decode back to frames — the judge censuses THE DECODED
// BYTES (the plane the pass-2 wording was falsified on). Runs inside the
// gate on every judge; a missing ffmpeg fails loud (a gate that silently
// skips its encode plane is the pass-2 gap again).
function encodePass(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (/^e(c)?\d+\.png$/.test(f)) fs.rmSync(path.join(dir, f));
  }
  // 489 PASS-3 review r5 (both P1s): ONE continuous encode of the full
  // true-cadence run (600/450 frames) with the shipped settings — the
  // decoded judged frames carry the deliverable's own GOP structure,
  // reference chains, rate-control state and lookahead. (History of the
  // sampled-context attempts this supersedes, kept for the record:
  // identical triples killed the 5-deg stepping ringing but erased
  // shipped motion; p/f/q trios restored motion but shared lookahead
  // across bearings; per-trio processes isolated them but left the
  // judged frame an early-GOP P with fresh rate control. The continuous
  // run ends the class.)
  const frames = fs.readdirSync(dir).filter((f) => /^f\d{3}\.png$/.test(f))
    .sort();
  const runDir = path.join(dir, 'run');
  const runFrames = fs.existsSync(runDir)
    ? fs.readdirSync(runDir).filter((f) => /^v\d{4}\.png$/.test(f)).sort()
    : [];
  if (!runFrames.length) {
    // fail loud — a capture without the continuous run cannot measure
    // the shipped-encode plane (the pass-2 plane-gap lesson); the
    // per-frame enc_dline_missing verdicts will fail every bearing.
    console.error(`[encode-pass] ${dir}: NO continuous run captured — `
      + 'shipped-encode rows will fail loud');
    return;
  }
  // review r8 P2: a TRUNCATED run must never silently re-index — the
  // shipped run lengths are fixed (600 fulltable / 450 corner) and the
  // sequence must be contiguous, or half an orbit could go unscreened.
  const meta2 = JSON.parse(
    fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const wantRun = meta2.orbit === 'corner' ? 450 : 600;
  if (runFrames.length !== wantRun
    || runFrames.some((f, v) => f !== `v${String(v).padStart(4, '0')}.png`)) {
    throw new Error(`[encode-pass] ${dir}: continuous run is truncated or `
      + `non-contiguous (${runFrames.length}/${wantRun}) — refusing to `
      + 'encode a partial shipped plane');
  }
  const vStep = runFrames.length / frames.length;
  // review r6 P1: the shipped mp4 opens on a 60-frame STATIC TITLE CARD
  // before the orbit (encode.sh law) — the long static prefix plus the
  // card->orbit scenecut is real encoder context for the early orbit
  // frames. The gate prepends 60 dups of a synthetic dark card-class
  // frame (the shipped cards are dark-background title plates; the
  // context class — static prefix, then scenecut — is what shapes the
  // GOP/rate state, not the card's exact pixels) and decodes with a
  // 60-frame offset.
  const seqDir = path.join(dir, 'encseq');
  fs.rmSync(seqDir, { recursive: true, force: true });
  fs.mkdirSync(seqDir);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=0x141418:s=${W}x${H}:d=1:r=30`,
    '-frames:v', '1', path.join(seqDir, 'card.png')]);
  for (let k = 0; k < 60; k++) {
    fs.linkSync(path.join(seqDir, 'card.png'),
      path.join(seqDir, `t${String(k).padStart(4, '0')}.png`));
  }
  runFrames.forEach((f, v) => {
    fs.linkSync(path.join(runDir, f),
      path.join(seqDir, `t${String(60 + v).padStart(4, '0')}.png`));
  });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30',
    '-i', path.join(seqDir, 't%04d.png'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14',
    '-movflags', '+faststart', path.join(dir, 'enc.mp4')]);
  // review r6 P1: decode EVERY orbit frame and KEEP them — the judge's
  // screen row censuses the in-between frames too (a regression confined
  // to an unsampled bearing must not escape; the shipped red basis'
  // worst frame ft i1 is exactly such a frame on the 75-grid)
  const dec = path.join(dir, 'encall');
  fs.rmSync(dec, { recursive: true, force: true });
  fs.mkdirSync(dec);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-i', path.join(dir, 'enc.mp4'), '-start_number', '0',
    path.join(dec, 'd%04d.png')]);
  for (let k = 0; k < 60; k++) {
    fs.rmSync(path.join(dec, `d${String(k).padStart(4, '0')}.png`),
      { force: true });
  }
  frames.forEach((f, i) => {
    fs.copyFileSync(
      path.join(dec, `d${String(60 + i * vStep).padStart(4, '0')}.png`),
      path.join(dir, `e${String(i).padStart(3, '0')}.png`));
  });
  // churn quad (corner): the decoded run frames at the shipped R-clip
  // peak bearing (video i96-99) — full midstream context by construction
  const nC = runFrames.length === 450 ? 4 : 0;
  for (let k = 0; k < nC; k++) {
    fs.copyFileSync(
      path.join(dec, `d${String(60 + 96 + k).padStart(4, '0')}.png`),
      path.join(dir, `ec${String(k).padStart(2, '0')}.png`));
  }
  fs.rmSync(seqDir, { recursive: true, force: true });
  console.log(`[encode-pass] ${dir}: ${nC ? 'orbit + churn quad' : 'orbit'} `
    + 'round-tripped through the shipped encoder (crf14 medium yuv420p)');
}

function judge() {
  // review orbit-cure r6 P3: a partial capture (--sweep --orbits corner)
  // must stay re-judgeable — without an explicit --orbits, judge-only
  // discovers the orbit dirs the capture actually wrote.
  // FIX7 (Fable pass 3): the 490 manifest law ported — a default --judge-only judges the LAST capture's manifest orbits and
  // is fail-closed (no manifest beside captured dirs / unreadable / half-captured → refused by name); the existence
  // discovery that could aggregate an older orbit dir with a partial re-capture is gone (lib/orbit-manifest.mjs)
  const orbitList = __resolveJudgeOrbits({ OUT, ORBITS, mode: MODE, args, tag: 'orbitsweep-489', known: KNOWN_ORBITS, explicit: __ORBITS_ARG !== null }); // one reader: the validated load-time selection (space or = form)
  let red = false;
  const all = { windows: WINDOWS, orbits: {}, provenance: null };
  for (const orbitName of orbitList) {
    const dir = path.join(OUT, orbitName);
    const rep = path.join(dir, 'report.json');
    // judge under the DRIVER's current windows, not the capture-time copy
    // (a --judge-only rerun after a window change must re-verdict)
    const metaPath = path.join(dir, 'meta.json');
    const meta = __readOrbitMeta(metaPath, 'orbitsweep-489'); // Fable pass 4: a corrupt meta.json is refused by name
    // RULING R-C1 (snooker lane): apron_min_px is per orbit in WINDOWS; the judge reads a scalar (win.get('apron_min_px')), so the
    // orbit's floor is resolved here — the per-orbit report records the resolved value (a scalar WINDOWS passes through unchanged)
    meta.windows = (WINDOWS.apron_min_px && typeof WINDOWS.apron_min_px === 'object')
      ? { ...WINDOWS, apron_min_px: WINDOWS.apron_min_px[orbitName] } : WINDOWS;
    meta.mode = MODE; meta.tool = 'tools/render/orbitsweep-489.mjs'; // FIX7 (Fable pass 2): the per-orbit judge stamps its report.json from these
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    encodePass(dir); // 489 PASS-3: shipped-encode plane, judged below
    try {
      execFileSync('python3', [JUDGE_PY, dir], { stdio: ['ignore', 'inherit', 'inherit'] });
    } catch {
      red = true; // judge exits 3 on failing frames — report still written
    }
    __requireOrbitReport(rep, orbitName, 'orbitsweep-489'); // FIX7 (Fable pass 3): no report = refused by name, not an ENOENT crash
    const r = JSON.parse(fs.readFileSync(rep, 'utf8'));
    all.orbits[orbitName] = r;
    if (r.fail_frames.length || (r.aggregate_fails || []).length) red = true;
    console.log(`[judge] ${orbitName}: ${r.fail_frames.length}/${r.frames.length}`
      + ` failing frames ${r.fail_frames.length ? JSON.stringify(r.fail_frames) : ''}`);
  }
  all.provenance = {
    tree_head: (() => {
      try {
        return execFileSync('git', ['-C', webDir, 'rev-parse', 'HEAD'],
          { encoding: 'utf8' }).trim();
      } catch { return 'unavailable'; }
    })(),
    when: new Date().toISOString(),
    frames: FRAMES,
  };
  all.mode = MODE; all.tool = 'tools/render/orbitsweep-489.mjs'; // FIX7: the RED/GREEN report names its tool + mode (so do the per-orbit report.json via meta.json and the encoded bars)
  fs.writeFileSync(path.join(OUT, 'orbitsweep-489-report.json'),
    JSON.stringify(all, null, 2));
  console.log(`[orbitsweep-489] ${red ? 'RED' : 'GREEN'} -> `
    + path.join(OUT, 'orbitsweep-489-report.json'));
  process.exit(red ? 3 : 0);
}

if (MODE === 'sweep') await capture();
judge();
