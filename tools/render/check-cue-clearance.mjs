// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-cue-clearance.mjs — numeric gate for the geometric minimum cue
// elevation (issue #47, web/scene/cuestick.js cueMinElevationDeg): the cue
// is a rigid rod, so when its backward extension crosses a rail band the
// underside must clear the band's TOP plane — a position/azimuth/tip-offset
// dependent elevation floor. Runs under plain node against the committed
// real three module (lib/ensure-three.mjs), same bootstrap as
// check-cushion-profile.mjs. Asserts:
//   1. hand-computed steepest case: cue ball FROZEN on the long-rail
//      cushion, shooting perpendicular away — the binding constraint is the
//      tip station (s = 0) inside the cushion band, so the floor has the
//      closed form  asin((railTop + r_ferrule + clear − ballY)/(R + gap));
//   2. table-center floor is small (the 1.48 m cue still out-reaches the
//      9-ft half-table, so it is NOT zero there) and exactly 0 once the
//      backward ray exits inside the table (injected oversized geom, and
//      the 12-ft snooker entry along its long axis);
//   3. monotonicity: the floor never increases as the ball moves off the
//      rail, and reaches 0 far away;
//   4. tip offset: +b (high tip) lowers the floor, −b raises it (poseCue
//      contact-point shift); side spin a alone leaves a perpendicular
//      shot's floor unchanged; phi wraparound is a no-op;
//   5. per-catalog-entry sanity (12-ft snooker dims, pocketless carom rail
//      bands included) with the entry's OWN ball radius (F3, review
//      2026-07-21: ballR = render.profileBallD / 2 — snooker/carom balls
//      differ from pool): frozen-rail floors land in the physical 25–55°
//      band, center floors stay under 4°;
//   6. pocket-mouth carve (F1, review 2026-07-21): a butt extension over a
//      side/corner pocket OPENING owes no elevation (floor 0) while the
//      same spot aiming at the rail BESIDE the mouth keeps the full floor;
//      the jaw-margin edge still obstructs; the CEBP template family
//      (snooker) carves through its throat-derived corridors too;
//   7. issue #57 — tip-disc reachability envelope (cueReachability /
//      cueClampTip): the deep-draw frozen-rail pin ≈ 56.47° (the SHARED
//      kernel-mirror number — pool-core cue_clearance unit tests pin the
//      same value), the EMPTY dead set at the shipped ELEVATION_MAX_DEG
//      cap (parsed from aimwidgets.js by the ui_envelope.rs convention),
//      dead cells + exact boundary clamping under a reduced 40° probe cap,
//      grid-vs-direct-solve consistency, center-table full-disc
//      reachability, and the jaws-adjacent case (carved open post-F1; the
//      mouths-stripped control keeps the old solid-band floor + envelope);
//   8. butt-station reach transition: HARDCODED bracketing stations pin
//      CUE_LEN against kernel-mirror drift (pool-core cue_clearance pins
//      the same 1.5146/1.5166 pair — review F-cue-len 2026-07-21);
//   12. issue #64 — SPHERE obstacles (every other ball joins the clearance
//      set): the edge-case matrix against an INDEPENDENT tangency solve
//      (D·sinθ = ballR + margin + cueR(D·cosθ − reach), derived honestly —
//      no shared code with the module), the frozen-to-ball ≈ 40.35° and
//      screenshot-repro 2.2R-gap ≈ 18.16° pins SHARED with
//      cue_clearance::tests, lateral graze ±ε, in-front/beyond-reach
//      zeros, multi-ball + rail max composition, pocket-carve-corridor
//      balls, tip-offset monotonicity (the cueClampTip contract) with an
//      obstacle, discipline radii, a monotone clears(θ) sweep, probe-cap
//      dead cells + boundary clamp with an obstacle, the memo-sig
//      invalidation when a ball moves (runtime-geom path), and [k] the
//      review-2026-07-21 F1 draw-dip repro: under b = −0.5 the raw at-θ
//      clearance of a laterally offset behind ball DIPS below its θ=0
//      value (non-monotone clears — the pre-envelope floor said 0 while
//      3° clipped the ball), so the per-ball predicate is the MONOTONE
//      LOWER ENVELOPE and the floor is pinned ≈ 5.364° against an
//      independent swept-envelope scan (kernel twin pins the same number).
// Solid-rail placements sit at x = 0.5 — clear of the side-pocket corridor
// the carve opened at x = 0 (pre-carve they sat at x = 0).
//
//   node web/tools/render/check-cue-clearance.mjs
import fs from 'node:fs';
import path from 'node:path';

import { ensureRealThree, repoRoot, repoUrl } from './lib/ensure-three.mjs';

ensureRealThree(); // the committed real three module (issue #308 — no stub)
const repo = repoRoot;
const { TABLE_SPECS, makeGeom, railPolysFor, cushionProfile,
  SCRIPTED_PIN_TABLE_ID, pocketMouthObstacles }
  = await import(repoUrl('web/scene/table.js'));
const { cueMinElevationDeg, cueReachability, cueClampTip,
  railMouthsForKernel, CUE_DIMS }
  = await import(repoUrl('web/scene/cuestick.js'));
const { R } = await import(repoUrl('web/scene/balls.js'));

let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL:', msg); };
const DEG = Math.PI / 180;
const JAW_MARGIN = 0.010; // mirrors cuestick.js JAW_MARGIN (carve shrink)

/** Rail-clearance geom for a catalog entry — the same derivation cuestick's
 * activeRailGeom performs (cushionProfile zTop = the lofted cushion-cloth
 * rail top; frameTop = the wood rail plane). */
function geomFor(id) {
  const G = makeGeom(id);
  const zNose = G.kernel.noseHeightFrac * G.render.profileBallD;
  const prof = cushionProfile(G.render.cushionFamily, zNose, G.CW, G.render.cushionProfile);
  return {
    L: G.L, W: G.W, cushionWidth: G.CW,
    frameWidth: G.render.frameWidth, railTop: prof.zTop,
    frameTop: G.render.frameTop,
    // F1: pocket-mouth open corridors from the SHARED derivation the
    // runtime activeRailGeom uses; F3: the entry's own ball radius
    mouths: railMouthsForKernel(G.kernel),
    // GH-489 P1: raised mouth furniture (snooker binding roll + saddle
    // cap) — the same feature-detected derivation activeRailGeom uses
    bind: pocketMouthObstacles?.(id) ?? null,
    ballR: G.render.profileBallD / 2,
  };
}

/** Closed-form frozen-rail floor: tip station (s = 0) sits just inside the
 * cushion band, so the constraint is ballY + (ballR+gap)·sinθ ≥ railTop +
 * r_ferrule + clear (poseCue tip height; r(0) = R_FERRULE in the shared
 * ferrule→butt interpolation). ballR = the entry's ball radius (F3). */
const frozenClosedForm = (g, ballY = R, ballR = R) => {
  // b ≠ 0 keeps no closed form (cosθ term) — this stays a b = 0 form
  const s = (g.railTop + CUE_DIMS.R_FERRULE + CUE_DIMS.RAIL_CLEAR - ballY)
    / (ballR + CUE_DIMS.TIP_GAP);
  return Math.asin(s) / DEG;
};

const g0 = geomFor(SCRIPTED_PIN_TABLE_ID);

// ---- 1. hand-computed steepest case (default 9-ft pool entry) --------------
{
  // frozen on the +z long rail at x = 0.5 (solid band, off the side mouth)
  const pos = { x: 0.5, y: R, z: g0.W / 2 - R };
  const phi = Math.PI; // strike dir (0, −1): straight away; butt over the rail
  const got = cueMinElevationDeg(pos, phi, 0, 0, g0);
  const want = frozenClosedForm(g0);
  console.log(`frozen long rail: floor=${got.toFixed(3)}° `
    + `closed-form=${want.toFixed(3)}°`);
  if (Math.abs(got - want) > 0.05) {
    fail(`frozen-rail floor ${got}° != closed form ${want}°`);
  }
  // sanity: the tip really is inside the cushion band at the solution
  const nd = (R + CUE_DIMS.TIP_GAP) * Math.cos(want * DEG) - R;
  if (!(nd > 0 && nd < g0.cushionWidth)) {
    fail(`closed-form precondition broken: tip band offset ${nd}`);
  }
}

// ---- 2. table-center floors -------------------------------------------------
{
  const pos = { x: 0, y: R, z: 0 };
  const f = cueMinElevationDeg(pos, Math.PI / 2, 0, 0, g0); // butt → head rail
  console.log(`center 9-ft along length: floor=${f.toFixed(3)}°`);
  if (!(f > 0 && f < 3.5)) {
    fail(`9-ft center floor ${f}° outside (0, 3.5) — the 1.48 m cue DOES `
      + 'out-reach the 1.27 m half-table');
  }
  // oversized table: the backward ray exits inside the bed → exactly 0
  const big = { ...g0, L: 8, W: 8 };
  const f0 = cueMinElevationDeg(pos, Math.PI / 2, 0, 0, big);
  if (f0 !== 0) fail(`oversized-table center floor ${f0}° != 0`);
  // 12-ft snooker along the long axis: half-length 1.78 m > cue reach → 0
  const snooker = geomFor('wpbsa_snooker_12ft');
  const fs12 = cueMinElevationDeg(pos, Math.PI / 2, 0, 0, snooker);
  if (fs12 !== 0) fail(`12-ft snooker center long-axis floor ${fs12}° != 0`);
  // ... but across the 1.778 m width the rail is well within reach (x = 0.5
  // keeps the crossing on solid rail, off the middle-pocket carve at x = 0)
  const fsW = cueMinElevationDeg({ x: 0.5, y: R, z: 0 }, Math.PI, 0, 0, snooker);
  if (!(fsW > 0 && fsW < 4)) {
    fail(`12-ft snooker center cross floor ${fsW}° outside (0, 4)`);
  }
}

// ---- 3. monotone decay off the rail ----------------------------------------
{
  let prev = Infinity;
  const dists = [R, 0.05, 0.10, 0.20, 0.40, 0.80, 1.20];
  for (const d of dists) {
    const f = cueMinElevationDeg({ x: 0.5, y: R, z: g0.W / 2 - d }, Math.PI,
      0, 0, g0);
    if (f > prev + 1e-9) {
      fail(`floor not monotone off the rail: ${f}° at d=${d} > ${prev}°`);
    }
    prev = f;
  }
  // it never reaches 0 ON a 9-ft table (cue reach 1.48 m > every on-table
  // rail distance) — the exact-0 branch is case 2's oversized/snooker arms
  if (!(prev < 2)) fail(`floor ${prev}° not small at 1.2 m off the rail`);
}

// ---- 4. tip offset + phi wraparound ----------------------------------------
{
  const pos = { x: 0.5, y: R, z: g0.W / 2 - R };
  const f0 = cueMinElevationDeg(pos, Math.PI, 0, 0, g0);
  const fHi = cueMinElevationDeg(pos, Math.PI, 0, 0.4, g0);  // high tip
  const fLo = cueMinElevationDeg(pos, Math.PI, 0, -0.4, g0); // draw tip
  console.log(`tip offset: b=+0.4 ${fHi.toFixed(2)}° · b=0 ${f0.toFixed(2)}° `
    + `· b=−0.4 ${fLo.toFixed(2)}°`);
  if (!(fHi < f0 - 1 && fLo > f0 + 1)) {
    fail(`tip offset must move the floor: +b ${fHi}°, 0 ${f0}°, −b ${fLo}°`);
  }
  // pure side spin shifts the tip PARALLEL to the rail on a perpendicular
  // shot — the floor must not move
  const fA = cueMinElevationDeg(pos, Math.PI, 0.3, 0, g0);
  if (Math.abs(fA - f0) > 0.01) {
    fail(`side-spin-only floor moved: a=0.3 ${fA}° vs ${f0}°`);
  }
  // phi wraparound: ±2π aliases give the same floor
  const fw = cueMinElevationDeg(pos, Math.PI + 4 * Math.PI, 0, 0, g0);
  if (Math.abs(fw - f0) > 1e-3) fail(`phi wraparound: ${fw}° vs ${f0}°`);
}

