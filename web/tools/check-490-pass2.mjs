// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-490-pass2.mjs — GH-490 adversarial gate rows for the chinese-8
// pocket furniture.  r12-APPROVED (owner card 17b, 2026-09-03 — contract
// docs/geometry/cn8-middle-furniture-definition.json, the moulded middle
// leather body of web/scene/cn8mid.js; corner letters re-run on the ruling
// C4 = B in docs/geometry/cn8-corner-furniture-definition-contract.json).
//
// Rows (drawing == JSON == model == gate; every window is a letter, an
// identity of letters, or the LAW's 1.0 mm overlay window):
//   pass-2 / crack (corner + staged pot):
//   · netball-chroma · bore-structure · rail-end-face
//   · boot-tip-crack-dogear (re-derived on the D3 loft ring, GH-1146; boot-tip-crack-fold retired with
//     the cn8Fillet sweep, see the census)
//   the r12 middle body (NEW — red basis git archive 1e5e119a, the plate tree):
//   · gate1-plan     GATE-1 plan overlay vs the Star section: the body's
//                    horizontal sections at bed+0.5 / +20 / +38 — back plane
//                    LP-04, sides DT-09, inner wall = innermost radius per 10°
//                    sector about DT-03 over the wall sectors 60°–120° vs
//                    LP-05(h); every deviation ≤ 1.0 mm (the LAW window)
//   · gate2-fall     GATE-2 the cloth band FL-02: outer radius 58.61 ± 0.2,
//                    no shrink below the bed (the 62° cone is the red basis),
//                    band / slate cut inside DT-12
//   · gate3-butt     GATE-3 leather ↔ rail-end butt: |plank end − body end|,
//                    both vs DT-09, ≤ 0.5 mm; end faces within 0.5° of 90°
//   · gate4-census   GATE-4 the r12 families present with a plan footprint,
//                    every retired plate-era family absent
//   · gate5-elev     GATE-5 the piece's elevation: top LP-06 ± 0.05, crest
//                    LP-09 ± 0.05, tips SK-04 ± 0.05; stitch row LP-10 ± 0.5;
//                    round(1 / LP-10[1]) dashes (21 since r14, the JOY stitching) and
//                    10 whole scallops on the hem of the LP-19 skirt
//   · gate6-planlaw  GATE-6 the pocket-scale PLAN-OVERLAY LAW row: per middle
//                    at bed+20 / nose / cap−1 the leather's front edge on the
//                    cut plane vs the contract (LP-04 − LP-02 at bed+20; the
//                    barrel's own side crossing elsewhere) and the cushion's
//                    end on the cut plane vs JW-05; per corner the ring's
//                    outer radius vs R + W_L, its window reach vs A_r and its
//                    arm ends vs y_cut (the re-run corner letters); ≤ 1.0 mm
//   the exterior / bed-side rows re-bound to the r12 letters:
//   · midext-straight (LP-04 back plane, sagitta ≤ 1.0) · midext-protrude
//     (nothing beyond DT-04 = DT-13) · midext-clothfree (no cloth in front of
//     the slot beyond the leather's front plane or above the rail top) ·
//     midext-window (nothing beyond DT-04 inside the bay window) ·
//     midext-stitch (the dashes on the back at LP-06 − LP-10) · midext-sockgap /
//     -rise (the knit's top ON SK-04) · midedge-knit / midedge-tips (the
//     mid_edgeon eye: no knit above SK-04; the skirt tips ON SK-04) ·
//     midmouth-void (no knit spanning the mouth outside the bag footprint; r14: the JOY bag's own
//     footprint, NT-07..NT-11 plus the NT-06 cord reach) ·
//     midmouth-beam (no rail beam first-hit inside the slate hole unless the ray crossed the bag's
//     envelope; r14: the JOY net is open) ·
//     midext-contract (table.js CN8_MID == the JSON)
//   retired with the plate (r12 §6): midmouth-bayplate / -throat / -cone /
//   -rim / -clip, midext-neck, midext-fold and every cove arm.
//
// Modes: --gate (capture + judge) · --measure (capture, print, no verdict;
// prints the fixture JSON) · --red-arm (replay the pinned red bases through
// judge) · --perturb=knit-rise | cover-lift | body-hide | sight-add | dogear | net-shift | net-hide (live arms) ·
// --drop-measure=<key> (BUILD-3: the schema arm — deletes one measurement; the judge must fail).
import path from 'node:path';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng } from './png.mjs';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(HERE, '..');
const BASIS = JSON.parse(readFileSync(path.resolve(HERE,
  '../../tools/render/fixtures/pass2-490-red-basis.json'), 'utf8'));
const GEO = JSON.parse(readFileSync(path.resolve(HERE,
  '../../docs/geometry/cn8-middle-furniture-definition.json'), 'utf8'));
const CORNER = JSON.parse(readFileSync(path.resolve(HERE,
  '../../docs/geometry/cn8-corner-furniture-definition-contract.json'), 'utf8'));
// GATE-6 corners on the D3 loft (GH-1146, ruling a34fdcc4): the D3 constructor stands on the MFR cushion-nose rectangle,
// and each ring's quadrant is its fixed identity (the renderer's corner build sites, CN8_CORNER_IDENTITIES). A pre-D3
// tree carries neither file; its rings carry O_f themselves, and a D3 ring without them reads NOT JUDGED.
const D3_MFR = (() => {
  try {
    const v = JSON.parse(readFileSync(path.resolve(HERE, '../../docs/geometry/cn8-pocket-d3-source-inputs.json'), 'utf8'))
      .mfr_playing_dimensions_mm.value;
    return Array.isArray(v) && v.length === 2 && v.every((q) => q > 0) ? v : null;
  } catch { return null; }
})();
const CORNER_IDS = await import('../../tools/render/ghcn8/cn8_emitted_checks.mjs')
  .then((m) => m.CN8_CORNER_IDENTITIES.map((r) => [...r])).catch(() => null);
