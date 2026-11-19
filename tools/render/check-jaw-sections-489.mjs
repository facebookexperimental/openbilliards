// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-jaw-sections-489.mjs — GH-489 R3-SNK-12 MARK 2 (THE JAW) section gate.
//
// THE OWNER'S MARK 2. The owner circled the two middle-pocket JAWS, not the
// straight run: where the cushion turns into the pocket the built cloth stood
// as a FIXED VERTICAL WALL, while the Magnum's jaw keeps the straight run's
// undercut, foot and cap step all the way in. This gate measures the JAW
// SECTION on the shipped bytes and compares it to the purchased model.
//
// WHAT IT MEASURES. Pure node — no browser. It imports web/scene/table.js,
// builds the snooker cushion loft exactly as the app does (makeGeom ->
// railPolysFor -> cushionProfile -> cushionGeom), and cuts it with a VERTICAL
// plane through the station's own plan nose point, PERPENDICULAR to that
// point's local plan tangent (TLS over +-4 mm of the 0.25 mm plan chain). The
// cut is expressed in the Magnum's own section frame:
//     h = mm above the bed (absolute)
//     d = mm behind THIS section's own foremost cushion point (its d-minimum
//         over h > 20 mm) — i.e. NOSE-RELATIVE.
//
// WHY NOSE-RELATIVE. The kernel plan arcs are FROZEN (tangency 110.338, R1
// 79.375, nose height 0.70 of the ball diameter = 36.75 mm — the snooker 7R/5 class, not the pool 63.5 %; SNK-12 verification C-2) and they are NOT the Magnum's plan
// arcs: at the same station our nose sits up to 5.202 mm behind the Magnum's
// (middle x50) and our plan obliquity differs by up to 8.21 deg (corner
// x1760) - both MEASURED by this gate, both tabled in the report. A section gate in the ABSOLUTE frame would therefore be reading the
// frozen plan, not the section we build. The absolute residual is not hidden:
// it is REPORTED per station as nose_recess_mm and phi_deviation_deg, and the
// --arm datum-slip red arm proves the station datum is wired.
//
// THE REFERENCE is the pinned fixture fixtures/magnum-jaw-sections-489.json:
// measured (d, h) polylines of the purchased Rasson Magnum II, read under
// quarantine, RDP eps 0.1 mm. MEASUREMENT ONLY — no purchased vertex, texture
// or baked map is in this repo.
//
// THE BAND. p90 <= 1.0 mm and max <= 2.0 mm on the WORSE of the two
// directions, judged over h in [0.5, 34.0] and d in [-0.5, 58]. Same band and
// same basis as letter E50 (Magnum facet noise 0.5 mm rms -> 2 sigma = 1.0 on
// p90; max 2.0 = the cap-seam / one-cloth-ply class, MODEL(Magnum)), reusable
// unchanged because the jaw sections are read with the SAME instrument on the
// SAME mesh and the noise floor does not grow in the jaw (A1: residual after
// one depth scale, rms 0.022-0.039 mm at every station, vs 0.025 straight).
//
// TWO-DIRECTIONAL, for the same reason letter E50 became two-directional in
// this round (order C-4): a one-way reference->ours nearest-neighbour read is
// a COVERAGE test — material of OURS with no Magnum counterpart costs zero.
// The ladder metric (min-d per h) is reported alongside as the SNK-11 /
// verifier metric, so the two rounds' numbers stay comparable.
//
// RED ARMS
//   --web <dir>              run against another tree. The lane's arm is the
//                            sealed 48fa8826 tree (the vertical wall). MEASURED:
//                            FIVE rows fail there - middle x80 (worse p90 1.111
//                            / max 1.313) and x50 (0.138 / 0.204, on the
//                            station-existence floor), corner x1700 (1.237 /
//                            1.561), x1740 (1.980 / 2.469) and x1760 (1.340 /
//                            1.705). The order's own red arm - the vertical
//                            wall must FIRE at x = 50 and x = 80 - is carried
//                            by the two middle rows.
//   --arm straight-section   substitute OUR OWN straight-run (x 600) section
//                            as "ours" at every station: a build that carries
//                            the straight section into the jaw. Reproducible
//                            without a second tree.
//   --arm datum-slip         map the CORNER stations with the MIDDLE rule, i.e.
//                            drop the 4.93 mm corner datum correction
//                            (L/2 = 1784.5 vs the Magnum NOSE_X = 1779.57).
//                            Each corner cut slides 4.93 mm along the rail.
//                            DIAGNOSTIC arm, not a band arm - MEASURED: the
//                            section residual does NOT leave the band (corner
//                            x1700 worse p90 0.159 -> 0.522, still < 1.0), so
//                            the SECTION is genuinely insensitive to a 4.93 mm
//                            station slide on this jaw. What the slide does
//                            move is the reported diagnostics: nose_recess
//                            -0.944 -> -1.481 / -2.387 -> -5.915 / -0.712 ->
//                            -7.809 and phi deviation -1.73 -> -5.41 / -2.06
//                            -> -5.14 / +8.21 -> +1.86 at x1700/1740/1760.
//                            Stated so nobody reads this gate as a check on
//                            the station datum: it is not, and the arm is what
//                            proves it is not.
//                            [replaces the retired --arm absolute, which was
//                             INERT: the cut origin is the front-chain nose
//                             point, so the nose subtraction is 0.000 mm and
//                             skipping it reproduced the baseline byte for
//                             byte. Recorded, not quietly deleted.]
//                            The arms that DO fire on the judged band are
//                            --arm straight-section (4 stations), --arm xplane
//                            (4), --arm empty (1) and --web <sealed tree> (5).
//   --arm xplane             cut with the x-plane instead of the perpendicular.
//                            middle x50 must move by ~9 mm of foot and FAIL.
//   --arm empty              drop the cut at one station: n_ours = 0 -> NaN ->
//                            FAIL. Never PASS-on-nothing.
//
// USAGE
//   node tools/render/check-jaw-sections-489.mjs [--web <dir>] [--out <json>]
//        [--arm <name>] [--sections <json>] [--entry <id>]
// exit 0 = all rows pass; 1 = a row failed; 2 = the instrument could not run,
// or --entry is not a key of the selected tree's TABLE_SPECS (refused by name).

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolveEntry } from './lib/entry-489.mjs';