// ---- 5. diagonal near the corner jaw ----------------------------------------
{
  // 10 cm off both rails just up-table of the corner jaw, aiming diagonally
  // into the table: the backward ray crosses both bands — nearest crossing
  // (largest required elevation) wins; floor lands between the frozen and
  // center regimes
  const pos = { x: g0.L / 2 - 0.35, y: R, z: g0.W / 2 - 0.10 };
  const f = cueMinElevationDeg(pos, Math.PI + Math.PI / 4, 0, 0, g0);
  console.log(`corner diagonal: floor=${f.toFixed(3)}°`);
  if (!(f > 4 && f < 45)) fail(`corner-diagonal floor ${f}° outside (4, 45)`);
}

// ---- 6. per-entry sweep (incl. 12-ft snooker + pocketless carom) ------------
// F3: each entry runs with its OWN ball radius (render.profileBallD / 2 —
// the same product the kernel derives the entry's ball from): ball centre
// height AND the cueMinElevationDeg ballR parameter. Frozen placements sit
// at x = 0.5 (solid band, clear of the side-pocket carve).
for (const id of Object.keys(TABLE_SPECS)) {
  const g = geomFor(id);
  const br = g.ballR;
  const frozen = cueMinElevationDeg({ x: 0.5, y: br, z: g.W / 2 - br },
    Math.PI, 0, 0, g, br);
  const center = cueMinElevationDeg({ x: 0, y: br, z: 0 }, Math.PI / 2,
    0, 0, g, br);
  console.log(`${id}: ballR=${(br * 1000).toFixed(2)}mm `
    + `frozen=${frozen.toFixed(2)}° center=${center.toFixed(2)}° `
    + `railTop=${(g.railTop * 1000).toFixed(2)}mm`);
  if (!(frozen > 25 && frozen < 55)) {
    fail(`${id}: frozen-rail floor ${frozen}° outside the physical 25–55°`);
  }
  if (!(center >= 0 && center < 4)) {
    fail(`${id}: center floor ${center}° outside [0, 4)`);
  }
  if (!(frozen > center)) fail(`${id}: frozen floor not above center floor`);
  // closed-form cross-check wherever the tip is the binding station at the
  // solution (nd = the tip's band offset must land inside the cushion band
  // — same precondition as case 1; entries whose tip retreats past the
  // nose at the solution have a nearby-crossing binding station instead)
  const want = frozenClosedForm(g, br, br);
  const nd = (br + CUE_DIMS.TIP_GAP) * Math.cos(want * DEG) - br;
  if (nd > 0 && nd < g.cushionWidth && Math.abs(frozen - want) > 0.05) {
    fail(`${id}: frozen floor ${frozen}° != closed form ${want}°`);
  }
}

// ---- 7. pocket-mouth carve (F1, review 2026-07-21) --------------------------
{
  const hL = g0.L / 2, hW = g0.W / 2;
  // (a) butt over the SIDE-pocket mouth: ball 30 cm up the mouth
  // centreline, shooting straight away from the pocket — every band
  // crossing rides the open corridor, so the floor is EXACTLY 0 (a real
  // cue dips over the opening; the assembly is cut through the frame).
  const sPos = { x: 0, y: R, z: hW - 0.30 };
  const fIn = cueMinElevationDeg(sPos, Math.PI, 0, 0, g0);
  // control (red/green): the same shot against a mouths-stripped geom is
  // the pre-carve solid-band floor — must stay high
  const fCtl = cueMinElevationDeg(sPos, Math.PI, 0, 0, { ...g0, mouths: null });
  console.log(`side mouth: in=${fIn.toFixed(3)}° `
    + `solid-band control=${fCtl.toFixed(3)}°`);
  if (fIn !== 0) fail(`side-mouth floor ${fIn}° != 0`);
  if (!(fCtl > 3)) fail(`solid-band control floor ${fCtl}° not > 3°`);
  // (b) same spot, azimuth swung so the crossing lands ~25 cm beside the
  // mouth — solid rail, the floor stays up
  const fBeside = cueMinElevationDeg(sPos, Math.PI + 0.695, 0, 0, g0);
  console.log(`side mouth, aiming beside: floor=${fBeside.toFixed(3)}°`);
  if (!(fBeside > 3 && fBeside < 55)) {
    fail(`beside-mouth floor ${fBeside}° outside (3, 55)`);
  }
  // (c) jaw margin: a crossing between (half − JAW_MARGIN) and the mouth
  // half-width still obstructs (jaw corner points); inside the shrunk
  // corridor it is open
  const half = g0.mouths.sideHalf;
  const fJaw = cueMinElevationDeg({ x: half - JAW_MARGIN / 2, y: R, z: hW - 0.30 },
    Math.PI, 0, 0, g0);
  const fOpen = cueMinElevationDeg({ x: half - JAW_MARGIN * 1.5, y: R, z: hW - 0.30 },
    Math.PI, 0, 0, g0);
  console.log(`jaw margin: edge=${fJaw.toFixed(3)}° open=${fOpen.toFixed(3)}°`);
  if (!(fJaw > 3)) fail(`jaw-edge crossing floor ${fJaw}° not > 3° (margin lost)`);
  if (fOpen !== 0) fail(`in-corridor crossing floor ${fOpen}° != 0`);
  // (d) corner mouth: ball 20 cm inside the corner along the diagonal,
  // butt extending out through the jaws → floor 0; (e) same spot aiming
  // straight at the long rail BESIDE the jaw → full floor
  const d = 0.20 / Math.SQRT2;
  const cPos = { x: hL - d, y: R, z: hW - d };
  const fCin = cueMinElevationDeg(cPos, Math.PI + Math.PI / 4, 0, 0, g0);
  const fCbeside = cueMinElevationDeg(cPos, Math.PI, 0, 0, g0);
  console.log(`corner mouth: in=${fCin.toFixed(3)}° `
    + `beside=${fCbeside.toFixed(3)}°`);
  if (fCin !== 0) fail(`corner-mouth floor ${fCin}° != 0`);
  if (!(fCbeside > 3 && fCbeside < 55)) {
    fail(`corner-beside floor ${fCbeside}° outside (3, 55)`);
  }
  // (f) template family (CEBP curved jaws): the snooker middle pocket
  // carves through its throat-derived corridor too. GH-489 P1 UPDATE: the
  // carve law is proven on the binding-stripped geom (the pre-fix-round
  // contract verbatim); on the REAL geom the butt extending over the mouth
  // now owes the far-rim binding roll its elevation — a real cue laid
  // toward a snooker pocket rests on the leather binding, not in the fall.
  const sn = geomFor('wpbsa_snooker_12ft');
  const snPos = { x: 0, y: sn.ballR, z: sn.W / 2 - 0.30 };
  const fSnCarve = cueMinElevationDeg(snPos, Math.PI, 0, 0,
    { ...sn, bind: null }, sn.ballR);
  const fSn = cueMinElevationDeg(snPos, Math.PI, 0, 0, sn, sn.ballR);
  console.log(`snooker middle mouth, aiming in: carve-only=${fSnCarve.toFixed(3)}° `
    + `with-binding=${fSn.toFixed(3)}°`);
  if (fSnCarve !== 0) {
    fail(`snooker middle-mouth carve-only floor ${fSnCarve}° != 0`);
  }
  if (!(fSn > 3 && fSn < 12)) {
    fail(`snooker middle-mouth binding floor ${fSn}° outside (3, 12) — the `
      + 'far-rim leather (crown 0.0572 ≈ 0.42 m behind the ball) owes ~6.5°');
  }
  // pocketless carom exposes NO carve (rails are continuous)
  if (geomFor('umb_carom_284').mouths !== null) {
    fail('carom entry must have no pocket-mouth carve');
  }
}

// ---- 8. issue #57 — dead-zone reachability at the frozen rail ---------------
{
  // the app cap, read by the SAME parse convention as
  // crates/pool-core/tests/ui_envelope.rs (single-source doctrine)
  const js = fs.readFileSync(
    path.join(repo, 'web', 'app', 'aimwidgets.js'), 'utf8');
  const capLine = js.split('\n').find((l) =>
    l.includes('ELEVATION_MAX_DEG =') && l.trimStart().startsWith('export const'));
  const CAP = Number(capLine.split('=')[1].trim().replace(';', ''));
  if (!(CAP > 0 && CAP <= 90)) fail(`cannot parse ELEVATION_MAX_DEG: ${capLine}`);

  // frozen on the +z long rail at x = 0.5 (solid band — clear of the F1
  // side-pocket corridor at x = 0; floors are x-invariant on solid band)
  const pos = { x: 0.5, y: R, z: g0.W / 2 - R };
  const phi = Math.PI; // straight away; butt over the rail
  // deep-draw pin: the SHARED kernel-mirror number (pool-core
  // cue_clearance::tests::tip_offset_moves_floor_and_deep_draw_pin pins
  // 56.47° too — change both sides together)
  const deep = cueMinElevationDeg(pos, phi, 0, -0.5, g0);
  console.log(`deep-draw frozen rail: floor=${deep.toFixed(3)}° (cap ${CAP}°)`);
  if (Math.abs(deep - 56.47) > 0.1) {
    fail(`deep-draw pin drifted: ${deep}° != 56.47° (kernel mirror)`);
  }
  // SHIPPED-CAP TRUTH: the worst legal floor stays BELOW the cap, so the
  // dead set is EMPTY on the shipped catalog — steep massé buys back every
  // tip contact (the issue's own wording); dead cells need a lower cap.
  if (!(deep < CAP)) fail(`deep-draw floor ${deep}° >= cap ${CAP}: dead set no longer empty — update the #57 UI truths`);
  const env = cueReachability(pos, phi, CAP, g0);
  if (env.deadCount !== 0) {
    fail(`frozen-rail dead set not empty at cap ${CAP}: ${env.deadCount}`);
  }
  if (Math.abs(env.maxFloorDeg - deep) > 0.15) {
    fail(`envelope maxFloor ${env.maxFloorDeg}° != deep-draw pin ${deep}°`);
  }
  // reduced 40° probe cap: the low-b band IS dead there, every dead node's
  // floor really exceeds the cap, and the grid (14-iter budget) agrees
  // with the direct 28-iter solve
  const env40 = cueReachability(pos, phi, 40, g0);
  console.log(`probe cap 40°: dead ${env40.deadCount}/${env40.floors.length}`);
  if (!(env40.deadCount > 0)) fail('probe cap 40° produced no dead cells');
  let checked = 0;
  env40.rings.forEach((rho, ri) => {
    for (let ai = 0; ai < env40.angles; ai += 4) { // spot-check a spread
      const ang = (ai / env40.angles) * 2 * Math.PI;
      const gf = env40.floors[1 + ri * env40.angles + ai];
      const df = cueMinElevationDeg(pos, phi,
        rho * Math.cos(ang), rho * Math.sin(ang), g0);
      if (Math.abs(gf - df) > 0.05) {
        fail(`grid floor ${gf}° != direct solve ${df}° at ring ${ri} ai ${ai}`);
      }
      if (gf > 40 && !(df > 40 - 0.05)) {
        fail(`dead node not dead under the exact solve: ${gf}° vs ${df}°`);
      }
      checked++;
    }
  });
  if (checked === 0) fail('grid consistency loop checked nothing');
  // exact boundary clamp: bottom drag (0, −0.45) is dead at cap 40 —
  // clamping preserves a, lands ON the reachable side of the boundary,
  // and the point just below the clamped b is still dead
  const c = cueClampTip(pos, phi, 40, 0, -0.45, g0);
  if (!c.clamped) fail('cueClampTip did not clamp a dead (0, −0.45) at cap 40');
  else {
    if (c.a !== 0) fail(`clamp moved a: ${c.a}`);
    if (!(c.b > -0.45 && c.b * c.b <= 0.25)) fail(`clamped b ${c.b} out of law`);
    if (!(c.floorDeg <= 40 + 1e-6)) fail(`clamped floor ${c.floorDeg}° > 40°`);
    const below = cueMinElevationDeg(pos, phi, 0, c.b - 0.01, g0);
    if (!(below > 40)) fail(`clamp not tight: floor(b−0.01) = ${below}° <= 40°`);
  }
  // no-op on a reachable point (the shipped cap): identity, no clamp flag
  const c80 = cueClampTip(pos, phi, CAP, 0, -0.45, g0);
  if (c80.clamped || c80.b !== -0.45) {
    fail(`cueClampTip must be a no-op at cap ${CAP}: ${JSON.stringify(c80)}`);
  }
}

