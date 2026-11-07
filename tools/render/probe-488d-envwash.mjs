// Copyright (c) Meta Platforms, Inc. and affiliates.

// probe-488d-envwash.mjs — GH-488D wave A2 single-boot ablation probe.
//
// WHY THIS EXISTS. The wave-A2 look loop hit a place where the model and the
// screen disagreed by ~16x: the Diamond cabinet (apronMat, shared by the
// aprons AND the legs) was predicted to land at V ~0.065 with the revived
// `spikeEnvGain` knob at 0.21 and measured V 0.000 — pure black — across
// three consecutive passes at three different gains. A number that does not
// move when its supposed cause moves is not being caused by that thing, so
// modelling harder is the wrong move: this file MEASURES the mechanism.
//
// It boots the real app ONCE and then, without ever re-booting or moving the
// camera, walks a list of one-at-a-time ablations of the cabinet material,
// shooting a frame after each. Two properties make the readings trustworthy:
//
//   1. THE MEASUREMENT REGION IS DERIVED FROM THE MESH, NOT GUESSED. One
//      variant sets a bright emissive on the cabinet material; every pixel
//      that changes between that frame and the as-built frame IS cabinet,
//      by construction. That pixel MASK (not a hand-placed rectangle) is
//      what every variant is then measured over, so a reading of #000000
//      can no longer be "the patch was aimed at the floor".
//   2. ONE BOOT, ONE POSE, ONE RIG. Same GI bake, same tone map, same
//      exposure, same frame geometry for every row of the table — only the
//      material state differs.
//
// Usage:
//   node tools/render/probe-488d-envwash.mjs [--register r6_fulltable]
//     [--target apron|casting|railwood|collar] [--out DIR]
//     [--width N --height N]
// Ports: the 488d lane band 25100-25129 (same claim as the capture tool).
//
// TARGETS. `apron` (the default) is the original cabinet study and its rows
// are byte-reproducible against the § 2.4 table. The other three exist because
// § 2.7/F5 found the SAME wash on surfaces the cabinet fix never touched: the
// mesh inventory says every large table surface has a near-black base colour,
// yet they render warm khaki at V 0.22-0.26 / S 0.32-0.36. Whether that is the
// env leg or the analytic canopy is a question the screen can answer in one
// row (`w_env_off`), so it is asked here rather than argued.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng } from './measure-488d-patch.mjs';

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

const OUT = path.resolve(__pathOpt('--out', { default: '/tmp/ob-488d-probe', tag: 'probe-488d-envwash' }));
const W = Number(argOf('--width', 1600));
const H = Number(argOf('--height', 1000));
const REG = __stringOpt('--register', { default: 'r6_fulltable', tag: 'probe-488d-envwash' });
const TARGET = argOf('--target', 'apron');
const TABLE = 'diamond_proam_9ft';

// Browser-side predicate per target. obClass is the honest handle where one
// exists (table.js tags cloth/railwood/apron only); the boot leathers and the
// castings are addressed by their base colour, which the as-built mesh
// inventory already proves is unique per material family.
const TARGETS = {
  apron: `m.userData && m.userData.obClass === 'apron'`,
  railwood: `m.userData && m.userData.obClass === 'railwood'`,
  casting: `m.color && m.color.getHexString() === '2e2e31'`,
  collar: `m.color && m.color.getHexString() === '161617'`,
};
if (!TARGETS[TARGET]) {
  throw new Error(`unknown --target ${TARGET} (have ${Object.keys(TARGETS)})`);
}

// Poses are copied from capture-488d-registers.mjs so a probe row and a
// register frame can be compared pixel-for-pixel; HALF_W_OUT / HALF_L_OUT are
// the diamond rail-outer half-extents that file resolves.
const HALF_W_OUT = 1.27 / 2 + 0.0508;   // 0.6858
const HALF_L_OUT = 2.54 / 2 + 0.0508;   // 1.3208
const POSES = {
  r6_fulltable: { cam: [1.95, -2.72, 1.18], look: [0, 0.10, -0.05], fov: 42 },
  r8_cabinet: { cam: [1.72, 2.30, 0.06], look: [0.74, 1.36, -0.26], fov: 40 },
  r1_corner_macro: {
    cam: [0.90, 1.53, 0.46], look: [HALF_W_OUT, HALF_L_OUT, 0.01], fov: 34,
  },
  r3_side_macro: { cam: [1.06, -0.22, 0.26], look: [HALF_W_OUT, 0.0, 0.02], fov: 30 },
  r5_railtop: { cam: [1.02, -0.86, 0.34], look: [0.66, 0.10, 0.045], fov: 28 },
};

