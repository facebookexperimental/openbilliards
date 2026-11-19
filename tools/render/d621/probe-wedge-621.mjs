#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// probe-wedge-621.mjs — D621-LOOK-3 diagnostic: is the Diamond jaw wedge
// (dm-bootsleeve-*) bed cloth IN PIXELS, and if not, why?
//
// Boots the real app (tool boot, default rig), moves the camera to the sealed
// register poses r1 / r3 (kernel-coord `__test.cameraPose`, the same call the
// register capture makes), raycast-classifies the frame by mesh FAMILY name
// (sleeve / cushion / bed / collar / casting), samples the screenshot at the
// classified points IN PAGE (canvas readback, like e2e-lighting's lumaOf) and
// reports per-class median RGB / HSV. With --swap it then swaps the sleeve
// meshes' material through a ladder (unlit basic, plain standard, the bed
// cloth's own instance, the twin with recomputed normals, the twin
// double-sided, the twin with flipped normals) and re-measures after each —
// the ladder separates material from lighting / normals / coverage.
//
//   node tools/render/d621/probe-wedge-621.mjs [--web DIR] [--table ID] [--swap] [--out DIR]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from '../../../web/tools/cdp.mjs';

const args = process.argv.slice(2);
const argOf = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(argOf('--web', path.join(here, '../../../web')));
const TABLE = argOf('--table', 'diamond_proam_9ft');
const OUT = path.resolve(argOf('--out', '/tmp/d621/look3/probe-wedge'));
const SWAP = args.includes('--swap');
const SWAP2 = args.includes('--swap2');
const SWAP3 = args.includes('--swap3');
const SWAP4 = args.includes('--swap4');
const SWAP5 = args.includes('--swap5');
const ONLY = argOf('--pose', null);
// ports: the lane pins the diamond PLAN band (web/tools/lane-bands.json) by environment at every start — see
// tools/render/d621/card/README.md "Ports"; the defaults lie outside every declared band (hand runs only).
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const PORT = Number(process.env.OB_E2E_PORT ?? 26004);
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 26005);
fs.mkdirSync(OUT, { recursive: true });

