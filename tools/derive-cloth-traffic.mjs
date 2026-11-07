// Copyright (c) Meta Platforms, Inc. and affiliates.

// derive-cloth-traffic.mjs — GH-542 derivation + drift gate for the SPATIAL
// cloth-condition field shipped as web/assets/cloth/traffic_128x256.png
// (+ traffic.json).  Run:  node tools/derive-cloth-traffic.mjs [--write]
// Without --write it re-derives and GATES the committed artifact (exits
// non-zero on any drift); with --write it re-emits it.  Two extra flags:
// --gate-overlay re-derives a second time with the WPA 3.5 overlay off and
// checks the field against the overlay's own "changed the 9 on N shots"
// counter (see THE ONE OVERLAY); --no-overlay is that second derivation, and
// prints its sha instead of gating anything.
//
// WHY THIS EXISTS
// The R1a condition layer (web/scene/clothvisuals.js) shifts the whole bed by
// one bed-average amount.  The visual audit rejected that as "not a weak
// version of wear, a different thing": real played-on cloth is dirty and
// abraded WHERE IT HAS BEEN PLAYED ON, and a uniform veil reads as a tinted
// cloth rather than a used one.  The field below supplies the missing
// spatial structure WITHOUT authoring it: it is integrated from the shipped
// canonical wasm kernel driving rules-legal 9-ball, so the shape of the
// worn areas is an output of the same physics the game already runs.
//
// THE TWO MECHANISMS (separate fields, separate laws)
//
//  1. ABRASION — Archard's wear law (J. F. Archard, "Contact and Rubbing of
//     Flat Surfaces", J. Appl. Phys. 24(8):981-988, 1953): removed volume
//     V = K·W·s/H, i.e. for a fixed normal load W and counterface, wear is
//     proportional to the SLIDING DISTANCE s at the interface.  Every ball
//     presses the same weight W = m·g onto the cloth, so the areal wear dose
//     is simply the slip-path density
//         D_abr(x,y) = (1/A) Σ_shots ∫ |u(t)| dt   over contacts in the cell
//     with u the contact-point slip velocity, u = v − R (ω × ẑ), i.e.
//         u = ( v_x − R ω_y , v_y + R ω_x ).
//     A ball in the kernel's Rolling state has u ≡ 0 by construction, so
//     pure rolling contributes NO abrasion — which is why the derived field
//     concentrates on the break box, the rack and the strike points rather
//     than along every path a ball ever took.  The slide legs are integrated
//     from the kernel's OWN closed form (see `timelines` below), and the run
//     is gated on that form reproducing the kernel's slide→roll transition
//     times to 1e-9 s.
//     Archard is also the law behind the abrasion measurement the sheen legs
//     already cite: Martindale (ISO 12947) counts rubbing cycles, i.e. slip
//     distance, at a fixed load — the same driving variable, so the two ends
//     of the chain are consistent.
//
//  2. DEPOSIT — chalk is carried onto and around the bed by the balls (the
//     tip loads the cue ball at every strike; contact then rubs it off and
//     redistributes it).  The transport dose is therefore the CONTACT-PATH
//     density
//         D_dep(x,y) = (1/A) Σ_shots ∫ |v(t)| dt
//     (rolling counts here — a rolling ball still sweeps the cloth).
//     MODELLED, NOT MEASURED: the split between the cue ball (the primary
//     carrier, it is the ball the tip touches) and the object balls (which
//     mostly redistribute) is not published, so all balls are weighted
//     equally — the neutral choice.  The tool reports the cue-ball-only
//     variant as a sensitivity number in the manifest so the size of that
//     assumption is on the record instead of hand-waved.
//     Airborne settling of chalk dust is spatially uniform and is already
//     carried by the bed-average term in clothvisuals.js; this field only
//     redistributes around that floor.
//
// THE ENSEMBLE (rules-driven, no shot-selection taste)
// Straight 9-ball rack playouts on the shipped canonical wasm:
//   * BREAK — cue ball behind the head string (WPA 3.7), stratified over the
//     full legal width the shipped app enforces and over the cited fullness
//     bracket, with the ICGA execution-error model on aim and tip offset and
//     the speed drawn continuously between the project's two cited break
//     anchors: 10.729 m/s (24 mph, the frozen multibody break benchmark,
//     docs/research/gap-break-multibody.md:35) to 13.41 m/s (30 mph, Dr.
//     Dave's "powerful break = 25-30 mph" as recorded in
//     docs/research/break-cueball-rebound-evidence.md:55).  Every support,
//     every stratum criterion and every realised marginal is published in
//     `manifest.ensemble.break`; the full argument is at the head of the
//     "ensemble size and the break parameter distribution" block below.
//   * PLAY — 9-ball forces the target: the LOWEST-numbered ball on the
//     table.  Pocket = the one giving the smallest cut angle (the shot any
//     player takes when the rules leave the choice open); aim = ghost ball.
//     Speed = the LOWEST rung of a stratified ladder over Dr. Dave's cited
//     shot-speed envelope (1.5-20 mph, TP B.6 rev 12/2023, recorded in
//     docs/research/cushion-slip-sense-data-hunt.md:132) that actually pots
//     the target; if no rung pots it, the top rung is played as a miss —
//     missed shots put traffic on the cloth too.  Because a real player
//     hits harder than the minimum for position, this makes the derived
//     dose a LOWER bound on the true traffic, not a tuned one.
//   * SCRATCH — ball in hand is a player choice the rules do not fix; the
//     cue ball is returned to the head spot, or to the nearest free point of
//     a one-diameter lattice around it when that is occupied.  MODELLED, NOT
//     DERIVED.
//   * THE 9 — adjudicated, because it is the only ball whose fate changes
//     the LAYOUT the rest of the rack is played from.  The adjudication is
//     NOT restated here: every shot is judged by the SHIPPED referee —
//     `judgeShot` from web/dist/pool-sdk/rules/nineball.js, i.e. the
//     `nineball-v1` ruleset in the committed pool-rules wasm, the same
//     verdicts the game itself plays under and the ones its harvested
//     corpus pins.  Spot geometry is the shipped `respotNineSpot` (WPA 1.5
//     search order).  One documented overlay is applied on top: see
//     `RULE_35_OVERLAY`.  The manifest counts every outcome and every foul
//     code the referee emitted, so the ensemble's rule behaviour is on the
//     record as DATA rather than asserted in this comment.
// WHAT THE ENSEMBLE IS NOT: safety play, position play, kick/bank escapes
// and break-and-run pattern choice are all absent.  Their traffic is spread
// broadly over the bed rather than concentrated, so omitting them makes the
// field's contrast an UPPER bound; the bed-average floor in clothvisuals.js
// is what stands in for them.
// Nor is it a MATCH.  Fouls ARE adjudicated — the referee judges every shot
// and the manifest counts every code it emitted — but their TURN consequence
// is deliberately not taken: after a foul the playout shoots again from where
// the cue ball stopped rather than handing ball-in-hand to an opponent, and
// the cue ball is re-placed only when it is physically off the bed (pocketed
// or driven off), which is a necessity, not a rules choice.  That is a player
// practising alone, which is how most of the hours that wear a cloth are
// actually spent, and it is the choice that avoids inventing the deepest
// player judgement there is (where to PUT a ball in hand).  The 9 is the
// exception because its adjudication changes the LAYOUT rather than only
// whose turn it is.
//
// NORMALISATION
// Both fields are emitted PEAK-NORMALISED (max = 1) because their two
// anchors live at different ends:
//   * abrasion is anchored at the PEAK — the Martindale endpoint whose Rp
//     and Rku ratios clothvisuals.js uses is one measured condition, and the
//     honest place to put it is the most-worn point on the bed;
//   * deposit is anchored at the MEAN — the coverage band in
//     r1-cloth-evidence.md §7.2 is a whole-cloth colour-read argument, so
//     the shipped scalar has to remain the bed average.  The runtime
//     therefore needs mean(D_dep) to scale the peak, and that number is
//     mirrored into clothvisuals.js and gated here.
// Linear in dose for both: Archard is linear in s by construction, and the
// abrasion paper measures ONE dose, so any curvature would be unsupported
// interpolation.  Saturation is real (coverage cannot exceed 1) but the
// derived peaks stay far below it — asserted below.
//
// DETERMINISM: no Math.random, no wall-clock; the whole ensemble is a fixed
// stratified sweep, so two runs of the same kernel emit byte-identical PNGs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encodePng } from './render/lib/png.mjs';
// The decoder comes from web/tools because the gate below has to compare the
// committed artifact's PIXELS, and only a decode gets at those. See the
// `pixels_sha256` note at the manifest.
import { decodePng } from '../web/tools/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PNG = path.join(ROOT, 'web/assets/cloth/traffic_128x256.png');
const OUT_JSON = path.join(ROOT, 'web/assets/cloth/traffic.json');
const SOIL_PNG = path.join(ROOT, 'web/assets/table/soil_168x296.png');
const SOIL_JSON = path.join(ROOT, 'web/assets/table/soil.json');
const WRITE = process.argv.includes('--write');

// ---- grid --------------------------------------------------------------
// 128 x 256 over the 1.27 x 2.54 m playing surface = 9.92 mm cells, ~1/6 of
// a ball diameter: fine enough to resolve the rack footprint and the pocket
// mouths, coarse enough that the ensemble averages the per-shot noise out.
const NX = 128, NY = 256, LX = 1.27, LY = 2.54;
const CELL = LX / NX;

// ---- THE SECOND ARTIFACT: the table soil field --------------------------
// craft-uplift 2026-08 item 4.  web/assets/table/soil_168x296.png (+ soil.json)
// is the RAIL-AND-COLLAR half of the same question the cloth field answers for
// the bed: where does a played-on table stop being uniform?  Everything off the
// cloth — rail caps, pocket collars, the leather — ships today as a perfectly
// even material, and an even rail is the single loudest CG tell at close range.
//
// WHY IT LIVES IN THIS TOOL and not in one of its own.  The dose is an integral
// over the SAME ensemble: the same rules-legal 9-ball playouts on the same
// canonical wasm, with the same referee and the same stratified break draw.
// A second tool would either re-implement that ensemble (two copies, guaranteed
// to drift) or replay it (twice the CI wall clock for one shared quantity).
// The ensemble is the expensive, argued-over thing; the two fields are two
// readings of it.  Every ensemble claim in the header above therefore applies
// verbatim to this field too, INCLUDING its limits — no safety play, no
// position play, one player practising alone.
//
// THE TWO MECHANISMS (again separate fields, separate laws)
//
//  1. HAND — the bridge hand is the only part of a player that touches the
//     table every single stroke, and on any shot where the cue ball lies
//     within a bridge length of a cushion it lands on the RAIL CAP rather
//     than on the cloth.  The dose is therefore the bridge-hand placement
//     density restricted to the rail band:
//         D_hand(x,y) = (1/A) Σ_strokes ∫ w(L) · 1[ |x − (C − L û)| < r_hand ]
//                                          · 1[ (x,y) off the bed ]  dL
//     with C the cue-ball centre at address and û the aim direction — both
//     already in hand at every stroke this tool plays, so nothing is invented
//     to get them.  One unit of dose per stroke: a hand is a hand, the same
//     skin and the same load every time, so there is no free amplitude here.
//     BRIDGE LENGTH L is the one axis with NO citation anywhere in this repo
//     (searched: docs/research, web/scene/cuestick.js, web/app/cuepost.js —
//     the shipped cue model clamps at the GRIP hand and carries no bridge
//     station since the §4 pendulum-dip revision).  It is a stated-ignorance
//     uniform prior over the range every instruction text teaches, 6-10 in
//     = 0.1524-0.254 m, integrated by 5-node midpoint quadrature rather than
//     sampled, so it draws no random numbers and cannot perturb the cloth
//     field's stream.  The two endpoint variants are accumulated alongside
//     and their Pearson r against the shipped field is published, which is
//     how big that assumption is.
//     HAND FOOTPRINT r_hand = 0.035 m is MODELLED (a uniform disc for the
//     palm heel + finger pads).  Its shape is not load-bearing and that is a
//     statement about the bake, not a hope: the estimator bandwidth below is
//     sigma = R_ball = 28.6 mm, so a 35 mm disc convolved with it has no
//     spectral content the Gaussian does not already dominate.
//     NOT MODELLED, and disclosed rather than guessed: a player's hip and
//     forearm also lean on the rail, and nothing published says where.
//
//  2. MOUTH — the pocket collar is hit by balls, not by hands.  Every
//     BallPocket event the kernel emits is a ball crossing the mouth plane on
//     a known heading, and the dose is that entry path continued into the
//     throat:
//         D_mouth(x,y) = (1/A) Σ_pots ∫_0^{2R} 1[ |x − (P + s v̂)| < cell ] ds
//     Weight 1 per entry, again no free amplitude.  This is deliberately the
//     ENTRY and not the bed traffic near the mouth: the cloth field already
//     owns the approach, and what dirties a collar is the ball arriving on it.
//
// FOOTPRINT.  The bed plus a rail band of 20 cells = 198.44 mm, which is the
// shipped default pool rail top (TABLE_SPECS `frameWidth` 0.145, line ~867)
// plus the WPA nominal 2" cushion width 0.0508.  Same CELL as the cloth field,
// so the resolution argument, the stratification criteria and the bake blur
// carry over unchanged instead of being re-argued at a second scale.
// THE SAME STRETCH LIMITATION AS THE CLOTH FIELD, and for the same reason:
// derived on the 9-ft pool geometry, addressed at runtime in normalised outer
// coordinates, so a class whose rail band is a different fraction of its
// outer footprint reads a slightly stretched band.  The per-class deviation is
// NOT published here — TABLE_SPECS lives in web/scene/table.js, which imports
// three and cannot be read from this node tool, and mirroring the four classes'
// numbers into this file would create exactly the silent-drift pair the
// clothvisuals mirror below is gated to prevent.  It is measured and ledgered
// in the craft-uplift report instead.
const SOIL_PAD = 20;                       // rail band, in cells
const NX2 = NX + 2 * SOIL_PAD, NY2 = NY + 2 * SOIL_PAD;
const LX2 = NX2 * CELL, LY2 = NY2 * CELL;
const SOIL_BAND = (LX2 - LX) / 2;
/** Bridge-length prior support [m] — 6-10 in, the taught range (see above). */
const BRIDGE_LO = 0.1524, BRIDGE_HI = 0.254;
const BRIDGE_NODES = 5;
/** Bridge-hand contact footprint radius [m] — MODELLED (see above). */
const HAND_R = 0.035;

