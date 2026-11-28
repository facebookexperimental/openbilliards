// Copyright (c) Meta Platforms, Inc. and affiliates.

// occ/baker.js — the GPU baker behind the table and floor visibility maps (CONTRACT.md section 4.2).
//
// One bake = a short list of steps; the service runs one step per frame (or all of them at once for a tool). No GPU read-back.
//
//   1. blockers   proxies of the table's meshes (same geometry objects, a height material) in a private scene, so the app's
//                 scene graph, materials and render state are never touched
//   2. heights    two top-down orthographic renders of the blockers into 16-bit height maps:
//                   T(x,z) = the highest surface (seen from above)
//                   U(x,z) = the lowest surface above the base plane seen from that plane looking up, when it faces down
//                            (the underside of the cushion nose, the table's underside over the floor); 0 when the first thing
//                            above the plane is the inside of a solid, or nothing
//                 a column of the table is then solid for U < y < T: enough for a rail with an overhanging nose over a bed, and
//                 for a table top on legs over a floor
//   3. reach      a low-resolution map of the highest T within the reach of a lamp ray (RG) and of an ambient ray (BA): a
//                 start point at or above it sees everything, so open cloth skips its lamp rays and flat rail tops cost
//                 one fetch
//   4. tiles      rows of the map, a few per step. Two start points per texel: bed level (RG) and on the top surface where
//                 it is raised (BA). Per start point:
//                   lamp     rays toward stratified points of every lamp rectangle (weighted cos.cos/d², the irradiance
//                            kernel of a horizontal emitter on a horizontal receiver), marched through the height maps
//                   ambient  the visibility of the ROOM's light, not of a uniform sky: per azimuth the height maps are
//                            sampled outward (steps growing with the square of the index, millimetres at the start, the
//                            whole table at the end) and every sample blocks the band of elevations between its underside
//                            and its top in a 32-bit mask; what stays open is summed with the weight L(e).sin e.cos e, the
//                            irradiance kernel of a horizontal receiver times a radiance model of a room lit along its
//                            walls: full below uSky.x, falling to uSky.z of that above uSky.y (the ceiling over a table
//                            lamp is dark and the lamp's own light is not ambient). So a rail 5 cm high takes a quarter of
//                            the ambient light 5 cm in front of it and still a few percent at 20 cm; a uniform sky would
//                            say a few percent at 5 cm.
//   5. resolve    one pass: values of texels whose start point is inside a solid are filled from their free neighbours (so a
//                 bilinear lookup at a contact line never reads garbage), the rest get a small blur among their own kind
//                 (lamp 3x3 and ambient 5x5 at bed level, 5x5 on the top surface)
import * as THREE from 'three';

const PACK = /* glsl */`
vec2 pack16( float v ) {
  float q = floor( clamp( v, 0.0, 1.0 ) * 65535.0 + 0.5 );
  float hi = floor( q / 256.0 );
  return vec2( hi, q - hi * 256.0 ) / 255.0;
}
float unpack16( vec2 v ) {
  return dot( floor( v * 255.0 + 0.5 ), vec2( 256.0, 1.0 ) ) / 65535.0;
}
`;