// ---- 9. issue #57 — center table: the full disc is reachable ----------------
{
  const env = cueReachability({ x: 0, y: R, z: 0 }, Math.PI / 2, 80, g0);
  console.log(`center envelope: dead ${env.deadCount}, `
    + `maxFloor=${env.maxFloorDeg.toFixed(2)}°`);
  if (env.deadCount !== 0) fail(`center-table dead cells: ${env.deadCount}`);
  if (!(env.maxFloorDeg < 4)) {
    fail(`center-table max floor ${env.maxFloorDeg}° not small`);
  }
}

// ---- 10. issue #57 — jaws-adjacent placement (carved corner mouth) ----------
{
  // frozen on the long rail 6 cm up-table of the corner-jaw nose corner,
  // aiming diagonally INTO the table: the butt extension leaves the table
  // along the corner pocket's open corridor, so the merged F1 carve zeroes
  // the floor (pre-carve this was a strictly positive solid-band case).
  // The mouths-STRIPPED control keeps the old P-VII solid-band floor and
  // its envelope consistency — that is still what a stale table.js (no
  // mouth fields) degrades to at runtime.
  const pos = { x: g0.L / 2 - 0.06, y: R, z: g0.W / 2 - R };
  const f = cueMinElevationDeg(pos, Math.PI + Math.PI / 4, 0, 0, g0);
  const solid = { ...g0, mouths: null };
  const fCtl = cueMinElevationDeg(pos, Math.PI + Math.PI / 4, 0, 0, solid);
  console.log(`jaws-adjacent diagonal: carved=${f.toFixed(3)}° `
    + `solid-band control=${fCtl.toFixed(3)}°`);
  if (f !== 0) fail(`jaws-adjacent carved floor ${f}° != 0`);
  if (!(fCtl > 20 && fCtl < 55)) {
    fail(`jaws-adjacent solid-band control ${fCtl}° outside (20, 55)`);
  }
  const env = cueReachability(pos, Math.PI + Math.PI / 4, 80, solid);
  if (env.deadCount !== 0) {
    fail(`jaws-adjacent dead cells at cap 80: ${env.deadCount}`);
  }
}

// ---- 11. butt-station reach transition (cue-length mirror pin) ---------------
{
  // Shooting down the table from z = 0.3 (off every mouth corridor), the
  // floor transitions to EXACTLY 0 the millimeter the head-rail nose
  // crossing exits the rod's reach — nose distance CUE_LEN + R + TIP_GAP
  // = 1.477 + 0.028575 + 0.010 = 1.515575 m. The bracketing stations are
  // HARDCODED on BOTH sides (pool-core cue_clearance::tests pins the same
  // 1.5146/1.5166 pair) so a cue-length mirror drift ≥ 1 mm on EITHER
  // side goes red (added when the kernel default drifted to 1.487 —
  // review F-cue-len 2026-07-21).
  const floorAt = (d) => cueMinElevationDeg(
    { x: g0.L / 2 - d, y: R, z: 0.3 }, -Math.PI / 2, 0, 0, g0);
  const fIn = floorAt(1.5146), fOut = floorAt(1.5166);
  console.log(`butt-station reach: in=${fIn.toFixed(3)}° out=${fOut.toFixed(3)}°`);
  if (!(fIn > 0.1)) fail(`in-reach butt-station floor ${fIn}° not > 0.1°`);
  if (fOut !== 0) {
    fail(`beyond-reach butt-station floor ${fOut}° != 0 (CUE_LEN mirror drift?)`);
  }
}