// ---- kernel ------------------------------------------------------------
const { init } = await import(path.join(ROOT, 'web/dist/pool-sdk/index.js'));
const eng = await init('file://' + path.join(ROOT, 'web/dist/pool-wasm/pool_wasm.js'));
const KERNEL = eng.version();
const TABLE = eng.table();
// The SHIPPED referee and the SHIPPED spot geometry — not a re-statement of
// the rules inside this tool.  `judgeShot` reaches the committed pool-rules
// wasm (`nineball-v1`), so the ensemble is played under exactly the verdicts
// the game plays under, and any future rules change lands here automatically
// (and trips this tool's own drift gate, which is the point).
const { judgeShot, deriveOnTable } =
  await import(path.join(ROOT, 'web/dist/pool-sdk/rules/nineball.js'));
// `placementFits` and `clampToBed` come along so the legality checks below
// use the SHIPPED predicate rather than a second opinion about clearance.
const { respotNineSpot, placementFits, clampToBed, CONTACT_EPS } =
  await import(path.join(ROOT, 'web/dist/pool-sdk/rules/respot.js'));
const { rulesVersion, rulesCatalogJson } = await import(
  path.join(ROOT, 'web/dist/pool-sdk/rules/backend.js'));
const RULES_VERSION = rulesVersion?.() ?? 'unknown';
const POCKETS = TABLE.pockets.map((p) => [p.center.x, p.center.y, p.radius]);
const proto = eng.nineBallRack(0);
const R_BALL = proto.system.balls[0].params.r;
// shot.v0 is the CUE speed; the frozen strike numerator is (1 + tip_cor)·v0
// over (1 + m_ball/m_cue) — probed rather than re-derived so this tool can
// speak in ball speeds (which is what every cited source measures).
const V0_PER_BALL_MS = (() => {
  const sc = eng.nineBallRack(0);
  sc.shot.v0 = 1;
  const v = JSON.parse(eng.simulateJson(sc)).events[0].post[0][1].vel;
  return 1 / Math.hypot(v.x, v.y);
})();

// ---- cited speed anchors (ball speed, m/s) -----------------------------
/** Frozen multibody break benchmark, docs/research/gap-break-multibody.md. */
const BREAK_LO = 10.729;
/** Dr. Dave "powerful break = 25-30 mph"; 30 mph = 13.4112 m/s. */
const BREAK_HI = 13.4112;
/** Dr. Dave TP B.6 shot-speed envelope, 1.5-20 mph = 0.6706-8.9408 m/s. */
const PLAY_LO = 0.6706, PLAY_HI = 8.9408;
const PLAY_LADDER = [0, 1, 2, 3, 4, 5].map(
  (i) => PLAY_LO + (PLAY_HI - PLAY_LO) * (i / 5) ** 2);

// ---- ensemble size and the break parameter distribution ----------------
// GH-542 R1, owner physics review 2026-08-20.  THIS REPLACES A FIXED SCRIPTED
// BREAK.  Until this round every one of the 480 games broke from one of five
// exact x positions at one of three exact speeds, aimed DEAD FULL at the apex
// with a = b = theta = 0 and no execution error of any kind.  Two measured
// consequences, both reproduced on a DISJOINT rack-seed batch and therefore
// design, not Monte-Carlo noise:
//   * the five cue-ball approach lines survive the bake as five countable
//     ridges — at kernel y = -0.60 m the peaks sit 1-5 mm from the predicted
//     break lines with 27.7% inter-peak modulation — because 160 mm spacing
//     is 5.6x the 28.575 mm bake blur and a Gaussian cannot fill a comb that
//     coarse (see `combRipple` below for the closed form);
//   * the post-break scatter keeps three strong radial ridges (40, 140 and
//     270 deg off the foot spot, ~50% above the local envelope) which do NOT
//     move when the rack count is tripled (1440 games) or the break grid is
//     refined to 25 x 9 (3600 games).  They are the dead-full aim into a rack
//     whose apex wedge is frozen identical in every seed (rack.rs micro-gaps
//     the back rows only), not undersampling.
// So the position axis was under-sampled and the execution axes were absent.
// Both are fixed here, and every count below is DERIVED from a stated
// criterion rather than chosen.
//
// (1) POSITION.  Support = the legal address set the SHIPPED app enforces
//     (web/app/game.js placeCue: |x| <= LX/2 - R - eps, y <= -LY/4), not the
//     uncited +-0.32 m this tool used to call "the legal width".  Shape:
//     uniform.  We hold NO measurement of where players break from, so this
//     is a stated-ignorance prior over a cited support, and it is the top
//     entry on the R1 followup list — one citation narrows it.
// (2) FULLNESS.  Support = +-R/2 of aim-line offset at the apex: the bracket
//     the project's own break experiment sweeps (examples/paper/exp_e3_break
//     .py:150-153 FULLNESS, "square" 0 and "quarter_off" R/2 = a 3/4-full
//     hit, cut angle asin(0.25) ~ 14.5 deg, the HSV 7.7 oblique direction).
//     Signed, because a cut break can be either side.  Shape: uniform, same
//     stated ignorance.
// (3) SPEED.  Same two cited anchors as before (BREAK_LO/BREAK_HI above), but
//     drawn continuously instead of at three exact values.
// (4) EXECUTION ERROR.  The ICGA skill model, which this project already
//     adopts as canonical (docs/research/rl-agent-program.md:840, verified
//     against Archibald, Altman & Shoham, AAMAS 2010 Sec 2.2.1 including
//     units — ledger row rl-agent-program.md:3837): sigma_phi = 0.125 deg,
//     sigma_a = sigma_b = 0.5 mm.  Applied at 1x, which is CONSERVATIVE for a
//     break: it is a normal-stroke sigma and the break is the hardest stroke
//     in the game.  sigma_theta = 0.1 deg is the one ICGA axis not applied —
//     this ensemble models no cue elevation anywhere (every play shot is
//     theta = 0) and elevating the break alone would make it the only
//     elevated stroke in the field.
// (5) INTENDED TIP OFFSET.  b = -0.15 R, not 0: the shipped break gate's own
//     frozen pin (examples/paper/exp_e3_break.py:155-157, reproducing HSV
//     B.43 scenario 1 "stun (very slight draw)"; the kernel gate is
//     event_loop.rs break_cue_rebound_clip_target_residual).  Intended a = 0
//     — no citation exists for deliberate sidespin on a break, so the ICGA
//     sigma carries that axis on its own.
//
// NOT changed, and deliberately so: the PLAY shots are still executed exactly
// (ghost-ball aim, no noise).  The defect this round fixes is empirically
// confined to the break legs — the play leg draws its layouts from a break
// that diverges 916 mm RMS between rack seeds, so it lays down no comb and no
// reproducible ridge.  Play-shot execution noise is a recorded followup, and
// holding it fixed keeps this round's before/after attributable to one cause.
//
// PROBE FLAGS.  `--rack-base` takes a disjoint block of rack seeds, which moves
// the execution axes too rather than replaying one break against new racks (see
// `breakDraw`) — but see the independence caveat there before calling the second
// batch independent.  `--racks`, `--break-strata` and `--fullness-strata`
// override the derived counts, and `--probe-dump` writes the field at full
// double precision so two batches can be diffed below the 8-bit quantisation
// the artifact ships at.
const probeNum = (key, dflt) => {
  const pre = `--${key}=`;
  const a = process.argv.find((s) => s.startsWith(pre));
  if (a === undefined) return dflt;
  const v = Number(a.slice(pre.length));
  if (!Number.isFinite(v)) throw new Error(`${key}: ${a.slice(pre.length)}`);
  return v;
};
const RACK_BASE = probeNum('rack-base', 0);
const RACKS = probeNum('racks', 32);      // rack seeds
const PROBE_DUMP = (() => {
  const a = process.argv.find((s) => s.startsWith('--probe-dump='));
  return a === undefined ? null : a.slice('--probe-dump='.length);
})();

/** The bake blur, in metres — see the resolution-bound block further down,
 * which is where `SIGMA_CELLS` reads it.  Every stratum criterion below is
 * stated against it, so the two cannot drift apart. */
const BLUR_SIGMA_M = R_BALL;
/** Fractional peak-to-trough ripple a Gaussian of `sigma` leaves when it is
 * convolved with an impulse comb of spacing `d`.  Poisson summation: the k-th
 * harmonic survives at exp(-2 pi^2 k^2 sigma^2 / d^2), and at every spacing
 * used below the second harmonic is under 1e-9, so the first one IS the
 * ripple.  This is the closed form behind "160 mm is too coarse": at
 * d = 0.16 m and sigma = R the comb still carries 185% peak-to-trough. */
const combRipple = (d, sigma) => 2 * Math.exp(-2 * Math.PI ** 2 * sigma * sigma / (d * d));
/** The ripple a stratified axis is allowed to leave visible in the bake.  1%
 * is one part in 100 of the local level — a quarter of one 8-bit code at the
 * field's own mean, i.e. under the artifact's quantisation. */
const RIPPLE_MAX = 0.01;
/** Smallest stratum count whose comb is invisible under `sigma`.  Counted
 * rather than solved so the criterion is the thing in the code. */
const strataFor = (span, sigma) => {
  let n = 2;
  while (combRipple(span / n, sigma) > RIPPLE_MAX && n < 4096) n++;
  return n;
};

/** Legal cue-ball x half-range for a break — the shipped kitchen clamp. */
const KITCHEN_HALF_X = LX / 2 - R_BALL - 1e-6;
/** ICGA skill model at 1x (Archibald/Altman/Shoham, AAMAS 2010 Sec 2.2.1). */
const ICGA_SIG_PHI = (0.125 * Math.PI) / 180;   // rad
const ICGA_SIG_TIP_R = 0.0005 / R_BALL;         // 0.5 mm, in units of R
/** exp_e3_break.py FULLNESS — aim-line offset at the apex, square..quarter. */
const FULLNESS_MAX = 0.5 * R_BALL;
/** exp_e3_break.py:157 B_TIP — the shipped break gate's frozen pin. */
const B_TIP_R = -0.15;
/** Shortest cue-to-apex distance in the ensemble (head string to foot spot).
 * The aim error is an ANGLE, so it is narrowest as a lateral offset at the
 * apex here; using the minimum makes the fullness criterion conservative. */
const BREAK_D_MIN = LY / 2;

const BREAK_X_STRATA =
  probeNum('break-strata', strataFor(2 * KITCHEN_HALF_X, BLUR_SIGMA_M));
/** Stratum CENTRES, so no sample sits on the cushion-contact limit. */
const BREAK_X = Array.from({ length: BREAK_X_STRATA },
  (_, i) => -KITCHEN_HALF_X + 2 * KITCHEN_HALF_X * ((i + 0.5) / BREAK_X_STRATA));
/** The smoothing kernel on the fullness axis is the ICGA aim error itself,
 * read as a lateral offset at the apex — so the same ripple bound applies. */
const FULLNESS_SIGMA_M = BREAK_D_MIN * ICGA_SIG_PHI;
const FULLNESS_STRATA =
  probeNum('fullness-strata', strataFor(2 * FULLNESS_MAX, FULLNESS_SIGMA_M));
const FULLNESS = Array.from({ length: FULLNESS_STRATA },
  (_, i) => -FULLNESS_MAX + 2 * FULLNESS_MAX * ((i + 0.5) / FULLNESS_STRATA));

/** Halton radical inverse — a deterministic low-discrepancy sequence, so the
 * drawn marginals are even at every N rather than only asymptotically.  No
 * PRNG state, no wall clock: the ensemble stays a pure function of the rack
 * seed and the stratum indices, which is what the determinism law requires. */
const halton = (i, base) => {
  let f = 1, r = 0, n = i + 1;
  while (n > 0) { f /= base; r += f * (n % base); n = Math.floor(n / base); }
  return r;
};
/** Box-Muller: exact for uniform inputs and carries no fitted constant.  The
 * realised mean/sd/min/max of every drawn axis are published in
 * `manifest.invariants.break_draw`, so "the draw has the cited distribution"
 * is a measurement in the artifact rather than a claim in a comment. */
