#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-loft-bands-489 — GH-489 R3-SNK-12: the loft's band orientation, ring
// simplicity and cap orientation, read straight from cushionGeom (no browser).
//
// Builds every snooker rail's cushion loft exactly as the app does (makeGeom
// -> railPolysFor -> cushionProfile -> cushionGeom) and judges, per rail:
//   BANDS  every triangle of the row-to-row bands faces along the loft's own
//          outward normal — the plan edge's outward normal tilted by the
//          profile segment it sweeps (dz outward, do up). A triangle facing
//          INTO the body is a fold: it is culled under FrontSide (a see-through
//          hole) and renders black in a two-sided path tracer.
//   CAP    every top-plane triangle (the flat cloth strip + the cap) faces up.
//          Judged at >= one pixel of the finest battery render (FLOOR_MM2
//          below); smaller slivers are earcut's collinear leftovers and are
//          reported as INFO.
//   RINGS  every profile row's plan ring is simple (no proper self-crossing).
// CAP and RINGS are read from the geometry / rings the app ships; BANDS are
// judged on the rings cushionGeom lofts (ringAt + collapse + the band law where
// the tree exports it) with the app's own quad split, edge by edge — a
// mesh-level band test cannot name a triangle's plan edge unambiguously at the
// corner blade, where the front chain and the wall are a few mm apart.
//
// Why a new gate and not check-cushion-profile: that tool's snooker top-cap
// row has failed since #308 on 199 zero-area down-facing triangles, so when the
// R3-SNK-12 jaw round turned 132 of them into triangles WITH area (592 mm2 over
// six rails, the black slivers in the seal's own clay frames) the row's verdict
// did not change. This gate judges AREA, and judges the bands, which nothing
// judged before.
//
// usage: node tools/render/check-loft-bands-489.mjs [--web <dir>] [--entry <id>] [--out <json>]
// exit 0 clean; 1 any inverted band triangle / down-facing cap area / ring
// crossing; 2 tooling, or an --entry that is not a key of the SELECTED tree's TABLE_SPECS (SNK-R35-FIX, review r9
// P2 B: specFor() falls back to the scripted pin inside makeGeom, so a misspelled `--entry wpbsa_snooker_12f` judged
// wpa_generic_9ft's six rails and PASSED under the snooker label — now REFUSED by name before anything is built;
// the report's entry is the RESOLVED id). Red arm: --web <archive of 8c4021a5> must FAIL (54 / 592 mm2).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveEntry } from './lib/entry-489.mjs';

const argOf = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const webDir = path.resolve(argOf('--web', 'web'));
const REQUESTED_ENTRY = argOf('--entry', 'wpbsa_snooker_12ft');
const OUT = argOf('--out', null);
const MM = 1000;
// Judged area floor for an inverted triangle: one pixel of the finest render the
// battery ships — the 8 px/mm section-overlay sheet, (1/8 mm)^2 = 0.015625 mm2
// (DERIVED from that sheet's scale). Below it a triangle cannot occupy a pixel of
// any battery artefact and is reported as INFO, not judged: the parent 48fa8826
// carries two such slivers per rail (2.90e-5 / 1.87e-5 mm2, earcut's exactly-
// collinear leftovers), while the R3-SNK-12 fold class starts at 1.84 mm2 —
// 118x above the floor. The law inside cushionGeom itself acts at 1e-6 mm2 (a
// numerical zero); the gate judges what a render could show.
const FLOOR_MM2 = 1 / 64;

// the measured tree's own three (a bare 'three' specifier resolves upward from the IMPORTER)
const vendor = path.join(webDir, 'vendor', 'three.module.min.js');
if (!fs.existsSync(vendor)) { console.error(`check-loft-bands-489: no vendored three at ${vendor}`); process.exit(2); }
const nm = path.join(path.dirname(webDir), 'node_modules', 'three');
fs.mkdirSync(nm, { recursive: true });
const bytes = fs.readFileSync(vendor);
const pkgJson = JSON.stringify({ name: 'three', version: '0.0.0-vendored-copy', type: 'module', main: 'index.js' });
if (!fs.existsSync(path.join(nm, 'index.js')) || !fs.readFileSync(path.join(nm, 'index.js')).equals(bytes)) fs.writeFileSync(path.join(nm, 'index.js'), bytes);
if (!fs.existsSync(path.join(nm, 'package.json')) || fs.readFileSync(path.join(nm, 'package.json'), 'utf8') !== pkgJson) fs.writeFileSync(path.join(nm, 'package.json'), pkgJson);