// the sealed register poses (capture-488d-registers.mjs, 9 ft, kernel coords)
const POSES = {
  r1_corner_macro: { cam: [0.90, 1.53, 0.46], look: [1.27 / 2 + 0.0508, 2.54 / 2 + 0.0508, 0.01], fov: 34 },
  r3_side_macro: { cam: [1.06, -0.22, 0.26], look: [1.27 / 2 + 0.0508, 0.0, 0.02], fov: 30 },
};
const FAM = {
  sleeve: '^dm-bootsleeve-', cushion: '^dm-cushion', bed: '^dm-bed-cloth$',
  collar: '^dm-bootcollar', casting: '^dm-(casting-corner|liner-side)', rail: '^dm-railtop',
};
const CLASSIFY = `(async () => {
  const THREE = await import('./vendor/three.module.min.js');
  const { scene, camera } = window.__dbg;
  const RE = Object.fromEntries(Object.entries(${JSON.stringify(FAM)}).map(([k, v]) => [k, new RegExp(v)]));
  const ray = new THREE.Raycaster(); const W = innerWidth, H = innerHeight;
  const out = Object.fromEntries(Object.keys(RE).map((k) => [k, []]));
  for (let y = 2; y < H - 2; y += 2) for (let x = 2; x < W - 2; x += 2) {
    ray.setFromCamera(new THREE.Vector2((x / W) * 2 - 1, -((y / H) * 2 - 1)), camera);
    const h = ray.intersectObjects(scene.children, true).find((hh) => hh.object.isMesh && !hh.object.material?.transparent);
    if (!h) continue;
    const nm = h.object.name || '';
    for (const k in RE) if (RE[k].test(nm)) { out[k].push([x, y]); break; }
  }
  return out;
})()`;
const SAMPLE = (pts) => `(async () => {
  const img = new Image(); img.src = 'data:image/png;base64,' + window.__probeShot;
  await new Promise((r) => { img.onload = r; });
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  const sx = img.width / innerWidth, sy = img.height / innerHeight;
  const pts = ${JSON.stringify(pts)}; const rgb = [];
  for (const [x, y] of pts) { const i = (Math.round(y * sy) * img.width + Math.round(x * sx)) * 4; rgb.push([d[i], d[i + 1], d[i + 2]]); }
  return rgb;
})()`;
const MESHINFO = `(async () => {
  const THREE = await import('./vendor/three.module.min.js');
  const out = [];
  window.__dbg.scene.traverse((o) => {
    if (!o.isMesh || !/^dm-bootsleeve-/.test(o.name)) return;
    const g = o.geometry, n = g.getAttribute('normal'), p = g.getAttribute('position');
    let up = 0, dn = 0, sum = [0, 0, 0];
    for (let i = 0; i < n.count; i++) { const y = n.getY(i); if (y > 0.2) up++; else if (y < -0.2) dn++; sum[0] += n.getX(i); sum[1] += y; sum[2] += n.getZ(i); }
    const b = new THREE.Box3().setFromObject(o);
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    out.push({ name: o.name, mat: m.type, hex: m.color?.getHex().toString(16), uuid: m.uuid.slice(0, 8), side: m.side, gi: m.userData?.giOff, keys: Object.keys(m.userData || {}), attrs: Object.keys(g.attributes), verts: n.count, nUp: up, nDown: dn, nMean: sum.map((v) => +(v / n.count).toFixed(3)), bbox: [b.min.y, b.max.y].map((v) => +v.toFixed(4)), visible: o.visible, hasBeforeCompile: typeof m.onBeforeCompile === 'function' && m.onBeforeCompile.toString().length > 60, groups: g.groups.length, indexed: !!g.index });
  });
  return out;
})()`;
const SWAPS = {
  basic_blue: `new THREE.MeshBasicMaterial({ color: 0x0c5a9c })`,
  standard_blue: `new THREE.MeshStandardMaterial({ color: 0x0c5a9c, roughness: 0.92 })`,
  bed_instance: `window.__dbg.scene.getObjectByName('dm-bed-cloth').material`,
  twin_recomputed_normals: `(() => { o.geometry.computeVertexNormals(); return o.material; })()`,
  twin_double_sided: `(() => { const m = o.material.clone(); m.side = THREE.DoubleSide; m.onBeforeCompile = o.material.onBeforeCompile; m.customProgramCacheKey = o.material.customProgramCacheKey; m.userData = o.material.userData; return m; })()`,
  twin_flipped_normals: `(() => { const n = o.geometry.getAttribute('normal'); for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); n.needsUpdate = true; return o.material; })()`,
};
// second ladder (--swap2): split UV-driven from world-position-driven terms
// inside the injected cloth shader; also list the compiled program's uniforms
const SWAPS2 = {
  twin_uv_shift_to_bed_centre: `(() => { const uv = o.geometry.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + 1.0, uv.getY(i) + 0.5); uv.needsUpdate = true; return o.material; })()`,
  twin_uv_zero: `(() => { const uv = o.geometry.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.5); uv.needsUpdate = true; return o.material; })()`,
  twin_moved_to_bed_centre: `(() => { o.position.set(-o.geometry.boundingSphere?.center?.x ?? 0, 0.02, -(o.geometry.boundingSphere?.center?.z ?? 0)); return o.material; })()`,
  bed_instance_moved_to_bed_centre: `(() => { o.geometry.computeBoundingSphere(); const c = o.geometry.boundingSphere.center; o.position.set(-c.x, 0.02, -c.z); return window.__dbg.scene.getObjectByName('dm-bed-cloth').material; })()`,
};
// third ladder (--swap3): in-place UNIFORM toggles on the wedge's own compiled
// program (geometry untouched, so the sampled pixels stay the wedge) — which
// position-dependent term of the injected cloth shader darkens it?
const toggle = (name, val) => `(() => { const pr = window.__dbg.renderer.properties.get(o.material); const u = pr && pr.uniforms; window.__probeU = window.__probeU || []; if (u && u['${name}']) { window.__probeU.push([u['${name}'], u['${name}'].value]); u['${name}'].value = ${val}; } return o.material; })()`;
const ATTRS = `(async () => {
  const pick = (re) => { let m = null; window.__dbg.scene.traverse((o) => { if (!m && o.isMesh && re.test(o.name)) m = o; }); return m; };
  const info = (o) => o && { name: o.name, attrs: Object.fromEntries(Object.entries(o.geometry.attributes).map(([k, a]) => [k, a.itemSize])), vertexColors: (Array.isArray(o.material) ? o.material[0] : o.material).vertexColors, matUuid: (Array.isArray(o.material) ? o.material[0] : o.material).uuid.slice(0, 8) };
  return { bed: info(pick(/^dm-bed-cloth$/)), cushion: info(pick(/^dm-cushion/)), sleeve: info(pick(/^dm-bootsleeve-/)) };
})()`;
const SWAPS5 = {
  add_white_color_attr: `(() => { const THREE_ = THREE; const n = o.geometry.getAttribute('position').count; const col = new Float32Array(n * 3).fill(1); o.geometry.setAttribute('color', new THREE_.BufferAttribute(col, 3)); return o.material; })()`,
  add_aOccl_zero: `(() => { const n = o.geometry.getAttribute('position').count; o.geometry.setAttribute('aOccl', new THREE.BufferAttribute(new Float32Array(n * 2), 2)); return o.material; })()`,
  copy_cushion_missing_attrs_neutral: `(() => { let c = null; window.__dbg.scene.traverse((q) => { if (!c && q.isMesh && /^dm-cushion/.test(q.name)) c = q; }); const n = o.geometry.getAttribute('position').count; for (const [k, a] of Object.entries(c.geometry.attributes)) { if (o.geometry.getAttribute(k)) continue; const arr = new Float32Array(n * a.itemSize); if (k === 'color') arr.fill(1); o.geometry.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize)); } return o.material; })()`,
};
const SWAPS4 = {
  cushion_instance: `(() => { let c = null; window.__dbg.scene.traverse((q) => { if (!c && q.isMesh && /^dm-cushion/.test(q.name)) c = q; }); window.__probeCushionInfo = c && { name: c.name, mat: c.material.type, uuid: c.material.uuid.slice(0, 8), keys: Object.keys(c.material.userData || {}), hex: c.material.color?.getHex().toString(16) }; return c ? c.material : o.material; })()`,
  bed_instance_control: `window.__dbg.scene.getObjectByName('dm-bed-cloth').material`,
};
const SWAPS3 = {
  u_wear_off: toggle('uWearOn', 0),
  u_detail_off: toggle('uClothDetailOn', 0),
  u_occl_lamp_off: toggle('uSpikeOcclLampOn', 0),
  u_dimple_off: toggle('uDimpleDepth', 0),
  u_gi_off: toggle('uGiOn', 0),
  u_gi_shadow_off: toggle('uGiShadow', 0),
};
const RESTORE_U = `(() => { for (const [u, v] of (window.__probeU || [])) u.value = v; window.__probeU = []; return true; })()`;
const UNIFORMS = `(async () => {
  const bed = window.__dbg.scene.getObjectByName('dm-bed-cloth');
  let w = null; window.__dbg.scene.traverse((o) => { if (!w && o.isMesh && /^dm-bootsleeve-/.test(o.name)) w = o; });
  const keys = (m) => { const pr = window.__dbg.renderer.properties.get(m); const u = pr?.uniforms || {}; return Object.keys(u).filter((k) => /^u[A-Z]/.test(k)).sort(); };
  const vals = (m, names) => { const pr = window.__dbg.renderer.properties.get(m); const u = pr?.uniforms || {}; return Object.fromEntries(names.filter((n) => u[n]).map((n) => [n, typeof u[n].value === 'object' ? (u[n].value?.x !== undefined ? [u[n].value.x, u[n].value.y] : '(obj)') : u[n].value])); };
  const names = ['uGiOn','uGiShadow','uWearOn','uWearHalf','uClothDetailOn','uDimpleDepth','uSpikeOcclLampOn','uGiScale'];
  return { bed: keys(bed.material), wedge: w ? keys(w.material) : null, bedVals: vals(bed.material, names), wedgeVals: w ? vals(w.material, names) : null };
})()`;
const swapJs = (expr) => `(async () => {
  const THREE = await import('./vendor/three.module.min.js');
  window.__probeOrig = window.__probeOrig || new Map();
  window.__dbg.scene.traverse((o) => { if (!o.isMesh || !/^dm-bootsleeve-/.test(o.name)) return;
    if (!window.__probeOrig.has(o.uuid)) window.__probeOrig.set(o.uuid, { mat: o.material, normals: o.geometry.getAttribute('normal').array.slice(), uv: o.geometry.getAttribute('uv').array.slice() });
    o.material = ${expr}; });
  return true; })()`;
