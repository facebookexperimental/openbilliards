// Copyright (c) Meta Platforms, Inc. and affiliates.

// idmask-488d.mjs — GH-488D wave A2 MESH IDENTITY probe.
//
// Every look-line in this wave that was wrong was wrong the same way: a
// patch rectangle aimed BY EYE landed on a different surface than the one
// being claimed (the r6 "apron" and "rail top" patches both landed on
// cloth; the overhead "corner tan wedge" patch landed on cloth). The eye
// cannot be trusted to say WHICH MESH a pixel belongs to, and until the
// naming pass there was no way to ask the scene instead.
//
// There is now. This probe renders the SAME pose twice:
//   base.png   the shipped frame
//   idmap.png  every mesh flat-shaded in a colour that identifies its NAME
//              FAMILY (trailing -index stripped), everything else black
// and writes idmap.json: per-family pixel count, coverage fraction, pixel
// bbox and CENTROID, all in frame fractions. A patch aimed at a centroid
// out of that file cannot land on the wrong surface.
//
// It also answers the inverse question directly:
//   --query x,y[,x,y...]   (frame fractions) -> which family owns that pixel
//
// The flat pass uses MeshBasicMaterial with toneMapped:false, and for the
// id frame every post pass after the base render is switched off, so the
// id colours reach the PNG unmodified. Families are keyed by HUE anyway
// (see ID_APPLY) so the census still reads correctly if a grade survives:
// grading is multiplicative and bloom additive-white, and neither moves
// hue. The shipped materials and pass flags are restored afterwards, but
// the base frame is captured FIRST regardless, so a restore bug can never
// contaminate a measurement.
//
// Usage:
//   node tools/render/idmask-488d.mjs [--register r1_corner_macro]
//     [--pose '{"cam":[..],"look":[..],"fov":34}'] [--out DIR]
//     [--query 0.5,0.4,0.62,0.45] [--width N --height N]
// Poses are the capture-488d-registers.mjs register set (same names, same
// numbers) or an explicit --pose in KERNEL coords.
// Ports: OB_E2E_PORT/OB_E2E_CDP_PORT pin, else the 488d lane band 24740-9929.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, patchStats } from './measure-488d-patch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const webDir = path.join(REPO, 'web');
const cdp = await import(path.join(webDir, 'tools', 'cdp.mjs'));
const {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
} = cdp;

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value

const OUT = path.resolve(__pathOpt('--out', { default: '/tmp/ob-488d-idmask', tag: 'idmask-488d' }));
const W = Number(argOf('--width', 1600));
const H = Number(argOf('--height', 1000));
const REG = __stringOpt('--register', { default: 'r1_corner_macro', tag: 'idmask-488d' });
const POSE_JSON = __stringOpt('--pose', { default: null, tag: 'idmask-488d' });
const QUERY = String(argOf('--query', '')).split(',').map(Number)
  .filter((v) => Number.isFinite(v));
const TABLE = 'diamond_proam_9ft';
const CLOTH = argOf('--cloth', null);