const gfRaw = (id) => {
  const f = GEO.features.find((x) => x.id === id);
  if (!f || f.value_mm === undefined) {
    console.error(`[pass2] REFUSE: geometry source ${GEO.doc.number} carries `
      + `no feature ${id} — the drawing/gate chain is broken`);
    process.exit(2);
  }
  return f.value_mm;
};
const gf = (id) => {
  const v = gfRaw(id);
  if (typeof v !== 'number') {
    console.error(`[pass2] REFUSE: ${GEO.doc.number} ${id} is not a scalar`);
    process.exit(2);
  }
  return v;
};
const gfv = (id, i) => {
  const v = gfRaw(id);
  if (!Array.isArray(v) || typeof v[i] !== 'number') {
    console.error(`[pass2] REFUSE: ${GEO.doc.number} ${id}[${i}] is not a number`);
    process.exit(2);
  }
  return v[i];
};
// r13 (GH-1080 M-c, owner card 41) is the r12 moulded body re-derived at the
// 87 mm slot: the same letter set, so either revision is the body contract.
// r14 (GH-1146) folds in the JOY values and adds LP-19, which KM reads, so an
// r12 / r13 file now refuses at gf('LP-19') rather than judging without it.
if (!/^r1[234]\b/.test(String(GEO.doc.revision))) {
  console.error(`[pass2] REFUSE: ${GEO.doc.number} is ${GEO.doc.revision}, not the r12/r13/r14 body contract`);
  process.exit(2);
}
const cornerLetter = (id) => {
  const r = CORNER.letters_moved.find((x) => x.id === id || x.id.startsWith(id + ' '));
  if (!r || typeof r.now !== 'number') {
    console.error(`[pass2] REFUSE: corner contract carries no moved letter ${id}`);
    process.exit(2);
  }
  return r.now;
};
// BUILD-2 condition 1 → LAND-629: the rail sights row SI-01 (corner contract rail_sights).
// Owner ruling B on card 17c (2026-09-04): the sights are REMOVED — the row must carry
// status REMOVED and the gate asserts ZERO sight discs on this table.
const cornerSightRemoved = () => {
  const r = CORNER.rail_sights && CORNER.rail_sights.find((x) => x.id === 'SI-01');
  if (!r || r.status !== 'REMOVED') {
    console.error('[pass2] REFUSE: corner contract rail_sights SI-01 is not status REMOVED (owner ruling B, 2026-09-04)');
    process.exit(2);
  }
  return true;
};
// the letters, metres (KM) — one object the page evals receive verbatim
const LP05raw = gfRaw('LP-05');
// r14 (2026-10-29): NT-11 is the JOY bag's lower lathe, {junction_v, rows [[radius, v] ...], ring_station_v}
const NT11 = (() => {
  const v = gfRaw('NT-11');
  const num = (q) => typeof q === 'number' && Number.isFinite(q);
  if (!v || !num(v.junction_v) || !num(v.ring_station_v) || !Array.isArray(v.rows) || v.rows.length < 2
    || !v.rows.every((r) => Array.isArray(r) && r.length === 2 && r.every(num))
    || !v.rows.every((r, i) => r[1] < (i ? v.rows[i - 1][1] : v.junction_v))) {
    console.error(`[pass2] REFUSE: ${GEO.doc.number} NT-11 is not {junction_v, rows [[radius, v] ...] descending below it, ring_station_v}`);
    process.exit(2);
  }
  return { junction: v.junction_v / 1000, rows: v.rows.map(([r, y]) => [r / 1000, y / 1000]), ring: v.ring_station_v / 1000 };
})();
const KM = {
  DT02: gf('DT-02') / 1000, DT03: gf('DT-03') / 1000, DT04: gf('DT-04') / 1000,
  DT05: gf('DT-05') / 1000, DT06: gf('DT-06') / 1000, DT09: gf('DT-09') / 1000,
  DT10: gf('DT-10') / 1000, DT11: gf('DT-11') / 1000, DT12: gf('DT-12') / 1000,
  DT13: gf('DT-13') / 1000, FL01: gf('FL-01') / 1000, FL02: gf('FL-02') / 1000,
  JW05: gf('JW-05') / 1000,
  LP01: gf('LP-01') / 1000, LP02: gf('LP-02') / 1000, LP03: gf('LP-03') / 1000,
  LP04: gf('LP-04') / 1000, LP06: gf('LP-06') / 1000, LP09: gf('LP-09') / 1000,
  LP05: [[0.0005, LP05raw['bed+0.5'] / 1000], [0.020, LP05raw['bed+20'] / 1000], [0.038, LP05raw['bed+38'] / 1000]],
  LP07: [gfv('LP-07', 0) / 1000, gfv('LP-07', 1) / 1000],
  LP10: [gfv('LP-10', 0) / 1000, gfv('LP-10', 1), gfv('LP-10', 2)],
  LP11: [gfv('LP-11', 0) / 1000, gfv('LP-11', 1) / 1000],
  LP12: gf('LP-12'), LP18: gf('LP-18') / 1000, CT03: gf('CT-03') / 1000,
  SK01: gf('SK-01') / 1000, SK04: gf('SK-04') / 1000,
  LP19: gf('LP-19') / 1000, // r14 (GH-1146): the JOY skirt drop under LP-09; SK-04 hangs at its scallop tips
  NT06: [gfv('NT-06', 0) / 1000, gfv('NT-06', 1) / 1000], // r14: the JOY cord yarn diameter and selvedge cord radius
  // r14 (2026-10-29, ruling 50b6d52f): the JOY bag f93c0276 built — belly radius, sewn half-width as a ratio of
  // LP-01, gather release depth, belly swell [amplitude, depth span], the lower lathe with the ring station
  NT07: gf('NT-07') / 1000, NT08: gf('NT-08'), NT09: gf('NT-09') / 1000,
  NT10: [gfv('NT-10', 0) / 1000, gfv('NT-10', 1) / 1000], NT11,
  HNOSE: 0.635 * 0.05715, // WPA 63.5 % of the 2 1/4 in ball — the kernel nose height
  // corner letters (the re-run contract): R + W_L, A_r, y_cut, c
  CR: 0.0525, CWL: cornerLetter('W_L') / 1000, CAR: cornerLetter('A_r') / 1000,
  CYCUT: -0.040, CC: 0.0035, MFR_LH: D3_MFR ? D3_MFR[0] / 2000 : null, MFR_WH: D3_MFR ? D3_MFR[1] / 2000 : null,
  SI01_REMOVED: cornerSightRemoved(), // owner ruling B: no rail sights on chinese8
};
for (const [why, ok] of [
  ['DT-09 = LP-01 / 2', Math.abs(KM.DT09 - KM.LP01 / 2) < 1e-9],
  ['LP-04 = DT-13 − LP-03', Math.abs(KM.LP04 - (KM.DT13 - KM.LP03)) < 1e-9],
  ['DT-04 = DT-13 (card 17b C4 = B)', Math.abs(KM.DT04 - KM.DT13) < 1e-9],
  ['FL-02 = FL-01 + 5.00', Math.abs(KM.FL02 - (KM.FL01 + 0.005)) < 1e-9],
  ['LP-06 = DT-05 − 0.30', Math.abs(KM.LP06 - (KM.DT05 - 0.0003)) < 1e-9],
  ['SK-04 = LP-09 − LP-19 − LP-11.depth', Math.abs(KM.SK04 - (KM.LP09 - KM.LP19 - KM.LP11[1])) < 1e-9],
  ['CT-03 = (LP-04 − LP-02) − DT-10', Math.abs(KM.CT03 - ((KM.LP04 - KM.LP02) - KM.DT10)) < 1e-9],
  ['LP-01 / LP-11.pitch = 10', Math.abs(KM.LP01 / KM.LP11[0] - 10) < 1e-6],
  ['corner: A_r = c + R + W_L', Math.abs(KM.CAR - (KM.CC + KM.CR + KM.CWL)) < 1e-9],
]) {
  if (!ok) {
    console.error(`[pass2] REFUSE: drawn identity broken in the geometry sources — ${why}`);
    process.exit(2);
  }
}
// ---- the eyes ----
const MIDEDGE_POSE = (() => {
  const f = path.join(HERE, '..', '..', 'tools', 'render', 'fixtures', 'craft-look-poses.json');
  const doc = JSON.parse(readFileSync(f, 'utf8'));
  const q = ((doc.poses || {}).chinese8_pro_9ft || []).find((x) => x.name === 'mid_edgeon');
  if (!q) {
    console.error(`[pass2] REFUSE: ${f} has no mid_edgeon pose for chinese8_pro_9ft — the midedge rows have no eye`);
    process.exit(2);
  }
  return q;
})();
const MIDEDGE_BOX = [320, 80]; // ± px about the projection of (u 0, SK-04, LP-04) on the 1600 × 1000 page
const MIDEDGE_STEP = [2, 1];
const VOID_EYES = [
  { name: 'mid_close_diag', at: [-0.15, 0.16, 0.422] },
  { name: 'mid_tt_inside', at: [-0.25, 0.38, 0.192] },
];
const VOID_STEP = 0.002;
// the bag's plan footprint under the body. r14 (GH-1146, ruling 50b6d52f): the JOY bag f93c0276 built, from the
// contract's NT-07..NT-11 by the table's own section law (table.js 23953-23979 and 25003-25011 at 074fe46d). At
// depth d = SK-04 − v the section is an ellipse of half-width a(d) along the rail and half-depth b(d) outboard (b
// solves the Ramanujan perimeter), centred zc(d) outboard of the axis; below NT-11's junction its lathe rows take
// over; the whole bag leans outboard by OFF · t (its far wall on the body's inner back plane LP-04 − LP-18 less the
// 0.5 mm standoff at the seam), zero at NT-11's ring station. A cord is not a surface: its centre sits on the woven
// surface (between the table's rows, as the cords sample it), and its body reaches VR = NT-06[0] above and below
// that and REACH sideways. So a knit hit at height v is inside when, for some woven height within VR of v (clipped to
// the bag's span, seam to gather), |u| ≤ a + REACH and w ≥ the near wall − REACH. VR: the thickest cord, the selvedge,
// has radius NT-06[1] = 1.1 < NT-06[0]. REACH: in the over/under weave a yarn's centre rides one yarn radius off the
// surface, so its outer side stands one yarn diameter NT-06[0] off it (the selvedge, with no offset, reaches 1.1),
// plus the r12 footprint's own 2 mm slack, which covers the 13 % junction swell (0.08 mm) and the sewn folds (at most
// 0.84 mm, at the seam). Without the VR window the top course read outside: near the seam the near wall moves about
// 10 mm per mm of height, and the cords hanging 0.4 mm under SK-04 rise above it by their radius. The r12 footprint
// read 0.49 / 0.534 of LP-01 / 2 and a ring at −148.5: the bag before f93c0276, which left half its cords outside.
const BAG = {
  R: KM.NT07, HALF: KM.NT08 * KM.LP01, D0: KM.NT09, SW: KM.NT10, LOW: KM.NT11, SEAM: KM.SK04, DT03: KM.DT03,
  OFF: ((KM.LP04 - KM.LP18 - 0.0005) - KM.DT03) - KM.NT07, REACH: KM.NT06[0] + 0.002, VR: KM.NT06[0],
};
// the footprint at height v: { a: the widest half-width along the rail, near: the innermost near-wall w } over the
// woven sections within VR of v, in metres, or null beyond VR of the bag's span. Self-contained: the page evals
// receive its source.
function bagSection(B, v) {
  const bottom = B.LOW.rows[B.LOW.rows.length - 1][1];
  if (!(v <= B.SEAM + B.VR && v >= bottom - B.VR)) return null;
  const aOf = (d) => B.HALF + (B.R - B.HALF) * Math.min(1, d / B.D0) + B.SW[0] * Math.sin(Math.PI * Math.min(1, d / B.SW[1]));
  const section = (y) => {
    const lean = B.OFF * Math.min(1, Math.max(0, (y - B.LOW.ring) / (B.SEAM - B.LOW.ring)));
    if (y >= B.LOW.junction) {
      const d = Math.max(0, B.SEAM - y); const f = Math.min(1, d / B.D0); const a = Math.max(0.0001, aOf(d));
      const P0 = 4 * B.HALF; const P = P0 + (2 * Math.PI * a - P0) * f;
      let b = 0;
      if (d > 0) {
        let lo = 0; let hi = a;
        for (let i = 0; i < 40; i++) {
          const m = 0.5 * (lo + hi);
          if (Math.PI * (3 * (a + m) - Math.sqrt((3 * a + m) * (a + 3 * m))) < P) lo = m; else hi = m;
        }
        b = 0.5 * (lo + hi);
      }
      b = Math.max(0.0001, b); // as the table's rows clamp it
      return { a, near: B.DT03 + lean + (B.R - b) * (1 - f) - b };
    }
    // the lathe: its first row, at the junction, is the section law's own a(d) there
    const rows = [[aOf(B.SEAM - B.LOW.junction), B.LOW.junction], ...B.LOW.rows];
    let k = 0; while (k + 2 < rows.length && rows[k + 1][1] > y) k++;
    const [r0, v0] = rows[k]; const [r1, v1] = rows[k + 1];
    const r = r0 + (r1 - r0) * Math.min(1, Math.max(0, (v0 - y) / (v0 - v1)));
    return { a: r, near: B.DT03 + lean - r };
  };
  // the woven heights within VR of v, clipped to the span, at 0.1 mm (the near wall moves about 1 mm per 0.1 mm at
  // the seam, inside the 2 mm slack)
  let a = 0; let near = Infinity;
  const n = Math.ceil(B.VR / 0.0001);
  for (let i = -n; i <= n; i++) {
    const sec = section(Math.min(B.SEAM, Math.max(bottom, v + (i / n) * B.VR)));
    if (sec.a > a) a = sec.a;
    if (sec.near < near) near = sec.near;
  }
  return { a, near };
}
// midmouth-beam: does the segment from ro along rd cross any envelope triangle before tHit? Self-contained: the page
// evals receive its source, and --selftest runs it on synthetic geometry.
function segmentCrosses(envelope, ro, rd, tHit) {
  for (const arr of envelope) {
    for (let b = 0; b < arr.length; b += 9) {
      const ax = arr[b], ay = arr[b + 1], az = arr[b + 2];
      const e1x = arr[b + 3] - ax, e1y = arr[b + 4] - ay, e1z = arr[b + 5] - az, e2x = arr[b + 6] - ax, e2y = arr[b + 7] - ay, e2z = arr[b + 8] - az;
      const px = rd[1] * e2z - rd[2] * e2y, py = rd[2] * e2x - rd[0] * e2z, pz = rd[0] * e2y - rd[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det; const tx = ro[0] - ax, ty = ro[1] - ay, tz = ro[2] - az;
      const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (rd[0] * qx + rd[1] * qy + rd[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv; if (t > 1e-6 && t < tHit - 1e-7) return true;
    }
  }
  return false;
}
// the net-hide arm's own evidence (review b21 P2): hiding the nets must NEWLY expose beam rays, i.e. counted beam hits
// whose segment crosses the hidden nets' envelope (the bag covered them before). The beam row alone fires on the
// already-red baseline, so it proves nothing; a crossing test that recognised no crossing would expose none.
function netHideArmed(m) { return Number.isFinite(m.midmouth_beam_exposed) && m.midmouth_beam_exposed > 0; }
// the net-hide plant: hide the middle nets that are effectively visible (the mesh and every ancestor) and return exactly
// those. Only they can expose anything, so the census builds the hidden envelope from this list, never from every net
// that happens to be invisible afterwards (review b21 round 2: an already-hidden net must not arm the plant). Self-contained:
// the page eval receives its source, and --selftest runs it on mock scenes.
function hideVisibleMiddleNets(scene) {
  const hid = [];
  scene.traverse((o) => {
    if (!o.isMesh || !/^cn8-net-(?:low-)?\d+$/.test(o.name || '')) return;
    if (Math.abs(o.matrixWorld.elements[12]) > 0.25) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    hid.push(o);
  });
  for (const o of hid) o.visible = false;
  return hid;
}
const HOLE_R = KM.FL01 + 0.004; // the bed-hole rim (p.r + 4 mm, the bed cloth's own hole)
const HOLE_C = KM.DT03;
const BED_Y = 0;
const SOCK_GAP_EPS = 0.01;

const args = process.argv.slice(2);
// --selftest (CPU, no browser): the net-hide arm's own control (review b21 P2). A beam hit behind a synthetic bag wall
// counts as newly exposed only through segmentCrosses. With a crossing test that recognises no crossing (the mutant),
// nothing is exposed and the arm refuses; the old rule (the beam row fires) would still have armed on the red baseline.
if (args.includes('--selftest')) {
  const wall = [new Float64Array([-1, -1, 0.5, 1, -1, 0.5, 1, 1, 0.5, -1, -1, 0.5, 1, 1, 0.5, -1, 1, 0.5])];
  const ro = [0, 0, 0];
  const hits = [[0, 0, 1], [0.2, -0.3, 1], [5, 0, 1]]; // two behind the wall, one beside it
  const exposed = (crosses) => hits.filter((p) => { const t = Math.hypot(...p); return crosses(wall, ro, p.map((q) => q / t), t); }).length;
  const broken = () => false;
  const baseline = { midmouth_beam_hits: 418 };
  // [name, x, visible, parent visible?] -> a scene with traverse(), each mesh under its own parent group
  const mockScene = (rows) => {
    const all = rows.map(([name, x, visible, parentVisible = true]) => ({ name, isMesh: true, visible,
      parent: { visible: parentVisible, parent: null }, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0.68, 1] } }));
    return { all, traverse: (fn) => all.forEach(fn) };
  };
  const cases = [
    ['segmentCrosses: a hit behind the wall crosses it', segmentCrosses(wall, ro, [0, 0, 1], 1) === true],
    ['segmentCrosses: a hit in front of the wall does not', segmentCrosses(wall, ro, [0, 0, 1], 0.4) === false],
    ['segmentCrosses: a hit beside the wall does not', exposed(segmentCrosses) === 2],
    ['net-hide arms on newly exposed rays', netHideArmed({ ...baseline, midmouth_beam_exposed: exposed(segmentCrosses) }) === true],
    ['control: a crossing test that sees no crossing exposes none, and the arm refuses', exposed(broken) === 0
      && netHideArmed({ ...baseline, midmouth_beam_exposed: exposed(broken) }) === false],
    ['control: the old rule (the beam row fires) armed that mutant on the red baseline', baseline.midmouth_beam_hits > 0],
    ['control: an exposure that was not measured (null) never arms', netHideArmed({ ...baseline, midmouth_beam_exposed: null }) === false],
    ['net-hide hides and returns the visible middle nets only', (() => {
      const sc = mockScene([['cn8-net-low-1', 0, true], ['cn8-net-low-4', 0, true], ['cn8-net-low-0', -1.27, true]]);
      const hid = hideVisibleMiddleNets(sc);
      return hid.map((o) => o.name).join() === 'cn8-net-low-1,cn8-net-low-4' && hid.every((o) => o.visible === false);
    })()],
    ['control: nets already hidden (themselves or by a parent) are not counted, so nothing is exposed and the arm refuses', (() => {
      const sc = mockScene([['cn8-net-low-1', 0, false], ['cn8-net-low-4', 0, true, false]]);
      const hid = hideVisibleMiddleNets(sc);
      // the round-1 census took every invisible middle net after the plant: both of these
      const roundOne = sc.all.filter((o) => !o.visible || (o.parent && !o.parent.visible)).length;
      return hid.length === 0 && roundOne === 2 && netHideArmed({ ...baseline, midmouth_beam_exposed: hid.length }) === false;
    })()],
  ];
  let ok = 0;
  for (const [name, pass] of cases) { ok += pass ? 1 : 0; console.log(`[pass2-selftest]   ${pass ? 'ok ' : 'BAD'} ${name}`); }
  console.log(`[pass2-selftest] SELFTEST ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}
const MODE = args.includes('--red-arm') ? 'red-arm'
  : args.includes('--measure') ? 'measure'
    : args.includes('--gate') ? 'gate' : null;
if (!MODE) {
  console.error('mode required: --gate | --measure | --red-arm');
  process.exit(2);
}
const W = BASIS.windows;
// windows that are letters or identities must be exactly those
for (const [key, want, why] of [
  ['d3_dogear_max', 0, 'a census has no slack'],
  ['gate1_plan_max_mm_max', 1.0, 'GATE-1: the LAW overlay window'],
  ['gate2_fall_dev_mm_max', 0.2, 'GATE-2: FL-02 ± 0.2'],
  ['gate3_butt_mm_max', 0.5, 'GATE-3: LP-13 butt ≤ 0.5'],
  ['gate4_census_bad_max', 0, 'GATE-4: a census has no slack'],
  ['gate5_edge_dev_mm_max', 0.05, 'GATE-5: LP-06 / LP-09 / SK-04 ± 0.05'],
  ['gate5_stitch_dev_mm_max', 0.5, 'GATE-5: LP-10 ± 0.5'],
  ['gate5_count_err_max', 0, 'GATE-5: round(1 / LP-10[1]) dashes, LP-01 / LP-11.pitch scallops'],
  ['gate6_mid_mm_max', 1.0, 'GATE-6: the LAW overlay window'],
  ['gate6_corner_mm_max', 1.0, 'GATE-6: the LAW overlay window'],
  ['sight_count_max', 0, 'SI-01 REMOVED (owner ruling B): no rail sight disc on chinese8'],
  ['midext_sagitta_mm_max', 1.0, 'LP-04 straightness — the LAW window'],
  ['midext_arris_proud_mm_max', 0, 'nothing beyond DT-04'],
  ['midext_cloth_bad_max', 0, 'no cloth beyond the leather front plane / rail top'],
  ['midext_window_proud_mm_max', 0, 'nothing beyond DT-04 in the bay window'],
  ['midext_sock_gap_mm_max', SOCK_GAP_EPS, 'SK-04 is an identity'],
  // r14 (GH-1146): the JOY selvedge cord is centred on the lacing line, so the net may stand its radius NT-06[1] above SK-04
  ['midext_sock_rise_mm_max', +(SOCK_GAP_EPS + gfv('NT-06', 1)).toFixed(3), 'SK-04 + the selvedge cord radius NT-06[1] (upward)'],
  ['midedge_knit_above_px_max', 0, 'knit above SK-04 is the R1-FIX9 defect'],
  ['midedge_tips_mm_max', 0.05, 'the tips sit ON SK-04'],
  ['midmouth_void_span_max', 0, 'no knit spans the opening'],
  ['midmouth_beam_hits_max', 0, 'no beam first-hit in the hole'],
  ['midext_contract_max_mm_max', 1e-6, 'the mirror is exact'],
]) {
  if (W[key] !== want) {
    console.error(`[pass2] REFUSE: fixture window ${key} ${W[key]} != ${want} (${why}) — stale fixture`);
    process.exit(2);
  }
}
const judge = (m) => {
  const why = [];
  // BUILD-3 (review round 12 P2-b): the comparison fails CLOSED — a missing, null,
  // undefined or non-finite measurement counts as exceeding its window (the schema
  // pass below names it first; these guards keep the row red even if called directly)
  const gt = (v, k) => (!Number.isFinite(v) || v > W[k]);
  const lt = (v, k) => (!Number.isFinite(v) || v < W[k]);
  // the row messages must never throw on a missing value (that is what they now report)
  const fx = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
  const fe = (v) => (Number.isFinite(v) ? v.toExponential(2) : String(v));
  if (gt(m.netball_green_px, 'netball_green_px_max')) why.push(`netball-chroma: ${m.netball_green_px} px > ${W.netball_green_px_max}`);
  if (lt(m.bore_hp, 'bore_hp_min')) why.push(`bore-structure: hp ${Number.isFinite(m.bore_hp) ? fx(m.bore_hp, 4) : String(m.bore_hp)} < ${W.bore_hp_min}`);
  if (gt(m.flank_olive_px, 'flank_olive_px_max')) why.push(`rail-end-face: ${m.flank_olive_px} olive px on the rail-end dressing > ${W.flank_olive_px_max}`);
  if (gt(m.d3_dogear, 'd3_dogear_max')) why.push(`boot-tip-crack-dogear: ${m.d3_dogear} standing-step / flat-run abutments on the D3 loft rings > ${W.d3_dogear_max}`);
  if (gt(m.gate1_plan_max_mm, 'gate1_plan_max_mm_max')) why.push(`gate1-plan: the leather body's section deviates ${fx(m.gate1_plan_max_mm, 2)} mm from the contract (${m.gate1_plan_who}) > ${W.gate1_plan_max_mm_max}`);
  if (gt(m.gate2_fall_dev_mm, 'gate2_fall_dev_mm_max')) why.push(`gate2-fall: the fall dressing deviates ${fx(m.gate2_fall_dev_mm, 2)} mm (${m.gate2_fall_who}) > ${W.gate2_fall_dev_mm_max}`);
  if (gt(m.gate3_butt_mm, 'gate3_butt_mm_max')) why.push(`gate3-butt: leather ↔ rail-end butt off by ${fx(m.gate3_butt_mm, 2)} mm (${m.gate3_butt_who}) > ${W.gate3_butt_mm_max}`);
  if (gt(m.gate4_census_bad, 'gate4_census_bad_max')) why.push(`gate4-census: ${m.gate4_census_bad} family defect(s) — missing ${JSON.stringify(m.gate4_missing)}, retired present ${JSON.stringify(m.gate4_retired)} > ${W.gate4_census_bad_max}`);
  if (gt(m.gate5_edge_dev_mm, 'gate5_edge_dev_mm_max')) why.push(`gate5-elev: the piece's edges sit ${fx(m.gate5_edge_dev_mm, 3)} mm off LP-06 / LP-09 / SK-04 (${m.gate5_edge_who}) > ${W.gate5_edge_dev_mm_max}`);
  if (gt(m.gate5_stitch_dev_mm, 'gate5_stitch_dev_mm_max')) why.push(`gate5-elev: the stitch row sits ${fx(m.gate5_stitch_dev_mm, 2)} mm off LP-06 − LP-10 > ${W.gate5_stitch_dev_mm_max}`);
  if (gt(m.gate5_count_err, 'gate5_count_err_max')) why.push(`gate5-elev: ${m.gate5_dashes} dashes / ${m.gate5_lobes} scallops against ${Math.round(1 / KM.LP10[1])} / ${Math.round(KM.LP01 / KM.LP11[0])} (error ${m.gate5_count_err}) > ${W.gate5_count_err_max}`);
  if (gt(m.gate6_mid_mm, 'gate6_mid_mm_max')) why.push(`gate6-planlaw: the middle plan relation deviates ${fx(m.gate6_mid_mm, 2)} mm (${m.gate6_mid_who}) > ${W.gate6_mid_mm_max}`);
  if (gt(m.sight_count, 'sight_count_max')) why.push(`rail-sights: ${m.sight_count} rail sight disc(s) on chinese8 (${m.sight_who}) — SI-01 is REMOVED (owner ruling B, 2026-09-04) > ${W.sight_count_max}`);
  if (gt(m.gate6_corner_mm, 'gate6_corner_mm_max')) why.push(/^NOT JUDGED/.test(m.gate6_corner_who || '')
    ? `gate6-planlaw: the corner half is ${m.gate6_corner_who} > ${W.gate6_corner_mm_max}`
    : `gate6-planlaw: the corner plan relation deviates ${fx(m.gate6_corner_mm, 2)} mm (${m.gate6_corner_who}) > ${W.gate6_corner_mm_max}`);
  if (gt(m.midext_sagitta_mm, 'midext_sagitta_mm_max')) why.push(`midext-straight: the back crest bows ${fx(m.midext_sagitta_mm, 2)} mm across the slot > ${W.midext_sagitta_mm_max}`);
  if (gt(m.midext_arris_proud_mm, 'midext_arris_proud_mm_max')) why.push(`midext-protrude: ${m.midext_arris_who} stands ${fx(m.midext_arris_proud_mm, 2)} mm outboard of DT-04 > ${W.midext_arris_proud_mm_max}`);
  if (gt(m.midext_cloth_bad, 'midext_cloth_bad_max')) why.push(`midext-clothfree: ${m.midext_cloth_bad} cloth vertices beyond the leather's front plane inside the slot or above the rail top (${m.midext_cloth_who}) > ${W.midext_cloth_bad_max}`);
  if (gt(m.midext_window_proud_mm, 'midext_window_proud_mm_max')) why.push(`midext-window: ${m.midext_window_who} stands ${fx(m.midext_window_proud_mm, 2)} mm outboard of DT-04 inside the bay window > ${W.midext_window_proud_mm_max}`);
  if (gt(m.midext_sock_gap_mm, 'midext_sock_gap_mm_max')) why.push(`midext-sockgap: the knit (${m.midext_sock_who}) laces ${fx(m.midext_sock_gap_mm, 2)} mm below SK-04 > ${W.midext_sock_gap_mm_max}`);
  if (gt(m.midext_sock_rise_mm, 'midext_sock_rise_mm_max')) why.push(`midext-sockgap-rise: the knit (${m.midext_sock_who}) stands ${fx(m.midext_sock_rise_mm, 2)} mm ABOVE SK-04 > ${W.midext_sock_rise_mm_max}`);
  if (gt(m.midedge_knit_above_px, 'midedge_knit_above_px_max')) why.push(`midedge-knit: ${m.midedge_knit_above_px} knit first-hit pixel(s) above SK-04 at the mid_edgeon eye > ${W.midedge_knit_above_px_max}`);
  if (gt(m.midedge_tips_mm, 'midedge_tips_mm_max')) why.push(`midedge-tips: the skirt's lowest vertex at the middles (${m.midedge_tips_who}) is ${fx(m.midedge_tips_mm, 3)} mm off SK-04 > ${W.midedge_tips_mm_max}`);
  if (gt(m.midmouth_void_span, 'midmouth_void_span_max')) why.push(`midmouth-void: ${m.midmouth_void_span} bed-side rays first-hit knit outside the bag footprint > ${W.midmouth_void_span_max}`);
  if (gt(m.midmouth_beam_hits, 'midmouth_beam_hits_max')) why.push(`midmouth-beam: ${m.midmouth_beam_hits} bed-side rays first-hit a rail beam inside the slate hole without crossing the bag > ${W.midmouth_beam_hits_max}`);
  if (gt(m.midext_contract_max_mm, 'midext_contract_max_mm_max')) why.push(`midext-contract: table.js CN8_MID ${m.midext_contract_who} is ${fe(m.midext_contract_max_mm)} mm off the JSON > ${W.midext_contract_max_mm_max}`);
  return why;
};
const ROWS = [
  ['netball-chroma', 'netball_green_px'], ['bore-structure', 'bore_hp'], ['rail-end-face', 'flank_olive_px'],
  ['boot-tip-crack-dogear', 'd3_dogear'],
  ['gate1-plan', 'gate1_plan_max_mm'], ['gate2-fall', 'gate2_fall_dev_mm'], ['gate3-butt', 'gate3_butt_mm'],
  ['gate4-census', 'gate4_census_bad'], ['gate5-elev', 'gate5_edge_dev_mm'], ['gate6-planlaw', 'gate6_mid_mm'],
  ['gate6-planlaw', 'gate6_corner_mm'], // ruling a34fdcc4: the corner half was not a schema row, so its -1 passed unseen
  ['midext-straight', 'midext_sagitta_mm'], ['midext-protrude', 'midext_arris_proud_mm'],
  ['midext-clothfree', 'midext_cloth_bad'], ['midext-window', 'midext_window_proud_mm'],
  ['midext-sockgap', 'midext_sock_gap_mm'], ['midext-sockgap-rise', 'midext_sock_rise_mm'],
  ['midedge-knit', 'midedge_knit_above_px'], ['midedge-tips', 'midedge_tips_mm'],
  ['midmouth-void', 'midmouth_void_span'], ['midmouth-beam', 'midmouth_beam_hits'],
  ['midext-contract', 'midext_contract_max_mm'], ['rail-sights', 'sight_count'],
];
const basisStr = (key) => (BASIS.measured[key] === null || BASIS.measured[key] === undefined
  ? 'NOT YET PINNED (measure on git archive 1e5e119a with this gate)'
  : String(BASIS.measured[key]));
const PERTURB = (args.find((a) => a.startsWith('--perturb=')) || '').split('=')[1] || null;
const PERTURBS = ['knit-rise', 'cover-lift', 'body-hide', 'sight-add', 'dogear', 'net-shift', 'net-hide', 'ring-push'];
if (PERTURB && !PERTURBS.includes(PERTURB)) {
  console.error(`[pass2] unknown --perturb=${PERTURB} (only: ${PERTURBS.join(', ')})`);
  process.exit(2);
}
if (PERTURB && MODE === 'red-arm') {
  console.error('[pass2] --perturb needs a capture run (--gate or --measure)');
  process.exit(2);
}
if (MODE === 'red-arm') {
  const why = judge(BASIS.measured);
  for (const w of why) console.log(`[red-arm] FIRES: ${w}`);
  const unpinned = ROWS.filter(([, key]) => BASIS.measured[key] === null || BASIS.measured[key] === undefined);
  for (const [row, key] of unpinned) {
    console.log(`[red-arm] ${row}: basis not yet pinned (fixture measured.${key} is null)`);
  }
  const expected = ROWS.map(([row]) => row).filter((row) => !unpinned.some(([u]) => u === row));
  const missing = expected.filter((t) => !why.some((w) => w.startsWith(t)));
  if (missing.length) {
    console.error(`[red-arm] pinned basis no longer fires: ${missing.join(', ')} — window/judge regression`);
    process.exit(4);
  }
  if (unpinned.length) {
    console.error(`[red-arm] NOT OK — ${unpinned.length} of ${ROWS.length} rows have no pinned basis`);
    process.exit(4);
  }
  console.log(`[red-arm] OK — all ${ROWS.length} rows fire on their pinned bases `
    + `(pass-2 trio @ 00b6d7c0, boot-tip-crack-dogear by its D3 plant, the r12 rows @ ${BASIS.provenance.r12_basis_tree}; `
    + `midmouth-void @ 065422db, midmouth-beam @ 8d197a95, rail-sights @ ${BASIS.provenance.rail_sights_basis_tree}; live arms --perturb=${PERTURBS.join(' | ')})`);
  process.exit(0);
}
// ---------------------------------------------------------------------------
// capture + instruments
// ---------------------------------------------------------------------------
const OUT = `/tmp/ob-pass2gate-${process.pid}`;
mkdirSync(OUT, { recursive: true });
const refuse = (msg) => {
  const e = new Error(msg.replace(/\s+/g, ' ').slice(0, 120));
  e.obRefusal = `[pass2] REFUSE ${msg}`;
  return e;
};

const rgbAt = (png, x, y) => {
  const i = (png.w * y + x) * png.ch;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
};
const hsv = (r, g, b) => {
  const mx = Math.max(r, g, b) / 255; const mn = Math.min(r, g, b) / 255;
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx * 255 === r) h = ((g - b) / 255 / d) % 6;
    else if (mx * 255 === g) h = (b - r) / 255 / d + 2;
    else h = (r - g) / 255 / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
};

// review pass2-r1 P2 (subject-starvation refusal): each scan also
// verifies its SUBJECT is present in the ROI — a black frame or a
// drifted pose must refuse (exit 2), never zero-pass a one-sided
// window. Floors sit at ~30-60% of the cured-tree measurements
// (netball sock knit-white 21k px; bore mask 92k; flank warm-bright
// blind/boot family 3.4k).
// r12 (card 17b): the ruled corner leather reaches the outer face and covers
// the old pass-2 netball eye (raycast 2026-09-03: every ray from it to the
// sock first-hits cn8r82-ring), so the eye moves BELOW the skirt hem where the
// bag hangs in view, and the census is the netted BALL'S OWN projected disc —
// the row's law (the resting ball carries no green environment stain) counted
// on the pixels that ARE the ball, so no background can leak into it from any
// eye.  The knit floor (subject present) is read in a box about the ball.
const scanNetball = (png, disc) => {
  const { cx, cy, r } = disc;
  let n = 0; let knit = 0; let inDisc = 0;
  const x0 = Math.max(0, Math.round(cx - 260)), x1 = Math.min(png.w, Math.round(cx + 260));
  const y0 = Math.max(0, Math.round(cy - 260)), y1 = Math.min(png.h, Math.round(cy + 260));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const [rr, g, b] = rgbAt(png, x, y);
      const [, s, v] = hsv(rr, g, b);
      if (v > 0.6 && s < 0.25) knit++;
      if (Math.hypot(x - cx, y - cy) > r - 2) continue;
      inDisc++;
      if (g > 1.15 * rr && g > 1.15 * b && s > 0.25) n++;
    }
  }
  if (knit < 8000 || inDisc < 400) {
    throw refuse(`netball scan: sock knit ${knit} px (< 8000) or ball disc ${inDisc} px (< 400) `
      + '— subject missing / black frame / pose drift');
  }
  return n;
};
const scanBore = (png) => {
  const vals = new Map();
  for (let y = 120; y < 540; y++) {
    for (let x = 430; x < 850; x++) {
      const [r, g, b] = rgbAt(png, x, y);
      const [, s, v] = hsv(r, g, b);
      if (v > 0.45 && s < 0.35) vals.set(y * 2048 + x, v);
    }
  }
  let tot = 0;
  for (const v of vals.values()) tot += v;
  const mean = tot / Math.max(1, vals.size);
  let hp2 = 0; let hn = 0;
  for (const [k, v] of vals) {
    const x = k % 2048; const y = (k - x) / 2048;
    let s = 0; let c = 0;
    for (let dy = -4; dy <= 4; dy += 2) {
      for (let dx = -4; dx <= 4; dx += 2) {
        const w = vals.get((y + dy) * 2048 + (x + dx));
        if (w !== undefined) { s += w; c++; }
      }
    }
    if (c >= 15) { hp2 += (v - s / c) ** 2; hn++; }
  }
  const hp = Math.sqrt(hp2 / Math.max(1, hn)) / mean;
  // review pass2-r1 P2: starvation refusal — an empty/off-pose mask
  // yields NaN or a starved sample and would one-sided-pass
  if (!Number.isFinite(hp) || vals.size < 30000 || hn < 10000) {
    throw refuse(`bore scan: mask ${vals.size} px / `
      + `${hn} judged / hp ${hp} — subject missing`);
  }
  return hp;
};
// #1149: the row's subject is the defect it was built for (00b6d7c0, pass-2 item 7): the leather and wood dressing
// of the rail ends lit olive by the green room environment (tan x green). The two windows and the colour test are
// unchanged, but an olive pixel counts only when its first hit, raycast at the same camera, is a leather / wood /
// skirt mesh. Green-albedo cloth (the tongues, the bed) passes the colour test in shadow by nature, and the cream
// cotton net in the pocket is not a rail-end face: on the F2 corner every olive pixel is one of those (836 + 969 on
// main 725f8fbb, none on the ring or the plank), so the old count read the cloth, not the defect.
const FLANK_WINDOWS = [[630, 700, 440, 560], [950, 1035, 425, 540]];
const FLANK_SUBJECT = /^cn8r82-(?:ring|endwrap|block)|^cn8cap-|^cn8fillet-(?:annulus|apron)|^cn8-(?:plank|blind|beam)/;
const scanFlank = (png) => {
  const olive = []; let warm = 0;
  for (const [x0, x1, y0, y1] of FLANK_WINDOWS) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const [r, g, b] = rgbAt(png, x, y);
        const [h, s, v] = hsv(r, g, b);
        if (h >= 15 && h <= 50 && v > 0.3) warm++; // blind/boot family
        if (h >= 60 && h <= 110 && s > 0.4 && v > 0.05) olive.push([x, y]);
      }
    }
  }
  if (warm < 1200) {
    throw refuse(`flank scan: warm subject ${warm} px `
      + '< 1200 — pose drifted/black frame');
  }
  return olive;
};

