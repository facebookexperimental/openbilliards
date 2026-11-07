// Copyright (c) Meta Platforms, Inc. and affiliates.

// GH-489 W8 drape-slump + sock-ply probe (gate r11 findings 2c + 3).
//
// The r11 verdict named the S1 bowl "machine-perfect radial" — the W8
// fix is a GEOMETRIC lateral tube slump (snkSockSlump: 0.24 R middle /
// 0.18 R corner, deterministic per pocket) plus multi-harmonic drape.
// Pixel statistics for the slump proved window-fragile (the 490
// box-instability law: proj-centre offsets conflate perspective depth;
// pale-centroid offsets read 0.206 rev-13 vs 0.230 W8 — no honest
// split), so the slump is probed at the GEOMETRY, where it is exact:
//   S1  sock rim-ring centroid offset from the cup axis, in units of
//       the ring attach radius R — rev-13 lathe: 0 (machine-radial);
//       W8: 0.22-0.24 (the slump smoothstep reaches ~0.96 at the rim).
//   S2  rim-ring radius angular spread (the multi-harmonic drape) —
//       rev-13: the single 3-theta ripple, sigma/R ~= 0.010 with a
//       pure 3-fold spectrum; W8: k = 1,2,3,5 mix.
//   S3  the middle gathered second ply (finding 3): an obPocketNet
//       mesh band at rv + 9 mm spanning y about [-0.105, -0.054]
//       behind the collar — absent on rev-13 (the band was a BLACK
//       obPocketShade cylinder).
// Red basis: run with --web <rev-13 tree>/web — S1 reads ~0, S3 absent.
//
//   node tools/render/probe-489-w8.mjs [--web <webDir>] [--out <json>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2)); // FIX10 (Fable pass 1): the run's view of the argv is the =-expanded view the parse consumed
const argOf = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value

const HERE = path.dirname(fileURLToPath(import.meta.url));
// FIX3 (review round 3 on #731 P2 (a)): destination first — the prior bar report at --out is removed before the --web existence check can refuse (refuter pass 3)
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'probe-489-w8', value: ['--out', '--web'] });
const outPath = __P.value('--out');
if (outPath) { const { invalidatePrior } = await import('./lib/serve-check.mjs'); invalidatePrior([path.resolve(outPath)], 'probe-489-w8'); }
const webDir = __pathOpt('--web', { tag: 'probe-489-w8', mustExist: 'dir' }) ?? path.join(HERE, '../../web');
const { launchChrome, sleep, spawnStaticServer, stopStaticServer } =
  await import(pathToFileURL(path.join(webDir, 'tools/cdp.mjs')).href);

