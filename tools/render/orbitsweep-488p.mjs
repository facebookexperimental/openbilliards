#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

/* GH-488P wave A5-R5 — the final orbit videos for the Predator Apex 9 ft
 * rebuild (A5 cut them; A5-R2 re-cut them with the LED fixture; A5-R3 re-cut
 * them under the venue ambient; A5-R4 re-cut the CARDS ONLY, to supersede four
 * delivery-level ledger rows whose figures the A5-R3 ambient had made stale;
 * A5-R5 re-cut the cards again to correct one transcribed count -- the
 * zero-census figure, which A5-R4 wrote as 1197/three against its own
 * measurement of 1183/seventeen, in the direction that flattered the pack).
 *
 * This is the DELIVERABLE renderer, not a gate.  The 489/490 orbitsweep tools
 * are capture+judge instruments whose encoding lives outside the repo ("encode.sh
 * law" in the frozen finale worktrees); this lane has no such worktree, so the
 * encode plane is authored here and its bytes are proven here.
 *
 * SKILL Stage 9 contract, verbatim:
 *   "title cards with tree sha/date/settings + one honest in-frame residual
 *    line; ONE residual ledger all surfaces must agree with; an honest-statement
 *    section (what parity is claimed, what is principled ceiling, what is
 *    intentional delta); byte-bound provenance — sha256-bound gate verdicts on
 *    delivered bytes, framemd5 body-frame identity across card re-cuts,
 *    append-only supersession, full-decode playback proofs, invariant
 *    behavioral checksums proving the core untouched."
 *   "EXIT: every claim re-runnable against the pack's own bytes."
 *
 * The last sentence is why `--verify <pack>` exists and why every number the
 * cards and INDEX.md carry is regenerated from ONE in-file source (LEDGER,
 * ORBITS, provenance()) rather than retyped per surface.  A disclosure that is
 * typed twice is a disclosure that will disagree with itself (Iron Law 11).
 *
 * MODES
 *   --sweep            capture runs, render cards, encode, prove, write the pack
 *   --cards-only       re-render cards + re-encode from an existing pack's runs
 *                      (the card re-cut path; framemd5 proves the body identical)
 *   --verify           re-check every recorded claim against the pack's bytes
 *   --red-arm          fire every proof this tool claims to make, on defective
 *                      bytes, in a scratch dir (Iron Law 6)
 *
 * FENCES.  Read-only against web/; writes only under --out.  No Drive, no
 * network, no owner contact.  Chrome is the pinned chrome-headless-shell and is
 * torn down by tracked pid only — this Mac is the owner's browser host and the
 * self-hosted CI runner, so nothing here may pattern-kill chrome.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
  chromeShellPin,
} from '../../web/tools/cdp.mjs';
import { ANNEX_PURPOSE, ANNEX_PURPOSE_SOURCE } from './annex-purpose.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, '../..');
const webDir = path.join(repoDir, 'web');

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value


// EXACTLY one mode — the 489 pass-4 lesson: a priority chain silently selects
// the earlier flag, so `--red-arm --verify` could exit green having inspected
// nothing.
const MODES = ['--sweep', '--cards-only', '--verify', '--verify-framing', '--red-arm'];
const picked = MODES.filter((m) => args.includes(m));
if (picked.length !== 1) {
  console.error(`mode required, exactly one of: ${MODES.join(' | ')}`);
  process.exit(2);
}
const MODE = picked[0].slice(2);

const OUT = path.resolve(__pathOpt('--out', { default: path.join(os.homedir(), 'ob-render-packs', 'gh488p-a5'), tag: 'orbitsweep-488p' }));
// The pack root every writer/refuser below reads.  It is a variable for exactly
// one reason: --red-arm points the REAL refusal code at a scratch tree, so the
// cases exercise the shipped refusals rather than re-implementing (and
// therefore drifting from) them.
let PACK = OUT;
// One dump feeds BOTH the geometry digest and the framing check, so they can
// never describe different mesh states.
const DUMP = __pathOpt('--dump', { default: '/tmp/ob488p/fv-sealed.json', tag: 'orbitsweep-488p', mustExist: 'file' });
const ONLY = argOf('--orbits', null);
const KEEP_RUNS = args.includes('--keep-runs');
const NO_REPRO = args.includes('--no-repro');
// Left null by default so the annex builder's own Drive default governs: the
// reference photograph has ONE canonical location and duplicating the path
// here would make two files disagree about where the anchor lives.
const ANNEX_PHOTO = __pathOpt('--annex-photo', { default: null, tag: 'orbitsweep-488p', mustExist: 'file' });

// ---------------------------------------------------------------------------
// raster + encode law
// ---------------------------------------------------------------------------
// The wave stamp, stored ONCE.  It appears on the pack manifest, the INDEX
// title and the in-frame card eyebrow, and the report sections the card
// footer points at are this list's history.  Wave A5-R4 found the manifest
// still stamped A5-R3 while the other three surfaces had been updated by
// hand -- four copies of one fact, and the disagreement was caught only by
// diffing provenance.json against the previous cut.  Deriving them all from
// one array makes the agreement structural instead of remembered.
const WAVE_HISTORY = ['A5', 'A5-R2', 'A5-R3', 'A5-R4', 'A5-R5'];
const WAVE = WAVE_HISTORY[WAVE_HISTORY.length - 1];
const WAVE_SECTIONS = WAVE_HISTORY.map((w) => `&sect;${w}`)
  .reduce((a, w, i, xs) => (i === 0 ? w
    : `${a}${i === xs.length - 1 ? ' and ' : ', '}${w}`), '');

const W = 1600;
const H = 1000;
const FPS = 30;
// The shipped cards in the sealed finale pack ran 2 s / 60 frames.  These carry
// five provenance rows plus a wrapped disclosure line, so they run 3 s — a card
// nobody can finish reading is not a disclosure.  Recorded, not silently changed.
const CARD_FRAMES = 90;

// encode.sh law, verbatim (489: "exact shipped encoder settings"):
//   -c:v libx264 -preset medium -crf 14, yuv420p, +faststart
// plus a DELIBERATE addition for byte-bound provenance: -map_metadata -1 and
// bitexact flags strip the ffmpeg/x264 version strings and the container
// creation time, so the same tree + same tool encodes to the same sha256.  That
// reproducibility is itself proven below (PROOF 4), and it is the reason a
// sha256 in this pack means something stronger than "these bytes existed once".
const X264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '14'];
const REPRO = ['-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact'];
const VF = 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p';

// ---------------------------------------------------------------------------
// the orbits
//
// Corner and side are SUPERSETS of the committed 24-bearing measurement
// registers: same centre, radius, height, fov and phase, with run/24 = 15 video
// frames per measured bearing.  verifyRegisterAlignment() proves it against the
// register files rather than asserting it in a comment — the whole point of the
// choice is that "every bearing I measured is a frame the owner actually sees".
// ---------------------------------------------------------------------------
const ORBITS = {
  // fulltable carries no measured bearings, so its station is a FRAMING choice —
  // but the choice is derived, not tasted.  The first draft (r 2.90, look_z -0.10)
  // survived a 4-pose cardinal smoke set and then ran the near apron off the
  // bottom edge at the diagonal azimuths, which the cardinals cannot see.  The
  // station below is the one that clears the model's own convex hull at EVERY
  // azimuth: hull of the 156336 dumped mesh vertices (336 hull points), projected
  // through this exact camera at 0.25 deg over the full revolution.  Worst-case
  // margin +0.0746 of the half-frame (>=37 px vertical, >=60 px horizontal) at
  // az 70.75 deg.  The rejected candidates and their measured clips are in
  // SPIKE-REPORT.md §A5.1; --verify-framing re-runs the scan on demand.
  //
  // look_z is -0.33, not the bed plane: the table's visible mass runs from the
  // rail top (y +0.048) to the leg feet (y -0.753), so aiming at the bed hangs
  // the cabinet below frame centre.  -0.33 is that span's midpoint.
  fulltable: {
    label: 'FULL TABLE',
    center: [0.0, 0.0, -0.33], r: 3.20, h: 1.49, fov: 42,
    run: 480, az0: -Math.PI / 2, registers: null,
    hullMargin: 0.0746, // proven by verifyFraming(); a regression here is a clip
    what: 'the whole table, one revolution — rails, aprons, legs, cloth, sights',
  },
  corner: {
    label: 'CORNER POCKET  (+width / +length)',
    center: [0.635, 1.270, 0.0], r: 0.46, h: 0.40, fov: 36,
    run: 360, az0: 0, registers: 'registers-488p-orbit-corner.json',
    what: 'corner pocket at 41 deg elevation — casting, rim band, plug, vent, bore',
  },
  side: {
    label: 'SIDE POCKET  (+width, mid-length)',
    center: [0.635, 0.000, 0.0], r: 0.40, h: 0.34, fov: 36,
    run: 360, az0: 0, registers: 'registers-488p-orbit-side.json',
    what: 'side pocket at 40 deg elevation — mouth, facings, rim band, well',
  },
};
const ORBIT_NAMES = ONLY ? ONLY.split(',') : Object.keys(ORBITS);
for (const n of ORBIT_NAMES) if (!ORBITS[n]) throw new Error(`unknown orbit ${n}`);

const poseAt = (spec, i) => {
  const az = spec.az0 + (2 * Math.PI * i) / spec.run;
  return {
    cam: [spec.center[0] + spec.r * Math.cos(az),
      spec.center[1] + spec.r * Math.sin(az), spec.h],
    look: spec.center,
    fov: spec.fov,
  };
};

// ---------------------------------------------------------------------------
// THE ONE RESIDUAL LEDGER  (Iron Law 11)
//
// Single source for: the in-frame card line, the pack INDEX, and SPIKE-REPORT
// section A5.  Class is one of CLAIMED PARITY / PRINCIPLED CEILING /
// INTENTIONAL DELTA / OWNER RULING, the taxonomy fixed in section L, plus
// CLOSED, added in wave A5-R4 and disclosed there rather than slipped in:
// append-only supersession needs a way to say "this row's claim is dead"
// without deleting the row, and leaving a refuted claim labelled as a
// ceiling would be the falsified disclosure Iron Law 11 forbids.
// A CLOSED row keeps its ledger entry and its history and carries no card
// line: a card must not spend the viewer's attention on a residual that
// does not exist.
//
// `orbits` names the videos in which the row is VISIBLE — a card must disclose
// what is in ITS frames and must not pad itself with residuals the viewer
// cannot see (that would be an adjective wearing a measurement's clothes).
// `card` is the compressed in-frame wording; it is a transcription of
// `disclosure`, never a softening of it.
// ---------------------------------------------------------------------------
const LEDGER = [
  { id: 'NEW-A4c', cls: 'PRINCIPLED CEILING (rig transport)',
    item: 'Chrome rim collar too bright and too evenly lit',
    orbits: ['corner', 'side'],
    card: 'chrome rim collar 2.99x too bright, azimuthal modulation 1.27-1.48x vs 2.2x measured (room-centre cubemap, NEW-A4c)',
    disclosure: 'Pose-matched against the solved camera: rim 2.99x the reference absolute, 2.43x relative to its own cloth; azimuthal modulation 1.27-1.48x (ours) against 2.2x (reference); across-width 1.22x against 2.9x. Attributed in A4.5 to the single room-centre cube camera at web/app/main.js:427-433 — four corner rims at four different table positions agree to 0.6%, i.e. the environment is position-independent where the room is not. Supersedes the plan-view 1.5-1.6x note at table.js:9660-9677. Not closable by an albedo: dialling the rim down would cancel a transport error with a material error.' },

  { id: 'NEW-A4d', cls: 'OWNER RULING (form, re-derivation)',
    item: 'Pocket plug puck modelled smaller than measured',
    orbits: ['corner', 'side'],
    card: 'plug puck modelled at 0.758 of bore vs 0.88-0.99 measured — a 35% or larger area shortfall (NEW-A4d)',
    disclosure: 'Puck/bore fraction read from the radial profiles of the sole photometric anchor: 0.880 near-limb (475/540 px), upper bound 0.99 by texture blob, against the model PDT_PLUG_FRAC = 0.758 (render 88/120 px). A >=35% area shortfall. Not corrected in A4/A5: the fraction is a canonical-JSON row and re-deriving it is a contract-chain round, which is a wave, not a knob.' },

  { id: 'M-W3', cls: 'PRINCIPLED CEILING (measurement-limited)',
    item: 'Pocket-interior wall reads too dark',
    orbits: ['corner', 'side'],
    card: 'pocket-interior wall darker than reference, bounded away from every occlusion model (measurement-limited, M-W3)',
    disclosure: 'Wall/rail-top 0.3546 shipped, 0.4473 with transport forced fully open, against a reference 1.37 — a 3.06x residual bounded away from every occlusion model, so it is a rig-delivery difference (venue rig vs product-shot light tent), not a missing occlusion term. Closing it needs a rectified or top-down pocket photograph that does not exist in the dossier plus a transfer function the JPEG does not carry. Its SIZE is additionally in question until NEW-A4d is re-derived. A5-R3 ADDENDUM, measured on the DELIVERED bytes of two packs: at corner bearing 0, same boxes and same estimator, well-interior/rail-top linear Y went 0.6645 (A5-R2, apron-dark venue) to 1.1137 (A5-R3, venue ambient). The venue ambient moved this residual 1.68x TOWARD the reference and it is the largest single improvement in this wave. The 1.37 above is NOT a like-for-like target for those two numbers - it was measured in the A4 solved register with a different instrument, and a delivered-orbit ROI at a different camera is a different question. What is like-for-like is the before/after, because it is one instrument run twice. The row stays open and stays measurement-limited.' },

  { id: 'NEW-A5R3d', cls: 'INTENTIONAL DELTA (deferred, Predator-scoped)',
    item: 'Pocket well renders with zero red, a different hue from the bed cloth it clones',
    orbits: ['corner', 'side'],
    card: 'pocket well renders at linear R/G 0.0000 - red floored to sRGB code 0 - against the bed cloth it is a clone of at 0.647; the two surfaces read as different materials (NEW-A5R3d)',
    disclosure: 'MEASURED on the delivered bytes of two packs, corner bearing 0, same boxes both times. Well interior: A5-R2 sRGB [0, 7, 34], A5-R3 sRGB [0, 84, 174]. Bed cloth: A5-R2 [76, 144, 210], A5-R3 [187, 227, 249]. Linear R/G - well 0.0000 in BOTH packs, bed 0.259 then 0.647. Linear G/B - well 0.133 then 0.210, bed 0.433 then 0.811. The well\'s red is floored to code 0 and the venue ambient did not move it at all, which is the signature of a term that multiplies rather than adds: this is PRE-EXISTING and was hidden, not caused, by the dark venue. It is disclosed here because it is now at-a-glance visible - at 2x the corner orbit shows a saturated mid-blue bowl beside a pale bed, and Iron Law 7 forbids letting a visible error sit in a deferred bucket unnamed. WHAT IS NOT CLAIMED: a root cause. table.js builds the well from clothMat.clone() and then re-injects the analytic transport on it (the pdtWellClothMat block), and the bed and the well therefore run the same albedo through two different transports - that is where a root-cause would START, and this row does not assert that it is the answer. Distinct from NEW-A4f, which is about an annulus at exactly Y = 0.000 rather than about hue, and from NEW-A5R3b, which is the BED cloth\'s albedo. Fixing it is a material/transport change and this wave is fenced to light.' },

  { id: 'NEW-A4f', cls: 'CLOSED (claim refuted on the delivered bytes, wave A5-R4)',
    item: 'A band of the well reaches exactly zero — REFUTED',
    orbits: ['corner', 'side'],
    card: null,
    disclosure: 'The render has an annulus at r 91-105 px (near limb, solved pose) at exactly linear Y = 0.000 — no light of any kind reaches it. The reference well is never zero at any radius. Same mechanism family as M-W3 / NEW-A4c: what the rig delivers into the bore. A5-R4 ADDENDUM — THIS ROW IS SUPERSEDED AND ITS CLAIM IS REFUTED, recorded append-only rather than deleted. BOTH halves were false, and the second was false before the venue ambient existed. (a) THE ANNULUS IS GONE. Measured on this pack\'s own annex/a4-wide.png (1215x972; vent centre derived at (607.0, 555.8) and bore radius 17.4 px by the same absolute blob rule a4annex-rings.py uses): the band at r 91-105 px reads median-of-medians linear Y 0.066303, darkest single pixel 0.001540, exact-zero fraction 0.000%; the band r 80-120 contains no zero pixel at any radius; there is no exact zero anywhere from r 18 to r 200. Every remaining zero in that frame - 782 px, 0.0662% of it - is ONE connected component at rows 543-572, cols 590-625, equivalent radius 15.8 px against the detected bore radius 17.4 px. It is the vent THROUGH-HOLE (81.296% of the 0-1 bore band is exact zero). A hole is not an illumination residual. (b) "THE REFERENCE WELL IS NEVER ZERO AT ANY RADIUS" WAS NEVER TRUE. Measured on the pinned photograph itself (sha256 633d8957..., 4865x3893): 100011 exact-zero px whole-frame, 0.5281%, with the 0-1 bore band 1.794% exact zero, the 1-2 band 0.210% and the 5-6 band 0.954%. The photograph\'s 0-1 band MEDIAN is 0.000607, so the original figure was a median profile read as if it were a per-pixel minimum - a profile printed to 3 dp cannot distinguish a genuine 0.0004 from 0. Those zeros are black crush, which NEW-A4a already ledgers (cloth R 37.95% at code 0), so this anchor cannot answer "does light reach here" at all. WHY EXACT ZERO IS THE RIGHT TEST AND NOT A THRESHOLD IN DISGUISE: in an 8-bit sRGB raster linear Y = 0 iff all three channels are code 0, so the statement carries no level and cannot be tuned. Censused that way, box-free, over EVERY delivered body frame of both packs - fulltable median 104327 exact-zero px per frame (6.5% of 1.6 Mpx) on 480/480 frames at the A5-R2 head against 0 on 0/480 at A5-R3; corner median 39568, max 268327 (16.8%), 360/360 against 0 on 0/360; side median 24802 against median 0, max 1 px, on 17/360 - 1183 of 1200 delivered body frames contain no exact-zero pixel at all, and the seventeen that do carry exactly one pixel each, in a single component inside the side pocket throat; all seventeen are side-orbit frames, the fulltable and corner orbits carrying none at all (0/480 and 0/360). MECHANISM, single-variable at one tree: the whole-frame exact-zero count at four ambient-sweep bearings went 37404 / 26004 / 86279 / 47666 at L = 0 to exactly 0 at L = 9.91. An unoccluded LightProbe adds to every shaded fragment, so a region surviving at zero under it is not a shaded surface. A HUNCH OF MINE THAT THIS KILLED, kept because it is why the census was run box-free over both close-up orbits instead of on the annex crop alone: the delivered side pocket reads as a flat black hole at 1x, so I proposed the row might survive on the side orbit even though the annex register had lost it. It does not. WHAT IS TRUE INSTEAD, AND WHERE IT NOW LIVES: the well bottoms out at linear Y 0.000651 (side), 0.002559 (corner) and 0.000798 (fulltable) against a bed cloth at 0.65975, i.e. 258x to 1013x below the bed, and it still READS black at 1x. That is M-W3, pocket interior too dark, an already-open measurement-limited row - not a zero-annulus claim.' },

  { id: 'NEW-N4b', cls: 'PRINCIPLED CEILING (measurement-limited)',
    item: 'Well-wall flare / gloss not modelled',
    orbits: ['corner', 'side'],
    card: 'well-wall flare/gloss not modelled as a feature',
    disclosure: 'The reference well wall carries a flare/gloss lobe that is not modelled at all. Gated behind the same missing photograph as M-W3.' },

  { id: 'M-W19', cls: 'OWNER RULING (tone lever)',
    item: 'Plug/wall ratio below the derived band',
    orbits: ['corner', 'side'],
    card: 'plug/wall 0.5665 vs the derived 0.62-0.66',
    disclosure: 'The felt modulation mean is 0.3635 and plug/wall measures 0.5665 against M-W7 derived 0.62-0.66. Open question whether the modulation mean is acting as a hidden tone lever; not resolved, not dialled.' },

  { id: 'M-W14', cls: 'PRINCIPLED CEILING (real-time BRDF)',
    item: 'Cloth BRDF too directional',
    orbits: ['fulltable', 'corner', 'side'],
    card: 'cloth BRDF too directional: +64% at the rail crest, -83% at the cushion nose, 4.8x r/b swing (M-W14)',
    disclosure: 'Against the reference the modelled cloth is +64% at the rail crest and -83% at the cushion nose, a 4.8x red/blue swing across the same cloth. Plus the vent nap, the 0.5x lit-lip residual, a clipped specular tail and an absent directional lay in the felt map. A real-time GGX+sheen lobe against a photographed woven nap is a principled ceiling, not a defect to dial out.' },

  { id: 'M-W15', cls: 'OWNER RULING (form)',
    item: 'Cloth cantilever and rim-band groove',
    orbits: ['corner', 'side'],
    card: 'cloth cantilevers over the rim band; a thin dark groove sits between band and cloth',
    disclosure: 'The cloth overhangs the rim band instead of tucking, and a thin dark groove is visible between rim band and cloth at close bearings. Both are form rows, not shading rows.' },

  { id: 'M-W13', cls: 'OWNER RULING (form)',
    item: 'Rail chamfer strip missing',
    orbits: ['fulltable', 'corner', 'side'],
    card: 'rail chamfer strip not modelled',
    disclosure: 'The reference rail carries a chamfer strip along the top inner edge that the model does not have.' },

  { id: 'M-W17', cls: 'CLAIMED PARITY (fixture, ratio-solved)',
    item: 'LED leg underglow modelled and solved',
    orbits: ['fulltable'],
    card: 'LED leg underglow modelled and solved, 77.74% hidden behind the apron here; under the venue ambient it no longer reads as a glow — 877 px of panel interior on all 480 bearings at 0.35x its local surround, 0 of 480 brighter, against 11.36x at the dark head (M-W17)',
    disclosure: 'SUPERSEDES the wave-M wording of this row, which was wrong twice over and is corrected here rather than quietly dropped. It read "no LED cabinet underglow ... entirely absent from the model" and was classified OWNER RULING (fixture). Both halves were false: the r1 model DID carry a diffuser channel round the apron underside (obPdtLedCover), it simply had no emission; and the real fixture is not a cabinet underglow at all. Four dossier frames put the lit surfaces on the two faces of each LEG that point at the table centre, fed from the top edge, with a floor pool at each leg base and NOTHING on the apron. The old form could not have been right at any intensity: the apron perimeter is at |z| = 0.786 m and a leg inboard face at |z| = 0.2725 m, so a perimeter source strikes that face edge-on. AS BUILT: two MeshBasicMaterial panels per leg on the inboard faces, inset LEG_R from the arrises, vertex-lit with an exponential top-fed profile exp(-lambda*u), plus one companion SpotLight PER PANEL (two per leg), each sitting at its own panel\'s emissive centroid — 1/lambda - 1/(e^lambda - 1), computed in-line so it cannot go stale — aimed along that panel\'s own outward normal, with intensity DERIVED not typed: I(0) = L * A * mean(exp(-lambda*u)) for a Lambertian emitter. LAMP-FORM POST-MORTEM, recorded because the first A5-R2 cut shipped this wrong and the correction is superseded in the open rather than folded in quietly. That cut used ONE isotropic PointLight per leg carrying the summed area of both panels, and it was wrong twice. (a) FLUX: an isotropic point of peak I radiates 4*pi*I where a flat Lambertian panel radiates pi*I, so the fixture emitted four times its own output, half of it backwards into the solid leg it is mounted on. (b) LEAK: these lamps carry no shadow map, so that surplus reached surfaces the slate should hide — measured on the two packs\' own delivered bytes at the corner close-up, the cushion inboard face lifted +4.18% in linear Y and the pocket interior +1.13%, with up to 20984 px of a corner frame moving by more than 2 codes and a peak delta of 5 codes. THE FIX IS DERIVED, NOT TUNED: at angle pi/2 and penumbra 1 three.js\'s spot profile is smoothstep(0,1,cos t) = c*c*(3-2c), and int_0^1 c*c*(3-2c) dc = 1/2 = int_0^1 c dc, i.e. it carries EXACTLY Lambert\'s flux for the same peak; its angular error against cos t is bounded at +/-0.0962 of peak (extrema at c = 0.2113 and 0.7887) and changes sign at 60 deg, which is precisely why the integral closes; and penumbra 1 is the widest ramp the family admits, hence its closest member rather than a preference. AFTER, same instrument: peak delta 1 code at every corner and side bearing tested, ZERO pixels above 2 codes anywhere, cushion face +0.73%, pocket interior +0.00% — the residual leak is at the quantisation floor. That this is a LIGHT-ONLY change is proved and not asserted: the mesh geometry digest is byte-identical across it (2a1b66cf..., 99 meshes) and both solved rows re-measure to the bit (R1 15.7556, R2 5.7461), because the panel is MeshBasicMaterial and therefore unshaded. SpotLight and not RectAreaLight because shading.js indexes rectAreaLights[0]/[le] and the emitter count is a customProgramCacheKey compile-time axis; the spot form additionally keeps the fixture clear of the rig-walking modules that key on isPointLight — look.js\'s stale-room fallback traverse would have regraded these lamps to the room fill colour, and cinelight.js takes the first PointLight in traverse order as its fill, inert today only because main.js adds room.group before table.group. TWO FREE SCALARS, BOTH SOLVED AGAINST REFERENCE RANGES, NEVER DIALLED TO A POINT: LED_LAMBDA = 1.7007 lands the measured top-third/bottom-third gradient at 5.746 against a three-rig range of 3.036-10.909; LED_L = 0.3130 lands the measured lit/unlit leg face at 15.756 against 2.730-87.844. Both targets are the geometric centre of the range, which with two real rigs disagreeing is the one point equidistant from both in the ratio\'s own log metric. Both solves run THROUGH the renderer, because the reference ratios are themselves post-transfer numbers off photographs, and against a 16-band transfer table MEASURED on this panel (g 0.068-0.293, both solve points strictly inside it, so nothing is extrapolated) rather than against a closed-form curve: the transfer is strongly contrast-expanding down here and is NOT a pure power law, a quadratic in log-log halving the residual to 0.018, partly because the panel red channel quantises to code 0 below g ~ 0.28; the two chains are different and unpublished, so a ratio far from 1 carries a transfer-chain uncertainty the ranges do not express. Hue is taken whole from the manufacturer product plate and is NOT free: red, blue and yellow are all attested on this model, so colour is a product setting, and picking it to cancel a hue residual elsewhere would be the two-errors-cancelling trap. CONTAINMENT, measured LED-off vs LED-on at the same tree: 12 of 13 guard boxes bit-identical, the 13th (floor at the leg base) x1.0069; 3534 px of 1.6M move by more than 2 codes, i.e. 0.2209% of the frame. A 1000x lamp probe proves the path is live (floor [12,10,10] -> [114,172,225]) and independently confirms the form (the apron face moves only [1,5,16] -> [1,7,16] even at 1000x, i.e. it receives nothing for the correct geometric reason). TWO LIMITS, STATED NOT BURIED. (1) Effectively direct light only, and that is now measured rather than asserted: the venue GI lightMap is baked per (bakeClass, fixture) and a table-owned fixture does not rebake it, so the LED gets no bounce from it. The boot CubeCamera probe at the room centre DOES see the fixture, so ONE indirect path exists — but it measures under a code everywhere probed (bed cloth mean delta 0.00/0.00/0.01, back wall 0.01/0.01/0.06). Present, not material; the earlier flat claim that indirect is "absent" is superseded by these numbers. (2) The absolute level inherits the below-rail darkness error of NEW-A5R2a: a common-mode error in our black furniture cancels in the R1 ratio the level was solved against, but propagates straight into the level itself, which is why the floor pool is faint. Stated as an eye judgement too, because it is the one obvious difference when the frames are set side by side: in the reference the pool at each leg base is a bright cyan wash spreading across the carpet and visibly relighting the foot, and in ours it is a one-code lift you find by subtracting frames. INSTRUMENT POST-MORTEM, recorded because these figures would otherwise be unreconstructable: the first cut of the panel projector took the pool-class default bedAboveFloor 0.79 instead of this entry\'s roomFloor 0.753, so its mask ran 37 mm past the foot and too wide, and the first published R1/R2 (15.756 / 5.637) were measured through it. The standing fullview geometry gate caught it by printing the panel bounding boxes. After the fix the same bytes read 16.992 / 4.876 - still in range - and the two scalars were re-derived ONCE under a stopping rule fixed before the answer was known, giving the values quoted above. Raising LED_L to compensate would be dialling a solved scalar against a known error elsewhere; the correct fix is the rig row, not this one. AT THE DELIVERED BEARINGS, MEASURED ON ALL 1200 DELIVERED FRAMES RATHER THAN SAMPLED. This paragraph REPLACES an earlier wording of it that was UNDERSTATED, which Iron Law 11 treats exactly as it treats an overstatement, and the replacement is recorded here rather than folded in quietly. The old wording read "only 443 px of its dim tail survive; a 12-azimuth contact sheet shows no glow at any orbit bearing" and "the shadowless lamps still put up to 1 code into them". Every one of those three figures came from a sample: 443 px was the analytic projector\'s unoccluded-AREA estimate at one bearing, which is a different quantity from what reads; the contact sheet was 12 of 480 bearings looked at by eye at 1x with no difference test; and the 1 code was 8 of 720 close-up bearings. MEASURED INSTEAD, on the packs\' own run PNGs, with a detector whose false-positive rate is itself measured: a pixel counts as fixture iff it BOTH passes the panel\'s chromaticity signature (r <= 2, b >= 24, 0.30 <= g/b <= 0.48, which the MeshBasicMaterial hue [0.076, 0.324, 1.0] fixes) AND differs from the LED-absent pack at the same pose by more than 2 codes. The difference term is load-bearing rather than decorative: the BED CLOTH is also blue and also red-at-zero, so on chromaticity alone the LED-absent pack scores 2726 px per bearing of pure cloth. FULLTABLE: the fixture reads at ALL 480 bearings, not none - median 985 px, mean 950 px or 0.059% of a 1.6 Mpx frame, min 6 px at v0059, max 1773 px at v0215, spanning y 535-932, against a frame whose median pixel is code 6-7. Its form is one bright-topped tapering sliver per visible leg on the inboard arris: two symmetric slivers at the end-on and side bearings, one where the far leg is occluded, median sRGB [0, 26, 67] rising to [2, 41, 96]. So the fixture IS visible in the delivered wide orbit, and the honest limit is that it is small and dim, not that it is absent. CORNER AND SIDE: here the absence claim survives measurement - over all 720 close-up bearings the fixture never exceeds 2 px in a frame, so it is effectively never visible. Their frames are still not bit-identical to the pre-fixture pack, but the reason is NOT the lamps. Split by sign over every bearing - light can only add, so a pixel that got DARKER cannot be lamp spill - the entire >2-code population is 12 px of darkening in the corner orbit (peak 27 codes, 6 bearings) and 157 px in the side orbit (peak 93 codes, 8 bearings), and every one of the 38 brightened pixels lies INSIDE the same 4-5 px wide cluster as the darkened ones, i.e. antialiasing on a single moved edge rather than light arriving somewhere new. That edge is the obPdtLedCover ring being replaced by the leg panels, seen through the side-pocket throat at two bearing arcs (x 821-825 near v0125, x 774-778 near v0235) and at one lone pixel in the corner orbit. The lamps put NOTHING above 2 codes into either close-up. WHAT REMAINS TRUE: 77.74% of the panel is hidden behind the end apron at v0000, and a real Apex shot from r 3.20 m, h 1.49 m would also hide its own underglow behind its own apron, so the smallness is form the model got right and not brightness it got wrong. (That occlusion figure is the post-instrument-fix one; the pre-fix 76.24% stands in SPIKE-REPORT section A5-R2.4 and is superseded with both values side by side in section A5-R2.7.) The fixture is still best evaluated on the A5-R2 diagnostic-pose crops - but it is no longer true that these videos do not show it. A5-R4 ADDENDUM — RE-MEASURED ON THE A5-R3 BYTES, and the FULLTABLE figures in the paragraph above are hereby requalified with their measurement head (A5-R2) rather than left to read as current. THE PUBLISHED DETECTOR CANNOT SIMPLY BE RE-RUN: it needs an LED-ABSENT pack at the same pose, none exists at the A5-R3 head, and differencing against A5-R2 would fire on every shaded pixel in the frame. A FIRST REPLACEMENT I PROPOSED AND THE MEASUREMENT REFUTED, recorded rather than dropped: I argued the chromaticity gate alone would suffice at this head because the bed cloth is no longer red-at-zero. Measured, it scores a median 1122 px per bearing whose brightest member is sRGB (2, 97, 210), where the panel\'s own brightest pixel is (2, 81, 169) - something brighter than the panel is passing - and this ledger names the candidate one row away: NEW-A5R3d\'s well now reads (0, 84, 174), g/b 0.483, sitting on the gate\'s own 0.48 boundary, where at the R2 head it was (0, 7, 34), g/b 0.206, failing the 0.30 floor. THE TEST THAT DOES WORK AT THIS HEAD IS THE MIRROR OF THE DIFFERENCE TEST. Both packs carry the same mesh_geometry_sha256 and the same camera, and these panels are MeshBasicMaterial and therefore UNSHADED, so a probe cannot touch them: every shaded pixel moved, and an unshaded emitter is the one thing that must NOT have moved. So fixture = passes the chromaticity gate AND is BIT-IDENTICAL across the two packs. ITS ONE LIMIT, STATED NOT BURIED: an antialiased panel EDGE pixel blends emitter with a background that did move and so fails the identity term, which makes this a measurement of the panel INTERIOR and a LOWER bound - quantified rather than left as a caveat, by running the same identity term at the A5-R2 head where the answer is already known. RESULTS. The published difference detector re-run at the A5-R2 head reproduces the shipped figure EXACTLY (median 985 px, mean 950, min 6 at v0059, max 1773 at v0215, y 535-932), which is what licenses everything after it. The identity term at that same head gives median 877 px, i.e. an edge loss of 108 px or 11.0%. The identity term at the A5-R3 head gives median 877 px, on 480/480 bearings. Those last two are THE SAME SET BY CONSTRUCTION and not an independent confirmation - the identity term is symmetric, and where a == b the chromaticity gate returns the same answer either way - and that is itself the finding: the fixture\'s pixels did not change at all, which is exactly what an unshaded emitter must do. WHAT CHANGED IS EVERYTHING AROUND THEM, measured against a 6 px ring of the same frame just outside the mask, because the local surround is what the eye compares against and a whole-frame statistic would average in the ceiling: panel median linear Y 0.01065 = sRGB (0, 25, 64) at BOTH heads; local surround 0.00095 = (2, 3, 4) at A5-R2 against 0.02943 = (43, 48, 59) at A5-R3; panel/surround 11.36 (range 3.65-23.40) with 480 of 480 bearings brighter than their surround, against 0.35 (range 0.19-0.40) with 0 of 480; frame median linear Y 0.00187 against 0.06833. So the previous card wording - "reads small, one dim sliver per leg arris, median 985 px of 1.6M" - is not merely stale in its number, it is wrong IN KIND: at the delivered head the modelled underglow is DARKER than the surface it sits on, on every single bearing. It is not a faint glow, it is a dark line. The own-eyes pass at 2x agrees and was written before this was measured: the brighter blue slivers on the leg arrises are lit leg faces, not the fixture, and the fixture cannot be identified as a glow at all. DISCLOSED, NOT DIALLED. An LED strip in a lit room genuinely is far less visible than in a dark one, so 0.35x may well be correct; the venue level was solved against a reference envelope in A5-R3; this wave is fenced to leave geometry and lighting untouched; and raising LED_L so that a solved fixture re-appears against a solved ambient is precisely the two-errors-cancelling move this branch has refused six times. WHAT WOULD SETTLE IT: a dark-venue register added to the pack so the solved fixture is inspectable at the head it was solved for. Flagged for the orchestrator, not done here. WHAT IS UNCHANGED AND NOT RE-MEASURED ON FAITH: the 77.74% panel occlusion at v0000 is a geometry-only figure and the geometry digest is byte-identical across the two packs. The CORNER AND SIDE half above is likewise unaffected - it is an absence claim, and the fixture is if anything less visible at this head than at the one it was measured on.' },

  { id: 'NEW-A5R2a', cls: 'PRINCIPLED CEILING (rig transport)',
    item: 'Below-rail illuminant chroma is blue cloth bounce',
    orbits: ['fulltable'],
    card: 'below the rail the dominant illuminant is still blue cloth bounce: apron linear r/b 0.289 after the venue ambient, against a reference span of 0.696-0.726 - improved 4.9x, NOT resolved (NEW-A5R2a)',
    disclosure: 'Below the rail the only significant illuminant on the black furniture in this rig is bounce off the blue bed cloth (sRGB 59,129,199), so the cabinet apron face and the unlit leg faces take its chroma: measured r/b 0.062 and 0.056 against three-rig reference spans of 0.381-1.128 and 0.250-2.125. The same surfaces are also too dark relative to each other: apron/unlit-leg measures 0.845 against a reference range of 1.262-4.879, i.e. x1.49 low. The references are lit down there by venue ambient and warm floor bounce that pdt_studio supplies below the level where it competes; our OPEN floor is fine (r/b 1.114 vs 0.917-0.944), which is what localises the fault to the below-rail illuminant rather than to the floor material. MEASURED AFTER THE UNDERGLOW LANDED, because the wave order predicted the underglow would largely resolve this: it does not. v0000 apron_face is [1,5,16] with the fixture off and [1,5,16] with it on - bit-identical - and v0120 apron_face is [0,3,11] both ways. The prediction is recorded as not confirmed rather than quietly credited. One reference row must not be misread: the under-table floor reads r/b 0.021-0.404 in the references because their LED is SET TO BLUE and pooling there, not because their room is blue; ours reads 1.250 (warm room bounce) because our pool is too faint to dominate, so that row is evidence for the M-W17 level limit and is not a licence to tint our floor. NOT DIALLED: warming the apron albedo to cancel a rig-transport chroma error is the two-errors-cancelling move this branch has refused four times. Correcting it means a rig-level ambient that the dossier does not photometrically constrain - 3 photometric frames of 107 censused files (NEW-A4a), none of which is an unclipped below-rail exposure of this cabinet. UPDATED IN A5-R3, AND THE REFUSAL IN THE PREVIOUS SENTENCE IS SUPERSEDED BY NEW-A5R3a. The refusal was right that an ambient with a free, unconstrained level may not be invented; it was wrong that the level was unconstrained. The four references\' cloth-RELATIVE ratio ranges are themselves a constraint, and the ambient\'s existence is not in doubt in any of them. With the derived venue probe in place this row re-measures: apron linear r/b 0.059 -> 0.289 against a reference span of 0.696-0.726 (lv 0.324). So the cast improved by 4.9x and is NOT resolved, and the row stays open at its new value rather than being closed on an improvement. What remains is the floor-bounce half: our room floor is dark walnut plank where every admissible reference is pale arena carpet, which is measured and ledgered as NEW-A5R3c and is out of this wave\'s fence.' },

  { id: 'NEW-A5R3a', cls: 'CLAIMED PARITY (ratio-calibrated approximation)',
    item: 'Venue ambient is a calibrated approximation, not photometric truth',
    orbits: ['fulltable', 'corner', 'side'],
    card: 'venue ambient is a RATIO-CALIBRATED APPROXIMATION, not photometric truth: one free scalar solved so cloth/apron lands at 16.38 inside a measured reference envelope of 12.6-22.6 (NEW-A5R3a)',
    disclosure: 'A Predator-scoped venue ambient (obPdtVenueAmbient) is present and is DECLARED AN APPROXIMATION rather than a measurement. It exists because every one of the four admissible references shows a lit floor and house light that pdt_studio, a local over-table fixture, does not supply; without it the delivered render read cloth/apron 133-293x and cloth/floor 92-140x against reference envelopes of 12.6-22.6x and 1.71-2.35x. SHAPE IS EXACT, LEVEL IS SOLVED. The shape is a uniform upper hemisphere carried on a THREE.LightProbe: irradiance E(theta) = pi*L*(1 + cos theta)/2, and the SH band-2 term vanishes IDENTICALLY for this distribution (the integral of P2(mu) over [0,1] is 0), so a band 0+1 probe is exact here and not truncated - c0 = 2*pi*Y00 = sqrt(pi) = 1.7724539, c1 = 2*pi*Y10*(1/2) = sqrt(3*pi)/2 = 1.5349901, both confirmed against a 4e6-sample Monte Carlo (band 2 <= 3e-3, E(theta) to 6 dp). The one free scalar PDT_VENUE_L = 9.91 is solved against a REFERENCE RANGE and never dialled to a point: the two-bearing geometric mean of cloth/apron lands at 16.38, between the two readings of the target (15.65, the geometric mean of the three admissible reference rows, and 16.87, the geometric midpoint of the stated envelope) and inside the envelope at BOTH bearings. The solve\'s own precision is about +/-5%: the two bearings disagree by 10.4%. THE ANCHOR IS CHOSEN ON EPISTEMICS, NOT PREFERENCE. cloth/apron is the only admissible anchor because it names the SAME PHYSICAL PART on both sides - cloth and apron are this table in the reference and this table in the render - so the ratio is free of both room albedo and exposure. cloth/floor puts the venue\'s floor in the denominator and is contaminated; it is ledgered separately as NEW-A5R3c. Corroborated by an independent same-part ABSOLUTE check the solve was not fitted to: apron reads sRGB [45, 58, 85] here against [54, 55, 64] and [56, 57, 66] in the two hero references. A LightProbe and NOT a HemisphereLight for a hijack reason rather than a taste reason: look.js regrades EVERY isHemisphereLight and cinelight.js binds the LAST one, so a second hemisphere lamp would have been silently re-driven by the look layer; three.js also sums all LightProbes into a single uniform with no NUM_* define, so this adds no program-cache axis either. Neutral by construction, because tinting an invented ambient to cancel a hue residual elsewhere is the two-errors-cancelling trap this branch has refused five times. WHAT IT DOES NOT CLAIM: this is not a photometric reconstruction of any venue. No reference gives an absolute level, and this pack does not pretend one exists.' },

  { id: 'NEW-A5R3b', cls: 'INTENTIONAL DELTA (deferred, Predator-scoped)',
    item: 'Cloth red albedo runs 2.5x high',
    orbits: ['fulltable', 'corner', 'side'],
    card: 'cloth red albedo runs 2.5x high: linear R/G 0.266 against the sole admissible reference at 0.105 - pre-existing, revealed by the ambient rather than caused by it (NEW-A5R3b)',
    disclosure: 'The bed cloth carries too much red. Measured at ZERO ambient, so the figure is a property of the material and not of the new light: render cloth linear R/G 0.266 against the studio reference\'s admissible 0.105, i.e. 2.5x high. With the ambient at its solved level the delivered cloth red reads sRGB 172 against studio\'s 65, linear R/G 0.576. DISCLOSED RATHER THAN HIDDEN, AND THE REASONING IS THE POINT: the obvious move was to keep the ambient low, which would have kept this defect below the visibility floor. That is the two-errors-cancelling trap running in the opposite direction from the usual one - the delivered A5-R2 render\'s cloth looked acceptable only because the room was dark enough to hide it. Keeping a room dark to conceal a too-red cloth is the same offence as reddening a cloth to cancel a dark room, so the level stayed where the ratio solve put it and the material defect is surfaced here as its own row instead. Predator-scoped and fixable, but this wave is fenced to light only, so it is deferred and NOT closed. Note the interaction with M-W18: cloth CHROMA is frozen there because the two available references disagree 20x on r/b and the sole photometric anchor is grade-damaged in exactly that channel. This row is the R/G measurement that survives that ceiling, recorded so the eventual chroma work starts from a number rather than from an impression.' },

  { id: 'NEW-A5R3c', cls: 'PRINCIPLED CEILING (room-scoped, out of fence)',
    item: 'Room floor albedo runs at least 3.1x dark',
    orbits: ['fulltable'],
    card: 'cloth/floor reads 6.13 against a reference envelope of 1.71-2.35: our room floor is dark walnut plank where every admissible reference is pale arena carpet (NEW-A5R3c)',
    disclosure: 'The second half of the ruling\'s target does not close, and the reason is measured rather than guessed. Delivered cloth/floor reads 6.13 against a reference envelope of 1.71-2.35. This is NOT a level error, and no value of PDT_VENUE_L can fix it: under a uniform upper-hemisphere probe the ratio floor/apron reduces to 2*rho_floor/rho_apron, which the level L cancels out of exactly - and that invariance was verified rather than assumed, by sweeping L over 0, 2, 4, 5, 8, 9.91 and 10 and watching floor/apron sit flat at 2.42 throughout, against 7.37-7.64 in the two hero references. So the room floor\'s albedo is at least 3.1x too dark relative to the apron: rho_floor/rho_apron measures about 1.21 here against >= 3.75 there. Corroborated arithmetically: the levels the two constraints would independently demand differ by 32/9.6 = 3.3, the same factor. Our room floor is dark walnut plank; every admissible reference is pale arena carpet or a light studio floor. CLOSING IT IS A room.js ALBEDO CHANGE, which is outside this wave\'s fence (render + docs + tools, Predator-scoped light only) and would alter every other table\'s appearance - the exact cross-table effect the fence exists to prevent. Ledgered, not dialled around.' },

  { id: 'L-8', cls: 'PRINCIPLED CEILING (rig transport)',
    item: 'Rail laminate featureless and warm',
    orbits: ['fulltable', 'corner', 'side'],
    card: 'rail laminate reads featureless; linear r/b 1.0000, exactly achromatic — the \'warm\' half of this row is superseded (L-8)',
    disclosure: 'The black laminate carries no reflected structure and sits warm of the reference. Leading candidate is the NEW-A4c mechanism (one room-centre cubemap for the whole table); routed to the rig repair rather than to an albedo. A5-R4 ADDENDUM — THE WORD "WARM" IS FALSIFIED AND IS SUPERSEDED HERE; "featureless" is confirmed. This row is OUTSIDE the three the A5-R4 order names. It is corrected anyway because Iron Law 11 makes a falsified disclosure a blocking defect regardless of who noticed it, and it was noticed by looking at the delivered frame during the standing own-eyes pass. Measured on delivered bytes at the bearing this box belongs to (fulltable body frame 120, the same rail-top box the NEW-A5a region table uses), both packs, one instrument run twice: A5-R2 sRGB (44, 44, 44) and A5-R3 sRGB (100, 100, 100), with linear r/b = 1.0000 and g/b = 1.0000 in BOTH - the rail top renders EXACTLY achromatic at both heads. Note what that does NOT say: the venue ambient did not fix this, because it was already neutral before the ambient existed. "Warm" was measured in an earlier register with an earlier instrument and carried forward on trust, which is the same failure mode as the three rows the order does name. FEATURELESS STANDS, by measurement - no reflected structure anywhere on the panel - and at 2x by eye: flat grey, two sights, nothing else. The NEW-A4c one-room-centre-cubemap candidate above therefore remains the live explanation for the featurelessness, and is no longer asked to explain a chroma error that does not exist.' },

  { id: 'M-W18', cls: 'PRINCIPLED CEILING (frozen, sources disagree)',
    item: 'Cloth chroma frozen',
    orbits: ['fulltable', 'corner', 'side'],
    card: 'cloth chroma frozen: the available references disagree 20x on red/blue',
    disclosure: 'Cloth chroma is frozen pending a third source. The two available references disagree by 20x on the r/b ratio, and the sole photometric anchor is grade-damaged in exactly that channel (NEW-A4a: cloth R 37.95% at code 0, cloth B 20.47% at code 255). A chroma chosen between two sources that disagree 20x is a preference, not a measurement.' },

  { id: 'NEW-A5a', cls: 'PRINCIPLED CEILING (spatial resolution, wide orbit)',
    item: 'Wide-orbit brightness and the annex acceptance surface (near-black delivery SUPERSEDED)',
    orbits: ['fulltable', 'corner', 'side'],
    card: 'delivered brightness, censused over every delivered body frame: the wide orbit reads a max-channel MEDIAN of sRGB code 82-100 of 255, with 0.0-0.1% of the frame at or below code 16 — it read 10-12 and 67.9-77.9% before the venue ambient, so the near-black wording is superseded. Apron (43, 55, 79), red-at-zero 0.00%, 17.3x below the cloth; no exact-zero pixel in 1183 of 1200 delivered body frames. What the wide orbit still cannot carry is RESOLUTION: it images the pocket 5-11x coarser than the annex/ crops in this pack, which stay the acceptance surface for the wave M/N pocket rebuild (NEW-A5a)',
    disclosure: 'Measured on the DELIVERED bytes (frames decoded back out of the shipped mp4s, native transform, no lift). THRESHOLD-FREE FIGURES FIRST, because they are the ones that reproduce. Quantiles of the max sRGB channel, CENSUSED over every delivered body frame - 480 fulltable, 360 corner, 360 side, decoded back out of the shipped mp4s: fulltable p25 4-7, MEDIAN 10-12, p75 13-20, p90 193-197; corner p25 3-12, MEDIAN 17-28, p75 183-194, p90 202-209; side p25 24-40, MEDIAN 156-206, p75 214-218, p90 217-222. Half of every wide-orbit frame lies at or below code 12 of 255. THESE SUPERSEDE A 20-FRAME SAMPLE, and the sample ran narrow in the flattering direction on four figures: it gave fulltable p25 5-6 against a census of 4-7, fulltable p75 14-18 against 13-20, side MEDIAN 156-204 against 156-206, and the card transcribed the wide-orbit p75 as 14-17, narrower again and disagreeing with this row - two disclosure surfaces of one pack that did not match line by line. Same defect class as the M-W17 tail corrected in the same round: an envelope drawn from 20 of 1200 frames is not an envelope. REGION MEDIANS at the broadside bearing (fulltable video frame 210), bit-identical in all three captures: cloth bed linear Y 0.26177, rail top 0.02519 = sRGB8 (44, 44, 44), rail outer face 6 px lower on the same part 0.00028 = (0, 1, 3), cabinet apron 0.00089 = (0, 3, 11) with p95 equal to the median, leg 0.00127 = (0, 4, 17), floor 0.01775, wall 0.00126. Cloth/cabinet 293x, cloth/leg 206x, cloth/rail-outer-face 926x, and the rail loses 90x of luminance over 6 px of its own surface. The cabinet red channel is EXACTLY zero and the panel carries no structure at all: that is not a measurement of a laminate, it is a measurement of a delivery. AREA FRACTIONS ARE NOT QUOTED AS FIGURES, deliberately: a pixel count at a hard code threshold moves up to 3.5 points at a FIXED bearing between captures, because the raster carries only a few hundred distinct sRGB triples below code 16 (286-424 over the ten sampled bearings of the delivered pack) and a whole plateau crosses the threshold at once. Observed envelope, now over every delivered body frame rather than three captures of ten bearings, given as an envelope and never as a number: at or below code 16 of 255 — fulltable 67.9-77.9% (median bearing 74.6%), corner 34.1-45.0% (38.5%), side 12.5-20.3% (17.2%). The census widens all three, most at the fulltable low end where 74.0% becomes 67.9%: that is exactly the instability this paragraph warns about, now measured instead of predicted. See provenance capture_reproducible. CAUSE: pdt_studio is a local over-table fixture and the falloff to the cabinet, legs, floor and pocket bore is inverse-square and physically correct; the wide orbit is simply the bearing at which that falloff dominates the frame. NOT a defect to dial: the rig is frozen and was solved against admissible frames, and lifting it at delivery would be tuning the solve after the fact. CONSEQUENCE FOR ACCEPTANCE, stated plainly: the wave M/N pocket-interior rebuild (plug puck, relief gap, countersunk vent and lit lip) and the cabinet and legs CANNOT be accepted on these videos, because at 8 bits the information is not in the delivered raster — a gamma lift would reveal quantisation blocks, not form. That work must be accepted on the A4 solved-pose crops instead, and THOSE CROPS SHIP IN THIS PACK: annex/a4-wide.png, annex/a4-pocket-zoom.png, annex/a4-puck-zoom.png, the six annex/a4rim/*.png rim registers, and the annotated render-vs-photograph pair annex/a4-ann-render.png + annex/a4-ann-photo.png, every one sha256-bound in annex/annex-manifest.json and re-checked by --verify. Through A5-R2 this sentence pointed at scratch files in /tmp that a reader of the pack could not open, which is a disclosure naming evidence the delivery did not contain; A5-R3 corrected it by shipping the bytes, not by softening the sentence. A lifted-look companion cut was considered and rejected: OB_488P_LOOK output is non-evidential by the tool\'s own rule, and a non-evidential artefact inside a byte-bound evidence pack is a liability, not a proof. A5-R4 ADDENDUM — EVERY DELIVERY-LEVEL FIGURE ABOVE IS SUPERSEDED and is requalified with its measurement head (A5-R2). The A5-R3 venue ambient lifted the delivery and those figures were still shipping as if measured on what this pack delivers. Re-censused with ONE instrument run twice, both packs in one process, over every delivered body frame of all three orbits; the A5-R2 column reproduces the paragraph above TO THE DIGIT, which is the instrument\'s own validation and is why its A5-R3 column can be trusted. MAX sRGB CHANNEL, A5-R2 then A5-R3: fulltable p25 4-7 then 64-83, MEDIAN 10-12 then 82-100, p75 13-20 then 103-141, p90 193-197 then 245-245; corner MEDIAN 17-28 then 90-146; side MEDIAN 156-206 then 244-248. AT OR BELOW CODE 16: fulltable 67.9-77.9% (median bearing 74.6%) then 0.0-0.1% (0.0%); corner 34.1-45.0% then 0.0-0.3%; side 12.5-20.3% then 0.0-0.4%. At or below code 6, fulltable 24.7-32.2% then 0.0%. Distinct sRGB triples at or below code 16, fulltable 318-480 then 22-102. THE WIDE-ORBIT MAX-CHANNEL MEDIAN MOVED 11 TO 87, A FACTOR OF 7.9, and the sentence above that half of every wide-orbit frame lies at or below code 12 of 255 is now FALSE: it lies at or below code 87. REGION MEDIANS re-measured at the same broadside bearing with the same boxes, A5-R2 then A5-R3: cloth bed sRGB (77, 144, 209) linear Y 0.26128 then (171, 219, 246) 0.65975; rail top (44, 44, 44) 0.02519 then (100, 100, 100) 0.12744; rail outer face (0, 1, 3) 0.00028 then (43, 47, 60) 0.02873; cabinet apron (0, 3, 11) 0.00089 then (43, 55, 79) 0.03810. The apron red channel is therefore no longer exactly zero: its red-at-zero fraction went 100.00% to 0.00% at this bearing on a single-variable check at one tree, L = 0 against L = 9.91. Cloth/cabinet went 293x to 17.32x on this instrument at this bearing; the A5-R3 verifier read 16.4 and the ambient solve used a two-bearing geometric mean of 16.38, and all three sit inside the 12.6-22.6x reference envelope. ONE ESTIMATOR CAVEAT, stated because these numbers are quoted beside the shipped ones: this instrument lands 0.02% from the shipped cloth-bed value (0.26128 against 0.26177), an estimator-ordering difference - Y of the median RGB against the median of per-pixel Y. It is immaterial, and it is avoided entirely by quoting THIS instrument on BOTH sides of every before/after. "NOT EVALUABLE BY EYE" IS REFUTED, and refuted by this ledger\'s own contents: NEW-A5R3d was found by eye on the corner orbit at 1x and is now a row of its own. THE ANNEX ACCEPTANCE-REDIRECT IS NARROWED, NOT DROPPED, and it now rests on spatial RESOLUTION rather than on brightness - measured rather than asserted. Perpendicular image scale s = H / (2 d tan(fov_v/2)) at the pocket, an UPPER bound because the pocket is seen obliquely and on-surface scale falls by cos(incidence), which is deliberately not modelled: annex a4-out register d 0.6200 m, 2.843 px/mm; side orbit d 0.5250 m, 2.931 px/mm, 1.03x the annex; corner orbit d 0.6096 m, 2.524 px/mm, 0.89x; fulltable orbit d 2.3214-4.8542 m, 0.268-0.561 px/mm, 0.09-0.20x. Cross-checked against the raster: the annex bore radius of 17.4 px over 949 px of area gives a 12.23 mm bore diameter at the derived scale. CONSEQUENCE: the redirect STANDS for the wide orbit, which images the pocket 5-11x coarser than the annex, and it does NOT stand on resolution grounds for the two close-ups, which resolve the pocket as well as or better than the annex does. The close-ups no longer need a redirect at all, because they are now evaluable by eye; what the annex still uniquely supplies is a static, magnified, annotated crop at a pose registered to the photograph, supporting a side-by-side an orbiting camera cannot. The annex crops continue to ship and to be sha256-bound in annex/annex-manifest.json, and --verify continues to fail closed without them.' },

  { id: 'NEW-A4a', cls: 'PRINCIPLED CEILING (photometric basis)',
    item: 'The photometric basis is three frames',
    orbits: [],
    card: null,
    disclosure: 'Of 107 censused reference files, 84 are admissible for geometry and exactly 3 for photometry — and of those 3, one shows the play surface. That frame carries a saturation push with real clipping (cloth R 37.95% at 0, cloth B 20.47% at 255) while its neutrals stay neutral to one code value, so it is admissible PER CLASS: its neutrals are measurements, its chroma is not. This is the ceiling under which every material line in this pack was written.' },

  { id: 'NEW-A4e', cls: 'INTENTIONAL DELTA (ZERO-DRIFT kernel pin)',
    item: 'Side mouth pinned at 127.000 mm',
    orbits: ['side', 'fulltable'],
    card: 'side mouth pinned at kernel 127.000 mm vs official 124.968 mm (+2.032 mm, intentional)',
    disclosure: 'Kernel side mouth 127.000 mm (gate FV488P-PLAN-SIDE-MOUTH PASS at measured 127.000); official reference 124.968 mm; delta +2.032 mm, i.e. 1.6% bias on any registration-derived scale. The kernel-collision rows are ZERO-DRIFT pinned in this lane: reshaping kernel geometry to match a render truth is forbidden, so the conflict is ledgered and never closed. Independent scale check on the solved camera read 11.39 px/mm here against 11.104 px/mm in N.4 — a 2.6% spread that this pin partly explains.' },

  { id: 'DE-BRAND', cls: 'INTENTIONAL DELTA (IP policy)',
    item: 'Branding removed, internal ids included',
    orbits: ['fulltable', 'corner', 'side'],
    card: 'all brand marks intentionally removed per IP policy (not a defect)',
    disclosure: 'Every brand element is deliberately removed or replaced per the standing IP policy, internal identifiers included; PDT_LAMINATE = 0x151515 stands in for the named laminate finish. When this pack is compared pixel-for-pixel against a photograph of a real table, this is the only INTENTIONAL difference family.' },

  { id: 'M-W16', cls: 'CLAIMED PARITY (geometry)',
    item: 'Plug invisible at oblique side bearings',
    orbits: ['side'],
    card: null,
    disclosure: 'The plug is not visible at any of the 24 oblique side bearings. Explained by the 46.2 deg sight threshold; the geometry is correct and there is nothing to fix. Recorded so the absence is not later read as a missing mesh.' },
];

const cardLineFor = (orbit) => {
  const rows = LEDGER.filter((r) => r.card && r.orbits.includes(orbit));
  return `IN-FRAME RESIDUALS, LEDGERED (${rows.length} of ${LEDGER.length} ledger rows are visible in this orbit): `
    + rows.map((r) => r.card).join('  ·  ');
};

// ---------------------------------------------------------------------------
// provenance — byte-bound, gathered once, stamped everywhere
// ---------------------------------------------------------------------------
const sha256File = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sha256Buf = (b) => createHash('sha256').update(b).digest('hex');
const git = (a) => execFileSync('git', a, { cwd: repoDir }).toString().trim();

function provenance() {
  const dirty = git(['status', '--porcelain']) !== '';
  // ZERO-CRATES fence, proven rather than asserted: the behavioural core has no
  // diff against the branch point, so nothing in these videos can have moved it.
  const coreDiff = git(['diff', '--stat', 'main...HEAD', '--', 'crates', 'sdk']);
  const wasm = path.join(webDir, 'dist/pool-wasm/pool_wasm_bg.wasm');
  const spec = path.join(repoDir, 'docs/geometry/gh488p-predator-apex-canonical.json');
  return {
    tool: 'tools/render/orbitsweep-488p.mjs',
    tool_sha256: sha256File(path.join(here, 'orbitsweep-488p.mjs')),
    // HOUSE NAMING TRAP, stated so nobody has to rediscover it: what this repo
    // calls the "tree sha" under `tree` / `tree_head` is `git rev-parse HEAD`,
    // i.e. a COMMIT.  The genuine tree objects are given their own keys.
    tree_sha_house: git(['rev-parse', 'HEAD']),
    git_commit: git(['rev-parse', 'HEAD']),
    git_tree_object: git(['rev-parse', 'HEAD^{tree}']),
    web_tree_object: git(['rev-parse', 'HEAD:web']),
    tree_dirty: dirty,
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    core_bytes_unchanged_vs_main: coreDiff === '',
    core_diff_stat: coreDiff,
    kernel_wasm: 'web/dist/pool-wasm/pool_wasm_bg.wasm',
    kernel_wasm_sha256: sha256File(wasm),
    kernel_wasm_bytes: fs.statSync(wasm).size,
    canonical_geometry: 'docs/geometry/gh488p-predator-apex-canonical.json',
    canonical_geometry_sha256: sha256File(spec),
    chrome_shell_pin: chromeShellPin(),
    ffmpeg: execFileSync('ffmpeg', ['-version']).toString().split('\n')[0],
    raster: `${W}x${H}`,
    fps: FPS,
    encoder: [...X264, ...REPRO, '-vf', VF, '-movflags', '+faststart'].join(' '),
    card_frames: CARD_FRAMES,
    rig: 'app.html?table=predator_apex_9ft&cinema=1&seed=7&look=default'
      + ' · GI bake class pool · venue fixture pdt_studio (frozen)',
  };
}

// ---------------------------------------------------------------------------
// register alignment — the claim that every MEASURED bearing is a frame the
// owner actually sees, checked against the committed register files.
// ---------------------------------------------------------------------------
function verifyRegisterAlignment(name) {
  const spec = ORBITS[name];
  if (!spec.registers) return null;
  const regs = JSON.parse(fs.readFileSync(path.join(here, spec.registers), 'utf8'));
  if (spec.run % regs.length !== 0) {
    throw new Error(`${name}: run ${spec.run} is not a multiple of `
      + `${regs.length} measured bearings — a measured bearing would fall `
      + 'between video frames');
  }
  const step = spec.run / regs.length;
  const TOL = 1e-6;
  const map = [];
  regs.forEach((reg, j) => {
    const p = poseAt(spec, j * step);
    const d = Math.max(
      ...p.cam.map((v, k) => Math.abs(v - reg.cam[k])),
      ...p.look.map((v, k) => Math.abs(v - reg.look[k])),
      Math.abs(p.fov - reg.fov));
    if (!(d <= TOL)) {
      throw new Error(`${name}: measured bearing ${reg.name} does not land on a `
        + `video frame (frame ${j * step}, max component delta ${d})`);
    }
    map.push({ register: reg.name, video_frame: j * step, max_delta: d });
  });
  return { registers: spec.registers, count: regs.length, step, map };
}

// ---------------------------------------------------------------------------
// framing containment
//
// "the whole table is in every frame" is a claim, so it gets an instrument.
// Every vertex the render dump carries is projected through the SAME camera the
// sweep will use, on EVERY frame of the run.  Margin is reported in units of the
// half-frame: +1 is dead centre, 0 is exactly touching an edge, negative is a
// clip.  Vertices, not the AABB: the union AABB's floor-level corners sit in
// empty space beside the legs and condemn stations that visibly do not clip
// (measured: AABB called the adopted station a -0.36 clip; the true hull gives
// +0.0746).  A bound that cries wolf gets switched off, so it is not a bound.
//
// Only orbits that must contain the table are checked.  corner/side deliberately
// crop into a single pocket at r 0.46 / 0.40 — containment there would be a bug,
// not a gate, so they declare no floor and are skipped.
// ---------------------------------------------------------------------------
const FRAMING_FLOOR = 0.02; // half-frame fraction; below this a re-cut can clip

function meshVertices() {
  const md = JSON.parse(fs.readFileSync(DUMP, 'utf8'));
  let n = 0;
  for (const m of md.meshes) n += (m.tris ? m.tris.length : 0);
  const V = new Float64Array(n);
  let o = 0;
  for (const m of md.meshes) {
    if (!m.tris) continue;
    for (let i = 0; i < m.tris.length; i++) V[o++] = m.tris[i];
  }
  return V; // flat [x,y,z,...] in three.js world coords (x LENGTH, y HEIGHT, z WIDTH)
}

function verifyFraming(name, V) {
  const spec = ORBITS[name];
  if (spec.hullMargin === undefined) return null;
  const ty = Math.tan((spec.fov * Math.PI / 180) / 2);
  const tx = ty * (W / H);
  let worst = Infinity; let worstFrame = -1;
  for (let i = 0; i < spec.run; i++) {
    const p = poseAt(spec, i);
    // pose frame [kx WIDTH, ky LENGTH, h] -> three.js (x=ky, y=h, z=kx)
    const cx = p.cam[1]; const cy = p.cam[2]; const cz = p.cam[0];
    let fx = p.look[1] - cx; let fy = p.look[2] - cy; let fz = p.look[0] - cz;
    const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    // right = normalize(fwd x up0) with up0 = +Y, i.e. (-fz, 0, fx)
    let rx = -fz; let ry = 0; let rz = fx;
    const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;
    let mx = 0; let my = 0; let behind = false;
    for (let k = 0; k < V.length; k += 3) {
      const vx = V[k] - cx; const vy = V[k + 1] - cy; const vz = V[k + 2] - cz;
      const zf = vx * fx + vy * fy + vz * fz;
      if (zf <= 1e-6) { behind = true; break; }
      const ax = Math.abs((vx * rx + vy * ry + vz * rz) / (zf * tx));
      const ay = Math.abs((vx * ux + vy * uy + vz * uz) / (zf * ty));
      if (ax > mx) mx = ax;
      if (ay > my) my = ay;
    }
    const margin = behind ? -9 : Math.min(1 - mx, 1 - my);
    if (margin < worst) { worst = margin; worstFrame = i; }
  }
  if (!(worst >= FRAMING_FLOOR)) {
    throw new Error(`${name}: framing margin ${worst.toFixed(4)} of the half-frame `
      + `at frame ${worstFrame} — the table leaves the frame (floor ${FRAMING_FLOOR})`);
  }
  if (Math.abs(worst - spec.hullMargin) > 5e-4) {
    throw new Error(`${name}: framing margin drifted to ${worst.toFixed(4)}, `
      + `declared ${spec.hullMargin} — the station or the geometry moved`);
  }
  return {
    frames: spec.run,
    vertices: V.length / 3,
    min_margin_half_frame: Number(worst.toFixed(6)),
    worst_frame: worstFrame,
    min_margin_px: { x: Math.round(worst * W / 2), y: Math.round(worst * H / 2) },
  };
}

// ---------------------------------------------------------------------------
// title card — rendered in the pinned Chrome, so the card raster is as pinned
// as the orbit raster.  DISCLOSED LIMIT: text shaping still resolves against
// the HOST font stack, so a card re-cut on a different machine may differ by a
// glyph.  That is exactly the case Stage 9's framemd5 mechanism exists for —
// the ORBIT BODY frames are provably identical across any card re-cut.
// ---------------------------------------------------------------------------
function cardHtml(name, prov, align) {
  const spec = ORBITS[name];
  // A card re-cut under --cards-only stamps ITS OWN head over body frames shot
  // at an earlier one.  Printing one commit and letting the viewer assume it
  // covers both is the understated disclosure Iron Law 11 treats as a defect.
  const bc = bodyCapture(name);
  const bodyHead = bc
    ? `${bc.captured_at_head}   ${bc.captured_at_head === prov.git_commit
      ? 'same head as this cut' : 'EARLIER head, cards re-cut since'}`
    : 'UNRECORDED — swept before the run sidecar existed';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const row = (k, v) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`;
  const framing = prov.framing ? prov.framing[name] : null;
  if (!align && !framing) {
    throw new Error(`${name}: card would carry neither measured bearings nor a `
      + 'framing proof — refusing to stamp an unqualified capture line');
  }
  // "bearings" only where bearings were actually measured; a hero orbit that
  // borrows the word would imply evidence it does not carry.
  const bearings = align
    ? `${spec.run} bearings · ${align.count} measured registers at every ${align.step} frames`
    : `${spec.run} frames · table fully in frame at every one of them, `
      + `worst margin ${framing ? framing.min_margin_half_frame : '?'} of the `
      + `half-frame (${framing ? framing.min_margin_px.x : '?'} px x, `
      + `${framing ? framing.min_margin_px.y : '?'} px y)`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${W}px;height:${H}px;background:#141418;
    color:#e8e6e2;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;
    -webkit-font-smoothing:antialiased;overflow:hidden}
  .pad{padding:52px 68px;box-sizing:border-box;height:100%;display:flex;
    flex-direction:column}
  .eyebrow{font-size:19px;letter-spacing:.34em;text-transform:uppercase;
    color:#8d8a84}
  h1{font-size:44px;margin:14px 0 2px;font-weight:600;letter-spacing:.01em}
  .sub{font-size:24px;color:#b9b5ad;margin-bottom:6px}
  .what{font-size:17px;color:#7e7b75;margin-bottom:22px}
  table{border-collapse:collapse;font-family:"SF Mono",Menlo,monospace;
    font-size:16px;line-height:1.62}
  td.k{color:#7e7b75;padding-right:26px;white-space:nowrap;vertical-align:top}
  td.v{color:#d6d3cc;word-break:break-all}
  hr{border:0;border-top:1px solid #2c2c31;margin:22px 0 16px}
  .rlabel{font-size:15px;letter-spacing:.22em;text-transform:uppercase;
    color:#c9a227;margin-bottom:9px}
  .resid{font-size:17.5px;line-height:1.68;color:#ded9cf}
  .foot{margin-top:auto;font-size:14px;color:#6a675f;
    font-family:"SF Mono",Menlo,monospace}
  </style></head><body><div class="pad">
  <div class="eyebrow">OpenBilliards &middot; 1:1 reference rebuild &middot; wave ${WAVE}</div>
  <h1>Predator Apex 9&nbsp;ft</h1>
  <div class="sub">${esc(spec.label)}</div>
  <div class="what">${esc(spec.what)}</div>
  <table>
  ${row('tree sha (this cut)', `${prov.tree_sha_house}   ${prov.tree_dirty ? 'DIRTY' : 'clean'}`)}
  ${row('body frames from', bodyHead)}
  ${row('web tree object', prov.web_tree_object)}
  ${row('mesh geometry sha256', `${prov.mesh_geometry_sha256}   (${prov.mesh_count} meshes)`)}
  ${row('canonical geometry', prov.canonical_geometry_sha256)}
  ${row('kernel wasm sha256', prov.kernel_wasm_sha256)}
  ${row('date', prov.date)}
  ${row('rig', 'pdt_studio (frozen) · GI bake class pool · look=default · cinema=1 · seed=7')}
  ${row('orbit', `look [${spec.center.map((v) => v.toFixed(3)).join(', ')}] m`
    + ` · r ${spec.r.toFixed(3)} m · cam h ${spec.h.toFixed(3)} m · fov ${spec.fov}°`
    + ` · elev ${(Math.atan2(spec.h - spec.center[2], spec.r) * 180 / Math.PI).toFixed(2)}°`)}
  ${row('capture', `${bearings} · ${W}x${H} · ${FPS} fps · libx264 crf 14 preset medium yuv420p`)}
  </table>
  <hr>
  <div class="rlabel">Honest disclosure &mdash; one ledger, measurements not adjectives</div>
  <div class="resid">${esc(cardLineFor(name))}</div>
  <div class="foot">the one ledger this line is transcribed from: INDEX.md &sect;ledger in this pack &middot; SPIKE-REPORT.md ${WAVE_SECTIONS}</div>
  </div></body></html>`;
}

// ---------------------------------------------------------------------------
// capture
// ---------------------------------------------------------------------------
const waitFrame = (chrome) => chrome.eval(
  'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');

const HIDE_OVERLAYS = `(() => {
  __test.aim(Math.PI * 1.5);
  window.__dbg.scene.traverse((o) => {
    const hex = o.material && o.material.color
      && o.material.color.getHexString && o.material.color.getHexString();
    if (hex === 'dff1ff' || hex === '76afee') o.visible = false;
    if (/^obAim/.test(o.name || '')
      || (o.parent && /^obAim/.test(o.parent.name || ''))) o.visible = false;
  });
  const st = document.createElement('style');
  st.textContent = 'body > :not(canvas) { display: none !important; }';
  document.head.appendChild(st);
  return true;
})()`;

// EMPTY-TABLE law: the deliverable orbits show the TABLE, so balls and cue are
// zeroed and the GI sphere count with them.
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

async function settle488p(chrome) {
  for (let i = 0; i < 150; i++) {
    const st = await chrome.eval(`(() => {
      const s = window.__gi && window.__gi.state;
      const rig = window.__lighting && window.__lighting.state
        && window.__lighting.state().fixture;
      return s ? JSON.stringify({ r: s.ready, f: s.fixture, b: s.baked,
        c: s.bakeClass, rig }) : null;
    })()`).catch(() => null);
    if (st) {
      const v = JSON.parse(st);
      if (v.r && v.b && v.c === 'pool' && v.f === 'pdt_studio'
        && v.rig === 'pdt_studio') return;
    }
    await sleep(200);
  }
  const why = await chrome.eval(`JSON.stringify({
    gi: window.__gi && window.__gi.state,
    rig: window.__lighting && window.__lighting.state
      && window.__lighting.state().fixture })`).catch(() => '(unreadable)');
  throw new Error(`488P GI/rig never settled on the frozen rig: ${why}`);
}

async function withChrome(fn) {
  // own band, disjoint from 489 (16700-16729), 490 (16730-16759) and the 488P pose
  // capture (9660-9689)
  const band = await claimPortBand(23850, 23879);
  const PORT = band.http(0); const CDPP = band.cdp(0);
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?table=predator_apex_9ft&cinema=1&seed=7&look=default`,
    { port: CDPP, width: W, height: H });
  try {
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    return await fn(chrome);
  } finally {
    const gone = await chrome.closeAndWait();
    await stopStaticServer(server);
    band.release();
    if (gone === false) throw new Error('chrome teardown unconfirmed');
  }
}

async function captureRuns(chrome, prov) {
  let ready = false;
  for (let i = 0; i < 220 && !ready; i++) {
    await sleep(200);
    ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
  }
  if (!ready) throw new Error('app never ready');
  await settle488p(chrome);
  await sleep(1200);
  await chrome.eval(HIDE_OVERLAYS);
  await chrome.eval(HIDE_BALLS);

  for (const name of ORBIT_NAMES) {
    const spec = ORBITS[name];
    const runDir = path.join(PACK, name, 'run');
    fs.rmSync(path.join(PACK, name), { recursive: true, force: true });
    fs.mkdirSync(runDir, { recursive: true });
    // warm the guarded camerascript import at the first pose
    let ok = false;
    for (let i = 0; i < 25 && !ok; i++) {
      ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(poseAt(spec, 0))})`);
      if (!ok) await sleep(200);
    }
    if (!ok) throw new Error(`${name}: pose rejected`);
    const t0 = Date.now();
    for (let i = 0; i < spec.run; i++) {
      const p = poseAt(spec, i);
      const posed = await chrome.eval(`__test.cameraPose(${JSON.stringify(p)})`);
      if (!posed) throw new Error(`${name}: pose rejected at frame ${i}`);
      await chrome.eval(PER_FRAME_HIDE);
      await waitFrame(chrome);
      await waitFrame(chrome);
      await chrome.screenshot(
        path.join(runDir, `v${String(i).padStart(4, '0')}.png`));
      if (i % 60 === 0) {
        console.log(`[capture] ${name} ${i}/${spec.run}`
          + ` (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      }
    }
    // THE HEAD THESE PIXELS CAME FROM, written beside them.  `--cards-only`
    // re-encodes an OLD run/ at a NEW head, so from that moment the pack's
    // `tree sha` row is the head of the CARD, not of the body frames.  Wave
    // A5-R4 was the first cut where those diverged and the INDEX still said
    // "body frames captured at the sealed head" -- true when written, false
    // after the re-cut, and nothing in the pack could tell a reader which.
    // The sidecar is written by the only mode that actually captures pixels,
    // so it cannot be back-dated by a card re-cut.  encodeOrbit's contiguity
    // check matches /^v\d{4}\.png$/ and ignores it.
    fs.writeFileSync(path.join(runDir, 'capture.json'), `${JSON.stringify({
      orbit: name,
      frames: spec.run,
      captured_at_head: prov.git_commit,
      tree_dirty: prov.tree_dirty,
      web_tree_object: prov.web_tree_object,
      mesh_geometry_sha256: prov.mesh_geometry_sha256,
      tool_sha256: prov.tool_sha256,
      when: new Date().toISOString(),
    }, null, 2)}\n`);
    console.log(`[capture] ${name}: ${spec.run} frames in `
      + `${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}

async function captureCards(chrome, prov) {
  for (const name of ORBIT_NAMES) {
    const align = verifyRegisterAlignment(name);
    const html = cardHtml(name, prov, align);
    await chrome.eval(`(() => {
      document.open(); document.write(${JSON.stringify(html)}); document.close();
      return true;
    })()`);
    await waitFrame(chrome);
    await waitFrame(chrome);
    await sleep(250);
    // A card that runs off the bottom of the raster is a disclosure the viewer
    // physically cannot finish reading, which Iron Law 11 treats as a
    // falsified disclosure and not a layout nit.  The ledger grows every wave,
    // so this is asserted on every cut instead of eyeballed once.
    //
    // NOT documentElement.scrollHeight: the card sets `overflow:hidden` on
    // html/body, which CLAMPS that value to the viewport — measured 1000 on a
    // card whose content was 1041 px tall.  It would have been a check that
    // could never fire.  body.scrollHeight and the two element rects are not
    // clamped, and all three were red-armed against a card with the residual
    // text tripled (body 1041, resid bottom 1025, foot bottom 1041).
    const over = await chrome.eval(
      'JSON.stringify([document.body.scrollHeight, '
      + 'document.querySelector(".resid").getBoundingClientRect().bottom, '
      + 'document.querySelector(".foot").getBoundingClientRect().bottom])');
    const [bodyH, residBottom, footBottom] = JSON.parse(over);
    if (bodyH > H || residBottom > H || footBottom > H) {
      throw new Error(`[card] ${name}: content overflows the ${W}x${H} raster `
        + `(body ${bodyH} px, residual block ends at ${Math.round(residBottom)}, `
        + `footer at ${Math.round(footBottom)}) — the disclosure would be cut `
        + 'off mid-sentence');
    }
    const dir = path.join(PACK, name);
    fs.mkdirSync(dir, { recursive: true });
    await chrome.screenshot(path.join(dir, 'card.png'));
    fs.writeFileSync(path.join(dir, 'card.html'), html);
    console.log(`[card] ${name}`);
  }
}

// ---------------------------------------------------------------------------
// encode + the five byte-bound proof mechanisms
// ---------------------------------------------------------------------------
const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a],
  { maxBuffer: 1 << 28 });

function encodeOrbit(name, tmpSuffix = '') {
  const spec = ORBITS[name];
  const dir = path.join(PACK, name);
  const runDir = path.join(dir, 'run');
  const frames = fs.existsSync(runDir)
    ? fs.readdirSync(runDir).filter((f) => /^v\d{4}\.png$/.test(f)).sort() : [];
  // a TRUNCATED or non-contiguous run must never silently re-index — half an
  // orbit could go unseen behind a plausible-looking video (the 489 r8 lesson)
  if (frames.length !== spec.run
    || frames.some((f, i) => f !== `v${String(i).padStart(4, '0')}.png`)) {
    throw new Error(`[encode] ${name}: run is truncated or non-contiguous `
      + `(${frames.length}/${spec.run}) — refusing to encode a partial orbit`);
  }
  if (!fs.existsSync(path.join(dir, 'card.png'))) {
    throw new Error(`[encode] ${name}: no card.png — refusing to ship an `
      + 'undisclosed video');
  }
  const seq = path.join(dir, `seq${tmpSuffix}`);
  fs.rmSync(seq, { recursive: true, force: true });
  fs.mkdirSync(seq);
  for (let k = 0; k < CARD_FRAMES; k++) {
    fs.linkSync(path.join(dir, 'card.png'),
      path.join(seq, `t${String(k).padStart(5, '0')}.png`));
  }
  frames.forEach((f, i) => {
    fs.linkSync(path.join(runDir, f),
      path.join(seq, `t${String(CARD_FRAMES + i).padStart(5, '0')}.png`));
  });
  const out = path.join(dir, `488p-predator-apex-${name}-orbit${tmpSuffix}.mp4`);
  ff(['-framerate', String(FPS), '-i', path.join(seq, 't%05d.png'),
    '-vf', VF, ...X264, ...REPRO, '-movflags', '+faststart', out]);
  fs.rmSync(seq, { recursive: true, force: true });
  return out;
}

/** PROOF 2 — framemd5 body-frame identity across card re-cuts.
 *  Returns the per-frame md5 list and a sha256 over the BODY frames only, so a
 *  card re-cut (wording correction) can be proven not to have touched a single
 *  orbit pixel. */
