// Copyright (c) Meta Platforms, Inc. and affiliates.

// redarm-a9-datum-488d.mjs — GH-488D wave A2.5 (A9) RED ARM for the
// re-datum'd rail-cap rows in web/tools/e2e-lighting.mjs.
//
// WHY THIS FILE EXISTS
//
// A9 moved three gate constants off a frozen literal and onto a derivation:
//
//   web/tools/e2e-lighting.mjs:1528  const SHELF = (G.render.frameTop ?? 0.047)
//                                      + (G.render.castingProud ?? 0.0005);
//   :2068  same, for the D1 pad sample line (SHELF + 0.006)
//   :2235  same, for the T6 landing-ring window (SHELF -0.5 / +1.5 mm)
//
// Re-datuming a gate is the single most suspicious edit anyone can make to
// one, because the lazy version of it is indistinguishable from the honest
// version in the pass/fail column: move the goalposts until the ball is
// inside and every red goes green. The only defence is to show that the
// re-datum'd rows are still FALSIFIABLE — that they are tight around the
// geometry they judge and would go red if that geometry were wrong.
//
// So this arm does NOT move the mesh. It moves the DATUM, which is the same
// thing seen from the other side (a row keyed to `crest - SHELF` cannot tell
// a part lifted by d from a shelf dropped by d) and is the perturbation that
// actually corresponds to the failure mode under test. For a ladder of
// offsets it re-applies each row's OWN law to each row's OWN live station
// and watches the verdict flip.
//
// LABELS — the c14-488d red-arm charter, verbatim in meaning:
//   RELEASED  the row's own margin FELL — the perturbation ate the slack.
//   ARMED     the row went RED — the gate judged the moved datum.
//   label = TEETH (both) | VANISHED (released only) | SCOPE-RED (armed only)
//         | NO-EFFECT (neither: the row is not keyed to this datum at all,
//           which for a re-datum'd row is the damning outcome).
//
// All three rows here are charter kind 'window': each carries a measured
// window in millimetres above the shelf, so the bar is PASS iff RELEASED and
// ARMED — the same bar c14-488d applies to its own window clauses.
//
// The stations are read from the LIVE mesh in the REAL app boot (never a
// proxy scene, never a dumped soup), using the same predicates the gate rows
// use, so the arm and the gate cannot drift into disagreeing about what they
// are looking at.
//
// Usage:
//   node tools/render/redarm-a9-datum-488d.mjs [--out DIR] [--json]
// Exit 0 iff every row scores TEETH; 3 if any row fails its charter bar;
// non-zero otherwise on boot/probe failure.
// Ports: OB_E2E_PORT/OB_E2E_CDP_PORT pin, else claims the 488d lane band.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const webDir = path.join(REPO, 'web');

const argv = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2)); // FIX10 (Fable pass 1): the run's view of the argv is the =-expanded view the parse consumed
const argOf = (k, d) => { const i = argv.lastIndexOf(k); return i >= 0 ? argv[i + 1] : d; };
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value

const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'redarm-a9-datum-488d', value: ['--out', '--outerland-mm'], bool: ['--json'] }); // --json is a switch (Fable pass 1 on FIX10)
const OUT = path.resolve(__P.value('--out') ?? '/tmp/ob-488d-a25/redarm-a9');
{ const { invalidatePrior } = await import('./lib/serve-check.mjs'); invalidatePrior([path.join(OUT, 'redarm-a9-488d.json')], 'redarm-a9-datum-488d'); } // FIX3 (P2 (a)): the prior red-arm verdict is removed as the first effect (refuter pass 3); FIX4: ahead of the shared-client import too
const cdp = await import(path.join(webDir, 'tools', 'cdp.mjs'));
const {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
} = cdp;
const JSON_ONLY = __P.has('--json'); // FIX10 (Fable pass 1): a switch, declared and read as one
// The gate's own T4b outer-edge landing reading, in mm above the shelf.
// Default is the value the canonical run reports; override to re-arm the
// row against a fresh gate log rather than a recorded one.
const OUTERLAND_MM = Number(argOf('--outerland-mm', '1.3'));
const TABLE = 'pool_pro_9ft';

