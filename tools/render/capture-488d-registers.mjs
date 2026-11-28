// Copyright (c) Meta Platforms, Inc. and affiliates.

// capture-488d-registers.mjs — GH-488D wave A2 LOOK-LOOP instrument.
//
// The Stage 5 modeling loop needs ONE frozen capture rig that renders the
// decisive `diamond_proam_9ft` registers from the REAL app (never a proxy
// scene) so that every look-line in SPIKE-REPORT.md compares like with like:
// same poses, same lighting fixture, same tone map, same resolution, same
// crop ladder. Baseline (red-basis) and every post-edit pass are shot with
// this file; the only thing that changes between passes is the mesh.
//
// Register set (SPIKE-TASK-A2 § 4 register -> reference map):
//   r1_corner_macro     corner pocket, 3/4 above     oem-proam-smart-corner-pocket-01/02
//   r2_corner_low       corner pocket, low + outside oem-proam-smart-corner-pocket-03
//   r3_side_macro       side pocket, outside         oem-proam-smart-side-pocket-04/05
//   r4_cushion_nose     down-the-nose long rail      oem-artemis-ic66-k55-cushion-01..03
//   r5_railtop          rail band + sight, oblique   rkc-rail-recover-*
//   r6_fulltable        full table 3/4 hero          proam-9ft-oak-black-hero.png
//   r7_overhead         overhead plan sheet          (geometry register, no photo pair)
//   r8_cabinet          apron/leg/reveal/boot        04-under-table/*
//
// Every register is shot at three zooms from ONE camera pose by CDP surface
// clip (1x full frame, 2x centre half, 4x centre quarter) — the pose is the
// invariant, the crop is the ladder, so the 1x/2x/4x triplet is guaranteed
// to be the same frame and not three re-aimed cameras.
//
// The same boot also dumps the runtime mesh inventory (name, tri count,
// WORLD-space aabb, material class hints) to `meshes.json` — that inventory
// is the as-modeled measurement source for the baseline record and for the
// -488d gate forks (which key on mesh names).
//
// Usage:
//   node tools/render/capture-488d-registers.mjs --tag baseline
//     [--out DIR] [--registers r1,r6] [--look default|sp] [--no-crops]
//     [--width N --height N] [--table diamond_proam_9ft|8ft|7ft] [--web DIR]
// GH-621: --table picks the Pro-Am size variant (poses are corner-relative,
// see POSES); --web serves another web root — the GH-621 scratch-wasm overlay,
// because the COMMITTED canonical wasm is catalog v17 and cannot resolve the
// new ids until the landing ceremony. The manifest records the served kernel.
// Exit 0 on a complete capture; non-zero on boot/settle/pose failure.
// Ports: OB_E2E_PORT/OB_E2E_CDP_PORT pin, else claims the 488d lane band
// 9900-9929 (490 = 9840-9869, 489/cammatch = 9870-9899; no overlap).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

// SHARED_DEFAULT_WINDOW (render-488d-registers) — the 488d register window 9900-9929 (claimPortBand): the register capture,
// orbit-488d and orbitsweep-488d run the SAME eight bearings one at a time in
// this lane, never side by side (headers here have said so in prose since the
// 488d spike; this is the machine-checked form).
export const SHARED_DEFAULT_WINDOW = 'render-488d-registers';

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

