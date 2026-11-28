// Copyright (c) Meta Platforms, Inc. and affiliates.

// post/dof.js — depth of field for the room behind the table: a far-field disc gather at a fixed working resolution and a
// full-resolution composite that leaves every sharp pixel EXACTLY as it came in.
//
// There is no near field (post/focus.js): the lens blurs only what lies behind the far end of the table, and the guard
// (post/guard.js) multiplies the blur radius by 0 inside the table volume whatever the lens says.
//
// Draws per frame (full-screen triangles). W = the working resolution, the frame divided by an integer `scale`: 2 up to a
// frame 1440 px high, then the smallest scale that keeps W at most DOF_WORK_ROWS (720) rows (3 at 2160p, 6 at 4320p). So W
// has 360 to 720 rows above 720p, and the gather's cost and the bytes of its two targets stop growing at a 1440 px frame.
// Why not a fixed 360 rows at any size (round 2): the room's blur is a fixed fraction of the frame height, so in working
// texels it is the same at every size, and small: 1.4 to 2.4 texels at the bar. A disc of that radius is a block of 3 x 3 to
// 5 x 5 texels; a lamp several times over the white point saturates every texel of the block, so the outline that shows
// is the block's, and the composite magnifies it by `scale` with straight, hard sides: 6 to 10 px at 720p, where it passes
// as a dot, but a 12 to 20 px rounded square at scale 4 (a 1440 px frame) and 18 to 30 px at scale 6. At scale 2 a 1440 px
// frame has 2.8 to 4.8 texels of radius and 2 px steps: rounder than the 720p disc that was accepted.
//   1 prefilter  W   colour + far radius per working texel. A texel that straddles an edge takes the LEAST blurred surface's
//                    radius and only the colours that belong to it, so a sharp thing (a ball, the rail edge) never enters the
//                    blurred field around it.
//   2 gather     W   every texel of the disc around the centre, one fetch each (no sparse taps, no dither, no fill pass): a
//                    small bright source becomes a filled disc with a one-texel edge. A sample spreads no farther than
//                    min(its radius, the centre's): nothing sharp or less blurred leaks into a more blurred neighbour, and a
//                    disc ends where a sharper surface begins; the part of a disc a sharper surface covers counts with the
//                    centre's own colour, so the level of what is left does not change.
//   3 composite  F   a pixel whose own radius is under 0.6 px, or that touches one under 0.5 px (the silhouette rule), is
//                    written back unchanged, bit for bit; the others take the far field (4 working texels, weighted by
//                    likeness of radius) blended in by their radius. An eased lens (a gate between 0 and 1) dissolves that
//                    picture into the sharp frame in a compressed space (the end of the shader); at 1 the path is the plain one.
// The silhouette rule: the scene buffer is multisampled, colour is the average of the samples but depth is ONE sample, so a
// pixel on the edge of a sharp thing can carry the room's depth. Such a pixel always touches a pixel of the sharp thing, and
// it is kept; the price is a one-pixel rim of unblurred room along a sharp silhouette.
import * as THREE from 'three';
import { fsMaterial, makeTarget, fitTarget, targetBytes } from './fsq.js';
import { DISSOLVE_K } from './focus.js';

export const DOF_WORK_ROWS = 720;     // the working resolution never has more rows than this (and never more than half the frame's)
export const DOF_MAX_SCALE = 6;
export const DOF_GATHER_MAX = 8;      // largest disc radius of the gather, working pixels (the far cap is 7.92 at 720 rows)
/**
 * The integer downscale of the working resolution for a frame `fullH` pixels high: at least 2, and large enough to keep the
 * working rows at or under `rows` (a caller may pass fewer rows: a cheaper, blockier far field above 720p).
 */
export function workScale(fullH, rows = DOF_WORK_ROWS) {
  const r = rows >= 90 ? rows : DOF_WORK_ROWS;
  return Math.min(DOF_MAX_SCALE, Math.max(2, Math.ceil(fullH / r - 1e-9)));
}