// ---------------------------------------------------------------------------
// The three row laws, transcribed from the gate. Each `law` is the gate's own
// inequality with the shelf left free; each `station` is the millimetre height
// the gate reads for it. Keeping them as data (rather than prose) is what lets
// the arm print the exact expression it falsified.
// ---------------------------------------------------------------------------
const ROWS = [
  {
    id: 'flangeCrest',
    gate: 'e2e-lighting.mjs D1 form probe — collar crest above the shelf',
    law: '5.2 <= (crestY - SHELF)*1000 <= 6.3',
    window: [5.2, 6.3],
    source: 'arm',
    pick: 'crest',
    // margin = distance to the nearer wall of the window, in mm
    margin: (mm) => Math.min(mm - 5.2, 6.3 - mm),
    ok: (mm) => mm >= 5.2 && mm <= 6.3,
  },
  {
    id: 'outerLand',
    gate: 'e2e-lighting.mjs D1 form probe — outer edge lands low ON the casting',
    law: '(outerLandY - SHELF)*1000 <= 2.5',
    window: [null, 2.5],
    // GATE-SOURCED, not arm-measured, and the distinction is deliberate.
    // The arm's own vertex walk (kept below as a diagnostic) takes the
    // collar's maximum-radius ring, and on this mesh that ring is the
    // BURIED rebate — collarSection pushes it at SHELF-0.0035 / SHELF-0.0095
    // (scene/table.js:3092-3093) — so it reads about -4 mm and would arm
    // nothing. The landing face the gate judges is a different station, and
    // the only way for this arm to locate it independently would be to
    // transcribe the gate's profile-walk. A transcribed mirror is the exact
    // defect class this whole wave exists to kill, so the arm declines to
    // guess and takes the BASE from the gate's own T4b reading instead.
    // That is not circular: the arm is not re-deriving the measurement, it
    // is asking whether the row built on that measurement is falsifiable,
    // and datum sensitivity is -1 mm of height per +1 mm of shelf whatever
    // the station turns out to be.
    source: 'gate',
    pick: null,
    margin: (mm) => 2.5 - mm,
    ok: (mm) => mm <= 2.5,
  },
  {
    id: 'ringWindow',
    gate: 'e2e-lighting.mjs:2247 T6 landing-ring acceptance window',
    law: 'SHELF - 0.0005 < ringY < SHELF + 0.0015   (i.e. -0.5 < mm < +1.5)',
    window: [-0.5, 1.5],
    source: 'arm',
    pick: 'ring',
    margin: (mm) => Math.min(mm - -0.5, 1.5 - mm),
    ok: (mm) => mm > -0.5 && mm < 1.5,
  },
];

// offsets in mm applied to the DATUM (positive = shelf raised)
const LADDER = [-3.3, -2.0, -1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0, 3.3];