// height capture: the vertex shader projects world (x, z) straight to the map and world y to depth, so a texel's (u, v) is its
// world position by construction and no camera convention is involved
const HEIGHT_VS = /* glsl */`
uniform vec4 uRect;   // minX, minZ, sizeX, sizeZ
uniform vec3 uYMap;   // yLo, yHi, base plane y of the look-up pass
uniform float uUp;    // 0: from above (highest wins), 1 or 2: from the base plane looking up (lowest wins; 2: shells are thin)
varying float vY;
varying vec3 vN;
void main() {
  vec4 wp = vec4( position, 1.0 );
  vec3 n = normal;
  #ifdef USE_INSTANCING
  wp = instanceMatrix * wp;
  n = mat3( instanceMatrix ) * n;
  #endif
  wp = modelMatrix * wp;
  vY = wp.y;
  vN = mat3( modelMatrix ) * n;
  vec2 ndc = ( wp.xz - uRect.xy ) / uRect.zw * 2.0 - 1.0;
  float z = uUp > 0.5
    ? ( wp.y - uYMap.z ) / ( uYMap.y - uYMap.z ) * 2.0 - 1.0
    : 1.0 - ( wp.y - uYMap.x ) / ( uYMap.y - uYMap.x ) * 2.0;
  gl_Position = vec4( ndc, z, 1.0 );
}`;
const HEIGHT_FS = /* glsl */`
uniform vec3 uYMap;
uniform float uUp;
varying float vY;
varying vec3 vN;
${PACK}
void main() {
  float h = ( vY - uYMap.x ) / ( uYMap.y - uYMap.x );
  // looking up: a face whose normal points down has air below it; a face that looks up, seen from underneath, means the base
  // plane is inside a solid there: solid from the base (0). The shading normal decides (a mirrored rail can carry the opposite
  // winding and still be lit correctly); without a normal attribute the winding does: looking up, (x, z, y) is a proper view
  // of the scene, so gl_FrontFacing is true for a down-facing face.
  bool down = dot( vN, vN ) > 1e-12 ? vN.y < 0.0 : gl_FrontFacing;
  // uUp = 2 (a floor map): an open shell seen from underneath (a pocket cup, a tray: one-sided sheets with the normal up) is a
  // thin blocker at its own height, not a solid standing on the floor
  if ( uUp > 0.5 && uUp < 1.5 && ! down ) h = 0.0;
  gl_FragColor = vec4( pack16( h ), 0.0, 1.0 );
}`;

