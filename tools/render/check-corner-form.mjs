// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-corner-form.mjs — GH-489 W11 CORNER-FORM gate (owner rejection
// #489 c5286904581: 「角袋的建模跟实拍根本对不上, 你还有垂直的尖角, 真实的
// 台子哪里会有这种尖角?」 — the corner-top register showed a giant flat
// plate with straight edges and SHARP TIPS, green cushion ends in chisel
// points, and tan tab artifacts on the cloth edges).
//
// The W10 instrument set measured the adjudicated QUANTITIES (widths,
// depths, stations) — the corner-top FORM gestalt was unbarred, which is
// how rev-16 passed every gate and still read wrong to the owner's eyes.
// These bars measure FORM, geometrically (scene raycasts — lighting/nap
// noise cannot fool them), and are red-proofed on the rev-16 bytes
// @1672d4ab (--web <rev16 tree> --expect-red):
//
//   F1 casting outer-corner roundness: the plan outline of the rail-top
//      corner silhouette (casting top field) inside the frame-corner
//      sector must turn ≤ 34°/step over a 12 mm window — the reference
//      corner column is chamfered/moulded (Star montage; a quarter-round
//      R55 measures ≈ 21–26°). rev-16 read a razor 90° plate tip.
//   F2 saddle crown convexity: the cream top's radial height profile
//      must BOW convex (dome + rolled edge) — mean bow over the
//      peak→outer chord ≥ 2.0 mm across the ±30° diagonal fan. rev-16's
//      flat washer ran the band as a straight line (≈ 0.3 mm).
//   F3 jaw-end roundness: the plan footprint of cloth standing ≥ 8 mm
//      above bed at the mouth must end ROUNDED — max outline turn at the
//      jaw ends ≤ 60°/step over a 7 mm window (the cloth wrap rounds
//      over the kernel nose line; no chisel points). rev-16 read ~90°+
//      pointed wedges with vertical end faces.
//   F4 saddle dome falloff: the boot crown must SHADE like a moulded
//      dome with a rolled edge, not a flat washer — top-down radial luma
//      falloff toward the outer edge (peak → outer 16% of the band) on
//      the S1b register raw, mean ≥ 0.085 / min ≥ 0.050 across the fan
//      (GCL/Star class; measured rev-16 flat washer 0.056/0.028,
//      measured W11 saddle 0.108/0.083). Needs --s1b <png>.
//
// Usage:
//   node tools/render/check-corner-form.mjs [--web <dir>] [--expect-red]
//                                           [--s1b <S1b-cornerTop.png>]
//                                           [--out <report.json>]
import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const args = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2)); // FIX10 (Fable pass 1): the run's view of the argv is the =-expanded view the parse consumed
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'check-corner-form', value: ['--out', '--web', '--s1b', '--perturb'], bool: ['--expect-red'] }); // --s1b is a PATH value (Fable pass 1 on FIX10)
const outPath = __P.value('--out') ? path.resolve(__P.value('--out')) : null;
// FIX3 (P2 (a)) → FIX10: the prior report at the PARSED destination is removed as the first effect after the parse, before any input guard
if (outPath) { const { invalidatePrior } = await import('./lib/serve-check.mjs'); invalidatePrior([outPath], 'check-corner-form'); }
if (outPath) { try { (await import('node:fs')).mkdirSync(path.dirname(outPath), { recursive: true }); } catch (e) { console.error(`[check-corner-form] REFUSED — --out ${outPath}: its parent cannot be a directory (${e.code || e.message})`); process.exit(2); } } // FIX11: the tool owns its destination directory (after the parse and the first effect); refused by name, never a raw stack
const webDir = path.resolve(__pathOpt('--web', { default: new URL('../../web', import.meta.url).pathname, tag: 'check-corner-form', mustExist: 'dir' }));
const expectRed = args.includes('--expect-red');
const s1bPath = (() => { const o = __P.value('--s1b'); /* FIX10 (Fable pass 1): read from the parse */ return o ? path.resolve(o) : null; })(); // FIX2: presence checked; the file is not read here (posegate_489.py --w11 measures it), so no existence demand

const PORT = Number(process.env.OB_E2E_PORT ?? 23940);
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 23941);

const { launchChrome, sleep, spawnStaticServer, stopStaticServer } =
  await import(pathToFileURL(path.join(webDir, 'tools/cdp.mjs')).href);

// FIX11 (review round 11 on #731 P2 A): ONE readiness law — the shared preflight's bounded wait, then the FIX3 checks (the listener is
// OURS by pid lineage; the served /sw.js + /app.html bytes are the requested --web tree's); a server that never binds inside the bound
// exits 78 by name. `--perturb=slow-server` (the arm) binds the same owned server 4 s late.
const __PERTURB = __P.value('--perturb');
if (__PERTURB !== null && __PERTURB !== 'slow-server' && __PERTURB !== 'slow-server-only') { console.error(`[check-corner-form] REFUSED — unknown perturbation ${JSON.stringify(__PERTURB)} (known: slow-server, slow-server-only)`); process.exit(2); }
const { awaitOwnedServer, spawnOwnedServerDelayed } = await import('./lib/serve-check.mjs');
const __t0r = Date.now();
const server = (__PERTURB === 'slow-server' || __PERTURB === 'slow-server-only') ? spawnOwnedServerDelayed(webDir, PORT, 4000) : spawnStaticServer(webDir, PORT);
try { await awaitOwnedServer(server, PORT, webDir, 'check-corner-form'); }
catch (e) { console.error(e.message); await stopStaticServer(server); process.exit(e.exitCode ?? 2); }
// `slow-server-only` (the battery's arm row): the law is the subject — the tool stops here, before the browser, once its late-bound owned server
// passed the readiness law; the full run through the browser is the tool's ordinary path (its CDP stall under load is an OPEN row, not this law's)
if (__PERTURB === 'slow-server-only') { console.log(`[check-corner-form] readiness: the owned server bound late and the law proceeded after ${Date.now() - __t0r} ms (perturb slow-server-only) — stopping before the browser`); await stopStaticServer(server); process.exit(0); }
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
  { port: CDP, tool: false, preflightWebDir: webDir });
