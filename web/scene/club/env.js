// Copyright (c) Meta Platforms, Inc. and affiliates.

// env.js — the reflection service of the club look (CONTRACT.md sections 4.1 and 8.4). Owner: integrator (CONTRACT.md section 9).
//
// The app keeps ONE environment cube: 512 px, half float, rendered by a CubeCamera from just above the middle of the cloth,
// bound as scene.environment, re-rendered through main.js's rebakeEnv (one bake at once, then a short tail of bakes, one per
// delivered frame, that walks the cube to its fixed point). This service does not add a cube and does not own that
// scheduler. It owns four things around it:
//   1. WHEN the cube is re-captured for the club look's own reasons (capture(reason): coalesced, parked through a studio
//      window). The app keeps making its own bakes on its own events; club/index.js asks for one capture after its refresh
//      pass; this service adds captures only for what nobody else sees (club textures that land late, a late lightmap);
//   2. WHAT is left out of every cube render (exclude(object3d));
//   3. WHERE a flat glossy surface looks the cube up (clubEnvDir, env/glsl.js), patched into the rail wood, the apron and
//      the club floor through club.adopt.patch;
//   4. the floor's planar mirror on the high tier (env/mirror.js): the one extra scene render of the look, at half
//      resolution, of a reduced scene, on frames that show the floor;
//   5. the ambient cube (`env.ambient`, every tier): the room's light on a diffuse surface of the table WITHOUT the main
//      lamp's own light face, as six uniform colours. The cube above holds the lamp's emitting face, so a diffuse surface
//      that reads the cube's irradiance is lit by the lamp twice (once by the app's rectangular light, once more through the
//      cube, with no falloff). After each bake of the cube this service takes one more picture from the same point into a
//      32 px cube of its own with the lamp's light face, the main table's cloth, the balls and the cue hidden, reads it back
//      once (six small faces; never per frame) and writes the cosine-weighted mean radiance of the six axis hemispheres into
//      one shared uniform array. No sampler, no patch, nothing changes for the surfaces that reflect the cube.
// A camera move changes nothing here except the mirror picture: no pose change makes a capture.
// Everything it reads from the app is feature-detected; a missing piece turns that part off and is listed in state().
import * as THREE from 'three';
import { ENV_GLSL, ENV_VARYING, envApply } from './env/glsl.js';
import { createMirror } from './env/mirror.js';
import { envConfig, hallRailWanted, hallEnvWanted } from './env/config.js';
import { hemisphereMeans, AMBIENT_GLSL } from './env/ambient.js';
import { isArena, venueKnobsOf } from './tiers.js';

const PATCH_VERSION = 1;
const CAPTURE_DEBOUNCE_MS = 120;   // the app's own debounce for a public re-bake request
const CLOSE_DEBOUNCE_MS = 450;     // after a studio window closes (club/index.js runs its parked refresh pass 250 ms after the close)
const LOAD_HOLD_MS = 4000;         // lite tier: the longest the one capture at load waits for the club textures
const BED_Y = 0;                   // CONTRACT.md section 1: the bed plane
const AMBIENT_SIZE = 32;           // face size of the ambient capture, px (6 x 32 x 32 texels are read back once per capture)
const AMBIENT_WAIT_FRAMES = 12;    // without the app's tail counter: frames after the last bake seen before the ambient is re-made
const AMBIENT_MAX = 64;            // a radiance above this in the ambient capture is clamped (one hot texel must not own a hemisphere)
// radiance of the table's shaded sides and underside as the floor mirrors them on tiers without the planar mirror: the apron
// albedo times this much of a unit white (the under-table light level; judged against the planar mirror on the dev page)
const TABLE_SHADE = 0.05;
// The floor's varnish (env/glsl.js ENV_COAT_CODE; the lobe that mirrors the room in a plank floor whose wood is rough): its
// strength and roughness are tier knobs, read through env/config.js together with the `?clubenv=` tool override.