function frameMd5(mp4) {
  const txt = execFileSync('ffmpeg',
    ['-v', 'error', '-i', mp4, '-f', 'framemd5', '-'],
    { maxBuffer: 1 << 28 }).toString();
  const lines = txt.split('\n').filter((l) => l && !l.startsWith('#'));
  const body = lines.slice(CARD_FRAMES).map((l) => l.trim().split(',').pop().trim());
  return { frames: lines.length, body_frames: body.length,
    body_framemd5_sha256: sha256Buf(Buffer.from(body.join('\n'))) };
}

/** PROOF 3 — full-decode playback proof: every frame decodes, zero errors. */
function playbackProof(mp4) {
  const n = execFileSync('ffprobe', ['-v', 'error', '-count_frames',
    '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames',
    '-of', 'csv=p=0', mp4], { maxBuffer: 1 << 26 }).toString().trim();
  // ffmpeg can exit 0 while printing decode errors, so stderr is read on the
  // SUCCESS path too — a proof that only looks at the exit code is not a proof.
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', mp4, '-f', 'null', '-'],
    { maxBuffer: 1 << 26 });
  const err = `${(r.stderr || '').toString().trim()}`;
  if (err || r.status !== 0) {
    throw new Error(`[playback] ${path.basename(mp4)}: decode errors `
      + `(exit ${r.status}): ${err.split('\n').slice(0, 3).join(' | ')}`);
  }
  return { decoded_frames: Number(n), decode_errors: 0 };
}

