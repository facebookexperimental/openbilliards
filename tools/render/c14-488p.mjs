// Copyright (c) Meta Platforms, Inc. and affiliates.

// c14-488p.mjs — GH-488P (Predator Apex 9 ft) driver for gate C14,
// "section-curve disjointness". Wave P-A2 acceptance item 3.
//
// The LAW is not re-written here. tools/render/c14-disjoint.mjs is imported
// VERBATIM — the section walk, the crossing census, the 3D-depth and exit-arc
// adjudication, the five-level ladder (TOUCH / BASELINE / ADJUDICATE / WARN /
// FAIL) and the mouth-exposure law all come from that file untouched. What
// this driver supplies is the three things the law is parameterised by and
// cannot know on its own:
//
//   1. FAMILIES. The law's unit of "a surface" is a mesh name, and the shared
//      table builder names neither its meshes nor its materials. So each mesh
//      is classified (identical law to the two sibling 488p gates) and given
//      its class as its family name, and an unclassified mesh ABORTS the run
//      rather than being skipped (Iron Law 7).
//   2. THE BAY LADDER. The 489 lane's slice ladder is cut for its own table's
//      datum. This table's bay furniture spans Z −65.2 .. +47.6 about a bed
//      plane at 0, and the anchors are this table's construction heights.
//   3. THE BASELINE. Which coincidences are construction rather than defect,
//      each named, each bounded by MEASURED quantities so a real excursion
//      cannot pass as a joint.
//
// The cups, the nose corner and the jaw stations all come from
// gh488p-chains.mjs — the same drawn construction the letter gate is judged
// against, so C14 and the letter gate cannot disagree about where the jaw is.
//
// usage:
//   node tools/render/c14-488p.mjs --from-dump FILE [--judge]
//                                  [--perturb NAME] [--red-basis FILE]
//                                  [--out DIR]
//
// The dump is the runtime mesh, produced by
//   node tools/render/fullview-overlay-488p.mjs --save-dump FILE
// which owns the chrome ceremony for this lane. One extractor, three gates.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { c14Run, mouthExposure } from './c14-disjoint.mjs';
// FIX3 (review round 3 on #731 P2 (a), refuter pass 3): the destination is read from the raw command line and this tool's prior
// judge verdict under it is removed as the FIRST effect of the run — before any option guard, strict argv loop or --web check can refuse
// FIX8 (review round 8 on #731 P2 A): MODE-SCOPED through the shared resolver — `--red-basis FILE` owns only FILE (it exits before
// the report write), every other run (re)produces c14-488p.json; a red-basis run used to delete the C14 judge report
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'c14-488p', value: ['--out', '--from-dump', '--perturb', '--red-basis'], bool: ['--judge', '--verbose'] });
{ const { resolveMode: __rm0, invalidateForMode: __ifm0 } = await import('./lib/mode-outputs.mjs');
  const __o0 = __P.value('--out') ?? '/tmp/ob-c14-488p';
  const __mode0 = __rm0(__P.args, [['--red-basis', 'red-basis', 'value']], { defaultMode: 'report' });
  if (__mode0 === 'red-basis') { const __f0 = path.resolve(String(__P.value('--red-basis'))); __ifm0({ OUT: null, mode: __mode0, outputs: { 'red-basis': [__f0] }, tag: 'c14-488p' }); }
  else __ifm0({ OUT: path.resolve(String(__o0)), mode: __mode0, outputs: { report: ['c14-488p.json'] }, tag: 'c14-488p' }); }
import {
  SPEC, SPEC_PATH, SPEC_SHA256, cornerChain, fallAxes,
} from './gh488p-chains.mjs';

const args = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2)); // FIX10 (Fable pass 1): the run's view of the argv is the =-expanded view the parse consumed
const argOf = (k) => (args.includes(k) ? args[args.lastIndexOf(k) + 1] : null);
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value

