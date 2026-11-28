// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-page.mjs — page-side JS sources for the venue-lighting lane's
// instruments (tools/render/lighting-*.mjs). Everything here is evaluated
// INSIDE the running app through CDP `Runtime.evaluate`; nothing touches the
// app's own modules. Kept as strings so every harness (capture / gate /
// fence) runs the IDENTICAL census and readback code — one instrument, many
// callers.

/** Derive this lane's register poses from the LIVE table spec (kernel frame
 * [kx, ky, h]; kx across the width, ky along the length, h above the bed).
 * The nine craft-lane poses (tools/render/fixtures/craft-look-poses.json)
 * are reproduced from their own anchor arithmetic — corner look = (halfW +
 * cushionWidth, halfL + cushionWidth), side look = same kx + 4 mm — so the
 * set moves only when the table spec moves. Five symptom poses are added
 * (documented in SPIKE-REPORT-LIGHTING.md §L0.4):
 *   cushion_shadow  grazing view of the cloth strip under the long-rail nose
 *   cueball_level   the cue ball from ball level (terminator / crown read)
 *   rack_level      the racked balls from ball level
 *   apron_leg       below-bed: apron face + leg + floor
 *   full34          the 3/4 hero (scaled by the table's half length)
 * Returns { table, kernel, poses: [{name, cam, look, fov}] }. */
export const POSE_DERIVE_SRC = `(async () => {
  const t = await import('./scene/table.js');
  const id = t.activeTableId();
  const spec = t.specFor(id);
  const k = spec.kernel;
  const HW = k.width / 2, HL = k.length / 2, CW = k.cushionWidth;
  const cx = HW + CW, cy = HL + CW, sx = HW + CW + 0.004;
  const R = (spec.render && spec.render.profileBallD ? spec.render.profileBallD : 0.05715) / 2;
  // cue ball (id 0) in kernel coords from the live scene (three x = k.y,
  // three z = k.x, three y = h); falls back to the head-spot region.
  let cue = [0, -HL / 2];
  try {
    const b = (window.__test.balls() || []).find((b) => b.id === 0 && !b.pocketed);
    if (b) cue = [b.pos[2], b.pos[0]];
  } catch (e) {}
  const sc = HL / 1.27;
  const poses = [
    { name: 'corner_close_diag', cam: [cx - 0.2, cy - 0.2, 0.16], look: [cx, cy, 0.01], fov: 30 },
    { name: 'corner_close_rail', cam: [cx - 0.03, cy - 0.36, 0.11], look: [cx, cy, 0.0], fov: 30 },
    { name: 'corner_tt_diag', cam: [cx - 0.39, cy - 0.39, 0.38], look: [cx, cy, 0.0], fov: 30 },
    { name: 'corner_tt_side', cam: [cx + 0.1, cy - 0.54, 0.38], look: [cx, cy, 0.0], fov: 30 },
    { name: 'corner_edgeon', cam: [cx - 0.25, cy - 0.25, 0.025], look: [cx, cy, 0.03], fov: 26 },
    { name: 'mid_close_diag', cam: [sx - 0.26, -0.15, 0.16], look: [sx, 0.0, 0.01], fov: 30 },
    { name: 'mid_tt_inside', cam: [sx - 0.49, -0.25, 0.38], look: [sx, 0.0, 0.0], fov: 30 },
    { name: 'mid_edgeon', cam: [sx - 0.34, -0.02, 0.03], look: [sx, 0.0, 0.03], fov: 26 },
    { name: 'overview', cam: [0.0, -2.6, 1.75], look: [0.0, 0.0, 0.0], fov: 42 },
    { name: 'cushion_shadow', cam: [HW - 0.22, -0.55, 0.06], look: [HW - 0.02, 0.25, 0.0], fov: 28 },
    { name: 'cueball_level', cam: [cue[0] - 0.02, cue[1] - 0.42, R + 0.13], look: [cue[0], cue[1], R], fov: 18 },
    { name: 'rack_level', cam: [0.0, HL / 2 - 0.95, 0.10], look: [0.0, HL / 2, R], fov: 20 },
    { name: 'apron_leg', cam: [HW + 1.1, -0.9, -0.05], look: [HW + 0.10, 0.3, -0.30], fov: 40 },
    { name: 'full34', cam: [1.85 * sc, -2.45 * sc, 1.55 * sc], look: [0.0, 0.0, 0.0], fov: 40 },
  ];
  // ORDER-LAND-638 (d) — the #638 SECOND symptom: the ball RESTING on the Predator foam plug. The pose exists only
  // when the capture's poke has staged the pot and seeked to the rest (window.__cupRest, written by the seal's
  // cup drive, tools/render/lib/lighting-cup-drive.js); its camera is #633's own register, frame 02-rest-hi of
  // web/tools/capture-626-sinkrest.mjs: 0.16 m diagonally out from the pocket centre, 0.26 m up, looking 3 cm
  // below the bed at the centre, fov 26. No drive -> no pose -> the cup rows fail closed (no read), never a read
  // of the open bed under the cup's name.
  try {
    const c = window.__cupRest;
    if (c && !c.error && Number.isFinite(c.kx) && Number.isFinite(c.ky)) {
      poses.push({ name: 'cup_rest', cam: [c.kx + c.sx * 0.16, c.ky + c.sy * 0.16, 0.26], look: [c.kx, c.ky, -0.03], fov: 26 });
      // ORDER-LIGHT-C2-FIX6 class I (I1): the same seated ball across an angular sweep of view / normal angles — nine elevations from near-normal to
      // the mouth's grazing limit at one standoff (0.37 m, the cup_rest distance class), along the pocket's diagonal into the table; the energy rows read the
      // debug channels over the ball's disc at each (the (1 − max(totalScattering)) weight is view-dependent: the leak grows toward grazing)
      // (smoke 2026-09-12: below ~50° elevation the pocket rim hides the seated ball entirely — 0 marked fragments at 45°, 35°, … — so the sweep runs
      // from near-normal down to the mouth's own grazing limit: the most grazing view a seated ball admits is the mouth's; the per-fragment view /
      // normal angle still spans to grazing across the ball's disc at every register)
      for (const [k, el] of [[1, 88], [2, 82], [3, 76], [4, 70], [5, 64], [6, 60], [7, 56], [8, 53], [9, 50]]) {
        const r = 0.37, a = el * Math.PI / 180, rh = r * Math.cos(a) / Math.SQRT2, zc = -0.03 + r * Math.sin(a);
        poses.push({ name: 'cup_sweep_' + k, cam: [c.kx + c.sx * rh, c.ky + c.sy * rh, zc], look: [c.kx, c.ky, -0.03], fov: 26 });
      }
    }
  } catch (e) {}
  // ORDER-LIGHT-C2-FIX3 class A — the two-ball CREVICE register. Exists only when the seal's gridshadow poke laid ball 1 touching the cue
  // ball (window.__gridShadowFixture: three positions). The contact point is the midpoint of the two centres; the camera stands the
  // cueball_level pose's own standoff (0.42 m) from it, perpendicular to the pair's axis in the bed plane and at 45° elevation, looking at
  // the contact point at ball height — the upper half of the contact cap (the lamp-shadowed crevice) faces it. No fixture → no pose
  // (the crevice rows fail closed, never a read of a lone ball under the crevice's name).
  try {
    const f = window.__gridShadowFixture;
    if (f && Array.isArray(f.cue) && Array.isArray(f.ball1)) {
      const c0 = [f.cue[2], f.cue[0]], c1 = [f.ball1[2], f.ball1[0]];
      const kx = (c0[0] + c1[0]) / 2, ky = (c0[1] + c1[1]) / 2;
      let ux = c1[0] - c0[0], uy = c1[1] - c0[1]; const un = Math.hypot(ux, uy) || 1; ux /= un; uy /= un;
      const px = -uy, py = ux, d = 0.42 * Math.SQRT1_2;
      poses.push({ name: 'crevice', cam: [kx + px * d, ky + py * d, R + d], look: [kx, ky, R], fov: 18 });
      // ORDER-LIGHT-C2-FIX4 (maintainer): ONE bounded attempt to flip the negative-fragment count — the same standoff and perpendicular, but
      // GRAZING: the camera at ball-centre height + 2 % of the standoff (a hair above the equator plane) looking at the contact point, so the
      // contact cap's upper fragments are seen edge-on (high Fresnel = the missing (1 − max(totalScattering)) factor at its largest)
      poses.push({ name: 'crevice_graze', cam: [kx + px * 0.42, ky + py * 0.42, R + 0.02 * 0.42], look: [kx, ky, R], fov: 18 });
    }
  } catch (e) {}
  const round = (v) => Array.isArray(v) ? v.map((x) => Number(x.toFixed(4))) : v;
  return { table: id, kernel: { length: k.length, width: k.width, cushionWidth: CW, ballR: R },
    cue: round(cue), cupRest: (window.__cupRest && !window.__cupRest.error) ? window.__cupRest : null, poses: poses.map((p) => ({ name: p.name, cam: round(p.cam), look: round(p.look), fov: p.fov })) };
})()`;

/** Hide the interactive chrome that is not a lighting subject: aim UI, the
 * aim line meshes, the cue stick, every DOM element but the canvas. Balls
 * stay (they are a subject). Idempotent. */
export const HIDE_UI_SRC = `(() => {
  try { __test.aim(Math.PI * 1.5); } catch (e) {}
  window.__dbg.scene.traverse((o) => {
    const hex = o.material && o.material.color && o.material.color.getHexString
      && o.material.color.getHexString();
    if (hex === 'dff1ff' || hex === '76afee') o.visible = false;
    if (/^obAim/.test(o.name || '') || (o.parent && /^obAim/.test(o.parent.name || ''))) o.visible = false;
    if (o.name === 'obCueStick') { o.scale.setScalar(0); o.updateMatrixWorld(true); }
  });
  if (!document.getElementById('obLightingHide')) {
    const st = document.createElement('style');
    st.id = 'obLightingHide';
    st.textContent = 'body > :not(canvas) { display: none !important; }';
    document.head.appendChild(st);
  }
  return true;
})()`;

/** Settle predicate: app ready, GI runtime ready + baked on a resolved class,
 * and the GI fixture == the live rig fixture. Returns a JSON state object
 * (settled: bool) — never throws. */