const FULL_VS = /* glsl */`
in vec3 position;
void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const COMBINE_FS = /* glsl */`
precision highp float;
precision highp sampler2D;
uniform sampler2D uTop;
uniform sampler2D uUnder;
out vec4 o;
void main() {
  ivec2 c = ivec2( gl_FragCoord.xy );
  o = vec4( texelFetch( uTop, c, 0 ).rg, texelFetch( uUnder, c, 0 ).rg );
}`;

// reach map, pass A: the highest T of each block of the height map
const REACH_A_FS = /* glsl */`
precision highp float;
precision highp sampler2D;
uniform sampler2D uH;
uniform int uBlock;
out vec4 o;
${PACK}
void main() {
  ivec2 c = ivec2( gl_FragCoord.xy ) * uBlock;
  ivec2 lim = textureSize( uH, 0 ) - 1;
  float m = 0.0;
  for ( int j = 0; j < 16; j ++ ) {
    if ( j >= uBlock ) break;
    for ( int i = 0; i < 16; i ++ ) {
      if ( i >= uBlock ) break;
      m = max( m, unpack16( texelFetch( uH, min( c + ivec2( i, j ), lim ), 0 ).rg ) );
    }
  }
  o = vec4( pack16( m ), 0.0, 1.0 );
}`;
// pass B: the highest of the blocks within the reach radius (in blocks, per axis)
const REACH_B_FS = /* glsl */`
precision highp float;
precision highp sampler2D;
uniform sampler2D uA;
uniform ivec2 uK;    // lamp-ray reach, in blocks per axis
uniform ivec2 uK2;   // ambient reach (>= uK)
out vec4 o;
${PACK}
void main() {
  ivec2 c = ivec2( gl_FragCoord.xy );
  ivec2 lim = textureSize( uA, 0 ) - 1;
  float m = 0.0, m2 = 0.0;
  for ( int j = - 40; j <= 40; j ++ ) {
    if ( j < - uK2.y || j > uK2.y ) continue;
    for ( int i = - 40; i <= 40; i ++ ) {
      if ( i < - uK2.x || i > uK2.x ) continue;
      float v = unpack16( texelFetch( uA, clamp( c + ivec2( i, j ), ivec2( 0 ), lim ), 0 ).rg );
      m2 = max( m2, v );
      if ( abs( i ) <= uK.x && abs( j ) <= uK.y ) m = max( m, v );
    }
  }
  o = vec4( pack16( m ), pack16( m2 ) );
}`;

const bakeFS = ({ lampA, lampB, az, sa, steps }) => /* glsl */`
precision highp float;
precision highp sampler2D;
precision highp int;
#define NLA ${lampA}
#define NLB ${lampB}
#define NAZ ${az}
#define NSA ${sa}
#define NS ${steps}
uniform sampler2D uH;       // RG = T, BA = U (16 bit each)
uniform sampler2D uReach;   // the highest T within reach of a lamp ray (RG) and of an ambient ray (BA)
uniform vec2 uSize;
uniform vec4 uRect;         // minX, minZ, sizeX, sizeZ
uniform vec3 uY;            // yLo, yHi - yLo, the height above which nothing blocks
uniform vec3 uLampPos[ 4 ];
uniform vec2 uLampHalf[ 4 ];
uniform int uLampCount;
uniform vec4 uStart;        // bed-layer start y, lift of the top-layer start, T above which a texel is raised, unused
uniform vec4 uAo;           // ambient reach, unused, height bias, unused
uniform vec4 uSky;          // room radiance model: full below this elevation, down to .z of it above this one (radians), unused
uniform vec4 uOutline;      // table outline: centre x, centre z, half x, half z; half x < 0 on a floor map (every texel is traced)
out vec4 o;
${PACK}
vec2 heights( vec2 xz ) {
  vec4 t = textureLod( uH, ( xz - uRect.xy ) / uRect.zw, 0.0 );
  return uY.x + uY.y * vec2( unpack16( t.rg ), unpack16( t.ba ) );
}
vec2 hash2( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.xx + q.yz ) * q.zy );
}
// distance to the first solid sample along p + d.t, t in (0, tEnd), or -1
float trace( vec3 p, vec3 d, float tEnd, float jit ) {
  float dt = tEnd / float( NS );
  for ( int i = 0; i < NS; i ++ ) {
    float t = ( float( i ) + jit ) * dt;
    vec3 q = p + d * t;
    vec2 h = heights( q.xz );
    if ( q.y < h.x - uAo.z && q.y > h.y + uAo.z ) return t;
  }
  return - 1.0;
}
float lampVisibility( vec3 p, vec2 rnd ) {
  float sum = 0.0, wsum = 0.0;
  for ( int e = 0; e < 4; e ++ ) {
    if ( e >= uLampCount ) break;
    bool alongX = uLampHalf[ e ].x >= uLampHalf[ e ].y;
    for ( int i = 0; i < NLA; i ++ ) {
      for ( int j = 0; j < NLB; j ++ ) {
        vec2 cell = vec2( float( i ), float( j ) );
        vec2 s = ( cell + fract( rnd + cell.yx * vec2( 0.6180340, 0.3819660 ) ) ) / vec2( float( NLA ), float( NLB ) ) * 2.0 - 1.0;
        if ( ! alongX ) s = s.yx;
        vec3 S = uLampPos[ e ] + vec3( s.x * uLampHalf[ e ].x, 0.0, s.y * uLampHalf[ e ].y );
        vec3 d = S - p;
        float dist = length( d );
        d /= dist;
        if ( d.y <= 1e-4 ) continue;
        float w = d.y * d.y / ( dist * dist );
        float tEnd = min( dist, ( uY.z - p.y ) / d.y );
        float hit = tEnd > 0.0 ? trace( p, d, tEnd, fract( rnd.x + rnd.y + float( i * NLB + j ) * 0.7548777 ) ) : - 1.0;
        sum += hit < 0.0 ? w : 0.0;
        wsum += w;
      }
    }
  }
  return wsum > 0.0 ? sum / wsum : 1.0;
}
float skyWeight( float e ) {
  return mix( 1.0, uSky.z, smoothstep( uSky.x, uSky.y, e ) ) * sin( e ) * cos( e );
}
float ambient( vec3 p, vec2 rnd ) {
  const float DE = 1.5707963268 / 32.0;
  float openW = 0.0, allW = 0.0;
  for ( int i = 0; i < NAZ; i ++ ) {
    float phi = ( float( i ) + rnd.x ) / float( NAZ ) * 6.28318530718;
    vec2 dir = vec2( cos( phi ), sin( phi ) );
    float jit = fract( rnd.y + float( i ) * 0.6180340 );
    float dith = fract( rnd.x * 5.0 + rnd.y * 3.0 + float( i ) * 0.7548777 );
    uint mask = 0u;
    for ( int j = 0; j < NSA; j ++ ) {
      float f = ( float( j ) + jit ) / float( NSA );
      float t = max( uAo.x * f * f, 1e-5 );
      // the far half of the reach fades out (a blocker closes the same band of elevations however thin a slice of it a ray
      // still meets, so a hard reach would draw its own outline on the floor): a far sample counts with a falling chance
      if ( fract( dith * 7.0 + float( j ) * 0.6180340 ) > 1.0 - smoothstep( 0.5, 1.0, f * f ) ) continue;
      vec2 h = heights( p.xz + dir * t );
      if ( h.x > p.y + uAo.z && h.x > h.y + uAo.z ) {
        // this column is solid from its underside to its top: the elevations between the two are closed
        int b0 = clamp( int( floor( atan( max( h.y - p.y, 0.0 ), t ) / DE + dith ) ), 0, 32 );
        int b1 = clamp( int( floor( atan( h.x - p.y, t ) / DE + dith ) ), 0, 32 );
        if ( b1 > b0 ) {
          uint n = uint( b1 - b0 );
          mask |= ( n >= 32u ? 0xFFFFFFFFu : ( ( 1u << n ) - 1u ) ) << uint( b0 );
        }
      }
    }
    for ( int b = 0; b < 32; b ++ ) {
      float w = skyWeight( ( float( b ) + 0.5 ) * DE );
      allW += w;
      if ( ( ( mask >> uint( b ) ) & 1u ) == 0u ) openW += w;
    }
  }
  return allW > 0.0 ? openW / allW : 1.0;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec2 xz = uRect.xy + uv * uRect.zw;
  vec2 h = heights( xz );
  vec4 reach4 = textureLod( uReach, uv, 0.0 );
  float reach = uY.x + uY.y * unpack16( reach4.rg ), reachFar = uY.x + uY.y * unpack16( reach4.ba );
  vec2 rnd = hash2( gl_FragCoord.xy );
  vec2 bed = vec2( 1.0 );
  vec3 p = vec3( xz.x, uStart.x, xz.y );
  bool solid = p.y < h.x - uAo.z && p.y > h.y + uAo.z;
  // a bed-level point with no surface under it (beside the table, past a rounded corner, over a pocket shaft) is not a place
  // on the bed: traced, it would read "lamp hidden behind the rails", and that value would bleed onto every outer face that
  // samples the map there (it painted the table body black). It stays open; pocket walls are narrowed by depth in the shader.
  // The same holds for the outer few centimetres of the table's bounding rectangle (the rim of the body under the rail edge).
  bool outside = uOutline.z > 0.0 && ( h.x < uStart.x - 0.02
    || max( abs( xz.x - uOutline.x ) - uOutline.z, abs( xz.y - uOutline.y ) - uOutline.w ) > - 0.06 );
  if ( solid ) bed = vec2( 0.0 );
  else if ( ! outside ) {
    if ( p.y < reach - uAo.z ) bed.x = lampVisibility( p, rnd );
    if ( p.y < reachFar - uAo.z ) bed.y = ambient( p, rnd.yx );
  }
  vec2 top = bed;
  if ( h.x > uStart.z ) {
    vec3 pt = vec3( xz.x, h.x + uStart.y, xz.y );
    top = vec2( 1.0 );
    if ( pt.y < reach - uAo.z ) top.x = lampVisibility( pt, rnd );
    if ( pt.y < reachFar - uAo.z ) top.y = ambient( pt, rnd.yx );
  }
  o = vec4( bed, top );
}`;

const RESOLVE_FS = /* glsl */`
precision highp float;
precision highp sampler2D;
uniform sampler2D uRaw;
uniform sampler2D uH;
uniform vec3 uY;
uniform vec4 uStart;
uniform vec4 uAo;
uniform float uFill;   // the bed-layer value of a texel deep inside a solid (never a visible place): 1 on the table, 0 on the floor
out vec4 o;
${PACK}
void main() {
  ivec2 c = ivec2( gl_FragCoord.xy );
  ivec2 lim = textureSize( uRaw, 0 ) - 1;
  vec4 hc4 = texelFetch( uH, c, 0 );
  vec2 hc = uY.x + uY.y * vec2( unpack16( hc4.rg ), unpack16( hc4.ba ) );
  bool bedFree = ! ( uStart.x < hc.x - uAo.z && uStart.x > hc.y + uAo.z );
  bool raised = hc.x > uStart.z;
  vec2 bedSum = vec2( 0.0 ), topSum = vec2( 0.0 );
  float bedW = 0.0, topW = 0.0, ambSum = 0.0, ambW = 0.0;
  for ( int j = - 2; j <= 2; j ++ ) {
    for ( int i = - 2; i <= 2; i ++ ) {
      ivec2 q = clamp( c + ivec2( i, j ), ivec2( 0 ), lim );
      vec4 hq4 = texelFetch( uH, q, 0 );
      vec2 hq = uY.x + uY.y * vec2( unpack16( hq4.rg ), unpack16( hq4.ba ) );
      vec4 r = texelFetch( uRaw, q, 0 );
      int ring = max( abs( i ), abs( j ) );
      // the lamp term: a light 3x3 (the band under a nose is three or four texels wide: a heavier blur lifts its dark end
      // from 0.47 to 0.65)
      float blur = ring > 1 ? 0.0 : ( ring == 0 ? 4.0 : ( abs( i ) + abs( j ) == 1 ? 1.0 : 0.5 ) );
      float fill = 1.0 / ( 1.0 + float( i * i + j * j ) );
      if ( ! ( uStart.x < hq.x - uAo.z && uStart.x > hq.y + uAo.z ) ) {
        float w = bedFree ? blur : fill;
        bedSum += r.rg * w; bedW += w;
        // the ambient term has few azimuths per texel: a wider blur among free texels (it is smooth everywhere but at a
        // contact line, and there the solid side is not in the sum)
        float wa = bedFree ? exp( - float( i * i + j * j ) / 2.9 ) : fill;
        ambSum += r.g * wa; ambW += wa;
      }
      if ( hq.x > uStart.z ) {
        // the top layer is blurred wider, and across small steps (a pocket casting on a rail is a few texels of contact
        // shadow along a curved edge: at one texel it shows as teeth)
        float w = raised ? ( abs( hq.x - hc.x ) < 0.015 ? exp( - float( i * i + j * j ) / 2.9 ) : 0.0 ) : fill;
        topSum += r.ba * w; topW += w;
      }
    }
  }
  vec2 bed = bedW > 0.0 ? vec2( bedSum.x / bedW, ambSum / max( ambW, 1e-6 ) ) : vec2( uFill );
  vec2 top = topW > 0.0 ? topSum / topW : bed;
  o = vec4( bed, top );
}`;

/** What a tier spends on a bake (CONTRACT.md section 5: the atlas size comes from club.knobs.atlas; the rest follows it). */
export function bakeQuality(tier) {
  // lampA x lampB: lamp samples along / across the lamp; az: ambient azimuths; sa: ambient samples per azimuth; steps: lamp-ray
  // steps; rows: map rows per step (the slice)
  if (tier === 'lite') return { lampA: 4, lampB: 3, az: 6, sa: 12, steps: 12, rows: 16 };
  if (tier === 'high') return { lampA: 8, lampB: 4, az: 12, sa: 20, steps: 20, rows: 12 };
  return { lampA: 6, lampB: 4, az: 8, sa: 16, steps: 16, rows: 16 };
}

export function createBaker(renderer) {
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const fullMesh = new THREE.Mesh(tri, null);
  fullMesh.frustumCulled = false;
  const fullScene = new THREE.Scene();
  fullScene.matrixWorldAutoUpdate = false;
  fullScene.add(fullMesh);
  const cam = new THREE.Camera();
  const bakeMats = new Map(); // quality key -> material
  const raw = (fs, uniforms) => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: FULL_VS, fragmentShader: fs, uniforms,
    depthTest: false, depthWrite: false, toneMapped: false, name: 'club-occ-bake',
  });
  const heightMat = new THREE.ShaderMaterial({
    vertexShader: HEIGHT_VS, fragmentShader: HEIGHT_FS, side: THREE.DoubleSide, toneMapped: false, name: 'club-occ-height',
    uniforms: { uRect: { value: new THREE.Vector4() }, uYMap: { value: new THREE.Vector3() }, uUp: { value: 0 } },
  });
  const combineMat = raw(COMBINE_FS, { uTop: { value: null }, uUnder: { value: null } });
  const reachAMat = raw(REACH_A_FS, { uH: { value: null }, uBlock: { value: 8 } });
  const reachBMat = raw(REACH_B_FS, { uA: { value: null }, uK: { value: new THREE.Vector2() }, uK2: { value: new THREE.Vector2() } });
  const resolveMat = raw(RESOLVE_FS, {
    uRaw: { value: null }, uH: { value: null }, uY: { value: new THREE.Vector3() }, uStart: { value: new THREE.Vector4() }, uAo: { value: new THREE.Vector4() },
    uFill: { value: 0 },
  });
  let bytesLive = 0;

  function target(w, h, { depth = false, linear = false } = {}) {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      depthBuffer: depth, stencilBuffer: false, type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
      minFilter: linear ? THREE.LinearFilter : THREE.NearestFilter, magFilter: linear ? THREE.LinearFilter : THREE.NearestFilter,
      generateMipmaps: false, colorSpace: THREE.NoColorSpace,
    });
    rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    rt.userData = { bytes: w * h * 4 * (depth ? 2 : 1) };
    bytesLive += rt.userData.bytes;
    return rt;
  }
  function release(rt) {
    if (!rt) return;
    bytesLive -= rt.userData?.bytes ?? 0;
    rt.dispose();
  }

  // every render of the baker goes through here: the app's render target, clear state and scissor come back as they were
  const saved = { color: new THREE.Color() };
  function draw(scene, rt, { clear = true, scissor = null, override = null } = {}) {
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    const prevAlpha = renderer.getClearAlpha();
    const prevXr = renderer.xr.enabled;
    renderer.getClearColor(saved.color);
    const prevOverride = scene.overrideMaterial;
    try {
      renderer.xr.enabled = false;
      renderer.autoClear = false;
      rt.scissorTest = !!scissor;
      if (scissor) rt.scissor.set(scissor[0], scissor[1], scissor[2], scissor[3]); else rt.scissor.set(0, 0, rt.width, rt.height);
      renderer.setRenderTarget(rt);
      if (clear) { renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false); }
      scene.overrideMaterial = override;
      renderer.render(scene, cam);
    } finally {
      scene.overrideMaterial = prevOverride;
      rt.scissorTest = false;
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(saved.color, prevAlpha);
      renderer.autoClear = prevAuto;
      renderer.xr.enabled = prevXr;
    }
  }
  const full = (mat, rt, opts) => { fullMesh.material = mat; draw(fullScene, rt, opts); };

  /**
   * Proxies of every opaque visible mesh under `root`, in a private scene, plus their world bounds.
   * `skip(object)` may exclude subtrees (decals, helpers).
   */
  function collectBlockers(root, skip = null) {
    const scene = new THREE.Scene();
    scene.matrixWorldAutoUpdate = false;
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    let meshes = 0, triangles = 0;
    root.updateWorldMatrix(true, true);
    const visit = (o) => {
      if (!o.visible || (skip && skip(o) === true)) return;
      if (o.isMesh && !o.isSkinnedMesh && o.geometry?.attributes?.position) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const solid = mats.some((m) => m && m.visible !== false && m.colorWrite !== false && m.depthWrite !== false && !(m.transparent && m.opacity < 0.9));
        if (solid) {
          const g = o.geometry;
          const proxy = o.isInstancedMesh ? new THREE.InstancedMesh(g, heightMat, o.count) : new THREE.Mesh(g, heightMat);
          if (o.isInstancedMesh) proxy.instanceMatrix = o.instanceMatrix;
          proxy.matrixAutoUpdate = false;
          proxy.matrix.copy(o.matrixWorld);
          proxy.matrixWorld.copy(o.matrixWorld);
          proxy.frustumCulled = false;
          scene.add(proxy);
          meshes += 1;
          triangles += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
          if (!o.isInstancedMesh) {
            if (!g.boundingBox) g.computeBoundingBox();
            if (g.boundingBox && !g.boundingBox.isEmpty()) box.union(tmp.copy(g.boundingBox).applyMatrix4(o.matrixWorld));
          }
        }
      }
      for (const ch of o.children) visit(ch);
    };
    visit(root);
    return { scene, box, meshes, triangles: Math.round(triangles) };
  }

  /**
   * One bake as a list of steps.
   *   blockers  from collectBlockers()
   *   rect      { minX, minZ, sizeX, sizeZ } world rectangle of the map
   *   size      [w, h] texels
   *   y         { lo, hi, base, start, top }: 16-bit height range, the base plane of the look-up pass, the bed-layer start height,
   *             the height above which nothing blocks
   *   raisedAbove  T above which a texel also gets a top-surface start point (Infinity: one layer only)
   *   lamps     [{ pos: Vector3, half: Vector2 }] (1..4)
   *   ao        { reach, sky: [lo, hi, top] }: how far an ambient ray looks, and the room radiance model (elevations in radians
   *             below which the room is fully bright / above which it is `top` of that)
   *   quality   bakeQuality(tier)
   *   outline   { cx, cz, hx, hz } of the table for a table map (bed-level texels with nothing under them stay open, texels deep
   *             inside a solid are filled open); null for a floor map
   * Returns { steps: [fn], result: () => WebGLRenderTarget (final map), dispose(), count }.
   */
  function plan({ blockers, rect, size, y, raisedAbove = Infinity, lamps, ao, quality, outline = null }) {
    const [W, Hh] = size;
    const bias = 0.0004;
    const rectV = new THREE.Vector4(rect.minX, rect.minZ, rect.sizeX, rect.sizeZ);
    let topRT = null, underRT = null, heightRT = null, reachA = null, reachB = null, rawRT = null, finalRT = null;
    const steps = [];
    const yV = new THREE.Vector3(y.lo, y.hi - y.lo, y.top);
    const startV = new THREE.Vector4(y.start, 0.001, Number.isFinite(raisedAbove) ? raisedAbove : 1e9, 0);
    const aoV = new THREE.Vector4(ao.reach, 0, bias, 0);
    const skyV = new THREE.Vector4(ao.sky?.[0] ?? 0.44, ao.sky?.[1] ?? 0.79, ao.sky?.[2] ?? 0.2, 0);
    const key = `${quality.lampA}x${quality.lampB}-${quality.az}x${quality.sa}-${quality.steps}`;
    if (!bakeMats.has(key)) {
      bakeMats.set(key, raw(bakeFS(quality), {
        uH: { value: null }, uReach: { value: null }, uSize: { value: new THREE.Vector2() }, uRect: { value: new THREE.Vector4() },
        uY: { value: new THREE.Vector3() }, uLampPos: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) },
        uLampHalf: { value: [0, 1, 2, 3].map(() => new THREE.Vector2()) }, uLampCount: { value: 1 },
        uStart: { value: new THREE.Vector4() }, uAo: { value: new THREE.Vector4() }, uSky: { value: new THREE.Vector4() },
        uOutline: { value: new THREE.Vector4(0, 0, -1, -1) },
      }));
    }
    const bakeMat = bakeMats.get(key);
    const captureUniforms = (up) => {
      heightMat.uniforms.uRect.value.copy(rectV);
      heightMat.uniforms.uYMap.value.set(y.lo, y.hi, y.base);
      heightMat.uniforms.uUp.value = up;
    };
    steps.push(() => { // heights from above
      topRT = target(W, Hh, { depth: true });
      captureUniforms(0);
      draw(blockers.scene, topRT, { override: heightMat });
    });
    steps.push(() => { // lowest down-facing surface above the base plane
      underRT = target(W, Hh, { depth: true });
      captureUniforms(outline ? 1 : 2);
      draw(blockers.scene, underRT, { override: heightMat });
    });
    steps.push(() => { // one height texture; the reach map
      heightRT = target(W, Hh);
      combineMat.uniforms.uTop.value = topRT.texture;
      combineMat.uniforms.uUnder.value = underRT.texture;
      full(combineMat, heightRT);
      release(topRT); release(underRT); topRT = underRT = null;
      const block = 8;
      const rw = Math.ceil(W / block), rh = Math.ceil(Hh / block);
      reachA = target(rw, rh); reachB = target(rw, rh);
      reachAMat.uniforms.uH.value = heightRT.texture;
      reachAMat.uniforms.uBlock.value = block;
      full(reachAMat, reachA);
      // the farthest a lamp ray travels below the blocking height: from the bed plane at its flattest (the far corner of the
      // map to the far corner of a lamp); an ambient ray looks ao.reach far
      let flat = 0;
      for (const l of lamps) {
        const dx = Math.max(Math.abs(rect.minX - l.pos.x), Math.abs(rect.minX + rect.sizeX - l.pos.x)) + l.half.x;
        const dz = Math.max(Math.abs(rect.minZ - l.pos.z), Math.abs(rect.minZ + rect.sizeZ - l.pos.z)) + l.half.y;
        flat = Math.max(flat, Math.hypot(dx, dz) / Math.max(l.pos.y - y.top, 0.05));
      }
      const reach = flat * Math.max(y.top - y.start, 0) + 0.01;
      const blocks = (r) => [Math.min(40, Math.ceil(r / (rect.sizeX / rw)) + 1), Math.min(40, Math.ceil(r / (rect.sizeZ / rh)) + 1)];
      reachBMat.uniforms.uA.value = reachA.texture;
      reachBMat.uniforms.uK.value.set(...blocks(reach));
      reachBMat.uniforms.uK2.value.set(...blocks(Math.max(reach, ao.reach)));
      full(reachBMat, reachB);
      release(reachA); reachA = null;
      rawRT = target(W, Hh);
    });
    const rows = Math.max(1, quality.rows | 0);
    for (let y0 = 0; y0 < Hh; y0 += rows) {
      steps.push(() => {
        const u = bakeMat.uniforms;
        u.uH.value = heightRT.texture; u.uReach.value = reachB.texture;
        u.uSize.value.set(W, Hh); u.uRect.value.copy(rectV); u.uY.value.copy(yV);
        const n = Math.min(4, lamps.length);
        for (let i = 0; i < 4; i++) { const l = lamps[Math.min(i, n - 1)]; u.uLampPos.value[i].copy(l.pos); u.uLampHalf.value[i].copy(l.half); }
        u.uLampCount.value = n;
        u.uStart.value.copy(startV); u.uAo.value.copy(aoV); u.uSky.value.copy(skyV);
        if (outline) u.uOutline.value.set(outline.cx, outline.cz, outline.hx, outline.hz); else u.uOutline.value.set(0, 0, -1, -1);
        full(bakeMat, rawRT, { clear: false, scissor: [0, y0, W, Math.min(rows, Hh - y0)] });
      });
    }
    steps.push(() => { // fill and blur
      finalRT = target(W, Hh, { linear: true });
      const u = resolveMat.uniforms;
      u.uRaw.value = rawRT.texture; u.uH.value = heightRT.texture; u.uY.value.copy(yV); u.uStart.value.copy(startV); u.uAo.value.copy(aoV);
      u.uFill.value = outline ? 1 : 0;
      full(resolveMat, finalRT);
      if (!plan.keepScratch) { release(rawRT); release(reachB); release(heightRT); rawRT = reachB = heightRT = null; }
    });
    return {
      steps, count: steps.length,
      result: () => finalRT,
      scratch: () => ({ height: heightRT, raw: rawRT, reach: reachB }),
      dispose(keepFinal = false) {
        for (const rt of [topRT, underRT, heightRT, reachA, reachB, rawRT]) release(rt);
        topRT = underRT = heightRT = reachA = reachB = rawRT = null;
        if (!keepFinal) { release(finalRT); finalRT = null; }
      },
    };
  }
  plan.keepScratch = false; // dev pages set it to look at the height and raw maps

  /** Drop the baker's programs (a bake is rare: the next one compiles them again). Materials stay usable. */
  function releasePrograms() {
    for (const m of [heightMat, combineMat, reachAMat, reachBMat, resolveMat, ...bakeMats.values()]) m.dispose();
  }

  return { collectBlockers, plan, release, releasePrograms, bytes: () => bytesLive, dispose() { tri.dispose(); for (const m of [heightMat, combineMat, reachAMat, reachBMat, resolveMat, ...bakeMats.values()]) m.dispose(); } };
}
