// Copyright (c) Meta Platforms, Inc. and affiliates.

// post/ao.js — screen-space ambient occlusion from the chain's linear depth copy (no normal buffer, no extra scene pass).
//
// For what the precomputed table atlases cannot know: balls against cushions, the cue over a rail, furniture. Three full-screen
// draws: (1) obscurance at `aoScale` resolution, normals rebuilt from depth differences, 20 points in the hemisphere above the surface, rotated on a 4x4 pattern;
// (2) a depth-aware 4x4 box blur that removes exactly that pattern; (3) a depth-aware upsample multiplied INTO the scene buffer
// (blend dst * src, so no full-resolution copy and no buffer swap). The vendored GTAOPass was not used: it renders its own
// normal/depth pass, a second scene pass with every ball, rail and room mesh.
import * as THREE from 'three';
import { fsMaterial, makeTarget, fitTarget, targetBytes } from './fsq.js';

const POS = /* glsl */`
uniform sampler2D tDepth;   // linear view distance, full resolution
uniform vec4 uProj;         // view.xy = ( uv * uProj.xy + uProj.zw ) * distance
uniform vec2 uFull;         // full-resolution size in texels
// An occlusion texel centre sits on a CORNER of four depth texels, where a nearest lookup flips with float rounding (bands
// along rows). So the texel is chosen explicitly (ties go one way) and the position is rebuilt at that texel's own centre.
ivec2 texelAt( vec2 uv ) { return ivec2( floor( uv * uFull + 0.25 ) ); }
float depthAt( vec2 uv ) { return texelFetch( tDepth, clamp( texelAt( uv ), ivec2( 0 ), ivec2( uFull ) - 1 ), 0 ).r; }
vec3 posAt( vec2 uv ) {
  ivec2 t = clamp( texelAt( uv ), ivec2( 0 ), ivec2( uFull ) - 1 );
  float d = texelFetch( tDepth, t, 0 ).r;
  return vec3( ( ( vec2( t ) + 0.5 ) / uFull * uProj.xy + uProj.zw ) * d, - d );
}
`;

