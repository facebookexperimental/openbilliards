#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// mouthgrid-490 — first-hit census over a pixel grid at named camera poses of
// the chinese-8 middle pocket (GH-490 craft lane), with a screenshot per pose.
//
// Born as the R1-FIX9 proof that no cn8-mid-lipwall-* was the first hit at
// mid_close_diag / mid_tt_inside / c1s (the "detached dark arc"), committed by
// order R1-FIX10 item (c) with its invocation.  It is the screen-space twin of
// the gate rows midmouth-void / midext-neck in web/tools/check-490-pass2.mjs:
// it answers "what does THIS eye meet first, pixel by pixel" and prints the
// per-pose family tally, so a verifier can reproduce a census without the gate.
//
//   node tools/render/mouthgrid-490.mjs [--web DIR] [--out DIR]
//        [--poses name,name | all] [--look default|sp]
//
//   --web    the web/ tree to serve (default: this repo's web/; a clean
//            `git archive` extract's web/ is the honest choice for a seal)
//   --out    where the screenshots + per-pose JSON grids go
//            (default /tmp/ob-mouthgrid-490)
//   --poses  from the built-in set below (register poses of
//            web/tools/capture-490-chinese8.mjs and craft-look poses of
//            tools/render/fixtures/craft-look-poses.json; kernel [kx, ky, h]
//            camera coordinates, as __test.cameraPose takes them)
//
// Output per pose: <name>.png (the frame at the pose's register size) and
// <name>.json { W, H, box, step, names, cells: [nameIndex, materialIndex,
// worldY_0.1mm] × cells } plus a console line with the top first-hit families.
// Ports: OB_E2E_PORT / OB_E2E_CDP_PORT if set, else a claimed band 25280-9969.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand } from '../../web/tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
const argOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value