const boxMuller = (u1, u2) => {
  const r = Math.sqrt(-2 * Math.log(Math.max(u1, Number.MIN_VALUE)));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
};
/** The per-game draw.  Indexed by the ABSOLUTE rack seed, so a disjoint seed
 * block (`--rack-base`) moves the execution axes too rather than replaying the
 * same five numbers against different racks.
 *
 * INDEPENDENCE CAVEAT, and it bounds what a two-batch diff can prove.  Halton is
 * deterministic and UNSCRAMBLED, so two disjoint seed blocks are two
 * non-overlapping index ranges of ONE sequence.  There is no randomisation
 * anywhere in them, so there is no sampling distribution, and "standard error"
 * is a category error rather than merely an optimistic number: correlation and
 * variance are undefined for a quantity that has no randomness in it.
 *
 * A two-batch diff therefore measures EXACTLY one thing — how far apart these
 * two specified blocks land — and bounds the integration error in NEITHER
 * direction.  (An earlier revision of this comment claimed it was a lower bound,
 * on the argument that low-discrepancy blocks fill each other's gaps and so
 * agree more than i.i.d. batches would.  Withdrawn: that reasoning is wrong
 * twice over.  It needs a correlation that is undefined here, and it has the
 * sign backwards anyway — anti-correlated errors INFLATE a difference, since
 * var(A - B) = var A + var B - 2 cov(A, B).)
 *
 * Estimating an actual error needs randomised QMC: several independent Owen
 * scrambles, or Cranley-Patterson shifts, integrated as replicates and their
 * spread taken across replicates.  Several, not one — one randomised batch
 * gives another single number, not a variance.  R1 followup, not implemented
 * here.  The rack axis is exempt from all of this: micro-gaps come from the
 * kernel's own seeded generator, so disjoint rack seeds ARE disjoint draws. */
const breakDraw = (seed, xi, fi) => {
  const gi = (seed * BREAK_X_STRATA + xi) * FULLNESS_STRATA + fi;
  const [zPhi, zA] = boxMuller(halton(gi, 3), halton(gi, 5));
  const [zB] = boxMuller(halton(gi, 7), halton(gi, 11));
  return {
    v: BREAK_LO + (BREAK_HI - BREAK_LO) * halton(gi, 2),
    dphi: ICGA_SIG_PHI * zPhi,
    a: ICGA_SIG_TIP_R * zA,
    b: B_TIP_R + ICGA_SIG_TIP_R * zB,
  };
};
/** Realised marginals of the four drawn axes, published as invariants. */
const drawAcc = { v: null, dphi: null, a: null, b: null };
for (const k of Object.keys(drawAcc)) {
  drawAcc[k] = { n: 0, s: 0, s2: 0, lo: Infinity, hi: -Infinity };
}
const drawPush = (o, v) => {
  o.n++; o.s += v; o.s2 += v * v;
  if (v < o.lo) o.lo = v;
  if (v > o.hi) o.hi = v;
};
const drawStat = (o, k = 1) => ({
  mean: +((o.s / o.n) * k).toFixed(6),
  sd: +(Math.sqrt(Math.max(0, o.s2 / o.n - (o.s / o.n) ** 2)) * k).toFixed(6),
  min: +(o.lo * k).toFixed(6),
  max: +(o.hi * k).toFixed(6),
});
const MAX_SHOTS = 24;         // playout cap per rack
const HEAD_Y = -LY / 4;       // head string / head spot
const DT = 5e-4;              // sampling step (2 kHz)
/** crates/pool-core/src/consts.rs — the kernel's own gravity. */
const G = 9.81;

// ---- fields ------------------------------------------------------------
const abr = new Float64Array(NX * NY);
const dep = new Float64Array(NX * NY);
const depCue = new Float64Array(NX * NY);   // sensitivity variant only

function splat(g, x, y, w) {
  const fx = (x / LX + 0.5) * NX - 0.5, fy = (y / LY + 0.5) * NY - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const cx = ix + dx, cy = iy + dy;
      if (cx < 0 || cy < 0 || cx >= NX || cy >= NY) continue;
      g[cy * NX + cx] += w * (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty);
    }
  }
}

// ---- soil fields (the second artifact) ---------------------------------
const hand = new Float64Array(NX2 * NY2);
const handLo = new Float64Array(NX2 * NY2);   // bridge-prior endpoint variants
const handHi = new Float64Array(NX2 * NY2);
const mouth = new Float64Array(NX2 * NY2);

function splat2(g, x, y, w) {
  const fx = (x / LX2 + 0.5) * NX2 - 0.5, fy = (y / LY2 + 0.5) * NY2 - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const cx = ix + dx, cy = iy + dy;
      if (cx < 0 || cy < 0 || cx >= NX2 || cy >= NY2) continue;
      g[cy * NX2 + cx] += w * (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty);
    }
  }
}

/** Sub-point lattice over the hand disc, at the cloth grid's own cell pitch so
 * the two fields quantise the same way.  Built once; the weights sum to 1 so
 * one stroke deposits exactly one unit of dose however the disc is cut. */
const HAND_DISC = (() => {
  const pts = [];
  const n = Math.ceil(HAND_R / CELL);
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const dx = i * CELL, dy = j * CELL;
      if (dx * dx + dy * dy > HAND_R * HAND_R) continue;
      pts.push([dx, dy]);
    }
  }
  return pts.map(([dx, dy]) => [dx, dy, 1 / pts.length]);
})();

/** True where a point is OFF the playing surface, i.e. on the rail band.  The
 * cloth field owns everything inside the nose line; a bridge hand that lands
 * there is on cloth and is not this field's business. */
const offBed = (x, y) => Math.abs(x) > LX / 2 || Math.abs(y) > LY / 2;

/** One stroke's bridge-hand dose.  `phi` is the aim azimuth, so the hand sits
 * BACK along it — C − L û — and only the part of its footprint that clears the
 * nose line reaches the rail.  L is integrated over the stated prior by
 * midpoint quadrature (no draws: this must not touch the RNG stream the cloth
 * field's break parameters ride on). */
let nStance = 0, nStanceOnRail = 0;
function stance(cx, cy, phi) {
  nStance++;
  const ux = Math.cos(phi), uy = Math.sin(phi);
  let onRail = 0;
  for (let q = 0; q < BRIDGE_NODES; q++) {
    const L = BRIDGE_LO
      + (BRIDGE_HI - BRIDGE_LO) * ((q + 0.5) / BRIDGE_NODES);
    const hx = cx - L * ux, hy = cy - L * uy;
    for (const [dx, dy, w] of HAND_DISC) {
      const px = hx + dx, py = hy + dy;
      if (!offBed(px, py)) continue;
      splat2(hand, px, py, w / BRIDGE_NODES);
      onRail += w / BRIDGE_NODES;
    }
  }
  for (const [g, L] of [[handLo, BRIDGE_LO], [handHi, BRIDGE_HI]]) {
    const hx = cx - L * ux, hy = cy - L * uy;
    for (const [dx, dy, w] of HAND_DISC) {
      const px = hx + dx, py = hy + dy;
      if (offBed(px, py)) splat2(g, px, py, w);
    }
  }
  if (onRail > 0.5) nStanceOnRail++;
}

const MOTION_POCKETED = 4, MOTION_AIRBORNE = 5, MOTION_REST = 0;
/** Worst |τ_slide predicted − τ_slide observed| over the whole ensemble. */
let tauErrMax = 0;
let nSlides = 0;
/** Ball entries into a pocket, counted for the soil field's mouth channel. */
let nPots = 0;

/** Per-ball motion timeline for one record, taken from the kernel's OWN event
 * post-states (exact vel/avel), not from finite differences.  Each entry is a
 * segment start: { t, motion, u0, tau } where u0 is the contact-point slip
 * SPEED at the segment start and tau the slide duration the kernel's closed
 * form gives for it.
 *
 * The slip integral rides on evolve.rs's documented closed form: "û₀ = unit
 * contact-point relative velocity, CONSTANT during the slide (exact
 * consequence of planar Coulomb friction) … decays linearly … and reaches
 * zero exactly at τ_slide = 2|v_c(0)|/(7·u_s·g)" (crates/pool-core/src/
 * evolve.rs:16-21, G = 9.81 from consts.rs).  So
 *     |u(t)| = |u₀| · max(0, 1 − (t − t_seg)/τ)      during Sliding
 *     |u(t)| = 0                                      otherwise
 * — the rolling constraint makes the Rolling leg contribute no abrasion, and
 * the Spinning leg slips only rotationally inside a stationary contact patch,
 * which is NOT counted here (its areal slip needs a patch-radius model that
 * is not published for cloth; centre-ball play generates little vertical
 * spin, and what there is lands on a single cell).
 *
 * Reading the closed form off the kernel instead of differencing the sampled
 * quaternion is not a convenience: the sampled orientation does not satisfy
 * the rolling constraint to better than ~25% of |v| on some rolling legs, so
 * a differenced ω would have written that error straight into the field. */
function timelines(rec) {
  const tl = new Map();
  const push = (id, t, st, u_s) => {
    const ux = st.vel.x - R_BALL * st.avel.y;
    const uy = st.vel.y + R_BALL * st.avel.x;
    const u0 = Math.hypot(ux, uy);
    const tau = u_s > 0 ? (2 * u0) / (7 * u_s * G) : 0;
    const arr = tl.get(id) ?? (tl.set(id, []), tl.get(id));
    arr.push({ t, motion: st.motion, u0, tau });
  };
  const us = new Map(rec.initial.balls.map((b) => [b.id, b.params.u_s]));
  for (const b of rec.initial.balls) push(b.id, 0, b.state, us.get(b.id));
  for (const e of rec.events) {
    for (const [id, st] of e.post ?? []) push(id, e.t, st, us.get(id));
  }
  // gate: every slide that the kernel itself ends with a Sliding→Rolling
  // transition must end at exactly t_seg + τ, or the closed form above is
  // not the one the kernel ran.
  for (const e of rec.events) {
    const k = e.kind;
    if (!k || typeof k !== 'object' || !k.Transition) continue;
    if (k.Transition.from !== 'Sliding' || k.Transition.to !== 'Rolling') continue;
    const arr = tl.get(k.Transition.ball) ?? [];
    let seg = null;
    for (const s of arr) if (s.t < e.t - 1e-12 && s.motion === 'Sliding') seg = s;
    if (!seg) continue;
    nSlides++;
    tauErrMax = Math.max(tauErrMax, Math.abs(seg.t + seg.tau - e.t));
  }
  return tl;
}

/** ∫|u| dt over [t0,t1] for a segment that started at seg.t. */
function slipIntegral(seg, t0, t1) {
  if (seg.motion !== 'Sliding' || seg.tau <= 0) return 0;
  const a = Math.min(Math.max(t0 - seg.t, 0), seg.tau);
  const b = Math.min(Math.max(t1 - seg.t, 0), seg.tau);
  if (b <= a) return 0;
  // |u| = u0 (1 − t/τ)  ⇒  ∫ = u0 [ (b−a) − (b² − a²)/(2τ) ]
  return seg.u0 * ((b - a) - (b * b - a * a) / (2 * seg.tau));
}

/** Integrate one shot record into the fields; return the final ball states,
 * the PARSED record (the referee wants the object, and it is already parsed
 * here) and the set of balls the kernel drove clean off the playing surface
 * — an event FACT, not a rule reading; the WPA 3.5 overlay in `judge` is
 * what turns it into a verdict. */
