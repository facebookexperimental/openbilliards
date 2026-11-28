// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/rig/luminaire.js — the arena's table light as an object in the frame: the housing (arena/rig/housing.js) on the app's
// lamp rectangle, under the club luminaire's rules (CONTRACT.md 9.2, 10.3, 13.4). Owner: rig.
//
// This is room/lamp.js's contract with another body. The app's light is not touched (its RectAreaLights, the shared emitter
// uniforms, the baked maps); this module owns only what is SEEN where that light comes from:
//
//   1. The housing is rebuilt from the app's rect lights whenever they move (`lightRefs.rectLights`: a fixture or a table
//      change re-shapes it). Its emitting faces lie on the emitter rectangles and take the app's lamp-face colour every frame.
//   2. The app's own luminaire meshes (canopy face, hood, rods, or the active fixture's meshes) are hidden for the length of
//      each render and put back right after it (scene.onBeforeRender / onAfterRender, chained), so no app property keeps a
//      value of ours: the app's fade (scene/lampfade.js) and its fixture layer go on writing their own properties.
//   3. The lamp view rule, by import from room/lamp/rule.js (not copied): SOLID or ABSENT, never translucent at rest. Absent
//      where the body would hide part of the bed in frame (COVER) and, under the default policy `whole`, where the frame
//      would hold only a band or a sliver of it (WHOLE). One law is added for this venue: absent while the camera is at or
//      above the hall's top cut (the hall is not drawn above its rig for a camera up there, and a light box hanging from
//      nothing is worse than none). A change of state is a short dissolve by ordered dither; a camera cut changes at once.
//   4. A render through a CubeCamera is LEFT TO THE APP, as in the club look: this module draws nothing for it and the
//      app's own luminaire is drawn as the app has it, so the environment cube (and with it the cloth's light and what the
//      balls mirror of the lamp) is the tournament look's, by construction.
//   5. What a camera is shown of the diffuser: room/lamp.js's law and levels (a cut-off law in absolute levels, FACE_SHOW
//      of a unit white in the hue of the app's face), on this lamp's own panel picture (arena/rig/mat.js drawFace).
//   6. A fixture whose own body is an open frame (APP_BODY: the perimeter ring) keeps the app's luminaire: one housing over
//      the emitters' bounding rectangle would close the frame into a cover. While it hangs, this module hides nothing and
//      draws no housing, as under ?clublamp=off (the spill emitter stays registered), only what the frame's cables end on:
//      a pipe over each cable line on the truss, with a drop rod to each cable top (housing.js buildRingPipes, from the tops
//      the app's cable mesh publishes), below the hall's top cut. The app's own fade rules its meshes, and the camera rule
//      of item 3 does not apply to it. The fixture is read again whenever the rect lights change (item 1).
//
// The face mesh keeps the name `clubLamp.face` and the group the name `clubLamp`: the wood part (the rail's lamp image), the
// reflection service (the ambient capture leaves the face out) and the bake tool find the venue's luminaire by those names.
//
// Tool switches on the boot URL, as for the club luminaire: ?clublamp=off (do not build: the app's luminaire and its fade
// stay; the spill emitter is still registered, so both arms of a pair have the same room light), ?clublamp=solid|absent
// (pin the state), ?clublampview=whole|keep.
import * as THREE from 'three';
import { RULE, coverCount, nextState, bodyInFrame, frameShare, nextWhole } from '../../room/lamp/rule.js';
import { lampSpill, lampSpillBaked } from '../../room/lamp/face.js';
import { buildHousing, buildRingPipes, rigFace, FACE_PANEL_V } from './housing.js';
import { patch, lit, glow, faceTexture, drawFace, FACE_TEX, TEX_BYTES } from './mat.js';

const FADE_S = 0.18;            // length of the dissolve between the two states (room/lamp.js)
const CUT_M = 0.6;              // the eye moved this far between two frames: a cut, not a move
const CUT_COS = Math.cos((25 * Math.PI) / 180);
const FACE_DEFAULT = [10, 9, 7.1]; // the app's canopy face colour, used only when the app's face cannot be read
// the LIGHT's cut-off (what `face().law` publishes; the wood part's lamp image reads it): room/lamp.js's numbers, unchanged
export const FACE_LAW = [0.07, 0.5, 0.95];
// what a camera is shown of a strip's core, in units of white at brightness 1: to a level eye, to a camera straight below.
// (The club luminaire shows 0.8 and 1.5 on a face of dark panels between bright strips. This face is an even sheet: at 1.5
// every panel is past white and the frame is all that is left of it, a white card with lines; at 0.75 and 1.2 the sheet
// read as switched down beside the lit seam: dev frame shots/rig/d5.jpg. The peak stays under the bloom threshold, 1.35.)
export const FACE_SHOW = [0.9, 1.3];
// graphite powder coat. (0x1d1e21 was measured at level 2 of 255 on the box's side in the app at V10, shots/rig/a1-V10.jpg:
// a black hole with a white line. A box in a dark hall IS dark on its sides, but it keeps a form. 0x4a4c50 read as light
// grey paint from above, shots/rig/a2-V9.jpg.)
const BODY_COLOR = 0x3c3e42;
// The hall's light on the box that is none of the room light's emitters, in the app's light units (the wash of
// arena/rig/mat.js). Round A2 turned the heads away from the box (they light their own side now), and its long side fell
// from 50 .. 60 of 255 to 28 in the app's wide view (shots/rig/f1a-V10.jpg): the lead's "its long side was dark", worse.
// By arithmetic: the satin frame band (albedo 0.25, a tenth specular) answers a wash W with 0.068 W of radiance, the black
// hood with about 0.017 W on its slope; 2 units put the band near 0.14 (about 85 of 255) and the slope near 0.035 (about
// 30); on the top plate (paint 0.03, looking up) 7 units of house light give 0.016 (about 18). The bed is at 145.
// (That arithmetic left out the paint's own mirror share of the wash: at 2 and 7 units the dev frame e5 showed a light
// grey plastic box, hood and top alike. 0.8 and 2.5: in the app from above, shots/rig/f2-V9.jpg, the top plate stood at
// 18 of 255 and its driver box and brackets were lost in it. 0.8 and 5.)
const BODY_WASH = Object.freeze({ side: 0.8, top: 5.0 });
/** Round A6: the lit lower edge's law of position is on (arena/rig/mat.js EDGE). false: the uniform skirt of round A5. */
export const EDGE_LAW = true;
/** The lit seam as the lamp's one room-light emitter (`lamp.band`): colour, level (the app's light units), reach. */
export const BAND = Object.freeze({ color: [1.0, 0.96, 0.9], intensity: 1.2, radius: 4.2 });

