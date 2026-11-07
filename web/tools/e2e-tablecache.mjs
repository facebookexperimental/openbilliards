// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-tablecache.mjs — per-spec table cache gate (GH-976, build 20 perf audit).
// One boot per register (desktop 1280x800, where the cache has a byte budget;
// phone 844x390 touch, where it keeps two resident tables). Each boot walks
//   8-ball (pool 9-ft, cold) -> snooker (cold) -> 8-ball (HIT) -> snooker (HIT)
//   -> __tableCache.flush() -> 8-ball (cold again) -> snooker (cold again)
// and judges the cache against the fresh builds of the SAME boot:
//
//   arms:
//   C1 parity: the state after a cache hit equals the state after a fresh
//      build of the same table, compared as a content signature —
//      every table mesh (name, world matrix, visibility, geometry attribute
//      and index bytes after the snooker occlusion bake landed), every
//      material (type, scalar look parameters, program cache key, texture
//      CONTENT: canvas pixels / image source / data bytes), the
//      out-of-group build state (env extent, sink dress/rest specs present,
//      build-owned userData keys) and a pixel hash of a pinned camera view
//      rendered into a render target (only the table group and the lights, on a
//      private layer, environment term off — the env cube carries bake history).
//      The determinism floor (GH-978): the two cold snooker builds of one boot
//      agree (same-key occlusion jobs used to overwrite each other).
//   C2 hit cost: a revisit uploads no table geometry and links no new
//      program for a table material (an independent registry: the renderer
//      adds a 'dispose' listener on first upload / first program); the cold
//      builds of the same boot do both.
//   C3 budget (build 20 ruling B): desktop holds a 256 MiB byte budget from
//      the cache's own accounting, the detached entries plus the live build
//      stay inside it, and a cycle through all five shipped tables (pool,
//      metal-rim, Chinese-8, carom, snooker) followed by a re-entry to each
//      rebuilds nothing; trim(bytes) releases least recently used entries
//      first and stops once the cache fits. The phone keeps a count budget of
//      2 (one detached entry) and a third table evicts the least recently used
//      one. A same-key re-detach releases the older record, and after flush()
//      every registered table geometry that is not in the scene was disposed.
//      The cache's per-table footprints are printed (desktop).
//   C3 tight (the byte path itself; every shipped table fits 256 MiB, so the
//      walks above never evict by bytes): a boot with
//      ?obArm=table-cache-tight (96 MiB) walks the five tables; after every
//      switch the detached entries plus the live build fit the budget (or only
//      the live build is left), the detached keys are always the most
//      recently left tables, and the budget evicts at all.
//   C3 touchscreen: a desktop boot reporting 5 touch points with a fine
//      pointer keeps the desktop byte budget (the phone register is the app's
//      `(pointer: coarse)` predicate).
//
//   node web/tools/e2e-tablecache.mjs [--port 8297] [--only desktop|phone|tight|touchscreen] [--cache-off] [--arm <obArm name>]
//   (--arm table-cache-count3 = the byte-budget arm's planted red: the earlier 3-table count budget on desktop)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { setPhoneMetrics } from './touch-cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
// suite-unique verified-free ports (parallel-worktree law)
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8297);
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 16397);
// GH-410 port inventory: one Chrome at a time (CDP +0), one http server (+0).
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http' };
const ONLY = argOf('--only');
// the always-rebuild reference (scripted-boot arm seam): with it, C2's "a revisit uploads nothing" must fail
const CACHE_OFF = args.includes('--cache-off');
// one more scripted-boot arm seam for planted reds (e.g. table-cache-count3)
const ARM = argOf('--arm');
const fail = (msg) => { console.error('E2E-TABLECACHE FAIL:', msg); process.exitCode = 1; };
const check = (name, ok, detail = '') => {
  if (ok) console.log('[e2e-tablecache] PASS', name, detail ? `(${detail})` : '');
  else fail(`${name}${detail ? ' — ' + detail : ''}`);
};

const SETTLED = (g) => `(async () => {
  const s = window.__settings?.get?.(); if (!s || s.game !== ${JSON.stringify(g)}) return false;
  const t = await import('/scene/table.js'); if (t.activeTableId?.() !== s.equipment?.table_id) return false;
  const gi = window.__gi?.state; if (!gi || !gi.ready || gi.appliedSeq !== gi.applySeq) return false;
  if ((window.__snkOccl?.pending?.() ?? 0) !== 0) return false;
  if (window.__rebakeEnv?.pending) return false;
  const v = window.__lighting?.state?.()?.venue;
  if (v && (v.pending === true || v.rebakeQueued === true || v.capturePending === true)) return false;
  for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
  return true;
})()`;