// R1-FIX7: lane-specific band (9680-9709 collided across lanes). R1-FIX8: the
// band START honours OB_E2E_PORT so a forked lane can run this gate beside
// the parent's — each claims its own 30-wide band. The layout law fixes
// cdp(0) at start+15, so OB_E2E_CDP_PORT is deliberately NOT read: a CDP port
// outside the claimed band would be the self-collision class GH-410 refuses.
// R1-FIX12: a lane assigned a band NARROWER than the 30-port layout law (the
// craft lane owns 9780-9789) pins BOTH ports.  With OB_E2E_PORT and
// OB_E2E_CDP_PORT both set the pinned pair is used and still CLAIMED in the
// registry (layout: false — the claim is the cross-lane collision guard, the
// layout only derives ports), so a foreign claim over them refuses this run
// and this run refuses theirs.  With only OB_E2E_PORT set the 30-wide band
// path above stands unchanged.
const PIN_HTTP = Number(process.env.OB_E2E_PORT);
const PIN_CDP = Number(process.env.OB_E2E_CDP_PORT);
const PINNED = Number.isInteger(PIN_HTTP) && Number.isInteger(PIN_CDP)
  && PIN_HTTP !== PIN_CDP;
const BAND_START = Number(process.env.OB_E2E_PORT) || 10280;
const band = PINNED
  ? await claimPortBand(Math.min(PIN_HTTP, PIN_CDP), Math.max(PIN_HTTP, PIN_CDP),
    { layout: false })
  : await claimPortBand(BAND_START, BAND_START + 29);
