// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-matrix.mjs — the lighting matrix instrument's page sources and cell driver (GH-975), shared by
// web/tools/e2e-lighting-matrix.mjs (the gate) and tools/render/lighting-match-solve.mjs (the centre-match
// gain solver). Library only: no ports, no browser launch, nothing runs on import.
//
// One cell = one FRESH real-user boot (the player's LIVE tier, never the scripted CINEMA tier) with the cell's
// table, fixture setting, brightness, look and cloth colour written to the persisted settings blob, and the hall
// closed through the stored straight-to-aim shell state (a real user setting). The pinned state is read back
// and a mismatch REFUSES the cell (STATE MISMATCH) instead of measuring it. Pixels are the WebGL canvas read in
// the same task as the render (display-referred, no DOM); bed samples come from a class-mask pass (every visible
// mesh drawn flat by class into a render target, same camera), so they are occlusion-correct.
import { sleep, cdpReplyDetail } from '../cdp.mjs';
import { SETTLE_SRC, HIDE_UI_SRC, SNK_OCCL_FLUSH_SRC } from '../../../tools/render/lib/lighting-page.mjs';
import { within, envTailState } from './lighting-guard.mjs';

/** The ten user-pickable tables (catalog ui_hidden / demoted ids excluded). */
export const USER_TABLES = Object.freeze(['pool_pro_9ft', 'pool_pro_9ft_older_gen', 'pool_pro_9ft_metal_rim',
  'pool_pro_9ft_k55', 'wpa_spec_9ft', 'pool_pro_8ft', 'pool_pro_7ft', 'chinese8_pro_9ft', 'wpbsa_snooker_12ft',
  'umb_carom_284']);
/** The game a table is played under (snooker and carom are single-table classes). */
export const GAME_FOR = Object.freeze({ wpbsa_snooker_12ft: 'snooker', umb_carom_284: 'carom_3cushion' });
/** The atelier's fixture settings: auto + the five explicit ids. */
export const FIXTURE_SETTINGS = Object.freeze(['auto', 'canopy_panel', 'perimeter_ring', 'pendant_bar',
  'snooker_luminaire', 'carom_luminaire']);
/** The default neutral look's id on this tree (the de-brand rename keeps it as an alias). */
export const DEFAULT_LOOK = 'sp';

/** #1221: an async page body whose promise the PAGE holds until it settles. Chrome answers an awaited evaluate whose
 * promise nothing references with 'Promise was collected', and a GC between the body's awaits can collect it (the repo met
 * this in tools/render/check-coplanar-pairs.mjs). The promise sits in window.__obHeld (a Set: two held evaluates never
 * overwrite each other) and leaves it once settled, so a 240-cell run keeps nothing; a rejection reaches the evaluate as
 * before. */
export const heldUntilSettled = (body) => `(() => {
  const p = (async () => {${body}})();
  (window.__obHeld ??= new Set()).add(p);
  const release = () => { window.__obHeld.delete(p); };
  p.then(release, release);
  return p;
})()`;

/** In-page measurement for one camera. `o` = { cam: 'player' | 'overhead', png: bool }. MEASURE_SRC runs it held on the
 * page (heldUntilSettled, #1221). */