const args = process.argv.slice(2);
const argOf = (k, dflt) => (args.includes(k) ? args[args.indexOf(k) + 1] : dflt);
const webDir = path.resolve(argOf('--web', new URL('../../web', import.meta.url).pathname));
const outPath = argOf('--out', null) ? path.resolve(argOf('--out')) : null;
const arm = argOf('--arm', null);
const secOut = argOf('--sections', null) ? path.resolve(argOf('--sections')) : null;
// SNK-R35-FIX (review r9 P2 B): the requested entry is validated against the SELECTED tree's TABLE_SPECS right after
// the import below (resolveEntry) — specFor() falls back to the scripted pin inside makeGeom, so an unknown id used
// to cut wpa_generic_9ft under the snooker label; ENTRY (the resolved id) is bound there, never from argv
const REQUESTED_ENTRY = argOf('--entry', 'wpbsa_snooker_12ft');

const FIX = JSON.parse(fs.readFileSync(
  new URL('./fixtures/magnum-jaw-sections-489.json', import.meta.url), 'utf8'));

const MM = 1000;
const H_LO = 0.5, H_HI = 34.0, D_LO = -0.5, D_HI = 58.0;
// R3-SNK-12 STATION-EXISTENCE floor (INSTRUMENT, fixed before the read).
// station() snaps to the NEAREST front-chain sample, so a tree whose front
// chain STOPS before the station still returns a section - just not the one
// asked for. That is not hypothetical: on the sealed 48fa8826 tree the middle
// chain ends at the kernel tangency x 110.34 and the corner chain at x
// 1689.27, so the three inner middle stations all snapped to 110.34 (snap
// 30.3 / 60.3 mm) and middle_x50 PASSED at 0.138 mm while measuring a place
// 60 mm away. A station that does not exist on the chain is a FAILURE, not a
// pass on its neighbour. The floor is 2 x the 0.25 mm chain resample pitch.
const SNAP_MAX = 0.5;
const BAND_P90 = 1.0, BAND_MAX = 2.0;
// KERNEL: the corner nose-line datum is L/2; MODEL(Magnum): its own corner
// nose-line intersection is at x 1779.57 (A1 kernelcmp.py), so a corner
// station named x in the Magnum's frame sits at (L/2 - (1779.57 - x)) from
// the middle-pocket axis on ours. Middle stations map 1:1 (both are measured
// from the middle-pocket axis).
const MAG_NOSE_X = 1779.57;

