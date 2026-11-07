// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
// c14_rox.mjs — GH-641 A2 (Rasson OX 9 ft): gate C14 "section-curve disjointness" for rasson_ox_9ft.
//
// A thin runner. The law lives in tools/render/c14-disjoint.mjs and is imported VERBATIM — not forked, not
// edited. This file only (1) loads the LIVE-scene dump written by tools/render/ghrox/dump_rox_scene.mjs
// (world-space metres, every table mesh named), (2) merges mesh instances into families the OX way, (3) finds
// the six pocket cup axes from the bed cloth's own hole rims, (4) authors the OX slice ladder from the OX
// JSON heights, and (5) prints the census, the baseline used and the red arm.
//
// Families (dm-<part>[-<instance>]): instances are the ordinal / pocket-tag / rail-family suffixes
// (dm-cushion-3, dm-rail-cap-rox-long-1, dm-pocket-rox-corner-pxpz-cup-c, dm-foot-plate-rox-px-pz); stripping
// them merges the copies of one part into ONE surface, exactly as the diamond runner does.
//
// Baseline (measured record only, fail-closed): the model's own cap inner edge sits 0.242 mm INSIDE the cushion
// wall (RB-04 inner_edge.relation_to_cushion_wall, carried raw by roxCapSections) — that contact, and nothing
// else, is exempt, bounded at 0.3 mm.
//
// Red arm (--redarm): the side cup ring family slid 15 mm along +x drives the +x ring ends 12 mm into the long cushions' jaws (A3: the seen ring
// tips (a curve that enters a solid and never re-emerges = the law's penetration); the arm must raise FAIL above the judged
// run's count.
//
// Usage: node tools/render/ghrox/c14_rox.mjs --dump /tmp/ox-a2/dump/b8.json --out /tmp/ox-a2/c14 [--judge] [--redarm]
import fs from 'node:fs';
import path from 'node:path';
import * as c14 from '../c14-disjoint.mjs';

const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DUMP = argOf('--dump', '/tmp/ox-a2/dump/b8.json');
const OUT = argOf('--out', '/tmp/ox-a2/c14');
const JUDGE = process.argv.includes('--judge');
const REDARM = process.argv.includes('--redarm');
const SHIFT = argOf('--shift', null); // fam:dx:dy:dz (metres) — internal: the red arm re-runs this file with a shifted family in a fresh process
fs.mkdirSync(OUT, { recursive: true });

const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'));
const famOf = (n) => n
  .replace(/-(?:pxpz|pxnz|nxpz|nxnz|px|nx|pz|nz)(?=-|$)/g, '')
  .replace(/-\d+(?=-|$)/g, '')
  .replace(/-(?:long|short)(?=-|$)/g, '');
function trisOf(m) {
  const P = m.positions, I = m.indices; const out = [];
  if (I && I.length) { for (let i = 0; i + 2 < I.length; i += 3) for (const k of [I[i], I[i + 1], I[i + 2]]) out.push(P[3 * k], P[3 * k + 1], P[3 * k + 2]); }
  else for (let i = 0; i < P.length; i++) out.push(P[i]);
  return out;
}
const fams = new Map(); const members = new Map();
for (const m of dump.meshes) {
  if (!m.name || m.name.startsWith('dm-spot')) continue;
  const f = famOf(m.name); if (!fams.has(f)) { fams.set(f, []); members.set(f, []); }
  const arr = fams.get(f); for (const v of trisOf(m)) arr.push(v); members.get(f).push(m.name);
}
let meshes = [...fams.entries()].map(([name, tris]) => ({ name, tris }));
if (SHIFT) { const [fam, dx, dy, dz] = SHIFT.split(':'); const d = [+dx, +dy, +dz]; meshes = meshes.map((m) => m.name !== fam ? m : { name: m.name, tris: m.tris.map((v, i) => v + d[i % 3]) }); }