const LENS = /* glsl */`
uniform sampler2D tDepth;   // the scene pass's own depth texture (perspective depth, one sample per pixel)
uniform vec2 uNearFar;      // camera near, far
uniform vec2 uFull;         // full-resolution size in texels
uniform vec4 uProj;         // view.xy = ( uv * uProj.xy + uProj.zw ) * distance
uniform mat4 uCamWorld;     // camera.matrixWorld
uniform vec3 uBoxMin;       // the table volume, world metres (post/guard.js)
uniform vec3 uBoxMax;
uniform float uSoft;        // the guard falls off over this distance outside the box; < 0: no guard (tools)
uniform vec3 uLens;         // 1 / zoneFar, far gain (full-resolution pixels per 1/metre), largest radius (pixels)
float viewDepth( ivec2 t ) {
  float z = texelFetch( tDepth, t, 0 ).r;
  return uNearFar.x * uNearFar.y / ( uNearFar.y - z * ( uNearFar.y - uNearFar.x ) );
}
float guardAt( ivec2 t, float d ) {
  if ( uSoft < 0.0 ) return 0.0;
  vec2 uv = ( vec2( t ) + 0.5 ) / uFull;
  vec3 pw = ( uCamWorld * vec4( ( uv * uProj.xy + uProj.zw ) * d, - d, 1.0 ) ).xyz;
  vec3 q = max( max( uBoxMin - pw, pw - uBoxMax ), 0.0 );
  return 1.0 - smoothstep( 0.0, uSoft, length( q ) );
}
// blur radius of texel t in full-resolution pixels: 0 up to the far end of the table, and 0 inside the table volume
float cocAt( ivec2 t ) {
  t = clamp( t, ivec2( 0 ), ivec2( uFull ) - 1 );
  float d = viewDepth( t );
  float r = clamp( ( uLens.x - 1.0 / d ) * uLens.y, 0.0, uLens.z );
  return r * ( 1.0 - guardAt( t, d ) );
}
`;

const PRE_FRAG = LENS + /* glsl */`
uniform sampler2D tColor;
uniform int uScale;
out vec4 outPre;
const int MAXN = ${DOF_MAX_SCALE * DOF_MAX_SCALE};
void main() {
  ivec2 base = ivec2( gl_FragCoord.xy ) * uScale;
  ivec2 lim = ivec2( uFull ) - 1;
  vec3 c[MAXN]; float k[MAXN];
  float front = 1e9;
  int n = 0;
  for ( int j = 0; j < uScale; j ++ ) for ( int i = 0; i < uScale; i ++ ) {
    ivec2 t = min( base + ivec2( i, j ), lim );
    vec3 s = texelFetch( tColor, t, 0 ).rgb;
    c[n] = ( s.r + s.g + s.b < 1e6 ) ? clamp( s, 0.0, 64.0 ) : vec3( 0.0 );   // no NaN, no Inf into the gather
    k[n] = cocAt( t );
    front = min( front, k[n] );
    n ++;
  }
  vec3 acc = vec3( 0.0 ); float w = 0.0;
  for ( int i = 0; i < n; i ++ ) {
    float wi = max( 1.0 - abs( k[i] - front ) / 1.5, 0.0 ) + 1e-4;
    acc += c[i] * wi; w += wi;
  }
  outPre = vec4( acc / w, front / float( uScale ) );   // radius in working pixels
}`;