const RESTORE = `(async () => { window.__dbg.scene.traverse((o) => { if (!o.isMesh || !/^dm-bootsleeve-/.test(o.name)) return; const s = window.__probeOrig?.get(o.uuid); if (!s) return; o.material = s.mat; const n = o.geometry.getAttribute('normal'); n.array.set(s.normals); n.needsUpdate = true; const uv = o.geometry.getAttribute('uv'); if (s.uv) { uv.array.set(s.uv); uv.needsUpdate = true; } o.position.set(0, 0, 0); for (const k of Object.keys(o.geometry.attributes)) { if (!['position','uv','normal'].includes(k)) o.geometry.deleteAttribute(k); } }); return true; })()`;
const hsv = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return { h: +h.toFixed(0), s: +(mx ? d / mx : 0).toFixed(3), v: +(mx / 255).toFixed(3) }; };
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const stats = (rgb) => { if (!rgb.length) return null; const m = [0, 1, 2].map((c) => med(rgb.map((p) => p[c]))); const hs = rgb.map(hsv); const inBand = hs.filter((q) => q.h >= 185 && q.h <= 225 && q.s >= 0.35).length / rgb.length; return { n: rgb.length, medRGB: m, ...hsv(m), medS: med(hs.map((q) => q.s)), medV: med(hs.map((q) => q.v)), clothBandFrac: +inBand.toFixed(3) }; };