export const SETTLE_SRC = `(() => {
  try {
    const s = window.__gi && window.__gi.state;
    const L = window.__lighting && window.__lighting.state && window.__lighting.state();
    const rig = L && L.fixture;
    // ORDER-LIGHT-6 Q4: the derived venue fill is a positive predicate, not a sleep margin — settled only once no
    // capture is pending (venue off, no term for this table, or the coefficients written)
    const V = L && L.venue;
    const venueOk = !V || (V.pending !== true && V.rebakeQueued !== true); // C1 (b): a queued env re-bake is not settled
    // ORDER-LAND-638-FIX P2-c: a GI runtime whose load was never requested (?nogi — main.js skips gi.load) is settled
    // by definition; the boot guard (__test.ready) precedes this test, and main calls gi.load before it publishes __test
    // ORDER-LAND-638-FIX2 C2: a load that REJECTED (gi.state.loadError) is an error state = a settled state
    // ORDER-LIGHT-FIX7 → COMPANION: a GI request that STALLED past the bounded hold is a settled state too — the app degraded to venue OFF and
    // released readiness by law; the census names it (gi-hold-timeout)
    // ORDER-LIGHT-COMPANION: a GI hold that timed out is recorded on the venue object (giHoldTimedOut) and survives the degrade that follows
    // (the applied record is cleared by the off apply) — the stalled request is a settled state either way
    const giNever = !s || s.loadRequested === false || !!s.loadError || /[?&]nogi(=|&|$)/.test(window.location.search) || !!(V && (V.giHoldTimeout === true || V.giHoldTimedOut));
    // ORDER-LIGHT-COMPANION: a lighting leaf whose import STALLED past the boot budget never lands — the app is ready on main's rig by law
    // (window.__venueProtocol.stalled names it); the rig predicate reads that verdict instead of the absent leaf, and the GI predicate
    // cannot compare the bake's fixture with a rig that never landed
    const P = window.__venueProtocol; const lvStalled = !!(P && Array.isArray(P.stalled) && P.stalled.includes('lightingvisuals'));
    const rigOk = !!rig || lvStalled;
    // a fixture WITHOUT a committed bake (pendant_bar: gi.js honesty gate — ready, not baked, uGiOn 0) is settled once
    // ready; a baked fixture must also carry its class and match the rig (ORDER-LAND-638-FIX pendant arms)
    // ORDER-LIGHT-C2-FIX4 class C (review r6 P2, lighting-page.mjs:133-134): settled requires the CURRENT apply to have completed — during a slow or
    // stalled look / fixture apply on a table without a derived venue probe, s.ready stayed true from the previous apply and s.fixture already named
    // the requested fixture, so the old GI was certified as settled evidence. gi.state.applySeq (the last apply STARTED) must equal appliedSeq (the
    // last COMPLETED); the explicit disabled / error / degraded exceptions above (giNever) stay as written. The capture tool sets
    // window.__settleLegacyApplySeq under OB_SETTLE_APPLYSEQ=legacy (the arm: the pre-fix rule).
    const seqOk = (window.__settleLegacyApplySeq === true) ? true : !(s && s.applySeq !== undefined && s.appliedSeq !== undefined && s.applySeq !== s.appliedSeq);
    const giOk = giNever ? true : !!(s.ready && seqOk && (!s.baked || (s.bakeClass && (lvStalled || s.fixture === rig))));
    const settled = !!(window.__test && window.__test.ready && rigOk && giOk && venueOk);
    return { settled, ready: !!(window.__test && window.__test.ready), handshake: !!window.__venueProtocol, // refuter round: did boot reach the protocol handshake (a boot blocked before it = an unbounded await)
      // ORDER-LIGHT-7 R-B: a poke can pass THROUGH a settled state on its way to the state we mean to shoot (a
      // fixture with no venue term settles with no capture at all), so the caller also needs the capture counter and
      // the GI-apply witness to wait for stillness rather than for the first settled poll.
      venue: V ? { on: V.on, pending: V.pending === true, queued: V.rebakeQueued === true, sh: !!V.sh, gain: V.gain,
        captures: V.captures ?? null, retries: V.retries ?? null, settle: V.settle ?? null,
        giSeqGap: (V.giSeq && typeof V.giSeq.started === 'number' && typeof V.giSeq.completed === 'number')
          ? (V.giSeq.started - V.giSeq.completed) : null } : null,
      gi: s ? { ready: s.ready, baked: s.baked, bakeClass: s.bakeClass, fixture: s.fixture, look: s.look, gain: s.gain, applySeq: s.applySeq ?? null, appliedSeq: s.appliedSeq ?? null } : null, // C2-FIX4 class C: both sequence fields ride the stability signature
      settleRule: (window.__settleLegacyApplySeq === true) ? 'legacy' : 'apply-complete',
      rig: L || null,
      // the app's own error collector (main.js testErrors) — the first three, for the never-settled diagnostic
      errors: (window.__test && Array.isArray(window.__test.errors)) ? window.__test.errors.slice(0, 3).map((e) => String(e && e.message || e).slice(0, 200)) : null };
  } catch (e) { return { settled: false, error: String(e) }; }
})()`;

/** Scene-linear HDR readback of the CURRENT camera view: renders the scene
 * to a FloatType target (three applies tone mapping / output encoding only
 * on the canvas, so this is the composer's RenderPass content, pre-bloom,
 * pre-falloff, pre-ACES, exposure-free), box-downsamples by \`ds\`, flips to
 * top-down rows and returns { w, h, ds, b64 } with RGB float32 LE. */
export function hdrReadSrc(ds = 2) {
  return `(async () => {
  const THREE = await import('three');
  const r = window.__dbg.renderer, cam = window.__dbg.camera, sc = window.__dbg.scene;
  const W = r.domElement.width, H = r.domElement.height;
  let rt;
  try { rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, samples: 4 }); }
  catch (e) { rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType }); }
  const prev = r.getRenderTarget();
  r.setRenderTarget(rt);
  r.render(sc, cam);
  const buf = new Float32Array(W * H * 4);
  // ORDER-LIGHT-C2-FIX20 X1 (review 727 r12 P2): three's readRenderTargetPixels LOGS and RETURNS on an incomplete framebuffer or a float
  // type/format mismatch — it never throws — so a zero-initialised buffer would come back as a "successful" capture (nan 0, max 0) and two
  // failed captures would compare identical. The shFromCubeTarget precedent (web/scene/lightingvisuals.js:477-492 — SENTINEL :477, fill :486,
  // read :487, count :490, throw :491-492): fill with a float32-exact marker no render can produce, read, count the texels still === SENTINEL,
  // THROW by name BEFORE the downsample loop — the sentinel is finite, so untouched texels would otherwise pollute neg and the averaged
  // payload while nan stayed 0 and the defect would again read as a measured frame. The sentinel/untouched rule is copied ONLY — not the
  // precedent's all-faces-zero rule (a dark camera frame is a legal frame). Not NaN (this helper publishes a nan count); no gl.getError
  // (three bails before readPixels).
  const SENTINEL = Math.fround(-1e30);
  buf.fill(SENTINEL);
  r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  r.setRenderTarget(prev);
  rt.dispose();
  let untouched = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === SENTINEL) untouched++;
  if (untouched > 0) throw new Error('HDR readback wrote nothing: ' + untouched + '/' + buf.length
    + ' float32 components (W*H*4) untouched (three logs and returns on an incomplete framebuffer or a float type/format mismatch; it does not throw)');
  const ds = ${ds};
  const w = Math.floor(W / ds), h = Math.floor(H / ds);
  const out = new Float32Array(w * h * 3);
  const inv = 1 / (ds * ds);
  let nan = 0, neg = 0, mx = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let R = 0, G = 0, B = 0;
      for (let dy = 0; dy < ds; dy++) {
        const sy = H - 1 - (y * ds + dy); // RT rows are bottom-up
        for (let dx = 0; dx < ds; dx++) {
          const i = (sy * W + x * ds + dx) * 4;
          const rr = buf[i], gg = buf[i + 1], bb = buf[i + 2];
          if (rr !== rr || gg !== gg || bb !== bb) { nan++; continue; }
          if (rr < 0 || gg < 0 || bb < 0) neg++;
          R += rr; G += gg; B += bb;
        }
      }
      const o = (y * w + x) * 3;
      out[o] = R * inv; out[o + 1] = G * inv; out[o + 2] = B * inv;
      const m = Math.max(R, G, B) * inv; if (m > mx) mx = m;
    }
  }
  const bytes = new Uint8Array(out.buffer);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return { w, h, ds, W, H, nan, neg, max: mx, b64: btoa(s) };
})()`;
}

/** Light census: every light-class object in the scene with the numbers
 * that matter photometrically, plus the rig/GI/tone state. */