// ---------------------------------------------------------------------------
// Live station probe. Runs in the page, against the same mesh the gate judges.
// ---------------------------------------------------------------------------
const PROBE = `(async () => {
  const THREE = await import('./vendor/three.module.min.js');
  const { makeGeom, activeTableId } = await import('./scene/table.js');
  const id = activeTableId();
  const G = makeGeom(id);
  const scene = window.__dbg.scene;
  scene.updateMatrixWorld(true);
  const table = scene.getObjectByName('obTable');
  // the corner pocket the D1 register is shot on (foot-right)
  const p = G.pockets.filter((q) => q.corner)
    .sort((a, b) => Math.hypot(a.x - 1.295, a.z - 0.66)
      - Math.hypot(b.x - 1.295, b.z - 0.66))[0];
  const near = (o) => {
    const b = new THREE.Box3().setFromObject(o);
    const c = b.getCenter(new THREE.Vector3());
    return { b, c, d: Math.hypot(c.x - p.x, c.z - p.z) };
  };
  let crestY = null, outerTopY = null, ringY = null, ringName = '';
  let collarName = '', collarObj = null;
  table.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const { b, c, d } = near(o);
    if (d > 0.22) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mat) return;
    // T6 landing ring: transparent MeshBasicMaterial carrying a map, sitting
    // in the casting band. Same predicate the gate row uses.
    if (mat.transparent && mat.isMeshBasicMaterial && mat.map) {
      if (b.max.y > 0.040 && b.max.y < 0.060
        && (ringY === null || b.max.y > ringY)) {
        ringY = b.max.y; ringName = o.name || '';
      }
      return;
    }
    // the collar: the boot-top leather edging, linerRimMat/collarMat identity
    // 0x161617. Two meshes carry that colour — the in-throat rim torus (tops
    // at -0.009) and the proud collar (crests near shelf + 6 mm) — so the
    // height filter below picks the collar and excludes the torus, which is
    // the same separation the gate's own class law makes.
    const hex = mat.color && mat.color.getHex ? mat.color.getHex() : null;
    if (hex === 0x161617 && b.max.y > 0.040 && b.max.y < 0.075) {
      if (crestY === null || b.max.y > crestY) {
        crestY = b.max.y; collarName = o.name || ''; collarObj = o;
      }
    }
  });
  // OUTER LANDING, measured rather than guessed. The collar is an annulus:
  // its crest is the inner lip and its OUTER edge is where it lands on the
  // casting. Walking the object's own vertices in world space, take the ring
  // of vertices at the maximum radius from the pocket axis (within 0.2 mm)
  // and read the highest of them. That is the outer edge's top face, by
  // construction, with no sample box placed by eye anywhere in the chain.
  if (collarObj) {
    const pos = collarObj.geometry.getAttribute('position');
    const m = collarObj.matrixWorld.elements;
    const rs = [], ys = [];
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
      const wx = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
      const wy = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
      const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
      rs.push(Math.hypot(wx - p.x, wz - p.z)); ys.push(wy);
    }
    let rMax = -Infinity;
    for (const r of rs) if (r > rMax) rMax = r;
    for (let i = 0; i < rs.length; i++) {
      if (rs[i] >= rMax - 0.0002) {
        if (outerTopY === null || ys[i] > outerTopY) outerTopY = ys[i];
      }
    }
  }
  return JSON.stringify({
    id,
    frameTop: G.render.frameTop ?? null,
    castingProud: G.render.castingProud ?? null,
    shelf: (G.render.frameTop ?? 0.047) + (G.render.castingProud ?? 0.0005),
    legacyShelf: 0.047 + 0.0005,
    crestY, outerTopY, ringY, ringName, collarName,
    pocket: { x: p.x, z: p.z, r: p.r },
  });
})()`;