// R3-SNK-12 (instrument, found while running this gate's own red arms):
// resolve the MEASURED tree's bare `three` import to the three THAT tree
// ships. Two reasons this is not tools/render/lib/ensure-three.mjs:
//   1. that helper aliases the three of the tree the TOOL lives in, which is
//      the wrong module whenever --web names another tree — the before-arm
//      (--web <archive of the parent sha>) does exactly that, and would have
//      measured the parent's table.js against the current tree's three;
//   2. it writes <repo>/node_modules, which is not on the module-resolution
//      path of an archive's web/scene/table.js at all. Node walks up from the
//      IMPORTER, so the alias has to sit above the archive's web/.
// Before this the gate ran only because the battery happens to run
// check-cue-clearance — which does call ensureRealThree — from inside the
// same archive first. Standalone on a fresh `git archive` it died with
// ERR_MODULE_NOT_FOUND and exit 1, which is indistinguishable from a red arm
// firing if only the exit code is read. Measured: all four --arm runs on the
// 0fe45ef7 archive "failed" that way before this fix.
const ensureThreeFor = (wd) => {
  const vendor = path.join(wd, 'vendor', 'three.module.min.js');
  if (!fs.existsSync(vendor)) {
    console.error(`check-jaw-sections-489: no vendored three at ${vendor}`);
    process.exit(2);
  }
  const bytes = fs.readFileSync(vendor);
  const pkgJson = JSON.stringify({
    name: 'three', version: '0.0.0-vendored-copy', type: 'module', main: 'index.js',
  });
  // dirname(webDir), never inside the served docroot (ensure-three.mjs's own
  // rule): for the default --web that IS <repo>, so the shipped behaviour is
  // unchanged, and for an archive it is the archive root.
  const dir = path.join(path.dirname(wd), 'node_modules', 'three');
  fs.mkdirSync(dir, { recursive: true });
  const idx = path.join(dir, 'index.js');
  const pkg = path.join(dir, 'package.json');
  if (!fs.existsSync(idx) || !fs.readFileSync(idx).equals(bytes)) fs.writeFileSync(idx, bytes);
  if (!fs.existsSync(pkg) || fs.readFileSync(pkg, 'utf8') !== pkgJson) fs.writeFileSync(pkg, pkgJson);
};
ensureThreeFor(webDir);

const T = await import(pathToFileURL(path.join(webDir, 'scene/table.js')).href);
// unknown --entry → REFUSED by name (id + tree + known ids), exit 2, before any arm mutation or makeGeom
const ENTRY = resolveEntry(T, REQUESTED_ENTRY, { tool: 'check-jaw-sections-489', webDir });
// BODY-3 red arm 'wall-constant': the jaw wall forced back to the retired constant
// 8 mm BEFORE the geometry context is built (the fall context captures the table
// at makeGeom) — the W rows below must then FAIL; every other row is untouched
if (arm === 'wall-constant' && T.SNK_FALL?.wall) {
  T.SNK_FALL.wall.corner = [[0, 8]];
  T.SNK_FALL.wall.middle = [[0, 8]];
}
const G = T.makeGeom(ENTRY);
const prof = T.cushionProfile(G.render.cushionFamily,
  G.kernel.noseHeightFrac * G.render.profileBallD,
  G.render.style === 'snooker' ? T.SNK_CUSHION.bodyDepth : G.CW);
const polys = T.railPolysFor(G);
const opts = (G.template && G.render.style === 'snooker') ? { wallTrueV: true } : undefined;

// ---- the -Y long rail run that owns BOTH a corner and the middle pocket.
// scene plan: X = (ky - L/2)*1000, Z = (kx - W/2)*1000; the left rail has Z < 0.
let best = null;
for (let pi = 0; pi < polys.length; pi++) {
  const poly = polys[pi];
  const ctx = T.cushionPlanCtx(G, poly);
  let nkx = null;
  for (let i = 0; i < poly.length; i++) {
    if (!ctx.front[i]) continue;
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (Math.abs(a[0] - b[0]) < 1e-9) { nkx = a[0]; break; }
  }
  if (nkx === null || nkx > G.W / 2) continue;
  const xs = poly.map((p) => (p[1] - G.L / 2) * MM);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const nfront = ctx.front.filter(Boolean).length;
  if (lo < -1000 && hi > -400 && (!best || nfront > best.nfront)) best = { pi, poly, ctx, nkx, nfront };
}
if (!best) { console.error('FATAL: no -Y long rail run found'); process.exit(2); }
const { pi, poly, ctx, nkx } = best;
const M = poly.length;
const DATUM = (G.L / 2) * MM;