const SERVE = path.resolve(__pathOpt('--web', { default: path.join(REPO, 'web'), tag: 'mouthgrid-490', mustExist: 'dir' }));
const OUT = path.resolve(__pathOpt('--out', { default: '/tmp/ob-mouthgrid-490', tag: 'mouthgrid-490' }));
const LOOK = argOf('--look', 'default');
// register sizes: capture-490 frames are 1280 × 800, craft-look frames 1600 × 1000
const SETS = [
  { w: 1280, h: 800, poses: {
    c6_midext_owner_low: { cam: [0.91, -0.30, 0.12], look: [0.65, 0.02, 0.02], fov: 32, box: [440, 380, 1010, 760], step: 3 },
    c7_rail25e_midext_aperture: { cam: [1.116, -0.139, 0.124], look: [0.720, 0.0455, 0.018], fov: 16, box: [250, 150, 1150, 720], step: 4 },
    c1s_side_ring_macro: { cam: [1.05, -0.22, 0.26], look: [0.682, 0.0, 0.04], fov: 30, box: [300, 150, 1000, 700], step: 4 } } },
  { w: 1600, h: 1000, poses: {
    mid_close_diag: { cam: [0.422, -0.15, 0.16], look: [0.682, 0.0, 0.01], fov: 30, box: [250, 150, 1350, 950], step: 4 },
    mid_tt_inside: { cam: [0.192, -0.25, 0.38], look: [0.682, 0.0, 0.0], fov: 30, box: [250, 150, 1350, 950], step: 4 },
    mid_edgeon: { cam: [0.342, -0.02, 0.03], look: [0.682, 0.0, 0.03], fov: 26, box: [250, 150, 1350, 950], step: 4 } } },
];
const want = __stringOpt('--poses', { default: 'all', tag: 'mouthgrid-490' }); // FIX2: blank / trailing refused
const wanted = want === 'all' ? null : new Set(want.split(',').map((s) => s.trim()).filter(Boolean));
// FIX2 (validate-then-use, poses): every requested pose must exist in some set — an unknown name used to be skipped silently
if (wanted) { const known = new Set(SETS.flatMap((s) => Object.keys(s.poses))); const bad = [...wanted].filter((n) => !known.has(n)); if (!wanted.size || bad.length) { console.error(`[mouthgrid-490] REFUSED — --poses ${!wanted.size ? 'is empty' : `names unknown pose(s) ${bad.join(', ')}`} (known: ${[...known].join(', ')})`); process.exit(2); } }
mkdirSync(OUT, { recursive: true });
let PORT; let CDPP; let band = null;
if (process.env.OB_E2E_PORT && process.env.OB_E2E_CDP_PORT) { PORT = Number(process.env.OB_E2E_PORT); CDPP = Number(process.env.OB_E2E_CDP_PORT); }
else { band = await claimPortBand(25280, 25309); PORT = band.http(0); CDPP = band.cdp(0); }
const url = `http://127.0.0.1:${PORT}/app.html?table=chinese8_pro_9ft&cinema=1&seed=7&look=${LOOK}`;
const server = spawnStaticServer(SERVE, PORT);
console.log(`[mouthgrid-490] serving ${SERVE} on :${PORT} (cdp :${CDPP}) -> ${OUT}`);
try {
  for (const set of SETS) {
    const poses = Object.entries(set.poses).filter(([n]) => !wanted || wanted.has(n));
    if (!poses.length) continue;
    const chrome = await launchChrome(url, { port: CDPP, width: set.w, height: set.h });
    try {
      let ready = false;
      for (let i = 0; i < 260 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true').catch(() => false); }
      if (!ready) throw new Error('page not ready');
      for (const [name, pose] of poses) {
        const { box, step, ...cp } = pose;
        let ok = false;
        for (let i = 0; i < 30 && !ok; i++) { ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(cp)})`); if (!ok) await sleep(200); }
        if (!ok) throw new Error('pose refused ' + name);
        await sleep(600);
        await chrome.screenshot(path.join(OUT, `${name}.png`));
        const out = await chrome.eval(`(async () => {
          const THREE = await import('./vendor/three.module.min.js');
          const sc = window.__dbg.scene, cam = window.__dbg.camera; sc.updateMatrixWorld(true);
          const W = window.innerWidth, H = window.innerHeight; const [x0, y0, x1, y1] = ${JSON.stringify(box)}; const st = ${step};
          const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
          const rc = new THREE.Raycaster(); rc.far = 10; const names = []; const nidx = new Map(); const cells = [];
          for (let py = y0; py < y1; py += st) for (let px = x0; px < x1; px += st) {
            rc.setFromCamera(new THREE.Vector2((px + 0.5) / W * 2 - 1, -((py + 0.5) / H * 2 - 1)), cam);
            const hs = rc.intersectObjects(sc.children, true).filter((h) => h.object.isMesh && vis(h.object));
            if (!hs.length) { cells.push(-1, 0, 0); continue; }
            const h = hs[0]; const nm = h.object.name || '(anon)'; if (!nidx.has(nm)) { nidx.set(nm, names.length); names.push(nm); }
            cells.push(nidx.get(nm), h.face ? (h.face.materialIndex | 0) : 0, Math.round(h.point.y * 1e4)); }
          return JSON.stringify({ W, H, box: [x0, y0, x1, y1], step: st, names, cells }); })()`);
        writeFileSync(path.join(OUT, `${name}.json`), out);
        const R = JSON.parse(out); const counts = {};
        for (let i = 0; i < R.cells.length; i += 3) { const k = R.cells[i]; if (k >= 0) counts[R.names[k]] = (counts[R.names[k]] || 0) + 1; }
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        console.log(`[mouthgrid-490] ${name}: ${R.cells.length / 3} cells, first-hit families: ${JSON.stringify(top)}`);
      }
    } finally { await chrome.closeAndWait().catch(() => {}); }
  }
  console.log('MOUTHGRID-490 DONE');
} finally { stopStaticServer(server); if (band && band.release) { try { await band.release(); } catch (e) { /* best effort */ } } }
