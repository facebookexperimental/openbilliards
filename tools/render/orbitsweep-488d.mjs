// Copyright (c) Meta Platforms, Inc. and affiliates.

// orbitsweep-488d.mjs — GH-488D wave A5: the SEALED ORBIT-VIDEO instrument
// for the Diamond Pro-Am 9 ft lane.
//
// A2 (orbit-488d.mjs) rendered clips to be WATCHED and deliberately carried
// no bars. A5 ships the pack the owner actually reviews, so the clips have to
// be gated on the plane they are delivered on: the h264 bytes, not the render
// buffer. This is the per-table fork the plan's instrument map calls for
// (`orbitsweep` forks per table). Reused VERBATIM, never forked:
// orbitsweep-judge.py (its pass-4 encoded bars), the encode.sh chain, and the
// boot ceremony shared with capture-488d-registers.mjs / orbit-488d.mjs.
//
// PACK (encode.sh frame map, orbitsweep-489.mjs:318-320 verbatim):
//   orbits = 60 card + track + 30 hold
//     488d-proam9-fulltable-orbit.mp4   690 frames (600 track)
//     488d-proam9-corner-orbit.mp4      540 frames (450 track)
//   pocketing = 60 card + rt + 30 hold + 45 card + slow + 30 hold
//     488d-proam9-pocketing-30fps.mp4   authored from the measured shot
// The pocketing clip is PRODUCED here. 489 only censused a clip built
// out-of-repo; a lane that cannot rebuild its own deliverable from the tree
// cannot claim the deliverable is a function of the commit, so the shot, the
// camera and the frame map all live in this file.
//
// MODES — exactly one (orbitsweep-489.mjs:453-464: a priority chain once let
// `--red-arm --encoded` exit green without opening a single mp4):
//   --probe                framing/shot rehearsal; renders named poses only
//   --sweep                capture + cards + shipped encode + manifest
//   --sig      --pack DIR  measure the Diamond card/anchor signature and the
//                          window block off the SEALED bytes, then pin them
//   --encoded  --pack DIR  run orbitsweep-judge.py's encoded bars (verbatim,
//                          sha-checked) plus this lane's restatement bars
//   --red-arm  --pack DIR  corrupt the sealed pack 18 ways; each corruption
//                          must fire its target bar AND leave the bars it is
//                          designed to slip past green (expect + forbid)
// Stale-report invalidation runs BEFORE the mode guard: no refusal may ever
// leave a previous GREEN verdict on disk.
//
// EXIT: 0 green · 2 refusal / invalid invocation / invalid evidence ·
//       3 written RED verdict · 4 red-arm regression (a bar stopped firing).
//
// THE CLOTH-FAMILY OBSTRUCTION — read before trusting a green report.
// orbitsweep-judge.py's cloth predicates are hardcoded GREEN
// (`g > r+30 && g > b+30 && g > 60`, judge:1983/2409). The Diamond Pro-Am
// ships Tournament Blue (web/scene/table.js:394), so:
//   · `enc_*_scene_floor` is a FLOOR on green-dominant coverage — a correct
//     blue-cloth frame can never clear it;
//   · `enc_*_dclip_*` censuses clipping WITHIN 6 px OF CLOTH-GREEN — on blue
//     the mask is EMPTY, the census is identically 0, and the bar reports
//     PASS while measuring nothing.
// Both families are DISARMED in the cfg (written as the disarming value, so
// it is visible in the artifact) and RESTATED on the blue axis by
// gh488d/census_488d.py (`d_*_bed_floor`, `d_*_bclip_*`). The restated clip
// census is ANY-channel, not green-only — strictly stronger than the row it
// replaces, the only honest direction to move a disarmed bar. `enc_*_gdom_*`
// and `enc_pk_gclip_*` stay ARMED but change MEANING: on a blue table a
// green-dominant clipped pixel is a chroma-subsampling anomaly, not the 489
// D-line class. All 15 affected bars are listed in SPIKE-REPORT.md § 21 with
// the value each would have read.
//
// THE RECURRENCE OBSTRUCTION. `enc_fulltable_recur_frac` (judge:2163-2173)
// calls a 16x-decimated MAD < 1.0 against any non-adjacent prior body frame a
// revisited bearing, on the stated ground that "a 360 orbit never revisits a
// bearing". A POOL TABLE IS TWO-FOLD ROTATIONALLY SYMMETRIC, so the fulltable
// orbit revisits every bearing exactly once, half a turn later, and the
// picture genuinely is the same picture: 161 of 595 body frames read
// recurrent and ALL 161 match at offset exactly 300 = run/2. The corner
// orbit, whose subject is one pocket, reads 0/445 on the same census with a
// 3.119 floor — same rig, same instrument, so the difference is the subject.
// The bar is DISARMED for the fulltable orbit only (corner keeps it ARMED)
// and restated by `d_*_recur_offband`, which excludes the lawful half-turn
// band derived from the declared pose law. Evidence that the saturated bar
// had to go, from the red-arm: a benign whole-body reversal pushed it to
// 0.2807 against a 0.2806 window (false fire) while a real 102-frame
// period-34 loop reached only 0.2739 (missed). The restatement reads 0.0000
// sealed, 0.0000 reversed, and 0.1378 on that loop.
//
// THE JUDGE FIXTURE SHIM. judge_encoded_489 loads its card/anchor signature
// from `fixtures/encoded-cards-489-signature.json` resolved against its own
// __file__ (judge:1946-1948) — the only path in it that is not cfg-driven.
// Editing the judge would break both the fence and "reuse verbatim", so the
// driver stages <PACK>/judgedir/ holding a SYMLINK to the unmodified repo
// judge plus a fixtures/ dir carrying the DIAMOND signature under the 489
// basename. os.path.abspath() does not resolve symlinks, so the judge reads
// this lane's fixture while executing byte-for-byte verbatim; the manifest
// records judge_path_real + judge_sha256 + fixture_sha256 so the shim can
// never hide a modified judge. Red-arm case `ft_foreign_card` proves the
// staged fixture is genuinely consulted. Ledger row O36 proposes the real
// fix (a per-table `card_sig` cfg key).
//
// Ports: OB_E2E_PORT/OB_E2E_CDP_PORT pin, else the 488d lane band 9900-9929
// (shared with capture-488d-registers.mjs / orbit-488d.mjs; the three never
// run at the same time in this lane).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

// SHARED_DEFAULT_WINDOW (render-488d-registers) — the 488d register window 9900-9929 (claimPortBand): the register capture,
// orbit-488d and orbitsweep-488d run the SAME eight bearings one at a time in
// this lane, never side by side (headers here have said so in prose since the
// 488d spike; this is the machine-checked form).
export const SHARED_DEFAULT_WINDOW = 'render-488d-registers';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const webDir = path.join(REPO, 'web');
const JUDGE_PY = path.join(HERE, 'orbitsweep-judge.py');
const CARD_PY = path.join(HERE, 'gh488d', 'make_card_488d.py');
const CENSUS_PY = path.join(HERE, 'gh488d', 'census_488d.py');
const MUTATE_PY = path.join(HERE, 'gh488d', 'mutate_488d.py');
const LIVE_PY = path.join(HERE, 'gh488d', 'liveness_488d.py');
const FIXTURE_TRACKED = path.join(HERE, 'fixtures',
  'encoded-cards-488d-signature.json');
// the basename judge_encoded_489 hardcodes; the staged copy must use it
const FIXTURE_BASENAME = 'encoded-cards-489-signature.json';

const argv = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2)); // FIX10 (Fable pass 1): the run's view of the argv is the =-expanded view the parse consumed
const argOf = (k, d) => { const i = argv.lastIndexOf(k); return i >= 0 ? argv[i + 1] : d; };
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value
// FIX3 (refuter pass 6): the --out-based verdicts of --cards-only / --verify are resolvable from argv alone, so they are removed
// HERE, ahead of the --pack presence guard below — a blank / trailing --pack must not leave a verdict standing under an explicit --out
// FIX8 (review round 8 on #731 P2 A, Fable pass 1): the mode is the ONE shared resolver's exactly-one over the whole mode set —
// `--cards-only --encoded` (two modes) owns nothing here and removes nothing; the removal goes through invalidateForMode
const { resolveMode: __rm488, invalidateForMode: __ifm488 } = await import('./lib/mode-outputs.mjs');
const __MODE_CHAIN_488 = ['--probe', '--sweep', '--sig', '--encoded', '--red-arm', '--cards-only', '--publish', '--verify'].map((f) => [f, f.slice(2)]);
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'orbitsweep-488d', value: ['--out', '--pack', '--fixture', '--manifest', '--frames', '--dir', '--dest', '--case', '--date', '--brand', '--foot', '--disclosure', '--disclosure-head', '--disclosure-foot', '--abbrev-ref', '--max-min', '--mean-min', '--phi-mrad', '--pk-fov', '--solve'], bool: ['--frame-solve', '--pk-solve', '--probe', '--sweep', '--sig', '--encoded', '--red-arm', '--cards-only', '--publish', '--verify'] });
{ const o = __P.value('--out') ?? ''; // FIX10: from the parsed result (a blank --out was refused by the parse)
  const __m6 = __rm488(__P.args, __MODE_CHAIN_488, { exactlyOne: true });
  if (o && __m6) __ifm488({ OUT: path.resolve(o), mode: __m6, outputs: { 'cards-only': ['cards-only-488d.json'], verify: ['verify-488d.json'] }, tag: '488d' }); }

const W = 1600;   // judge:1513/1525 pin this raster; re-author, never rescale
const H = 1000;
// GH-621: the instrument serves the Pro-Am SIZE VARIANTS. --table picks the
// catalog id; the bed comes from the scene's own TABLE_SPECS and the cabinet
// envelope (EN-01) from that table's canonical geometry twin, so every pose
// below is a function of the table it frames. --web serves another web root
// (the GH-621 scratch-wasm overlay: the COMMITTED canonical wasm is catalog
// v17 and cannot resolve the new ids before the landing ceremony); the
// manifest records the served kernel so a variant pack can never pass as a
// canonical-kernel capture. Default = the 9 ft, byte-identical behaviour.
const TABLE = argOf('--table', 'diamond_proam_9ft');
const SERVE_DIR = path.resolve(argOf('--web', webDir));
const CANON_SPECS = {
  diamond_proam_9ft: 'docs/geometry/diamond-proam-9ft-table-definition.json',
  diamond_proam_8ft: 'docs/geometry/diamond-proam-8ft-table-definition.json',
  diamond_proam_7ft: 'docs/geometry/diamond-proam-7ft-table-definition.json',
};
if (!CANON_SPECS[TABLE]) {
  console.error(`[488d] --table ${TABLE} has no canonical geometry twin `
    + `(known: ${Object.keys(CANON_SPECS).join(', ')})`);
  process.exit(2);
}
const IS_VARIANT = TABLE !== 'diamond_proam_9ft';
const SIZE_TAG = { diamond_proam_9ft: '9', diamond_proam_8ft: '8', diamond_proam_7ft: '7' }[TABLE];
const { TABLE_SPECS: SCENE_SPECS } = await import(
  pathToFileURL(path.join(webDir, 'scene', 'table.js')).href);
const BED = SCENE_SPECS[TABLE]?.kernel;
if (!BED) { console.error(`[488d] ${TABLE} is not a TABLE_SPECS entry`); process.exit(2); }
const TWIN = JSON.parse(fs.readFileSync(path.join(REPO, CANON_SPECS[TABLE]), 'utf8'));
const TWIN_SHA = createHash('sha256')
  .update(fs.readFileSync(path.join(REPO, CANON_SPECS[TABLE]))).digest('hex');
const EN01 = TWIN.features.find((f) => f.id === 'EN-01').value_mm; // [L, W] mm
const kernelVersionOf = (dir) => {
  try {
    const m = fs.readFileSync(path.join(dir, 'dist/pool-wasm/pool_wasm_bg.wasm'))
      .toString('latin1').match(/[0-9]+\.[0-9]+\.[0-9]+\+[0-9a-f]+(-dirty)?/);
    return m ? m[0] : 'unreadable';
  } catch { return 'unreadable'; }
};
const LOOK = 'default';
// `<issue><lane>-<de-branded model slug>-<clip>.mp4`, the 489/490 pack law
// (orbitsweep-489.mjs:486-490 `489-xw101-*`, orbitsweep-490.mjs:253-257
// `490-joy-q8-*`). The slug is the MODEL token with the maker dropped, as
// `xw101` drops "Star" — so `proam9`, not `diamond`. No deliverable filename
// in this lane carries the maker name; the catalog id it was rendered from
// (`diamond_proam_9ft`) rides the title cards and the manifest instead, where
// naming the exact entry is the point.
const PREFIX = IS_VARIANT ? `621-proam${SIZE_TAG}` : '488d-proam9';
// GH-621 (D621-LOOK): the size variants carry their own committed footprint
// bakes (scene.mjs TABLES pool_8ft / pool_7ft); the 9 ft keeps 'pool'.
const RIG_EXPECT = {
  fixture: 'canopy_panel',
  bakeClass: { diamond_proam_8ft: 'pool_8ft', diamond_proam_7ft: 'pool_7ft' }[TABLE]
    || 'pool',
};
const PACK = path.resolve(__pathOpt('--pack', { default: '/tmp/ob-488d-a5/pack', tag: 'orbitsweep-488d' }));
const MANIFEST = path.join(PACK, 'manifest-488d.json');
const CENSUS_JSON = path.join(PACK, 'census-488d.json');
const WINDOWS_JSON = path.join(PACK, 'windows-488d.json');
const BARS_JSON = path.join(PACK, 'encoded-bars-488d.json');
const REDARM_JSON = path.join(PACK, 'red-arm-488d.json');

const MODES = ['--probe', '--sweep', '--sig', '--encoded', '--red-arm',
  '--cards-only', '--publish', '--verify'];
// The packaging modes (--cards-only, --publish, --verify) invalidate NONE of the files they CONSUME — that exemption is a
// safety property, not a convenience: `--verify` is meant to be run by whoever RECEIVES a published pack, and a read-only
// re-measurement that deleted the pack's own gate reports would damage the artifact it was asked to check; `--publish`
// REFUSES without those reports. Since FIX3 (review round 3 on #731 P2 (a)) each of them DOES remove the one verdict it
// itself WRITES, at the destination it writes to (--cards-only: cards-only-488d.json under its --out; --verify:
// verify-488d.json under its --out; --publish writes no verdict and has no entry) — see the table below.
//
// Each mode invalidates exactly the reports its own action can make stale, and
// no more. The blanket "delete both at every start" rule this replaces had a
// defect that made --publish UNREACHABLE: --encoded is the only producer of
// encoded-bars-488d.json and --red-arm the only producer of red-arm-488d.json,
// so whichever ran second destroyed the other's report and the two could never
// coexist — while --publish REQUIRES both. The sealed A5 pack only carries both
// because a copy was moved aside by hand, which is precisely the kind of
// unverifiable hand-assembly this instrument exists to refuse.
//
// The safety property is unchanged: no mode may leave behind a report that its
// own action invalidated. --probe/--sweep re-render the frames and --sig
// re-pins the card fixture, so BOTH prior verdicts become stale by
// construction and both are dropped. --encoded and --red-arm do not touch the
// pack's delivered bytes, so each drops only what it is about to rewrite.
// Cross-binding is not left to file mtimes: both reports record the mp4
// sha256s they were measured against, and --publish refuses unless both agree
// with the manifest.
// FIX3 (review round 3 on #731 P2 (a), refuter passes 4 + 5): each mode removes the verdict IT writes, at the destination IT
// writes to, before any of its own refusals — --cards-only writes under its --out (default PACK/r2), --verify under its --out
// (default PACK), --encoded rewrites the pixel judge's judge-488d.json beside the bars; no mode removes a file it only CONSUMES
// (--publish reads PACK/cards-only-488d.json, judge-488d.json, the bars and the red-arm, and writes no verdict).
const { optPresent: __op488, optValue: __ov488 } = await import('./lib/argv.mjs');
const __out488 = __P.value('--out'); // FIX9 (P2 A): the writer's reader — a present-but-blank --out is refused before any effect (it used to collapse to null = the DEFAULT destination, deleting verify / cards-only there); // AS GIVEN, exactly what pathOpt hands the write path (FIX4 P2 (b)); a blank / valueless --out is the mode's own refusal, the default destination is judged meanwhile
const CARDS_JSON = path.join(__out488 ? path.resolve(__out488) : path.join(PACK, 'r2'), 'cards-only-488d.json');
const VERIFY_JSON = path.join(__out488 ? path.resolve(__out488) : PACK, 'verify-488d.json');
const JUDGE_JSON = path.join(PACK, 'judge-488d.json');
const INVALIDATES = {
  probe: [BARS_JSON, REDARM_JSON],
  sweep: [BARS_JSON, REDARM_JSON],
  sig: [BARS_JSON, REDARM_JSON],
  encoded: [BARS_JSON, JUDGE_JSON],
  'red-arm': [REDARM_JSON],
  'cards-only': [CARDS_JSON],
  verify: [VERIFY_JSON],
};

// FIX8 (review round 8 on #731 P2 A, Fable pass 1): ONE resolver (lib/mode-outputs.mjs, exactly-one over MODES) — a run with zero
// or several mode flags OWNS NOTHING, so nothing is removed and the refusal follows; the FIX3 blanket sweep that removed all five
// verdicts (bars, red-arm, judge, verify, cards-only — under an explicit --out too) ahead of that refusal is gone.
const MODE = __rm488(__P.args, __MODE_CHAIN_488, { exactlyOne: true });
if (!MODE) {
  console.error(`[488d] exactly one mode flag required (got ${MODES.filter((f) => argv.includes(f)).length}):`
    + ` ${MODES.join(' | ')}`);
  process.exit(2);
}

// ---- stale-report invalidation, BEFORE any refusal can be reached --------
// (--publish writes no verdict and has no entry; --cards-only / --verify drop only the verdict they write — see the
// note above INVALIDATES.) The entries are the tool's own resolved destinations (absolute, as given).
__ifm488({ OUT: null, mode: MODE, outputs: INVALIDATES, tag: '488d' });

// ---------------------------------------------------------------------------
// GEOMETRY. cameraPose/cameraScript speak KERNEL coords [kx, ky, kz]: kx
// across the width, ky along the length (+ = foot end), kz up from the bed
// plane. `h` here is ABSOLUTE kernel z — the 489 convention the judge's
// bearing arithmetic (`az = -90 + 360*v/len`, judge:2288) assumes — NOT the
// centre-relative offset orbit-488d.mjs:106 uses.
//
// Spec anchors (docs/geometry/diamond-proam-9ft-table-definition.json):
//   EN-01 outer cabinet 2895.6 x 1625.6 mm   EN-02 rail-top height 812.8 mm
//   EN-03 playing surface 762.0 mm (DERIVED) PF-01 playfield 2540 x 1270 mm
// GH-621: from the scene spec + the table's own twin (9 ft: 0.6858 / 1.3208
// / 0.8128 / 1.4478 — the wave-A5 literals, asserted below so the derivation
// cannot quietly move the sealed 9 ft geometry).
const HALF_W_OUT = BED.width / 2 + BED.cushionWidth;   // cushion-nose corner x
const HALF_L_OUT = BED.length / 2 + BED.cushionWidth;  // cushion-nose corner y
const CAB_HW = EN01[1] / 2000;             // EN-01 half width  [m]
const CAB_HL = EN01[0] / 2000;             // EN-01 half length [m]
if (!IS_VARIANT) {
  for (const [got, want, what] of [
    [HALF_W_OUT, 1.27 / 2 + 0.0508, 'HALF_W_OUT'], [HALF_L_OUT, 2.54 / 2 + 0.0508, 'HALF_L_OUT'],
    [CAB_HW, 1.6256 / 2, 'CAB_HW'], [CAB_HL, 2.8956 / 2, 'CAB_HL']]) {
    if (Math.abs(got - want) > 1e-12) {
      console.error(`[488d] REFUSAL: 9 ft ${what} derived ${got} != sealed ${want}`);
      process.exit(2);
    }
  }
}
const CAB_HDIAG = Math.hypot(CAB_HW, CAB_HL);   // 1.6603 horizontal half-diag
const FLOOR_Z = -0.762;                    // EN-03: the bed sits 762 mm up
const RAIL_TOP_Z = 0.8128 - 0.762;         // 0.0508  EN-02 - EN-03
const CAB_MID_Z = (FLOOR_Z + RAIL_TOP_Z) / 2;   // -0.3556 assembly mid-height
const R4 = (x) => Number(x.toFixed(4));

// The fulltable framing is DERIVED, not copied from 489 (12 ft snooker) or
// 490 (a different 9 ft). three.js `fov` is VERTICAL; at 42 deg on a 1.6
// aspect the horizontal half-angle is atan(tan(21) * 1.6) = 31.56 deg.
//
// The first draft placed the cabinet's PLAN half-diagonal at 78% of that
// horizontal half-angle and looked at the assembly mid-height. A plan
// diagonal bounds the horizontal extent and NOTHING ELSE, and the probe
// frames showed exactly what that misses: the orbit brings the lens 0.64 m
// closer to the near face at the end-on bearings than at side-on, and there
// the cabinet's 813 mm height overflowed the BOTTOM of the frame by 31% —
// the near legs were amputated. On a lane whose disclosure lines include leg
// reveals, levelers and bolt heads, an orbit that cuts the legs off for a
// quarter of its bearings is not a fulltable orbit.
//
// So the framing is SOLVED against the thing that actually has to fit: the
// eight corners of the outer-cabinet box (EN-01 in plan, EN-03 floor up to
// EN-02 rail top). One criterion, no taste:
//
//   fov 42, elevation 25 deg, camera orbits at constant (r, h) looking at
//   [0, 0, FT_LOOK_Z];  (r, FT_LOOK_Z) = argmin r  subject to: at every
//   1 deg bearing all eight corners project inside FT_CAP of the frame
//   half-extent on BOTH axes.
//
// BOTH constraints are active at the optimum, which is what makes it an
// optimum rather than a preference: the box touches the vertical guard at one
// family of bearings and the horizontal guard at another, so no smaller orbit
// contains it. Solved by `--probe --frame-solve` (bisection on r over a 5 mm
// FT_LOOK_Z grid): argmin lookZ -0.705, r 3.28135925.
//
// The PIN is that argmin rounded UP to the next millimetre. The argmin sits
// exactly ON the cap by construction, so pinning it would leave the guard
// deciding on the last float bit — it did, and refused. 3.2830 m is 0.05%
// wider and lands the fill at 0.9163 V / 0.9194 H, unambiguously inside.
// frameFill() re-verifies containment at module load, so a spec edit that
// breaks the framing refuses instead of shipping a cropped orbit.
const FT_FOV = 42;
const FT_ELEV = (25 * Math.PI) / 180;
const FT_CAP = 0.92;                       // 8% guard band on both axes
const FT_HALF_H = Math.atan(Math.tan((FT_FOV / 2) * Math.PI / 180) * (W / H));
const FT_LOOK_Z = -0.705;                  // SOLVED — --probe --frame-solve
// FT_R / FT_H are defined after frameFill below: the 9 ft keeps its PIN
// (3.2830, argmin 3.28136 rounded up 1 mm); a size variant solves the SAME
// criterion at load against its own cabinet box (GH-621).

/** The eight corners of the outer-cabinet box, kernel frame. Conservative:
 * the legs are inset from the skirt in plan, so bounding the full box bounds
 * every part of the assembly. */
const CAB_CORNERS = [];
for (const sx of [-1, 1]) {
  for (const sy of [-1, 1]) {
    for (const z of [FLOOR_Z, RAIL_TOP_Z]) {
      CAB_CORNERS.push([sx * CAB_HW, sy * CAB_HL, z]);
    }
  }
}

/** Worst-case |NDC| of the cabinet box over a full turn, per axis; 1.0 is the
 * frame edge. Pure geometry, built on the same look-at basis three.js uses
 * (world up +kz, `fov` VERTICAL) so the number means what the renderer will
 * do. Returns Infinity if any corner falls behind the lens. */
function frameFill(r, h, fov, lookZ) {
  const tanV = Math.tan((fov / 2) * Math.PI / 180);
  const tanH = tanV * (W / H);
  let fv = 0;
  let fh = 0;
  let azV = 0;
  let azH = 0;
  for (let d = 0; d < 360; d += 1) {
    const az = (d * Math.PI) / 180;
    const cam = [r * Math.cos(az), r * Math.sin(az), h];
    let f = [-cam[0], -cam[1], lookZ - cam[2]];
    const fl = Math.hypot(...f);
    f = f.map((v) => v / fl);
    let rt = [f[1], -f[0], 0];                       // forward x worldUp
    const rl = Math.hypot(...rt);
    rt = rt.map((v) => v / rl);
    const up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2],
      rt[0] * f[1] - rt[1] * f[0]];
    for (const c of CAB_CORNERS) {
      const v = [c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]];
      const zf = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
      if (!(zf > 0)) return { fv: Infinity, fh: Infinity, azV: -1, azH: -1 };
      const x = Math.abs(
        (v[0] * rt[0] + v[1] * rt[1] + v[2] * rt[2]) / zf / tanH);
      const y = Math.abs(
        (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / zf / tanV);
      if (x > fh) { fh = x; azH = d; }
      if (y > fv) { fv = y; azV = d; }
    }
  }
  return { fv, fh, azV, azH };
}

/** Model NDC of the cabinet corners at ONE bearing — the per-bearing form of
 * frameFill, used to check the model against the renderer's own camera. */
function frameNdc(o, azDeg) {
  const tanV = Math.tan((o.fov / 2) * Math.PI / 180);
  const tanH = tanV * (W / H);
  const az = (azDeg * Math.PI) / 180;
  const cam = [o.center[0] + o.r * Math.cos(az),
    o.center[1] + o.r * Math.sin(az), o.h];
  let f = [o.center[0] - cam[0], o.center[1] - cam[1], o.center[2] - cam[2]];
  const fl = Math.hypot(...f);
  f = f.map((v) => v / fl);
  let rt = [f[1], -f[0], 0];
  const rl = Math.hypot(...rt);
  rt = rt.map((v) => v / rl);
  const up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2],
    rt[0] * f[1] - rt[1] * f[0]];
  return CAB_CORNERS.map((c) => {
    const v = [c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]];
    const zf = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
    return [(v[0] * rt[0] + v[1] * rt[1] + v[2] * rt[2]) / zf / tanH,
      (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / zf / tanV];
  });
}

/** Frame occupancy of a SPHERE of radius `rad` centred on kernel-frame `p`,
 * under an arbitrary pinned pose, as a fraction of the frame half-extent on
 * each axis. Same look-at basis as frameNdc — the one validated against the
 * page camera to 3.3e-16 — so the two framing claims in this instrument rest
 * on one piece of projection maths, not two. The radius matters: a ball whose
 * CENTRE is inside the frame but whose edge is not is still a clipped ball,
 * and the centre is not what the viewer sees. Behind-the-lens returns
 * Infinity rather than a small number, which is what the naive perspective
 * divide would report for a point behind the camera. */
function poseFill(pose, p, rad) {
  const tanV = Math.tan((pose.fov / 2) * Math.PI / 180);
  const tanH = tanV * (W / H);
  let f = [pose.look[0] - pose.cam[0], pose.look[1] - pose.cam[1],
    pose.look[2] - pose.cam[2]];
  const fl = Math.hypot(...f);
  f = f.map((v) => v / fl);
  let rt = [f[1], -f[0], 0];
  const rl = Math.hypot(...rt);
  rt = rt.map((v) => v / rl);
  const up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2],
    rt[0] * f[1] - rt[1] * f[0]];
  const v = [p[0] - pose.cam[0], p[1] - pose.cam[1], p[2] - pose.cam[2]];
  const zf = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
  if (!(zf > rad)) return { x: Infinity, y: Infinity };
  const rr = rad / zf;
  return {
    x: (Math.abs((v[0] * rt[0] + v[1] * rt[1] + v[2] * rt[2]) / zf) + rr) / tanH,
    y: (Math.abs((v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / zf) + rr) / tanV,
  };
}

/** Project the same corners through the PAGE's camera, so the framing claim
 * is checked against the matrices three.js actually renders with rather than
 * against my own re-derivation of them. Kernel -> three per coords.js:14
 * (`out.set(ky, kz, kx)`). matrixWorldInverse is recomputed rather than
 * trusted: it is renderer-maintained and this runs outside a render call. */
const PROJECT_CORNERS = `(() => {
  const c = window.__dbg && window.__dbg.camera;
  if (!c) return 'no __dbg.camera';
  c.updateMatrixWorld(true);
  c.matrixWorldInverse.copy(c.matrixWorld).invert();
  const vi = c.matrixWorldInverse.elements, pm = c.projectionMatrix.elements;
  const mul = (m, v) => [
    m[0]*v[0] + m[4]*v[1] + m[8]*v[2] + m[12]*v[3],
    m[1]*v[0] + m[5]*v[1] + m[9]*v[2] + m[13]*v[3],
    m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14]*v[3],
    m[3]*v[0] + m[7]*v[1] + m[11]*v[2] + m[15]*v[3]];
  return JSON.stringify(${JSON.stringify(CAB_CORNERS)}.map((k) => {
    const q = mul(pm, mul(vi, [k[1], k[2], k[0], 1]));
    return [q[0] / q[3], q[1] / q[3]];
  }));
})()`;

/** GH-621: the fulltable orbit radius for a size variant, solved at load by
 * the criterion the 9 ft pin was solved with (bisection on r at FT_LOOK_Z,
 * both fills <= FT_CAP at every 1 deg bearing), rounded UP to the next mm so
 * the guard below never decides on the last float bit. The cabinet height is
 * the same on every size (EN-02/EN-03 carried), only the plan shrinks, so the
 * solved radius is NOT a plan-diagonal scaling of 3.2830 — it is re-solved. */
function solveFtR() {
  const fits = (r) => {
    const f = frameFill(r, R4(FT_LOOK_Z + r * Math.tan(FT_ELEV)), FT_FOV, FT_LOOK_Z);
    return f.fv <= FT_CAP && f.fh <= FT_CAP;
  };
  let lo = 1.0, hi = 6.0;
  if (!fits(hi)) throw new Error('solveFtR: cabinet does not fit at r = 6 m');
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return Math.ceil(hi * 1000) / 1000;
}
const FT_R = IS_VARIANT ? solveFtR() : 3.2830;   // 9 ft: argmin 3.28136, rounded up 1 mm
const FT_H = R4(FT_LOOK_Z + FT_R * Math.tan(FT_ELEV));   // 9 ft: 0.8259
const FT_FILL = frameFill(FT_R, FT_H, FT_FOV, FT_LOOK_Z);
if (!(FT_FILL.fv <= FT_CAP && FT_FILL.fh <= FT_CAP)) {
  console.error('[488d] the pinned fulltable framing no longer contains the'
    + ` outer cabinet: fill V ${FT_FILL.fv.toFixed(4)} H ${FT_FILL.fh.toFixed(4)}`
    + ` exceeds cap ${FT_CAP} — re-solve with --probe --frame-solve`);
  process.exit(2);
}

const ORBITS = {
  fulltable: {
    center: [0, 0, FT_LOOK_Z],
    r: FT_R,
    h: FT_H,
    fov: FT_FOV,
    run: 600,
  },
  // foot-right corner pocket — the A2 framing (orbit-488d.mjs:82-85, centre
  // [.6858, 1.3208, .010] r .56 h .36 fov 34) restated with h ABSOLUTE so the
  // judge's bearing arithmetic applies unchanged
  corner: {
    center: [HALF_W_OUT, HALF_L_OUT, 0.010],
    r: 0.56, h: 0.37, fov: 34,
    run: 450,
  },
};
const CARD_FRAMES = 60;    // judge:2083 hardcodes `i < 60` for the orbits
const HOLD_FRAMES = 30;