const TAG = argOf('--tag', 'pass');
const OUT = path.resolve(__pathOpt('--out', { default: `/tmp/ob-488d-registers/${TAG}`, tag: 'capture-488d-registers' }));
const LOOK = argOf('--look', 'default');
const W = Number(argOf('--width', 1600));
const H = Number(argOf('--height', 1000));
const NO_CROPS = argv.includes('--no-crops');
// GH-621: the rig serves the Pro-Am SIZE VARIANTS. The bed comes from the
// scene's own TABLE_SPECS (single source): the poses below are written
// relative to it and cannot drift from the geometry they frame.
const TABLE = argOf('--table', 'diamond_proam_9ft');
const SERVE_DIR = path.resolve(argOf('--web', webDir));
const { TABLE_SPECS } = await import(pathToFileURL(path.join(webDir, 'scene', 'table.js')).href);
const SPEC = TABLE_SPECS[TABLE];
if (!SPEC || !SPEC.kernel) {
  console.error(`CAPTURE-488D: --table ${TABLE} is not a TABLE_SPECS entry`);
  process.exit(2);
}
const kernelVersionOf = (dir) => {
  try {
    const m = fs.readFileSync(path.join(dir, 'dist/pool-wasm/pool_wasm_bg.wasm'))
      .toString('latin1').match(/[0-9]+\.[0-9]+\.[0-9]+\+[0-9a-f]+(-dirty)?/);
    return m ? m[0] : 'unreadable';
  } catch { return 'unreadable'; }
};

// ---------------------------------------------------------------------------
// Frozen light rig (SPIKE-TASK-A2 method step 2). The rig is FROZEN BY BOOT
// STATE, not by an override: the venue default that ships for this table is
// what the owner sees, so the capture asserts it rather than replacing it.
// Any drift in fixture / bake class fails the capture instead of silently
// re-lighting a look-line. RIG_EXPECT was MEASURED on the wave-A2 baseline
// boot (2026-08-28) and is pinned from that reading, so every later pass is
// shot under the identical rig or fails loudly:
//   fixture canopy_panel | bakeClass pool | brightness 1 | exposure 1.05
//   toneMapping 4 (ACESFilmic)
// A white-balance gain far from ~1.0 in a later look-line therefore indicts
// the MATERIAL, never the rig (SPIKE-TASK-A2 method step 2).
// GH-621 (D621-LOOK, D621-O1): the size variants now have their own committed
// footprint bakes (scene.mjs TABLES pool_8ft / pool_7ft), so their frozen rig
// is canopy_panel + that class; the 9 ft keeps 'pool' byte-for-byte.
const BAKE_CLASS_FOR = {
  diamond_proam_8ft: 'pool_8ft', diamond_proam_7ft: 'pool_7ft',
};
const RIG_EXPECT = {
  fixture: process.env.OB_488D_FIXTURE || 'canopy_panel',
  bakeClass: process.env.OB_488D_BAKECLASS || BAKE_CLASS_FOR[TABLE] || 'pool',
};

// ---------------------------------------------------------------------------
// Register poses. cameraPose speaks KERNEL coords: [kx, ky, kz] = across the
// width, along the length (+ = foot/rack end), up from the bed.
// diamond_proam_9ft: L 2.54, W 1.27, CW 0.0508
//   -> corner mouth centre  (+-0.6858, +-1.3208)
//   -> side   mouth centre  (+-0.6858, 0)
const L_M = SPEC.kernel.length, W_M = SPEC.kernel.width, CW = SPEC.kernel.cushionWidth;
const HALF_W_OUT = W_M / 2 + CW;   // 9 ft: 0.6858
const HALF_L_OUT = L_M / 2 + CW;   // 9 ft: 1.3208
// GH-621: every pose is written RELATIVE to the table it frames — the corner
// registers ride the corner mouth, the side/rail registers ride the nose
// line, the hero/overhead registers scale with the bed — and rounded to 4 dp
// (R4). On the 9 ft that reproduces the wave-A2 absolute literals EXACTLY;
// PIN_9FT below IS those literals, and the rig REFUSES to run when the
// parametric poses fail to reproduce them, so the derivation can never
// quietly move the 9 ft registers (zero-drift law, proved at every boot).
const R4 = (v) => Math.round(v * 1e4) / 1e4;
const S = L_M / 2.54; // bed scale vs the 9 ft (hero / overhead framing only)