function accumulate(recJson) {
  const rec = JSON.parse(recJson);
  const T = rec.events[rec.events.length - 1].t;
  const offTable = new Set();
  for (const e of rec.events) {
    const k = e.kind;
    if (k && typeof k === 'object' && k.BallOffTable) {
      offTable.add(k.BallOffTable.ball);
    }
  }
  const tl = timelines(rec);
  const s = eng.sampler(recJson);
  const n = s.ballCount;
  const ids = s.ballIds;
  const cursor = new Int32Array(n);          // per-ball timeline pointer
  let prev = null, prevT = 0;
  for (let step = 0; ; step++) {
    const t = Math.min(step * DT, T);
    const cur = Float64Array.from(s.sampleAt(t));
    const h = t - prevT;
    if (prev && h > 0) {
      for (let i = 0; i < n; i++) {
        const o = i * 8;
        const ma = prev[o + 7], mb = cur[o + 7];
        // slip: sum over every timeline segment overlapping [prevT, t] —
        // a collision inside the interval starts a new one.  The cursor
        // advances monotonically with the sample clock, so this stays O(1)
        // amortised even though the walk looks like a scan.
        const arr = tl.get(ids[i]) ?? [];
        const live = !(ma === MOTION_POCKETED || mb === MOTION_POCKETED
          || ma === MOTION_AIRBORNE || mb === MOTION_AIRBORNE
          || (ma === MOTION_REST && mb === MOTION_REST));
        let j = cursor[i], slip = 0;
        while (j < arr.length && arr[j].t < t) {
          const nx = j + 1 < arr.length ? arr[j + 1].t : Infinity;
          if (live && nx > prevT) {
            slip += slipIntegral(arr[j], Math.max(prevT, arr[j].t), Math.min(t, nx));
          }
          if (nx >= t) break;
          j++;
        }
        cursor[i] = j;
        if (!live) continue;
        const pathLen = Math.hypot(cur[o] - prev[o], cur[o + 1] - prev[o + 1]);
        if (slip === 0 && pathLen === 0) continue;
        // walk the segment so a 13 m/s ball cannot skip cells
        const seg = Math.max(1, Math.ceil(pathLen / (CELL / 3)));
        for (let k = 0; k < seg; k++) {
          const f = (k + 0.5) / seg;
          const px = prev[o] + (cur[o] - prev[o]) * f;
          const py = prev[o + 1] + (cur[o + 1] - prev[o + 1]) * f;
          splat(abr, px, py, slip / seg);
          splat(dep, px, py, pathLen / seg);
          if (ids[i] === 0) splat(depCue, px, py, pathLen / seg);
        }
      }
    }
    prev = cur; prevT = t;
    if (t >= T) break;
  }
  // MOUTH dose (soil field): every ball the kernel pockets crosses the mouth
  // plane on a heading, and the collar is what it crosses into.  The heading
  // is read as a finite difference of the SAMPLER over the last 4 ms before
  // the event rather than from a post-state, because a pocketed ball's
  // post-state is a terminal record, not a flight vector.  The entry is then
  // continued 2R into the throat, which is where the collar actually is.
  for (const e of rec.events) {
    const k = e.kind;
    if (!k || typeof k !== 'object' || k.BallPocket === undefined) continue;
    const id = k.BallPocket.ball;
    const i = ids.indexOf(id);
    if (i < 0) continue;
    const t1 = Math.max(0, Math.min(T, e.t));
    const t0 = Math.max(0, t1 - 4e-3);
    if (t1 <= t0) continue;
    const a = Float64Array.from(s.sampleAt(t0));
    const b = Float64Array.from(s.sampleAt(t1));
    const o = i * 8;
    const dx = b[o] - a[o], dy = b[o + 1] - a[o + 1];
    const d = Math.hypot(dx, dy);
    if (!(d > 1e-9)) continue;
    const ux = dx / d, uy = dy / d;
    const steps = Math.max(1, Math.ceil((2 * R_BALL) / (CELL / 3)));
    for (let q = 0; q < steps; q++) {
      const s2 = ((q + 0.5) / steps) * 2 * R_BALL;
      splat2(mouth, b[o] + ux * s2, b[o + 1] + uy * s2, 1 / steps);
    }
    nPots++;
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = i * 8;
    out.push({
      id: ids[i], x: prev[o], y: prev[o + 1],
      pocketed: prev[o + 7] === MOTION_POCKETED,
    });
  }
  s.free();
  return { balls: out, rec, offTable };
}

/** Build a scenario from a surviving-ball list (pocketed balls dropped). */
function scenarioFrom(balls, cue, shot) {
  const base = eng.nineBallRack(0);
  const paramsById = new Map(base.system.balls.map((b) => [b.id, b.params]));
  const mk = (id, x, y) => ({
    id,
    params: paramsById.get(id) ?? paramsById.get(1),
    state: {
      pos: { x, y, z: R_BALL }, vel: { x: 0, y: 0, z: 0 },
      avel: { x: 0, y: 0, z: 0 }, motion: 'Stationary',
    },
  });
  return {
    options: base.options,
    shot,
    system: {
      table: base.system.table,
      balls: [mk(0, cue[0], cue[1]), ...balls.map((b) => mk(b.id, b.x, b.y))],
    },
  };
}

/** Ball-in-hand placement after a scratch: the head spot, or — when it is
 * occupied — the nearest free point of a deterministic one-diameter lattice
 * centred on it (a mechanical tie-break, not a position-play choice). */
function ballInHand(live) {
  const D = 2 * R_BALL, lim = [LX / 2 - R_BALL, LY / 2 - R_BALL];
  const free = (x, y) => Math.abs(x) < lim[0] && Math.abs(y) < lim[1]
    && live.every((b) => Math.hypot(b.x - x, b.y - y) > D * 1.02);
  for (let ring = 0; ring < 12; ring++) {
    for (let j = -ring; j <= ring; j++) {
      for (let i = -ring; i <= ring; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        const x = i * D, y = HEAD_Y + j * D;
        if (free(x, y)) return [x, y];
      }
    }
  }
  return null;
}

// ---- 9-ball adjudication (delegated to the shipped referee) -------------
// The 9 is the ONLY ball whose fate changes the LAYOUT of the balls that
// follow, so it is the only rule state this playout has to carry.  Nothing
// below re-states a rule: `judgeShot` is the shipped `nineball-v1` referee
// (crates/pool-rules/src/rulesets/nineball.rs through the committed wasm),
// and it returns `gameOver` / `respotNine` / `fouls[]` with the rulebook
// cites the crate carries.  Pinned authority for every clause number in
// this file: WPA "Rules of Play" eff. 2025-09-15, audited clause-by-clause
// against the pinned PDF in docs/research/rules-audit/audit-9ball.md.
//
// Without adjudication the loop keeps shooting a rack the rules have
// already ended — layouts with the 9 absent that no table ever sees.
// review r4 P2 measured it at 106 of 480 racks, i.e. roughly a fifth of the
// ensemble was contributing traffic from impossible play.
//
// THE ONE OVERLAY (`RULE_35_OVERLAY`).  audit-9ball.md §6 records a single
// GENUINE divergence between the shipped v1 referee and the pinned
// rulebook that can reach the 9: WPA 3.5 (in 5.7's foul list) makes driving
// ANY ball off the table a foul, and v1 knowingly omits it
// (nineball.rs:18 "push-out, off-table fouls, ... are NOT in v1" —
// behavior-frozen against the harvested corpus, so it cannot be fixed
// crate-side without a re-freeze).  Where that omission matters is exactly
// the case the audit names: a 9 pocketed on the SAME shot that drives
// another ball off the table is, under WPA, a foul — the 9 spots and the
// rack continues; under v1 it ends the rack.  This tool is deriving what a
// RULES-LEGAL ensemble puts on the cloth, so it applies 3.5 and reports
// how many shots it changed.  The spotting side needs no overlay: 5.6
// spots the 9 and only the 9, which is what v1 already does.
// (audit-9ball.md §6 also notes a COSMETIC nuance — WPA 2.7 counts an
// off-table ball as "driven to a rail", so v1 can label the same shot
// `no-rail-after-contact` where WPA would say 3.5.  Both are fouls with
// the same consequence, and the overlay fires on exactly that shot set, so
// the 9's fate is unaffected; only the foul-code histogram below can show
// it.)
// HISTORICAL RECORD, and labelled as one.  When this delegation replaced the
// tool's own adjudication (review visual audit r5 P1, "I need the adjudication
// code and outcome counters"), the shipped referee was measured to return the
// SAME verdicts the hand-written version did: holding the spot geometry
// fixed, the derived PNG came out byte-identical (sha e87e20db…) with every
// derived scalar and both 9-outcome counters unchanged.  The hand-written
// adjudicator no longer exists, so that comparison cannot be re-run and it is
// NOT an invariant of this tool — the counts it quoted (4897 shots, 381
// rack-overs) already belong to an earlier ensemble and no longer match what
// `--write` emits, which is precisely how a number parked in a comment goes
// wrong.  The live statements are in `manifest.ensemble`, and the one part of
// the claim that IS still checkable is gated below (`--gate-overlay`): if the
// overlay never changes the 9's fate then it cannot move a ball, so turning
// it off must reproduce the committed PNG byte for byte.
//
// The substitution that DID move the field that round was the other one: the
// tool's 1 mm hand-walked spot search gave way to the shipped
// `respotNineSpot`, i.e. the WPA 1.5 order at r/4 steps with the
// `PLACE_CLEARANCE` daylight the app itself places by.  That is the correct
// direction — the ensemble now spots the 9 where the game would.
const RULE_35_OVERLAY = !process.argv.includes('--no-overlay');

/** Judge one finished shot with the shipped referee (+ the 3.5 overlay) and
 * return the outcome this playout needs. */
function judge(res) {
  const j = judgeShot({ onTable: deriveOnTable(res.rec) }, res.rec);
  for (const f of j.fouls) foulHist[f] = (foulHist[f] ?? 0) + 1;
  // WPA 3.5: any ball driven off the table is a foul (the cue is already
  // v1's `scratch`, so only object balls add anything here).
  const off35 = RULE_35_OVERLAY
    && [...res.offTable].some((id) => id !== 0);
  if (off35) {
    // THREE counters, because one of them was being read as the other two.
    // `ball-off-table (WPA 3.5 overlay)` counts every shot the overlay's
    // clause DESCRIBES; `rule_35_overlay_fouls` counts the strictly smaller
    // set where it CHANGED the verdict, because v1 had already fouled the
    // rest for its own reasons.  The manifest published 26 and 24 with
    // nothing saying why they differ (GH-542 visual audit r6, finding 2), so
    // the difference is now a counter of its own and 26 = 24 + 2 is
    // arithmetic a reader can check instead of a coincidence they must trust.
    foulHist['ball-off-table (WPA 3.5 overlay)'] =
      (foulHist['ball-off-table (WPA 3.5 overlay)'] ?? 0) + 1;
    if (j.legal) nRule35Foul++; else nOffTableAlreadyFoul++;
  }
  const legal = j.legal && !off35;
  const over = legal && j.nineBallPocketed;
  // ...and only the overlay can be credited with changing the 9's fate. The
  // guard used to omit `off35`, so any shot v1 itself ended the rack on
  // without a legal 9 would have been attributed here. It measured zero
  // either way, which is exactly why it survived unnoticed.
  if (off35 && j.gameOver && !over) nRule35Changed9++;
  return { over, respot: !over && (j.nineBallPocketed || res.offTable.has(9)) };
}

/** Apply the verdict to a finished shot: null ends the rack, otherwise the
 * ball list to carry into the next shot (with the 9 spotted if it is owed a
 * spot, on the shipped WPA 1.5 geometry). */
function settle(res) {
  const v = judge(res);
  if (v.over) { nNineWin++; return null; }
  if (!v.respot) return res.balls;
  const nine = res.balls.find((b) => b.id === 9);
  const others = res.balls.filter((b) => b.id !== 9 && !b.pocketed)
    .map((b) => ({ x: b.x, y: b.y }));
  const at = respotNineSpot(TABLE, R_BALL, others);
  if (!at) { nRespotNoRoom++; return null; }
  // RESPOT INVARIANT, checked with the shipped predicate rather than a second
  // opinion about clearance: a spotted 9 must be a legal placement — inside
  // the bed by a radius and 2r + PLACE_CLEARANCE off every ball still on it.
  // The ensemble's whole claim is that its layouts are ones a table can
  // actually be in, and a 9 spotted inside another ball is not one of those.
  if (!placementFits(TABLE, R_BALL, at, others)) {
    throw new Error(`respotNineSpot returned an illegal placement `
      + `(${at.x}, ${at.y}) against ${others.length} balls on shot ${nShots}`);
  }
  nine.x = at.x; nine.y = at.y; nine.pocketed = false;
  nNineSpot++;
  return res.balls;
}

/** RACK INVARIANT: the layout the break is played from is one a table can be
 * racked into. Ten balls with ids 0..9, every one of them on the bed, and no
 * pair closer than contact — the default racks are FROZEN-contact topology
 * (project rule: rack.rs DEFAULT_FROZEN_FRACTION), so touching is CORRECT and
 * `placementFits` is the wrong predicate here; overlapping is not, and that
 * is what this separates. Also that the cue really is behind the head string
 * after the override above, since a break from in front of it is not a break.
 */
function checkRack(balls, headY) {
  const ids = balls.map((b) => b.id).sort((a, b) => a - b);
  if (ids.length !== 10 || ids.some((v, i) => v !== i)) {
    throw new Error(`rack is not ids 0..9: [${ids}]`);
  }
  for (const b of balls) {
    const p = { x: b.state.pos.x, y: b.state.pos.y };
    const c = clampToBed(TABLE, R_BALL, p);
    const off = Math.hypot(c.x - p.x, c.y - p.y);
    if (off > 1e-9) throw new Error(`rack ball ${b.id} is off the bed by ${off} m`);
    rackWorstCushionM = Math.min(rackWorstCushionM,
      Math.min(TABLE.width / 2 - R_BALL - Math.abs(p.x),
        TABLE.length / 2 - R_BALL - Math.abs(p.y)));
  }
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const d = Math.hypot(balls[i].state.pos.x - balls[j].state.pos.x,
        balls[i].state.pos.y - balls[j].state.pos.y);
      rackWorstGapM = Math.min(rackWorstGapM, d - 2 * R_BALL);
      if (d < 2 * R_BALL - CONTACT_EPS) {
        throw new Error(`rack balls ${balls[i].id}/${balls[j].id} overlap by `
          + `${2 * R_BALL - d} m (contact tolerance ${CONTACT_EPS})`);
      }
    }
  }
  const cue = balls.find((b) => b.id === 0);
  if (!(cue.state.pos.y <= headY)) {
    throw new Error(`the break cue ball is at y=${cue.state.pos.y}, in front `
      + `of the head string at ${headY}`);
  }
  nRacks++;
}

/** Ghost-ball aim at `pocket` for object ball `ob` from cue position `cue`;
 * null when the cut angle exceeds 80 deg (not a shot any player plays). */