// ---------------------------------------------------------------------------
// Browser-side helpers. `CAB` collects every material tagged obClass 'apron'
// (on diamond the legs reuse apronMat byte-identically, table.js:14750, so
// this one handle is the whole cabinet) plus the meshes drawn with them.
const HIDE_UI = `(() => {
  for (const el of document.querySelectorAll(
    'header,footer,.hud,.panel,#ui,#hud,.toolbar,.overlay,dialog')) {
    el.style.visibility = 'hidden';
  }
  return true;
})()`;

const HIDE_BALLS = `(() => {
  let n = 0;
  window.__dbg.scene.traverse((o) => {
    if (o.isMesh && /ball/i.test(o.name || '')) { o.scale.setScalar(1e-6); n++; }
  });
  return n;
})()`;

const setupJs = (pred) => `(() => {
  const mats = new Map();
  const meshes = [];
  window.__dbg.scene.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (${pred}) {
        mats.set(m.uuid, m);
        meshes.push(o);
      }
    }
  });
  window.__probe = { mats: [...mats.values()], meshes, saved: null,
    env: window.__dbg.scene.environment };
  const p = window.__probe;
  p.saved = p.mats.map((m) => ({
    map: m.map, roughness: m.roughness, metalness: m.metalness,
    color: m.color.getHex(),
    emissive: m.emissive ? m.emissive.getHex() : null,
    envMapIntensity: m.envMapIntensity,
    // the non-chunk levers: on a MeshPhysicalMaterial these reach the env
    // specular leg WITHOUT a shader chunk, so they are the remedy available
    // to a 'wood'-mode material that has no tint branch at all.
    specularIntensity: m.specularIntensity,
    clearcoat: m.clearcoat,
    // the HOLDERS are live uniform objects shared with the compiled program,
    // so a variant that writes .value mutates the thing we are supposed to
    // be restoring FROM. Save the object (identity matters: re-binding a new
    // object would orphan the uniform) AND its scalar/vector contents.
    gain: m.userData.spikeEnvGain,
    gainV: m.userData.spikeEnvGain ? m.userData.spikeEnvGain.value : null,
    tint: m.userData.spikeEnvTint,
    tintV: m.userData.spikeEnvTint
      ? m.userData.spikeEnvTint.value.toArray() : null,
  }));
  // material -> its ORIGINAL map, so an albedo-swap row always builds its
  // sampler state from the shipped texture even when a prior row left a flat
  // swatch in place.
  p.map0 = new Map(p.mats.map((m) => [m, m.map]));
  return JSON.stringify({
    matCount: p.mats.length, meshCount: p.meshes.length,
    mats: p.mats.map((m) => ({
      type: m.type, color: '#' + m.color.getHexString(),
      hasMap: !!m.map, roughness: m.roughness, metalness: m.metalness,
      envMapIntensity: m.envMapIntensity,
      specularIntensity: m.specularIntensity, clearcoat: m.clearcoat,
      gain: m.userData.spikeEnvGain ? m.userData.spikeEnvGain.value : null,
      tint: m.userData.spikeEnvTint
        ? m.userData.spikeEnvTint.value.toArray() : null,
      envOcc: m.userData.spikeEnvOcc === true,
      warm: m.userData.spikeWarmEnv === true,
      downNeutral: m.userData.spikeEnvDownNeutral === true,
    })),
    meshes: p.meshes.map((o) => ({
      name: o.name || '(anon)', visible: o.visible,
      tris: o.geometry.index ? o.geometry.index.count / 3
        : o.geometry.attributes.position.count / 3,
    })),
    envIntensity: window.__dbg.scene.environmentIntensity,
    hasEnv: !!window.__dbg.scene.environment,
  });
})()`;