// ---- 12. issue #64 — sphere obstacles (every other ball) ---------------------
{
  const { CUE_LEN, R_FERRULE, R_BUTT, RAIL_CLEAR, TIP_GAP } = CUE_DIMS;
  // independent tangency solve for an ON-LINE ball at center distance D
  // behind the cue ball (both centers at ballR height, a = b = 0, no
  // rails): at elevation θ the rod-axis distance to the ball center is
  // exactly D·sinθ at the closest-approach station s* = D·cosθ − reach
  // (reach = ballR + TIP_GAP; derivation: w = center − tip has
  // |w|² − (w·axis)² = D²·sin²θ for the poseCue tip and unit axis), so
  // the floor solves D·sinθ = ballR + RAIL_CLEAR + cueR(s*). Shares NO
  // code with cuestick.js — kernel twin: cue_clearance::tests::
  // ball_tangency_floor_deg (change together).
  const ballTangency = (D, ballR) => {
    const reach = ballR + TIP_GAP;
    const clears = (deg) => {
      const th = deg * DEG;
      const s = Math.min(Math.max(D * Math.cos(th) - reach, 0), CUE_LEN);
      return D * Math.sin(th)
        >= ballR + RAIL_CLEAR + R_FERRULE + (R_BUTT - R_FERRULE) * (s / CUE_LEN);
    };
    let lo = 0, hi = 90;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (clears(mid)) hi = mid; else lo = mid;
    }
    return hi;
  };
  // oversized injected geom: rail floors are exactly 0 (backward ray exits
  // inside the bed), isolating the ball floor; injected ⇒ memo bypass
  const big = { ...g0, L: 8, W: 8, mouths: null };
  const pos = { x: 0, y: R, z: 0 };
  const phi = Math.PI / 2; // strike +x (three); behind = −x
  const behind = (D, ballR = R) => ({ x: -D, y: ballR, z: 0, r: ballR });

  // [a] dead-behind gaps: tangency match, monotone steepening, shared pins
  let prev = 0;
  for (const gap of [2.2 * R, 0.5 * R, 1e-4, 0]) {
    const D = 2 * R + gap;
    const got = cueMinElevationDeg(pos, phi, 0, 0, big, R, [behind(D)]);
    const want = ballTangency(D, R);
    if (Math.abs(got - want) > 0.01) {
      fail(`[a] gap ${gap}: floor ${got}° != tangency solve ${want}°`);
    }
    if (!(got > prev)) fail(`[a] floors must steepen as the gap closes (${got}°)`);
    prev = got;
  }
  const frozen = cueMinElevationDeg(pos, phi, 0, 0, big, R, [behind(2 * R)]);
  const repro = cueMinElevationDeg(pos, phi, 0, 0, big, R, [behind(4.2 * R)]);
  console.log(`ball obstacles: frozen=${frozen.toFixed(3)}° `
    + `2.2R-gap=${repro.toFixed(3)}° (kernel-mirror pins 40.35/18.16)`);
  if (Math.abs(frozen - 40.35) > 0.1) {
    fail(`[a] frozen-to-ball pin drifted: ${frozen}° != 40.35° (kernel mirror)`);
  }
  if (Math.abs(repro - 18.16) > 0.1) {
    fail(`[a] 2.2R screenshot-repro pin drifted: ${repro}° != 18.16°`);
  }
  // monotone clears(θ) contract: the tangency equality above already pins
  // the bisection to the TRUE boundary (a non-monotone clears would land
  // it elsewhere); the private 0.5°-step clears sweep lives in the kernel
  // twin (cue_clearance::tests::ball_behind_matches_tangency_solve_and_pins
  // — min_rail_clearance is module-private on both sides).

  // [b] lateral graze ± ε around the exact θ=0 tangency at D = 0.3
  const D = 0.3;
  const sStar = D - (R + TIP_GAP);
  const need = R + RAIL_CLEAR + R_FERRULE + (R_BUTT - R_FERRULE) * (sStar / CUE_LEN);
  const fClear = cueMinElevationDeg(pos, phi, 0, 0, big, R,
    [{ x: -D, y: R, z: need + 1e-4, r: R }]);
  if (fClear !== 0) fail(`[b] lateral graze +ε must clear level: ${fClear}°`);
  const fGraze = cueMinElevationDeg(pos, phi, 0, 0, big, R,
    [{ x: -D, y: R, z: need - 1e-4, r: R }]);
  if (!(fGraze > 0 && fGraze < 3)) {
    fail(`[b] lateral graze −ε must bind slightly: ${fGraze}°`);
  }

  // [c] ball IN FRONT of the tip (the addressed object ball): zero, frozen
  // included
  for (const Df of [2 * R, 4.2 * R]) {
    const f = cueMinElevationDeg(pos, phi, 0, 0, big, R,
      [{ x: Df, y: R, z: 0, r: R }]);
    if (f !== 0) fail(`[c] in-front ball at ${Df} must contribute zero: ${f}°`);
  }

  // [d] near/beyond the butt: center 1 cm past the rod end binds at θ = 0
  // (clamped butt-station test) and clears shallow; fully beyond reach = 0
  const dButt = R + TIP_GAP + CUE_LEN + 0.01;
  const fButt = cueMinElevationDeg(pos, phi, 0, 0, big, R, [behind(dButt)]);
  if (!(fButt > 0 && fButt < 15)) {
    fail(`[d] just-past-butt ball must bind shallow: ${fButt}°`);
  }
  const fFar = cueMinElevationDeg(pos, phi, 0, 0, big, R, [behind(1.60)]);
  if (fFar !== 0) fail(`[d] beyond-rod-reach ball must be zero: ${fFar}°`);

  // [e] multi-ball max composition: the FARTHER on-line ball binds harder
  // than the nearer off-line one; combined floor = the exact max
  const near = { x: -0.15, y: R, z: 0.035, r: R };
  const far = { x: -0.35, y: R, z: 0, r: R };
  const fNear = cueMinElevationDeg(pos, phi, 0, 0, big, R, [near]);
  const fFarB = cueMinElevationDeg(pos, phi, 0, 0, big, R, [far]);
  const fBoth = cueMinElevationDeg(pos, phi, 0, 0, big, R, [near, far]);
  if (!(fFarB > fNear && fNear > 0)) {
    fail(`[e] constructed case wants far > near > 0: ${fFarB}° / ${fNear}°`);
  }
  if (fBoth !== Math.max(fNear, fFarB)) {
    fail(`[e] combined floor ${fBoth}° != max(${fNear}°, ${fFarB}°)`);
  }

  // [f] rail + ball max composition on the REAL 9-ft geometry: cue 0.335 m
  // off the +z long rail (solid band), strike −z; frozen ball behind
  // dominates the modest rail floor and the combined floor is the max
  const rPos = { x: 0.5, y: R, z: g0.W / 2 - 0.335 };
  const railOnly = cueMinElevationDeg(rPos, Math.PI, 0, 0, g0, R, []);
  const rObs = [{ x: 0.5, y: R, z: g0.W / 2 - 0.335 + 2 * R, r: R }];
  const combined = cueMinElevationDeg(rPos, Math.PI, 0, 0, g0, R, rObs);
  console.log(`rail+ball composition: rail=${railOnly.toFixed(3)}° `
    + `ball=${frozen.toFixed(3)}° combined=${combined.toFixed(3)}°`);
  if (!(railOnly > 0)) fail(`[f] rail floor must be live: ${railOnly}°`);
  if (!(frozen > railOnly)) {
    fail(`[f] constructed case wants the ball to dominate: ${frozen}° !> ${railOnly}°`);
  }
  // (1e-5 window: `frozen` was solved in a different coordinate frame —
  // same relative geometry, different fp rounding; [e] above asserts the
  // same-frame composition EXACTLY)
  if (Math.abs(combined - Math.max(railOnly, frozen)) > 1e-5) {
    fail(`[f] rail+ball floor ${combined}° != max composition`);
  }

  // [g] ball inside the side-pocket carve corridor: the carve removed the
  // RAIL (case 7a floor 0), not the ball — it still obstructs at the
  // 2.2R-gap tangency
  const sPos = { x: 0, y: R, z: g0.W / 2 - 0.30 };
  const gObs = [{ x: 0, y: R, z: g0.W / 2 - 0.30 + 4.2 * R, r: R }];
  const fMouth = cueMinElevationDeg(sPos, Math.PI, 0, 0, g0, R, gObs);
  if (Math.abs(fMouth - repro) > 0.01) {
    fail(`[g] ball in the carve corridor must floor ≈ ${repro}°: ${fMouth}°`);
  }

  // [h] tip offsets over a frozen ball: floor monotone non-increasing in b
  // (the cueClampTip contract, case-4 pattern with an obstacle) …
  const fHi = cueMinElevationDeg(pos, phi, 0, 0.4, big, R, [behind(2 * R)]);
  const fLo = cueMinElevationDeg(pos, phi, 0, -0.4, big, R, [behind(2 * R)]);
  console.log(`frozen-ball tip offsets: b=+0.4 ${fHi.toFixed(2)}° `
    + `b=0 ${frozen.toFixed(2)}° b=−0.4 ${fLo.toFixed(2)}°`);
  if (!(fHi < frozen && frozen < fLo)) {
    fail(`[h] ball floor must be monotone in b: ${fHi}° / ${frozen}° / ${fLo}°`);
  }
  // … and side spin shifts the axis so the beside-line ball binds per side
  // (three frame: strike +x ⇒ shooter's right = +z)
  const beside = [{ x: -0.25, y: R, z: 0.041, r: R }];
  const fRa = cueMinElevationDeg(pos, phi, 0.5, 0, big, R, beside);
  const fLa = cueMinElevationDeg(pos, phi, -0.5, 0, big, R, beside);
  if (!(fRa > fLa)) {
    fail(`[h] side spin must pick the binding side: a=+0.5 ${fRa}° !> a=−0.5 ${fLa}°`);
  }
  // probe-cap dead machinery with a BALL obstacle (the #57 arm's #64 twin):
  // at cap 40 the frozen-ball center node is dead (floor 40.35°), the
  // envelope reports dead cells, and cueClampTip lands ON the reachable
  // side preserving a
  const env40 = cueReachability(pos, phi, 40, big, R, [behind(2 * R)]);
  if (!(env40.deadCount > 0)) {
    fail(`[h] probe cap 40 with a frozen ball produced no dead cells`);
  }
  if (env40.sig !== 'nomemo') fail('[h] injected geom must bypass the memo');
  const cl = cueClampTip(pos, phi, 40, 0, -0.3, big, R, [behind(2 * R)]);
  if (!cl.clamped) fail('[h] cueClampTip did not clamp a ball-dead (0, −0.3)');
  else {
    if (cl.a !== 0) fail(`[h] clamp moved a: ${cl.a}`);
    if (!(cl.floorDeg <= 40 + 1e-6)) {
      fail(`[h] clamped floor ${cl.floorDeg}° > 40°`);
    }
    const below = cueMinElevationDeg(pos, phi, 0, cl.b - 0.01, big, R,
      [behind(2 * R)]);
    if (!(below > 40)) {
      fail(`[h] clamp not tight: floor(b−0.01) = ${below}° <= 40°`);
    }
  }

  // [j] discipline radii thread through the same tangency (snooker 26.25 mm,
  // carom 30.75 mm)
  for (const br of [0.02625, 0.03075]) {
    const got = cueMinElevationDeg({ x: 0, y: br, z: 0 }, phi, 0, 0, big, br,
      [behind(2 * br, br)]);
    const want = ballTangency(2 * br, br);
    if (Math.abs(got - want) > 0.01) {
      fail(`[j] radius ${br}: floor ${got}° != tangency ${want}°`);
    }
  }

  // [k] F1 draw-dip envelope repro (review 2026-07-21, the MAJOR finding):
  // ball D = 0.3 m behind, laterally offset so a LEVEL cue clears by
  // exactly +0.2 mm; under b = −0.5 the raw perpendicular distance
  // sqrt((D·sinθ + b·R)² + lat²) dips to lateral-only at sinθ = −b·R/D
  // (≈ 2.73°) — the pre-envelope module returned floor 0 while θ = 3° was
  // a REAL rod–ball overlap. The independent oracle below is the RAW
  // segment–sphere clearance (own math, poseCue tip + clamped station +
  // taper — exactly what the rendered cue occupies); the envelope floor
  // must match its swept minimum. Kernel twin:
  // cue_clearance::tests::draw_dip_envelope_floor_matches_independent_scan
  // (same 5.364° pin — change together).
  {
    const lat = Math.sqrt(need * need - (0.5 * R) * (0.5 * R)) + 2e-4;
    const dipBall = { x: -D, y: R, z: lat, r: R };
    const rawClear = (thetaDeg, a, b, margin) => {
      const th = thetaDeg * DEG;
      const cosT = Math.cos(th), sinT = Math.sin(th);
      const reach = R + TIP_GAP;
      // strike +x (phi = π/2): tip behind along −x, shooter-right = +z
      const tx = pos.x - reach * cosT + b * R * sinT;
      const ty = pos.y + reach * sinT + b * R * cosT;
      const tz = pos.z + a * R;
      const wx = dipBall.x - tx, wy = dipBall.y - ty, wz = dipBall.z - tz;
      let s = wx * -cosT + wy * sinT;
      s = Math.min(Math.max(s, 0), CUE_LEN);
      const qx = wx + cosT * s, qy = wy - sinT * s, qz = wz;
      const rod = R_FERRULE + (R_BUTT - R_FERRULE) * (s / CUE_LEN);
      return Math.sqrt(qx * qx + qy * qy + qz * qz) - (dipBall.r + rod + margin);
    };
    // repro FACTS (true pre- and post-fix): level clears ≈ +0.2 mm; 3° is
    // margin-violated by ≈ −2.5 mm and a REAL overlap without the margin
    const c0 = rawClear(0, 0, -0.5, RAIL_CLEAR);
    if (!(c0 > 0 && c0 < 5e-4)) fail(`[k] level clearance ${c0} not ≈ +0.2 mm`);
    const c3 = rawClear(3, 0, -0.5, RAIL_CLEAR);
    if (!(c3 < -2e-3)) fail(`[k] 3° margined clearance ${c3} not ≈ −2.5 mm`);
    const c3True = rawClear(3, 0, -0.5, 0);
    if (!(c3True < 0)) fail(`[k] 3° must be a REAL overlap: ${c3True}`);
    // the fixed floor: > 3° (red/green — pre-envelope this returned 0),
    // pinned, and equal to the independent swept-envelope minimum
    const fDip = cueMinElevationDeg(pos, phi, 0, -0.5, big, R, [dipBall]);
    if (!(fDip > 3)) fail(`[k] F1 repro floor must exceed 3°, got ${fDip}°`);
    if (Math.abs(fDip - 5.364) > 0.05) {
      fail(`[k] F1 dip pin drifted: ${fDip}° != 5.364° (kernel mirror)`);
    }
    const sweptFloor = (a, b) => {
      const clearsFrom = (deg) => {
        for (let t = deg; t <= 90; t += 0.01) {
          if (rawClear(t, a, b, RAIL_CLEAR) < 0) return false;
        }
        return true;
      };
      let lo = 0, hi = 90;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (clearsFrom(mid)) hi = mid; else lo = mid;
      }
      return hi;
    };
    const indep = sweptFloor(0, -0.5);
    if (Math.abs(fDip - indep) > 0.01) {
      fail(`[k] envelope floor ${fDip}° != independent swept scan ${indep}°`);
    }
    // b ≥ 0 control on the same ball: the envelope is EXACT there
    const fCtl = cueMinElevationDeg(pos, phi, 0, 0.4, big, R, [dipBall]);
    const indepCtl = sweptFloor(0, 0.4);
    if (Math.abs(fCtl - indepCtl) > 0.01) {
      fail(`[k] b=+0.4 floor ${fCtl}° != swept scan ${indepCtl}° (b ≥ 0 exact)`);
    }
    console.log(`F1 draw-dip: level=${(c0 * 1000).toFixed(3)}mm `
      + `3°=${(c3 * 1000).toFixed(3)}mm (true ${(c3True * 1000).toFixed(3)}mm) `
      + `floor=${fDip.toFixed(3)}° indep=${indep.toFixed(3)}°`);
  }

  // memo-sig invalidation (the aimwidgets repaint contract): through the
  // RUNTIME geom path (no injected geom ⇒ memoizable), a moved obstacle
  // MUST change env.sig; an unmoved list must memo-hit
  const mPos = { x: 0.5, y: R, z: 0 };
  const e1 = cueReachability(mPos, Math.PI, 80, undefined, R,
    [{ x: 0.5, y: R, z: 0.3, r: R }]);
  const e2 = cueReachability(mPos, Math.PI, 80, undefined, R,
    [{ x: 0.5, y: R, z: 0.3, r: R }]);
  const e3 = cueReachability(mPos, Math.PI, 80, undefined, R,
    [{ x: 0.5, y: R, z: 0.31, r: R }]);
  if (e1.sig === 'nomemo') {
    fail('memo-sig arm inert: runtime geom path did not memoize');
  }
  if (e2 !== e1) fail('unmoved obstacle list must memo-hit (same env object)');
  if (e3.sig === e1.sig) {
    fail(`moved obstacle did not change the memo sig: ${e3.sig}`);
  }
  console.log('memo sig: obstacle move '
    + `${e1.sig.slice(-14)} -> ${e3.sig.slice(-14)} OK`);
}