export const MEASURE_BODY = (o) => `
  const O = ${JSON.stringify(o)};
  const THREE = await import('three');
  const TM = await import('./scene/table.js');
  const RM = await import('./scene/room.js');
  const { scene, renderer, camera } = window.__dbg;
  const id = TM.activeTableId();
  const spec = TM.specFor(id);
  const k = spec.kernel; const HW = k.width / 2, HL = k.length / 2, CW = k.cushionWidth || 0.05;
  const R = (spec.render && spec.render.profileBallD ? spec.render.profileBallD : 0.05715) / 2;
  const sc = HL / 1.27;
  // poses (kernel frame: x across the width, y along the length, h above the bed). player = the card-22 full34
  // pose scaled to the table; overhead = a direct straight-down camera (NOT camerascript's overhead, which hides
  // the canopy outside the env-bake bracket, #972)
  if (O.cam === 'player') __test.cameraPose({ cam: [1.85 * sc, -2.45 * sc, 1.55 * sc], look: [0, 0, 0], fov: 40 });
  else {
    const asp = renderer.domElement.width / renderer.domElement.height;
    const hx = (HL + CW + 0.2) * 1.04, hz = (HW + CW + 0.2) * 1.04;
    __test.camera(0, 6, 0.0006, 0, 0, 0, 2 * Math.atan(Math.max(hz, hx / asp) / 6) * 180 / Math.PI);
  }
  window.__lampfade?.snapNext?.();
  __test.renderAt(0); window.__lampfade?.snapNext?.(); __test.renderAt(0);
  const cv = renderer.domElement; const W = cv.width, H = cv.height;
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d', { willReadFrequently: true }); g2.drawImage(cv, 0, 0);
  const img = g2.getImageData(0, 0, W, H).data;
  const png = O.png ? c2.toDataURL('image/png') : null;
  // GH-1131: the snooker occlusion transport as this frame rendered, read in the same synchronous run as the renders, so
  // no drain slice can land in between. N9 requires 0 pending jobs: a pending part renders with the GL default (0, 0),
  // fully lamp-lit (lib/lighting-guard.mjs whyOcclRender). The census also records the rendered meshes whose COMPILED
  // program reads aOccl and how many lack it; some read the default by design (snkGold's non-head members).
  const occl = (() => {
    const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const reads = (m) => { const pr = m && renderer.properties.get(m); const prog = pr && pr.currentProgram;
      const at = prog && prog.getAttributes ? prog.getAttributes() : null; return !!(at && at.aOccl); };
    let readers = 0, unbaked = 0;
    scene.traverse((o) => {
      if (!o.isMesh || !shown(o) || ![].concat(o.material).some(reads)) return;
      readers++; if (!o.geometry || !o.geometry.getAttribute('aOccl')) unbaked++;
    });
    const S = window.__snkOccl; let pending = null;
    try { pending = S && typeof S.pending === 'function' ? S.pending() : null; } catch (e) { pending = null; }
    return { seam: !!(S && typeof S.pending === 'function'), pending, readers, unbaked };
  })();
  camera.updateMatrixWorld();
  const camPos = camera.position.clone();
  const LUT = new Float64Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; LUT[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const toThree = (kx, ky, h) => new THREE.Vector3(ky, h, kx);
  const proj = (v) => { const p = v.clone().project(camera); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H, p.z]; };
  // ---- class mask pass: 1 cloth, 2 railwood, 3 apron, 4 ball, 5 wall, 6 floor, 7 other
  const refs = RM.activeRoom?.instance?.lightRefs || {};
  const wallSet = new Set(); for (const w of [].concat(refs.walls || [])) w?.traverse?.((o2) => wallSet.add(o2));
  const floorSet = new Set(); refs.floor?.traverse?.((o2) => floorSet.add(o2));
  const ballPos = (window.__test.balls() || []).filter((bb) => !bb.pocketed).map((bb) => new THREE.Vector3(bb.pos[0], bb.pos[1], bb.pos[2]));
  const COLORS = [null, [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]];
  const matCache = new Map();
  const matFor = (cls, side) => { const key = cls + ':' + side; let mm = matCache.get(key);
    if (!mm) { const c = COLORS[cls]; mm = new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]), toneMapped: false, side }); matCache.set(key, mm); }
    return mm; };
  const hiddenM = new THREE.MeshBasicMaterial({ visible: false });
  const wp = new THREE.Vector3();
  const isBall = (o2) => { if (!o2.geometry) return false; if (!o2.geometry.boundingSphere) o2.geometry.computeBoundingSphere();
    const r = o2.geometry.boundingSphere.radius * o2.getWorldScale(wp).x; if (r < 0.015 || r > 0.05) return false;
    o2.getWorldPosition(wp); return ballPos.some((bp) => bp.distanceTo(wp) < 0.006); };
  const swapped = [], hidOther = [];
  scene.traverse((o2) => {
    if (o2.isMesh) {
      const m0 = o2.material; const m = Array.isArray(m0) ? m0[0] : m0;
      const oc = m?.userData?.obClass;
      let cls = 7;
      if (oc === 'cloth') cls = 1; else if (oc === 'railwood') cls = 2; else if (oc === 'apron') cls = 3;
      else if (wallSet.has(o2)) cls = 5; else if (floorSet.has(o2)) cls = 6; else if (isBall(o2) || (o2.parent && isBall(o2.parent))) cls = 4;
      const invisible = !m || m.visible === false || (m.transparent && (m.opacity ?? 1) < 0.05);
      swapped.push([o2, m0]); o2.material = invisible ? hiddenM : matFor(cls, m.side ?? THREE.FrontSide);
    } else if ((o2.isPoints || o2.isLine || o2.isSprite) && o2.visible) { hidOther.push(o2); o2.visible = false; }
  });
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 0 });
  const prevRT = renderer.getRenderTarget(), prevBg = scene.background, prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  scene.background = null; renderer.setClearColor(0x000000, 1);
  renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
  const mbuf = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, mbuf);
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevClear, prevA); scene.background = prevBg; rt.dispose();
  for (const [o2, m0] of swapped) o2.material = m0;
  for (const o2 of hidOther) o2.visible = true;
  for (const mm of matCache.values()) mm.dispose(); hiddenM.dispose();
  const clsAt = (px, py) => { const x = Math.round(px), y = H - 1 - Math.round(py); if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    const i = (y * W + x) * 4; const r8 = mbuf[i] > 127, g8 = mbuf[i + 1] > 127, b8 = mbuf[i + 2] > 127;
    return r8 ? (g8 ? (b8 ? 7 : 4) : (b8 ? 6 : 1)) : (g8 ? (b8 ? 5 : 2) : (b8 ? 3 : 0)); };
  const NAMES = ['void', 'cloth', 'railwood', 'apron', 'ball', 'wall', 'floor', 'other'];
  function patch(px, py) {
    const x0 = Math.round(px), y0 = Math.round(py);
    if (x0 < 1 || y0 < 1 || x0 >= W - 1 || y0 >= H - 1) return null;
    let r = 0, g = 0, b = 0, clip = 0, crush = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = ((y0 + dy) * W + (x0 + dx)) * 4; const R8 = img[i], G8 = img[i + 1], B8 = img[i + 2];
      r += LUT[R8]; g += LUT[G8]; b += LUT[B8];
      if (R8 >= 250 || G8 >= 250 || B8 >= 250) clip++;
      if (Math.max(R8, G8, B8) <= 12) crush++;
    }
    r /= 9; g /= 9; b /= 9;
    return { r, g, b, Y: 0.2126 * r + 0.7152 * g + 0.0722 * b, clip, crush };
  }
  function sampleBed(kx, ky) {
    // the mask cannot tell bed cloth from cushion cloth: on the angled player view the near cushions (+x side,
    // -y end) hide up to ~7 cm of bed behind them, so those bands are not sampled there
    if (O.cam === 'player' && (kx > HW - 0.12 || ky < -HL + 0.12)) return null;
    const [px, py, pz] = proj(toThree(kx, ky, 0.0005)); if (pz > 1) return null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (clsAt(px + dx, py + dy) !== 1) return null;
    return patch(px, py);
  }
  const balls = (window.__test.balls() || []).filter((b) => !b.pocketed).map((b) => ({ id: b.id, kx: b.pos[2], ky: b.pos[0] }));
  const nearBall = (kx, ky, rr) => balls.some((b) => (b.kx - kx) ** 2 + (b.ky - ky) ** 2 < rr * rr);
  const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  const med = (a) => q(a, 0.5);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const m = 0.06, NX = 15, NY = Math.round(29 * sc);
  const pts = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
    const kx = -HW + m + (2 * (HW - m)) * i / (NX - 1), ky = -HL + m + (2 * (HL - m)) * j / (NY - 1);
    if (nearBall(kx, ky, 2.4 * R)) continue;
    const s = sampleBed(kx, ky); if (s) pts.push({ kx, ky, ...s });
  }
  const Ys = pts.map((p) => p.Y);
  const centre = pts.filter((p) => Math.abs(p.kx) <= 0.3 * HW && Math.abs(p.ky) <= 0.15 * HL).map((p) => p.Y);
  const corner = pts.filter((p) => Math.abs(p.kx) >= HW - m - 0.2 && Math.abs(p.ky) >= HL - m - 0.25).map((p) => p.Y);
  const nClip = pts.reduce((a, p) => a + p.clip, 0), nCrush = pts.reduce((a, p) => a + p.crush, 0);
  // white balance from the CUE BALL (near-neutral albedo; the cloth is too saturated): disc pixels within 0.55 R,
  // brightest 20 % (specular) and clipped pixels dropped, divided by the ball material colour (linear)
  let wb = null, ballClip = null, ballClipN = null;
  try {
    const gb = window.__test.balls().find((bb) => bb.id === 0 && !bb.pocketed);
    let cueObj = null; if (gb) scene.traverse((o2) => { if (!cueObj && o2.isMesh && Math.abs(o2.position.x - gb.pos[0]) < 1e-6 && Math.abs(o2.position.z - gb.pos[2]) < 1e-6 && Math.abs(o2.position.y - gb.pos[1]) < 1e-6) cueObj = o2; });
    const cm = cueObj && (Array.isArray(cueObj.material) ? cueObj.material[0] : cueObj.material);
    if (cm?.color) {
      const C = new THREE.Vector3(); cueObj.getWorldPosition(C);
      const [cx, cy] = proj(C); const [ex] = proj(C.clone().addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize(), R));
      const rad = Math.abs(ex - cx) * 0.55; const px = [];
      // cue-ball clipping census (crown saturation, the #638 class): share of disc pixels within 0.9 R with a channel >= 250
      { const rr = Math.abs(ex - cx) * 0.9; let n = 0, cl = 0;
        for (let yy = Math.floor(cy - rr); yy <= Math.ceil(cy + rr); yy++) for (let xx = Math.floor(cx - rr); xx <= Math.ceil(cx + rr); xx++) {
          if ((xx - cx) ** 2 + (yy - cy) ** 2 > rr * rr || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const i = (yy * W + xx) * 4; n++; if (img[i] >= 250 || img[i + 1] >= 250 || img[i + 2] >= 250) cl++; }
        ballClip = n ? +(cl / n).toFixed(4) : null; ballClipN = n || null; } // GH-996 C1: the disc pixel count the bars are derived in
      for (let yy = Math.floor(cy - rad); yy <= Math.ceil(cy + rad); yy++) for (let xx = Math.floor(cx - rad); xx <= Math.ceil(cx + rad); xx++) {
        if ((xx - cx) ** 2 + (yy - cy) ** 2 > rad * rad || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = (yy * W + xx) * 4; if (img[i] >= 250 || img[i + 1] >= 250 || img[i + 2] >= 250) continue;
        px.push([LUT[img[i]], LUT[img[i + 1]], LUT[img[i + 2]]]);
      }
      px.sort((a, b2) => (a[0] + a[1] + a[2]) - (b2[0] + b2[1] + b2[2]));
      const keep = px.slice(0, Math.max(1, Math.floor(px.length * 0.8)));
      if (keep.length >= 12) {
        const avg = [0, 1, 2].map((ch) => keep.reduce((a, p) => a + p[ch], 0) / keep.length);
        const il = [avg[0] / cm.color.r, avg[1] / cm.color.g, avg[2] / cm.color.b];
        const X = 0.4124 * il[0] + 0.3576 * il[1] + 0.1805 * il[2], Yc = 0.2126 * il[0] + 0.7152 * il[1] + 0.0722 * il[2], Z = 0.0193 * il[0] + 0.1192 * il[1] + 0.9505 * il[2];
        const x = X / (X + Yc + Z), y = Yc / (X + Yc + Z), n = (x - 0.3320) / (0.1858 - y);
        wb = { n: keep.length, x: +x.toFixed(4), y: +y.toFixed(4), cct: Math.round(449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33) };
      }
    }
  } catch { /* no measurable cue ball */ }
  // contact shadows: the darker quartile of a ring just outside the footprint vs a lit ring further out
  const shadow = [];
  for (const b of balls) {
    if (Math.abs(b.kx) > HW - 0.1 || Math.abs(b.ky) > HL - 0.1) continue;
    const inner = [], outer = [];
    for (let a = 0; a < 16; a++) {
      const th = a / 16 * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
      for (const rr of [1.12, 1.3]) { const x = b.kx + rr * R * cs, y = b.ky + rr * R * sn;
        if (balls.some((o2) => o2 !== b && (o2.kx - x) ** 2 + (o2.ky - y) ** 2 < (2.4 * R) ** 2)) continue;
        const s = sampleBed(x, y); if (s) inner.push(s.Y); }
      for (const rr of [3.2, 3.6]) { const x = b.kx + rr * R * cs, y = b.ky + rr * R * sn; if (nearBall(x, y, 2.4 * R)) continue; const s = sampleBed(x, y); if (s) outer.push(s.Y); }
    }
    if (inner.length >= 6 && outer.length >= 6) shadow.push(q(inner, 0.25) / med(outer));
  }
  // cushion-shadow strip: 1.5 cm off the cushion nose vs 15 cm in (meaningful on the overhead camera)
  const strip = [], open = [];
  for (let j = 0; j < 24; j++) {
    const ky = -HL + 0.2 + (2 * HL - 0.4) * j / 23;
    for (const sx of [-1, 1]) {
      if (nearBall(sx * (HW - 0.015), ky, 2.4 * R) || nearBall(sx * (HW - 0.15), ky, 2.4 * R)) continue;
      const a = sampleBed(sx * (HW - 0.015), ky), b2 = sampleBed(sx * (HW - 0.15), ky);
      if (a && b2) { strip.push(a.Y); open.push(b2.Y); }
    }
  }
  // screen-grid class census (player camera): rails / apron / room / cloth
  let census = null;
  if (O.cam === 'player') {
    const acc = {};
    for (let gy = 0; gy < 50; gy++) for (let gx = 0; gx < 80; gx++) {
      const px = (gx + 0.5) / 80 * W, py = (gy + 0.5) / 50 * H; const c0 = clsAt(px, py);
      let ok = true; for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (clsAt(px + dx, py + dy) !== c0) { ok = false; break; }
      if (!ok) continue; const sp = patch(px, py); if (sp) (acc[NAMES[c0]] ||= []).push(sp.Y);
    }
    census = Object.fromEntries(Object.entries(acc).map(([kk, v]) => [kk, { n: v.length, med: +med(v).toFixed(5), p95: +q(v, 0.95).toFixed(5) }]));
  }
  const r5 = (v) => (v == null ? null : +v.toFixed(5));
  return {
    table: id, cam: O.cam, W, H, pose: { pos: camPos.toArray().map((v) => +v.toFixed(4)), fov: camera.fov }, occl,
    bed: { n: pts.length, mean: r5(mean(Ys)), p5: r5(q(Ys, 0.05)), p95: r5(q(Ys, 0.95)),
      centre: r5(med(centre)), nCentre: centre.length, corner: r5(med(corner)), nCorner: corner.length,
      uniformity: (med(corner) != null && med(centre)) ? r5(med(corner) / med(centre)) : null,
      clipPct: pts.length ? +(100 * nClip / (9 * pts.length)).toFixed(3) : null,
      crushPct: pts.length ? +(100 * nCrush / (9 * pts.length)).toFixed(3) : null },
    wb, ballClip, ballClipN, contactShadow: { n: shadow.length, med: r5(med(shadow)) },
    cushionStrip: { n: strip.length, ratio: (med(strip) != null && med(open)) ? r5(med(strip) / med(open)) : null },
    census, png,
  };
`;
export const MEASURE_SRC = (o) => heldUntilSettled(MEASURE_BODY(o));