const RESTORE = `(() => {
  const p = window.__probe;
  window.__dbg.scene.environment = p.env;
  p.mats.forEach((m, i) => {
    const s = p.saved[i];
    m.map = s.map; m.roughness = s.roughness; m.metalness = s.metalness;
    m.color.setHex(s.color);
    if (m.emissive && s.emissive !== null) m.emissive.setHex(s.emissive);
    m.envMapIntensity = s.envMapIntensity;
    if (s.specularIntensity !== undefined) m.specularIntensity = s.specularIntensity;
    if (s.clearcoat !== undefined) m.clearcoat = s.clearcoat;
    if (s.gain) { s.gain.value = s.gainV; m.userData.spikeEnvGain = s.gain; }
    else delete m.userData.spikeEnvGain;
    if (s.tint) {
      s.tint.value.fromArray(s.tintV);
      m.userData.spikeEnvTint = s.tint;
    } else delete m.userData.spikeEnvTint;
    m.needsUpdate = true;
  });
  return true;
})()`;

// Each variant is `[label, browser-side body applied to every cabinet
// material]`. RESTORE runs before each one, so every row is a ONE-CHANGE
// delta from the as-built build, never a cumulative drift.
// ORDER IS LOAD-BEARING. A variant that DELETES a uniform holder and forces
// a recompile permanently breaks the live-retune path for every later
// variant: re-attaching the same holder object afterwards no longer reaches
// the program's bound uniform, so the whole sweep silently freezes at its
// as-built value (measured — the first probe run read a flat #000000 across
// a 1.0..6.0 gain sweep that had genuinely moved when run before any
// delete). Every pure VALUE write therefore runs first; the structural
// delete/recompile arms run last and never feed a later row.
const SWEEP = [1.0, 1.6, 2.0, 2.4, 3.0, 4.0, 6.0];
const VARIANTS_APRON = [
  ['a0_asbuilt', ''],
  // MASK SOURCE: a flat bright emissive is independent of lighting, env and
  // shader chunks, so every pixel it moves is cabinet and nothing else is.
  ['a1_emissive_mask', 'if (m.emissive) m.emissive.setHex(0x00ff00);'],
  // the knob sweep: pure uniform writes, NO recompile — the holder exists so
  // the level can be retuned live, which is exactly what makes a solved
  // (rather than authored) value possible in one boot.
  ...SWEEP.map((g) => [`c_tint_gain_${g.toFixed(2)}`,
    `if (m.userData.spikeEnvGain) m.userData.spikeEnvGain.value = ${g};`]),
  // chroma control: the REJECTED canopy-derived warm projection at the same
  // level, kept as a live row so the rejection stays a measurement rather
  // than a claim about a build nobody can re-shoot.
  ['d_canopy_tint_2.40', 'if (m.userData.spikeEnvGain) m.userData.spikeEnvGain.value = 2.4;'
    + ' if (m.userData.spikeEnvTint)'
    + ' m.userData.spikeEnvTint.value.set(1.1206, 0.9858, 0.7856);'],
  // the two structural reference arms, LAST: stock env (the recorded red
  // basis) and the forced-projection tint with no knob at all.
  ['y_tint_only', 'delete m.userData.spikeEnvGain; m.needsUpdate = true;'],
  ['z_stock_env', 'delete m.userData.spikeEnvGain; delete m.userData.spikeEnvTint;'
    + ' m.needsUpdate = true;'],
];