// ---- shared true-cushion-footprint swept-solid oracle (issues #207 + #206) --
// Independent of cuestick's point/box model (shares no code): over a rendered
// cushion body (railPolysFor = the true jaw polygons) the swept straight cue
// underside must clear railTop; over the frame ring (not the pocket cut) it
// must clear frameTop; the pocket opening (mouth + casting cut) owes nothing.
// Consumed by the side-jaw (case 13) and corner-jaw (case 14) arms.
const { CUE_LEN, R_FERRULE, R_BUTT, RAIL_CLEAR, TIP_GAP } = CUE_DIMS;
const pip = (px, pz, poly) => {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if (((zi > pz) !== (zj > pz))
      && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) ins = !ins;
  }
  return ins;
};
// Signed clearance [m] of the swept straight cue vs the TRUE rail footprint
// at elevation theta. < 0 == the cue solid intersects the cushion/frame.
const sweptClear = (g, polys, pos, phi, ballR, theta) => {
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  const dx = Math.sin(phi), dz = Math.cos(phi);
  const reach = ballR + TIP_GAP;
  const tx = pos.x - dx * reach * cosT, ty = pos.y + reach * sinT;
  const tz = pos.z - dz * reach * cosT;
  const bxh = -dx * cosT, bzh = -dz * cosT;
  const hL = g.L / 2, hW = g.W / 2, cw = g.cushionWidth;
  const bandOut = cw + g.frameWidth;
  const sh = g.mouths.sideHalf, ch = g.mouths.cornerHalf;
  let min = Infinity;
  const N = 1600;
  for (let i = 0; i <= N; i++) {
    const s = CUE_LEN * i / N, px = tx + bxh * s, pz = tz + bzh * s;
    const under = ty + sinT * s
      - (R_FERRULE + (R_BUTT - R_FERRULE) * (s / CUE_LEN));
    let top;
    if (polys.some((p) => pip(px, pz, p))) top = g.railTop;
    else {
      const nd = Math.max(Math.abs(px) - hL, Math.abs(pz) - hW);
      const cut = Math.abs(px) < sh - JAW_MARGIN
        || Math.abs(Math.abs(px) - hL - (Math.abs(pz) - hW))
           < (ch - JAW_MARGIN) * Math.SQRT2;
      if (nd > cw && nd <= bandOut && !cut) top = g.frameTop;
      else continue;
    }
    const c = under - top - RAIL_CLEAR;
    if (c < min) min = c;
  }
  return min;
};
const trueFloor = (g, polys, pos, phi, ballR) => {
  if (sweptClear(g, polys, pos, phi, ballR, 0) >= 0) return 0;
  let lo = 0, hi = 90;
  for (let i = 0; i < 34; i++) {
    const mid = (lo + hi) / 2;
    if (sweptClear(g, polys, pos, phi, ballR, mid * DEG) >= 0) hi = mid;
    else lo = mid;
  }
  return hi;
};
// railPolysFor in the three frame ({x, z}), as both jaw arms consume it.
const threePolys = (Gk) => railPolysFor(Gk).map((poly) =>
  poly.map(([X, Y]) => ({ x: Y - Gk.L / 2, z: X - Gk.W / 2 })));

// ---- 13. issue #207 — side pocket JAW clearance (over-carve fix) ------------
// The pre-#207 side carve opened a FULL-WIDTH strip |x| < sideMouth/2 through
// the whole long-rail band, deleting the jaw HORNS flanking the mouth. On the
// sharper-cut entries (diamond / wpa_spec side facing 12–14°) the horns lean
// well inside that strip, so a cue laid ALONG the pocket axis over a jaw got
// floor 0 and clipped the cushion (owner build9 repro). The fix bounds the
// CUSHION-band throat by the jaw FACING lines |x| < sw/2 − az·tan(sa),
// keeping the horns as clearance obstacles while the true throat stays open
// (a ball still enters). Proven against an INDEPENDENT true-cushion-footprint
// swept-solid oracle (railPolysFor = the rendered jaw bodies at railTop, the
// pocket cut through the frame): the FLOORED cue clears the jaw (zero
// intersection), a LEVEL cue clips it (red), the throat centre still owes no
// elevation, and the point-model floor never dips below the true-footprint
// floor (parity for pocket-adjacent poses).
// JS-only (issue #207 decision): the kernel cue_clearance.rs RailMouths
// carries only side/corner half-widths, so this jaw-facing model would need
// a kernel constructor change → a canonical-wasm repin. That is owner-gated
// (the cue-clearance repin record, internal), so the wasm oracle keeps the
// pre-#207 strip until the repin ceremony — a documented interim divergence
// (the #57/#64 precedent, the ownership ledger Reachability note).
{
  for (const id of ['diamond_redlabel_9ft', 'wpa_spec_9ft']) {
    const g = geomFor(id);
    const br = g.ballR;
    const Gk = makeGeom(id);
    const polys = threePolys(Gk);
    // pre-#207 control: the same geom with the jaw-facing fields stripped —
    // the full-width strip carve that deleted the horns
    const strip = { ...g,
      mouths: { sideHalf: g.mouths.sideHalf, cornerHalf: g.mouths.cornerHalf } };
    // cue ball frozen on the +z long rail one jaw-width off the side-pocket
    // centreline, aimed straight ALONG the pocket axis (butt over the mouth)
    const pos = { x: -0.05, y: br, z: g.W / 2 - br };
    const fNew = cueMinElevationDeg(pos, Math.PI, 0, 0, g, br);
    const fOld = cueMinElevationDeg(pos, Math.PI, 0, 0, strip, br);
    const fTrue = trueFloor(g, polys, pos, Math.PI, br);
    const cLevel = sweptClear(g, polys, pos, Math.PI, br, 0);
    const cFloor = sweptClear(g, polys, pos, Math.PI, br, fNew * DEG);
    console.log(`${id} side-jaw axis: new=${fNew.toFixed(2)}° `
      + `pre-#207=${fOld.toFixed(2)}° true=${fTrue.toFixed(2)}° `
      + `level-clip=${(cLevel * 1000).toFixed(2)}mm floored=${(cFloor * 1000).toFixed(3)}mm`);
    // red/green: the pre-#207 strip over-carves to ~0 (the bug); the fix sees
    // the jaw and raises the floor to clear it
    if (!(fOld < 0.5)) {
      fail(`${id}: pre-#207 strip control ${fOld}° should over-carve to ~0`);
    }
    if (!(fNew > 5)) fail(`${id}: side-jaw floor ${fNew}° must rise above 5°`);
    // the point-model floor must NOT under-floor the true jaw footprint
    if (!(fNew > fTrue - 0.25)) {
      fail(`${id}: point floor ${fNew}° under-floors the true jaw ${fTrue}°`);
    }
    // swept-solid zero-intersection: level clips the jaw (red), floored clears
    if (!(cLevel < -1e-4)) {
      fail(`${id}: level cue must clip the true jaw (clearance ${cLevel} m)`);
    }
    if (!(cFloor > -2e-4)) {
      fail(`${id}: floored cue still intersects the jaw (clearance ${cFloor} m)`);
    }
    // throat centre stays open — a ball can still enter (not re-blocked)
    const fThroat = cueMinElevationDeg({ x: 0, y: br, z: g.W / 2 - 0.30 },
      Math.PI, 0, 0, g, br);
    if (fThroat !== 0) {
      fail(`${id}: side throat centre floor ${fThroat}° must stay 0 (open)`);
    }
  }
}

// ---- 14. issue #206 — corner pocket JAW clearance (over-carve fix) ----------
// The pre-#206 corner carve opened a FULL-DIAGONAL-width strip (|ax − az| <
// cornerHalf·√2) through the whole corner band at ALL depths, deleting the two
// inward-leaning corner-jaw HORNS (cornerFacingDeviationDeg 5.3–7°). A cue
// frozen near a corner (one of the MOST COMMON table situations) and laid
// along the corner-pocket diagonal got floor 0 and clipped the corner jaw
// (railPolysFor index 3) — same defect class/magnitude as the #207 side bug.
// The fix bounds the CUSHION-band corner throat by the jaw FACING lines
// |w| < cornerThroatW − d·tan(dev) (diagonal frame), keeping the horns as
// clearance obstacles while the true throat stays open (a ball still enters).
// Proven against the SAME independent true-cushion-footprint swept-solid
// oracle as case 13: the FLOORED cue clears the corner jaw (zero
// intersection), a LEVEL cue clips it (red), the point floor never dips below
// the true-footprint floor, and the throat centre still owes no elevation.
// JS-only (same interim divergence as #207 — the kernel cue_clearance.rs
// RailMouths carries only corner half-widths; the wasm/py oracle keeps the
// pre-#206 strip until the owner-gated repin, the ownership ledger Reachability note).
{
  // Frozen on the +z long rail ~9–11 cm from the +x/+z corner, aimed straight
  // ALONG the corner-pocket diagonal (φ = 5π/4; butt over the corner jaws).
  // The per-entry distance places the cue in the CLEAN corner-jaw window — far
  // enough that the level rod reaches the (wider on the larger-mouth entries)
  // corner jaw, close enough that its +z long-rail crossing still rides the
  // open corner throat (so the corner jaw, NOT the perpendicular long rail, is
  // the binding constraint and the pre-#206 strip over-carves it to 0). The
  // narrow catalog-geometry-pinned window matches the review's numbers:
  // predator 17.07°/−24.67 mm, diamond 15.50°/−24.89, wpa 15.36°/−24.67.
  for (const [id, dist] of [['predator_apex_9ft', 0.090],
    ['diamond_redlabel_9ft', 0.095], [SCRIPTED_PIN_TABLE_ID, 0.105]]) {
    const g = geomFor(id);
    const br = g.ballR;
    const polys = threePolys(makeGeom(id));
    const phi = Math.PI + Math.PI / 4;
    const pos = { x: g.L / 2 - dist, y: br, z: g.W / 2 - br };
    // pre-#206 control: the same geom with the corner jaw-facing fields
    // stripped — the full-diagonal strip carve that deleted the horns
    const strip = { ...g,
      mouths: { ...g.mouths, cornerThroatW: undefined, cornerThroatSlope: undefined } };
    const fNew = cueMinElevationDeg(pos, phi, 0, 0, g, br);
    const fOld = cueMinElevationDeg(pos, phi, 0, 0, strip, br);
    const fTrue = trueFloor(g, polys, pos, phi, br);
    const cLevel = sweptClear(g, polys, pos, phi, br, 0);
    const cFloor = sweptClear(g, polys, pos, phi, br, fNew * DEG);
    console.log(`${id} corner-jaw diagonal: new=${fNew.toFixed(2)}° `
      + `pre-#206=${fOld.toFixed(2)}° true=${fTrue.toFixed(2)}° `
      + `level-clip=${(cLevel * 1000).toFixed(2)}mm floored=${(cFloor * 1000).toFixed(3)}mm`);
    // red/green: the pre-#206 strip over-carves to ~0 (the bug); the fix sees
    // the corner jaw and raises the floor to clear it
    if (!(fOld < 0.5)) {
      fail(`${id}: pre-#206 strip control ${fOld}° should over-carve to ~0`);
    }
    if (!(fNew > 5)) fail(`${id}: corner-jaw floor ${fNew}° must rise above 5°`);
    // the true corner-jaw footprint really requires a positive floor here
    if (!(fTrue > 5)) {
      fail(`${id}: true corner-jaw footprint floor ${fTrue}° should exceed 5°`);
    }
    // the point-model floor must NOT under-floor the true jaw footprint
    if (!(fNew > fTrue - 0.25)) {
      fail(`${id}: point floor ${fNew}° under-floors the true corner jaw ${fTrue}°`);
    }
    // swept-solid zero-intersection: level clips the jaw (red), floored clears
    if (!(cLevel < -1e-4)) {
      fail(`${id}: level cue must clip the true corner jaw (clearance ${cLevel} m)`);
    }
    if (!(cFloor > -2e-4)) {
      fail(`${id}: floored cue still intersects the corner jaw (clearance ${cFloor} m)`);
    }
    // throat centre stays open — a ball can still enter (30 cm inside the
    // corner on the diagonal, butt out through the throat centre)
    const d = 0.30 / Math.SQRT2;
    const fThroat = cueMinElevationDeg(
      { x: g.L / 2 - d, y: br, z: g.W / 2 - d }, phi, 0, 0, g, br);
    if (fThroat !== 0) {
      fail(`${id}: corner throat centre floor ${fThroat}° must stay 0 (open)`);
    }
  }
}