// The sole photometric anchor that shows the play surface (NEW-A4a). Pinned
// here so the annex pair cannot be quietly rebuilt against a different file:
// the reference is the one input to this pack that does not live in the repo.
const POCKET_CLOSEUP_SHA256 =
  '633d89577560591fad9768bd9714ba39d121610acac9d1461738d2cdc4e4bd03';

// The A4 solved-pose crop annex. Ledger row NEW-A5a says the wave M/N
// pocket-interior rebuild is accepted on these crops and NOT on the delivered
// orbits, so a pack without them carries a disclosure that points at nothing.
// That makes the annex FAIL-CLOSED here rather than optional: no annex, no pack.
//
// --cards-only must not rebuild it. That mode's whole guarantee is that the
// delivered body bytes are untouched, and the annex is delivered body bytes;
// so the card path RE-BINDS the existing annex (checking every file still
// hashes to what its own manifest recorded) instead of re-shooting it.
// The manifest's purpose line is a DISCLOSURE, not a delivered pixel: it is
// copied verbatim into provenance.json and read as a statement about what
// the annex is for.  --cards-only cannot rebuild the annex (those are body
// bytes), so a stale purpose could not be corrected by any card re-cut, and
// wave A5-R5 found one that had outlived its ledger row by two waves.  The
// card path therefore RE-DERIVES this one string from annex-purpose.mjs and
// says so out loud.  The twelve annex FILES are untouched and still checked
// byte-for-byte against their own recorded sha256 immediately above.
function reconcileAnnexPurpose(m) {
  const before = m.purpose;
  const changed = before !== ANNEX_PURPOSE;
  m.purpose = ANNEX_PURPOSE;
  m.purpose_source = ANNEX_PURPOSE_SOURCE;
  return { changed, before };
}