// ---------------------------------------------------------------------------
// THE OBSTRUCTION LAW — measured, and the reason the first seal was withdrawn.
//
// The first sealed fulltable orbit shipped 7 consecutive BLANK frames
// (471-477 of the mp4 = orbit poses v411-v417). They were not a stall: a
// second boot reproduced them byte-for-byte at the same poses, with
// `ctxLost=false`, texture/geometry counts flat at 68/161, 165 of 176 meshes
// visible and exposure unchanged at 1.05. The scene was intact and the
// renderer was healthy. The camera was simply inside something.
//
// What it was inside is `obScorePlaque` (room.js:319-330) -- a 0.72 x 0.50 m
// wall prop on the -z wall, AABB x [0.99,1.71] y [0.53,1.03] z [-2.998,-2.963].
// The room's dressing law (room.js:223-228) puts every prop against a wall
// with zero wall penetration, walls at |x| 4.5 / |z| 3.0, and obeys it. The
// fault is this instrument's: FT_R = 3.2830 with the orbit centred on the
// three-space origin puts the camera at |z| up to 3.283, i.e. OUTSIDE the
// room's z walls for ~27% of the turn (|cos az| > 3.0/3.283), and that is
// where the wall props live. Camera height 0.8259 sits dead centre in the
// plaque's y span. The measured profile matches exactly: a hard cliff at
// v411 as the camera crosses the plaque's z face (max 245 -> 5) and a
// 4-frame ramp back as it slides out past the x edge at 0.99 (v418-v422),
// because at 15-91 mm from a 0.72 m panel the panel is the whole frame.
//
// The camera path is NOT re-solved. FT_R is the argmin of the containment
// solve at FT_FOV 42; pulling the camera inside the room needs r <= 2.90,
// which needs fov ~47 to keep the cabinet contained -- a visibly wider lens
// on the one hero clip the owner reviews, to cure a defect that has a
// smaller cure. Instead the plaque is excluded from the empty-table capture,
// exactly as the balls and the cue stick already are.
//
// THE EXCLUSION IS MEASURED, NOT ASSERTED. An earlier draft of this comment
// claimed the plaque "is never on-screen at any of the 600 poses". That was
// wrong, and the re-render diff (old take vs new, frame by frame, both takes
// checksummed) says exactly how:
//
//   frames 471-477  ~1598000 px, |d| 245  whole frame: camera behind the panel
//   frame  478      1275092 px, |d| 241   the ramp begins
//   frame  479       966476 px, |d| 245   left-edge wedge, x [0,998]
//   frame  480       657094 px, |d| 245   x [0,714]
//   frame  481       366421 px, |d| 223   x [0,443]
//   frame  482       127732 px, |d|   8   x [0,247]
//   frame  483         4773 px, |d|   7   x [0,55] y [830,999]
//   every other frame                     BYTE-IDENTICAL (677 of 690)
//
// So the plaque does contribute pixels, at 13 consecutive poses (v411-v423),
// as a wedge pinned to the left edge that shrinks monotonically to nothing as
// the camera slides past its x edge at 0.99. Every one of those pixels IS the
// occlusion event. It never appears as intended dressing anywhere in the turn,
// and outside that event the two takes agree byte for byte -- which is the
// strongest form the claim can take, and stronger than the false one it
// replaces. The bench and the cue rack are NOT excluded: they are visible
// dressing at many bearings, and the clearance sweep puts nothing but the
// plaque within 0.30 m of the path.
//
// Three gates now stand where none did, and they are NOT redundant -- they
// have different reach, which is the point:
//   --probe clearance   67 poses flagged (v393-v427), before a frame renders
//   liveness_488d.py     8 frames caught (471-478), before the encoder runs
//   d_*_frame_alive      restated on the decoded h264, so the bytes carry it
// The clearance gate is the only one whose reach (v393-v427) brackets the
// true 13-pose contamination window (v411-v423), and it brackets it with
// margin at both ends. The liveness floors catch the 7 blanks plus the first
// ramp frame, but NOT the partial occlusion at 479-483 -- a frame that is 23%
// covered by a dark wedge is still a bright, live frame by any floor that is
// not fitted to this defect. That is precisely why the fix is a clearance
// refusal at the camera, and the two pixel gates are the backstop rather than
// the other way round.
const ORBIT_CLEAR_MIN = 0.30;    // m, camera-to-AABB over every orbit pose
const ORBIT_HIDE = ['obScorePlaque'];
// A gate that has never been seen to fail is decoration. `OB488D_CLEAR_SELFTEST=1
// --probe` skips the orbit hide, which puts the plaque back on the path and so
// re-creates the exact scene the first seal was rendered in; the clearance gate
// MUST then refuse, naming the plaque. Exit 0 = the gate fired (control passed);
// exit 4 = it did not, i.e. the gate is broken and every green it has ever
// printed is worthless. This lives in an env flag rather than a source edit so
// the control is reproducible from the report instead of being a thing I did
// once and reverted. It is deliberately NOT wired into --sweep: the negative
// control must never be able to influence a shipped frame.
//
// The expectation is PER ORBIT because the defect was: the fulltable path
// (r 3.283, centred on the origin) leaves the room's z walls and grazes the
// plaque; the corner path (r 0.56, centred on the table corner) never came near
// it and was measured clear on the defective take too. So "gate fires with the
// hide off" is the control for fulltable, and "gate STILL reports clear" is the
// control for corner — asserting a hit there would be asserting a defect that
// was never there.
const CLEAR_SELFTEST = process.env.OB488D_CLEAR_SELFTEST === '1';
const CLEAR_SELFTEST_EXPECT = { fulltable: true, corner: false };
// Bimodal by more than a decade over the whole sealed pack (legitimate minima
// 192 / 17.00 across 1284 body frames against blank 5-11 / 1.16-1.37), so
// these are placed in the empty gap between the modes, not fitted to either.
// (An earlier version of this comment quoted the legitimate band as 241-245 /
// 17.0-19.5; that was sampled only from the fulltable frames either side of
// the defect and was narrower than the truth — see liveness_488d.py, which
// carries the full per-clip table and the correction.)
const LIVE_MAX_MIN = 64;
const LIVE_MEAN_MIN = 4.0;
// Half-width of the excluded half-turn band in the restated recurrence census,
// in poses. NOT fitted: the band CENTRE is run/2 straight out of the declared
// pose law, and this half-width reuses the judge's own proximity constant (it
// skips the 4 nearest prior frames). The verdict is insensitive to it —
// sweeping 2/4/6/8/12/16/24/32 on the sealed fulltable gives frac 0.0000 and
// floor 1.315 at every value. See census_488d.py:recur_offband.
const RECUR_BAND = 4;

/** The 489 pose law (judge:2288 / orbitsweep-489.mjs:1015-1020): bearing 0 is
 * +kx, the sweep opens at -90 deg (the head-end/outside view) and runs one
 * full turn counter-clockwise. `look` is pinned at the subject and never
 * derived from the camera, so the subject cannot drift. */
function orbitPose(o, v, run) {
  const az = ((-90 + (360 * v) / run) * Math.PI) / 180;
  return {
    cam: [o.center[0] + o.r * Math.cos(az), o.center[1] + o.r * Math.sin(az), o.h],
    look: o.center,
    fov: o.fov,
  };
}

/** The same pose in RENDER space. coords.js:13-15 maps kernel [kx,ky,kz] to
 * three (ky,kz,kx); the clearance test compares against three-space AABBs, so
 * it has to cross the frame here and not by eye. */
const orbitPoseThree = (o, v, run) => {
  const k = orbitPose(o, v, run).cam;
  return [k[1], k[2], k[0]];
};

// ---------------------------------------------------------------------------
// THE POCKETING SHOT. Two balls: the cue and one object ball cut into the
// foot-right corner. A full rack would bury the subject; the subject IS the
// pocket accepting a ball, which is the whole point of this lane.
//
// The geometry is SOLVED, not eyeballed. The ghost-ball centre sits 2R back
// along the object->pocket line; the cue ball sits CUE_BACK back from the
// ghost along a line rotated CUT_DEG off it. The rotation is not decoration:
// the first take put the cue ball ON the pocket line (a dead straight-in
// shot) and a centre-ball hit walked it into the same pocket behind the
// object ball, which the scratch assertion caught. A shot that fouls is not
// a pocketing showcase. CUT_DEG also decides which way the cue ball leaves:
// with the cue approaching from the table centre the tangent line carries it
// up-LEFT into the foot cushion, well clear of both corners. The FIRST draft
// of this note put that contact "in the middle of the foot cushion, ~0.63 m
// clear of either corner" — a number read off the tangent-line model, which
// knows nothing about throw or the cue ball's post-impact spin. Measured off
// the bed the contact is at kernel x +0.150, so the real clearances are
// 0.485 m from the near (foot-right) corner and 0.785 m from the far one.
// The claim survived the measurement; the number did not, and the number
// this note now carries is the measured one. All of it is asserted at
// capture time (CLEAR_MIN below), never assumed.
//
// The pot itself still needs one measured number. Cut-induced throw rotates
// the object ball off the ghost-ball line, and the geometric aim alone
// misses; PHI_THROW_MRAD is the compensation, SOLVED on this kernel by
// `--probe --solve` (a deterministic phi sweep printed as a table) and then
// PINNED here, so the take is a fixed constant and not a capture-time search.
const BALL_R = 0.028575;
const POCKET = [BED.width / 2, BED.length / 2];  // playfield corner (9 ft: [.635, 1.27])
// GH-621: the object ball sits at the SAME offset from the pocket on every
// size (9 ft: [0.45, 1.00]), so the cut, the throw compensation and the
// tangent departure are the 9 ft shot on a shorter bed.
const OBJ = [R4(POCKET[0] - 0.185), R4(POCKET[1] - 0.27)];
const CUT_D = Math.hypot(POCKET[0] - OBJ[0], POCKET[1] - OBJ[1]);
const CUT_U = [(POCKET[0] - OBJ[0]) / CUT_D, (POCKET[1] - OBJ[1]) / CUT_D];
const GHOST = [OBJ[0] - 2 * BALL_R * CUT_U[0], OBJ[1] - 2 * BALL_R * CUT_U[1]];
const CUT_DEG = 30;
const CUE_BACK = 0.95;
// cue travel direction: the pocket line rotated +CUT_DEG (counter-clockwise),
// i.e. the cue arrives from the table centre and cuts the object rightwards
const AIM_RAD = Math.atan2(CUT_U[1], CUT_U[0]) + (CUT_DEG * Math.PI) / 180;
const AIM_U = [Math.cos(AIM_RAD), Math.sin(AIM_RAD)];
// SOLVED 2026-08-29 by `--probe --solve -40:40:5` then `-8:8:1` on this
// kernel, seed-invariance proved in both sweeps (shotIndex 0 vs 17 identical):
//   miss        <= -6 mrad          miss        >= +6 mrad
//   DIRECT pot  -5 .. +4 mrad       rattle-then-drop at +5 (tPot 3.6013 s)
//   tPot        0.4516 0.4506 0.4504 0.4505 0.4508 0.4518 0.4534 0.4556
//               0.4585 0.4918 3.6013   for -5 .. +5
// The transit-time minimum at -3..-2 is the dead-centre entry, so measured
// cut-induced throw on this shot is about -2.5 mrad of phi. -1 is pinned: it
// is within 0.4 ms of the fastest entry AND >= 5 mrad from both miss edges,
// where the throw minimum itself is only 4 mrad clear of the low edge.
// Overridable for a re-solve; the DEFAULT is the pin.
const PHI_THROW_MRAD = Number(argOf('--phi-mrad', '-1'));
// GH-621: see the pocketing block in --sweep. A reason string is REQUIRED so
// a skipped clip can never look like an oversight in the manifest.
const SKIP_POCKETING = argv.includes('--skip-pocketing')
  ? String(argOf('--skip-pocketing', '')) : null;
if (SKIP_POCKETING !== null && SKIP_POCKETING.length < 20) {
  console.error('[488d] --skip-pocketing needs a reason (>= 20 chars)');
  process.exit(2);
}
// The pocketing camera is static, so its whole framing claim is one pose, and
// the claim is simple: every ball this clip shows is INSIDE the frame for the
// whole take. fov 32 was pinned by eye and the probe frame showed the cue ball
// cut in half by the top edge at t=0 — measured after the fact at 1.0335 of
// the frame half-height, so it overflowed by 3.4%. A ball that starts
// off-screen does not read as a stroke; it reads as a teleport, and this clip
// exists to show that a real cue ball cut a real object ball into a pocket.
// So the fov is solved the way FT_R is: measure, take the argmin against a
// declared cap, then round in the direction that ADDS margin so the guard
// never ends up deciding on the last float bit.
//
// The measurement is of the TAKE, not of a model of it: `--probe --pk-solve`
// steps the kernel across the realtime window, reads both ball centres back
// off the bed, and reports the smallest fov that keeps every sample (plus its
// own ball radius) inside PK_CAP. The pin below is that number rounded up to
// the next whole degree. pocketingShot re-checks it on every capture run, so
// this is a checked claim and not a comment.
const PK_CAP = 0.88;
const PK_FOV = Number(argOf('--pk-fov', '38'));
// The realtime take ends RT_DWELL after the cue ball's first cushion, not at a
// fixed offset past the swallow. rtPostSec was 2.00 s, guessed before the
// event trace existed, on a belief that the rebound landed late; the trace
// says the cue reaches the foot cushion at t=0.631, only 0.180 s after the
// pot. 2.00 s therefore ran 1.8 s past the end of the story and swept in a
// SECOND cushion contact at 2.168 s whose position was never framed. The take
// is bound to the event that carries its claim instead: the cue ball leaves
// along the tangent line, reaches a cushion, comes off it, and the clip holds
// long enough to see that happen.
const RT_DWELL = 0.60;
// How far the cue ball's cushion contact must stay from either foot-rail
// corner for the take to read as a tangent DEPARTURE rather than a near-miss
// scratch. Four ball diameters: a corner mouth on this table is a little over
// two ball diameters wide, so a contact four diameters clear of the corner
// was never a pocket candidate. Measured on the pinned take at 0.485 m, which
// clears this 2.1x — the bar is set where the qualitative failure is, not
// snug against the current number, so it stays a real guard and not a tripwire
// that fires on any harmless re-solve.
const CLEAR_MIN = 8 * BALL_R;
const POCKETING = {
  objId: 3,
  cutDeg: CUT_DEG,
  layout: [
    {
      id: 0,
      x: R4(GHOST[0] - CUE_BACK * AIM_U[0]),
      y: R4(GHOST[1] - CUE_BACK * AIM_U[1]),
    },
    { id: 3, x: OBJ[0], y: OBJ[1] },
  ],
  phiGeom: Number(AIM_RAD.toFixed(6)),
  phiThrowMrad: PHI_THROW_MRAD,
  shot: {
    v0: 2.2,
    phi: Number((AIM_RAD + PHI_THROW_MRAD / 1000).toFixed(6)),
    theta: 0, a: 0, b: 0,
  },
  // static camera outside the foot-right corner, looking back down the
  // approach lane: the ball travels toward the lens and drops away from it
  cam: {
    cam: [R4(HALF_W_OUT + 0.80 * Math.SQRT1_2),
      R4(HALF_L_OUT + 0.80 * Math.SQRT1_2), 0.50],
    look: [R4(HALF_W_OUT - 0.08), R4(HALF_L_OUT - 0.08), -0.010],
    fov: PK_FOV,
  },
  leadFrames: 3,        // static pre-roll, hold-bound and OUTSIDE the seg
  rtDwellSec: RT_DWELL,
  cap: PK_CAP,
  slowRate: 0.40,       // kernel seconds per real second in the slow take
  slowPreSec: 0.25,     // slow take opens this far before cue/object contact
  slowPostSec: 0.55,    // ... and closes this far after the swallow
  card1Frames: 60,
  card2Frames: 45,
};

// ===========================================================================
// THE ONE RESIDUAL LEDGER  (wave A5-R2)
// ===========================================================================
// The 488p card law, orbitsweep-488p.mjs:199-337, adopted rather than
// re-invented: one array, every row carrying the class of thing it is, what
// it is, which clips it bears on, the short form that goes ON the plate and
// the long form that goes in the pack INDEX.md. `card: null` is a row that is
// ledgered but never printed on a plate; `clips: []` is a row that bears on
// no particular clip. Both are deliberate — 488p's NEW-A4a (the photometric
// basis) is exactly such a row, and this lane's A4 camera seal is its twin.
//
// ONE DELIBERATE DIVERGENCE from 488p, named so the two files can be diffed
// side by side without anyone wondering: 488p calls the field `orbits` and
// prints "visible in this orbit", because all three of its clips are orbits.
// This pack's third clip is a POCKETING SHOT, not an orbit, so the field is
// `clips` and the plate says "in this clip". Nothing else about the law moved.
//
// Every number below is quoted from SPIKE-REPORT.md § 11, § 15, § 20 and
// § 21 — the sections the maintainer independently re-verified in the A5
// pass. Nothing here is rounded, re-derived or estimated at this site; where
// the report corrects itself the CORRECTED figure is the one carried, with
// the superseded one named so a reader of the older section is not misled.
const LEDGER = [
  // ---- the look: the venue rig and the room, measured ---------------------
  { id: 'C2 / O6', cls: 'PRINCIPLED CEILING (venue rig, frozen by scope)',
    item: 'Saturation is rig-floored',
    clips: ['fulltable', 'corner'],
    card: 'saturation is rig-floored — rail S 0.30 against the canonical instance\'s 0.026-0.031; with the environment fully OFF it still reads 0.245-0.257, so the wood map is not the cause (C2/O6)',
    disclosure: 'Rail saturation reads S 0.30 against a canonical instance at S 0.026-0.031. Decomposed rather than asserted: with the environment fully off the rail still reads S 0.245-0.257, and the wood map contributes only about 0.04 (S 0.302 -> 0.258), so the frozen 0xfff1da canopy alone sets a floor an order of magnitude above the reference. What would close it: only the venue rig, which is frozen by this wave\'s scope. Owner item O6 is CLOSED and STANDS — the finding is real and camera-robust (a same-frame ratio), re-confirmed in § 20.7; closing the item did not remove the ceiling.' },

  { id: 'C3 / O7', cls: 'PRINCIPLED CEILING (room lighting, room.js out of fence)',
    item: 'The room is ~28x darker than the canonical instance\'s',
    clips: ['fulltable'],
    card: 'the room is ~28x darker than the canonical instance\'s — floor V 0.02 against the dossier\'s 0.569 — so the perceptual reading inverts even at a matched absolute cabinet ratio (C3/O7)',
    disclosure: 'Our floor reads V 0.02; the dossier floor is V 0.569 (#916e57, H 23.8, S 0.400). The consequence is not a brightness offset but an inversion: the perceptual reading flips even when the absolute cabinet ratio is matched. What would close it: web/scene/room.js, which is outside this wave\'s fence. Owner item O7, carried OPEN. Watchable in the delivered bytes as V8 — the full-table orbit\'s low pass across the dark end of the room, mean 17.002 @497 on the PNG plane and 16.8175 @498 on the decoded plane. That frame is legible and clears the absolute mean >= 4.0 liveness floor by 4.2x, and it is still the darkest thing in the pack.' },

  { id: 'C4', cls: 'PRINCIPLED CEILING (furniture-vs-room contrast; same root as C2+C3)',
    item: 'The table body is darker than the room it stands in',
    clips: ['fulltable'],
    card: 'the table body is 5.2x darker than the floor it stands on and reads as a silhouette hole — leg/apron lum 4.5 at S 0.702 against a room floor at lum 23.5 (C4)',
    disclosure: 'At the corner-075 bearing the leg/apron reads lum 4.5 (S 0.702) against a room floor of lum 23.5: the furniture is 5.2x darker than the floor and reads as a silhouette hole rather than as wood. In corner-045 / corner-075 / side-075 the entire lower half of frame is featureless. What would close it is exactly what would close C2 and C3 together — the venue rig and room.js. This row is not a fourth defect; it is what those two cost, shown on screen.' },

  { id: 'C5', cls: 'PRINCIPLED CEILING (environment tint on low-albedo surfaces)',
    item: 'The environment tint owns the dark end of every low-albedo surface',
    clips: ['fulltable', 'corner'],
    card: 'the environment tint owns every dark low-albedo surface — cloth saturation RISES 68% as its luminance halves (S 0.457-0.510 at lum 143-165, S 0.823 at lum 83.7), against a rail-wood hue control that never leaves H 32.8-37.3 (C5)',
    disclosure: 'Cloth lit reads S 0.457-0.510 at lum 143-165 and cloth shadowed reads S 0.823 at lum 83.7 — saturation RISES 68% as luminance halves, which is the signature of an environment tint rather than of an albedo. The same hand is on the void under the jaw pad (S 0.610 at lum 20.7) and on the leg (S 0.702 at lum 4.5). The control that makes it a finding rather than an impression: rail-wood hue never leaves H 32.8-37.3 across 6 samples in 3 frames. Recorded as ONE root cause, not three defects. What would close it: the same rig as C2.' },

  { id: 'C6', cls: 'PRINCIPLED CEILING (woodMat roughness, shared outside this wave)',
    item: 'Rail-top sheen swings 4.1x on camera azimuth',
    clips: ['fulltable', 'corner'],
    card: 'rail-top sheen swings 4.1x on camera azimuth alone — side-045 lum 83.2 against side-105 lum 20.2, same plank family and same rig, while the cloth control over the same frames moves 1.16x (C6)',
    disclosure: 'Rail-top sheen swings 4.1x on camera azimuth: side-045 lum 83.2 against side-105 lum 20.2, same plank family, same rig. The control that isolates it: cloth over the same frames moves only 1.16x (165.1 / 142.0). There is also a same-frame split at corner-075 of 93.0 / 49.6 = 1.88x, with the bright wing washed to S 0.028. What would close it: a material/roughness question on woodMat, which is shared with entries outside this wave and was deliberately not touched.' },

  { id: 'V11 / O1', cls: 'OWNER RULING (tone; § 10.5, blocked on O24)',
    item: 'The casting renders brighter than the rail wood it abuts',
    clips: ['corner'],
    card: 'the casting renders brighter than the rail wood it abuts, which is backwards from the real table — known, owner-ruling, and blocked on O24 rather than on these videos (V11/O1)',
    disclosure: 'The pocket casting renders brighter than the rail wood it abuts. On the real table the relationship is the other way round. The report states no numeric figure on this row itself; the inversion is attributed to the C2/C5/C6 rig-floor family, which is what makes this and V8 look the way they do. It is an owner-ruling item (§ 10.5, ledger O1) and it is OPEN and BLOCKED ON O24 — the cloth-colour delta — not on anything in this pack. Note the direction of the block: no measurement in these clips can settle it, so nothing here is offered as settling it.' },

  { id: 'O24', cls: 'PRINCIPLED CEILING (cloth chroma delta; blocking for O1)',
    item: 'Render cloth is saturated blue where the references are near-neutral',
    clips: ['fulltable', 'corner', 'pocketing'],
    card: 'the render cloth is saturated blue at 0.45-0.55 where the reference photographs read near-neutral at 0.055 / 0.107 — open, and the thing that blocks the tone question (O24)',
    disclosure: 'Render cloth is saturated blue (0.45-0.55) where the references\' cloth is near-neutral (0.055 / 0.107). OPEN, and blocking for O1. This is the single largest colour delta in the pack and it is present in every clip, so it is carded on all three. It is stated as a measured delta and NOT as a defect verdict: which of the four look targets is canonical for diamond_proam_9ft is itself the open question O1, and that question is blocked on this one.' },

  { id: 'C7 / O8', cls: 'PRINCIPLED CEILING (jaw-pad loft; by-design geometry exemption)',
    item: 'The dm-bootsleeve jaw pad stands proud, and the void beneath it reads as a dark step',
    clips: ['corner'],
    card: 'the dm-bootsleeve jaw pad stands proud and the void beneath it reads as a dark step — the void is 6.1x darker than the cushion cloth 40 px away (#081624, S 0.610, lum 20.7, against pad body #26221a at lum 34.5); the proudness is 0.793 mm, NOT the 61.22 mm § 11.2 prints (C7/O8)',
    disclosure: 'The dm-bootsleeve jaw pad stands proud and overhangs; the void beneath it is visible in the corner orbit as a dark step, reading #081624 at S 0.610 and lum 20.7 — 6.1x darker than the cushion cloth 40 px away — against a pad body of #26221a at lum 34.5. THE MAGNITUDE CARRIES A CORRECTION THE OLDER SECTIONS DO NOT. § 11.2 and § 20.10 both print "C14-MOUTH-PAD worst exposed run 61.22 mm"; that number is an ARC LENGTH, not a proudness. mouthExposure accumulates run along the section curve and the corner jaw span is 10.67-80.82 mm, so a facing that covers its own jaw scores about 61 mm whatever its thickness — very nearly a constant of the jaw rather than a property of the pad. The proudness measurement is C14-PAD-PROUD (CP-14), which PASSES at worst projection 0.793 mm over 13 judged slices x 4 corners and 9468 in-band samples, against a nominal ceiling of 4.7625 mm (CP-03) — margin 3.970 mm to nominal and 5.557 mm to legal, with uncertainty carried to 6.3500 mm (WPA section 9). What would close it: a reshape of the pad loft, which the exemption\'s own wording says is by design. Owner item O8, carried OPEN, to be read with this correction.' },

  { id: 'O7 (interior)', cls: 'PRINCIPLED CEILING (pocket-interior finish, out of fence)',
    item: 'Pocket-interior finish is unresolved and out of this wave\'s fence',
    clips: ['corner', 'pocketing'],
    card: 'the pocket interior is unfinished work carried out of fence — you are seeing the current interior, not a resolved one (O7)',
    disclosure: 'Pocket-interior finish sits with room.js outside this wave\'s fence; a third reason was added during A4 (the largest principal-point radius). OPEN. It is carded on the two clips where the pocket interior is actually on screen so that the interior is not read as a settled result. Same ledger item as C3\'s room lighting; they are one fence, not two.' },

  { id: 'D1', cls: 'INTENTIONAL DELTA (IP policy)',
    item: 'The "DIAMOND" wordmark is not modelled',
    clips: ['corner'],
    card: 'the maker\'s wordmark is deliberately NOT modelled — 0 text meshes in the rail-top and casting families, where the reference photographs show the mark inlaid on the casting (D1)',
    disclosure: 'The "DIAMOND" wordmark is not modelled. This is IP discipline: third-party marks are reference-only, and the decision is permanent and deliberate rather than a defect to be closed. The evidence is mesh-side, not visual: the rail-top and casting families extracted from the runtime carry ZERO text meshes, while reference photographs oem-proam-smart-corner-pocket-01/02/03.jpg show the mark inlaid. It shows in the corner orbit as a bare casting.' },

  { id: 'A5-7 / V7', cls: 'INTENTIONAL DELTA (inherited instrument behaviour)',
    item: 'No cue stick in any clip',
    clips: ['fulltable', 'corner', 'pocketing'],
    card: 'there is no cue stick in any clip — REHIDE zeroes obCueStick every frame, inherited verbatim from the shared 489 instrument and declared rather than changed (A5-7)',
    disclosure: 'No cue is visible in any clip: REHIDE zeroes obCueStick every frame. This is inherited verbatim from orbitsweep-489.mjs:796-802 — precedented and intentional. It is DECLARED rather than changed, because changing it would fork this lane\'s behaviour away from the shared instrument for a cosmetic reason. It is carded on all three clips because it is an absence a viewer will notice, and an unexplained absence reads as a missing mesh.' },

  { id: 'A5-8 / V14 / O40', cls: 'OWNER RULING (composition, constraint-bound)',
    item: 'The pocketing composition leaves the bottom ~45% of frame near-black',
    clips: ['pocketing'],
    card: 'the bottom ~45% of this frame is near-black — the containment solve\'s own output at worst 0.8607 against a cap of 0.88 at fov 38; tightening the frame clips the cue ball (3.4% at t=0 at fov 32), so this is the composition the constraint admits, not a choice (A5-8/O40)',
    disclosure: 'The pocketing clip\'s bottom ~45% of frame is near-black. This is the containment solve\'s own output: worst 0.8607 against cap 0.88 at fov 38. It is not a framing preference — V15 records that at the tighter fov 32 the cue ball was clipped 3.4% at t = 0, cured before seal by PK_FOV = 38. So tightening the frame to remove the dark band puts the cue ball back outside it. A brighter room (C3 / O7) fixes it; re-framing does not. Ledgered O40, with the disposition wanted from the owner.' },

  { id: 'V5 / A5-5 / O37', cls: 'PRINCIPLED CEILING (two-fold symmetric subject; upstream judge defect)',
    item: 'The full-table orbit revisits every bearing half a turn later',
    clips: ['fulltable'],
    card: 'the two-fold symmetry is plainly visible — frames 200 and 500 are the same table from opposite bearings; that is the subject, not a looped render, and it disarms one judge bar whose premise "a 360 orbit never revisits a bearing" is false here (V5/O37)',
    disclosure: 'A pool table is two-fold rotationally symmetric, so a 360-degree orbit revisits every bearing exactly once, half a turn later. Frames 200 and 500 are the same table from opposite bearings, differing only in the wall dressing behind one of them — which is precisely why their MAD is 0.806 rather than 0. Recorded on the plate so the owner does not read it as a looped or duplicated render. Measured: the judge\'s unbanded recur_frac is 0.2706 on fulltable (161 of 595 body frames), with the best-match offset exactly 300 = run/2 for all 161, against 0.0000 (0 of 445) on corner. The MAD-vs-offset profile at frame 500 is sharply peaked and symmetric about 300 (297:1.828 / 298:1.502 / 299:1.176 / 300:0.806 / 301:1.209 / 302:1.612), nearest non-half-turn candidate 1.911 at offset 4. CONSEQUENCE FOR THE GATE, stated because it is the honest half: the shared judge bar enc_fulltable_recur_frac has a premise its own source states — "a 360 orbit never revisits a bearing (measured shipped 0/595)" — that is FALSE on this subject, and as pinned it fired on a non-defect (ft_reverse_body moved it to 0.2807, +0.0001 over the window, and LEAKED) while sleeping through a real one (ft_loop, a 102-frame period-36 triangle loop, moved it only to 0.2739 and was MISSED). It is restated as d_fulltable_recur_offband with d_corner_recur_offband as the armed control, on which ft_loop restates at 0.1378 — 82 of 595 frames, 2756x the 5e-5 ceiling. This is a genuine upstream defect in shared law, ledgered O37 and proposed back upstream, not a grade mismatch.' },

  // ---- ledgered, but nothing to see: rows that bear on a clip -------------
  { id: 'A5-6 / O39', cls: 'PRINCIPLED CEILING (rendering-order dependency)',
    item: 'The full-table orbit path leaves the room shell for 26.3% of the turn',
    clips: ['fulltable'],
    card: null,
    disclosure: 'The full-table orbit camera is outside the room shell for 26.3% of the turn — 158 of 600 poses — with the shell box [[-4.5,-0.81,-3],[4.5,2.45,3]] and the camera at r 3.283 from centre. Deliberately NOT carded: it is harmless only because the shell is BackSide and therefore invisible from outside, which is exactly why there is nothing in frame to point at. It is nonetheless a real dependency on a rendering-order accident — a future shell with DoubleSide, or a skybox, would break this pack. Ledgered O39, OPEN, low severity, real fragility.' },

  { id: 'V12', cls: 'CLOSED (expected; recorded so it is not read as a defect)',
    item: 'The corner orbit is the largest file despite having the fewest frames',
    clips: ['corner'],
    card: null,
    disclosure: 'The corner orbit is 19.9 MB against the full-table orbit\'s 9.6 MB despite carrying 150 fewer frames (540 against 690). Closer subject, more high-frequency detail, same crf. Expected, and recorded only so that the file size is not later read as a defect or as evidence of a different encode.' },

  { id: 'D2', cls: 'INTENTIONAL DELTA (spec wins over an authored highlight)',
    item: 'The casting seam is a material boundary, not an authored 0.5 mm lift',
    clips: ['corner'],
    card: null,
    disclosure: 'The pre-488D render lifted the casting 0.5 mm proud to author a highlight. EN-04 bounds the rail-stack extreme at 50.8 mm with a 0.40 mm tolerance and the casting is inside that stack, so a 0.5 mm lift overruns a DERIVED envelope row by more than its own tolerance. Under "no unauthored shape functions" the spec wins: castingProud: 0, for THIS ENTRY ONLY — every entry with an unpinned stack keeps the legacy lift byte-for-byte. Not carded because it is not visible as a residual: probing the parting line at a fixed pose scores isolated speckle at 1/14744 and 1/14554 (0.01%), worst dL 21.5 and 22.5, against controls of 0/23084 on cloth and 0/27064 on wood — noise, not a fight.' },

  { id: 'D3 / O5', cls: 'CLOSED (owner ruled § 15.2 — keep solid, approved on the evidence)',
    item: 'The rail band is solid where no spec row governs it',
    clips: [],
    card: null,
    disclosure: 'The seat, the seat face and the sub-rail beam were made solid, riding one flag (railSolid) because they are only correct together. No spec row governs the seat plane, the beam or the seat face, and the volume has no look-line from anywhere — it is enclosed by bed, cushion, plank and apron — so it is invisible in every clip and carries no card. It was answered by construction from the S4 sheet, which draws the band as a solid committed rectangle. OWNER-RULED AND CLOSED (§ 15.2, ledger O5): keep solid, approved on the evidence, with the two-line revert pointer recorded — web/scene/table.js:298 (railSolid: true) and :299 (railSeatY: 0), both in the diamond_proam_9ft render block and nowhere else. The price of the alternative is recorded with it: dropping the flag puts CC/EE-CLOSURE back to red, because they read the open underside as a void the full height of the body; they currently measure 0.31 mm and 0.36 mm against a 1.5 mm tolerance.' },

  // ---- claim scope: what this pack is NOT evidence of ---------------------
  { id: 'A4', cls: 'PRINCIPLED CEILING (measurement-limited)',
    item: 'These clips are not photo-matched and are not offered as photo-match evidence',
    clips: [],
    card: null,
    disclosure: 'THE SINGLE MOST IMPORTANT LIMIT ON THIS PACK, and the reason it carries no card: it is a statement about what may be CLAIMED, not about anything in frame, and printing it on a plate would dress a claim limit up as a picture. Wave A4 cammatch is sealed DIAGNOSED-NOT-FITTED / measurement-limited, on the Predator precedent of refusal with evidence: the failure is root-caused to a named mechanism (CU-04 capture, absorbed as camera distance by a coplanar anchor set), quantified end to end on a camera we posed ourselves at 217 mm admitted at sigma 11.55 mm, and the repair is derived and shown to be blocked by imagery rather than by understanding. An independent adjudicator reached (B) DIAGNOSED-NOT-FITTED on its own, calling it "not close". A5 renders; it does not solve a camera, so nothing in this pack is downstream of an admitted camera and nothing here reopens the seal. STATED PLAINLY: these clips are NOT photo-matched and are NOT offered as photo-match evidence. They are a rendering of the mesh under the venue rig. Any claim of the form "this looks like the real table" is blocked on O1 and O24 and on A4\'s camera — it is not blocked on, and cannot be settled by, these videos.' },

  { id: 'O27', cls: 'OWNER RULING (pending — what a -488d camera may be used to claim)',
    item: 'The admission rule does not bound the camera',
    clips: [],
    card: null,
    disclosure: 'Measured on a controlled resolution ladder rather than on one counter-example: at the dossier\'s own 640x360 the § 17.3 admission gate ADMITS a pose 217.0 mm from truth while reporting sigma 11.55 mm — an 18.8x understatement — and rms_px is ANTI-CORRELATED with true accuracy across the ladder, with the best residual (0.1374) belonging to the worst camera (738 mm). Modelling CU-04 improves real accuracy 2.1x and the rule rejects all of it. OPEN: needs an owner-level ruling on what a -488d camera may be used to claim.' },

  { id: 'O18', cls: 'PRINCIPLED CEILING (camera dossier basis — no independent holdout)',
    item: 'Exactly one admitted camera in the whole dossier',
    clips: [],
    card: null,
    disclosure: 'The dossier yields exactly one admitted camera (tl24); tl25 is NOT-CONVERGED and accu04 is REFUSED-SIGMA-PARALLEL. Every camera-dependent verdict therefore rests on that single frame, fit on one frame with no reserved arbiter. OPEN: acquire a second venue\'s frames, or accept the weak basis explicitly. The § 20.12 correction pass SHARPENS this row rather than closing it — there is no second photograph camera, but the render-side holdout that does exist says the repair does not generalise: selected on the nine ps cameras and scored on 18 held-out swing renders (16 of which played no part in the repair\'s construction), the best repair configuration gives 699.4 mm against a V0 baseline of 277.9 mm, with rank correlation between the two sets at Spearman +0.018 — no transfer at all. That is stronger evidence FOR the seal than anything in § 20.5.' },

  { id: 'O21', cls: 'PRINCIPLED CEILING (cushion anchor fit — IMPROVED-NOT-FITTED)',
    item: 'Defect 8 is root-caused, not fixed',
    clips: [],
    card: null,
    disclosure: 'The nose detector captures CU-04, not CU-03: the strongest gradient lies within 2 px of the featherstrip at 79.3% of 319 stations, against 5.0% on the nose. The mechanism is the differential and not a uniform capture — a uniform outward capture of the coplanar nose set is absorbed EXACTLY by camera distance at zero residual and zero d_fov (verified to 4 s.f.), and the measured mean outward offset is only +0.93 +/- 0.39 px, which predicts |d_fov| of about 0.17 degrees against 4.98 observed: 29x short, r = -0.011. What the camera cannot absorb is the 59 mm spread BETWEEN rails. The repair is derived and tested: IMPROVED-NOT-FITTED. OPEN: needs >= 1280x720 frames and a cushion-slope surface rather than a line.' },

  // ---- the gate: what these bars can and cannot see ------------------------
  { id: 'A5-3 + A5-4 / O38', cls: 'PRINCIPLED CEILING (shared judge law hardcodes a green cloth)',
    item: '12 of 52 judge bars are unusable on a Tournament Blue table',
    clips: [],
    card: null,
    disclosure: 'The shared judge hardcodes a green-cloth predicate (g > r+30 & g > b+30 & g > 60) and an R >= 254 face predicate. This table ships Tournament Blue, so 9 bars read a constant and judge nothing (enc_{ft,co,pk}_scene_floor, _dclip_total_max, _dclip_comp_max) and 3 more measure ball presence rather than approach (enc_pk_redface_peak, _event_floor, _outside — 154 px peak against 489\'s 10136, with 87% of it outside the event). All 12 are RESTATED on axes this table actually has, and the restatements are strictly stronger: the blue-clip census sees an ANY-channel clip where the green-only predicate could not see a red or a white one. Sealed restated readings — ft 0.08628@210 / 12@339 / 12@339; co 0.18039@343 / 5@180 / 2@180; pk 0.27685@206 / 147@190 / 64@194; rdom peaks 1658 / 1665 px, swallow ratios 17.27 / 15.56, lead-in deviation 9 / 2 px against caps 138 / 139. It remains 12 bars of shared law this lane cannot use, and any other non-green table inherits the problem. Ledgered O38.' },

  { id: 'A5-1', cls: 'PRINCIPLED CEILING (delivery chain / grade)',
    item: 'The pack is judged and viewed post-encode at crf 14 / yuv420p 4:2:0',
    clips: [],
    card: null,
    disclosure: 'Everything judged and everything looked at is post-encode, at crf 14 / preset medium / yuv420p 4:2:0. That is the right choice — what ships is what is judged — but 4:2:0 chroma subsampling is lossy on exactly the chroma edges the six reinterpreted gdom/gclip bars now police, so a future grade change reopens those six bars\' INTERPRETATION and not merely their windows. A related precondition from the same gate: the judge\'s raster is hardcoded (_decode_frames(w=1600,h=1000) with grid_of reshaping to (10,100,16,100)), so 1600x1000 is a precondition rather than a preference, and a re-grade at any other raster silently mis-tiles.' },

  { id: 'A5-2', cls: 'PRINCIPLED CEILING (identity gating scope)',
    item: 'Identity rests on card signatures and frame censuses, not on a model of the table',
    clips: [],
    card: null,
    disclosure: 'The pack\'s identity rests on card-plate signatures and frame-level censuses, not on a semantic model of the table. A mutation that is geometrically plausible and lands on a smooth seam is not, in general, catchable by these bars. This is a scope statement about what the 52-bar judge path plus the 21 restatements can and cannot see — not a failing measurement.' },

  { id: 'A5-9 / O36', cls: 'PRINCIPLED CEILING (judge tooling — cheap upstream fix)',
    item: 'The judge reads its card fixture from its own directory by absolute path',
    clips: [],
    card: null,
    disclosure: 'The judge resolves fixtures/encoded-cards-489-signature.json from dirname(abspath(__file__)) (judge:1946-1948), so reusing it VERBATIM required a <PACK>/judgedir/ symlink shim rather than an edit, with this lane\'s fixture tracked at tools/render/fixtures/encoded-cards-488d-signature.json. Red-arm case ft_foreign_card proves the staged fixture is genuinely consulted, and the manifest records judge_path_real + judge_sha256 + fixture_sha256 so the shim cannot hide a modified judge. Stated plainly nonetheless: a shim is not a fix. Ledgered O36, which proposes the real one (a per-table card_sig cfg key).' },

  { id: 'C1', cls: 'PRINCIPLED CEILING (census clearance by disclosure, not by geometry)',
    item: '280 census records are cleared by disclosure rather than by geometry',
    clips: [],
    card: null,
    disclosure: '280 records clear by clause rather than by geometry: 202 BASELINE + 78 CONTAINED-BASELINE across ten diamondBaseline() clauses (dm2a x152, dm2b x32, dm1a x24, dm1c x22, dm2c x14, dm1b x10, dm5 x10, dm4 x8, dm3 x6, dm6 x2). Every clause is derived from an authored constant — never from the number it needs to clear — and every clause is red-armed, with 7 of 7 arms firing. This is the intended use of the law\'s baseline hook and there is nothing to close. It is ledgered so that the 0-FAIL headline is never read as "0 records". For scale, from red basis (87 slices / 60374 tris) to final (92 / 68538): FAIL 332 -> 0, CONTAINED-FAIL 62 -> 0, WARN 1414 -> 0, ADJUDICATE 160 -> 48, BASELINE 0 -> 280, TOUCH 1340 -> 6074 — so of the 1808 red-basis records above TOUCH, 280 clear by clause and the rest were cured by MOVING GEOMETRY.' },

  { id: 'C8 / O3 / A5-11', cls: 'PRINCIPLED CEILING (VERBATIM gate law — needs A3\'s remaining half)',
    item: 'mouthExposure fail-closed NO-CLOTH false reds; 2 c14 bars remain red',
    clips: [],
    card: null,
    disclosure: 'dm-railtop and dm-bootcollar report worst exposed run 0.00 mm and are still red, on six NO-CLOTH records at C0 y = 13..23; all side bays are ABSENT for the same reason. What would close it is a backPlaneMm clamp in c14-disjoint.mjs — the VERBATIM law, and therefore not this lane\'s to edit. This is why 2 c14 bars remain red in the pack, and they are not A5\'s to close: O3 needs A3\'s remaining half. Recorded as an instrument ceiling, not as a visible residual.' },

  { id: 'C9 / O2', cls: 'CLOSED (repinned in A11 — the letter gate is 48/48 GREEN)',
    item: 'The RB-02 letter was carried deliberately red; it no longer is',
    clips: [],
    card: null,
    disclosure: 'CARRIED SO THE OLDER SECTIONS ARE NOT READ AS CURRENT. § 11.2 and § 20.10 both print "L RB-02: spec 47 vs 50.8 (delta 3.8, tol 0.25)" as a deliberately-carried red on an EST / TO-BE-MEASURED row (47.0 mm = 1.85 in, source "current render pin (catalog)"). That is HISTORICAL. Wave A11 granted and executed the repin: RB-02 47.0 -> 50.8 landed, one dimensioned value moved in the whole sheet, the letter gate went 47/48 -> 48/48 GREEN, 12/12 identities HOLD, --check byte-identical, 14/14 fullview bars, doc sha dd8b0fd0... -> cb7aa7fa... -> a4cdc73a..., and the RB-02 row now reads spec 50.8 / as-modelled 50.8 / delta 0. The cloth crown is not real: EN-02\'s own name measures to the rail top. ONE STEP FURTHER SINCE § 21 WAS WRITTEN, named here so the chain in that section is not read as ending where it stops: commit c3df08cf adopted CP-14 (jaw facing pad outward projection) into the sheet at r2, additively — no existing value moved, feature count 56 -> 57 — carrying the definition to e0f755dc..., which is the sha stamped on this pack\'s title plates and in its provenance.json. The A11 chain above is complete and correct up to a4cdc73a; e0f755dc is a4cdc73a plus CP-14.' },

  { id: 'C10', cls: 'PRINCIPLED CEILING (ADJUDICATE tier, disclaimed in the law\'s own source)',
    item: '48 ADJUDICATE records remain',
    clips: [],
    card: null,
    disclosure: '48 ADJUDICATE records remain: dm-cushion|dm-railtop x28 (embed 0.07-46.75, arc 157.34-1126.08 mm) and dm-railtop|dm-cushion x20 (embed 0.06-1.06, arc 91.87-185.42), all at y 40..44.45 — the rail-length lamination. Nothing here would close it; the law disclaims this tier in its own source: "this slice ladder is not the instrument that can judge it." For scale, ADJUDICATE went 160 -> 48 from red basis to final.' },

  { id: 'A5-10', cls: 'PRINCIPLED CEILING (lane scope)',
    item: 'One lane, one table',
    clips: [],
    card: null,
    disclosure: 'This pack is the Diamond Pro-Am only. The Predator Apex is a sibling lane; cross-table comparisons are the maintainer\'s to make, not this lane\'s. No cross-table claim is offered or implied by any measurement in this pack.' },
];