const AO_FRAG = POS + /* glsl */`
uniform vec2 uTexel;        // one full-resolution texel
uniform float uRadius;      // world radius, metres
uniform float uProjScale;   // occlusion pixels per metre at distance 1
uniform float uIntensity;
uniform float uFar;         // distance where the effect has faded out
out vec4 outAo;
const int TAPS = 20;
void main() {
  vec3 p = posAt( vUv );
  float d = - p.z;
  if ( d >= uFar || uRadius * uProjScale / d < 1.5 ) { outAo = vec4( 1.0 ); return; }
  // normal from the smaller depth difference on each axis (keeps silhouettes out of the normal)
  vec3 pr = posAt( vUv + vec2( uTexel.x, 0.0 ) ), pl = posAt( vUv - vec2( uTexel.x, 0.0 ) );
  vec3 pu = posAt( vUv + vec2( 0.0, uTexel.y ) ), pd = posAt( vUv - vec2( 0.0, uTexel.y ) );
  vec3 dx = abs( pr.z - p.z ) < abs( p.z - pl.z ) ? pr - p : p - pl;
  vec3 dy = abs( pu.z - p.z ) < abs( p.z - pd.z ) ? pu - p : p - pd;
  vec3 n = normalize( cross( dx, dy ) );
  // Sample points fill the hemisphere above the surface (world radius, cosine weighted) and are projected to the screen: a
  // point is occluded when the depth buffer is in front of it. A screen-space disc would spend almost every tap beyond the
  // radius on a bed seen at ten degrees, and a horizon estimate misses an occluder whose visible face is seen edge-on.
  vec3 t = normalize( abs( n.y ) < 0.9 ? cross( n, vec3( 0.0, 1.0, 0.0 ) ) : cross( n, vec3( 1.0, 0.0, 0.0 ) ) );
  vec3 b = cross( n, t );
  // bias: the depth of one texel step at this slope (lookups snap to texel centres) plus a floor
  float bias = 0.0012 + 0.9 * max( abs( dx.z ), abs( dy.z ) );
  ivec2 ip = ivec2( gl_FragCoord.xy ) & 3;
  float phase = float( ( ( ip.x + ip.y * 4 ) * 9 ) & 15 ) / 16.0;   // 16 rotations, one per cell of the 4x4 pattern
  float sum = 0.0;
  for ( int i = 0; i < TAPS; i ++ ) {
    float u = ( float( i ) + fract( phase * 4.0 + 0.5 ) ) / float( TAPS ) * 0.94;   // cos(elevation) up to 0.97: nothing skims the surface
    float ang = float( i ) * 2.3999632 + phase * 6.2831853;                        // golden-angle spiral
    float rd = sqrt( u );
    vec3 dir = t * ( rd * cos( ang ) ) + b * ( rd * sin( ang ) ) + n * sqrt( 1.0 - u );
    float k = fract( float( i ) * 0.7548777 + phase );                              // distances: more of them close to the point
    vec3 s = p + dir * ( uRadius * mix( 0.12, 1.0, k * k ) );
    if ( s.z > -0.02 ) continue;
    float sd = depthAt( ( s.xy / ( - s.z ) - uProj.zw ) / uProj.xy );
    float gap = - s.z - sd;                                                         // > 0: something is in front of the sample
    // an occluder much nearer than the radius' reach is another object in front (the cue over the bed), not this corner
    sum += step( bias, gap ) * smoothstep( 0.0, 1.0, uRadius * 1.5 / max( d - sd, 1e-4 ) );
  }
  float ao = exp2( - uIntensity * 2.0 * sum / float( TAPS ) );
  ao = mix( ao, 1.0, smoothstep( uFar * 0.6, uFar, d ) );
  outAo = vec4( ao, ao, ao, 1.0 );
}`;

const BLUR_FRAG = POS + /* glsl */`
uniform sampler2D tAo;
uniform vec2 uAoTexel;
out vec4 outAo;
void main() {
  float dc = depthAt( vUv );
  float tol = 0.05 + 0.06 * dc;
  ivec2 base = ivec2( gl_FragCoord.xy ) - 2;
  ivec2 lim = textureSize( tAo, 0 ) - 1;
  float sum = 0.0, w = 0.0;
  for ( int y = 0; y < 4; y ++ ) for ( int x = 0; x < 4; x ++ ) {
    ivec2 q = clamp( base + ivec2( x, y ), ivec2( 0 ), lim );
    float ds = depthAt( ( vec2( q ) + 0.5 ) * uAoTexel );
    float wi = max( 1.0 - abs( ds - dc ) / tol, 0.0 ) + 1e-3;
    sum += texelFetch( tAo, q, 0 ).r * wi; w += wi;
  }
  float ao = sum / w;
  outAo = vec4( ao, ao, ao, 1.0 );
}`;

const APPLY_FRAG = POS + /* glsl */`
uniform sampler2D tAo;
uniform vec2 uAoSize;
uniform float uAmount;
out vec4 outColor;
void main() {
  float dc = depthAt( vUv );
  float tol = 0.01 + 0.02 * dc;
  vec2 st = vUv * uAoSize - 0.5;
  vec2 f = fract( st );
  ivec2 i0 = ivec2( floor( st ) );
  ivec2 lim = ivec2( uAoSize ) - 1;
  float sum = 0.0, w = 0.0;
  for ( int k = 0; k < 4; k ++ ) {
    ivec2 o = ivec2( k & 1, k >> 1 );
    ivec2 q = clamp( i0 + o, ivec2( 0 ), lim );
    float ds = depthAt( ( vec2( q ) + 0.5 ) / uAoSize );
    float bw = ( o.x == 1 ? f.x : 1.0 - f.x ) * ( o.y == 1 ? f.y : 1.0 - f.y );
    float wi = bw * max( 1.0 - abs( ds - dc ) / tol, 0.0 ) + 1e-4;
    sum += texelFetch( tAo, q, 0 ).r * wi; w += wi;
  }
  float ao = mix( 1.0, sum / w, uAmount );
  outColor = vec4( ao, ao, ao, 1.0 );
}`;