// Register poses — the capture-488d-registers.mjs set verbatim, so an id map
// is always addressed to a frame a look-line was actually shot from.
const HALF_W_OUT = 1.27 / 2 + 0.0508;
const HALF_L_OUT = 2.54 / 2 + 0.0508;
const POSES = {
  r1_corner_macro: { cam: [0.90, 1.53, 0.46], look: [HALF_W_OUT, HALF_L_OUT, 0.01], fov: 34 },
  r2_corner_low: { cam: [1.16, 1.80, 0.155], look: [HALF_W_OUT, HALF_L_OUT, 0.006], fov: 30 },
  r3_side_macro: { cam: [1.06, -0.22, 0.26], look: [HALF_W_OUT, 0.0, 0.02], fov: 30 },
  r4_cushion_nose: { cam: [0.601, -1.95, 0.098], look: [0.601, 0.85, 0.043], fov: 30 },
  r5_railtop: { cam: [1.02, -0.86, 0.34], look: [0.66, 0.10, 0.045], fov: 28 },
  r6_fulltable: { cam: [1.95, -2.72, 1.18], look: [0, 0.10, -0.05], fov: 42 },
  r7_overhead: { overhead: true, height: 14, fov: 11 },
  r8_cabinet: { cam: [1.72, 2.30, 0.06], look: [0.74, 1.36, -0.26], fov: 40 },
  // the orbit-488d.mjs corner bearing 180 (camera over the bed, looking out)
  o_corner_inside: {
    cam: [HALF_W_OUT - 0.56, HALF_L_OUT, 0.37], look: [HALF_W_OUT, HALF_L_OUT, 0.01], fov: 34,
  },
  // the e2e-lighting GH-488 T1 owner pose, verbatim (e2e-lighting.mjs:1295).
  // That gate reads casting/rail as a MEAN LUMA ratio over raycast-classified
  // pixels at this bearing and with steel_gray cloth, and its answer differs
  // from the r1_corner_macro probe's by ~2x, so any casting/rail tuning has to
  // be measured HERE as well as at the macro register.
  t1_owner: { cam: [2.05, 0.30, 0.60], look: [-1.2, -0.18, 0.50], fov: 40 },
  o_side_inside: {
    cam: [HALF_W_OUT - 0.50, 0.0, 0.33], look: [HALF_W_OUT, 0.0, 0.01], fov: 34,
  },
};
const pose = POSE_JSON ? JSON.parse(POSE_JSON) : POSES[REG];
if (!pose) throw new Error(`unknown --register ${REG} (have ${Object.keys(POSES)})`);

const HIDE_UI = `(() => {
  __test.aim(Math.PI * 1.5);
  window.__dbg.scene.traverse((o) => {
    const hex = o.material && o.material.color
      && o.material.color.getHexString && o.material.color.getHexString();
    if (hex === 'dff1ff' || hex === '76afee') o.visible = false;
    if (/^obAim/.test(o.name || '')
      || (o.parent && /^obAim/.test(o.parent.name || ''))) {
      if (o.layers) o.layers.disableAll();
      if (o.material) o.material.visible = false;
    }
  });
  const st = document.createElement('style');
  st.textContent = 'body > :not(canvas) { display: none !important; }';
  document.head.appendChild(st);
  return true;
})()`;

const HIDE_BALLS = `(() => {
  const zero = (o) => { o.scale.setScalar(0); o.updateMatrixWorld(true); };
  const groups = new Set();
  window.__dbg.scene.traverse((o) => {
    if (o.name === 'obCueStick') zero(o);
    if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry'
      && Math.abs(o.position.y) < 0.2 && Math.abs(o.position.x) < 1.6
      && Math.abs(o.position.z) < 0.95) {
      if (o.parent && o.parent !== window.__dbg.scene) groups.add(o.parent);
      else zero(o);
    }
  });
  for (const g of groups) for (const c of g.children) zero(c);
  const gu = window.__gi && window.__gi.uniforms;
  if (gu && gu.uSphereCount) gu.uSphereCount.value = 0;
  return true;
})()`;