// The F5 wash study, for surfaces the cabinet fix never touched. Two questions,
// in order, and the rows are arranged so each one is answered before the next
// is asked:
//
//   Q1 WHERE DOES THE KHAKI COME FROM? `w_env_off` nulls scene.environment for
//      one frame. If the target goes near-black, the pixel is the env leg and
//      the GH-440 probe content is the cause. If it stays khaki, the analytic
//      canopy is the cause and the venue rig — which is FROZEN — owns it.
//   Q2 WHAT LEVER REACHES IT? A 'wood'-mode material has no tint branch at all
//      (injectAnalytic dispatches `envOcc ? OCC : (gainU ? GAIN_WOOD : PLAIN)`),
//      so the chunk cannot desaturate it. The `b_*` rows therefore test the
//      NON-CHUNK levers that reach the env specular leg on a
//      MeshPhysicalMaterial directly, and `n_tint_no_gain` is the control that
//      shows the tint branch really is unreachable rather than merely subtle.
//
// Every gain row ADDS its own holder and recompiles, instead of writing into a
// holder left over from a previous row. That is slower and it is deliberate:
// it makes the delete-then-reattach orphan trap (see the note above)
// structurally impossible in this set.
//
// MEASURED CORRECTION (casting run 1): "add a fresh holder every row" does NOT
// rebind. Rows g_gain_0.40..1.00 reported want 0.40..1.00 against bound 0.25
// and produced byte-identical frames, because the cache key is the same for
// every gain-present row, so three.js keeps the program — and the uniform
// object bound at FIRST compile — while the material's userData points at a
// new object nobody reads. The sweep therefore arms ONE holder and then
// retunes it in place, exactly like the apron path, and the retune rows skip
// RESTORE (a third tuple element) so the holder is never detached mid-sweep.
const GAIN_ROWS = [0.25, 0.4, 0.6, 0.8, 1.0];
const VARIANTS_WASH = [
  ['a0_asbuilt', ''],
  ['a1_emissive_mask', 'if (m.emissive) m.emissive.setHex(0x00ff00);'],
  // pure property writes: no recompile, no holder, nothing to orphan.
  ['b_specI_0.00', 'if (m.specularIntensity !== undefined) m.specularIntensity = 0.0;'],
  ['b_specI_0.03', 'if (m.specularIntensity !== undefined) m.specularIntensity = 0.03;'],
  ['b_specI_0.06', 'if (m.specularIntensity !== undefined) m.specularIntensity = 0.06;'],
  ['b_rough_0.95', 'm.roughness = 0.95;'],
  // ALBEDO CHROMA control. Dropping the map leaves the frozen base colour
  // alone, so the delta in S between this row and a0 IS the map's own warm
  // cast — separated from the lamp's and the env's, which is the only way to
  // say which of the three a saturation miss belongs to.
  ['b_no_map', 'm.map = null; m.needsUpdate = true;'],
  ['b_coat_0.00', 'if (m.clearcoat !== undefined) m.clearcoat = 0.0;'],
  ['b_specI0_rough95', 'if (m.specularIntensity !== undefined) m.specularIntensity = 0.0;'
    + ' m.roughness = 0.95; if (m.clearcoat !== undefined) m.clearcoat = 0.0;'],
  // structural rows, each self-contained.
  // If the material ALREADY carries a holder (it does once a style wires one),
  // that object is the one the compiled program is bound to — reuse it. Only
  // an unwired material gets a freshly minted holder plus the recompile that
  // binds it. Getting this backwards is what froze the first casting sweep.
  [`g_gain_${GAIN_ROWS[0].toFixed(2)}`,
    `const h = m.userData.spikeEnvGain`
    + ` || (m.userData.spikeEnvGain = { value: 1 });`
    + ` h.value = ${GAIN_ROWS[0]}; m.needsUpdate = true;`],
  ...GAIN_ROWS.slice(1).map((g) => [`g_gain_${g.toFixed(2)}`,
    `m.userData.spikeEnvGain.value = ${g};`, { keep: true }]),
  // Vector3 is taken off a live scene object rather than a global THREE
  // handle, which this build does not publish.
  ['n_tint_no_gain', 'const V3 = window.__dbg.scene.position.constructor;'
    + ' m.userData.spikeEnvTint = { value: new V3(1, 1, 1) };'
    + ' m.needsUpdate = true;'],
  // ALBEDO WHITE-BALANCE authority. The dossier says the Diamond rail laminate
  // is NEUTRAL (S 0.00-0.05 on manning-cloth-finished-30) while ours renders
  // S 0.30, and the wood-mode chunk has no tint branch to correct it with
  // (F6, measured). The one multiplier still in reach is the albedo map's own
  // base colour, so these rows ask how far it can carry a white balance: each
  // swaps `map` for a FLAT swatch, keeping every other map and all sampler
  // state. `flatwarm` is the control (the shipped base, grain removed), so
  // flat-vs-flat is a clean read of the tint lever alone.
  ...[
    ['flatwarm', [212, 206, 196]],
    ['flatneut', [206, 206, 206]],
    ['flatcool', [196, 206, 216]],
    ['flatcold', [176, 200, 226]],
  ].map(([tag, rgb]) => [`m_${tag}`,
    'const src = window.__probe.map0.get(m) || m.map;'
    + ' const cv = document.createElement("canvas"); cv.width = cv.height = 4;'
    + ` const g2 = cv.getContext("2d"); g2.fillStyle = "rgb(${rgb.join(',')})";`
    + ' g2.fillRect(0, 0, 4, 4);'
    + ' const t = new src.constructor(cv);'
    + ' t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.colorSpace = src.colorSpace;'
    + ' t.repeat.copy(src.repeat); t.needsUpdate = true;'
    + ' m.map = t; m.needsUpdate = true;']),
  ['w_env_off', 'window.__dbg.scene.environment = null; m.needsUpdate = true;'],
];