// ---- 15. GH-489 — snooker pocket-mouth BOOT as an obstacle ------------------
// W6 CONSTRUCTION ROUND re-derivation (corner adjudication c5259957376,
// middle c5260535193): the binding bead + saddle cap this case used to
// mirror are RETIRED; the raised furniture is now the CREAM boot swept
// about the VISIBLE fall cup (snkBootGeom) — rolled lip crest 0.0570 at
// the outward axis tapering to 0.0455 at the tucked tips, radial band
// (corner 49 mm; middle 15 mm centre growing to the flanks), all ABOVE the
// 0.047 frameTop the band floor models. Proven against an INDEPENDENT
// model of the boot's two graze features (no cuestick code shared): the
// ROLL-CREST wire at fall + 9 mm and the OUTER-ARRIS wire at
// fall + 5 mm + band, both riding the cosine crest taper — literals
// mirrored from snkBootGeom, the GEOMETRY truth. Asserts: (a) the
// boot-stripped floor really intersects the assembly (the review-red
// class, re-anchored on the new topology), (b) the returned floor clears
// it everywhere incl. tip-offset side clips, tip-taper and lateral-margin
// poses, (c) an inner-side (rail-parallel) pose clear of every boot owes
// the descriptor nothing, (c2) a butt hanging over a corner mouth IS
// charged now (the U really is there — an honest construction delta vs
// the retired ring), (d) only the snooker entry carries the descriptor.
{
  const sn = geomFor('wpbsa_snooker_12ft');
  const br = sn.ballR;
  const { CUE_LEN, R_FERRULE, R_BUTT } = CUE_DIMS;
  // independent leather-assembly clearance at pose θ: TRUE 3D
  // segment-to-surface distance (review fix-round r2: a vertical-only
  // underside test misses near-tangent SIDE clips) — min over 1 mm
  // stations of (point-to-feature distance − cue radius) across BOTH
  // crest features: the bead torus ring r_fall + 4 mm at y 0.0528, tube
  // radius 4.2 mm, and the cap-crown crest WIRE at r_fall + 7.3 mm,
  // y 0.0572 (round 3 — the crest sits under the crown, so the crown line
  // is what a straight cue actually grazes). Both MELT-SCALED toward the
  // horns exactly as the rendered meshes are (bead: centre 0.0415 +
  // smoothstep, radius × (0.14 + 0.86·smoothstep); crown: the SADDLE_PROF
  // collapsed-wedge base 0.0395 + 0.42·0.006 = 0.04202 + smoothstep — all
  // literals mirrored from table.js bindingGeom/saddleCapGeom, the
  // GEOMETRY truth, no cuestick code shared; review r3 widened the oracle
  // to the FULL window so horn-region poses are judged too). Full poseCue
  // tip form (a/b tip offsets — the r2/r3 repros carry both).
  // snkBootGeom mirror (W11 corner-form round, review W11 r5 P2): the
  // CORNER boot is the W11 moulded saddle — LATE-MELT crest (crest0
  // 0.0570 held to t = 0.78, smoothstep to tip 0.0455), tip-eased band
  // (× 1 → 0.72 past t = 0.82), convex crown (peak at 0.27·band, outer
  // sag × 0.42) and a rolled edge landing at seatY = min(crest − 0.002,
  // 0.0478). The MIDDLE saddle keeps the W6 cosine + 15 → 37 mm band.
  // All literals mirrored from table.js snkCrestAt/profAt (the GEOMETRY
  // truth, no cuestick code shared).
  const sm3 = (t) => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  };
  const crestAt = (ang, half, corner) => {
    const t = Math.min(1, ang / half);
    // W14: the corner crest is the XW101 collar law (crest0 0.0572,
    // same late melt to the 0.0455 tips — table.js snkCrestAt mirror)
    if (corner) return 0.0572 - 0.0117 * sm3((t - 0.78) / 0.22);
    return 0.0455 + 0.0115 * (0.5 + 0.5 * Math.cos(Math.PI * t));
  };
  const bandAt = (f, ang) => {
    if (Math.abs(f.ox) > 0.5) {
      const t = Math.min(1, ang / f.half);
      return 0.049 * (1 - 0.28 * sm3((t - 0.82) / 0.18)); // corner U
    }
    const u = Math.min(1, (ang / f.half) / 0.75);
    return 0.015 + 0.022 * (u * u * (3 - 2 * u));
  };
  const tubeClear = (pos, phi, thetaDeg, a = 0, b = 0) => {
    const th = thetaDeg * DEG, cos = Math.cos(th), sin = Math.sin(th);
    const dx = Math.sin(phi), dz = Math.cos(phi);
    const reach = br + CUE_DIMS.TIP_GAP;
    const tx = pos.x - dx * reach * cos - dz * a * br + dx * b * br * sin;
    const ty = pos.y + reach * sin + b * br * cos;
    const tz = pos.z - dz * reach * cos + dx * a * br + dz * b * br * sin;
    let worst = Infinity;
    for (let s = 0; s <= CUE_LEN; s += 0.001) {
      const px = tx - dx * cos * s, py = ty + sin * s, pz = tz - dz * cos * s;
      for (const f of sn.bind.falls) {
        const ddx = px - f.x, ddz = pz - f.z;
        const d = Math.hypot(ddx, ddz);
        if (!(d > 0)) continue;
        const ang = Math.acos(Math.min(1,
          Math.max(-1, (ddx * f.ox + ddz * f.oz) / d)));
        if (ang > f.half) continue;
        const corner = Math.abs(f.ox) > 0.5;
        const crest = crestAt(ang, f.half, corner);
        const rr = R_FERRULE + (R_BUTT - R_FERRULE) * (s / CUE_LEN);
        // craft R3-SNK-5 (LAW-PURCHASED-BASELINE): the furniture is the
        // Magnum-MEASURED padded band on the flush plate (SPIKE-REPORT-
        // CRAFT-R2.md §R3c.10–11). The oracle is the section polyline, all
        // literals mirrored from table.js SNK_PLATE.pad / snkPlateSpec
        // (GEOMETRY truth, no descriptor code shared), in (d, y) about
        // the cup — MODEL offsets from the flap face (dr) / the top (dz):
        //   flap face  vertical at rFlap = cup r + lip 4 + 2.1 from +2.6 to
        //              the ledge 22.13 under the top; ledge steps IN 2.26
        //   pad face   +1.1 over its height to 3.7 under the top, arc R
        //              9.46 (centre +8.1 / 9.8) to the flat; flat (+0.6
        //              crown) to rFlat1; outer round R 6.1 (90° → 11.7°),
        //              lean 11.7° to the VERTICAL face dr 47.05 (dz 9.53 →
        //              19.52), under-round to (46.50, 21.39), underside to
        //              the root (44.26, 22.88), upper skirt (44.28, 28.39)
        //              (44.96, 32.84) (46.66, 41.16), lower skirt to the hem
        //              on the apron plane (corner, R3-SNK-6: rail-positioned).
        //   middle:    the same offsets anchored on the ROOT, which sits on
        //              the MODEL 4.3° tongue line through the apron-bounded
        //              hem (dApron = apron plane − 0.3 from the cup).
        const seg = (x0, y0, x1, y1) => {
          const vx = x1 - x0, vy = y1 - y0;
          const L2 = vx * vx + vy * vy || 1e-12;
          const t = Math.min(1, Math.max(0, ((d - x0) * vx + (py - y0) * vy) / L2));
          return Math.hypot(d - (x0 + vx * t), py - (y0 + vy * t));
        };
        // R3-SNK-7 (RULING-SNK-DATUM.md item 3): the plate top is the entry's
        // rail top (MODEL 40.18, table.js SNK_RAIL_TOP) — mirrored through the
        // geometry descriptor, never a literal here
        const topY = sn.frameTop;
        const rFlap = f.r + 0.004 + 0.0021;
        // corner hem MFR (OEM side elevation 146–150 under the top → 148,
        // table.js SNK_PLATE.pad.hemDrop); middle MODEL 107.3
        const hemY = corner ? topY - 0.148 : topY - 0.1073;
        const leanO = (11.7 * Math.PI) / 180, outerR = 0.0061, crown = 0.0006;
        const dzEnd = crown + outerR * (1 - Math.sin(leanO));
        const yRoundEnd = topY - dzEnd, yFaceTop = topY - 0.00953, yFaceBot = topY - 0.01952;
        const yUnder = topY - 0.02139, yRoot = topY - 0.02288;
        const SKU = [[0.04428, 0.02839], [0.04496, 0.03284], [0.04666, 0.04116]];
        let rRoot, rFace, rUnder, skirtUp, rSk;
        if (corner) {
          // R3-SNK-6 JUNCTION LAW (table.js snkPlateSpec mirror, report
          // §R3c.15.2): the outer landmarks are POSITIONED BY THE RAIL —
          // the top edge (MODEL dr 41.5 at z top−1) sits legInsetFace 15.6
          // (MODEL, RULING-SNK-DATUM.md item 5) inside the rail's outer face plane
          // (W/2 + CW + frameWidth − |cz|, the MFR frame), every landmark
          // keeps its MODEL offset from that edge, the hem's leg lands ON
          // the apron plane (face − 3), and the lower skirt is the line
          // from the MODEL upper skirt to that hem (lean DERIVED; the E8
          // 14.6° / E37 114.5 letters retired). Leg law: leg ⟂ distance =
          // rBase − 0.31 (legD45).
          const railFace = (sn.W / 2 + sn.cushionWidth + sn.frameWidth) - Math.abs(f.z);
          const apronFace = railFace - 0.003;
          const rTopEdge = (railFace - 0.0156) + 0.00031;
          rFace = rTopEdge + (0.04705 - 0.0415);
          rRoot = rFace - (0.04705 - 0.04426); rUnder = rRoot + (0.04650 - 0.04426);
          skirtUp = SKU.map(([dr, dz]) => [rRoot + (dr - 0.04426), topY - dz]);
          const y0 = topY - SKU[2][1], r0 = rRoot + (SKU[2][0] - 0.04426);
          const hemR = apronFace + 0.00031;
          const tanL = (hemR - r0) / (y0 - hemY);
          rSk = (y) => hemR - (y - hemY) * tanL;
        } else {
          const lean = (4.3 * Math.PI) / 180;
          // apron plane (W/2 + CW + frameWidth − 0.003, the populate AZ
          // literal) − 0.3 from the middle cup — the spec's dHem
          const dApron = (sn.W / 2 + sn.cushionWidth + sn.frameWidth - 0.003) - Math.abs(f.z) - 0.0003;
          const tongue = (y) => dApron - (y - hemY) * Math.tan(lean);
          const y0 = topY - SKU[2][1], d0 = tongue(y0);
          rRoot = d0 - (SKU[2][0] - 0.04426);
          rFace = rRoot + (0.04705 - 0.04426); rUnder = rRoot + (0.04650 - 0.04426);
          skirtUp = SKU.map(([dr, dz]) => [rRoot + (dr - 0.04426), topY - dz]);
          rSk = tongue;
        }
        const rRoundEnd = rFace - (0.00953 - dzEnd) * Math.tan(leanO);
        const rFlat1 = rRoundEnd - outerR * Math.cos(leanO);
        // R3-SNK-8 mouth run (table.js snkMouthSection mirror, MODEL M1): the
        // flap face leans 6.5° outward going up from its foot (z 3.0), a
        // chamfer (jog 2.15) from 23.03 to 18.87 under the top leads to a
        // vertical rim wall up to 7.7 under the top, a 14.5° back-lean to
        // 2.73 under, then the model's lip profile onto the flat start
        const yFoot0 = 0.0030, tanLm = Math.tan((6.5 * Math.PI) / 180);
        const yChamTop = topY - 0.02303, yRim0 = topY - 0.01887, yRimTop = topY - 0.0077; // V8-C3: the dead lipR literal dropped
        const rFlapTop = rFlap + (yChamTop - yFoot0) * tanLm;
        const yLedge = yChamTop, rPad0 = rFlapTop - 0.00215;
        const rFlat0 = rPad0 + (topY - 0.00273 - yRimTop) * Math.tan((14.5 * Math.PI) / 180) + 0.00909;
        // LAW r3_4 plan LEGS (corner; table.js snkPlateSpec legPolar mirror):
        // an outer landmark of phi-0 radius rB sits on the offset arc
        // (centre 5.18 outward) for |phi| ≤ 35.8°, then on its own rail-
        // parallel line (⟂ distance rB − 0.31), which ends at the rail end
        // plane dFace − gap (dFace from the window half-angle the
        // descriptor carries: phiEnd = 0.75π − acos((dFace − 10.8)/rFlap))
        const phiEndD = corner ? (f.half - 0.042 - 0.12) : 0;
        const dFaceD = corner ? rFlap * Math.cos(0.75 * Math.PI - phiEndD) + 0.0108 : 0;
        const legR = (rB) => {
          if (!corner) return rB;
          const a = Math.abs(ang);
          const rArc = (rB - 0.00518) + 0.00518 * Math.cos(a);
          const A0 = (35 * Math.PI) / 180, A1 = (47 * Math.PI) / 180;
          if (a <= A0) return rArc;
          const D = rB - 0.00031, dP = dFaceD - 0.00025;
          const aEnd = Math.PI / 4 + Math.atan2(dP, D);
          if (a >= aEnd) return Math.hypot(D, dP);
          const rLine = D / Math.cos(a - Math.PI / 4);
          if (a >= A1) return rLine;
          const t = (a - A0) / (A1 - A0), S = t * t * t * (t * (t * 6 - 15) + 10);
          return rArc + (rLine - rArc) * S;
        };
        const flat1L = legR(rFlat1);
        // … then the 14.5° back-lean to 2.73 under the top and the model's
        // own LIP profile to the flat start (9.09 out, 0.30 under the crest;
        // the two-facet MODEL profile mirrored by its kink knots)
        const leanA = (14.5 * Math.PI) / 180, yLeanTop = topY - 0.00273;
        const rLeanTop = rPad0 + (yLeanTop - yRimTop) * Math.tan(leanA);
        const yFlat0 = topY - 0.0003;
        const pts = [[rFlap, yFoot0], [rFlapTop, yChamTop], [rPad0, yRim0], [rPad0, yRimTop], [rLeanTop, yLeanTop]];
        for (const [fr, fz] of [[0.2344, 0.4611], [0.4724, 0.8773], [0.7362, 0.9385]]) pts.push([rLeanTop + fr * (rFlat0 - rLeanTop), yLeanTop + fz * (yFlat0 - yLeanTop)]);
        pts.push([rFlat0, yFlat0], [(rFlat0 + flat1L) / 2, topY], [flat1L, topY - crown]);
        { const cY = topY - crown - outerR;
          for (let i = 1; i <= 5; i++) { const a = (Math.PI / 2) + (leanO - Math.PI / 2) * i / 5; pts.push([legR(rFlat1 + outerR * Math.cos(a)), cY + outerR * Math.sin(a)]); } }
        pts.push([legR(rFace), yFaceTop], [legR(rFace), yFaceBot], [legR(rUnder), yUnder], [legR(rRoot), yRoot]);
        for (const q of skirtUp) pts.push([legR(q[0]), q[1]]);
        pts.push([legR(rSk(hemY)), hemY]);
        let dist = Infinity;
        for (let i = 0; i + 1 < pts.length; i++) dist = Math.min(dist, seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
        // inside the solid section (under the top, outside the flap/pad face, inside the outer envelope)? → negative
        const rOuterAt = (y) => legR((() => {
          if (y >= yRoundEnd) return rRoundEnd;
          if (y >= yFaceTop) return rFace - (y - yFaceTop) * Math.tan(leanO);
          if (y >= yFaceBot) return rFace;
          if (y >= yUnder) return rFace + (rUnder - rFace) * (yFaceBot - y) / (yFaceBot - yUnder);
          if (y >= yRoot) return rUnder + (rRoot - rUnder) * (yUnder - y) / (yUnder - yRoot);
          let prev = [rRoot, yRoot];
          for (const [r, yy] of skirtUp) { if (y >= yy) return prev[0] + (r - prev[0]) * (prev[1] - y) / (prev[1] - yy); prev = [r, yy]; }
          return rSk(y);
        })());
        const rInnerAt = (y) => (y <= yLedge ? rFlap : rPad0);
        if (py < topY && py > hemY && d >= rInnerAt(py) && d <= rOuterAt(py)) dist = -dist;
        worst = Math.min(worst, dist - rr);
      }
    }
    return { worst };
  };
  // review W11 r6/r7 NOTE — the jaw drape (obSnkJawWrap) is deliberately
  // NOT a cue-pose obstacle here: it is flush dressing bounded by the
  // SHIPPED solids (≤ wood + 0.05 mm over the plank flare, ≤ the
  // measured jaw-wall class + ply off-wood), so any cue interaction
  // with it is the shipped graze class the clearance model already
  // permits against those solids. A pose-based plane-cap leg tried in
  // r6/r7 false-failed legal low passes (its caps exceed the model's
  // own regional tops). The sound law is geometry-vs-geometry and
  // lives in tools/render/check-corner-form.mjs: F4 pins the global
  // ceiling (47.05 ≤ 47.1) and F5 proves every off-wood drape vertex
  // stays at/under the wall class — i.e. the drape adds no obstruction
  // beyond the shipped surfaces anywhere a cue can reach.
  // (a)+(b) the corner repro pose — SURVIVES the W6 topology change: the
  // cream boot occupies the same diagonal graze corridor the retired cap
  // did (re-measured on the new oracle: stripped 3.136° runs ~5.9 mm
  // inside the roll/arris wires; the descriptor lifts to ~4.68° with
  // ~8.7 mm clear)
  // R3-SNK-7: the repro pose is CUP-RELATIVE (the graze corridor belongs to
  // the plate, and the plate datum moved to the purchased model's 27.92 mm
  // outboard): the shipped (1.44, 0.54) stood (−0.35074, −0.35524) from the
  // 6.24 cup (1.79074, 0.89524); the same offsets from the live cup
  const cupR = sn.bind.falls.find((f) => f.x > 0 && f.z > 0);
  const pos = { x: cupR.x - 0.35074, y: br, z: cupR.z - 0.35524 };
  const phi = -3 * Math.PI / 4 - 0.06;
  const fOld = cueMinElevationDeg(pos, phi, 0, 0, { ...sn, bind: null }, br);
  const fNew = cueMinElevationDeg(pos, phi, 0, 0, sn, br);
  const clipOld = tubeClear(pos, phi, fOld).worst;
  const clearNew = tubeClear(pos, phi, fNew).worst;
  console.log(`binding corner repro: stripped=${fOld.toFixed(3)}° `
    + `(assembly clip ${(clipOld * 1000).toFixed(2)}mm) with=${fNew.toFixed(3)}° `
    + `(assembly clear ${(clearNew * 1000).toFixed(2)}mm)`);
  // craft R3-SNK-2 (flush plate): the leather top IS the capping height,
  // so the rail carve already floors the cue within a millimetre of the
  // plate — the descriptor's contribution over the open mouth corridor is
  // the sub-millimetre class (stripped 3.136° runs 0.22 mm INTO the plate
  // here). The red is therefore the 1 mm LAW, not a deep clip: stripped,
  // the floor must leave < 1 mm to the plate (the sweep law's bound);
  // with the descriptor it must clear ≥ 1 mm. The old "rise ≥ 0.2°" leg
  // (the boot added ~0.74° here) is retired: on a flush plate the
  // furniture adds ≈ 0° by construction, and the decisive gates are the
  // clip/clear pair below.
  if (!(clipOld < 1e-3)) {
    fail(`binding repro: the stripped floor ${fOld}° must break the 1 mm `
      + `law at the plate (got ${clipOld} m — the review red, flush-plate class)`);
  }
  if (!(clearNew > 1e-3)) {
    fail(`binding repro: floored cue still inside the assembly margin `
      + `(${clearNew} m, want > 1 mm — RAIL_CLEAR is 2 mm)`);
  }
  // (b2) review r2 near-tangent SIDE-clip repro: tip offsets swing the shaft
  // so its FLANK grazes the roll while the axis stays outside/above — the
  // rev-2 vertical-only obstacle passed 2.998° with the taper 0.55 mm
  // inside the (then-taller) bead. Round 3: the historical 2.998° pin
  // belonged to the rev-2 crest; on the lowered assembly the STRIPPED
  // floor itself (2.792°) still runs the flank 2.2 mm inside — same red,
  // one anchor fewer. The Minkowski-expanded footprint must lift the floor
  // to a true ≥ 2 mm-margin angle (~3.48°) and the 3D oracle must clear.
  // W6 re-anchor: the historical (1.3916, 0.4870) @ −2.5167 pin belonged
  // to the retired capture-centred cap — its stripped floor now clears the
  // cup-centred boot by ~14 mm. Same red class, nearby pose against the
  // new assembly: stripped 2.731° runs the flank ~4.9 mm inside.
  const p2 = { x: 1.4845, y: br, z: 0.469 };
  const phi2 = -2.45, a2 = -0.2934, b2 = 0.1993;
  const f2Old = cueMinElevationDeg(p2, phi2, a2, b2, { ...sn, bind: null }, br);
  const f2 = cueMinElevationDeg(p2, phi2, a2, b2, sn, br);
  const clip2AtOld = tubeClear(p2, phi2, f2Old, a2, b2).worst;
  const clear2 = tubeClear(p2, phi2, f2, a2, b2).worst;
  console.log(`binding side-clip repro: stripped=${f2Old.toFixed(3)}° `
    + `(3D clip ${(clip2AtOld * 1000).toFixed(2)}mm) with=${f2.toFixed(3)}° `
    + `(3D clear ${(clear2 * 1000).toFixed(2)}mm)`);
  // craft R3-SNK-2: the roll the flank grazed is gone — on the flush plate
  // the stripped floor clears this pose by ~2.2 mm, so the penetration red
  // has no instance here (the descriptor's red lives in b1 and the
  // stripped sweep below). The ~3.9° "true-margin angle" pin belonged to
  // the boot; it is now DERIVED from the oracle at this pose — the
  // smallest elevation that clears the plate section by RAIL_CLEAR — and
  // the solver's floor must reach it (its footprint dilation is the same
  // RAIL_CLEAR; 0.05° absorbs the oracle's 1 mm station pitch).
  const marginAngle = (pp, ph, aa, bb) => {
    let lo = 0, hi = 15;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (tubeClear(pp, ph, m, aa, bb).worst >= CUE_DIMS.RAIL_CLEAR) hi = m; else lo = m;
    }
    return hi;
  };
  const m2 = marginAngle(p2, phi2, a2, b2);
  console.log(`binding side-clip margin angle (oracle, RAIL_CLEAR): ${m2.toFixed(3)}°`);
  if (!(f2 >= m2 - 0.05)) {
    fail(`binding side-clip floor ${f2}° below the oracle's RAIL_CLEAR margin `
      + `angle ${m2.toFixed(3)}° at this pose`);
  }
  if (!(clear2 > 1e-3)) {
    fail(`binding side-clip: floored cue within 1 mm of the assembly `
      + `(${clear2} m — RAIL_CLEAR is 2 mm)`);
  }
  // (b3) tip-taper repro (the review r3 horn-melt class on the W6 boot): a
  // high-offset cue beside a middle-saddle TIP — the flank reaches arc
  // where the tapering crest is taller than at the axis's own angle; the
  // angular-footprint melt envelope must keep engaging (the descriptor's
  // meltFrac/meltMin bound the cosine crest taper).
  const p3 = { x: -0.860, y: br, z: -0.809 };
  const phi3 = -1.410, a3 = -0.366, b3 = 0.462;
  const f3 = cueMinElevationDeg(p3, phi3, a3, b3, sn, br);
  const clear3 = tubeClear(p3, phi3, f3, a3, b3).worst;
  console.log(`binding horn-melt repro: with=${f3.toFixed(3)}° `
    + `(3D clear ${(clear3 * 1000).toFixed(2)}mm)`);
  // craft R3-SNK-2: the melt envelope this pin exercised (the saddle
  // crest tapering toward its tips) has no counterpart on the flush plate
  // — the top is level to the cut ends and meltMin equals the top, so the
  // angular footprint and the centreline agree by construction (floor
  // 1.683° here, 7.3 mm clear). The 1.9° pin is retired; the leg that
  // remains is the geometry law — the floored cue clears the plate.
  if (!(clear3 > 1e-3)) {
    fail(`binding horn-melt: floored cue within 1 mm of the melting roll `
      + `(${clear3} m)`);
  }
  // (b3b) review round-3 r3 P2: a near-tangent LATERAL pass — the flank
  // misses the furniture sideways by less than RAIL_CLEAR while the
  // membership/dilation terms only expanded by the cue radius, so the
  // margin was never charged laterally: the pre-fix floor 0.670° left
  // only 0.80 mm to the tube (the 1 mm sweep law bounds 2 mm RAIL_CLEAR
  // minus the documented conservatism slack). The rr + RAIL_CLEAR
  // dilation must lift this pose's floor to a true ≥ 1 mm-margin angle.
  {
    const p4 = { x: 0.5899, y: br, z: -0.2069 };
    const phi4 = -1.04184, a4 = -0.33155, b4 = 0.33866;
    const f4 = cueMinElevationDeg(p4, phi4, a4, b4, sn, br);
    const clear4 = tubeClear(p4, phi4, f4, a4, b4).worst;
    console.log(`binding lateral-margin repro: with=${f4.toFixed(3)}° `
      + `(3D clear ${(clear4 * 1000).toFixed(2)}mm)`);
    if (!(f4 > 0.75)) {
      fail(`binding lateral-margin floor ${f4}° — the margin-dilated `
        + 'footprint must engage (pre-fix rr-only dilation solved 0.670°)');
    }
    if (!(clear4 > 1e-3)) {
      fail(`binding lateral-margin: floored cue within 1 mm of the `
        + `assembly (${clear4} m — RAIL_CLEAR is 2 mm)`);
    }
  }
  // (b4) SWEEP: the general safety property behind every repro above —
  // over a pose grid around a middle and a corner mouth (offsets, swings,
  // tip offsets incl. the r2/r3 extremes), the solver's returned floor
  // always leaves the independent assembly oracle (bead tube + crown
  // wire) ≥ 1 mm (RAIL_CLEAR is 2 mm; the mm of slack absorbs the
  // oracle's 1 mm station pitch and the documented band-edge silhouette
  // conservatism bound).
  {
    let worstGap = Infinity, worstDesc = '', n = 0;
    const mouths = [
      { x: 0, z: sn.W / 2, phis: [Math.PI, -1.41, Math.PI + 0.6] },
      { x: sn.L / 2, z: sn.W / 2, phis: [Math.PI + Math.PI / 4, -2.5167, Math.PI + 1.1] },
    ];
    const SWEEP_OX = [-0.45, -0.35, -0.12, 0.12, 0.35, 0.45]; // R3-SNK-8 bracket (see the red arm note below)
    const SWEEP_OZ = [-0.55, -0.45, -0.25, -0.20];
    for (const mth of mouths) {
      for (const ox of SWEEP_OX) {
        for (const oz of SWEEP_OZ) {
          const pos = { x: mth.x + ox, y: br, z: mth.z + oz };
          if (Math.abs(pos.x) > sn.L / 2 - 0.05) continue;
          for (const phi of mth.phis) {
            for (const [a, b] of [[0, 0], [-0.366, 0.462], [0.3, -0.3]]) {
              const fl = cueMinElevationDeg(pos, phi, a, b, sn, br);
              const gap = tubeClear(pos, phi, fl, a, b).worst;
              n++;
              if (gap < worstGap) {
                worstGap = gap;
                worstDesc = `pos(${pos.x.toFixed(2)},${pos.z.toFixed(2)}) `
                  + `phi=${phi.toFixed(3)} a=${a} b=${b} floor=${fl.toFixed(2)}°`;
              }
            }
          }
        }
      }
    }
    console.log(`binding sweep: ${n} poses, worst oracle gap `
      + `${(worstGap * 1000).toFixed(2)}mm at ${worstDesc}`);
    if (!(worstGap > 1e-3)) {
      fail(`binding sweep: a returned floor leaves ${worstGap} m to the `
        + `plate (${worstDesc}) — want ≥ 1 mm everywhere`);
    }
    // craft R3-SNK-2 RED ARM for the descriptor on the flush plate: the
    // same sweep with the binding STRIPPED must break the 1 mm law
    // somewhere (the open mouth corridor is where the rail carve says
    // nothing and only the plate descriptor floors the cue).
    // R3-SNK-8: the bracket (SWEEP_OX / SWEEP_OZ) is one grid step wider
    // each way than the R3-SNK-2 set ([−0.35, −0.12, 0.12, 0.35] ×
    // [−0.45, −0.25]) — the MODEL lip profile lowered the leather 1.5 mm at
    // r 50–53 and the old bracket's worst stripped pose went from 0.45 mm
    // INTO the plate to 1.06 mm clear (the arm read "no teeth"); a dense
    // study (18 × 10 offsets) found 62 clipping poses, to −32.6 mm where
    // the rail carve returns a 0° floor. Both sweeps share the bracket, so
    // the positive law (≥ 1 mm with the descriptor) is tested there too.
    let worstStripped = Infinity, worstStrippedDesc = '';
    for (const mth of mouths) {
      for (const ox of SWEEP_OX) {
        for (const oz of SWEEP_OZ) {
          const pos = { x: mth.x + ox, y: br, z: mth.z + oz };
          if (Math.abs(pos.x) > sn.L / 2 - 0.05) continue;
          for (const phi of mth.phis) {
            for (const [a, b] of [[0, 0], [-0.366, 0.462], [0.3, -0.3]]) {
              const fl = cueMinElevationDeg(pos, phi, a, b, { ...sn, bind: null }, br);
              const gap = tubeClear(pos, phi, fl, a, b).worst;
              if (gap < worstStripped) {
                worstStripped = gap;
                worstStrippedDesc = `pos(${pos.x.toFixed(2)},${pos.z.toFixed(2)}) `
                  + `phi=${phi.toFixed(3)} a=${a} b=${b} floor=${fl.toFixed(2)}°`;
              }
            }
          }
        }
      }
    }
    console.log(`binding sweep STRIPPED: worst gap `
      + `${(worstStripped * 1000).toFixed(2)}mm at ${worstStrippedDesc}`);
    if (!(worstStripped < 1e-3)) {
      fail(`binding sweep red arm: stripped of the descriptor the sweep still `
        + `clears the plate by ${worstStripped} m everywhere — the descriptor `
        + 'is not load-bearing (or the oracle lost its teeth)');
    }

  }
  // (c) inner-side exemption: rail-parallel shot grazing the middle-mouth
  // annulus on the TABLE side — the boot only wraps the outer arc, so the
  // descriptor must contribute nothing (over-flooring here is the UX
  // regression the half-window test exists to prevent). W6: the pose moves
  // to +x so the BUTT stays clear of the corner boots too (the old −0.35
  // pose's butt hangs over the left corner mouth — see (c2)).
  const iPos = { x: 0.35, y: br, z: sn.W / 2 - 0.006 };
  const fI = cueMinElevationDeg(iPos, Math.PI / 2, 0, 0, sn, br);
  const fIStrip = cueMinElevationDeg(iPos, Math.PI / 2, 0, 0,
    { ...sn, bind: null }, br);
  console.log(`binding inner-side: with=${fI.toFixed(3)}° `
    + `stripped=${fIStrip.toFixed(3)}°`);
  if (fI !== fIStrip) {
    fail(`binding inner-side floor ${fI}° != stripped ${fIStrip}° — the `
      + 'inner arc must stay binding-free');
  }
  // (c2) HONEST CONSTRUCTION DELTA (W6): the same rail-parallel pose at
  // −0.35 leaves the BUTT hanging over the left corner mouth, where the
  // cream boot now really stands (band over the fall at ~38 mm from the
  // cup) — the stripped floor leaves only ~1.4 mm to the boot oracle, so
  // the descriptor MUST charge the margin here (the retired ring never
  // reached this pose; the sweep law wants ≥ 1 mm everywhere).
  {
    const cPos = { x: -0.35, y: br, z: sn.W / 2 - 0.006 };
    const fC = cueMinElevationDeg(cPos, Math.PI / 2, 0, 0, sn, br);
    const fCStrip = cueMinElevationDeg(cPos, Math.PI / 2, 0, 0,
      { ...sn, bind: null }, br);
    const clearC = tubeClear(cPos, Math.PI / 2, fC).worst;
    console.log(`binding butt-over-corner: with=${fC.toFixed(3)}° `
      + `stripped=${fCStrip.toFixed(3)}° (clear ${(clearC * 1000).toFixed(2)}mm)`);
    if (!(fC > fCStrip)) {
      fail(`binding butt-over-corner: floor ${fC}° did not rise above `
        + `stripped ${fCStrip}° — the corner boot must charge the margin`);
    }
    if (!(clearC > 1e-3)) {
      fail(`binding butt-over-corner: floored cue within 1 mm of the boot `
        + `(${clearC} m)`);
    }
  }
  // (d) descriptor scoping: snooker only
  if (!sn.bind || sn.bind.falls.length !== 6) {
    fail('snooker binding descriptor missing or not 6 falls');
  }
  for (const id of ['joy_q8_9ft', 'umb_carom_284', SCRIPTED_PIN_TABLE_ID]) {
    if (geomFor(id).bind !== null) {
      fail(`${id}: pocket-mouth obstacle descriptor must be null`);
    }
  }
}

if (failures) {
  console.error(`\ncheck-cue-clearance: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\ncheck-cue-clearance: all cases OK');