export async function createEnv(club) {
  const ctx = club?.ctx ?? {};
  const { renderer, scene } = ctx;
  if (!renderer || !scene?.isScene) return { enabled: false, reason: 'no renderer or scene in ctx' };
  if (typeof ctx.rebakeEnv !== 'function') return { enabled: false, reason: 'ctx.rebakeEnv is missing' };
  const cfg = envConfig(club.knobs ?? {}, ctx.query);
  // the knob names the rest of this file reads, after the override
  const knobs = { envBox: cfg.box, envLive: cfg.live, floorMirror: cfg.mirror };
  // Round A1 (CONTRACT.md 13.6): a venue whose floor is matt (the arena's carpet). The floor patch of this service is a
  // wooden floor's: the box-projected gloss, the varnish lobe, the table's shaded underside in that gloss and, on the high
  // tier, the planar mirror. None of it belongs on a carpet, so under such a venue the floor material is not adopted and the
  // mirror is not built (the high tier then makes no extra scene render). The room box, the capture policy, the ambient cube
  // and the patches on the rail wood and the apron are the same in every venue. Under the club venue `mattFloor` is false
  // and nothing below takes another path.
  let mattFloor = false;
  try { mattFloor = isArena(club) && venueKnobsOf(club)?.floor !== 'wood'; } catch { mattFloor = false; }
  const win = typeof window !== 'undefined' ? window : null;
  const notes = [];           // what was feature-detected away, once each
  const note = (s) => { if (!notes.includes(s)) notes.push(s); };

  // ---- shared uniforms -------------------------------------------------------------------------------------------------
  const box = { min: new THREE.Vector3(-4.5, -0.79, -3.0), max: new THREE.Vector3(4.5, 2.45, 3.0), center: new THREE.Vector3() };
  const uniforms = {
    uClubEnvBoxMin: { value: box.min },
    uClubEnvBoxMax: { value: box.max },
    uClubEnvPos: { value: new THREE.Vector3(0, 0.115, 0) },
    uClubEnvMix: { value: 1 },
    uClubEnvLamp: { value: new THREE.Vector4(0, 0, 1, 0.3) },
    uClubEnvLampY: { value: new THREE.Vector4(1, 0, 0.0, 0.15) },
    uClubEnvRim: { value: new THREE.Vector4(1.5, 0.85, 0.05, 0) },
    uClubEnvBed: { value: new THREE.Vector4(1.3, 0.67, BED_Y, 0) },
    uClubEnvTableC: { value: new THREE.Vector2(0, 0) },
  };
  const floorUniforms = {
    uClubEnvTableMin: { value: new THREE.Vector3(-1.5, -0.3, -0.85) },
    uClubEnvTableMax: { value: new THREE.Vector3(1.5, 0.05, 0.85) },
    uClubEnvTableTint: { value: new THREE.Vector4(0.01, 0.008, 0.006, 0) },
    uClubEnvCoat: { value: new THREE.Vector4(cfg.coat, cfg.coatRoughness, cfg.coatFollow, 0) },
  };
  const stats = {
    captures: 0, bakesAsked: 0, parked: 0, coalesced: 0, reasons: [], bakesSeen: 0, cubeFaces: 0, excludedFromCube: 0, excludedFromMirror: 0, excludedFromAmbient: 0, lastError: null,
    posFrom: 'default', boxFrom: 'fallback', lampFrom: 'none', table: 'none',
  };

  // ---- the room box ----------------------------------------------------------------------------------------------------
  function refreshBox() {
    const b = club.room?.enabled === true ? club.room.box : null;
    if (b?.min?.isVector3 && b?.max?.isVector3) {
      box.min.copy(b.min); box.max.copy(b.max); stats.boxFrom = 'club.room.box';
    } else {
      // the app room: 9 x 6 m, floor to ceiling 3.24 m; only the floor height is live (room.js reseats it per table)
      const fy = ctx.room?.giRefs?.floor?.position?.y;
      box.min.set(-4.5, Number.isFinite(fy) ? fy : -0.79, -3.0);
      box.max.set(4.5, 2.45, 3.0);
      stats.boxFrom = 'fallback';
    }
    box.center.addVectors(box.min, box.max).multiplyScalar(0.5);
  }

  // ---- the lamp footprint ------------------------------------------------------------------------------------------------
  // The app maintains the emitter rectangle(s) in its shared shading uniforms (shading.js setEmitters). Those objects are not
  // exported to this look, but every app-patched material carries them in its compile-time uniform map, where the compile tap
  // below picks them up (the same live objects, never a copy of the numbers).
  let sharedU = null;
  const tmpBox = new THREE.Box3();
  function refreshLamp() {
    const lamp = uniforms.uClubEnvLamp.value, ly = uniforms.uClubEnvLampY.value;
    const one = sharedU?.uLightPos?.value, half = sharedU?.uLightHalf?.value;
    if (one?.isVector3 && half) {
      const n = Math.max(1, Math.min(Number(sharedU.uLightCount?.value) || 1, sharedU.uLightPosN?.value?.length ?? 1));
      if (n > 1 && Array.isArray(sharedU.uLightHalfN?.value)) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y = 0;
        for (let i = 0; i < n; i++) {
          const p = sharedU.uLightPosN.value[i], h = sharedU.uLightHalfN.value[i] ?? half;
          x0 = Math.min(x0, p.x - h.x); x1 = Math.max(x1, p.x + h.x);
          z0 = Math.min(z0, p.z - h.y); z1 = Math.max(z1, p.z + h.y); y += p.y / n;
        }
        lamp.set((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2); ly.x = y;
      } else {
        lamp.set(one.x, one.z, half.x, half.y); ly.x = one.y;
      }
      ly.y = 1; stats.lampFrom = 'shared emitter uniforms';
      return;
    }
    const face = ctx.room?.lightRefs?.lampFace;
    if (face?.isObject3D && shown(face)) {
      tmpBox.setFromObject(face);
      if (!tmpBox.isEmpty()) {
        lamp.set((tmpBox.min.x + tmpBox.max.x) / 2, (tmpBox.min.z + tmpBox.max.z) / 2,
          (tmpBox.max.x - tmpBox.min.x) / 2, (tmpBox.max.z - tmpBox.min.z) / 2);
        ly.x = tmpBox.min.y; ly.y = 1; stats.lampFrom = 'room.lightRefs.lampFace';
        return;
      }
    }
    ly.y = 0; stats.lampFrom = 'none';
  }

  // ---- the table, from the scene graph -----------------------------------------------------------------------------------
  function shown(o) { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; }
  let tableDirty = true, bellyOn = false, mirrorLeftOut = 0;
  const clothMeshes = []; // the cloth's meshes, as of the last table scan (left out of the mirror picture)
  function refreshTable() {
    tableDirty = false;
    clothMeshes.length = 0;
    const cloth = new THREE.Box3(), wood = new THREE.Box3(), apron = new THREE.Box3();
    const floorY = box.min.y;
    let apronColor = null;
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      let cls = null, mat = null;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const c = m?.userData?.obClass;
        if (c === 'cloth' || c === 'railwood' || c === 'apron') { cls = c; mat = m; break; }
      }
      if (!cls || !shown(o)) return;
      tmpBox.setFromObject(o);
      if (tmpBox.isEmpty()) return;
      if (cls === 'cloth') { cloth.union(tmpBox); clothMeshes.push(o); }
      else if (cls === 'railwood') wood.union(tmpBox);
      else {
        if (!apronColor && mat.color?.isColor) apronColor = mat.color;
        if (tmpBox.min.y > floorY + 0.12) apron.union(tmpBox); // a part that reaches the floor is a leg, not the body
      }
    });
    const top = new THREE.Box3().union(cloth).union(wood);
    const rim = uniforms.uClubEnvRim.value, bed = uniforms.uClubEnvBed.value, tint = floorUniforms.uClubEnvTableTint.value;
    if (top.isEmpty()) { rim.w = 0; bed.w = 0; tint.w = 0; stats.table = 'none'; bellyOn = false; return; }
    const body = top.clone().union(apron);
    const cx = (body.min.x + body.max.x) / 2, cz = (body.min.z + body.max.z) / 2;
    uniforms.uClubEnvTableC.value.set(cx, cz);
    // the outline the capture point looks over: the body's plan, a little proud so a lookup clears the rail edge
    rim.set((body.max.x - body.min.x) / 2 + 0.03, (body.max.z - body.min.z) / 2 + 0.03, top.max.y + 0.006, 1);
    if (cloth.isEmpty()) bed.w = 0;
    else bed.set((cloth.max.x - cloth.min.x) / 2, (cloth.max.z - cloth.min.z) / 2, BED_Y, 1);
    floorUniforms.uClubEnvTableMin.value.set(body.min.x, apron.isEmpty() ? top.max.y - 0.3 : body.min.y, body.min.z);
    floorUniforms.uClubEnvTableMax.value.set(body.max.x, top.max.y, body.max.z);
    if (apronColor) tint.set(apronColor.r * TABLE_SHADE, apronColor.g * TABLE_SHADE, apronColor.b * TABLE_SHADE, 1);
    else tint.set(0.006, 0.005, 0.004, 1);
    stats.table = apron.isEmpty() ? 'top only' : 'body';
    if (belly) {
      // a little inside the real body, so the table's own faces win the depth test wherever they exist
      const lo = floorUniforms.uClubEnvTableMin.value, hi = floorUniforms.uClubEnvTableMax.value, inset = 0.012;
      belly.scale.set(Math.max(0.01, hi.x - lo.x - 2 * inset), Math.max(0.01, hi.y - lo.y - 0.05), Math.max(0.01, hi.z - lo.z - 2 * inset));
      belly.position.set((lo.x + hi.x) / 2, (lo.y + hi.y) / 2 - 0.02, (lo.z + hi.z) / 2);
      belly.material.color.setRGB(tint.x, tint.y, tint.z);
      belly.updateMatrixWorld(true);
      bellyOn = true;
    }
  }

  // ---- what stays out of the cube (and out of the mirror) --------------------------------------------------------------------
  const excluded = new Map(); // object3d -> { cube: boolean, mirror: boolean, ambient: boolean }
  /**
   * Leave an object out of this service's pictures. Default: out of every cube render (and so out of the ambient capture) and
   * out of the mirror picture. `{ mirror: false }` keeps it in the mirror; `{ cube: false, mirror: false }` leaves it out of the
   * ambient capture only (a light face of the main lamp that the service does not find by itself: see lampLightFaces).
   * Returns the function that undoes it.
   */
  function exclude(object3d, { cube: fromCube = true, mirror: fromMirror = true, ambient: fromAmbient = true } = {}) {
    if (!object3d?.isObject3D) return () => {};
    excluded.set(object3d, { cube: fromCube !== false, mirror: fromMirror !== false, ambient: fromAmbient !== false || fromCube !== false });
    return () => { excluded.delete(object3d); };
  }
  const hideStack = []; // one entry per render in flight: the objects this service hid for it
  function hideFor(kind) {
    const hidden = [];
    for (const [o, opt] of excluded) {
      if (kind === 'mirror' ? !opt.mirror : kind === 'ambient' ? !opt.ambient : !opt.cube) continue;
      if (o.visible) { o.visible = false; hidden.push(o); }
    }
    if (hidden.length) { if (kind === 'mirror') stats.excludedFromMirror += hidden.length; else if (kind === 'ambient') stats.excludedFromAmbient += hidden.length; else stats.excludedFromCube += hidden.length; }
    return hidden;
  }
  function unhide(hidden) { if (hidden) for (const o of hidden) o.visible = true; }

  // ---- the planar floor mirror (high tier) ---------------------------------------------------------------------------------
  let mirror = null, mirrorState = 'off', belly = null;
  const mirrorApi = { texture: null, matrix: null, enabled: false };
  if (mattFloor) mirrorState = 'off (a matt floor: this venue has no floor mirror)';
  else if (knobs.floorMirror === true && knobs.envBox === true) {
    try {
      mirror = createMirror({ scale: cfg.mirrorScale });
      mirrorApi.texture = mirror.texture; mirrorApi.matrix = mirror.matrix;
      // The app's table is open underneath (nothing sees it from below in play), so a picture taken from under the floor
      // shows the lamp through it. A plain dark box the size of the table body, drawn ONLY in the mirror picture, closes it.
      belly = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, name: 'club.env.tableBody' }));
      belly.name = 'clubEnvTableBody'; belly.visible = false; belly.matrixAutoUpdate = true;
      scene.add(belly);
      mirrorState = 'waiting for the floor';
    } catch (e) { mirror = null; mirrorState = 'failed: ' + (e?.message ?? e); }
  }
  let floorMesh = null, floorMat = null, frameId = 0, toolMirrorOff = false;
  const lastMirror = { frame: -1, cam: new Float64Array(32) }; // doubles: the matrices are compared for equality
  const frustum = new THREE.Frustum(), projScreen = new THREE.Matrix4(), floorBox = new THREE.Box3();
  function mirrorWanted(cam) {
    if (mirror && toolMirrorOff) { mirror.uniforms.uClubMirrorParams.value.x = 0; return false; }
    if (!mirror || !mirrorApi.enabled || !floorMesh || scene.overrideMaterial || !cam?.isPerspectiveCamera) return false;
    if (!shown(floorMesh)) return false;
    floorBox.setFromObject(floorMesh);
    projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreen);
    if (!frustum.intersectsBox(floorBox)) return false;
    // one mirror picture per camera pose per frame, however many passes draw the scene with it
    const a = cam.matrixWorld.elements, b = cam.projectionMatrix.elements, last = lastMirror.cam;
    let same = lastMirror.frame === frameId;
    for (let i = 0; i < 16 && same; i++) if (last[i] !== a[i] || last[16 + i] !== b[i]) same = false;
    if (same) return false;
    for (let i = 0; i < 16; i++) { last[i] = a[i]; last[16 + i] = b[i]; }
    lastMirror.frame = frameId;
    return true;
  }

  // ---- live capture (a tool knob): the cue in the cube ---------------------------------------------------------------------
  // OFF on every tier (tiers.js `envLive`; `?clubenv=live:1` turns it on for a tool): the cube is captured from one point
  // over the middle of the cloth, so a cue in it lands at the wrong place on every surface away from that point, and a full
  // cycle changes a still picture 6 to 11 frames after the pose that started it.
  // The app bakes the cube with the balls, the cue and the aim overlays hidden (main.js bakeEnvOnce). With the knob on, this
  // service re-renders the cube ONE face per delivered frame while the cue moves, with the cue in and the balls and overlays
  // still out (a ball in the cube would be mirrored by itself, and the balls already mirror each other analytically in the
  // app's shader), then asks three for one prefilter pass per full cycle. It idles when the cue is still, never runs inside a
  // studio window or while the app's own tail of bakes is running, and re-adds the cue once after an app bake dropped it.
  const live = {
    on: knobs.envLive === true, rendering: false, face: 0, owed: 0, faces: 0, cycles: 0, sig: NaN, bakesAt: 0,
    nodes: null, nodesAt: -1e9, error: null,
  };
  function dynamicNodes() { // every node the app names obCueStick, and its aim overlays (obAim*); re-read every 90 frames
    if (!live.nodes || frameId - live.nodesAt > 90) {
      const cue = [], aim = [];
      scene.traverse((o) => { const n = o.name || ''; if (n === 'obCueStick') cue.push(o); else if (n.startsWith('obAim')) aim.push(o); });
      live.nodes = { cue, aim }; live.nodesAt = frameId;
    }
    return live.nodes;
  }
  function cueSignature() {
    let h = 0, any = false;
    for (const o of dynamicNodes().cue) {
      if (!shown(o)) continue;
      const e = o.matrixWorld.elements; any = true;
      h += e[12] * 5.1 + e[13] * 7.3 + e[14] * 11.9 + e[8] * 13.7 + e[9] * 17.1 + e[10] * 19.3;
    }
    return any ? h : NaN;
  }
  function liveFace() {
    const { cam, rt } = envCube;
    const hidden = [];
    const balls = ctx.game?.ballSet?.balls;
    if (Array.isArray(balls)) for (const b of balls) { const m = b?.mesh; if (m?.visible) { m.visible = false; hidden.push(m); } }
    for (const o of dynamicNodes().aim) if (o.visible) { o.visible = false; hidden.push(o); }
    let restoreFade = null;
    try { restoreFade = win?.__lampfade?.suspendForBake?.() ?? null; } catch { restoreFade = null; }
    const prevRT = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const xr = renderer.xr.enabled, autoClear = renderer.autoClear, gen = rt.texture.generateMipmaps;
    live.rendering = true;
    try {
      renderer.xr.enabled = false; renderer.autoClear = true;
      rt.texture.generateMipmaps = live.face === 5 ? gen : false; // as CubeCamera.update: mips with the last face
      cam.updateMatrixWorld(true);
      renderer.setRenderTarget(rt, live.face, cam.activeMipmapLevel ?? 0);
      renderer.render(scene, cam.children[live.face]);
    } finally {
      live.rendering = false;
      rt.texture.generateMipmaps = gen;
      renderer.xr.enabled = xr; renderer.autoClear = autoClear;
      renderer.setRenderTarget(prevRT, face, mip);
      for (const o of hidden) o.visible = true;
      try { if (typeof restoreFade === 'function') restoreFade(); } catch { /* the fade keeps its state */ }
    }
    live.faces += 1;
    live.face = (live.face + 1) % 6;
    if (live.face === 0) { rt.texture.needsPMREMUpdate = true; live.cycles += 1; }
  }
  function liveStep() {
    if (!live.on || live.error || hookError || !envCube || envCube.cam?.children?.length !== 6) return;
    if (win?.__cinelight === true || pending) return;
    let tailLeft = 0;
    try { tailLeft = Number(win?.__rebakeEnv?.tail?.()?.left) || 0; } catch { tailLeft = 0; }
    if (tailLeft > 0) return; // the app is walking the cube to its fixed point: wait for it
    const sig = cueSignature();
    const moved = !(sig === live.sig || (Number.isNaN(sig) && Number.isNaN(live.sig)));
    live.sig = sig;
    // a full cycle after the last change, so every face holds the same pose; one cycle after an app bake dropped the cue
    if (moved) live.owed = 6 + ((6 - live.face) % 6);
    if (live.bakesAt !== stats.bakesSeen) { live.bakesAt = stats.bakesSeen; if (!Number.isNaN(sig)) live.owed = Math.max(live.owed, 6 + ((6 - live.face) % 6)); }
    if (live.owed <= 0) return;
    try { liveFace(); live.owed -= 1; } catch (e) {
      live.error = String(e?.message ?? e);
      console.warn('[club] env: live capture failed and is off — the cube keeps the app\'s bakes:', e);
    }
  }

  // ---- the ambient cube: the room's light without the lamp's own face, as six uniform colours ------------------------------
  // uClubEnvAmb[i], i = +x, -x, +y, -y, +z, -z (world axes): the cosine-weighted mean radiance (scene-linear RGB, the cube's
  // own units) that arrives at the capture point in the hemisphere around axis i. A diffuse surface with world normal n takes
  //   E(n) = PI * sum_i max(+-n_i, 0)^2 * uClubEnvAmb[i]
  // in place of the cube's irradiance. Left out of the picture the values are made from: the main lamp's light faces
  // (lampLightFaces below: the app's rectangular light already delivers that light), the main table's cloth (a bed does not
  // light itself), the balls, the cue and the aim overlays (as in the app's own bakes), and everything registered through
  // exclude(). Made in the task of every capture this service asks for (so the first frame of the look has it), and once
  // more when the app's tail of bakes has ended; never per frame, never inside a studio window. Until the first values
  // exist `enabled` is false and a consumer stays on its own fallback.
  const ambient = {
    enabled: false, reason: cfg.ambient ? 'no capture yet' : 'off (?clubenv=amb:0)',
    uniforms: { uClubEnvAmb: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3()) } },
    glsl: AMBIENT_GLSL, // declares the uniform and: vec3 clubEnvAmbient( vec3 worldNormal ) -> irradiance
    serial: 0,
    excludes: { lamp: true, cloth: true, balls: true, cue: true },
  };
  const amb = { on: cfg.ambient === true, rendering: false, rt: null, cam: null, bufs: null, passes: 0, faces: 0, ms: 0, bakesAt: -1, seenAt: 0, lampFaces: 0, lampFaceNames: [], hidden: 0, why: null, error: null, keepLamp: false, pinned: false };
  const lampBox = new THREE.Box3();
  /**
   * The light faces of the main table's luminaire as a cube render sees them. Since round 2 the club luminaire shows a
   * cube the APP's own emitting faces (room/lamp.js: the canopy's face, or the unlit meshes of the active fixture) and
   * hides its own diffuser there; with `?clublampcube=own`, or when the app's faces are gone, its own face stands in. All
   * of them are left out: the app's canopy face, every unlit (basic) mesh of the active fixture, and the club luminaire's
   * emitting surface on the emitter rectangle (by its name, or by what it is: an unlit mesh, thin in height, at the height
   * of the emitter plane, inside the rectangle). The shade, its metal and the glass band stay in the picture.
   * The list is taken twice: before the render (after the app's lamp fade was suspended, which is what shows the app's
   * face to a bake), and again inside every face render at hook time (onBefore), after the luminaire's own hook made its
   * swap. Measured in the app: with the face left in, the upper hemisphere holds 2.68; without it, 0.04.
   */
  function lampLightFaces() {
    const out = [];
    const ly = uniforms.uClubEnvLampY.value, rect = uniforms.uClubEnvLamp.value;
    const onPlane = (o) => {
      if (!o?.isMesh || !o.visible) return false;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m?.isMeshBasicMaterial) return false;
      if (o.name === 'clubLamp.face') return true; // the club luminaire's own name for it (room/lamp.js)
      if (!(ly.y > 0.5)) return false;
      lampBox.setFromObject(o);
      if (lampBox.isEmpty()) return false;
      const cy = (lampBox.min.y + lampBox.max.y) / 2, cx = (lampBox.min.x + lampBox.max.x) / 2, cz = (lampBox.min.z + lampBox.max.z) / 2;
      return lampBox.max.y - lampBox.min.y < 0.06 && Math.abs(cy - ly.x) < 0.1 && Math.abs(cx - rect.x) < rect.z + 0.1 && Math.abs(cz - rect.y) < rect.w + 0.1;
    };
    try {
      const lampApi = club.room?.enabled === true ? club.room.parts?.lamp : null;
      for (const o of lampApi?.emissives ?? []) if (onPlane(o)) out.push(o);
      const face = ctx.room?.lightRefs?.lampFace;
      if (face?.isMesh && face.visible && !out.includes(face)) out.push(face);
      const fx = win?.__lighting?.fixtureMeshes?.();
      if (Array.isArray(fx)) {
        for (const o of fx) {
          const m = Array.isArray(o?.material) ? o.material[0] : o?.material;
          if (o?.isMesh && o.visible && m?.isMeshBasicMaterial && !out.includes(o)) out.push(o);
        }
      }
    } catch { /* an unreadable luminaire: what was found so far */ }
    return out;
  }
  const noteLampFace = (o) => { const n = o.name || o.type; if (!amb.lampFaceNames.includes(n)) amb.lampFaceNames.push(n); };
  function ambientPass(why) {
    if (!amb.on || amb.error || hookError || amb.rendering) return false;
    if (win?.__cinelight === true) return false; // a studio window owns the lights: the close re-bakes, and that bake is seen
    if (typeof renderer.readRenderTargetPixels !== 'function' || typeof renderer.getRenderTarget !== 'function') {
      amb.on = false; ambient.reason = 'the renderer cannot read a target back';
      return false;
    }
    const t0 = (() => { try { return performance.now(); } catch { return 0; } })();
    const hidden = [];
    const hide = (o) => { if (o?.isObject3D && o.visible) { o.visible = false; hidden.push(o); } };
    let restoreFade = null, saved = null;
    try {
      saved = { rt: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(), autoClear: renderer.autoClear };
      if (!amb.rt) {
        amb.rt = new THREE.WebGLCubeRenderTarget(AMBIENT_SIZE, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
        amb.rt.texture.name = 'club-env-ambient';
        const src = envCube?.cam?.children?.[0];
        amb.cam = new THREE.CubeCamera(Number(src?.near) > 0 ? src.near : 0.05, Number(src?.far) > 0 ? src.far : 60, amb.rt);
        amb.bufs = [0, 1, 2, 3, 4, 5].map(() => new Uint16Array(AMBIENT_SIZE * AMBIENT_SIZE * 4));
      }
      amb.cam.position.copy(uniforms.uClubEnvPos.value);
      amb.cam.updateMatrixWorld(true);
      // as the app's own bake: its camera fade of the luminaire is suspended for the capture. FIRST, because that is what
      // makes the app's light face visible again (a camera that looks down through the lamp has it faded out and hidden),
      // and the list of light faces below takes what is visible.
      try { restoreFade = win?.__lampfade?.suspendForBake?.() ?? null; } catch { restoreFade = null; }
      const faces = amb.keepLamp ? [] : lampLightFaces(); // keepLamp: a tool's "what the cube holds" reference (tool.ambient)
      amb.lampFaceNames = [];
      for (const o of faces) { hide(o); noteLampFace(o); }
      refreshTable(); // the cloth meshes as they stand now (a scan of the scene: small beside six renders of it)
      for (const o of clothMeshes) hide(o);
      const balls = ctx.game?.ballSet?.balls;
      if (Array.isArray(balls)) for (const b of balls) hide(b?.mesh);
      const dyn = dynamicNodes();
      for (const o of dyn.cue) hide(o);
      for (const o of dyn.aim) hide(o);
      amb.hidden = hidden.length;
      renderer.autoClear = true;
      amb.rendering = true;
      amb.cam.update(renderer, scene);
      amb.rendering = false;
      // one read-back per face (a capture, not a frame), then the six cosine-weighted hemisphere means on the CPU
      // (env/ambient.js). The faces are read into one buffer each: 6 x 32 x 32 texels of half floats.
      const N = AMBIENT_SIZE, half = THREE.DataUtils.fromHalfFloat, faceList = [];
      for (let f = 0; f < 6; f++) {
        const buf = amb.bufs[f];
        renderer.readRenderTargetPixels(amb.rt, 0, 0, N, N, buf, f);
        const cam = amb.cam.children[f];
        faceList.push({ world: cam.matrixWorld.elements, projection: cam.projectionMatrix.elements, at: (i) => half(buf[i]) });
      }
      const { values, energy } = hemisphereMeans({ size: N, faces: faceList, max: AMBIENT_MAX });
      amb.lampFaces = amb.lampFaceNames.length;
      amb.passes += 1; amb.bakesAt = stats.bakesSeen; amb.why = String(why);
      // a read-back that failed leaves the buffers untouched (three logs and returns): six black hemispheres are not a room
      if (!(energy > 0)) {
        ambient.enabled = false; ambient.reason = 'the ambient capture read back black (no values)';
        return false;
      }
      const vals = ambient.uniforms.uClubEnvAmb.value;
      for (let a = 0; a < 6; a++) vals[a].set(values[a][0], values[a][1], values[a][2]);
      ambient.serial += 1; ambient.enabled = true; ambient.reason = null;
      return true;
    } catch (e) {
      amb.error = String(e?.message ?? e);
      ambient.enabled = false; ambient.reason = `the ambient capture failed: ${amb.error}`;
      console.warn('[club] env: the ambient capture failed and is off — its consumers keep their fallback:', e);
      return false;
    } finally {
      amb.rendering = false;
      if (saved) { try { renderer.autoClear = saved.autoClear; renderer.setRenderTarget(saved.rt, saved.face, saved.mip); } catch { /* a lost context: nothing to restore */ } }
      for (const o of hidden) o.visible = true;
      try { if (typeof restoreFade === 'function') restoreFade(); } catch { /* the fade keeps its state */ }
      try { amb.ms = Math.round(performance.now() - t0); } catch { amb.ms = 0; }
    }
  }
  // per frame: a bake of the app's cube was seen since the values were made (the app's own events, the tail of a capture):
  // make them again once the tail has ended (or, without the tail counter, a few frames after the last bake)
  function ambientStep() {
    if (!amb.on || amb.error || amb.pinned || stats.bakesSeen === amb.bakesAt) return;
    let tail = null;
    try { tail = win?.__rebakeEnv?.tail?.() ?? null; } catch { tail = null; }
    if (tail && Number(tail.left) > 0) return;
    if (!tail && frameId - amb.seenAt < AMBIENT_WAIT_FRAMES) return;
    ambientPass('bake');
  }

  // ---- scene render hooks: exclusion, the capture position, the mirror -----------------------------------------------------
  // three calls scene.onBeforeRender at the start of every render of this scene (after the matrices are current, before the
  // draw list is built) and scene.onAfterRender at its end. The previous handlers run first / last.
  let envCube = null; // { cam, rt } of the app's environment cube, learned from its first bake
  let mirrorOnSaved = null;
  const prevBefore = scene.onBeforeRender, prevAfter = scene.onAfterRender;
  function onBefore(r, s, cam, rt) {
    const cubeCam = cam?.parent?.type === 'CubeCamera' ? cam.parent : null;
    if (cubeCam) {
      // the ambient capture is this service's own cube: its faces are counted apart, and its own hide list applies
      if (amb.rendering) {
        // the lamp's light faces once more, as they stand NOW: the luminaire's own hook (it ran before this one when the
        // lamp was built in time) may have put its own face in for an app face that was hidden before the render
        const hidden = hideFor('ambient');
        if (!amb.keepLamp) for (const o of lampLightFaces()) if (o.visible) { o.visible = false; hidden.push(o); noteLampFace(o); }
        hideStack.push(hidden); amb.faces += 1;
      }
      else { hideStack.push(hideFor('cube')); stats.cubeFaces += 1; }
      if (rt && rt.texture === s.environment) {
        if (envCube?.cam !== cubeCam || envCube?.rt !== rt) envCube = { cam: cubeCam, rt };
        uniforms.uClubEnvPos.value.setFromMatrixPosition(cubeCam.matrixWorld); stats.posFrom = 'the cube camera';
        if (cam === cubeCam.children[0] && !live.rendering) { stats.bakesSeen += 1; amb.seenAt = frameId; }
      }
      if (mirror && mirrorOnSaved === null) { mirrorOnSaved = mirror.uniforms.uClubMirrorParams.value.x; mirror.uniforms.uClubMirrorParams.value.x = 0; }
      return;
    }
    if (mirror && cam === mirror.camera) {
      const hidden = hideFor('mirror');
      if (floorMesh?.visible) { floorMesh.visible = false; hidden.push(floorMesh); }
      for (const o of dynamicNodes().aim) if (o.visible) { o.visible = false; hidden.push(o); } // aim overlays are not objects in the room
      if (!cfg.mirrorFull) {
        // The reduced scene: what lies on the table top cannot be seen from under the floor (the table body is in the way:
        // a ray that leaves the floor and clears the rail edge is already above the balls). So the cloth and the balls on the
        // bed are left out of the mirror picture. A ball below the bed (a ball return) stays in.
        const bedY = uniforms.uClubEnvBed.value.z - 0.02;
        const balls = ctx.game?.ballSet?.balls;
        if (Array.isArray(balls)) for (const b of balls) { const m = b?.mesh; if (m?.visible && m.matrixWorld.elements[13] > bedY) { m.visible = false; hidden.push(m); } }
        for (const o of clothMeshes) if (o.visible) { o.visible = false; hidden.push(o); }
        mirrorLeftOut = hidden.length;
      }
      hideStack.push(hidden);
      if (belly && bellyOn) belly.visible = true;
      return;
    }
    hideStack.push(null);
    if (mirrorWanted(cam)) {
      // the plane is where the floor's surface is (its world bounds; the mesh origin says nothing: a floor built from
      // world-space vertices sits at the origin)
      const planeY = Number.isFinite(floorBox.max.y) ? (floorBox.min.y + floorBox.max.y) / 2 : box.min.y;
      const ok = mirror.update(r, s, cam, planeY);
      mirror.uniforms.uClubMirrorParams.value.x = ok ? 1 : 0;
    }
  }
  function onAfter(r, s, cam) {
    unhide(hideStack.pop());
    if (belly && cam === mirror?.camera) belly.visible = false;
    if (mirrorOnSaved !== null && cam?.parent?.type === 'CubeCamera') { mirror.uniforms.uClubMirrorParams.value.x = mirrorOnSaved; mirrorOnSaved = null; }
  }
  let hookError = null;
  scene.onBeforeRender = function clubEnvBefore(r, s, cam, rt) {
    if (typeof prevBefore === 'function') prevBefore.call(this, r, s, cam, rt);
    if (hookError) return;
    try { onBefore(r, s, cam, rt); } catch (e) { hookError = String(e?.message ?? e); while (hideStack.length) unhide(hideStack.pop()); console.warn('[club] env: render hook failed and is off:', e); }
  };
  scene.onAfterRender = function clubEnvAfter(r, s, cam) {
    if (!hookError) { try { onAfter(r, s, cam); } catch (e) { hookError = String(e?.message ?? e); while (hideStack.length) unhide(hideStack.pop()); } }
    if (typeof prevAfter === 'function') prevAfter.call(this, r, s, cam);
  };

  // ---- material patches (CONTRACT.md 8.4): box-projected lookup on rail wood, apron and the club floor ------------------------
  const patched = new Map(); // material -> { cls, name, shape, frag }
  // A table material the app disposes (a build its table cache evicts: table.js disposeChildren; never drawn again) leaves
  // the map: it is iterated in state(), so it cannot hold its keys weakly, and without this every evicted build's
  // materials stayed reachable from here. The floor's record is the room's own and stays (the mirror reads it).
  const keep = (material, cls, rec) => {
    patched.set(material, rec);
    if (cls !== 'floor') { try { material.addEventListener?.('dispose', () => { patched.delete(material); }); } catch { /* no events on this object: its record stays */ } }
  };
  function noteShared(u) {
    if (u?.uLightPos?.value?.isVector3 && u.uLightHalf && sharedU?.uLightPos !== u.uLightPos) {
      sharedU = { uLightPos: u.uLightPos, uLightHalf: u.uLightHalf, uLightPosN: u.uLightPosN, uLightHalfN: u.uLightHalfN, uLightCount: u.uLightCount };
      refreshLamp(); // valid for the very draw this compile serves
    }
  }
  function adoptMaterial(material, cls) {
    if (!material || patched.has(material)) return false;
    if (!material.isMeshStandardMaterial) { note(`${cls}: material '${material.name || material.type}' is not a standard material; not patched`); keep(material, cls, { cls, name: material.name || material.type, shape: 'skipped' }); return false; }
    if (typeof club.adopt?.patch !== 'function') { note('club.adopt.patch is missing'); return false; }
    const floor = cls === 'floor';
    const withMirror = floor && !!mirror;
    const rec = { cls, name: material.name || material.userData?.obClass || material.type, shape: null, frag: null };
    // A tap in front of the club patch: it changes nothing; it records the fragment text the earlier hooks produced (the patch
    // below picks its anchor from that text, so it follows the app when a table style switches the material's own
    // environment code) and picks up the app's shared emitter uniforms.
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = function clubEnvTap(shader, rr) {
      if (typeof prev === 'function') prev.call(this, shader, rr);
      rec.frag = shader.fragmentShader;
      noteShared(shader.uniforms);
    };
    const spec = {
      key: `env-v${PATCH_VERSION}` + (floor ? (withMirror ? ':floor+coat+mirror' : ':floor+coat') : ''),
      uniforms: floor ? { ...uniforms, ...floorUniforms, ...(withMirror ? mirror.uniforms : {}) } : uniforms,
      vertexPars: ENV_VARYING,
      pars: ENV_VARYING + '\n' + ENV_GLSL,
      get apply() { const a = envApply(rec.frag, { floor, mirror: withMirror }); rec.shape = a.shape; return a.apply; },
    };
    keep(material, cls, rec);
    return club.adopt.patch(material, spec) === true;
  }
  // Round A6 (the arena venue, a tier without the box): the rail wood alone takes the corrected lookup (env/config.js
  // HALL_RAIL). False under the club venue and on every tier with the box: adoptTable() then runs what it always ran.
  let hallRail = false;
  try { hallRail = knobs.envBox !== true && isArena(club) && hallRailWanted(ctx.query); } catch { hallRail = false; }
  function adoptTable() {
    if (hallRail && typeof club.adopt?.find === 'function') { for (const m of club.adopt.find('railwood')) adoptMaterial(m, 'railwood'); return; }
    if (knobs.envBox !== true || typeof club.adopt?.find !== 'function') return;
    for (const cls of ['railwood', 'apron']) for (const m of club.adopt.find(cls)) adoptMaterial(m, cls);
  }
  function adoptFloor() {
    const f = club.room?.enabled === true ? club.room.floor : null;
    const mesh = f?.mesh?.isObject3D ? f.mesh : null;
    const mat = f?.material ?? (Array.isArray(mesh?.material) ? mesh.material[0] : mesh?.material) ?? null;
    if (mesh !== floorMesh) { floorMesh = mesh; lastMirror.frame = -1; }
    if (mat && mat !== floorMat) {
      floorMat = mat;
      if (mattFloor) note('floor: a matt floor (the venue\'s carpet) is not patched: no box-projected gloss, no varnish lobe, no mirror');
      else if (knobs.envBox === true) adoptMaterial(mat, 'floor');
    }
    if (mirror) {
      const usable = !!floorMesh && patched.get(floorMat)?.cls === 'floor' && patched.get(floorMat)?.shape !== 'skipped';
      mirrorApi.enabled = usable;
      mirrorState = usable ? 'on' : 'waiting for the floor';
      if (!usable) mirror.uniforms.uClubMirrorParams.value.x = 0;
    }
  }

  // ---- capture policy ----------------------------------------------------------------------------------------------------
  let pending = null;   // Set of reasons waiting for the next capture
  let timer = 0, parked = false;
  function flush() {
    timer = 0; loadHeld = false;
    if (!pending) return;
    if (win?.__cinelight === true) { // a studio window owns the lights and the cube: hold the request until it closes
      if (!parked) { parked = true; stats.parked += 1; }
      return;
    }
    const reasons = [...pending];
    pending = null; parked = false;
    try {
      const settled = settledNow();
      // one request to the app's closure = one bake now and its tail of bakes, one per delivered frame (main.js rebakeEnv).
      // The install capture needs no more: the frames club/index.js keeps behind its curtain after the show pass run that
      // tail, so the cube has walked to its fixed point before the first frame of the look is seen.
      ctx.rebakeEnv(); stats.bakesAsked += 1;
      stats.captures += 1;
      ambientPass('capture'); // in the task of the capture: the frame that first shows this bake already has its ambient values
      if (settled >= 0) settledCaptured = settled;
      stats.reasons.push(reasons.join('+')); if (stats.reasons.length > 12) stats.reasons.shift();
    } catch (e) {
      stats.lastError = String(e?.message ?? e);
      console.warn('[club] env: capture failed — the cube keeps its last bake:', e);
    }
  }
  // Tiers without box projection (lite) make ONE capture at load: the install request waits for the club textures (or
  // LOAD_HOLD_MS, whichever comes first) instead of baking at once and again when they land.
  const oneAtLoad = knobs.envBox !== true;
  // club/index.js joins its reasons with '+' ('light+install' when the lighting leaf's rig arrived during the build)
  const isInstall = (reason) => String(reason).split('+').includes('install');
  // textures only: a file read as bytes (the baked light map) is announced by its owner (room.lightmap.ready), not here
  const textureCounts = () => {
    const a = club.assets?.state?.();
    if (!a) return null;
    return { requested: (a.requested || 0) - (a.rawFiles || 0), settled: (a.loaded || 0) + (a.fallback || 0) - (a.rawSettled || 0) };
  };
  const assetsOutstanding = () => { const t = textureCounts(); return !!t && t.requested > t.settled; };
  let loadHeld = false;
  /**
   * Re-capture the environment cube (through ctx.rebakeEnv). Requests inside the debounce become one bake. Nothing in this
   * service captures because the camera moved: the only callers are club/index.js (the install and its refresh pass), the
   * room (its own late parts) and the two late-arrival watches below.
   * `{ now: true }` (the show pass of club/index.js): bake in this task instead of after the debounce, so the first frame of
   * the look already reflects the room. A studio window still parks it, and a tier that makes one capture at load still
   * waits for its textures.
   */
  function capture(reason = 'request', opts = null) {
    if (pending) { pending.add(String(reason)); stats.coalesced += 1; } else pending = new Set([String(reason)]);
    if (parked) return;
    if (isInstall(reason) && oneAtLoad && !timer && assetsOutstanding()) { loadHeld = true; timer = setTimeout(flush, LOAD_HOLD_MS); return; }
    if (opts?.now === true && !loadHeld) { if (timer) { clearTimeout(timer); timer = 0; } flush(); return; }
    if (loadHeld && reason === 'textures') { loadHeld = false; clearTimeout(timer); timer = 0; }
    if (!timer) timer = setTimeout(flush, isInstall(reason) ? 0 : CAPTURE_DEBOUNCE_MS);
  }
  const onCinelight = () => {
    if (win.__cinelight === true || !parked) return;
    parked = false;
    // longer than the refresh delay of club/index.js, whose own parked pass runs on the same close and ends with a capture
    // request: the two become one bake
    if (pending && !timer) timer = setTimeout(flush, CLOSE_DEBOUNCE_MS);
  };
  // The app re-bakes on its own events (look, table, cloth colour, fixture and rig values), and club/index.js asks for one
  // capture after its refresh pass (the services have rebuilt by then). This service adds no capture of its own on app events;
  // it only marks what it reads from the scene as stale.
  let rescanAt = 30;
  const markStale = () => { tableDirty = true; rescanAt = Math.min(rescanAt, frameId + 20); };
  if (win?.addEventListener) {
    win.addEventListener('ob:cinelight', onCinelight);
    win.addEventListener('ob:relight', markStale);
    win.addEventListener('ob:settings', markStale);
    win.addEventListener('ob:table-state', markStale);
  }
  /** Lifecycle hook of club/index.js (table, fixture, brightness, look changed): re-read the table and adopt new materials. */
  function rebuild() { adoptTable(); adoptFloor(); refreshLamp(); refreshTable(); if (hall) { try { hall.walk(); } catch { /* the next frame walks again */ } } }

  // club textures that land after a capture was made: one more capture when everything requested so far has settled
  // (every capture records how many had settled when it ran, so a capture that already saw them is not repeated)
  let settledCaptured = -1;
  function settledNow() {
    const t = textureCounts();
    if (!t || !(t.requested > 0)) return -1;
    return t.settled >= t.requested ? t.settled : -1;
  }
  function watchAssets() {
    const settled = settledNow();
    if (settled < 0) return;
    if (loadHeld) { capture('textures'); return; } // the held capture at load goes now
    if (settled === settledCaptured || stats.captures === 0) return;
    capture('textures');
  }
  // a room lightmap that arrives later (one that is ready now is seen by the install capture)
  try {
    let later = false;
    club.room?.lightmap?.ready?.then?.(() => { if (later) capture('room lightmap'); }, () => {});
    setTimeout(() => { later = true; }, 0);
  } catch { /* no lightmap promise */ }

  // ---- per frame -----------------------------------------------------------------------------------------------------------
  let bakesAtScan = 0;
  function frame() {
    frameId += 1;
    if (hideStack.length) { while (hideStack.length) unhide(hideStack.pop()); } // a render threw between the hooks: heal
    refreshBox();
    refreshLamp();
    if (stats.bakesSeen !== bakesAtScan) { bakesAtScan = stats.bakesSeen; tableDirty = true; rescanAt = Math.min(rescanAt, frameId + 1); }
    if (frameId >= rescanAt) { rescanAt = frameId + 600; adoptTable(); tableDirty = true; }
    if (tableDirty) refreshTable();
    if (frameId % 20 === 1) { adoptFloor(); watchAssets(); }
    liveStep();
    ambientStep();
    if (hall) { try { hall.frame(); } catch (e) { note(`hall cube: frame failed (${e?.message ?? e})`); hall = null; } }
  }

  // ---- the hall's baked reflection (round A7, CONTRACT.md 19.1; the arena venue only) -------------------------------------------
  // `club.env.hall`: one cube of the hall from the light role's baked file, its roughness chain as mip levels, the hall's
  // box for a local correction, and the patch a tagged arena material takes (env/hallcube.js, env/hall.js). The module is
  // asked for only under the arena venue and only with the switch on (env/config.js HALL_CUBE): under the club venue no
  // request is made, no member is added and `hall` stays null.
  let hall = null;
  try {
    const hallMode = isArena(club) ? hallEnvWanted(ctx.query) : 'off';
    if (hallMode !== 'off') {
      const mod = await import('./env/hallcube.js');
      hall = mod.createHallEnv(club, { mode: hallMode, note });
    }
  } catch (e) { hall = null; note(`hall cube: not built (${e?.message ?? e})`); }

  // ---- first state -----------------------------------------------------------------------------------------------------------
  refreshBox();
  const dbgCam = win?.__dbg?.cubeCam;
  if (dbgCam?.position?.isVector3) { uniforms.uClubEnvPos.value.copy(dbgCam.position); stats.posFrom = 'the cube camera'; }
  else note('the cube camera is not reachable before its first bake; the capture position starts at the default');
  refreshLamp();
  adoptTable();
  adoptFloor();
  refreshTable();
  club.onFrame?.(frame);

  function state() {
    const shapes = {};
    for (const rec of patched.values()) shapes[`${rec.cls}:${rec.name}`] = rec.shape ?? 'not compiled yet';
    const lamp = uniforms.uClubEnvLamp.value, ly = uniforms.uClubEnvLampY.value, rim = uniforms.uClubEnvRim.value;
    return {
      enabled: true, tier: club.tier ?? null, envBox: knobs.envBox === true, patchKey: `env-v${PATCH_VERSION}`,
      ...(mattFloor ? { floor: 'matt (not patched; no mirror)' } : {}), // round A1: absent under the club venue
      ...(hallRail ? { hallRail: 'the rail wood takes the corrected lookup on this tier without the box (round A6)' } : {}), // absent under the club venue
      ...(hall ? { hall: hall.state() } : {}), // round A7: absent under the club venue
      config: { ...cfg, overridden: cfg.overridden.slice() },
      live: { on: live.on, faces: live.faces, cycles: live.cycles, owed: live.owed, error: live.error },
      coat: floorUniforms.uClubEnvCoat.value.toArray(),
      // captures = requests this service made of the app (each: bakesAsked bakes at once, then the app's tail);
      // bakesSeen = cube bakes of the app's cube seen in the render hook, whoever asked; cubeFaces = cube faces rendered
      captures: stats.captures, bakesAsked: stats.bakesAsked, coalesced: stats.coalesced, parked: stats.parked, parkedNow: parked,
      pending: pending ? [...pending] : [], heldForTextures: loadHeld, oneAtLoad,
      reasons: stats.reasons.slice(), bakesSeen: stats.bakesSeen, cubeFaces: stats.cubeFaces, frames: frameId, lastError: stats.lastError, hookError,
      box: { min: box.min.toArray(), max: box.max.toArray(), from: stats.boxFrom },
      pos: uniforms.uClubEnvPos.value.toArray(), posFrom: stats.posFrom,
      lamp: { on: ly.y > 0.5, rect: lamp.toArray(), y: ly.x, from: stats.lampFrom },
      table: { from: stats.table, rim: rim.toArray(), bodyMin: floorUniforms.uClubEnvTableMin.value.toArray(), bodyMax: floorUniforms.uClubEnvTableMax.value.toArray() },
      // excluded = objects registered through exclude(); the two counts = times one of them was hidden for a cube face / a mirror picture
      shapes, excluded: excluded.size, excludedFromCube: stats.excludedFromCube, excludedFromMirror: stats.excludedFromMirror,
      mirror: mirror ? { state: mirrorState, ...mirror.counts, bytes: mirror.bytes(), reduced: !cfg.mirrorFull, leftOut: mirrorLeftOut } : { state: mirrorState },
      // the ambient cube: values = [+x, -x, +y, -y, +z, -z] cosine-weighted mean radiance (RGB); passes = captures made
      // (6 faces of AMBIENT_SIZE px each, one read-back per face); lampFaces / hidden = what the last one left out
      ambient: {
        enabled: ambient.enabled, reason: ambient.reason, serial: ambient.serial, size: AMBIENT_SIZE,
        values: ambient.uniforms.uClubEnvAmb.value.map((v) => v.toArray().map((x) => +x.toFixed(5))),
        passes: amb.passes, faces: amb.faces, ms: amb.ms, lampFaces: amb.lampFaces, lampFaceNames: amb.lampFaceNames.slice(), hidden: amb.hidden, why: amb.why, bakesAt: amb.bakesAt, error: amb.error,
        excludedFromAmbient: stats.excludedFromAmbient, bytes: amb.rt ? AMBIENT_SIZE * AMBIENT_SIZE * 6 * (8 + 4) : 0,
      },
      notes: notes.slice(),
    };
  }

  return {
    enabled: true,
    box,
    uniforms,
    glsl: ENV_GLSL,
    capture,
    exclude,
    rebuild,
    ambient,       // round 2: { enabled, reason, uniforms: { uClubEnvAmb }, serial, excludes } (see the ambient cube above)
    floorUniforms, // additions for tools and the floor's owner: the table occluder and the varnish (uClubEnvCoat)
    mirror: mirror ? mirrorApi : null,
    ...(hall ? { hall } : {}), // round A7 (the arena venue): the hall's baked reflection, one handle (env/hallcube.js)
    state,
    // Tool switches: an on / off pair inside one page load (pictures, counts). Nothing in the look calls these; the tier
    // knobs and `?clubenv=` are the configuration.
    tool: {
      /** The planar mirror on / off (off: the floor falls back to the cube, as on the base tier). */
      mirror(on) { toolMirrorOff = on === false; lastMirror.frame = -1; return !!mirror && !toolMirrorOff; },
      /** true = the mirror draws the whole scene; false = the reduced scene (the default). */
      mirrorFull(on) { cfg.mirrorFull = on === true; lastMirror.frame = -1; return cfg.mirrorFull; },
      /** The varnish lobe's strength (0..1) and roughness; a value that is not a number leaves that one as it is. */
      coat(strength, roughness) {
        const c = floorUniforms.uClubEnvCoat.value;
        if (Number.isFinite(strength)) c.x = Math.min(1, Math.max(0, strength));
        if (Number.isFinite(roughness)) c.y = Math.min(1, Math.max(0.03, roughness));
        return [c.x, c.y];
      },
      /**
       * The ambient cube inside one page load (on / off pairs): `false` = off (`ambient.enabled` false: a consumer falls
       * back); `true` = on, values made now; `'now'` = make the values again; `'withlamp'` = make them WITH the lamp's
       * light faces left in (what the cube itself holds: the reference the exclusion is judged against) and keep them
       * until the next call. Returns the state record of the ambient cube.
       */
      ambient(on) {
        if (on === false) { amb.on = false; amb.pinned = false; ambient.enabled = false; ambient.reason = 'off (tool)'; }
        else if (on === 'withlamp') { amb.on = true; amb.error = null; amb.keepLamp = true; try { ambientPass('tool:withlamp'); } finally { amb.keepLamp = false; } amb.pinned = true; }
        else { amb.on = true; amb.error = null; amb.pinned = false; ambientPass('tool'); }
        return state().ambient;
      },
    },
  };
}