function aim(cue, ob, pocket) {
  const ox = pocket[0] - ob[0], oy = pocket[1] - ob[1];
  const on = Math.hypot(ox, oy);
  if (on < 1e-6) return null;
  const gx = ob[0] - (ox / on) * 2 * R_BALL, gy = ob[1] - (oy / on) * 2 * R_BALL;
  const ax = gx - cue[0], ay = gy - cue[1];
  const an = Math.hypot(ax, ay);
  if (an < 2 * R_BALL) return null;
  const cos = (ax * ox + ay * oy) / (an * on);
  if (cos < Math.cos((80 * Math.PI) / 180)) return null;
  return { phi: Math.atan2(ay, ax), cut: Math.acos(Math.min(1, cos)) };
}

// ---- run the ensemble --------------------------------------------------
let nShots = 0, nPotted = 0, nMissed = 0, nRejected = 0;
let nNineWin = 0, nNineSpot = 0;
/** Every foul code the shipped referee emitted, counted — the ensemble's
 * rule behaviour as DATA (see the manifest's `ensemble.fouls`).
 *
 * SEEDED AT ZERO from the referee's own catalog, so the histogram publishes
 * every category the ruleset can emit rather than only the ones that fired.
 * Without this a reader cannot tell "no shot in 41316 did that" from "this
 * tool does not track that" — and the distinction carries weight here, since
 * the overlay's own §6 note predicts that v1 would label some of these shots
 * `no-rail-after-contact`, and the fact that it never did is a result. */
const foulHist = Object.create(null);
const FOUL_CATALOG = (() => {
  const cat = JSON.parse(rulesCatalogJson());
  const rs = (cat.rulesets ?? []).find((r) => r.id === 'nineball-v1');
  if (!rs?.fouls?.length) {
    throw new Error('the committed pool-rules catalog publishes no fouls for '
      + 'nineball-v1, so the histogram below cannot be shown to be complete');
  }
  for (const f of rs.fouls) foulHist[f.code] = 0;
  return Object.fromEntries(rs.fouls.map((f) => [f.code, f.cite]));
})();
/** Shots the WPA 3.5 overlay turned from legal to foul; those it described
 * but that v1 had already fouled anyway; and the subset of the first where
 * that changed the 9's fate (rack-over -> 9 spotted). */
let nRule35Foul = 0, nOffTableAlreadyFoul = 0, nRule35Changed9 = 0;
/** Rack- and respot-legality tallies, published as `manifest.invariants`. */
let nBreaks = 0, nRacks = 0, nRespotNoRoom = 0;
let rackWorstGapM = Infinity, rackWorstCushionM = Infinity;
for (let rk = 0; rk < RACKS; rk++) {
  const seed = RACK_BASE + rk;
  for (let xi = 0; xi < BREAK_X.length; xi++) {
    for (let fi = 0; fi < FULLNESS.length; fi++) {
      const bx = BREAK_X[xi], full = FULLNESS[fi];
      const dr = breakDraw(seed, xi, fi);
      drawPush(drawAcc.v, dr.v); drawPush(drawAcc.dphi, dr.dphi);
      drawPush(drawAcc.a, dr.a); drawPush(drawAcc.b, dr.b);
      const sc = eng.nineBallRack(seed);
      const apex = sc.system.balls.find((b) => b.id === 1);
      sc.system.balls[0].state.pos.x = bx;
      sc.system.balls[0].state.pos.y = HEAD_Y - 1e-3; // behind the head string
      sc.shot.v0 = dr.v * V0_PER_BALL_MS;
      sc.shot.a = dr.a;
      sc.shot.b = dr.b;
      sc.shot.theta = 0;                  // the ICGA axis this tool omits
      const adx = apex.state.pos.x - sc.system.balls[0].state.pos.x;
      const ady = apex.state.pos.y - sc.system.balls[0].state.pos.y;
      // Aim at the apex-ball CENTRE, then rotate off it by the intended
      // fullness and the ICGA aim error.  Both are lateral offsets at the
      // apex, so both enter the azimuth as asin(offset / distance).
      sc.shot.phi = Math.atan2(ady, adx)
        + Math.asin(full / Math.hypot(adx, ady)) + dr.dphi;
      // The break carries no shot identity in the ruleset (nineball.rs:19)
      // — it is judged like any other stroke, and in a 9-ball rack the
      // lowest ball IS the apex, so the aim above is the legal one; the
      // fullness offset is a quarter-ball at most and cannot reach a
      // different first contact.
      checkRack(sc.system.balls, HEAD_Y);
      // soil field: the break's own stance.  It lands on the CLOTH every time
      // (the cue ball is behind the head string and the bridge is behind that,
      // 0.15-0.25 m further from any rail), so it contributes nothing to the
      // rail band — which is the correct answer, not an omission, and the
      // `stance_on_rail` counter in the manifest is what shows it.
      stance(sc.system.balls[0].state.pos.x, sc.system.balls[0].state.pos.y,
        sc.shot.phi);
      let end = settle(accumulate(eng.simulateJson(sc)));
      nShots++; nBreaks++;

      for (let shot = 0; shot < MAX_SHOTS && end; shot++) {
        const cueEnd = end.find((b) => b.id === 0);
        const live = end.filter((b) => b.id !== 0 && !b.pocketed)
          .sort((a, b) => a.id - b.id);
        if (live.length === 0) break;
        const cue = (!cueEnd || cueEnd.pocketed)
          ? ballInHand(live) : [cueEnd.x, cueEnd.y];
        if (!cue) break;
        const ob = live[0];
        let best = null;
        for (const p of POCKETS) {
          const a = aim(cue, [ob.x, ob.y], p);
          if (a && (!best || a.cut < best.cut)) best = a;
        }
        if (!best) break;
        let played = null;
        // from rung 0: PLAY_LADDER[0] is the cited 0.6706 m/s floor of the
        // TP B.6 envelope and the manifest declares the whole ladder, so
        // skipping it would derive the field from an ensemble the artifact
        // does not describe (review r1 P2)
        for (let r = 0; r < PLAY_LADDER.length; r++) {
          const trial = scenarioFrom(live, cue, {
            a: 0, b: 0, theta: 0, phi: best.phi,
            v0: PLAY_LADDER[r] * V0_PER_BALL_MS, seed: 0,
          });
          let rj;
          try {
            rj = eng.simulateJson(trial);
          } catch (e) {
            nRejected++;   // e.g. a rest layout the kernel reads as overlapping
            break;
          }
          const st = JSON.parse(rj);
          const potted = st.events.some((e) => {
            const k = e.kind;
            return k && typeof k === 'object' && k.BallPocket !== undefined
              && k.BallPocket.ball === ob.id;
          });
          played = rj;
          if (potted) { nPotted++; break; }
          if (r === PLAY_LADDER.length - 1) nMissed++;
        }
        if (!played) break;
        // soil field: ONE stance per stroke that was actually played.  The
        // speed ladder above is a search for the rung this player would use,
        // not a sequence of strokes — the address and the aim are the same at
        // every rung, so counting the search would multiply one hand
        // placement by however many rungs it took to find the pot.
        stance(cue[0], cue[1], best.phi);
        end = settle(accumulate(played));
        nShots++;
      }
    }
  }
}

// ---- ensemble invariants ------------------------------------------------
// Everything the sentence "this is what a RULES-LEGAL ensemble puts on the
// cloth" quietly assumes, made explicit, asserted here and published in the
// manifest (GH-542 visual audit r6, finding 2: the counters were legible but
// the claims behind them were not).  Two of the three could only ever have
// been broken by a bug — which is the point of asserting them rather than
// asserting they were checked.
const INVARIANTS = {
  // every stroke is one of four things, so no shot escaped the accounting
  shot_accounting: `${nPotted} potted + ${nMissed} missed + ${nRejected} `
    + `rejected + ${nBreaks} breaks = ${nShots} shots`,
  shot_accounting_ok: nPotted + nMissed + nRejected + nBreaks === nShots,
  // every break is played from a legal, non-overlapping, on-the-bed rack with
  // the cue behind the head string; frozen contact is expected, so the tight
  // gap below is a feature and only a NEGATIVE one would be a defect
  racks_checked: nRacks,
  rack_worst_gap_mm: +(rackWorstGapM * 1000).toFixed(4),
  rack_worst_cushion_clearance_mm: +(rackWorstCushionM * 1000).toFixed(4),
  // every 9 that was spotted was spotted somewhere the shipped placement
  // predicate accepts; the rest of the racks ended because there was no room
  respots_legal: nNineSpot,
  respots_no_room: nRespotNoRoom,
  respot_predicate: 'pool-sdk rules/respot.js placementFits (WPA 1.5 order, '
    + 'r/4 steps, PLACE_CLEARANCE daylight)',
  // The break is no longer scripted, so "the draw has the cited distribution"
  // has to be a measurement.  These are the REALISED marginals of the four
  // continuous axes over every game in the ensemble; the sd rows are asserted
  // against their cited sigmas below, not merely printed.
  break_draw: {
    ball_speed_ms: drawStat(drawAcc.v),
    aim_error_deg: drawStat(drawAcc.dphi, 180 / Math.PI),
    tip_a_r: drawStat(drawAcc.a),
    tip_b_r: drawStat(drawAcc.b),
    cited_sigma: {
      aim_error_deg: 0.125, tip_a_r: +ICGA_SIG_TIP_R.toFixed(6),
      tip_b_r: +ICGA_SIG_TIP_R.toFixed(6),
    },
  },
};
if (!INVARIANTS.shot_accounting_ok) {
  console.error(`shot accounting does not close: ${INVARIANTS.shot_accounting}`);
  process.exit(1);
}
if (nRacks !== RACKS * BREAK_X.length * FULLNESS.length) {
  console.error(`${nRacks} racks checked, expected `
    + `${RACKS * BREAK_X.length * FULLNESS.length}`);
  process.exit(1);
}
// The drawn axes must actually carry the distributions the manifest claims.
// Asserted, not just published: a silent regression in `breakDraw` (a wrong
// base, a lost sigma) would otherwise ship as a quieter scripted break.
for (const [k, o, want, tol] of [
  ['break aim error sd', drawAcc.dphi, ICGA_SIG_PHI, 0.1],
  ['break tip-a sd', drawAcc.a, ICGA_SIG_TIP_R, 0.1],
  ['break tip-b sd', drawAcc.b, ICGA_SIG_TIP_R, 0.1],
]) {
  const sd = Math.sqrt(Math.max(0, o.s2 / o.n - (o.s / o.n) ** 2));
  if (!(Math.abs(sd / want - 1) <= tol)) {
    console.error(`${k}: realised ${sd} vs cited ${want} (tol ${tol * 100}%)`);
    process.exit(1);
  }
}
if (!(Math.abs(drawAcc.b.s / drawAcc.b.n - B_TIP_R) <= 0.1 * ICGA_SIG_TIP_R)
  || !(Math.abs(drawAcc.a.s / drawAcc.a.n) <= 0.1 * ICGA_SIG_TIP_R)) {
  console.error('break tip offset means are off their intended centres');
  process.exit(1);
}

// ---- closed-form self-check --------------------------------------------
// Every Sliding leg the kernel itself ended with a Sliding->Rolling
// transition must end at exactly t_seg + 2|u0|/(7 u_s g).  If it does not,
// the slip integral above is not integrating the kernel's slide.
if (nSlides === 0 || tauErrMax > 1e-9) {
  console.error(`tau_slide disagreement: ${nSlides} slides checked, worst ` +
    `|predicted - kernel| = ${tauErrMax} s (must be <= 1e-9)`);
  process.exit(1);
}

// ---- estimator bandwidth -----------------------------------------------
// WHAT THIS IS, CORRECTED (GH-542 R1, 2026-08-20).  This block used to call
// itself a "resolution bound" and argue that a ball cannot write structure
// finer than its own footprint.  THAT ARGUMENT IS WRONG and is withdrawn: a
// rigid sphere touches the cloth only directly under its centre, so the
// centre track IS the contact track and there is no ball-width smear to
// enforce.  The physical footprint is the CONTACT PATCH, and this repo's own
// numbers bracket it at a = 0.20-0.29 mm (Hertz on a rigid counterface with
// the phenolic moduli of Gismeros Moreno et al. 2022 Table 1 gives 0.2007 mm;
// the rolling-resistance arm a >= mu_r * R with mu_r = 0.01 gives 0.2858 mm).
// That is 0.03 of one 9.92 mm cell — at this grid the honest footprint is a
// NO-OP, and the bilinear splat's one-cell tent is already 35x wider than it.
//
// So sigma = R is not physics.  It is the ESTIMATOR BANDWIDTH this finite
// ensemble needs, and it is kept at one ball radius for a stated reason: the
// measured split-half SPREAD of a single equal-N batch is 1.16% of peak
// (abrasion) / 1.31% (deposit) AFTER this smoothing, i.e. 17-48x under the
// dE 3-4 naked-eye floor the condition layer cites — and it is the
// coarsest bandwidth that still passes the field's own resolution wants (the
// grid comment above chose 9.92 mm cells to resolve the rack footprint and
// the pocket mouths; sigma = R already costs 99.3% of the rack ball-pitch
// contrast and 71% of the pocket-mouth contrast, so widening it further is
// not available).  Its value is unchanged this round; only the justification
// is, because the old one was a physics claim the physics does not support.
// READ THAT 17-48x NARROWLY.  The split-half halves are two deterministic
// sub-blocks of one unscrambled Halton sequence, so their spread is not a
// standard error and 17-48x is not a statement about the distance from the
// truth.  It says the estimate is INSENSITIVE to which half of this ensemble
// produced it at this bandwidth, which is what a bandwidth choice needs, and
// it says nothing more.  See the independence caveat on `breakDraw`.
//
// WHAT IT CANNOT DO, measured: this Gaussian is not an instrument for hiding
// a coarse sampling grid.  Suppressing a 160 mm comb to a tenth of itself
// needs sigma = 54.6 mm and to a hundredth sigma = 77.3 mm = 2.7 R, which
// collapses the rack-depth transfer to 0.049 and the pocket-mouth transfer to
// 1.2e-4 — erasing the table to hide a sampling artifact.  The comb is fixed
// in the SAMPLER (see `strataFor` above), never here.
const SIGMA_CELLS = BLUR_SIGMA_M / CELL;
// Grid dimensions are parameters, not the module constants, because the soil
// field below rides the SAME bandwidth on a larger footprint — one estimator,
// two grids, so widening the bake can never desynchronise the two artifacts.
function blur(g, nx = NX, ny = NY) {
  const rad = Math.ceil(3 * SIGMA_CELLS);
  const k = [];
  let ksum = 0;
  for (let i = -rad; i <= rad; i++) {
    const w = Math.exp(-(i * i) / (2 * SIGMA_CELLS * SIGMA_CELLS));
    k.push(w); ksum += w;
  }
  for (let i = 0; i < k.length; i++) k[i] /= ksum;
  const refl = (i, n) => (i < 0 ? -i - 1 : i >= n ? 2 * n - i - 1 : i);
  const tmp = new Float64Array(g.length);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      let a = 0;
      for (let i = -rad; i <= rad; i++) a += k[i + rad] * g[y * nx + refl(x + i, nx)];
      tmp[y * nx + x] = a;
    }
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      let a = 0;
      for (let i = -rad; i <= rad; i++) a += k[i + rad] * tmp[refl(y + i, ny) * nx + x];
      g[y * nx + x] = a;
    }
  }
}
blur(abr); blur(dep); blur(depCue);
blur(hand, NX2, NY2); blur(handLo, NX2, NY2); blur(handHi, NX2, NY2);
blur(mouth, NX2, NY2);