const POSES = {
  // 3/4 above the foot-right corner pocket, outside the rail: the register
  // the OEM smart-pocket macros were shot from (mouth ellipse + casting
  // shoulder + collar crest all in frame).
  r1_corner_macro: {
    cam: [R4(HALF_W_OUT + 0.2142), R4(HALF_L_OUT + 0.2092), 0.46],
    look: [HALF_W_OUT, HALF_L_OUT, 0.01], fov: 34,
  },
  // low + outside: the boot face, the casting under-cut and the collar's
  // outer landing read here. RE-AIMED after the baseline pass — the first
  // cut sat at kz 0.055 looking DOWN to kz -0.045, i.e. entirely below the
  // rail-top plane, where the canopy fixture puts no light at all; the
  // frame came back at median V 0.01 and was unjudgeable. The camera now
  // clears the rail top (0.047) and looks at the mouth rim, which is the
  // lowest bearing this venue rig can actually expose.
  r2_corner_low: {
    cam: [R4(HALF_W_OUT + 0.4742), R4(HALF_L_OUT + 0.4792), 0.155],
    look: [HALF_W_OUT, HALF_L_OUT, 0.006], fov: 30,
  },
  // side pocket from outside the long rail, ~27 deg elevation.
  r3_side_macro: {
    cam: [R4(HALF_W_OUT + 0.3742), -0.22, 0.26], look: [HALF_W_OUT, 0.0, 0.02], fov: 30,
  },
  // down-the-nose along the right long rail: the K55 section, nose line
  // straightness and the cloth relief read here and nowhere else. The eye
  // rides 34 mm inboard of the nose line, 0.68 m behind the head end.
  r4_cushion_nose: {
    cam: [R4(W_M / 2 - 0.034), R4(-(L_M / 2) - 0.68), 0.098],
    look: [R4(W_M / 2 - 0.034), R4(L_M / 2 - 0.42), 0.043], fov: 30,
  },
  // rail band oblique: RB-01 band width, RB-02 rail-top plane, sight inset
  // and pitch, sub-rail bevel shoulder.
  r5_railtop: {
    cam: [R4(HALF_W_OUT + 0.3342), -0.86, 0.34],
    look: [R4(HALF_W_OUT - 0.0258), 0.10, 0.045], fov: 28,
  },
  // full-table 3/4 hero (proam-9ft-oak-black-hero pairing); scales with the
  // bed so each size fills the frame the way the 9 ft does.
  r6_fulltable: {
    cam: [R4(1.95 * S), R4(-2.72 * S), R4(1.18 * S)], look: [0, R4(0.10 * S), -0.05], fov: 42,
  },
  // overhead geometry sheet (plan register for the fullview overlay eye).
  r7_overhead: { overhead: true, height: R4(14 * S), fov: 11 },
  // cabinet 3/4: apron faces on two sides, one corner leg, the rail-to-apron
  // reveal, and the boot/ball-return path behind it (EN-08, BR-01/BR-02).
  // RE-AIMED after the baseline pass for the same reason as r2 — the first
  // cut sat at kz -0.28 looking down to kz -0.42, deep under the cabinet
  // where the canopy fixture reaches nothing; median V came back 0.01. The
  // camera now sits 60 mm ABOVE the bed plane and looks down the corner, so
  // the frame spans kz -0.77..+0.25: whole leg, whole apron, rail band top.
  r8_cabinet: {
    cam: [R4(HALF_W_OUT + 1.0342), R4(HALF_L_OUT + 0.9792), 0.06],
    look: [R4(HALF_W_OUT + 0.0542), R4(HALF_L_OUT + 0.0392), -0.26], fov: 40,
  },
  // D621-LOOK-3 (verifier: r8's seal exposure, mean L ≈ 5/255, hides the
  // grooves and bolt heads the card captions name). A ninth register, close
  // on the foot-right leg's OUTER corner from outside the table, 50 mm
  // below the bed plane looking down to mid-column, so a 5 mm reveal groove
  // spans several pixels at 1×. The leg centre sits 244.1 mm inboard of the
  // nose+cushion extreme on both axes on every size (EN-05 outside-to-
  // outside minus half the sole width, a fixed offset — see table.js
  // legStanceIn 180.975 + the purchased-model foot half-width 63.1, D621-ALIGN;
  // was 91.6 with the LOOK-2 88.4 half-width — the pose literal itself is
  // pinned and did not move). r8 keeps its pinned pose; this one is ADDED.
  r9_leg_close: {
    cam: [R4(HALF_W_OUT + 0.7278), R4(HALF_L_OUT + 0.5278), -0.05],
    look: [R4(HALF_W_OUT - 0.0916), R4(HALF_L_OUT - 0.0916), -0.40], fov: 32,
  },
};

