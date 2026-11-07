#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// gi-mirror-census-490.mjs — BUILD-3 (review round 12 P1-b): prove that the GI bake
// mirror's chinese-8 occluders at the MIDDLE pocket equal the live renderer's
// geometry.  The mirror (tools/render/lib/scene.mjs, node) and the renderer
// (web/scene/table.js) now share ONE rail-end law (web/scene/cn8midlaw.js); this
// census reads the mirror's plan polygons through the same import the bake uses
// and compares them with a mesh dump of the live scene (the census dump the
// GATE-6 plan frames read: positions in three.js world metres).
//
//   node tools/render/gi-mirror-census-490.mjs --dump <after-cn8.json> [--out <json>] [--tol-mm 0.5]
//
// Rows (all ≤ tol, else RED):
//   cushion_cut_mm   |x| of the mirror's long-rail cushion end vs the live cushion's min |x|   (DT-09)
//   cushion_face_w   the mirror's end-face nose offset (JW-05) vs the live end face's min w
//   wood_cut_mm      |x| of the mirror's plank end vs the live plank's min |x|                (DT-09)
//   arc_hausdorff    live cushion nose-foot vertices (bed level, ahead of the end face, last 60 mm
//                    before the cut) → the mirror's arc polyline: max point-to-segment distance
// Exit 0 PASS · 3 RED · 2 REFUSE (no subject).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2)); // FIX10 (Fable pass 1): the run's view of the argv is the =-expanded view the parse consumed
const argOf = (k, d) => { const i = args.lastIndexOf(k); return i >= 0 ? args[i + 1] : d; };
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value