// ---- normalise ---------------------------------------------------------
function stats(g) {
  let sum = 0, max = 0;
  for (const v of g) { sum += v; if (v > max) max = v; }
  return { mean: sum / g.length, max };
}
const sa = stats(abr), sd = stats(dep);
for (let i = 0; i < abr.length; i++) { abr[i] /= sa.max; dep[i] /= sd.max; }
const DEP_MEAN = sd.mean / sd.max;          // needed by the runtime
const ABR_MEAN = sa.mean / sa.max;

// cue-ball-only sensitivity: how much would the deposit field move if the cue
// ball were treated as the sole carrier?
//
// MEAN-CENTRED (Pearson). The first cut of this reported an uncentred cosine
// similarity and called it a correlation, which flattered the answer badly:
// both dose maps sit on a broad positive baseline, and a cosine between two
// mostly-positive fields is near 1 almost regardless of how their STRUCTURE
// differs. It read 0.96 where the centred coefficient was 0.61 (review r1 P2).
// The structure is the whole question here, so the baseline has to come out.
const sc2 = stats(depCue);
let num = 0, dA = 0, dB = 0;
{
  let mA = 0, mB = 0;
  for (let i = 0; i < dep.length; i++) { mA += dep[i]; mB += depCue[i] / sc2.max; }
  mA /= dep.length; mB /= dep.length;
  for (let i = 0; i < dep.length; i++) {
    const a = dep[i] - mA, b = depCue[i] / sc2.max - mB;
    num += a * b; dA += a * a; dB += b * b;
  }
}
const CUE_ONLY_CORR = num / Math.sqrt(dA * dB);

// ---- soil field: normalise, sensitivity, encode -------------------------
// Both channels are PEAK-normalised.  Unlike the cloth deposit channel there
// is no whole-surface colour argument to anchor a mean to: the rail band is
// 24% of this footprint and the mouths are a few percent of that, so a
// grid-wide mean would mostly report how much empty bed the grid carries.
// The runtime needs the band mean anyway (the same residual-around-a-mean
// composition the cloth leg uses), so it is published over the OFF-BED cells
// — the ones a rail or a collar fragment can actually address.
const bandMask = new Uint8Array(NX2 * NY2);
let BAND_CELLS = 0;
{
  let n = 0;
  for (let y = 0; y < NY2; y++) {
    for (let x = 0; x < NX2; x++) {
      const wx = (x + 0.5) / NX2 * LX2 - LX2 / 2;
      const wy = (y + 0.5) / NY2 * LY2 - LY2 / 2;
      if (offBed(wx, wy)) { bandMask[y * NX2 + x] = 1; n++; }
    }
  }
  BAND_CELLS = n;
}
function bandStats(g) {
  let sum = 0, max = 0, n = 0;
  for (let i = 0; i < g.length; i++) {
    if (!bandMask[i]) continue;
    sum += g[i]; n++;
    if (g[i] > max) max = g[i];
  }
  return { mean: sum / n, max };
}
const sh = bandStats(hand), sm = bandStats(mouth);
for (let i = 0; i < hand.length; i++) {
  hand[i] /= sh.max; mouth[i] /= sm.max;
}
const HAND_MEAN = sh.mean / sh.max;
const MOUTH_MEAN = sm.mean / sm.max;

// Bridge-prior sensitivity: the whole uncited axis in one number.  Pearson
// over the rail band between the two ENDPOINTS of the taught range — if the
// 6-in and the 10-in player wear the same rail, the prior's width does not
// matter; if they do not, this says by how much and the reader can discount
// the field accordingly.  Mean-centred, for the reason the cue-ball
// sensitivity above records.
const BRIDGE_CORR = (() => {
  const a = bandStats(handLo), b = bandStats(handHi);
  let mA = 0, mB = 0, n = 0;
  for (let i = 0; i < handLo.length; i++) {
    if (!bandMask[i]) continue;
    mA += handLo[i] / a.max; mB += handHi[i] / b.max; n++;
  }
  mA /= n; mB /= n;
  let num2 = 0, dA2 = 0, dB2 = 0;
  for (let i = 0; i < handLo.length; i++) {
    if (!bandMask[i]) continue;
    const p = handLo[i] / a.max - mA, q = handHi[i] / b.max - mB;
    num2 += p * q; dA2 += p * p; dB2 += q * q;
  }
  return num2 / Math.sqrt(dA2 * dB2);
})();

const soilPx = new Uint8Array(NX2 * NY2 * 4);
for (let y = 0; y < NY2; y++) {
  for (let x = 0; x < NX2; x++) {
    // same row order as the cloth field: PNG row 0 is the FOOT rail (+y)
    const src = (NY2 - 1 - y) * NX2 + x;
    const o = (y * NX2 + x) * 4;
    soilPx[o] = Math.round(Math.sqrt(Math.min(1, hand[src])) * 255);
    soilPx[o + 1] = Math.round(Math.sqrt(Math.min(1, mouth[src])) * 255);
    soilPx[o + 2] = 0;
    soilPx[o + 3] = 255;
  }
}
const soilPng = encodePng(NX2, NY2, soilPx);
const soilSha = crypto.createHash('sha256').update(soilPng).digest('hex');
const soilPxSha = crypto.createHash('sha256').update(soilPx).digest('hex');

// The renderer ships the SIGNED RESIDUAL of the removal factor about its band
// mean (shading.js SPIKE_SOIL), because the rail albedos it modifies were
// solved against venue PHOTOGRAPHS of a played table and so already carry a
// real rail's soiling — a layer that raised the mean would assert dirt the
// reference does not show. That makes K = <r> over the rail band a load-bearing
// runtime constant, so it is derived here rather than fitted there.
//
// Computed from the ENCODED TEXELS, not from the float fields: K has to be the
// mean of exactly what the sampler will read, 8-bit quantisation and all, or
// the residual it centres is centred on the wrong thing.
//
// SOIL_BETA lives here for the same reason. It is a model constant of the soil
// field (contact removal over background removal), r cannot be written without
// it, and K cannot be derived without r — so it belongs to the derivation and
// is mirrored into the runtime under gate, not authored twice.
const SOIL_BETA = 1;
const REMOVAL_MEAN = (() => {
  // the PUBLISHED means, not the full-precision ones: those are what the
  // runtime mirrors, so those are what r is built from on the GPU
  const HM = +HAND_MEAN.toFixed(6), MM = +MOUTH_MEAN.toFixed(6);
  let sum = 0, n = 0;
  for (let y = 0; y < NY2; y++) {
    for (let x = 0; x < NX2; x++) {
      // bandMask is in field row order; soilPx is flipped (row 0 = foot rail)
      if (!bandMask[(NY2 - 1 - y) * NX2 + x]) continue;
      const o = (y * NX2 + x) * 4;
      const h = (soilPx[o] / 255) ** 2, m = (soilPx[o + 1] / 255) ** 2;
      sum += 1 / (1 + SOIL_BETA * (h / HM + m / MM));
      n++;
    }
  }
  return sum / n;
})();

// ---- encode ------------------------------------------------------------
// sqrt-encoded 8-bit (decode: v = s*s) — halves the quantisation step at the
// low end, where almost the whole bed lives, at no cost in the hot cells.
const px = new Uint8Array(NX * NY * 4);
for (let y = 0; y < NY; y++) {
  for (let x = 0; x < NX; x++) {
    // PNG row 0 is the top of the image; put the FOOT rail (+y) there so the
    // artifact previews the way the table is drawn in the app.
    const src = (NY - 1 - y) * NX + x;
    const o = (y * NX + x) * 4;
    px[o] = Math.round(Math.sqrt(Math.min(1, abr[src])) * 255);
    px[o + 1] = Math.round(Math.sqrt(Math.min(1, dep[src])) * 255);
    px[o + 2] = 0;
    px[o + 3] = 255;
  }
}
const png = encodePng(NX, NY, px);
// TWO hashes, because they answer two different questions and conflating them
// is what made the first version of the CI gate red on day one.
//
//   pxSha  hashes the DECODED RGBA field. This is the derivation's content and
//          it is what "did the field drift" means. Measured stable across node
//          majors: re-deriving on node 22 and diffing against the node 26
//          artifact gives 0 of 32768 texels differing in any channel, max
//          delta 0.
//   sha    hashes the ENCODED file. Same pixels, different deflate: node 22
//          and node 26 ship different zlib versions and emit different byte
//          streams for identical input. So this one identifies the FILE that
//          was committed, not the field it holds, and it is only ever compared
//          against the manifest written beside that same file.
const sha = crypto.createHash('sha256').update(png).digest('hex');
const pxSha = crypto.createHash('sha256').update(px).digest('hex');

// `--probe-dump=<path>`: the block-comparison exit. Writes a batch's field at
// FULL DOUBLE PRECISION, because the difference between two batches lives well
// under the 8-bit step the artifact ships at and diffing the quantised PNGs
// would measure the quantiser instead. Peak-normalised exactly as the artifact
// is, with both peaks carried alongside so absolute doses stay comparable.
//
// WHAT A TWO-BATCH DIFF OFF THIS CAN AND CANNOT ANSWER.  It used to be called
// the "convergence probe" and described as separating how much of the field is
// the ensemble from how much is the sample.  Withdrawn: it cannot do that.  Two
// batches drawn from disjoint blocks of one unscrambled Halton sequence carry no
// randomisation, so the split they would need to perform is not defined on them
// (see the independence caveat on `breakDraw`).  What the diff reports is how
// far apart two SPECIFIED blocks land.  Large disagreement is real evidence of a
// problem; close agreement is necessary for convergence and not sufficient for
// it, and bounds nothing.
// Stops before the manifest: a probe batch is a DIFFERENT ensemble, so gating
// it against the committed artifact would be a category error.
if (PROBE_DUMP) {
  const meta = {
    rack_base: RACK_BASE, racks: RACKS, break_x_m: BREAK_X,
    break_fullness_m: FULLNESS,
    break_draw: {
      ball_speed_ms: drawStat(drawAcc.v),
      aim_error_deg: drawStat(drawAcc.dphi, 180 / Math.PI),
      tip_a_r: drawStat(drawAcc.a), tip_b_r: drawStat(drawAcc.b),
    },
    games: nBreaks, shots: nShots,
    potted: nPotted, missed: nMissed, rejected: nRejected,
    nine_legal_rack_over: nNineWin, nine_fouled_and_spotted: nNineSpot,
    fouls: foulHist, abrasion_peak: sa.max, deposit_peak: sd.max,
    abrasion_mean_over_peak: ABR_MEAN, deposit_mean_over_peak: DEP_MEAN,
    pixels_sha256: pxSha, nx: NX, ny: NY,
    row0: 'field row 0 = kernel y = -LY/2 (HEAD rail); the PNG emit flips it',
  };
  fs.writeFileSync(`${PROBE_DUMP}.json`, JSON.stringify(meta, null, 2) + '\n');
  fs.writeFileSync(`${PROBE_DUMP}.abr.f64`, Buffer.from(abr.buffer, 0, abr.byteLength));
  fs.writeFileSync(`${PROBE_DUMP}.dep.f64`, Buffer.from(dep.buffer, 0, dep.byteLength));
  fs.writeFileSync(`${PROBE_DUMP}.png`, png);
  console.log(`probe: ${PROBE_DUMP} racks ${RACK_BASE}..${RACK_BASE + RACKS - 1} `
    + `x ${BREAK_X.length} break-x x ${FULLNESS.length} fullness = ${nBreaks} `
    + `games, ${nShots} shots, pxsha ${pxSha.slice(0, 12)}`);
  process.exit(0);
}

