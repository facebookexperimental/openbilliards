// Copyright (c) Meta Platforms, Inc. and affiliates.

// sweep-626-containment.mjs — GH-626 containment sweep (PR #633 skeptic
// item 2): the numbers web/scene/pocket-geometry.md cites for the Predator
// closure ("worst landing plan offset over N admissible entries per family,
// K failures") are produced HERE, from the tree, by the REAL app — not by a
// hand-run instrument that nobody can re-run.
//
// What is swept. For each closure family (corner, side) a grid of pots into
// ONE pocket of that family:
//   approach azimuth ψ  about the pocket axis (corner: the diagonal; side:
//                       the inward normal), −40°..+40° in 5° steps (17)
//   aim error ε         the cue line rotated off the object-ball→pocket
//                       line, −3°..+3° in 0.5° steps (13). At the 0.30 m
//                       cue-to-object separation this cuts the object ball
//                       by up to ≈ ±16°, walking the entry across the whole
//                       mouth (and past it — those shots miss and drop out).
//   cue speed v0        1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0, 7.0,
//                       8.0 m/s (11): a soft pot up to break-class speed.
// = 2431 shots per family. The object ball stands 0.20 m from the pocket
// centre on the ψ ray and the cue ball 0.30 m behind it on the same ray.
// The kernel simulates every shot (real records, real BallPocket events);
// the app's own sink index (bindRests/restEntryFor) and poseSink present
// the drop — nothing is re-implemented here.
//
// admissible = the record carries exactly ONE BallPocket event, for the
// object ball, into the target pocket. A layout/shot the kernel refuses, a
// miss, a scratch or a double pot is not an entry into this closure.
// Per admissible entry, read at t0 + 0.9 s (past every touchdown):
//   landed   visible and centre within 1e-6 of the DERIVED seat: ySurface + r
//            when the bottom point lands on the plug face (offset >= rVent),
//            ySurface + sqrt(r² − (rVent − offset)²) when it lands inside the
//            plug's vent and the sphere seats on the vent rim (review r5 on
//            PR #633 — the face is an annulus, FT-PLUG-VENT)
//   offset   plan distance of the rest centre from the closure axis
//   failure  an admissible entry that did NOT land (culled or never there)
// Per family the report gives N admissible, landed, failures, the worst
// offset and the entry that produced it, the derived cone clearance at the
// LOWEST seat rSeat + taper·h − r·√(1+taper²) with h = sqrt(r² − rVent²)
// (conservative: a centred drop on the vent rim), the margin, how many
// rests keep the contact point on the plug (offset < rSupport) split into
// face (offset >= rVent) and vent rim (offset < rVent), and the largest
// vent sink below the flat datum.
//
//   node web/tools/sweep-626-containment.mjs [--quick]
//   writes output/gh626/containment-sweep.json (+ prints the table).
//   --quick thins the grid (ψ 10°, ε 1°, 5 speeds) for a smoke run.
//   Ports: OB_E2E_PORT / OB_E2E_CDP_PORT when pinned; otherwise the tool
//   claims its own band (OB_E2E_BAND_START/END, default 8730-8759 (below the CI reserved range, GH-687) —
//   outside every ci.yml band so it can run beside the gates).
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  claimPortBand, launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { treeLabel, treeStamp, treeStampEnd } from './provenance.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(webDir, '..', 'output', 'gh626');
mkdirSync(OUT, { recursive: true });
const quick = process.argv.includes('--quick');
// PROVENANCE (PR #633 round-3 skeptic): the JSON and the console table carry
// the sha (+ dirty flag) of the tree the numbers were read from, so a cited
// figure can be checked against the file that produced it.
const tree = treeStamp(path.resolve(webDir, '..'));
console.log(`${treeLabel(tree)} ${tree.sha ?? ''}${tree.note ? ` — ${tree.note}` : ''}`);

const pinned = process.env.OB_E2E_PORT !== undefined
  && process.env.OB_E2E_CDP_PORT !== undefined;
const band = pinned ? null : await claimPortBand(
  Number(process.env.OB_E2E_BAND_START ?? 8730),
  Number(process.env.OB_E2E_BAND_END ?? 8759));
const PORT = pinned ? Number(process.env.OB_E2E_PORT) : band.http(0);
const CDP = pinned ? Number(process.env.OB_E2E_CDP_PORT) : band.cdp(0);

const R = 0.028575; // FT-BALL 57.15 mm / 2 (render mirror; the gate's own)
const D_OB = 0.20;  // object ball: pocket-centre distance along the ψ ray
const D_CUE = 0.30; // cue ball: behind the object ball on the same ray
const T_READ = 0.9; // s past the pocket event: beyond every touchdown
const deg = (x) => x * Math.PI / 180;
const range = (a, b, step) => {
  const out = [];
  for (let k = 0; a + k * step <= b + 1e-9; k++) out.push(+(a + k * step).toFixed(6));
  return out;
};
const GRID = quick
  ? { psi: range(-40, 40, 10), eps: range(-3, 3, 1), v0: [1.0, 2.0, 3.0, 4.5, 6.0] }
  : { psi: range(-40, 40, 5), eps: range(-3, 3, 0.5),
    v0: [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0, 7.0, 8.0] };