const FROM_DUMP = __pathOpt('--from-dump', { tag: 'c14-488p', mustExist: 'file' });
const OUT = __pathOpt('--out', { tag: 'c14-488p' }) ?? '/tmp/ob-c14-488p';
const JUDGE = args.includes('--judge');
const PERTURB = __stringOpt('--perturb', { default: null, tag: 'c14-488p' }); // FIX2: a trailing / blank --perturb is refused, never read as the unperturbed run
const RED_BASIS = __stringOpt('--red-basis', { tag: 'c14-488p' });
const VERBOSE = args.includes('--verbose');
if (!FROM_DUMP) throw new Error('c14-488p: --from-dump FILE is required');
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// families
// ---------------------------------------------------------------------------
function classOf(m) {
  const n = m.name || '';
  if (/^obPdtPocketRimSeat/.test(n)) return 'rimseat';
  if (/^obPdtPocketRim/.test(n)) return 'rim';
  if (/^obPdtPocketWell/.test(n)) return 'well';
  if (/^obPdtPocketPlug/.test(n)) return 'plug';
  if (/^obPdtPocketVent/.test(n)) return 'vent';
  if (/^obPdtLegFoot/.test(n)) return 'foot';
  if (/^obPdtLeg/.test(n)) return 'leg';
  // wave A5-R2 replaced the single apron-underside diffuser ring
  // (obPdtLedCover) with eight leg-inboard emissive panels (obPdtLedPanel).
  // BOTH exact names are matched, and not a broad /^obPdtLed/ prefix: the
  // superseded name keeps pre-A5-R2 dumps judgeable so the census can be run
  // as a before/after control, while a future LED part under a THIRD name
  // still trips the unclassified abort instead of being silently absorbed.
  if (/^obPdtLed(Panel|Cover)/.test(n)) return 'led';
  if (/^obPdtFrame/.test(n)) return 'frame';
  const c = m.color;
  const [, y0, , , y1] = m.bb;
  if (c === '0a5498') return (y1 - y0) < 1e-6 ? 'bed' : 'cushion';
  if (c === '151515') return y0 < -0.10 ? 'apron' : 'rail';
  if (c === '9aa0a4') return 'sight';
  if (c === 'd9d4c4' || c === 'efe9d8') return 'spot';
  return 'other';
}

/** Every mesh must land in a named class. An unclassified mesh is not a mesh
 *  C14 may skip: a surface with no family is a surface no crossing can be
 *  attributed to, which is exactly how a defect hides from a census. */
function toFamilies(meshes) {
  const out = [];
  const bad = [];
  const tally = new Map();
  for (const m of meshes) {
    const cls = classOf(m);
    if (cls === 'other') { bad.push(m.name || `(anon ${m.color})`); continue; }
    tally.set(cls, (tally.get(cls) ?? 0) + 1);
    out.push({ name: cls, tris: m.tris });
  }
  if (bad.length) {
    console.error(`C14-488P: ${bad.length} unclassified mesh(es) — a census `
      + `cannot skip a surface: ${[...new Set(bad)].join(', ')}`);
    process.exit(4);
  }
  console.log(`[c14-488p] families: ${[...tally].sort()
    .map(([k, v]) => `${k}x${v}`).join(' ')}`);
  return out;
}

// ---------------------------------------------------------------------------
// the bay ladder
// ---------------------------------------------------------------------------
/** Z −68 .. +49 mm in 2.5 mm steps plus this table's construction anchors.
 *  Bounded below by the vent disc (the lowest bay surface, −65.2) and above
 *  by the sight decal (+47.6): outside that span there is no bay furniture to
 *  cross. The anchors are the heights where two surfaces are DESIGNED to meet
 *  — a ladder that steps over its own interfaces measures nothing. */