// three-object registry (geometries + programs-by-material) installed after boot
const REGISTRY = `(async () => {
  const THREE = await import('three');
  const ED = THREE.EventDispatcher.prototype;
  if (ED.__obTablecacheReg) return 'already';
  const R = window.__obTcReg = { geo: new Set(), mat: new Set(), newGeo: 0, newMat: 0, seq: 0, at: new WeakMap() };
  const add = ED.addEventListener, rm = ED.removeEventListener;
  ED.addEventListener = function (type, fn) {
    if (type === 'dispose') {
      if (this.isBufferGeometry && !R.geo.has(this)) { R.geo.add(this); R.newGeo++; R.at.set(this, ++R.seq); }
      if (this.isMaterial && !R.mat.has(this)) { R.mat.add(this); R.newMat++; R.at.set(this, ++R.seq); }
    }
    return add.call(this, type, fn);
  };
  ED.removeEventListener = function (type, fn) {
    if (type === 'dispose') { if (this.isBufferGeometry) R.geo.delete(this); if (this.isMaterial) R.mat.delete(this); }
    return rm.call(this, type, fn);
  };
  ED.__obTablecacheReg = true;
  return 'installed';
})()`;

// content signature of the built table + a pinned-view pixel hash
const SIGNATURE = `(async () => {
  const THREE = await import('three');
  const D = window.__dbg; const scene = D.scene, renderer = D.renderer;
  const group = scene.getObjectByName('obTable') ?? (await import('/scene/table.js')).tableGroup?.();
  if (!group) throw new Error('no table group');
  let h = 0x811c9dc5 >>> 0;
  const mixBytes = (u8) => { for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193) >>> 0; } };
  const mixStr = (s) => { s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; } };
  const part = () => { const v = h.toString(16).padStart(8, '0'); h = 0x811c9dc5 >>> 0; return v; };
  const texSig = new Map();
  const texHash = (t) => {
    if (!t) return 'none';
    if (texSig.has(t)) return texSig.get(t);
    let s = t.constructor.name + ':' + [t.wrapS, t.wrapT, t.magFilter, t.minFilter, t.flipY, t.colorSpace, t.anisotropy,
      t.repeat?.x, t.repeat?.y, t.offset?.x, t.offset?.y, t.rotation, t.generateMipmaps].join(',');
    const im = t.image;
    const save = h; h = 0x811c9dc5 >>> 0;
    if (t.isCubeTexture) { mixStr('cube:' + (im?.length ?? 0)); }
    else if (im && typeof HTMLCanvasElement !== 'undefined' && im instanceof HTMLCanvasElement) {
      const c = im.getContext('2d'); mixStr(im.width + 'x' + im.height);
      if (c) mixBytes(c.getImageData(0, 0, im.width, im.height).data); else mixStr('webgl-canvas');
    } else if (im && im.src) { mixStr(im.src.replace(/^.*\\/\\/[^/]+/, '')); }
    else if (im && im.data) { mixStr(im.width + 'x' + im.height); mixBytes(new Uint8Array(im.data.buffer, im.data.byteOffset, im.data.byteLength)); }
    else mixStr('opaque');
    s += ':' + part(); h = save;
    texSig.set(t, s);
    return s;
  };
  const MAT_KEYS = ['type', 'name', 'transparent', 'opacity', 'side', 'depthWrite', 'depthTest', 'alphaTest', 'vertexColors',
    'roughness', 'metalness', 'clearcoat', 'clearcoatRoughness', 'sheen', 'envMapIntensity', 'emissiveIntensity',
    'lightMapIntensity', 'aoMapIntensity', 'bumpScale', 'flatShading', 'wireframe', 'toneMapped', 'polygonOffset'];
  const matSig = (m) => {
    const out = MAT_KEYS.map((k) => k + '=' + (typeof m[k] === 'number' ? m[k].toPrecision(7) : m[k]));
    for (const k of ['color', 'emissive', 'sheenColor', 'specularColor']) if (m[k]?.getHexString) out.push(k + '=' + m[k].getHexString());
    for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) out.push(k + '=' + texHash(v)); }
    if (m.normalScale) out.push('normalScale=' + m.normalScale.x + ',' + m.normalScale.y);
    out.push('key=' + (m.customProgramCacheKey?.() ?? ''));
    out.push('defines=' + JSON.stringify(m.defines ?? {}));
    if (m.uniforms) for (const [k, u] of Object.entries(m.uniforms)) {
      const v = u?.value; if (v && v.isTexture) out.push('u.' + k + '=' + texHash(v));
      else if (typeof v === 'number') out.push('u.' + k + '=' + v.toPrecision(7));
    }
    return out.join(';');
  };
  group.updateMatrixWorld(true);
  const meshes = [];
  group.traverse((o) => { if (o.isMesh || o.isLine || o.isPoints) meshes.push(o); });
  let geoAll = 0x811c9dc5 >>> 0, matAll = 0x811c9dc5 >>> 0;
  const rows = [];
  for (const o of meshes) {
    h = 0x811c9dc5 >>> 0;
    mixStr(o.name + '|' + o.type + '|' + o.visible + '|' + o.renderOrder);
    mixBytes(new Uint8Array(new Float32Array(o.matrixWorld.elements).buffer));
    const g = o.geometry;
    const attrs = [];
    for (const name of Object.keys(g.attributes).sort()) {
      const a = g.attributes[name]; mixStr(name + ':' + a.itemSize + ':' + a.count);
      const arr = a.array; const save = h; h = 0x811c9dc5 >>> 0;
      mixBytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)); const ah = part(); h = save; mixStr(ah);
      attrs.push(name + '=' + ah);
    }
    if (g.index) { const arr = g.index.array; mixBytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)); }
    mixStr(JSON.stringify(g.groups ?? []) + JSON.stringify(g.drawRange));
    const gh = part();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mixStr(mats.map(matSig).join('||'));
    const mh = part();
    rows.push(o.name + ' ' + gh + ' ' + mh + ' [' + attrs.join(' ') + ']');
    for (const c of gh) { geoAll ^= c.charCodeAt(0); geoAll = Math.imul(geoAll, 0x01000193) >>> 0; }
    for (const c of mh) { matAll ^= c.charCodeAt(0); matAll = Math.imul(matAll, 0x01000193) >>> 0; }
  }
  // out-of-group build state
  const t = await import('/scene/table.js');
  const pockets = t.makeGeom(t.activeTableId()).pockets ?? [];
  const num = (v) => (typeof v === 'number' ? Number(v.toPrecision(7)) : v);
  const plain = (o) => (o ? Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== 'function' && typeof v !== 'object').map(([k, v]) => [k, num(v)])) : null);
  const state = JSON.stringify({ envExtent: window.__envExtent?.get?.() ?? null,
    userData: ['cn8Occluders', 'cn8TransportArtifact', 'cn8Furniture', 'cn8GeometricNets'].filter((k) => k in group.userData),
    dress: pockets.map((p) => plain(t.sinkDressFor?.(p.x, p.z))),
    rest: pockets.map((p) => plain(t.sinkRestFor?.(p.x, p.z))),
    roomMin: window.__gi?.uniforms?.uRoomMin?.value?.toArray?.() ?? null });
  // pinned view: hide everything but the table group, the room and the lights; render into a target; hash the pixels
  const W = 320, H = 200;
  const cam = new THREE.PerspectiveCamera(38, W / H, 0.05, 40);
  cam.position.set(2.2, 2.0, 2.6); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
  // the table group and every light on a private layer; the environment term off (the env cube is re-baked
  // per class switch and carries bake history, issue #971 — it is not the subject here)
  const L = 31, layered = [];
  group.traverse((o) => { if (!o.layers.isEnabled(L)) { o.layers.enable(L); layered.push(o); } });
  scene.traverse((o) => { if (o.isLight && !o.layers.isEnabled(L)) { o.layers.enable(L); layered.push(o); } });
  cam.layers.set(L);
  const envI = scene.environmentIntensity; scene.environmentIntensity = 0;
  const rt = new THREE.WebGLRenderTarget(W, H);
  const prevRT = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(scene, cam);
  const px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
  renderer.setRenderTarget(prevRT); rt.dispose();
  scene.environmentIntensity = envI;
  for (const o of layered) o.layers.disable(L);
  h = 0x811c9dc5 >>> 0; mixBytes(px); const pixel = part();
  return { meshes: meshes.length, geo: geoAll.toString(16), mat: matAll.toString(16), state, pixel, rows,
    pxSum: px.reduce((a, b) => a + b, 0) };
})()`;