export const LIGHT_CENSUS_SRC = `(async () => {
  let dressing = null;
  // ORDER-LIGHT-FIX6 (matrix tree oldroom): main's room.js keeps no dressing record — its authored bytes ARE the legacy dressing by
  // definition, so a room instance without the record reads mode 'legacy' (never 'no read') and says why
  try { const rm = await import('./scene/room.js'); const inst = rm.activeRoom && rm.activeRoom.instance; dressing = (inst && inst.dressing) || (inst ? { mode: 'legacy', reason: "main's room.js: no dressing record (the authored bytes are the legacy dressing by definition)", envBinding: false, absentRecord: true, ledger: [] } : null); } catch (e) { dressing = { error: String(e) }; }
  const out = [];
  const sc = window.__dbg.scene;
  const hex = (c) => c && c.getHexString ? '0x' + c.getHexString() : null;
  const v3 = (v) => v ? [v.x, v.y, v.z].map((x) => Number(x.toFixed(5))) : null;
  sc.traverse((o) => {
    if (!o.isLight && !o.isLightProbe) return;
    const p = new (o.position.constructor)();
    o.getWorldPosition(p);
    const rec = { type: o.type, name: o.name || '', visible: o.visible, intensity: o.intensity,
      color: hex(o.color), pos: v3(p) };
    let a = o; const chain = [];
    while (a && a !== sc) { chain.unshift(a.name || a.type); a = a.parent; }
    rec.path = chain.join('/');
    if (o.isRectAreaLight) { rec.w = o.width; rec.h = o.height; }
    if (o.isHemisphereLight) rec.groundColor = hex(o.groundColor);
    if (o.isPointLight || o.isSpotLight) { rec.distance = o.distance; rec.decay = o.decay; }
    if (o.isSpotLight) { rec.angle = o.angle; rec.penumbra = o.penumbra; }
    if (o.isLightProbe && o.sh) rec.sh = o.sh.coefficients.map((c) => [c.x, c.y, c.z].map((x) => Number(x.toFixed(6))));
    out.push(rec);
  });
  const r = window.__dbg.renderer;
  const gu = window.__gi && window.__gi.uniforms;
  const u = (k) => gu && gu[k] ? gu[k].value : null;
  return {
    lights: out,
    tone: { toneMapping: r.toneMapping, exposure: r.toneMappingExposure,
      envIntensity: sc.environmentIntensity, hasEnv: !!sc.environment },
    lighting: window.__lighting && window.__lighting.state ? window.__lighting.state() : null,
    dressing, // room dressing mode + per-material albedo ledger (ORDER-LIGHT-4)
    // ORDER-LIGHT-6 Q1a: COMPILED-GLSL programs census per material class — which programs carry a light-probe
    // term (three's USE_LIGHT_PROBES define AND the getLightProbeIrradiance call) and which carry the derived
    // fill uniform term (shGetIrradianceAt(inverseTransformDirection(geometryNormal, viewMatrix), obVenueSH)). Read from the GL shader sources of the
    // programs the materials rendered with last, never from material fields (seal-5's hook was a silent no-op).
    programs: (() => {
      try {
        const gl = r.getContext(); const props = r.properties; const seen = new Map(); const classes = {};
        const roomRoot = sc.children.find((c) => { let f = false; c.traverse((o) => { if (o.name === 'obFarPropTable') f = true; }); return f; }) || null;
        const classOf = (o) => {
          let a = o;
          while (a && a !== sc) { if (a.userData && a.userData.obVenueClass) return a.userData.obVenueClass === 'balls' ? 'ball' : a.userData.obVenueClass; a = a.parent; }
          let root = o; while (root.parent && root.parent !== sc) root = root.parent;
          if (root === roomRoot) return 'room';
          if (root.name === 'obTable') return 'table';
          if (/^obAim/.test(root.name || '')) return 'aim';
          if (/^obCueStick|^obAtelierCue/.test(root.name || '')) return 'cue';
          if (o.geometry && o.geometry.type === 'SphereGeometry' && !root.name) return 'ball';
          return 'other';
        };
        sc.traverse((o) => {
          if (!o.isMesh || !o.visible) return;
          const cls = classOf(o);
          const C = classes[cls] || (classes[cls] = { meshes: 0, materials: 0, lit: 0, noProgram: 0, probeDefine: 0, probeCall: 0, probeCompiled: 0, venueSH: 0, occDerived: 0, occTail: 0, rectDiffuseOff: 0, offenders: [] });
          C.meshes++;
          for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
            if (!m) continue;
            C.materials++;
            const mp = props.get(m); const prog = mp && mp.currentProgram;
            if (!prog) { C.noProgram++; continue; }
            let rec = seen.get(prog.id);
            if (!rec) {
              let src = ''; try { src = gl.getShaderSource(prog.fragmentShader) || ''; } catch (e) { src = ''; }
              rec = { define: /^\\s*#define USE_LIGHT_PROBES\\b/m.test(src),
                call: (src.match(/getLightProbeIrradiance\\(\\s*lightProbe\\s*,/g) || []).length,
                sh: (src.match(/shGetIrradianceAt\\([^;]*obVenueSH\\s*\\)/g) || []).length,
                occ: /uniform sampler2D uOccLut;/.test(src) && /texelFetch\\( uOccLut/.test(src), // ORDER-LIGHT-9 Q2: the DERIVED occlusion text
                occTail: /float spikeOccCE = 8\\.0 - spikeWn\\.y;/.test(src) && /spikeOccCE \\* spikeOccCE/.test(src), // ORDER-LIGHT-C2-FIX1 class C (refuter): the far tail's GLSL is COMPILED in the program (the runtime witness of the tail, beside the generator's check)
                rdo: /OB-L11 rect-light diffuse single-sourced/.test(src) && !/reflectedLight\\.directDiffuse \\+= lightColor \\* material\\.diffuseColor \\* LTC_Evaluate/.test(src), // ORDER-LIGHT-11: no UNCONDITIONAL LTC diffuse line
                rw: /float obRectW = /.test(src) && /obRectW \\* lightColor \\* material\\.diffuseColor \\* LTC_Evaluate/.test(src), // ORDER-LAND-638-FIX P1-b: the WEIGHTED leg (main's path when the grid is unbound) R-A: rect lights specular-only
                gd: /OB-C2F3 grid-direct \\(a\\)/.test(src) && /OB-C2F4 grid-vis \\(v\\)/.test(src) && /obGridIrr -= min\\( obGridIrr, obRectDirectIrr \\) \\* \\( 1\\.0 - obGridVis( \\* obGridVisLamp)? \\)/.test(src),
                gw: /OB-C2F5 grid-well \\(v'\\)/.test(src) && /OB-C2F5 grid-well \\(h\\): the lamp-accounted grid portion keeps/.test(src) && /1\\.0 - obGridVis \\* obGridVisLamp/.test(src), // ORDER-LIGHT-C2-FIX5 class F: the shaft split compiled (v' + i' + h)
                glamp: /OB-C2F5 grid-lamp DEBUG/.test(src), // ?venueGridDebug=lamp: R = the replacement key's lamp term, G = the live direct diffuse // ORDER-LIGHT-C2-FIX4 class A: the grid-direct split is COMPILED in its IRRADIANCE form — (a) the lamps' analytic direct irradiance accumulated in the rect loop, (v) the lamp visibility ahead of lights_fragment_maps, (i) the shadowed grid key returned by getIBLIrradiance
                gd3: /OB-C2F3 grid-direct \\(b\\)/.test(src) && /obGridDirect \\* BRDF_Lambert/.test(src), // the FIX3 post-BRDF subtraction (kept as the arm under ?venueGridShadow=fix3)
                gneg: /OB-C2F4 grid-neg DEBUG/.test(src), // ?venueGridDebug=neg: the ball writes the sign of its indirect diffuse
                knee: /OB-BK ball-knee/.test(src) && /vec3 totalDiffuse = obBallKnee\\( obDiffuseRaw \\);/.test(src), // GH-996 (card 45): the ball diffuse knee COMPILED (pars + the totalDiffuse splice)
                kneeDebug: /OB-BK knee-debug/.test(src), // GH-996: ?ballKneeDebug=diffuse — the ball writes its PRE-knee diffuse (the C2 crown read)
                linkOk: (() => { try { return prog.program ? !!gl.getProgramParameter(prog.program, gl.LINK_STATUS) : null; } catch (e) { return null; } })(), // ORDER-LIGHT-C2-FIX4: did the program LINK — a spliced text can carry every marker and still fail to compile (the first FIX4 smoke)
                lit: /RE_IndirectDiffuse/.test(src) };
              seen.set(prog.id, rec);
            }
            if (rec.lit) C.lit++;
            if (rec.define) C.probeDefine++;
            if (rec.call) C.probeCall++;
            if (rec.define && rec.call) { C.probeCompiled++; if (C.offenders.length < 8) C.offenders.push((o.name || o.geometry.type) + ':probe'); }
            // ORDER-LIGHT-C2-FIX5 E4: the nofill offender witness binds to the FILL marker explicitly (it had ridden as the else-branch of whichever
            // counter was inserted last: the FIX3 gd counter, then the FIX4 gneg counter, so every lit ball program read as nofill on land19)
            if (rec.sh) C.venueSH++;
            else if ((cls === 'ball' || cls === 'cue') && rec.lit && C.offenders.length < 8) C.offenders.push((o.name || o.geometry.type) + ':nofill');
            if (rec.occ) C.occDerived++;
            if (rec.occTail) C.occTail = (C.occTail || 0) + 1;
            if (rec.rdo) C.rectDiffuseOff++;
            if (rec.rw) C.rectWeighted = (C.rectWeighted || 0) + 1;
            if (rec.gd) C.gridDirect = (C.gridDirect || 0) + 1;
            if (rec.linkOk === false) { C.linkFailed = (C.linkFailed || 0) + 1; if (C.offenders.length < 8) C.offenders.push((o.name || o.geometry.type) + ':LINK-FAILED'); }
            if (rec.gd3) C.gridDirectFix3 = (C.gridDirectFix3 || 0) + 1;
            if (rec.gneg) C.gridNegDebug = (C.gridNegDebug || 0) + 1;
            if (rec.gw) C.gridWell = (C.gridWell || 0) + 1;
            if (rec.glamp) C.gridLampDebug = (C.gridLampDebug || 0) + 1;
            if (rec.knee) C.ballKnee = (C.ballKnee || 0) + 1; // GH-996: absent (not 0) when no program carries it — the fence's venue=off identity
            if (rec.kneeDebug) C.ballKneeDebug = (C.ballKneeDebug || 0) + 1;
          }
        });
        return { classes, programs: seen.size };
      } catch (e) { return { error: String(e) }; }
    })(),
    // ORDER-LIGHT-9 Q1 arm: every ball's per-material SH block against the grid's bilinear sample at its position
    // ORDER-LAND-638-FIX: the boot-compatibility / pre-GI degradation CONTRACT, as numbers the gate can judge
    contract: (() => {
      try {
        const L = window.__lighting ? window.__lighting.state() : null; const V = L && L.venue;
        const G = window.__gi; const gs = G && G.state; const T = window.__test;
        const lp = sc.getObjectByName('obPdtVenueAmbient') || null; // dressing = the census-scope record (activeRoom.instance.dressing)
        const build = (V && Array.isArray(V.legacyBuild) && V.legacyBuild.length) ? V.legacyBuild[0] : null;
        const errs = (T && Array.isArray(T.errors)) ? T.errors : [];
        return {
          bootErrors: errs.length, firstError: errs.length ? String(errs[0] && errs[0].message || errs[0]).slice(0, 160) : null,
          venueOn: V ? (V.on ? 1 : 0) : null, venueDerivable: V ? (V.derivable === false ? 0 : (V.derivable === true ? 1 : null)) : null,
          venueDerived: V ? ((V.derived === true && V.sh) ? 1 : 0) : null, venueError: V && V.error ? String(V.error).slice(0, 120) : null,
          venueWaitedMs: V && typeof V.waitedMs === 'number' ? V.waitedMs : null, venueNogi: V ? (V.nogi ? 1 : 0) : null,
          // ORDER-LIGHT-C2-FIX5 E1 (RECORD rows): the wait's decomposition — bake 1 / bake 2 cost, bake 1 cold (programs compiled), the longest RAF
          // gap inside the wait, the idle tail from the last bake to the capture; E3: which probe-fade rule ran and how many bakes the apply fired
          venueBake1Ms: V && typeof V.bake1Ms === 'number' ? V.bake1Ms : null, venueBake2Ms: V && typeof V.bake2Ms === 'number' ? V.bake2Ms : null,
          venueBakeCold1: V && typeof V.bakeCold1 === 'number' ? V.bakeCold1 : null, venueBakeCount: V && typeof V.bakeCount === 'number' ? V.bakeCount : null,
          venueLongestFrameMs: V && typeof V.longestFrameMs === 'number' ? V.longestFrameMs : null, venueIdleTailMs: V && typeof V.idleTailMs === 'number' ? V.idleTailMs : null,
          venueProbeFade: V && V.probeFade ? String(V.probeFade) : null,
          venuePostFadeBake: V ? (V.postFadeBake === true ? 1 : 0) : null, // E3 witness: the post-fade bake fired (1 on the legacy rule only)
          venueTailPolls: V && typeof V.tailPolls === 'number' ? V.tailPolls : null, // E2: polls from the last bake to the capture (1 on the shipped rule by construction)
          // ORDER-LIGHT-C2-FIX6 class H: the acceptance trace's counters — accepts while a bake was pending / queued / held (0 on the shipped rule by
          // construction), the by-name budget degrade, the legacy arm's stale-probe change (the probe the queued bake produced vs the one accepted)
          venueAcceptMode: V && V.acceptMode ? String(V.acceptMode) : null, venueAcceptTraceN: V && Array.isArray(V.accepts) ? V.accepts.length : null,
          venueAcceptWhileQueued: V && typeof V.acceptWhileQueued === 'number' ? V.acceptWhileQueued : null, venueBudgetDegrade: V && typeof V.budgetDegrade === 'number' ? V.budgetDegrade : null,
          // ORDER-LIGHT-C2-FIX8 H3-5: the per-boot classification of the wait past the settle budget (one-owed-schedule rule) — class / bound / rounds / why / the owed schedule
          venueH3Class: V && typeof V.h3Class === 'string' ? V.h3Class : null, venueH3BoundMs: V && typeof V.h3BoundMs === 'number' ? V.h3BoundMs : null, venueH3Rounds: V && typeof V.h3Rounds === 'number' ? V.h3Rounds : null,
          venueStallMs: V && typeof V.stallMs === 'number' ? V.stallMs : null, venueWaitedEffMs: V && typeof V.waitedEffMs === 'number' ? V.waitedEffMs : null, // H3: main-thread stall inside the apply and the loop-available wait
          // ORDER-LIGHT-C2-FIX9 (additive): N1 the studio gate (the fill uniform's L1 norm reads 0 inside the cinelight window under the gate), N2 the sampler's
          // life (active handle, ticks since the last stop — 0 when every terminal path stopped it), N3 the owed-clock rule + the stall-straddle plant, N4 the
          // accept trace's two clocks (the last accept), N5 per-bake frame cost, the cancel plant
          venueStudioGated: V && typeof V.studioGated === 'boolean' ? (V.studioGated ? 1 : 0) : null, venueStudioGateMode: V && V.studioGateMode ? String(V.studioGateMode) : null,
          // ORDER-LIGHT-C2-FIX10 class B (review r10 P2): the ball-hide rule of the venue capture and its plant
          venueBallHideMode: V && V.ballHideMode ? String(V.ballHideMode) : null, venueBallLiftM: V && typeof V.ballLiftM === 'number' ? V.ballLiftM : null,
          venueBallLiftApplied: V && typeof V.ballLiftApplied === 'number' ? V.ballLiftApplied : null, venueHiddenBalls: V && typeof V.hiddenBalls === 'number' ? V.hiddenBalls : null,
          venueHiddenBallsAbove: V && typeof V.hiddenBallsAbove === 'number' ? V.hiddenBallsAbove : null,
          venueUniformL1: V && typeof V.uniformL1 === 'number' ? V.uniformL1 : null,
          venueSamplerActive: V && typeof V.samplerActive === 'boolean' ? (V.samplerActive ? 1 : 0) : null, venueSamplerTicks: V && typeof V.samplerTicks === 'number' ? V.samplerTicks : null,
          venueSamplerTicksSinceStop: V && typeof V.samplerTicksSinceStop === 'number' ? V.samplerTicksSinceStop : null, venueSamplerMode: V && V.samplerMode ? String(V.samplerMode) : null,
          venueOwedClockMode: V && V.owedClockMode ? String(V.owedClockMode) : null,
          venueStallPlantMs: V && V.stallPlant && typeof V.stallPlant.ms === 'number' ? V.stallPlant.ms : null, venueStallPlantRan: V && V.stallPlant ? (V.stallPlant.ran ? 1 : 0) : null,
          venueStallPlantStartedMs: V && V.stallPlant && typeof V.stallPlant.startedMs === 'number' ? V.stallPlant.startedMs : null, venueStallPlantEndedMs: V && V.stallPlant && typeof V.stallPlant.endedMs === 'number' ? V.stallPlant.endedMs : null,
          venueStallPlantDueMs: V && V.stallPlant && typeof V.stallPlant.dueMs === 'number' ? V.stallPlant.dueMs : null,
          venueCancelPlantFired: V && V.cancelPlant ? (V.cancelPlant.fired ? 1 : 0) : null, venueCancelPlantFiredMs: V && V.cancelPlant && typeof V.cancelPlant.firedMs === 'number' ? V.cancelPlant.firedMs : null,
          venueAcceptPastBudgetEff: (V && Array.isArray(V.accepts) && V.accepts.length && typeof V.accepts[V.accepts.length - 1].pastBudgetEff === 'number') ? V.accepts[V.accepts.length - 1].pastBudgetEff : null,
          venueAcceptPastBudgetWall: (V && Array.isArray(V.accepts) && V.accepts.length && typeof V.accepts[V.accepts.length - 1].pastBudgetWall === 'number') ? V.accepts[V.accepts.length - 1].pastBudgetWall : null,
          venueBake1FrameMs: (V && Array.isArray(V.bakeFrames) && typeof V.bakeFrames[0] === 'number') ? V.bakeFrames[0] : null, venueBake2FrameMs: (V && Array.isArray(V.bakeFrames) && typeof V.bakeFrames[1] === 'number') ? V.bakeFrames[1] : null,
          venueH3BakeFrameMs: (() => { try { const o = V && V.h3Owed ? (typeof V.h3Owed === 'string' ? JSON.parse(V.h3Owed) : V.h3Owed) : null; return o && typeof o.bakeFrameMs === 'number' ? o.bakeFrameMs : null; } catch (e) { return null; } })(),
          venueH3BakeCpuMs: (() => { try { const o = V && V.h3Owed ? (typeof V.h3Owed === 'string' ? JSON.parse(V.h3Owed) : V.h3Owed) : null; return o && typeof o.bakeCpuMs === 'number' ? o.bakeCpuMs : null; } catch (e) { return null; } })(), // H3: main-thread stall inside the apply and the loop-available wait
          venueH3Why: V && V.h3Why ? String(V.h3Why).slice(0, 120) : null, venueH3Owed: V && V.h3Owed ? String(V.h3Owed).slice(0, 200) : null, venueH3Unbounded: V && typeof V.h3Class === 'string' ? (V.h3Class === 'unbounded' ? 1 : 0) : null,
          venueStaleProbeRel: V && typeof V.staleProbeRel === 'number' ? V.staleProbeRel : null, venueStaleProbeAfterMs: V && typeof V.staleProbeAfterMs === 'number' ? V.staleProbeAfterMs : null,
          venueAcceptTrace: V && Array.isArray(V.accepts) ? JSON.stringify(V.accepts.slice(0, 12)).slice(0, 600) : null,
          // ORDER-LIGHT-C2-FIX5 class G: the bake-key witnesses (gi.probeState) and the G1 race trace (window.__giTrace, written by the gikey poke)
          giKeyMode: (() => { try { const ps = G && typeof G.probeState === 'function' ? G.probeState() : null; return ps && ps.giKeyMode ? String(ps.giKeyMode) : null; } catch (e) { return null; } })(),
          giKeyStaleDropped: (() => { try { const ps = G && typeof G.probeState === 'function' ? G.probeState() : null; return ps && typeof ps.giKeyStaleDropped === 'number' ? ps.giKeyStaleDropped : null; } catch (e) { return null; } })(),
          giTraceFrames: window.__giTrace && Number.isFinite(window.__giTrace.frames) ? window.__giTrace.frames : null,
          giTraceStaleOn: window.__giTrace && Number.isFinite(window.__giTrace.staleOn) ? window.__giTrace.staleOn : null,
          giTraceOnBeforeComplete: window.__giTrace && Number.isFinite(window.__giTrace.onBeforeComplete) ? window.__giTrace.onBeforeComplete : null,
          giTraceCompleted: window.__giTrace ? (window.__giTrace.completed ? 1 : 0) : null, giTraceClosedAtFrame: window.__giTrace && Number.isFinite(window.__giTrace.closedAtFrame) ? window.__giTrace.closedAtFrame : null,
          giTraceStaleFirst: window.__giTrace && window.__giTrace.staleFirst ? String(window.__giTrace.staleFirst).slice(0, 160) : null,
          // ORDER-LAND-638-FIX3: the float-render-target law (P2 #4), main's shading on the degrade path (P2 #1)
          venueInertFloat: V ? (/float/i.test(String((V.error || '') + ' ' + (V.derivableReason || ''))) ? 1 : 0) : null,
          // ORDER-LAND-638-FIX4: the runtime capture failure (P2 #1) — pending cleared, the reason names the runtime throw
          // ORDER-LIGHT-C1 (b) arm record: the dbq poke queues a re-bake under a held debounce and reads the app's readiness WHILE it is queued
          dbq0ReadyAtMs: window.__dbq0 && Number.isFinite(window.__dbq0.readyAtMs) ? window.__dbq0.readyAtMs : null, dbq0MaxDelta: window.__dbq0 && Number.isFinite(window.__dbq0.maxDelta) ? window.__dbq0.maxDelta : null, dbq0PctDiff: window.__dbq0 && Number.isFinite(window.__dbq0.pctDiff) ? window.__dbq0.pctDiff : null, dbq0Px: window.__dbq0 ? window.__dbq0.px : null,
          dbqReadyWhileQueued: window.__dbq ? (window.__dbq.readyWhileQueued ? 1 : 0) : null, dbqQueued: window.__dbq ? (window.__dbq.queued ? 1 : 0) : null, dbqReleased: window.__dbq ? (window.__dbq.released ? 1 : 0) : null, dbqReadyAfter: window.__dbq ? (window.__dbq.readyAfter ? 1 : 0) : null,
          venuePending: V ? (V.pending === true ? 1 : 0) : null, venueRebakeQueued: V ? (V.rebakeQueued === true ? 1 : 0) : null, venueCapturePending: V ? (V.capturePending === true ? 1 : 0) : null, venueReadinessMode: V && V.readinessMode ? String(V.readinessMode) : null, venueDebounceMode: V && V.debounceMode ? String(V.debounceMode) : null, venueInertRuntime: V ? (/runtime/i.test(String((V.error || '') + ' ' + (V.derivableReason || ''))) ? 1 : 0) : null, venueCaptureError: V ? (V.captureError ? 1 : 0) : null,
          venueDerivableReason: V && V.derivableReason ? String(V.derivableReason).slice(0, 140) : null,
          // ORDER-LIGHT-FIX6 (review r10 P2): the ONE protocol handshake — main.js's verdict (window.__venueProtocol) with the stale leaf
          // NAMED (protocolStale, and protoStale_<leaf> as a number per participant so a gate row can judge it), and the lighting leaf's
          // own view of it (venueProtocolOk / venueProtocolWhy)
          protocolOk: window.__venueProtocol ? (window.__venueProtocol.ok ? 1 : 0) : null,
          protocolExpected: window.__venueProtocol ? window.__venueProtocol.expected : null,
          protocolStaleCount: window.__venueProtocol ? window.__venueProtocol.stale.length : null,
          protocolStale: window.__venueProtocol && window.__venueProtocol.stale.length ? window.__venueProtocol.stale.join(',') : null,
          protocolDecidedAt: window.__venueProtocol ? String(window.__venueProtocol.decidedAt) : null,
          protocolValues: window.__venueProtocol ? window.__venueProtocol.values : null,
          // ORDER-LIGHT-COMPANION (review r12 P1): an optional leaf import that STALLED past the ONE boot budget — named, with the budget and the moment
          protocolStalled: window.__venueProtocol && Array.isArray(window.__venueProtocol.stalled) && window.__venueProtocol.stalled.length ? window.__venueProtocol.stalled.join(',') : null,
          protocolStalledCount: window.__venueProtocol && Array.isArray(window.__venueProtocol.stalled) ? window.__venueProtocol.stalled.length : null,
          protocolStalledAtMs: window.__venueProtocol && typeof window.__venueProtocol.stalledAt === 'number' ? window.__venueProtocol.stalledAt : null,
          protocolBudgetMs: window.__venueProtocol && typeof window.__venueProtocol.budgetMs === 'number' ? window.__venueProtocol.budgetMs : null,
          ...Object.fromEntries(['occlusionlut', 'venueflag', 'lightingvisuals'].map((n) => ['protoStalled_' + n, window.__venueProtocol && Array.isArray(window.__venueProtocol.stalled) ? (window.__venueProtocol.stalled.includes(n) ? 1 : 0) : null])),
          venueGiHoldDegraded: V ? ((V.giHoldTimedOut && window.__venueDegrade) ? 1 : 0) : null, // refuter round: the venue-level record + main's degrade record (the applied flag is erased by the off apply)
          lightingLeafPresent: L ? 1 : 0,
          // ORDER-LIGHT-C1 (P3): the INJECTED set (WeakRef<Material>) — size / live / after the sweep; the churn seam's before/after record
          shadingInjectedSize: window.__venueShading && window.__venueShading.injected ? (window.__venueShading.injected() || {}).size ?? null : null,
          shadingInjectedLive: window.__venueShading && window.__venueShading.injected ? (window.__venueShading.injected() || {}).live ?? null : null,
          shadingInjectedPrune: window.__venueShading && window.__venueShading.injected ? ((window.__venueShading.injected() || {}).prune ? 1 : 0) : null,
          churnK: window.__venueChurn ? window.__venueChurn.k : null,
          churnSizeBefore: window.__venueChurn && window.__venueChurn.before ? window.__venueChurn.before.size : null,
          churnSizeAfter: window.__venueChurn && window.__venueChurn.after ? window.__venueChurn.after.size : null,
          churnGrowth: window.__venueChurn && window.__venueChurn.before && window.__venueChurn.after ? window.__venueChurn.after.size - window.__venueChurn.before.size : null,
          ...Object.fromEntries(['gi', 'shading', 'room', 'look', 'lightingvisuals', 'occlusionlut', 'venueflag', 'ballset'].map((n) => ['protoStale_' + n, window.__venueProtocol ? (window.__venueProtocol.stale.includes(n) ? 1 : 0) : null])),
          venueProtocolOk: V && V.protocol ? (V.protocol.ok ? 1 : 0) : null, venueProtocolWhy: V && V.protocol && V.protocol.why ? String(V.protocol.why).slice(0, 160) : null,
          // ORDER-LIGHT-FIX5 (review r9): the GI-hold law (P2#1), the LUT leaf law (P1), the fill-term compiled witnesses (P3)
          venueGiSettled: V && typeof V.giSettled === 'boolean' ? (V.giSettled ? 1 : 0) : null, venueGiHeldMs: V && typeof V.giHeldMs === 'number' ? V.giHeldMs : null,
          venueHold: V ? (V.hold ? 1 : 0) : null, venueGiWait: V && V.giWait ? String(V.giWait) : null,
          // ORDER-LIGHT-FIX7 (review r11 P2): the bounded GI hold — gi-hold-timeout by name, the held ms, the late-completion watch — and the
          // look-flip witness (window.__fix7Look, written by the seal's lookflip poke: the venue probe before / after a green-to-SP regrade)
          // (COMPANION: read from the venue-level record giHoldTimedOut, which survives the degrade's off apply; the applied flag alone did not)
          venueGiHoldTimeout: V ? ((V.giHoldTimeout === true || V.giHoldTimedOut) ? 1 : 0) : null,
          venueGiHoldTimeoutMs: V ? (V.giHoldTimedOut && typeof V.giHoldTimedOut.heldMs === 'number' ? V.giHoldTimedOut.heldMs : (V.giHoldTimeout === true && typeof V.giHeldMs === 'number' ? V.giHeldMs : 0)) : null,
          venueGiHoldWaitedMs: V && V.giHoldTimedOut && typeof V.giHoldTimedOut.waitedMs === 'number' ? V.giHoldTimedOut.waitedMs : null,
          venueDegradeWhy: window.__venueDegrade && window.__venueDegrade.why ? String(window.__venueDegrade.why).slice(0, 160) : null,
          venueDegraded: window.__venueDegrade ? 1 : 0,
          venueGiHoldWhy: V && V.giHoldTimedOut && V.giHoldTimedOut.reason ? String(V.giHoldTimedOut.reason).slice(0, 160) : null,
          venueGiHoldBudgetMs: V && V.giHoldTimedOut ? V.giHoldTimedOut.budgetMs : null,
          venueGiHoldMode: V && V.giHold ? String(V.giHold) : null, venueRegradeMode: V && V.regradeMode ? String(V.regradeMode) : null,
          lookFlipShRel: window.__fix7Look && Number.isFinite(window.__fix7Look.rel) ? window.__fix7Look.rel : null,
          lookFlipShMax: window.__fix7Look && Number.isFinite(window.__fix7Look.dmax) ? window.__fix7Look.dmax : null,
          lookFlipCaptures: window.__fix7Look && typeof window.__fix7Look.capturesBefore === 'number' && typeof window.__fix7Look.capturesAfter === 'number' ? window.__fix7Look.capturesAfter - window.__fix7Look.capturesBefore : null,
          lookFlipTouchedBefore: window.__fix7Look ? (window.__fix7Look.touchedBefore ? 1 : 0) : null,
          lookFlipLookChanged: window.__fix7Look ? (window.__fix7Look.lookAfter !== window.__fix7Look.from ? 1 : 0) : null,
          lookFlipAccepted: window.__fix7Look ? (window.__fix7Look.accepted ? 1 : 0) : null,
          lookFlipFrom: window.__fix7Look ? String(window.__fix7Look.from) : null, lookFlipTo: window.__fix7Look ? String(window.__fix7Look.to) : null,
          pmremRearms: typeof window.__obPmremRearm === 'number' ? window.__obPmremRearm : null,
          pmremGuard: window.__obPmremGuard ? (window.__obPmremGuard.installed ? 1 : 0) : null, pmremGuardWhy: window.__obPmremGuard ? (window.__obPmremGuard.why || null) : null, pmremGuardThree: window.__obPmremGuard ? String(window.__obPmremGuard.three) : null, // land8: the pinned guard's install state (0 = LOUD no-op: vendor bump or symbol change) // land8: the shared-generator re-arm guard fired N times (null = pre-guard main.js)
          occLutMode: L && L.occLut ? (L.occLut.present ? 1 : 0) : null, occLutReason: L && L.occLut && L.occLut.reason ? String(L.occLut.reason).slice(0, 160) : null,
          ballFillPrograms: (() => { try { const gl = r.getContext(); let n = 0; sc.traverse((o) => { const m = o.material; if (!o.isMesh || !m || !m.userData || !m.userData.giSH) return; const mp = r.properties.get(m); const prog = mp && mp.currentProgram; if (!prog || !prog.fragmentShader) return; const src = gl.getShaderSource(prog.fragmentShader) || ''; if (src.indexOf('obVenueSH') >= 0) n++; }); return n; } catch (e) { return null; } })(),
          ballFillKeys: (() => { let n = 0; sc.traverse((o) => { const m = o.material; if (o.isMesh && m && m.userData && m.userData.giSH && typeof m.customProgramCacheKey === 'function' && String(m.customProgramCacheKey()).indexOf('|venuefill') >= 0) n++; }); return n; })(), // indexOf, not a regex: an escaped pipe inside this template literal loses its backslash
          degradeBakes: window.__venueDegrade ? window.__venueDegrade.bakes : null, degradeLastRel: window.__venueDegrade && typeof window.__venueDegrade.lastRel === 'number' ? window.__venueDegrade.lastRel : null, degradeReadback: window.__venueDegrade ? (window.__venueDegrade.readback === false ? 0 : 1) : null,
          giIrr: (G && G.uniforms && G.uniforms.uGiIrr) ? G.uniforms.uGiIrr.value : null,
          ballOccDerived: (() => { let n = 0; sc.traverse((o) => { const m = o.material; if (o.isMesh && m && m.userData && m.userData.giSH && typeof m.customProgramCacheKey === 'function' && String(m.customProgramCacheKey()).includes('oc')) n++; }); return n; })(),
          ballRectWeighted: (() => { let n = 0; sc.traverse((o) => { const m = o.material; if (o.isMesh && m && m.userData && m.userData.giSH && typeof m.customProgramCacheKey === 'function' && String(m.customProgramCacheKey()).includes('rs')) n++; }); return n; })(),
          // ORDER-LAND-638-FIX2 B1 (round-trip arm): the settle law's env-cube convergence record (rounds, last relative change, settled)
          venueSettleRounds: V && V.stillness && typeof V.stillness.confirmations === 'number' ? V.stillness.confirmations : null,
          venueSettleRel: V && V.stillness && typeof V.stillness.lastDeltaRel === 'number' ? V.stillness.lastDeltaRel : null,
          venueSettled: V && V.stillness ? (V.stillness.settled ? 1 : 0) : null,
          // ORDER-LIGHT-C2-FIX10 (maintainer 16:4xZ, the convergence finding as a stated product property): the tolerance IN FORCE and the bound, as numbers —
          // a later seal comparing stopping rounds across builds reads fields, not prose (venueSettleRounds above = the accepted round count)
          venueConvergeMode: V && V.stillness && typeof V.stillness.mode === 'string' ? V.stillness.mode : null,
          venueConvergeRel: V && V.stillness && typeof V.stillness.tol === 'number' ? V.stillness.tol : null,
          venueConvergeMax: V && V.stillness && typeof V.stillness.max === 'number' ? V.stillness.max : null,
          // the control block's SENSITIVITY boot (check-ctrl): the perturbation the poke applied to the shared obVenueSH uniform, self-declared by the set
          ctrlPerturb: window.__obCtrlPerturb ? JSON.parse(JSON.stringify(window.__obCtrlPerturb)) : null,
          giLoadRequested: gs ? (gs.loadRequested === undefined ? null : (gs.loadRequested ? 1 : 0)) : null, giReady: gs ? (gs.ready ? 1 : 0) : null,
          // ORDER-LIGHT-C1 (a): what the GI runtime has BOUND at capture time (the pre-GI fallback = 0 / null) and whether a sequence is open
          ...(() => { const ps = G && G.probeState ? G.probeState() : null; return ps ? { giPlanBound: ps.planBound ? 1 : 0, giFlankBound: ps.flankBound ? 1 : 0, giProbes: ps.probes ? 1 : 0, giRoomBaked: ps.roomBaked ? 1 : 0, giRig: ps.rig ?? null, giRigMatch: ps.rigMatch === undefined ? null : (ps.rigMatch ? 1 : 0), giBound: ps.giBound === undefined ? null : (ps.giBound ? 1 : 0), giRoomSuspended: ps.roomSuspended === undefined ? null : (ps.roomSuspended ? 1 : 0), giRigRule: ps.rigRule === undefined ? null : (ps.rigRule ? 1 : 0), giHemiVsBuild: (typeof ps.hemiVsBuild === 'number') ? ps.hemiVsBuild : null, giHemiDimmed: ps.hemiDimmed === undefined ? null : (ps.hemiDimmed ? 1 : 0), giHemiRestorePending: ps.hemiRestorePending === undefined ? null : (ps.hemiRestorePending ? 1 : 0), giFloorLightMapBound: ps.floorLightMapBound ? 1 : 0, giBakeClass: ps.bakeClass, giBakeFixture: ps.bakeFixture, giLook: ps.look, giRequestedLook: ps.requestedLook, giSeqOpen: ps.seqOpen ? 1 : 0, giApplySeq: ps.applySeq, giAppliedSeq: ps.appliedSeq, giBallBlocksNonZero: ps.ballBlocksNonZero, giLookMismatch: (ps.look !== null && ps.requestedLook !== null && ps.look !== ps.requestedLook) ? 1 : 0 } : { giPlanBound: null, giProbes: null, giSeqOpen: null }; })(),
          // refuter round (COMPANION): the fixture the GI maps are keyed to — a boot whose rig leaf never lands must read main's canopy rig
          giFixture: gs && gs.fixture ? String(gs.fixture) : null, giFixtureIsCanopy: gs ? (gs.fixture === 'canopy_panel' ? 1 : 0) : null,
          giLoadError: gs ? (gs.loadError ? 1 : 0) : null, giLoadErrorText: gs && gs.loadError ? String(gs.loadError).slice(0, 100) : null, // ORDER-LAND-638-FIX2 C2
          giOn: (G && G.uniforms && G.uniforms.uGiOn) ? G.uniforms.uGiOn.value : null,
          // ORDER-LIGHT-C2 (a): the studio-rig window (cinelight announce) and the studio poke's dim factor / rect count (window seams)
          cinelight: (typeof window.__cinelight === 'boolean') ? (window.__cinelight ? 1 : 0) : 0,
          // ORDER-LIGHT-C2-FIX1 class A: the venue queues across the studio window (state) and the studioqueue poke's before/after readbacks
          venueRigWindow: (V && typeof V.rigWindow === 'boolean') ? (V.rigWindow ? 1 : 0) : null,
          venueRebakeDeferred: (V && typeof V.rebakeDeferred === 'boolean') ? (V.rebakeDeferred ? 1 : 0) : null,
          venueRigWindowDeferrals: V && Number.isFinite(V.rigWindowDeferrals) ? V.rigWindowDeferrals : null,
          venueRigParked: V && Number.isFinite(V.rigParked) ? V.rigParked : null,
          venueParkedMs: V && Number.isFinite(V.parkedMs) ? V.parkedMs : null,
          venueParkBudget: V && V.parkBudget ? String(V.parkBudget) : null,
          venueResumeCaptureAfterBake: V && Number.isFinite(V.resumeCaptureAfterBake) ? V.resumeCaptureAfterBake : null,
          // ORDER-LIGHT-C2-FIX1 A(ii) (land16 attempt 5, capture-studiofail): the resume OWES the post-resume bake — the count it queued itself, the rule in force
          venueResumeBakeOwed: V && Number.isFinite(V.resumeBakeOwed) ? V.resumeBakeOwed : null,
          venueResumeBake: V && V.resumeBake ? String(V.resumeBake) : null,
          // the GENERIC settle invariant (maintainer, C2-FIX1 A(ii)): no boot path may leave the venue capture pending at a dump — judged over EVERY
          // sealed set by lighting-check-settled.py against the app's OWN budget (state().venue.budgetMs = main.js VENUE_GI_WINDOW_MS), not a new constant
          venueCapturePending: (V && typeof V.capturePending === 'boolean') ? (V.capturePending ? 1 : 0) : null,
          venueRebakeQueued: (V && typeof V.rebakeQueued === 'boolean') ? (V.rebakeQueued ? 1 : 0) : null,
          venueCaptures: V && Number.isFinite(V.captures) ? V.captures : null,
          venueBudgetMs: V && Number.isFinite(V.budgetMs) ? V.budgetMs : null,
          // ORDER-LIGHT-C2-FIX2 class A: the lifecycle poke's record (window.__lifecycle: SH blocks before / after a forced runtime degrade on a played table)
          lcShot: window.__lifecycle ? (window.__lifecycle.shot ? 1 : 0) : null,
          lcBlocksBefore: window.__lifecycle && Number.isFinite(window.__lifecycle.blocksBefore) ? window.__lifecycle.blocksBefore : null,
          lcBlocksAfter: window.__lifecycle && Number.isFinite(window.__lifecycle.blocksAfter) ? window.__lifecycle.blocksAfter : null,
          lcBlocksDelta: window.__lifecycle && Number.isFinite(window.__lifecycle.blocksAfter) && Number.isFinite(window.__lifecycle.blocksBefore) ? window.__lifecycle.blocksAfter - window.__lifecycle.blocksBefore : null,
          lcShMaxDelta: window.__lifecycle && Number.isFinite(window.__lifecycle.shMaxDelta) ? window.__lifecycle.shMaxDelta : null,
          lcDegraded: window.__lifecycle ? (window.__lifecycle.degraded ? 1 : 0) : null,
          lcMode: window.__lifecycle && window.__lifecycle.mode ? String(window.__lifecycle.mode) : null,
          giBallBlocksFromMain: (() => { try { const ps = G && G.probeState ? G.probeState() : null; return ps && typeof ps.ballBlocksFromMain === 'boolean' ? (ps.ballBlocksFromMain ? 1 : 0) : null; } catch { return null; } })(),
          // ORDER-LIGHT-C2-FIX2 class B: the public __rebakeEnv seam's counters (window.__rebakeEnv.bakes / mode) and the rebake poke's record
          rebakeSeamBakes: window.__rebakeProbe && Number.isFinite(window.__rebakeProbe.bakes) ? window.__rebakeProbe.bakes : null,
          rebakeSeamDelayMs: window.__rebakeProbe && Number.isFinite(window.__rebakeProbe.delayMs) ? window.__rebakeProbe.delayMs : null,
          rebakeSeamWindows: window.__rebakeProbe && Number.isFinite(window.__rebakeProbe.windows) ? window.__rebakeProbe.windows : null,
          rebakeSeamMode: (typeof window.__rebakeEnv === 'function' && window.__rebakeEnv.mode) ? String(window.__rebakeEnv.mode) : null,
          rebakeSeamCancel: (typeof window.__rebakeEnv === 'function' && window.__rebakeEnv.cancel) ? String(window.__rebakeEnv.cancel) : null, // ORDER-LIGHT-C2-FIX3 class B: the seam's cancel law ('cancel-before-clear' | 'legacy')
          // ORDER-LIGHT-C2-FIX4 class C: the GI sequence fields the capture tool snapshotted AT THE MOMENT it declared settled (window.__settleSnapshot,
          // written by lighting-capture.mjs after every settle wait) — 1 = the tool certified settled while an apply was still open
          giSeqOpenAtSettle: (window.__settleSnapshot && window.__settleSnapshot.applySeq != null && window.__settleSnapshot.appliedSeq != null) ? (window.__settleSnapshot.applySeq !== window.__settleSnapshot.appliedSeq ? 1 : 0) : null,
          giApplySeqAtSettle: window.__settleSnapshot ? (window.__settleSnapshot.applySeq ?? null) : null,
          giAppliedSeqAtSettle: window.__settleSnapshot ? (window.__settleSnapshot.appliedSeq ?? null) : null,
          settleRuleAtSettle: window.__settleSnapshot ? (window.__settleSnapshot.rule ?? null) : null,
          rebakeSeamPending: (typeof window.__rebakeEnv === 'function' && typeof window.__rebakeEnv.pending === 'boolean') ? (window.__rebakeEnv.pending ? 1 : 0) : null,
          // (gidelay dig, 2026-09-10) was THIS boot served through the service worker? The second boot of a look in one capture process may be
          // SW-controlled with the background fill (201 files) in flight, which delays the GI assets a delayed apply waits on — measured, not assumed
          giDelayFlagMs: (() => { try { const v = Number(new URLSearchParams(location.search).get('giDelay')); return Number.isFinite(v) && v > 0 ? v : 0; } catch { return null; } })(), // the gidelay stimulus as booted (checkable against venueBudgetMs × 1.1)
          swControlled: (typeof navigator !== 'undefined' && navigator.serviceWorker) ? (navigator.serviceWorker.controller ? 1 : 0) : null,
          swState: (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller) ? String(navigator.serviceWorker.controller.state) : null,
          sqCubeSame: window.__studioQueue ? window.__studioQueue.cubeSame : null,
          sqCubeWithinTol: window.__studioQueue ? window.__studioQueue.cubeWithinTol : null,
          sqWindowMs: window.__studioQueue && Number.isFinite(window.__studioQueue.windowMs) ? window.__studioQueue.windowMs : null,
          sqResumeCaptureAfterBake: window.__studioQueue && Number.isFinite(window.__studioQueue.resumeCaptureAfterBake) ? window.__studioQueue.resumeCaptureAfterBake : null,
          sqParkedMs: window.__studioQueue && Number.isFinite(window.__studioQueue.parkedMs) ? window.__studioQueue.parkedMs : null,
          sqCubeMaxAbs: window.__studioQueue && Number.isFinite(window.__studioQueue.cubeMaxAbs) ? window.__studioQueue.cubeMaxAbs : null,
          sqCubeFracOver1e4: window.__studioQueue && Number.isFinite(window.__studioQueue.cubeFracOver1e4) ? window.__studioQueue.cubeFracOver1e4 : null,
          sqMidMaxAbs: window.__studioQueue && Number.isFinite(window.__studioQueue.midMaxAbs) ? window.__studioQueue.midMaxAbs : null,
          sqBakedInWindow: window.__studioQueue ? window.__studioQueue.bakedInWindow : null,
          sqCapturesInWindow: window.__studioQueue ? window.__studioQueue.capturesInWindow : null,
          sqCapturesAfter: window.__studioQueue ? window.__studioQueue.capturesAfter : null,
          sqShL2Rel: window.__studioQueue && Number.isFinite(window.__studioQueue.shL2Rel) ? window.__studioQueue.shL2Rel : null,
          sqShDcRel: window.__studioQueue && Number.isFinite(window.__studioQueue.shDcRel) ? window.__studioQueue.shDcRel : null,
          sqRefShL2Rel: window.__studioQueue && Number.isFinite(window.__studioQueue.refShL2Rel) ? window.__studioQueue.refShL2Rel : null,
          sqRefMeanMaxRel: window.__studioQueue && Number.isFinite(window.__studioQueue.refMeanMaxRel) ? window.__studioQueue.refMeanMaxRel : null,
          sqRefSameAsBoot: window.__studioQueue ? window.__studioQueue.refSameAsBoot : null,
          sqCubeSameVsBoot: window.__studioQueue ? window.__studioQueue.cubeSameVsBoot : null,
          sqCapturesRef: window.__studioQueue ? window.__studioQueue.capturesRef : null,
          sqTol: window.__studioQueue && Number.isFinite(window.__studioQueue.tol) ? window.__studioQueue.tol : null,
          sqShWithinTol: window.__studioQueue ? window.__studioQueue.shWithinTol : null,
          sqMeanMaxRel: window.__studioQueue && Number.isFinite(window.__studioQueue.meanMaxRel) ? window.__studioQueue.meanMaxRel : null,
          sqRigWindowMid: window.__studioQueue ? window.__studioQueue.rigWindowMid : null,
          sqDeferredMid: window.__studioQueue ? window.__studioQueue.deferredMid : null,
          sqParkedMid: window.__studioQueue ? window.__studioQueue.parkedMid : null,
          studioFactor: window.__studio ? (window.__studio.factor ?? null) : null, // (refuter P1) no default: an errored poke reads null
          studioRects: window.__studio && window.__studio.rects ? window.__studio.rects.length : null,
          studioPoints: window.__studio && Array.isArray(window.__studio.points) ? window.__studio.points.length : null,
          studioPointSum: window.__studio && Array.isArray(window.__studio.points) ? window.__studio.points.reduce((a, b) => a + b, 0) : null,
          studioReverted: window.__studio ? (window.__studio.reverted ? 1 : 0) : null,
          // the room hemi NOW over its value the studio poke read BEFORE installing the rig (window.__studioHemi0): the hemi-ownership arms
          studioHemiRatio: (() => { try { let h = null; window.__dbg.scene.traverse((o) => { if (o.isHemisphereLight) h = o; }); return (h && window.__studioHemi0) ? h.intensity / window.__studioHemi0 : null; } catch { return null; } })(),
          dressingClass: dressing ? (dressing.mode === 'class' ? 1 : 0) : null, dressingReason: dressing ? (dressing.reason || null) : null,
          dressingEnvBinding: dressing ? (dressing.envBinding === true ? 1 : (dressing.envBinding === false ? 0 : null)) : null,
          legacyProbePresent: lp ? 1 : 0, legacyProbeVisible: lp ? (lp.visible ? 1 : 0) : null, legacyProbeIntensity: lp ? lp.intensity : null,
          legacyProbeBuild: build, suppressedName: V && V.suppressed ? V.suppressed.name : null,
          // 1 = the table-owned probe is on and reads its build literal (nothing suppressed); 0 = suppressed or altered
          legacyProbeRestored: lp ? ((lp.visible && (build === null || Math.abs(lp.intensity - build) < 1e-9) && !(V && V.suppressed)) ? 1 : 0) : null,
        };
      } catch (e) { return { error: String(e) }; }
    })(),
    giBlocks: (() => {
      try {
        const G = window.__gi; if (!G || !G.sampleSH) return { present: false };
        let n = 0, zero = 0, maxDelta = 0, noSample = 0; const tmp = new Float32Array(27);
        sc.traverse((o) => {
          if (!o.isMesh || !o.material || !o.material.userData || !o.material.userData.giSH) return;
          n++; const sh = o.material.userData.giSH.value; let z = true, d = 0;
          const ok = G.sampleSH(o.position.x, o.position.z, tmp);
          if (!ok) { noSample++; return; }
          for (let k = 0; k < 27; k++) { if (sh[k] !== 0) z = false; d = Math.max(d, Math.abs(sh[k] - tmp[k])); }
          if (z) zero++; maxDelta = Math.max(maxDelta, d);
        });
        return { present: true, n, zeroBlocks: zero, noSample, maxDelta, ready: !!(G.state && G.state.ready), uGiIrr: G.uniforms && G.uniforms.uGiIrr ? G.uniforms.uGiIrr.value : null };
      } catch (e) { return { error: String(e) }; }
    })(),
    // ORDER-LIGHT-9 Q2 arm: the occlusion table's h = 0 anchors against the closed form 1 − ½(1 − n_y)(2 − n_y²)^{−3/2}
    occLut: (() => {
      try {
        const G = window.__gi; const t = G && G.uniforms && G.uniforms.uOccLut && G.uniforms.uOccLut.value;
        // is the table BOUND to any ball program? (a program-side witness, not a material field) — counted BEFORE the texture
        // check: ORDER-LIGHT-FIX5 P1 reads it on the leafless tree too (no texture, and no program may sample it)
        let bound = 0; const gl = r.getContext();
        sc.traverse((o) => { if (!o.isMesh || !o.material || !o.material.userData || !o.material.userData.giSH) return; const mp = r.properties.get(o.material); const prog = mp && mp.currentProgram; if (!prog) return; let src = ''; try { src = gl.getShaderSource(prog.fragmentShader) || ''; } catch (e) { src = ''; } if (/texelFetch\\( uOccLut/.test(src)) bound++; });
        if (!t || !t.image || !t.image.data) return { present: false, boundBallPrograms: bound };
        const D = t.image.data, nx = t.image.width, ny = t.image.height;
        const cf = (v) => 1 - 0.5 * (1 - v) * Math.pow(2 - v * v, -1.5);
        const rows = [[-1, 0], [0, (nx - 1) >> 1], [1, nx - 1]].map(([v, i]) => ({ ny: v, lut: D[i], closed: cf(v), delta: Math.abs(D[i] - cf(v)) }));
        // ORDER-LIGHT-12 item 2: the nine interior nodes of tools/render/fixtures/lighting-occlusion-check.json read back
        // from the BOUND texture's data (lighting-render-reads.py compares them with the fixture → occLut.interiorMaxDelta)
        const interior = [[16, 8], [40, 16], [8, 4], [56, 24], [2, 2], [60, 31], [24, 12], [48, 6], [12, 20]].map(([i, j]) => ({ i, j, bound: D[j * nx + i] }));
        const tp = r.properties.get(t); const uploaded = !!(tp && tp.__webglTexture);
        return { present: true, nx, ny, anchors: rows, maxDelta: Math.max(...rows.map((x) => x.delta)), boundBallPrograms: bound, interiorNodes: interior, textureUploaded: uploaded };
      } catch (e) { return { error: String(e) }; }
    })(),
    // ORDER-LIGHT-9 Q1 arm (moved balls): written by the shmove poke — live blocks vs live positions after a shot
    shMove: (window.__shMove && typeof window.__shMove === 'object') ? window.__shMove : null,
    gi: window.__gi ? (() => {
      const s = window.__gi.state || {};
      const pick = {};
      for (const k of ['ready', 'look', 'requestedLook', 'fits', 'fixture', 'baked', 'bakeClass', 'bakeFixture', 'gain', 'hemiBase', 'hemiDimmed', 'appliedSeq']) {
        if (s[k] !== undefined && (typeof s[k] !== 'object' || s[k] === null)) pick[k] = s[k];
      }
      pick.uGiOn = u('uGiOn'); pick.uGiIrr = u('uGiIrr'); pick.uGiScale = u('uGiScale'); pick.uGiShadow = u('uGiShadow');
      return pick;
    })() : null,
    ua: navigator.userAgent,
  };
})()`;