const server = spawnStaticServer(WEB, PORT); await sleep(700);
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1&table=${TABLE}`, { port: CDP, width: 1600, height: 1000 });
try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); try { ready = await chrome.eval('window.__test?.ready === true'); } catch { /* nav */ } }
  if (!ready) throw new Error('app never became ready');
  await sleep(1800);
  const report = { table: TABLE, web: WEB, poses: {} };
  report.meshes = await chrome.eval(MESHINFO);
  console.log('[sleeve meshes]'); for (const m of report.meshes) console.log(' ', JSON.stringify(m));
  const measure = async (pose) => {
    await chrome.eval(`__test.cameraPose(${JSON.stringify(POSES[pose])})`); await sleep(600);
    const classes = await chrome.eval(CLASSIFY);
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
    await chrome.eval(`window.__probeShot = ${JSON.stringify(data)}; true`);
    const res = {};
    for (const k of Object.keys(classes)) res[k] = stats(await chrome.eval(SAMPLE(classes[k].slice(0, 4000))));
    return { classes, res, shot: data };
  };
  report.attrs = await chrome.eval(ATTRS).catch((e) => String(e));
  console.log('[attrs]', JSON.stringify(report.attrs));
  report.clothUniforms = await chrome.eval(UNIFORMS).catch(() => null);
  console.log('[cloth program uniforms]', JSON.stringify(report.clothUniforms));
  for (const pose of Object.keys(POSES)) {
    if (ONLY && pose !== ONLY) continue;
    const m = await measure(pose);
    fs.writeFileSync(path.join(OUT, `${pose}-base.png`), Buffer.from(m.shot, 'base64'));
    report.poses[pose] = { base: m.res, swaps: {} };
    console.log(`[${pose}] base`, JSON.stringify(m.res));
    const ladder = { ...(SWAP ? SWAPS : {}), ...(SWAP2 ? SWAPS2 : {}), ...(SWAP3 ? SWAPS3 : {}), ...(SWAP4 ? SWAPS4 : {}), ...(SWAP5 ? SWAPS5 : {}) };
    if (Object.keys(ladder).length) {
      for (const [tag, expr] of Object.entries(ladder)) {
        await chrome.eval(swapJs(expr)); await sleep(500);
        const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
        await chrome.eval(`window.__probeShot = ${JSON.stringify(data)}; true`);
        const rgb = await chrome.eval(SAMPLE(m.classes.sleeve.slice(0, 4000)));
        report.poses[pose].swaps[tag] = stats(rgb);
        fs.writeFileSync(path.join(OUT, `${pose}-${tag}.png`), Buffer.from(data, 'base64'));
        console.log(`[${pose}] swap ${tag}`, JSON.stringify(report.poses[pose].swaps[tag]), tag === 'cushion_instance' ? JSON.stringify(await chrome.eval('window.__probeCushionInfo')) : '');
        await chrome.eval(RESTORE); await chrome.eval(RESTORE_U); await sleep(200);
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'probe-wedge.json'), JSON.stringify(report, null, 1));
  console.log('written', path.join(OUT, 'probe-wedge.json'));
} finally {
  await chrome.closeAndWait?.().catch?.(() => {}) ?? chrome.close?.();
  await stopStaticServer(server);
}