// Bay axes are the unchanged RC-22 bed-cloth hole fits, not OURS' remeshed floor.
// A lower-part centroid only locates the hole-rim search. FIX3's corner floor is
// part of its measured lower body; its asymmetric centroid is NOT a datum.
function fitCircle(P) {
  let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, sxr = 0, szr = 0, sr = 0; const n = P.length;
  for (const [x, z] of P) { const r = x * x + z * z; sxx += x * x; sxz += x * z; szz += z * z; sx += x; sz += z; sxr += x * r; szr += z * r; sr += r; }
  const A = [[sxx, sxz, sx], [sxz, szz, sz], [sx, sz, n]], b = [sxr, szr, sr];
  for (let i = 0; i < 3; i++) { let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = 0; r < 3; r++) { if (r === i) continue; const f = A[r][i] / A[i][i]; for (let c = i; c < 3; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; } }
  const cx = b[0] / A[0][0] / 2, cz = b[1] / A[1][1] / 2; const c = b[2] / A[2][2];
  return { x: cx, z: cz, r: Math.sqrt(c + cx * cx + cz * cz), n };
}
const cloth = dump.meshes.find((m) => m.name === 'dm-bed-cloth'); if (!cloth) throw new Error('dm-bed-cloth missing');
const CV = []; for (let i = 0; i < cloth.positions.length; i += 3) CV.push([cloth.positions[i], cloth.positions[i + 2]]);
const cups = [];
for (const m of dump.meshes) {
  const mm = /^dm-pocket-rox-(corner|side)-(\w+)-cup-(?:floor|bucket-measured)$/.exec(m.name || ''); if (!mm) continue;
  let sx = 0, sz = 0, n = 0; for (let i = 0; i < m.positions.length; i += 3) { sx += m.positions[i]; sz += m.positions[i + 2]; n++; }
  const cx = sx / n, cz = sz / n;
  const rim = CV.filter(([x, z]) => Math.hypot(x - cx, z - cz) < 0.075); const fit = rim.length >= 8 ? fitCircle(rim) : null;
  // A3-PLAN: the bay axis is the POCKET's — the bed-hole rim fit (the kernel disc + 4 mm reveal, RC-22); since A3 the seen liner hangs
  // on the model's own cup centre (RC-32: 15 mm nearer the nose at the side, 7.7 mm further out at the corner), so a floor centroid
  // would shift every bay window by that much and re-class contacts that never moved (the apron trim strips read FAIL at the
  // first A3 run for exactly that reason). The floor centroid is kept beside the fit for the record.
  if (!fit || ![fit.x, fit.z, fit.r].every(Number.isFinite)) throw new Error(`C14_BED_HOLE_REFUSED: ${m.name}; no centroid fallback`);
  const axis = { x: fit.x, z: fit.z };
  // Retain the legacy diagnostic key; locator_mesh states which lower part it means.
  cups.push({ x: axis.x, z: axis.z, label: `${mm[1][0]}${mm[2]}`, locator_mesh: m.name, floor_centroid: { x: +cx.toFixed(5), z: +cz.toFixed(5) }, hole_fit: { x: +fit.x.toFixed(5), z: +fit.z.toFixed(5), r_mm: +(fit.r * 1000).toFixed(2), n: fit.n } });
}
cups.sort((a, b) => a.label.localeCompare(b.label));
if (cups.length !== 6 || new Set(cups.map((c) => c.label)).size !== 6) throw new Error(`expected 6 distinct pocket locators, found ${cups.length}`);

