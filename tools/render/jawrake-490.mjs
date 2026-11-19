// Copyright (c) Meta Platforms, Inc. and affiliates.

// jawrake-490.mjs — GH-490 REBUILD R1 r2 (defect-c fold): the RAKING-POSE
// jaw-transition capture.  Three pinned registers rake across the corner
// jaw where the r31-r35 STORED-SHADING ladders (dimCurlMat DIM/LIT_MATCH
// vertex families) hand off to the lit cloth field: under a pose-dependent
// light a stored ladder cannot track the lit side, so the material seam
// reads as a luminance STEP that moves with the pose (the three-defect
// diagnosis, defect (c), /tmp/ob-threedefects jawshade study 2026-08-19).
// tools/audit/jawstep_490.py reads the fixed profile segments and gates
// the max relative step (photo-anchored ceiling; red-armed on the ladder
// tree, dead after the transport fold).
//
//   node tools/render/jawrake-490.mjs [--out DIR] [--web DIR] [--perturb=ladder-<k>]
//   OB_E2E_PORT / OB_E2E_CDP_PORT pin the ports (run-gate --band lanes).
//   --perturb=ladder-<k> (0 < k < 1) is the re-pinned ceiling's red arm: it plants a stored-shading step on
//   the curl side of every tongue and records it in the manifest; jawstep must read RED on that capture.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PORT_INVENTORY = { http: 1, cdp: 1 };