// ---- the ordered FRONT chain (increasing scene X), resampled at 0.25 mm
const fi = [];
for (let i = 0; i < M; i++) if (ctx.front[i]) fi.push(i);
const runs = [];
for (const i of fi) {
  const last = runs.length ? runs[runs.length - 1] : null;
  if (last && (last[last.length - 1] + 1) % M === i) last.push(i);
  else runs.push([i]);
}
if (runs.length > 2) { console.error('FATAL: front chain is not contiguous:', runs.length, 'runs'); process.exit(2); }
const chainEdges = runs.length === 2 ? runs[1].concat(runs[0]) : runs[0];
const CH = [poly[chainEdges[0]]].concat(chainEdges.map((e) => poly[(e + 1) % M]));
let P = CH.map(([kx, ky]) => [(ky - G.L / 2) * MM, (kx - G.W / 2) * MM]);
if (P[0][0] > P[P.length - 1][0]) P = P.slice().reverse();
const dense = [];
for (let i = 0; i < P.length - 1; i++) {
  const [x0, z0] = P[i], [x1, z1] = P[i + 1];
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(len / 0.25));
  for (let k = 0; k < n; k++) dense.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
}
dense.push(P[P.length - 1]);
const S = [0];
for (let i = 1; i < dense.length; i++) S.push(S[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
const NOSE_Z = (nkx - G.W / 2) * MM;

// station -> plan point + TLS tangent over +-4 mm (the same estimator the
// Magnum fixture used on its own nose chain, so the comparison is symmetric)
function station(sceneX) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < dense.length; i++) { const d = Math.abs(dense[i][0] - sceneX); if (d < bd) { bd = d; bi = i; } }
  const p0 = dense[bi];
  const sel = [];
  for (let i = 0; i < dense.length; i++) if (Math.abs(S[i] - S[bi]) <= 4.0) sel.push(dense[i]);
  const mx = sel.reduce((a, p) => a + p[0], 0) / sel.length;
  const mz = sel.reduce((a, p) => a + p[1], 0) / sel.length;
  let sxx = 0, sxz = 0, szz = 0;
  for (const p of sel) { const a = p[0] - mx, b = p[1] - mz; sxx += a * a; sxz += a * b; szz += b * b; }
  const th = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  let t = [Math.cos(th), Math.sin(th)];
  if (t[0] < 0) t = [-t[0], -t[1]];
  let rms = 0;
  for (const p of sel) { const r = -(p[0] - mx) * t[1] + (p[1] - mz) * t[0]; rms += r * r; }
  rms = Math.sqrt(rms / sel.length);
  let n = [-t[1], t[0]];
  if (n[1] < 0) n = [-n[0], -n[1]];
  const phi = (Math.atan2(Math.abs(t[1]), Math.abs(t[0])) * 180) / Math.PI;
  return { p0, t, n, phi, rms, nfit: sel.length, snap: bd };
}

// ---- exact triangle-plane cut of the shipped loft
// BODY-3 red arm 'wall-constant': the jaw wall forced back to the retired constant
// 8 mm before the loft is built — the W rows below must then FAIL (the wedge table
// is what they read); every other row is untouched by it
const geo = T.cushionGeom(G, poly, prof, opts);
const pos = geo.getAttribute('position').array;
const idx = geo.index.array;
function cut(p0, t, n, limit = 150) {
  const segs = [];
  for (let q = 0; q < idx.length; q += 3) {
    const V = [0, 1, 2].map((k) => { const o = idx[q + k] * 3; return [pos[o] * MM, pos[o + 1] * MM, pos[o + 2] * MM]; });
    const f = V.map((v) => (v[0] - p0[0]) * t[0] + (v[2] - p0[1]) * t[1]);
    const hit = [];
    for (let e = 0; e < 3; e++) {
      const a = V[e], b = V[(e + 1) % 3], fa = f[e], fb = f[(e + 1) % 3];
      if ((fa <= 0 && fb > 0) || (fb <= 0 && fa > 0)) {
        const s = fa / (fa - fb);
        const X = a[0] + s * (b[0] - a[0]), Y = a[1] + s * (b[1] - a[1]), Z = a[2] + s * (b[2] - a[2]);
        hit.push([-((X - p0[0]) * n[0] + (Z - p0[1]) * n[1]), Y]);
      }
    }
    if (hit.length === 2 && Math.hypot(hit[0][0] - hit[1][0], hit[0][1] - hit[1][1]) > 1e-9) {
      const md = (hit[0][0] + hit[1][0]) / 2;
      if (md > -limit && md < limit) segs.push(hit);
    }
  }
  return segs;
}