/** The live light / state census of the boot (the state-integrity read). */
export const LIGHT_CENSUS_SRC = `(() => {
  const s = window.__dbg.scene, r = window.__dbg.renderer; const rects = [], spots = [];
  let hemi = null;
  s.traverse((o) => {
    if (o.isRectAreaLight) rects.push({ i: +o.intensity.toFixed(5), c: o.color.getHexString(), vis: o.visible, w: o.width, h: o.height });
    else if (o.isHemisphereLight) hemi = +o.intensity.toFixed(4);
    else if (o.isSpotLight) spots.push({ name: o.name || o.parent?.name || null, i: +o.intensity.toFixed(3), vis: o.visible });
  });
  const L = window.__lighting?.state?.();
  let expected = null;
  try { const p = window.__lighting?.profile?.(L.fixture, L.brightness, L.look); expected = p ? p.emitters.map((e) => +e.intensity.toFixed(5)) : null; } catch { /* stale leaf */ }
  const u = window.__gi?.uniforms;
  return { exposure: r.toneMappingExposure, rects, visRects: rects.filter((x) => x.vis).map((x) => x.i), hemi, spots,
    lighting: L ? { fixture: L.fixture, brightness: L.brightness, auto: L.auto, look: L.look, oneTableGain: L.oneTableGain,
      matchKey: L.matchKey ?? null, matchGain: L.matchGain ?? null } : null,
    expected, uGiOn: u?.uGiOn?.value ?? null, uGiIrr: u?.uGiIrr ? +u.uGiIrr.value.toFixed(5) : null,
    giFixture: window.__gi?.state?.fixture ?? null, giBaked: window.__gi?.state?.baked ?? null,
    giClass: window.__gi?.state?.bakeClass ?? null, giLook: window.__gi?.state?.look ?? null,
    giLoadError: window.__gi?.state?.loadError ?? null,
    shellOpen: window.__shell?.isOpen?.() ?? null, shellKeys: window.__shell?.visualState?.()?.keys ?? null,
    envBakes: window.__rebakeEnv?.bakes ?? null, envTail: window.__rebakeEnv?.tail?.() ?? null,
    bloom: window.__obBloom?.pass ? +window.__obBloom.pass.strength.toFixed(4) : null };
})()`;

