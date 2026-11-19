// Copyright (c) Meta Platforms, Inc. and affiliates.

// legrun-488d.mjs — GH-488D wave A2: a fast, inspectable replica of the
// e2e-lighting GH-488 T1b-legs measurement.
//
// Why this exists. T1b-legs went RED on this branch (corner jaws 0.388 /
// 0.395 against the >= 0.40 acceptance) where the pre-wave tree measured
// 0.476 / 0.430. The full lighting suite is the authority, but it takes
// minutes per run and prints ONE number per jaw, so it cannot say WHICH
// stations dropped out of the leg band or what they are looking at. Three
// suite runs at three different casting/flange env gains returned byte-
// identical jaw ratios, which rules out both of those materials and leaves
// the question open. This tool answers it: same camera, same station walk,
// same luminance band, plus the per-station profile.
//
// The in-page measurement below is the gate's own eval (e2e-lighting.mjs
// :1854-:1975) reproduced so the numbers are comparable by construction;
// the ONLY additions are that it returns the per-station luminance array
// and the band edges. e2e-lighting.mjs is out of scope for edits in this
// wave, so replicating rather than instrumenting it is deliberate.
//
// Usage:
//   node tools/render/legrun-488d.mjs [--jaw corner|side|both]
//     [--profile] [--cloth steel_gray]
// Ports: OB_E2E_PORT/OB_E2E_CDP_PORT pin, else the 488d lane band 24830-9929.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const webDir = path.join(REPO, 'web');
const cdp = await import(path.join(webDir, 'tools', 'cdp.mjs'));
const {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
} = cdp;

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const { stringOpt: __s } = await import('./lib/argv.mjs');
const JAW = __s('--jaw', { default: 'both', tag: 'legrun-488d' }); // FIX2: handles --jaw=side, refuses a blank
if (!['corner', 'side', 'both'].includes(JAW)) { console.error(`[legrun-488d] REFUSED — unknown --jaw '${JAW}' (corner | side | both)`); process.exit(2); } // FIX2: any other value measured nothing
const PROFILE = argv.includes('--profile');
// The gate judges the legs after switching the cloth to steel_gray, and the
// station band is defined against the cloth luminance it finds, so the cloth
// is part of the measurement rather than a backdrop.
const CLOTH = argOf('--cloth', 'steel_gray');

const CORNER_SEL = `G.pockets.filter((q) => q.corner)
  .sort((a, b) => Math.hypot(a.x - 1.295, a.z - 0.66)
    - Math.hypot(b.x - 1.295, b.z - 0.66))[0]`;
const SIDE_SEL = `G.pockets.filter((q) => !q.corner)
  .sort((a, b) => Math.hypot(a.x, a.z - 0.69)
    - Math.hypot(b.x, b.z - 0.69))[0]`;