const cardLineFor = (clip) => {
  // GH-621: a size variant shares the 9 ft render block by reference, so the
  // 9 ft furniture ledger applies to it BY CONSTRUCTION — but this clip has
  // NOT been independently audited, and it renders under the GI honesty gate
  // (no committed bake for its footprint). The plate says exactly that
  // instead of borrowing the 9 ft's "n of N visible" count, which was
  // measured on 9 ft frames and would be a false precision here.
  if (IS_VARIANT) {
    return `SIZE VARIANT (GH-621): furniture ledger INHERITED from diamond_proam_9ft `
      + `(${LEDGER.length} rows apply by shared construction; this clip NOT independently audited) `
      + '· GI HONESTY-GATED (no committed bake for this footprint; pre-GI neutral look) '
      + '· kernel = scratch build, NOT the canonical wasm';
  }
  const rows = LEDGER.filter((r) => r.card && r.clips.includes(clip));
  return `IN-FRAME RESIDUALS, LEDGERED (${rows.length} of ${LEDGER.length} ledger rows are visible in this clip): `
    + rows.map((r) => r.card).join('  ·  ');
};

// ===========================================================================
// THE CARRIED-OPEN REGISTER — deliberately NOT part of the ledger above
// ===========================================================================
// These are the § 21.9 owner items that remain OPEN but bear on no frame of
// any clip: engineering findings about the A4 camera dossier, dossier-law
// questions, and mechanisms built but not yet exercised. They are excluded
// from LEDGER on purpose. Every plate prints "n of N ledger rows are visible
// in this clip", so padding N with rows that could never be visible would
// make every plate understate the visible fraction — the ledger would be
// dishonest in the direction of flattering the pack. They belong in the
// INDEX, clearly labelled as the carried-open register, and this is it.
const CARRIED_OPEN = [
  { id: 'O25', cls: 'OWNER RULING (pending)',
    text: 'tl24\'s half-turn is a DECLARATION, not a solve — an exact degeneracy of the anchor model, so the solver cannot distinguish the two orientations and the choice was made by hand. Disposition wanted.' },
  { id: 'O11 / O20', cls: 'OWNER RULING (pending — one ruling covers both)',
    text: 'Two paired dossier-law questions: per-frame provenance, and how reference pixels are handled. They are coupled and want a single ruling rather than two.' },
  { id: 'O29', cls: 'PRINCIPLED CEILING (blocked on O18)',
    text: '--camswing is single-frame until O18 is answered. O18 admitted exactly one camera (tl24), so there is nothing to swing between.' },
  { id: 'O12', cls: 'OPEN (mechanism built, not yet exercised)',
    text: 'Per-frame half-turn declarations are not yet made. The mechanism exists; no figures are stated in the source.' },
  { id: 'O13', cls: 'OPEN (unmeasured; possibly a real geometry finding)',
    text: 'A render-vs-spec discrepancy that has not been measured. It may be a real geometry finding rather than a render artefact; measurement needed.' },
  { id: 'O14', cls: 'OPEN (not blocking)',
    text: 'Anchor families beyond `nose` have not been added. Not blocking anything in this pack.' },
  { id: 'O15', cls: 'OPEN (recommendation)',
    text: 'The census gate is recommended for permanent adoption rather than per-wave staging.' },
  // ---- the A4 camera-dossier engineering rows, O30-O35 --------------------
  { id: 'O30', cls: 'PRINCIPLED CEILING (instrument defect)',
    text: 'The `rail_top` region rect spans o = 4.2..58.4 mm and straddles CU-04 at 50.8 mm, so only 7 of 49 probes land on RB-02 — purity 0.143. The region was never the surface it is named after.' },
  { id: 'O31', cls: 'PRINCIPLED CEILING (registry field mislabelled)',
    text: '`sigma_parallel_mm` is the L2 norm of the three per-axis 1-sigma values, not a projection onto a weak direction, despite the registry\'s wording. Conditioning is the thing that field was wanted for and it does not report it.' },
  { id: 'O32', cls: 'PRINCIPLED CEILING (end-rail stations cannot resolve the question)',
    text: 'The end rails cannot separate nose from featherstrip at all — 1.32 and 2.42-3.43 px of separation against an edge width of about 1.6 px — yet they contributed roughly 47 of tl24\'s stations.' },
  { id: 'O33', cls: 'PRINCIPLED CEILING (second unmodelled competitor)',
    text: 'The CU-08 crease at o = 22.2 / z = 1.6 is a second unmodelled competitor: median residual +0.23 px, 98.8 % within 2 px, and it took 64 of 169 baseline stations.' },
  { id: 'O34', cls: 'PRINCIPLED CEILING (numerical degeneracy)',
    text: 'At 3840x2160 the normal matrix goes degenerate: sigma = 2 524 292 mm at the LOWEST rms_px on the ladder, 738 mm from truth. More pixels are not more accuracy, and rms_px is the wrong thing to minimise.' },
  { id: 'O35', cls: 'PRINCIPLED CEILING (measurement hygiene; cheap fix)',
    text: 'A concurrent agent overwrote a /tmp render mid-measurement (loopback-tl24.png, sha 0b67da9b... against a registry sha of ed781a93...), silently shifting results. Instruments that share /tmp must bind their inputs by sha.' },
];

const CARD_FOOT = `${W}x${H}  -  30 fps  -  h264 crf 14 preset medium  -  yuv420p`;
const CARD_SUB = IS_VARIANT
  ? `${TABLE}  -  GH-621 size variant (derived from diamond_proam_9ft)`
  : `${TABLE}  -  GH-488D wave A5`;
const CARD_SPECS = {
  fulltable: [{ title: 'FULL-TABLE ORBIT', sub: CARD_SUB, foot: CARD_FOOT }],
  corner: [{ title: 'CORNER POCKET ORBIT', sub: CARD_SUB, foot: CARD_FOOT }],
  pocketing: [
    { title: 'POCKETING  -  REAL TIME', sub: CARD_SUB, foot: CARD_FOOT },
    {
      title: 'POCKETING  -  SLOW MOTION',
      sub: `${CARD_SUB}  -  ${POCKETING.slowRate.toFixed(2)}x`,
      foot: CARD_FOOT,
    },
  ],
};

// ---------------------------------------------------------------------------
// Boot-state scripts, byte-identical in intent to orbit-488d.mjs:116-150 and
// the register capture: the table is the subject, the aim overlay is not.
const HIDE_UI = `(() => {
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

// EMPTY-TABLE law for the ORBITS only (orbitsweep-489.mjs:15). The pocketing
// clip needs its two balls, so it hides the cue stick alone.
const HIDE_BALLS = `(() => {
  const zero = (o) => { o.scale.setScalar(0); o.updateMatrixWorld(true); };
  const groups = new Set();
  window.__dbg.scene.traverse((o) => {
    if (o.name === 'obCueStick') zero(o);
    if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry'
      && Math.abs(o.position.y) < 0.2 && Math.abs(o.position.x) < 1.6
      && Math.abs(o.position.z) < 0.95) {
      if (o.parent && o.parent !== window.__dbg.scene) groups.add(o.parent);
      else zero(o);
    }
  });
  for (const g of groups) for (const c of g.children) zero(c);
  const gu = window.__gi && window.__gi.uniforms;
  if (gu && gu.uSphereCount) gu.uSphereCount.value = 0;
  return true;
})()`;

// Remove the ORBIT obstructions (see THE OBSTRUCTION LAW). Scoped to the two
// empty-table orbits; the pocketing take keeps the room whole because its
// camera is static, inside the room, and nowhere near a wall prop. The hide
// returns the names it actually zeroed so the caller can refuse rather than
// trust that a scene-graph rename left it hiding nothing.
const HIDE_ORBIT_OBSTRUCTION = `(() => {
  const want = ${JSON.stringify(ORBIT_HIDE)};
  const hit = [];
  window.__dbg.scene.traverse((o) => {
    if (!want.includes(o.name)) return;
    hit.push(o.name);
    o.visible = false;
    o.scale.setScalar(0);
    o.updateMatrixWorld(true);
  });
  return JSON.stringify(hit);
})()`;

// Camera-to-geometry clearance over a whole orbit, measured on the LIVE scene
// graph (world AABBs, after the orbit hide has been applied) rather than on a
// model of it — the first seal was lost to geometry this instrument did not
// know was there, and a hand-maintained list of what is in the room would
// have exactly the same blind spot. The room shell itself is excluded by the
// wide-and-flat test: it is the enclosure, not an obstruction, and the orbit
// is knowingly outside it for part of the turn.
const CLEARANCE = (poses, clearMin) => `(() => {
  const poses = ${JSON.stringify(poses)};
  const out = [];
  window.__dbg.scene.updateMatrixWorld(true);
  window.__dbg.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    // EFFECTIVE visibility, not own visibility. The orbit hide names a GROUP
    // (obScorePlaque), and three.js leaves child.visible === true when a parent
    // is hidden — so a leaf test would still see the plaque's two anonymous
    // child meshes. It happened to report them clear only because the group's
    // zero scale collapses their world AABB onto a point that lands at the
    // scene origin, 3.28 m from every pose; had the group carried the position
    // instead of its children, that same point would have sat on the wall and
    // the gate would have refused a scene it had itself just fixed. Ancestor
    // walk removes the coincidence.
    for (let a = o; a; a = a.parent) {
      if (!a.visible || a.scale.x === 0) return;
    }
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox.clone();
    bb.applyMatrix4(o.matrixWorld);
    const mn = [bb.min.x, bb.min.y, bb.min.z], mx = [bb.max.x, bb.max.y, bb.max.z];
    const tris = o.geometry.index ? o.geometry.index.count / 3
      : (o.geometry.attributes.position ? o.geometry.attributes.position.count / 3 : 0);
    if (tris <= 12 && (mx[0] - mn[0]) > 6 && (mx[2] - mn[2]) > 5) return; // room shell
    let anc = o, chain = [];
    while (anc) { if (anc.name) chain.push(anc.name); anc = anc.parent; }
    let best = Infinity, bestV = -1;
    for (let k = 0; k < poses.length; k++) {
      const p = poses[k];
      let s = 0;
      for (let i = 0; i < 3; i++) {
        const d = Math.max(mn[i] - p[i], 0, p[i] - mx[i]);
        s += d * d;
      }
      if (s < best) { best = s; bestV = k; }
    }
    best = Math.sqrt(best);
    if (best <= ${clearMin}) {
      out.push({ name: o.name || '(anon)', chain: chain.join('<'),
        d: Math.round(best * 1e5) / 1e5, v: bestV,
        bb: [mn, mx].map((a) => a.map((n) => Math.round(n * 1e4) / 1e4)) });
    }
  });
  out.sort((a, b) => a.d - b.d);
  return JSON.stringify(out);
})()`;

// Re-hide the aim overlay (and, for the pocketing take, the cue stick) every
// frame: aim.js re-enables the overlay on its own settle timer and a single
// frame of blue chevron would ship inside the deliverable
// (orbitsweep-489.mjs:796-802).
const REHIDE = `(() => {
  window.__dbg.scene.traverse((o) => {
    if (o.name === 'obCueStick') { o.scale.setScalar(0); o.updateMatrixWorld(true); }
    if (/^obAim/.test(o.name || '')
      || (o.parent && /^obAim/.test(o.parent.name || ''))) {
      if (o.layers) o.layers.disableAll();
      if (o.material) o.material.visible = false;
    }
  });
  return true;
})()`;

const sha256File = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const pad4 = (n) => `${n}`.padStart(4, '0');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 1));

// ---------------------------------------------------------------------------
// The shipped encode chain (encode.sh law; orbitsweep-489.mjs:1158 verbatim).
// The argv is RETURNED, not just executed: a provenance record that cannot
// replay itself is not provenance.
const encodeArgv = (seqGlob, mp4, fps = 30) => ['-y', '-loglevel', 'error',
  '-framerate', String(fps), '-i', seqGlob,
  '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '14',
  '-movflags', '+faststart', mp4];

function encodeSeq(seqDir, mp4, fps = 30) {
  const args = encodeArgv(path.join(seqDir, 't%04d.png'), mp4, fps);
  execFileSync('ffmpeg', args);
  return args;
}

/** The x264 SEI option string the delivered bytes carry ABOUT THEMSELVES. It
 * records host-dependent parameters (threads / lookahead_threads); without
 * them the shipped sha is not reproducible on another host. */
function x264Sei(mp4) {
  const head = fs.readFileSync(mp4).subarray(0, 1 << 18).toString('latin1');
  const i = head.indexOf('x264 - core');
  if (i < 0) return null;
  const end = head.indexOf('\u0000', i);
  return head.slice(i, end < 0 ? i + 1400 : end);
}

/** Decode the SHIPPED bytes back. Everything judged and everything LOOKED AT
 * is post-encode; the render buffer is not the deliverable. */
function decodeBack(mp4, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4,
    '-start_number', '0', path.join(dir, 'd%04d.png')]);
  return dir;
}

/** Build one title plate. `spec.prov` / `spec.disclosure` are the wave-A5-R2
 * honest surface; without them the producer draws the original wave-A5 plate,
 * so the sealed plates stay reproducible from this same call site. */
function makeCard(outPng, spec) {
  const args = [CARD_PY, '--out', outPng, '--title', spec.title,
    '--sub', spec.sub, '--foot', spec.foot];
  if (spec.brand) args.push('--brand', spec.brand);
  for (const [k, v] of spec.prov || []) args.push('--prov', `${k}=${v}`);
  if (spec.disclosure) {
    args.push('--disclosure', spec.disclosure,
      '--disclosure-head', spec.disclosureHead || '',
      '--disclosure-foot', spec.disclosureFoot || '');
  }
  const out = execFileSync('python3', args, { encoding: 'utf8' })
    .trim().split('\t');
  return {
    png: outPng, text_px: Number(out[1]), font: out[2], font_sha256: out[3],
    mono_font: out[4] || null, mono_font_sha256: out[5] || null,
    sha256: sha256File(outPng), spec,
  };
}

// ---------------------------------------------------------------------------
// DELIVERED-SIDE FRAME IDENTITY. framemd5 hashes DECODED frames, not the
// compressed bitstream, so it answers the only question that matters about a
// re-cut: does the picture a viewer sees in the body of the clip still consist
// of exactly the same pixels? A bitstream diff cannot answer that (two
// different bitstreams can decode identically, and h264 re-encodes are not
// byte-stable), and a PNG-side comparison answers it about the wrong plane.
function frameMd5s(mp4) {
  const out = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', mp4,
    '-f', 'framemd5', '-hash', 'md5', '-'], { encoding: 'utf8',
    maxBuffer: 1 << 28 });
  return out.split('\n').filter((l) => l && !l.startsWith('#'))
    .map((l) => l.slice(l.lastIndexOf(',') + 1).trim());
}

/** sha256 over the md5 of every NON-CARD frame, in order. The card frames are
 * excluded by construction because they are the thing a re-cut changes; what
 * is being asserted is that nothing ELSE changed. */
function bodyFrameSig(mp4, cardSegs) {
  const md5 = frameMd5s(mp4);
  const isCard = (i) => cardSegs.some(([a, b]) => i >= a && i <= b);
  const body = md5.filter((_m, i) => !isCard(i));
  return { frames: md5.length, body_frames: body.length,
    sha256: createHash('sha256').update(body.join('\n')).digest('hex') };
}

// x264 `preset medium` runs rc-lookahead=40 with mb-tree on, so a frame's
// quantiser decisions depend on the NEXT 40 frames. That is the whole reason
// this rule exists, and it was measured on this pack rather than assumed:
// re-cutting the pocketing clip's SECOND card (frames 130-174) changed exactly
// body frames 91-129 — a contiguous run of 39 ending at the frame before the
// card, i.e. precisely lookahead reach — while leaving keyframe placement
// identical (IDRs at 0/60/130/175 in both). Re-cutting a card that no body
// frame looks forward into changed nothing at all.
const X264_LOOKAHEAD = 40;

/** Which card segments may be re-cut without disturbing a single body frame.
 * A segment is safe when no body frame lies within the lookahead window that
 * ENDS at its first frame; the segment's own trailing edge is safe because
 * scene-cut detection puts an IDR there, which resets prediction. */
function recuttableSegs(cardSegs, total) {
  const isCard = (i) => cardSegs.some(([a, b]) => i >= a && i <= b);
  return cardSegs.map(([a, b]) => {
    const reach = [];
    for (let i = Math.max(0, a - X264_LOOKAHEAD); i < a; i++) {
      if (!isCard(i)) reach.push(i);
    }
    return { seg: [a, b], safe: reach.length === 0,
      body_frames_in_lookahead: reach.length,
      lookahead_window: [Math.max(0, a - X264_LOOKAHEAD), a - 1],
      total };
  });
}

/** Assemble a frame sequence by HARD-LINKING sources into t%04d.png. Links,
 * not copies: every sequence slot IS the source inode, so the per-source
 * sha256 table in the manifest describes the exact bytes the encoder read. */
/** Blank-frame gate on the RENDER plane: every non-card slot of the assembled
 * sequence, checked before the encoder is allowed to run. Complements rather
 * than duplicates `d_*_frame_alive`, which asks the same question of the
 * decoded h264 — this one means a blank frame never reaches the bytes, that
 * one means the bytes themselves carry the claim. */
function assertLive(seqDir, slots, cardSegs, label) {
  const card = (i) => cardSegs.some(([a, b]) => i >= a && i <= b);
  const ranges = [];
  for (let i = 0; i < slots.length; i++) {
    if (card(i)) continue;
    const last = ranges[ranges.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else ranges.push([i, i]);
  }
  const out = path.join(path.dirname(seqDir), `live-${label}.json`);
  const r = spawnSync('python3', [LIVE_PY, '--dir', seqDir,
    '--ranges', JSON.stringify(ranges), '--out', out,
    '--max-min', String(LIVE_MAX_MIN), '--mean-min', String(LIVE_MEAN_MIN)],
  { encoding: 'utf8' });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.status !== 0) {
    if (r.stderr) process.stderr.write(r.stderr);
    console.error(`[488d] REFUSAL: ${label} has blank body frames — the render`
      + ' plane is defective and nothing downstream may be sealed from it.');
    process.exit(2);
  }
  return readJson(out);
}

function assemble(seqDir, slots) {
  fs.rmSync(seqDir, { recursive: true, force: true });
  fs.mkdirSync(seqDir, { recursive: true });
  slots.forEach((src, i) => fs.linkSync(src, path.join(seqDir, `t${pad4(i)}.png`)));
  return slots.length;
}

// ===========================================================================
// CAPTURE CEREMONY
// ===========================================================================
async function boot() {
  const cdp = await import(path.join(webDir, 'tools', 'cdp.mjs'));
  const {
    launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
  } = cdp;
  let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
  let CDPP = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : null;
  let band = null;
  if (!PORT || !CDPP) {
    band = await claimPortBand(9900, 9929);
    PORT = band.http(0); CDPP = band.cdp(0);
  }
  const server = spawnStaticServer(SERVE_DIR, PORT);
  await sleep(800);
  const url = `http://127.0.0.1:${PORT}/app.html?table=${TABLE}`
    + `&cinema=1&seed=7&look=${LOOK}`;
  const chrome = await launchChrome(url, { port: CDPP, width: W, height: H });
  await chrome.send('Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) {
    await sleep(200);
    ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
  }
  if (!ready) throw new Error('app never became ready');
  // D621-FIX condition 4 — THE SPLIT-BRAIN LAW, closed on this instrument.
  // `?table=` is consumed ONLY by scene/table.js resolveBootTableId: it
  // builds the SCENE for that id. The simulated equipment is the settings
  // store, whose default is diamond_proam_9ft, and nothing in the boot path
  // reads the query param into it. So a variant boot rendered the 8 ft room
  // and simulated the 9 ft table — the shipped 8 ft pocketing clip was a
  // 9 ft trajectory (cue ball cushion contact at y = 1.2413 = 1.27 − r, 98 mm
  // past the 8 ft nose). The fix is the app's own sanctioned scripted seam,
  // `__settings.changeEquipment` (never a UI repaint), then a readback of
  // the KERNEL's resolved equipment (`__test.equipment()`) until it names
  // the table, or refuse. The 9 ft path is untouched: its store already
  // names the table, so no call is made.
  const kernelTable = async () => chrome.eval(
    '(window.__test.equipment && window.__test.equipment().table_id) || null')
    .catch(() => null);
  let equipmentPinned = { before: await kernelTable(), changed: false, after: null };
  if (equipmentPinned.before !== TABLE) {
    const ok = await chrome.eval(`window.__settings.changeEquipment('table_id', ${JSON.stringify(TABLE)}, { skipConfirm: true })`)
      .catch((e) => `threw: ${e.message}`);
    equipmentPinned.changed = ok;
    for (let i = 0; i < 100; i++) {
      await sleep(200);
      if (await kernelTable() === TABLE) break;
    }
  }
  equipmentPinned.after = await kernelTable();
  if (equipmentPinned.after !== TABLE) {
    throw new Error(`[488d] REFUSAL: the KERNEL equipment is ${equipmentPinned.after}, not ${TABLE} `
      + `— the scene would render ${TABLE} while the simulation ran on another table `
      + `(the GH-621 split-brain defect); changeEquipment returned ${JSON.stringify(equipmentPinned.changed)}`);
  }
  await sleep(600); // let the re-rack / rebuild settle before the GI poll
  // GI settle: __gi.state is a PROPERTY, not a call (register-capture note)
  let rig = null;
  for (let i = 0; i < 200; i++) {
    const st = await chrome.eval(`(() => {
      const s = window.__gi && window.__gi.state;
      return JSON.stringify({
        giReady: s ? !!s.ready : null, baked: s ? !!s.baked : null,
        fits: s ? s.fits : null,
        fixture: s ? s.fixture : null, bakeClass: s ? s.bakeClass : null,
        exposure: window.__dbg && window.__dbg.renderer
          && window.__dbg.renderer.toneMappingExposure,
        toneMapping: window.__dbg && window.__dbg.renderer
          && window.__dbg.renderer.toneMapping,
      });
    })()`).catch(() => null);
    if (st) {
      rig = JSON.parse(st);
      if (rig.giReady && (rig.baked || (IS_VARIANT && rig.fits === false))) break;
    }
    await sleep(200);
  }
  // GH-621: a size variant WITHOUT a committed footprint bake boots under
  // gi.js's honesty gate (fits === false, uGiOn = 0). Accepted ONLY for a
  // variant and recorded on the rig; the 9 ft keeps ready+baked+bakeClass
  // 'pool' or refuses, byte-for-byte. Since D621-LOOK the 8/7 ft beds have
  // their own bakes, so the normal path is baked + pool_8ft / pool_7ft.
  const giGated = !!rig && rig.giReady && rig.fits === false && !rig.baked && IS_VARIANT;
  if (!rig || !rig.giReady || (!rig.baked && !giGated)) {
    throw new Error(`GI never settled: ${JSON.stringify(rig)}`);
  }
  rig.gi_gate = giGated
    ? 'HONESTY-GATED: no committed GI bake for this footprint (#52/#89 law)' : 'baked';
  rig.equipment_pinned = equipmentPinned; // kernel table before/after the pin
  for (const k of ['fixture', 'bakeClass']) {
    if (rig[k] !== RIG_EXPECT[k] && !(giGated && k === 'bakeClass')) {
      throw new Error(`rig drift: ${k} ${rig[k]} != ${RIG_EXPECT[k]}`);
    }
  }
  console.log('[rig]', JSON.stringify(rig));
  const ua = await chrome.eval('navigator.userAgent').catch(() => null);
  const teardown = async () => {
    const gone = await chrome.closeAndWait();
    if (gone === false) console.error('WARN: chrome teardown unconfirmed');
    await stopStaticServer(server);
    if (band && band.release) await band.release();
  };
  return { chrome, sleep, rig, url, ua, teardown };
}