async function main() {
  let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
  let CDPP = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : null;
  let band = null;
  if (!PORT || !CDPP) {
    band = await claimPortBand(25190, 25219);
    PORT = band.http(0); CDPP = band.cdp(0);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawnStaticServer(webDir, PORT);
  await sleep(800);
  let chrome = null;
  let exitCode = 0;
  try {
    // REAL-USER boot per the GH-447 law: plain app.html, no query at all.
    // A9 is about the app-default entry, and pinning the table would let the
    // arm pass on a table the owner never sees. Note `cinema=1` is NOT
    // harmless here — it is a SCRIPTED boot and scripted boots pin
    // wpa_generic_9ft (SCRIPTED_PIN_TABLE_ID, scene/table.js:65), so the arm
    // would have measured the wrong table's rail cap entirely. The boot is
    // asserted below rather than assumed.
    const url = `http://127.0.0.1:${PORT}/app.html`;
    // tool:false is LOAD-BEARING, not tidiness. launchChrome defaults to
    // tool:true, which stamps obtool=1, which resolveBootTableId reads as a
    // SCRIPTED boot (scene/table.js:8057-8061) and pins wpa_generic_9ft. An
    // arm that silently measured the generic table's rail cap would have
    // "passed" about a table the owner never sees.
    chrome = await launchChrome(url,
      { port: CDPP, width: 1280, height: 800, tool: false });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) {
      await sleep(200);
      ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
    }
    if (!ready) throw new Error('app never became ready');
    await sleep(1200);

    const raw = await chrome.eval(PROBE);
    const S = JSON.parse(raw);
    if (S.id !== TABLE) {
      throw new Error(`real-user boot built ${S.id}, want the app default ${TABLE}`);
    }
    if (S.crestY === null || S.ringY === null) {
      throw new Error(`station probe incomplete: ${raw}`);
    }

    // stations in mm above the LIVE shelf
    const mmAt = (absY, shelf) => (absY - shelf) * 1000;
    const stations = { crest: S.crestY, outerTop: S.outerTopY, ring: S.ringY };

    const report = {
      table: S.id,
      frameTop: S.frameTop,
      castingProud: S.castingProud,
      shelfLive: S.shelf,
      shelfLegacy: S.legacyShelf,
      deltaMm: Math.round((S.shelf - S.legacyShelf) * 1e6) / 1000,
      outerLandSource: 'gate T4b reading (--outerland-mm)',
      collarMaxRadiusYDiagnostic: S.outerTopY,
      stationsAbsMm: Object.fromEntries(
        Object.entries(stations).map(([k, v]) => [k, Math.round(v * 1e6) / 1000])),
      meshNames: {
        collar: S.collarName, ring: S.ringName,
      },
      rows: [],
    };

    for (const row of ROWS) {
      const base = row.source === 'gate'
        ? OUTERLAND_MM
        : mmAt(stations[row.pick], S.shelf);
      const baseOk = row.ok(base);
      const baseMargin = row.margin(base);
      const ladder = LADDER.map((d) => {
        // raise the datum by d mm -> the station's height above it falls by d
        const mm = base - d;
        return {
          offsetMm: d,
          mm: Math.round(mm * 1000) / 1000,
          ok: row.ok(mm),
          margin: Math.round(row.margin(mm) * 1000) / 1000,
        };
      });
      const perturbed = ladder.filter((r) => r.offsetMm !== 0);
      const RELEASED = perturbed.some((r) => r.margin < baseMargin - 1e-9);
      const ARMED = perturbed.some((r) => !r.ok);
      const label = RELEASED && ARMED ? 'TEETH'
        : RELEASED ? 'VANISHED' : ARMED ? 'SCOPE-RED' : 'NO-EFFECT';
      // kind 'window' => PASS iff RELEASED and ARMED
      const pass = RELEASED && ARMED;
      // the tightest offset in each direction that reddens the row
      const redUp = perturbed.filter((r) => r.offsetMm > 0 && !r.ok)
        .sort((a, b) => a.offsetMm - b.offsetMm)[0] || null;
      const redDown = perturbed.filter((r) => r.offsetMm < 0 && !r.ok)
        .sort((a, b) => b.offsetMm - a.offsetMm)[0] || null;
      report.rows.push({
        id: row.id,
        source: row.source,
        gate: row.gate,
        law: row.law,
        kind: 'window',
        baseMm: Math.round(base * 1000) / 1000,
        baseOk,
        baseMarginMm: Math.round(baseMargin * 1000) / 1000,
        RELEASED,
        ARMED,
        label,
        pass,
        reddensAtPlusMm: redUp ? redUp.offsetMm : null,
        reddensAtMinusMm: redDown ? redDown.offsetMm : null,
        ladder,
      });
      if (!pass || !baseOk) exitCode = 3;
    }

    const file = path.join(OUT, 'redarm-a9-488d.json');
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);

    if (JSON_ONLY) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      const L = (s) => process.stdout.write(`${s}\n`);
      L(`[redarm-a9] table ${report.table}`);
      L(`[redarm-a9] frameTop ${report.frameTop} castingProud `
        + `${report.castingProud} -> shelf ${report.shelfLive} `
        + `(legacy ${report.shelfLegacy}, delta ${report.deltaMm} mm)`);
      L('');
      L('  row          src   base    win        RELEASED ARMED  label      reddens at');
      L('  ' + '-'.repeat(78));
      for (const r of report.rows) {
        const win = r.id === 'ringWindow' ? '-0.5..1.5'
          : r.id === 'flangeCrest' ? '5.2..6.3' : '<= 2.5';
        const red = [
          r.reddensAtMinusMm !== null ? `${r.reddensAtMinusMm}` : '—',
          r.reddensAtPlusMm !== null ? `+${r.reddensAtPlusMm}` : '—',
        ].join(' / ');
        L(`  ${r.id.padEnd(12)} ${r.source.padEnd(5)} ${String(r.baseMm).padStart(6)}  `
          + `${win.padEnd(10)} ${String(r.RELEASED).padEnd(8)} `
          + `${String(r.ARMED).padEnd(6)} ${r.label.padEnd(10)} ${red}`);
      }
      L('');
      L(`[redarm-a9] ${report.rows.filter((r) => r.pass).length}/`
        + `${report.rows.length} rows score TEETH -> `
        + `${exitCode === 0 ? 'PASS' : 'FAIL'}`);
      L(`[redarm-a9] wrote ${file}`);
    }
  } catch (e) {
    process.stderr.write(`[redarm-a9] ${e && e.stack ? e.stack : e}\n`);
    exitCode = exitCode || 1;
  } finally {
    if (chrome) chrome.close();
    stopStaticServer(server);
    if (band) band.release?.();
  }
  process.exit(exitCode);
}

await main();