const measure = (shotB64, cornerSel) => `(async () => {
  const THREE = await import('./vendor/three.module.min.js');
  const { makeGeom, activeTableId, railPolysFor, cushionPlanCtx }
    = await import('./scene/table.js');
  const G = makeGeom(activeTableId());
  const { camera } = window.__dbg;
  const zN = G.kernel.noseHeightFrac * G.render.profileBallD;
  const p = ${cornerSel};
  if (!p) return { err: 'no pocket' };
  const kx0 = p.z + G.W / 2, ky0 = p.x + G.L / 2;
  const chains = [];
  for (const poly of railPolysFor(G)) {
    const ctx = cushionPlanCtx(G, poly);
    for (let i = 0; i < ctx.M; i++) {
      if (!ctx.front[i] || ctx.noseEdge[i]) continue;
      const prev = (i - 1 + ctx.M) % ctx.M;
      if (ctx.front[prev] && !ctx.noseEdge[prev]) continue;
      const edges = []; let e = i;
      while (ctx.front[e] && !ctx.noseEdge[e]) {
        edges.push(e); e = (e + 1) % ctx.M;
      }
      if (Math.hypot(poly[edges[0]][0] - kx0, poly[edges[0]][1] - ky0) > 0.2
        && Math.hypot(poly[e][0] - kx0, poly[e][1] - ky0) > 0.2) continue;
      const tipAtStart = ctx.noseEdge[(edges[0] - 1 + ctx.M) % ctx.M];
      chains.push({ poly, ctx, edges, tipAtStart });
    }
  }
  if (chains.length !== 2) return { err: 'chains ' + chains.length };
  const img = new Image(); img.src = 'data:image/png;base64,${shotB64}';
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const g2 = cv.getContext('2d'); g2.drawImage(img, 0, 0);
  const px = g2.getImageData(0, 0, img.width, img.height).data;
  const lumAt = (wx, wy, wz) => {
    const w = new THREE.Vector3(wx, wy, wz).project(camera);
    const sx = Math.round((w.x * 0.5 + 0.5) * img.width);
    const sy = Math.round((-w.y * 0.5 + 0.5) * img.height);
    if (sx < 1 || sy < 1 || sx >= img.width - 1 || sy >= img.height - 1) return null;
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const k = ((sy + dy) * img.width + (sx + dx)) * 4;
        s += 0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]; n++;
      }
    }
    return s / n;
  };
  const scr = (wx, wy, wz) => {
    const w = new THREE.Vector3(wx, wy, wz).project(camera);
    return [(w.x * 0.5 + 0.5) * img.width, (-w.y * 0.5 + 0.5) * img.height];
  };
  const world = (K) => [K[1] - G.L / 2, K[0] - G.W / 2];
  const tipOf = (ch) => {
    const e0 = ch.edges[0], eL = ch.edges[ch.edges.length - 1];
    return ch.tipAtStart ? ch.poly[e0] : ch.poly[(eL + 1) % ch.ctx.M];
  };
  const [ax2, az2] = world(tipOf(chains[0]));
  const [bx2, bz2] = world(tipOf(chains[1]));
  const sA = scr(ax2, zN, az2), sB = scr(bx2, zN, bz2);
  const mouthPx = Math.hypot(sB[0] - sA[0], sB[1] - sA[1]);
  const cav = lumAt(p.x, -0.03, p.z);
  const out = { mouthPx, cavity: cav, jaws: [] };
  // Which mesh family owns each station's pixel. The gate cannot ask this;
  // without it a station that drops out of the band is just a number.
  const ray = new THREE.Raycaster();
  const famAt = (wx, wy, wz) => {
    const w = new THREE.Vector3(wx, wy, wz).project(camera);
    ray.setFromCamera(new THREE.Vector2(w.x, w.y), camera);
    const h = ray.intersectObjects(window.__dbg.scene.children, true)
      .find((hh) => hh.object.isMesh && !hh.object.material?.transparent);
    if (!h) return '-';
    const n = h.object.name || '(anon)';
    return /^dm-/.test(n) ? 'dm-' + n.slice(3).split('-')[0] : n;
  };
  for (const ch of chains) {
    const { poly, ctx, edges, tipAtStart } = ch;
    const ordered = tipAtStart ? edges : edges.slice().reverse();
    const stations = [];
    let acc = 0;
    for (const e of ordered) {
      const A = tipAtStart ? poly[e] : poly[(e + 1) % ctx.M];
      const B = tipAtStart ? poly[(e + 1) % ctx.M] : poly[e];
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]) * 1000;
      const en = ctx.en[e];
      for (let t = 0; t < len; t += 1) {
        const f = t / len;
        stations.push({
          t: acc + t,
          kx: A[0] + (B[0] - A[0]) * f + en[0] * 0.006,
          ky: A[1] + (B[1] - A[1]) * f + en[1] * 0.006,
        });
      }
      acc += len;
    }
    const lums = stations.map((st) => {
      const [wx, wz] = world([st.kx, st.ky]);
      return lumAt(wx, zN + 0.0048, wz);
    });
    const sorted = lums.filter((v) => v !== null).slice().sort((a, b) => b - a);
    const cloth = sorted.slice(0, 10).reduce((a, b) => a + b, 0)
      / Math.max(1, Math.min(10, sorted.length));
    let best = [0, 0], cur = null;
    for (let k = 0; k < lums.length; k++) {
      const v = lums[k];
      const isLeg = v !== null && v >= cav + 20 && v <= cloth - 40;
      if (isLeg) { if (!cur) cur = [k, k]; else cur[1] = k; }
      if ((!isLeg || k === lums.length - 1) && cur) {
        if (cur[1] - cur[0] > best[1] - best[0]) best = cur;
        cur = null;
      }
    }
    const wA = world([stations[best[0]].kx, stations[best[0]].ky]);
    const wB = world([stations[best[1]].kx, stations[best[1]].ky]);
    const pA = scr(wA[0], zN + 0.0048, wA[1]);
    const pB = scr(wB[0], zN + 0.0048, wB[1]);
    const runPx = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
    const legL = lums.slice(best[0], best[1] + 1).filter((v) => v !== null);
    const fams = ${PROFILE} ? stations.map((st) => {
      const [wx, wz] = world([st.kx, st.ky]);
      return famAt(wx, zN + 0.0048, wz);
    }) : [];
    out.jaws.push({
      ratio: runPx / mouthPx,
      legMean: legL.reduce((a, b) => a + b, 0) / Math.max(1, legL.length),
      cloth, lo: cav + 20, hi: cloth - 40, best, n: lums.length,
      lums: ${PROFILE} ? lums.map((v) => (v === null ? null : +v.toFixed(1))) : [],
      fams,
    });
  }
  return out;
})()`;