export function createAo({ drawer, scale = 0.5 }) {
  const mk = (name) => makeTarget(4, 4, { type: THREE.UnsignedByteType, format: THREE.RedFormat, filter: THREE.NearestFilter, name });
  const raw = mk('club.post.ao'), blur = mk('club.post.aoBlur');
  const proj = new THREE.Vector4();
  const full = new THREE.Vector2(1, 1);
  const uAo = {
    tDepth: { value: null }, uProj: { value: proj }, uFull: { value: full }, uTexel: { value: new THREE.Vector2() }, uAoTexel: { value: new THREE.Vector2() },
    uRadius: { value: 0.06 }, uProjScale: { value: 1 }, uIntensity: { value: 1.0 }, uFar: { value: 9.0 },
  };
  const uBlur = { tAo: { value: raw.texture }, tDepth: { value: null }, uProj: uAo.uProj, uFull: uAo.uFull, uAoTexel: uAo.uAoTexel };
  const uApply = { tAo: { value: blur.texture }, tDepth: { value: null }, uProj: uAo.uProj, uFull: uAo.uFull, uAoSize: { value: new THREE.Vector2() }, uAmount: { value: 1 } };
  const mAo = fsMaterial('club.post.ao', AO_FRAG, uAo);
  const mBlur = fsMaterial('club.post.aoBlur', BLUR_FRAG, uBlur);
  // multiply into the destination: colour = dst * src, alpha kept
  const mApply = fsMaterial('club.post.aoApply', APPLY_FRAG, uApply, {
    blending: THREE.CustomBlending,
    extra: { blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor },
  });
  // the same lookup written opaque: the debug view
  const mShow = fsMaterial('club.post.aoShow', APPLY_FRAG, uApply);

  const state = { intensity: 0.8, radius: 0.06 };
  return {
    state,
    /** Compute and blur the occlusion for this frame. `depth` = the linear depth texture; P = camera.projectionMatrix.elements. */
    compute(renderer, depthTex, fullW, fullH, P) {
      const w = Math.max(1, Math.round(fullW * scale)), h = Math.max(1, Math.round(fullH * scale));
      fitTarget(raw, w, h); fitTarget(blur, w, h);
      proj.set(2 / P[0], 2 / P[5], (P[8] - 1) / P[0], (P[9] - 1) / P[5]);
      uAo.tDepth.value = depthTex; uBlur.tDepth.value = depthTex; uApply.tDepth.value = depthTex;
      uAo.uTexel.value.set(1 / fullW, 1 / fullH); full.set(fullW, fullH);
      uAo.uAoTexel.value.set(1 / w, 1 / h);
      uAo.uProjScale.value = 0.5 * h * P[5];
      uAo.uRadius.value = state.radius; uAo.uIntensity.value = state.intensity;
      uApply.uAoSize.value.set(w, h);
      drawer.draw(renderer, mAo, raw);
      drawer.draw(renderer, mBlur, blur);
    },
    /** Multiply the occlusion into `target` (the scene buffer), eased by `amount`. */
    apply(renderer, target, amount) { uApply.uAmount.value = amount; drawer.draw(renderer, mApply, target); },
    /** Debug: write the occlusion itself (grey) into `target`. */
    show(renderer, target) { uApply.uAmount.value = 1; drawer.draw(renderer, mShow, target); },
    targets() { return [raw, blur]; },
    bytes() { return targetBytes(raw) + targetBytes(blur); },
    dispose() { raw.dispose(); blur.dispose(); mAo.dispose(); mBlur.dispose(); mApply.dispose(); mShow.dispose(); },
  };
}