const ready = async (chrome) => {
  for (let i = 0; i < 220; i++) {
    await sleep(200);
    if (await chrome.eval('window.__test?.ready === true').catch(() => false)) return;
  }
  throw new Error('app never became ready');
};

const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?table=predator_apex_9ft&cinema=1&seed=7`,
  { port: CDP });
const report = { tool: 'web/tools/sweep-626-containment.mjs', tree, quick, grid: GRID,
  dOb: D_OB, dCue: D_CUE, tRead: T_READ, families: {} };
try {
  await ready(chrome);
  await sleep(1500);
  const specs = JSON.parse(await chrome.eval(`(async () => {
    const m = await import('/scene/table.js');
    if (typeof m.sinkRestFor !== 'function') return 'null';
    const seen = new Map();
    for (let ix = -70; ix <= 70; ix++) {
      for (let iz = -36; iz <= 36; iz++) {
        const s = m.sinkRestFor(ix * 0.02, iz * 0.02);
        if (s) seen.set(s.x.toFixed(6) + ',' + s.z.toFixed(6), s);
      }
    }
    return JSON.stringify([...seen.values()]);
  })()`));
  if (!Array.isArray(specs) || specs.length !== 6) {
    throw new Error(`predator closures not published: ${JSON.stringify(specs)}`);
  }
  const corner = specs.filter((s) => Math.abs(s.x) > 0.1).find((s) => s.x > 0 && s.z > 0);
  const side = specs.filter((s) => Math.abs(s.x) <= 0.1).find((s) => s.z > 0);
  const D = Math.SQRT1_2;

  // one shot = one synchronous eval: lay, simulate, index, seek, read.
  // update() is parked (pause) so nothing advances between seek and read;
  // the read is a pure function of the record + clock (the gate's purity
  // rows already prove that).
  const shotEval = (cx, cy, ox, oy, v0, phi) => `(() => {
    __test.pause(true);
    __test.layout([{ id: 0, x: ${cx}, y: ${cy} }, { id: 1, x: ${ox}, y: ${oy} }]);
    const err = __test.shoot({ v0: ${v0}, phi: ${phi}, theta: 0, a: 0, b: 0 });
    if (err) return JSON.stringify({ err: String(err) });
    const ev = __test.events().filter((e) => e.kind && e.kind.BallPocket)
      .map((e) => ({ t: e.t, ...e.kind.BallPocket }));
    if (ev.length !== 1 || ev[0].ball !== 1) return JSON.stringify({ ev });
    __test.seek(ev[0].t + ${T_READ});
    const b = __test.balls().find((x) => x.id === 1);
    return JSON.stringify({ ev, pos: b.pos, visible: b.visible, pocketed: b.pocketed });
  })()`;

  for (const fam of [
    { name: 'corner', sp: corner, isCorner: true },
    { name: 'side', sp: side, isCorner: false },
  ]) {
    const sp = fam.sp;
    const kx = sp.z; const ky = sp.x; // kernel frame of the closure axis
    const ax = fam.isCorner ? Math.sign(kx) * D : Math.sign(kx);
    const ay = fam.isCorner ? Math.sign(ky) * D : 0;
    const a0 = Math.atan2(ay, ax); // the pocket axis, table -> pocket
    const yRest = sp.ySurface + R; // the flat datum (bottom point on the face)
    const rVent = sp.rVent > 0 ? sp.rVent : 0;
    const hMin = Math.sqrt(R * R - rVent * rVent); // centred on the vent rim
    // the derived seat under a rest pose's own plan (face or vent rim)
    const seatY = (x, z) => {
      const g = Math.max(0, rVent - Math.hypot(x - sp.x, z - sp.z));
      return sp.ySurface + Math.sqrt(R * R - g * g);
    };
    const lim = sp.rSeat + sp.taper * hMin - R * Math.hypot(1, sp.taper);
    const rayFor = (psi) => [Math.cos(a0 + deg(psi)), Math.sin(a0 + deg(psi))];
    const stage = (psi, eps, v0) => {
      const [ux, uy] = rayFor(psi);
      const ox = kx - D_OB * ux; const oy = ky - D_OB * uy;
      const cx = ox - D_CUE * ux; const cy = oy - D_CUE * uy;
      return shotEval(cx, cy, ox, oy, v0, Math.atan2(uy, ux) + deg(eps));
    };
    // the target pocket id comes from the straight probe, and the probe's
    // own rest must sit at this closure (a mapping check, not an assumption)
    const probe = JSON.parse(await chrome.eval(stage(0, 0, 2.0)));
    if (!probe.pos) throw new Error(`${fam.name}: probe did not pot: ${JSON.stringify(probe)}`);
    const target = probe.ev[0].pocket;
    const probeOff = Math.hypot(probe.pos[0] - sp.x, probe.pos[2] - sp.z);
    if (probeOff > 0.1) throw new Error(`${fam.name}: probe rested ${probeOff} m from the closure`);

    const f = { spec: sp, targetPocket: target, yRest, rVent_mm: rVent * 1000,
      ventSinkMax_mm: (R - hMin) * 1000, limit_mm: lim * 1000,
      shots: 0, refused: 0, inadmissible: 0, admissible: 0, landed: 0,
      failures: 0, onPlug: 0, onFace: 0, onRim: 0, worstSink: null,
      worst: null, failuresList: [], offsets_mm: [] };
    const t0 = Date.now();
    for (const v0 of GRID.v0) {
      for (const psi of GRID.psi) {
        for (const eps of GRID.eps) {
          f.shots += 1;
          const r = JSON.parse(await chrome.eval(stage(psi, eps, v0)));
          if (r.err) { f.refused += 1; continue; }
          if (!r.pos || r.ev[0].pocket !== target) { f.inadmissible += 1; continue; }
          f.admissible += 1;
          const landed = r.visible === true
            && Math.abs(r.pos[1] - seatY(r.pos[0], r.pos[2])) < 1e-6;
          if (!landed) {
            f.failures += 1;
            f.failuresList.push({ psi, eps, v0, pos: r.pos, visible: r.visible });
            continue;
          }
          f.landed += 1;
          const off = Math.hypot(r.pos[0] - sp.x, r.pos[2] - sp.z);
          f.offsets_mm.push(+(off * 1000).toFixed(3));
          if (off < sp.rSupport) {
            f.onPlug += 1;
            if (off < rVent) f.onRim += 1; else f.onFace += 1;
          }
          const sink = yRest - r.pos[1];
          if (!f.worstSink || sink > f.worstSink.sink_mm / 1000) {
            f.worstSink = { sink_mm: sink * 1000, offset_mm: off * 1000, psi, eps, v0 };
          }
          if (!f.worst || off > f.worst.offset) {
            f.worst = { offset: off, offset_mm: off * 1000, psi, eps, v0, pos: r.pos };
          }
        }
      }
      process.stdout.write(`  ${fam.name} v0=${v0}: ${f.admissible} admissible so far, `
        + `worst ${f.worst ? f.worst.offset_mm.toFixed(3) : '-'} mm, `
        + `${f.failures} failures (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
    }
    f.margin_mm = f.worst ? f.limit_mm - f.worst.offset_mm : null;
    f.offsets_mm.sort((a, b) => a - b);
    f.p50_mm = f.offsets_mm[Math.floor(f.offsets_mm.length / 2)] ?? null;
    f.p95_mm = f.offsets_mm[Math.floor(f.offsets_mm.length * 0.95)] ?? null;
    report.families[fam.name] = f;
  }
  await chrome.eval('__test.pause(false)');
} finally {
  const gone = await chrome.closeAndWait();
  if (gone === false) console.error('WARN: chrome teardown unconfirmed');
  await stopStaticServer(server);
  band?.release();
}