/** Mesh + material IDENTITY census (the fence instrument). Per mesh: name,
 * root child index (so table-owned vs room-owned can be classified without
 * touching app modules), matrixWorld, a 64-bit FNV-1a over the position /
 * normal / uv / index buffers, and a material identity record (class,
 * colour, emissive, roughness, metalness, envMapIntensity, clearcoat (+
 * roughness), sheen (+colour/roughness), transmission, ior, normalScale,
 * bumpScale, side, transparent, opacity, alphaTest, depthWrite,
 * flatShading, vertexColors, onBeforeCompile presence, customProgramCacheKey
 * string, and per texture slot a 32×32 content hash + size/repeat/wrap/
 * colourSpace). Texture uuids are never compared (per-session). */
// NOTE-CENSUS-SETTLE (fence-law addendum, 2026-09-09): the signature of EVERY geometry attribute's version + count (and the index, the
// groups, every material's version and its maps' versions) over the whole scene — the capture reads it until it has held still for
// ≥ 3 consecutive reads (cap 30 s, refused by name on the cap) BEFORE the census and the identity dump are taken: the baked-GI /
// occlusion apply lands in asynchronous stages after __test.ready (the ballreturn lane measured up to ~3.6 s), and a hash taken mid-stage
// reads differently per load.
export const ATTR_VERSION_SRC = `(() => {
  const sc = window.__dbg.scene; const geo = []; const mat = []; let meshes = 0, attrs = 0;
  const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
  sc.traverse((o) => {
    const g = o.geometry; if (!g) return; meshes++;
    const nm = (o.name || ('#' + o.id));
    const a = g.attributes || {};
    for (const k of Object.keys(a).sort()) { attrs++; geo.push(nm + '.' + k + ':' + a[k].version + ':' + a[k].count); }
    if (g.index) geo.push(nm + '.index:' + g.index.version + ':' + g.index.count);
    geo.push(nm + '.grp:' + (g.groups ? g.groups.map((gr) => gr.start + '/' + gr.count + '/' + gr.materialIndex).join(',') : ''));
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach((m, mi) => { if (!m) return; mat.push(nm + '.mat' + mi + ':' + m.version); for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'lightMap', 'emissiveMap', 'envMap', 'alphaMap']) { const t = m[key]; if (t) mat.push(nm + '.mat' + mi + '.' + key + ':' + t.version); } });
  });
  // the GEOMETRY signature is the stability criterion (the addendum's rule); the material / map version list is returned in full so the
  // capture can NAME what churns (a per-frame needsUpdate on a material bumps its version without moving its identity fields)
  return { sig: fnv(geo.join('|')).toString(16) + ':' + geo.length, matSig: fnv(mat.join('|')).toString(16) + ':' + mat.length, mat, meshes, attrs, t: Math.round(performance.now()) };
})()`;

