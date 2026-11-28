// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/rig/house.js — the house lights of the arena (the roof field, the low ring over the upper seating, the wall lamps:
// arena/rig/plan.js housePlan): one draw call (CONTRACT.md 13.4). Owner: rig.
//
// Each lamp is a quad that turns to the camera in the vertex shader (four vertices at the lamp's centre, a corner attribute),
// all lamps in one geometry. What is drawn per lamp is a lamp far away, not a star:
//   - a DISC of the lamp's real size (plan.js RIG.house.lampR) with a soft edge, plus a faint wide halo (the glare of a
//     bare lamp in hall air): the size falls with distance like everything else in the frame;
//   - a law against the view angle: a downlight seen from underneath shows its lit reflector, seen from far off to the
//     side only the rim of it, so far rows are dimmer than near ones;
//   - a MINIMUM SIZE on screen: a quad that would be under `minPx` pixels is drawn at that size with its radiance divided
//     by the area ratio (the energy on screen is that of the small lamp), so a lamp never falls between pixels and never
//     flickers from frame to frame. The render's own height is read per render (a cube face is not the canvas).
// Additive, no depth write, depth-tested: the lens and the bloom take it as a small bright source. Scene-linear output with
// three's tone-mapping and colour-space chunks. The mesh is dropped while the camera is above the hall's top cut
// (`cutY`: the hall is not drawn above its rig for a camera up there), by the same test as room/light.js uses for a side.
import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec3 corner;      // xy: the quad's corner (-1..1); z: the lamp's level
attribute float lampR;
attribute float lampKind;   // 0: a downlight above the hall's top cut (roof, ring); 1: a wall lamp (below the cut, no view law)
uniform float uViewH;       // the render's height in pixels
uniform float uMinPx;       // the quad's smallest half size on screen
uniform float uHalo;        // the quad's half size over the lamp's radius
uniform float uCutY;
varying vec2 vC;
varying float vLevel;
varying float vCore;
void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  // a quad square to the line of sight (not to the screen: a cube face and the next one then agree on it)
  vec3 toCam = normalize( - mv.xyz );
  vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), toCam ) );
  vec3 up = cross( toCam, right );
  float quad = lampR * uHalo;
  float px = quad * projectionMatrix[ 1 ][ 1 ] * uViewH * 0.5 / max( length( mv.xyz ), 0.01 );
  float k = max( 1.0, uMinPx / max( px, 1e-4 ) );
  mv.xyz += ( right * corner.x + up * corner.y ) * quad * k;
  // the lamp's own law: full from underneath, a share of it from far off to the side
  vec3 wp = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
  float down = normalize( wp - cameraPosition ).y;
  // (a wall lamp is an opal bulkhead: the same from every side)
  vLevel = corner.z * mix( mix( 0.3, 1.0, smoothstep( 0.04, 0.6, down ) ), 1.0, lampKind ) / ( k * k );
  vC = corner.xy;
  vCore = 1.0 / uHalo;
  gl_Position = projectionMatrix * mv;
  // the hall's top cut: what hangs above it is not drawn for a camera at or above it (the wall lamps stand below it)
  if ( lampKind < 0.5 && cameraPosition.y >= uCutY ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
}
`;
const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uGlare;
varying vec2 vC;
varying float vLevel;
varying float vCore;
void main() {
  float r = length( vC );
  if ( r >= 1.0 ) discard;
  // the lamp's disc (a soft edge: from 0.6 to 1.3 of its radius; with an edge a quarter of the radius wide the ring's lamps
  // were cut-out dots on the drape in the app, shots/rig/a5-V10.jpg) and the halo around it
  float disc = 1.0 - smoothstep( vCore * 0.6, vCore * 1.3, r );
  float halo = uGlare * pow( 1.0 - r, 2.5 );
  gl_FragColor = vec4( uColor * ( vLevel * ( disc + halo ) ), 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Build the field. `lamps`: [{ x, y, z, level, r, kind }] (arena/rig/plan.js housePlan), `color` a THREE.Color (linear),
 * `level` the radiance of a lamp's disc at level 1 (scene-linear, before the view law), `cutY` the world height of the
 * hall's top cut (Infinity: never dropped). Returns { mesh, uniforms, count, dispose() }.
 */
export function buildHouse(lamps, { color, level = 9, cutY = Infinity, minPx = 5, halo = 3.4, glare = 0.07 } = {}) {
  const n = lamps.length;
  const pos = new Float32Array(n * 12), corner = new Float32Array(n * 12), rad = new Float32Array(n * 4), kind = new Float32Array(n * 4);
  const idx = n * 4 > 65535 ? new Uint32Array(n * 6) : new Uint16Array(n * 6);
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < n; i++) {
    const l = lamps[i];
    for (let k = 0; k < 4; k++) {
      const o = (i * 4 + k) * 3;
      pos[o] = l.x; pos[o + 1] = l.y; pos[o + 2] = l.z;
      corner[o] = C[k][0]; corner[o + 1] = C[k][1]; corner[o + 2] = l.level;
      rad[i * 4 + k] = l.r;
      kind[i * 4 + k] = l.kind === 'wall' ? 1 : 0;
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('corner', new THREE.BufferAttribute(corner, 3));
  g.setAttribute('lampR', new THREE.BufferAttribute(rad, 1));
  g.setAttribute('lampKind', new THREE.BufferAttribute(kind, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += 2; // the quads stand out from their centres
  const uniforms = {
    uColor: { value: new THREE.Color().copy(color ?? new THREE.Color(1, 0.95, 0.86)).multiplyScalar(level) },
    uViewH: { value: 720 }, uMinPx: { value: minPx }, uHalo: { value: halo }, uGlare: { value: glare },
    uCutY: { value: Number.isFinite(cutY) ? cutY : 1e9 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'arena.rig.house', uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
  });
  material.userData.clubRoom = 'emissive';
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'arenaRig.house';
  mesh.renderOrder = 2;
  const size = new THREE.Vector2();
  // the height of what is being rendered into: a render target's, or the drawing buffer's
  mesh.onBeforeRender = (renderer) => {
    try {
      const rt = renderer.getRenderTarget();
      uniforms.uViewH.value = rt ? rt.height : renderer.getDrawingBufferSize(size).y;
    } catch { /* keeps the last height */ }
  };
  return { mesh, uniforms, count: n, triangles: n * 2, dispose() { g.dispose(); material.dispose(); } };
}