const waitFrame = (chrome) => chrome.eval(
  'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');

async function shoot(chrome, file) {
  const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}

async function poseOrRefuse(chrome, sleep, pose, what) {
  for (let k = 0; k < 30; k++) {
    if (await chrome.eval(`__test.cameraPose(${JSON.stringify(pose)})`)) return;
    await sleep(100);
  }
  throw new Error(`${what}: cameraPose rejected`);
}

/** Empty-table orbit capture — the proven A2 path (live RAF + cameraPose +
 * Page.captureScreenshot), which two independent boots at HEAD reproduced
 * byte-identically 8/8. */
/** Refuse if any pose of `name` comes within ORBIT_CLEAR_MIN of scene geometry.
 * Runs against the live graph AFTER the orbit hide, so it measures the scene
 * that is about to be photographed, not the one in the source. */
async function assertClearance(ctx, name, n) {
  const o = ORBITS[name];
  const run = n ?? o.run;
  const poses = [];
  for (let v = 0; v < run; v++) poses.push(orbitPoseThree(o, v, run));
  const hits = JSON.parse(await ctx.chrome.eval(CLEARANCE(poses, ORBIT_CLEAR_MIN)));
  const want = CLEAR_SELFTEST ? CLEAR_SELFTEST_EXPECT[name] : false;
  if (hits.length) {
    console.error(CLEAR_SELFTEST
      ? `[clear] SELFTEST: ${name} gate FIRED within ${ORBIT_CLEAR_MIN} m of`
        + ` ${hits.length} mesh(es):`
      : `[488d] REFUSAL: the ${name} orbit path passes within ${ORBIT_CLEAR_MIN}`
        + ` m of ${hits.length} mesh(es) — a camera inside scene geometry`
        + ' renders that geometry, not the subject:');
    for (const h of hits.slice(0, 8)) {
      console.error(`  ${h.chain || h.name} d=${h.d} m at pose v${h.v}`
        + ` bb ${JSON.stringify(h.bb)}`);
    }
    if (CLEAR_SELFTEST) {
      if (!want) {
        console.error(`[clear] SELFTEST BROKEN: ${name} was measured clear on`
          + ' the defective take, so a hit here is the gate inventing one.');
        process.exit(4);
      }
      // match on the ANCESTOR CHAIN: ORBIT_HIDE names a group, and the meshes
      // that actually carry the geometry under it are anonymous
      const names = [...new Set(hits.flatMap(
        (h) => (h.chain || h.name || '').split('<')))];
      if (!ORBIT_HIDE.every((h) => names.includes(h))) {
        console.error(`[clear] SELFTEST BROKEN: fired, but not on ${JSON.stringify(
          ORBIT_HIDE)} — got ${JSON.stringify(names)}. Firing on the wrong mesh`
          + ' is not evidence it can see the right one.');
        process.exit(4);
      }
      return { poses: run, clear_min: ORBIT_CLEAR_MIN, hits, selftest: 'FIRED' };
    }
    console.error('  Either exclude it from the capture (ORBIT_HIDE, only if'
      + ' it contributes no intended pixels) or re-solve the path.');
    process.exit(2);
  }
  if (want) {
    // Only reachable with the hide skipped, i.e. with the plaque back on the
    // path. Clear here means the gate cannot see the obstruction that actually
    // ruined a seal, so it can never have been the reason a later run was green.
    console.error(`[clear] SELFTEST BROKEN: ${name} reports clear with the orbit`
      + ' hide skipped — the gate cannot see the known obstruction.');
    process.exit(4);
  }
  console.log(`[clear] ${name}: ${run} poses, no mesh within ${ORBIT_CLEAR_MIN} m`
    + (CLEAR_SELFTEST ? ' (SELFTEST: correctly quiet — never obstructed)' : ''));
  return { poses: run, clear_min: ORBIT_CLEAR_MIN, hits };
}

async function captureOrbit(ctx, name, dir, frames) {
  const { chrome, sleep } = ctx;
  const o = ORBITS[name];
  const n = frames ?? o.run;
  await assertClearance(ctx, name, n);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (let v = 0; v < n; v++) {
    await poseOrRefuse(chrome, sleep, orbitPose(o, v, n), `${name} v${v}`);
    await chrome.eval(REHIDE);
    await waitFrame(chrome);
    const f = path.join(dir, `v${pad4(v)}.png`);
    await shoot(chrome, f);
    files.push(f);
  }
  return files;
}

// record.ts:17-20 emits kinds as either a bare string or a single-key object
// carrying the payload ({BallPocket: {ball, pocket}}).
const kindOf = (e) => (typeof e.kind === 'string' ? e.kind : Object.keys(e.kind || {})[0]);
const dataOf = (e) => (typeof e.kind === 'string' ? {} : (e.kind[kindOf(e)] || {}));

const READ_BED = 'JSON.stringify(__test.balls().filter((b) => !b.pocketed)'
  + '.map((b) => ({ id: b.id, visible: b.visible, scale: b.scale,'
  + ' pos: b.pos.map((v) => Math.round(v * 1e5) / 1e5) })))';

/** Lay the two balls, arm the static camera, fire `shot`, and return the
 * kernel timeline WITHOUT judging it. Every caller — the pinned take, the
 * probe rehearsal and the phi solve — goes through this one path, so a
 * rehearsal or a solve trial stages exactly what the take stages. A solve
 * that ran a different code path would be solving a different shot. */
async function runTake(ctx, shot) {
  const { chrome, sleep } = ctx;
  // __test.layout returns undefined (game.js:883 has no return value), so
  // the placement is verified by READING the bed back rather than by
  // trusting a return code that does not exist
  await chrome.eval(`__test.layout(${JSON.stringify(POCKETING.layout)})`);
  await sleep(300);
  const placed = JSON.parse(await chrome.eval(READ_BED));
  const wantIds = POCKETING.layout.map((s) => s.id);
  if (placed.length !== wantIds.length
      || !wantIds.every((id) => placed.some(
        (b) => b.id === id && b.visible && b.scale > 0))) {
    throw new Error(`pocketing: layout did not take — on bed ${
      JSON.stringify(placed)}, wanted ${JSON.stringify(wantIds)}`);
  }
  const armed = await chrome.eval(
    "__test.cameraScript({ moves: [{ t0: 0, t1: 1e6, kind: 'pose', "
    + `cam: ${JSON.stringify(POCKETING.cam.cam)}, `
    + `look: ${JSON.stringify(POCKETING.cam.look)}, `
    + `fov: ${POCKETING.cam.fov} }] })`);
  if (!armed) throw new Error('pocketing: cameraScript rejected');
  // game.js:905-917 — the previous shot's record, sampler and g.duration
  // SURVIVE a layout. Polling `duration > 0` after firing would therefore
  // read the PREVIOUS take's number and __test.events() the previous take's
  // stream, and a solve sweep would report every trial as a copy of trial 1.
  // The generation counter (game.js:656, shotIndex += 1) is the only honest
  // "this is a new record" signal, so the take is bound to it.
  const before = JSON.parse(await chrome.eval('JSON.stringify(__test.bed())'));
  // game.js:615 returns null on success and an ERROR STRING otherwise — it
  // never returns false. A falsy-check here would swallow "not in an aiming
  // state" and then judge the previous shot's events.
  const fired = await chrome.eval(
    `JSON.stringify(__test.shoot(${JSON.stringify(shot)}) ?? null)`);
  if (fired !== 'null') throw new Error(`pocketing: shoot refused — ${fired}`);
  // shoot() is synchronous (engine.simulateJson runs inline), so one poll is
  // normally enough; the loop only covers a slow wasm call.
  let bed = before;
  for (let i = 0; i < 100 && bed.shotIndex === before.shotIndex; i++) {
    await sleep(100);
    bed = JSON.parse(await chrome.eval('JSON.stringify(__test.bed())'));
  }
  if (bed.shotIndex === before.shotIndex) {
    throw new Error('pocketing: shotIndex never advanced — no new record');
  }
  const duration = bed.duration;
  const evs = JSON.parse(await chrome.eval('JSON.stringify(__test.events())'));
  const pocketed = evs.filter((e) => kindOf(e) === 'BallPocket')
    .map((e) => [dataOf(e).ball, Number(e.t.toFixed(4))]);
  return {
    shot,
    duration: Number.isFinite(duration) ? duration : 0,
    // the kernel seed is g.seed*1000 + shotIndex (game.js:618): the take is
    // only reproducible if it is the FIRST shot of a fresh boot, so both
    // numbers ride into the manifest rather than being assumed
    seed: before.seed,
    shotIndex: before.shotIndex,
    placed,
    pocketed,
    hit: evs.find((e) => kindOf(e) === 'BallBall') || null,
    pot: evs.find((e) => kindOf(e) === 'BallPocket'
      && dataOf(e).ball === POCKETING.objId) || null,
    scratch: evs.find((e) => kindOf(e) === 'BallPocket'
      && dataOf(e).ball === 0) || null,
    trace: evs.map((e) => [Number(e.t.toFixed(4)), kindOf(e), dataOf(e)]),
    events: evs.map((e) => ({ t: Number(e.t.toFixed(5)), kind: kindOf(e) })),
  };
}

/** When the realtime take ends: RT_DWELL past the cue ball's FIRST cushion
 * contact after the cut. Derived from the take's own event stream rather than
 * pinned as an offset from the pot, because the thing worth holding on is the
 * rebound, and where the rebound falls relative to the pot is a property of
 * the shot, not a number I get to choose. A take with no cue-ball cushion
 * contact is refused rather than silently trimmed to the pot: the clip's
 * claim — the cue ball left along the tangent line instead of following the
 * object in — would then be unsupported by anything on screen. */
function rtEndOf(t) {
  const cush = t.trace.find(([tt, k, d]) => tt > t.hit.t && d.ball === 0
    && (k === 'BallLinearCushion' || k === 'BallCircularCushion'));
  if (!cush) {
    throw new Error('pocketing: the cue ball never reached a cushion after the'
      + ' cut — the tangent-departure claim has nothing to show. trace '
      + JSON.stringify(t.trace.filter(([, k]) => k !== 'Transition')));
  }
  return {
    tCush: cush[0],
    cushKind: cush[1],
    cushSeg: cush[2].seg ?? cush[2].arc,
    tRtEnd: Number(Math.min(t.duration, cush[0] + RT_DWELL).toFixed(5)),
  };
}

/** Step the kernel across `[0, tEnd]` and read both ball centres back off the
 * bed at each step, in KERNEL coordinates. `__test.balls()` reports three.js
 * positions (`[ky, kz, kx]` per coords.js:14), so the axes are unswapped here
 * rather than at every call site. This is a measurement of the take, which is
 * the only thing a framing claim about the take can honestly be made from. */
async function sampleTake(ctx, tEnd, hz) {
  const n = Math.max(2, Math.round(tEnd * hz) + 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(tEnd, (i * tEnd) / (n - 1));
    // eslint-disable-next-line no-await-in-loop
    await ctx.chrome.eval(`__test.renderAt(${t}, ${1 / 60})`);
    // eslint-disable-next-line no-await-in-loop
    const bed = JSON.parse(await ctx.chrome.eval(READ_BED));
    out.push({
      t: Number(t.toFixed(5)),
      balls: bed.map((b) => ({ id: b.id, k: [b.pos[2], b.pos[0], b.pos[1]] })),
    });
  }
  return out;
}

/** Worst frame occupancy over a sampled take, and which sample bound it. */
function framingOf(samples) {
  let worst = { fill: -1 };
  for (const s of samples) {
    for (const b of s.balls) {
      const f = poseFill(POCKETING.cam, b.k, BALL_R);
      const m = Math.max(f.x, f.y);
      if (m > worst.fill) {
        worst = { fill: m, t: s.t, id: b.id, x: f.x, y: f.y };
      }
    }
  }
  return worst;
}

/** The PINNED take, judged. Shared by --probe and --sweep so the rehearsal is
 * the take; a rehearsal that stages differently rehearses nothing. */
async function pocketingShot(ctx) {
  const t = await runTake(ctx, POCKETING.shot);
  // the OBJECT ball must be the one swallowed. A scratch also emits
  // BallPocket, and a take that only proves "something went in" would ship a
  // foul as the pocketing showcase.
  if (!(t.duration > 0) || !t.hit || !t.pot) {
    throw new Error(`pocketing: shot did not pot ball ${POCKETING.objId}`
      + ` (duration ${t.duration}, phi ${POCKETING.shot.phi}) — events `
      + JSON.stringify(t.trace));
  }
  if (t.scratch) {
    throw new Error(`pocketing: the cue ball scratched at t=${t.scratch.t}`
      + ` (phi ${POCKETING.shot.phi})`);
  }
  const rt = rtEndOf(t);
  // THE FRAMING, RE-CHECKED ON THIS RUN. PK_FOV was solved on a measurement,
  // but a solved constant that nothing re-checks is just an old measurement
  // wearing a comment. Every capture re-samples the take it is about to render
  // and refuses if any ball leaves the declared cap — so the pin cannot rot
  // past a physics change, a table-definition change or a re-solved phi.
  const samples = await sampleTake(ctx, rt.tRtEnd, 60);
  const framing = framingOf(samples);
  if (!(framing.fill <= POCKETING.cap)) {
    throw new Error(`pocketing: ball ${framing.id} reaches ${
      framing.fill.toFixed(4)} of the frame half-extent at t=${framing.t}`
      + ` (x ${framing.x.toFixed(4)} y ${framing.y.toFixed(4)}), past the cap `
      + `${POCKETING.cap} at fov ${POCKETING.cam.fov} — re-solve with`
      + ' `--probe --pk-solve`');
  }
  // THE DEPARTURE, CHECKED. The clip's second claim is that the cue ball left
  // along the tangent line instead of chasing the object into the pocket. The
  // scratch assertion above only rules out the foul that actually happened; a
  // cue ball that rattles into the cushion a hand's width from the same corner
  // still reads as a near-miss on screen. So the contact's corner clearance is
  // measured off the bed and gated.
  const atCush = samples.reduce((a, s) => (Math.abs(s.t - rt.tCush)
    < Math.abs(a.t - rt.tCush) ? s : a));
  const cueK = (atCush.balls.find((b) => b.id === 0) || {}).k;
  if (!cueK) {
    throw new Error(`pocketing: the cue ball is not on the bed at t=${
      atCush.t}, where its own cushion event says it should be`);
  }
  // D621-FIX: the corner clearance is measured against THIS table's foot
  // rail (BED.width), not a 9 ft literal — the first variant re-cut printed
  // clear[] summing to 1.27 on an 8 ft manifest.
  const clear = [BED.width / 2 - cueK[0], BED.width / 2 + cueK[0]];
  if (!(Math.min(...clear) >= CLEAR_MIN)) {
    throw new Error(`pocketing: the cue ball meets the cushion at kernel x=${
      cueK[0].toFixed(4)}, only ${Math.min(...clear).toFixed(3)} m from a`
      + ` foot-rail corner (min ${CLEAR_MIN.toFixed(3)}) — that reads as a`
      + ' near-scratch, not a tangent departure');
  }
  await ctx.chrome.eval(REHIDE);
  return {
    ...t, ...rt, tHit: t.hit.t, tPot: t.pot.t, framing, samples,
    cushAt: { t: atCush.t, k: cueK.map(R4), clear: clear.map(R4) },
  };
}

/** Deterministic phi sweep. Cut-induced throw rotates the object ball off the
 * ghost-ball line by an amount no closed form in this repo predicts, so the
 * compensation is MEASURED on this kernel and then pinned. Prints one row per
 * trial; nothing is auto-selected, because a capture-time search would make
 * the deliverable depend on a search rather than on a constant. */
async function solveShot(ctx, offsets) {
  const rows = [];
  // the first offset is run AGAIN at the end. game.js:618 seeds every shot
  // with g.seed*1000 + shotIndex, so trial N of a sweep is not seeded like
  // trial 1, and a sweep would only be transferable to the pinned (first-of-
  // boot) take if that seed does not move this two-ball result. That is an
  // empirical question, so it is asked rather than assumed: if the repeat
  // disagrees with the original the whole sweep is declared void.
  const seq = offsets.concat([offsets[0]]);
  for (let k = 0; k < seq.length; k++) {
    const off = seq[k];
    const shot = { ...POCKETING.shot, phi: Number((POCKETING.phiGeom + off / 1000).toFixed(6)) };
    // eslint-disable-next-line no-await-in-loop
    const t = await runTake(ctx, shot);
    const row = {
      mrad: off,
      phi: shot.phi,
      shotIndex: t.shotIndex,
      pot: !!t.pot,
      tPot: t.pot ? Number(t.pot.t.toFixed(4)) : null,
      scratch: !!t.scratch,
      pocketed: t.pocketed,
      duration: Number(t.duration.toFixed(4)),
    };
    rows.push(row);
    console.log(`[solve] ${JSON.stringify(row)}`);
  }
  const a = rows[0];
  const b = rows[rows.length - 1];
  const same = a.pot === b.pot && a.scratch === b.scratch
    && a.tPot === b.tPot && a.duration === b.duration;
  console.log(`[solve] seed-invariance (shotIndex ${a.shotIndex} vs `
    + `${b.shotIndex} at ${a.mrad} mrad): ${same ? 'HOLDS' : 'VIOLATED'}`);
  if (!same) {
    throw new Error('solve: outcome depends on shotIndex/seed — this sweep is'
      + ' void, re-boot per trial before pinning anything');
  }
  return rows.slice(0, -1);
}

/** Render one deterministic take: `times` kernel seconds -> PNG files. */
async function renderTake(ctx, dir, prefix, times) {
  const { chrome } = ctx;
  const files = [];
  for (let k = 0; k < times.length; k++) {
    await chrome.eval(`__test.renderAt(${times[k]}, ${1 / 60})`);
    const f = path.join(dir, `${prefix}${pad4(k)}.png`);
    await shoot(chrome, f);
    files.push(f);
  }
  return files;
}

/** Last index whose bytes differ from its predecessor. The motion segment is
 * TRIMMED to it and everything after becomes a disclosed, hold-bound static
 * tail — 489's structure, and the reason their rt seg ends at v88 while the
 * take runs to v142. Measured, never assumed: the judge's dup bar would fire
 * on any static pair left inside a motion segment. */
function lastMovingIndex(files) {
  let last = 0;
  let prev = sha256File(files[0]);
  for (let i = 1; i < files.length; i++) {
    const s = sha256File(files[i]);
    if (s !== prev) last = i;
    prev = s;
  }
  return last;
}

// ===========================================================================
// MODES
// ===========================================================================
const MODE_FN = {};

// ---------------------------------------------------------------------------
// --probe: framing/shot rehearsal. Renders a handful of named poses and the
// pocketing take at a few kernel times so the framing can be LOOKED AT before
// 1700 frames are committed to it. Produces no deliverable and no verdict.
MODE_FN.probe = async () => {
  const dir = path.resolve(__pathOpt('--out', { default: '/tmp/ob-488d-a5/probe', tag: 'orbitsweep-488d' }));
  fs.mkdirSync(dir, { recursive: true });
  // --frame-solve -> re-derive the fulltable framing. Pure geometry, so it
  // runs BEFORE any browser boot: bisect the minimum containing radius for
  // each candidate look height and report the argmin. The winner is PINNED in
  // FT_LOOK_Z / FT_R; nothing is read back at capture time.
  if (argv.includes('--frame-solve')) {
    const tan = Math.tan(FT_ELEV);
    const minR = (lookZ) => {
      let lo = 2.0;
      let hi = 8.0;
      for (let i = 0; i < 50; i += 1) {
        const r = (lo + hi) / 2;
        const f = frameFill(r, lookZ + r * tan, FT_FOV, lookZ);
        if (Math.max(f.fv, f.fh) <= FT_CAP) hi = r; else lo = r;
      }
      return hi;
    };
    let best = null;
    for (let z = -1.0; z <= -0.4 + 1e-9; z += 0.005) {
      const lookZ = Number(z.toFixed(4));
      const r = minR(lookZ);
      if (!best || r < best.r) best = { lookZ, r };
    }
    const h = best.lookZ + best.r * tan;
    const f = frameFill(best.r, h, FT_FOV, best.lookZ);
    console.log(`[frame-solve] argmin lookZ ${best.lookZ} r ${best.r.toFixed(4)}`
      + ` h ${h.toFixed(4)} fill V ${f.fv.toFixed(4)} H ${f.fh.toFixed(4)}`
      + ` (cap ${FT_CAP})`);
    console.log(`[frame-solve] PINNED  lookZ ${FT_LOOK_Z} r ${FT_R} h ${FT_H}`
      + ` fill V ${FT_FILL.fv.toFixed(4)} H ${FT_FILL.fh.toFixed(4)}`);
    return;
  }
  // --solve A:B:S -> sweep phi offsets (mrad) and print the pot/scratch table
  // instead of rehearsing. Diagnostic path; the chosen value is PINNED in
  // PHI_THROW_MRAD, never read back at capture time.
  const solveArg = argOf('--solve', null);
  const ctx = await boot();
  try {
    await ctx.sleep(1200);
    await ctx.chrome.eval(HIDE_UI);
    await ctx.sleep(300);
    if (solveArg !== null) {
      const [a, b, s] = String(solveArg).split(':').map(Number);
      if (![a, b, s].every(Number.isFinite) || !(s > 0) || b < a) {
        throw new Error(`--solve wants A:B:S (mrad), got ${solveArg}`);
      }
      const offs = [];
      for (let m = a; m <= b + 1e-9; m += s) offs.push(Number(m.toFixed(3)));
      const rows = await solveShot(ctx, offs);
      const good = rows.filter((r) => r.pot && !r.scratch);
      console.log(`[solve] potting-and-clean offsets: ${
        JSON.stringify(good.map((r) => r.mrad))}`);
      await ctx.teardown();
      return;
    }
    // --pk-solve: report the smallest fov that keeps the whole take inside
    // PK_CAP. It cannot go through pocketingShot, which ASSERTS the cap and
    // would refuse before it could measure why — so it stages the same take
    // through the same runTake and does the measurement itself. Diagnostic
    // path; the answer is PINNED in PK_FOV, never read back at capture time.
    if (argv.includes('--pk-solve')) {
      const t0 = await runTake(ctx, POCKETING.shot);
      const rt0 = rtEndOf(t0);
      const smp = await sampleTake(ctx, rt0.tRtEnd, 60);
      console.log(`[pk-solve] window 0 .. ${rt0.tRtEnd} s (${rt0.cushKind} seg`
        + ` ${rt0.cushSeg} @ ${rt0.tCush} + dwell ${RT_DWELL}), ${smp.length}`
        + ' samples');
      const need = (fov) => {
        const save = POCKETING.cam.fov;
        POCKETING.cam.fov = fov;
        const w = framingOf(smp);
        POCKETING.cam.fov = save;
        return w;
      };
      for (const fov of [30, 32, 34, 36, 38, 40, 42]) {
        const w = need(fov);
        console.log(`[pk-solve] fov ${fov}: worst ${w.fill.toFixed(4)}`
          + ` (ball ${w.id} @ t=${w.t}, x ${w.x.toFixed(3)} y ${w.y.toFixed(3)})`);
      }
      let lo = 10; let hi = 80;
      for (let i = 0; i < 60; i++) {
        const m = (lo + hi) / 2;
        if (need(m).fill <= PK_CAP) hi = m; else lo = m;
      }
      console.log(`[pk-solve] argmin fov for cap ${PK_CAP}: ${hi.toFixed(4)}`
        + `  -> PIN ${Math.ceil(hi)} (round up: the argmin sits ON the cap and`
        + ' pinning it leaves the guard deciding on the last float bit)');
      console.log(`[pk-solve] PINNED fov ${PK_FOV}: worst ${
        need(PK_FOV).fill.toFixed(4)}`);
      await ctx.teardown();
      return;
    }
    const st = await pocketingShot(ctx);
    console.log('[probe] shot', JSON.stringify({
      duration: st.duration, tHit: st.tHit, tPot: st.tPot,
      tCush: st.tCush, cush: `${st.cushKind}#${st.cushSeg}`, tRtEnd: st.tRtEnd,
    }));
    console.log('[probe] trace', JSON.stringify(
      st.trace.filter(([, k]) => k !== 'BallTable' && k !== 'Transition')));
    // the PRE-shot placement, read back off the bed inside pocketingShot.
    // Reading it here would report where the balls ENDED, which says nothing
    // about whether the take was staged where the geometry says it was.
    console.log('[probe] placed', JSON.stringify(st.placed));
    console.log(`[probe] framing: worst ${st.framing.fill.toFixed(4)} of the`
      + ` frame half-extent (ball ${st.framing.id} @ t=${st.framing.t},`
      + ` x ${st.framing.x.toFixed(3)} y ${st.framing.y.toFixed(3)}),`
      + ` cap ${POCKETING.cap} at fov ${POCKETING.cam.fov}`);
    // WHERE the cue ball actually meets the cushion, read off the bed. The
    // tangent-line model that chose CUT_DEG predicts one place; throw and the
    // cue ball's post-impact spin put it somewhere else, and the design note
    // is only allowed to claim the measured number.
    console.log(`[probe] cue at cushion (t=${st.cushAt.t}): kernel ${
      JSON.stringify(st.cushAt.k)} — clear of the foot-rail corners by `
      + `${st.cushAt.clear[0]} m (right) and ${st.cushAt.clear[1]} m (left),`
      + ` min ${CLEAR_MIN.toFixed(4)}`);
    const tEnd = st.tRtEnd;
    // the binding sample is rehearsed too: rehearsing only the story beats is
    // how fov 32 shipped with the cue ball cut in half at t=0
    for (const t of [0, st.tHit - 0.1, st.tHit + 0.05, (st.tHit + st.tPot) / 2,
      st.tPot - 0.03, st.tPot + 0.15, st.tCush, st.framing.t, tEnd]) {
      const tt = Math.max(0, Math.min(st.duration, t));
      await ctx.chrome.eval(`__test.renderAt(${tt}, ${1 / 60})`);
      await shoot(ctx.chrome, path.join(dir, `pocketing-t${tt.toFixed(3)}.png`));
    }
    console.log(`[probe] pocketing camera ${JSON.stringify(POCKETING.cam)}`);
    // orbits last: HIDE_BALLS is irreversible in-session, and renderAt has
    // already parked the RAF loop, so re-boot for the live-RAF orbit path
    await ctx.teardown();
    const ctx2 = await boot();
    try {
      await ctx2.sleep(1200);
      await ctx2.chrome.eval(HIDE_UI);
      await ctx2.chrome.eval(HIDE_BALLS);
      const hid = CLEAR_SELFTEST
        ? [] : JSON.parse(await ctx2.chrome.eval(HIDE_ORBIT_OBSTRUCTION));
      console.log(CLEAR_SELFTEST
        ? `[probe] orbit hide SKIPPED — clearance negative control, expecting`
          + ` ${JSON.stringify(CLEAR_SELFTEST_EXPECT)}`
        : `[probe] orbit hide ${JSON.stringify(hid)}`);
      await ctx2.sleep(300);
      for (const name of ['fulltable', 'corner']) {
        const o = ORBITS[name];
        // Clearance BEFORE framing: a pose that is inside geometry has no
        // framing to check. This is the gate the first seal did not have.
        await assertClearance(ctx2, name);
        // In the negative control the scene is deliberately WRONG (the plaque is
        // back on the path), so its framing numbers would be meaningless and
        // must not be printed next to the real ones.
        if (CLEAR_SELFTEST) continue;
        // the four cardinal bearings, plus — for fulltable — the two the
        // containment model says BIND. Rehearsing only the cardinals is how
        // the first draft shipped a framing that clipped at az 61: the worst
        // bearing was never rendered.
        const azs = [-90, 0, 90, 180].concat(
          name === 'fulltable' ? [FT_FILL.azV, FT_FILL.azH] : []);
        for (const azDeg of azs) {
          const v = Math.round((o.run * (((azDeg + 90) % 360) + 360)) / 360) % o.run;
          const pose = orbitPose(o, v, o.run);
          await poseOrRefuse(ctx2.chrome, ctx2.sleep, pose, `${name} az${azDeg}`);
          await ctx2.chrome.eval(REHIDE);
          await waitFrame(ctx2.chrome);
          await shoot(ctx2.chrome, path.join(dir, `${name}-az${azDeg}.png`));
          if (name !== 'fulltable') continue;
          // MODEL vs RENDERER. frameFill is my own re-derivation of three.js's
          // look-at basis and projection; if it is wrong, every containment
          // claim in the report is wrong with it. So the same eight corners
          // go through the page's own camera matrices and the two are
          // differenced. A model that agreed only at the cardinals would not
          // be a model.
          const raw = await ctx2.chrome.eval(PROJECT_CORNERS);
          if (typeof raw !== 'string' || raw[0] !== '[') {
            throw new Error(`probe: corner projection unavailable — ${raw}`);
          }
          const page = JSON.parse(raw);
          // orbitPose reports az from v; use THAT, not the requested azDeg,
          // because v is rounded to a whole frame
          const azReal = -90 + (360 * v) / o.run;
          const model = frameNdc(o, azReal);
          let dx = 0;
          let dy = 0;
          for (let i = 0; i < model.length; i += 1) {
            dx = Math.max(dx, Math.abs(model[i][0] - page[i][0]));
            dy = Math.max(dy, Math.abs(model[i][1] - page[i][1]));
          }
          const pmax = page.reduce((m, p) => Math.max(m, Math.abs(p[0]),
            Math.abs(p[1])), 0);
          console.log(`[probe] fulltable az${azDeg} (v${v}, ${azReal.toFixed(2)}`
            + `deg): model-vs-page max |dNDC| x ${dx.toExponential(2)}`
            + ` y ${dy.toExponential(2)}; page worst |ndc| ${pmax.toFixed(4)}`);
        }
        console.log(`[probe] ${name}: r=${o.r} h=${o.h} fov=${o.fov}`
          + ` centre=${JSON.stringify(o.center)}`
          + (name === 'fulltable'
            ? ` cabinet fill V ${FT_FILL.fv.toFixed(4)} @az${FT_FILL.azV}`
              + ` H ${FT_FILL.fh.toFixed(4)} @az${FT_FILL.azH} (cap ${FT_CAP})` : ''));
      }
    } finally { await ctx2.teardown(); }
    if (CLEAR_SELFTEST) {
      console.log('[clear] SELFTEST PASS: with the orbit hide skipped the gate'
        + ` fired on ${JSON.stringify(ORBIT_HIDE)} for every orbit expected to`
        + ' be obstructed and stayed quiet on every orbit that never was.'
        + ' The green printed by a normal --probe is therefore a measurement,'
        + ' not a default.');
      return;
    }
    console.log(`PROBE -> ${dir}`);
    return;
  } catch (e) {
    await ctx.teardown();
    throw e;
  }
};

