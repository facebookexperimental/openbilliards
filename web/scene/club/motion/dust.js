// Copyright (c) Meta Platforms, Inc. and affiliates.

// motion/dust.js - chalk dust at the cue tip on a strike (CONTRACT.md section 12). Owner: dust.
//
// `applyDust(club, kit)` is called by motion.js (wiring), which owns the listeners and hands `update(t, record, info)`
// the ball clock. Importing this module does nothing.
//
// What is drawn: ONE mesh, one draw call, no texture and no sampler: a few dozen to a few hundred camera-facing soft
// discs whose centres, sizes and opacities at playback time t are the closed-form law of ./dust/law.js (a pure function
// of the shot record and t; no frame-to-frame state, no Math.random, no clock). `update` evaluates the law on the CPU and
// rewrites the whole vertex buffer, so the node arm tests exactly the numbers that are drawn. Before the strike, after the
// cloud's life and outside PLAYBACK the mesh is hidden and nothing is evaluated.
//
// The laws of the round, and how this file keeps them:
//   1. read-only: reads `record`, the ball meshes' positions and the scene's lights; writes only its own mesh.
//   2. pure in time: see above. The buffers are overwritten whole on every call; the only thing kept between calls is a
//      cache of the per-shot constants, keyed by the strike (building it again gives the same numbers). (The warm-up
//      of ./dust/warm.js remembers which light set the program was last linked for: that decides WHEN three links the
//      program, never what a frame shows.)
//   3. `update`, `clear`, `onState` and `rebuild`: every body is wrapped; an error hides the mesh, switches the part off and is
//      reported in state(). (motion.js wraps the call too.)
//   4. not furniture, not in a capture: the mesh lives under the group motion.js hands over (`kit.root`, named
//      `obAimClubMotion.dust` under `obAimClubMotion`): the ball return's furniture walk skips every mesh with an `obAim*`
//      ancestor, and the app's environment bake, the studio bake, the venue probe and the club's reflection service hide
//      `obAim*` nodes. Called without a kit (a dev page), the part makes a group with the same name itself.
//   5. look off: nothing here runs unless motion.js calls it.
//
// Depth and softness (the choice the brief asks for). The mesh is depth TESTED against the scene (a ball or the cue in
// front hides the dust behind it) and writes no depth. It does NOT read the post chain's depth texture: that picture is
// the frame before (the dust is drawn inside the scene pass, the linear copy is made after it), so a soft edge taken
// from it would depend on which frame was drawn last (law 2: `renderAt` in any order must give the same picture; the cue
// ball moves up to 16 cm between two frames at a break), and its first reader switches on a full-screen copy for every
// later frame on every tier, base included. Instead the two things a puff at the tip can cut into are faded analytically
// in the fragment shader, at no cost in passes or samplers: the bed plane (by the fragment's height) and the nearest
// balls (by the fragment's distance to each sphere). The cue, the rails and anything else are cut by the depth test alone.
import * as THREE from 'three';
import { strikeOf, buildCloud, evalCloud, makeOut, aliveAt, LIFE_MAX, COUNT_REF, COUNT_MAX, DUST_LAW_VERSION } from './dust/law.js';
import { lightAt, dustColour, FALLBACK_LIGHT } from './dust/light.js';
import { createWarm } from './dust/warm.js';

/** The group this part draws under when no kit is handed over (the same name motion.js gives it). */
export const DUST_GROUP_NAME = 'obAimClubMotion.dust';
/** Balls whose spheres the shader fades the dust against (the nearest ones to the contact). */
const BALLS = 4;
/** Width of the analytic soft edge against the bed and the balls, metres. */
const SOFT = 0.006;
/** Only balls this close to the contact can meet the puff (m). */
const BALL_REACH = 0.26;

const VERT = /* glsl */`
attribute vec2 aCorner;   // the quad's corner, -1..1
attribute vec4 aData;     // radius (m), opacity, shade (0..1), seed (0..1)
varying vec2 vUv;
varying vec3 vData;
varying vec3 vWorld;
varying float vUpY;
void main() {
  // camera-facing: the corner is laid out along the camera's right and up (world axes; the mesh has no transform)
  vec3 camR = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  vec3 camU = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
  vec3 w = position + ( camR * aCorner.x + camU * aCorner.y ) * aData.x;
  vUv = aCorner;
  vData = aData.yzw;
  vWorld = w;
  vUpY = camU.y;
  gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
}`;