// Family = the mesh name with a trailing -<index> or -<pocket tag> stripped,
// e.g. dm-bootsleeve-c0-1 -> dm-bootsleeve, dm-cushion-3 -> dm-cushion.
// Non-dm meshes collapse to one family so they can be excluded as a block.
const ID_APPLY = `(() => {
  const scene = window.__dbg.scene;
  // main.js publishes {scene, renderer, cubeRT, cubeCam, camera} on __dbg —
  // no THREE namespace, and main.js is out of scope for this wave. Source the
  // MeshBasicMaterial constructor from a live instance instead (the pocket
  // contact-shadow and tongue-AO decals are MeshBasicMaterial by
  // construction). Side constants are the three.js numeric enum: 0 front,
  // 1 back, 2 double.
  let Basic = null;
  scene.traverse((o) => {
    if (Basic || !o.isMesh || !o.material || Array.isArray(o.material)) return;
    if (o.material.type === 'MeshBasicMaterial') Basic = o.material.constructor;
  });
  if (!Basic) throw new Error('idmask: no MeshBasicMaterial in scene');
  const fam = (n) => {
    if (!n || !/^dm-/.test(n)) return '(other)';
    return 'dm-' + n.slice(3).split('-')[0];
  };
  // HUE-KEYED palette. \`toneMapped: false\` only bypasses the RENDERER tone
  // map; the app composites through createPostFX (main.js:677), and the flat
  // ids come out of that chain graded and bloomed — a first cut with a
  // 51-step RGB palette read back #009900 as #00ab02 and every exact-hex
  // lookup missed. Grading here is multiplicative and bloom is additive
  // white, and NEITHER moves hue, so the id is carried by hue alone at full
  // S and V; the census classifies by nearest hue with S/V gates.
  const hsv2rgb = (h) => {
    const c = 255, x = Math.round(255 * (1 - Math.abs(((h / 60) % 2) - 1)));
    const k = Math.floor(h / 60) % 6;
    return [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
  };
  // Transparent films (contact shadow, tongue AO) are NOT surfaces: painting
  // them opaque would hide the cloth underneath and answer the wrong
  // question. They are suppressed for the id pass and reported as such.
  const opaque = [];
  const filmFams = new Set();
  const hidden = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mat0 = Array.isArray(o.material) ? o.material[0] : o.material;
    if (mat0 && mat0.transparent) {
      filmFams.add(fam(o.name));
      hidden.push([o, o.visible]);
      o.visible = false;
      return;
    }
    opaque.push([o, mat0]);
  });
  // stable order so a rerun yields the same legend
  const keys = [...new Set(opaque.map(([o]) => fam(o.name)))].sort();
  const hueOf = new Map(keys.map((k, i) => [k, (i * 360) / keys.length]));
  const saved = [];
  for (const [o, mat0] of opaque) {
    const c = hsv2rgb(hueOf.get(fam(o.name)));
    saved.push([o, o.material]);
    o.material = new Basic({
      color: (c[0] << 16) | (c[1] << 8) | c[2],
      toneMapped: false, fog: false, transparent: false, opacity: 1,
      side: Array.isArray(o.material) ? 2 : (mat0.side ?? 0),
      depthTest: true, depthWrite: true,
    });
  }
  // Post passes off for the id frame. createPostFX (main.js:677) grades and
  // blooms the composite; bloom in particular smears one family's colour
  // over its neighbour's pixels, which is exactly the ambiguity this probe
  // exists to remove. Pass 0 is the scene render — everything after it is
  // the look, and the look is not wanted here.
  const passes = (window.__dbg.composer && window.__dbg.composer.passes) || [];
  const passFlags = passes.map((p) => p.enabled);
  for (let i = 1; i < passes.length; i++) passes[i].enabled = false;
  window.__idmask = { saved, hidden, passes, passFlags };
  const legend = {};
  for (const [k, h] of hueOf) {
    const c = hsv2rgb(h);
    legend[k] = {
      hue: h,
      hex: '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''),
    };
  }
  return JSON.stringify({ legend, films: [...filmFams] });
})()`;

const ID_RESTORE = `(() => {
  const st = window.__idmask;
  if (!st) return false;
  for (const [o, m] of st.saved) {
    if (o.material && o.material.dispose) o.material.dispose();
    o.material = m;
  }
  for (const [o, v] of st.hidden) o.visible = v;
  if (st.passes) st.passes.forEach((p, i) => { p.enabled = st.passFlags[i]; });
  window.__idmask = null;
  return true;
})()`;

const waitFrame = (chrome) => chrome.eval(
  'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');

async function shot(chrome, file) {
  const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}