// ---------------------------------------------------------------------------
// --sweep: capture, cards, shipped encode, byte-bound manifest.
MODE_FN.sweep = async () => {
  fs.mkdirSync(PACK, { recursive: true });
  const runDir = path.join(PACK, 'run');
  fs.mkdirSync(runDir, { recursive: true });
  const cardDir = path.join(PACK, 'cards');
  fs.mkdirSync(cardDir, { recursive: true });

  const man = {
    lane: IS_VARIANT ? 'GH-621 size variant' : 'GH-488D wave A5',
    table: TABLE, look: LOOK, prefix: PREFIX,
    // GH-621 provenance: the bed the poses were derived from, the geometry
    // twin the cabinet box came from, the served web root and the kernel it
    // carried (a scratch overlay is NOT the canonical binary).
    bed: { length: BED.length, width: BED.width, cushionWidth: BED.cushionWidth },
    twin: { path: CANON_SPECS[TABLE], sha256: TWIN_SHA, en01_mm: EN01 },
    served_web_dir: SERVE_DIR,
    served_kernel_version: kernelVersionOf(SERVE_DIR),
    canonical_kernel_version: kernelVersionOf(webDir),
    fulltable_r_source: IS_VARIANT ? 'solved at load (solveFtR, same criterion as the 9 ft pin)' : 'pinned 3.2830',
    raster: [W, H], fps: 30,
    git: {
      head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(),
      dirty: execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' })
        .trim().split('\n').filter(Boolean).length,
    },
    argv: process.argv.slice(1),
    ffmpeg: execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' })
      .split('\n').slice(0, 2).join(' | ').trim(),
    node: process.version,
    judge_path_real: JUDGE_PY,
    judge_sha256: sha256File(JUDGE_PY),
    geometry: {
      orbits: ORBITS, pocketing: POCKETING,
      derivation: {
        cabinet_box_m: { half_w: R4(CAB_HW), half_l: R4(CAB_HL),
          floor_z: R4(FLOOR_Z), rail_top_z: R4(RAIL_TOP_Z) },
        cabinet_half_diag_m: R4(CAB_HDIAG), assembly_mid_z_m: R4(CAB_MID_Z),
        fulltable_elev_deg: 25, fulltable_cap: FT_CAP,
        fulltable_look_z: FT_LOOK_Z, fulltable_r_m: FT_R,
        // measured, not asserted: the containment margin actually achieved by
        // the pinned pose, recomputed on this run's constants
        fulltable_fill: { v: R4(FT_FILL.fv), h: R4(FT_FILL.fh) },
        half_fov_h_deg: R4((FT_HALF_H * 180) / Math.PI),
      },
    },
    cards: {}, clips: {}, boots: [],
  };

  // ---- clip 1: pocketing (balls present; renderAt parks the RAF loop, so
  // it gets its own boot and runs FIRST)
  //
  // GH-621: `--skip-pocketing REASON` records a REFUSAL for this clip instead
  // of cutting it. It exists because the pinned take is size-dependent IN
  // THE APP PATH: with the layout identical relative to the pocket, the
  // strike, the hit and the hop events match the 9 ft to 1e-5 s on every
  // size, yet the browser-measured direct-pot phi window slides (9 ft -5..+4
  // mrad, 8 ft -7..0, 7 ft -6..-2) and the object ball arrives later (t_pot
  // 0.450 / 0.516 / 0.587 s at the window centre); on the 7 ft the pinned
  // -1 mrad MISSES. The NATIVE kernel, given the same relative layout and
  // the same resolved equipment, pots identically on all three sizes
  // (window -5..+4, dead-centre 0.4504 s — pinned by
  // table_fidelity::diamond_size_variants_pocketing_take_identical_in_kernel),
  // so the kernel is cleared and the difference lives between the app's
  // placement/shot path and the wasm. Re-pinning phi per size would be
  // exactly the constant-tuning the lane forbids while that path is
  // unattributed, so the honest pack carries the two orbits and a refusal
  // record with the measured window; SPIKE-REPORT-D621 § 6 carries the
  // evidence and the open item.
  if (SKIP_POCKETING) {
    man.clips.pocketing = {
      status: 'REFUSED (not cut)',
      reason: SKIP_POCKETING,
      shot_as_pinned: { ...POCKETING.shot, layout: POCKETING.layout, camera: POCKETING.cam },
    };
    console.log(`[sweep] pocketing: REFUSED — ${SKIP_POCKETING}`);
  } else {
    const ctx = await boot();
    man.boots.push({ clip: 'pocketing', rig: ctx.rig, url: ctx.url, ua: ctx.ua });
    try {
      await ctx.sleep(1200);
      await ctx.chrome.eval(HIDE_UI);
      await ctx.sleep(300);
      const st = await pocketingShot(ctx);
      const dir = path.join(runDir, 'pocketing');
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });

      const tRtEnd = st.tRtEnd;
      const M = Math.round(tRtEnd * 30);
      const rtTimes = Array.from({ length: M }, (_, k) => (k + 1) / 30);
      const tA = Math.max(0, st.tHit - POCKETING.slowPreSec);
      const tB = Math.min(st.duration, st.tPot + POCKETING.slowPostSec);
      const S = Math.round(((tB - tA) * 30) / POCKETING.slowRate);
      const step = POCKETING.slowRate / 30;
      const slowTimes = Array.from({ length: S }, (_, k) => tA + (k + 1) * step);

      const lead1 = await renderTake(ctx, dir, 'lead1_',
        Array.from({ length: POCKETING.leadFrames }, () => 0));
      const rt = await renderTake(ctx, dir, 'rt_', rtTimes);
      const lead2 = await renderTake(ctx, dir, 'lead2_',
        Array.from({ length: POCKETING.leadFrames }, () => tA));
      const slow = await renderTake(ctx, dir, 'slow_', slowTimes);

      // motion-segment trimming (see lastMovingIndex)
      const rtLast = lastMovingIndex([lead1[0], ...rt]) - 1;   // index into rt
      const slowLast = lastMovingIndex([lead2[0], ...slow]) - 1;

      man.cards.pocketing = CARD_SPECS.pocketing.map((s, i) => makeCard(
        path.join(cardDir, `pocketing-${i}.png`), s));

      const slots = [];
      const push = (f, n = 1) => { for (let k = 0; k < n; k++) slots.push(f); };
      const c1 = man.cards.pocketing[0].png;
      const c2 = man.cards.pocketing[1].png;
      push(c1, POCKETING.card1Frames);
      const lead1V = slots.length;
      lead1.forEach((f) => push(f));
      const rtV = slots.length;
      rt.forEach((f) => push(f));
      push(rt[rt.length - 1], HOLD_FRAMES);
      const hold1End = slots.length - 1;
      const card2V = slots.length;
      push(c2, POCKETING.card2Frames);
      const lead2V = slots.length;
      lead2.forEach((f) => push(f));
      const slowV = slots.length;
      slow.forEach((f) => push(f));
      push(slow[slow.length - 1], HOLD_FRAMES);
      const hold2End = slots.length - 1;

      const seqDir = path.join(PACK, 'seq', 'pocketing');
      assemble(seqDir, slots);
      const pkCards = [[0, POCKETING.card1Frames - 1],
        [card2V, card2V + POCKETING.card2Frames - 1]];
      const live = assertLive(seqDir, slots, pkCards, 'pocketing');
      const mp4 = path.join(PACK, `${PREFIX}-pocketing-30fps.mp4`);
      const args = encodeSeq(seqDir, mp4);
      man.clips.pocketing = {
        liveness: live,
        mp4,
        mp4_sha256: sha256File(mp4),
        bytes: fs.statSync(mp4).size,
        expected_frames: slots.length,
        card_segs: [[0, POCKETING.card1Frames - 1],
          [card2V, card2V + POCKETING.card2Frames - 1]],
        motion_segs: [[rtV, rtV + rtLast], [slowV, slowV + slowLast]],
        hold_pairs: [
          [lead1V, lead1V + 1, lead1V + POCKETING.leadFrames - 1],
          [rtV + rtLast, rtV + rtLast + 1, hold1End],
          [lead2V, lead2V + 1, lead2V + POCKETING.leadFrames - 1],
          [slowV + slowLast, slowV + slowLast + 1, hold2End],
        ],
        shot: { ...POCKETING.shot, layout: POCKETING.layout, camera: POCKETING.cam },
        kernel: {
          duration: st.duration, t_hit: st.tHit, t_pot: st.tPot,
          events: st.events,
          // the realtime window is DERIVED from this take's own trace, so the
          // manifest records what it was derived from, not just the answer
          rt_window: {
            t_cush: st.tCush, cush: `${st.cushKind}#${st.cushSeg}`,
            dwell_sec: RT_DWELL, t_end: st.tRtEnd,
          },
          // measured tangent departure, gated at CLEAR_MIN
          cush_at: { ...st.cushAt, clear_min: R4(CLEAR_MIN) },
          // measured containment of the take under the pinned pose
          framing: {
            cap: POCKETING.cap,
            fov: POCKETING.cam.fov,
            worst: R4(st.framing.fill),
            worst_ball: st.framing.id,
            worst_t: st.framing.t,
            samples: st.samples.length,
          },
          rt: { frames: M, t_end: tRtEnd, moving_to: rtLast },
          slow: {
            frames: S, t0: tA, t1: tB, rate: POCKETING.slowRate,
            moving_to: slowLast,
          },
        },
        encode_argv: args,
        x264_sei: x264Sei(mp4),
        source_frames: slots.map((f, i) => [i, path.relative(PACK, f)]),
        source_sha256: Object.fromEntries(
          [...new Set(slots)].map((f) => [path.relative(PACK, f), sha256File(f)])),
      };
      console.log(`[sweep] pocketing: ${slots.length} frames -> ${mp4}`);
    } finally { await ctx.teardown(); }
  }

  // ---- clips 2-3: the empty-table orbits (live RAF path)
  {
    const ctx = await boot();
    man.boots.push({ clip: 'orbits', rig: ctx.rig, url: ctx.url, ua: ctx.ua });
    try {
      await ctx.sleep(1200);
      await ctx.chrome.eval(HIDE_UI);
      await ctx.chrome.eval(HIDE_BALLS);
      const hidden = JSON.parse(await ctx.chrome.eval(HIDE_ORBIT_OBSTRUCTION));
      // A hide that hit nothing is a hide that is no longer doing its job:
      // the name it targets was renamed or removed, and the clearance gate
      // below is the only thing left standing. Say so rather than proceed.
      if (hidden.length !== ORBIT_HIDE.length) {
        console.error(`[488d] REFUSAL: orbit hide matched ${JSON.stringify(hidden)}`
          + ` but ORBIT_HIDE names ${JSON.stringify(ORBIT_HIDE)} — the scene`
          + ' graph moved under the exclusion list; re-derive it against the'
          + ' live scene before sealing.');
        process.exit(2);
      }
      man.orbit_hide = { names: hidden, why: 'obstruction law — see source' };
      await ctx.sleep(300);
      for (const name of ['fulltable', 'corner']) {
        const o = ORBITS[name];
        const files = await captureOrbit(ctx, name, path.join(runDir, name));
        man.cards[name] = CARD_SPECS[name].map((s, i) => makeCard(
          path.join(cardDir, `${name}-${i}.png`), s));
        const slots = [];
        for (let k = 0; k < CARD_FRAMES; k++) slots.push(man.cards[name][0].png);
        files.forEach((f) => slots.push(f));
        for (let k = 0; k < HOLD_FRAMES; k++) slots.push(files[files.length - 1]);
        const seqDir = path.join(PACK, 'seq', name);
        assemble(seqDir, slots);
        const live = assertLive(seqDir, slots, [[0, CARD_FRAMES - 1]], name);
        const mp4 = path.join(PACK, `${PREFIX}-${name}-orbit.mp4`);
        const args = encodeSeq(seqDir, mp4);
        const f0 = CARD_FRAMES;
        const f1 = CARD_FRAMES + o.run - 1;
        man.clips[name] = {
          liveness: live,
          mp4,
          mp4_sha256: sha256File(mp4),
          bytes: fs.statSync(mp4).size,
          expected_frames: slots.length,
          card_segs: [[0, CARD_FRAMES - 1]],
          body: [f0, f1],
          track_anchors: [0.17, 0.5, 0.83].map((p) => f0 + Math.round(o.run * p)),
          geometry: o,
          pose_law: 'az_deg = -90 + 360*v/run; cam z is ABSOLUTE kernel z',
          encode_argv: args,
          x264_sei: x264Sei(mp4),
          source_frames: slots.map((f, i) => [i, path.relative(PACK, f)]),
          source_sha256: Object.fromEntries(
            [...new Set(slots)].map((f) => [path.relative(PACK, f), sha256File(f)])),
        };
        console.log(`[sweep] ${name}: ${slots.length} frames -> ${mp4}`);
      }
    } finally { await ctx.teardown(); }
  }

  writeJson(MANIFEST, man);
  console.log(`SWEEP DONE -> ${MANIFEST}`);
};

// ---------------------------------------------------------------------------
// Window authoring. Every ceiling/floor is MEASURED on the sealed bytes and
// pinned with a DECLARED margin — the 489 law ("cap 13,000 = measured 10,136
// +28%"). It is only sound because --red-arm then proves every pinned bar
// still fires; a window fitted to a measurement without that proof is a dead
// bar wearing a number.
const MARGIN = {
  count: (v) => Math.ceil(v * 1.30) + 4,     // clip/component censuses
  frac: (v) => Math.max(v * 1.5, 5e-5),      // blown fraction
  floor: (v) => Math.floor(v * 0.75 * 1000) / 1000,
  adjacent: (v) => Number((v * 1.35).toFixed(3)),
  hold: (v) => Math.min(1.0, Math.max(v * 4, 0.05)),
  holdTile: (v) => Math.min(2.0, Math.max(v * 4, 0.30)),
  dup: (v) => Number(Math.max(v + 0.01, 0.02).toFixed(4)),
  progress: (v) => Math.floor(v * 0.75 * 100) / 100,
};
// Constants carried VERBATIM from 489 because they are properties of the
// attack, not of the table: a foreign plate reads 14-20 on the grid signature
// whatever the artwork; a copied card reads ~0 distinct; a reordered event
// still has to rise-then-fall exactly once and peak in the back half.
const V489 = {
  card_sig_max_dev: 4.0,
  card_distinct_min: 0.5,
  event_reversals_max: 1,
  event_peak_pos_min: 0.5,
};
// The two DISARMED families. Written as the disarming value so the artifact
// shows plainly that they are off; restated by `d_*` bars on the blue axis.
const DISARMED = { scene_green_min: 0.0, dclip_total_max: 0, dclip_comp_max: 0 };
// judge:2204 default for `recur_frac_max` — the ceiling the bar carries when a
// lane pins nothing. Used as the "is this census saturated?" reference so the
// disarm test is against the judge's own number, not one of mine.
const JUDGE_RECUR_DEFAULT = 0.02;
const RECUR_DISARMED = 1e9;
// The redface three. Unlike the dclip pair these censuses are NOT empty here
// (they read a ~150 px ball-presence signal), so `<= 0` would go red rather
// than disarm; the disarming value has to be the extreme one.
const RF_DISARMED = {
  redface_peak_max: 1e9, redface_peak_min: 0, redface_outside_max: 1e9,
};
// enc_pk_event_shape has NO disarming value: shape_ok starts as bool(rwin) so
// an empty window list forces red, and revs is compared with an EQUALITY
// against a config key while first==+1/last==-1 are hardcoded (judge:2596-
// 2620). It is therefore declared INAPPLICABLE at this instrument's level —
// its verbatim red row is kept in the artifact, it is dropped from the
// verdict, and --encoded REFUSES if the measured justification for dropping
// it has evaporated. That guard is the whole difference between a declaration
// and a rubber stamp.
const INAPPLICABLE = ['enc_pk_event_shape'];

const barValue = (rep, name) => {
  const r = rep.bars.find((b) => b.bar === name);
  return r ? r.value : null;
};

/** The judge's own event-shape law (judge:2595-2623), lifted so it can be
 * applied to a Diamond-family event census when the 489 family is dead here.
 * Same arithmetic, same 8%-of-peak jitter tolerance: RISE first, FALL last,
 * exactly one reversal, peak in the back half. */
function eventShape(seq) {
  const peak = seq.length ? Math.max(...seq) : 0;
  const tol = 0.08 * peak;
  let dir = 0; let first = 0; let revs = 0;
  let last = seq.length ? seq[0] : 0;
  for (const c of seq.slice(1)) {
    const d = c - last;
    if (Math.abs(d) <= tol) continue;
    const sgn = d > 0 ? 1 : -1;
    if (!first) first = sgn;
    if (dir && sgn !== dir) revs++;
    dir = sgn; last = c;
  }
  const pos = seq.length > 1 ? seq.indexOf(peak) / (seq.length - 1) : 0;
  return { peak, revs, first, last: dir, peak_pos: Number(pos.toFixed(3)) };
}

const spanSeq = (map, [a, b]) => {
  const s = [];
  for (let i = a; i <= b; i++) s.push(map.get(i) ?? 0);
  return s;
};

// THE REDFACE FAMILY, AND WHY IT IS DISARMED HERE.
//
// The first draft of this note said the R>=254 census on this delivery was
// "a flat zero". Measuring it showed that is wrong, and the truth is more
// specific. The census is not flat and it is not zero: it reads 129-154 px
// for as long as the red object ball is anywhere on the table — including
// the frozen lead-in before the stroke — and collapses to 0-22 px once the
// ball is swallowed. It is a BALL-PRESENCE signal, not the APPROACH signal
// 489's four bars were written on. Three measurements say so:
//
//   amplitude    in-window peak 154 px vs 489's shipped 10,136 px (1/66).
//   localisation outside-peak / in-peak = 134/154 = 0.87. 489: 54/10136 =
//                0.0053. enc_pk_redface_outside asserts the family "may
//                never appear outside the disclosed windows"; here 87% of
//                it appears outside, because the ball is legitimately
//                sitting there. The bar cannot separate an event from a
//                still life on this grade.
//   shape        enc_pk_event_shape wants exactly ONE reversal. Measured
//                reversals under EVERY physically-defined window: 9 to 13.
//                Its 8%-of-peak jitter tolerance was calibrated on a
//                10,136 px census; at 154 px that tolerance (12 px) sits
//                BELOW the specular flicker (+-15 px), so the law reads
//                noise as event structure.
//
// The cause is disclosed, not incidental: this room is ~28x darker than the
// dossier (ceiling C3, owner-ruling O7) and the grade tone-maps under
// ACESFilmic at exposure 1.05, so the ball's lit face never clips. Lighting
// the pocketing take alone to make a foreign threshold fire would break rig
// parity with the two orbits, hide a declared ceiling, and author a shape
// function to fit an instrument — all three forbidden. So the family is
// DISARMED, DECLARED, and RESTATED on the red-DOMINANT census, which on this
// grade carries every claim the clip census was supposed to: the approach
// (1383 -> 1658, +20% as the ball nears the pocket), the swallow (1658 -> 96,
// 17:1), and clean unimodal shape at 489's OWN constants (revs 1, rise
// first, fall last, peak in the back half at 0.75-0.76 vs 489's 0.83-0.85).
//
// These three floors are re-measured every run. If a future delivery makes
// the family live again, --sig REFUSES rather than silently keeping the
// disarm: a disarm that outlives its justification is a dead bar with a
// paragraph attached.
const RF_ALIVE_MIN = 200;        // in-window peak px  (489 shipped 10,136)
const RF_CONTRAST_MAX = 0.20;    // outside/in peak    (489 measured 0.0053)
const RF_SHAPE_REVS = 1;         // the judge's own equality, judge:2618

// The object ball's visual extinction, used to place the approach window on
// physics rather than on a percentile of a noisy census. EXT_HOLD is what
// stops one dark frame mid-approach from reading as a pot; EXT_LAG_MAX is
// the render-vs-kernel cross-check — the ball must vanish AFTER the kernel
// says it was pocketed, and within one bounce of it.
const EXT_FRAC = 0.10;
const EXT_HOLD = 3;
const EXT_LAG_MAX = 0.15;

/** Sim time of a pocketing body frame. The two motion segs are the SAME shot
 * at two rates, so a frame index alone is ambiguous — the seg owns the clock.
 * Both mappings are read out of the manifest the sweep wrote rather than
 * re-derived from the take parameters here, so this cannot drift from what
 * was actually rendered. */
function pkFrameTime(pkc, si, i) {
  const j = i - pkc.motion_segs[si][0];
  if (si === 0) {
    const rt = pkc.kernel.rt;
    return (j / rt.moving_to) * rt.t_end;
  }
  const sl = pkc.kernel.slow;
  return sl.t0 + (j / sl.moving_to) * (sl.t1 - sl.t0);
}

/** First frame in [a,b] whose count drops below EXT_FRAC of the span peak and
 * STAYS below for EXT_HOLD frames. Returns null when the span never
 * extinguishes — a corrupted clip has to fail a bar, not crash a run. */
function extinctionOf(seq, a, b) {
  const peak = seq.length ? Math.max(...seq) : 0;
  const thr = EXT_FRAC * peak;
  for (let i = 0; a + i <= b && i < seq.length; i++) {
    if (seq[i] >= thr) continue;
    let held = true;
    for (let k = i; k < Math.min(seq.length, i + EXT_HOLD); k++) {
      if (seq[k] >= thr) { held = false; break; }
    }
    if (held) return { frame: a + i, peak, thr: Number(thr.toFixed(2)) };
  }
  return null;
}

const peakOf = (map, [a, b]) => {
  let best = [0, null];
  for (let i = a; i <= b; i++) {
    const v = map.get(i) ?? 0;
    if (v > best[0]) best = [v, i];
  }
  return best;
};

/** Everything both --sig and the restatement evaluator need to know about the
 * red families on this delivery, derived ONCE from the census so the pinning
 * pass and the judging pass cannot disagree about where the event is. */
function pkRedFamily(cen, man) {
  const pkc = man.clips.pocketing;
  const rc = new Map(cen.pocketing.rclip);
  const rd = new Map(cen.pocketing.rdom);
  const segs = pkc.motion_segs.map(([a, b], si) => {
    const rdSeq = spanSeq(rd, [a, b]);
    const ext = extinctionOf(rdSeq, a, b);
    const approach = ext ? [a, ext.frame] : null;
    const nc = pkc.card_segs.find(([c0]) => c0 > b);
    const tail = [(ext ? ext.frame : b) + 1,
      nc ? nc[0] - 1 : pkc.expected_frames - 1];
    const lead = pkc.hold_pairs.find((hp) => hp[2] === a - 1) || null;
    const aSeq = approach ? spanSeq(rd, approach) : [];
    return {
      si, seg: [a, b], approach, tail, lead,
      ext_frame: ext ? ext.frame : null,
      t_ext: ext ? Number(pkFrameTime(pkc, si, ext.frame).toFixed(5)) : null,
      lag: ext
        ? Number((pkFrameTime(pkc, si, ext.frame) - pkc.kernel.t_pot).toFixed(5))
        : null,
      rdom: approach ? {
        shape: eventShape(aSeq),
        peak: Math.max(...aSeq),
        first: rd.get(a) ?? 0,
        lead: lead ? peakOf(rd, [lead[0], lead[2]]) : null,
        tail_peak: peakOf(rd, tail),
      } : null,
      rclip: approach ? {
        shape: eventShape(spanSeq(rc, approach)),
        in_peak: peakOf(rc, approach)[0],
      } : null,
    };
  });
  const live = segs.filter((s) => s.approach);
  const inApp = (i) => live.some((s) => s.approach[0] <= i && i <= s.approach[1]);
  let rcOut = [0, null];
  for (const [i, v] of rc) if (!inApp(i) && v > rcOut[0]) rcOut = [v, i];
  const rcIn = live.length ? Math.max(...live.map((s) => s.rclip.in_peak)) : 0;
  return {
    segs,
    rclip_in_peak: rcIn,
    rclip_out_peak: rcOut,
    rclip_contrast: rcIn ? Number((rcOut[0] / rcIn).toFixed(4)) : 1,
    rclip_revs: live.map((s) => s.rclip.shape.revs),
  };
}

/** THE RESTATEMENT BARS. One implementation, called by --encoded on the
 * sealed pack and by --red-arm on every corrupted pack, so an attack can
 * never be scored against a different rule than the seal was.
 *
 * The spans are the PINNED ones — an attacker who moves the object ball's
 * extinction does not get the window re-fitted around the move. The one
 * exception is d_pk_rdom_extinction_lag, whose whole subject IS where the
 * extinction fell, so it re-derives it and compares against the kernel. */
function restateRows(cen, man, win) {
  const rows = [];
  const row = (bar, value, ok, note) => rows.push({ bar, value, ok, note });
  for (const clip of ['fulltable', 'corner', 'pocketing']) {
    const c = cen[clip]; const w = win.restate[clip];
    row(`d_${clip}_bed_floor`, c.bed_scene_min,
      c.bed_scene_min[0] >= w.bed_floor_min,
      `(MIN per-frame BLUE-dominant fraction, >= ${w.bed_floor_min} —`
      + ` restates the disarmed enc_${clip}_scene_floor on Tournament Blue)`);
    row(`d_${clip}_bclip_total_max`, c.bed_clip_total,
      c.bed_clip_total[0] <= w.bclip_total_max,
      `(ANY-channel >=254 within 6 px of blue bed, <= ${w.bclip_total_max} —`
      + ` restates the vacuous enc_${clip}_dclip_total_max, and is stronger:`
      + ' the green-only predicate could not see a red or white clip)');
    row(`d_${clip}_bclip_comp_max`, c.bed_clip_comp,
      c.bed_clip_comp[0] <= w.bclip_comp_max,
      `(largest 8-connected component of that census, <= ${w.bclip_comp_max})`);
    // The one row here that asks nothing about the cloth. Every other bar in
    // this instrument — judge and restatement alike — is a question about
    // some coloured thing being where it should be, and all 67 of them
    // passed a frame that contained no scene whatsoever. This asks only
    // whether the frame is a photograph of anything at all.
    row(`d_${clip}_frame_alive`, [c.frame_max_min, c.frame_mean_min],
      c.frame_max_min[0] >= w.frame_max_min
        && c.frame_mean_min[0] >= w.frame_mean_min,
      `(dimmest body frame: max >= ${w.frame_max_min}, mean >=`
      + ` ${w.frame_mean_min}; ABSOLUTE floors in the empty decade between a`
      + ' rendered frame and a blank one, not fitted to this delivery —'
      + ' colour-agnostic, so the disarmed green predicate cannot blind it)');
    // orbits only — the pocketing clip has no orbit and the judge already
    // owns its loop class through the event rows
    if (!c.recur) continue;
    row(`d_${clip}_recur_offband`,
      [c.recur.offband_frac, c.recur.offband_floor, c.recur.judge_frac],
      c.recur.offband_frac <= w.recur_offband_max
        && c.recur.band === RECUR_BAND && c.recur.half_turn === w.half_turn,
      `(full-history recurrence with the LAWFUL half-turn offset`
      + ` ${w.half_turn} +/- ${RECUR_BAND} excluded, <= ${w.recur_offband_max};`
      + ' the half-turn is run/2 from the declared pose law, not a fitted'
      + ` number. The judge's own unbanded census reads`
      + ` ${c.recur.judge_frac} on this orbit`
      + (c.recur.judge_frac > JUDGE_RECUR_DEFAULT
        ? ' — saturated, because a pool table is two-fold symmetric and this'
          + ' path revisits every bearing half a turn later, so that bar is'
          + ' disarmed here and this row carries the claim'
        : ', i.e. this orbit has no such symmetry and the judge bar stays'
          + ' ARMED — this row is the independent second reading')
      + ')');
  }

  const pkc = man.clips.pocketing;
  const rd = new Map(cen.pocketing.rdom);
  const w = win.restate.pk_rdom;
  const per = w.approach.map((app, si) => {
    const seq = spanSeq(rd, app);
    const first = rd.get(app[0]) ?? 0;
    const seg = pkc.motion_segs[si];
    const ext = extinctionOf(spanSeq(rd, seg), seg[0], seg[1]);
    const tail = peakOf(rd, w.tail[si]);
    const peak = seq.length ? Math.max(...seq) : 0;
    return {
      si, approach: app, peak, first, tail,
      shape: eventShape(seq),
      ratio: Number((peak / Math.max(1, tail[0])).toFixed(2)),
      lead_dev: Math.max(...spanSeq(rd, w.lead[si]).map(
        (v) => Math.abs(v - first))),
      ext_frame: ext ? ext.frame : null,
      lag: ext
        ? Number((pkFrameTime(pkc, si, ext.frame) - w.t_pot).toFixed(5))
        : null,
    };
  });
  row('d_pk_rdom_approach_shape',
    per.map((p) => ({ w: p.si, ...p.shape })),
    per.every((p) => p.shape.revs === w.reversals && p.shape.first === 1
      && p.shape.last === -1 && p.shape.peak_pos >= w.peak_pos_min),
    '(the 489 event-shape law read off the red-DOMINANT census: RISE first,'
    + ` FALL last, exactly ${w.reversals} reversal, peak in the back half`
    + ` (>= ${w.peak_pos_min}). 489's own constants, unchanged — restates the`
    + ' INAPPLICABLE enc_pk_event_shape, which reads specular flicker on'
    + ' this grade instead of the approach)');
  row('d_pk_rdom_event_floor', per.map((p) => [p.si, p.peak]),
    per.every((p) => p.peak >= w.peak_min),
    `(each approach window must CARRY the event, >= ${w.peak_min} px —`
    + ' restates enc_pk_redface_event_floor; a frozen or blanked approach'
    + ' reads the floor)');
  row('d_pk_rdom_peak_max', per.map((p) => [p.si, p.peak]),
    per.every((p) => p.peak <= w.peak_max),
    `(disclosure ceiling ${w.peak_max} px — restates enc_pk_redface_peak;`
    + ' a pasted red element blooms straight through it)');
  row('d_pk_rdom_swallow',
    per.map((p) => ({ w: p.si, tail: p.tail, ratio: p.ratio })),
    per.every((p) => p.tail[0] <= w.tail_max && p.ratio >= w.tail_ratio_min),
    `(after the swallow the ball is GONE: tail peak <= ${w.tail_max} px and`
    + ` approach/tail >= ${w.tail_ratio_min}:1. This is what`
    + ' enc_pk_redface_outside was for, stated the way this table can carry'
    + ' it — the ball is lawfully present BEFORE the stroke, so containment'
    + ' is "after the pot", not "outside the window")');
  row('d_pk_rdom_lead_static',
    per.map((p) => ({ w: p.si, dev: p.lead_dev, cap: w.lead_dev_max[p.si] })),
    per.every((p) => p.lead_dev <= w.lead_dev_max[p.si]),
    '(the static lead-in shows the SAME red area as the first moving frame'
    + ' — it is the same ball in the same place. Closes the hole the'
    + ' disarmed enc_pk_redface_outside used to cover: a red element spliced'
    + ' identically across the lead-in keeps every hold and dup row lawful)');
  row('d_pk_rdom_extinction_lag',
    per.map((p) => ({ w: p.si, frame: p.ext_frame, lag: p.lag })),
    per.every((p) => p.lag !== null && p.lag >= 0 && p.lag <= w.lag_max),
    `(the object ball must vanish AFTER the kernel BallPocket at t=${w.t_pot}`
    + ` and within ${w.lag_max}s of it — the render-vs-kernel cross-check.`
    + ' A reversed or spliced event moves the extinction off the event)');
  return rows;
}