function buildAnnex() {
  const dir = path.join(PACK, 'annex');
  const mf = path.join(dir, 'annex-manifest.json');
  if (MODE === 'cards-only') {
    if (!fs.existsSync(mf)) {
      throw new Error('--cards-only on a pack with no annex/: the NEW-A5a row '
        + 'points at annex files, so re-cutting cards here would ship a pack '
        + 'whose acceptance surface does not exist. Run --sweep.');
    }
    const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
    for (const [rel, sha] of Object.entries(m.files)) {
      if (sha256File(path.join(dir, rel)) !== sha) {
        throw new Error(`annex/${rel} no longer matches the sha its own `
          + 'manifest recorded — the card re-cut would rebind a changed byte');
      }
    }
    console.log(`[annex] re-bound ${Object.keys(m.files).length} existing files`);
    const p = reconcileAnnexPurpose(m);
    if (p.changed) {
      fs.writeFileSync(mf, `${JSON.stringify(m, null, 1)}\n`);
      console.log('[annex] purpose line was STALE and has been re-derived from '
        + `${ANNEX_PURPOSE_SOURCE}; the annex files themselves are unchanged and `
        + 'were verified against their recorded sha256 above');
      console.log(`[annex]   was: ${p.before.slice(0, 120)}…`);
    }
    return m;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  const a = ['tools/render/a4annex-488p.mjs', '--out', dir];
  if (ANNEX_PHOTO) a.push('--photo', ANNEX_PHOTO);
  const r = spawnSync(process.execPath, a, { cwd: repoDir, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`[annex] builder exited ${r.status}`);
  return JSON.parse(fs.readFileSync(mf, 'utf8'));
}

// What head the run/ PNGs were shot at, or an honest null.  A pack cut
// before the sidecar existed cannot answer this, and saying so is the
// disclosure; inferring it from the current head would be the falsehood.
function bodyCapture(name) {
  const f = path.join(PACK, name, 'run', 'capture.json');
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function buildPack(prov) {
  const videos = [];
  for (const name of ORBIT_NAMES) {
    const mp4 = encodeOrbit(name);
    // PROOF 4 — encode reproducibility: the same frames + the same tool encode
    // to the same bytes.  Without it a sha256 only says "these bytes existed".
    let repro = null;
    if (!NO_REPRO) {
      const twin = encodeOrbit(name, '.repro');
      repro = sha256File(twin) === sha256File(mp4);
      fs.rmSync(twin, { force: true });
      if (!repro) {
        throw new Error(`[encode] ${name}: NOT byte-reproducible — two encodes `
          + 'of identical frames differ; the sha256 claims below would be '
          + 'unfalsifiable');
      }
    }
    const fm = frameMd5(mp4);
    const pb = playbackProof(mp4);
    const spec = ORBITS[name];
    videos.push({
      orbit: name,
      file: path.basename(mp4),
      sha256: sha256File(mp4),
      bytes: fs.statSync(mp4).size,
      card_png_sha256: sha256File(path.join(PACK, name, 'card.png')),
      card_frames: CARD_FRAMES,
      body_frames: spec.run,
      duration_s: Number(((CARD_FRAMES + spec.run) / FPS).toFixed(3)),
      geometry: { center: spec.center, r: spec.r, h: spec.h, fov: spec.fov },
      body_capture: bodyCapture(name),
      register_alignment: verifyRegisterAlignment(name),
      encode_reproducible: repro,
      ...fm, ...pb,
      card_disclosure_line: cardLineFor(name),
    });
    // Keep the measured bearings as stills for the look loop, ALWAYS: they are
    // part of the deliverable, not a consolation prize for pruning.  --keep-runs
    // only decides whether the other ~1150 frames survive alongside them.
    {
      const spec2 = ORBITS[name];
      const keep = new Set();
      const al = verifyRegisterAlignment(name);
      if (al) al.map.forEach((m) => keep.add(m.video_frame));
      else for (let i = 0; i < spec2.run; i += spec2.run / 24) keep.add(i);
      const bdir = path.join(PACK, name, 'bearings');
      fs.mkdirSync(bdir, { recursive: true });
      for (const i of keep) {
        const f = `v${String(i).padStart(4, '0')}.png`;
        fs.copyFileSync(path.join(PACK, name, 'run', f), path.join(bdir, f));
      }
      if (!KEEP_RUNS) {
        fs.rmSync(path.join(PACK, name, 'run'), { recursive: true, force: true });
      }
    }
    console.log(`[pack] ${name}: ${path.basename(mp4)} `
      + `${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB, `
      + `${pb.decoded_frames} frames decoded, repro=${repro}`);
  }
  const annex = buildAnnex();
  const manifest = { pack: 'gh488p-a5-final-orbits', wave: WAVE,
    generated_utc: new Date().toISOString(), provenance: prov,
    videos, annex, ledger: LEDGER };
  fs.writeFileSync(path.join(PACK, 'provenance.json'),
    `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(PACK, 'INDEX.md'), indexMd(manifest));
  console.log(`[pack] wrote ${path.join(PACK, 'provenance.json')} and INDEX.md`);
  return manifest;
}

function indexMd(m) {
  const p = m.provenance;
  const L = [];
  L.push(`# GH-488P wave ${WAVE} — Predator Apex 9 ft, final orbit videos\n`);
  L.push('Body frames captured by `tools/render/orbitsweep-488p.mjs --sweep`; title');
  L.push('cards may be re-cut afterwards with `--cards-only`, which re-encodes from the');
  L.push('same `run/` PNGs and therefore leaves every `body_framemd5_sha256` below');
  L.push('unchanged — that is what makes a card correction checkable rather than a');
  L.push('re-render you have to take on trust.');
  L.push('**TWO HEADS, and the table below prints the card one.** After a `--cards-only`');
  L.push('re-cut the `tree sha` row is the head THIS CUT was made at; the body frames');
  L.push('came from whatever head their `--sweep` ran at. Those are the same commit');
  L.push('until the first card correction and can differ after it, so each video below');
  L.push('carries its own `body frames captured at` cell, read from a sidecar the sweep');
  L.push('writes beside the pixels. A pack cut before that sidecar existed reads');
  L.push('UNRECORDED, which is the honest answer and not an inferred one.');
  L.push('Every claim below is re-runnable against this pack\'s own bytes:');
  L.push('`node tools/render/orbitsweep-488p.mjs --verify --out <this dir>`.\n');
  L.push('## Byte-bound provenance\n');
  L.push('| field | value |');
  L.push('|---|---|');
  const rows = [
    ['tree sha of THIS CUT (house naming = `git rev-parse HEAD`, a COMMIT)',
      p.tree_sha_house],
    ['git tree object', p.git_tree_object],
    ['web tree object (`HEAD:web`)', p.web_tree_object],
    ['working tree dirty at capture', String(p.tree_dirty)],
    ['branch', p.branch],
    ['mesh geometry sha256 — `sha256(JSON.stringify({ROI, meshes}))`, capture block excluded',
      `${p.mesh_geometry_sha256} (${p.mesh_count} meshes under \`obTable\`)`],
    ['geometry unchanged since the wave-N seal', String(p.geometry_unchanged_since_wave_n)],
    ['geometry supersession', p.geometry_supersession],
    ['mesh dump sha256 (the file the standing gates judged, capture block included)', p.mesh_dump_sha256],
    ['canonical geometry sha256', p.canonical_geometry_sha256],
    ['kernel wasm sha256', `${p.kernel_wasm_sha256} (${p.kernel_wasm_bytes} bytes)`],
    ['core bytes unchanged vs `main` (`crates/`, `sdk/`)', String(p.core_bytes_unchanged_vs_main)],
    ['chrome-headless-shell pin', p.chrome_shell_pin],
    ['ffmpeg', p.ffmpeg],
    ['encoder', `\`${p.encoder}\``],
    ['raster / fps / card', `${p.raster} · ${p.fps} fps · ${p.card_frames}-frame title card`],
    ['rig', p.rig],
    ['capture reproducible (a fresh sweep reproduces these bytes)',
      String(p.capture_reproducible)],
    ['tool sha256', p.tool_sha256],
  ];
  for (const [k, v] of rows) L.push(`| ${k} | \`${v}\` |`);
  // The capture-reproducibility verdict is the one row a reader is most likely
  // to over-read, so it gets its measurement in full rather than a table cell.
  L.push(`\n**On \`capture reproducible\`.** ${p.capture_reproducibility_note}`);
  L.push('\n## Videos\n');
  L.push('| file | sha256 | frames | duration | measured bearings in frame '
    + '| body frames captured at |');
  L.push('|---|---|---|---|---|---|');
  for (const v of m.videos) {
    const al = v.register_alignment;
    L.push(`| \`${v.file}\` | \`${v.sha256.slice(0, 16)}…\` | `
      + `${v.decoded_frames} (${v.card_frames} card + ${v.body_frames} orbit) | `
      + `${v.duration_s} s | ${al ? `${al.count}/${al.count} at every ${al.step} frames` : 'n/a (no measurement register)'} | `
      + `${v.body_capture
        ? `\`${v.body_capture.captured_at_head}\``
        : 'UNRECORDED — this pack predates the run sidecar'} |`);
  }
  L.push('\n### Proof state per video\n');
  L.push('| file | encode reproducible | decode errors | body framemd5 sha256 |');
  L.push('|---|---|---|---|');
  for (const v of m.videos) {
    L.push(`| \`${v.file}\` | ${v.encode_reproducible === null ? 'not run' : String(v.encode_reproducible)}`
      + ` | ${v.decode_errors} | \`${v.body_framemd5_sha256.slice(0, 16)}…\` |`);
  }
  L.push('\n### Title-card disclosure lines, transcribed verbatim\n');
  for (const v of m.videos) {
    L.push(`**\`${v.file}\`** — ${v.card_disclosure_line}\n`);
  }
  L.push('## A4 solved-pose crop annex\n');
  L.push('Row **NEW-A5a** below keeps the wave M/N pocket-interior rebuild on these');
  L.push('crops rather than on the orbit videos — NARROWED in wave A5-R4, and narrowed');
  L.push('to a different reason than it was first written with. Through A5-R3 the reason');
  L.push('was brightness: at 8 bits the delivered raster did not carry the information.');
  L.push('The venue ambient ended that, so the reason is now RESOLUTION and it holds for');
  L.push('the WIDE orbit only, which images the pocket 5-11x coarser than these crops.');
  L.push('The two close-ups resolve the pocket as well as or better than the annex does');
  L.push('(1.03x and 0.89x) and are evaluable on their own; what these files still');
  L.push('uniquely supply is a static, magnified, annotated crop at a pose registered to');
  L.push('the photograph, supporting a side-by-side an orbiting camera cannot.');
  L.push('They are shot at the same frozen rig and');
  L.push('the same sealed head as the orbits, and they are sha256-bound here for the same');
  L.push('reason the videos are: an acceptance surface a reader cannot open and check is');
  L.push('not an acceptance surface.\n');
  L.push(`**Crop convention.** ${m.annex.crops.convention}. Measured bore radius `
    + `${m.annex.crops.bore_render_px.bore_r_px.toFixed(1)} px at `
    + `(${m.annex.crops.bore_render_px.bore_x.toFixed(1)}, `
    + `${m.annex.crops.bore_render_px.bore_y.toFixed(1)}) in the `
    + `${m.annex.capture.width}x${m.annex.capture.height} frame.\n`);
  L.push(`**Pair convention.** ${m.annex.pair.convention}\n`);
  L.push(`**What the rings are NOT.** ${m.annex.pair.not_a_measurement}\n`);
  L.push(`**Why the threshold is admissible.** ${m.annex.pair.threshold_is_a_plateau}\n`);
  L.push('**The reference photograph is not redistributed.** '
    + `\`${m.annex.pair.photo_licence}\`; pinned by sha256 `
    + `\`${m.annex.pair.photo_source_sha256}\`.\n`);
  L.push('| file | sha256 |');
  L.push('|---|---|');
  for (const [rel, sha] of Object.entries(m.annex.files)) {
    L.push(`| \`annex/${rel}\` | \`${sha.slice(0, 16)}…\` |`);
  }
  L.push('');
  L.push('## §ledger — THE ONE RESIDUAL LEDGER\n');
  L.push('One ledger for this delivery (Iron Law 11). Every card line above is a');
  L.push('transcription of a row below; no surface may carry a residual this table');
  L.push('does not. Disclosure lines are measurements, never adjectives.\n');
  L.push('| id | item | class | measured disclosure | visible in |');
  L.push('|---|---|---|---|---|');
  for (const r of LEDGER) {
    L.push(`| **${r.id}** | ${r.item} | ${r.cls} | ${r.disclosure} | `
      + `${r.orbits.length ? r.orbits.join(', ') : '— (pack-wide, not a frame feature)'} |`);
  }
  L.push('');
  return `${L.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// --verify: every claim re-runnable against the pack's own bytes
// ---------------------------------------------------------------------------
function verifyPack(root, { quiet = false } = {}) {
  const man = JSON.parse(fs.readFileSync(path.join(root, 'provenance.json'), 'utf8'));
  const errs = [];
  const say = (s) => { if (!quiet) console.log(s); };
  for (const v of man.videos) {
    // FIRST, before any byte check: the line a viewer actually sees must still
    // be the line the one ledger generates.  This check runs before the file
    // existence test on purpose — a missing video must not let a falsified
    // disclosure past on a `continue`.
    if (v.card_disclosure_line !== cardLineFor(v.orbit)) {
      errs.push(`DISCLOSURE-DRIFT ${v.orbit}: the pack's card line no longer `
        + 'matches the ledger this tool carries');
    }
    const mp4 = path.join(root, v.orbit, v.file);
    if (!fs.existsSync(mp4)) { errs.push(`MISSING-VIDEO ${v.file}`); continue; }
    if (sha256File(mp4) !== v.sha256) errs.push(`SHA-MISMATCH ${v.file}`);
    if (fs.statSync(mp4).size !== v.bytes) errs.push(`SIZE-MISMATCH ${v.file}`);
    const card = path.join(root, v.orbit, 'card.png');
    if (!fs.existsSync(card)) errs.push(`MISSING-CARD ${v.orbit}`);
    else if (sha256File(card) !== v.card_png_sha256) errs.push(`CARD-SHA-MISMATCH ${v.orbit}`);
    try {
      const fm = frameMd5(mp4);
      if (fm.body_framemd5_sha256 !== v.body_framemd5_sha256) {
        errs.push(`BODY-FRAMEMD5-MISMATCH ${v.file}`);
      }
      if (fm.frames !== v.decoded_frames) errs.push(`FRAMECOUNT-MISMATCH ${v.file}`);
      const pb = playbackProof(mp4);
      if (pb.decoded_frames !== v.decoded_frames) errs.push(`DECODE-COUNT-MISMATCH ${v.file}`);
    } catch (e) { errs.push(`DECODE-FAILED ${v.file}: ${e.message}`); }
    say(`  ${v.file}: sha OK, ${v.decoded_frames} frames decoded, body framemd5 OK`);
  }
  // The annex is an acceptance surface, so it gets the same treatment as the
  // videos: every delivered byte re-hashed against the recorded claim.  A
  // MISSING annex is an error and not a skip — NEW-A5a points at these files.
  if (!man.annex) {
    errs.push('ANNEX-MISSING: the manifest records no annex, but the NEW-A5a '
      + 'row accepts the pocket rebuild on annex files');
  } else {
    for (const [rel, sha] of Object.entries(man.annex.files)) {
      const f = path.join(root, 'annex', rel);
      if (!fs.existsSync(f)) errs.push(`ANNEX-MISSING-FILE annex/${rel}`);
      else if (sha256File(f) !== sha) errs.push(`ANNEX-SHA-MISMATCH annex/${rel}`);
    }
    if (man.annex.pair.photo_source_sha256 !== POCKET_CLOSEUP_SHA256) {
      errs.push('ANNEX-PHOTO-DRIFT: the pair was built against a different '
        + 'file than the pinned pocket-cushion closeup');
    }
  }
  // the index must agree with the manifest, line by line
  const idx = fs.readFileSync(path.join(root, 'INDEX.md'), 'utf8');
  if (man.annex && !idx.includes(man.annex.pair.not_a_measurement)) {
    errs.push('INDEX-ANNEX-MISSING: INDEX.md does not carry the annex\'s '
      + '"not a measurement" limit, so a reader could take the locator rings '
      + 'for a dimension read off an oblique photograph');
  }
  for (const v of man.videos) {
    if (!idx.includes(v.card_disclosure_line)) {
      errs.push(`INDEX-DISAGREES ${v.orbit}: INDEX.md does not carry the card line`);
    }
  }
  for (const r of LEDGER) {
    if (!idx.includes(r.disclosure)) errs.push(`INDEX-LEDGER-MISSING ${r.id}`);
  }
  return errs;
}