const argv = process.argv.slice(2);
const argOf = (k, dflt) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : dflt;
};
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webDir = path.resolve(__pathOpt('--web', { default: path.join(repo, 'web'), tag: 'jawrake-490', mustExist: 'dir' }));
const OUT = path.resolve(__pathOpt('--out', { default: '/tmp/ob-jawrake-490', tag: 'jawrake-490' }));
// The re-pin on F2: the jawstep ceiling's live red arm. --perturb=ladder-<k> re-plants the stored-shading class
// the gate was built to catch: every tongue's transport colour on the curl family (lattice columns crest..deck, the
// curl side of the curl->deck station) is scaled by k, a pose-independent step the lit deck side cannot follow.
const PERTURB = __stringOpt('--perturb', { default: null, tag: 'jawrake-490' });
const LADDER_K = PERTURB === null ? null : Number((/^ladder-(0\.[0-9]+)$/.exec(PERTURB) || [])[1]);
if (PERTURB !== null && !(LADDER_K > 0 && LADDER_K < 1)) {
  console.error(`[jawrake-490] REFUSED — --perturb ${PERTURB}: the one arm is ladder-<k> with 0 < k < 1 (e.g. ladder-0.85)`);
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

// The three diagnosis registers (owner-class corner + two rakes; the
// jawshade study's own poses, pinned here as the gate's registers).
const POSES = [
  { name: 'mouthLow', cam: [0.40, 1.04, 0.12], look: [0.678, 1.318, 0.03], fov: 30 },
  { name: 'rakeSide', cam: [1.15, 0.95, 0.09], look: [0.66, 1.30, 0.035], fov: 24 },
  { name: 'rakeLong', cam: [0.42, 0.72, 0.09], look: [0.66, 1.30, 0.035], fov: 24 },
];

const cdpMod = await import(pathToFileURL(path.join(webDir, 'tools/cdp.mjs')).href);
const { launchChrome, sleep, spawnStaticServer, stopStaticServer } = cdpMod;
let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
let CDP = process.env.OB_E2E_CDP_PORT
  ? Number(process.env.OB_E2E_CDP_PORT) : null;
let band = null;
if (!PORT || !CDP) {
  band = await cdpMod.claimPortBand(26670, 26699);
  PORT = band.http(0);
  CDP = band.cdp(0);
}

const server = spawnStaticServer(webDir, PORT);
await sleep(700);
try {
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?table=chinese8_pro_9ft&cinema=1&seed=7&look=default`,
    { port: CDP, width: 1440, height: 900 });
  try {
    for (let i = 0; i < 200; i++) {
      await sleep(200);
      if (await chrome.eval('window.__test?.ready === true').catch(() => false)) break;
      if (i === 199) throw new Error('app never became ready');
    }
    for (let i = 0; i < 150; i++) {
      const ok = await chrome.eval(`(() => {
        const s = window.__gi && window.__gi.state;
        const rig = window.__lighting?.state?.().fixture;
        return !!(s && s.ready && s.baked && s.bakeClass === 'chinese8_9ft'
          && rig === 'joy_lowrect' && window.__cn8ringtex === 'photo');
      })()`).catch(() => false);
      if (ok) break;
      await sleep(200);
      if (i === 149) throw new Error('GI/rig never settled');
    }
    await sleep(1200);
    // empty-table hygiene (cammatch-490 law, incl. the analytic-sphere
    // kill) + DOM chrome hidden — the profile segments are pinned to
    // clean frames.
    await chrome.eval(`(() => {
      __test.aim(Math.PI * 1.5);
      const zero = (o) => { o.scale.setScalar(0); o.updateMatrixWorld(true); };
      const ballGroups = new Set();
      window.__dbg.scene.traverse((o) => {
        const hex = o.material && o.material.color
          && o.material.color.getHexString && o.material.color.getHexString();
        if (hex === 'dff1ff' || hex === '76afee') o.visible = false;
        if (o.name === 'obCueStick') zero(o);
        if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry'
          && Math.abs(o.position.y) < 0.2 && Math.abs(o.position.x) < 1.5
          && Math.abs(o.position.z) < 0.9) {
          if (o.parent && o.parent !== window.__dbg.scene) ballGroups.add(o.parent);
          else zero(o);
        }
      });
      for (const g of ballGroups) for (const c of g.children) zero(c);
      const gu = window.__gi && window.__gi.uniforms;
      if (gu && gu.uSphereCount) gu.uSphereCount.value = 0;
      for (const el of document.body.children) {
        if (el.tagName !== 'CANVAS') el.style.display = 'none';
      }
    })()`);
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(350);
    let plant = null;
    if (LADDER_K !== null) {
      plant = JSON.parse(await chrome.eval(`(() => {
        const out = { meshes: 0, vertices: 0, vertexColors: 0 };
        window.__dbg.scene.traverse((o) => {
          if (!o.isMesh || !/^cn8r82-tongue-/.test(o.name || '')) return;
          const g = o.geometry, col = g.getAttribute('color');
          const map = g.userData.tongueCols, jaw = g.userData.cn8ClosedJaw;
          if (!col || !map || !jaw) return;
          for (let i = 0; i < jaw.topVertices / map.stride; i++) {
            for (let c = map.crest; c <= map.deck; c++) {
              const v = i * map.stride + c;
              col.setXYZ(v, col.getX(v) * ${LADDER_K}, col.getY(v) * ${LADDER_K}, col.getZ(v) * ${LADDER_K});
              out.vertices++;
            }
          }
          col.needsUpdate = true;
          out.meshes++;
          if (o.material && o.material.vertexColors) out.vertexColors++;
        });
        return JSON.stringify(out);
      })()`));
      // an arm that plants nothing (no tongue, no colour channel, or a material that ignores it) proves nothing
      if (!plant.meshes || !plant.vertices || plant.vertexColors !== plant.meshes) {
        throw new Error(`perturb ladder-${LADDER_K}: nothing planted (${JSON.stringify(plant)})`);
      }
      console.log(`[jawrake-490] perturb ladder-${LADDER_K}: ${plant.vertices} curl-family vertices on ${plant.meshes} tongues`);
      await sleep(600);
    }
    // seam-marker projector: the curl->deck boundary (tongue cols 4/5,
    // the LIT_MATCH material handoff station) projected to screen per
    // pose FROM THE APP'S OWN GEOMETRY — the reader's profiles are
    // register-independent (no hand-placed boxes to go stale).
    await chrome.eval(`(async () => {
      const THREE = await import('./vendor/three.module.min.js');
      // per chain row: projected [col0 (crest edge — the LIT_MATCH
      // handoff to the lit cushion top), col2 (curl direction anchor),
      // col4 (curl->deck boundary), col8 (deck direction anchor)]
      // seam-station projector (final form; two earlier forms measured
      // imagery instead of shading and are documented in the reader):
      // per chain row K emits [col0, col2, col4, col8] projections,
      // per-station |n·v| + a camera-occlusion raycast, and the row
      // index (the reader scopes the crest station to the ROLL segment
      // rows k <= 22 = NROLL, the only span where the cushion loft
      // physically adjoins — beyond it col0 is the mouth RIM, an
      // object edge, not a shading-seam subject).
      window.__jawSeam = () => {
        const cam = window.__dbg.camera;
        cam.updateMatrixWorld(true);
        const camPos = cam.getWorldPosition(new THREE.Vector3());
        const ray = new THREE.Raycaster();
        const out = [];
        // CRAFT-UPLIFT R1 item 3: the band may now carry support loops
        // inserted after the crest column, so its stride is no longer a
        // constant.  The model DECLARES its own column map on the
        // geometry (userData.tongueCols); this reader consumes that
        // declaration and keeps addressing the same four PHYSICAL
        // stations it always addressed -- crest edge, curl anchor,
        // curl->deck boundary, deck anchor.  A legacy tree publishes no
        // map and falls back to the historical 12-column layout, so the
        // gate stays runnable (and red-armable) on the old bytes.
        window.__dbg.scene.traverse((o) => {
          if (!o.isMesh || !/^cn8r82-tongue-/.test(o.name || '')) return;
          const pos = o.geometry.attributes.position;
          const nrm = o.geometry.attributes.normal;
          const map = (o.geometry.userData && o.geometry.userData.tongueCols)
            || { stride: 12, crest: 0, curl: 2, deck: 4, far: 8 };
          const COLS = map.stride;
          const COLSET = [map.crest, map.curl, map.deck, map.far];
          const NDOT = [map.crest, map.deck];
          // The tongue's top lattice is rows x stride. closeClothJaw appends
          // the solid's walls and bottom after it and publishes the lattice
          // size as cn8ClosedJaw.topVertices; those appended vertices are
          // not seam rows (reading pos.count / stride took them as
          // rows, and its fractional last row read past the buffer, whose
          // NaN projected to null).
          const jaw = o.geometry.userData && o.geometry.userData.cn8ClosedJaw;
          const top = jaw ? jaw.topVertices : pos.count;
          if (top % COLS !== 0) {
            throw new Error(o.name + ': ' + top + ' top vertices is not a whole number of ' + COLS + '-column rows');
          }
          const rows = top / COLS;
          const pts = [];
          for (let i = 0; i < rows; i++) {
            const row = []; const meta = [];
            let okRow = true;
            for (const c of COLSET) {
              const v = new THREE.Vector3().fromBufferAttribute(
                pos, i * COLS + c).applyMatrix4(o.matrixWorld);
              const q = v.clone().project(cam);
              if (q.z > 1 || q.z < -1) { okRow = false; break; }
              row.push([q.x, q.y]);
              if (NDOT.includes(c)) {
                const n = new THREE.Vector3().fromBufferAttribute(
                  nrm, i * COLS + c).transformDirection(o.matrixWorld);
                const toCam = camPos.clone().sub(v);
                const dist = toCam.length();
                const ndv = Math.abs(n.dot(toCam.normalize()));
                ray.set(camPos, v.clone().sub(camPos).normalize());
                ray.far = dist + 0.01;
                const hits = ray.intersectObjects(
                  window.__dbg.scene.children, true);
                const vis = hits.length === 0
                  || Math.abs(hits[0].distance - dist) < 0.002;
                meta.push([Math.round(ndv * 1000) / 1000, vis ? 1 : 0]);
              }
            }
            if (okRow) pts.push({ k: i, p: row, m: meta });
          }
          if (pts.length) out.push({ mesh: o.name, rows: pts });
        });
        return JSON.stringify(out);
      };
      return true;
    })()`);
    const manifest = { wh: [1440, 900], poses: {},
      ...(plant ? { perturb: { arm: 'ladder', k: LADDER_K, ...plant } } : {}) };
    for (const P of POSES) {
      let ok = false;
      for (let i = 0; i < 25 && !ok; i++) {
        ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(
          { cam: P.cam, look: P.look, fov: P.fov })})`);
        if (!ok) await sleep(200);
      }
      if (!ok) throw new Error(`${P.name}: pose rejected`);
      await sleep(600);
      await chrome.screenshot(path.join(OUT, `jawrake-${P.name}.png`));
      const seam = JSON.parse(await chrome.eval('window.__jawSeam()'));
      manifest.poses[P.name] = { pose: P, seam };
      console.log('captured', P.name,
        `(${seam.reduce((n, s) => n + s.rows.length, 0)} seam rows)`);
    }
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(OUT, 'jawrake-manifest.json'),
      JSON.stringify(manifest, null, 1));
    const errs = await chrome.eval('__test.errors.length');
    if (errs) {
      console.error('APP ERRORS:',
        await chrome.eval('JSON.stringify(__test.errors)'));
      process.exitCode = 2;
    }
  } finally {
    const gone = await chrome.closeAndWait();
    if (gone === false) throw new Error('chrome teardown unconfirmed');
  }
} finally {
  await stopStaticServer(server);
  if (band) band.release();
}
console.log('JAWRAKE captures DONE ->', OUT);