function slices488p() {
  const s = [];
  for (let y = -68; y <= 49 + 1e-9; y += 2.5) s.push(+y.toFixed(3));
  const anchors = [
    -65.2,   // vent disc
    -57.1,   // plug disc / well floor
    -22,     // rail + rim-seat casting bottom
    0,       // bed plane (cloth top)
    1,       // well top ring
    6,       // apron top
    SPEC.nose_h, // 36.290 cushion nose height — the ball-contact meridian
    34.5,    // rim-seat -> lip interface (r17: the lip's flat bottom face)
    39,      // the lip's inner edge at the bore (top of its bore wall)
    42.5,    // r7-r16 rim-seat -> rim interface: KEPT after the lip rebuild
             // moved it. An anchor is cheap and a station that used to carry
             // an interface is exactly where a stale solid would still be.
    44.2,    // cushion top
    47,      // rail top = rim top (the flush plane FT-POCKET-FAMILY asserts)
    47.6,    // sight decal
  ];
  for (const a of anchors) {
    if (!s.some((v) => Math.abs(v - a) < 1e-6)) s.push(+a.toFixed(3));
  }
  return s.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// the baseline: NONE
// ---------------------------------------------------------------------------
// This gate excuses nothing. That is a finding, not an omission, and the way
// it was reached is the point.
//
// r7-r16 carried one clause. It named a genuine limit of the law —
// intrusions() has no parity (shorter-arc rule, UNSIGNED 3D depth), so it
// cannot resolve two COINCIDENT walls, and this table has exactly one such
// pair by construction: the rim band, the rim-seat casting and the rail notch
// are all cut on ONE curve, F.CNR / F.SIR == bore + PDT_RIM_W, sampled by the
// same arcPts(..., 30) call. Identical polylines traversed in opposite
// directions cross wherever tessellation noise flips the sign of "inside".
// The clause excused a crossing that SAT ON that shared circle, within 0.6 mm.
//
// Two measurements retired it, both on the r17 bytes:
//
//   1. It is DEAD. With the clause active the live census reports BASELINE 0;
//      with the clause forced to return null the census is bit-identical
//      (FAIL 0 / WARN 204 / ADJUDICATE 2 / TOUCH 1094). It excuses nothing on
//      an honest mesh. The two surviving artifacts are ADJUDICATE, and the law
//      consults baseline() only for FAIL, so the clause could never have
//      reached them anyway.
//   2. It is GENEROUS TO REAL DEFECTS. Under `rail-shift-5mm` — the rail band
//      mis-registered 5 mm, an unambiguous defect — the clause downgraded 174
//      crossings. It had to: two circles of EQUAL radius offset by 5 mm
//      intersect at points that are still exactly one notch radius from each
//      centre, so "the crossing sits on the notch circle" is true of the
//      mis-registration just as it is of the coincident walls. The test did
//      not verify the premise its own text named.
//
// A clause that is dead when the model is honest and generous when it is not
// is worth strictly less than nothing, whatever colour it prints. Deleting it
// costs no green (measured above) and returns 174 crossings to the census.
// The coincident-wall artifact it was written for is now disclosed in the
// ledger as a measured ADJUDICATE pair rather than suppressed here.
const baseline488p = null;

// ---------------------------------------------------------------------------
// cups + the jaw stations for the mouth-exposure law
// ---------------------------------------------------------------------------
// Drawing frame (X across the width, Y along the length) -> three world:
// three.x = Y/1000, three.z = X/1000.
const AXES = fallAxes();
const cupsAll = AXES.map((a) => ({
  x: a.p[1] / 1000, z: a.p[0] / 1000, label: a.label, kind: a.kind,
}));
const cupsCorner = cupsAll.filter((c) => c.kind === 'corner');

// Jaw stations in the CORNER frame, measured inboard from the nose corner
// (635, 1270) along each axis, taken from the drawn chain rather than typed:
//   tip  = D1, the facing's outboard end at the cushion back plane — the
//          jaw-tip meridian, the end nearest the pocket;
//   tang = N1, where the fillet meets the straight nose line — past it the
//          cushion is plain rail and the wrap legitimately shows.
// Between them the cushion is the sole owner of the play-side surface, and
// only there is another family standing in the mouth a defect.
const K = cornerChain();
const JAW_TIP_MM = +(SPEC.half_len - K.d1[1]).toFixed(4);
const JAW_TANG_MM = +(SPEC.half_len - K.n1[1]).toFixed(4);
const NOSE_MM = { x: SPEC.half_len, z: SPEC.half_wid };

// ---------------------------------------------------------------------------
// perturbations (Iron Law 6 red arm)
// ---------------------------------------------------------------------------
// Each injects ONE stated defect into the family soup. A gate whose green has
// never been contradicted is a gate nobody has tested.
const mapFam = (F, names, f) => F.map((m) => (!names.has(m.name) ? m : {
  ...m,
  tris: (() => {
    const t = m.tris.slice();
    for (let i = 0; i + 2 < t.length; i += 3) {
      const p = f([t[i], t[i + 1], t[i + 2]]);
      t[i] = p[0]; t[i + 1] = p[1]; t[i + 2] = p[2];
    }
    return t;
  })(),
}));
// three world metres; the bay bisector points outboard on both axes.
const towardMouth = (p, d) => {
  const sx = Math.sign(p[0]) || 1;
  const sz = Math.sign(p[2]) || 1;
  return [p[0] - sx * d * Math.SQRT1_2, p[1], p[2] - sz * d * Math.SQRT1_2];
};
// A MIS-REGISTRATION: the family slides off its bore in the horizontal plane.
//
// This is the only defect KIND that can arm the casting stack, and the reason
// is worth stating because it is a real limit of the disjointness law, not a
// choice of taste. The rim, the seat, the well and the plug are coaxial
// surfaces of revolution sharing one bore axis. Move any of them ALONG that
// axis and every horizontal section stays a circle concentric with its
// neighbours' — and concentric circles never intersect. intrusions() carries
// no parity (shorter-arc rule, unsigned depth), so it reads such a stack as
// containment, never as a crossing, at any depth of interpenetration.
//
// Measured, not assumed: the three axial perturbations this replaced ran
// FAIL 0 at 8 mm, 8 mm and 40 mm, and `plug-up-40mm` returned a census
// byte-identical to the unperturbed one (204 WARN / 2 ADJ / 1094 TOUCH) —
// the law could not see a 40 mm displacement at all. Offsetting the same
// family sideways instead makes two equal-radius circles intersect at two
// points, which is exactly what the law is built to catch. The axial blind
// spot is disclosed in the ledger rather than papered over here.
const offBore = (p, d) => [p[0] + d, p[1], p[2]];

const PERTURBATIONS = {
  // the rim band creeps off its rebate into the pocket opening: the exposure
  // law and the rim x cushion census must both see it
  'rim-into-mouth-6mm': {
    note: 'rim band translated 6 mm along the bay bisector into the mouth',
    apply: (F) => mapFam(F, new Set(['rim']), (p) => towardMouth(p, 0.006)),
  },
  // the seat casting is bedded off its bore: its notch wall leaves the rail's
  'rimseat-offbore-6mm': {
    note: 'rim-seat casting mis-registered 6 mm off the bore axis',
    apply: (F) => mapFam(F, new Set(['rimseat']), (p) => offBore(p, 0.006)),
  },
  // the drop well hangs off-centre and its throat leaves the bed cut-out
  'well-offbore-6mm': {
    note: 'drop well mis-registered 6 mm off the bore axis',
    apply: (F) => mapFam(F, new Set(['well']), (p) => offBore(p, 0.006)),
  },
  // the bed cloth plane stands proud of the slate and lifts into the jaw
  //
  // This slot used to perturb the dampener plug, and could not: the plug and
  // the vent are FLAT DISCS (measured: every plug vertex at y = -57.1 mm,
  // every vent vertex at -65.2 mm). A horizontal-section law cannot section a
  // horizontal plane — no triangle ever crosses the slice — so those two
  // families emit no curve at any height and NO displacement of them, of any
  // size or direction, can move this gate. That is disclosed in the ledger as
  // a scope limit and left to A3, which owns dampener construction; it is not
  // repaired by inventing a bigger number here. The slot now arms `bed`,
  // which had no perturbation at all and is not coaxial with anything.
  'rail-shift-5mm': {
    note: 'rail band mis-registered 5 mm along the table length',
    apply: (F) => mapFam(F, new Set(['rail']), (p) => offBore(p, 0.005)),
  },
  // the cushion jaw pushes back into the casting it is supposed to meet
  'cushion-out-5mm': {
    note: 'cushion translated 5 mm outboard into the rail + casting',
    apply: (F) => mapFam(F, new Set(['cushion']), (p) => [
      p[0] + (Math.abs(p[0]) > 1.2 ? Math.sign(p[0]) * 0.005 : 0), p[1],
      p[2] + (Math.abs(p[2]) > 0.6 ? Math.sign(p[2]) * 0.005 : 0)]),
  },
  // the apron head rises through the rail band
  'apron-up-10mm': {
    note: 'apron raised 10 mm into the rail',
    apply: (F) => mapFam(F, new Set(['apron']),
      (p) => [p[0], p[1] + 0.010, p[2]]),
  },
};

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
const dumpBytes = readFileSync(FROM_DUMP);
const dumpSha = createHash('sha256').update(dumpBytes).digest('hex');
const meshes = JSON.parse(dumpBytes.toString('utf8')).meshes;
console.log(`[c14-488p] ${meshes.length} meshes from ${path.basename(FROM_DUMP)}`
  + ` @ ${dumpSha.slice(0, 12)}…`);
const FAM0 = toFamilies(meshes);
const SLICES = slices488p();

function runOnce(F) {
  const census = c14Run(F, cupsAll, {
    slices: SLICES,
    rRoiMm: 150,
    baseline: baseline488p,
  });
  // The exposure law is a CORNER-FLANK instrument: its two judged rectangles
  // recede from the cup along two different axes, which is the shape a corner
  // bay has and a side bay does not (both side flanks recede along the SAME
  // axis). Running it on a side cup would be contorting the law rather than
  // applying it, so the side bays are covered by the census above, by the
  // letter gate's SP-* letters, and by the full-view side-mouth bar. Stated,
  // not buried.
  //
  // ONE band, and only one. The law decides "play side" by ray-casting the
  // CLOTH: it needs the cushion's facing to say which side of the corridor the
  // ball runs on, and it fails CLOSED (noCloth) when the corridor carries no
  // cloth section. That makes it a law about the ball-contact height and
  // nothing else. A rim band was tried at Z 42.5..44 and withdrawn: the rim
  // only exists from 42.5 to 47, and by 42.5 the cushion's section has already
  // retreated to a sliver against the rail, so 12 of the 16 corridors carried
  // no cloth at all (the 4 that did read 0.00 mm). Judging a rail-top inlay
  // under "must not stand in the mouth" is a category error, and a law that
  // can only reach a quarter of its own stations is not a law — reporting it
  // green would have been the worse outcome of the two. The rim's mouth-side
  // edge is judged instead by FV488P-PLAN-EXCESS-MAX/AREA (both 0.00) and by
  // the letter gate's fall-clearance letters.
  const bands = [
    // the seat casting over the whole ball-contact height
    { wrap: 'rimseat', lo: 2, hi: 42, step: 2 },
  ];
  const exposure = bands.map((b) => {
    const sl = [];
    for (let y = b.lo; y <= b.hi + 1e-9; y += b.step) sl.push(+y.toFixed(3));
    const r = mouthExposure(F, cupsCorner, {
      slices: sl,
      informational: [],
      wrapName: b.wrap,
      clothName: 'cushion',
      tangencyMm: JAW_TANG_MM,
      tipMm: JAW_TIP_MM,
      noseMm: NOSE_MM,
      halfWidthMm: 30,
    });
    const noCloth = r.corners.reduce((n, c) =>
      n + c.slices.filter((s) => s.judged && s.noCloth).length, 0);
    return { wrap: b.wrap, band: [b.lo, b.hi], worst: r.worst,
      worstAt: r.worstAt, judged: r.judged, noCloth, corners: r.corners };
  });
  return { census, exposure };
}

let F = FAM0;
if (PERTURB) {
  const P = PERTURBATIONS[PERTURB];
  if (!P) throw new Error(`no perturbation ${PERTURB}`);
  console.log(`[c14-488p] PERTURBED: ${PERTURB} — ${P.note}`);
  F = P.apply(F);
}

const printCensus = (r) => {
  console.log(`census over ${r.census.slices} slices, 6 bays: `
    + `FAIL ${r.census.fails}  WARN ${r.census.warns}  `
    + `ADJUDICATE ${r.census.adjudicate}  BASELINE ${r.census.baseline}  `
    + `TOUCH ${r.census.touch}`);
  for (const c of r.census.corners) {
    const lbl = c.cup.label ?? `${c.cup.x},${c.cup.z}`;
    console.log(`  ${String(lbl).padEnd(15)} FAIL ${String(c.fails).padStart(3)}`
      + `  WARN ${String(c.warns).padStart(3)}`
      + `  ADJ ${String(c.adjudicate ?? 0).padStart(3)}`
      + `  BASE ${String(c.baseline ?? 0).padStart(4)}`
      + `  TOUCH ${String(c.touch ?? 0).padStart(4)}`);
  }
  for (const e of r.exposure) {
    console.log(`exposure ${e.wrap.padEnd(8)} band ${e.band[0]}..${e.band[1]} mm`
      + `  worst ${e.worst.toFixed(2)} mm`
      + `  judged ${e.judged} slices x 4 corners`
      + `  no-cloth ${e.noCloth}`
      + (e.worstAt ? `  at ${e.worstAt.corner} y=${e.worstAt.y}` : ''));
  }
};

// levels a FAIL-hunting red arm must be able to reach
const failCount = (r) => r.census.fails
  + r.exposure.reduce((n, e) => n + (e.worst > 0 ? 1 : 0) + e.noCloth, 0);

if (RED_BASIS) {
  const base = runOnce(FAM0);
  printCensus(base);
  const rows = [];
  for (const [name, P] of Object.entries(PERTURBATIONS)) {
    const r = runOnce(P.apply(FAM0));
    const row = {
      name,
      note: P.note,
      fails: r.census.fails,
      warns: r.census.warns,
      exposure: r.exposure.map((e) => ({ wrap: e.wrap, worst: e.worst,
        noCloth: e.noCloth })),
      fired: failCount(r) > failCount(base),
    };
    rows.push(row);
    console.log(`[red-basis] ${name.padEnd(20)} FAIL ${String(row.fails)
      .padStart(3)}  exposure ${row.exposure.map((e) => `${e.wrap}=${e.worst}`)
      .join(' ')}  ${row.fired ? 'FIRED' : 'silent'}`);
  }
  const silent = rows.filter((r) => !r.fired).map((r) => r.name);
  writeFileSync(RED_BASIS, `${JSON.stringify({
    tool: 'c14-488p.mjs', mode: 'red-basis', // FIX8: the mode beside the tool
    law: 'tools/render/c14-disjoint.mjs (reused verbatim)',
    spec: path.basename(SPEC_PATH),
    spec_sha256: SPEC_SHA256,
    mesh_dump_sha256: dumpSha,
    slices: SLICES.length,
    slice_span_mm: [SLICES[0], SLICES[SLICES.length - 1]],
    jaw_stations_mm: { tip: JAW_TIP_MM, tangency: JAW_TANG_MM },
    green_baseline: {
      fails: base.census.fails, warns: base.census.warns,
      adjudicate: base.census.adjudicate, baseline: base.census.baseline,
      touch: base.census.touch,
      exposure: base.exposure.map((e) => ({ wrap: e.wrap, band: e.band,
        worst: e.worst, noCloth: e.noCloth })),
    },
    perturbations: rows,
    silent,
  }, null, 2)}\n`);
  console.log(`[red-basis] ${rows.length} perturbations, ${silent.length} `
    + `silent -> ${RED_BASIS}`);
  if (silent.length) {
    console.error('C14-488P RED-BASIS: these perturbations did not move the '
      + `gate — its green is not evidence against them: ${silent.join(', ')}`);
    process.exit(3);
  }
  process.exit(0);
}

const res = runOnce(F);
printCensus(res);
if (VERBOSE) {
  for (const c of res.census.corners) {
    for (const s of c.slices) {
      for (const x of [...s.crossings, ...s.containments]) {
        console.log(`  y=${String(s.y).padStart(7)} ${c.cup.label} `
          + `${x.level.padEnd(10)} ${(x.a ?? x.own)} x ${(x.b ?? x.host)} `
          + `embed ${(x.embed ?? x.depth)} arc ${x.arc ?? '-'} `
          + `${x.why ?? ''}`);
      }
    }
  }
}
const report = {
  tool: 'c14-488p.mjs',
  law: 'tools/render/c14-disjoint.mjs (reused verbatim)',
  spec: path.basename(SPEC_PATH), spec_sha256: SPEC_SHA256,
  mesh_dump: path.basename(FROM_DUMP), mesh_dump_sha256: dumpSha,
  perturbation: PERTURB ?? null,
  slices: SLICES, jaw_stations_mm: { tip: JAW_TIP_MM, tangency: JAW_TANG_MM },
  census: res.census, exposure: res.exposure,
};
writeFileSync(path.join(OUT, 'c14-488p.json'),
  `${JSON.stringify(Object.assign({ tool: 'tools/render/c14-488p.mjs', mode: 'report' }, report), null, 2)}\n`); // FIX8: tool + mode first
console.log(`[c14-488p] report -> ${path.join(OUT, 'c14-488p.json')}`);

if (JUDGE) {
  const bad = [];
  if (res.census.fails) bad.push(`${res.census.fails} FAIL crossing(s)`);
  for (const e of res.exposure) {
    if (e.worst > 0) bad.push(`${e.wrap} mouth exposure ${e.worst} mm`);
    if (e.noCloth) bad.push(`${e.wrap} band: ${e.noCloth} no-cloth slice(s)`);
  }
  if (bad.length) {
    console.error(`C14-488P JUDGE: FAIL — ${bad.join('; ')}`);
    process.exit(3);
  }
  console.log('C14-488P JUDGE: PASS — no FAIL crossing in any gated section, '
    + 'mouth exposure 0.00 mm');
}