// ---- silhouette ladder: the smallest in-window d present at each h
function minD(segs, hs) {
  const out = new Array(hs.length).fill(NaN);
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    let v = Infinity;
    for (const [[d0, h0], [d1, h1]] of segs) {
      if ((h0 - h) * (h1 - h) > 0 || Math.abs(h1 - h0) <= 1e-12) continue;
      const d = d0 + ((h - h0) / (h1 - h0)) * (d1 - d0);
      if (d >= D_LO && d <= D_HI && d < v) v = d;
    }
    if (v < Infinity) out[i] = v;
  }
  return out;
}
const HS = [];
for (let h = H_LO; h <= H_HI + 1e-9; h += 0.25) HS.push(+h.toFixed(4));

function pt2poly(pts, curve) {
  const out = [];
  for (const [px, py] of pts) {
    let bestD = Infinity;
    for (let i = 0; i + 1 < curve.length; i++) {
      const [ax, ay] = curve[i], [bx, by] = curve[i + 1];
      const ex = bx - ax, ey = by - ay;
      const L2 = ex * ex + ey * ey;
      const u = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / L2)) : 0;
      const d = Math.hypot(px - (ax + u * ex), py - (ay + u * ey));
      if (d < bestD) bestD = d;
    }
    out.push(bestD);
  }
  return out;
}
const stats = (v) => {
  if (!v.length) return { p50: NaN, p90: NaN, max: NaN, n: 0 };
  const s = v.slice().sort((a, b) => a - b);
  return {
    p50: s[Math.floor(s.length * 0.5)],
    p90: s[Math.min(s.length - 1, Math.floor(s.length * 0.9))],
    max: s[s.length - 1],
    n: s.length,
  };
};

// ---- the straight-run reference cut (the --arm straight-section source and
// the control the report quotes)
const straightSt = station(-600);
const straightSegs = cut(straightSt.p0, straightSt.t, straightSt.n);