const PORT = PINNED ? PIN_HTTP : band.http(0);
const CDPP = PINNED ? PIN_CDP : band.cdp(0);
const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?table=chinese8_pro_9ft&cinema=1&seed=7&look=default`,
  { port: CDPP, width: 1600, height: 1000 });
let measured;
// review midext-r6 P2: set by a tagged refusal raised anywhere inside the run
// below; printed and exited AFTER the teardown finally (probe-490-horn's
// shape). Declared here so the catch can reach it.
let REFUSAL = null;
let PERTURBED = null;
try {
  await chrome.send('Emulation.setDeviceMetricsOverride',
    { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  let ready = false;
  for (let i = 0; i < 220 && !ready; i++) {
    await sleep(200);
    ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
  }
  if (!ready) throw new Error('app never ready');
  let settled = false;
  for (let i = 0; i < 150 && !settled; i++) {
    settled = await chrome.eval(`(() => {
      const s = window.__gi && window.__gi.state;
      const rig = window.__lighting && window.__lighting.state
        && window.__lighting.state().fixture;
      return !!(s && s.ready && s.baked && s.bakeClass === 'chinese8_9ft'
        && s.fixture === 'joy_lowrect' && rig === 'joy_lowrect'
        && window.__cn8ringtex === 'photo');
    })()`).catch(() => false);
    if (!settled) await sleep(200);
  }
  if (!settled) throw new Error('GI/rig/photo-tex never settled');
  await sleep(1200);
  // BOOT-TIP CRACK census (mesh truth, not capture), re-derived on the D3 loft (GH-1146, ruling 22cf7661 item 2).
  // The rev-8 census read the cn8Fillet sweep layout (97 stations x 31 columns, the crown-edge -> bead wall), which
  // E-D2-CN8FILLET retired; on the D3 ring it read unrelated vertices. The ring is now a loft of closed sections:
  // userData.cn8D3 publishes the stations and the profile count, and vertex s * profileCount + j is profile point j at
  // station s. boot-tip-crack-dogear keeps its law on that layout, for every adjacent pair (j, j + 1) of the closed
  // section: h_s = y(j + 1) - y(j), and a dog-ear is a station where |h| exceeds 2 mm next to a run of at least three
  // stations where |h| stays under 0.1 mm (a flap standing out of a flat run). On the shipped constructor the pairs
  // that go flat never rise above 0.7 mm and the tall pairs are never flat, so a clean ring reads 0; the live arm
  // --perturb=dogear raises one flat-run point at each ring's middle station 3 mm (4 abutments per ring). No D3 row
  // catches such a flap while the shell stays closed and oriented (A3 and BINDING see only a vertex that leaves the
  // constructor), so the row stays. boot-tip-crack-fold is RETIRED with the sweep: on the loft a fold or a crack is
  // caught per PR by the D3 section verifier (tools/render/ghcn8/cn8_emitted_checks.mjs verifyCapturedCover, run by
  // test_cn8_emitted_checks.mjs): C2 "captured closed sections self-intersect" (control: a bow-tie section) and
  // "actual shell is not closed, manifold, consistently wound and positive-volume" (controls: a removed cap triangle,
  // a flipped triangle) and B2 "inward/tangent faces" (control: the flipped triangle); B2 "section orientation is
  // inconsistent" also reads it, but has no red control in that file (a flipped index leaves the positions alone).
  // A ring without the D3 layout (a pre-D3 tree) leaves the row unmeasured, which the judge reads red.
  const dogear = JSON.parse(await chrome.eval(`(() => {
    const rings = [];
    window.__dbg.scene.traverse((o) => { if (/^cn8r82-ring-\\d+$/.test(o.name || '')) rings.push(o); });
    let count = 0, planted = 0; const at = [], bad = [];
    for (const m of rings) {
      const md = m.userData && m.userData.cn8D3; const p = m.geometry && m.geometry.attributes.position;
      const S = md && Array.isArray(md.stations) ? md.stations.length : 0, C = md ? md.profileCount : 0;
      if (!p || S < 7 || !Number.isInteger(C) || C < 3 || p.count !== S * C) { bad.push(m.name); continue; }
      const hOf = (j, s) => p.getY(s * C + (j + 1) % C) - p.getY(s * C + j);
      if (${PERTURB === 'dogear'}) {
        const s0 = Math.floor(S / 2); let j0 = -1;
        for (let j = 0; j < C && j0 < 0; j++) {
          let flat = true;
          for (let s = s0 - 3; s <= s0 + 3 && flat; s++) flat = Math.abs(hOf((j + C - 1) % C, s)) < 1e-4 && Math.abs(hOf(j, s)) < 1e-4;
          if (flat) j0 = j;
        }
        if (j0 < 0) return JSON.stringify({ refuse: 'dogear arm: ' + m.name + ' has no flat profile run to plant on' });
        p.setY(s0 * C + j0, p.getY(s0 * C + j0) + 0.003); p.needsUpdate = true; planted++;
      }
      for (let j = 0; j < C; j++) {
        const hs = []; for (let s = 0; s < S; s++) hs.push(hOf(j, s));
        for (let s = 0; s + 1 < S; s++) for (const [hi, z0, stp] of [[hs[s], s + 1, 1], [hs[s + 1], s, -1]]) {
          if (!(Math.abs(hi) > 0.002) || !(Math.abs(hs[z0]) < 1e-4)) continue;
          let run = 0; for (let q = z0; q >= 0 && q < S && Math.abs(hs[q]) < 1e-4; q += stp) run++;
          if (run >= 3) { count++; if (at.length < 8) at.push([m.name, j, s]); }
        }
      }
    }
    return JSON.stringify({ n: rings.length, count, planted, at, bad });
  })()`));
  if (dogear.refuse) throw refuse(dogear.refuse);
  if (dogear.n !== 4) throw refuse(`D3 dog-ear census: rings ${dogear.n}/4 — topology drift`);
  // ---- the r12 middle-body censuses (one page eval; geometry truth) ----
  const PERTURB_SRC = {
    'knit-rise': `
    { let moved = 0;
      scene.traverse((o) => {
        if (!o.isMesh || !/^cn8-net-/.test(o.name || '') || /^cn8-net-liner-/.test(o.name || '')) return;
        o.position.y += 0.0035; o.updateMatrixWorld(true); moved++; });
      if (!moved) return JSON.stringify({ refuse: 'knit-rise: no cn8-net-* mesh to raise' }); }`,
    'cover-lift': `
    { let moved = 0;
      scene.traverse((o) => {
        if (!o.isMesh || !/^cn8-mid-leather-skirt-/.test(o.name || '')) return;
        o.position.y += 0.003; o.updateMatrixWorld(true); moved++; });
      if (!moved) return JSON.stringify({ refuse: 'cover-lift: no cn8-mid-leather-skirt-* mesh to lift' }); }`,
    'sight-add': `
    { // LAND-629 arm: one rail-sight disc re-appears at the rail top (the removed element coming back).
      // No THREE handle is needed: clone any table mesh, give its geometry the CircleGeometry type the
      // census keys on, and park it at a long-rail sight station (nose + 70 mm, rail-top height).
      let table = null; scene.traverse((o) => { if (!table && o.name === 'obTable') table = o; });
      if (!table) return JSON.stringify({ refuse: 'sight-add: no obTable group' });
      let src = null; table.traverse((o) => { if (!src && o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position && o.geometry.attributes.position.count < 2000) src = o; });
      if (!src) return JSON.stringify({ refuse: 'sight-add: no small mesh to clone' });
      const disc = src.clone(); disc.geometry = src.geometry.clone(); disc.geometry.type = 'CircleGeometry';
      disc.name = 'arm-sight-add'; disc.position.set(0.3175, 0.0426, -0.700); disc.rotation.set(0, 0, 0); disc.scale.set(1, 1, 1);
      table.add(disc); disc.updateMatrixWorld(true); }`,
    'net-shift': `
    { // the midmouth-void arm: the middle nets slide 20 mm inboard (toward the table), out of the bag's own footprint
      let moved = 0;
      scene.traverse((o) => {
        if (!o.isMesh || !/^cn8-net-(?:low-)?\\d+$/.test(o.name || '')) return;
        const e = o.matrixWorld.elements; if (Math.abs(e[12]) > 0.25) return;
        o.position.z -= Math.sign(e[14]) * 0.020; o.updateMatrixWorld(true); moved++; });
      if (!moved) return JSON.stringify({ refuse: 'net-shift: no middle cn8-net-* mesh to move' }); }`,
    'ring-push': `
    { // the gate6 corner arm (ruling a34fdcc4): every corner ring 2 mm outboard on both axes, so its outer radius stands
      // about 2.8 mm past R + W_L and its window reach 2 mm past A_r
      let moved = 0;
      scene.traverse((o) => {
        if (!o.isMesh || !/^cn8r82-ring-\\d+$/.test(o.name || '')) return;
        const p = o.geometry.attributes.position; let cx = 0, cz = 0;
        for (let i = 0; i < p.count; i++) { cx += p.getX(i); cz += p.getZ(i); }
        o.position.x += Math.sign(cx) * 0.002; o.position.z += Math.sign(cz) * 0.002; o.updateMatrixWorld(true); moved++; });
      if (moved !== 4) return JSON.stringify({ refuse: 'ring-push: ' + moved + ' corner rings, not 4' }); }`,
    'net-hide': `
    { // the midmouth-beam arm: the middle nets are hidden, so nothing hangs between the mouth and the beam
      NET_HID.push(...(${hideVisibleMiddleNets.toString()})(scene));
      if (!NET_HID.length) return JSON.stringify({ refuse: 'net-hide: no visible middle cn8-net-* mesh to hide' }); }`,
    'body-hide': `
    { let hid = 0;
      scene.traverse((o) => {
        if (!o.isMesh || !/^cn8-mid-(leather|stitch|lace|fallcloth|slatecut)-/.test(o.name || '')) return;
        o.visible = false; hid++; });
      if (!hid) return JSON.stringify({ refuse: 'body-hide: no r12 body mesh to hide' }); }`,
  }[PERTURB] || '';
  const r12 = JSON.parse(await chrome.eval(`(async () => {
    const K = ${JSON.stringify(KM)}; const NET_HIDDEN = ${PERTURB === 'net-hide'}; const CORNER_IDS = ${JSON.stringify(CORNER_IDS)};
    const NET_HID = []; // the nets the net-hide plant itself made invisible
    const scene = window.__dbg.scene; scene.updateMatrixWorld(true);
    ${PERTURB_SRC}
    scene.updateMatrixWorld(true);
    const mid = await import('/scene/cn8mid.js').catch(() => null);
    const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const meshes = [];
    scene.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position
        && o.geometry.attributes.position.count && vis(o)) meshes.push(o);
    });
    const vc = new Map();
    const W3 = (o) => {
      let a = vc.get(o); if (a) return a;
      const pos = o.geometry.attributes.position; const m = o.matrixWorld.elements;
      a = new Float64Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const cx = pos.getX(i), cy = pos.getY(i), cz = pos.getZ(i);
        a[3 * i] = m[0] * cx + m[4] * cy + m[8] * cz + m[12];
        a[3 * i + 1] = m[1] * cx + m[5] * cy + m[9] * cz + m[13];
        a[3 * i + 2] = m[2] * cx + m[6] * cy + m[10] * cz + m[14];
      }
      vc.set(o, a); return a;
    };
    const tc = new Map();
    const T3 = (o) => {
      let arr = tc.get(o); if (arr) return arr;
      const v = W3(o); const g = o.geometry; const idx = g.index ? g.index.array : null;
      const nTri = Math.floor((idx ? idx.length : g.attributes.position.count) / 3);
      arr = new Float64Array(nTri * 9);
      for (let t = 0; t < nTri; t++) for (let k = 0; k < 3; k++) {
        const i = idx ? idx[3 * t + k] : 3 * t + k; const b = 9 * t + 3 * k;
        arr[b] = v[3 * i]; arr[b + 1] = v[3 * i + 1]; arr[b + 2] = v[3 * i + 2];
      }
      tc.set(o, arr); return arr;
    };
    const NOSE = K.DT02;
    const mouths = [];
    for (const o of meshes) {
      if (!/^cn8-ring-iron-/.test(o.name || '')) continue;
      const e = o.matrixWorld.elements; if (Math.abs(e[12]) < 0.02) mouths.push({ x: e[12], z: e[14] });
    }
    if (mouths.length !== 2) return JSON.stringify({ refuse: 'side mouths ' + mouths.length });
    const sideCache = new Map();
    const sideOf = (o) => {
      if (sideCache.has(o)) return sideCache.get(o);
      const v = W3(o); let s = 0; let n = 0;
      for (let i = 0; i < v.length; i += 3) { if (Math.abs(v[i]) < 0.25) { s += v[i + 2]; n++; } }
      const r = n ? Math.sign(s / n) : 0; sideCache.set(o, r); return r;
    };
    const touchesMid = (o) => { const v = W3(o); for (let i = 0; i < v.length; i += 3) if (Math.abs(v[i]) < 0.25 && Math.abs(v[i + 2]) > 0.40) return true; return false; };
    const sliceAt = (arr, v, mo, sw) => {
      const segs = [];
      for (let b = 0; b < arr.length; b += 9) {
        const P = [[arr[b], arr[b + 1], arr[b + 2]], [arr[b + 3], arr[b + 4], arr[b + 5]], [arr[b + 6], arr[b + 7], arr[b + 8]]];
        const cr = [];
        for (let e = 0; e < 3; e++) {
          const a = P[e], c = P[(e + 1) % 3];
          if ((a[1] - v) * (c[1] - v) < 0) {
            const s = (v - a[1]) / (c[1] - a[1]);
            cr.push([a[0] + s * (c[0] - a[0]) - mo.x, sw * (a[2] + s * (c[2] - a[2])) - NOSE]);
          }
        }
        if (cr.length === 2) segs.push(cr);
      }
      return segs;
    };
    const rhoAt = (h) => {
      if (mid && mid.cn8MidBarrelR) return mid.cn8MidBarrelR(K, h);
      const [[v0, r0], [v1, r1], [v2, r2]] = K.LP05;
      const l0 = ((h - v1) * (h - v2)) / ((v0 - v1) * (v0 - v2)), l1 = ((h - v0) * (h - v2)) / ((v1 - v0) * (v1 - v2)), l2 = ((h - v0) * (h - v1)) / ((v2 - v0) * (v2 - v1));
      return r0 * l0 + r1 * l1 + r2 * l2;
    };
    const REQUIRED = [['leather', /^cn8-mid-leather-\\d+$/], ['skirt', /^cn8-mid-leather-skirt-/], ['stitch', /^cn8-mid-stitch-/],
      ['lace', /^cn8-mid-lace-/], ['fallcloth', /^cn8-mid-fallcloth-/], ['slatecut', /^cn8-mid-slatecut-/],
      // r14 (GH-1146): the JOY cord net is built into cn8-net-low-<id> and the old cn8-net-<id> sock is retired
      // (cn8pockets.js replaceCn8Nets), so either name is the middle's net
      ['midwrap', /^cn8-cloth-midwrap-/], ['net', /^cn8-net-(?:low-)?\\d+$/], ['ring-iron', /^cn8-ring-iron-/]];
    const RETIRED = [/^cn8cap-boot-/, /^cn8cap-skirt-/, /^cn8-midthread-/, /^cn8-mid-lipwall-/, /^cn8-mid-throat-/, /^cn8-mid-liner-/,
      /^cn8-cloth-midfall-/, /^cn8-cloth-midfold-/, /^cn8-cloth-midslot-/, /^cn8-bayplate-/];
    const out = { mouths: [], corners: [], per: {} };
    const F = 1000;
    let g1 = -1, g1who = '', g2 = -1, g2who = '', g3 = -1, g3who = '', g4 = 0, g4missing = [], g4retired = [];
    let g5edge = -1, g5who = '', g5stitch = -1, g5count = 0, g5dashes = 0, g5lobes = 0;
    let g6mid = -1, g6who = '', sag = -1, proud = -1e9, proudWho = '', clothBad = 0, clothWho = '', winProud = -1e9, winWho = '';
    // ruling a34fdcc4 (fail closed): these three rows read a "nothing beyond" law, so a subject that yields no vertex at a
    // mouth would pass on its starting value; it reads NOT JUDGED instead
    const notJudged = { arris: [], cloth: [], window: [] };
    let sockGap = -1e9, sockWho = '';
    for (const mo of mouths) {
      const sw = Math.sign(mo.z); const tag = sw > 0 ? '+z' : '-z';
      const fam = (re) => meshes.filter((o) => re.test(o.name || '') && sideOf(o) === sw);
      const body = fam(/^cn8-mid-leather-\\d+$/); const skirt = fam(/^cn8-mid-leather-skirt-/);
      const stitch = fam(/^cn8-mid-stitch-|^cn8-midthread-/); const lace = fam(/^cn8-mid-lace-/);
      const band = fam(/^cn8-mid-fallcloth-|^cn8-cloth-midfall-/); const slate = fam(/^cn8-mid-slatecut-/);
      const wraps = fam(/^cn8-cloth-midwrap-|^cn8-cloth-midfold-|^cn8-cloth-midslot-/);
      const nets = fam(/^cn8-net(-|$)/).filter((o) => !/^cn8-net-liner-/.test(o.name));
      const plate = fam(/^cn8cap-boot-/);
      const planks = meshes.filter((o) => /^cn8-plank-/.test(o.name || '') && sideOf(o) === sw && touchesMid(o));
      const cushions = meshes.filter((o) => /^cn8-cushion-/.test(o.name || '') && sideOf(o) === sw && touchesMid(o));
      const leatherFam = body.length ? body : plate;
      const M = { mouth: tag };
      // ---- GATE-1: sections vs the contract ----
      const bodyTris = body.map(T3);
      M.gate1 = [];
      for (const [h, ref] of K.LP05) {
        const segs = []; for (const arr of bodyTris) segs.push(...sliceAt(arr, h, mo, sw));
        if (!segs.length) { M.gate1.push({ h: h * F, absent: true }); if (999 > g1) { g1 = 999; g1who = tag + ' no cn8-mid-leather body at bed+' + (h * F).toFixed(1); } continue; }
        const inner = new Array(36).fill(Infinity); let back = -1e9; let side = 0;
        for (const [a, b] of segs) {
          for (let t = 0; t <= 4; t++) {
            const u = a[0] + (b[0] - a[0]) * t / 4, w = a[1] + (b[1] - a[1]) * t / 4;
            const r = Math.hypot(u, w - K.DT03); let ang = Math.atan2(w - K.DT03, u) * 180 / Math.PI; if (ang < 0) ang += 360;
            const k = Math.min(35, Math.floor(ang / 10)); if (r < inner[k]) inner[k] = r;
            if (w > back) back = w; if (Math.abs(u) > side) side = Math.abs(u);
          }
        }
        const wall = []; for (let k = 6; k < 12; k++) wall.push(inner[k]);
        const devs = wall.map((r) => Number.isFinite(r) ? Math.abs(r - ref) * F : 999);
        const wallMax = Math.max(...devs); const wallMean = devs.reduce((a, b) => a + b, 0) / devs.length;
        const backDev = Math.abs(back - K.LP04) * F, sideDev = Math.abs(side - K.DT09) * F;
        const worst = Math.max(wallMax, backDev, sideDev);
        M.gate1.push({ h: +(h * F).toFixed(1), ref: +(ref * F).toFixed(2), wall_mm: wall.map((r) => +(r * F).toFixed(2)), wall_dev_max: +wallMax.toFixed(3), wall_dev_mean: +wallMean.toFixed(3), back_mm: +(back * F).toFixed(2), side_mm: +(side * F).toFixed(2), worst: +worst.toFixed(3) });
        if (worst > g1) { g1 = worst; g1who = tag + ' bed+' + (h * F).toFixed(1) + (wallMax >= backDev && wallMax >= sideDev ? ' wall' : backDev >= sideDev ? ' back' : ' side'); }
      }
      // ---- GATE-2: the fall dressing ----
      if (!band.length) { M.gate2 = { absent: true }; if (999 > g2) { g2 = 999; g2who = tag + ' no fall band'; } }
      else {
        let rOuter = -1, rBelow = 1e9, maxW = -1e9, who = '';
        for (const o of band) { const v = W3(o); for (let i = 0; i < v.length; i += 3) { const u = v[i] - mo.x, w = sw * v[i + 2] - NOSE, y = v[i + 1]; const r = Math.hypot(u, w - K.DT03); if (y > -0.0005 && r > rOuter) { rOuter = r; who = o.name; } if (y < -0.003 && r < rBelow) rBelow = r; if (w > maxW) maxW = w; } }
        let slateW = -1e9; for (const o of slate) { const v = W3(o); for (let i = 0; i < v.length; i += 3) { const w = sw * v[i + 2] - NOSE; if (w > slateW) slateW = w; } }
        const dOuter = Math.abs(rOuter - K.FL02) * F, dShrink = Math.max(0, K.FL01 - rBelow) * F, dBeyond = Math.max(0, Math.max(maxW, slateW) - K.DT12) * F;
        const worst = Math.max(dOuter, dShrink, dBeyond);
        M.gate2 = { outer_r_mm: +(rOuter * F).toFixed(2), below_min_r_mm: +(rBelow * F).toFixed(2), band_max_w_mm: +(maxW * F).toFixed(2), slate_max_w_mm: Number.isFinite(slateW) ? +(slateW * F).toFixed(2) : null, dev_outer: +dOuter.toFixed(3), shrink: +dShrink.toFixed(3), beyond_dt12: +dBeyond.toFixed(3), who };
        if (worst > g2) { g2 = worst; g2who = tag + ' ' + who + (dShrink >= dOuter && dShrink >= dBeyond ? ' shrinks below the bed' : dOuter >= dBeyond ? ' outer radius' : ' beyond DT-12'); }
      }
      // ---- GATE-3: the butt ----
      {
        let plankEnd = 1e9; for (const o of planks) { const v = W3(o); for (let i = 0; i < v.length; i += 3) { const u = Math.abs(v[i] - mo.x); if (u < plankEnd) plankEnd = u; } }
        let bodyMax = -1; for (const o of body) { const v = W3(o); for (let i = 0; i < v.length; i += 3) { const u = Math.abs(v[i] - mo.x); if (u > bodyMax) bodyMax = u; } }
        let angDev = 0;
        if (body.length && bodyMax > 0) {
          for (const arr of bodyTris) for (let b = 0; b < arr.length; b += 9) {
            if (Math.abs(Math.abs(arr[b] - mo.x) - bodyMax) > 2e-5 || Math.abs(Math.abs(arr[b + 3] - mo.x) - bodyMax) > 2e-5 || Math.abs(Math.abs(arr[b + 6] - mo.x) - bodyMax) > 2e-5) continue;
            const e1 = [arr[b + 3] - arr[b], arr[b + 4] - arr[b + 1], arr[b + 5] - arr[b + 2]], e2 = [arr[b + 6] - arr[b], arr[b + 7] - arr[b + 1], arr[b + 8] - arr[b + 2]];
            const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
            const L = Math.hypot(nx, ny, nz); if (L < 1e-14) continue;
            const a = Math.acos(Math.min(1, Math.abs(nx) / L)) * 180 / Math.PI; if (a > angDev) angDev = a;
          }
        }
        const gap = body.length ? (plankEnd - bodyMax) * F : null;
        const worst = body.length ? Math.max(Math.abs(gap), Math.abs(bodyMax - K.DT09) * F, Math.abs(plankEnd - K.DT09) * F) : Math.abs(plankEnd - K.DT09) * F;
        M.gate3 = { plank_end_mm: +(plankEnd * F).toFixed(3), body_end_mm: body.length ? +(bodyMax * F).toFixed(3) : null, gap_mm: gap === null ? null : +gap.toFixed(3), end_face_angle_dev_deg: +angDev.toFixed(3), worst: +worst.toFixed(3) };
        if (worst > g3) { g3 = worst; g3who = tag + (body.length ? ' gap ' + gap.toFixed(2) + ' / plank ' + (plankEnd * F).toFixed(2) + ' / body ' + (bodyMax * F).toFixed(2) : ' plank end ' + (plankEnd * F).toFixed(2) + ', no body'); }
        if (angDev > 0.5 && 0.5 + angDev > g3) { g3 = Math.max(g3, angDev); g3who = tag + ' end face ' + angDev.toFixed(2) + ' deg off 90'; }
      }
      // ---- GATE-4: census ----
      {
        const missing = []; for (const [nm, re] of REQUIRED) if (!fam(re).length) missing.push(nm);
        const retired = []; for (const re of RETIRED) for (const o of fam(re)) retired.push(o.name);
        const footprint = body.length && bodyTris.some((arr) => sliceAt(arr, 0.020, mo, sw).length > 0);
        const bad = missing.length + retired.length + (footprint ? 0 : 1);
        M.gate4 = { missing, retired, footprint: !!footprint, bad };
        g4 += bad; g4missing.push(...missing.map((m) => tag + ':' + m)); g4retired.push(...retired);
      }
      // ---- GATE-5: elevation ----
      {
        let topV = -1e9; for (const o of leatherFam) { const v = W3(o); for (let i = 1; i < v.length; i += 3) if (v[i] > topV) topV = v[i]; }
        const skirtFam = skirt.length ? skirt : leatherFam;
        let crestV = -1e9, tipsV = 1e9; const cols = new Map();
        for (const o of skirtFam) { const v = W3(o); for (let i = 0; i < v.length; i += 3) { const y = v[i + 1]; if (skirt.length && y > crestV) crestV = y; if (y < tipsV) tipsV = y; const ku = Math.round((v[i] - mo.x) * 20000); const p = cols.get(ku); if (p === undefined || y < p) cols.set(ku, y); } }
        if (!skirt.length) crestV = tipsV;
        // lobes: runs of the lower edge below the hem's crest − depth / 2 (r14: the JOY skirt hangs LP-19 under LP-09,
        // so the hem's crest is LP-09 − LP-19)
        const ks = [...cols.keys()].sort((a, b) => a - b); let lobes = 0, inL = false;
        for (const k of ks) { const y = cols.get(k); const low = y < K.LP09 - K.LP19 - K.LP11[1] / 2; if (low && !inL) { lobes++; inL = true; } else if (!low) inL = false; }
        let stitchV = null, dashes = 0;
        if (stitch.length) {
          let s = 0, n = 0; const us = [];
          for (const o of stitch) { const v = W3(o); for (let i = 0; i < v.length; i += 3) { s += v[i + 1]; n++; us.push(v[i] - mo.x); } }
          // dashes = clusters of stitch vertices along u; the drawn gap between
          // dashes is (1 − duty) · pitch = 1.56 mm, the tubes are dense (0.65 mm)
          stitchV = s / n; us.sort((a, b) => a - b); let prev = -1e9; for (const u of us) { if (u - prev > 0.0012) dashes++; prev = u; }
        }
        const edge = Math.max(Math.abs(topV - K.LP06), Math.abs(crestV - K.LP09), Math.abs(tipsV - K.SK04)) * F;
        const sd = stitchV === null ? 999 : Math.abs(stitchV - (K.LP06 - K.LP10[0])) * F;
        // the build's counts: round(1 / LP-10[1]) whole dashes (r14 JOY: 21) and LP-01 / LP-11.pitch scallops (10)
        const cnt = Math.abs(dashes - Math.round(1 / K.LP10[1])) + Math.abs(lobes - Math.round(K.LP01 / K.LP11[0]));
        M.gate5 = { top_mm: +(topV * F).toFixed(3), crest_mm: +(crestV * F).toFixed(3), tips_mm: +(tipsV * F).toFixed(3), stitch_v_mm: stitchV === null ? null : +(stitchV * F).toFixed(3), dashes, lobes, edge_dev: +edge.toFixed(3), stitch_dev: +sd.toFixed(3), count_err: cnt };
        if (edge > g5edge) { g5edge = edge; g5who = tag + ' top ' + (topV * F).toFixed(2) + ' crest ' + (crestV * F).toFixed(2) + ' tips ' + (tipsV * F).toFixed(2); }
        if (sd > g5stitch) g5stitch = sd; g5count += cnt; g5dashes += dashes; g5lobes += lobes;
      }
      // ---- GATE-6 (middle): the plan-overlay law at three heights ----
      {
        const rows = [];
        const heights = [[0.020, 'bed+20'], [K.HNOSE, 'nose'], [K.LP06 - 0.001, 'cap-1']];
        for (const [h, nm] of heights) {
          const segs = []; for (const arr of bodyTris) segs.push(...sliceAt(arr, h, mo, sw));
          let tipW = null;
          const uCut = K.DT09 - 0.0005;
          for (const [a, b] of segs) for (const sgn of [-1, 1]) {
            const ua = a[0] * sgn, ub = b[0] * sgn;
            if ((ua - uCut) * (ub - uCut) < 0) { const s = (uCut - ua) / (ub - ua); const w = a[1] + s * (b[1] - a[1]); if (tipW === null || w < tipW) tipW = w; }
          }
          // the contract's own front boundary at the crossing station uCut: the
          // horn flat (w = LP-04 − LP-02) where the barrel enters the front plane
          // inside the slot, else the barrel's circle at that u
          const rho = rhoAt(h); const front = K.LP04 - K.LP02;
          const uStar = Math.sqrt(Math.max(0, rho * rho - (front - K.DT03) * (front - K.DT03)));
          const expected = uStar < uCut ? front : K.DT03 + Math.sqrt(Math.max(0, rho * rho - uCut * uCut));
          let cushW = null;
          for (const o of cushions) for (const [a, b] of sliceAt(T3(o), h, mo, sw)) for (const p of [a, b]) if (Math.abs(Math.abs(p[0]) - K.DT09) < 2e-4 && (cushW === null || p[1] < cushW)) cushW = p[1];
          const tipDev = tipW === null ? 999 : Math.abs(tipW - expected) * F;
          const cushDev = cushW === null ? 999 : (nm === 'nose' ? Math.abs(cushW - K.JW05) * F : null);
          rows.push({ h: nm, h_mm: +(h * F).toFixed(2), tip_w_mm: tipW === null ? null : +(tipW * F).toFixed(2), expected_mm: +(expected * F).toFixed(2), tip_dev: +tipDev.toFixed(3), cushion_w_mm: cushW === null ? null : +(cushW * F).toFixed(2), cushion_dev: cushDev === null ? null : +cushDev.toFixed(3) });
          if (tipDev > g6mid) { g6mid = tipDev; g6who = tag + ' leather front edge at ' + nm; }
          if (cushDev !== null && cushDev > g6mid) { g6mid = cushDev; g6who = tag + ' cushion end at the nose vs JW-05'; }
        }
        M.gate6 = rows;
      }
      // ---- midext rows ----
      {
        // the back plane's straightness: the leather family sliced at three
        // heights, every segment sampled at 0.5 mm, the outboard-most w per
        // 1.4 mm u-bin, sagitta = max − min over the bins (ends excluded 1 mm)
        const NB = 60; let lo = 1e9, hi = -1e9, starved = 0;
        const famTris = leatherFam.map(T3);
        const binMax = new Array(NB).fill(-1e9);
        for (const hh of [0.005, 0.020, 0.035]) {
          for (const arr of famTris) for (const [a, b] of sliceAt(arr, hh, mo, sw)) {
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const nS = Math.max(1, Math.ceil(L / 0.0005));
            for (let k = 0; k <= nS; k++) {
              const u = a[0] + (b[0] - a[0]) * k / nS, w = a[1] + (b[1] - a[1]) * k / nS;
              if (Math.abs(u) > K.DT09 - 0.001) continue;
              const bi = Math.min(NB - 1, Math.floor((u + K.DT09 - 0.001) / (2 * (K.DT09 - 0.001)) * NB));
              if (w > binMax[bi]) binMax[bi] = w;
            }
          }
        }
        for (const w of binMax) { if (w < -1e8) { starved++; continue; } lo = Math.min(lo, w); hi = Math.max(hi, w); }
        const s = leatherFam.length && starved < NB / 2 ? (hi - lo) * F : 999;
        if (s > sag) sag = s;
        M.sagitta_mm = +s.toFixed(3); M.sagitta_starved = starved;
        let nArris = 0;
        for (const o of [...body, ...skirt, ...stitch, ...lace, ...wraps, ...band, ...slate, ...nets, ...plate]) { const v = W3(o); for (let i = 0; i < v.length; i += 3) { if (Math.abs(v[i] - mo.x) > 0.2) continue; nArris++; const w = sw * v[i + 2] - NOSE; if (w > proud) { proud = w; proudWho = o.name; } } }
        if (!nArris) notJudged.arris.push(tag + ' (no furniture vertex within 0.2 of the mouth)');
        let bad = 0; let who = '';
        // the slot and 6 mm either side of it (the old 46 mm bay's walls are subjects too)
        let nCloth = 0;
        for (const o of [...wraps, ...band]) { const v = W3(o); for (let i = 0; i < v.length; i += 3) { const u = Math.abs(v[i] - mo.x), w = sw * v[i + 2] - NOSE, y = v[i + 1]; if (u > K.DT09 + 0.006) continue; nCloth++; if ((w > (K.LP04 - K.LP02) + 0.0005 && y > -0.0005) || y > K.DT05 + 0.0005) { bad++; who = o.name; } } }
        if (!nCloth) notJudged.cloth.push(tag + ' (no wrap or fall-band vertex within the slot)');
        clothBad += bad; if (bad) clothWho = who; M.cloth_bad = bad;
        let nWin = 0;
        for (const o of meshes) { if (!touchesMid(o) || sideOf(o) !== sw) continue; const v = W3(o); for (let i = 0; i < v.length; i += 3) { const u = Math.abs(v[i] - mo.x); if (u > K.DT09) continue; const y = v[i + 1]; if (y < -0.160 || y > K.DT05) continue; nWin++; const w = sw * v[i + 2] - NOSE; if (w > winProud) { winProud = w; winWho = o.name; } } }
        if (!nWin) notJudged.window.push(tag + ' (no vertex inside the bay window)');
        let sockTop = -1e9, who2 = '';
        for (const o of nets) { const v = W3(o); for (let i = 0; i < v.length; i += 3) { if (Math.abs(v[i] - mo.x) > K.DT09) continue; if (sw * v[i + 2] < 0.40) continue; if (v[i + 1] > sockTop) { sockTop = v[i + 1]; who2 = o.name; } } }
        // the net-hide arm removes the sockgap rows' subject; those rows are not what it arms (midmouth-beam is)
        if (sockTop === -1e9 && !NET_HIDDEN) return JSON.stringify({ refuse: 'no cn8-net-* vertex inside the slot at the ' + tag + ' mouth — the sockgap rows have no subject' });
        if (sockTop !== -1e9) {
          const gap = (K.SK04 - sockTop) * F; if (gap > sockGap) { sockGap = gap; sockWho = who2; }
          M.sock_top_mm = +(sockTop * F).toFixed(3);
        }
      }
      out.mouths.push(M);
    }
    // ---- rail sights (LAND-629, owner ruling B): SI-01 is REMOVED — ZERO sight discs ----
    // the sights carried no names outside dm mode: CircleGeometry discs at the rail-top
    // height, outboard of the nose lines (long rails: |z| > W/2, |x| < 1.20; short: |x| > L/2)
    let sightCount = 0; let sightWho = 'none'; const sights = { long: [], short: [] };
    for (const o of meshes) {
      if (!o.geometry || o.geometry.type !== 'CircleGeometry') continue;
      const m = o.matrixWorld.elements; const px = m[12], py = m[13], pz = m[14];
      if (py < 0.040 || py > 0.060) continue;
      if (Math.abs(pz) > 0.63 && Math.abs(px) < 1.20) sights.long.push((Math.abs(pz) - 0.63) * F);
      else if (Math.abs(px) > 1.27 && Math.abs(pz) < 0.60) sights.short.push((Math.abs(px) - 1.27) * F);
      else continue;
      sightCount++; sightWho = (o.name || 'unnamed disc') + ' @ nose+' + ((Math.abs(pz) > 0.63 ? Math.abs(pz) - 0.63 : Math.abs(px) - 1.27) * F).toFixed(2);
    }
    out.sights = { n_long: sights.long.length, n_short: sights.short.length, count: sightCount, si01: 'REMOVED (owner ruling B, 2026-09-04)' };
    // ---- GATE-6 (corners): the ring vs the re-run letters ----
    let g6c = -1, g6cwho = '';
    for (const o of meshes) {
      if (!/^cn8r82-ring-\\d+$/.test(o.name || '')) continue;
      // the ring carries its letters at userData.cn8Fillet (rev-8.2 carrier); older
      // carriers at the root — either way O_f (ofx, ofz) and the datum c. The D3 loft
      // (userData.cn8D3) carries neither: its constructor stands on the MFR nose rectangle,
      // so O_f is that corner plus c, in the quadrant of the ring's fixed identity (ruling
      // a34fdcc4; before, every D3 corner was skipped and the corner half judged nothing)
      const ud = (o.userData && o.userData.cn8Fillet) || o.userData || {};
      let ofx = ud.ofx, ofz = ud.ofz;
      if ((typeof ofx !== 'number' || typeof ofz !== 'number') && o.userData && o.userData.cn8D3) {
        const id = CORNER_IDS && CORNER_IDS.find(([n]) => o.name === 'cn8r82-ring-' + n);
        if (id && K.MFR_LH > 0 && K.MFR_WH > 0) { ofx = id[1] * (K.MFR_LH + K.CC); ofz = id[2] * (K.MFR_WH + K.CC); }
      }
      if (typeof ofx !== 'number' || typeof ofz !== 'number' || !ofx || !ofz) {
        out.corners.push({ name: o.name, not_judged: o.userData && o.userData.cn8D3 ? 'a D3 ring with no identity or no MFR datum' : 'no O_f in userData' });
        continue;
      }
      const C = (ud.r82 && ud.r82.C) || K.CC; const sx = Math.sign(ofx), sz = Math.sign(ofz);
      const Lh = Math.abs(ofx) - C, Wh = Math.abs(ofz) - C;
      const v = W3(o); let rDiag = -1, reachX = -1e9, reachZ = -1e9, minPx = 1e9, minPy = 1e9;
      for (let i = 0; i < v.length; i += 3) {
        const px = sx * v[i] - Lh, py = sz * v[i + 2] - Wh;
        const dx = px - C, dy = py - C; const r = Math.hypot(dx, dy); const psi = Math.abs(45 - Math.atan2(dy, dx) * 180 / Math.PI);
        if (psi <= 10 && r > rDiag) rDiag = r;
        if (px > reachX) reachX = px; if (py > reachZ) reachZ = py;
        if (px < minPx) minPx = px; if (py < minPy) minPy = py;
      }
      // BUILD-2 condition 2: the row judges the FOOTPRINT (every vertex, any height) —
      // the per-height sections on the diagonal are read and printed, not judged
      // (the outer roll-over sits inside the footprint by the sheet's own profile)
      const sections = {};
      { const tri = T3(o);
        for (const [hn, hv] of [['bed+20', 0.020], ['nose', K.HNOSE], ['cap-1', K.LP06 - 0.001]]) {
          let rmax = -1;
          for (let b = 0; b < tri.length; b += 9) {
            const P = [[tri[b], tri[b + 1], tri[b + 2]], [tri[b + 3], tri[b + 4], tri[b + 5]], [tri[b + 6], tri[b + 7], tri[b + 8]]];
            for (let e = 0; e < 3; e++) { const a = P[e], c = P[(e + 1) % 3]; if ((a[1] - hv) * (c[1] - hv) < 0) {
              const s = (hv - a[1]) / (c[1] - a[1]); const wx = a[0] + s * (c[0] - a[0]), wz = a[2] + s * (c[2] - a[2]);
              const qx = sx * wx - Lh, qy = sz * wz - Wh; const dq = Math.hypot(qx - C, qy - C); const ps = Math.abs(45 - Math.atan2(qy - C, qx - C) * 180 / Math.PI);
              if (ps <= 10 && dq > rmax) rmax = dq; } }
          }
          sections[hn] = rmax < 0 ? null : +(rmax * F).toFixed(2);
        } }
      const Rout = K.CR + K.CWL;
      const dR = Math.abs(rDiag - Rout) * F, dAx = Math.abs(reachX - K.CAR) * F, dAz = Math.abs(reachZ - K.CAR) * F, dCx = Math.abs(minPx - K.CYCUT) * F, dCy = Math.abs(minPy - K.CYCUT) * F;
      const worst = Math.max(dR, dAx, dAz, dCx, dCy);
      out.corners.push({ name: o.name, r_out_diag_mm: +(rDiag * F).toFixed(2), sections_r_diag_mm: sections, reach_x_mm: +(reachX * F).toFixed(2), reach_z_mm: +(reachZ * F).toFixed(2), arm_end_x_mm: +(minPx * F).toFixed(2), arm_end_z_mm: +(minPy * F).toFixed(2), dev_r: +dR.toFixed(2), dev_window: +Math.max(dAx, dAz).toFixed(2), dev_cut: +Math.max(dCx, dCy).toFixed(2), worst: +worst.toFixed(2) });
      if (worst > g6c) { g6c = worst; g6cwho = o.name + (dR >= dAx && dR >= dAz && dR >= dCx && dR >= dCy ? ' outer radius' : (Math.max(dAx, dAz) >= Math.max(dCx, dCy) ? ' window reach' : ' arm end vs y_cut')); }
    }
    if (!out.corners.length) return JSON.stringify({ refuse: 'no cn8r82-ring-* corner ring found' });
    // fail closed (ruling a34fdcc4): a corner whose inputs are missing reads NOT JUDGED and counts red; no sentinel passes
    { const nj = out.corners.filter((c) => c.not_judged);
      if (nj.length || out.corners.length !== 4 || g6c < 0) {
        g6c = 999; g6cwho = 'NOT JUDGED: ' + (nj.map((c) => c.name + ' (' + c.not_judged + ')').join('; ') || out.corners.length + '/4 corner rings measured');
      } }
    // ---- the bed-side fans: midmouth-void and midmouth-beam ----
    const cands = meshes.filter((o) => touchesMid(o)).map((o) => { const v = W3(o); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < v.length; i += 3) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1]); z0 = Math.min(z0, v[i + 2]); z1 = Math.max(z1, v[i + 2]); } return { o, scx: (x0 + x1) / 2, scy: (y0 + y1) / 2, scz: (z0 + z1) / 2, sr: Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 }; });
    let lastTri = -1;
    const rayTris = (arr, ro, rd, best) => {
      lastTri = -1;
      for (let b = 0; b < arr.length; b += 9) {
        const ax = arr[b], ay = arr[b + 1], az = arr[b + 2];
        const e1x = arr[b + 3] - ax, e1y = arr[b + 4] - ay, e1z = arr[b + 5] - az, e2x = arr[b + 6] - ax, e2y = arr[b + 7] - ay, e2z = arr[b + 8] - az;
        const px = rd[1] * e2z - rd[2] * e2y, py = rd[2] * e2x - rd[0] * e2z, pz = rd[0] * e2y - rd[1] * e2x;
        const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det; const tx = ro[0] - ax, ty = ro[1] - ay, tz = ro[2] - az;
        const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const vv = (rd[0] * qx + rd[1] * qy + rd[2] * qz) * inv; if (vv < 0 || u + vv > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv; if (tt > 1e-6 && tt < best) { best = tt; lastTri = b / 9; }
      }
      return best;
    };
    const castFirst = (ro, tgt) => {
      const len = Math.hypot(tgt[0] - ro[0], tgt[1] - ro[1], tgt[2] - ro[2]);
      const rd = [(tgt[0] - ro[0]) / len, (tgt[1] - ro[1]) / len, (tgt[2] - ro[2]) / len];
      const order = [];
      for (const c of cands) { const ox = c.scx - ro[0], oy = c.scy - ro[1], oz = c.scz - ro[2]; const tca = ox * rd[0] + oy * rd[1] + oz * rd[2]; const d2 = ox * ox + oy * oy + oz * oz - tca * tca; if (d2 > c.sr * c.sr && tca > 0) continue; if (tca < -c.sr) continue; order.push([Math.max(0, tca - c.sr), c]); }
      order.sort((a, b) => a[0] - b[0]);
      let best = Infinity; let bo = null; let btri = -1;
      for (const [tmin, c] of order) { if (tmin > best) break; const t = rayTris(T3(c.o), ro, rd, best); if (t < best) { best = t; bo = c.o; btri = lastTri; } }
      if (!bo) return null;
      return { o: bo, tri: btri, p: [ro[0] + rd[0] * best, ro[1] + rd[1] * best, ro[2] + rd[2] * best] };
    };
    // the material a hit triangle wears (material arrays follow the geometry's
    // groups; a single material covers every face)
    const matOf = (o, tri) => {
      const m = o.material;
      if (!Array.isArray(m)) return m;
      const g = o.geometry; const first = tri * 3;
      for (const gr of g.groups || []) { if (first >= gr.start && first < gr.start + gr.count) return m[gr.materialIndex] || m[0]; }
      return m[0];
    };
    const isFrameInner = (o, tri) => { const m = matOf(o, tri); return !!(m && m.name === 'cn8-frame-inner'); };
    const isKnit = (o) => /^cn8-net(-|$)/.test(o.name || '') && !/^cn8-net-liner-/.test(o.name || '');
    const VOID_EYES = ${JSON.stringify(VOID_EYES)}; const STEP = ${VOID_STEP};
    const HOLE_R = ${HOLE_R}, HOLE_C = ${HOLE_C};
    // the bag footprint (r14: the JOY bag, see BAG in the gate)
    const BAG = ${JSON.stringify(BAG)}; const bagSection = ${bagSection.toString()};
    const inBag = (uh, v, wh) => { const sec = bagSection(BAG, v); return !!sec && Math.abs(uh) <= sec.a + BAG.REACH && wh >= sec.near - BAG.REACH; };
    // r14 (GH-1146, ruling 22cf7661 item 3): the JOY net is open, so a ray may meet a beam THROUGH the bag: that is the
    // bag seen, not the R1-FIX10 defect (the beam's lit band in the mouth with nothing in front of it). A beam hit
    // counts only when the ray reaches it without crossing the bag's envelope: the surface the cords are woven on,
    // rebuilt from each net's own cord centre lines (geometry.userData.cn8Yarn: the first strands / 2 cords run one
    // way, each courses * 4 + 1 rings of sides vertices plus two cap centres; a ring's mean is its centre point). A
    // sheet bag (no cn8Yarn) is its own envelope, and no first hit lies behind it, so a sheet tree's count is unchanged.
    const segmentCrosses = ${segmentCrosses.toString()};
    const buildEnvelope = (list) => {
      const envelope = [];
      for (const o of list) {
        const yarn = o.geometry.userData && o.geometry.userData.cn8Yarn;
        if (!yarn) { envelope.push(T3(o)); continue; }
        const n = yarn.strands / 2, steps = yarn.courses * 4, sides = yarn.sides, wv = W3(o);
        if (!Number.isInteger(n) || n < 3 || !Number.isInteger(steps) || !(sides > 2) || !Array.isArray(yarn.cords) || yarn.cords.length < n
          || yarn.cords.slice(0, n).some((c) => c.vertices !== (steps + 1) * sides + 2)) {
          return { refuse: 'midmouth-beam: ' + o.name + ' cn8Yarn is not ' + n + ' strands of ' + (steps + 1) + ' rings of ' + sides };
        }
        const ctr = (s, k) => { const c = yarn.cords[s]; const p = [0, 0, 0]; for (let j = 0; j < sides; j++) { const i = 3 * (c.firstVertex + k * sides + j); p[0] += wv[i]; p[1] += wv[i + 1]; p[2] += wv[i + 2]; } return [p[0] / sides, p[1] / sides, p[2] / sides]; };
        const grid = []; for (let s = 0; s < n; s++) { const row = []; for (let k = 0; k <= steps; k++) row.push(ctr(s, k)); grid.push(row); }
        const arr = new Float64Array(n * steps * 18); let q = 0;
        for (let s = 0; s < n; s++) for (let k = 0; k < steps; k++) {
          const s1 = (s + 1) % n;
          for (const P of [grid[s][k], grid[s1][k], grid[s1][k + 1], grid[s][k], grid[s1][k + 1], grid[s][k + 1]]) { arr[q++] = P[0]; arr[q++] = P[1]; arr[q++] = P[2]; }
        }
        envelope.push(arr);
      }
      return envelope;
    };
    const envelope = buildEnvelope(meshes.filter((o) => isKnit(o) && touchesMid(o)));
    if (envelope.refuse) return JSON.stringify({ refuse: envelope.refuse });
    // the net-hide arm: the envelope of the middle nets it hid, so the census can name the beam rays newly exposed
    const hiddenNets = NET_HIDDEN ? NET_HID : [];
    const hiddenEnvelope = NET_HIDDEN ? buildEnvelope(hiddenNets) : [];
    if (hiddenEnvelope.refuse) return JSON.stringify({ refuse: hiddenEnvelope.refuse });
    const crossesBag = (ro, rd, tHit) => segmentCrosses(envelope, ro, rd, tHit);
    let beamExposed = 0;
    const VOID_U = K.DT09, VOID_WMIN = K.DT03 - HOLE_R, VOID_WMAX = K.LP04;
    let voidSpan = 0, beamDisc = 0; const voidStats = [], beamStats = [];
    for (const mo of mouths) {
      const szn = Math.sign(mo.z);
      for (const eye of VOID_EYES) {
        const ro = [eye.at[0], eye.at[1], szn * Math.abs(eye.at[2])];
        let vTotal = 0, vLanded = 0, kIn = 0, kOut = 0; const names = {}; const spanAt = [];
        for (let u = -VOID_U; u <= VOID_U + 1e-9; u += STEP) for (let w = VOID_WMIN; w <= VOID_WMAX + 1e-9; w += STEP) {
          vTotal++; const h = castFirst(ro, [mo.x + u, 0, szn * (NOSE + w)]); if (!h) continue; vLanded++;
          const nm = h.o.name || '(anon)'; names[nm] = (names[nm] || 0) + 1;
          if (!isKnit(h.o)) continue;
          const uh = h.p[0] - mo.x, wh = szn * h.p[2] - NOSE;
          if (inBag(uh, h.p[1], wh)) { kIn++; continue; }
          kOut++; if (spanAt.length < 12) spanAt.push([nm, +(uh * F).toFixed(1), +(h.p[1] * F).toFixed(1), +(wh * F).toFixed(1)]);
        }
        voidSpan += kOut;
        voidStats.push({ eye: eye.name, mouth: szn > 0 ? '+z' : '-z', total: vTotal, landed: vLanded, knit_in: kIn, knit_out: kOut, firstNames: names, spanAt });
        let dTotal = 0, dLanded = 0, dHit = 0, dThrough = 0, dExposed = 0; const dAt = []; const dNames = {};
        for (let u = -HOLE_R; u <= HOLE_R + 1e-9; u += STEP) for (let w = HOLE_C - HOLE_R; w <= HOLE_C + HOLE_R + 1e-9; w += STEP) {
          if (Math.hypot(u, w - HOLE_C) > HOLE_R + 1e-9) continue;
          dTotal++; const h = castFirst(ro, [mo.x + u, 0, szn * (NOSE + w)]); if (!h) continue; dLanded++;
          const nm = h.o.name || '(anon)'; dNames[nm] = (dNames[nm] || 0) + 1;
          if (!/^cn8-beam-long-/.test(nm)) continue;
          // r12 re-statement: the row catches the beam's LIT EXTERIOR band seen
          // through the mouth (the R1-FIX10 defect); a dark frame-interior face
          // (material cn8-frame-inner) is the frame's inside, not a front wall
          if (isFrameInner(h.o, h.tri)) { dNames['(frame-inner) ' + nm] = (dNames['(frame-inner) ' + nm] || 0) + 1; continue; }
          const tHit = Math.hypot(h.p[0] - ro[0], h.p[1] - ro[1], h.p[2] - ro[2]);
          if (crossesBag(ro, [(h.p[0] - ro[0]) / tHit, (h.p[1] - ro[1]) / tHit, (h.p[2] - ro[2]) / tHit], tHit)) { dThrough++; continue; }
          dHit++;
          if (NET_HIDDEN && segmentCrosses(hiddenEnvelope, ro, [(h.p[0] - ro[0]) / tHit, (h.p[1] - ro[1]) / tHit, (h.p[2] - ro[2]) / tHit], tHit)) { beamExposed++; dExposed++; }
          if (dAt.length < 12) dAt.push([nm, +(u * F).toFixed(1), +(w * F).toFixed(1), +(h.p[1] * F).toFixed(1)]);
        }
        beamDisc += dHit;
        beamStats.push({ eye: eye.name, mouth: szn > 0 ? '+z' : '-z', total: dTotal, landed: dLanded, beam: dHit, through_bag: dThrough, exposed: NET_HIDDEN ? dExposed : null, firstNames: dNames, beamAt: dAt });
      }
    }
    return JSON.stringify({ ...out,
      gate1_plan_max_mm: +g1.toFixed(3), gate1_plan_who: g1who,
      gate2_fall_dev_mm: +g2.toFixed(3), gate2_fall_who: g2who,
      gate3_butt_mm: +g3.toFixed(3), gate3_butt_who: g3who,
      gate4_census_bad: g4, gate4_missing: g4missing, gate4_retired: g4retired,
      gate5_edge_dev_mm: +g5edge.toFixed(3), gate5_edge_who: g5who, gate5_stitch_dev_mm: +g5stitch.toFixed(3),
      gate5_count_err: g5count, gate5_dashes: g5dashes / 2, gate5_lobes: g5lobes / 2,
      gate6_mid_mm: +g6mid.toFixed(3), gate6_mid_who: g6who, gate6_corner_mm: +g6c.toFixed(3), gate6_corner_who: g6cwho,
      sight_count: sightCount, sight_who: sightWho,
      midext_sagitta_mm: +sag.toFixed(3),
      midext_arris_proud_mm: notJudged.arris.length ? 999 : +((proud - K.DT04) * F).toFixed(4), midext_arris_who: notJudged.arris.length ? 'NOT JUDGED: ' + notJudged.arris.join('; ') : proudWho,
      midext_cloth_bad: notJudged.cloth.length ? 999 : clothBad, midext_cloth_who: notJudged.cloth.length ? 'NOT JUDGED: ' + notJudged.cloth.join('; ') : clothWho,
      midext_window_proud_mm: notJudged.window.length ? 999 : +Math.max(-999, Math.round((winProud - K.DT04) * F * 1e4) / 1e4).toFixed(4), midext_window_who: notJudged.window.length ? 'NOT JUDGED: ' + notJudged.window.join('; ') : winWho,
      midext_sock_gap_mm: NET_HIDDEN ? null : +sockGap.toFixed(3), midext_sock_who: sockWho,
      midmouth_void_span: voidSpan, midmouth_void_stats: voidStats, midmouth_beam_hits: beamDisc, midmouth_beam_stats: beamStats,
      midmouth_beam_exposed: NET_HIDDEN ? beamExposed : null, hidden_nets: NET_HIDDEN ? hiddenNets.map((o) => o.name) : null });
  })()`));
  if (r12.refuse) throw refuse(`r12 census: ${r12.refuse}`);
  // ---- the mid_edgeon eye: knit above SK-04, the skirt tips ON SK-04 ----
  const midedge = { knit_above: 0, knit_below: 0, tips_mm: null, tips_who: '', stats: [] }; // null until a mouth is measured (ruling a34fdcc4)
  // the body-hide arm removes the midedge rows' subject (the skirt); those rows
  // are not what it arms (gate1 / gate4 / gate6 are), so the eye census is skipped
  for (const sgn of (PERTURB === 'body-hide' ? [] : [1, -1])) {
    const cp = { cam: [sgn * MIDEDGE_POSE.cam[0], MIDEDGE_POSE.cam[1], MIDEDGE_POSE.cam[2]],
      look: [sgn * MIDEDGE_POSE.look[0], MIDEDGE_POSE.look[1], MIDEDGE_POSE.look[2]], fov: MIDEDGE_POSE.fov };
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(cp)})`);
      if (!ok) await sleep(200);
    }
    if (!ok) throw refuse('midedge rows: the mid_edgeon pose was refused by the camera rig');
    await sleep(400);
    const r = JSON.parse(await chrome.eval(`(async () => {
      const THREE = await import('./vendor/three.module.min.js');
      const sc = window.__dbg.scene, cam = window.__dbg.camera; sc.updateMatrixWorld(true);
      const W = window.innerWidth, H = window.innerHeight;
      const SELV = ${KM.SK04}; const NOSEW = ${KM.DT02}; const BACKW = ${KM.LP04}; const BAY = ${KM.DT09};
      const c = new THREE.Vector3(0, SELV, ${sgn} * (NOSEW + BACKW)).project(cam);
      const cx = (c.x + 1) / 2 * W, cy = (1 - c.y) / 2 * H;
      const x0 = Math.max(0, Math.round(cx - ${MIDEDGE_BOX[0]})), x1 = Math.min(W, Math.round(cx + ${MIDEDGE_BOX[0]}));
      const y0 = Math.max(0, Math.round(cy - ${MIDEDGE_BOX[1]})), y1 = Math.min(H, Math.round(cy + ${MIDEDGE_BOX[1]}));
      const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
      const rc = new THREE.Raycaster(); rc.far = 10;
      const cls = (nm) => /^cn8-mid-leather-|^cn8cap-boot-/.test(nm) ? 1 : (/^cn8-net(-|$)/.test(nm) && !/^cn8-net-liner-/.test(nm)) ? 2 : 0;
      let nRays = 0, nHit = 0, nCover = 0, nKnit = 0, above = 0, below = 0; let knitTopV = -1e9; const names = {}; const aboveAt = [];
      for (let px = x0; px < x1; px += ${MIDEDGE_STEP[0]}) for (let py = y0; py < y1; py += ${MIDEDGE_STEP[1]}) {
        nRays++;
        rc.setFromCamera(new THREE.Vector2((px + 0.5) / W * 2 - 1, -((py + 0.5) / H * 2 - 1)), cam);
        const hs = rc.intersectObjects(sc.children, true).filter((h) => h.object.isMesh && vis(h.object));
        if (!hs.length) continue;
        nHit++; const nm = hs[0].object.name || '(anon)'; names[nm] = (names[nm] || 0) + 1;
        const k = cls(nm); const v = hs[0].point.y;
        if (k === 1) nCover++;
        if (k === 2) { nKnit++; if (v > knitTopV) knitTopV = v; if (v > SELV + 1e-5) { above++; if (aboveAt.length < 8) aboveAt.push([px, py, nm, +(v * 1000).toFixed(2)]); } else below++; }
      }
      let tipsV = 1e9; let tipsWho = ''; let subj = 0;
      sc.traverse((o) => {
        if (!o.isMesh || !o.geometry || !/^cn8-mid-leather-skirt-|^cn8cap-boot-/.test(o.name || '') || !vis(o)) return;
        const pos = o.geometry.attributes && o.geometry.attributes.position; if (!pos) return;
        const p = new THREE.Vector3(); let any = false;
        for (let i = 0; i < pos.count; i++) {
          p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          if (Math.abs(p.x) > BAY + 0.01 || Math.sign(p.z) !== ${sgn} || Math.abs(p.z) > 1.0) continue;
          any = true; if (p.y < tipsV) { tipsV = p.y; tipsWho = o.name; }
        }
        if (any) subj++;
      });
      if (nCover === 0 || nHit < nRays * 0.8 || !subj) return JSON.stringify({ refuse: 'cover px ' + nCover + ' landed ' + nHit + '/' + nRays + ' subjects ' + subj });
      return JSON.stringify({ W, H, box: [x0, y0, x1, y1], total: nRays, landed: nHit, cover: nCover, knit: nKnit, knit_above: above, knit_below: below, aboveAt,
        knit_top_mm: nKnit ? +(knitTopV * 1000).toFixed(2) : null, tips_vert_mm: +(tipsV * 1000).toFixed(3), tips_who: tipsWho, subjects: subj,
        firstNames: Object.fromEntries(Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 8)) });
    })()`));
    if (r.refuse) throw refuse(`midedge census (${sgn > 0 ? '+z' : '-z'} mouth): ${r.refuse}`);
    midedge.knit_above += r.knit_above; midedge.knit_below += r.knit_below;
    const off = Math.abs(r.tips_vert_mm - KM.SK04 * 1000);
    if (midedge.tips_mm === null || off > midedge.tips_mm) { midedge.tips_mm = off; midedge.tips_who = r.tips_who; }
    midedge.stats.push({ mouth: sgn > 0 ? '+z' : '-z', ...r });
  }
  // ---- the contract mirror: table.js CN8_MID == the JSON ----
  const CONTRACT_ROWS = {
    DT03: KM.DT03, DT05: KM.DT05, DT06: KM.DT06, DT09: KM.DT09, DT10: KM.DT10, DT11: KM.DT11, DT12: KM.DT12, DT13: KM.DT13,
    FL01: KM.FL01, FL02: KM.FL02, LP01: KM.LP01, LP02: KM.LP02, LP03: KM.LP03, LP04: KM.LP04, LP06: KM.LP06, LP09: KM.LP09,
    LP18: KM.LP18, CT03: KM.CT03, SK01: KM.SK01, SK04: KM.SK04, LP19: KM.LP19,
    'LP07[0]': KM.LP07[0], 'LP07[1]': KM.LP07[1], 'LP10[0]': KM.LP10[0], 'LP10[1]': KM.LP10[1], 'LP10[2]': KM.LP10[2],
    'LP11[0]': KM.LP11[0], 'LP11[1]': KM.LP11[1], LP12: KM.LP12,
    'LP05[0][1]': KM.LP05[0][1], 'LP05[1][1]': KM.LP05[1][1], 'LP05[2][1]': KM.LP05[2][1],
  };
  const contract = JSON.parse(await chrome.eval(`(async () => {
    const m = await import('/scene/table.js').catch((e) => ({ err: String(e) }));
    if (!m || m.err) return JSON.stringify({ refuse: 'cannot import /scene/table.js from the page: ' + (m && m.err) });
    if (!m.CN8_MID) return JSON.stringify({ refuse: 'web/scene/table.js no longer exports CN8_MID' });
    return JSON.stringify({ literals: m.CN8_MID });
  })()`));
  if (contract.refuse) throw refuse(`midext contract: ${contract.refuse}`);
  let cMax = 0; let cWho = 'none'; const cMissing = [];
  const pick = (obj, key) => key.split(/[\[\]]+/).filter(Boolean).reduce((a, k) => (a == null ? a : a[k]), obj);
  for (const [key, drawn] of Object.entries(CONTRACT_ROWS)) {
    const got = pick(contract.literals, key);
    if (typeof got !== 'number') { cMissing.push(key); continue; }
    const dev = Math.abs(got - drawn) * (key === 'LP12' || key === 'LP10[1]' || key === 'LP10[2]' ? 1 : 1000);
    if (dev > cMax) { cMax = dev; cWho = key; }
  }
  // a mirror that does not carry the r12 letters IS the maximal drift (the r11
  // plate mirror on the red-basis tree): the row fires, it does not refuse
  if (cMissing.length) { cMax = 999; cWho = 'missing ' + cMissing.join(','); }
  if (PERTURB) {
    const pe = new Error('perturbation run'); pe.obPerturb = { r12, midedge, dogear }; throw pe;
  }
  for (const s of r12.midmouth_void_stats) {
    if (s.landed < s.total * 0.8) throw refuse(`midmouth-void census: only ${s.landed}/${s.total} rays from ${s.eye} at the ${s.mouth} mouth met anything`);
    if (s.knit_in + s.knit_out === 0) throw refuse(`midmouth-void census: no knit first hit at all from ${s.eye} at the ${s.mouth} mouth (first hits ${JSON.stringify(s.firstNames)}) — the bag must be visible from both bed-side eyes`);
  }
  // the staged pot for the pass-2 trio (netball / bore / flank), as before
  const CX = 0.678; const CY = 1.318; const D = Math.SQRT1_2;
  await chrome.eval(`__test.layout([
    { id: 0, x: ${CX - 0.5 * D}, y: ${CY - 0.5 * D} },
    { id: 1, x: ${CX - 0.2 * D}, y: ${CY - 0.2 * D} },
  ])`);
  await sleep(300);
  const err = await chrome.eval(
    `__test.shoot({ v0: 1.9, phi: ${Math.PI / 4}, theta: 0, a: 0, b: -0.3 })`);
  if (err) throw new Error(`shoot rejected: ${err}`);
  for (let i = 0; i < 300; i++) {
    await sleep(200);
    const st = await chrome.eval('__test.state()');
    if (st === 'SETTLED' || st === 'AIM') break;
    if (i === 299) throw new Error('shot never settled');
  }
  const ev = JSON.parse(await chrome.eval(`JSON.stringify(
    __test.events().filter((e) => e.kind && e.kind.BallPocket))`));
  if (ev.length !== 1) throw new Error(`staging failed: ${ev.length} pots`);
  await chrome.eval(`(() => {
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
  })()`);
  await chrome.eval('__test.pause(true)');
  const tRest = ev[0].t + 2.2;
  const shot = async (poseName, file) => {
    const p = BASIS.poses[poseName];
    let ok = false;
    for (let i = 0; i < 25 && !ok; i++) {
      ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(p)})`);
      if (!ok) await sleep(200);
    }
    if (!ok) throw new Error('pose rejected');
    await chrome.eval(`__test.seek(${tRest})`);
    await chrome.eval('new Promise((r) => requestAnimationFrame('
      + '() => requestAnimationFrame(() => r(true))))');
    const fp = path.join(OUT, file);
    await chrome.screenshot(fp);
    return decodePng(fp);
  };
  // review pass2-r2 P2: the pocket EVENT does not prove the mesh renders
  // at tRest — assert the netted ball is a live visual (visible, posed
  // below the bed at the corner) straight off the scene graph, so a
  // sink/retention regression that hides the ball refuses instead of
  // zero-passing the chroma window.
  await chrome.eval(`__test.seek(${tRest})`);
  const ballLive = await chrome.eval(`(() => {
    let ok = false;
    window.__dbg.scene.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry'
        && o.visible) {
        const w = o.getWorldPosition(new (o.position.constructor)());
        if (w.y < -0.02 && w.y > -0.2
          && Math.abs(w.x - 1.2735) < 0.1
          && Math.abs(w.z - 0.6335) < 0.1) ok = true;
      }
    });
    return ok;
  })()`);
  if (ballLive !== true) {
    console.error('[pass2] REFUSE: netted ball mesh not a live visual '
      + 'at tRest (sink/retention regression)');
    process.exit(2);
  }
  const nb = await shot('netball', 'netball.png');
  const disc = JSON.parse(await chrome.eval(`(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const sc = window.__dbg.scene, cam = window.__dbg.camera; sc.updateMatrixWorld(true);
    let ball = null;
    sc.traverse((o) => {
      if (ball || !o.isMesh || !o.geometry || o.geometry.type !== 'SphereGeometry' || !o.visible) return;
      const w = o.getWorldPosition(new THREE.Vector3());
      if (w.y < -0.02 && w.y > -0.2 && Math.abs(w.x - 1.2735) < 0.1 && Math.abs(w.z - 0.6335) < 0.1) ball = { o, w };
    });
    if (!ball) return JSON.stringify({ refuse: 'no netted ball to project' });
    const W = window.innerWidth, H = window.innerHeight;
    const c = ball.w.clone().project(cam);
    const cx = (c.x + 1) / 2 * W, cy = (1 - c.y) / 2 * H;
    ball.o.geometry.computeBoundingSphere();
    const R = ball.o.geometry.boundingSphere.radius * ball.o.getWorldScale(new THREE.Vector3()).x;
    const edge = ball.w.clone().add(cam.up.clone().multiplyScalar(R)).project(cam);
    const r = Math.hypot((edge.x + 1) / 2 * W - cx, (1 - edge.y) / 2 * H - cy);
    return JSON.stringify({ cx, cy, r, world: [ball.w.x, ball.w.y, ball.w.z] });
  })()`));
  if (disc.refuse) throw refuse(`netball: ${disc.refuse}`);
  console.log(`[pass2] netball ball disc: centre (${disc.cx.toFixed(1)}, ${disc.cy.toFixed(1)}) r ${disc.r.toFixed(1)} px, world ${disc.world.map((q) => q.toFixed(4)).join(', ')}`);
  const bo = await shot('bore', 'bore.png');
  const fl = await shot('flank', 'flank.png');
  // #1149: first hits of the olive pixels, with the camera still at the flank pose; a pixel with no visible hit
  // counts as no subject (the windows sit on the table, so none is expected)
  const flankOlive = scanFlank(fl), flankHits = [];
  for (let k = 0; k < flankOlive.length; k += 1500) {
    flankHits.push(...JSON.parse(await chrome.eval(`(async () => {
      const THREE = await import('./vendor/three.module.min.js');
      const sc = window.__dbg.scene, cam = window.__dbg.camera; sc.updateMatrixWorld(true);
      const W = window.innerWidth, H = window.innerHeight;
      const vis = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
      const rc = new THREE.Raycaster(); rc.far = 10;
      return JSON.stringify(${JSON.stringify(flankOlive.slice(k, k + 1500))}.map(([x, y]) => {
        rc.setFromCamera(new THREE.Vector2((x + 0.5) / W * 2 - 1, -((y + 0.5) / H * 2 - 1)), cam);
        const h = rc.intersectObjects(sc.children, true).find((q) => q.object.isMesh && vis(q.object) && q.object.scale.x !== 0);
        return h ? (h.object.name || '(anon)') : null;
      }));
    })()`)));
  }
  const flankByFamily = {};
  for (const n of flankHits) {
    const fam = n === null ? '(no hit)' : n.replace(/-[0-9]+(?:-[ab])?$/, '');
    flankByFamily[fam] = (flankByFamily[fam] ?? 0) + 1;
  }
  measured = {
    netball_green_px: scanNetball(nb, disc),
    bore_hp: scanBore(bo),
    flank_olive_px: flankHits.filter((n) => n !== null && FLANK_SUBJECT.test(n)).length,
    flank_olive_all_px: flankOlive.length, flank_olive_by_family: flankByFamily,
    d3_dogear: dogear.bad.length ? null : dogear.count, d3_dogear_at: dogear.at, d3_dogear_bad: dogear.bad,
    gate1_plan_max_mm: r12.gate1_plan_max_mm, gate1_plan_who: r12.gate1_plan_who,
    gate2_fall_dev_mm: r12.gate2_fall_dev_mm, gate2_fall_who: r12.gate2_fall_who,
    gate3_butt_mm: r12.gate3_butt_mm, gate3_butt_who: r12.gate3_butt_who,
    gate4_census_bad: r12.gate4_census_bad, gate4_missing: r12.gate4_missing, gate4_retired: r12.gate4_retired,
    gate5_edge_dev_mm: r12.gate5_edge_dev_mm, gate5_edge_who: r12.gate5_edge_who,
    gate5_stitch_dev_mm: r12.gate5_stitch_dev_mm, gate5_count_err: r12.gate5_count_err,
    gate5_dashes: r12.gate5_dashes, gate5_lobes: r12.gate5_lobes,
    gate6_mid_mm: r12.gate6_mid_mm, gate6_mid_who: r12.gate6_mid_who,
    gate6_corner_mm: r12.gate6_corner_mm, gate6_corner_who: r12.gate6_corner_who,
    sight_count: r12.sight_count, sight_who: r12.sight_who, r12_sights: r12.sights,
    midext_sagitta_mm: r12.midext_sagitta_mm,
    midext_arris_proud_mm: r12.midext_arris_proud_mm, midext_arris_who: r12.midext_arris_who,
    midext_cloth_bad: r12.midext_cloth_bad, midext_cloth_who: r12.midext_cloth_who,
    midext_window_proud_mm: r12.midext_window_proud_mm, midext_window_who: r12.midext_window_who,
    midext_sock_gap_mm: r12.midext_sock_gap_mm, midext_sock_rise_mm: -r12.midext_sock_gap_mm,
    midext_sock_who: r12.midext_sock_who,
    midedge_knit_above_px: midedge.knit_above, midedge_knit_below_px: midedge.knit_below,
    midedge_tips_mm: midedge.tips_mm, midedge_tips_who: midedge.tips_who, midedge_stats: midedge.stats,
    midmouth_void_span: r12.midmouth_void_span, midmouth_void_stats: r12.midmouth_void_stats,
    midmouth_beam_hits: r12.midmouth_beam_hits, midmouth_beam_stats: r12.midmouth_beam_stats,
    midext_contract_max_mm: cMax, midext_contract_who: cWho, midext_contract_rows: Object.keys(CONTRACT_ROWS).length,
    r12_mouths: r12.mouths, r12_corners: r12.corners,
  };
} catch (e) {
  if (e && e.obRefusal) REFUSAL = e.obRefusal;
  else if (e && e.obPerturb) PERTURBED = e.obPerturb;
  else throw e;
} finally {
  const gone = await chrome.closeAndWait();
  if (gone === false) throw new Error('chrome teardown unconfirmed');
  await stopStaticServer(server);
  band.release();
}
if (REFUSAL) { console.error(REFUSAL); process.exit(2); }
if (PERTURBED) {
  const r = PERTURBED.r12; const me = PERTURBED.midedge; const de = PERTURBED.dogear;
  const m = { ...r, midext_sock_rise_mm: r.midext_sock_gap_mm === null ? null : -r.midext_sock_gap_mm, midedge_knit_above_px: me.knit_above, midedge_tips_mm: me.tips_mm, midedge_tips_who: me.tips_who,
    d3_dogear: de.bad.length ? null : de.count };
  // BUILD-3: the judge fails CLOSED on absent rows; a perturbation run measures only the D3 dog-ear census,
  // the r12 page + the mid_edgeon eye (the contract mirror and the pass-2 trio are not re-read),
  // so the arm is judged on the rows it captured — the expected rows must FIRE among them
  const present = new Set(Object.keys(m).filter((k) => Number.isFinite(m[k])));
  const rowKeys = new Map(); for (const [row, key] of ROWS) rowKeys.set(row, [...(rowKeys.get(row) || []), key]);
  const why = judge(m).filter((w) => { const keys = rowKeys.get(w.split(':')[0]); return !keys || keys.some((k) => present.has(k)); });
  const want = { 'sight-add': [/^rail-sights:/], 'knit-rise': [/^midedge-knit:/, /^midext-sockgap-rise:/], 'cover-lift': [/^midedge-tips:/, /^gate5-elev:/], 'body-hide': [/^gate1-plan:/, /^gate4-census:/, /^gate6-planlaw:/],
    dogear: [/^boot-tip-crack-dogear:/], 'net-shift': [/^midmouth-void:/], 'net-hide': [/^midmouth-beam:/],
    'ring-push': [/^gate6-planlaw: the corner plan relation deviates/] }[PERTURB];
  const fired = want.map((re) => why.some((w) => re.test(w)));
  // review b21 P2: the beam row is red on the baseline, so the net-hide arm also needs beam rays newly exposed
  if (PERTURB === 'net-hide' && !netHideArmed(r)) {
    console.error(`[perturb net-hide] NOT ARMED — hiding ${JSON.stringify(r.hidden_nets)} newly exposed ${r.midmouth_beam_exposed} beam rays (the baseline already reads ${r.midmouth_beam_hits} without them)`);
    process.exit(6);
  }
  console.log(`[perturb ${PERTURB}] rows fired: ${why.map((w) => w.split(':')[0]).join(', ') || 'none'}`);
  if (PERTURB === 'sight-add') console.log(`[perturb sight-add] sight_count ${r.sight_count} (${r.sight_who})`);
  if (PERTURB === 'knit-rise') console.log(`[perturb knit-rise] midedge_knit_above_px ${me.knit_above}, midext_sock_rise_mm ${(-r.midext_sock_gap_mm).toFixed(2)}`);
  if (PERTURB === 'cover-lift') console.log(`[perturb cover-lift] midedge_tips_mm ${Number(me.tips_mm).toFixed(3)} on ${me.tips_who}; gate5_edge_dev_mm ${r.gate5_edge_dev_mm}`);
  if (PERTURB === 'body-hide') console.log(`[perturb body-hide] gate1 ${r.gate1_plan_max_mm} (${r.gate1_plan_who}); gate4 ${r.gate4_census_bad} missing ${JSON.stringify(r.gate4_missing)}; gate6 ${r.gate6_mid_mm}`);
  if (PERTURB === 'dogear') console.log(`[perturb dogear] ${de.planted} ring(s) planted; d3_dogear ${de.count} at ${JSON.stringify(de.at)}`);
  if (PERTURB === 'net-shift') console.log(`[perturb net-shift] midmouth_void_span ${r.midmouth_void_span} (${r.midmouth_void_stats.map((st) => `${st.eye}@${st.mouth} in/out ${st.knit_in}/${st.knit_out}`).join(', ')})`);
  if (PERTURB === 'ring-push') console.log(`[perturb ring-push] gate6_corner_mm ${r.gate6_corner_mm} (${r.gate6_corner_who}); per corner ${JSON.stringify(r.corners.map((c) => [c.name, c.dev_r, c.dev_window, c.dev_cut, c.not_judged || '']))}`);
  if (PERTURB === 'net-hide') console.log(`[perturb net-hide] midmouth_beam_hits ${r.midmouth_beam_hits}, newly exposed ${r.midmouth_beam_exposed} (${r.midmouth_beam_stats.map((st) => `${st.eye}@${st.mouth} ${st.beam} / exposed ${st.exposed}`).join(', ')}); hidden ${JSON.stringify(r.hidden_nets)}`);
  if (!fired.every(Boolean)) {
    console.error(`[perturb ${PERTURB}] NOT ARMED — expected rows did not all fire (${want.map((re, i) => re.source.slice(1, -1) + (fired[i] ? ' ok' : ' MISSING')).join(', ')})`);
    process.exit(6);
  }
  console.log(`[perturb ${PERTURB}] ARMED — every expected row fires on the perturbed scene`);
  process.exit(0);
}
const P = (k, extra = '') => console.log(`[pass2] ${k} = ${typeof measured[k] === 'number' ? +measured[k].toFixed(4) : measured[k]} (${/_max$/.test(k + '_max') && W[k + '_max'] !== undefined ? 'max ' + W[k + '_max'] : 'min ' + W[k + '_min']}; red basis ${basisStr(k)})${extra}`);
P('netball_green_px'); P('bore_hp'); P('flank_olive_px');
P('d3_dogear', measured.d3_dogear_bad.length ? ` — no D3 loft layout on ${measured.d3_dogear_bad.join(', ')}` : ` — first at [ring, pair, station] ${JSON.stringify(measured.d3_dogear_at)}`);
P('gate1_plan_max_mm', ` — ${measured.gate1_plan_who}; per mouth/height: ${JSON.stringify(measured.r12_mouths.map((m) => [m.mouth, m.gate1]))}`);
P('gate2_fall_dev_mm', ` — ${measured.gate2_fall_who}; per mouth: ${JSON.stringify(measured.r12_mouths.map((m) => [m.mouth, m.gate2]))}`);
P('gate3_butt_mm', ` — ${measured.gate3_butt_who}; per mouth: ${JSON.stringify(measured.r12_mouths.map((m) => [m.mouth, m.gate3]))}`);
P('gate4_census_bad', ` — missing ${JSON.stringify(measured.gate4_missing)}, retired present ${JSON.stringify(measured.gate4_retired)}`);
P('gate5_edge_dev_mm', ` — ${measured.gate5_edge_who}; stitch dev ${measured.gate5_stitch_dev_mm} (max ${W.gate5_stitch_dev_mm_max}); dashes ${measured.gate5_dashes} / lobes ${measured.gate5_lobes} per middle, count error ${measured.gate5_count_err} (max ${W.gate5_count_err_max}); per mouth: ${JSON.stringify(measured.r12_mouths.map((m) => [m.mouth, m.gate5]))}`);
P('gate6_mid_mm', ` — ${measured.gate6_mid_who}; per mouth/height: ${JSON.stringify(measured.r12_mouths.map((m) => [m.mouth, m.gate6]))}`);
P('gate6_corner_mm', ` — ${measured.gate6_corner_who}; per corner (footprint judged; per-height diagonal sections informational): ${JSON.stringify(measured.r12_corners)}`);
P('sight_count', ` — ${measured.sight_who}; sights: ${JSON.stringify(measured.r12_sights)}`);
P('midext_sagitta_mm'); P('midext_arris_proud_mm', ` — ${measured.midext_arris_who}`); P('midext_cloth_bad', ` — ${measured.midext_cloth_who}`);
P('midext_window_proud_mm', ` — ${measured.midext_window_who}`); P('midext_sock_gap_mm', ` — ${measured.midext_sock_who}`); P('midext_sock_rise_mm');
P('midedge_knit_above_px', ` — per mouth: ${measured.midedge_stats.map((s) => `${s.mouth} ${s.landed}/${s.total}, cover ${s.cover}, knit ${s.knit_above}/${s.knit_below}, knit top ${s.knit_top_mm}`).join('; ')}`);
P('midedge_tips_mm', ` — ${measured.midedge_tips_who}`);
P('midmouth_void_span', ` — per eye/mouth [landed/total, knit in/out]: ${measured.midmouth_void_stats.map((s) => `${s.eye}@${s.mouth} ${s.landed}/${s.total} ${s.knit_in}/${s.knit_out}`).join(', ')}; first outside [name, u, v, w]: ${JSON.stringify(measured.midmouth_void_stats.flatMap((s) => s.spanAt.slice(0, 2)))}`);
P('midmouth_beam_hits', ` — per eye/mouth [beam, +through the bag, landed/total]: ${measured.midmouth_beam_stats.map((s) => `${s.eye}@${s.mouth} ${s.beam} +${s.through_bag}, ${s.landed}/${s.total}`).join(', ')}; first counted [name, u, w, v]: ${JSON.stringify(measured.midmouth_beam_stats.flatMap((s) => s.beamAt.slice(0, 2)))}`);
P('midext_contract_max_mm', ` — worst ${measured.midext_contract_who} of ${measured.midext_contract_rows} literals`);
if (MODE === 'measure') {
  const keep = {}; for (const [, k] of ROWS) keep[k] = measured[k];
  { const bad = ROWS.filter(([, k]) => !Number.isFinite(measured[k])); if (bad.length) { console.error(`[pass2] REFUSE: --measure cannot pin non-finite rows: ${bad.map(([r, k]) => r + '/' + k).join(', ')}`); process.exit(2); } }
  for (const k of ['gate1_plan_who', 'gate2_fall_who', 'gate3_butt_who', 'gate4_missing', 'gate4_retired', 'gate5_edge_who', 'gate5_stitch_dev_mm', 'gate5_count_err', 'gate5_dashes', 'gate5_lobes', 'gate6_mid_who', 'gate6_corner_mm', 'gate6_corner_who', 'midext_arris_who', 'midext_cloth_who', 'midext_window_who', 'midext_sock_who', 'midedge_tips_who', 'midext_contract_who', 'sight_who', 'r12_sights']) keep[k] = measured[k];
  writeFileSync(path.join(OUT, 'measured.json'), JSON.stringify(keep, null, 1));
  console.log(`[pass2] measured-json ${path.join(OUT, 'measured.json')}`);
  process.exit(0);
}
// BUILD-3 (review round 12 P2-b): SCHEMA + FINITENESS pass — every row's measurement must be
// present and finite before any window is judged; a missing or NaN value is a RED row, never a
// silent pass.  --drop-measure=<key> is the red arm: it deletes one measurement after the
// capture and this pass must fail (the battery asserts the non-zero exit).
const DROP = (args.find((a) => a.startsWith('--drop-measure=')) || '').split('=')[1] || null;
if (DROP) {
  if (!ROWS.some(([, k]) => k === DROP)) { console.error(`[pass2] --drop-measure: ${DROP} is not a row measurement`); process.exit(2); }
  delete measured[DROP];
  console.log(`[pass2] drop-measure arm: measurement ${DROP} deleted before the judge`);
}
const schemaBad = ROWS.filter(([, k]) => !Number.isFinite(measured[k]));
if (schemaBad.length) {
  for (const [row, k] of schemaBad) console.error(`[pass2] RED: schema — row ${row} has no finite measurement (${k} = ${String(measured[k])})`);
  process.exit(3);
}
const why = judge(measured);
if (why.length) {
  for (const w of why) console.error(`[pass2] RED: ${w}`);
  process.exit(3);
}
console.log(`[pass2] PASS — ${ROWS.length} rows green on the live tree (r12 body; red bases pinned in tools/render/fixtures/pass2-490-red-basis.json)`);