// `--no-overlay` is not a mode anyone bakes in: it exists so `--gate-overlay`
// can run this tool against itself (see the gate at the end). It reports the
// field it derived and stops before any comparison with the committed
// manifest, which it would obviously differ from on the rule basis.
if (!RULE_35_OVERLAY) {
  console.log(`NO-OVERLAY-SHA ${pxSha}`);
  console.log(`NO-OVERLAY-COUNTERS ${JSON.stringify({
    shots: nShots, nine_legal_rack_over: nNineWin,
    nine_fouled_and_spotted: nNineSpot })}`);
  process.exit(0);
}

const manifest = {
  tool: 'tools/derive-cloth-traffic.mjs',
  kernel: KERNEL,
  // The referee that adjudicated the ensemble, so the field's rule basis is
  // pinned the same way its physics basis is.
  rules: {
    ruleset: 'nineball-v1',
    artifact: 'web/dist/pool-rules (committed)',
    version: RULES_VERSION,
    authority: 'WPA "Rules of Play" eff. 2025-09-15 (clause audit: '
      + 'docs/research/rules-audit/audit-9ball.md)',
    overlay: RULE_35_OVERLAY
      ? 'WPA 3.5 ball-driven-off-the-table foul, absent from v1 '
        + '(audit-9ball.md §6) — applied here'
      : 'none',
  },
  grid: {
    nx: NX, ny: NY, width_m: LX, length_m: LY,
    cell_mm: +(CELL * 1000).toFixed(3),
    // The resolution bound above, published so consumers do not restate it.
    // web/tools/capture-542-cloth.mjs reads it to band its spatial-mapping
    // probe by the physical blur radius: a masked copy of this field must be
    // ambiguous within one sigma of the mask cut and clean beyond three, and
    // that is only checkable against the sigma the bake actually used.
    blur_sigma_cells: +SIGMA_CELLS.toFixed(4),
    blur_sigma_mm: +(SIGMA_CELLS * CELL * 1000).toFixed(3),
  },
  encoding: 'RGBA8, R=abrasion G=deposit, sqrt-encoded (v = s*s), row 0 = foot rail',
  ensemble: {
    racks: RACKS,
    // The break parameter distribution, published in full: every support is
    // cited, every stratum count is derived from the ripple criterion, and
    // the four continuous axes publish their REALISED marginals below so a
    // reader can check the draw instead of trusting this description.
    break: {
      cue_x_m: {
        law: 'uniform, stratified at stratum centres',
        support_m: [-KITCHEN_HALF_X, KITCHEN_HALF_X],
        support_cite: 'the shipped kitchen clamp, web/app/game.js placeCue '
          + '(|x| <= LX/2 - R - eps); WPA 2.1/3.10 head-string rights',
        shape_cite: 'NONE — stated-ignorance prior over the cited support',
        strata: BREAK_X.length,
        stratum_rule: `comb ripple <= ${RIPPLE_MAX} against the bake blur `
          + `(sigma = ${(BLUR_SIGMA_M * 1000).toFixed(3)} mm)`,
        spacing_mm: +((2 * KITCHEN_HALF_X / BREAK_X.length) * 1000).toFixed(3),
        residual_ripple: +combRipple(2 * KITCHEN_HALF_X / BREAK_X.length,
          BLUR_SIGMA_M).toExponential(3),
        centres_m: BREAK_X.map((v) => +v.toFixed(6)),
      },
      fullness_m: {
        law: 'uniform, stratified at stratum centres',
        support_m: [-FULLNESS_MAX, FULLNESS_MAX],
        support_cite: 'examples/paper/exp_e3_break.py:150-153 FULLNESS — '
          + 'square (0) to quarter_off (R/2, a 3/4-full hit, cut angle '
          + 'asin(0.25) ~ 14.5 deg, HSV 7.7); signed here',
        shape_cite: 'NONE — stated-ignorance prior over the cited support',
        strata: FULLNESS.length,
        stratum_rule: `comb ripple <= ${RIPPLE_MAX} against the ICGA aim `
          + `error read at the apex (sigma = `
          + `${(FULLNESS_SIGMA_M * 1000).toFixed(3)} mm)`,
        spacing_mm: +((2 * FULLNESS_MAX / FULLNESS.length) * 1000).toFixed(3),
        residual_ripple: +combRipple(2 * FULLNESS_MAX / FULLNESS.length,
          FULLNESS_SIGMA_M).toExponential(3),
        centres_m: FULLNESS.map((v) => +v.toFixed(6)),
      },
      ball_speed_ms: {
        law: 'uniform, continuous',
        support_ms: [BREAK_LO, BREAK_HI],
        support_cite: 'docs/research/gap-break-multibody.md:35 (24 mph) and '
          + 'break-cueball-rebound-evidence.md:55 (Dr. Dave, 30 mph)',
        shape_cite: 'NONE — stated-ignorance prior over the cited support',
      },
      aim_error_deg: {
        law: 'gaussian, zero mean',
        sigma_deg: 0.125,
        cite: 'ICGA skill model 1x — Archibald, Altman & Shoham, AAMAS 2010 '
          + 'Sec 2.2.1; adopted as canonical in rl-agent-program.md:840, '
          + 'units verified at :3837.  1x is CONSERVATIVE for a break.',
      },
      tip_a_r: {
        law: 'gaussian', mean_r: 0, sigma_mm: 0.5,
        cite: 'intended 0 (no citation exists for deliberate sidespin on a '
          + 'break); sigma = ICGA sigma_a',
      },
      tip_b_r: {
        law: 'gaussian', mean_r: B_TIP_R, sigma_mm: 0.5,
        cite: 'mean = the shipped break gate pin, exp_e3_break.py:155-157 '
          + '(HSV B.43 scenario 1, "stun (very slight draw)"); '
          + 'sigma = ICGA sigma_b',
      },
      elevation_deg: {
        law: 'fixed 0',
        cite: 'ICGA sigma_theta = 0.1 deg NOT applied — this ensemble models '
          + 'no cue elevation anywhere, and elevating the break alone would '
          + 'make it the only elevated stroke in the field',
      },
      sequence: 'Halton radical inverse, bases 2 (speed), 3+5 and 7+11 '
        + '(Box-Muller pairs for the normals); index = (seed * break-x strata '
        + '+ xi) * fullness strata + fi, so a disjoint rack-seed block moves '
        + 'the execution axes too',
      sequence_independence: 'NOT independent between batches. Halton here is '
        + 'deterministic and unscrambled, so disjoint seed blocks are disjoint '
        + 'index ranges of one sequence, with no randomisation and therefore '
        + 'no sampling distribution: "standard error" is undefined for them, '
        + 'not merely optimistic. A two-batch diff measures how far apart '
        + 'those two specified blocks land and bounds the integration error '
        + 'in NEITHER direction. Estimating an error needs several randomised '
        + 'QMC replicates (Owen scrambles or Cranley-Patterson shifts) with '
        + 'the spread taken across them — several, not one: R1 followup, not '
        + 'implemented. The rack axis is exempt — micro-gaps come from the '
        + 'kernel seeded generator.',
      games: RACKS * BREAK_X.length * FULLNESS.length,
    },
    play_ball_speed_ladder_ms: PLAY_LADDER.map((v) => +v.toFixed(4)),
    shots: nShots, potted: nPotted, missed: nMissed, rejected: nRejected,
    // `shots` counts breaks too; `potted + missed` counts only the strokes
    // played FROM a layout, so the identity a reader should be able to check
    // is potted + missed + rejected + breaks = shots.
    breaks: nBreaks,
    nine_legal_rack_over: nNineWin, nine_fouled_and_spotted: nNineSpot,
    // Zero-count categories are PRESENT (seeded from the referee's catalog),
    // so a missing key means the ruleset cannot emit that code, not that it
    // happened not to.
    fouls: Object.fromEntries(Object.entries(foulHist).sort()),
    foul_cites: { ...FOUL_CATALOG,
      'ball-off-table (WPA 3.5 overlay)': 'WPA 3.5 (overlay, see rules.overlay)' },
    // 26 = 24 + 2, published as three numbers instead of two (r6 finding 2)
    off_table_shots: nRule35Foul + nOffTableAlreadyFoul,
    rule_35_overlay_fouls: nRule35Foul,
    off_table_already_foul_under_v1: nOffTableAlreadyFoul,
    rule_35_overlay_changed_nine: nRule35Changed9,
  },
  // Statements the ensemble must satisfy for the sentence "this is what a
  // rules-legal ensemble puts on the cloth" to hold. They are ASSERTED at
  // derivation time (see below) and published so a reader can see what was
  // asserted rather than take the sentence on trust.
  invariants: INVARIANTS,
  derived: {
    abrasion_mean_over_peak: +ABR_MEAN.toFixed(6),
    deposit_mean_over_peak: +DEP_MEAN.toFixed(6),
    cue_ball_only_deposit_pearson_r: +CUE_ONLY_CORR.toFixed(4),
    tau_slide_check_slides: nSlides,
    tau_slide_check_worst_s: +tauErrMax.toExponential(3),
  },
  // The field's identity (see the two-hash note above): `pixels_sha256` is the
  // one a re-derivation is gated on, `sha256` identifies the committed file.
  pixels_sha256: pxSha,
  sha256: sha,
};

// The soil manifest: its own file, because it describes its own artifact and
// a reader who opens soil.json should not have to know that the ensemble is
// documented next door.  `ensemble_from` is the pointer that keeps the two
// honest — the counts are NOT duplicated here, so they cannot disagree.
const soilManifest = {
  tool: 'tools/derive-cloth-traffic.mjs',
  kernel: KERNEL,
  ensemble_from: 'web/assets/cloth/traffic.json',
  ensemble_pixels_sha256: pxSha,
  grid: {
    nx: NX2, ny: NY2,
    width_m: +LX2.toFixed(6), length_m: +LY2.toFixed(6),
    bed_width_m: LX, bed_length_m: LY,
    rail_band_m: +SOIL_BAND.toFixed(6),
    rail_band_cite: 'web/scene/table.js TABLE_SPECS default frameWidth 0.145 '
      + '+ WPA nominal 2" cushion width 0.0508, rounded to 20 cells',
    cell_mm: +(CELL * 1000).toFixed(3),
    band_cells: BAND_CELLS,
    blur_sigma_mm: +(BLUR_SIGMA_M * 1000).toFixed(3),
  },
  encoding: 'RGBA8, R=hand G=mouth, sqrt-encoded (v = s*s), row 0 = foot rail',
  model: {
    hand: {
      law: 'one unit of dose per stroke, bridge-hand disc, rail band only',
      bridge_length_m: [BRIDGE_LO, BRIDGE_HI],
      bridge_length_shape_cite:
        'NONE — stated-ignorance uniform prior over the taught 6-10 in range; '
        + 'no bridge station is cited anywhere in this repo',
      bridge_quadrature_nodes: BRIDGE_NODES,
      hand_radius_m: HAND_R,
      hand_radius_cite: 'NONE — modelled uniform disc (palm heel + finger '
        + 'pads); under the sigma = R_ball bake it carries no spectral '
        + 'content the Gaussian does not dominate',
      not_modelled: 'hip and forearm lean on the rail — nothing published',
    },
    mouth: {
      law: 'one unit of dose per BallPocket event, continued 2R into the '
        + 'throat along the sampled entry heading',
      heading_window_s: 4e-3,
    },
    // the response model's one shape constant: contact removal over background
    // removal. Estimated — nothing published relates the two for a billiard
    // rail. beta = 1 puts a mean-traffic cell at a third of an untouched one.
    beta: SOIL_BETA,
  },
  counts: {
    strokes: nStance,
    strokes_with_hand_on_rail: nStanceOnRail,
    hand_on_rail_fraction: +(nStanceOnRail / Math.max(1, nStance)).toFixed(6),
    pocket_entries: nPots,
  },
  derived: {
    hand_band_mean_over_peak: +HAND_MEAN.toFixed(6),
    mouth_band_mean_over_peak: +MOUTH_MEAN.toFixed(6),
    bridge_prior_endpoint_pearson_r: +BRIDGE_CORR.toFixed(4),
    removal_band_mean: +REMOVAL_MEAN.toFixed(6),
  },
  pixels_sha256: soilPxSha,
  sha256: soilSha,
};