async function runRegister(register) {
  const W = register === 'phone' ? 844 : 1280, H = register === 'phone' ? 390 : 800;
  const url = `http://127.0.0.1:${PORT}/app.html?seed=1`;
  const chrome = await launchChrome(`http://127.0.0.1:${PORT}/`, { port: CDP, width: W, height: H });
  const errors = [];
  chrome.onEvent((m, p) => { if (m === 'Runtime.consoleAPICalled' && p.type === 'error') errors.push(p.args.map((a) => a.value ?? a.description).join(' ')); });
  const waitFor = async (expr, ms, what) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await chrome.eval(expr).catch(() => false)) return; await sleep(150); }
    throw new Error(`[${register}] timed out waiting for ${what}`);
  };
  try {
    if (register === 'phone') await setPhoneMetrics(chrome, { width: W, height: H, deviceScaleFactor: 3, maxTouchPoints: 5 });
    await chrome.send('Page.navigate', { url: url + '&obtool=1' + (CACHE_OFF ? '&obArm=table-cache-off' : '') + (ARM ? '&obArm=' + ARM : '') });
    await waitFor('window.__test?.ready === true && !!window.__settings && !!window.__gi && !!window.__tableCache', 120000, 'boot ready');
    await waitFor(`(() => { const gi = window.__gi?.state; return !!gi && gi.ready && gi.appliedSeq === gi.applySeq
      && (window.__snkOccl?.pending?.() ?? 0) === 0; })()`, 90000, 'boot settle');
    const cs0 = await chrome.eval('window.__tableCache.state()');
    const budgetOf = (c) => (c.budget === 'bytes' ? `bytes ${c.budgetBytes}` : `count ${c.resident}`);
    console.log(`[e2e-tablecache] ${register}: cache budget ${budgetOf(cs0)}, off ${cs0.off}`);
    const wantBudget = register === 'phone' ? 'count 2' : `bytes ${256 * 1048576}`;
    check(`C3 ${register} the budget is the register's (${wantBudget})`, budgetOf(cs0) === wantBudget, budgetOf(cs0));
    await chrome.eval(REGISTRY);
    const step = async (g, label) => {
      const before = await chrome.eval('({ g: window.__obTcReg.newGeo, m: window.__obTcReg.newMat, seq: window.__obTcReg.seq, progs: window.__dbg.renderer.info.programs.map((p) => p.id) })');
      // g = a game id (changeGame) or { table } (an equipment table switch inside the current game)
      const ok = typeof g === 'string'
        ? await chrome.eval(`window.__settings.changeGame(${JSON.stringify(g)}, { skipConfirm: true })`)
        : await chrome.eval(`window.__settings.changeEquipment('table_id', ${JSON.stringify(g.table)}, { skipConfirm: true })`);
      if (ok !== true) throw new Error(`[${register}] switch ${JSON.stringify(g)} returned ${ok}`);
      const game = typeof g === 'string' ? g : await chrome.eval('window.__settings.get().game');
      await waitFor(SETTLED(game), 120000, `${label} settle`);
      const links = await chrome.eval(`(() => { const b = new Set(${JSON.stringify(before.progs)});
        return window.__dbg.renderer.info.programs.filter((p) => !b.has(p.id) && /spike/.test(p.cacheKey) && !/spikeball/.test(p.cacheKey)).length; })()`);
      const after = await chrome.eval(`(() => { const R = window.__obTcReg; const tg = window.__dbg.scene.getObjectByName('obTable');
        const geos = new Set(), mats = new Set(); tg?.traverse((o) => { if (o.geometry) geos.add(o.geometry); for (const m of [].concat(o.material ?? [])) mats.add(m); });
        let tGeo = 0, tMat = 0; for (const g of geos) if ((R.at.get(g) ?? 0) > ${before.seq}) tGeo++; for (const m of mats) if ((R.at.get(m) ?? 0) > ${before.seq}) tMat++;
        let liveGeo = 0, liveInScene = 0; const sceneGeos = new Set(); R.names ??= new WeakMap();
        window.__dbg.scene.traverse((o) => { if (o.geometry) { sceneGeos.add(o.geometry); R.names.set(o.geometry, (o.parent?.name ? o.parent.name + '/' : '') + (o.name || o.type)); } });
        R.tableSeen ??= new Set(); for (const g of geos) R.tableSeen.add(g);
        for (const g of R.geo) { liveGeo++; if (sceneGeos.has(g)) liveInScene++; }
        return { g: R.newGeo, m: R.newMat, tGeo, tMat, tableGeos: geos.size, liveGeo, liveInScene, table: window.__settings.get().equipment?.table_id,
          cache: window.__tableCache.state() }; })()`);
      const sig = await chrome.eval(SIGNATURE);
      // table-group objects that were uploaded / linked for the first time during this step
      const row = { label, g, newGeo: after.tGeo, newMat: after.tMat, links, ...after, sig };
      console.log(`[e2e-tablecache] ${register} ${label}: meshes ${sig.meshes} geo ${sig.geo} mat ${sig.mat} pixel ${sig.pixel} `
        + `| new geometries ${row.newGeo}, new materials ${row.newMat}, new table programs ${row.links} | cache ${JSON.stringify({ keys: after.cache.keys, hits: after.cache.hits, misses: after.cache.misses, evictions: after.cache.evictions, MiB: +(after.cache.bytes / 1048576).toFixed(1) })}`);
      return row;
    };
    const P1 = await step('eight_ball', 'pool cold');
    const S1 = await step('snooker', 'snooker cold');
    const P2 = await step('eight_ball', 'pool HIT');
    const S2 = await step('snooker', 'snooker HIT');
    // flush() drops DETACHED entries only: once before each cold-again step (the table being entered is detached then)
    await chrome.eval('window.__tableCache.flush()');
    const P3 = await step('eight_ball', 'pool cold again');
    await chrome.eval('window.__tableCache.flush()');
    const S3 = await step('snooker', 'snooker cold again');
    const same = (a, b) => a.sig.geo === b.sig.geo && a.sig.mat === b.sig.mat && a.sig.state === b.sig.state && a.sig.pixel === b.sig.pixel;
    const diff = (a, b) => ['geo', 'mat', 'state', 'pixel'].filter((k) => a.sig[k] !== b.sig[k]).join(',')
      + ((a.sig.mat !== b.sig.mat || a.sig.geo !== b.sig.geo)
        ? (() => { const i = a.sig.rows.findIndex((r, k) => r !== b.sig.rows[k]); const n = a.sig.rows.filter((r, k) => r !== b.sig.rows[k]).length;
          return ` ${n} differing meshes; first: ${a.sig.rows[i] ?? 'count'} VS ${b.sig.rows[i] ?? 'count'}`; })() : '')
      + (a.sig.state !== b.sig.state ? ` state ${a.sig.state} vs ${b.sig.state}` : '');
    check(`C1 ${register} snooker: cache hit == fresh build`, same(S2, S3), same(S2, S3) ? `${S2.sig.meshes} meshes` : diff(S2, S3));
    check(`C1 ${register} pool 9-ft: cache hit == fresh build`, same(P2, P3), same(P2, P3) ? `${P2.sig.meshes} meshes` : diff(P2, P3));
    check(`C1 ${register} determinism floor: the two cold snooker builds agree`, same(S1, S3), same(S1, S3) ? '' : diff(S1, S3));
    check(`C2 ${register} a revisit uploads no table geometry, creates no table material and links no table program`,
      P2.newGeo === 0 && S2.newGeo === 0 && P2.newMat === 0 && S2.newMat === 0 && P2.links === 0 && S2.links === 0,
      `hits: pool +${P2.newGeo} geo/+${P2.newMat} mat/+${P2.links} prog, snooker +${S2.newGeo}/+${S2.newMat}/+${S2.links}; `
      + `colds: pool +${P3.newGeo}/+${P3.newMat}/+${P3.links}, snooker +${S3.newGeo}/+${S3.newMat}/+${S3.links}`);
    check(`C2 ${register} the cold builds of the same boot do upload and link (instrument live)`, S3.newGeo > 0 && P3.newGeo > 0 && S3.links + P3.links > 0,
      `snooker +${S3.newGeo} geo/+${S3.links} prog, pool +${P3.newGeo}/+${P3.links}`);
    if (register === 'desktop') {
      // Chinese-8: dent a sock before the switch away (a netted ball); the hit must come back pristine
      const H1 = await step('heyball', 'chinese8 cold');
      const dented = await chrome.eval(`(async () => { const t = await import('/scene/table.js');
        for (const p of t.makeGeom(t.activeTableId()).pockets ?? []) { const d = t.sinkDressFor?.(p.x, p.z); if (d?.net?.deform && d.net.restAt) {
          const r = d.net.restAt(0); d.net.deform([{ x: r.x, y: r.y, z: r.z, r: 0.026, w: 1, tau: 0.4 }]); return true; } } return false; })()`);
      await step('eight_ball', 'pool (leave chinese8)');
      const H2 = await step('heyball', 'chinese8 HIT');
      await chrome.eval('window.__tableCache.flush()');
      await step('eight_ball', 'pool cold (cn8 reference)');
      await chrome.eval('window.__tableCache.flush()');
      const H3 = await step('heyball', 'chinese8 cold again');
      check('C1 desktop chinese8: cache hit (after a dented sock) == fresh build', dented && same(H2, H3),
        !dented ? 'no cn8 sock to dent' : same(H2, H3) ? `${H2.sig.meshes} meshes` : diff(H2, H3));
      check('C1 desktop chinese8 determinism floor', same(H1, H3), same(H1, H3) ? '' : diff(H1, H3));
      // Predator-style pool table (sink rests, well clone, venue ambient) through equipment switches in 8-ball
      await step('eight_ball', 'pool (8-ball for the equipment switches)');
      const M1 = await step({ table: 'pool_pro_9ft_metal_rim' }, 'metal-rim cold');
      await step({ table: 'pool_pro_9ft' }, 'pool (leave metal-rim)');
      const M2 = await step({ table: 'pool_pro_9ft_metal_rim' }, 'metal-rim HIT');
      await chrome.eval('window.__tableCache.flush()');
      await step({ table: 'pool_pro_9ft' }, 'pool cold (metal-rim reference)');
      await chrome.eval('window.__tableCache.flush()');
      const M3 = await step({ table: 'pool_pro_9ft_metal_rim' }, 'metal-rim cold again');
      check('C1 desktop metal-rim (Predator class): cache hit == fresh build', same(M2, M3), same(M2, M3) ? `${M2.sig.meshes} meshes` : diff(M2, M3));
      check('C1 desktop metal-rim determinism floor', same(M1, M3), same(M1, M3) ? '' : diff(M1, M3));
      const C1pre = M3;
      check('C2 desktop chinese8 / metal-rim revisits link no table program', H2.links === 0 && M2.links === 0 && H2.newGeo === 0 && M2.newGeo === 0,
        `chinese8 +${H2.newGeo} geo/+${H2.links} prog, metal-rim +${M2.newGeo}/+${M2.links}`);
      // a live cloth change moves a build onto the key of an OLDER build of the same table: the older record must be
      // released (C3's off-scene census below fails if it is silently dropped)
      const cloth = async (id) => { await chrome.eval(`window.__settings.set('clothColor', ${JSON.stringify(id)}), true`);
        await waitFor(`(async () => { const t = await import('/scene/table.js');
          for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
          return t.clothColorState?.().id === ${JSON.stringify(id)}; })()`, 30000, 'cloth ' + id); };
      await chrome.eval('window.__tableCache.flush()');
      await step({ table: 'pool_pro_9ft' }, 'pool (cloth scenario)');
      await step('snooker', 'snooker (pool cached, factory cloth)');
      await cloth('tournament_blue');
      await step('eight_ball', 'pool under blue (miss)');
      await cloth('');
      const K = await step('snooker', 'snooker (pool detached onto its older key)');
      check('C3 desktop a same-key re-detach releases the older record', K.cache.evictions > C1pre.cache.evictions,
        `evictions ${C1pre.cache.evictions} -> ${K.cache.evictions}`);
      // ruling B: every shipped table fits the desktop byte budget. From an empty cache (the live snooker build stays),
      // a cycle through the other four tables builds each once; a re-entry to each of the five then rebuilds nothing.
      const MiB = (b) => (b / 1048576).toFixed(1);
      const f0 = await chrome.eval('window.__tableCache.flush(), window.__tableCache.state()');
      const cyc = [{ label: 'snooker', table: K.table, cache: f0 }];
      cyc.push(await step('eight_ball', 'cycle: pool'));
      cyc.push(await step({ table: 'pool_pro_9ft_metal_rim' }, 'cycle: metal-rim'));
      cyc.push(await step('heyball', 'cycle: chinese8'));
      cyc.push(await step('carom_3cushion', 'cycle: carom'));
      console.log('[e2e-tablecache] desktop footprint (the cache\'s own accounting, MiB): '
        + cyc.map((r, i) => `${r.table} ${MiB(r.cache.bytes - (i ? cyc[i - 1].cache.bytes : 0))}`).join(', ')
        + `; all five resident ${MiB(cyc.at(-1).cache.bytes)} of ${cs0.budgetBytes === null ? 'no byte budget' : MiB(cs0.budgetBytes)}`);
      const m0 = cyc.at(-1).cache;
      const back = [];
      back.push(await step('snooker', 're-entry: snooker'));
      back.push(await step('eight_ball', 're-entry: 8-ball table'));
      back.push(await step({ table: back.at(-1).table === 'pool_pro_9ft' ? 'pool_pro_9ft_metal_rim' : 'pool_pro_9ft' }, 're-entry: the other 9-ft'));
      back.push(await step('heyball', 're-entry: chinese8'));
      back.push(await step('carom_3cushion', 're-entry: carom'));
      const m1 = back.at(-1).cache;
      check('C3 desktop a cycle through all five tables, then a re-entry to each, rebuilds nothing (byte budget)',
        new Set(back.map((r) => r.table)).size === 5 && m1.misses === m0.misses && m1.hits - m0.hits === 5 && back.every((r) => r.newGeo === 0 && r.links === 0),
        `re-entries: ${m1.hits - m0.hits} hits, ${m1.misses - m0.misses} misses (rebuilds), evictions ${m0.evictions} -> ${m1.evictions}; `
        + back.map((r) => `${r.table} +${r.newGeo} geo/+${r.links} prog`).join(', '));
      const rows = [P1, S1, P2, S2, P3, S3, H1, H2, H3, M1, M2, M3, K, ...cyc, ...back];
      const maxBytes = Math.max(...rows.map((r) => r.cache.bytes));
      check('C3 desktop the detached entries plus the live build stay within the byte budget', cs0.budgetBytes !== null && maxBytes <= cs0.budgetBytes,
        `max ${MiB(maxBytes)} MiB of ${cs0.budgetBytes === null ? 'no byte budget' : MiB(cs0.budgetBytes) + ' MiB'}`);
      // trim(bytes) (the memory-pressure hook the budget also runs through): least recently used first, only until it fits
      const t0 = await chrome.eval('window.__tableCache.state()');
      const t1 = await chrome.eval(`window.__tableCache.trim(${t0.bytes - 1})`);
      check('C3 desktop trim(bytes) releases the least recently used entry first and stops once the cache fits',
        t1.evictions - t0.evictions === 1 && JSON.stringify(t1.keys) === JSON.stringify(t0.keys.slice(1)) && t1.bytes <= t0.bytes - 1,
        `before: ${t0.keys.length} entries / ${MiB(t0.bytes)} MiB; trim(${t0.bytes - 1}): released ${t0.keys[0]}, `
        + `${t1.keys.length} entries / ${MiB(t1.bytes)} MiB, evictions +${t1.evictions - t0.evictions}`);
    } else {
      // the phone's count budget: one detached entry; a third table evicts the least recently used one
      const E0 = S3.cache;
      const E1 = (await step('carom_3cushion', 'carom (a third table)')).cache;
      check('C3 phone a third table evicts the least recently used entry (count budget 2)',
        E1.evictions - E0.evictions === 1 && E1.keys.length === 1 && !E1.keys.includes(E0.keys[0]),
        `before ${JSON.stringify(E0.keys)}, after ${JSON.stringify(E1.keys)}, evictions +${E1.evictions - E0.evictions}`);
      const maxKeys = Math.max(...[P1, S1, P2, S2, P3, S3].map((r) => r.cache.keys.length), E1.keys.length);
      check('C3 phone never more than one detached entry', maxKeys <= 1, `max ${maxKeys}`);
    }
    await chrome.eval('window.__tableCache.flush()');
    const leak = await chrome.eval(`(() => { const R = window.__obTcReg; const sceneGeos = new Set(); window.__dbg.scene.traverse((o) => { if (o.geometry) sceneGeos.add(o.geometry); });
      // table geometries only (seen in the table group at any step): the PMREM lod planes etc. live off-scene by design
      let off = 0, table = 0; const names = [];
      for (const g of R.geo) { if (!R.tableSeen.has(g)) continue; table++; if (!sceneGeos.has(g)) { off++; if (names.length < 10) names.push(R.names?.get(g) ?? '?'); } }
      return { live: table, offScene: off, names }; })()`);
    check(`C3 ${register} after flush() no table geometry lives off-scene (evicted entries were disposed)`, leak.offScene === 0, `${leak.offScene} of ${leak.live} live table geometries off-scene${leak.names.length ? ': ' + leak.names.join(', ') : ''}`);
    check(`${register} no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await chrome.closeAndWait();
  }
}

// C3 tight: the desktop byte budget evicting during ordinary switches (see the header)
async function runTight() {
  const chrome = await launchChrome(`http://127.0.0.1:${PORT}/`, { port: CDP, width: 1280, height: 800 });
  const errors = [];
  chrome.onEvent((m, p) => { if (m === 'Runtime.consoleAPICalled' && p.type === 'error') errors.push(p.args.map((a) => a.value ?? a.description).join(' ')); });
  const waitFor = async (expr, ms, what) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await chrome.eval(expr).catch(() => false)) return; await sleep(150); }
    throw new Error(`[tight] timed out waiting for ${what}`);
  };
  try {
    await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?seed=1&obtool=1&obArm=table-cache-tight` });
    await waitFor('window.__test?.ready === true && !!window.__settings && !!window.__gi && !!window.__tableCache', 120000, 'boot ready');
    await waitFor(`(() => { const gi = window.__gi?.state; return !!gi && gi.ready && gi.appliedSeq === gi.applySeq
      && (window.__snkOccl?.pending?.() ?? 0) === 0; })()`, 90000, 'boot settle');
    const cs0 = await chrome.eval('window.__tableCache.state()');
    const MiB = (b) => (b / 1048576).toFixed(1);
    check('C3 tight the table-cache-tight seam sets a 96 MiB desktop byte budget', cs0.budget === 'bytes' && cs0.budgetBytes === 96 * 1048576,
      `${cs0.budget} ${cs0.budgetBytes}`);
    let order = []; // the detached keys the cache should hold, least recently used first
    const rows = [];
    const go = async (g, label) => {
      const before = await chrome.eval('window.__tableCache.state()');
      const ok = typeof g === 'string'
        ? await chrome.eval(`window.__settings.changeGame(${JSON.stringify(g)}, { skipConfirm: true })`)
        : await chrome.eval(`window.__settings.changeEquipment('table_id', ${JSON.stringify(g.table)}, { skipConfirm: true })`);
      if (ok !== true) throw new Error(`[tight] switch ${JSON.stringify(g)} returned ${ok}`);
      const game = typeof g === 'string' ? g : await chrome.eval('window.__settings.get().game');
      await waitFor(SETTLED(game), 120000, `${label} settle`);
      const st = await chrome.eval('window.__tableCache.state()');
      const table = await chrome.eval('window.__settings.get().equipment?.table_id');
      // a hit takes the incoming entry out of the map (no eviction); the outgoing build joins at the recent end; an
      // eviction may only drop entries from the least recently used end
      const incoming = before.keys.find((k) => k.startsWith(`${table}|`)) ?? null;
      order = order.filter((k) => k !== incoming);
      for (const k of st.keys) if (!before.keys.includes(k)) order.push(k);
      const expected = order.slice(order.length - st.keys.length);
      const row = { label, table, ...st, expected, fits: st.bytes <= st.budgetBytes || st.keys.length === 0,
        lru: JSON.stringify(st.keys) === JSON.stringify(expected) };
      order = st.keys.slice();
      rows.push(row);
      console.log(`[e2e-tablecache] tight ${label}: ${row.table}, resident ${MiB(st.bytes)} of ${MiB(st.budgetBytes)} MiB, `
        + `keys ${JSON.stringify(st.keys)}, evictions ${st.evictions}`);
    };
    await go('snooker', 'snooker');
    await go('eight_ball', 'pool');
    await go({ table: 'pool_pro_9ft_metal_rim' }, 'metal-rim');
    await go('heyball', 'chinese8');
    await go('carom_3cushion', 'carom');
    await go('snooker', 'snooker again');
    check('C3 tight after every switch the detached entries plus the live build fit the 96 MiB budget (or only the live build is left)',
      rows.every((r) => r.fits), rows.map((r) => `${r.label} ${MiB(r.bytes)}${r.keys.length ? '' : ' (live only)'}`).join(', '));
    check('C3 tight the detached entries are always the most recently left tables (least recently used evicted first)',
      rows.every((r) => r.lru), rows.filter((r) => !r.lru).map((r) => `${r.label}: ${JSON.stringify(r.keys)} vs expected ${JSON.stringify(r.expected)}`).join(' | '));
    check('C3 tight the byte budget evicts during the walk (it binds at 96 MiB)', rows.at(-1).evictions > cs0.evictions,
      `evictions ${cs0.evictions} -> ${rows.at(-1).evictions}`);
    check('tight no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await chrome.closeAndWait();
  }
}

// C3 touchscreen: touch points with a fine primary pointer keep the desktop budget
async function runTouchscreen() {
  const chrome = await launchChrome(`http://127.0.0.1:${PORT}/`, { port: CDP, width: 1280, height: 800 });
  try {
    // no touch emulation, so `(pointer: coarse)` stays false; only the touch-point count a touchscreen laptop reports
    await chrome.send('Page.addScriptToEvaluateOnNewDocument',
      { source: `Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { configurable: true, get: () => 5 });` });
    await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?seed=1&obtool=1` });
    const t0 = Date.now();
    while (Date.now() - t0 < 120000 && !(await chrome.eval('!!window.__tableCache').catch(() => false))) await sleep(150);
    const st = await chrome.eval(`({ s: window.__tableCache?.state?.() ?? null, mtp: navigator.maxTouchPoints, coarse: matchMedia('(pointer: coarse)').matches })`);
    check('C3 touchscreen a desktop with 5 touch points and a fine pointer keeps the desktop byte budget',
      st.mtp === 5 && st.coarse === false && st.s?.budget === 'bytes' && st.s?.budgetBytes === 256 * 1048576,
      `maxTouchPoints ${st.mtp}, pointer coarse ${st.coarse}, budget ${st.s?.budget} ${st.s?.budgetBytes ?? st.s?.resident}`);
  } finally {
    await chrome.closeAndWait();
  }
}

// two Chrome launches on one CDP port in sequence: a loaded box can take longer than the 15 s default endpoint wait
process.env.OB_CDP_LAUNCH_TRIES ??= '400'; // x 150 ms = 60 s
const server = spawnStaticServer(webDir, PORT);
await sleep(700);
try {
  for (const r of ['desktop', 'phone']) {
    if (ONLY && ONLY !== r) continue;
    try { await runRegister(r); } catch (e) { fail(`${r} aborted: ${e?.stack ?? e}`); }
  }
  // the seam boots belong to the default run only (never under --cache-off or a planted --arm)
  if (!CACHE_OFF && !ARM && (!ONLY || ONLY === 'tight')) {
    try { await runTight(); } catch (e) { fail(`tight aborted: ${e?.stack ?? e}`); }
  }
  if (!CACHE_OFF && !ARM && (!ONLY || ONLY === 'touchscreen')) {
    try { await runTouchscreen(); } catch (e) { fail(`touchscreen aborted: ${e?.stack ?? e}`); }
  }
} finally {
  await stopStaticServer(server);
}
console.log(process.exitCode ? 'E2E-TABLECACHE: FAIL' : 'E2E-TABLECACHE: ALL PASS');