async function main() {
  let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
  let CDPP = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : null;
  let band = null;
  if (!PORT || !CDPP) {
    band = await claimPortBand(24740, 24769);
    PORT = band.http(0); CDPP = band.cdp(0);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawnStaticServer(webDir, PORT);
  await sleep(800);
  let chrome = null;
  try {
    const url = `http://127.0.0.1:${PORT}/app.html?table=${TABLE}`
      + '&cinema=1&seed=7&look=default';
    chrome = await launchChrome(url, { port: CDPP, width: W, height: H });
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: W, height: H, deviceScaleFactor: 1, mobile: false });
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
    await sleep(1200);
    if (CLOTH) {
      // The T1 owner pose is judged with steel_gray cloth, and the cloth is
      // the dominant content in the env probe, so the wood env wash it feeds
      // the rail and the casting is NOT the same one the default blue feeds.
      // Measuring the gate's ratio therefore has to reproduce the gate's
      // cloth, not just its bearing.
      await chrome.eval(`window.__settings.set('clothColor', ${JSON.stringify(CLOTH)})`);
      await sleep(1600); // debounced cloth rebake + regrade settle
    }
    await chrome.eval(HIDE_UI);
    await chrome.eval(HIDE_BALLS);
    await sleep(300);

    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(pose)})`);
      if (!ok) await sleep(200);
    }
    if (!ok) throw new Error('cameraPose rejected');
    await waitFrame(chrome);
    await sleep(450);
    await waitFrame(chrome);
    // base FIRST: a restore bug can never contaminate the shipped frame
    await shot(chrome, path.join(OUT, 'base.png'));

    const idInfo = JSON.parse(await chrome.eval(ID_APPLY));
    const { legend, films } = idInfo;
    await waitFrame(chrome);
    await sleep(200);
    await waitFrame(chrome);
    await shot(chrome, path.join(OUT, 'idmap.png'));
    await chrome.eval(ID_RESTORE);

    // ---- census -----------------------------------------------------------
    // Classify by HUE (see the palette note in ID_APPLY). Gates: a pixel is
    // only claimed when it is bright and chromatic enough for its hue to
    // mean something; everything else is reported honestly as background or
    // unresolved (antialiased/bloomed boundaries between two families land
    // between their hues and MUST NOT be silently assigned to one of them).
    const img = readPng(path.join(OUT, 'idmap.png'));
    const fams = Object.keys(legend);
    const hues = fams.map((f) => legend[f].hue);
    const halfStep = 180 / fams.length;
    const classify = (r, g, b) => {
      const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
      const d = mx - mn;
      if (mx < 0.06) return '(background)';
      if (d / mx < 0.30) return '(background)';
      const rr = r / 255, gg = g / 255, bb = b / 255;
      let h;
      if (mx === rr) h = 60 * (((gg - bb) / d) % 6);
      else if (mx === gg) h = 60 * ((bb - rr) / d + 2);
      else h = 60 * ((rr - gg) / d + 4);
      if (h < 0) h += 360;
      let best = -1, bestD = 1e9;
      for (let i = 0; i < hues.length; i++) {
        let dh = Math.abs(h - hues[i]);
        if (dh > 180) dh = 360 - dh;
        if (dh < bestD) { bestD = dh; best = i; }
      }
      return bestD <= halfStep * 0.9 ? fams[best] : '(unresolved)';
    };
    const base = readPng(path.join(OUT, 'base.png'));
    const acc = new Map();
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        const i = (y * img.w + x) * img.ch;
        const f = classify(img.data[i], img.data[i + 1], img.data[i + 2]);
        let a = acc.get(f);
        if (!a) {
          a = { n: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, sx: 0, sy: 0,
                hr: new Uint32Array(256), hg: new Uint32Array(256),
                hb: new Uint32Array(256), hv: new Uint32Array(256), sl: 0 };
          acc.set(f, a);
        }
        a.n++; a.sx += x; a.sy += y;
        // Masked histograms of the SHIPPED frame. A family's look-line is a
        // statistic over its own pixels, not a reading at one point: the
        // centroid of a ring or a dashed arc need not even lie on it.
        const br = base.data[(y * base.w + x) * base.ch];
        const bg = base.data[(y * base.w + x) * base.ch + 1];
        const bb = base.data[(y * base.w + x) * base.ch + 2];
        a.hr[br]++; a.hg[bg]++; a.hb[bb]++;
        a.hv[Math.max(br, bg, bb)]++;
        a.sl += 0.2126 * br + 0.7152 * bg + 0.0722 * bb;
        if (x < a.x0) a.x0 = x; if (x > a.x1) a.x1 = x;
        if (y < a.y0) a.y0 = y; if (y > a.y1) a.y1 = y;
      }
    }
    const total = img.w * img.h;
    const rows = [...acc.entries()].map(([family, a]) => {
      const cx = a.sx / a.n / img.w, cy = a.sy / a.n / img.h;
      // A concave silhouette can put its centroid off itself, so the shipped
      // reading is only reported when the centroid pixel really belongs to
      // the family — an unflagged off-family centroid is exactly the
      // hand-aiming failure this tool exists to end.
      const px = Math.round(cx * img.w), py = Math.round(cy * img.h);
      const pi = (py * img.w + px) * img.ch;
      const onSelf = classify(img.data[pi], img.data[pi + 1], img.data[pi + 2]) === family;
      const st = patchStats(base, cx - 0.003, cy - 0.003, 0.006, 0.006);
      const q = (h, f) => { let c = 0; const t = a.n * f;
        for (let i = 0; i < 256; i++) { c += h[i]; if (c >= t) return i; } return 255; };
      const hx = (v) => v.toString(16).padStart(2, '0');
      const mr = q(a.hr, 0.5), mg = q(a.hg, 0.5), mb = q(a.hb, 0.5);
      const mmx = Math.max(mr, mg, mb), mmn = Math.min(mr, mg, mb);
      return {
        family, hex: legend[family] ? legend[family].hex : null,
        hue: legend[family] ? legend[family].hue : null,
        px: a.n, cover: a.n / total,
        bbox: [a.x0 / img.w, a.y0 / img.h, (a.x1 + 1) / img.w, (a.y1 + 1) / img.h],
        centroid: [cx, cy], centroidOnSelf: onSelf,
        shipped: onSelf ? { hex: st.hex, h: st.h, s: st.s, v: st.v } : null,
        mask: {
          medHex: `#${hx(mr)}${hx(mg)}${hx(mb)}`,
          medS: mmx ? (mmx - mmn) / mmx : 0,
          medV: q(a.hv, 0.5) / 255,
          p15V: q(a.hv, 0.15) / 255,
          p85V: q(a.hv, 0.85) / 255,
          maxV: q(a.hv, 0.999) / 255,
          // mean luma 0-255, the e2e-lighting T1 metric exactly
          meanLum: a.sl / a.n,
        },
      };
    }).sort((a, b) => b.px - a.px);
    fs.writeFileSync(path.join(OUT, 'idmap.json'),
      JSON.stringify({ register: REG, pose, legend, films, rows }, null, 2));

    console.log(`# idmask ${REG}  ${img.w}x${img.h}  -> ${OUT}`);
    if (films.length) console.log(`# suppressed films: ${films.join(', ')}`);
    console.log('family                 cover   medHex    medS   p15V  medV  p85V  maxV'
      + '  meanLum  centroid');
    for (const r of rows) {
      if (r.px < 40) continue;
      const m = r.mask;
      const c = `${r.centroid[0].toFixed(3)},${r.centroid[1].toFixed(3)}`
        + (r.centroidOnSelf ? '' : '*');
      console.log(`${r.family.padEnd(22)} ${(r.cover * 100).toFixed(2).padStart(6)}%  `
        + `${m.medHex}  ${m.medS.toFixed(3)}  ${m.p15V.toFixed(3)} ${m.medV.toFixed(3)} `
        + `${m.p85V.toFixed(3)} ${m.maxV.toFixed(3)}  `
        + `${m.meanLum.toFixed(1).padStart(5)}  ${c}`);
    }
    console.log('# * = centroid does not lie on its own family (concave silhouette)');
    for (let q = 0; q + 1 < QUERY.length; q += 2) {
      const x = Math.round(QUERY[q] * img.w), y = Math.round(QUERY[q + 1] * img.h);
      const i = (y * img.w + x) * img.ch;
      const st = patchStats(base, QUERY[q] - 0.002, QUERY[q + 1] - 0.002, 0.004, 0.004);
      console.log(`[query] ${QUERY[q].toFixed(3)},${QUERY[q + 1].toFixed(3)} -> `
        + `${classify(img.data[i], img.data[i + 1], img.data[i + 2])}  `
        + `shipped ${st.hex} S ${st.s.toFixed(3)} V ${st.v.toFixed(3)}`);
    }
  } finally {
    if (chrome) {
      const gone = await chrome.closeAndWait();
      if (gone === false) console.error('WARN: chrome teardown unconfirmed');
    }
    await stopStaticServer(server);
    if (band && band.release) await band.release();
  }
}

await main();