// ---------------------------------------------------------------------------
// --red-arm: fire every proof on defective bytes (Iron Law 6)
// ---------------------------------------------------------------------------
function redArm() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ob488p-a5-red-'));
  const cases = [];
  const fire = (id, why, fn) => {
    let fired = false; let detail = '';
    try { fn(); } catch (e) { fired = true; detail = e.message.split('\n')[0]; }
    cases.push({ id, why, fired, detail });
    console.log(`  ${fired ? 'RED ' : 'SILENT'}  ${id}  ${fired ? detail.slice(0, 110) : '<-- DID NOT FIRE'}`);
  };
  // a 3-frame synthetic orbit, encoded through the real path
  const mk = (dir, colors) => {
    fs.mkdirSync(dir, { recursive: true });
    colors.forEach((c, i) => {
      ff(['-f', 'lavfi', '-i', `color=c=${c}:s=64x48:d=1:r=30`, '-frames:v', '1',
        path.join(dir, `t${String(i).padStart(5, '0')}.png`)]);
    });
    const out = path.join(dir, 'clip.mp4');
    ff(['-framerate', '30', '-i', path.join(dir, 't%05d.png'), '-vf', VF,
      ...X264, ...REPRO, '-movflags', '+faststart', out]);
    return out;
  };
  const colors = (n, tint) => Array.from({ length: n },
    (_, i) => `0x${((i * 7 + tint) % 256).toString(16).padStart(2, '0')}2030`);

  // 1. sha256-bound verdict fires on a mutated delivered byte
  fire('red-sha-drift',
    'a delivered mp4 whose bytes changed after the verdict must fail the pack',
    () => {
      const a = mk(path.join(scratch, 'sha'), colors(CARD_FRAMES + 6, 0));
      const want = sha256File(a);
      const buf = fs.readFileSync(a); buf[buf.length - 17] ^= 0xff;
      fs.writeFileSync(a, buf);
      if (sha256File(a) !== want) throw new Error('sha256 differs after mutation');
    });

  // 2. framemd5 body identity: a CARD-only re-cut must PASS, a BODY edit must FAIL
  fire('red-framemd5-body-edit',
    'a re-cut that changes one ORBIT frame must not pass as a card-only re-cut',
    () => {
      const base = colors(CARD_FRAMES + 6, 0);
      const a = mk(path.join(scratch, 'fm-a'), base);
      const cardOnly = [...base];
      for (let k = 0; k < CARD_FRAMES; k++) cardOnly[k] = '0x101418';
      const b = mk(path.join(scratch, 'fm-b'), cardOnly);
      const bodyEdit = [...base]; bodyEdit[CARD_FRAMES + 3] = '0xff00ff';
      const c = mk(path.join(scratch, 'fm-c'), bodyEdit);
      const A = frameMd5(a).body_framemd5_sha256;
      const B = frameMd5(b).body_framemd5_sha256;
      const C = frameMd5(c).body_framemd5_sha256;
      if (A !== B) {
        throw new Error('CARD-ONLY RE-CUT WAS NOT BODY-IDENTICAL — the mechanism '
          + 'cannot support a card re-cut claim');
      }
      if (A === C) return; // silent: a body edit slipped through
      throw new Error('body edit detected (A!==C) and card re-cut proven identical (A===B)');
    });

  // 3. full-decode playback proof fires on a truncated file
  fire('red-decode-truncated',
    'a truncated deliverable must fail the playback proof, not merely play short',
    () => {
      const a = mk(path.join(scratch, 'dec'), colors(CARD_FRAMES + 30, 3));
      const buf = fs.readFileSync(a);
      fs.writeFileSync(a, buf.subarray(0, Math.floor(buf.length * 0.55)));
      playbackProof(a);
    });

  // 4. truncated / non-contiguous run refuses to encode
  fire('red-run-truncated',
    'a partial orbit must never encode into a plausible-looking video',
    () => {
      const d = path.join(scratch, 'runchk', 'corner');
      fs.mkdirSync(path.join(d, 'run'), { recursive: true });
      fs.writeFileSync(path.join(d, 'card.png'), 'x');
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(path.join(d, 'run', `v${String(i).padStart(4, '0')}.png`), 'x');
      }
      const saved = PACK; PACK = path.join(scratch, 'runchk');
      try { encodeOrbit('corner'); } finally { PACK = saved; }
    });

  // 5. a video with no card refuses to ship
  fire('red-no-card',
    'an undisclosed video (no title card) must never enter the pack',
    () => {
      const d = path.join(scratch, 'nocard', 'corner');
      fs.mkdirSync(path.join(d, 'run'), { recursive: true });
      for (let i = 0; i < ORBITS.corner.run; i++) {
        fs.writeFileSync(path.join(d, 'run', `v${String(i).padStart(4, '0')}.png`), 'x');
      }
      const saved = PACK; PACK = path.join(scratch, 'nocard');
      try { encodeOrbit('corner'); } finally { PACK = saved; }
    });

  // 6. a measured bearing that does not land on a video frame refuses
  fire('red-register-off-grid',
    'a video that does not contain every measured bearing must refuse, not round',
    () => {
      const saved = ORBITS.corner.run;
      ORBITS.corner.run = 350; // 350 / 24 is not an integer
      try { verifyRegisterAlignment('corner'); } finally { ORBITS.corner.run = saved; }
    });

  // 7. a phase-shifted orbit refuses even when the frame count divides
  fire('red-register-phase-shift',
    'a run whose PHASE drifts off the registers must refuse even at the right count',
    () => {
      const saved = ORBITS.corner.az0;
      ORBITS.corner.az0 = 0.01;
      try { verifyRegisterAlignment('corner'); } finally { ORBITS.corner.az0 = saved; }
    });

  // 7b. a camera station that walks the table out of frame must refuse.  This is
  // the case that caught the author: the first fulltable draft (r 2.90, look_z
  // -0.10) passed a 4-pose cardinal smoke set and clipped the near apron at the
  // diagonals, where the cardinals cannot see.
  fire('red-framing-clip',
    'a station that runs the table off the frame edge must refuse before capture',
    () => {
      const s = ORBITS.fulltable;
      const saved = { r: s.r, h: s.h, center: s.center, m: s.hullMargin };
      s.r = 2.90; s.h = 1.35; s.center = [0.0, 0.0, -0.10]; s.hullMargin = undefined;
      // hullMargin cleared so the DECLARED-margin check cannot be what fires:
      // this case must prove the FLOOR fires, not the drift tripwire.
      s.hullMargin = -0.2470;
      try { verifyFraming('fulltable', meshVertices()); } finally { Object.assign(s, { r: saved.r, h: saved.h, center: saved.center, hullMargin: saved.m }); }
    });

  // 7c. the declared margin is a pin, not a comment: geometry drift must fire
  fire('red-framing-margin-drift',
    'a station that still fits but no longer matches its declared margin must refuse',
    () => {
      const s = ORBITS.fulltable;
      const saved = s.hullMargin;
      s.hullMargin = 0.0800; // declared != measured 0.0746
      try { verifyFraming('fulltable', meshVertices()); } finally { s.hullMargin = saved; }
    });

  // 8. disclosure drift: a card line that stops matching the ledger fails verify
  fire('red-disclosure-drift',
    'a card whose wording no longer matches the one ledger must fail the pack',
    () => {
      const root = path.join(scratch, 'drift');
      fs.mkdirSync(path.join(root, 'corner'), { recursive: true });
      const man = { videos: [{ orbit: 'corner', file: 'x.mp4', sha256: '0'.repeat(64),
        bytes: 0, card_png_sha256: '0'.repeat(64), decoded_frames: 0,
        body_framemd5_sha256: '0'.repeat(64),
        card_disclosure_line: 'IN-FRAME RESIDUALS: none, everything is perfect' }] };
      fs.writeFileSync(path.join(root, 'provenance.json'), JSON.stringify(man));
      fs.writeFileSync(path.join(root, 'INDEX.md'), '# empty');
      const errs = verifyPack(root, { quiet: true });
      if (errs.some((e) => e.startsWith('DISCLOSURE-DRIFT'))) {
        throw new Error(`verify fired: ${errs.filter((e) => e.startsWith('DISCLOSURE-DRIFT'))[0]}`);
      }
    });

  // 9. encode reproducibility: an unpinned encode (version strings retained)
  //    must NOT be assumed byte-stable — prove the repro flags are what make it so
  fire('red-repro-is-not-free',
    'the byte-reproducibility claim must come from the pinned flags, not from luck',
    () => {
      const d = path.join(scratch, 'repro');
      fs.mkdirSync(d, { recursive: true });
      for (let i = 0; i < 6; i++) {
        ff(['-f', 'lavfi', '-i', `color=c=0x${(i * 17).toString(16).padStart(2, '0')}1020:s=64x48:d=1:r=30`,
          '-frames:v', '1', path.join(d, `t${String(i).padStart(5, '0')}.png`)]);
      }
      const enc = (o, extra) => ff(['-framerate', '30', '-i', path.join(d, 't%05d.png'),
        '-vf', VF, ...X264, ...extra, '-movflags', '+faststart', o]);
      const a = path.join(d, 'a.mp4'); const b = path.join(d, 'b.mp4');
      enc(a, REPRO); enc(b, REPRO);
      if (sha256File(a) !== sha256File(b)) {
        throw new Error('PINNED FLAGS ARE NOT REPRODUCIBLE — the sha256 claims '
          + 'in this pack would be unfalsifiable');
      }
      const c = path.join(d, 'c.mp4');
      enc(c, []); // no repro flags: metadata + version strings ride along
      if (sha256File(c) === sha256File(a)) {
        return; // silent: the flags made no difference on this ffmpeg
      }
      throw new Error('repro flags proven load-bearing (unpinned encode differs)');
    });

  // 10-12. the annex is an ACCEPTANCE SURFACE, so its byte binding has to be
  // as hard as the videos'.  These three cases exist because the failure they
  // guard against is the one A5-R2 actually shipped: a disclosure row that
  // named evidence the pack did not contain.
  const annexPack = (mutate) => {
    const root = fs.mkdtempSync(path.join(scratch, 'annex-'));
    const dir = path.join(root, 'annex');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a4-puck-zoom.png'), 'puck-bytes');
    const notMeas = 'no dimension is read back from these rings';
    const man = {
      videos: [],
      annex: {
        files: { 'a4-puck-zoom.png': sha256File(path.join(dir, 'a4-puck-zoom.png')) },
        pair: { not_a_measurement: notMeas,
          photo_source_sha256: POCKET_CLOSEUP_SHA256 },
      },
    };
    mutate(root, dir, man);
    fs.writeFileSync(path.join(root, 'provenance.json'), JSON.stringify(man));
    fs.writeFileSync(path.join(root, 'INDEX.md'), `# index\n${notMeas}\n`);
    return verifyPack(root, { quiet: true });
  };
  fire('red-annex-byte-drift',
    'an annex crop edited after the verdict must fail the pack, like a video',
    () => {
      const errs = annexPack((root, dir) => {
        fs.writeFileSync(path.join(dir, 'a4-puck-zoom.png'), 'puck-bytes-EDITED');
      });
      const hit = errs.filter((e) => e.startsWith('ANNEX-SHA-MISMATCH'));
      if (hit.length) throw new Error(`verify fired: ${hit[0]}`);
    });
  fire('red-annex-absent',
    'a pack with no annex must fail: NEW-A5a accepts the pocket rebuild on it',
    () => {
      const errs = annexPack((root, dir, man) => { delete man.annex; });
      const hit = errs.filter((e) => e.startsWith('ANNEX-MISSING'));
      if (hit.length) throw new Error(`verify fired: ${hit[0]}`);
    });
  fire('red-annex-photo-swap',
    'a pair built against a different reference than the pinned anchor must fail',
    () => {
      const errs = annexPack((root, dir, man) => {
        man.annex.pair.photo_source_sha256 = 'f'.repeat(64);
      });
      const hit = errs.filter((e) => e.startsWith('ANNEX-PHOTO-DRIFT'));
      if (hit.length) throw new Error(`verify fired: ${hit[0]}`);
    });

  fire('red-annex-purpose-drift',
    'an annex purpose line that stops agreeing with its ledger row must not '
    + 'survive a card re-cut, the way one did through A5-R3 and A5-R4',
    () => {
      const stale = { purpose: 'accepted on these crops and NOT on the '
        + 'delivered wide orbit, which does not carry the information at 8 bits' };
      const r = reconcileAnnexPurpose(stale);
      if (!r.changed) throw new Error('reconcile did not notice a stale purpose');
      if (stale.purpose !== ANNEX_PURPOSE) {
        throw new Error('reconcile noticed but did not re-derive');
      }
      const fresh = { purpose: ANNEX_PURPOSE };
      if (reconcileAnnexPurpose(fresh).changed) {
        throw new Error('reconcile reports drift on an already-current purpose');
      }
      throw new Error('re-bind fired: stale purpose re-derived, current one left '
        + 'alone');
    });

  fs.rmSync(scratch, { recursive: true, force: true });
  const silent = cases.filter((c) => !c.fired);
  console.log(`\nRED-ARM: ${cases.length - silent.length}/${cases.length} fired, `
    + `${silent.length} silent`);
  return { cases, silent };
}