async function waitExpr(c, expr, tries = 100, ms = 200) {
  for (let i = 0; i < tries; i++) {
    try { const v = await c.eval(expr); if (v) return v; } catch { if (c.poisoned?.()) return null; } // navigating; a poisoned client (the browser is lost) is terminal (#1221)
    await sleep(ms);
  }
  return null;
}

/** The app's own settle predicate (GI apply complete, rig == GI fixture, venue capture done), held stable for
 * three consecutive polls. */
export async function waitSettled(c, tries = 150) {
  let prev = null, same = 0;
  for (let i = 0; i < tries; i++) {
    let s = null; try { s = await c.eval(SETTLE_SRC); } catch { if (c.poisoned?.()) return null; } // navigating; a lost browser is terminal (#1221)
    if (s && s.settled) {
      const sig = JSON.stringify([s.gi, s.rig?.fixture, s.rig?.brightness, s.venue?.captures]);
      same = sig === prev ? same + 1 : 0; prev = sig;
      if (same >= 2) return s;
    } else { same = 0; prev = null; }
    await sleep(300);
  }
  return null;
}

/** Boot one cell fresh and verify its pinned state. `cell` = { table, fixture, b, look?, cloth? }.
 * Resolves { ok, mismatch[], light, bootMs }. The persisted state is written from a same-origin NON-app
 * document (the app's own unload write of ob-shell-v1 would otherwise land after it). */