// `--gate-overlay`: the runnable remainder of the retired byte-identity
// comparison (see THE ONE OVERLAY above). The overlay's own counters say it
// fouls `rule_35_overlay_fouls` shots and changes the 9's fate on
// `rule_35_overlay_changed_nine` of them; when the latter is zero the overlay
// cannot have moved a ball, and a field derived WITHOUT it must therefore come
// out byte for byte the same. That is a claim about this run, not a fact about
// this tool — if a future ensemble ever does hand the overlay a rack-ending 9,
// the shas diverge and the gate says so instead of the comment quietly ageing.
// Deliberately a flag and not part of the default path: it doubles the
// derivation (~2x the ensemble), so it belongs in the pack run, not in every
// invocation.
if (process.argv.includes('--gate-overlay')) {
  const self = fileURLToPath(import.meta.url);
  const out = execFileSync(process.execPath, [self, '--no-overlay'],
    { encoding: 'utf8', maxBuffer: 1 << 24 });
  const off = out.match(/^NO-OVERLAY-SHA ([0-9a-f]{64})$/m)?.[1];
  const offCounters = out.match(/^NO-OVERLAY-COUNTERS (.*)$/m)?.[1];
  if (!off) {
    console.error('gate-overlay: no sha from the --no-overlay run'); process.exit(1);
  }
  const expectSame = nRule35Changed9 === 0;
  const same = off === pxSha;
  console.log(`gate-overlay: overlay fouled ${nRule35Foul} shots and changed `
    + `the 9 on ${nRule35Changed9}; field with=${pxSha.slice(0, 12)} `
    + `without=${off.slice(0, 12)} (${same ? 'identical' : 'DIFFERENT'})`);
  console.log(`gate-overlay: without-overlay counters ${offCounters}`);
  if (same !== expectSame) {
    console.error(expectSame
      ? 'gate-overlay: FAIL — the overlay changed the 9 on no shot yet moved '
        + 'the field. Something other than adjudication depends on the flag.'
      : `gate-overlay: FAIL — the overlay changed the 9 on ${nRule35Changed9} `
        + 'shots yet the field is unchanged. The playout is ignoring the verdict.');
    process.exit(1);
  }
  console.log('gate-overlay: OK');
}

if (WRITE) {
  // Only rewrite the PNG when its PIXELS changed. Re-encoding an unchanged
  // field on a different node major emits a different deflate stream, which
  // would show up as a binary diff in git and invalidate `sha256` for a file
  // that holds exactly the same 32768 texels it held before. Keeping the
  // committed bytes when the content is unchanged is what makes `sha256` mean
  // "this is the file that shipped".
  const keep = fs.existsSync(OUT_PNG)
    && Buffer.compare(decodePng(OUT_PNG).data, px) === 0;
  if (keep) {
    manifest.sha256 = crypto.createHash('sha256')
      .update(fs.readFileSync(OUT_PNG)).digest('hex');
  } else {
    fs.writeFileSync(OUT_PNG, png);
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(manifest, null, 2) + '\n');
  // the soil artifact, same keep-the-committed-bytes rule and same reason
  fs.mkdirSync(path.dirname(SOIL_PNG), { recursive: true });
  const soilKeep = fs.existsSync(SOIL_PNG)
    && Buffer.compare(decodePng(SOIL_PNG).data, soilPx) === 0;
  if (soilKeep) {
    soilManifest.sha256 = crypto.createHash('sha256')
      .update(fs.readFileSync(SOIL_PNG)).digest('hex');
  } else {
    fs.writeFileSync(SOIL_PNG, soilPng);
  }
  fs.writeFileSync(SOIL_JSON, JSON.stringify(soilManifest, null, 2) + '\n');
  console.log(soilKeep
    ? `kept ${path.relative(ROOT, SOIL_PNG)} (pixels unchanged)`
    : `wrote ${path.relative(ROOT, SOIL_PNG)} ${soilPng.length} bytes`);
  console.log(JSON.stringify(soilManifest.derived, null, 2));
  console.log(JSON.stringify(soilManifest.counts));
  console.log(keep
    ? `kept ${path.relative(ROOT, OUT_PNG)} (pixels unchanged; not re-encoded)`
    : `wrote ${path.relative(ROOT, OUT_PNG)} ${png.length} bytes`);
  console.log(JSON.stringify(manifest.derived, null, 2));
  console.log('shots', nShots, 'potted', nPotted, 'missed', nMissed);
  console.log(JSON.stringify(manifest.ensemble.fouls));
  console.log('9 legal', nNineWin, '| 9 spotted', nNineSpot,
    '| 3.5 overlay fouls', nRule35Foul, 'of which changed the 9:',
    nRule35Changed9);
} else {
  let bad = 0;
  if (!fs.existsSync(OUT_PNG) || !fs.existsSync(OUT_JSON)) {
    console.error('artifact missing — run with --write'); process.exit(1);
  }
  const have = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
  // Three checks over two hashes, in the order a failure is easiest to read.
  //
  // (1) FIELD DRIFT — the derivation against the committed field, compared as
  //     decoded texels. This is the check the CI job exists for and the only
  //     one that is a statement about the model rather than about the files.
  const bytes = fs.readFileSync(OUT_PNG);
  const hadPx = decodePng(OUT_PNG).data;
  if (Buffer.compare(hadPx, px) !== 0) {
    let n = 0, worst = 0;
    for (let i = 0; i < px.length; i++) {
      const d = Math.abs(hadPx[i] - px[i]);
      if (d) { n++; worst = Math.max(worst, d); }
    }
    console.error(`field drift: ${n} of ${px.length} committed channel samples `
      + `differ from the derivation (worst |delta| ${worst})`);
    bad++;
  }
  // (2) The manifest's record of the field, against the field itself. Catches
  //     a manifest hand-edited away from the artifact it describes.
  if (have.pixels_sha256 !== pxSha) {
    console.error(`manifest pixels_sha256 ${have.pixels_sha256} != derived ${pxSha}`);
    bad++;
  }
  // (3) The committed FILE against the manifest written beside it. This one is
  //     about bytes on purpose: it catches the PNG being replaced or re-encoded
  //     without the manifest being regenerated. It is NOT compared against a
  //     freshly encoded stream, because deflate output is node-version
  //     dependent and that comparison was red on any runtime but the
  //     generator's.
  const fileSha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (fileSha !== have.sha256) {
    console.error(`committed PNG file ${fileSha} != its manifest sha256 ${have.sha256}`);
    bad++;
  }
  for (const k of Object.keys(manifest.derived)) {
    if (JSON.stringify(have.derived?.[k]) !== JSON.stringify(manifest.derived[k])) {
      console.error(`derived.${k}: committed ${have.derived?.[k]} != ${manifest.derived[k]}`);
      bad++;
    }
  }
  // The rule basis and the outcome counters are gated too: a ruleset change
  // that leaves the FIELD identical still invalidates the sentence "this is
  // what a rules-legal ensemble puts on the cloth", and that sentence is
  // what the pack is asked to defend.
  // The kernel is gated for the same reason as the rules block, one level up:
  // the field's whole claim is "this is what the CANONICAL wasm's own slip
  // integrals put on the cloth". Re-pinning the wasm without re-deriving would
  // leave traffic.json attributing the field to a binary that no longer ships,
  // and a pin that happens not to move these texels is exactly the case no
  // pixel comparison can catch.
  if (have.kernel !== KERNEL) {
    console.error(`kernel: committed ${have.kernel} != ${KERNEL}`); bad++;
  }
  for (const [grp, k] of [['rules', null], ['ensemble', 'fouls'],
    ['ensemble', 'rule_35_overlay_fouls'],
    ['ensemble', 'rule_35_overlay_changed_nine'],
    ['ensemble', 'nine_legal_rack_over'],
    ['ensemble', 'nine_fouled_and_spotted']]) {
    const a = k === null ? have[grp] : have[grp]?.[k];
    const b = k === null ? manifest[grp] : manifest[grp][k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      console.error(`${grp}${k ? '.' + k : ''}: committed `
        + `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
      bad++;
    }
  }
  // The two ratios are MIRRORED into the runtime (clothvisuals.js CLOTH_TRAFFIC)
  // because the shader needs them per frame and cannot read a manifest. A silent
  // drift there would not change a pixel of the committed PNG, so nothing above
  // would catch it — and it would break the anchoring quietly: deposit is
  // MEAN-anchored, so a stale deposit ratio moves the bed average away from the
  // coverage band the whole §7.2 colour argument is built on.
  const RT = await import(path.join(ROOT, 'web/scene/clothvisuals.js'));
  for (const [key, want] of [
    ['abrasionMeanOverPeak', manifest.derived.abrasion_mean_over_peak],
    ['depositMeanOverPeak', manifest.derived.deposit_mean_over_peak],
  ]) {
    if (RT.CLOTH_TRAFFIC?.[key] !== want) {
      console.error(`clothvisuals CLOTH_TRAFFIC.${key}: `
        + `${RT.CLOTH_TRAFFIC?.[key]} != derived ${want}`);
      bad++;
    }
  }
  const wantUrl = './assets/cloth/' + path.basename(OUT_PNG);
  if (RT.CLOTH_TRAFFIC?.url !== wantUrl) {
    console.error(`clothvisuals CLOTH_TRAFFIC.url: `
      + `${RT.CLOTH_TRAFFIC?.url} != ${wantUrl}`);
    bad++;
  }
  // ---- the soil artifact, gated the same three ways ---------------------
  if (!fs.existsSync(SOIL_PNG) || !fs.existsSync(SOIL_JSON)) {
    console.error('soil artifact missing — run with --write'); bad++;
  } else {
    const soilBytes = fs.readFileSync(SOIL_PNG);
    const haveSoil = JSON.parse(fs.readFileSync(SOIL_JSON, 'utf8'));
    const hadSoilPx = decodePng(SOIL_PNG).data;
    if (Buffer.compare(hadSoilPx, soilPx) !== 0) {
      let n = 0, worst = 0;
      for (let i = 0; i < soilPx.length; i++) {
        const d = Math.abs(hadSoilPx[i] - soilPx[i]);
        if (d) { n++; worst = Math.max(worst, d); }
      }
      console.error(`soil field drift: ${n} of ${soilPx.length} committed `
        + `channel samples differ from the derivation (worst |delta| ${worst})`);
      bad++;
    }
    if (haveSoil.pixels_sha256 !== soilPxSha) {
      console.error(`soil manifest pixels_sha256 ${haveSoil.pixels_sha256} `
        + `!= derived ${soilPxSha}`);
      bad++;
    }
    const soilFileSha = crypto.createHash('sha256')
      .update(soilBytes).digest('hex');
    if (soilFileSha !== haveSoil.sha256) {
      console.error(`committed soil PNG file ${soilFileSha} != its manifest `
        + `sha256 ${haveSoil.sha256}`);
      bad++;
    }
    for (const k of Object.keys(soilManifest.derived)) {
      if (JSON.stringify(haveSoil.derived?.[k])
        !== JSON.stringify(soilManifest.derived[k])) {
        console.error(`soil derived.${k}: committed ${haveSoil.derived?.[k]} `
          + `!= ${soilManifest.derived[k]}`);
        bad++;
      }
    }
    // The stroke and entry counters are gated for the reason the cloth
    // field's outcome counters are: a change that leaves the texels alone
    // still invalidates "this is what N rules-legal strokes put on the rail".
    for (const k of Object.keys(soilManifest.counts)) {
      if (JSON.stringify(haveSoil.counts?.[k])
        !== JSON.stringify(soilManifest.counts[k])) {
        console.error(`soil counts.${k}: committed ${haveSoil.counts?.[k]} `
          + `!= ${soilManifest.counts[k]}`);
        bad++;
      }
    }
    // The soil manifest names the cloth run it shares an ensemble with. If
    // that pointer goes stale the two artifacts were derived from different
    // playouts, which no pixel comparison on either one would catch.
    if (haveSoil.ensemble_pixels_sha256 !== pxSha) {
      console.error(`soil ensemble_pixels_sha256 `
        + `${haveSoil.ensemble_pixels_sha256} != ${pxSha}`);
      bad++;
    }
    // Same mirror law as CLOTH_TRAFFIC: the runtime cannot read a manifest.
    const RS = await import(path.join(ROOT, 'web/scene/tablesoil.js'));
    for (const [key, want] of [
      ['handBandMeanOverPeak', soilManifest.derived.hand_band_mean_over_peak],
      ['mouthBandMeanOverPeak', soilManifest.derived.mouth_band_mean_over_peak],
      // K and beta are what centre the shipped residual: drift in either
      // silently walks the whole rail band off its photo-solved albedo, which
      // is the one thing this layer promises it can never do.
      ['removalBandMean', soilManifest.derived.removal_band_mean],
      ['beta', soilManifest.model.beta],
    ]) {
      if (RS.TABLE_SOIL?.[key] !== want) {
        console.error(`tablesoil TABLE_SOIL.${key}: `
          + `${RS.TABLE_SOIL?.[key]} != derived ${want}`);
        bad++;
      }
    }
    const wantSoilUrl = './assets/table/' + path.basename(SOIL_PNG);
    if (RS.TABLE_SOIL?.url !== wantSoilUrl) {
      console.error(`tablesoil TABLE_SOIL.url: ${RS.TABLE_SOIL?.url} `
        + `!= ${wantSoilUrl}`);
      bad++;
    }
    // The runtime maps the field PIECEWISE (shading.js SPIKE_SOIL): the bed
    // half stretches with the table, the rail band stays in absolute metres.
    // So it needs both the band's share of the footprint (to find the seam)
    // and the band's width in metres (to walk out from it). A drift in either
    // silently slides the whole band off the rail.
    for (const [key, want] of [
      ['bandFracX', +(SOIL_BAND / (LX2 / 2)).toFixed(6)],
      ['bandFracY', +(SOIL_BAND / (LY2 / 2)).toFixed(6)],
      ['bandM', soilManifest.grid.rail_band_m],
    ]) {
      if (RS.TABLE_SOIL?.[key] !== want) {
        console.error(`tablesoil TABLE_SOIL.${key}: `
          + `${RS.TABLE_SOIL?.[key]} != derived ${want}`);
        bad++;
      }
    }
  }
  console.log(bad ? `FAIL (${bad})`
    : 'OK — committed traffic and soil fields match the derivation');
  process.exit(bad ? 1 : 0);
}