// ---------------------------------------------------------------------------
// The sealed geometry, pinned.  This is the number that makes the Stage-11
// "sealed videos are proof of shipped geometry" claim checkable later: if
// merged main dumps to this digest, these videos describe main.
//
// SUPERSESSION, stated rather than performed silently.  Wave N sealed
// 6236f5f489c153a5…, and the wave-A5 pack shipped claiming zero render-byte
// drift against it.  Wave A5-R2 MOVES it, because it adds a fixture: the
// integrated leg LED (ledger row M-W17).  The move is disclosed with its exact
// diff rather than as a bare new number, so the earlier claim is superseded on
// the record instead of contradicted in silence.  Dumped at both heads and
// compared record by record, the difference is EXACTLY:
//
//     obPdtLedCover   1 -> 0      (the r1 apron-underside channel, removed)
//     obPdtLedPanel   0 -> 8      (two emissive skins on each leg)
//     mesh count     92 -> 99,  triangle count unchanged elsewhere
//
// and every other mesh record — name, material colour, world box, triangle
// count — is byte-identical.  So A5's zero-drift claim remains true of
// everything it was made about; what changed is that the model now has a part
// it did not have.  The wave-N identity is kept below as a historical pin so
// that supersession stays checkable from the pack's own bytes.
const GEOMETRY_IDENTITY_WAVE_N
  = '6236f5f489c153a59389f1a3a57c360727e6b428ae3cbcfac0f5a00f5248b5a0';