MODE_FN.sig = async () => {
  const man = readJson(MANIFEST);
  const judgeDir = stageJudge();
  // 1. card + anchor signature fixture, and the raw censuses
  execFileSync('python3', [CENSUS_PY, '--manifest', MANIFEST,
    '--out', CENSUS_JSON,
    '--fixture', path.join(judgeDir, 'fixtures', FIXTURE_BASENAME)],
  { stdio: 'inherit' });
  fs.copyFileSync(path.join(judgeDir, 'fixtures', FIXTURE_BASENAME), FIXTURE_TRACKED);
  const cen = readJson(CENSUS_JSON);

  // 2. place the pocketing APPROACH windows on physics — each motion seg runs
  //    from its first frame to the frame the object ball is extinguished in —
  //    and re-measure, on this delivery, whether the judge's R>=254 redface
  //    family is alive enough to arm. See the RF_* note above.
  const pk = man.clips.pocketing;
  const fam = pkRedFamily(cen, man);
  const dead = fam.segs.filter((s) => !s.approach);
  if (dead.length) {
    console.error('[488d] REFUSAL: motion seg(s)'
      + ` ${JSON.stringify(dead.map((s) => s.seg))} never extinguish the`
      + ' object ball — this take does not show a pot, so there is no'
      + ' approach window to place and nothing to gate.');
    process.exit(2);
  }
  for (const s of fam.segs) {
    if (!(s.lag >= 0 && s.lag <= EXT_LAG_MAX)) {
      console.error(`[488d] REFUSAL: seg ${JSON.stringify(s.seg)} extinguishes`
        + ` the object ball at t=${s.t_ext}, ${s.lag}s from the kernel`
        + ` BallPocket at t=${pk.kernel.t_pot} (allowed 0..${EXT_LAG_MAX}).`
        + ' The render and the kernel disagree about when the ball was'
        + ' pocketed; that is an owner-ruling item, not a window to pin.');
      process.exit(2);
    }
    if (!s.lead) {
      console.error(`[488d] REFUSAL: seg ${JSON.stringify(s.seg)} has no`
        + ' static lead-in hold ending at its first frame; the lead-in'
        + ' restatement has nothing to bind to.');
      process.exit(2);
    }
  }
  const evWindows = fam.segs.map((s) => s.approach);
  const rcPeak = fam.rclip_in_peak;
  const rfLive = rcPeak >= RF_ALIVE_MIN
    && fam.rclip_contrast <= RF_CONTRAST_MAX
    && fam.rclip_revs.every((r) => r === RF_SHAPE_REVS);
  console.log(`[sig] approach windows ${JSON.stringify(evWindows)}`
    + ` (extinction ${JSON.stringify(fam.segs.map((s) => s.ext_frame))},`
    + ` kernel-pot lag ${JSON.stringify(fam.segs.map((s) => s.lag))}s)`);
  console.log(`[sig] redface family ${rfLive ? 'LIVE' : 'DISARMED'}:`
    + ` in-peak ${rcPeak} (floor ${RF_ALIVE_MIN}),`
    + ` outside/in ${fam.rclip_contrast} (max ${RF_CONTRAST_MAX}),`
    + ` reversals ${JSON.stringify(fam.rclip_revs)} (law ${RF_SHAPE_REVS});`
    + ` rdom restatement ${JSON.stringify(fam.segs.map((s) => s.rdom.shape))}`);
  if (rfLive) {
    // The mirror of the disarm: a disarm that outlives its justification is
    // a dead bar with a paragraph attached. This instrument only knows how
    // to write the DISARMED pocketing window; if a delivery brings the 489
    // family back to life it has to be armed on its own measurements, and
    // saying so out loud beats shipping a disclaimer that is no longer true.
    console.error('[488d] REFUSAL: the enc_pk_redface family is LIVE on this'
      + ' delivery (all three floors cleared). Arm it on its own measured'
      + ' values — do not ship the disarm authored for the dark grade.');
    process.exit(2);
  }

  // 3. a PERMISSIVE pass through the verbatim judge to MEASURE every bar it
  //    owns. This is not a verdict and never writes the bars artifact.
  const permissive = {
    fulltable: {
      gdom_total_max: 1e9, gdom_comp_max: 1e9, blown_frac_max: 1,
      scene_green_min: 0, dup_frac_max: 1, progress_frac_min: 0,
      recur_frac_max: 1, hold_mad_max: 1e9, hold_tile_mad_max: 1e9,
      adjacent_mad_max: 1e9, card_mad_max: 1e9, card_text_min: 0,
      card_text_max: 1e9, dclip_total_max: 1e9, dclip_comp_max: 1e9,
    },
    corner: {
      rclip_anchor_quad_max: 1e9, rclip_fulltrack_max: 1e9,
      rclip_fulltrack_comp_max: 1e9,
    },
    pocketing: {
      redface_peak_max: 1e9, redface_peak_min: 0, redface_outside_max: 1e9,
      gclip_total_max: 1e9, gclip_comp_max: 1e9, scene_green_min: 0,
      dup_frac_max: 1, progress_frac_min: 0, hold_mad_max: 1e9,
      hold_tile_mad_max: 1e9, blown_frac_max: 1, neutral_total_max: 1e9,
      neutral_comp_max: 1e9, card_mad_max: 1e9, motion_adjacent_max: 1e9,
      card_distinct_min: 0, moving_recur_max: 1e9, event_reversals_max: 99,
      event_peak_pos_min: 0, dclip_total_max: 1e9, dclip_comp_max: 1e9,
    },
  };
  const mkWin = (extra) => ({
    fulltable: {
      body: man.clips.fulltable.body,
      expected_frames: man.clips.fulltable.expected_frames,
      ...permissive.fulltable, ...(extra.fulltable || {}),
    },
    corner: {
      body: man.clips.corner.body,
      expected_frames: man.clips.corner.expected_frames,
      rclip_anchor: [man.clips.corner.body[0], man.clips.corner.body[0] + 3],
      ...permissive.fulltable, ...permissive.corner, ...(extra.corner || {}),
    },
    pocketing: {
      card_segs: pk.card_segs, motion_segs: pk.motion_segs,
      hold_pairs: pk.hold_pairs, redface_windows: evWindows,
      expected_frames: pk.expected_frames,
      ...permissive.pocketing, ...(extra.pocketing || {}),
    },
  });
  const measureCfg = path.join(PACK, 'measure-cfg.json');
  const measureOut = path.join(PACK, 'measure-488d.json');
  writeJson(measureCfg, {
    files: {
      fulltable: man.clips.fulltable.mp4,
      corner: man.clips.corner.mp4,
      pocketing: pk.mp4,
    },
    windows: mkWin({
      fulltable: { card_sig_max_dev: 1e9 },
      corner: { card_sig_max_dev: 1e9 },
      pocketing: { card_sig_max_dev: 1e9 },
    }),
    out: measureOut,
  });
  runJudge(judgeDir, measureCfg, 'measure');
  const rep = readJson(measureOut);

  // 4. pin. `_` prefixed keys are the measurement the window was cut from —
  //    they ride in the artifact so a reader never has to re-derive them.
  //
  // Is the judge's full-history recurrence census saturated by the SUBJECT's
  // own two-fold rotational symmetry rather than by a defect? True only when
  // both halves hold: the census exceeds the judge's own default ceiling, AND
  // every one of its hits lies inside the lawful half-turn band (so removing
  // that band leaves nothing). Either half failing means the bar is measuring
  // something real and must stay armed.
  const recurSaturated = (name) => {
    const r = cen[name] && cen[name].recur;
    return !!r && r.offband_frac === 0
      && barValue(rep, `enc_${name}_recur_frac`) > JUDGE_RECUR_DEFAULT;
  };
  const orbWin = (name) => {
    const c = man.clips[name];
    const g = barValue(rep, `enc_${name}_gdom_total_max`);
    const gc = barValue(rep, `enc_${name}_gdom_comp_max`);
    const ci = barValue(rep, `enc_${name}_card_identity`);
    const w = {
      body: c.body,
      expected_frames: c.expected_frames,
      ...DISARMED,
      gdom_total_max: MARGIN.count(g[0]),
      gdom_comp_max: MARGIN.count(gc[0]),
      blown_frac_max: MARGIN.frac(barValue(rep, `enc_${name}_blown_frac_max`)),
      dup_frac_max: MARGIN.dup(barValue(rep, `enc_${name}_dup_frac`)),
      progress_frac_min: MARGIN.progress(barValue(rep, `enc_${name}_progress`)),
      // DISARMED when, and only when, the census is saturated by the
      // subject's own two-fold symmetry — a MEASURED condition, not the
      // string 'fulltable': every hit lands inside the lawful half-turn band
      // (offband 0) while the judge's own default (0.02) is exceeded. The
      // corner orbit fails that test on its measurement, not on a hardcode,
      // and keeps the bar armed. Restated by d_{orb}_recur_offband.
      recur_frac_max: recurSaturated(name)
        ? RECUR_DISARMED
        : MARGIN.dup(barValue(rep, `enc_${name}_recur_frac`)),
      hold_mad_max: MARGIN.hold(barValue(rep, `enc_${name}_hold_max_mad`)),
      hold_tile_mad_max: MARGIN.holdTile(barValue(rep, `enc_${name}_hold_tile_max`)),
      adjacent_mad_max: MARGIN.adjacent(barValue(rep, `enc_${name}_adjacent_mad_max`)),
      card_mad_max: 1.0,
      card_text_min: Math.floor(ci.text_px[0] * 0.9),
      card_text_max: Math.ceil(ci.text_px[1] * 1.1),
      card_sig_max_dev: V489.card_sig_max_dev,
      _measured: {
        gdom: g, gdom_comp: gc, card: ci,
        blown: barValue(rep, `enc_${name}_blown_frac_max`),
        dup: barValue(rep, `enc_${name}_dup_frac`),
        progress: barValue(rep, `enc_${name}_progress`),
        recur: barValue(rep, `enc_${name}_recur_frac`),
        hold: barValue(rep, `enc_${name}_hold_max_mad`),
        hold_tile: barValue(rep, `enc_${name}_hold_tile_max`),
        adjacent: barValue(rep, `enc_${name}_adjacent_mad_max`),
        disarmed_scene_green: barValue(rep, `enc_${name}_scene_floor`),
        disarmed_dclip: [barValue(rep, `enc_${name}_dclip_total_max`),
          barValue(rep, `enc_${name}_dclip_comp_max`)],
      },
    };
    if (name === 'corner') {
      // the SPLIT churn law: the anchor pins the shipped-peak BEARING, the
      // full-track quad bounds every other bearing, the component census
      // qualifies both (judge:2274-2310)
      const ft = barValue(rep, 'enc_corner_rclip_fulltrack_quad');
      w.rclip_anchor = [ft.video_f0, ft.video_f0 + 3];
      w.rclip_anchor_quad_max = Math.ceil(ft.sum * 1.10);
      w.rclip_fulltrack_max = Math.ceil(ft.sum * 1.10);
      w.rclip_fulltrack_comp_max = MARGIN.count(ft.maxcomp);
      w._measured.rclip = ft;
    } else {
      w._measured.rclip_peak = barValue(rep, 'enc_fulltable_rclip_peak');
    }
    return w;
  };

  const rf = barValue(rep, 'enc_pk_redface_peak');
  const rfOut = barValue(rep, 'enc_pk_redface_outside');
  const pkCard = barValue(rep, 'enc_pk_card_identity');
  const pkWin = {
    card_segs: pk.card_segs, motion_segs: pk.motion_segs,
    hold_pairs: pk.hold_pairs, redface_windows: evWindows,
    expected_frames: pk.expected_frames,
    ...DISARMED,
    // written as the DISARMING values, the same convention the cloth family
    // uses: the artifact's threshold column then says plainly that these
    // three rows are off, while their `value` column still carries what the
    // verbatim judge measured. Restated by d_pk_rdom_* below.
    ...RF_DISARMED,
    gclip_total_max: MARGIN.count(barValue(rep, 'enc_pk_gclip_total_max')[0]),
    gclip_comp_max: MARGIN.count(barValue(rep, 'enc_pk_gclip_comp_max')[0]),
    dup_frac_max: MARGIN.dup(barValue(rep, 'enc_pk_dup_frac')),
    progress_frac_min: MARGIN.progress(barValue(rep, 'enc_pk_progress')),
    hold_mad_max: MARGIN.hold(barValue(rep, 'enc_pk_hold_max_mad')),
    hold_tile_mad_max: MARGIN.holdTile(barValue(rep, 'enc_pk_hold_tile_max')),
    blown_frac_max: MARGIN.frac(barValue(rep, 'enc_pk_blown_frac_max')),
    neutral_total_max: MARGIN.count(barValue(rep, 'enc_pk_neutral_total_max')[0]),
    neutral_comp_max: MARGIN.count(barValue(rep, 'enc_pk_neutral_comp_max')[0]),
    card_mad_max: 1.0,
    card_slots: Object.keys(pkCard.text_px).sort().map((k) => [
      Math.floor(pkCard.text_px[k][0] * 0.9), Math.ceil(pkCard.text_px[k][1] * 1.1)]),
    card_sig_max_dev: V489.card_sig_max_dev,
    card_distinct_min: V489.card_distinct_min,
    motion_adjacent_max: MARGIN.adjacent(barValue(rep, 'enc_pk_motion_adjacent_max')),
    moving_recur_max: barValue(rep, 'enc_pk_moving_recur') + 2,
    event_reversals_max: V489.event_reversals_max,
    event_peak_pos_min: V489.event_peak_pos_min,
    _measured: {
      redface: rf, redface_outside: rfOut, card: pkCard,
      event_shape: barValue(rep, 'enc_pk_event_shape'),
      gclip: [barValue(rep, 'enc_pk_gclip_total_max'),
        barValue(rep, 'enc_pk_gclip_comp_max')],
      neutral: [barValue(rep, 'enc_pk_neutral_total_max'),
        barValue(rep, 'enc_pk_neutral_comp_max')],
      dup: barValue(rep, 'enc_pk_dup_frac'),
      progress: barValue(rep, 'enc_pk_progress'),
      hold: barValue(rep, 'enc_pk_hold_max_mad'),
      hold_tile: barValue(rep, 'enc_pk_hold_tile_max'),
      blown: barValue(rep, 'enc_pk_blown_frac_max'),
      adjacent: barValue(rep, 'enc_pk_motion_adjacent_max'),
      moving_recur: barValue(rep, 'enc_pk_moving_recur'),
      card_distinct: barValue(rep, 'enc_pk_card_distinct'),
      disarmed_scene_green: barValue(rep, 'enc_pk_scene_floor'),
      disarmed_dclip: [barValue(rep, 'enc_pk_dclip_total_max'),
        barValue(rep, 'enc_pk_dclip_comp_max')],
    },
  };

  // the RESTATEMENT windows — the blue-cloth family that replaces the two
  // disarmed judge families (census_488d.py measures them)
  const restate = {};
  for (const clip of ['fulltable', 'corner', 'pocketing']) {
    const c = cen[clip];
    const bedFloor = MARGIN.floor(c.bed_scene_min[0]);
    // A FLOOR OF ZERO IS NOT A FLOOR. `MARGIN.floor` is `0.75 x measured`, so
    // it collapses to `>= 0` — a row that reports PASS against every possible
    // delivery, including an all-black one — exactly when the measurement it
    // is fitted to is itself degenerate. That is not hypothetical: the first
    // seal pinned `d_fulltable_bed_floor` at `>= 0` because the take it was
    // fitted to contained the 7 blank frames, and the bar then dutifully
    // passed them. Pinning is only sound when the measurement is sound, so
    // the degenerate case has to refuse here rather than be discovered later
    // by reading the artifact. (`d_*_frame_alive` is the independent guard;
    // this refusal is why the fitted bar cannot quietly go vacuous again.)
    if (!(bedFloor > 0)) {
      console.error(`[488d] REFUSAL: ${clip} bed_floor_min pins to ${bedFloor}`
        + ` from a measured minimum of ${JSON.stringify(c.bed_scene_min)} —`
        + ' a floor at or below zero measures nothing. Frame'
        + ` ${c.bed_scene_min[1]} shows no cloth at all; fix the delivery,`
        + ' do not pin the bar.');
      process.exit(2);
    }
    // THE RESTATED RECURRENCE CEILING. Pinned at the MARGIN.frac floor of
    // 5e-5, i.e. a single off-band recurrent frame out of 595 (0.00168) fires
    // it — 33x the ceiling. That tightness is only available because the
    // measurement is a true zero, so the refusal below is what keeps it
    // honest: if a delivery ever reads a nonzero off-band fraction, the
    // answer is to find the loop, not to pin the bar above it. This is the
    // same trap `d_fulltable_bed_floor` fell into and the same cure.
    const rec = c.recur;
    if (rec) {
      if (rec.offband_frac > 0) {
        console.error(`[488d] REFUSAL: ${clip} measures`
          + ` ${rec.offband_frac} off-band recurrence (${rec.n} body frames,`
          + ` floor ${JSON.stringify(rec.offband_floor)} outside the`
          + ` half-turn band ${rec.half_turn} +/- ${rec.band}). That is a`
          + ' revisited bearing the subject symmetry does NOT explain —'
          + ' a loop, a frozen span or a mis-declared run. Fix the delivery,'
          + ' do not pin the bar above it.');
        process.exit(2);
      }
      if (rec.band !== RECUR_BAND) {
        console.error(`[488d] REFUSAL: ${clip} censused with band ${rec.band}`
          + ` but this driver declares ${RECUR_BAND} — the pinned window`
          + ' would describe a census that was not run.');
        process.exit(2);
      }
    }
    restate[clip] = {
      bed_floor_min: bedFloor,
      ...(rec ? {
        half_turn: rec.half_turn,
        recur_offband_max: MARGIN.frac(rec.offband_frac),
        _recur: rec,
      } : {}),
      bclip_total_max: MARGIN.count(c.bed_clip_total[0]),
      bclip_comp_max: MARGIN.count(c.bed_clip_comp[0]),
      // Absolute, not fitted — see LIVE_MAX_MIN / liveness_488d.py. The other
      // rows in this block are `MARGIN.<f>(measured)`; these two deliberately
      // are not, because the whole point of the row is to be immune to the
      // delivery it is measured on.
      frame_max_min: LIVE_MAX_MIN,
      frame_mean_min: LIVE_MEAN_MIN,
      _measured: {
        bed_scene_min: c.bed_scene_min, bclip_total: c.bed_clip_total,
        bclip_comp: c.bed_clip_comp,
        frame_max_min: c.frame_max_min, frame_mean_min: c.frame_mean_min,
      },
    };
  }
  // ... and the red family that replaces the four disarmed redface rows. Every
  // ceiling below is measured on the SEALED bytes with the same declared
  // margins the judge rows use, and the two SHAPE constants are 489's own,
  // carried verbatim — the restatement is the same law read off the census
  // this grade actually carries, not a weaker law invented to pass.
  const appPeaks = fam.segs.map((s) => s.rdom.peak);
  restate.pk_rdom = {
    approach: fam.segs.map((s) => s.approach),
    tail: fam.segs.map((s) => s.tail),
    lead: fam.segs.map((s) => [s.lead[0], s.lead[2]]),
    peak_max: Math.ceil(Math.max(...appPeaks) * 1.28),
    peak_min: Math.floor(Math.min(...appPeaks) * 0.25),
    tail_max: MARGIN.count(Math.max(...fam.segs.map((s) => s.rdom.tail_peak[0]))),
    tail_ratio_min: 8,
    lead_dev_max: fam.segs.map((s) => Math.max(
      Math.round(0.10 * s.rdom.first), 20)),
    reversals: V489.event_reversals_max,
    peak_pos_min: V489.event_peak_pos_min,
    lag_max: EXT_LAG_MAX,
    t_pot: pk.kernel.t_pot,
    _measured: fam.segs.map((s) => ({
      seg: s.seg, approach: s.approach, ext_frame: s.ext_frame,
      t_ext: s.t_ext, lag: s.lag, shape: s.rdom.shape,
      peak: s.rdom.peak, first: s.rdom.first, lead: s.rdom.lead,
      tail_peak: s.rdom.tail_peak,
      tail_ratio: Number((s.rdom.peak / Math.max(1, s.rdom.tail_peak[0]))
        .toFixed(2)),
    })),
  };

  writeJson(WINDOWS_JSON, {
    note: 'measured on the SEALED bytes, pinned with declared margins;'
      + ' --red-arm proves each pinned bar still fires',
    margins: {
      count: 'ceil(x*1.30)+4', frac: 'max(x*1.5, 5e-5)',
      floor: 'floor(x*0.75, 1e-3)', adjacent: 'x*1.35',
      hold: 'clamp(max(x*4,0.05), .., 1.0)', dup: 'max(x+0.01, 0.02)',
      progress: 'floor(x*0.75, 1e-2)', rclip: 'ceil(x*1.10)',
      rdom_peak: 'ceil(max_peak*1.28)   (489 redface constant, reused)',
      rdom_floor: 'floor(min_peak*0.25)  (489 redface constant, reused)',
      rdom_lead: 'max(0.10*first_approach_frame, 20)',
      verbatim_489: V489,
    },
    event_evidence: {
      approach_windows: evWindows,
      placed_by: 'per motion seg, [seg start .. object-ball extinction]:'
        + ` the first frame whose red-dominant area falls below ${EXT_FRAC}`
        + ` of the seg peak and stays below for ${EXT_HOLD} frames. Physics,`
        + ' not a percentile of a noisy census.',
      extinction: fam.segs.map((s) => ({
        seg: s.seg, frame: s.ext_frame, t: s.t_ext, lag_vs_kernel_pot: s.lag,
      })),
      kernel_t_pot: pk.kernel.t_pot, lag_max: EXT_LAG_MAX,
      lag_note: 'the two segs are the SAME pot sampled at 30 fps and at'
        + ' 0.4x; their independently measured extinction lags agree to'
        + ' within one realtime frame, which is the cross-check that the'
        + ' render and the kernel are describing one event',
      rclip_dead: {
        in_peak: fam.rclip_in_peak, alive_min: RF_ALIVE_MIN,
        out_peak: fam.rclip_out_peak, contrast: fam.rclip_contrast,
        contrast_max: RF_CONTRAST_MAX,
        reversals: fam.rclip_revs, reversals_law: RF_SHAPE_REVS,
        note: 'all three floors missed: too small, not localised, not'
          + ' unimodal. 489 shipped in_peak 10,136 / contrast 0.0053 /'
          + ' reversals 1.',
      },
      rdom_restatement: fam.segs.map((s) => s.rdom.shape),
    },
    inapplicable: {
      bars: INAPPLICABLE,
      why: 'enc_pk_event_shape has no disarming value (judge:2596-2620:'
        + ' bool(rwin) seeds the verdict, revs is an EQUALITY against the'
        + ' config, first/last are hardcoded). It is dropped from the VERDICT'
        + ' only, its verbatim red row is kept, and --encoded re-measures the'
        + ' justification and refuses if it no longer holds.',
      justification: {
        predicate: 'rclip reversals over the physically-placed approach'
          + ` windows != ${RF_SHAPE_REVS} on at least one window`,
        measured: fam.rclip_revs,
      },
      restated_by: ['d_pk_rdom_approach_shape', 'd_pk_rdom_extinction_lag'],
    },
    disarmed: {
      bars: ['enc_fulltable_scene_floor', 'enc_corner_scene_floor',
        'enc_pk_scene_floor', 'enc_fulltable_dclip_total_max',
        'enc_fulltable_dclip_comp_max', 'enc_corner_dclip_total_max',
        'enc_corner_dclip_comp_max', 'enc_pk_dclip_total_max',
        'enc_pk_dclip_comp_max'],
      why: 'orbitsweep-judge.py hardcodes a GREEN cloth predicate; this table'
        + " ships Tournament Blue (web/scene/table.js:394). The floor can't be"
        + ' cleared and the dclip mask is empty (a bar that PASSES while'
        + ' measuring nothing). Restated by the d_* rows below.',
      redface: {
        bars: ['enc_pk_redface_peak', 'enc_pk_redface_event_floor',
          'enc_pk_redface_outside'],
        values: RF_DISARMED,
        why: 'orbitsweep-judge.py hardcodes an R>=254 CLIPPING predicate. This'
          + ' grade (ACESFilmic, exposure 1.05, room ceiling C3/O7) does not'
          + ' clip the ball, so the census degenerates from an APPROACH signal'
          + ' to a BALL-PRESENCE one: 154 px peak vs 489 10,136, and 87% of it'
          + ' sits outside the event because the ball is legitimately on the'
          + ' table before the stroke. Restated by d_pk_rdom_* on the'
          + ' red-DOMINANT census.',
        restated_by: ['d_pk_rdom_peak_max', 'd_pk_rdom_event_floor',
          'd_pk_rdom_swallow', 'd_pk_rdom_lead_static'],
      },
      recurrence: {
        bars: ['fulltable', 'corner'].filter(recurSaturated)
          .map((n) => `enc_${n}_recur_frac`),
        why: "orbitsweep-judge.py's full-history recurrence census assumes a"
          + ' 360 orbit never revisits a bearing (judge:2029-2042). A pool'
          + ' table is TWO-FOLD ROTATIONALLY SYMMETRIC, so a full-table orbit'
          + ' revisits every bearing exactly once, half a turn later, and the'
          + ' picture genuinely is the same picture. The bar therefore'
          + ' saturates on the fulltable orbit and its window could only be'
          + ' pinned one dup-margin (+0.01) above a statistic whose own'
          + ' direction-noise is larger than that: the red-arm measured a'
          + ' benign whole-body REVERSAL at 0.2807 (false fire) and a real'
          + ' 102-frame period-34 LOOP at only 0.2739 (missed). The corner'
          + ' orbit, whose subject is one pocket, reads 0.0 on the identical'
          + ' census and stays ARMED — the disarm is decided by measurement'
          + ' per orbit, never by name.',
        measured: Object.fromEntries(['fulltable', 'corner'].map((n) => [n, {
          judge_frac: barValue(rep, `enc_${n}_recur_frac`),
          offband_frac: cen[n].recur.offband_frac,
          offband_floor: cen[n].recur.offband_floor,
          half_turn: cen[n].recur.half_turn, band: cen[n].recur.band,
          disarmed: recurSaturated(n),
        }])),
        restated_by: ['d_fulltable_recur_offband', 'd_corner_recur_offband'],
      },
      reinterpreted: {
        bars: ['enc_fulltable_gdom_total_max', 'enc_fulltable_gdom_comp_max',
          'enc_corner_gdom_total_max', 'enc_corner_gdom_comp_max',
          'enc_pk_gclip_total_max', 'enc_pk_gclip_comp_max'],
        why: 'still ARMED and still meaningful, but on a blue table a'
          + ' green-dominant clipped pixel is a 4:2:0 chroma-sharing anomaly,'
          + ' not the 489 cloth D-line class',
      },
    },
    windows: {
      fulltable: orbWin('fulltable'),
      corner: orbWin('corner'),
      pocketing: pkWin,
    },
    restate,
  });
  console.log(`SIG DONE -> ${WINDOWS_JSON} + ${FIXTURE_TRACKED}`);
};

// ---------------------------------------------------------------------------
/** Stage <PACK>/judgedir: a SYMLINK to the unmodified repo judge plus a
 * fixtures/ dir carrying THIS lane's signature under the basename
 * judge_encoded_489 hardcodes. See the header note. */
function stageJudge() {
  const dir = path.join(PACK, 'judgedir');
  fs.mkdirSync(path.join(dir, 'fixtures'), { recursive: true });
  const link = path.join(dir, 'orbitsweep-judge.py');
  if (fs.existsSync(link)) fs.rmSync(link);
  fs.symlinkSync(JUDGE_PY, link);
  return dir;
}