export async function bootCell(c, base, cell) {
  const t0 = Date.now();
  const game = GAME_FOR[cell.table] || 'nine_ball';
  const blob = { game, equipment: { table_id: cell.table }, equipmentByGame: { [game]: { table_id: cell.table } },
    look: cell.look || DEFAULT_LOOK, fixture: cell.fixture === 'auto' ? 'canopy_panel' : cell.fixture,
    fixtureAuto: cell.fixture === 'auto', brightness: cell.b, clothColor: cell.cloth || '' };
  await c.send('Page.navigate', { url: `${base}/README.md` });
  await waitExpr(c, `location.pathname === '/README.md' && document.readyState === 'complete'`, 50, 100);
  await c.eval(`(localStorage.clear(), sessionStorage.clear(), localStorage.setItem('ob-settings-v1', ${JSON.stringify(JSON.stringify(blob))}),
    localStorage.setItem('ob-shell-v1', ${JSON.stringify(JSON.stringify({ v: 1, lastPlace: 'play', startAtTable: true }))}), true)`);
  await c.send('Page.navigate', { url: `${base}/app.html?obtool=0&seed=7` });
  await sleep(1500);
  const mismatch = [];
  const ready = await waitExpr(c, 'window.__test?.ready === true', 300);
  if (!ready) mismatch.push('never ready');
  // GH-1131: drain the snooker occlusion transport before the settle. table.js traces aOccl in frame-paced 8 ms slices
  // after the build, so the cell used to be measured with 23-26 traces still pending. Which legs had landed by then
  // varied from boot to boot. This is the SAME seam the lighting capture (ORDER-LIGHT-C2-FIX1 §L31) and the offline
  // renders flush. Its corrective env re-bake is covered by the settle predicate and the env-tail wait below. The judge's
  // N9 reads the record and MEASURE_SRC's census.
  const occl = ready ? await c.eval(SNK_OCCL_FLUSH_SRC).catch((e) => ({ seam: null, err: String(e) })) : null;
  const st = ready ? await waitSettled(c) : null;
  if (ready && !st) mismatch.push('never settled');
  await sleep(1500); // the env-cube debounce and the lamp-fade ramps, after the positive settle predicate
  // GH-971 (review r4): the env tail drained — a latched tail failure or a tail still owing bakes refuses the cell by name
  const env = await waitEnvSettled(c, ready ? 50 : 1, 100);
  if (!env.ok) mismatch.push(env.why);
  const light = await c.eval(LIGHT_CENSUS_SRC).catch((e) => ({ error: String(e) }));
  const table = await c.eval(`import('./scene/table.js').then((m) => m.activeTableId())`).catch(() => null);
  if (table !== cell.table) mismatch.push(`table ${table} != ${cell.table}`);
  const L = light.lighting;
  if (!L) mismatch.push('no __lighting state');
  else {
    if (!within(L.brightness, cell.b, 1e-9)) mismatch.push(`brightness ${L.brightness} != ${cell.b}`);
    if (cell.fixture === 'auto' ? L.auto !== true : L.fixture !== cell.fixture) mismatch.push(`rig ${L.fixture} (auto ${L.auto}) != ${cell.fixture}`);
  }
  if (light.shellOpen !== false) mismatch.push(light.shellOpen === true ? 'hall open' : `hall state unread (shellOpen ${light.shellOpen})`);
  return { ok: mismatch.length === 0, mismatch, light, bootMs: Date.now() - t0, occl };
}