const GEOMETRY_IDENTITY
  = '2a1b66cfb8f0f7d6864871ca7f0a6acd55f7ad63ce1d5f24b6aacccb6aa3a213';
const GEOMETRY_SUPERSESSION = 'wave A5-R2 supersedes the wave-N geometry '
  + 'identity 6236f5f489c153a5… with 2a1b66cfb8f0f7d6…; the difference is '
  + 'exactly obPdtLedCover 1->0 and obPdtLedPanel 0->8 (mesh count 92->99, '
  + 'ledger row M-W17), with every other mesh record byte-identical.';

function meshDumpSha() {
  // the geometry digest that binds these pixels to a mesh state; produced by
  // the standing fullview gate, not by this tool
  const dump = DUMP;
  if (!fs.existsSync(dump)) {
    throw new Error(`--dump ${dump} not found: run `
      + '`node tools/render/fullview-overlay-488p.mjs --judge --no-png '
      + `--save-dump ${dump}\` at the sealed head first`);
  }
  const j = JSON.parse(fs.readFileSync(dump, 'utf8'));
  if (j.capture?.tree_dirty) {
    throw new Error(`${dump} was captured on a DIRTY tree — a provenance stamp `
      + 'taken over uncommitted bytes launders them');
  }
  // TWO digests, because they answer different questions and conflating them
  // would let a timestamp masquerade as a geometry change:
  //   mesh_dump_sha256      — the file the standing gates judged (--from-dump
  //                           re-hashes exactly these bytes), capture block
  //                           included, so it moves whenever the dump is retaken
  //   mesh_geometry_sha256  — sha256(JSON.stringify({ROI, meshes})), the same
  //                           bytes MINUS the capture block: the stable
  //                           geometry identity, invariant across re-dumps
  const geo = sha256Buf(Buffer.from(JSON.stringify({ ROI: j.ROI, meshes: j.meshes })));
  if (geo !== GEOMETRY_IDENTITY) {
    throw new Error(`geometry digest ${geo.slice(0, 16)}… does not match the `
      + `sealed identity ${GEOMETRY_IDENTITY.slice(0, 16)}… — the mesh moved `
      + 'since the seal, so this pack would ship pixels the ledger was not '
      + 'written against');
  }
  return { sha: sha256File(dump), geo, meshes: j.meshes.length,
    capture: j.capture, dump };
}