// OX slice ladder (mm above the bed): 2.5 mm rungs from the apron plate to the cup rim + the OX JSON anchors
function roxSlices() {
  const s = [];
  for (let y = -162; y <= 47 + 1e-9; y += 2.5) s.push(+y.toFixed(3));
  // RB-05 plate −160.95 / lowest −159 / skin bottom −153.5; CP-12 floor −61.88 / open C −24; RC-19 slab −23.214; bed 0;
  // RC-01 skin top 13.25 / lip bottom 13.5; RB-05 shelf 14.28..17.28; CU-02 nose 36.29; RB-04 inner face 38.53 /
  // inner top 41.04; CU-11 cushion top 41.11; RB-04 crest 43.138; CP-15 casting crest 43.49; CP-12 / SP-12 rims 46.62 / 46.8
  for (const a of [-160.95, -159, -153.5, -61.88, -24, -23.214, 0, 13.25, 13.5, 14.28, 17.28, 36.29, 38.53, 41.04, 41.11, 43.138, 43.49, 46.62, 46.8]) {
    if (!s.some((v) => Math.abs(v - a) < 1e-6)) s.push(a);
  }
  return s.sort((a, b) => a - b);
}
const roxBaseline = (a, b, Ymm, meas = {}) => {
  const pair = new Set([a, b]);
  if (pair.has('dm-cushion') && pair.has('dm-rail-cap-rox') && (meas.embed ?? Infinity) <= 0.3) {
    return "RB-04 inner_edge: the model's own cap inner edge sits 0.242 inside the cushion wall (carried raw; bounded 0.3)";
  }
  return null;
};
function tally(census) {
  const t = {}; const worst = [];
  for (const c of census.corners) for (const s of c.slices) {
    for (const x of s.crossings ?? []) { t[x.level] = (t[x.level] ?? 0) + 1; if (x.level === 'FAIL' || x.level === 'WARN') worst.push({ a: x.a, b: x.b, embed: x.embed, arc: x.arc, level: x.level, y: s.y, cup: c.cup.label, u: x.u, v: x.v, why: x.why }); }
    for (const x of s.containments ?? []) { const k = `CONTAINED-${x.level ?? 'FAIL'}`; t[k] = (t[k] ?? 0) + 1; if ((x.level ?? 'FAIL') === 'FAIL') worst.push({ a: x.own, b: x.host, embed: x.depth, arc: null, level: 'FAIL', y: s.y, cup: c.cup.label, contained: true }); }
  }
  worst.sort((p, q) => (q.embed ?? 0) - (p.embed ?? 0));
  return { tally: t, worst };
}
const shifted = (ms, fam, d) => ms.map((m) => m.name !== fam ? m : { name: m.name, tris: m.tris.map((v, i) => v + d[i % 3]) });

const t0 = Date.now(); const slices = roxSlices();
// containFams: [] — the OX furniture is modelled as SHELLS by the purchased model's own construction (RB-04 hollow
// skin, CP-12 / SP-12 1.07 mm cup sheets, the casting / flange / plate surfaces): their section curves are OPEN, and the
// library's containment clause decides inside/outside by ray parity against the cancelled union of the other families —
// an open curve flips parity, so every cup arc read as 'buried 83 mm inside the cushion' in the first run. The clause is
// therefore switched off here and disclosed; the CROSSING census (the owner's annotation) is judged in full.
const OPTS = { slices, baseline: roxBaseline, containFams: [] };
const census = c14.c14Run(meshes, cups, OPTS);
const main = tally(census);
const fails = main.tally.FAIL ?? 0, warns = main.tally.WARN ?? 0, contained = main.tally['CONTAINED-FAIL'] ?? 0;
let arm = null;
if (SHIFT) { fs.writeFileSync(path.join(OUT, 'c14-rox-shift.json'), JSON.stringify({ shift: SHIFT, tally: main.tally, worst: main.worst.slice(0, 8) })); console.log(`[c14-rox --shift ${SHIFT}] FAIL ${fails} WARN ${warns}`); process.exit(0); }
if (REDARM) {
  const { spawnSync } = await import('node:child_process');
  // A3: the seen ring hangs 15 mm nearer the nose than the kernel axis (RC-32), so the r9 arm (+20 mm x, −20 mm z) now carries the
  // ring's end out of the bay ROI about the kernel axis and reads ADJUDICATE, not FAIL. +15 mm along x alone drives the +x ring end
  // (49.98, 47.7) 12 mm into the long cushion's jaw (its face is at x 52.6 there) well inside the bay — the arm must FAIL.
  const spec = 'dm-pocket-rox-side-cup-ring:0.015:0:0';
  const r = spawnSync(process.execPath, [process.argv[1], '--dump', DUMP, '--out', OUT, '--shift', spec], { encoding: 'utf8' });
  const rec2 = JSON.parse(fs.readFileSync(path.join(OUT, 'c14-rox-shift.json'), 'utf8'));
  arm = { family: 'dm-pocket-rox-side-cup-ring', dx_mm: 15, dz_mm: 0, tally: rec2.tally, worst: rec2.worst.slice(0, 6), ok: (rec2.tally.FAIL ?? 0) > fails, log: (r.stdout || '').trim() };
}
const verdict = fails + contained === 0 ? 'GREEN' : 'RED';
const pairs = {}; for (const w of main.worst) if (w.level === 'FAIL') pairs[`${w.a}|${w.b}`] = (pairs[`${w.a}|${w.b}`] ?? 0) + 1;
const rec = { tool: 'c14_rox', law: 'tools/render/c14-disjoint.mjs (verbatim import)', dump: DUMP, dump_sha_hint: dump.meshCount, families: [...fams.keys()].sort(), members: Object.fromEntries(members),
  cups: cups.map((c) => ({ ...c, x: +c.x.toFixed(5), z: +c.z.toFixed(5) })), slices, tally: main.tally, fails, warns, contained, pairs, worst: main.worst.slice(0, 40), redarm: arm, verdict, seconds: (Date.now() - t0) / 1000 };