/** Measure the booted cell from each camera. Resolves { [cam]: measurement } (png data URLs stripped into
 * `pngs[cam]` when requested). `at.cam` names the camera being measured, so a failed measurement names it (#1221). */
export async function measureCell(c, cams = ['player', 'overhead'], png = false, at = {}) {
  await c.eval(HIDE_UI_SRC);
  await c.eval('(__test.setManual(true), true)');
  const out = {}, pngs = {};
  try {
    for (const cam of cams) {
      at.cam = cam;
      const r = await c.eval(MEASURE_SRC({ cam, png }));
      if (r.png) pngs[cam] = r.png;
      delete r.png; out[cam] = r;
    }
  } finally { await c.eval('(__test.setManual(false), true)').catch(() => {}); }
  return { cams: out, pngs };
}

/** #1221: the gate's named non-pass line for an instrument error — the failing worker `f` = { wi, port, pid, n, phase,
 * cam, done, e } (its CDP port and Chrome pid, the index of its cell in `cells`, the phase and camera, the rows done by
 * then, the error). One line: the CDP request (cdp.mjs cdpReplyDetail) when the error is a protocol-error reply, then
 * the error's own text verbatim (Chrome's, for a reply). UNJUDGEABLE is never a verdict to run-gate's grammar. */
export function instrumentLine(f, { cells, rows }) {
  const cell = f.n === null || f.n === undefined ? null : cells[f.n];
  const where = cell ? `cell ${f.n + 1}/${cells.length} ${cell.leg} ${cell.table} ${cell.fixture} b=${cell.b}`
    + `${cell.cloth ? ` cloth=${cell.cloth}` : ''}` : 'before its first cell';
  const detail = cdpReplyDetail(f.e);
  let text;
  try { text = String(f.e?.message ?? f.e); } catch { text = '<unprintable error>'; }
  return `MATRIX UNJUDGEABLE instrument error: worker ${f.wi} (cdp :${f.port}, chrome pid ${f.pid ?? 'none'}) ${where}, `
    + `phase ${f.phase}${f.cam ? ` cam=${f.cam}` : ''}, ${f.done} row(s) done (rows: ${rows}): `
    + `${detail ? `${detail} -> ` : ''}${text.replace(/[\r\n]+/g, ' ')}`;
}