function runJudge(judgeDir, cfg, tag) {
  const r = spawnSync('python3', [path.join(judgeDir, 'orbitsweep-judge.py'),
    '--encoded', cfg], { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (tag !== 'quiet') process.stdout.write(out);
  return { code: r.status, out };
}

MODE_FN.encoded = async () => {
  const man = readJson(MANIFEST);
  const win = readJson(WINDOWS_JSON);
  const judgeDir = stageJudge();
  const stagedFixture = path.join(judgeDir, 'fixtures', FIXTURE_BASENAME);
  if (!fs.existsSync(stagedFixture)) {
    fs.copyFileSync(FIXTURE_TRACKED, stagedFixture);
  }
  // the shim may never hide a modified judge
  if (sha256File(fs.realpathSync(path.join(judgeDir, 'orbitsweep-judge.py')))
      !== man.judge_sha256) {
    console.error('[488d] REFUSAL: judge sha256 differs from the sealed manifest');
    process.exit(2);
  }
  const files = {
    fulltable: man.clips.fulltable.mp4,
    corner: man.clips.corner.mp4,
    pocketing: man.clips.pocketing.mp4,
  };
  for (const [k, f] of Object.entries(files)) {
    if (sha256File(f) !== man.clips[k].mp4_sha256) {
      console.error(`[488d] REFUSAL: ${k} bytes differ from the sealed manifest`);
      process.exit(2);
    }
  }
  const judgeOut = path.join(PACK, 'judge-488d.json');
  const cfg = path.join(PACK, 'encoded-cfg-488d.json');
  const strip = (w) => Object.fromEntries(
    Object.entries(w).filter(([k]) => !k.startsWith('_')));
  writeJson(cfg, {
    files,
    windows: Object.fromEntries(
      Object.entries(win.windows).map(([k, v]) => [k, strip(v)])),
    out: judgeOut,
  });
  const jr = runJudge(judgeDir, cfg);
  if (jr.code === 2) {
    console.error('[488d] judge REFUSED (exit 2) — invalid evidence, no verdict');
    process.exit(2);
  }
  const rep = readJson(judgeOut);

  // the restatement family, measured on the same bytes in the same run
  execFileSync('python3', [CENSUS_PY, '--manifest', MANIFEST,
    '--out', CENSUS_JSON, '--fixture', path.join(PACK, 'sig-recheck.json')],
  { stdio: 'inherit' });
  const cen = readJson(CENSUS_JSON);
  // the fixture must still be the pinned one: if the plates drifted, the
  // judge's card bars would already be red, but state it explicitly
  const sigStable = sha256File(path.join(PACK, 'sig-recheck.json'))
    === sha256File(FIXTURE_TRACKED);
  const dRows = restateRows(cen, man, win);
  dRows.push({
    bar: 'd_card_signature_stable', value: sigStable, ok: sigStable,
    note: '(the pinned Diamond fixture still describes the sealed plates)',
  });
  const dRed = dRows.filter((r) => !r.ok).map((r) => r.bar);
  for (const r of dRows) {
    console.log(`[restate] ${r.ok ? 'PASS' : 'FAIL'} ${r.bar}`
      + ` = ${JSON.stringify(r.value)} ${r.note}`);
  }

  // THE INAPPLICABLE BAR, and the two guards that keep the declaration from
  // being a rubber stamp. It must still be RED (a declaration for a bar that
  // passes is a lie of omission) and the measurement that justified dropping
  // it must still hold on these bytes.
  const inap = win.inapplicable || { bars: [] };
  const famNow = pkRedFamily(cen, man);
  for (const bar of inap.bars) {
    const r = rep.bars.find((b) => b.bar === bar);
    if (!r) {
      console.error(`[488d] REFUSAL: ${bar} is declared inapplicable but the`
        + ' judge did not report it — the declaration is stale');
      process.exit(2);
    }
    if (r.ok) {
      console.error(`[488d] REFUSAL: ${bar} is declared inapplicable but`
        + ' PASSED on these bytes. Withdraw the declaration and arm it.');
      process.exit(2);
    }
  }
  if (inap.bars.length
      && famNow.rclip_revs.every((v) => v === RF_SHAPE_REVS)) {
    console.error('[488d] REFUSAL: the R>=254 approach census is unimodal on'
      + ` these bytes (reversals ${JSON.stringify(famNow.rclip_revs)}) — the`
      + ' justification for declaring enc_pk_event_shape inapplicable no'
      + ' longer holds.');
    process.exit(2);
  }
  // THE RECURRENCE DISARM, guarded the same way and for the same reason: a
  // disarm is a claim about these bytes, so it is re-measured on these bytes.
  // The claim has two halves and both are checked, because they fail in
  // opposite directions. If the census is no longer saturated, the bar is
  // simply a working bar and must be re-armed. If it IS saturated but the
  // saturation is no longer confined to the lawful half-turn, then the
  // symmetry story is not what is driving it and the disarm is covering a
  // real recurrence. (The second is also caught by d_*_recur_offband going
  // red; it refuses here as well so the REASON is stated rather than left to
  // be inferred from a failing restatement.)
  for (const bar of ((win.disarmed || {}).recurrence || {}).bars || []) {
    const orb = bar.replace(/^enc_/, '').replace(/_recur_frac$/, '');
    const now = rep.bars.find((b) => b.bar === bar);
    const r = cen[orb] && cen[orb].recur;
    if (!now || !r) {
      console.error(`[488d] REFUSAL: ${bar} is declared disarmed but the`
        + ' judge or the census did not report it — the declaration is stale');
      process.exit(2);
    }
    if (now.value <= JUDGE_RECUR_DEFAULT) {
      console.error(`[488d] REFUSAL: ${bar} reads ${now.value} on these bytes,`
        + ` at or under the judge's own default ceiling`
        + ` ${JUDGE_RECUR_DEFAULT}. It is not saturated any more, so the`
        + ' symmetry justification for disarming it is gone — re-arm it.');
      process.exit(2);
    }
    if (r.offband_frac > 0) {
      console.error(`[488d] REFUSAL: ${bar} is disarmed on the ground that`
        + ` every hit lies in the half-turn band ${r.half_turn} +/- ${r.band},`
        + ` but ${r.offband_frac} of body frames recur OUTSIDE it (floor`
        + ` ${JSON.stringify(r.offband_floor)}). The subject's symmetry is not`
        + ' what is driving this census; the disarm is covering a real'
        + ' recurrence.');
      process.exit(2);
    }
    console.log(`[488d] DISARMED ${bar} = ${now.value} (saturated by two-fold`
      + ` subject symmetry: 0 off-band hits outside ${r.half_turn} +/-`
      + ` ${r.band}, floor ${JSON.stringify(r.offband_floor)});`
      + ` restated by d_${orb}_recur_offband`);
  }
  const dropped = (rep.red || []).filter((b) => inap.bars.includes(b));
  for (const b of dropped) {
    console.log(`[488d] INAPPLICABLE ${b} — red row kept in the artifact,`
      + ` dropped from the verdict; restated by ${inap.restated_by.join(' ')}`);
  }
  const red = [...(rep.red || []).filter((b) => !inap.bars.includes(b)),
    ...dRed];
  writeJson(BARS_JSON, {
    lane: 'GH-488D wave A5', table: TABLE,
    judge: {
      path_real: man.judge_path_real, sha256: man.judge_sha256,
      staged_via: 'symlink (judgedir shim; see orbitsweep-488d.mjs header)',
      fixture: FIXTURE_TRACKED, fixture_sha256: sha256File(FIXTURE_TRACKED),
      exit: jr.code,
    },
    files, files_sha256: rep.files_sha256,
    bars: [...rep.bars, ...dRows],
    // The two populations are merged into one `bars` array on purpose — a
    // reader should not have to know which bar came from where to see the
    // whole verdict — so the split is recorded HERE, where the two arrays
    // still exist separately, rather than reconstructed downstream by
    // sniffing the `d_` name prefix. --publish reports these counts and
    // refuses a report that omits them.
    bar_counts: {
      judge: rep.bars.length,
      restatement: dRows.length,
      total: rep.bars.length + dRows.length,
    },
    red,
    inapplicable: { ...win.inapplicable, dropped_from_verdict: dropped },
    disarmed: win.disarmed,
    windows: rep.windows, restate_windows: win.restate,
    when: rep.when,
  });
  console.log(`[488d] ${red.length ? 'RED' : 'GREEN'} `
    + `(${rep.bars.length} judge + ${dRows.length} restatement bars) -> ${BARS_JSON}`);
  if (red.length) { console.error(`[488d] RED: ${red.join(' ')}`); process.exit(3); }
};

// ---------------------------------------------------------------------------
// --red-arm. Every pinned bar has to be shown to FIRE; a window measured off
// the delivery and never attacked is a number, not a law. Each case corrupts
// the sealed pack one way, re-encodes it through the SHIPPED chain, and is
// judged against the SEALED windows.
//
// The contract is expect + forbid, not exact-set equality:
//   expect  bars that MUST fire — the bar this case exists to arm.
//   forbid  bars that must NOT fire — the specific claim that this attack
//           slips past them, which is the whole reason the expected bar had
//           to be built. `ft_reverse_body` is worthless as evidence unless
//           adjacency/dup/progress/recurrence stay GREEN through it.
// Everything else that fires is RECORDED as collateral rather than asserted:
// several of these attacks unavoidably disturb a neighbouring axis (a frozen
// span is also recurrent; a reversed body also breaks the hold it no longer
// terminates), and pretending otherwise would mean tuning the attacks to fit
// a predicted set instead of reporting what the bars actually did.
const RED_ARM = [
  {
    id: 'ft_reverse_body', clip: 'fulltable',
    op: (s, c) => reverseSpan(s, c.body[0], c.body[1]),
    expect: ['enc_fulltable_track_anchors'],
    forbid: ['enc_fulltable_adjacent_mad_max', 'enc_fulltable_dup_frac',
      'enc_fulltable_progress', 'd_fulltable_recur_offband',
      'enc_fulltable_card_identity'],
    why: 'a fully reversed body is a MULTISET-identical sequence: the same'
      + ' adjacent steps, the same duplicate count, the same recurrence.'
      + ' Only the ordered pose anchors can see direction. (The hold no'
      + ' longer terminates the body, so the hold rows fire as collateral.)'
      + ' The recurrence entry here is the RESTATED row, and that swap is'
      + ' itself the evidence for the swap: the judge row read 0.2807 on this'
      + ' attack against a 0.2806 window and LEAKED — not because a reversed'
      + ' orbit revisits anything, but because a census saturated at 0.2706'
      + ' by the table\'s own two-fold symmetry has direction-noise (~0.0101'
      + ' across the history boundary) larger than the +0.01 dup margin it'
      + ' had to be pinned with. The restated row reads 0.0000 on the sealed'
      + ' clip and 0.0000 on this one.',
  },
  {
    id: 'co_reorder', clip: 'corner',
    // chunks chosen clear of the pinned anchors (body+77/225/374) so the
    // anchor rows cannot do the adjacent row's job for it
    op: (s, c) => swapChunks(s, c.body[0] + 150, c.body[0] + 320, 50),
    expect: ['enc_corner_adjacent_mad_max'],
    forbid: ['enc_corner_dup_frac', 'enc_corner_recur_frac',
      'enc_corner_track_anchors', 'enc_corner_hold_max_mad',
      'enc_corner_card_identity'],
    why: 'framewise censuses are order-invariant — every per-frame number is'
      + ' unchanged by a chunk swap. The seam is a step, and only a'
      + ' continuity law sees a step',
  },
  {
    id: 'co_freeze', clip: 'corner',
    op: (s, c) => freezeSpan(s, c.body[0] + 300, 60),
    expect: ['enc_corner_dup_frac'],
    forbid: ['enc_corner_track_anchors', 'enc_corner_card_identity',
      'enc_corner_hold_max_mad'],
    why: 'a frozen span is the classic dead-encode: the file is the right'
      + ' length, every frame is a real render, and nothing moves',
  },
  {
    id: 'ft_loop', clip: 'fulltable',
    // period 36 as a TRIANGLE (0..18,17..1 over 19 distinct poses): no adjacent
    // duplicates and no one-frame jump inside the loop, so dup and progress
    // cannot see it. (An earlier version of this comment said "period 34
    // (0..17,16..1)". triangleLoop's period is 2*half and half is 18, so the
    // period is 36 and the ramp reaches 18 — the measurement agrees with the
    // code, not with the comment: 36 is the modal best-match offset of the
    // attack's off-band hits, 36 of 82.)
    op: (s, c) => triangleLoop(s, c.body[0] + 380, 18, 102),
    expect: ['d_fulltable_recur_offband'],
    forbid: ['enc_fulltable_dup_frac', 'enc_fulltable_progress'],
    why: 'a loop whose period exceeds the 17-frame novelty history reads'
      + ' progress 1.0 and zero duplicates; only a full-history recurrence'
      + ' census sees a bearing being revisited. It has to be the RESTATED'
      + " census: the judge's own row is already saturated at 0.2706 by the"
      + ' table\'s two-fold symmetry, so this loop moved it to 0.2739 —'
      + ' inside the 0.2806 window — and was MISSED. Excluding the lawful'
      + ' half-turn band puts the sealed clip at 0.0000 and this attack at'
      + ' 0.1378 — 82 of 595 body frames, 2756x the 5e-5 ceiling. The loop is'
      + " found where it lives: 36 of those 82 frames match at the triangle's"
      + ' own period of 36, and the remaining 46 at the small offsets a'
      + ' replayed slow-orbit span produces (6/8/10/12/14...). The deepest'
      + ' single match is 0.082 at offset 8 — that is the floor, NOT the'
      + ' period, and an earlier version of this note wrongly called it the'
      + " period. (enc_fulltable_adjacent_mad_max also fires, at 14.83: the"
      + ' triangle has to re-enter the real sweep and the seam is a step.'
      + ' That is collateral, not the proof — an attacker who lands the loop'
      + ' on a smooth seam keeps adjacency green, and the recurrence census'
      + ' is what still sees it.)',
  },
  {
    id: 'ft_black_card', clip: 'fulltable', pixel: ['black', 0, 59],
    expect: ['enc_fulltable_card_identity'],
    forbid: ['enc_fulltable_adjacent_mad_max', 'enc_fulltable_track_anchors',
      'enc_fulltable_hold_max_mad', 'enc_fulltable_dup_frac'],
    why: 'the card seg is excluded from every body census — 60 black frames'
      + ' replacing the title plate once shipped green',
  },
  {
    id: 'ft_foreign_card', clip: 'fulltable',
    op: (s, c, man) => { for (let i = 0; i < 60; i++) s[i] = man.cards.corner[0].png; },
    expect: ['enc_fulltable_card_identity'],
    forbid: ['enc_fulltable_adjacent_mad_max', 'enc_fulltable_track_anchors',
      'enc_fulltable_hold_max_mad', 'enc_fulltable_dup_frac'],
    why: 'a same-family sibling plate keeps the text census and the'
      + ' intra-card MAD in band — only the PINNED grid signature fires.'
      + ' This is also the proof that the STAGED Diamond fixture is what the'
      + ' judge reads: against the repo 489 fixture every card row would'
      + ' already be red on the sealed pack',
  },
  {
    id: 'pk_swap_cards', clip: 'pocketing',
    op: (s, c, man) => {
      const [a0, a1] = c.card_segs[0]; const [b0, b1] = c.card_segs[1];
      for (let i = a0; i <= a1; i++) s[i] = man.cards.pocketing[1].png;
      for (let i = b0; i <= b1; i++) s[i] = man.cards.pocketing[0].png;
    },
    expect: ['enc_pk_card_identity'],
    forbid: ['enc_pk_dup_frac', 'enc_pk_progress',
      'd_pk_rdom_approach_shape', 'enc_pk_motion_adjacent_max',
      'enc_pk_card_distinct'],
    why: 'swapping the realtime and slow plates preserves both plates, both'
      + ' text censuses in aggregate and their distinctness — only per-SLOT'
      + ' signatures can tell which card is which',
  },
  {
    id: 'co_alien_hold', clip: 'corner',
    op: (s, c) => { for (let i = c.body[1] + 1; i < s.length; i++) s[i] = s[c.body[0] + 100]; },
    expect: ['enc_corner_hold_max_mad', 'enc_corner_hold_tile_max'],
    forbid: ['enc_corner_dup_frac', 'enc_corner_track_anchors',
      'enc_corner_adjacent_mad_max', 'enc_corner_card_identity',
      'enc_corner_recur_frac'],
    why: 'the hold sits OUTSIDE the body, so an unrelated tail preserves the'
      + ' frame count and every body census — the tail is only wrong'
      + ' relative to the frame it claims to hold',
  },
  {
    id: 'pk_reverse_event', clip: 'pocketing',
    op: (s, c) => reverseSpan(s, c.motion_segs[0][0], c.motion_segs[0][1]),
    expect: ['d_pk_rdom_approach_shape', 'd_pk_rdom_extinction_lag'],
    forbid: ['enc_pk_dup_frac', 'enc_pk_progress',
      'enc_pk_motion_adjacent_max'],
    why: 'a time-reversed event is still unimodal and still moving — the'
      + ' physics is what breaks: the ball recedes from the pocket, so the'
      + ' peak lands in the front half and the ball is GONE at the start'
      + ' instead of the end, which puts the extinction before the kernel'
      + ' said the pot happened. (Its terminal frame is no longer what the'
      + ' hold holds, so the hold rows fire as collateral.)',
  },
  {
    id: 'pk_excise_pot', clip: 'pocketing',
    // the pot is cut out and back-filled with EMPTY-TABLE frames from the
    // same clip's own tail — real renders, still moving, in the right order
    op: (s, c, m, w) => {
      const [a, b] = w.restate.pk_rdom.approach[0];
      const t0 = w.restate.pk_rdom.tail[0][0];
      for (let i = a; i <= b; i++) s[i] = s[t0 + (i - a)];
    },
    expect: ['d_pk_rdom_event_floor'],
    forbid: ['enc_pk_dup_frac', 'enc_pk_progress', 'enc_pk_hold_max_mad',
      'enc_pk_card_identity'],
    why: 'the strongest attack on this clip: the pot itself is removed and'
      + ' replaced with the cue ball travelling across an empty table, taken'
      + " from this same file's post-swallow tail. Every frame is a genuine"
      + ' render, nothing repeats, nothing freezes, the plates and holds are'
      + ' untouched — only a census that knows the object ball is supposed'
      + ' to BE there can see it. (The splice seam is a step, so the'
      + ' adjacency law fires as collateral.)',
  },
  {
    id: 'pk_red_bloom', clip: 'pocketing', pixelOp: 'redpatch',
    pixelSpan: (c, w) => {
      const [a, b] = w.restate.pk_rdom.approach[0];
      const m = Math.floor((a + b) / 2);
      return [m - 2, m + 2];
    },
    expect: ['d_pk_rdom_peak_max'],
    forbid: ['enc_pk_dup_frac', 'enc_pk_hold_max_mad'],
    why: 'the disclosure ceiling restated: a red element that is not the'
      + ' object ball blooms straight through the approach window. The'
      + " judge's own R>=254 ceiling cannot fire — it is disarmed on this"
      + ' grade, and 1e9 would not have caught it even armed at 489 values',
  },
  {
    id: 'pk_ghost_ball', clip: 'pocketing', pixelOp: 'redpatch',
    pixelSpan: (c, w) => {
      const t0 = w.restate.pk_rdom.tail[0][0];
      return [t0 + 5, t0 + 10];
    },
    expect: ['d_pk_rdom_swallow'],
    forbid: ['enc_pk_dup_frac', 'enc_pk_hold_max_mad',
      'enc_pk_card_identity'],
    why: 'the ball is back after it was swallowed — the splice signature the'
      + ' disarmed enc_pk_redface_outside was built for, stated as'
      + ' containment AFTER the pot because on this table the ball is'
      + ' lawfully in frame before it',
  },
  {
    id: 'pk_flash_outside', clip: 'pocketing', pixelOp: 'redpatch',
    // the disclosed static lead-in: outside every approach window and every
    // containment tail, and hold-bound as a unit
    pixelSpan: (c) => [c.hold_pairs[0][0], c.hold_pairs[0][2]],
    expect: ['d_pk_rdom_lead_static'],
    forbid: ['enc_pk_dup_frac', 'enc_pk_hold_max_mad',
      'd_pk_rdom_approach_shape', 'd_pk_rdom_swallow',
      'd_pk_rdom_event_floor'],
    why: 'red bleeding where the disclosure says there is none. Painted'
      + ' IDENTICALLY across all three lead-in frames so the hold and dup'
      + ' rows stay lawful, and placed where neither the approach window nor'
      + ' the post-swallow tail reaches — on this table that spot is not'
      + ' empty (the object ball is lawfully sitting there), so the only bar'
      + ' that can see it is the one that pins the lead-in to the first'
      + ' moving frame',
  },
  {
    id: 'ft_blank_frames', clip: 'fulltable', pixelOp: 'blank',
    // The withdrawn seal's own defect, replayed at its own scale: 7
    // consecutive body frames, mid-orbit, dimmed to the measured blank band.
    // The point of the case is not that a blank frame is detectable — it is
    // that on the FIRST seal it was not, by anything. If this fires only
    // `d_fulltable_frame_alive`, the new bar is carrying the whole weight
    // alone, which is exactly the claim being made about it.
    pixelSpan: (c) => [c.body[0] + 411, c.body[0] + 417],
    expect: ['d_fulltable_frame_alive'],
    forbid: ['enc_fulltable_dup_frac', 'enc_fulltable_recur_frac',
      'enc_fulltable_hold_max_mad', 'enc_fulltable_card_identity',
      'enc_fulltable_track_anchors', 'enc_fulltable_progress',
      'd_fulltable_bclip_total_max', 'd_fulltable_bclip_comp_max'],
    why: 'the exact frames (v411-v417) the first seal shipped blank, at the'
      + ' exact measured level. Every judge bar and every cloth-family'
      + ' restatement passed them on the original take: the blue-bed floor'
      + ' had been pinned to >= 0 BY those frames, and the judge row that'
      + ' would have caught it (enc_fulltable_scene_floor) is disarmed by'
      + ' the green predicate. Only the colour-agnostic liveness floor sees'
      + ' it. (The adjacency row fires as collateral on the two step edges —'
      + ' that is a property of a 7-frame excision, not of the bar.)',
  },
  {
    id: 'co_truncate', clip: 'corner',
    op: (s) => { s.length -= 30; },
    expectRefuse: true,
    why: 'the authored frame count is a file-identity axis: a short file is'
      + ' invalid evidence, not a red verdict',
  },
  {
    id: 'co_fps60', clip: 'corner', fps: 60, op: () => {},
    expectRefuse: true,
    why: 'every window is an absolute frame index at 30 fps; a re-timed file'
      + ' silently re-points all of them',
  },
  {
    id: 'ft_bed_clip', clip: 'fulltable', pixel: ['patch', 340, 340],
    expect: ['d_fulltable_bclip_total_max', 'd_fulltable_bclip_comp_max'],
    forbid: ['enc_fulltable_dclip_total_max', 'enc_fulltable_dclip_comp_max'],
    why: 'THE restatement proof. A clipped white element sitting on the blue'
      + " bed. The judge's cloth-adjacent clip census masks on GREEN cloth,"
      + ' so on this table it reads 0 and PASSES — exactly the vacuous-bar'
      + ' failure the disarm/restate split exists to prevent',
  },
  {
    id: 'co_bed_blank', clip: 'corner', pixel: ['desat', 200, 260],
    expect: ['d_corner_bed_floor'],
    forbid: ['enc_corner_scene_floor'],
    why: 'the disarmed scene floor restated: cloth driven off blue-dominance'
      + ' is the blank-encode / renderer-collapse signature. The green floor'
      + ' cannot fire because it was never able to clear on this table'
      + ' either — which is why it had to be replaced rather than kept',
  },
];

const reverseSpan = (s, a, b) => {
  const seg = s.slice(a, b + 1).reverse();
  for (let i = 0; i < seg.length; i++) s[a + i] = seg[i];
};
const swapChunks = (s, a, b, n) => {
  for (let i = 0; i < n; i++) { const t = s[a + i]; s[a + i] = s[b + i]; s[b + i] = t; }
};
const freezeSpan = (s, a, n) => { for (let i = 1; i < n; i++) s[a + i] = s[a]; };
/** Ping-pong over `half+1` frames (period 2*half): every adjacent step is one
 * bearing and no frame equals its neighbour, so dup and the adjacent-step law
 * stay clean while the span revisits its own history throughout. */
const triangleLoop = (s, a, half, n) => {
  const per = 2 * half;
  for (let i = 0; i < n; i++) {
    const p = i % per;
    s[a + i] = s[a + (p <= half ? p : per - p)];
  }
};

MODE_FN['red-arm'] = async () => {
  const man = readJson(MANIFEST);
  const win = readJson(WINDOWS_JSON);
  const judgeDir = stageJudge();
  const stagedFixture = path.join(judgeDir, 'fixtures', FIXTURE_BASENAME);
  if (!fs.existsSync(stagedFixture)) fs.copyFileSync(FIXTURE_TRACKED, stagedFixture);
  const work = path.join(PACK, 'redarm');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const strip = (w) => Object.fromEntries(
    Object.entries(w).filter(([k]) => !k.startsWith('_')));
  const only = argOf('--case', null);
  const results = [];
  let broken = 0;

  for (const cse of RED_ARM) {
    if (only && cse.id !== only) continue;
    const clip = man.clips[cse.clip];
    const slots = clip.source_frames.map(([, rel]) => path.join(PACK, rel));
    let px = cse.pixel;
    if (cse.pixelSpan) {
      // spans that have to follow the PINNED windows rather than a literal:
      // a re-authored take moves them, and a red-arm case aimed at a stale
      // frame index is an attack on nothing
      const [a, b] = cse.pixelSpan(clip, win);
      px = [cse.pixelOp, a, b];
    }
    if (px) {
      const [kind, a, b] = px;
      const dir = path.join(work, `${cse.id}-px`);
      fs.mkdirSync(dir, { recursive: true });
      let skip = null;
      for (let i = a; i <= b; i++) {
        const out = path.join(dir, `m${pad4(i)}.png`);
        const r = spawnSync('python3', [MUTATE_PY, kind, slots[i], out],
          { encoding: 'utf8' });
        if (r.status === 3) { skip = `frame ${i} cannot host '${kind}'`; break; }
        if (r.status !== 0) throw new Error(`mutate ${kind} f${i}: ${r.stderr}`);
        slots[i] = out;
      }
      if (skip) {
        // an attack that cannot be staged is reported, never quietly weakened
        broken++;
        results.push({ id: cse.id, clip: cse.clip, why: cse.why, ok: false,
          skipped: skip, expect: cse.expect, got: null });
        console.log(`[red-arm] BROKEN ${cse.id} — not stageable: ${skip}`);
        continue;
      }
    }
    if (cse.op) cse.op(slots, clip, man, win);
    const seqDir = path.join(work, `${cse.id}-seq`);
    assemble(seqDir, slots);
    const mp4 = path.join(work, `${cse.id}.mp4`);
    encodeSeq(seqDir, mp4, cse.fps || 30);

    const files = {
      fulltable: man.clips.fulltable.mp4,
      corner: man.clips.corner.mp4,
      pocketing: man.clips.pocketing.mp4,
    };
    files[cse.clip] = mp4;
    const cfg = path.join(work, `${cse.id}-cfg.json`);
    const out = path.join(work, `${cse.id}-judge.json`);
    writeJson(cfg, {
      files,
      windows: Object.fromEntries(
        Object.entries(win.windows).map(([k, v]) => [k, strip(v)])),
      out,
    });
    const jr = runJudge(judgeDir, cfg, 'quiet');
    let red = [];
    let refused = jr.code === 2;
    if (!refused && fs.existsSync(out)) red = readJson(out).red || [];
    // the restatement bars run on the corrupted clip too, whenever the case
    // makes a claim about them in EITHER direction
    const claims = [...(cse.expect || []), ...(cse.forbid || [])];
    if (!refused && claims.some((b) => b.startsWith('d_'))) {
      const mman = path.join(work, `${cse.id}-man.json`);
      const m2 = JSON.parse(JSON.stringify(man));
      m2.clips[cse.clip].mp4 = mp4;
      writeJson(mman, m2);
      execFileSync('python3', [CENSUS_PY, '--manifest', mman,
        '--out', path.join(work, `${cse.id}-census.json`),
        '--fixture', path.join(work, `${cse.id}-sig.json`)], { stdio: 'ignore' });
      const cen = readJson(path.join(work, `${cse.id}-census.json`));
      for (const r of restateRows(cen, man, win)) if (!r.ok) red.push(r.bar);
    }
    // a bar declared inapplicable is out of the verdict here too — otherwise
    // every pocketing case would report it as collateral for the rest of time
    red = red.filter((b) => !(win.inapplicable?.bars || []).includes(b));
    const got = refused ? null : [...new Set(red)].sort();
    const missing = cse.expectRefuse ? []
      : (cse.expect || []).filter((b) => !refused && !got.includes(b));
    const leaked = cse.expectRefuse ? []
      : (cse.forbid || []).filter((b) => !refused && got.includes(b));
    const collateral = cse.expectRefuse || refused ? []
      : got.filter((b) => !(cse.expect || []).includes(b));
    const ok = cse.expectRefuse
      ? refused
      : (!refused && missing.length === 0 && leaked.length === 0);
    if (!ok) broken++;
    results.push({
      id: cse.id, clip: cse.clip, why: cse.why, ok,
      expect: cse.expectRefuse ? 'REFUSAL (exit 2)' : cse.expect,
      forbid: cse.forbid || [],
      got: refused ? 'REFUSAL (exit 2)' : got,
      missing, leaked, collateral, judge_exit: jr.code,
    });
    console.log(`[red-arm] ${ok ? 'ARMED' : 'BROKEN'} ${cse.id}`
      + (cse.expectRefuse
        ? ` expect=REFUSE got=${refused ? 'REFUSE' : JSON.stringify(got)}`
        // this is the EXPECTATION, not the outcome. An earlier version of
        // this line printed it under the label `fired=`, which made a case
        // that had MISSED its bar read as though the bar had fired.
        : ` expect=${JSON.stringify(cse.expect)}`
          + (missing.length ? ` MISSING=${JSON.stringify(missing)}` : '')
          + (leaked.length ? ` LEAKED=${JSON.stringify(leaked)}` : '')
          + (collateral.length ? ` collateral=${JSON.stringify(collateral)}` : '')));
  }
  // Bind the verdict to the bytes it was measured against. Every case judges a
  // corrupted copy of ONE clip against the pack's other two unmodified ones,
  // so "these cases fired" is a statement about these three files and no
  // others. Recording the shas lets --publish refuse a red-arm report that was
  // produced against a different cut, instead of inferring currency from file
  // mtimes — the same binding encoded-bars-488d.json already carries. Measured
  // here rather than copied out of the manifest: the manifest states what the
  // encode produced, this states what was on disk when the arm was pulled.
  const armedFiles = Object.fromEntries(['fulltable', 'corner', 'pocketing']
    .map((c) => [c, man.clips[c].mp4]));
  writeJson(REDARM_JSON, {
    lane: 'GH-488D wave A5', table: TABLE,
    files: armedFiles,
    files_sha256: Object.fromEntries(
      Object.entries(armedFiles).map(([c, p]) => [c, sha256File(p)])),
    judge: {
      path_real: man.judge_path_real, sha256: man.judge_sha256,
      fixture: FIXTURE_TRACKED, fixture_sha256: sha256File(FIXTURE_TRACKED),
    },
    cases: results, broken,
  });
  console.log(`[red-arm] ${results.length - broken}/${results.length} armed`
    + ` -> ${REDARM_JSON}`);
  if (broken) process.exit(4);
};

// ===========================================================================
// PROVENANCE — byte-bound, gathered once, stamped on every plate and into
// the pack's own provenance.json. The 488p schema (orbitsweep-488p.mjs
// provenance()) adopted as-is, including its naming trap, because the two
// packs are read side by side and a reader should not have to learn two
// vocabularies to compare them.
// ===========================================================================
const chromeShellPin = () => {
  const p = path.join(webDir, 'tools', 'chrome-shell.pin');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : null;
};

function provenance() {
  const g = (a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8' }).trim();
  // TWO different states, kept apart because only one of them can affect what
  // this tool did. A modified TRACKED file means the printed commit does not
  // describe the code that ran. An untracked file (an order note, a scratch
  // pad) cannot; collapsing both into one "dirty" flag would put a warning on
  // every plate for the presence of a text file nobody rendered from.
  const status = g(['status', '--porcelain']).split('\n').filter(Boolean);
  const dirty = status.some((l) => !l.startsWith('??'));
  const untracked = status.filter((l) => l.startsWith('??'))
    .map((l) => l.slice(3));
  // ZERO-CRATES fence, proven rather than asserted: the behavioural core has
  // no diff against the branch point, so nothing in these videos can have
  // moved it. An empty diffstat is the proof; the string is carried so a
  // reader can see WHAT was compared and not just the verdict.
  const coreDiff = g(['diff', '--stat', 'main...HEAD', '--', 'crates', 'sdk']);
  // D621-FIX condition 5: hash the binary that actually RENDERED — the one
  // under the served root — and carry the canonical binary's hash beside it
  // under its own name. Hashing webDir here resolved through the GH-621
  // overlay to the committed file and printed the canonical hash on plates
  // that said "kernel = scratch build", which was self-contradicting.
  const wasm = path.join(SERVE_DIR, 'dist', 'pool-wasm', 'pool_wasm_bg.wasm');
  const wasmCanonical = path.join(webDir, 'dist', 'pool-wasm', 'pool_wasm_bg.wasm');
  // GH-621: the provenance binds the twin of the table being cut, not the
  // 9 ft twin for every table (CANON_SPECS keys the three canonical twins)
  const spec = path.join(REPO, CANON_SPECS[TABLE]);
  return {
    tool: 'tools/render/orbitsweep-488d.mjs',
    tool_sha256: sha256File(path.join(HERE, 'orbitsweep-488d.mjs')),
    card_tool: 'tools/render/gh488d/make_card_488d.py',
    card_tool_sha256: sha256File(CARD_PY),
    // HOUSE NAMING TRAP, stated so nobody has to rediscover it: what this
    // repo's ceremony calls the "tree sha" is `git rev-parse HEAD`, which is
    // a COMMIT object, not a tree. Both are carried, under names that say
    // which is which, and the genuine tree objects get their own keys.
    tree_sha_house: g(['rev-parse', 'HEAD']),
    git_commit: g(['rev-parse', 'HEAD']),
    git_tree_object: g(['rev-parse', 'HEAD^{tree}']),
    web_tree_object: g(['rev-parse', 'HEAD:web']),
    tree_dirty: dirty,
    tracked_modifications: status.filter((l) => !l.startsWith('??')),
    untracked_files: untracked,
    branch: g(['rev-parse', '--abbrev-ref', 'HEAD']),
    core_bytes_unchanged_vs_main: coreDiff === '',
    core_diff_stat: coreDiff,
    kernel_wasm: path.relative(REPO, wasm),
    kernel_wasm_served_from: SERVE_DIR,
    kernel_wasm_sha256: sha256File(wasm),
    kernel_wasm_bytes: fs.statSync(wasm).size,
    kernel_wasm_version: kernelVersionOf(SERVE_DIR),
    canonical_wasm: 'web/dist/pool-wasm/pool_wasm_bg.wasm',
    canonical_wasm_sha256: sha256File(wasmCanonical),
    canonical_wasm_version: kernelVersionOf(webDir),
    kernel_is_canonical: sha256File(wasm) === sha256File(wasmCanonical),
    canonical_geometry: CANON_SPECS[TABLE],
    canonical_geometry_sha256: sha256File(spec),
    chrome_shell_pin: chromeShellPin(),
    ffmpeg: execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' })
      .split('\n')[0].trim(),
    node: process.version,
    raster: `${W}x${H}`,
    fps: 30,
    encoder: encodeArgv('<seq>/t%04d.png', '<out>.mp4').join(' '),
    x264_lookahead: X264_LOOKAHEAD,
    card_frames: CARD_FRAMES,
    table: TABLE,
    look: LOOK,
    rig: `app.html?table=${TABLE}&cinema=1&look=${LOOK}`,
    judge: 'tools/render/orbitsweep-judge.py',
    judge_sha256: sha256File(JUDGE_PY),
    card_fixture: 'tools/render/fixtures/encoded-cards-488d-signature.json',
    card_fixture_sha256: fs.existsSync(FIXTURE_TRACKED)
      ? sha256File(FIXTURE_TRACKED) : null,
  };
}

// ===========================================================================
// --cards-only : re-cut the title plates, prove the body did not move
// ===========================================================================
// The order this mode exists to serve: put the residual ledger ON the plates
// without re-rendering a single body frame. It rebuilds each clip's sequence
// from the manifest's own `source_frames` table — the slot-by-slot record of
// what the encoder read — swapping ONLY the eligible card slots, then re-runs
// the frozen encode chain and PROVES the claim on the delivered side rather
// than asserting it: the sha256 over every non-card frame's decoded md5 must
// equal the sealed clip's. If it does not, the mode refuses and writes
// nothing to the output directory.
MODE_FN['cards-only'] = async () => {
  const man = readJson(MANIFEST);
  const out = path.resolve(__pathOpt('--out', { default: path.join(PACK, 'r2'), tag: 'orbitsweep-488d' }));
  const cardDir = path.join(out, 'cards');
  const seqRoot = path.join(out, 'seq');
  fs.mkdirSync(cardDir, { recursive: true });
  const prov = provenance();
  const bodyHead = man.git ? man.git.head : null;

  // Plate provenance rows. `tree sha (this cut)` and `body frames from` are
  // TWO DIFFERENT HEADS and are labelled as two: the plate is cut now, the
  // body frames were captured at whatever head the --sweep ran at. Conflating
  // them would be the single easiest lie to tell on a title card.
  // A plate that prints a commit sha is CLAIMING that commit contains the
  // ledger it prints. If the tree is dirty when the plate is cut, that claim
  // is not checkable, so the dirty state rides the row rather than being left
  // off — the same disclosure the body-frame row has always carried.
  const provRows = (clip, geom) => [
    ['tree sha (this cut)',
      `${prov.git_commit}${prov.tree_dirty ? '  [DIRTY TREE]' : ''}`],
    ['body frames from', bodyHead
      ? `${bodyHead} (dirty: ${man.git.dirty})` : 'UNRECORDED'],
    ['web tree object', prov.web_tree_object],
    ['canonical geometry', `${path.basename(prov.canonical_geometry)}  ${prov.canonical_geometry_sha256.slice(0, 16)}`],
    ['kernel wasm sha256', `${prov.kernel_wasm_sha256.slice(0, 32)}  ${prov.kernel_is_canonical ? '(= canonical)' : '(SERVED scratch build; canonical ' + prov.canonical_wasm_sha256.slice(0, 16) + '…)'}`],
    // GH-621: on the declared kernel branch the diff is non-empty and
    // multi-line; the plate carries its ONE summary line, labelled as a
    // kernel branch, so the card tool can measure it and the reader is not
    // told 'zero bytes' on a tree that added two catalog entries.
    ['core vs main', prov.core_bytes_unchanged_vs_main
      ? 'ZERO bytes changed under crates/ and sdk/'
      : `DECLARED KERNEL BRANCH — ${prov.core_diff_stat.trim().split('\n').pop().trim()}`],
    // GH-621: the plate names the kernel that RENDERED the body, which on a
    // size variant is the scratch overlay build, not the canonical wasm.
    ...(IS_VARIANT ? [['kernel served',
      `${kernelVersionOf(SERVE_DIR)} (scratch overlay; canonical ${kernelVersionOf(webDir)} cannot resolve this id before the landing ceremony)`]] : []),
    ['encoder', 'h264 crf 14 preset medium yuv420p 4:2:0'],
    // GH-621: on a size variant the plate must not claim a baked rig — the
    // app boots it under gi.js's footprint honesty gate (no committed bake
    // for the 8/7 ft beds), and the manifest's boot records say so.
    ['rig', IS_VARIANT
      ? 'canopy_panel  giReady  GI HONESTY-GATED (no committed bake for this footprint)  exposure 1.05  toneMapping 4'
      : 'canopy_panel  giReady  baked  exposure 1.05  toneMapping 4'],
    ['clip', geom],
    ['date', argOf('--date', new Date().toISOString().slice(0, 10))],
  ];

  const GEOM_LINE = {
    fulltable: `full-table orbit  ${ORBITS.fulltable.run} poses  fov ${ORBITS.fulltable.fov}`,
    corner: `corner-pocket orbit  ${ORBITS.corner.run} poses  fov ${ORBITS.corner.fov}`,
    pocketing: `pocketing shot  real time then ${POCKETING.slowRate}x  fov ${PK_FOV}`,
  };
  // (the variant brand drops the programme phrase and the id — the sub line
  // already names the table — so the letter-spaced row fits the plate)
  const BRAND = IS_VARIANT
    ? 'OPENBILLIARDS  ·  GH-621 SIZE VARIANT'
    : 'OPENBILLIARDS  ·  1:1 REFERENCE REBUILD  ·  GH-488D';
  const DHEAD = 'HONEST DISCLOSURE — ONE LEDGER, MEASUREMENTS NOT ADJECTIVES';
  const DFOOT = IS_VARIANT
    ? 'GH-621 frames-only pack: no INDEX.md — the disclosure IS this line; provenance in manifest-488d.json and SPIKE-REPORT-D621.md'
    : 'transcribed verbatim from the one ledger in tools/render/orbitsweep-488d.mjs; full text in this pack\'s INDEX.md';

  // The re-cut pack must be a REAL pack, not a folder of three mp4s: every
  // gate in this file resolves `source_frames` against its own --pack root and
  // re-decodes the clips it is judging. Hardlinking `run/` costs no bytes and
  // makes `--sig`, `--encoded` and `--red-arm` runnable against the DELIVERED
  // r2 bytes rather than against the wave-A5 ones they replace. Gating the
  // superseded artifact would be the whole point missed.
  const mirror = (src, dst) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, e.name); const d = path.join(dst, e.name);
      if (e.isDirectory()) { mirror(s, d); continue; }
      if (e.isSymbolicLink()) continue;
      if (fs.existsSync(d)) fs.rmSync(d);
      fs.linkSync(s, d);
    }
  };
  mirror(path.join(PACK, 'run'), path.join(out, 'run'));

  const rman = JSON.parse(JSON.stringify(man));
  rman.wave = 'GH-488D wave A5-R2 (plates re-cut, body frames carried)';
  rman.body_capture_git = man.git;
  rman.cards_git = { head: prov.git_commit, dirty: prov.tree_dirty };

  const report = { pack: out, wave: IS_VARIANT ? 'GH-621 size variant' : 'GH-488D wave A5-R2',
    provenance: prov, clips: {}, ledger_rows: LEDGER.length };
  let refused = 0;

  for (const [clip, c] of Object.entries(man.clips)) {
    // GH-621: a clip the sweep REFUSED to cut (recorded, not silently absent)
    // has no frames to re-plate; carry the refusal through verbatim.
    if (!c.source_frames) {
      report.clips[clip] = { status: c.status ?? 'absent', reason: c.reason ?? null };
      console.log(`[cards-only] ${clip}: carried as ${c.status ?? 'absent'} (no frames)`);
      continue;
    }
    // Resolve every body frame against the MIRRORED copy in this pack, not
    // the sealed one it was hardlinked from: same inode, same bytes, but the
    // manifest that comes out the far end then describes files this pack
    // actually contains.
    const slots = c.source_frames.map(([, rel]) => {
      const here = path.join(out, rel);
      return fs.existsSync(here) ? here : path.join(PACK, rel);
    });
    const segs = recuttableSegs(c.card_segs, slots.length);
    const sealedSig = bodyFrameSig(c.mp4, c.card_segs);

    // Re-cut only the eligible plates. An ineligible one keeps the SEALED
    // plate byte-for-byte, which is what makes the body-frame claim true
    // rather than nearly true — see X264_LOOKAHEAD.
    const cards = [];
    segs.forEach((s, i) => {
      const sealed = man.cards[clip][i];
      // TWO independent reasons a plate may keep its wave-A5 bytes, and both
      // are recorded rather than collapsed into one:
      //   (1) it is not a TITLE plate. The 488p disclosure law puts the
      //       ledger on the plate that opens a clip; plate i>0 is a mid-clip
      //       section divider ("SLOW MOTION"), and hanging the residual
      //       ledger on a divider would print it twice in one viewing.
      //   (2) it is not safe to re-cut — see X264_LOOKAHEAD.
      const why = [];
      if (i > 0) why.push('mid-clip section divider, not the clip title plate'
        + ' that the disclosure law prints on');
      if (!s.safe) why.push(`${s.body_frames_in_lookahead} body frames lie in`
        + ` the x264 lookahead window ${JSON.stringify(s.lookahead_window)}`
        + ' ending at this card, so re-cutting it would move them');
      if (why.length) {
        // Hardlink the kept plate INTO this pack. A published pack whose
        // manifest reaches back into ../pack for one of its own frames is not
        // a pack, it is a pointer to one — and the thing it points at lives
        // in /tmp. Same inode, no bytes, self-contained.
        const keep = path.join(cardDir, `${clip}-${i}.png`);
        // Always link from the SEALED plate, never from whatever a previous
        // run of this mode happened to leave at the destination.
        const src = path.join(PACK, `cards/${clip}-${i}.png`);
        if (fs.existsSync(keep)) fs.rmSync(keep);
        fs.linkSync(src, keep);
        for (let k = s.seg[0]; k <= s.seg[1]; k++) slots[k] = keep;
        cards.push({ index: i, recut: false, png: keep,
          sha256: sha256File(keep),
          sealed_sha256: sealed.sha256, spec: sealed.spec,
          reason: why.join('; ') });
        return;
      }
      const png = path.join(cardDir, `${clip}-${i}.png`);
      // Title / sub / foot are carried over from the SEALED plate verbatim:
      // the re-cut adds a provenance block and the ledger, and changes
      // nothing a viewer already read in wave A5.
      const card = makeCard(png, {
        title: sealed.spec.title, sub: sealed.spec.sub, foot: sealed.spec.foot,
        brand: BRAND,
        prov: provRows(clip, GEOM_LINE[clip]),
        disclosure: cardLineFor(clip),
        disclosureHead: DHEAD, disclosureFoot: DFOOT,
      });
      cards.push({ index: i, recut: true, sealed_sha256: sealed.sha256,
        sealed_text_px: sealed.text_px, ...card });
      for (let k = s.seg[0]; k <= s.seg[1]; k++) slots[k] = png;
    });

    const seqDir = path.join(seqRoot, clip);
    assemble(seqDir, slots);
    const mp4 = path.join(out, path.basename(c.mp4));
    const args = encodeSeq(seqDir, mp4);
    const sig = bodyFrameSig(mp4, c.card_segs);

    const held = sig.sha256 === sealedSig.sha256
      && sig.frames === sealedSig.frames;
    if (!held) {
      console.error(`[cards-only] REFUSAL: ${clip} body frames MOVED.`
        + ` sealed ${sealedSig.body_frames}f ${sealedSig.sha256}`
        + ` vs re-cut ${sig.body_frames}f ${sig.sha256}`);
      refused += 1;
    }
    report.clips[clip] = {
      mp4: path.basename(mp4),
      mp4_sha256: sha256File(mp4),
      bytes: fs.statSync(mp4).size,
      sealed_mp4_sha256: c.mp4_sha256,
      sealed_bytes: c.bytes,
      frames: sig.frames,
      card_segs: c.card_segs,
      segments: segs,
      cards,
      body_frames: sig.body_frames,
      body_framemd5_sha256: sig.sha256,
      sealed_body_framemd5_sha256: sealedSig.sha256,
      body_frames_unchanged: held,
      card_disclosure_line: cardLineFor(clip),
      encode_argv: args,
      x264_sei: x264Sei(mp4),
    };
    // rebase the manifest onto the re-cut pack so the gates judge THESE bytes
    const rc = rman.clips[clip];
    rc.mp4 = mp4;
    rc.mp4_sha256 = report.clips[clip].mp4_sha256;
    rc.bytes = report.clips[clip].bytes;
    rc.encode_argv = args;
    rc.x264_sei = report.clips[clip].x264_sei;
    rc.source_frames = slots.map((f, i) => [i, path.relative(out, f)]);
    rc.source_sha256 = Object.fromEntries([...new Set(slots)]
      .map((f) => [path.relative(out, f), sha256File(f)]));
    rc.superseded = { mp4_sha256: c.mp4_sha256, bytes: c.bytes,
      body_framemd5_sha256: sealedSig.sha256 };
    rman.cards[clip] = cards;
    if (rc.liveness) rc.liveness.dir = path.join(out, 'seq', clip);

    console.log(`[cards-only] ${clip}: ${sig.frames}f, ${cards.filter((k) => k.recut).length}/${cards.length} plates re-cut,`
      + ` body ${held ? 'UNCHANGED' : 'MOVED'} (${sig.body_frames} frames)`);
  }

  if (refused) {
    // Write the evidence of the refusal, but NOT a manifest: a manifest is
    // this lane's statement that a pack is gateable, and a pack whose body
    // frames moved is not the pack anybody verified.
    writeJson(path.join(out, 'cards-only-488d.json'), report);
    console.error('[cards-only] the re-cut is NOT deliverable; nothing is'
      + ' sealed from a pack whose body frames moved.');
    process.exit(3);
  }
  writeJson(path.join(out, 'manifest-488d.json'), rman);
  writeJson(path.join(out, 'cards-only-488d.json'), report);
  console.log(`CARDS-ONLY DONE -> ${out}`);
  console.log('[cards-only] next, on THESE bytes and in this order:'
    + ` --sig --pack ${out}  (re-pins the card fixture: a conscious re-cut`
    + ' regenerates it), then --encoded, then --red-arm');
};