const PORT = Number(process.env.OB_E2E_PORT ?? 16749); // SNK-R30 / GH-687: bandless default in undeclared space; the lane band is claimed by run-gate --band
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 16764);
// GH-687 (SNK-R30)
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?seed=1&table=wpbsa_snooker_12ft`,
  { port: CDP, width: 1280, height: 800 });
let res = null;
try {
  let ready = false;
  for (let i = 0; i < 220 && !ready; i++) {
    await sleep(200);
    try { ready = await chrome.eval('window.__test?.ready === true'); } catch { }
  }
  if (!ready) throw new Error('app never ready');
  await sleep(1500);
  res = await chrome.eval(`(async () => {
    const m = await import(new URL('./scene/table.js', location.href).href);
    const cups = m.pocketVisualFalls('wpbsa_snooker_12ft');
    const nets = [];
    __dbg.scene.traverse((o) => {
      if (o.isMesh && o.name === 'obPocketNet') nets.push(o);
    });
    // classify the merged obPocketNet meshes: outer skin = FrontSide +
    // alphaTest; inner = BackSide; collar/ply = DoubleSide (ply has no
    // alphaTest)
    const outer = nets.find((o) => o.material.side === 0
      && o.material.alphaTest > 0);
    const ply = nets.find((o) => o.material.side === 2
      && !o.material.alphaTest);
    const out = { pockets: [], ply: null };
    if (outer) {
      const pos = outer.geometry.attributes.position;
      for (const c of cups) {
        const R = c.r + 0.006;
        // rim ring = outer-skin vertices in the bottom 6 mm of the bag
        let yMin = 0;
        const near = [];
        for (let i = 0; i < pos.count; i++) {
          const dx = pos.getX(i) - c.x, dz = pos.getZ(i) - c.z;
          if (dx * dx + dz * dz > 0.06 * 0.06) continue;
          const y = pos.getY(i);
          if (y < yMin) yMin = y;
          near.push([pos.getX(i), y, pos.getZ(i)]);
        }
        const rim = near.filter((p) => p[1] < yMin + 0.006);
        if (rim.length < 8) continue;
        const cx = rim.reduce((s, p) => s + p[0], 0) / rim.length;
        const cz = rim.reduce((s, p) => s + p[2], 0) / rim.length;
        const rads = rim.map((p) => Math.hypot(p[0] - cx, p[2] - cz));
        const rMean = rads.reduce((s, r) => s + r, 0) / rads.length;
        const rStd = Math.sqrt(rads.reduce(
          (s, r) => s + (r - rMean) ** 2, 0) / rads.length);
        out.pockets.push({
          cup: [c.x, c.z], corner: Math.abs(c.x) > 0.1,
          rim_n: rim.length, rim_y: +yMin.toFixed(4),
          slump_offset_R: +((Math.hypot(cx - c.x, cz - c.z)) / R).toFixed(4),
          rim_r_mean_R: +(rMean / R).toFixed(4),
          rim_r_std_R: +(rStd / R).toFixed(4),
        });
      }
    }
    if (ply) {
      ply.geometry.computeBoundingBox();
      const b = ply.geometry.boundingBox;
      out.ply = { y: [+b.min.y.toFixed(4), +b.max.y.toFixed(4)],
        present: true };
    }
    return JSON.stringify(out);
  })()`, true).then(JSON.parse);
} finally {
  chrome.close();
  await stopStaticServer(server);
}

// verdict laws (gate r11 finding 2c + 3; constants from snkSockSlump —
// middle 0.24 R, corner 0.18 R, smoothstep ~0.96 at the rim ⇒ floors at
// 2/3 of the built magnitude; ply band must cover [-0.10, -0.056])
const mids = res.pockets.filter((p) => !p.corner);
const cors = res.pockets.filter((p) => p.corner);
const bars = [];
const bar = (name, ok, detail) => bars.push({ bar: name, ok, detail });
bar('W8-S1a middle slump ≥ 0.15 R (built 0.24 R; rev-13 lathe 0)',
  mids.length >= 2 && mids.every((p) => p.slump_offset_R >= 0.15),
  mids.map((p) => p.slump_offset_R));
bar('W8-S1b corner slump ≥ 0.11 R (built 0.18 R; rev-13 lathe 0)',
  cors.length >= 4 && cors.every((p) => p.slump_offset_R >= 0.11),
  cors.map((p) => p.slump_offset_R));
// W14 RE-DERIVATION (with the E18 free-hanging slim tube): the corner
// rim slims 0.34R → 0.265R (the leg-clearance trio, review r3 P2), so the
// σ/R read — normalized by the BAG R while the drape lives on the rim —
// scales down by the same ratio. The floor follows (0.008 × 0.265/0.34 ≈
// 0.0062 for corners; middles keep 0.008); the law's subject (hand-
// knotted, never machine-cut) is untouched — the rev-13 perfect-circle
// red reads ~0.000, two decades below either floor.
bar('W8-S2 rim drape spread σ/R ≥ 0.008 middle / ≥ 0.0062 corner '
  + '(multi-harmonic; a perfect circle reads ~0)',
  res.pockets.length >= 6 && res.pockets.every((p) => p.rim_r_std_R
    >= (p.corner ? 0.0062 : 0.008)),
  res.pockets.map((p) => p.rim_r_std_R));
bar('W8-S3 middle gathered second ply present, band ⊇ [-0.10, -0.056]',
  !!res.ply && res.ply.y[0] <= -0.10 && res.ply.y[1] >= -0.056,
  res.ply);
const fail = bars.filter((b) => !b.ok).length;
const report = { tool: 'tools/render/probe-489-w8.mjs', web: webDir,
  bars, fail_count: fail, raw: res };
for (const b of bars) {
  console.log(`${b.ok ? 'PASS' : 'FAIL'}  ${b.bar} — `
    + JSON.stringify(b.detail));
}
if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify(report, null, 1));
  console.log('report ->', outPath);
}
process.exit(fail ? 1 : 0);