const GATHER_FRAG = /* glsl */`
uniform sampler2D tPre;    // working-resolution colour + far radius in working pixels
uniform float uBoost;      // extra weight of bright samples: a lamp keeps a defined disc
uniform float uEdge;       // slope of the disc's edge (1 = a one-texel ramp)
out vec4 outFar;
const float NMAX = ${DOF_GATHER_MAX}.0;
float lum( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
void main() {
  ivec2 ip = ivec2( gl_FragCoord.xy );
  vec4 c0 = texelFetch( tPre, ip, 0 );
  float r0 = min( c0.a, NMAX );
  if ( r0 < 0.5 ) { outFar = c0; return; }
  ivec2 lim = textureSize( tPre, 0 ) - 1;
  int n = int( ceil( r0 ) );
  vec3 acc = vec3( 0.0 ); float w = 0.0;
  for ( int y = - n; y <= n; y ++ ) for ( int x = - n; x <= n; x ++ ) {
    vec4 s = texelFetch( tPre, clamp( ip + ivec2( x, y ), ivec2( 0 ), lim ), 0 );
    float dist = length( vec2( x, y ) );
    // the centre's disc at this offset, and the part of it the sample really fills: its own disc, no larger than the centre's
    float wd = clamp( ( r0 - dist ) * uEdge + 0.5, 0.0, 1.0 );
    float ws = clamp( ( min( s.a, r0 ) - dist ) * uEdge + 0.5, 0.0, 1.0 );
    float b = 1.0 + uBoost * smoothstep( 1.0, 8.0, lum( s.rgb ) );
    // where a sharper surface covers the disc the centre's own colour stands in for the room behind it, so the sum is always
    // over the whole disc: a lamp's disc keeps its level right up to a sharp silhouette instead of brightening beside it
    acc += s.rgb * ( ws * b ) + c0.rgb * ( wd - ws );
    w += ws * b + ( wd - ws );
  }
  outFar = vec4( acc / max( w, 1e-6 ), c0.a );
}`;

const COMP_FRAG = LENS + /* glsl */`
uniform sampler2D tColor;   // the sharp frame, full resolution
uniform sampler2D tFar;     // the far field, working resolution (nearest)
uniform float uScale;
uniform float uAmount;      // an eased lens (0..1): how much of the lens's picture is in the frame
uniform float uDissolve;    // 1: uAmount dissolves in a display-like space (see below); 0: a plain mix in linear light
uniform int uDebug;         // 0 picture, 1 blur radius picture, 2 depth picture, 3 probe (numbers, into a float target)
out vec4 outColor;
void main() {
  ivec2 ip = ivec2( gl_FragCoord.xy );
  vec4 sharp = texelFetch( tColor, ip, 0 );
  float px = cocAt( ip );
  float blend = smoothstep( 0.3 * uScale, 1.2 * uScale, px );
  float rim = 0.0;
  if ( blend > 0.0 ) {
    // the silhouette rule: the least blurred of the eight neighbours decides
    float m = px;
    for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) { if ( i != 0 || j != 0 ) m = min( m, cocAt( ip + ivec2( i, j ) ) ); }
    float keep = smoothstep( 0.5, 1.5, m );
    rim = 1.0 - keep;
    blend *= keep;
  }
  blend *= uAmount;
  if ( uDebug == 3 ) {
    float d = viewDepth( clamp( ip, ivec2( 0 ), ivec2( uFull ) - 1 ) );
    outColor = vec4( px, blend, guardAt( ip, d ), d ); return;
  }
  if ( uDebug == 1 ) {
    // grey = the picture; green = inside the table volume (the guard); blue = blur radius (full at the largest radius of this
    // frame); red = a pixel kept sharp by the silhouette rule; a pixel that will be written back unchanged has no blue at all
    float d = viewDepth( clamp( ip, ivec2( 0 ), ivec2( uFull ) - 1 ) );
    float g = dot( sharp.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) * 0.3;
    outColor = vec4( g + rim * 1.2, g + 0.22 * guardAt( ip, d ), g + ( blend > 0.0 ? 0.15 + 1.6 * px / max( uLens.z, 1.0 ) : 0.0 ), sharp.a ); return;
  }
  if ( uDebug == 2 ) {
    float d = viewDepth( clamp( ip, ivec2( 0 ), ivec2( uFull ) - 1 ) );
    float v = fract( d * 2.0 ) * 0.25 + 0.6 / ( 1.0 + d ); outColor = vec4( v, v, v, sharp.a ); return;
  }
  if ( blend <= 0.0 ) { outColor = sharp; return; }   // every sharp pixel: the input, bit for bit
  // far field: the 4 nearest working texels, bilinear weights times likeness of blur radius (a working texel that belongs to
  // a sharper surface does not bleed past its silhouette)
  vec2 st = ( vec2( ip ) + 0.5 ) / uScale - 0.5;
  vec2 f = fract( st );
  ivec2 i0 = ivec2( floor( st ) );
  ivec2 lim = textureSize( tFar, 0 ) - 1;
  float rw = px / uScale;
  vec3 acc = vec3( 0.0 ); float w = 0.0;
  for ( int k = 0; k < 4; k ++ ) {
    ivec2 o = ivec2( k & 1, k >> 1 );
    vec4 s = texelFetch( tFar, clamp( i0 + o, ivec2( 0 ), lim ), 0 );
    float bw = ( o.x == 1 ? f.x : 1.0 - f.x ) * ( o.y == 1 ? f.y : 1.0 - f.y );
    float wi = bw * ( 1.0 - clamp( abs( s.a - rw ) / 1.5, 0.0, 0.98 ) ) + 1e-5;
    acc += s.rgb * wi; w += wi;
  }
  // when none of the four belongs to this pixel's surface (a one-pixel notch of room between sharp things) it keeps its colour
  vec3 farCol = mix( sharp.rgb, acc / w, smoothstep( 0.02, 0.2, w ) );
  if ( uAmount < 1.0 && uDissolve > 0.5 ) {
    // An eased lens. A lamp's disc is many times over the white point: mixed in linear light it stays white at full size
    // down to the last step and then jumps to its point (no ease at all for the brightest thing in the room). So the lens's
    // picture at full strength is dissolved into the sharp frame in a compressed space, c / ( 1 + K max( c ) ), where a disc
    // fades as evenly as the dim wall beside it. K = DISSOLVE_K (post/focus.js, which mirrors this for the node arm).
    vec3 lens = mix( sharp.rgb, farCol, blend / max( uAmount, 1e-4 ) );
    const float K = ${DISSOLVE_K.toFixed(1)};
    vec3 a = sharp.rgb / ( 1.0 + K * max( sharp.r, max( sharp.g, sharp.b ) ) );
    vec3 b = lens / ( 1.0 + K * max( lens.r, max( lens.g, lens.b ) ) );
    vec3 m = mix( a, b, uAmount );
    outColor = vec4( m / max( 1.0 - K * max( m.r, max( m.g, m.b ) ), 1e-4 ), sharp.a );
    return;
  }
  outColor = vec4( mix( sharp.rgb, farCol, blend ), sharp.a );
}`;