const T = await import(pathToFileURL(path.join(webDir, 'scene/table.js')).href);
// the entry is validated against THIS tree's TABLE_SPECS before makeGeom (unknown → exit 2 by name); ENTRY is the
// resolved id from the module's record and is what every line and the JSON below label
const ENTRY = resolveEntry(T, REQUESTED_ENTRY, { tool: 'check-loft-bands-489', webDir });
const G = T.makeGeom(ENTRY);
const prof = T.cushionProfile(G.render.cushionFamily, G.kernel.noseHeightFrac * G.render.profileBallD,
  G.render.style === 'snooker' ? T.SNK_CUSHION.bodyDepth : G.CW);
const polys = T.railPolysFor(G);
const opts = (G.template && G.render.style === 'snooker') ? { wallTrueV: true } : undefined;
const { backAt, oFAt } = T.cushionRingCtx(G, prof);
const rows = prof.rows;

// the module's own orientation / crossing helper (review r3 D: one copy, not three).
// Trees that predate the export (the gate's red arms run on 8c4021a5 / 48fa8826)
// have no T.segsCross; for THOSE the gate carries the same arithmetic locally —
// never used when the tree under test exports it.
const segsCrossOf = (T) => T.segsCross ?? ((a, b, c, d, E = 0) => {
  const o2 = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o2(c, d, a), d2 = o2(c, d, b), d3 = o2(a, b, c), d4 = o2(a, b, d);
  return ((d1 > E && d2 < -E) || (d1 < -E && d2 > E)) && ((d3 > E && d4 < -E) || (d3 < -E && d4 > E));
});
const segsCross = segsCrossOf(T);
const ringCrossings = (ring) => {
  const R = [];
  for (const p of ring) if (!R.length || Math.hypot(R[R.length - 1][0] - p[0], R[R.length - 1][1] - p[1]) > 1e-12) R.push(p);
  while (R.length > 1 && Math.hypot(R[0][0] - R[R.length - 1][0], R[0][1] - R[R.length - 1][1]) < 1e-12) R.pop();
  const n = R.length; let c = 0; const E = 1e-15;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segsCross(R[i], R[(i + 1) % n], R[j], R[(j + 1) % n], E)) c++;
  }
  return c;
};