// The wave-A2 9 ft registers, VERBATIM (the literals this file carried before
// GH-621 made the poses parametric). Not a fixture to be regenerated: if the
// parametric form ever stops reproducing them, that is a defect in the
// derivation, and the rig refuses rather than shipping moved registers.
const PIN_9FT = {
  r1_corner_macro: { cam: [0.90, 1.53, 0.46], look: [1.27 / 2 + 0.0508, 2.54 / 2 + 0.0508, 0.01], fov: 34 },
  r2_corner_low: { cam: [1.16, 1.80, 0.155], look: [1.27 / 2 + 0.0508, 2.54 / 2 + 0.0508, 0.006], fov: 30 },
  r3_side_macro: { cam: [1.06, -0.22, 0.26], look: [1.27 / 2 + 0.0508, 0.0, 0.02], fov: 30 },
  r4_cushion_nose: { cam: [0.601, -1.95, 0.098], look: [0.601, 0.85, 0.043], fov: 30 },
  r5_railtop: { cam: [1.02, -0.86, 0.34], look: [0.66, 0.10, 0.045], fov: 28 },
  r6_fulltable: { cam: [1.95, -2.72, 1.18], look: [0, 0.10, -0.05], fov: 42 },
  r7_overhead: { overhead: true, height: 14, fov: 11 },
  r8_cabinet: { cam: [1.72, 2.30, 0.06], look: [0.74, 1.36, -0.26], fov: 40 },
  // D621-LOOK-3 addition (not a wave-A2 literal): pinned here at its first issue
  r9_leg_close: { cam: [1.4136, 1.8486, -0.05], look: [0.5942, 1.2292, -0.4], fov: 32 },
};
const POSE_PIN = (() => {
  if (TABLE !== 'diamond_proam_9ft') return 'n/a (size variant; 9 ft pins not applicable)';
  const got = JSON.stringify(POSES), want = JSON.stringify(PIN_9FT);
  if (got !== want) {
    console.error('CAPTURE-488D: REFUSAL — the parametric poses do not reproduce the 9 ft pins\n'
      + `  parametric: ${got}\n  pinned:     ${want}`);
    process.exit(2);
  }
  return 'reproduced (parametric poses == wave-A2 literals, byte-for-byte)';
})();