const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'gi-mirror-census-490', value: ['--out', '--dump', '--tol-mm'] });
const OUTJ = __P.value('--out') ?? '/tmp/ob-gi-mirror-490.json'; // FIX3 → FIX10: the prior verdict at the parsed destination is the first effect after the parse
{ const { invalidatePrior } = await import('./lib/serve-check.mjs'); invalidatePrior([OUTJ], 'gi-mirror-census-490'); }
const DUMP = __pathOpt('--dump', { tag: 'gi-mirror-census-490', mustExist: 'file', required: true }); const TOL = Number(argOf('--tol-mm', '0.5'));
if (!DUMP) { console.error('usage: --dump <after-cn8.json> [--out <json>] [--tol-mm 0.5]'); process.exit(2); }
const { TABLES } = await import(path.join(HERE, 'lib', 'scene.mjs'));
const tb = TABLES.chinese8_9ft; const rails = tb.railPlans(); const woods = tb.woodPlans();
const dump = JSON.parse(readFileSync(DUMP, 'utf8'));
const meshes = dump.meshes.filter((m) => Array.isArray(m.positions) && m.positions.length);
const pos = (m) => { const P = m.positions; const out = []; for (let i = 0; i < P.length; i += 3) out.push([P[i], P[i + 1], P[i + 2]]); return out; };
const NOSE = 0.63; const F = 1000;
const segDist = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const L2 = dx * dx + dz * dz; let t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz)); };
const rows = []; const out = { tool: 'tools/render/gi-mirror-census-490.mjs', dump: DUMP, tol_mm: TOL, sides: [] };
// long-rail polygons: the four whose |z| bb sits on the nose line (rails 0..3); the middle end is the vertex run at |x| minimum
for (const sz of [-1, 1]) {
  for (const sx of [-1, 1]) {
    const poly = rails.find((p) => { const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]); return Math.sign(xs[0] + xs[xs.length - 1]) === sx && Math.sign(zs[0]) === sz && Math.max(...xs.map(Math.abs)) < 1.25; });
    if (!poly) { rows.push({ side: `${sx}${sz}`, refuse: 'no long-rail polygon' }); continue; }
    const cutX = Math.min(...poly.map((q) => Math.abs(q[0])));
    const endVerts = poly.filter((q) => Math.abs(Math.abs(q[0]) - cutX) < 1e-6);
    const faceW = Math.min(...endVerts.map((q) => Math.abs(q[1]) - NOSE)); // the arc's last vertex (JW-05); the other is the back line
    // the arc polyline of the mirror near the middle (|x| < 0.12): consecutive vertices ordered along the outline
    const arc = poly.filter((q) => Math.abs(q[0]) < 0.12 && Math.abs(q[1]) - NOSE < 0.0475);
    // live cushion meshes on this side: min |x| over vertices within 0.2 m of the middle axis
    const cush = meshes.filter((m) => /^cn8-cushion-\d+$/.test(m.name));
    let liveCut = Infinity, liveFaceW = Infinity, liveWho = null; const foot = [];
    for (const m of cush) {
      for (const [x, y, z] of pos(m)) {
        if (Math.sign(z) !== sz || Math.sign(x) !== sx || Math.abs(x) > 0.2 || Math.abs(z) < NOSE - 0.001) continue;
        const ax = Math.abs(x);
        if (ax < liveCut - 1e-7) { liveCut = ax; liveWho = m.name; liveFaceW = Math.abs(z) - NOSE; }
        else if (Math.abs(ax - liveCut) < 1e-7) liveFaceW = Math.min(liveFaceW, Math.abs(z) - NOSE);
        // the nose-foot polyline only: bed level, ahead of the end face (w < JW-05), not ON the cut plane
        if (y < 0.0015 && ax < 0.12 && Math.abs(z) - NOSE < 0.0395 && ax > cutX + 1e-4) foot.push([x, z]);
      }
    }
    if (!Number.isFinite(liveCut)) { rows.push({ side: `${sx}${sz}`, refuse: 'no live cushion vertex near the middle' }); continue; }
    // the live plank on this side: min |x| of cn8-plank-* vertices with |z| in the plank band
    let liveWood = Infinity, woodWho = null;
    for (const m of meshes.filter((mm) => /^cn8-plank-\d+$/.test(mm.name))) for (const [x, , z] of pos(m)) { if (Math.sign(z) !== sz || Math.sign(x) !== sx || Math.abs(z) < NOSE + 0.04 || Math.abs(x) > 0.2) continue; if (Math.abs(x) < liveWood) { liveWood = Math.abs(x); woodWho = m.name; } }
    const wpoly = woods.find((p) => { const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]); return Math.sign(xs[0] + xs[xs.length - 1]) === sx && Math.sign(zs[0]) === sz && Math.max(...xs.map(Math.abs)) < 1.3; });
    const woodCut = wpoly ? Math.min(...wpoly.map((q) => Math.abs(q[0]))) : NaN;
    // Hausdorff: live nose-foot vertices in the last 60 mm before the cut → the mirror arc polyline
    let haus = 0, hausAt = null; const arcSeg = arc.slice().sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]));
    for (const p of foot) { if (Math.abs(p[0]) > liveCut + 0.060) continue; let d = Infinity; for (let i = 0; i + 1 < arcSeg.length; i++) d = Math.min(d, segDist(p, arcSeg[i], arcSeg[i + 1])); if (d > haus) { haus = d; hausAt = p; } }
    const r = { side: `${sx > 0 ? '+x' : '-x'} ${sz > 0 ? '+z' : '-z'}`, cushion_cut_mm: +(cutX * F).toFixed(3), live_cushion_cut_mm: +(liveCut * F).toFixed(3), cushion_cut_dev_mm: +Math.abs(cutX - liveCut).toFixed(4) * F,
      cushion_face_w_mm: +(faceW * F).toFixed(3), live_face_w_mm: +(liveFaceW * F).toFixed(3), cushion_face_dev_mm: +(Math.abs(faceW - liveFaceW) * F).toFixed(3),
      wood_cut_mm: +(woodCut * F).toFixed(3), live_wood_cut_mm: +(liveWood * F).toFixed(3), wood_cut_dev_mm: +(Math.abs(woodCut - liveWood) * F).toFixed(3),
      arc_hausdorff_mm: +(haus * F).toFixed(3), arc_pts: arcSeg.length, foot_pts: foot.length, live_cushion: liveWho, live_plank: woodWho };
    r.worst_mm = Math.max(r.cushion_cut_dev_mm, r.cushion_face_dev_mm, r.wood_cut_dev_mm, r.arc_hausdorff_mm);
    rows.push(r); out.sides.push({ side: r.side, mirror_arc: arcSeg, live_foot: foot });
  }
}
out.rows = rows; const refused = rows.filter((r) => r.refuse); const worst = Math.max(...rows.filter((r) => !r.refuse).map((r) => r.worst_mm));
out.worst_mm = worst; out.verdict = refused.length ? 'REFUSE' : (worst <= TOL ? 'PASS' : 'RED');
writeFileSync(OUTJ, JSON.stringify(out, null, 1));
for (const r of rows) console.log('[gi-mirror-490]', r.refuse ? `${r.side} REFUSE ${r.refuse}` : `${r.side}: cushion cut ${r.cushion_cut_mm} vs live ${r.live_cushion_cut_mm} (Δ ${r.cushion_cut_dev_mm.toFixed(3)}) · end face w ${r.cushion_face_w_mm} vs ${r.live_face_w_mm} (Δ ${r.cushion_face_dev_mm}) · wood cut ${r.wood_cut_mm} vs ${r.live_wood_cut_mm} (Δ ${r.wood_cut_dev_mm}) · arc Hausdorff ${r.arc_hausdorff_mm} over ${r.foot_pts} foot pts`);
console.log(`[gi-mirror-490] ${out.verdict} — worst ${Number.isFinite(worst) ? worst.toFixed(3) : 'n/a'} mm vs tol ${TOL} (mirror == live at the middle pocket) -> ${OUTJ}`);
process.exit(out.verdict === 'PASS' ? 0 : out.verdict === 'RED' ? 3 : 2);