export function createDof({ drawer }) {
  const HF = THREE.HalfFloatType;
  const pre = makeTarget(4, 4, { type: HF, filter: THREE.NearestFilter, name: 'club.post.dofPre' });
  const far = makeTarget(4, 4, { type: HF, filter: THREE.NearestFilter, name: 'club.post.dofFar' });
  let probeRT = null;

  // the lens and the guard: one set of uniform objects shared by the prefilter and the composite
  const shared = {
    tDepth: { value: null }, uNearFar: { value: new THREE.Vector2(0.01, 50) }, uFull: { value: new THREE.Vector2(1, 1) },
    uProj: { value: new THREE.Vector4() }, uCamWorld: { value: new THREE.Matrix4() },
    uBoxMin: { value: new THREE.Vector3(-1, -1, -1) }, uBoxMax: { value: new THREE.Vector3(1, 1, 1) }, uSoft: { value: 0.03 },
    uLens: { value: new THREE.Vector3(0.5, 0, 0) },
  };
  const uPre = { ...shared, tColor: { value: null }, uScale: { value: 2 } };
  const uGather = { tPre: { value: pre.texture }, uBoost: { value: 1.5 }, uEdge: { value: 1 } };
  const uComp = { ...shared, tColor: { value: null }, tFar: { value: far.texture }, uScale: { value: 2 }, uAmount: { value: 1 }, uDissolve: { value: 1 }, uDebug: { value: 0 } };
  const mPre = fsMaterial('club.post.dofPre', PRE_FRAG, uPre);
  const mGather = fsMaterial('club.post.dofGather', GATHER_FRAG, uGather);
  const mComp = fsMaterial('club.post.dofComposite', COMP_FRAG, uComp);
  function bind({ color, depthTex, fullW, fullH, near, far: farPlane, scale }) {
    shared.tDepth.value = depthTex;
    shared.uNearFar.value.set(near, farPlane);
    shared.uFull.value.set(fullW, fullH);
    uPre.tColor.value = color; uComp.tColor.value = color;
    uPre.uScale.value = scale; uComp.uScale.value = scale;
  }

  return {
    uniforms: { shared, gather: uGather, comp: uComp },
    programs: ['club.post.dofPre', 'club.post.dofGather', 'club.post.dofComposite'],
    /**
     * The lens of this frame. invFar = 1 / zoneFar; gain = far gain in full-resolution pixels per 1/metre; cap = the largest
     * radius in full-resolution pixels (never above the gather's reach). Returns the cap in force.
     */
    setLens(invFar, gain, cap, scale) {
      const c = Math.min(cap, DOF_GATHER_MAX * scale);
      shared.uLens.value.set(invFar, gain, c);
      return c;
    },
    /** The guard of this frame: the table box (world), the fall-off distance (< 0 = off), and the camera. P = projectionMatrix.elements. */
    setGuard(box, soft, camWorld, P) {
      if (box) { shared.uBoxMin.value.set(box.min[0], box.min[1], box.min[2]); shared.uBoxMax.value.set(box.max[0], box.max[1], box.max[2]); }
      shared.uSoft.value = box && soft >= 0 ? Math.max(1e-4, soft) : -1;
      shared.uCamWorld.value.copy(camWorld);
      shared.uProj.value.set(2 / P[0], 2 / P[5], (P[8] - 1) / P[0], (P[9] - 1) / P[5]);
    },
    /**
     * Blur `color` (the scene buffer's texture, full resolution) into `target`. depthTex = the scene pass's depth texture of
     * the same buffer; near / far = the camera planes; scale = workScale(fullH) or a tool override; debug 0 | 1 | 2.
     */
    render(renderer, { color, depthTex, fullW, fullH, near, far: farPlane, target, amount, debug = 0, scale }) {
      const ww = Math.max(1, Math.floor(fullW / scale)), wh = Math.max(1, Math.floor(fullH / scale));
      bind({ color, depthTex, fullW, fullH, near, far: farPlane, scale });
      uComp.uAmount.value = amount; uComp.uDebug.value = debug;
      if (debug === 0) {
        fitTarget(pre, ww, wh); fitTarget(far, ww, wh);
        drawer.draw(renderer, mPre, pre);
        drawer.draw(renderer, mGather, far);
      }
      drawer.draw(renderer, mComp, target);
    },
    /**
     * Tools only (a GPU read-back: never per frame). The numbers of the frame described by `args` (as render()), one RGBA
     * float texel per pixel, rows bottom-up: blur radius (px), blend factor (0 = the pixel is written back unchanged), guard
     * weight, view depth (m). Call it where the depth texture is valid (inside the lens pass). null when the read-back fails.
     */
    probe(renderer, args, amount = 1) {
      if (!args?.depthTex || !(args.fullW > 0)) return null;
      probeRT ??= makeTarget(4, 4, { type: THREE.FloatType, filter: THREE.NearestFilter, name: 'club.post.dofProbe' });
      fitTarget(probeRT, args.fullW, args.fullH);
      bind(args);
      const was = { amount: uComp.uAmount.value, debug: uComp.uDebug.value, target: renderer.getRenderTarget() };
      uComp.uAmount.value = amount; uComp.uDebug.value = 3;
      drawer.draw(renderer, mComp, probeRT);
      uComp.uAmount.value = was.amount; uComp.uDebug.value = was.debug;
      let data = new Float32Array(args.fullW * args.fullH * 4);
      try { renderer.readRenderTargetPixels(probeRT, 0, 0, args.fullW, args.fullH, data); } catch { data = null; }
      renderer.setRenderTarget(was.target);
      probeRT.dispose(); probeRT = null;
      return data ? { w: args.fullW, h: args.fullH, data } : null;
    },
    targets() { return [pre, far]; },
    bytes() { return targetBytes(pre) + targetBytes(far); },
    dispose() { pre.dispose(); far.dispose(); probeRT?.dispose(); for (const m of [mPre, mGather, mComp]) m.dispose(); },
  };
}