const FRAG = /* glsl */`
uniform vec3 uLamp;                 // a fully lit grain, the lamp's share (scene-linear)
uniform vec3 uAmb;                  // the rest of the room
uniform float uBedY;
uniform float uSoft;
uniform vec4 uBalls[ ${BALLS} ];    // xyz centre, w radius (0 = unused)
varying vec2 vUv;
varying vec3 vData;
varying vec3 vWorld;
varying float vUpY;
float clubDustHash( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * 0.1031 );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}
float clubDustNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( clubDustHash( i ), clubDustHash( i + vec2( 1.0, 0.0 ) ), f.x ),
              mix( clubDustHash( i + vec2( 0.0, 1.0 ) ), clubDustHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
void main() {
  // a soft blob with no edge, and not a disc: the rim is pulled in by a smooth noise that differs for every particle
  // (no texture). The factor is never under 1, so the blob always ends inside its quad, zero and flat at its rim
  float nz = clubDustNoise( vUv * 1.7 + vData.z * vec2( 37.0, 91.0 ) );
  float r2 = dot( vUv, vUv ) * ( 1.0 + 1.1 * nz );
  if ( r2 >= 1.0 ) discard;
  float fall = 1.0 - r2;
  fall *= fall;
  float a = vData.x * fall;
  // analytic soft edges: the bed plane and the nearest balls
  a *= smoothstep( uBedY, uBedY + uSoft, vWorld.y );
  for ( int i = 0; i < ${BALLS}; i ++ ) {
    a *= smoothstep( 0.0, uSoft, length( vWorld - uBalls[ i ].xyz ) - uBalls[ i ].w );
  }
  if ( a < 0.002 ) discard;
  // lit from above: the cloud's upper particles are brighter (vData.y), and so is the upper side of each soft disc
  float top = 0.5 + 0.5 * vUv.y * vUpY;
  vec3 col = uLamp * vData.y * ( 0.86 + 0.14 * top ) + uAmb;
  gl_FragColor = vec4( col, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const text = (e) => String(e?.message ?? e);

/** The scene's lights as plain rows for ./dust/light.js, read where they are (visible ones only). */
function lightRows(lights) {
  const rows = [];
  const v = new THREE.Vector3(), q = new THREE.Vector3();
  for (const l of lights) {
    let shown = true;
    for (let p = l; p; p = p.parent) if (p.visible === false) { shown = false; break; }
    const k = Number(l.intensity);
    if (!shown || !(k > 0) || !l.color?.isColor) continue;
    const color = [l.color.r * k, l.color.g * k, l.color.b * k];
    const m = l.matrixWorld;
    if (l.isRectAreaLight) {
      const hw = l.width / 2, hh = l.height / 2;
      const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => { v.set(x, y, 0).applyMatrix4(m); return [v.x, v.y, v.z]; });
      q.set(0, 0, -1).transformDirection(m); // a three RectAreaLight lights its local -z side
      rows.push({ kind: 'rect', color, corners, facing: [q.x, q.y, q.z] });
    } else if (l.isSpotLight) {
      v.setFromMatrixPosition(m); q.setFromMatrixPosition(l.target.matrixWorld); q.subVectors(v, q).normalize();
      rows.push({ kind: 'spot', color, pos: [v.x, v.y, v.z], decay: l.decay, distance: l.distance, axis: [q.x, q.y, q.z],
        coneCos: Math.cos(l.angle), penumbraCos: Math.cos(l.angle * (1 - l.penumbra)) });
    } else if (l.isPointLight) {
      v.setFromMatrixPosition(m);
      rows.push({ kind: 'point', color, pos: [v.x, v.y, v.z], decay: l.decay, distance: l.distance });
    } else if (l.isDirectionalLight) {
      v.setFromMatrixPosition(m); q.setFromMatrixPosition(l.target.matrixWorld); v.sub(q).normalize();
      rows.push({ kind: 'dir', color, toLight: [v.x, v.y, v.z] });
    } else if (l.isHemisphereLight) {
      const g = l.groundColor;
      rows.push({ kind: 'hemi', color, ground: g?.isColor ? [g.r * k, g.g * k, g.b * k] : [0, 0, 0] });
    } else if (l.isAmbientLight) rows.push({ kind: 'ambient', color });
  }
  return rows;
}

/**
 * Build the dust part. `club` is the installer's object; `kit` is what motion.js hands a part (`root`, `game`, `knobs`,
 * `note`, ...). Both are optional for a dev page: `club.ctx.scene` and `club.knobs` are then used.
 * Returns `{ enabled, reason?, update(t, record, info), clear(), onState(), rebuild(), state(), dispose() }`; never throws.
 */
export async function applyDust(club, kit = null) {
  try {
    const knobs = kit?.knobs ?? club?.knobs ?? {};
    const asked = knobs.motionDust === undefined ? COUNT_REF : Number(knobs.motionDust);
    const count = Math.max(0, Math.min(COUNT_MAX, Math.floor(Number.isFinite(asked) ? asked : 0)));
    if (count <= 0) return { enabled: false, reason: 'no dust on this tier (motionDust is 0)' };
    const scene = kit?.scene ?? club?.ctx?.scene ?? null;
    let root = kit?.root?.isObject3D === true ? kit.root : null;
    let ownRoot = false;
    if (!root) {
      if (scene?.isObject3D !== true) return { enabled: false, reason: 'no group and no scene to draw in' };
      root = new THREE.Group(); root.name = DUST_GROUP_NAME; root.userData.clubMotion = true;
      scene.add(root); ownRoot = true;
    }
    const game = kit?.game ?? club?.ctx?.game ?? null;
    const note = typeof kit?.note === 'function' ? kit.note : () => {};

    // ---- the one mesh ------------------------------------------------------------------------------------------------------
    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3);
    const dataAttr = new THREE.BufferAttribute(new Float32Array(count * 4 * 4), 4);
    posAttr.setUsage(THREE.DynamicDrawUsage); dataAttr.setUsage(THREE.DynamicDrawUsage);
    const corner = new Float32Array(count * 4 * 2);
    const index = new Uint16Array(count * 6);
    for (let i = 0; i < count; i++) {
      corner.set([-1, -1, 1, -1, 1, 1, -1, 1], i * 8);
      const v = i * 4;
      index.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
    }
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('aData', dataAttr);
    geometry.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.setDrawRange(0, 0);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0.5);
    const uniforms = {
      uLamp: { value: new THREE.Vector3(1, 1, 1) },
      uAmb: { value: new THREE.Vector3(0, 0, 0) },
      uBedY: { value: 0 },
      uSoft: { value: SOFT },
      uBalls: { value: Array.from({ length: BALLS }, () => new THREE.Vector4(0, -1000, 0, 0)) },
    };
    const material = new THREE.ShaderMaterial({
      name: 'club.motion.dust', uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'clubMotionDust';
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 6;          // after the app's bed overlays (their orders are 1 to 3)
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.raycast = () => {};       // never a pick target
    mesh.userData.clubMotion = true;
    root.add(mesh);

    // the scene's lights, listed once (the light set does not change after boot: CONTRACT.md section 1); their colour,
    // intensity and place are read again at every strike
    const lights = [];
    function listLights() {
      try { lights.length = 0; scene?.traverse?.((o) => { if (o.isLight === true) lights.push(o); }); } catch (e) { note(`lights unreadable: ${text(e)}`); }
    }
    listLights();

    // the program is linked now, while the look is built, not on the frame of the first strike (./dust/warm.js): the mesh
    // stays hidden, three compiles its material and draws nothing. The app draws the scene into its composer's target;
    // a page without a composer draws to the screen
    const warm = createWarm({
      renderer: club?.ctx?.renderer ?? null, camera: club?.ctx?.camera ?? null, scene, object: mesh, name: material.name,
      toTarget: !!club?.ctx?.composer, makeTarget: () => new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }), note,
    });
    warm.check(lights, 'build');

    const out = makeOut(count);
    const stats = { calls: 0, builds: 0, draws: 0, lastT: null, alive: 0, errors: 0, lightFrom: 'none yet', lightKinds: null, lightRaw: null, lightHeld: false, lamp: null, amb: null, ballsFaded: 0 };
    let cloud = null, cloudKey = null, cloudRecord = null, strike = null;
    let enabled = true, reason = null, disposed = false;

    // hidden = nothing left of the last frame: not visible and an empty draw range
    function hide() { if (mesh.visible) mesh.visible = false; if (geometry.drawRange.count !== 0) geometry.setDrawRange(0, 0); stats.alive = 0; }
    function fail(where, e) {
      enabled = false; reason = `${where}: ${text(e)}`; stats.errors += 1;
      try { mesh.visible = false; } catch { /* the mesh is ours */ }
      try { note(`switched off after ${where} failed: ${text(e)}`); } catch { /* a note never throws */ }
    }

    // the per-shot constants: a cache keyed by the record object and the strike's own key (a record edited in place
    // gives another key), never a state: building it again gives the same cloud
    function cloudFor(record) {
      if (record === cloudRecord) {
        if (strike === null) return null;
        let same = false;
        try { const s = record.shot; same = !!s && s.v0 === strike.v0 && s.a === strike.a && s.b === strike.b && s.phi === strike.phi && s.theta === strike.theta; } catch { same = false; }
        if (same) return cloud;
      }
      // the bed plane: what motion.js says about the table (0 by the contract's axes when there is no table yet)
      let bedY = 0;
      try { const tb = typeof kit?.table === 'function' ? kit.table() : null; if (Number.isFinite(tb?.bedY)) bedY = tb.bedY; } catch { bedY = 0; }
      const sk = strikeOf(record, { bedY });
      cloudRecord = record; strike = sk;
      if (!sk) { cloud = null; cloudKey = null; return null; }
      if (sk.key !== cloudKey) {
        cloud = buildCloud(sk, count); cloudKey = sk.key; stats.builds += 1;
        geometry.boundingSphere.center.set(sk.p[0], sk.p[1], sk.p[2]);
        geometry.boundingSphere.radius = 0.45;
      }
      return cloud;
    }

    function readLight(sk) {
      let light = null;
      try {
        const rows = lightRows(lights);
        const l = lightAt(rows, sk.p);
        if (l.rects + l.others > 0) { light = l; stats.lightFrom = `${l.rects} rect, ${l.others} other`; }
        stats.lightKinds = rows.map((r) => r.kind).join(',');
      } catch (e) { note(`light read failed: ${text(e)}`); }
      if (!light) { light = FALLBACK_LIGHT; stats.lightFrom = 'fallback'; }
      const c = dustColour(light);
      uniforms.uLamp.value.set(c.lamp[0], c.lamp[1], c.lamp[2]);
      uniforms.uAmb.value.set(c.amb[0], c.amb[1], c.amb[2]);
      stats.lamp = c.lamp.map((x) => +x.toFixed(4)); stats.amb = c.amb.map((x) => +x.toFixed(4)); stats.lightHeld = c.held === true;
      stats.lightRaw = light.lamp.map((x) => +x.toFixed(3));
    }

    // the nearest balls to the contact, for the shader's soft edge: read from the meshes, never written
    const near = [];
    function readBalls(sk) {
      near.length = 0;
      const balls = game?.ballSet?.balls;
      if (Array.isArray(balls)) {
        for (const b of balls) {
          const m = b?.mesh, p = m?.position;
          if (!p || m.visible === false) continue;
          const d = Math.hypot(p.x - sk.p[0], p.y - sk.p[1], p.z - sk.p[2]);
          if (d < BALL_REACH) near.push({ d, x: p.x, y: p.y, z: p.z });
        }
        near.sort((a, b) => a.d - b.d);
      }
      const u = uniforms.uBalls.value;
      for (let i = 0; i < BALLS; i++) {
        const b = near[i];
        if (b) u[i].set(b.x, b.y, b.z, sk.R); else u[i].set(0, -1000, 0, 0);
      }
      stats.ballsFaded = Math.min(BALLS, near.length);
    }

    function update(t, record, info) {
      if (!enabled || disposed) return;
      try {
        stats.calls += 1; stats.lastT = t;
        warm.check(lights, 'frame'); // the lights the camera sees changed since the program was linked: link again, now
        // the clock stands still outside PLAYBACK: a cloud frozen in the air would be wrong, so it is drawn in PLAYBACK only
        // (a caller that hands no info, a dev page, is taken as playing)
        if (info && info.playback === false) { hide(); return; }
        if (!record || !Number.isFinite(t)) { hide(); return; }
        const c = cloudFor(record);
        if (!c || !aliveAt(strike, t)) { hide(); return; }
        const m = evalCloud(c, t, out);
        if (m <= 0) { hide(); return; }
        const pos = posAttr.array, data = dataAttr.array, sp = out.pos, sd = out.data;
        for (let i = 0; i < m; i++) {
          const x = sp[i * 3], y = sp[i * 3 + 1], z = sp[i * 3 + 2];
          const r = sd[i * 4], a = sd[i * 4 + 1], sh = sd[i * 4 + 2], se = sd[i * 4 + 3];
          for (let k = 0; k < 4; k++) {
            const p3 = (i * 4 + k) * 3, p4 = (i * 4 + k) * 4;
            pos[p3] = x; pos[p3 + 1] = y; pos[p3 + 2] = z;
            data[p4] = r; data[p4 + 1] = a; data[p4 + 2] = sh; data[p4 + 3] = se;
          }
        }
        posAttr.needsUpdate = true; dataAttr.needsUpdate = true;
        geometry.setDrawRange(0, m * 6);
        uniforms.uBedY.value = strike.bedY;
        readLight(strike);
        readBalls(strike);
        mesh.visible = true;
        stats.alive = m; stats.draws += 1;
      } catch (e) { fail('update', e); }
    }

    return {
      get enabled() { return enabled && !disposed; },
      get reason() { return disposed ? 'disposed' : reason; },
      update,
      /** no record (a new rack): nothing of a shot is drawn */
      clear() { try { hide(); if (enabled && !disposed) warm.check(lights, 'frame'); } catch (e) { fail('clear', e); } },
      /** a state change (never for the picture): the scene's lights are listed again and the program is kept linked */
      onState() { if (!enabled || disposed) return; try { listLights(); warm.check(lights, 'state'); } catch (e) { fail('onState', e); } },
      /** a table, fixture or look change: the same */
      rebuild() { if (!enabled || disposed) return; try { listLights(); warm.check(lights, 'rebuild'); } catch (e) { fail('rebuild', e); } },
      state() {
        return {
          enabled: enabled && !disposed, reason: disposed ? 'disposed' : reason, law: DUST_LAW_VERSION,
          count, lifeMax: LIFE_MAX, drawCalls: mesh.visible ? 1 : 0, alive: stats.alive, triangles: stats.alive * 2,
          visible: mesh.visible, lastT: stats.lastT, calls: stats.calls, builds: stats.builds, draws: stats.draws, errors: stats.errors,
          strike: strike ? { t0: strike.t0, ball: strike.ballId, v0: strike.v0, a: strike.a, b: strike.b, amount: +strike.amount.toFixed(4), particles: cloud ? cloud.n : 0, seed: strike.seed, at: strike.p.map((x) => +x.toFixed(4)) } : null,
          soft: 'analytic: bed plane and nearest balls; no depth texture is read', samplers: 0, textures: 0,
          warm: warm.state(),
          bufferBytes: posAttr.array.byteLength + dataAttr.array.byteLength + corner.byteLength + index.byteLength,
          light: { from: stats.lightFrom, kinds: stats.lightKinds ?? null, raw: stats.lightRaw ?? null, held: stats.lightHeld === true, lamp: stats.lamp, amb: stats.amb, lights: lights.length }, ballsFaded: stats.ballsFaded,
          group: root.name, mesh: mesh.name,
        };
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        try { mesh.visible = false; mesh.removeFromParent(); geometry.dispose(); material.dispose(); if (ownRoot) root.removeFromParent(); } catch (e) { reason = `dispose: ${text(e)}`; }
      },
    };
  } catch (e) {
    return { enabled: false, reason: `dust could not be built: ${text(e)}` };
  }
}