async function main() {
  if (MODE === 'red-arm') {
    const r = redArm();
    process.exit(r.silent.length ? 4 : 0);
  }
  if (MODE === 'verify') {
    console.log(`[verify] ${OUT}`);
    const errs = verifyPack(OUT);
    if (errs.length) {
      console.error(`\nVERIFY RED (${errs.length}):`);
      for (const e of errs) console.error(`  ${e}`);
      process.exit(3);
    }
    console.log('\nVERIFY GREEN — every recorded claim re-ran against the pack bytes');
    return;
  }

  if (MODE === 'verify-framing') {
    const V = meshVertices();
    for (const n of ORBIT_NAMES) {
      const f = verifyFraming(n, V);
      console.log(f
        ? `[framing] ${n}: GREEN  min margin ${f.min_margin_half_frame} of the `
          + `half-frame (${f.min_margin_px.x} px x, ${f.min_margin_px.y} px y) at `
          + `frame ${f.worst_frame}/${f.frames}, ${f.vertices} vertices`
        : `[framing] ${n}: skipped — a detail orbit is meant to crop into the pocket`);
    }
    return;
  }

  const md = meshDumpSha();
  const prov = provenance();
  prov.mesh_dump = md.dump;
  prov.mesh_dump_sha256 = md.sha;
  prov.mesh_geometry_sha256 = md.geo;
  prov.mesh_count = md.meshes;
  prov.geometry_identity = GEOMETRY_IDENTITY;
  prov.geometry_identity_wave_n = GEOMETRY_IDENTITY_WAVE_N;
  prov.geometry_unchanged_since_wave_n = md.geo === GEOMETRY_IDENTITY_WAVE_N;
  prov.geometry_supersession = GEOMETRY_SUPERSESSION;
  prov.mesh_dump_capture = md.capture;
  // Stated here rather than left to be inferred from `encode_reproducible`,
  // which is a claim about the ENCODER only: identical frames encode to
  // identical bytes, and that is all it says.  Capture is a separate question
  // and it has a separate, weaker answer.  Wave A5 ran three full sweeps;
  // sweeps 1 and 3 produced BIT-IDENTICAL body frames in all three orbits at
  // two different tree heads, sweep 2 between them did not.  So capture is
  // reproducible but not guaranteed, and a single matching pair is not proof.
  prov.capture_reproducible = 'reproduced-2-of-3';
  prov.capture_reproducibility_note = 'Sweeps 1 and 3 of wave A5 gave identical '
    + 'body framemd5 in all three orbits (a5d0ad1d.. / 4ba63853.. / cc23a3b6..) '
    + 'at tree heads 61d7b30a and 8d2f58d2 — which also proves the tool commits '
    + 'between them touched cards and provenance only. Sweep 2 (bff806e6) did '
    + 'NOT reproduce: 30-69% of body pixels differ, mean |delta| 0.40-1.32 of '
    + '255, p99.9 4-10, max 46 at one antialiased high-contrast edge; every '
    + 'region median was unchanged, so it is amplitude noise, not structural '
    + 'drift. CAUSE NOT IDENTIFIED. The capture loop takes exactly two '
    + 'requestAnimationFrames after posing and asserts nothing about '
    + 'convergence, which is the likeliest place for a load-dependent '
    + 'difference to enter, but that is an untested hypothesis and is labelled '
    + 'as one. Consequence for reading this pack: quantile and region-median '
    + 'statistics reproduce; a pixel count at a hard code threshold does not, '
    + 'and NEW-A5a quotes an envelope for exactly that reason.';
  prov.date = new Date().toISOString().slice(0, 10);
  if (prov.tree_dirty) {
    throw new Error('working tree is DIRTY — A5 renders at the SEALED head. '
      + 'A title card that stamps a commit while shipping uncommitted pixels is '
      + 'a false provenance claim.');
  }
  if (md.capture.tree_head !== prov.git_commit) {
    throw new Error(`mesh dump was captured at ${md.capture.tree_head} but HEAD `
      + `is ${prov.git_commit} — the geometry digest would not describe these pixels`);
  }
  for (const n of ORBIT_NAMES) verifyRegisterAlignment(n);
  // fail-closed BEFORE capture: 480 frames of a clipped table is 480 wasted frames
  const verts = meshVertices();
  prov.framing = {};
  for (const n of ORBIT_NAMES) {
    const f = verifyFraming(n, verts);
    if (f) prov.framing[n] = f;
  }

  fs.mkdirSync(OUT, { recursive: true });
  await withChrome(async (chrome) => {
    if (MODE === 'sweep') await captureRuns(chrome, prov);
    await captureCards(chrome, prov);
  });
  const man = buildPack(prov);
  const errs = verifyPack(OUT);
  if (errs.length) {
    console.error(`\nSELF-VERIFY RED (${errs.length}):`);
    for (const e of errs) console.error(`  ${e}`);
    process.exit(3);
  }
  console.log(`\nA5 PACK GREEN — ${man.videos.length} videos at ${OUT}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