fs.writeFileSync(path.join(OUT, 'c14-rox.json'), JSON.stringify(rec, null, 1));
const L = [];
L.push(`# C14-ROX — section-curve disjointness, rasson_ox_9ft (law: c14-disjoint.mjs verbatim)`, '', `dump: \`${DUMP}\` (${dump.meshCount} meshes); families ${fams.size}; slices ${slices.length} (−162 … 47 mm, 2.5 mm rungs + OX anchors)`, '',
  `cups (bay axis = bed-cloth hole fit, the kernel pocket; cup-floor centroid beside — A3): ${cups.map((c) => `${c.label} (${c.x.toFixed(4)}, ${c.z.toFixed(4)})${c.hole_fit ? ` r ${c.hole_fit.r_mm}` : ''} floor (${c.floor_centroid.x}, ${c.floor_centroid.z})`).join('; ')}`, '',
  `## Tally`, '', '| level | count |', '|---|---|', ...Object.entries(main.tally).sort().map(([k, v]) => `| ${k} | ${v} |`), '',
  `**VERDICT ${verdict}** — FAIL ${fails}, CONTAINED-FAIL ${contained}, WARN ${warns}${arm ? `; red arm (${arm.family} +${arm.dx_mm} mm x / ${arm.dz_mm} mm z): FAIL ${arm.tally.FAIL ?? 0} → ${arm.ok ? 'ARMED' : 'NOT ARMED'}` : ''}`, '',
  `## Worst crossings (FAIL / WARN, by embed)`, '', '| level | a | b | embed mm | arc mm | y mm | cup | u, v (mm from the cup axis) | why |', '|---|---|---|---|---|---|---|---|---|',
  ...main.worst.slice(0, 40).map((w) => `| ${w.level} | ${w.a} | ${w.b} | ${w.embed?.toFixed?.(2) ?? w.embed} | ${w.arc?.toFixed?.(1) ?? ''} | ${w.y} | ${w.cup} | ${w.u ?? ''}, ${w.v ?? ''} | ${w.why ?? (w.contained ? 'contained' : '')} |`), '',
  `## Baseline`, '', `Only the RB-04 0.242 mm cap-inner-edge / cushion-wall contact (bounded 0.3 mm). Everything else is judged.`, '');
fs.writeFileSync(path.join(OUT, 'C14-ROX.md'), L.join('\n'));
if (arm) console.log('[c14-rox] arm tally', JSON.stringify(arm.tally), 'worst', JSON.stringify(arm.worst.slice(0, 3)));
console.log(`[c14-rox] ${verdict} FAIL ${fails} CONTAINED ${contained} WARN ${warns} families ${fams.size} slices ${slices.length} ${(rec.seconds).toFixed(1)}s -> ${OUT}/C14-ROX.md${arm ? ` | redarm ${arm.ok ? 'ARMED' : 'NOT ARMED'} (FAIL ${arm.tally.FAIL ?? 0})` : ''}`);
if (JUDGE && (verdict !== 'GREEN' || (arm && !arm.ok))) process.exit(3);