const report = { tool: 'check-loft-bands-489', web: webDir, entry: ENTRY, rails: [], fail_count: 0 };
let fails = 0;
for (let pi = 0; pi < polys.length; pi++) {
  const poly = polys[pi];
  const ctx = T.cushionPlanCtx(G, poly);
  const M = poly.length;
  const g = T.cushionGeom(G, poly, prof, opts);
  const P = g.getAttribute('position').array, I = g.getIndex().array;
  // ---- CAP (mesh-level, unambiguous): every top-plane triangle with area must face up
  let top = -Infinity; for (let v = 1; v < P.length; v += 3) top = Math.max(top, P[v]);
  let capUp = 0, capDown = 0, capDownArea = 0, capDownTiny = 0, capDownTinyMax = 0; const worst = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const onTop = Math.abs(P[a + 1] - top) < 5e-5 && Math.abs(P[b + 1] - top) < 5e-5 && Math.abs(P[c + 1] - top) < 5e-5;
    if (!onTop) continue;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const ny = uz * vx - ux * vz; const area = 0.5 * Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) * MM * MM;
    if (area < 1e-6) continue;
    if (ny > 0) capUp++;
    else if (area < FLOOR_MM2) { capDownTiny++; capDownTinyMax = Math.max(capDownTinyMax, area); }
    else { capDown++; capDownArea += area; worst.push(['CAP-DOWN', area, (P[a] + P[b] + P[c]) / 3, top, (P[a + 2] + P[b + 2] + P[c + 2]) / 3]); }
  }
  // ---- BANDS (ring-level, exact): the rings cushionGeom lofts — ringAt + the GH-488P collapse +
  //      the band law where the tree has it (cushionBandLaw is exported from R3-SNK-12 on; a tree
  //      without it is judged on its raw rings, which is what its cushionGeom stitched) — and the
  //      app's own quad split per row pair and chain edge; a triangle faces INTO the body when its
  //      normal opposes (dz outward, do up) of its two rows at that plan edge.
  const rings = rows.map((r) => ctx.ringAt(r.o, oFAt(r.o, r.z), backAt(r.z)));
  for (const ring of rings) for (let i = 0; i < ring.length; i++) { const j = (i + 1) % ring.length;
    const dx = ring[j][0] - ring[i][0], dy = ring[j][1] - ring[i][1]; if (dx * ctx.ed[i][0] + dy * ctx.ed[i][1] < 0) ring[j] = ring[i]; }
  const hasLaw = typeof T.cushionBandLaw === 'function';
  if (hasLaw && ctx.kE && poly.profiled) T.cushionBandLaw(ctx, G, rows, rings);
  const sc = (Q, z) => [Q[1] - G.L / 2, z, Q[0] - G.W / 2];
  const triN = (a, b, c) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
  let bandBad = 0, bandBadArea = 0, bandTiny = 0;
  for (let k = 0; k + 1 < rows.length; k++) {
    const A = rings[k], B = rings[k + 1], zA = rows[k].z, zB = rows[k + 1].z, dz = zB - zA, dO = rows[k + 1].o - rows[k].o;
    for (let j = 0; j < M; j++) {
      const jn = (j + 1) % M; const ne = [-ctx.en[j][1] * dz, dO, -ctx.en[j][0] * dz]; const nel = Math.hypot(ne[0], ne[1], ne[2]); if (nel < 1e-12) continue;
      const r0j = sc(A[j], zA), r0n = sc(A[jn], zA), r1j = sc(B[j], zB), r1n = sc(B[jn], zB);
      const tris = ctx.s > 0 ? [[r0j, r0n, r1j], [r0n, r1n, r1j]] : [[r0j, r1j, r0n], [r0n, r1j, r1n]];
      for (const [a, b, c] of tris) {
        const n = triN(a, b, c); const nl = Math.hypot(n[0], n[1], n[2]); const area = 0.5 * nl * MM * MM; if (area < 1e-6) continue;
        if ((n[0] * ne[0] + n[1] * ne[1] + n[2] * ne[2]) / (nl * nel) < -1e-9) {
          if (area < FLOOR_MM2) { bandTiny++; continue; }
          bandBad++; bandBadArea += area;
          worst.push(['BAND-INWARD', area, (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3, `rows ${k}/${k + 1} edge ${j}`]); }
      }
    }
  }
  // ---- RINGS: the rings judged above (after the law where the tree has it) must be simple
  const crossings = rings.reduce((q, r) => q + ringCrossings(r), 0);
  worst.sort((p, q) => q[1] - p[1]);
  const ok = bandBad === 0 && capDown === 0 && crossings === 0;
  if (!ok) fails++;
  const line = `${ok ? 'PASS' : 'FAIL'}  rail ${pi}  band triangles inward ${bandBad} (${bandBadArea.toFixed(2)} mm2)  cap up ${capUp} / down ${capDown} (${capDownArea.toFixed(2)} mm2)  ring crossings ${crossings}  [band law ${hasLaw ? 'present' : 'ABSENT in this tree'}; sub-pixel slivers INFO: cap ${capDownTiny} (max ${capDownTinyMax.toExponential(2)} mm2), band ${bandTiny}]`
    + (worst.length ? `  worst ${worst.slice(0, 3).map(([w, ar, x, y, z, where]) => `${w} ${ar.toFixed(2)} mm2 @ x ${(x * MM).toFixed(1)} y ${(y * MM).toFixed(1)} z ${(z * MM).toFixed(1)}${where ? ' ' + where : ''}`).join('; ')}` : '');
  console.log(line);
  report.rails.push({ rail: pi, ok, band_inward: bandBad, band_inward_area_mm2: +bandBadArea.toFixed(3), band_inward_subpixel_info: bandTiny, cap_up: capUp, cap_down: capDown, cap_down_area_mm2: +capDownArea.toFixed(3), cap_down_subpixel_info: capDownTiny, cap_down_subpixel_max_mm2: capDownTinyMax, ring_crossings: crossings,
    band_law_present: hasLaw,
    worst: worst.slice(0, 6).map(([w, ar, x, y, z, where]) => ({ kind: w, area_mm2: +ar.toFixed(3), x_mm: +(x * MM).toFixed(2), y_mm: +(y * MM).toFixed(2), z_mm: +(z * MM).toFixed(2), where: where || null })) });
}
report.fail_count = fails;
console.log(`\nlaw: every band triangle faces along (dz outward, do up) of its rows; every top-plane triangle faces up; every ring is simple — judged at >= ${FLOOR_MM2} mm2 (one 8 px/mm sheet pixel), smaller slivers reported as INFO`);
console.log(`web tree: ${webDir}   entry: ${ENTRY}`);
console.log(`${fails} failure(s)`);
if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(report, null, 1)); console.log(`report -> ${OUT}`); }
process.exit(fails ? 1 : 0);