const WANT = String(__stringOpt('--registers', { default: Object.keys(POSES).join(','), tag: 'capture-488d-registers' }))
  .split(',').map((s) => s.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
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

// The table is the subject; balls and the cue stick occlude the registers.
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

// World-space mesh inventory. The local-space bbox the naive probe reports is
// useless for measurement (every plank is authored at the origin and placed by
// its matrix) — the as-modeled record needs WORLD aabbs.
const MESH_DUMP = `(() => {
  const scene = window.__dbg.scene;
  scene.updateMatrixWorld(true);
  const out = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    const pos = g.getAttribute('position');
    if (!pos) return;
    const m = o.matrixWorld.elements;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity;
    let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
      const wx = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
      const wy = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
      const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
      if (wx < x0) x0 = wx; if (wx > x1) x1 = wx;
      if (wy < y0) y0 = wy; if (wy > y1) y1 = wy;
      if (wz < z0) z0 = wz; if (wz > z1) z1 = wz;
    }
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    out.push({
      name: o.name || '',
      parent: (o.parent && o.parent.name) || '',
      tris: (g.index ? g.index.count : pos.count) / 3,
      verts: pos.count,
      visible: o.visible,
      matName: (mat && mat.name) || '',
      matType: (mat && mat.type) || '',
      hex: (mat && mat.color && mat.color.getHexString) ? mat.color.getHexString() : '',
      aabb: [r6(x0), r6(y0), r6(z0), r6(x1), r6(y1), r6(z1)],
    });
  });
  return JSON.stringify(out);
})()`;

const waitFrame = (chrome) => chrome.eval(
  'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');

async function shot(chrome, file, clip) {
  const params = { format: 'png' };
  if (clip) params.clip = { ...clip, scale: clip.scale ?? 1 };
  const { data } = await chrome.send('Page.captureScreenshot', params);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}

// 1x / 2x / 4x from ONE pose: the crop ladder is a surface clip, so the three
// images are literally the same rendered frame at three magnifications.
const LADDER = [
  { z: 1, x: 0, y: 0, w: 1, h: 1 },
  { z: 2, x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
  { z: 4, x: 0.375, y: 0.375, w: 0.25, h: 0.25 },
];

async function main() {
  let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
  let CDPP = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : null;
  let band = null;
  if (!PORT || !CDPP) {
    band = await claimPortBand(9900, 9929);
    PORT = band.http(0); CDPP = band.cdp(0);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawnStaticServer(SERVE_DIR, PORT);
  await sleep(800);
  let chrome = null;
  const manifest = {
    tag: TAG, table: TABLE, look: LOOK, width: W, height: H,
    // GH-621 provenance: which bed the poses were derived from, which web
    // root was served and which kernel it carried (the scratch overlay is
    // NOT the canonical binary and must never be mistaken for it), and the
    // 9 ft pose-pin verdict.
    bed: { length: L_M, width: W_M, cushionWidth: CW },
    served_web_dir: SERVE_DIR,
    served_kernel_version: kernelVersionOf(SERVE_DIR),
    canonical_kernel_version: kernelVersionOf(webDir),
    pose_pin_9ft: POSE_PIN,
    poses: {}, frames: [], rig: null, meshCount: 0,
  };
  try {
    const url = `http://127.0.0.1:${PORT}/app.html?table=${TABLE}`
      + `&cinema=1&seed=7&look=${LOOK}`;
    chrome = await launchChrome(url, { port: CDPP, width: W, height: H });
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) {
      await sleep(200);
      ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
    }
    if (!ready) throw new Error('app never became ready');

    // rig settle: __gi.state is a PROPERTY (not a call) — the 490 tools read
    // it that way and a call form throws, which would silently degrade the
    // settle poll into a fixed sleep.
    let rig = null;
    for (let i = 0; i < 200; i++) {
      const st = await chrome.eval(`(() => {
        const s = window.__gi && window.__gi.state;
        const lg = window.__lighting && window.__lighting.state
          && window.__lighting.state();
        return JSON.stringify({
          giReady: s ? !!s.ready : null, baked: s ? !!s.baked : null,
          fits: s ? s.fits : null,
          fixture: s ? s.fixture : null, bakeClass: s ? s.bakeClass : null,
          rigFixture: lg ? lg.fixture : null,
          brightness: lg ? lg.brightness : null,
          exposure: window.__dbg && window.__dbg.renderer
            && window.__dbg.renderer.toneMappingExposure,
          toneMapping: window.__dbg && window.__dbg.renderer
            && window.__dbg.renderer.toneMapping,
        });
      })()`).catch(() => null);
      if (st) {
        rig = JSON.parse(st);
        if (rig.giReady && (rig.baked || rig.fits === false)) break;
      }
      await sleep(200);
    }
    manifest.rig = rig;
    // GH-621: the GI bake is keyed by FOOTPRINT (gi.js bakeClassFor, the #52
    // pocket-cut doctrine). A committed bake exists for 2.54x1.27 ('pool')
    // and for the discipline classes, NOT for the 8 ft / 7 ft Pro-Am beds —
    // so on a size variant the app boots under the documented honest-neutral
    // gate (state.fits === false, uGiOn = 0). The rig records that verbatim
    // and lets the capture proceed ONLY for a variant; the 9 ft keeps the
    // wave-A2 law byte-for-byte (baked + bakeClass 'pool' or refuse). What
    // would close it: a per-footprint bake class (tools/render/lib/scene.mjs
    // TABLES + bake-lightmap.mjs --table) — CLOSED in D621-LOOK (pool_8ft /
    // pool_7ft bakes committed); the gate path stays as the honest fallback
    // for a footprint that ever loses its bake.
    const isVariant = TABLE !== 'diamond_proam_9ft';
    const giGated = !!rig && rig.giReady && rig.fits === false && !rig.baked;
    if (!rig || !rig.giReady || (!rig.baked && !(isVariant && giGated))) {
      throw new Error(`GI never settled: ${JSON.stringify(rig)}`);
    }
    manifest.gi_gate = giGated
      ? `HONESTY-GATED: no committed GI bake for the ${L_M}x${W_M} footprint `
        + '(gi.js #52/#89 law: uGiOn = 0, pre-GI neutral look) — a size-variant '
        + 'residual, NOT the 9 ft rig'
      : 'baked';
    if (RIG_EXPECT.fixture && rig.fixture !== RIG_EXPECT.fixture) {
      throw new Error(`rig drift: fixture ${rig.fixture} != ${RIG_EXPECT.fixture}`);
    }
    if (RIG_EXPECT.bakeClass && rig.bakeClass !== RIG_EXPECT.bakeClass && !giGated) {
      throw new Error(`rig drift: bakeClass ${rig.bakeClass} != ${RIG_EXPECT.bakeClass}`);
    }
    console.log('[rig]', JSON.stringify(rig), giGated ? '(GI honesty-gated: size variant)' : '');

    await sleep(1200);
    await chrome.eval(HIDE_UI);
    await chrome.eval(HIDE_BALLS);
    await sleep(300);

    // as-modeled mesh inventory (world space)
    const meshes = JSON.parse(await chrome.eval(MESH_DUMP));
    manifest.meshCount = meshes.length;
    fs.writeFileSync(path.join(OUT, 'meshes.json'), JSON.stringify(meshes, null, 1));
    const named = meshes.filter((m) => m.name).length;
    console.log(`[mesh] ${meshes.length} meshes, ${named} named,`
      + ` ${meshes.length - named} anonymous`);

    for (const name of WANT) {
      const pose = POSES[name];
      if (!pose) throw new Error(`unknown register ${name}`);
      let ok = false;
      for (let i = 0; i < 30 && !ok; i++) {
        ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(pose)})`);
        if (!ok) await sleep(200);
      }
      if (!ok) throw new Error(`${name}: cameraPose rejected`);
      await waitFrame(chrome);
      await sleep(450);
      await waitFrame(chrome);
      manifest.poses[name] = pose;
      const ladder = NO_CROPS ? [LADDER[0]] : LADDER;
      for (const L of ladder) {
        const file = path.join(OUT, `${TAG}-${name}-${L.z}x.png`);
        await shot(chrome, file, L.z === 1 ? null : {
          x: Math.round(L.x * W), y: Math.round(L.y * H),
          width: Math.round(L.w * W), height: Math.round(L.h * H), scale: L.z,
        });
        manifest.frames.push({
          register: name, zoom: L.z, file: path.basename(file),
          sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
        });
      }
      console.log(`[reg] ${name} captured`);
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'),
      JSON.stringify(manifest, null, 2));
    console.log(`CAPTURE-488D DONE (${manifest.frames.length} frames) -> ${OUT}`);
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