const smooth = (u) => u * u * (3 - 2 * u);

/**
 * `shared`: what the rig hands every part — { roomLight, bed (the cloth's bounds, with `version`), brightness: { value },
 * bounce: { color, table } (uniform objects), log: { done, missed }, floorNow(), hang(), cutY(), hide }.
 * Returns the luminaire: { enabled, group, meshes, emissives, tick(dt), hint(camera), setDetail(d), face(), counts(),
 * state(), force(v), set(o), dispose() } or a stub with `enabled: false`.
 */
export function createLuminaire(club, shared, { appRoom = null, spill = false, detail: detail0 = 1 } = {}) {
  const ctx = club?.ctx ?? {};
  const scene = ctx.scene?.isScene ? ctx.scene : null;
  const win = typeof window !== 'undefined' ? window : null;
  const roomLight = shared.roomLight ?? null;
  const group = new THREE.Group();
  group.name = 'clubLamp';
  const off = (reason, extra = {}) => ({
    enabled: false, reason, group, meshes: {}, emissives: [], tick() {}, hint() {}, setDetail() { return false; }, face: () => null,
    counts: () => ({ drawCalls: 0, drawn: 0, triangles: 0, vertices: 0, materials: 0, textures: 0, textureBytes: 0 }),
    state: () => ({ enabled: false, reason, ...extra }), force() {}, set() { return {}; }, dispose() {},
  });
  const queryOf = (k) => { try { return ctx.query?.get?.(k) ?? null; } catch { return null; } };
  const mode = queryOf('clublamp');
  const tool = {
    spill: (spill === true || queryOf('clublampspill') === '1') && queryOf('clublampspill') !== '0',
    view: queryOf('clublampview') === 'keep' ? 'keep' : 'whole', mirrorGain: 1,
  };
  const room = appRoom ?? ctx.room ?? null;
  const lr = room?.lightRefs ?? null;
  if (!lr) return off('the app room has no lightRefs');

  // ---- what the app lights the table with (room/lamp.js readEmitters: the same rounding, so both give the same face())
  const corner = new THREE.Vector3();
  function readEmitters() {
    const out = [];
    for (const l of lr.rectLights ?? []) {
      if (!l?.isRectAreaLight || l.visible === false || !(l.intensity > 0)) continue;
      l.updateWorldMatrix(true, false);
      let ax = Infinity, bx = -Infinity, az = Infinity, bz = -Infinity, y = 0;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        corner.set((sx * l.width) / 2, (sy * l.height) / 2, 0).applyMatrix4(l.matrixWorld);
        ax = Math.min(ax, corner.x); bx = Math.max(bx, corner.x); az = Math.min(az, corner.z); bz = Math.max(bz, corner.z);
        y += corner.y / 4;
      }
      const r = (v) => Math.round(v * 1e4) / 1e4;
      const e = { x: r((ax + bx) / 2), y: r(y), z: r((az + bz) / 2), w: r(bx - ax), d: r(bz - az) };
      if (e.w > 0.02 && e.d > 0.02 && Number.isFinite(e.y)) out.push(e);
    }
    return out;
  }

  // ---- the lamp's own glow as ONE fixed emitter of the room light, `lamp.band`: the geometry the club look bakes (the
  // canopy's: the room compares id, position, size and axis with its bake, so it must not follow the fixture), this lamp's
  // colour and level (the room may level it: a soft part of the signature)
  const spillState = { on: tool.spill, registered: [], error: null };
  function registerSpill() {
    if (!tool.spill || typeof roomLight?.addEmitter !== 'function') return;
    try {
      spillState.registered = [];
      for (const sp of lampSpillBaked()) {
        roomLight.addEmitter({
          id: sp.id, type: sp.type, position: new THREE.Vector3(...sp.position), axis: new THREE.Vector3(...sp.axis), size: sp.size.slice(),
          color: new THREE.Color(...BAND.color), intensity: BAND.intensity, radius: BAND.radius,
        });
        spillState.registered.push(sp.id);
      }
    } catch (e) { spillState.error = String(e?.message ?? e); }
  }
  if (mode === 'off') {
    registerSpill();
    return off('off by ?clublamp=off', { spill: { ...spillState, registered: spillState.registered.slice() } });
  }

  // ---- materials (made once; the geometry is rebuilt when the emitter set changes) ----------------------------------------
  let detail = [0, 1, 2].includes(detail0) ? detail0 : 1;
  const uFade = { value: 1 };
  const uBodyWash = { value: 1 };
  const PEAK = (FACE_LAW[0] * FACE_SHOW[1]) / FACE_SHOW[0];
  const uLaw = { value: new THREE.Vector4(FACE_LAW[0], FACE_LAW[1], FACE_LAW[2], PEAK) };
  const uShow = { value: 1 };
  // round A6: the box's outer face for the edge law (set at every rebuild) and the law's switch (EDGE_LAW below; a
  // tool's `?clubrig=noedge` is the off arm of its pair: the uniform skirt of rounds A1 to A5)
  const uEdge = { value: new THREE.Vector4(0, 0, 1.15, 0.46) };
  const uEdgeOn = { value: EDGE_LAW && !String(queryOf('clubrig') ?? '').split(',').includes('noedge') ? 1 : 0 };
  const faceTex = faceTexture();
  const mats = {
    shade: patch(lit(roomLight, { color: BODY_COLOR, roughness: 0.46, metalness: 0.3, envMapIntensity: 0.5, vertexColors: true, name: 'arena.rig.housing' }),
      // (`wash`: the hall's light on the box that is no emitter: BODY_WASH above. `down`: a face that looks down is lit by
      // the table alone: mat.js. Round A3: the shares that held the heads' light down on the box (6 % on its top, 16 % on
      // its sides, 30 % of the baked irradiance) are gone: the heads are cones now and the box stands outside every one)
      { fade: uFade, bounce: { color: shared.bounce.color, table: shared.bounce.table, mirror: 0.6, down: true, wash: uBodyWash } }, shared.log),
    // (round A6: the lit lower edge's law of position, mat.js EDGE: lamp rows, a fall to the ends, the frame's joints)
    glow: patch(glow(roomLight, { color: 0xffffff, intensity: 1, vertexColors: true, name: 'arena.rig.edge' }), { fade: uFade, edge: { box: uEdge, on: uEdgeOn } }, shared.log),
    face: patch(glow(roomLight, { color: 0xffffff, intensity: 1, map: faceTex, vertexColors: true, name: 'arena.rig.diffuser' }),
      { fade: uFade, law: { law: uLaw, show: uShow, axis: 'y' } }, shared.log),
  };
  const meshes = {};
  for (const k of ['shade', 'glow', 'face']) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mats[k]);
    mesh.name = `clubLamp.${k}`;
    mesh.visible = false;
    meshes[k] = mesh;
    group.add(mesh);
  }
  const PART = { shade: 'body', glow: 'glow', face: 'face' };
  // item 6: the pipes the ring's cables end on in the hall (housing.js buildRingPipes). Their own group, not under `clubLamp`
  // (hidden under the ring) and not named `clubLamp.*` (the wood part, the reflection service and the bake tool find the
  // housing by those names); the housing's body material (no new program); shown or not per render (before())
  const pipes = { group: new THREE.Group(), mesh: new THREE.Mesh(new THREE.BufferGeometry(), mats.shade), key: '', lights: null, rods: 0, runs: 0, y: null, reason: 'no ring' };
  pipes.group.name = 'arenaRingPipes';
  pipes.mesh.name = 'arenaRingPipes.body';
  pipes.group.visible = false;
  pipes.mesh.visible = false;
  pipes.group.add(pipes.mesh);
  // the hall's light on the body, per vertex by where its face looks (arena/rig/mat.js: the wash): the sides take the lit
  // island around the table and the box's own skirt, the top the house lights; a face that looks down takes the table's
  // bounce alone
  function washAttr(part) {
    const w = new Float32Array(part.count * 3);
    for (let i = 0; i < part.count; i++) {
      const ny = part.nor[3 * i + 1], up = smooth(Math.min(1, Math.max(0, (ny - 0.2) / 0.7))), down = smooth(Math.min(1, Math.max(0, (-ny - 0.15) / 0.5)));
      const v = (BODY_WASH.side * (1 - up) + BODY_WASH.top * up) * (1 - down);
      w[3 * i] = v; w[3 * i + 1] = v * 0.97; w[3 * i + 2] = v * 0.93;
    }
    return new THREE.Float32BufferAttribute(w, 3);
  }

  // ---- build / rebuild ---------------------------------------------------------------------------------------------------
  // `modelLights`: the app's rect-light list the housing stands on (a swap re-sets the list: until tick() has built the
  // housing on the new one, none of it is drawn)
  let model = null, sig = '', rebuilds = 0, modelVersion = 0, lastError = null, modelLights = null;
  function rebuild(force = false) {
    if (win?.__cinelight === true && model) { modelLights = lr.rectLights ?? null; return false; } // a studio window owns the lights: keep what hangs
    const list = readEmitters();
    if (!list.length) return false;
    const hang = shared.hang?.() ?? null;
    const s = `${detail}|${hang ? hang.y.toFixed(3) : 'free'}|` + list.map((e) => `${e.x},${e.y},${e.z},${e.w},${e.d}`).join(';');
    if (!force && s === sig) { modelLights = lr.rectLights ?? null; return false; }
    const next = buildHousing(list, { detail, hang });
    for (const k of Object.keys(meshes)) {
      const old = meshes[k].geometry, part = next.parts[PART[k]];
      const g = part.geometry();
      if (k === 'shade') g.setAttribute('rigWash', washAttr(part));
      meshes[k].geometry = g;
      meshes[k].visible = part.triangles > 0;
      old.dispose();
    }
    // the panel picture follows the face's layout; drawn again only when that changed
    const f0 = next.face?.faces?.[0] ?? null;
    const key = f0 && f0.shape === 'rect' ? `${f0.tubes.map((t) => `${t.offset},${t.half}`).join(';')}|${f0.panelSize.join('x')}|${f0.tubeEnd}|${f0.levels.panel}|${f0.levels.tubeEnd}` : 'plain';
    if (faceTex.userData.key !== key) {
      try { drawFace(faceTex.image, f0 && f0.shape === 'rect' ? f0 : null, FACE_PANEL_V); faceTex.userData.key = key; faceTex.needsUpdate = true; } catch { /* keeps the last drawing */ }
    }
    model = next; sig = s; rebuilds += 1; modelVersion += 1; modelLights = lr.rectLights ?? null;
    uEdge.value.set(next.rect.cx, next.rect.cz, next.rect.hx, next.rect.hz);
    registerSpill();
    return true;
  }
  // item 6: the pipes over the ring's cables, from the cable tops the app's cable mesh publishes (userData.hang, in that
  // mesh's own frame) and the truss's hang; rebuilt where the housing is (tick(): the rect lights or the hang moved)
  const tmpTop = new THREE.Vector3();
  function rebuildPipes() {
    pipes.lights = lr.rectLights ?? null;
    let src = null;
    if (appBody) for (const m of appActive) if (Array.isArray(m?.userData?.hang?.points) && Number.isFinite(m.userData.hang.y)) { src = m; break; }
    const hang = shared.hang?.() ?? null;
    let pts = null;
    if (src) {
      src.updateWorldMatrix(true, false);
      pts = src.userData.hang.points.map(([x, z]) => tmpTop.set(x, src.userData.hang.y, z).applyMatrix4(src.matrixWorld).toArray());
    }
    const key = pts && Number.isFinite(hang?.y) ? `${detail}|${hang.y.toFixed(4)}|` + pts.map((p) => p.map((v) => v.toFixed(4)).join(',')).join(';') : '';
    if (key && key === pipes.key) return;
    const acc = key ? buildRingPipes(pts, { detail, hang }) : null;
    const old = pipes.mesh.geometry;
    if (acc && acc.triangles > 0) {
      const g = acc.geometry();
      g.setAttribute('rigWash', washAttr(acc));
      pipes.mesh.geometry = g;
      pipes.mesh.visible = true;
      pipes.rods = pts.length; pipes.runs = new Set(pts.map((p) => p[2].toFixed(2))).size; pipes.y = hang.y; pipes.reason = null;
    } else {
      pipes.mesh.geometry = new THREE.BufferGeometry();
      pipes.mesh.visible = false;
      pipes.rods = 0; pipes.runs = 0; pipes.y = null;
      pipes.reason = !appBody ? 'no ring' : !src ? 'the ring publishes no cable tops' : 'no finite hang';
    }
    pipes.key = key;
    old.dispose();
  }

  // ---- the app's own luminaire meshes ----------------------------------------------------------------------------------------
  // the fixtures whose own body is the luminaire shown (item 6), by the app's fixture id
  const APP_BODY = new Set(['perimeter_ring']);
  let appAll = [], appActive = [], appLightsRef = null, appFace = null, appBody = null;
  function readApp() {
    // a fixture swap re-sets lightRefs.rectLights: the hanging fixture is read then, not every frame
    if ((lr.rectLights ?? null) !== appLightsRef) {
      let id = null;
      try { id = win?.__lighting?.state?.()?.fixture ?? null; } catch { id = null; }
      const next = APP_BODY.has(id) ? id : null;
      // a change of body: the next evaluation is a cut, as after force()
      if (next !== appBody) { appBody = next; hasPrev = false; coverKey = ''; evalSerial = -1; }
    }
    const canopy = [lr.lampFace, lr.hood, ...(lr.rods ?? [])].filter((o) => o?.isObject3D);
    let fx = null;
    try { fx = win?.__lighting?.fixtureMeshes?.() ?? null; } catch { fx = null; }
    const list = Array.isArray(fx) ? fx.filter((o) => o?.isObject3D) : [];
    appAll = canopy.concat(list);
    appActive = list.length ? list : canopy;
    appLightsRef = lr.rectLights ?? null;
    appFace = null;
    for (const m of list) { if (m.material?.isMeshBasicMaterial && m.material.color?.isColor) { appFace = m.material.color; break; } }
    if (!appFace && lr.lampFace?.material?.color?.isColor) appFace = lr.lampFace.material.color;
  }
  // `mine`: the app meshes this module holds hidden right now (a nested render finds them hidden by the outer render's hook:
  // that is not the app taking its luminaire out)
  const mine = new Set();
  const chainShown = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false && !mine.has(p)) return false; return true; };
  // in the scene, under groups that are shown (the hall is built hidden and shown in one step: until then the app's
  // luminaire stays on screen)
  const attached = () => { for (let p = group.parent; p; p = p.parent) { if (p.visible === false) return false; if (p === scene) return true; } return false; };

  // ---- the camera rule ---------------------------------------------------------------------------------------------------------
  const st = {
    target: null, fade: 1, forced: mode === 'solid' || mode === 'absent' ? mode : null,
    room: null, fadeRoom: 1, reason: null,
    cover: { visible: 0, tight: 0, loose: 0 }, whole: { state: null, inFrame: 1, ofFrame: 0 }, evals: 0, cuts: 0, changes: 0,
  };
  let serial = 0, evalSerial = -1, dtAcc = 0, camHint = null, hasPrev = false, snapNext = false;
  // the app's staging boundaries (a playback seek, the first frame of an export) call window.__lampfade.snapNext(): the same
  // call is heard here (the app's function runs unchanged), so that frame is a pure function of its pose
  const snapTap = { on: false, orig: null, wrapped: null };
  function tapSnap() {
    if (snapTap.on) return;
    const lf = win?.__lampfade;
    if (!lf || typeof lf.snapNext !== 'function') return;
    snapTap.orig = lf.snapNext;
    snapTap.wrapped = function arenaRigSnapNext(...a) { snapNext = true; return snapTap.orig.apply(this, a); };
    try { lf.snapNext = snapTap.wrapped; snapTap.on = true; } catch { /* a sealed seam: no staging snap */ }
  }
  function untapSnap() {
    const lf = win?.__lampfade;
    if (snapTap.on && lf && lf.snapNext === snapTap.wrapped) lf.snapNext = snapTap.orig;
    snapTap.on = false;
  }
  const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), prevEye = new THREE.Vector3(), prevFwd = new THREE.Vector3();
  const vp = new THREE.Matrix4();
  const camSig = new Float64Array(13);
  let coverKey = '';
  function evaluate(cam) {
    evalSerial = serial;
    st.evals += 1;
    eye.setFromMatrixPosition(cam.matrixWorld);
    cam.getWorldDirection(fwd);
    const cut = !hasPrev || snapNext || eye.distanceTo(prevEye) > CUT_M || fwd.dot(prevFwd) < CUT_COS;
    snapNext = false;
    prevEye.copy(eye); prevFwd.copy(fwd); hasPrev = true;
    const bed = shared.bed;
    let target, roomState, reason = null;
    if (st.forced) { target = roomState = st.forced; reason = st.forced === 'absent' ? 'pinned' : null; }
    else if (!model) target = roomState = 'solid';
    else {
      // the counts are a pure function of the pose, the body and the bed: recompute only when one of them moved
      const e = cam.matrixWorld.elements, p = cam.projectionMatrix.elements;
      let same = coverKey === `${modelVersion}|${bed.version}`;
      const now = [e[12], e[13], e[14], e[8], e[9], e[10], e[0], e[1], e[2], p[0], p[5], p[8], p[9]];
      for (let i = 0; i < 13; i++) { if (camSig[i] !== now[i]) { same = false; camSig[i] = now[i]; } }
      if (!same) {
        coverKey = `${modelVersion}|${bed.version}`;
        vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        const arg = { eye: [eye.x, eye.y, eye.z], viewProj: vp.elements, bed, boxes: model.boxes };
        const t = coverCount({ ...arg, margin: RULE.tight });
        st.cover.visible = t.visible; st.cover.tight = t.covered;
        st.cover.loose = t.covered > 0 ? t.covered : coverCount({ ...arg, margin: RULE.loose }).covered;
        if (cam.isPerspectiveCamera && Math.abs(p[5]) > 1e-6 && Math.abs(p[0]) > 1e-6) {
          st.whole.inFrame = bodyInFrame({ viewProj: vp.elements, boxes: model.boxes }).share;
          const len = (i) => Math.hypot(e[i], e[i + 1], e[i + 2]) || 1, lr0 = len(0), lu = len(4), lf = len(8);
          st.whole.ofFrame = frameShare({
            eye: arg.eye, boxes: model.boxes,
            basis: { right: [e[0] / lr0, e[1] / lr0, e[2] / lr0], up: [e[4] / lu, e[5] / lu, e[6] / lu], forward: [-e[8] / lf, -e[9] / lf, -e[10] / lf], tanY: 1 / p[5], aspect: p[5] / p[0] },
          }).share;
        } else { st.whole.inFrame = 1; st.whole.ofFrame = 0; }
      }
      roomState = nextState(cut ? null : st.room, st.cover.tight, st.cover.loose);
      target = roomState;
      if (roomState === 'absent') reason = 'it would hide part of the bed';
      if (tool.view === 'whole') {
        st.whole.state = nextWhole(cut ? null : st.whole.state, st.whole.inFrame, st.whole.ofFrame);
        if (roomState !== 'absent' && st.whole.state === 'absent') {
          target = 'absent';
          reason = st.whole.inFrame < RULE.wholeIn ? 'the frame cuts it' : 'it would fill the frame';
        }
      } else st.whole.state = null;
      // this venue's law: above the hall's top cut nothing of the rig is drawn, so nothing hangs from it either
      let cutY = Infinity;
      try { cutY = shared.cutY?.() ?? Infinity; } catch { cutY = Infinity; }
      if (eye.y >= cutY) { target = roomState = 'absent'; reason = 'the camera is above the rig (the hall is cut away there)'; }
    }
    if (target !== st.target) st.changes += 1;
    st.target = target; st.room = roomState; st.reason = reason;
    const goal = target === 'absent' ? 0 : 1, goalRoom = roomState === 'absent' ? 0 : 1;
    if (cut) { st.fade = goal; st.fadeRoom = goalRoom; st.cuts += 1; }
    else {
      const step = dtAcc / FADE_S;
      if (st.fade !== goal) st.fade += Math.min(step, Math.max(-step, goal - st.fade));
      if (st.fadeRoom !== goalRoom) st.fadeRoom += Math.min(step, Math.max(-step, goalRoom - st.fadeRoom));
    }
    dtAcc = 0;
  }

  // ---- render hooks: per render, hide the app's luminaire and show ours as that camera should see it -------------------------
  const hook = { installed: false, off: false, error: null, renders: 0, cubeRenders: 0, cubeApp: 0, appHiddenRenders: 0, appBodyRenders: 0, staleRenders: 0, pipesDrawn: 0, drawn: 0, drawnOther: 0, programs: 'unchecked' };
  const stack = [];
  function before(cam) {
    const rec = { hidden: null, set: false, shown: false, fade: 1, pipes: false };
    pipes.group.visible = false;
    if (!model || !attached()) return rec;
    hook.renders += 1;
    if (cam?.parent?.type === 'CubeCamera') {
      // a cube render is left to the app: its own luminaire as it has it, none of ours
      hook.cubeRenders += 1; hook.cubeApp += 1;
      group.visible = false;
      rec.set = true; rec.shown = false; rec.fade = uFade.value;
      return rec;
    }
    if (lr.rectLights !== appLightsRef) readApp(); // a fixture swap since this frame's tick: hide the new meshes at once
    if (appBody) {
      // the fixture's own body is the luminaire (item 6): the app's meshes stay as the app has them, and of ours only the
      // pipes its cables end on: while the app shows its luminaire in this render, the eye is below the hall's top cut
      // (above it the hall is not drawn, and pipes on nothing are what they are there against) and they stand on these lights
      hook.appBodyRenders += 1;
      group.visible = false;
      let appShown = appActive.length === 0;
      for (const o of appActive) if (chainShown(o)) { appShown = true; break; }
      let cutY = Infinity;
      try { cutY = shared.cutY?.() ?? Infinity; } catch { cutY = Infinity; }
      const eyeY = cam?.matrixWorld?.elements?.[13];
      rec.pipes = pipes.mesh.visible && pipes.lights === (lr.rectLights ?? null) && appShown && Number.isFinite(eyeY) && eyeY < cutY;
      // (they do not dissolve with the hidden box's camera rule: the fade is held at 1 for this render)
      if (rec.pipes) { pipes.group.visible = true; uFade.value = 1; hook.pipesDrawn += 1; }
      rec.set = true; rec.shown = false; rec.fade = uFade.value;
      return rec;
    }
    if (modelLights !== (lr.rectLights ?? null)) {
      // the housing still stands on the rectangles of before a swap (tick() builds it on the new ones): none of it this
      // render, and the app's luminaire stays
      hook.staleRenders += 1;
      group.visible = false;
      rec.set = true; rec.shown = false; rec.fade = uFade.value;
      return rec;
    }
    let appShown = appActive.length === 0;
    for (const o of appActive) if (chainShown(o)) { appShown = true; break; }
    for (const o of appAll) {
      if (o.visible) { o.visible = false; (rec.hidden ??= []).push(o); mine.add(o); }
    }
    if (!appShown) {
      // the app took its luminaire out of this render (a scripted overhead move): none of ours either
      hook.appHiddenRenders += 1;
      group.visible = false;
    } else {
      const player = camHint ?? ctx.camera ?? null;
      const isPlayer = cam === player || !player;
      if (evalSerial !== serial) {
        if (isPlayer && cam?.isCamera) evaluate(cam);
        else if (player?.isCamera) evaluate(player);
      }
      const f = isPlayer ? st.fade : st.fadeRoom;
      group.visible = f > 0;
      uFade.value = smooth(f);
      // another camera (a mirror pass) is shown the LIGHT, not the display picture: the app face's colour through the light's law
      if (!isPlayer) { rec.law = [uLaw.value.w, uShow.value]; uLaw.value.w = 1; uShow.value = tool.mirrorGain; }
      if (group.visible) { hook.drawn += 1; if (!isPlayer) hook.drawnOther += 1; }
    }
    rec.set = true; rec.shown = group.visible; rec.fade = uFade.value;
    return rec;
  }
  function after(rec) {
    if (rec?.hidden) for (const o of rec.hidden) { o.visible = true; mine.delete(o); }
    if (rec?.law) { uLaw.value.w = rec.law[0]; uShow.value = rec.law[1]; }
    const outer = stack.length ? stack[stack.length - 1] : null;
    if (outer?.set) { group.visible = outer.shown; uFade.value = outer.fade; pipes.group.visible = outer.pipes === true; return; }
    // between renders the group holds the player's state (tools, bounds and other services read it there); the pipes are
    // decided per render (item 6)
    group.visible = !!model && !appBody && modelLights === (lr.rectLights ?? null) && st.fade > 0;
    pipes.group.visible = false;
    uFade.value = smooth(st.fade);
  }
  function heal() {
    while (stack.length) { const rec = stack.pop(); if (rec?.hidden) for (const o of rec.hidden) o.visible = true; }
    mine.clear();
    uLaw.value.w = PEAK;
    pipes.group.visible = false;
  }
  let prevBefore = null, prevAfter = null, ownBefore = null, ownAfter = null;
  function installHook() {
    if (!scene || hook.installed) return;
    prevBefore = scene.onBeforeRender; prevAfter = scene.onAfterRender;
    ownBefore = scene.onBeforeRender = function arenaRigBefore(r, s, cam, rt) {
      if (typeof prevBefore === 'function') prevBefore.call(this, r, s, cam, rt);
      if (hook.off || hook.error) return;
      try { stack.push(before(cam)); } catch (e) { hook.error = String(e?.message ?? e); heal(); group.visible = false; console.warn('[club] arena rig: the luminaire render hook failed and is off (the app luminaire is back):', e); }
    };
    ownAfter = scene.onAfterRender = function arenaRigAfter(r, s, cam) {
      if (!hook.off && !hook.error) { try { after(stack.pop()); } catch (e) { hook.error = String(e?.message ?? e); heal(); group.visible = false; } }
      if (typeof prevAfter === 'function') prevAfter.call(this, r, s, cam);
    };
    hook.installed = true;
  }

  // ---- degrade law for the shaders: a material whose program did not link draws nothing, and the app's luminaire is hidden
  // under this module, so the table would have no lamp at all. Once the lamp has been drawn the programs are checked; if one
  // is not runnable this luminaire stands down for the page load and the app's luminaire (with its own fade) is back.
  function checkPrograms() {
    const props = ctx.renderer?.properties;
    if (typeof props?.get !== 'function') { hook.programs = 'unknown (no renderer)'; return; }
    let ready = 0;
    for (const k of Object.keys(mats)) {
      if (!meshes[k].visible) { ready += 1; continue; }
      const prog = props.get(mats[k])?.currentProgram;
      if (!prog) continue;
      if (prog.diagnostics && prog.diagnostics.runnable === false) {
        hook.programs = `failed: ${mats[k].name}`;
        hook.error = `the program of '${mats[k].name}' did not link`;
        heal(); group.visible = false;
        console.error(`[club] arena rig: ${hook.error} — the housing is off and the app luminaire is back`);
        return;
      }
      ready += 1;
    }
    if (ready === Object.keys(mats).length) hook.programs = 'ok';
  }

  // ---- per frame -----------------------------------------------------------------------------------------------------------
  const faceColor = new THREE.Color();
  let ticks = 0, quickSeen = NaN, lightsSeen = null;
  function quickSig() {
    let h = detail + (shared.hang?.()?.y ?? 0) * 101;
    for (const l of lr.rectLights ?? []) {
      if (!l?.isRectAreaLight) continue;
      h = h * 31 + l.position.x * 7.1 + l.position.y * 13.7 + l.position.z * 17.3 + l.width * 3.3 + l.height * 5.9 + (l.visible === false ? 1 : 0) + (l.intensity > 0 ? 0 : 2);
    }
    return h;
  }
  function tick(dt) {
    serial += 1; ticks += 1;
    dtAcc = Math.min(0.5, dtAcc + (Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60));
    if (stack.length) heal(); // a render threw between the hooks
    if (hook.programs === 'unchecked' && hook.drawn >= 2 && !hook.error) { try { checkPrograms(); } catch { hook.programs = 'unknown'; } }
    try {
      readApp();
      if (appBody) group.visible = false; // item 6: nothing of ours between renders either
      if (group.parent && pipes.group.parent !== group.parent) group.parent.add(pipes.group); // beside `clubLamp`, not in it
      const quick = quickSig();
      if (quick !== quickSeen || lr.rectLights !== lightsSeen) { quickSeen = quick; lightsSeen = lr.rectLights ?? null; rebuild(false); rebuildPipes(); }
      if (!snapTap.on && ticks % 60 === 1) tapSnap(); // the app's fade module lands by its own dynamic import
      // the emitting faces follow the app's own lamp-face colour (brightness, look, fixture); what is DRAWN keeps its hue and
      // takes the brightness setting at the FACE_SHOW levels, whatever the app face's own level
      if (appFace) faceColor.copy(appFace); else faceColor.setRGB(FACE_DEFAULT[0], FACE_DEFAULT[1], FACE_DEFAULT[2]);
      mats.face.color.copy(faceColor);
      const b = shared.brightness.value;
      uShow.value = (b * FACE_SHOW[0]) / (FACE_LAW[0] * Math.max(faceColor.r, faceColor.g, faceColor.b, 1e-3));
      mats.glow.color.setScalar(b);
    } catch (e) {
      if (!lastError) console.warn('[club] arena rig: the luminaire frame update failed:', e);
      lastError = String(e?.message ?? e);
    }
  }

  try {
    readApp();
    rebuild(true);
    if (!model) return off('no active rect light to hang a luminaire on');
    installHook();
    tick(0);
  } catch (e) {
    hook.off = true; heal();
    console.warn('[club] arena rig: the housing failed to build — the app luminaire stays:', e);
    return off(String(e?.message ?? e));
  }

  return {
    enabled: true, group, meshes,
    emissives: [meshes.face, meshes.glow],
    tick,
    hint(camera) { if (camera?.isCamera) camHint = camera; },
    setDetail(d) { if (![0, 1, 2].includes(d)) return false; if (d !== detail) { detail = d; rebuild(true); rebuildPipes(); } return true; },
    /** The diffuser as plain data for the current emitters (housing.js rigFace: room/lamp/face.js lampFace with this lamp's
     * levels), plus the two live values the club luminaire publishes: `law` [low, c0, c1] and `color` [r, g, b]. */
    face() {
      const f = rigFace(readEmitters());
      if (f) { f.law = [uLaw.value.x, uLaw.value.y, uLaw.value.z]; f.color = mats.face.color.toArray(); }
      return f;
    },
    spill() { return lampSpill(readEmitters()); },
    counts() {
      let drawCalls = 0, triangles = 0, vertices = 0;
      for (const k of Object.keys(meshes)) {
        const g = meshes[k].geometry;
        if (!meshes[k].visible || !g.index) continue;
        drawCalls += 1; triangles += g.index.count / 3; vertices += g.attributes.position.count;
      }
      const pg = pipes.mesh.geometry;
      return { drawCalls, drawn: st.fade > 0 && !appBody ? drawCalls : 0, triangles, vertices, materials: 3, textures: 1, textureBytes: TEX_BYTES.face, kind: model?.kind ?? null, detail,
        // item 6: one draw call more while the ring hangs (its pipes, the body material)
        pipes: { drawCalls: appBody && pipes.mesh.visible ? 1 : 0, triangles: pipes.mesh.visible && pg.index ? pg.index.count / 3 : 0 } };
    },
    /** Pin the state ('solid' | 'absent') or hand it back to the rule (null). */
    force(v) { st.forced = v === 'solid' || v === 'absent' ? v : null; hasPrev = false; coverKey = ''; evalSerial = -1; },
    /** Tools: the box's wash on or off (the off arm of a pair). */
    setWash(on) { uBodyWash.value = on ? 1 : 0; },
    /** Tools: `view` 'whole' | 'keep'; `mirrorGain`. The next frame is a cut. */
    set(o = {}) {
      if (o.view === 'whole' || o.view === 'keep') tool.view = o.view;
      if (Number.isFinite(o.mirrorGain) && o.mirrorGain >= 0) tool.mirrorGain = Math.min(20, o.mirrorGain);
      hasPrev = false; coverKey = ''; evalSerial = -1;
      return { view: tool.view, mirrorGain: tool.mirrorGain };
    },
    state() {
      const r = (v) => Math.round(v * 1e3) / 1e3;
      return {
        enabled: true, kind: model?.kind ?? null, detail, emitters: readEmitters(), rebuilds,
        // (round A6) the lit lower edge's law: on or off, and the box it reads
        edge: { on: uEdgeOn.value, box: uEdge.value.toArray().map(r) },
        // (item 6: under a fixture whose own body is shown nothing of ours is drawn, whatever the camera rule said last)
        state: appBody ? 'absent' : st.target, fade: st.fade, forced: st.forced, cover: { ...st.cover }, evals: st.evals, cuts: st.cuts, changes: st.changes,
        view: tool.view, room: appBody ? 'absent' : st.room, fadeRoom: st.fadeRoom, reason: appBody ? `the fixture's own body is shown (${appBody})` : st.reason, appBody,
        pipes: { built: pipes.mesh.visible, shown: pipes.group.visible, runs: pipes.runs, rods: pipes.rods, y: pipes.y, current: pipes.lights === (lr.rectLights ?? null), reason: pipes.reason },
        whole: { state: st.whole.state, inFrame: r(st.whole.inFrame), ofFrame: r(st.whole.ofFrame), wholeIn: RULE.wholeIn, wholeOut: RULE.wholeOut, frameMax: RULE.frameMax },
        hull: model?.boxes ?? [], rect: model ? { ...model.rect } : null, span: model ? { ...model.span } : null, pipeY: model?.pipeY ?? null,
        attached: attached(), brightness: shared.brightness.value,
        face: model?.face ? { kind: model.face.kind, panels: model.face.panels.length, frame: { ...model.face.frame }, panelSize: model.face.faces[0].panelSize ?? null, levels: { ...model.face.faces[0].levels },
          law: [uLaw.value.x, uLaw.value.y, uLaw.value.z], peak: uLaw.value.w, show: FACE_SHOW.slice(), scale: Math.round(uShow.value * 1e4) / 1e4, gamma: FACE_TEX.gamma } : null,
        spill: { ...spillState, registered: spillState.registered.slice() },
        app: { meshes: appAll.length, active: appActive.length, faceColor: appFace ? appFace.toArray() : null },
        stagingSnap: snapTap.on, hook: { ...hook, depth: stack.length }, lastError,
      };
    },
    dispose() {
      hook.off = true; heal(); untapSnap();
      // hand the scene's hooks back when nobody chained on top of ours
      try { if (scene && scene.onBeforeRender === ownBefore) scene.onBeforeRender = prevBefore; if (scene && scene.onAfterRender === ownAfter) scene.onAfterRender = prevAfter; } catch { /* the hooks stay, switched off */ }
      group.parent?.remove(group);
      pipes.group.parent?.remove(pipes.group);
      pipes.mesh.geometry.dispose();
      for (const k of Object.keys(meshes)) { meshes[k].geometry.dispose(); mats[k].dispose(); }
      faceTex.dispose();
    },
  };
}