const rows = [];
const sections = {};
let failures = 0;
for (const F of FIX.stations) {
  // R3-SNK-12 arm 'datum-slip': map the CORNER stations with the MIDDLE rule,
  // i.e. drop the corner datum correction (our |x| = x_magnum + 4.93, from
  // L/2 = 1784.5 against the Magnum's NOSE_X = 1779.57).
  // R3-SNK-BODY-1 (review r3 D): that arm was INERT — measured on a7e5e437 the
  // 4.93 mm slide moved no station out of its band (the jaw section changes
  // slowly at x 1700–1760; SNK-12 record: 4/4/1/0). An arm that cannot fire
  // proves nothing, so the arm now slides the corner stations by ONE STATION
  // PITCH (20 mm: 1740 → 1760 → 1780 are the fixture's own spacing) in the
  // direction the datum correction points, on top of dropping it. The read at
  // 4.93 is disclosed as insensitive; the arm proves the station mapping is
  // wired to the reads (fail_count must be > 0 under --arm datum-slip).
  const DATUM_SLIP_MM = 20.0;
  const sceneX = F.pocket === 'middle' ? -F.x_mm
    : (arm === 'datum-slip') ? -(F.x_mm + DATUM_SLIP_MM)
      : -(DATUM - (MAG_NOSE_X - F.x_mm));
  const st = station(sceneX);
  let segs = (arm === 'straight-section') ? straightSegs
    : (arm === 'xplane') ? cut([sceneX, st.p0[1]], [1, 0], [0, 1])
      : cut(st.p0, st.t, st.n);
  if (arm === 'empty' && F.id === 'middle_x80') segs = [];

  // Our own nose: the d-minimum over h > 20 mm (the SNK-11 nose-band rule).
  // MEASURED RESULT, disclosed rather than hidden: this shift is 0.000 mm at
  // every station, because the cut origin p0 IS the front-chain nose point, so
  // our d is already nose-relative by construction. The subtraction is
  // therefore a no-op here and its former red arm ('absolute') was INERT - it
  // reproduced the baseline byte for byte. It is retired in favour of
  // 'datum-slip', which perturbs the datum that is actually load-bearing (the
  // station mapping). The subtraction is KEPT because it is what makes the
  // comparison well-posed if the cut origin ever stops being the nose; the
  // shift is reported per station so an inert no-op cannot go unnoticed again.
  let noseOurs = Infinity;
  for (const [[d0, h0], [d1, h1]] of segs) {
    if (h0 > 20 && d0 < noseOurs) noseOurs = d0;
    if (h1 > 20 && d1 < noseOurs) noseOurs = d1;
  }
  if (!Number.isFinite(noseOurs)) noseOurs = NaN;
  const shift = noseOurs;
  const rel = segs.map(([a, b]) => [[a[0] - shift, a[1]], [b[0] - shift, b[1]]]);

  const ourL = minD(rel, HS);
  const refSegs = [];
  for (let i = 0; i + 1 < F.points.length; i++) refSegs.push([F.points[i], F.points[i + 1]]);
  const refL = minD(refSegs, HS);

  const dev = [];
  let hAtMax = NaN, mx = -1, oursOnly = 0, refOnly = 0;
  for (let i = 0; i < HS.length; i++) {
    const a = ourL[i], b = refL[i];
    if (Number.isNaN(a) && !Number.isNaN(b)) refOnly++;
    if (!Number.isNaN(a) && Number.isNaN(b)) oursOnly++;
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    const e = Math.abs(a - b);
    dev.push(e);
    if (e > mx) { mx = e; hAtMax = HS[i]; }
  }
  const ladder = { ...stats(dev), h_at_max: hAtMax, ours_only: oursOnly, ref_only: refOnly };

  const ourC = [], refC = [];
  for (let i = 0; i < HS.length; i++) {
    if (!Number.isNaN(ourL[i])) ourC.push([ourL[i], HS[i]]);
    if (!Number.isNaN(refL[i])) refC.push([refL[i], HS[i]]);
  }
  const o2r = (ourC.length > 1 && refC.length > 1) ? stats(pt2poly(ourC, refC)) : { p90: NaN, max: NaN, n: ourC.length };
  const r2o = (ourC.length > 1 && refC.length > 1) ? stats(pt2poly(refC, ourC)) : { p90: NaN, max: NaN, n: refC.length };
  const worseIsOurs = !(r2o.p90 >= o2r.p90);
  const worse = {
    p90: Math.max(o2r.p90, r2o.p90),
    max: Math.max(o2r.max, r2o.max),
    dir: worseIsOurs ? 'ours->ref' : 'ref->ours',
  };

  // the FROZEN-PLAN conflict, reported not hidden: our nose sits
  // nose_recess_mm behind the Magnum's at the same station, and our plan
  // obliquity differs by phi_deviation_deg. Neither is judged here.
  const noseRecess = Number.isFinite(noseOurs)
    ? (Math.abs(st.p0[1] - NOSE_Z) - Math.abs(F.nose_point_xy[1] - (-886.685))) : NaN;

  // fail-closed: NaN never passes; and a station that is not ON the front
  // chain fails outright rather than reporting its neighbour's section.
  const onChain = st.snap <= SNAP_MAX;
  const ok = onChain && Number.isFinite(worse.p90) && Number.isFinite(worse.max)
    && worse.p90 <= BAND_P90 && worse.max <= BAND_MAX;
  if (!ok) failures++;
  rows.push({
    id: F.id, pocket: F.pocket, x_mm: F.x_mm, ok, on_chain: onChain,
    phi_ours: +st.phi.toFixed(3), phi_ref: +F.phi_deg.toFixed(3),
    phi_deviation_deg: +(st.phi - F.phi_deg).toFixed(3),
    nose_recess_mm: Number.isFinite(noseRecess) ? +noseRecess.toFixed(3) : null,
    nose_shift_mm: Number.isFinite(noseOurs) ? +noseOurs.toFixed(4) : null,
    tangent_fit_rms_mm: +st.rms.toFixed(4), tangent_fit_n: st.nfit,
    station_snap_mm: +st.snap.toFixed(4),
    n_our_segments: segs.length, n_our_ladder: ourC.length, n_ref_ladder: refC.length,
    ladder: { p50: +ladder.p50.toFixed(3), p90: +ladder.p90.toFixed(3), max: +ladder.max.toFixed(3), n: ladder.n, h_at_max: ladder.h_at_max, ours_only: ladder.ours_only, ref_only: ladder.ref_only },
    twoway: {
      ours_to_ref: { p90: +o2r.p90?.toFixed?.(3), max: +o2r.max?.toFixed?.(3), n: o2r.n },
      ref_to_ours: { p90: +r2o.p90?.toFixed?.(3), max: +r2o.max?.toFixed?.(3), n: r2o.n },
      worse: { p90: +worse.p90?.toFixed?.(3), max: +worse.max?.toFixed?.(3), dir: worse.dir },
    },
  });
  // The dump carries BOTH bodies: the raw cut (`ours`, every crossing segment,
  // hidden material included) and the JUDGED ladder (`ours_ladder`/`ref_ladder`,
  // the front silhouette this gate actually scores). The overlay card draws the
  // raw cut faint and the ladder solid, so what the eye compares is what the
  // number compares.
  if (secOut) sections[F.id] = { ours: rel, ref: F.points, ours_ladder: ourC, ref_ladder: refC,
    window: { h: [H_LO, H_HI], d: [D_LO, D_HI] }, st: { ...st, sceneX } };
  const f3 = (v, w = 6) => (Number.isFinite(v) ? v.toFixed(3) : 'NaN').padStart(w);
  const f2 = (v, w = 6) => (Number.isFinite(v) ? v.toFixed(2) : 'NaN').padStart(w);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${F.id.padEnd(13)}  worse p90 ${f3(worse.p90)} / max ${f3(worse.max)} (${F.pocket === 'middle' ? worse.dir.padEnd(9) : worse.dir.padEnd(9)})`
    + `  ladder p90 ${f3(ladder.p90)} / max ${f3(ladder.max)}`
    + `  phi ${f2(st.phi)} vs ${f2(F.phi_deg)} (${(st.phi - F.phi_deg >= 0 ? '+' : '') + (st.phi - F.phi_deg).toFixed(2)})`
    + `  nose recess ${Number.isFinite(noseRecess) ? noseRecess.toFixed(3) : 'n/a'}`
    + `${onChain ? '' : `  OFF-CHAIN snap ${st.snap.toFixed(2)} mm > ${SNAP_MAX}`}`);
}

// ---- BODY-3 (ruling R-wallT): the jaw WALL follows the MODEL(Magnum) wedge table.
// Rows W1–W3: our cloth-wall width at h 39.5 (the row under the top round), at
// x-plane cuts 0.5 / 1.0 / 2.0 mm inside OUR corner wood end plane (T.pocketFaceStations
// xFace, the plane the band is pinned to), against the Magnum blade read at the
// same distances inside ITS end (r4-reads item 2b, h 39.5: 5.89 / 6.94 / 8.59) ± the
// read's own spread between h 39.5 and 39.0 (0.26 / 0.33 / 0.55 → 0.4 / 0.4 / 0.6).
// Width = the extent of the section's crossings at h 39.5 within |d| ≤ 80 (the jaw
// face to the cloth/wood boundary — the loft is the cloth alone). The arm
// 'wall-constant' rebuilds the loft with the retired 8 and must fire here.
{
  const WEDGE = [[0.5, 5.89, 0.4], [1.0, 6.94, 0.4], [2.0, 8.59, 0.6]];
  const fs2 = T.pocketFaceStations ? T.pocketFaceStations(ENTRY) : null;
  const xEnd = fs2 ? -(fs2.xFace * MM) : NaN;       // the gate's frame mirrors x (see sceneX above)
  // The read is taken in PLAN, as the band is built: the wood/cloth boundary = the
  // loft's back face where it is vertical (h 30, under the top round — the same
  // back d at h 30 / 35 / 38 on this tree), and the jaw face = the kernel plan
  // chain at that x (the nose-height outline the profile is lofted on). A plane
  // cut at the top row (h 39.5) reads the face 1–2 mm further back on the nose
  // round and the Magnum's cap lip slopes 51.75 → 60.1 over h 39.9 → 37.25, so a
  // single-height section is not the plan wall on either body; the Magnum table
  // is its cap lip − face at h 39.5, where its lip stands at its plan value.
  const H_W = 30;
  for (const [dIn, wRef, tol] of WEDGE) {
    const x = xEnd + dIn;                          // inboard = toward the middle (+x in this frame)
    let width = NaN, n = 0, faceD = NaN, backD = NaN;
    if (Number.isFinite(x)) {
      const segs = cut([x, NOSE_Z], [1, 0], [0, 1], 150);
      const ds = [];
      for (const [[d0, h0], [d1, h1]] of segs) {
        if ((h0 - H_W) * (h1 - H_W) > 0 || Math.abs(h1 - h0) <= 1e-12) continue;
        const d = d0 + ((H_W - h0) / (h1 - h0)) * (d1 - d0);
        if (Math.abs(d) <= 80) ds.push(d);
      }
      n = ds.length;
      if (n >= 1) {
        backD = Math.max(...ds);
        const stF = station(x);                    // the kernel plan chain at this x
        faceD = -(stF.p0[1] - NOSE_Z);            // the cut's d convention: −(Z − nose Z)
        width = backD - faceD;
      }
    }
    const ok = Number.isFinite(width) && Math.abs(width - wRef) <= tol;
    if (!ok) failures++;
    const id = `W${1 + WEDGE.findIndex((r) => r[0] === dIn)}`;
    rows.push({ id, pocket: 'corner', x_mm: Number.isFinite(x) ? +x.toFixed(2) : null, d_inside_end_mm: dIn, ok,
      wall_width_mm: Number.isFinite(width) ? +width.toFixed(3) : null, face_d_mm: Number.isFinite(faceD) ? +faceD.toFixed(2) : null, back_d_mm: Number.isFinite(backD) ? +backD.toFixed(2) : null, ref_mm: wRef, tol_mm: tol, crossings: n, h_mm: H_W });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(13)}  jaw wall at ${dIn.toFixed(1)} mm inside the wood end plane, h ${H_W}: `
      + `${Number.isFinite(width) ? width.toFixed(2) : 'n/a'} mm vs MODEL(Magnum) ${wRef} ± ${tol} (${n} crossings at x ${Number.isFinite(x) ? x.toFixed(1) : 'n/a'})`
      + ` face d ${Number.isFinite(faceD) ? faceD.toFixed(2) : 'n/a'} back d ${Number.isFinite(backD) ? backD.toFixed(2) : 'n/a'} (lip 51.17)`
      + `${arm === 'wall-constant' ? '  [ARM wall-constant: loft built with the retired 8 mm]' : ''}`);
  }
}