const VARIANTS = TARGET === 'apron' ? VARIANTS_APRON : VARIANTS_WASH;

const applyJs = (body) => `(() => {
  for (const m of window.__probe.mats) { ${body} }
  return true;
})()`;

// Read the value the COMPILED PROGRAM is actually holding, not the value we
// meant to set. A live-retune knob that has come unbound looks identical
// from the userData side, and that is precisely the failure this probe hit.
const READBACK = `(() => {
  const props = window.__dbg.renderer.properties;
  return JSON.stringify(window.__probe.mats.map((m) => {
    const u = props.get(m) && props.get(m).uniforms;
    return {
      want: m.userData.spikeEnvGain ? m.userData.spikeEnvGain.value : null,
      bound: u && u.uSpikeEnvGain ? u.uSpikeEnvGain.value : 'unbound',
      tint: m.userData.spikeEnvTint
        ? m.userData.spikeEnvTint.value.toArray().map((v) => +v.toFixed(3))
        : null,
    };
  }));
})()`;

async function waitFrame(chrome) {
  await chrome.eval(`new Promise((r) => requestAnimationFrame(
    () => requestAnimationFrame(() => r(true))))`).catch(() => null);
  await sleep(120);
}

async function shot(chrome, file) {
  const res = await chrome.send('Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
}

// quantile over an explicit pixel-index mask (not a rectangle). q = 0.5 is
// the whole-cabinet median (lit AND shadowed faces together); q = 0.85 tracks
// the LIT faces, which is what the reference photo's apron patch actually
// measured, so both are reported rather than one standing in for the other.
function maskStats(img, idx, q = 0.5) {
  const R = []; const G = []; const B = [];
  for (const i of idx) {
    R.push(img.data[i * img.ch]);
    G.push(img.data[i * img.ch + 1]);
    B.push(img.data[i * img.ch + 2]);
  }
  const med = (a) => {
    const s = Float64Array.from(a).sort();
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  };
  const r = Math.round(med(R)); const g = Math.round(med(G)); const b = Math.round(med(B));
  const mx = Math.max(r, g, b) / 255; const mn = Math.min(r, g, b) / 255;
  const d = mx - mn;
  let hue = 0;
  if (d > 1e-9) {
    const rr = r / 255; const gg = g / 255; const bb = b / 255;
    if (mx === rr) hue = 60 * (((gg - bb) / d) % 6);
    else if (mx === gg) hue = 60 * ((bb - rr) / d + 2);
    else hue = 60 * ((rr - gg) / d + 4);
    if (hue < 0) hue += 360;
  }
  return {
    hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
    h: hue, s: mx > 0 ? d / mx : 0, v: mx, n: idx.length,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let band = null;
  let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
  let CDPP = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : null;
  if (!PORT || !CDPP) {
    band = await claimPortBand(25100, 25129);
    PORT = band.http(0); CDPP = band.cdp(0);
  }
  const server = spawnStaticServer(webDir, PORT);
  await sleep(800);
  let chrome = null;
  try {
    const url = `http://127.0.0.1:${PORT}/app.html?table=${TABLE}`
      + `&cinema=1&seed=7&look=default`;
    console.log(`[boot] http :${PORT} cdp :${CDPP} -> ${url}`);
    chrome = await launchChrome(url, { port: CDPP, width: W, height: H });
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) {
      await sleep(200);
      ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
    }
    if (!ready) throw new Error('app never became ready');
    let rig = null;
    for (let i = 0; i < 200; i++) {
      const st = await chrome.eval(`(() => {
        const s = window.__gi && window.__gi.state;
        return JSON.stringify({ giReady: s ? !!s.ready : null,
          baked: s ? !!s.baked : null, fixture: s ? s.fixture : null,
          bakeClass: s ? s.bakeClass : null });
      })()`).catch(() => null);
      if (st) { rig = JSON.parse(st); if (rig.giReady && rig.baked) break; }
      await sleep(200);
    }
    if (!rig || !rig.giReady || !rig.baked) {
      throw new Error(`GI never settled: ${JSON.stringify(rig)}`);
    }
    if (rig.fixture !== 'canopy_panel' || rig.bakeClass !== 'pool') {
      throw new Error(`rig drift: ${JSON.stringify(rig)}`);
    }
    console.log('[rig]', JSON.stringify(rig));

    await sleep(1200);
    await chrome.eval(HIDE_UI);
    await chrome.eval(HIDE_BALLS);
    await sleep(300);

    const setup = JSON.parse(await chrome.eval(setupJs(TARGETS[TARGET])));
    console.log(`[${TARGET}]`, JSON.stringify(setup, null, 1));
    fs.writeFileSync(path.join(OUT, `${TARGET}-state.json`),
      JSON.stringify(setup, null, 2));
    if (!setup.matCount) throw new Error(`no --target ${TARGET} material found`);

    const pose = POSES[REG];
    if (!pose) throw new Error(`unknown register ${REG}`);
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(pose)})`);
      if (!ok) await sleep(200);
    }
    if (!ok) throw new Error('cameraPose rejected');
    await waitFrame(chrome);
    await sleep(500);

    const frames = {}; const bound = {};
    for (const [label, body, opt] of VARIANTS) {
      // `keep` rows deliberately inherit the previous row's material state:
      // they are the live-retune arm of a sweep, and detaching the holder to
      // "start clean" is precisely what breaks the binding.
      if (!(opt && opt.keep)) {
        await chrome.eval(RESTORE);
        await waitFrame(chrome);
      }
      if (body) await chrome.eval(applyJs(body));
      await waitFrame(chrome);
      await sleep(350);
      await waitFrame(chrome);
      const file = path.join(OUT, `probe-${TARGET}-${REG}-${label}.png`);
      await shot(chrome, file);
      frames[label] = file;
      const back = await chrome.eval(READBACK).catch((e) => `readback failed: ${e.message}`);
      bound[label] = back;
      console.log(`[shot] ${label.padEnd(20)} ${back}`);
    }
    await chrome.eval(RESTORE);

    // --- derive the cabinet pixel mask from the emissive variant ----------
    const base = readPng(frames.a0_asbuilt);
    const lit = readPng(frames.a1_emissive_mask);
    const mask = [];
    for (let i = 0; i < base.w * base.h; i++) {
      const a = i * base.ch; const b = i * lit.ch;
      const d = Math.abs(base.data[a] - lit.data[b])
        + Math.abs(base.data[a + 1] - lit.data[b + 1])
        + Math.abs(base.data[a + 2] - lit.data[b + 2]);
      if (d > 40) mask.push(i);
    }
    let x0 = base.w; let y0 = base.h; let x1 = 0; let y1 = 0;
    for (const i of mask) {
      const x = i % base.w; const y = (i / base.w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    console.log(`\n[mask] ${mask.length} px `
      + `(${(100 * mask.length / (base.w * base.h)).toFixed(2)}% of frame) `
      + `bbox x ${x0}..${x1} y ${y0}..${y1}`);
    if (!mask.length) throw new Error('emissive mask empty — cabinet not on screen');

    const rows = [];
    console.log('\n                   -- cabinet median --   -- cabinet p85 (lit) --');
    console.log('variant            hex      S      V       hex      S      V');
    for (const [label] of VARIANTS) {
      const img = readPng(frames[label]);
      const m50 = maskStats(img, mask, 0.5);
      const m85 = maskStats(img, mask, 0.85);
      rows.push({ label, med: m50, lit: m85 });
      console.log(`${label.padEnd(18)} ${m50.hex}  ${m50.s.toFixed(3)}  `
        + `${m50.v.toFixed(3)}   ${m85.hex}  ${m85.s.toFixed(3)}  ${m85.v.toFixed(3)}`);
    }
    fs.writeFileSync(path.join(OUT, 'probe-result.json'), JSON.stringify({
      target: TARGET, register: REG, rig, subject: setup, bound,
      mask: { px: mask.length, bbox: [x0, y0, x1, y1] }, rows,
    }, null, 2));
    console.log(`\nPROBE DONE -> ${OUT}`);
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