/** The env cube's six face means (luminance of a stride-8 half-float readback): { faces, unwritten, texels }. The
 * buffer is refilled with a half-float NaN sentinel before every face read, so a texel the readback never wrote
 * (three.js logs and returns on an unreadable target; a zero-initialised buffer would read as a black cube) is
 * counted per face in `unwritten` instead of averaged — lib/lighting-guard.mjs envDrift refuses such a read by name
 * (review r3 P2). */
export const ENV_FACES_SRC = `(() => {
  const { renderer, cubeRT } = window.__dbg;
  const N = cubeRT.width, S = 8, buf = new Uint16Array(N * N * 4), UNSET = 0x7e01;
  const h2f = (h) => { const sg = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff; if (e === 0) return sg * Math.pow(2, -14) * (m / 1024); if (e === 31) return m ? NaN : sg * Infinity; return sg * Math.pow(2, e - 15) * (1 + m / 1024); };
  const faces = [], unwritten = []; let texels = 0;
  for (let f = 0; f < 6; f++) { buf.fill(UNSET); renderer.readRenderTargetPixels(cubeRT, 0, 0, N, N, buf, f); let sum = 0, n = 0, u = 0;
    for (let y = 0; y < N; y += S) for (let x = 0; x < N; x += S) { const i = 4 * (y * N + x);
      if (buf[i] === UNSET || buf[i + 1] === UNSET || buf[i + 2] === UNSET) { u++; continue; }
      sum += 0.2126 * h2f(buf[i]) + 0.7152 * h2f(buf[i + 1]) + 0.0722 * h2f(buf[i + 2]); n++; }
    faces.push(n ? +(sum / n).toFixed(6) : null); unwritten.push(u); texels = n + u; }
  return { faces, unwritten, texels };
})()`;