console.log('');
console.log(`band: worse-direction p90 <= ${BAND_P90} mm, max <= ${BAND_MAX} mm; `
  + `window h [${H_LO}, ${H_HI}], d [${D_LO}, ${D_HI}] (nose-relative); `
  + `station must lie ON the front chain (snap <= ${SNAP_MAX} mm)`);
console.log(`web tree: ${webDir}`);
console.log(`fixture: tools/render/fixtures/magnum-jaw-sections-489.json `
  + `(${FIX.stations.length} stations, RDP eps ${FIX.rdp_eps_mm} mm)   arm: ${arm ?? 'none'}`);
console.log(`${failures} failure(s)`);

if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify({
    tool: 'check-jaw-sections-489', web: webDir, entry: ENTRY, arm: arm ?? null,
    band: { p90: BAND_P90, max: BAND_MAX, window_h: [H_LO, H_HI], window_d: [D_LO, D_HI] },
    fixture: { file: 'tools/render/fixtures/magnum-jaw-sections-489.json', stations: FIX.stations.length, rdp_eps_mm: FIX.rdp_eps_mm, source: FIX.source },
    plan: { poly_index: pi, nose_Z_mm: +NOSE_Z.toFixed(4), datum_mm: DATUM, front_edges: fi.length, chain_points: dense.length },
    rows, fail_count: failures,
  }, null, 1));
  console.log(`report -> ${outPath}`);
}
if (secOut) { fs.writeFileSync(secOut, JSON.stringify(sections)); console.log(`sections -> ${secOut}`); }
process.exit(failures ? 1 : 0);