/** ORDER-LIGHT-C2-FIX1 §L31 (land15 attempt 2 finding — the aOccl race): table.js bakes the snooker pocket-furniture transport attribute
 * (`aOccl`) asynchronously — cold traces drain through budgeted <= 12 ms idle slices and "while a part's job is pending the aOccl attribute is
 * simply ABSENT" (table.js, the _snkOcclPending drain). An identity dump therefore photographed whichever parts had landed by the settle:
 * main's baseline none, land14 one mesh (obPocketCap), land15 all eleven — three racy states of the SAME code, and the land15-vs-land14 fence
 * read the 10 added attributes as a geometry difference. table.js publishes the render-determinism seam `window.__snkOccl.flush()` (review
 * env-r13: "every pending trace lands and any pending corrective re-bake fires synchronously" — offline renders call it before frame 0);
 * the capture calls the SAME seam before its settle and before every dump. The record carries whether the seam existed, how long the flush
 * took and whether a corrective re-bake fired (venue.lastBakeAt before / after); the caller reads the attribute-version signature around it. */
export const SNK_OCCL_FLUSH_SRC = `(() => {
  const bakeAt = () => { try { const L = window.__lighting; const v = L && L.state && L.state().venue; return v ? (v.lastBakeAt || 0) : null; } catch (e) { return null; } };
  const b0 = bakeAt(); const seam = !!(window.__snkOccl && typeof window.__snkOccl.flush === 'function');
  const t0 = performance.now(); let err = null;
  if (seam) { try { window.__snkOccl.flush(); } catch (e) { err = String((e && e.stack) || e); } }
  const ms = Math.round(performance.now() - t0); const b1 = bakeAt();
  return { seam, ms, err, bakeBefore: b0, bakeAfter: b1, rebakeFired: b0 !== null && b1 !== null && b1 > b0 };
})()`;
export const IDENTITY_SRC = `(() => {
  const sc = window.__dbg.scene;
  const fnv = (bytes, h0) => {
    let h = h0 === undefined ? 0x811c9dc5 : h0;
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  };
  const hashArr = (ta) => {
    if (!ta) return null;
    const b = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength);
    // two lanes (full + odd bytes) so a 32-bit fnv is not the only witness
    let h1 = fnv(b);
    const odd = new Uint8Array(Math.floor(b.length / 2));
    for (let i = 0; i < odd.length; i++) odd[i] = b[i * 2 + 1];
    return (h1.toString(16) + ':' + fnv(odd).toString(16) + ':' + ta.length);
  };
  const num = (x) => (x === undefined || x === null) ? null : (typeof x === 'number' ? Number(x.toPrecision(7)) : x);
  const hex = (c) => c && c.getHexString ? '0x' + c.getHexString() : null;
  // ORDER-LAND-638-FIX (landing verifier condition a): texture content is read at FULL resolution — the earlier 32×32
  // drawImage resample was page-state dependent (three identical canvases hashed differently across boots while their
  // pixels were identical), so the identity hash and the albedo mean now come from every source pixel
  const fullCv = document.createElement('canvas'); const fullCx = fullCv.getContext('2d', { willReadFrequently: true });
  const fullPixels = (img) => {
    const w = img.width || img.videoWidth || img.naturalWidth, h = img.height || img.videoHeight || img.naturalHeight;
    if (!w || !h) return null;
    try { if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) { const c = img.getContext('2d'); if (c) return c.getImageData(0, 0, w, h).data; } } catch (e) {}
    fullCv.width = w; fullCv.height = h; fullCx.clearRect(0, 0, w, h); fullCx.drawImage(img, 0, 0, w, h);
    return fullCx.getImageData(0, 0, w, h).data;
  };
  // mean LINEAR luminance of a texture (sRGB decoded, every pixel) — the room-dressing albedo record
  const texMeanLin = (tex) => {
    try {
      const img = tex && tex.image;
      if (!img || !(img.width || img.videoWidth) || (img.data && !img.width)) return null;
      const d = fullPixels(img); if (!d) return null; let acc = 0, n = 0;
      const lin = (u) => { const c = u / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      for (let i = 0; i < d.length; i += 4) { acc += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); n++; }
      return n ? acc / n : null;
    } catch (e) { return null; }
  };
  const matStats = (m) => {
    if (!m || !m.color) return null;
    const c = m.color; const colY = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // three colours are linear
    const mapY = m.map ? texMeanLin(m.map) : null;
    return { colourY: num(colY), mapMeanY: mapY === null ? null : num(mapY), albedoY: num(mapY === null ? colY : colY * mapY) };
  };
  const texRec = (tex) => {
    if (!tex) return null;
    const rec = { kind: tex.constructor ? tex.constructor.name : 'Texture', name: tex.name || '', w: null, h: null, hash: null,
      repeat: tex.repeat ? [num(tex.repeat.x), num(tex.repeat.y)] : null,
      offset: tex.offset ? [num(tex.offset.x), num(tex.offset.y)] : null,
      wrap: [tex.wrapS, tex.wrapT], colorSpace: tex.colorSpace || null, flipY: tex.flipY,
      anisotropy: tex.anisotropy, minFilter: tex.minFilter, magFilter: tex.magFilter };
    try {
      const img = tex.image;
      if (img && img.data && img.width) {
        rec.w = img.width; rec.h = img.height;
        const d = img.data; const step = Math.max(1, Math.floor(d.length / 4096));
        const sub = new Uint8Array(Math.floor(d.length / step));
        for (let i = 0, k = 0; i < d.length && k < sub.length; i += step, k++) sub[k] = d[i] & 255;
        rec.hash = fnv(sub).toString(16); // the historical sampled-element hash (continuity field: dumps of earlier tags carry only this)
        // ORDER-LIGHT-C2-FIX6 class J (review r8 P2): d[i] AND 255 hashes a TRUNCATED element for half-float / float data textures (a half-float
        // 0x3800 -> 0x3c00 keeps its low byte 0x00: the fence could not see it). hashBytes = FNV-1a over EVERY byte of the element buffer
        // (a Uint8Array view over the underlying buffer, no sampling); elem = the element type, bytes = the buffer length — the fence judges
        // hashBytes where both sides carry it and names the type per data texture (J1 census).
        rec.elem = d && d.constructor ? d.constructor.name : null; rec.bytes = d && Number.isFinite(d.byteLength) ? d.byteLength : null;
        rec.hashBytes = (d && d.buffer) ? fnv(new Uint8Array(d.buffer, d.byteOffset || 0, d.byteLength)).toString(16) + ':' + d.byteLength : null;
      } else if (img && (img.width || img.videoWidth)) {
        rec.w = img.width || img.videoWidth; rec.h = img.height || img.videoHeight;
        const px = fullPixels(img); rec.hash = px ? fnv(px).toString(16) + ':' + px.length : null; rec.hashScope = 'full';
      } else if (Array.isArray(img)) { rec.kind = 'CubeTexture'; rec.hash = 'cube:' + img.length; }
      else if (tex.isRenderTargetTexture || (tex.image && tex.image.isRenderTargetTexture)) { rec.hash = 'rt'; }
    } catch (e) { rec.hash = 'err:' + String(e && e.message).slice(0, 40); }
    return rec;
  };
  const SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap', 'alphaMap',
    'clearcoatNormalMap', 'clearcoatMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap', 'specularIntensityMap', 'envMap', 'lightMap'];
  // ORDER-LAND-638-FIX4 verifier item 4: per-MATERIAL compiled-program witness — the same two-lane FNV-1a the record
  // already uses for the geometry buffers, over the GL vertex + fragment sources of the WebGLProgram the material
  // rendered with last (renderer.properties.get(material).currentProgram; three r17x WebGLProgram.vertexShader /
  // .fragmentShader are the WebGLShader handles, the sources stay readable after link — the Q1a programs census reads
  // them the same way). progKey = the program's cacheKey length. null when the material has no compiled program yet;
  // lighting-fence.py reads null / missing as a DIFFERENCE (fail closed). Cached per program id: one hash per program.
  const progCache = new Map(); let pgl = null, pprops = null;
  try { const pr = window.__dbg.renderer; pgl = pr.getContext(); pprops = pr.properties; } catch (e) {}
  const progWitness = (m) => {
    const none = { progHash: null, progKey: null };
    try {
      const mp = pprops && pprops.get(m); const prog = mp && mp.currentProgram;
      if (!prog || !pgl) return none;
      let w = progCache.get(prog.id);
      if (!w) {
        const vs = pgl.getShaderSource(prog.vertexShader) || '', fs = pgl.getShaderSource(prog.fragmentShader) || '';
        const src = vs + '\\n' + fs;
        w = { progHash: (vs || fs) ? hashArr(new TextEncoder().encode(src)) : null, progKey: typeof prog.cacheKey === 'string' ? prog.cacheKey.length : null };
        progCache.set(prog.id, w);
      }
      return w;
    } catch (e) { return none; }
  };
  const matRec = (m) => {
    if (!m) return null;
    const lin3 = (c) => c && c.isColor ? [num(c.r), num(c.g), num(c.b)] : null; // RAW linear floats (hex clamps at 1.0 — ORDER-LIGHT-5 R4)
    const rec = { cls: m.type, name: m.name || '', color: hex(m.color), colorLin: lin3(m.color), emissive: hex(m.emissive), emissiveLin: lin3(m.emissive), emissiveIntensity: num(m.emissiveIntensity),
      roughness: num(m.roughness), metalness: num(m.metalness), envMapIntensity: num(m.envMapIntensity),
      clearcoat: num(m.clearcoat), clearcoatRoughness: num(m.clearcoatRoughness),
      sheen: num(m.sheen), sheenColor: hex(m.sheenColor), sheenRoughness: num(m.sheenRoughness),
      transmission: num(m.transmission), ior: num(m.ior), specularIntensity: num(m.specularIntensity), specularColor: hex(m.specularColor),
      normalScale: m.normalScale ? [num(m.normalScale.x), num(m.normalScale.y)] : null, bumpScale: num(m.bumpScale),
      lightMapIntensity: num(m.lightMapIntensity), aoMapIntensity: num(m.aoMapIntensity),
      side: m.side, transparent: !!m.transparent, opacity: num(m.opacity), alphaTest: num(m.alphaTest), depthWrite: !!m.depthWrite, depthTest: !!m.depthTest,
      flatShading: !!m.flatShading, vertexColors: !!m.vertexColors, toneMapped: m.toneMapped !== false, blending: m.blending, polygonOffset: !!m.polygonOffset,
      obc: typeof m.onBeforeCompile === 'function' && m.onBeforeCompile !== Object.getPrototypeOf(m).onBeforeCompile,
      cacheKey: null, progHash: null, progKey: null, defines: m.defines ? JSON.stringify(m.defines) : null,
      userDataKeys: Object.keys(m.userData || {}).sort(),
      maps: {} };
    try { rec.cacheKey = typeof m.customProgramCacheKey === 'function' ? String(m.customProgramCacheKey()) : null; } catch (e) { rec.cacheKey = 'err'; }
    Object.assign(rec, progWitness(m)); // per-mesh compiled-program witness (ORDER-LAND-638-FIX4 verifier item 4)
    // ORDER-LIGHT-C2-FIX9 N6d (refuter law F7): the onBeforeCompile-INJECTED uniform VALUES a hooked material renders with — the venue fill's SH (6 dp, like the
    // LightProbe record), its gain and gate state, and gi.js's uGiOn / uGiBallOn — recorded on every material whose cache key carries the venue hook, so the
    // fence (which judges every non-program field of an unbaked record) covers the venue path's inputs, not only the display quantum
    try {
      if (rec.cacheKey && String(rec.cacheKey).includes('|venuefill')) {
        const LV = window.__lighting && typeof window.__lighting.state === 'function' ? window.__lighting.state() : null; const VV = LV && LV.venue ? LV.venue : null;
        const gu = window.__gi && window.__gi.uniforms; const gv = (k) => (gu && gu[k] && typeof gu[k].value === 'number') ? Number(gu[k].value.toFixed(6)) : null;
        // C2-FIX9 N6d amendment 1 (maintainer, land30's control pair): a key the web CANNOT report is ABSENT from the record — never written as null — so
        // the fence can tell "the frozen control web predates the field" (absent) from "the new web stopped injecting" (missing or null on the B side: a fail)
        const inj = {};
        if (VV && Array.isArray(VV.sh)) inj.venueSh = VV.sh.map((x) => Number(Number(x).toFixed(6)));
        if (VV && typeof VV.gain === 'number') inj.venueGain = VV.gain;
        if (VV && typeof VV.studioGated === 'boolean') inj.venueGated = VV.studioGated ? 1 : 0;
        if (VV && typeof VV.uniformL1 === 'number') inj.venueUniformL1 = VV.uniformL1;
        if (gv('uGiOn') !== null) inj.uGiOn = gv('uGiOn');
        // ORDER-LIGHT-C2-FIX10 class Z (review r10 P2; the maintainer's erratum on N6d amendment 1): uGiBallOn is a PER-MATERIAL uniform bound from
        // material.userData.giBallOn (shading.js:2451 / :2463) — it is never on the shared window.__gi.uniforms, so gv('uGiBallOn') had always read null
        // and, under amendment 1, the key was never written and its absence was certified lawful. Read it where it lives. Seams (arm-only; refused as
        // shipped flags by run-gate): ?identityGiBall=0 sets giBallOn.value 0 on the live page before the dump (the giball arm: the record MUST move and the
        // fence MUST red); ?identityDropKey=<key> breaks that key's reader in memory (the absentkey arm: the fence MUST red naming the key).
        const _q = (() => { try { return new URLSearchParams(location.search); } catch (e) { return null; } })();
        const dropKey = _q && _q.get('identityDropKey') || '';
        const readerMode = _q && _q.get('identityGiBallReader') === 'legacy' ? 'legacy' : 'material';  // the giballreader arm: the pre-FIX10 gv() reader
        if (_q && _q.get('identityGiBall') === '0' && m.userData && m.userData.giBallOn && typeof m.userData.giBallOn.value === 'number') m.userData.giBallOn.value = 0;
        if (readerMode === 'legacy') { if (gv('uGiBallOn') !== null) inj.uGiBallOn = gv('uGiBallOn'); }
        else if (m.userData && m.userData.giBallOn && typeof m.userData.giBallOn.value === 'number') inj.uGiBallOn = Number(Number(m.userData.giBallOn.value).toFixed(6));
        if (dropKey && Object.prototype.hasOwnProperty.call(inj, dropKey)) delete inj[dropKey];
        rec.injected = inj;
      }
    } catch (e) { rec.injected = { error: String(e && e.message || e).slice(0, 80) }; }
    for (const s of SLOTS) if (m[s]) rec.maps[s] = texRec(m[s]);
    if (m.uniforms) { // ShaderMaterial: hash the numeric uniforms
      const u = {}; for (const [k, v] of Object.entries(m.uniforms)) {
        const val = v && v.value; if (typeof val === 'number') u[k] = num(val);
        else if (val && val.isColor) u[k] = hex(val); else if (val && val.isVector2) u[k] = [num(val.x), num(val.y)];
        else if (val && val.isVector3) u[k] = [num(val.x), num(val.y), num(val.z)]; else if (val && val.isTexture) u[k] = texRec(val);
      }
      rec.uniforms = u;
    }
    return rec;
  };
  const meshes = [];
  const roots = sc.children;
  roots.forEach((root, ri) => {
    let order = 0;
    root.traverse((o) => {
      if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite) return;
      const g = o.geometry;
      const pos = g && g.attributes && g.attributes.position;
      const rec = { root: ri, order: order++, name: o.name || '', parent: (o.parent && o.parent.name) || '', type: o.type,
        visible: o.visible, renderOrder: o.renderOrder, frustumCulled: o.frustumCulled, castShadow: o.castShadow, receiveShadow: o.receiveShadow,
        matrixWorld: Array.from(o.matrixWorld.elements, (x) => Number(x.toFixed(6))),
        geoType: g ? g.type : null, verts: pos ? pos.count : 0, tris: g ? (g.index ? g.index.count / 3 : (pos ? pos.count / 3 : 0)) : 0,
        posHash: pos ? hashArr(pos.array) : null, nrmHash: g && g.attributes.normal ? hashArr(g.attributes.normal.array) : null,
        uvHash: g && g.attributes.uv ? hashArr(g.attributes.uv.array) : null, idxHash: g && g.index ? hashArr(g.index.array) : null,
        colHash: g && g.attributes.color ? hashArr(g.attributes.color.array) : null,
        groups: g && g.groups ? g.groups.length : 0,
        // NOTE-FENCE-NORMALS (fence-law addendum, 2026-09-09): EVERY attribute the renderer reads, by name — positions, normals, uv / uv1 / uv2,
        // tangents, colors, skin / instance attributes, whatever the geometry carries — each as hash:itemSize:count[:normalized]; plus the
        // groups (start / count / materialIndex), the morph attributes and the draw range. The named hashes above stay for the pre-addendum
        // comparators; the fence judges attrHashes wherever both sides carry it (SCHEMA_ADDED) and arms every attribute it finds.
        attrHashes: g && g.attributes ? Object.fromEntries(Object.keys(g.attributes).sort().map((k) => { const a = g.attributes[k]; return [k, hashArr(a.array) + ':' + a.itemSize + ':' + a.count + (a.normalized ? ':n' : '')]; })) : null,
        grpHash: g ? (g.groups && g.groups.length ? hashArr(Float64Array.from(g.groups.flatMap((gr) => [gr.start, gr.count, gr.materialIndex ?? 0]))) : 'none') : null,
        morphHash: (g && g.morphAttributes && Object.keys(g.morphAttributes).length) ? Object.keys(g.morphAttributes).sort().map((k) => k + ':' + g.morphAttributes[k].map((a) => hashArr(a.array)).join(',')).join(';') : (g ? 'none' : null),
        drawRange: g ? [g.drawRange.start, Number.isFinite(g.drawRange.count) ? g.drawRange.count : -1] : null,
        matCount: Array.isArray(o.material) ? o.material.length : 1,
        material: Array.isArray(o.material) ? o.material.map(matRec) : matRec(o.material),
        // OUTSIDE the identity record on purpose (lighting-fence.py ignores it): the dressing albedo ledger
        matStats: Array.isArray(o.material) ? o.material.map(matStats) : matStats(o.material) };
      meshes.push(rec);
    });
  });
  const rootSig = roots.map((r, i) => {
    let n = 0, hasFar = false, hasCloth = false;
    r.traverse((o) => { if (o.isMesh) n++; if (o.name === 'obFarPropTable') hasFar = true; });
    return { i, name: r.name || '', type: r.type, meshes: n, isRoom: hasFar };
  });
  return { roots: rootSig, meshes };
})()`;