/** The env tail census (main.js `__rebakeEnv.tail()`), read raw: lib/lighting-guard.mjs envTailState judges it. */
export const ENV_TAIL_SRC = 'window.__rebakeEnv?.tail?.() ?? null';

/** Wait until the env tail reads settled (lib/lighting-guard.mjs envTailState). Resolves { ok, failed, why, tail }:
 * a latched tail failure ends the wait at once (failed, named: its `left` reads 0 because the tail was aborted, not
 * drained — review r4); a tail still owing bakes (or no census) after the budget is not settled either. */
export async function waitEnvSettled(c, tries = 100, ms = 100) {
  let st = { settled: false, failed: false, why: 'env tail never read' }, t = null;
  for (let i = 0; i < tries; i++) {
    try { t = await c.eval(ENV_TAIL_SRC); st = envTailState(t); } catch { if (c.poisoned?.()) { st = { settled: false, failed: true, why: `browser lost: ${c.poisoned()}` }; break; } } // navigating; a lost browser is terminal (#1221)
    if (st.settled || st.failed) break;
    await sleep(ms);
  }
  return { ok: st.settled, failed: st.failed, why: st.settled ? null : st.failed ? st.why : `${st.why} after ${tries * ms} ms`, tail: t };
}

/** Request one env bake through the public seam and wait for its tail (GH-971) to drain on live frames. Resolves
 * waitEnvSettled's verdict — an aborted tail is never "drained". */
export async function bakeAndSettle(c, tries = 100) {
  await c.eval('(window.__rebakeEnv(), true)');
  return waitEnvSettled(c, tries, 100);
}

/** Switch the live table through the settings seam (the atelier's path) and wait until the scene table is the
 * destination, the lighting has settled again and the env tail has drained. Resolves { light, why, failed }: the
 * light census with why null; or why = the named reason the switch is not settled (light null when it never landed),
 * failed = true when the env tail failed (a product failure, not a timeout). */
export async function switchTable(c, table) {
  const ok = await c.eval(`__settings.changeEquipment('table_id', ${JSON.stringify(table)}, { skipConfirm: true })`).catch(() => false);
  if (ok !== true) return { light: null, why: 'the settings seam refused the switch', failed: false };
  const landed = await waitExpr(c, `import('./scene/table.js').then((m) => m.activeTableId() === ${JSON.stringify(table)})`, 150, 200);
  if (!landed) return { light: null, why: 'the switch never landed', failed: false };
  await sleep(800); // the equipment broadcast's own lighting re-check (a microtask + the rebuild hook) lands first
  if (!(await waitSettled(c))) return { light: null, why: 'the lighting never settled', failed: false };
  const env = await waitEnvSettled(c, 100, 100);
  return { light: await c.eval(LIGHT_CENSUS_SRC), why: env.why, failed: env.failed };
}