async function main() {
  let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
  let CDPP = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : null;
  let band = null;
  if (!PORT || !CDPP) {
    band = await claimPortBand(24830, 24859);
    PORT = band.http(0); CDPP = band.cdp(0);
  }
  const server = spawnStaticServer(webDir, PORT);
  await sleep(800);
  let chrome = null;
  try {
    const url = `http://127.0.0.1:${PORT}/app.html?table=diamond_proam_9ft`
      + '&cinema=1&seed=7&look=default';
    chrome = await launchChrome(url, { port: CDPP, width: 1280, height: 800 });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) {
      await sleep(200);
      ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
    }
    if (!ready) throw new Error('app never became ready');
    for (let i = 0; i < 200; i++) {
      const st = await chrome.eval(
        '(() => { const s = window.__gi && window.__gi.state;'
        + ' return s ? JSON.stringify({r: !!s.ready, b: !!s.baked}) : null; })()')
        .catch(() => null);
      if (st && JSON.parse(st).r && JSON.parse(st).b) break;
      await sleep(200);
    }
    await sleep(1500);
    if (CLOTH && CLOTH !== 'none') {
      await chrome.eval(`window.__settings.set('clothColor', ${JSON.stringify(CLOTH)})`);
      await sleep(1600);
    }
    const jobs = [];
    if (JAW === 'corner' || JAW === 'both') {
      jobs.push(['corner', '1.295, 0.90, 0.70, 1.295, 0, 0.66, 30', CORNER_SEL]);
    }
    if (JAW === 'side' || JAW === 'both') {
      jobs.push(['side', '0, 0.90, 0.73, 0, 0, 0.69, 30', SIDE_SEL]);
    }
    for (const [tag, cam, sel] of jobs) {
      await chrome.eval(`__test.camera(${cam})`);
      await sleep(700);
      const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
      const res = await chrome.eval(measure(data, sel));
      if (res.err) { console.log(`[${tag}] ${res.err}`); continue; }
      console.log(`[${tag}] mouthPx ${res.mouthPx.toFixed(1)} `
        + `cavity ${res.cavity?.toFixed(1)}`);
      res.jaws.forEach((j, i) => {
        console.log(`  jaw${i}: ratio ${j.ratio.toFixed(3)} legMean `
          + `${j.legMean.toFixed(1)} cloth ${j.cloth.toFixed(1)} band `
          + `[${j.lo.toFixed(1)}, ${j.hi.toFixed(1)}] run stations `
          + `${j.best[0]}..${j.best[1]} of ${j.n}`);
        if (!PROFILE) return;
        // one line per 2 mm station, with the family that owns the pixel and
        // why the station is in or out of the band
        for (let k = 0; k < j.lums.length; k += 2) {
          const v = j.lums[k];
          const why = v === null ? 'offscreen'
            : (v < j.lo ? 'DARK' : (v > j.hi ? 'BRIGHT' : 'leg'));
          const mark = k >= j.best[0] && k <= j.best[1] ? '*' : ' ';
          console.log(`    ${String(k).padStart(3)}mm${mark} `
            + `${String(v).padStart(6)}  ${why.padEnd(9)} ${j.fams[k] || ''}`);
        }
      });
    }
  } finally {
    if (chrome && chrome.close) await Promise.resolve(chrome.close()).catch(() => {});
    stopStaticServer(server);
    if (band) band.release?.();
  }
}

await main();