const out = path.join(OUT, `containment-sweep${quick ? '-quick' : ''}.json`);
report.treeEnd = treeStampEnd(tree, path.resolve(webDir, '..'));
if (report.treeEnd.treeChanged) console.error('WARN: the tree changed during this sweep — the table is NOT a read on one sha');
writeFileSync(out, JSON.stringify(report, null, 2));
console.log('\n| family | shots | admissible | landed | failures | worst plan offset | cone clearance | margin | contact on plug (face / vent rim) | max vent sink |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [name, f] of Object.entries(report.families)) {
  console.log(`| ${name} | ${f.shots} (${f.refused} refused) | ${f.admissible} | ${f.landed} | `
    + `${f.failures} | ${f.worst ? f.worst.offset_mm.toFixed(3) : '-'} mm `
    + `(ψ ${f.worst?.psi}°, ε ${f.worst?.eps}°, v0 ${f.worst?.v0}) | `
    + `${f.limit_mm.toFixed(3)} mm | ${f.margin_mm == null ? '-' : f.margin_mm.toFixed(3)} mm | `
    + `${f.onPlug}/${f.landed} (${f.onFace} / ${f.onRim}) | `
    + `${f.worstSink ? f.worstSink.sink_mm.toFixed(3) : '-'} mm |`);
}
console.log(`\n${treeLabel(tree)} ${tree.sha ?? ''} — written ${out}`);
const bad = Object.values(report.families).some((f) => f.failures > 0
  || f.admissible === 0 || (f.worst && f.worst.offset_mm >= f.limit_mm));
console.log(bad ? 'CONTAINMENT: FAIL' : 'CONTAINMENT: OK');
process.exit(bad ? 1 : 0);