let failures = 0;
const bars = [];
const bar = (name, ok, detail) => {
  bars.push([name, ok, detail]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  if (!ok) failures += 1;
};
try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) {
    await sleep(300);
    ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
  }
  if (!ready) throw new Error('app never ready');
  const g = await chrome.eval(
    "__settings.changeGame('snooker', { skipConfirm: true })");
  if (g !== true) throw new Error(`game switch failed: ${g}`);
  await sleep(1500);
  const m = await chrome.eval(`(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const T = await import('./scene/table.js');
    const G = T.makeGeom('wpbsa_snooker_12ft');
    const scene = window.__dbg.scene;
    const rc = new THREE.Raycaster();
    const hit = (x, z) => {
      rc.set(new THREE.Vector3(x, 0.5, z), new THREE.Vector3(0, -1, 0));
      return rc.intersectObjects(scene.children, true)
        .filter((i) => i.object.visible !== false && i.object.isMesh)[0] ?? null;
    };
    const L = G.L, W = G.W, CW = G.CW, fw = G.render.frameWidth;
    const xO = L / 2 + CW + fw, zO = W / 2 + CW + fw;
    const cups = (T.pocketPlateDatums ?? T.pocketVisualFalls)('wpbsa_snooker_12ft'); // the PLATE DATUM (SNK-R34)
    const cup = cups[5]; // rt corner
    // ---------- shared grid helpers ----------
    const STEP = 0.0015;
    const trace = (mask, nx, nz) => {
      // Moore-neighbour boundary trace of the largest blob; returns the
      // ordered closed outline as cell coords
      const at = (ix, iz) => ix >= 0 && iz >= 0 && ix < nx && iz < nz
        && mask[ix * nz + iz];
      let sx = -1, sz = -1;
      outer: for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) {
          if (at(ix, iz)) { sx = ix; sz = iz; break outer; }
        }
      }
      if (sx < 0) return [];
      const dirs = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1],
        [-1, 0], [-1, 1]];
      const out = [[sx, sz]];
      let cx2 = sx, cz2 = sz, backtrack = 6;
      for (let step = 0; step < 40000; step++) {
        let found = -1;
        for (let k = 0; k < 8; k++) {
          const d = (backtrack + 1 + k) % 8;
          const nx2 = cx2 + dirs[d][0], nz2 = cz2 + dirs[d][1];
          if (at(nx2, nz2)) { found = d; break; }
        }
        if (found < 0) break;
        cx2 += dirs[found][0]; cz2 += dirs[found][1];
        backtrack = (found + 4) % 8;
        if (cx2 === sx && cz2 === sz) break;
        out.push([cx2, cz2]);
      }
      return out;
    };
    const smooth = (ch, w2) => {
      const n = ch.length, out = [];
      for (let i = 0; i < n; i++) {
        let ax = 0, az = 0;
        for (let j = -w2; j <= w2; j++) {
          const p = ch[(i + j + n) % n];
          ax += p[0]; az += p[1];
        }
        out.push([ax / (2 * w2 + 1), az / (2 * w2 + 1)]);
      }
      return out;
    };
    const maxTurn = (ch, k, inWin) => {
      // CONVEX turns only (review W11 r7 refinement): a chisel point is
      // a convex outline vertex; a concave fold (e.g. the honest cloth
      // step where the flare floor meets the wall hug) is not the
      // owner's defect class. Outline orientation from the signed area.
      const n = ch.length;
      let area2 = 0;
      for (let i = 0; i < n; i++) {
        const [x1, y1] = ch[i], [x2, y2] = ch[(i + 1) % n];
        area2 += x1 * y2 - x2 * y1;
      }
      const ccw = area2 > 0 ? 1 : -1;
      let best = 0, where = null;
      for (let i = 0; i < n; i++) {
        const p = ch[i];
        if (!inWin(p)) continue;
        const a = ch[(i - k + n) % n], b = ch[(i + k) % n];
        const v1 = [p[0] - a[0], p[1] - a[1]];
        const v2 = [b[0] - p[0], b[1] - p[1]];
        const n1 = Math.hypot(...v1), n2 = Math.hypot(...v2);
        if (n1 < k * 0.4 || n2 < k * 0.4) continue;
        const cross = v1[0] * v2[1] - v1[1] * v2[0];
        if (cross * ccw < 0) continue; // concave fold — not a chisel
        const cosang = (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2);
        const ang = (Math.acos(Math.max(-1, Math.min(1, cosang))) * 180)
          / Math.PI;
        if (ang > best) { best = ang; where = p; }
      }
      return { best, where };
    };
    // ---------- F1: rail-top corner silhouette ----------
    // SUPPORT-FUNCTION vertex concentration (no boundary tracing): over
    // outward directions u(θ), θ ∈ (0°..90°) in the corner quadrant, the
    // support point argmax(cell·u) of the rail-top-plane footprint. A
    // razor plate tip serves as THE support vertex across the whole
    // quadrant (span ≈ 90°); a moulded R55 corner walks the support
    // point along the arc (≈ 4–8° per 4 mm cluster).
    const f1x0 = xO - 0.13, f1z0 = zO - 0.13;
    const nx1 = Math.round(0.14 / STEP), nz1 = Math.round(0.14 / STEP);
    const cells1 = [];
    for (let ix = 0; ix < nx1; ix++) {
      for (let iz = 0; iz < nz1; iz++) {
        const wx = f1x0 + ix * STEP, wz = f1z0 + iz * STEP;
        const h = hit(wx, wz);
        if (h && Math.abs(h.point.y - 0.047) < 0.006) cells1.push([wx, wz]);
      }
    }
    // W13 RE-DERIVATION (the W12 subject moved): the whole-mask support
    // sweep measures the CONVEX HULL — with the r16-pinned bell-span
    // casting cutback the silhouette is legitimately non-convex (the
    // reference's own rail-height silhouette is: the bell stands in an
    // open bite between two gold shoulders), and the hull's bridge
    // endpoints read as fake 30-40° "tips" forever. The law's subject —
    // no razor vertex — is measured PER CONNECTED COMPONENT instead
    // (each real surface walks its own boundary), with supports at the
    // structural junction lines (the squared wood end-faces, adjudicated
    // corners) and at the probe-box clip edges EXEMPT: those are
    // assembly seams, not free tips. Red basis preserved: the rev-16
    // razor tip lives mid-component of its own single blob.
    let vertexSpan = 0;
    const comps = [];
    if (cells1.length > 200) {
      const key1 = (ix, iz) => ix * 10000 + iz;
      const cellIdx = new Map();
      for (const [wx, wz] of cells1) {
        const ix = Math.round((wx - f1x0) / STEP);
        const iz = Math.round((wz - f1z0) / STEP);
        cellIdx.set(key1(ix, iz), [wx, wz, ix, iz]);
      }
      const seen = new Set();
      for (const [k1, cell] of cellIdx) {
        if (seen.has(k1)) continue;
        const comp = [];
        const stack = [k1];
        seen.add(k1);
        while (stack.length) {
          const k2 = stack.pop();
          const c2 = cellIdx.get(k2);
          comp.push(c2);
          const [, , ix, iz] = c2;
          for (let dx2 = -1; dx2 <= 1; dx2++) {
            for (let dz2 = -1; dz2 <= 1; dz2++) {
              const k3 = key1(ix + dx2, iz + dz2);
              if (!seen.has(k3) && cellIdx.has(k3)) {
                seen.add(k3);
                stack.push(k3);
              }
            }
          }
        }
        if (comp.length >= 60) comps.push(comp);
      }
      const exempt = ([wx, wz]) =>
        Math.abs(wx - (L / 2 - 0.055)) < 0.006
        || Math.abs(wz - (W / 2 - 0.055)) < 0.006
        || wx < f1x0 + 0.004 || wz < f1z0 + 0.004
        || wx > f1x0 + 0.136 || wz > f1z0 + 0.136;
      for (const comp of comps) {
        const supports = [];
        for (let th = 4; th <= 86; th += 2) {
          const ux = Math.cos((th * Math.PI) / 180);
          const uz = Math.sin((th * Math.PI) / 180);
          let best = -Infinity, bp = null;
          for (const [wx, wz] of comp) {
            const d = wx * ux + wz * uz;
            if (d > best) { best = d; bp = [wx, wz]; }
          }
          supports.push([th, bp]);
        }
        for (let i = 0; i < supports.length; i++) {
          if (exempt(supports[i][1])) continue;
          let j = i;
          while (j + 1 < supports.length
            && Math.hypot(supports[j + 1][1][0] - supports[i][1][0],
              supports[j + 1][1][1] - supports[i][1][1]) < 0.004) j++;
          vertexSpan = Math.max(vertexSpan,
            supports[j][0] - supports[i][0]);
        }
      }
    }
    let castingMeshes = 0;
    scene.traverse((o) => {
      if (o.isMesh && (o.name === 'obSnkCasting'
        || o.name === 'obSnkPostLiner')) castingMeshes++;
    });
    const dbg1 = { maskCells: cells1.length, comps: comps.length,
      castingMeshes };
    // ---------- F2: saddle crown convexity (the dome BOW) ----------
    // radial height profiles of the cream top across a ±30° diagonal
    // fan: bow = h(mid) − chord(peak → outer landing) at the halfway
    // radius. The rev-16 flat washer ran the band as a straight line
    // (bow ≈ 0.3 mm); the moulded saddle crowns convex (bow ≥ 2 mm
    // class). The retired first cut (adjacent-sample step scan) did NOT
    // discriminate — rev-16's vertical arris was buried inside the
    // casting and sampled as a 1.6 mm step.
    const crownBow = () => {
      const bows = []; // one bow per fan ray — F2 requires FULL coverage
      for (let azd = -30; azd <= 30; azd += 5) {
        const az = Math.PI / 4 + (azd * Math.PI) / 180;
        const prof = [];
        for (let r = cup.r + 0.006; r <= cup.r + 0.062; r += 0.001) {
          const h = hit(cup.x + r * Math.cos(az), cup.z + r * Math.sin(az));
          if (h && h.object.name === 'obPocketCap') prof.push([r, h.point.y]);
        }
        if (prof.length < 20) continue;
        let pk = 0;
        for (let i = 1; i < prof.length; i++) {
          if (prof[i][1] > prof[pk][1]) pk = i;
        }
        const outer = prof[prof.length - 1];
        const peak = prof[pk];
        if (outer[0] - peak[0] < 0.015) continue;
        const rm = (peak[0] + outer[0]) / 2;
        let mid = null;
        for (const [r, y] of prof) {
          if (mid === null || Math.abs(r - rm) < Math.abs(mid[0] - rm)) {
            mid = [r, y];
          }
        }
        const chord = peak[1] + ((mid[0] - peak[0]) / (outer[0] - peak[0]))
          * (outer[1] - peak[1]);
        bows.push(mid[1] - chord);
      }
      return { mean: bows.length
        ? bows.reduce((a2, b2) => a2 + b2, 0) / bows.length : 0,
      min: bows.length ? Math.min(...bows) : 0,
      bows: bows.map((b2) => Math.round(b2 * 1e4) / 10),
      rays: bows.length };
    };
    const F2bow = crownBow();
    // ---------- F3: jaw-end roundness (per-tip blobs) ----------
    // mask = cloth-family standing >= 8 mm above bed, cropped per tip
    const [tu, tv] = G.corner.x;
    const tipL = [L / 2 - tu, W / 2 - tv];
    const tipE = [L / 2 - tv, W / 2 - tu];
    const tipTurn = (tip) => {
      const x0 = tip[0] - 0.035, z0 = tip[1] - 0.035;
      const n = Math.round(0.07 / STEP);
      const mk = new Uint8Array(n * n);
      let cnt = 0;
      for (let ix = 0; ix < n; ix++) {
        for (let iz = 0; iz < n; iz++) {
          const h = hit(x0 + ix * STEP, z0 + iz * STEP);
          if (!h || h.point.y < 0.008) continue;
          const nm = h.object.name || '';
          if (nm === '' || nm === 'obSnkJawWrap'
            || nm === 'obPocketFallRoll') { mk[ix * n + iz] = 1; cnt++; }
        }
      }
      if (cnt < 40) return { best: 0, cnt };
      const ch = smooth(trace(mk, n, n), 2);
      const k3 = Math.round(0.007 / STEP);
      const t = maxTurn(ch, k3, (p) => {
        const wx = x0 + p[0] * STEP, wz = z0 + p[1] * STEP;
        return Math.hypot(wx - tip[0], wz - tip[1]) < 0.024
          && p[0] > 3 && p[1] > 3 && p[0] < n - 4 && p[1] < n - 4;
      });
      return { best: t.best, cnt, chainLen: ch.length };
    };
    const F3a = tipTurn(tipL);
    const F3b = tipTurn(tipE);
    // ---------- F4: drape ceiling (cue-clearance contract, review r1
    // P2): every obSnkJawWrap vertex holds y <= 0.0471 — at/under the
    // rail plane the shipped clearance law already governs; the mesh
    // may never stand proud into an unmodeled clearance volume
    let wrapMaxY = -1;
    // F5 (review W11 r6/r7): every drape vertex ABOVE the off-wood wall
    // class (43.85 mm) must stand over WOOD at rail height (the plank
    // flare, first-hit ≈ 47 mm under the vertex once the drape hides) —
    // i.e. the drape adds no obstruction beyond the shipped solids
    // anywhere a cue can reach; the pose-side clearance gate delegates
    // the drape to this mesh law (flush-dressing class)
    let f5Checked = 0, f5Bad = 0, f5BadAt = null;
    const wraps = [];
    scene.traverse((o) => {
      if (o.name !== 'obSnkJawWrap' || !o.isMesh) return;
      wraps.push(o);
      const p3 = o.geometry.attributes.position;
      for (let i = 0; i < p3.count; i++) {
        const y3 = p3.getY(i);
        if (y3 > wrapMaxY) wrapMaxY = y3;
      }
    });
    // above-class vertices are legal in TWO places: over rail-height
    // wood (the plank flare — flush dressing) or inside the certified
    // pocketMouthObstacles window (the junction blend — the boot
    // envelope 0.0575 covers the cue there); anywhere else they would
    // stand in unmodeled clearance space
    const mob = T.pocketMouthObstacles('wpbsa_snooker_12ft');
    const cFalls = mob.falls.filter((f2) => Math.abs(f2.ox) > 0.5);
    const inWindow = (x2, z2) => cFalls.some((f2) => {
      const ddx = x2 - f2.x, ddz = z2 - f2.z;
      const dd = Math.hypot(ddx, ddz);
      if (!(dd > 0) || dd > f2.r + 0.0585) return false;
      const ang2 = Math.acos(Math.min(1, Math.max(-1,
        (ddx * f2.ox + ddz * f2.oz) / dd)));
      return ang2 <= f2.half;
    });
    for (const o of wraps) {
      o.visible = false; // probe the SUPPORT under the drape
      const p3 = o.geometry.attributes.position;
      for (let i = 0; i < p3.count; i++) {
        const y3 = p3.getY(i);
        if (y3 <= 0.04385) continue;
        f5Checked++;
        const x3 = p3.getX(i), z3 = p3.getZ(i);
        // support = a shipped solid within the ply class (2.6 mm) below
        // — probed at the vertex column AND four 4 mm lateral neighbours
        // (wall-hug vertices sit over VERTICAL wall faces a down-ray
        // slides past to the bed; the wall is the support)
        let supported = false;
        for (const [ox3, oz3] of [[0, 0], [0.004, 0], [-0.004, 0],
          [0, 0.004], [0, -0.004]]) {
          const h = hit(x3 + ox3, z3 + oz3);
          if (h && h.point.y >= y3 - 0.0026) { supported = true; break; }
        }
        if (!supported && !inWindow(x3, z3)) {
          const h = hit(x3, z3);
          f5Bad++;
          if (!f5BadAt) {
            f5BadAt = [Math.round(x3 * 1e4) / 1e4,
              Math.round(z3 * 1e4) / 1e4, Math.round(y3 * 1e5) / 100,
              h ? Math.round(h.point.y * 1e5) / 100 : null];
          }
        }
      }
      o.visible = true;
    }
    // ---------- F6 (W13 STRUCTURAL re-derivation of the W12 continuity
    // law — the W12 flush-dress boundary subject is retired with the
    // P2-5 under-wood dive, and no wrap surface remains down-visible to
    // trace): NO wrap vertex may sit inside the wood-plane depth dead
    // band (0.0452, 0.0474) clearly OUTSIDE the certified obstacle
    // window — near-parallel cloth-on-wood at sub-precision separation
    // IS the z-fight staircase class (gate r15 P2-3 → r16 P2-5: the
    // rev-18 flush dress carried 0.04705-class vertices across the
    // plank tops beyond the window). The rendered-pixel side of the
    // same defect is red-armed in posegate --w13 (wood-face ROIs).
    let f6Checked = 0, f6Bad = 0, f6BadAt = null;
    const outWindow = (x2, z2) => !cFalls.some((f2) => {
      const ddx = x2 - f2.x, ddz = z2 - f2.z;
      const dd = Math.hypot(ddx, ddz);
      if (!(dd > 0)) return true;
      const ang2 = Math.acos(Math.min(1, Math.max(-1,
        (ddx * f2.ox + ddz * f2.oz) / dd)));
      // boundary strip exempt: "clearly outside" = beyond half + 0.08
      // (the live wm snap already owns angW >= wrapHalfC - 0.025)
      return ang2 < f2.half + 0.08;
    });
    for (const o of wraps) {
      const p3 = o.geometry.attributes.position;
      for (let i = 0; i < p3.count; i++) {
        f6Checked++;
        const y3 = p3.getY(i);
        if (y3 <= 0.04521 || y3 >= 0.0474) continue;
        const x3 = p3.getX(i), z3 = p3.getZ(i);
        if (outWindow(x3, z3)) {
          f6Bad++;
          if (!f6BadAt) {
            f6BadAt = [Math.round(x3 * 1e4) / 1e4,
              Math.round(z3 * 1e4) / 1e4, Math.round(y3 * 1e5) / 100];
          }
        }
      }
    }
    // ---------- F7 (W12, gate r15 P2-4): wire rods must RUN — from the
    // ring to a rail strap (the montage read), not bow back onto the
    // ring as clamp shapes. Max wire-vertex distance from the corner cup
    // + the strap/iron inventory (4 corners) prove the construction.
    // review W12 r1 P3: reach and iron presence bucket PER QUADRANT — a
    // single-corner measure let three missing/misregistered assemblies
    // pass (the four corner cups are sign-mirrors of the rt cup)
    const wireReachQ = [0, 0, 0, 0];
    let strapQuads = 0;
    const ironQuads = new Set();
    const qOf = (x6, z6) => (x6 > 0 ? 2 : 0) + (z6 > 0 ? 1 : 0);
    const cupQ = (q6) => [(q6 & 2 ? 1 : -1) * Math.abs(cup.x),
      (q6 & 1 ? 1 : -1) * Math.abs(cup.z)];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'obPocketWire') {
        const p6 = o.geometry.attributes.position;
        for (let i2 = 0; i2 < p6.count; i2++) {
          const x6 = p6.getX(i2), z6 = p6.getZ(i2);
          if (Math.abs(x6) > 1.2 && Math.abs(z6) > 0.55) {
            const q6 = qOf(x6, z6);
            const [qx6, qz6] = cupQ(q6);
            wireReachQ[q6] = Math.max(wireReachQ[q6],
              Math.hypot(x6 - qx6, z6 - qz6));
          }
        }
      }
      if (o.name === 'obPocketStrap') {
        const p6 = o.geometry.attributes.position;
        const quads = new Set();
        for (let i2 = 0; i2 < p6.count; i2++) {
          quads.add(qOf(p6.getX(i2), p6.getZ(i2)));
        }
        strapQuads = quads.size;
      }
      if (o.name === 'obPocketStrapIron') {
        // review r2 P3: the mesh carries BOTH the ring tabs (~65 mm from
        // the cup) and the rail buckles (~260 mm) — only the buckle
        // class proves the strap assembly, so irons count per quadrant
        // only at the strap distance class (≥ 200 mm)
        const p6 = o.geometry.attributes.position;
        for (let i2 = 0; i2 < p6.count; i2++) {
          const x6 = p6.getX(i2), z6 = p6.getZ(i2);
          const q6 = qOf(x6, z6);
          const [qx6, qz6] = cupQ(q6);
          if (Math.hypot(x6 - qx6, z6 - qz6) >= 0.20) ironQuads.add(q6);
        }
      }
    });
    const wireReach = Math.min(...wireReachQ);
    const strapIronOk = ironQuads.size === 4;
    // W13-FINISH review r3/r4/r5 P1: ROUTE CORRESPONDENCE — the
    // posegate rod_run_lit bar samples a PINNED bezier; this leg
    // proves the live obPocketWire geometry rides that exact curve in
    // EVERY corner, ONE PHYSICAL ROD TO ONE CURVE. r5: nearest-curve
    // vertex bucketing was not physical identity — a rod truncated at
    // t≈0.54 false-greened at 6.48 mm with its tail stations fed by a
    // neighbour's verts. Rods are now identified as CONNECTED
    // COMPONENTS of the merged index buffer (union-find over triangle
    // edges), each corner must own EXACTLY four rod components, the
    // component↔curve assignment is greedy-minimal by mean distance,
    // and every curve station across the FULL t 0..1 run (both
    // endpoints included — physical components restore the strap
    // convergence zone) must find a vertex of ITS OWN component
    // within the ceiling; each component must also stay within the
    // ceiling of its curve everywhere (no stray branches) and carry a
    // full tube's worth of vertices.
    let routeMax = 0;
    let routeMinVerts = Infinity;
    let routeMinTris = Infinity;
    let routeMinArea = Infinity;
    let routeMaxTris = 0;
    let routeMaxArea = 0;
    let routeMaxVerts = 0;
    let routeRingBinsMin = Infinity;
    let routeRingBandMin = Infinity;
    let routeRingLoopOk = true;
    let routeMinRefVerts = Infinity;
    let routeStray = 0;
    let routeRodCountOk = true;
    const routeDbg = [];
    {
      const fwC = G.render.frameWidth;
      const axEq = G.L / 2 + G.CW + fwC - 0.003;
      const azEq = G.W / 2 + G.CW + fwC - 0.003;
      const bez = (P0, P1, P2, P3, t7) => {
        const u7 = 1 - t7;
        return [0, 1, 2].map((k) =>
          u7 * u7 * u7 * P0[k] + 3 * u7 * u7 * t7 * P1[k]
          + 3 * u7 * t7 * t7 * P2[k] + t7 * t7 * t7 * P3[k]);
      };
      // physical rod components of every obPocketWire mesh
      const comps = []; // arrays of [x,y,z]
      scene.traverse((o) => {
        if (!o.isMesh || o.name !== 'obPocketWire') return;
        const p7 = o.geometry.attributes.position;
        const idx = o.geometry.index;
        const n7 = p7.count;
        const par = new Int32Array(n7);
        for (let i2 = 0; i2 < n7; i2++) par[i2] = i2;
        const find = (i2) => {
          let r7 = i2;
          while (par[r7] !== r7) r7 = par[r7];
          while (par[i2] !== r7) { const nx = par[i2]; par[i2] = r7; i2 = nx; }
          return r7;
        };
        const uni = (a7, b7) => {
          const ra = find(a7), rb = find(b7);
          if (ra !== rb) par[ra] = rb;
        };
        if (idx) {
          for (let i2 = 0; i2 < idx.count; i2 += 3) {
            uni(idx.getX(i2), idx.getX(i2 + 1));
            uni(idx.getX(i2 + 1), idx.getX(i2 + 2));
          }
        }
        const byRoot = new Map();
        for (let i2 = 0; i2 < n7; i2++) {
          const r7 = find(i2);
          let rec = byRoot.get(r7);
          if (!rec) {
            rec = { v: [], tris: 0, area: 0, ref: new Set(),
              faces: [] };
            byRoot.set(r7, rec);
          }
          rec.v.push([p7.getX(i2), p7.getY(i2), p7.getZ(i2)]);
        }
        // r6 P1 + r7 P1: SURFACE validity per component — a zero-area
        // index chain keeps vertices/connectivity while rendering
        // nothing, and DUPLICATING one real triangle can pad naive
        // count/area floors (both review-verified). Triangles DEDUPE on
        // unordered index keys, only UNIQUE non-degenerate faces count
        // toward tris/area, every counted face's edges stay under the
        // ring-spacing bound, and the component's vertices must be
        // REFERENCED by those faces (a floating point cloud with a
        // stamp-repeated face starves the coverage floor).
        if (idx) {
          const vAt = (k7) => [p7.getX(k7), p7.getY(k7), p7.getZ(k7)];
          const seen7 = new Set();
          for (let i2 = 0; i2 < idx.count; i2 += 3) {
            const ia = idx.getX(i2), ib = idx.getX(i2 + 1),
              ic = idx.getX(i2 + 2);
            if (ia === ib || ib === ic || ia === ic) continue;
            const A7 = vAt(ia), B7 = vAt(ib), C7 = vAt(ic);
            // r8 hardening: dedupe on QUANTIZED COORDINATES (0.1 mm),
            // not indices — duplicated positions under fresh indices
            // could stamp the same geometric face through an index-key
            // dedupe (the r7-class padding, geometric form)
            const qk = (P9) => P9.map((v9) => Math.round(v9 * 1e4))
              .join(':');
            const key7 = [qk(A7), qk(B7), qk(C7)].sort().join('|');
            if (seen7.has(key7)) continue;
            seen7.add(key7);
            const ux7 = B7[0] - A7[0], uy7 = B7[1] - A7[1],
              uz7 = B7[2] - A7[2];
            const wx7 = C7[0] - A7[0], wy7 = C7[1] - A7[1],
              wz7 = C7[2] - A7[2];
            const e17 = Math.hypot(ux7, uy7, uz7);
            const e27 = Math.hypot(wx7, wy7, wz7);
            const e37 = Math.hypot(B7[0] - C7[0], B7[1] - C7[1],
              B7[2] - C7[2]);
            if (Math.max(e17, e27, e37) > 0.015) continue;
            const cxp = uy7 * wz7 - uz7 * wy7;
            const cyp = uz7 * wx7 - ux7 * wz7;
            const czp = ux7 * wy7 - uy7 * wx7;
            const ar7 = 0.5 * Math.hypot(cxp, cyp, czp);
            if (ar7 < 1e-9) continue;
            const rec = byRoot.get(find(ia));
            if (rec) {
              rec.tris += 1; rec.area += ar7;
              rec.ref.add(ia); rec.ref.add(ib); rec.ref.add(ic);
              rec.faces.push([A7, B7, C7]);
            }
          }
        }
        for (const rec of byRoot.values()) {
          // r10 P1: every geometric law below (route stations, stray,
          // ring) reads the FACE-REFERENCED vertex set — degenerate-
          // triangle-connected unrenderable vertices can pad nothing
          const refArr = [];
          for (const k7 of rec.ref) {
            refArr.push([p7.getX(k7), p7.getY(k7), p7.getZ(k7)]);
          }
          refArr.rawN = rec.v.length;
          refArr.tris = rec.tris; refArr.area = rec.area;
          refArr.refN = rec.ref.size;
          refArr.faces = rec.faces;
          comps.push(refArr);
        }
      });
      for (const sxC of [-1, 1]) for (const szC of [-1, 1]) {
        const cx8 = sxC * Math.abs(cup.x), cz8 = szC * Math.abs(cup.z);
        const thOut8 = Math.atan2(sxC, szC);
        const xiC = sxC * (axEq - 0.24);
        const strapX = xiC - sxC * 0.115;
        // W14 RE-PIN (signed drawing GH489-EXT-R1.2, letters E10/E18/
        // E20; owner sign-off #489): the brass ring re-seats INSIDE the
        // leather at −62.5 (rv + 10 mm) and the rods leave UNDER the
        // pinked hem (−105.5) before riding the apron to the strap —
        // the W13 pin carried the retired −117 dropped-ring route (its
        // apron-plane first control would pierce the full-wrap XW101
        // skirt). Control points mirror table.js verbatim; red-armed:
        // the rev-19 route reads max/stray ≈ 46/56 mm off this pin.
        const rRing = cup.r + 0.010;
        const yRing8 = -0.0625;
        const curves = [-0.33, -0.11, 0.11, 0.33].map((da, wi) => {
          const th = thOut8 + da;
          const sx7 = Math.sin(th), sz7 = Math.cos(th);
          return [
            [cx8 + (rRing + 0.0045) * sx7, yRing8 + 0.002,
              cz8 + (rRing + 0.0045) * sz7],
            [cx8 + (cup.r + 0.052) * sx7, -0.122,
              cz8 + (cup.r + 0.052) * sz7],
            [xiC + sxC * 0.055, -0.124, szC * (azEq + 0.015)],
            [strapX + sxC * (0.010 - 0.006 * wi / 3),
              -0.129 + 0.004 * (wi % 2), szC * (azEq + 0.0075)],
          ];
        });
        // corner rod components: every vertex inside the quadrant
        // window (the middle wires live at |x| < 1.2)
        const rods = comps.filter((arr) => arr.every(
          (v7) => v7[0] * sxC > 1.2 && v7[2] * szC > 0.55));
        if (rods.length !== 4) {
          routeRodCountOk = false;
          routeDbg.push([sxC, szC, 'rods', rods.length]);
          continue;
        }
        // greedy minimal assignment by mean distance to 49 samples
        const dense = curves.map((c8) => {
          const pts8 = [];
          for (let i2 = 0; i2 <= 48; i2++) {
            pts8.push(bez(c8[0], c8[1], c8[2], c8[3], i2 / 48));
          }
          return pts8;
        });
        const cost = curves.map((_, c9) => rods.map((arr) => {
          let s9 = 0;
          for (const v7 of arr) {
            let bd = Infinity;
            for (const s8 of dense[c9]) {
              const d9 = Math.hypot(v7[0] - s8[0], v7[1] - s8[1],
                v7[2] - s8[2]);
              if (d9 < bd) bd = d9;
            }
            s9 += bd;
          }
          return s9 / arr.length;
        }));
        const usedRod = new Set();
        const pick = [];
        for (let c9 = 0; c9 < 4; c9++) pick.push([c9, -1]);
        // greedy over the 16 pairs by ascending cost
        const pairs = [];
        for (let c9 = 0; c9 < 4; c9++) {
          for (let r9 = 0; r9 < 4; r9++) pairs.push([cost[c9][r9], c9, r9]);
        }
        pairs.sort((a9, b9) => a9[0] - b9[0]);
        const curveDone = new Set();
        for (const [, c9, r9] of pairs) {
          if (curveDone.has(c9) || usedRod.has(r9)) continue;
          curveDone.add(c9); usedRod.add(r9);
          pick[c9][1] = r9;
        }
        for (const [c9, r9] of pick) {
          const arr = rods[r9];
          // r8b P1: TUBE cross-section law — a flat ribbon laid along
          // the cubic passes every count/area/edge window; at interior
          // stations the component's local vertices, projected onto
          // the tangent-perpendicular plane, must SPREAD in both
          // principal directions (a tube's ring reads ~3.2 mm in every
          // direction; a ribbon collapses the minor axis to ~0).
          for (let i2 = 3; i2 <= 21; i2 += 3) {
            const t7 = i2 / 25;
            const s7 = bez(curves[c9][0], curves[c9][1], curves[c9][2],
              curves[c9][3], t7);
            const s8 = bez(curves[c9][0], curves[c9][1], curves[c9][2],
              curves[c9][3], t7 + 0.01);
            let tx = s8[0] - s7[0], ty = s8[1] - s7[1],
              tz = s8[2] - s7[2];
            const tl = Math.hypot(tx, ty, tz) || 1;
            tx /= tl; ty /= tl; tz /= tl;
            // orthonormal pair perpendicular to the tangent
            let ux9 = -ty, uy9 = tx, uz9 = 0;
            const ul = Math.hypot(ux9, uy9, uz9) || 1;
            ux9 /= ul; uy9 /= ul; uz9 /= ul;
            const vx9 = ty * uz9 - tz * uy9;
            const vy9 = tz * ux9 - tx * uz9;
            const vz9 = tx * uy9 - ty * ux9;
            // r9/r11 P1 (the ring law, CONTOUR form): the section is
            // what the counted faces actually CUT on the station plane
            // — each counted triangle crossing the plane contributes
            // its intersection SEGMENT; the segments must WELD into a
            // closed loop winding the centerline exactly once with
            // every loop vertex in the tube radial band [0.8, 3.5] mm
            // (the decisive ring form — the bins floor 9/12 and band
            // 90% ride as belts; a station's qualifying loop can
            // under-cover 2 bins when the physical ring centre sits a
            // millimetre off the pinned-curve station point).
            // Vertex-bin padding died with this form: faces that do
            // not span the plane contribute nothing, a flat band cuts
            // the plane in <= 4 bins, and filling 11 bins at every
            // station with in-band crossings IS a tube shell.
            const mids = [];
            for (const F9 of (arr.faces || [])) {
              const d0 = (F9[0][0] - s7[0]) * tx
                + (F9[0][1] - s7[1]) * ty + (F9[0][2] - s7[2]) * tz;
              const d1 = (F9[1][0] - s7[0]) * tx
                + (F9[1][1] - s7[1]) * ty + (F9[1][2] - s7[2]) * tz;
              const d2 = (F9[2][0] - s7[0]) * tx
                + (F9[2][1] - s7[1]) * ty + (F9[2][2] - s7[2]) * tz;
              if (Math.min(Math.abs(d0), Math.abs(d1), Math.abs(d2))
                  > 0.012) continue;
              const pos9 = (d0 > 0) + (d1 > 0) + (d2 > 0);
              if (pos9 === 0 || pos9 === 3) continue;
              // the two crossing edge points
              const pts9 = [];
              const edges = [[F9[0], d0, F9[1], d1],
                [F9[1], d1, F9[2], d2], [F9[2], d2, F9[0], d0]];
              for (const [Pa, da9, Pb, db9] of edges) {
                if ((da9 > 0) === (db9 > 0)) continue;
                const t9 = da9 / (da9 - db9);
                pts9.push([Pa[0] + (Pb[0] - Pa[0]) * t9,
                  Pa[1] + (Pb[1] - Pa[1]) * t9,
                  Pa[2] + (Pb[2] - Pa[2]) * t9]);
              }
              if (pts9.length < 2) continue;
              // r12 P1: project the SEGMENT (both endpoints), not a
              // midpoint — micro-faces grazing the plane produce tiny
              // segments that a midpoint census counted as bins
              const prj9 = (P9) => {
                const dx9 = P9[0] - s7[0], dy9 = P9[1] - s7[1],
                  dz9 = P9[2] - s7[2];
                return [dx9 * ux9 + dy9 * uy9 + dz9 * uz9,
                  dx9 * vx9 + dy9 * vy9 + dz9 * vz9];
              };
              const A9 = prj9(pts9[0]), B9 = prj9(pts9[1]);
              if (Math.hypot(A9[0], A9[1]) > 0.009
                  || Math.hypot(B9[0], B9[1]) > 0.009) continue;
              if (Math.hypot(A9[0] - B9[0], A9[1] - B9[1]) < 0.00015) {
                continue; // degenerate sliver; the WELD is the real law
              }
              mids.push([A9, B9]);
            }
            if (mids.length < 8) {
              routeRingBinsMin = 0; routeRingBandMin = 0;
              routeRingLoopOk = false;
              continue;
            }
            // WELD (r12): the segments must contain a closed loop
            // around the axis — chains are grown from every unused
            // seed until one CLOSES with winding ±1, length 8-16 mm
            // (the 1.6 mm tube's circumference + facet slack), >= 8
            // segments, every loop vertex inside the radial band.
            // Leftover segments are the legitimate SECOND CUT of the
            // same curving tube by the unbounded station plane (two
            // mirror stations read a partial re-cross inside the 9 mm
            // ball); a flat band plus grazing specks can never weld
            // any such loop.
            {
              let loopFound = false;
              let loopChain = null;
              const usedG = new Array(mids.length).fill(false);
              for (let seed = 0; seed < mids.length && !loopFound;
                seed++) {
                if (usedG[seed]) continue;
                const used = usedG.slice();
                used[seed] = true;
                const chain = [mids[seed][0], mids[seed][1]];
                let extended = true;
                while (extended) {
                  extended = false;
                  const tail9 = chain[chain.length - 1];
                  for (let k9 = 0; k9 < mids.length; k9++) {
                    if (used[k9]) continue;
                    const [Pa9, Pb9] = mids[k9];
                    if (Math.hypot(Pa9[0] - tail9[0],
                        Pa9[1] - tail9[1]) < 0.0003) {
                      chain.push(Pb9); used[k9] = true; extended = true;
                      break;
                    }
                    if (Math.hypot(Pb9[0] - tail9[0],
                        Pb9[1] - tail9[1]) < 0.0003) {
                      chain.push(Pa9); used[k9] = true; extended = true;
                      break;
                    }
                  }
                }
                const closes = Math.hypot(
                  chain[chain.length - 1][0] - chain[0][0],
                  chain[chain.length - 1][1] - chain[0][1]) < 0.0003;
                let wind = 0, clen = 0, inBand = true;
                for (let k9 = 0; k9 + 1 < chain.length; k9++) {
                  const a9 = Math.atan2(chain[k9][1], chain[k9][0]);
                  const b9 = Math.atan2(chain[k9 + 1][1],
                    chain[k9 + 1][0]);
                  let d9 = b9 - a9;
                  while (d9 > Math.PI) d9 -= 2 * Math.PI;
                  while (d9 < -Math.PI) d9 += 2 * Math.PI;
                  wind += d9;
                  clen += Math.hypot(chain[k9 + 1][0] - chain[k9][0],
                    chain[k9 + 1][1] - chain[k9][1]);
                }
                for (const [pu9, pv9] of chain) {
                  const rr9 = Math.hypot(pu9, pv9);
                  if (rr9 < 0.0008 || rr9 > 0.0035) { inBand = false; break; }
                }
                const winds = Math.abs(Math.abs(wind) - 2 * Math.PI)
                  < 0.35;
                if (closes && winds && inBand
                    && chain.length - 1 >= 8
                    && clen >= 0.008 && clen <= 0.016) {
                  loopFound = true;
                  loopChain = chain;
                } else {
                  // seed's chain failed; mark only the seed consumed so
                  // other seeds can retry the remaining segments
                  usedG[seed] = true;
                }
              }
              if (!loopFound) {
                routeRingLoopOk = false;
                routeRingBinsMin = 0;
                routeRingBandMin = 0;
                continue;
              }
              const bins = new Set();
              let radialOk = 0;
              for (const [pu, pv] of loopChain) {
                const rr9 = Math.hypot(pu, pv);
                if (rr9 >= 0.0008 && rr9 <= 0.0035) radialOk += 1;
                bins.add(Math.floor(
                  ((Math.atan2(pv, pu) + Math.PI) / (2 * Math.PI)) * 12)
                  % 12);
              }
              if (bins.size < routeRingBinsMin) {
                routeRingBinsMin = bins.size;
              }
              const bandFrac = radialOk / loopChain.length;
              if (bandFrac < routeRingBandMin) {
                routeRingBandMin = bandFrac;
              }
            }
          }
          if (arr.rawN < routeMinVerts) routeMinVerts = arr.rawN;
          if (arr.rawN > routeMaxVerts) routeMaxVerts = arr.rawN;
          if ((arr.tris || 0) < routeMinTris) routeMinTris = arr.tris || 0;
          if ((arr.area || 0) < routeMinArea) routeMinArea = arr.area || 0;
          if ((arr.tris || 0) > routeMaxTris) routeMaxTris = arr.tris || 0;
          if ((arr.area || 0) > routeMaxArea) routeMaxArea = arr.area || 0;
          if ((arr.refN || 0) < routeMinRefVerts) {
            routeMinRefVerts = arr.refN || 0;
          }
          let cMax = 0;
          for (let i2 = 0; i2 <= 24; i2++) {
            const s7 = bez(curves[c9][0], curves[c9][1], curves[c9][2],
              curves[c9][3], i2 / 24);
            let best = Infinity;
            for (const v7 of arr) {
              const d7 = Math.hypot(v7[0] - s7[0], v7[1] - s7[1],
                v7[2] - s7[2]);
              if (d7 < best) best = d7;
            }
            if (best > routeMax) routeMax = best;
            if (best > cMax) cMax = best;
          }
          // stray-branch bound: every component vertex near ITS curve
          let stray = 0;
          for (const v7 of arr) {
            let bd = Infinity;
            for (const s8 of dense[c9]) {
              const d9 = Math.hypot(v7[0] - s8[0], v7[1] - s8[1],
                v7[2] - s8[2]);
              if (d9 < bd) bd = d9;
            }
            if (bd > stray) stray = bd;
          }
          if (stray > routeStray) routeStray = stray;
          routeDbg.push([sxC, szC, c9,
            Math.round(cMax * 1e5) / 100, arr.length,
            Math.round(stray * 1e5) / 100]);
        }
      }
      if (!Number.isFinite(routeMax)) routeMax = 9999;
      if (!Number.isFinite(routeMinVerts)) routeMinVerts = 0;
      if (!Number.isFinite(routeMinTris)) routeMinTris = 0;
      if (!Number.isFinite(routeMinArea)) routeMinArea = 0;
      if (!Number.isFinite(routeMinRefVerts)) routeMinRefVerts = 0;
      if (!Number.isFinite(routeRingBinsMin)) routeRingBinsMin = 0;
      if (!Number.isFinite(routeRingBandMin)) routeRingBandMin = 0;
    }
    // ---------- F8 (W13, gate r16 P1-1 (i)/(ii)): skirt PROUDNESS —
    // S7b-class sightlines (el 17.5°) aimed at the bell across its span
    // and its full band-zone height must FIRST-HIT the cream bell
    // (obPocketCap, or its meet-line stitch ring), never the casting.
    // On the rev-18 construction the casting band's front face
    // (r 0.128–0.174 from the cup) interposed for every target below
    // y ≈ +0.037 off-diagonal — the measured ≈ 70 px exposed-gold
    // stratum and the "curtain recessed in a niche" read.
    const f8 = { rays: 0, cream: 0, firstBad: null };
    {
      const el = (17.5 * Math.PI) / 180;
      const diag8 = Math.atan2(Math.sign(cup.x), Math.sign(cup.z));
      const rBell = 0.0965;
      const vis8 = (o8) => {
        for (let p8 = o8; p8; p8 = p8.parent) {
          if (p8.visible === false) return false;
        }
        return true;
      };
      for (const az of [-0.45, -0.30, -0.15, 0, 0.15, 0.30, 0.45]) {
        for (const yT of [0.044, 0.036, 0.028, 0.020, 0.005, -0.020,
          -0.050]) {
          const a8 = diag8 + az;
          const dx8 = Math.sin(a8), dz8 = Math.cos(a8);
          const r0 = 0.5;
          const y0 = yT + Math.tan(el) * (r0 - rBell);
          rc.set(new THREE.Vector3(cup.x + r0 * dx8, y0, cup.z + r0 * dz8),
            new THREE.Vector3(-dx8 * Math.cos(el), -Math.sin(el),
              -dz8 * Math.cos(el)).normalize());
          const h8 = rc.intersectObjects(scene.children, true)
            .filter((k8) => k8.object.isMesh && vis8(k8.object))[0];
          const n8 = h8 ? h8.object.name || '?' : 'none';
          f8.rays++;
          if (n8 === 'obPocketCap' || n8 === 'obPocketStitch'
            || n8 === 'obPocketEmboss') { // W14 E19: emboss = leather
            f8.cream++;
          } else if (!f8.firstBad) {
            f8.firstBad = { az, yT, hit: n8 };
          }
        }
      }
    }
    return JSON.stringify({
      f8,
      f1: { vertexSpanDeg: vertexSpan, dbg: dbg1 },
      f2: { crownBow_mm: Math.round(F2bow.mean * 1e4) / 10,
        minBow_mm: Math.round(F2bow.min * 1e4) / 10,
        bows_mm: F2bow.bows, rays: F2bow.rays },
      f3: { tipL_deg: Math.round(F3a.best * 10) / 10,
        tipE_deg: Math.round(F3b.best * 10) / 10,
        cnts: [F3a.cnt, F3b.cnt] },
      f4: { wrapMaxY_mm: Math.round(wrapMaxY * 1e5) / 100 },
      f5: { checked: f5Checked, unsupported: f5Bad, firstBad: f5BadAt },
      f6: { checked: f6Checked, bad: f6Bad, firstBad: f6BadAt },
      f7: { wireReach_mm: Math.round(wireReach * 1e5) / 100,
        routeMax_mm: Math.round(routeMax * 1e5) / 100,
        routeStray_mm: Math.round(routeStray * 1e5) / 100,
        routeRodCountOk,
        routeMinVerts, routeMaxVerts, routeMinTris,
        routeMaxTris,
        routeMinArea_mm2: Math.round(routeMinArea * 1e10) / 1e4,
        routeMaxArea_mm2: Math.round(routeMaxArea * 1e10) / 1e4,
        routeMinRefVerts,
        routeRingBinsMin,
        routeRingBandMin: Math.round(routeRingBandMin * 1e4) / 1e4,
        routeRingLoopOk,
        routePerRod: routeDbg,
        wireReachQ_mm: wireReachQ.map((v6) => Math.round(v6 * 1e5) / 100),
        strapQuads, strapIronOk, ironQuads: ironQuads.size },
    });
  })()`, true);
  const r = JSON.parse(m);
  // W14 RETIRE-WITH-CITATION (signed drawing GH489-EXT-R1.2, vs-rev-19
  // delete table; owner sign-off #489): the rail-height corner casting
  // is DELETED — 角部无第三块体, the leather horseshoe IS the corner. The
  // F1 subject (the casting-top silhouette) retires; its anti-razor
  // spirit lives in the drawing gate (asmodeled-489 E13/E25/E28 +
  // collar.convex/hem.circle profile legs, red-proofed). The bar stays
  // executable + red-armed as the ABSENCE law: rev-19 counts 8 casting
  // shoulders + 8 black liners here.
  bar('F1 corner casting ABSENT (W14: deleted per GH489-EXT-R1.2; the '
    + 'silhouette law transferred to the drawing gate) + any residual '
    + 'rail-top field stays moulded ≤ 26°',
    r.f1.dbg.castingMeshes === 0 && r.f1.vertexSpanDeg <= 26,
    `casting/liner meshes ${r.f1.dbg.castingMeshes} (must be 0), residual `
    + `support span ${r.f1.vertexSpanDeg}°`);
  bar('F2 saddle crown convexity: dome bow ≥ 2.0 mm mean AND ≥ 1.5 mm '
    + 'per ray, full 13-ray fan (review W11 r11/r12: a mean can hide '
    + 'flat rays — 7 healthy + 6 flat still averaged 2.05)',
    r.f2.crownBow_mm >= 2.0 && r.f2.rays === 13 && r.f2.minBow_mm >= 1.5,
    `mean crown bow ${r.f2.crownBow_mm} mm, min ${r.f2.minBow_mm} mm `
    + `across ${r.f2.rays}/13 fan rays `
    + '(rev-16 flat washer ≈ 0.3 mm; moulded GCL/Star saddle class)');
  bar('F3 jaw ends rounded ≤ 60°/7 mm (no chisel points)',
    r.f3.tipL_deg > 0.1 && r.f3.tipL_deg <= 60
    && r.f3.tipE_deg > 0.1 && r.f3.tipE_deg <= 60,
    `cloth footprint max turns ${r.f3.tipL_deg}° / ${r.f3.tipE_deg}° at the `
    + `kernel tips, blob cells ${r.f3.cnts.join('/')} `
    + '(rev-16 pointed wedges ≥ 75°)');
  bar('F4 drape ceiling ≤ 47.1 mm (at/under the rail plane — the shipped '
    + 'clearance law governs; review W11 r1 P2)',
    r.f4.wrapMaxY_mm > 0 && r.f4.wrapMaxY_mm <= 47.1,
    `obSnkJawWrap max vertex y ${r.f4.wrapMaxY_mm} mm (pre-fix roof 47.8)`);
  bar('F5 drape vertices above the wall class stand over rail-height '
    + 'wood or inside the certified obstacle window (flush-dressing '
    + 'law; review W11 r6/r7)',
    r.f5.checked > 0 && r.f5.unsupported === 0,
    `${r.f5.checked} vertices > 43.85 mm, ${r.f5.unsupported} unsupported`
    + (r.f5.firstBad ? ` (first at ${JSON.stringify(r.f5.firstBad)})` : ''));
  bar('F6 no wrap vertex in the wood-plane depth dead band (0.0452, '
    + '0.0474) outside the obstacle window (W13 structural law — the '
    + 'W12 flush-dress boundary subject retired with the P2-5 '
    + 'under-wood dive; the z-fight staircase class, red on rev-18)',
    r.f6.checked > 1000 && r.f6.bad === 0,
    `${r.f6.bad} dead-band vertices outside the window of `
    + `${r.f6.checked} checked`
    + (r.f6.firstBad ? ` (first at ${JSON.stringify(r.f6.firstBad)})` : ''));
  bar('F7 wire rods RUN to a rail strap: reach ≥ 250 mm from the cup in '
    + 'EVERY corner quadrant + straps 4/4 + strap irons 4/4 + ROUTE '
    + 'correspondence ≤ 11 mm to the pinned reference-true curve '
    + '(W12 gate r15 P2-4 — the rev-17 wires bowed back onto the ring '
    + 'as J-clamp shapes; W13-FINISH review r3 P1: the posegate '
    + 'rod_run_lit bar samples this exact curve, so the live geometry '
    + 'must ride it — a route revert can never pass on hardcoded '
    + 'points)',
    r.f7.wireReach_mm >= 250 && r.f7.strapQuads === 4 && r.f7.strapIronOk
    && r.f7.routeRodCountOk && r.f7.routeMax_mm <= 11
    && r.f7.routeStray_mm <= 11 && r.f7.routeMinVerts >= 300
    && r.f7.routeMaxVerts <= 350
    && r.f7.routeMinTris >= 500 && r.f7.routeMaxTris <= 700
    && r.f7.routeMinArea_mm2 >= 2000 && r.f7.routeMaxArea_mm2 <= 4500
    && r.f7.routeMinRefVerts >= 300 && r.f7.routeRingBinsMin >= 9
    && r.f7.routeRingBandMin >= 0.9 && r.f7.routeRingLoopOk === true,
    `min quadrant wire reach ${r.f7.wireReach_mm} mm `
    + `(per-quadrant ${r.f7.wireReachQ_mm.join('/')}), straps in `
    + `${r.f7.strapQuads}/4 quadrants, strap irons in `
    + `${r.f7.ironQuads}/4` + (r.f7.strapIronOk ? '' : ' — MISSING')
    + `, route max ${r.f7.routeMax_mm} mm / stray `
    + `${r.f7.routeStray_mm} mm to the pinned curve (physical rod `
    + `components 1:1 x 16${r.f7.routeRodCountOk ? '' : ' — COUNT BAD'}`
    + `, min ${r.f7.routeMinVerts} component verts / `
    + `verts ${r.f7.routeMinVerts}-${r.f7.routeMaxVerts} / `
    + `${r.f7.routeMinTris}-${r.f7.routeMaxTris} unique `
    + `non-degenerate tris / ${r.f7.routeMinArea_mm2}-`
    + `${r.f7.routeMaxArea_mm2} mm2 surface / `
    + `${r.f7.routeMinRefVerts} face-referenced verts / ring `
    + `${r.f7.routeRingBinsMin}/12 bins, band ${r.f7.routeRingBandMin}`
    + `, loop ${r.f7.routeRingLoopOk ? 'CLOSED x1' : 'BROKEN'})`);
  bar('F8 skirt PROUD of the casting: 49/49 el-17.5° sightlines across '
    + 'the bell span × band-zone heights first-hit the cream bell '
    + '(W13 gate r16 P1-1 (i)/(ii) — rev-18: the casting band front at '
    + 'r 0.128-0.174 interposed below y ≈ +0.037 off-diagonal, the '
    + '≈ 70 px exposed-gold stratum)',
    r.f8.rays === 49 && r.f8.cream === 49,
    `${r.f8.cream}/${r.f8.rays} sightlines first-hit `
    + 'obPocketCap/Stitch/Emboss'
    + (r.f8.firstBad ? ` (first non-cream: ${JSON.stringify(r.f8.firstBad)})`
      : ''));
  // F4 (saddle dome falloff on the S1b register raw) lives in the pack
  // instrument — tools/audit/posegate_489.py --w11 <pack> — beside the
  // other pixel-domain bars (PIL/numpy side).
  if (s1bPath) {
    console.log('note: --s1b is measured by posegate_489.py --w11, not here');
  }
  if (outPath) {
    // review W11 r10 P2: the report binds to its measured source tree
    // (the construction-gate provenance schema) — the live 5/5 and the
    // rev-16 red proof must be PROVABLY from the claimed bytes
    const { execSync } = await import('node:child_process');
    const crypto = await import('node:crypto');
    let tree = null;
    let dirty = null;
    let webTree = null;
    try {
      tree = execSync('git rev-parse HEAD', {
        cwd: path.dirname(webDir), encoding: 'utf8' }).trim();
      // review W11 r12 P2: the web/ TREE OBJECT hash — the checker can
      // bind the report to the exact reviewed web bytes (a commit sha
      // alone lets an older green report survive later web regressions)
      webTree = execSync('git rev-parse HEAD:web', {
        cwd: path.dirname(webDir), encoding: 'utf8' }).trim();
      // review W11 r11 P2: a tree sha alone can launder uncommitted
      // source — the report records whether the SERVED web/ is dirty
      dirty = execSync('git status --porcelain -- web/', {
        cwd: path.dirname(webDir), encoding: 'utf8' }).trim() !== '';
    } catch { /* non-git web dir: tree/dirty stay null */ }
    const toolSha = crypto.createHash('sha256').update(
      fs.readFileSync(new URL(import.meta.url).pathname)).digest('hex')
      .slice(0, 12);
    fs.writeFileSync(outPath, JSON.stringify({
      tool: 'tools/render/check-corner-form.mjs', tool_sha12: toolSha,
      web: webDir, tree, web_tree: webTree,
      src_dirty: dirty, expect_red: expectRed,
      fail_count: failures, bars, raw: r }, null, 1));
  }
} finally {
  chrome.close();
  await stopStaticServer(server);
}
if (expectRed) {
  if (failures === 0) {
    console.error('check-corner-form: EXPECTED RED but all bars passed');
    process.exit(1);
  }
  console.log(`check-corner-form: RED as expected (${failures} bars fired)`);
  process.exit(0);
}
if (failures) {
  console.error(`check-corner-form: ${failures} bar(s) FAILED`);
  process.exit(1);
}
console.log('check-corner-form: all bars OK');
