// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/rig/haze.js — haze cones in the lamp heads' beams (CONTRACT.md 14.1; the high tier only): one draw call. Owner: rig.
//
// A hall with a little haze in the air shows every beam as a soft cone from its lens. Each cone here is ONE card: a quad
// that runs along the beam's axis and turns about that axis to face the camera (vertex shader), as wide as the beam at
// every point of its length. What is drawn on it is the light a thin haze scatters toward the eye:
//   - across the beam: the depth of haze the line of sight crosses in a round beam, sqrt(1 - s^2), softened to no edge;
//   - along the beam: the beam's flux spreads over its width, the depth looked through grows with it, so the radiance falls
//     with the width (to the power `fall`); it fades in over the first centimetres at the lens and out before the floor
//     (no hard cut where the card would meet the carpet: there is no depth texture to soften it against);
//   - a card seen end-on (the eye near the axis's direction) or from inside the beam is not a cone: it fades to nothing as
//     the eye nears the axis (within three widths of it) and as the view turns along it.
// Additive, depth-tested, no depth write, scene-linear with three's tone-mapping and colour-space chunks. LEVELS: the peak
// (at the lens) is `level` times the head's tint; the rig sets it far below the radiance of the carpet the beam lights
// (rig.js HAZE_LEVEL), and the cone only gets dimmer from there: a cone is never brighter than what its beam lights.
// Never in an environment capture: the rig hides the mesh for every cube render (rig.js), and the bake tool skips every
// mesh that is not a standard material. All four vertices of a card sit at the head's lens (the card is spread in the
// vertex shader), so the mesh's own geometry is a handful of points above the rig's plane: the ball return's furniture
// walk and every bounding-box reader find nothing near the floor. Dropped while the camera is above the hall's top cut.
import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec3 beam;        // the axis times the cone's length (world metres)
attribute vec4 cone;        // x: radius at the lens, y: radius at the far end, z: level, w: unused
attribute vec2 corner;      // x: 0 at the lens, 1 at the far end; y: -1 | 1 across
attribute vec3 tint;
uniform float uCutY;
uniform float uFall;
varying vec2 vC;
varying vec3 vTint;
varying float vLevel;
void main() {
  vec3 origin = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
  float len = length( beam );
  vec3 axis = beam / max( len, 1e-4 );
  vec3 p = origin + beam * corner.x;
  float w = mix( cone.x, cone.y, corner.x );
  vec3 toEye = cameraPosition - p;
  vec3 side = cross( axis, toEye );
  float sl = length( side );
  side = sl > 1e-5 ? side / sl : vec3( 1.0, 0.0, 0.0 );
  p += side * ( corner.y * w );
  // the eye against the beam: its distance from the axis (clamped to the cone's length) in widths there, and how far the
  // view is from running along the axis
  float t = clamp( dot( cameraPosition - origin, axis ) / max( len, 1e-4 ), 0.0, 1.0 );
  float wEye = mix( cone.x, cone.y, t );
  float dAxis = length( cameraPosition - ( origin + beam * t ) );
  float near = smoothstep( 1.4 * wEye + 0.15, 3.2 * wEye + 0.4, dAxis );
  float along = abs( dot( normalize( toEye ), axis ) );
  float endOn = 1.0 - smoothstep( 0.82, 0.97, along );
  // along the beam: the fall with the width, the fade in at the lens, the fade out before the far end
  float fall = pow( cone.x / max( w, 1e-4 ), uFall );
  vLevel = cone.z * fall * near * endOn;
  vC = corner;
  vTint = tint;
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
  if ( cameraPosition.y >= uCutY ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
}
`;
const FRAG = /* glsl */`
uniform float uShow;
varying vec2 vC;
varying vec3 vTint;
varying float vLevel;
void main() {
  float s = abs( vC.y );
  // the depth of haze looked through in a round beam, with no edge
  float across = sqrt( max( 1.0 - s * s, 0.0 ) ) * ( 1.0 - smoothstep( 0.55, 1.0, s ) );
  float ends = smoothstep( 0.0, 0.035, vC.x ) * ( 1.0 - smoothstep( 0.4, 0.96, vC.x ) );
  gl_FragColor = vec4( vTint * ( vLevel * across * ends * uShow ), 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Build the cones. `beams`: [{ from: [x, y, z] (the lens), dir: [x, y, z] (unit), len, r0, r1, tint: [r, g, b], level }];
 * `level`: the radiance at a lens for a beam of level 1 (scene-linear); `cutY`: the world height of the hall's top cut.
 * Returns { mesh, uniforms, count, triangles, peak (the highest radiance any cone can show), dispose() }.
 */
export function buildHaze(beams, { level = 0.03, fall = 0.75, cutY = Infinity } = {}) {
  const n = beams.length;
  const pos = new Float32Array(n * 12), beam = new Float32Array(n * 12), cone = new Float32Array(n * 16), corner = new Float32Array(n * 8), tint = new Float32Array(n * 12);
  const idx = new Uint16Array(n * 6);
  const C = [[0, -1], [1, -1], [1, 1], [0, 1]];
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const b = beams[i], lv = level * (b.level ?? 1);
    peak = Math.max(peak, lv * Math.max(b.tint[0], b.tint[1], b.tint[2]));
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      pos.set(b.from, v * 3);
      beam.set([b.dir[0] * b.len, b.dir[1] * b.len, b.dir[2] * b.len], v * 3);
      cone.set([b.r0, b.r1, lv, 0], v * 4);
      corner.set(C[k], v * 2);
      tint.set(b.tint, v * 3);
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('beam', new THREE.BufferAttribute(beam, 3));
  g.setAttribute('cone', new THREE.BufferAttribute(cone, 4));
  g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  const uniforms = { uCutY: { value: Number.isFinite(cutY) ? cutY : 1e9 }, uFall: { value: fall }, uShow: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    name: 'arena.rig.haze', uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
  });
  material.userData.clubRoom = 'overlay';
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'arenaRig.haze';
  mesh.renderOrder = 3;
  mesh.frustumCulled = false; // (the cards are spread in the vertex shader; the rig tests the beams' box per render)
  return { mesh, uniforms, count: n, triangles: n * 2, peak, dispose() { g.dispose(); material.dispose(); } };
}