// ===========================================================================
// --publish : write the honest surface, then move the pack out of /tmp
// ===========================================================================
// Two jobs, in one mode because they must not be separable. The honest
// surface (INDEX.md + provenance.json) is GENERATED from the same arrays the
// plates were cut from and from measurements taken on the delivered files, so
// there is no hand-typed number anywhere in it to drift. And a pack does not
// leave /tmp until its gate reports are present and green — publishing an
// ungated pack out of a volatile directory is how an unproven artifact
// acquires the authority of a filed one.
function decodeCheck(mp4) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', mp4, '-f', 'null', '-'],
    { encoding: 'utf8' });
  const errs = (r.stderr || '').split('\n').filter(Boolean);
  return { decode_errors: errs.length, decode_stderr: errs.slice(0, 8) };
}
function probeDuration(mp4) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' });
  return Number((r.stdout || '').trim()) || null;
}

MODE_FN.publish = async () => {
  const man = readJson(MANIFEST);
  const rep = readJson(path.join(PACK, 'cards-only-488d.json'));
  const dest = __pathOpt('--dest', { default: null, tag: 'orbitsweep-488d' });
  const need = { bars: BARS_JSON, redarm: REDARM_JSON,
    census: CENSUS_JSON, windows: WINDOWS_JSON,
    judge: path.join(PACK, 'judge-488d.json') };
  for (const [k, p] of Object.entries(need)) {
    if (!fs.existsSync(p)) {
      console.error(`[publish] REFUSAL: ${k} report missing (${p}).`
        + ' Run --sig, --encoded and --red-arm on THESE bytes first; a pack'
        + ' is not published on the strength of a gate run against the bytes'
        + ' it replaced.');
      process.exit(2);
    }
  }
  const bars = readJson(need.bars);
  const redarm = readJson(need.redarm);
  // The index states "N judge + M restatement bars" as a headline number. It
  // must come from the producer, which is the only place the two populations
  // are still separate arrays. An earlier version read `bars.restate`, a key
  // --encoded has never written, so it would have published "73 judge + 0
  // restatement" — a true total over a false split, and the wrong half of the
  // pack credited for work the other half did.
  if (!bars.bar_counts || bars.bar_counts.total !== (bars.bars || []).length) {
    console.error('[publish] REFUSAL: the encoded-bars report does not carry a'
      + ' bar_counts split that agrees with its own bars array'
      + ` (${JSON.stringify(bars.bar_counts)} vs ${(bars.bars || []).length}`
      + ' rows). Re-run --encoded with the current instrument.');
    process.exit(2);
  }
  const liveRed = (bars.red || []).filter(
    (b) => !(bars.inapplicable?.bars || []).includes(b));
  if (liveRed.length) {
    console.error(`[publish] REFUSAL: ${liveRed.length} live red bar(s):`
      + ` ${liveRed.join(' ')}`);
    process.exit(2);
  }
  if (redarm.broken) {
    console.error(`[publish] REFUSAL: ${redarm.broken} red-arm case(s) broken`);
    process.exit(2);
  }
  // The gate reports must describe THESE files, not files with the same name.
  // Both reports are checked, and an ABSENT binding is a refusal rather than a
  // pass: an earlier version read `bars.files_sha256 || {}`, so a report with
  // no shas at all iterated zero times and sailed through the check that
  // exists to catch exactly that report.
  for (const [what, rp] of [['encoded-bars', bars], ['red-arm', redarm]]) {
    const got = rp.files_sha256;
    if (!got || Object.keys(got).length !== 3) {
      console.error(`[publish] REFUSAL: the ${what} report does not record the`
        + ' mp4 sha256s it was measured against, so it cannot be bound to'
        + ' these bytes. Re-run that gate with the current instrument.');
      process.exit(2);
    }
    for (const [clip, sha] of Object.entries(got)) {
      if (sha !== man.clips[clip].mp4_sha256) {
        console.error(`[publish] REFUSAL: the ${what} report was produced`
          + ` against a different ${clip} (${sha.slice(0, 16)}) than this pack`
          + ` holds (${man.clips[clip].mp4_sha256.slice(0, 16)}).`);
        process.exit(2);
      }
    }
  }

  const prov = provenance();
  const order = ['fulltable', 'corner', 'pocketing'];
  const videos = order.map((clip) => {
    const c = man.clips[clip];
    const rc = rep.clips[clip];
    const f = path.join(PACK, path.basename(c.mp4));
    const sig = bodyFrameSig(f, c.card_segs);
    return {
      clip,
      file: path.basename(c.mp4),
      sha256: sha256File(f),
      bytes: fs.statSync(f).size,
      duration_s: probeDuration(f),
      frames: sig.frames,
      card_segs: c.card_segs,
      card_frames: c.card_segs.reduce((n, [a, b]) => n + (b - a + 1), 0),
      body_frames: sig.body_frames,
      body_framemd5_sha256: sig.sha256,
      // THE INVARIANT THAT CARRIES ACROSS THE RE-CUT. The mp4 sha changed
      // because the plate changed; the body did not, and this is the plane
      // on which "the viewer sees the same pixels" can actually be asserted,
      // because framemd5 hashes DECODED frames rather than the bitstream.
      sealed_body_framemd5_sha256: rc.sealed_body_framemd5_sha256,
      body_frames_unchanged_vs_wave_a5: rc.body_frames_unchanged,
      superseded_wave_a5: { sha256: rc.sealed_mp4_sha256,
        bytes: rc.sealed_bytes },
      cards: rc.cards.map((k) => ({ index: k.index, recut: k.recut,
        sha256: k.sha256, sealed_sha256: k.sealed_sha256,
        title: (k.spec || {}).title, reason: k.reason || null })),
      card_disclosure_line: rc.card_disclosure_line,
      recut_eligibility: rc.segments,
      encode_argv: rc.encode_argv,
      x264_sei: rc.x264_sei,
      body_capture: man.git
        ? { head: man.git.head, dirty_paths: man.git.dirty } : 'UNRECORDED',
      ...decodeCheck(f),
    };
  });

  const pj = {
    pack: path.basename(dest || PACK),
    wave: 'GH-488D wave A5-R2',
    lane: 'Diamond Pro-Am 9 ft (diamond_proam_9ft)',
    generated_utc: new Date().toISOString(),
    provenance: prov,
    // The provenance AS OF THE CUT, carried separately and not recomputed:
    // the tool and card-tool shas that actually produced these plates are the
    // ones recorded when they were produced. Re-hashing the tool now would
    // silently substitute today's bytes for the ones that ran.
    cut_provenance: rep.provenance,
    heads: {
      note: 'This pack has THREE heads and names all three rather than'
        + ' presenting one. The BODY frames were captured at'
        + ' body_capture_head. The title PLATES were cut at card_cut_head,'
        + ' which is later and is the commit whose ledger the plates print.'
        + ' This honest surface was generated at index_generated_head, which'
        + ' may be later still. No single sha describes the whole pack, and'
        + ' the transcription check in --verify is what binds them: it'
        + ' re-derives every plate\'s disclosure line from the ledger in the'
        + ' tool AS IT IS NOW and requires it to equal what the plate says,'
        + ' so a ledger edit that changed any printed line could not pass.',
      body_capture_head: man.git ? man.git.head : 'UNRECORDED',
      card_cut_head: rep.provenance.git_commit,
      index_generated_head: prov.git_commit,
    },
    gates: {
      bars_total: bars.bar_counts.total,
      judge_bars: bars.bar_counts.judge,
      restatement_bars: bars.bar_counts.restatement,
      live_red: liveRed,
      inapplicable: bars.inapplicable || null,
      disarmed: bars.disarmed || null,
      red_arm_cases: (redarm.cases || []).length,
      red_arm_broken: redarm.broken,
      card_fixture_sha256: prov.card_fixture_sha256,
      card_fixture_repinned: true,
      card_fixture_repin_reason:
        'A conscious re-cut regenerates the fixture (the 489 law). The judge'
        + ' identity-judges plates on intra-card MAD, a lum>=128 text-pixel'
        + ' census and a 16x10 average-luma grid signature; adding the'
        + ' disclosure paragraph changes the last two by construction, so a'
        + ' fixture that still described the wave-A5 plates would be'
        + ' describing plates this pack does not contain.',
    },
    videos,
    ledger: LEDGER,
    carried_open: CARRIED_OPEN,
  };
  writeJson(path.join(PACK, 'provenance.json'), pj);

  // ---- INDEX.md, generated from the same arrays the plates were cut from --
  const L = [];
  const p = (s = '') => L.push(s);
  p('# GH-488D wave A5-R2 — Diamond Pro-Am 9 ft reference pack');
  p();
  p('Three clips of the rebuilt Diamond Pro-Am 9 ft, the gate reports that');
  p('judge them, and the one residual ledger. The ledger is printed on the');
  p('title plates as well as here: a viewer who never opens this file still');
  p('sees what the pack does not claim.');
  p();
  p('## What this pack is not');
  p();
  p('It is not photo-match evidence. The A4 camera work is'
    + ' DIAGNOSED-NOT-FITTED: the failure modes are identified and measured,');
  p('they are not corrected. Read the A4 row of the ledger before reading any');
  p('number in this pack as agreement with a photograph.');
  p();
  p('## Byte-bound provenance');
  p();
  p('| field | value |');
  p('| --- | --- |');
  const provOrder = ['tool', 'tool_sha256', 'card_tool', 'card_tool_sha256',
    'branch', 'git_commit', 'git_tree_object', 'web_tree_object', 'tree_dirty',
    'core_bytes_unchanged_vs_main', 'kernel_wasm', 'kernel_wasm_sha256',
    'kernel_wasm_bytes', 'canonical_geometry', 'canonical_geometry_sha256',
    'chrome_shell_pin', 'ffmpeg', 'node', 'raster', 'fps', 'encoder',
    'x264_lookahead', 'card_frames', 'judge', 'judge_sha256', 'card_fixture',
    'card_fixture_sha256'];
  for (const k of provOrder) {
    p(`| \`${k}\` | ${JSON.stringify(prov[k])} |`);
  }
  p();
  p('### The house naming trap');
  p();
  p('What this repo\'s ceremony calls the "tree sha" is `git rev-parse HEAD`,');
  p('which is a COMMIT object, not a tree. Both are carried above under names');
  p('that say which is which. `git_tree_object` and `web_tree_object` are the');
  p('genuine tree objects.');
  p();
  p('### THREE HEADS');
  p();
  p(pj.heads.note.replace(/\s+/g, ' '));
  p();
  p(`- body frames captured at \`${pj.heads.body_capture_head}\``);
  p(`- title plates cut at \`${pj.heads.card_cut_head}\``);
  p(`- this honest surface generated at \`${pj.heads.index_generated_head}\``);
  p();
  p('The Predator lane\'s 488p pack records `UNRECORDED` for the equivalent');
  p('body-capture row, because its pack predates the run sidecar that would');
  p('have held it. This lane\'s sweep manifest carries the head, so the row is');
  p('a fact here.');
  p();
  p('### What `[DIRTY TREE]` on the plates means');
  p();
  const cutMods = (rep.provenance.tracked_modifications || []);
  const cutUntracked = (rep.provenance.untracked_files || []);
  if (rep.provenance.tree_dirty) {
    p('Every plate\'s `tree sha (this cut)` row carries a `[DIRTY TREE]`');
    p('marker, so the sha it prints does not by itself describe the bytes that');
    p(`cut the plate. Naming what was dirty: ${cutMods.length} tracked`);
    p(`modification${cutMods.length === 1 ? '' : 's'} —`);
    p();
    for (const m of cutMods) p(`- \`${m}\``);
    p();
    p('The marker counts TRACKED modifications only. Untracked files were');
    p(`present too (${cutUntracked.map((f) => `\`${f}\``).join(', ') || 'none'}),`);
    p('and are deliberately excluded: an untracked working note cannot change');
    p('what any tool did, and an earlier version of this row flagged every');
    p('plate because of one.');
  } else {
    p('No plate carries a `[DIRTY TREE]` marker: the working tree held no');
    p('tracked modification when the plates were cut, so the sha each plate');
    p('prints fully describes the bytes that cut it.');
  }
  p();
  p('## Videos');
  p();
  p('| clip | file | frames | body | duration | bytes | sha256 |');
  p('| --- | --- | ---: | ---: | ---: | ---: | --- |');
  for (const v of videos) {
    p(`| ${v.clip} | \`${v.file}\` | ${v.frames} | ${v.body_frames}`
      + ` | ${v.duration_s}s | ${v.bytes} | \`${v.sha256}\` |`);
  }
  p();
  p('### The plates were re-cut; the body was not');
  p();
  p('Wave A5 delivered these clips with plain title plates. This wave re-cut');
  p('the plates to carry the ledger, and re-encoded — so the mp4 shas below');
  p('SUPERSEDE the wave-A5 ones and are not the same bytes. What did not');
  p('change is every frame a viewer watches for content. The invariant is the');
  p('sha256 over the decoded md5 of every non-card frame, which is measured on');
  p('the delivered file rather than argued for:');
  p();
  p('| clip | body frames | body framemd5 sha256 | wave A5 | equal |');
  p('| --- | ---: | --- | --- | --- |');
  for (const v of videos) {
    p(`| ${v.clip} | ${v.body_frames} | \`${v.body_framemd5_sha256}\``
      + ` | \`${v.sealed_body_framemd5_sha256}\``
      + ` | ${v.body_frames_unchanged_vs_wave_a5 ? 'YES' : 'NO'} |`);
  }
  p();
  p('Superseded wave-A5 deliverables, named so a reader holding the older');
  p('files knows they are older:');
  p();
  for (const v of videos) {
    p(`- \`${v.file}\` — was \`${v.superseded_wave_a5.sha256}\``
      + ` (${v.superseded_wave_a5.bytes} B), now \`${v.sha256}\``
      + ` (${v.bytes} B)`);
  }
  p();
  p('### Which plates were re-cut, and which were not');
  p();
  p('`preset medium` runs `rc-lookahead=40` with mb-tree, so a frame\'s');
  p('quantiser decisions depend on the next 40 frames. Re-cutting a plate that');
  p('body frames look forward INTO would move those body frames. That is not a');
  p('theory: re-cutting pocketing\'s second plate at [130,174] changed exactly');
  p('body frames 91-129 — a contiguous run of 39 ending at the frame before the');
  p('plate, i.e. precisely lookahead reach — while IDR placement stayed');
  p('identical at 0/60/130/175. So a plate is re-cut only when no body frame');
  p('lies in the 40-frame window ending at its first frame.');
  p();
  p('The observed run is 39 frames and the window below is 40. That is not a');
  p('discrepancy: 39 is what one particular re-cut happened to move, 40 is how');
  p('far the encoder is entitled to look. The rule uses the entitlement, so a');
  p('plate whose window is clear by one frame is still refused.');
  p();
  for (const v of videos) {
    for (const c of v.cards) {
      p(`- **${v.clip} plate ${c.index}** (${c.title}) —`
        + ` ${c.recut ? 'RE-CUT' : 'KEPT, wave-A5 bytes'}, sha`
        + ` \`${c.sha256}\`${c.reason ? `. Not re-cut: ${c.reason}.` : ''}`);
    }
  }
  p();
  p('### Title-plate disclosure lines, transcribed verbatim');
  p();
  for (const v of videos) {
    p(`**${v.clip}**`);
    p();
    p('> ' + v.card_disclosure_line);
    p();
  }
  p('## Gates');
  p();
  p(`Every gate below was run on the DELIVERED bytes in this pack, not on the`);
  p('wave-A5 bytes they supersede.');
  p();
  p(`- **${pj.gates.bars_total} bars GREEN** — ${pj.gates.judge_bars} judge`
    + ` bars + ${pj.gates.restatement_bars} restatement bars, 0 live red.`);
  p(`- **${pj.gates.red_arm_cases} red-arm cases, ${pj.gates.red_arm_broken}`
    + ' broken** — each deliberately corrupts the delivery and requires the'
    + ' named bar to fire. A gate that cannot be made to fail is not a gate.');
  if (pj.gates.inapplicable?.bars?.length) {
    p(`- **INAPPLICABLE:** \`${pj.gates.inapplicable.bars.join('`, `')}\` —`
      + ' kept red in the artifact and dropped from the verdict, with the'
      + ' declaration re-measured on these bytes at every run (it refuses if'
      + ' the bar starts passing, because a declaration for a bar that passes'
      + ' is a lie of omission).');
  }
  if (pj.gates.disarmed?.recurrence?.bars?.length) {
    p(`- **DISARMED:** \`${pj.gates.disarmed.recurrence.bars.join('`, `')}\``
      + ' — saturated by the table\'s own two-fold symmetry, restated by a'
      + ' band-excluded row that carries the claim instead.');
  }
  p();
  p('### The card fixture was re-pinned, deliberately');
  p();
  p(pj.gates.card_fixture_repin_reason.replace(/\s+/g, ' '));
  p();
  p(`Fixture now \`${prov.card_fixture_sha256}\`.`);
  p();
  if (rep.provenance.card_fixture_sha256 !== prov.card_fixture_sha256) {
    p('The cut-time provenance block records a DIFFERENT fixture sha');
    p(`(\`${rep.provenance.card_fixture_sha256}\`), and the difference is`);
    p('ordering, not disagreement: a fixture is generated FROM plates, so at');
    p('the moment the plates were cut the tracked fixture still described the');
    p('plates that existed before them. `--sig` re-pinned it against these');
    p('plates immediately afterwards, and the bar `d_card_signature_stable`');
    p('re-measures that agreement on the delivered bytes at every `--encoded`');
    p('run. Both shas are kept rather than the later one overwriting the');
    p('earlier: the cut block states what was true when the plates were made.');
    p();
  }
  p('## §ledger — THE ONE RESIDUAL LEDGER');
  p();
  p(`${LEDGER.length} rows. A row appears on a title plate when it is visible`);
  p('in that clip; rows with no `card` are ledgered but never printed, because');
  p('a statement about what may be CLAIMED is not a statement about anything in');
  p('frame and printing it on a plate would dress a claim limit up as a');
  p('picture. That rule is the Predator lane\'s (488p `NEW-A4a`), adopted here');
  p('rather than re-invented, so the two packs read the same way.');
  p();
  for (const r of LEDGER) {
    p(`### ${r.id} — ${r.item}`);
    p();
    p(`*${r.cls}*`);
    p();
    p(r.disclosure);
    p();
    p(r.clips.length
      ? `Visible in: ${r.clips.join(', ')}.`
        + (r.card ? ' Printed on that clip\'s title plate.'
          : ' NOT printed on a plate — see the row text for why.')
      : 'Bears on no particular clip; disclosure-only.');
    p();
  }
  p('## Appendix — the carried-open register');
  p();
  p(`${CARRIED_OPEN.length} owner items remain OPEN but bear on no frame of any`);
  p('clip. They are deliberately NOT in the ledger above: every plate prints');
  p('"n of N ledger rows are visible in this clip", so padding N with rows that');
  p('could never be visible would make every plate understate the visible');
  p('fraction — the ledger would be dishonest in the direction of flattering');
  p('the pack.');
  p();
  for (const r of CARRIED_OPEN) {
    p(`- **${r.id}** *(${r.cls})* — ${r.text}`);
  }
  p();
  p('## Re-running these claims yourself');
  p();
  p('```');
  p(`node tools/render/orbitsweep-488d.mjs --verify --pack <this directory>`);
  p('```');
  p();
  p('re-measures every sha, frame count and body-frame signature above against');
  p('the files actually present, and re-derives each plate\'s disclosure line');
  p('from the ledger in the tool to confirm the transcription. It also re-binds');
  p('the two gate reports THIS pack ships to the videos THIS pack ships, so a');
  p('report that travelled without its videos — or videos that travelled');
  p('without their report — fail in your hands rather than only in mine. It');
  p('writes `verify-488d.json` and exits non-zero on any mismatch.');
  p();
  p('`--verify` deliberately re-derives the disclosure lines from the ledger in');
  p('the tool at the version YOU run, not from a copy stored in the pack. That');
  p('is what makes the three heads above safe to disclose rather than hide: if');
  p('a later ledger edit changed any line a plate prints, this check would');
  p('fail.');
  p();
  const index = `${L.join('\n')}\n`;
  fs.writeFileSync(path.join(PACK, 'INDEX.md'), index);
  console.log(`[publish] INDEX.md ${index.length} B, provenance.json`
    + ` ${fs.statSync(path.join(PACK, 'provenance.json')).size} B`);

  if (!dest) {
    console.log('[publish] no --dest given; honest surface written in place');
    return;
  }
  // ---- the copy out of /tmp, sha-verified on the far side ----------------
  const D = path.resolve(dest.replace(/^~(?=$|\/)/, process.env.HOME));
  fs.mkdirSync(D, { recursive: true });
  const files = [...order.map((c) => path.basename(man.clips[c].mp4)),
    'INDEX.md', 'provenance.json', 'manifest-488d.json',
    'cards-only-488d.json', 'encoded-bars-488d.json', 'red-arm-488d.json',
    'census-488d.json', 'windows-488d.json', 'judge-488d.json',
    'measure-488d.json'];
  const copied = [];
  for (const f of files) {
    const s = path.join(PACK, f);
    if (!fs.existsSync(s)) { console.log(`[publish] skip (absent) ${f}`); continue; }
    const d = path.join(D, f);
    fs.copyFileSync(s, d);
    const a = sha256File(s); const b = sha256File(d);
    if (a !== b) {
      console.error(`[publish] REFUSAL: ${f} copied wrong (${a} -> ${b})`);
      process.exit(3);
    }
    copied.push({ file: f, sha256: a, bytes: fs.statSync(d).size });
  }
  // the plates travel too: they are what the disclosure claim is ABOUT
  fs.mkdirSync(path.join(D, 'cards'), { recursive: true });
  for (const f of fs.readdirSync(path.join(PACK, 'cards'))) {
    const s = path.join(PACK, 'cards', f); const d = path.join(D, 'cards', f);
    fs.copyFileSync(s, d);
    if (sha256File(s) !== sha256File(d)) {
      console.error(`[publish] REFUSAL: cards/${f} copied wrong`);
      process.exit(3);
    }
    copied.push({ file: `cards/${f}`, sha256: sha256File(d),
      bytes: fs.statSync(d).size });
  }
  writeJson(path.join(D, 'published-488d.json'),
    { from: PACK, to: D, when: new Date().toISOString(), files: copied });
  console.log(`[publish] ${copied.length} files sha-verified -> ${D}`);
  console.log('PUBLISH DONE');
};

// ===========================================================================
// --verify : re-prove a PUBLISHED pack from its own provenance.json
// ===========================================================================
// The 488p parity item. A published pack claims a set of shas, frame counts
// and body-frame signatures; this re-measures every one of them against the
// files actually on disk, so the claims are re-runnable by whoever receives
// the pack rather than only by whoever made it.
MODE_FN.verify = async () => {
  const dir = path.resolve(__pathOpt('--out', { default: PACK, tag: 'orbitsweep-488d' }));
  const pj = path.join(dir, 'provenance.json');
  if (!fs.existsSync(pj)) {
    console.error(`[verify] no provenance.json in ${dir}`);
    process.exit(2);
  }
  const p = readJson(pj);
  const checks = [];
  const chk = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    console.log(`[verify] ${ok ? 'OK  ' : 'FAIL'} ${name}  ${detail}`);
  };
  for (const v of p.videos) {
    const f = path.join(dir, v.file);
    if (!fs.existsSync(f)) { chk(`${v.clip}:present`, false, v.file); continue; }
    chk(`${v.clip}:sha256`, sha256File(f) === v.sha256, v.sha256);
    chk(`${v.clip}:bytes`, fs.statSync(f).size === v.bytes, String(v.bytes));
    const sig = bodyFrameSig(f, v.card_segs);
    chk(`${v.clip}:frames`, sig.frames === v.frames, `${sig.frames}`);
    chk(`${v.clip}:body_framemd5`, sig.sha256 === v.body_framemd5_sha256,
      sig.sha256);
    // the claim the whole re-cut rests on, re-measured by the receiver
    chk(`${v.clip}:body_unchanged_vs_wave_a5`,
      sig.sha256 === v.sealed_body_framemd5_sha256,
      v.sealed_body_framemd5_sha256);
    for (const c of v.cards) {
      const cp = path.join(dir, 'cards', `${v.clip}-${c.index}.png`);
      chk(`${v.clip}:card${c.index}`,
        fs.existsSync(cp) && sha256File(cp) === c.sha256, c.sha256);
    }
    chk(`${v.clip}:decode_clean`, decodeCheck(f).decode_errors === 0,
      'ffmpeg full decode, 0 errors');
  }
  chk('ledger:rows', p.ledger.length === LEDGER.length,
    `${p.ledger.length} vs ${LEDGER.length} in the tool`);
  chk('carried_open:rows',
    (p.carried_open || []).length === CARRIED_OPEN.length,
    `${(p.carried_open || []).length} vs ${CARRIED_OPEN.length} in the tool`);
  for (const v of p.videos) {
    chk(`${v.clip}:card_line`, v.card_disclosure_line === cardLineFor(v.clip),
      'transcription matches the tool\'s ledger');
  }
  // The pack headlines a gate verdict. Re-bind the reports it SHIPS to the
  // files it ships, receiver-side: --publish checked this against the pack it
  // was publishing FROM, which is not the same statement as "the copy in your
  // hands is internally consistent". A report that travelled without its
  // videos, or videos that travelled without their report, fail here.
  const shipped = Object.fromEntries(p.videos.map((v) => [v.clip, v.sha256]));
  for (const [what, file] of [['encoded-bars', 'encoded-bars-488d.json'],
    ['red-arm', 'red-arm-488d.json']]) {
    const rp = path.join(dir, file);
    if (!fs.existsSync(rp)) { chk(`${what}:present`, false, file); continue; }
    const r = readJson(rp);
    const got = r.files_sha256;
    const bound = got && Object.keys(got).length === 3
      && Object.entries(got).every(([c, s]) => shipped[c] === s);
    chk(`${what}:describes_these_files`, !!bound,
      bound ? 'all 3 mp4 sha256 match the shipped videos'
        : `binding absent or mismatched: ${JSON.stringify(got)}`);
  }
  const barsFile = path.join(dir, 'encoded-bars-488d.json');
  if (fs.existsSync(barsFile)) {
    const b = readJson(barsFile);
    const live = (b.red || []).filter(
      (x) => !(b.inapplicable?.bars || []).includes(x));
    chk('encoded-bars:no_live_red', live.length === 0,
      live.length ? live.join(' ') : '0 live red bars');
    chk('encoded-bars:count_matches_index',
      !!b.bar_counts && b.bar_counts.total === p.gates.bars_total,
      `${b.bar_counts ? b.bar_counts.total : 'absent'} vs index`
      + ` ${p.gates.bars_total}`);
  }
  const raFile = path.join(dir, 'red-arm-488d.json');
  if (fs.existsSync(raFile)) {
    const r = readJson(raFile);
    chk('red-arm:none_broken', r.broken === 0, `${r.broken} broken`);
    chk('red-arm:count_matches_index',
      (r.cases || []).length === p.gates.red_arm_cases,
      `${(r.cases || []).length} vs index ${p.gates.red_arm_cases}`);
  }
  const bad = checks.filter((c) => !c.ok);
  writeJson(path.join(dir, 'verify-488d.json'),
    { dir, when: new Date().toISOString(), checks, failed: bad.length });
  console.log(`[verify] ${checks.length - bad.length}/${checks.length} checks passed`);
  if (bad.length) process.exit(3);
};

if (!MODE_FN[MODE]) {
  console.error(`[488d] mode ${MODE} not implemented`);
  process.exit(2);
}
await MODE_FN[MODE]();
