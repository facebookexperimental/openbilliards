// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/light.js — the club room's own light (CONTRACT.md section 8.2). Owner: room. Used by the shell (room/shell.js) and by
// the props (room/props.js) for everything they build.
//
// The club room is lit by (a) the app's three lights, which stay exactly as they are (one RectAreaLight lamp, one hemisphere, one
// point fill: every MeshStandardMaterial made here receives them like any other lit material), and (b) the room's FIXED emitters
// — wall lamps, lit shelves, a far lamp, window glow, the bounce off the lit table — evaluated analytically inside the materials
// made here. No three light is added, removed or changed, and no shadow map exists: the light set is part of every lit program's
// key in the app.
//
// What a material made by roomLight.material() adds to the standard three program (onBeforeCompile, text added AFTER standard
// chunk includes only, so `before` / `after` anchors of other club services still hit):
//   - a loop over the registered emitters: inverse-square falloff with a finite radius window, a point / rect / tube shape
//     approximation (one representative point per emitter, a size term that caps the near field), fed through three's own
//     RE_Direct, so every emitter gives a diffuse term AND a GGX highlight on gloss (lite tier: diffuse only);
//   - a room ambient (a two-colour hemisphere, the stand-in for the bounce a baked solution would hold);
//   - built-in occlusion: corner and skirting darkening from the distance to the six planes of the room box;
//   - optionally (the floor): the table's soft shadow under the rectangular lamp, as the visible fraction of the lamp rectangle
//     past the table-top rectangle (exact for two parallel rectangles under uniform weighting), applied to the app lights;
//   - the diffuse part of the environment cube is scaled by `envDiffuse` (default 0): the cube is captured at the table centre
//     and its irradiance is not valid at a wall several metres away (the app's own room does the same for the same reason);
//     mirror lookups that point below the cube's horizon (where the cube holds the cloth) fade out.
//
//
// The baked light map (room/lightmap.js; a material made with `lightmap: true | 'spec'` on a mesh that carries the `lm`
// attribute). While the room has a map (setLightmap), such a material compiles the ROOM_LM variant:
//   - the map's RGB (irradiance of every fixed emitter with soft shadows, plus the bounced light) replaces the emitter loop's
//     diffuse term, the room ambient and the box occlusion; 'spec' keeps the loop for its GGX highlight only (a varnished
//     floor still shows the wall lamps), plain `true` drops the loop and its uniforms from the program;
//   - the map's alpha (how much of the main lamp's rectangle a point sees past the furniture) scales what the three lights
//     put on the surface: the lamp stays a live three light, its shadows behind the furniture are baked;
//   - the app's point fill light is taken off these surfaces (uRoomLM.z = the share kept): it stands in for the bounce of the
//     lamp-lit table, which the map holds with occlusion. It is removed where three evaluates it (the light-info function is
//     wrapped for the one include), so nothing is subtracted afterwards and other services' scale factors stay exact.
// Without a map (none shipped, a failed request, a map baked for another room, the lite tier) the same materials compile the
// analytic variant above: the degrade law.
//
// The baked light volume (the same file as the map: a coarse 3D grid of ambient cubes, six irradiance colours per grid point,
// plus the main lamp's visible share in alpha). Every material made here that does NOT take the map (the props, the luminaire,
// the wall lamps' brass) compiles the ROOM_VOL variant while the room has a volume (setVolume): three fetches of ONE 3D sampler
// by world position and normal replace the emitter loop's diffuse term, the room ambient and the box occlusion, exactly as the
// map does for the shell, so furniture stands in the room's light and in its shadows without a second UV set. The same data is
// readable on the CPU: irradianceAt(position, normal) (the table body's wood, anything that is not a room material).
// In both baked variants the emitters' GGX highlights (kept on gloss) are scaled by how much of the emitters' unoccluded
// light the bake found at the fragment, so a highlight does not shine in a baked shadow.
//
// The main lamp's pool: a shaded lamp lights the floor around its table and little beyond. On the floor (`tableShadow: true`)
// the three lights' direct term is scaled by a closed form of the angle off the vertical, measured from the nearest point of
// the lamp rectangle (uRoomPool: the tangents where the fade starts and ends, and a gain: see POOL); the bake applies the
// same fade, without the gain, to the light the lamp leaves on its patches (the source of the bounce).
//
// Relief under the map (`relief: true`, the wainscot): the map is baked there for the flat wall plane (2 cm texels cannot hold
// 11 mm bevels); the shader puts the relief back by the angle of the shading normal to an assumed light from in front and
// above (vertices that carry the RELIEF mark on `roomSide`).
//
// Hidden sides (`hide: true` on a mesh that carries the `roomSide` attribute): a vertex whose side plane has the camera behind
// it is moved out of the clip volume, so a camera outside the room looks into a cut-away room.
//
// The arena's carpet (round A1; `init({ tableBlock: true })`, asked for by arena/room.js only): a floor material then also
// takes the table's shadow under every registered EMITTER (the rig's heads stand around the table: without it the carpet
// under the table is lit from eight sides). A closed form per emitter: where the ray from the floor point to the emitter
// crosses the table-top plane, inside the table-top rectangle of the built-in shadow or not, with a penumbra from the
// emitter's source size. The text is spliced into the floor's program only when the switch is on: without it (the club
// room) every shader string and every program key is what it was. Round A2, the same switch and the same program: the
// baked light of a map whose floor texels saw the table is final on that carpet (TABLE_BLOCK_BAKED_CODE).
//
// Importing this module does nothing: `roomLight` is a plain object; uniforms are created on first use.
import * as THREE from 'three';

const MAX_EMITTERS = 24;
const TYPE = { point: 0, rect: 1, tube: 2 };
const KEY = 'club-room-light-v11';
const HIDE_KEY = 'club-room-hide-v1';
/**
 * A painted shade that a baked map makes redundant (room/shell.js: the 16 cm band of each ceiling bay toward its beams). The
 * shell multiplies such a vertex's colour by `factor` and adds `mark` to its `roomSide`; with the map on, the vertex shader
 * divides the factor out again (the map holds the real occlusion there, the two must not multiply). Without the map the
 * painted shade stays.
 */
export const UNSHADE = Object.freeze({ mark: 0.25, factor: 0.55 });
/**
 * A vertex whose baked light is that of its flat wall plane (room/shell.js: the wainscot's frame, panels and mouldings): the
 * shell adds `mark` to its `roomSide`; a material made with `relief: true` shades such a fragment by its real normal.
 * `tilt`: how far above the wall's normal the assumed light stands; `strength`: the share of the relief term applied.
 */
export const RELIEF = Object.freeze({ mark: 0.125, tilt: 0.8, strength: 0.9 });
/**
 * The main lamp's pool on the floor.
 * `t0`, `t1`: tangents of the angle off the vertical (from the nearest point of the lamp rectangle) between which the lamp's
 * direct light fades out. Round 3: they are the luminaire's own section, as the lamp role publishes it
 * (room/lamp/face.js `lampShield()` of the canopy, `across`: the skirt's opening stands 0.043 m outside the emitter
 * rectangle and 0.09 m below its plane, the rectangle is 0.66 m wide): a point below starts to lose the panel at a tangent
 * of 0.48 and has lost all of it at 7.8. Round 2's pair (0.75, 2.1) cut the light off at 65 degrees, well inside the
 * shade's real cut-off; the fall to the room's level is now the panel's own cosine law.
 * `gain`: a factor on the lamp's direct light on the FLOOR only. A look value, not a derived one: by the app's numbers the
 * floor one metre beyond the long rail gets 0.72 units from the panel against 5.7 on the bed, and a club room that is lit
 * enough to read (0.5 to 0.8 units of house and wall-lamp light on the floor) swallows that. The gain stands for what a
 * real luminaire adds below its rim (the lit glass band, the inside of the shade, the cloth's bounce at floor level).
 * The bake reads all three (web/tools/club/bake-room-scene.mjs) for the light the lamp leaves on its patches (the gain on
 * floor patches only, as here).
 */
export const POOL = Object.freeze({ t0: 0.48, t1: 7.8, gain: 2.2 });
/**
 * The floor's gloss (a material made with `tableShadow: true`), round 3. A varnished plank floor shows three things on top of
 * its diffuse light, and each had to be levelled against the lamp's pool:
 *   sheen     the three lights' own highlight (the main lamp's rectangle through the wood's roughness: a wide glare without a
 *             shape under the lamp). The lamp's IMAGE in the floor is the reflection service's varnish lobe (the cube, and
 *             the planar mirror on the high tier); the glare under it is kept at this share so the image reads as a lamp.
 *   emitter   the share of the fixed emitters' GGX highlights kept (wall lamps and lit shelves as point sources streak across
 *             a floor at a grazing view; real shades are area sources and smear far wider).
 *   knee, cap the reflected radiance (cube lobe, varnish, mirror: everything in the indirect specular term at the end of the
 *             light chunk) is left as it is up to `knee` and rolls off toward `cap` above it: a lit shelf mirrored at a
 *             grazing angle stays a reflection in the planks instead of a white stripe, and the lamp's image keeps an outline
 *             instead of clipping.
 *   shadow    how far a baked shadow takes the reflections with it (0..1): the map knows where furniture stands, the cube
 *             and the mirror do not, and a reflection that fills a shadow lifts the furniture off the floor.
 */
export const FLOOR_GLOSS = Object.freeze({ sheen: 0.35, emitter: 0.45, knee: 0.05, cap: 0.17, shadow: 0.9 });
/** How far along the normal a fragment looks up the light volume (metres): out of the surface it belongs to. */
export const VOLUME_BIAS = 0.12;

const PARS_VERTEX = /* glsl */`
varying vec3 vRoomWP;
#ifdef ROOM_LM
  attribute vec2 lm;
  varying vec2 vRoomLM;
  #ifdef ROOM_RELIEF
    varying vec4 vRoomRelief; // xyz the wall's inward normal, w 1 where the baked light is the flat wall's
  #endif
#endif
`;
const HIDE_PARS_VERTEX = /* glsl */`
#ifdef ROOM_HIDE
  attribute float roomSide;
  uniform vec4 uRoomSides[ 6 ];
#endif
`;
// a side of the room whose plane has the camera behind it is not drawn (all vertices of a triangle share one side)
const HIDE_VERTEX = /* glsl */`
#ifdef ROOM_HIDE
{
  vec4 roomPl = uRoomSides[ int( roomSide + 0.5 ) ];
  if ( dot( roomPl.xyz, cameraPosition ) + roomPl.w < 0.0 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
}
#endif
`;
const WORLDPOS_VERTEX = /* glsl */`
{
  vec4 roomWP = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    roomWP = batchingMatrix * roomWP;
  #endif
  #ifdef USE_INSTANCING
    roomWP = instanceMatrix * roomWP;
  #endif
  vRoomWP = ( modelMatrix * roomWP ).xyz;
  #ifdef ROOM_LM
    vRoomLM = lm;
    #ifdef ROOM_HIDE
      // marks ride on the side index as binary fractions: 0.25 = a painted shade the map replaces (UNSHADE), 0.125 = baked
      // for the flat wall (RELIEF)
      float roomMark = fract( roomSide );
      #ifdef USE_COLOR
        if ( roomMark > 0.2 ) vColor.rgb *= ${(1 / UNSHADE.factor).toFixed(6)};
      #endif
      #ifdef ROOM_RELIEF
        vRoomRelief = vec4( uRoomSides[ int( roomSide + 0.5 ) ].xyz, step( 0.06, mod( roomMark, 0.25 ) ) );
      #endif
    #endif
  #endif
}
`;

// the volume's uniforms and its look-up (also handed out through roomLight.volume.glsl)
const VOLUME_GLSL = /* glsl */`
uniform highp sampler3D uRoomVol; // six blocks along depth (+x -x +y -y +z -z): rgb irradiance / full scale, a = main-lamp visibility
uniform vec3 uRoomVolMin;         // world position of the grid's low corner
uniform vec3 uRoomVolInv;         // 1 / extent
uniform vec4 uRoomVolDim;         // grid points along x, y, z; w = look-up bias along the normal (m)
// the ambient cube at a world point for a world normal: rgb irradiance / full scale, a = main-lamp visibility
vec4 clubRoomVolume( vec3 p, vec3 n ) {
  vec3 u = ( p + n * uRoomVolDim.w - uRoomVolMin ) * uRoomVolInv;
  u = clamp( u, 0.5 / uRoomVolDim.xyz, 1.0 - 0.5 / uRoomVolDim.xyz );
  float w = u.z / 6.0;
  vec3 n2 = n * n;
  vec4 c = texture( uRoomVol, vec3( u.xy, w + ( n.x >= 0.0 ? 0.0 : 1.0 / 6.0 ) ) ) * n2.x;
  c += texture( uRoomVol, vec3( u.xy, w + ( n.y >= 0.0 ? 2.0 / 6.0 : 3.0 / 6.0 ) ) ) * n2.y;
  c += texture( uRoomVol, vec3( u.xy, w + ( n.z >= 0.0 ? 4.0 / 6.0 : 5.0 / 6.0 ) ) ) * n2.z;
  return c;
}
`;
const PARS_FRAGMENT = /* glsl */`
varying vec3 vRoomWP;
uniform vec4 uRoomEmP[ ROOM_EMITTERS ];   // xyz position (world), w window radius
uniform vec4 uRoomEmC[ ROOM_EMITTERS ];   // rgb colour x intensity (x area for rect), w type 0 point | 1 rect | 2 tube
uniform vec4 uRoomEmN[ ROOM_EMITTERS ];   // xyz emitter normal (zero = omni), w point: source radius | rect: half width | tube: radius
uniform vec4 uRoomEmA[ ROOM_EMITTERS ];   // xyz axis (rect: width axis, tube: length axis), w rect: half height | tube: half length
uniform int uRoomEmCount;
uniform vec3 uRoomBoxMin;
uniform vec3 uRoomBoxMax;
uniform vec3 uRoomAmbSky;
uniform vec3 uRoomAmbGround;
uniform vec3 uRoomAmbSide;
uniform vec4 uRoomAO;          // x strength, y range (m), z share applied to direct light, w unused
uniform vec4 uRoomLampRect;    // lamp rectangle: centre x, centre z, half x, half z
uniform vec4 uRoomTableRect;   // table-top rectangle: centre x, centre z, half x, half z
uniform vec4 uRoomShadowY;     // x lamp y, y table-top y, z strength 0..1, w ambient share under the table
uniform float uRoomEnvDiffuse; // per material
uniform float uRoomMatAO;      // per material
uniform vec4 uRoomPool;        // the main lamp's pool: x, y tangents where its direct light starts and stops fading, z strength, w gain
uniform vec4 uRoomFloor;       // the floor's gloss (FLOOR_GLOSS): x sheen, y emitter highlights, z knee, w cap
uniform vec4 uRoomFloorSw;     // x share of baked shadow applied to reflections, y the main lamp's light on the floor (tools: 0 = off), z, w unused
uniform vec4 uRoomLM;          // x full scale, y share of the baked lamp visibility applied, z share of the app's point lights kept, w unused
#ifdef ROOM_LM
  uniform sampler2D uRoomLightMap; // rgb irradiance / full scale (sRGB-decoded by the sampler), a = main-lamp visibility
  varying vec2 vRoomLM;
  #ifdef ROOM_RELIEF
    uniform vec4 uRoomRelief;      // x tilt of the assumed light above the wall normal, y strength
    varying vec4 vRoomRelief;
  #endif
#endif
#ifdef ROOM_VOL
${VOLUME_GLSL}#endif

// The main lamp's pool: the gain inside the cone the shade leaves open, fading to gain * ( 1 - strength ) outside it.
float clubRoomLampPool( vec3 p ) {
  vec2 d = max( abs( p.xz - uRoomLampRect.xy ) - uRoomLampRect.zw, 0.0 );
  float t = length( d ) / max( uRoomShadowY.x - p.y, 1e-3 );
  return uRoomPool.w * ( 1.0 - uRoomPool.z * smoothstep( uRoomPool.x, uRoomPool.y, t ) );
}

// Corner and skirting darkening: each plane of the room box that is not the fragment's own plane takes away a share of the
// hemisphere that falls off with the distance to it.
float clubRoomAO( vec3 p, vec3 n ) {
  vec3 dMin = max( p - uRoomBoxMin, 0.0 );
  vec3 dMax = max( uRoomBoxMax - p, 0.0 );
  vec3 an = abs( n );
  float r = max( uRoomAO.y, 1e-3 );
  float occ = 0.0;
  occ += exp( - dMin.x / r ) * ( 1.0 - an.x ) + exp( - dMax.x / r ) * ( 1.0 - an.x );
  occ += exp( - dMin.y / r ) * ( 1.0 - an.y ) + exp( - dMax.y / r ) * ( 1.0 - an.y );
  occ += exp( - dMin.z / r ) * ( 1.0 - an.z ) + exp( - dMax.z / r ) * ( 1.0 - an.z );
  return 1.0 - min( 0.75, uRoomAO.x * occ );
}

// Visible fraction of the lamp rectangle from a point below the table-top plane (both rectangles horizontal, axis aligned).
float clubRoomTableShadow( vec3 p ) {
  float yl = uRoomShadowY.x, yt = uRoomShadowY.y;
  if ( p.y >= yt - 1e-3 || yl <= yt ) return 1.0;
  float s = ( yt - p.y ) / ( yl - p.y );           // where the ray to the lamp crosses the table plane
  vec2 c = p.xz + ( uRoomTableRect.xy - p.xz ) / s;  // the table rectangle projected on the lamp plane
  vec2 h = uRoomTableRect.zw / s;
  vec2 lo = max( uRoomLampRect.xy - uRoomLampRect.zw, c - h );
  vec2 hi = min( uRoomLampRect.xy + uRoomLampRect.zw, c + h );
  vec2 o = max( hi - lo, 0.0 );
  float blocked = ( o.x * o.y ) / max( 4.0 * uRoomLampRect.z * uRoomLampRect.w, 1e-6 );
  return 1.0 - clamp( blocked, 0.0, 1.0 );
}
`;

// the app's point lights, scaled for a surface that takes the baked map or the baked volume (see the header): defined after three's own function
const POINT_WRAP_PARS = /* glsl */`
#if defined( ROOM_BAKED ) && NUM_POINT_LIGHTS > 0
void roomPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
  getPointLightInfo( pointLight, geometryPosition, light );
  light.color *= uRoomLM.z;
}
#endif
`;
const POINT_WRAP_ON = /* glsl */`
#if defined( ROOM_BAKED ) && NUM_POINT_LIGHTS > 0
  #define getPointLightInfo roomPointLightInfo
#endif
`;
const POINT_WRAP_OFF = /* glsl */`
#if defined( ROOM_BAKED ) && NUM_POINT_LIGHTS > 0
  #undef getPointLightInfo
#endif
`;

const LIGHTS_FRAGMENT = /* glsl */`
float roomSpecOcc = 1.0;          // what a baked shadow leaves of the reflections on this fragment (read again after the light chunk)
{
  vec3 roomN = normalize( inverseTransformDirection( geometryNormal, viewMatrix ) );
  float roomAO = uRoomMatAO;
  float roomAOd = 1.0;
  float roomAmb = 1.0;
  float roomLampK = 1.0;          // what the three lights (the main lamp) keep on this fragment
  #ifdef ROOM_BAKED
    vec3 roomBaked = vec3( 0.0 ); // baked irradiance: the fixed emitters with their shadows, the bounce, the ambient
    #ifdef ROOM_LM
      vec4 roomLM = texture2D( uRoomLightMap, vRoomLM );
      #ifdef ROOM_RELIEF
        if ( vRoomRelief.w > 0.5 && dot( vRoomRelief.xyz, vRoomRelief.xyz ) > 0.25 ) {
          vec3 roomWallN = normalize( vRoomRelief.xyz );
          vec3 roomL = normalize( roomWallN + vec3( 0.0, uRoomRelief.x, 0.0 ) );
          float roomRel = max( dot( roomN, roomL ), 0.0 ) / max( dot( roomWallN, roomL ), 0.25 );
          roomLM.rgb *= mix( 1.0, min( roomRel, 1.5 ), uRoomRelief.y );
        }
      #endif
    #else
      vec4 roomLM = clubRoomVolume( vRoomWP, roomN );
    #endif
    roomBaked = roomLM.rgb * uRoomLM.x;
    roomLampK = mix( 1.0, roomLM.a, uRoomLM.y );
  #else
    roomAO = clubRoomAO( vRoomWP, roomN ) * uRoomMatAO;
    roomAOd = mix( 1.0, roomAO, uRoomAO.z );
  #endif
  #ifdef ROOM_TABLE_SHADOW
    // the pool is the FLOOR's: furniture that faces the table keeps the lamp's light (with the bake's occlusion), as a
    // bar front two metres from a lit table does; cutting it there was tried in the app at V1 and left the bar a black slab
    roomLampK *= clubRoomLampPool( vRoomWP );
    float roomVis = clubRoomTableShadow( vRoomWP );
    roomLampK *= mix( 1.0, roomVis, uRoomShadowY.z );
    roomAmb = mix( 1.0, mix( uRoomShadowY.w, 1.0, roomVis ), uRoomShadowY.z );
  #endif
  #ifdef ROOM_TABLE_SHADOW
    roomLampK *= uRoomFloorSw.y;
    reflectedLight.directSpecular *= uRoomFloor.x;
  #endif
  reflectedLight.directDiffuse *= roomLampK * roomAOd;
  reflectedLight.directSpecular *= roomLampK;
  irradiance *= roomAO * roomAmb;
  #ifdef ROOM_BAKED
    irradiance += roomBaked * ( roomAO * roomAmb );
  #else
    irradiance += ( mix( uRoomAmbGround, uRoomAmbSky, 0.5 + 0.5 * roomN.y ) + uRoomAmbSide * ( 1.0 - roomN.y * roomN.y ) ) * roomAO * roomAmb;
  #endif
  #if ! defined( ROOM_BAKED ) || defined( ROOM_SPEC )
  ReflectedLight roomRL = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
  IncidentLight roomLight;
  roomLight.visible = true;
  vec3 roomE = vec3( 0.0 );      // the emitters' unoccluded irradiance (baked variants: what the highlights are weighed against)
  for ( int i = 0; i < ROOM_EMITTERS; i ++ ) {
    if ( i >= uRoomEmCount ) break;
    vec4 eP = uRoomEmP[ i ];
    vec4 eC = uRoomEmC[ i ];
    vec4 eN = uRoomEmN[ i ];
    vec4 eA = uRoomEmA[ i ];
    vec3 rel = vRoomWP - eP.xyz;
    vec3 q = eP.xyz;        // the emitter's representative point for this fragment
    float soft = eN.w * eN.w; // near-field cap (m^2)
    float emit = 1.0;
    if ( eC.w > 1.5 ) {        // tube: the closest point of the segment; 1/d near the tube, 1/d^2 far from it
      float a = clamp( dot( rel, eA.xyz ), - eA.w, eA.w );
      q += eA.xyz * a;
      soft = eA.w * distance( vRoomWP, q ) + eN.w * eN.w;
    } else if ( eC.w > 0.5 ) { // rect: a point pulled toward the fragment's foot on the rectangle; the near field tends to pi * L
      vec3 eV = cross( eN.xyz, eA.xyz );
      float a = clamp( dot( rel, eA.xyz ), - eN.w, eN.w );
      float b = clamp( dot( rel, eV ), - eA.w, eA.w );
      q += ( eA.xyz * a + eV * b ) * 0.6;
      soft = 4.0 * eN.w * eA.w * RECIPROCAL_PI;
    }
    vec3 Lw = q - vRoomWP;
    float d2 = dot( Lw, Lw );
    float w = d2 / ( eP.w * eP.w );
    if ( w >= 1.0 ) continue;
    w = 1.0 - w * w; w *= w;                         // finite window (three's distance cutoff)
    Lw *= inversesqrt( max( d2, 1e-8 ) );
    if ( dot( eN.xyz, eN.xyz ) > 0.25 ) {            // a one-sided emitter: cosine lobe around its normal
      emit = dot( eN.xyz, - Lw );
      if ( emit <= 0.0 ) continue;
      if ( eC.w < 0.5 ) emit = smoothstep( 0.0, 0.35, emit ); // point with a normal: a soft half-space (a shade), not a cosine
    }
    if ( eC.w < 0.5 && eA.w > 0.0 ) {                // point with an axis: a shaded lamp, open along the axis
      float ca = - dot( Lw, eA.xyz );                // > 0 on the +axis side of the lamp
      emit *= ( 1.0 - eA.w ) + eA.w * 2.4 * ca * ca * ( ca > 0.0 ? 1.0 : 0.55 );
    }
    roomLight.color = eC.rgb * ( emit * w / ( d2 + soft ) );
    roomLight.direction = normalize( ( viewMatrix * vec4( Lw, 0.0 ) ).xyz );
    #ifdef ROOM_LITE
      roomRL.directDiffuse += saturate( dot( geometryNormal, roomLight.direction ) ) * roomLight.color * BRDF_Lambert( material.diffuseColor );
    #else
      #ifdef ROOM_BAKED
        roomE += roomLight.color * saturate( dot( geometryNormal, roomLight.direction ) );
      #endif
      RE_Direct( roomLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, roomRL );
    #endif
  }
  #ifdef ROOM_TABLE_SHADOW
    roomRL.directSpecular *= uRoomFloor.y;
  #endif
  #ifdef ROOM_BAKED
    // a highlight keeps the share of the room's light that the bake found here (its shadows, in other words): the baked
    // irradiance against what an open surface of this orientation gets (the emitters without occlusion plus the bake's
    // mean house light, which the ambient uniforms hold while a bake is in use)
    vec3 roomOpenE = roomE + mix( uRoomAmbGround, uRoomAmbSky, 0.5 + 0.5 * roomN.y ) + uRoomAmbSide * ( 1.0 - roomN.y * roomN.y );
    float roomSpecK = smoothstep( 0.12, 0.8, dot( roomBaked, vec3( 0.3, 0.6, 0.1 ) ) / max( dot( roomOpenE, vec3( 0.3, 0.6, 0.1 ) ), 1e-4 ) );
    reflectedLight.directSpecular += roomRL.directSpecular * roomSpecK;
    #ifdef ROOM_TABLE_SHADOW
      roomSpecOcc = mix( 1.0, roomSpecK, uRoomFloorSw.x );
    #endif
  #else
    reflectedLight.directDiffuse += roomRL.directDiffuse * roomAOd;
    reflectedLight.directSpecular += roomRL.directSpecular * roomAOd;
  #endif
  #elif defined( ROOM_TABLE_SHADOW )
    // no emitter loop in this variant (the lite floor): the baked light against the bake's mean house light alone
    roomSpecOcc = mix( 1.0, smoothstep( 0.12, 0.8, dot( roomBaked, vec3( 0.3, 0.6, 0.1 ) ) / max( dot( uRoomAmbSky, vec3( 0.3, 0.6, 0.1 ) ), 1e-4 ) ), uRoomFloorSw.x );
  #endif
}
`;

// the floor's reflections, after every light term is in (see FLOOR_GLOSS). Spliced after <lights_fragment_end>; a service that
// splices its own code after the same include (the reflection service's varnish, the occlusion service's floor map) lands
// before this text, so this sees their result.
const FLOOR_END_FRAGMENT = /* glsl */`
#ifdef ROOM_TABLE_SHADOW
{
  vec3 roomRefl = reflectedLight.indirectSpecular * roomSpecOcc;
  float roomPeak = max( roomRefl.r, max( roomRefl.g, roomRefl.b ) );
  if ( uRoomFloor.z > 0.0 && roomPeak > uRoomFloor.z ) {
    float roomSpan = max( uRoomFloor.w - uRoomFloor.z, 1e-4 );
    roomRefl *= ( uRoomFloor.z + roomSpan * ( 1.0 - exp( - ( roomPeak - uRoomFloor.z ) / roomSpan ) ) ) / roomPeak;
  }
  reflectedLight.indirectSpecular = roomRefl;
}
#endif
`;

// ---- the table's shadow under the emitters (the arena's carpet; spliced in only with `tableBlock`, see the header) ---------
const TABLE_BLOCK_PARS = /* glsl */`
uniform vec4 uRoomTableBlock;  // x strength 0..1, y penumbra half-width at the table-top plane (m), z share of the source radius added to it, w share of the baked light that is final (see TABLE_BLOCK_BAKED_CODE)
// What a floor point p keeps of an emitter at q past the table top: the ray p -> q crosses the table-top plane at c; inside
// the table-top rectangle it is blocked. A source of radius src widens the edge by src * s at that plane (s = the share of
// the ray below the table top).
float clubRoomTableBlock( vec3 p, vec3 q, float src ) {
  float yt = uRoomShadowY.y;
  if ( p.y >= yt - 1e-3 || q.y <= yt + 1e-3 ) return 1.0;
  float s = ( yt - p.y ) / ( q.y - p.y );
  vec2 c = p.xz + ( q.xz - p.xz ) * s;
  vec2 d = abs( c - uRoomTableRect.xy ) - uRoomTableRect.zw;
  float soft = max( uRoomTableBlock.y + uRoomTableBlock.z * src * s, 1e-3 );
  return mix( 1.0, smoothstep( - soft, soft, max( d.x, d.y ) ), uRoomTableBlock.x );
}
`;
// the line of LIGHTS_FRAGMENT after which the block's call is spliced (the emitter's light at the fragment, before it is used)
const TABLE_BLOCK_ANCHOR = '    roomLight.color = eC.rgb * ( emit * w / ( d2 + soft ) );\n';
const TABLE_BLOCK_CALL = '    roomLight.color *= clubRoomTableBlock( vRoomWP, q, eN.w );\n';
// The arena's carpet under a bake whose floor texels SAW the table (round A2; spliced with the same switch): that map
// already holds the table's shadow and occlusion (its legs, its body, the dark under it). A service that scales the floor's
// reflected light afterwards for the table's sake (the occlusion service's floor map: its ambient term) would count the
// table a second time on it. So the share `uRoomTableBlock.w` of the baked light leaves the fragment as radiance of its
// own (the diffuse BRDF applied here) and is not scaled again; the three lights' direct term stays where it was, so the
// occlusion service's shadow of the main lamp still falls on it. At w = 0 (no such bake) the sum is what it was.
const TABLE_BLOCK_BAKED_ANCHOR = '    irradiance += roomBaked * ( roomAO * roomAmb );\n';
const TABLE_BLOCK_BAKED_CODE = '    irradiance += roomBaked * ( roomAO * roomAmb * ( 1.0 - uRoomTableBlock.w ) );\n'
  + '    totalEmissiveRadiance += roomBaked * ( roomAO * roomAmb * uRoomTableBlock.w ) * BRDF_Lambert( material.diffuseColor );\n';
/** Defaults of the block: full strength, a 9 cm edge at the table-top plane (about 25 cm on the floor under a head 2.3 m
 * over the bed: the table is not a slab, its body and legs blur what the top alone would cast), the source's own size on top. */
export const TABLE_BLOCK = Object.freeze({ strength: 1, soft: 0.09, source: 1 });

// ---- a cone for a point emitter (the arena, round A3; spliced in only with `init({ cone: true })`, see the header of the
// arena block above: without the switch every shader string and every program key is what it was) ------------------------
// A point emitter registered with `cone: <field half angle, degrees>` is a lamp head with a beam: its `intensity` is the
// candela ON ITS AXIS and nothing leaves it outside the field angle. (The lobe of a shaded lamp, the line this replaces
// for such an emitter, still gives a quarter of its peak 70 degrees off the axis: the arena's wash heads lit the table
// light's housing through it.) Two profiles:
//   a profile light (the default)  whole inside the beam, a short edge: full light from `CONE.beam` of the way from the
//                                  field's cosine to 1 (an angle of about 0.6 of the field's);
//   a wash (`bell: true`)          a bell: falling smoothly from the axis all the way to the field angle.
// Packed in the axis vector's w, which a shaded lamp keeps in 0..1 (its beam share): w = 2 + cos( field half angle ) for
// a profile, 4 + cos( field half angle ) for a wash.
export const CONE = Object.freeze({ beam: 0.64 });
const CONE_ANCHOR = '      emit *= ( 1.0 - eA.w ) + eA.w * 2.4 * ca * ca * ( ca > 0.0 ? 1.0 : 0.55 );\n';
const CONE_CODE = '      if ( eA.w > 1.5 ) {\n'
  + '        float coneC = eA.w > 3.5 ? eA.w - 4.0 : eA.w - 2.0;\n'
  + `        emit *= smoothstep( coneC, mix( coneC, 1.0, eA.w > 3.5 ? 1.0 : ${CONE.beam.toFixed(2)} ), ca );\n`
  + '      } else emit *= ( 1.0 - eA.w ) + eA.w * 2.4 * ca * ca * ( ca > 0.0 ? 1.0 : 0.55 );\n';
/** The cone's factor for the cosine `ca` of the angle off the axis, from the packed w (see CONE): the CPU's copy of CONE_CODE. */
export function coneFactor(w, ca) {
  const c = w > 3.5 ? w - 4 : w - 2, top = c + (1 - c) * (w > 3.5 ? 1 : CONE.beam);
  const t = Math.min(1, Math.max(0, (ca - c) / (top - c)));
  return t * t * (3 - 2 * t);
}

const ENV_FRAGMENT = /* glsl */`
iblIrradiance *= uRoomEnvDiffuse;
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
{
  // the cube is captured just above the cloth: everything it holds below its horizon is the table, which is not what a
  // surface out in the room mirrors in a downward direction (that would be the floor) — fade those lookups out
  vec3 roomR = inverseTransformDirection( reflect( - geometryViewDir, geometryNormal ), viewMatrix );
  radiance *= smoothstep( -0.30, 0.02, roomR.y );
}
#endif
`;

function makeLight() {
  let uniforms = null;
  let lite = false;
  let limit = MAX_EMITTERS;
  let committed = false;
  let envTexture = null;
  let offsetY = 0;
  let warned = false;
  let lmTexture = null;   // the baked map, or null (analytic light)
  let lmData = null;      // { data: Uint8Array RGBA, size, fullScale, floor: chart } for floorIrradiance(), or null
  let volume = null;      // the baked volume in use: { texture, data, dims, min, max, bias, fullScale }, or null
  let sidePlanes = null;  // six [nx, ny, nz, w] in room coordinates, or null (nothing is ever hidden)
  let tableBlock = false; // the arena: floor materials also take the table's shadow under the emitters (see the header)
  let cone = false;       // the arena: a point emitter may carry a cone (CONE); off, an emitter's `cone` is never read
  let blockUniforms = null; // { uRoomTableBlock }, made on first use by a floor material built with the switch on
  const lmMaterials = []; // WeakRef<Material> of the materials that take the map
  const emitters = []; // { id, type, position, color, intensity, radius, size, axis, normal }
  const made = []; // WeakRef<Material> of every lit material made here (state(), env binding)
  const ownOf = new WeakMap(); // material -> its own uniform objects ({ uRoomEnvDiffuse, uRoomMatAO })
  const variantOf = new WeakMap(); // material -> () => its current program variant

  function ensure() {
    if (uniforms) return uniforms;
    const v4 = () => Array.from({ length: MAX_EMITTERS }, () => new THREE.Vector4());
    uniforms = {
      uRoomEmP: { value: v4() }, uRoomEmC: { value: v4() }, uRoomEmN: { value: v4() }, uRoomEmA: { value: v4() },
      uRoomEmCount: { value: 0 },
      uRoomBoxMin: { value: new THREE.Vector3(-50, -50, -50) }, uRoomBoxMax: { value: new THREE.Vector3(50, 50, 50) },
      uRoomAmbSky: { value: new THREE.Color(0.3, 0.26, 0.21) }, uRoomAmbGround: { value: new THREE.Color(0.22, 0.18, 0.14) },
      uRoomAmbSide: { value: new THREE.Color(0, 0, 0) },
      uRoomAO: { value: new THREE.Vector4(0.55, 0.42, 0.5, 0) },
      uRoomLampRect: { value: new THREE.Vector4(0, 0, 1.0, 0.33) },
      uRoomTableRect: { value: new THREE.Vector4(0, 0, 1.45, 0.82) },
      uRoomShadowY: { value: new THREE.Vector4(1.02, 0.03, 1, 0.3) },
      uRoomLightMap: { value: null },
      uRoomLM: { value: new THREE.Vector4(16, 1, 0, 0) },
      uRoomPool: { value: new THREE.Vector4(POOL.t0, POOL.t1, 1, POOL.gain) },
      uRoomFloor: { value: new THREE.Vector4(FLOOR_GLOSS.sheen, FLOOR_GLOSS.emitter, FLOOR_GLOSS.knee, FLOOR_GLOSS.cap) },
      uRoomFloorSw: { value: new THREE.Vector4(FLOOR_GLOSS.shadow, 1, 0, 0) },
      uRoomRelief: { value: new THREE.Vector4(RELIEF.tilt, RELIEF.strength, 0, 0) },
      uRoomVol: { value: null },
      uRoomVolMin: { value: new THREE.Vector3(-50, -50, -50) }, uRoomVolInv: { value: new THREE.Vector3(0.01, 0.01, 0.01) },
      uRoomVolDim: { value: new THREE.Vector4(1, 1, 1, VOLUME_BIAS) },
      // a far-away plane that keeps every side: the default until setSides()
      uRoomSides: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 1)) },
    };
    return uniforms;
  }

  /** Called once by room.js before any material is made: tier knobs, the cube to bind (the app's scene.environment), the box. */
  function init({ club = null, envMap = undefined, tableBlock: block = false, cone: withCone = false } = {}) {
    ensure();
    lite = club?.tier === 'lite' || club?.knobs?.roomDetail === 0;
    limit = lite ? 12 : MAX_EMITTERS;
    if (envMap !== undefined) envTexture = envMap;
    tableBlock = block === true;
    cone = withCone === true;
    return api;
  }
  /** What a point emitter's axis vector carries in w: its beam share (0..1), or a cone (2 or 4 + cos(field half angle): CONE). */
  const pointAxisW = (e, sz) => (cone && Number.isFinite(e.cone) && e.cone > 0 && e.cone < 90 && e.axis ? (e.bell === true ? 4 : 2) + Math.cos((e.cone * Math.PI) / 180) : (e.axis ? Math.min(1, Math.max(0, sz[1] || 0.6)) : 0));

  const power = (e) => {
    const area = e.type === 'rect' ? Math.max(1e-4, (e.size?.[0] ?? 0.5) * (e.size?.[1] ?? 0.5)) : 1;
    const c = e.color;
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * e.intensity * area * Math.min(e.radius, 12) ** 2;
  };

  let evaluated = []; // the emitters the shader evaluates, in uniform order (irradianceAt() reads the same packed vectors)
  // counts every change after which irradianceAt(), lampShareAt() or floorIrradiance() may answer differently (emitters,
  // ambient, the baked map or volume coming, going or being replaced, a re-seat): a reader re-reads when it moved
  let serial = 0;
  function sync() {
    serial += 1;
    const u = ensure();
    let list = emitters;
    if (list.length > limit) {
      list = [...emitters].sort((a, b) => power(b) - power(a)).slice(0, limit);
      if (!warned) { warned = true; console.warn(`[club] room light: ${emitters.length} emitters registered, ${limit} are evaluated (the weakest are dropped)`); }
    }
    evaluated = list;
    const n = new THREE.Vector3(), a = new THREE.Vector3();
    list.forEach((e, i) => {
      const t = TYPE[e.type] ?? 0;
      const sz = e.size ?? [0, 0];
      u.uRoomEmP.value[i].set(e.position.x, e.position.y + offsetY, e.position.z, e.radius);
      const k = e.intensity * (t === 1 ? Math.max(1e-4, sz[0] * sz[1]) : 1);
      u.uRoomEmC.value[i].set(e.color.r * k, e.color.g * k, e.color.b * k, t);
      if (e.normal) n.copy(e.normal).normalize(); else n.set(0, 0, 0);
      if (e.axis) a.copy(e.axis).normalize(); else a.set(0, 1, 0);
      if (t === 1) {
        if (!e.normal) n.set(0, -1, 0);
        // the width axis must be perpendicular to the normal
        a.addScaledVector(n, -a.dot(n));
        if (a.lengthSq() < 1e-6) { a.set(1, 0, 0); if (Math.abs(n.x) > 0.9) a.set(0, 0, 1); a.addScaledVector(n, -a.dot(n)); }
        a.normalize();
        u.uRoomEmN.value[i].set(n.x, n.y, n.z, sz[0] / 2);
        u.uRoomEmA.value[i].set(a.x, a.y, a.z, sz[1] / 2);
      } else if (t === 2) {
        // (the arena, with its switch on: a tube that carries a `normal` is one-sided, a cosine lobe around it: an LED run
        // under a board's cap lights what is below it. The shader's lobe test reads the vector for every type; a club tube
        // stays omni whatever its record carries.)
        if (cone && e.normal) u.uRoomEmN.value[i].set(n.x, n.y, n.z, sz[1] || 0.02);
        else u.uRoomEmN.value[i].set(0, 0, 0, sz[1] || 0.02);
        u.uRoomEmA.value[i].set(a.x, a.y, a.z, (sz[0] || 0.5) / 2);
      } else {
        u.uRoomEmN.value[i].set(n.x, n.y, n.z, sz[0] || 0.05);
        u.uRoomEmA.value[i].set(a.x, a.y, a.z, pointAxisW(e, sz));
      }
    });
    u.uRoomEmCount.value = list.length;
    for (let i = 0; i < 6; i++) {
      const pl = sidePlanes?.[i];
      if (pl) u.uRoomSides.value[i].set(pl[0], pl[1], pl[2], pl[3] - pl[1] * offsetY); else u.uRoomSides.value[i].set(0, 0, 0, 1);
    }
    if (volume) {
      const [x0, y0, z0] = volume.min, [x1, y1, z1] = volume.max;
      u.uRoomVolMin.value.set(x0, y0 + offsetY, z0);
      u.uRoomVolInv.value.set(1 / (x1 - x0), 1 / (y1 - y0), 1 / (z1 - z0));
      u.uRoomVolDim.value.set(volume.dims[0], volume.dims[1], volume.dims[2], volume.bias);
    }
  }

  // ---- the same light on the CPU (irradianceAt, floorIrradiance): for surfaces that are not room materials -------------------
  const SRGB = (() => { const t = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; t[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; } return t; })();
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  /** One emitter's irradiance on a Lambert receiver at p with unit normal n, by the law of LIGHTS_FRAGMENT (no occlusion). */
  function emitterLaw(i, px, py, pz, nx, ny, nz, out) {
    const u = uniforms;
    const P = u.uRoomEmP.value[i], C = u.uRoomEmC.value[i], N = u.uRoomEmN.value[i], A = u.uRoomEmA.value[i];
    const relx = px - P.x, rely = py - P.y, relz = pz - P.z;
    let qx = P.x, qy = P.y, qz = P.z, soft = N.w * N.w, emit = 1;
    if (C.w > 1.5) {
      const a = Math.min(A.w, Math.max(-A.w, relx * A.x + rely * A.y + relz * A.z));
      qx += A.x * a; qy += A.y * a; qz += A.z * a;
      soft = A.w * Math.hypot(px - qx, py - qy, pz - qz) + N.w * N.w;
    } else if (C.w > 0.5) {
      const vx = N.y * A.z - N.z * A.y, vy = N.z * A.x - N.x * A.z, vz = N.x * A.y - N.y * A.x;
      const a = Math.min(N.w, Math.max(-N.w, relx * A.x + rely * A.y + relz * A.z));
      const b = Math.min(A.w, Math.max(-A.w, relx * vx + rely * vy + relz * vz));
      qx += (A.x * a + vx * b) * 0.6; qy += (A.y * a + vy * b) * 0.6; qz += (A.z * a + vz * b) * 0.6;
      soft = (4 * N.w * A.w) / Math.PI;
    }
    let lx = qx - px, ly = qy - py, lz = qz - pz;
    const d2 = lx * lx + ly * ly + lz * lz;
    let w = d2 / (P.w * P.w);
    if (w >= 1) return;
    w = 1 - w * w; w *= w;
    const il = 1 / Math.sqrt(Math.max(d2, 1e-8));
    lx *= il; ly *= il; lz *= il;
    if (N.x * N.x + N.y * N.y + N.z * N.z > 0.25) {
      emit = -(N.x * lx + N.y * ly + N.z * lz);
      if (emit <= 0) return;
      if (C.w < 0.5) emit = sstep(0, 0.35, emit);
    }
    if (C.w < 0.5 && A.w > 0) {
      const ca = -(lx * A.x + ly * A.y + lz * A.z);
      // (a cone, the arena only: CONE_CODE; a shaded lamp's w never passes 1)
      if (A.w > 1.5) emit *= coneFactor(A.w, ca);
      else emit *= (1 - A.w) + A.w * 2.4 * ca * ca * (ca > 0 ? 1 : 0.55);
    }
    const k = (emit * w * Math.max(0, nx * lx + ny * ly + nz * lz)) / (d2 + soft);
    out[0] += C.x * k; out[1] += C.y * k; out[2] += C.z * k;
  }
  /** The baked volume at a world point for a unit normal: adds rgb irradiance to out[0..2], returns the main lamp's share. */
  function volumeAt(px, py, pz, nx, ny, nz, out) {
    const v = volume, [NX, NY, NZ] = v.dims, b = v.bias, d = v.data;
    const at = (val, lo, hi, n) => Math.min(n - 1, Math.max(0, ((val - lo) / (hi - lo)) * n - 0.5));
    const fx = at(px + nx * b, v.min[0], v.max[0], NX), fy = at(py + ny * b - offsetY, v.min[1], v.max[1], NY), fz = at(pz + nz * b, v.min[2], v.max[2], NZ);
    const x0 = Math.min(Math.max(NX - 2, 0), Math.floor(fx)), y0 = Math.min(Math.max(NY - 2, 0), Math.floor(fy)), z0 = Math.min(Math.max(NZ - 2, 0), Math.floor(fz));
    const tx = fx - x0, ty = fy - y0, tz = fz - z0;
    const x1 = Math.min(NX - 1, x0 + 1), y1 = Math.min(NY - 1, y0 + 1), z1 = Math.min(NZ - 1, z0 + 1);
    let lamp = 0;
    const face = (f, wgt) => {
      if (!(wgt > 0)) return;
      for (let c = 0; c < 8; c++) {
        const x = c & 1 ? x1 : x0, y = c & 2 ? y1 : y0, z = c & 4 ? z1 : z0;
        const k = wgt * (c & 1 ? tx : 1 - tx) * (c & 2 ? ty : 1 - ty) * (c & 4 ? tz : 1 - tz);
        const o = 4 * (x + NX * (y + NY * (z + NZ * f)));
        out[0] += SRGB[d[o]] * k * v.fullScale; out[1] += SRGB[d[o + 1]] * k * v.fullScale; out[2] += SRGB[d[o + 2]] * k * v.fullScale;
        lamp += (d[o + 3] / 255) * k;
      }
    };
    face(nx >= 0 ? 0 : 1, nx * nx); face(ny >= 0 ? 2 : 3, ny * ny); face(nz >= 0 ? 4 : 5, nz * nz);
    return lamp;
  }
  const xyz = (v) => (Array.isArray(v) ? v : [v?.x ?? 0, v?.y ?? 0, v?.z ?? 0]);
  /**
   * irradianceAt(position, normal, { baked }) -> [r, g, b]: the room's light on a Lambert receiver at a world point (the
   * app's light units, linear; multiply by albedo / pi for radiance). With the baked volume in use (and `baked` not false):
   * the bake at that point: every fixed emitter WITH its shadows, the bounced light and the occlusion-weighted ambient.
   * Otherwise the analytic light: the registered emitters by the shader's law without occlusion, plus the room ambient the
   * analytic materials get. The main table's own lamp is never part of it (lampShareAt() says how much of that lamp the
   * bake sees from the point). CPU, pure, any world point; meant for a handful of calls per rebuild, not per frame.
   */
  function irradianceAt(position, normal, { baked = true } = {}) {
    ensure();
    const [px, py, pz] = xyz(position);
    let [nx, ny, nz] = xyz(normal ?? [0, 1, 0]);
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const out = [0, 0, 0];
    if (volume && baked !== false) { volumeAt(px, py, pz, nx, ny, nz, out); return out; }
    for (let i = 0; i < evaluated.length; i++) emitterLaw(i, px, py, pz, nx, ny, nz, out);
    const u = uniforms, up = 0.5 + 0.5 * ny, sd = 1 - ny * ny;
    for (const [k, c] of ['r', 'g', 'b'].entries()) out[k] += u.uRoomAmbGround.value[c] + (u.uRoomAmbSky.value[c] - u.uRoomAmbGround.value[c]) * up + u.uRoomAmbSide.value[c] * sd;
    return out;
  }
  /** The share (0..1) of the main table's lamp that the bake sees from a world point past the furniture; 1 without a bake. */
  function lampShareAt(position, normal = null) {
    if (!volume) return 1;
    const [px, py, pz] = xyz(position);
    let [nx, ny, nz] = xyz(normal ?? [0, 1, 0]);
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    return volumeAt(px, py, pz, nx, ny, nz, [0, 0, 0]);
  }
  /** The baked map on the floor at world (x, z): [r, g, b] irradiance of the fixed emitters and the bounce there, or null
   * when no map is in use or the point is off the floor. Bilinear, from the decoded bytes. */
  function floorIrradiance(x, z) {
    const m = lmData;
    if (!m || !lmTexture || !m.floor) return null;
    let c = m.floor;
    // (the arena, round A7: the island's carpet may lie in a chart of its own, `inner`; the club's record has no such member)
    const ci = c.inner;
    if (ci && x >= ci.o[0] && x <= ci.o[0] + ci.mw && z >= ci.o[2] && z <= ci.o[2] + ci.mh) c = ci;
    const a = ((x - c.o[0]) / c.mw), b = ((z - c.o[2]) / c.mh);
    if (!(a >= 0 && a <= 1 && b >= 0 && b <= 1)) return null;
    // chart metres -> texels of the file (room/lightmap.js createAtlas uv()): a rotated chart swaps its axes; a file smaller
    // than the atlas it was laid out for (`c.size`) holds the same charts at its own scale
    const k = c.size > 0 ? m.size / c.size : 1;
    const cx = c.x * k, cy = c.y * k, cw = c.w * k, ch = c.h * k;
    const pw = c.rot ? ch : cw, ph = c.rot ? cw : ch;
    const u = c.rot ? cx + b * ph : cx + a * pw, v = c.rot ? cy + a * pw : cy + b * ph;
    const lo = (val, low, high) => Math.min(high - 1.5, Math.max(low + 0.5, val)) - 0.5;
    const fu = lo(u, cx, cx + cw), fv = lo(v, cy, cy + ch);
    const u0 = Math.floor(fu), v0 = Math.floor(fv), tu = fu - u0, tv = fv - v0;
    const out = [0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const o = 4 * ((v0 + (k >> 1)) * m.size + u0 + (k & 1));
      const wgt = (k & 1 ? tu : 1 - tu) * (k >> 1 ? tv : 1 - tv) * m.fullScale;
      out[0] += SRGB[m.data[o]] * wgt; out[1] += SRGB[m.data[o + 1]] * wgt; out[2] += SRGB[m.data[o + 2]] * wgt;
    }
    return out;
  }

  /**
   * Register a fixed emitter (CONTRACT.md 8.2). `intensity` is in the app's light units: point and tube = a PointLight's
   * intensity (candela; tube = the whole tube), rect = a RectAreaLight's intensity (radiance, multiplied by the area here).
   * `radius` = the distance at which the emitter's light reaches zero (finite window). `size`: point [source radius, beam
   * share], rect [width, height], tube [length, tube radius]. `normal`: rect = the emitting side; point = a soft half-space (a
   * lamp against a surface); `axis`: rect = the width direction, tube = the length direction, point = the open axis of a shaded
   * lamp (light leaves mostly along +axis, about half as much along -axis; `size[1]` 0..1 is the share that does, default 0.6). Re-registering an id
   * replaces it. Returns the record.
   */
  function addEmitter(spec) {
    if (!spec || !spec.position) return null;
    const e = {
      id: String(spec.id ?? `emitter-${emitters.length}`),
      type: TYPE[spec.type] !== undefined ? spec.type : 'point',
      position: new THREE.Vector3().copy(spec.position),
      color: new THREE.Color().copy(spec.color ?? new THREE.Color(1, 1, 1)),
      intensity: Number.isFinite(spec.intensity) ? spec.intensity : 1,
      radius: Number.isFinite(spec.radius) && spec.radius > 0 ? spec.radius : 4,
      size: Array.isArray(spec.size) ? [Number(spec.size[0]) || 0, Number(spec.size[1]) || 0] : null,
      axis: spec.axis ? new THREE.Vector3().copy(spec.axis) : null,
      normal: spec.normal ? new THREE.Vector3().copy(spec.normal) : null,
    };
    // (the arena, with the cone switch on: a point emitter's field half angle in degrees; see CONE)
    if (cone && Number.isFinite(spec.cone)) { e.cone = spec.cone; e.bell = spec.bell === true; }
    const i = emitters.findIndex((x) => x.id === e.id);
    if (i >= 0) emitters[i] = e; else emitters.push(e);
    sync(); // live at once (dev pages, late props); commit() is the documented freeze point
    return e;
  }

  /** Forget one emitter (the shell withdraws a wall lamp that a prop covers). Returns true when it existed. */
  function removeEmitter(id) {
    const i = emitters.findIndex((x) => x.id === String(id));
    if (i < 0) return false;
    emitters.splice(i, 1);
    sync();
    return true;
  }

  /**
   * A MeshStandardMaterial lit by the three lights plus every registered emitter. Contract parameters: color, map, roughness,
   * metalness, normalMap, roughnessMap, emissive, emissiveMap, ao (a constant occlusion factor 0..1), name. Optional extras:
   * normalScale (number), envMapIntensity (specular share of the cube, default 0.08), envDiffuse (diffuse share of the cube,
   * default 0), vertexColors, side, tableShadow (true on a floor: the table's shadow under the lamp), emissiveIntensity,
   * physical (true = MeshPhysicalMaterial) with clearcoat / clearcoatRoughness, lightmap (true | 'spec': the material takes
   * the room's baked map while there is one; its mesh must carry the `lm` attribute; not with `physical`), hide (true: the
   * mesh carries `roomSide` and drops a side of the room while the camera is behind it), relief (true, with lightmap and
   * hide: see RELIEF), volume (false: stay on the analytic light when the room has a baked volume; every other material that
   * is not on the map takes the volume), spec (false: no emitter highlights under the bake).
   */
  function material(p = {}) {
    ensure();
    const Ctor = p.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const m = new Ctor({
      color: p.color ?? 0xffffff,
      roughness: p.roughness ?? 0.7,
      metalness: p.metalness ?? 0,
    });
    if (p.map) m.map = p.map;
    if (p.normalMap) { m.normalMap = p.normalMap; const s = p.normalScale ?? 1; m.normalScale.set(s, s); }
    if (p.roughnessMap) m.roughnessMap = p.roughnessMap;
    if (p.emissive !== undefined && p.emissive !== null) m.emissive.set(p.emissive);
    if (p.emissiveMap) m.emissiveMap = p.emissiveMap;
    if (Number.isFinite(p.emissiveIntensity)) m.emissiveIntensity = p.emissiveIntensity;
    if (p.vertexColors) m.vertexColors = true;
    if (p.side !== undefined) m.side = p.side;
    if (p.physical) {
      if (Number.isFinite(p.clearcoat)) m.clearcoat = p.clearcoat;
      if (Number.isFinite(p.clearcoatRoughness)) m.clearcoatRoughness = p.clearcoatRoughness;
    }
    m.name = p.name || 'club.room.material';
    m.envMapIntensity = Number.isFinite(p.envMapIntensity) ? p.envMapIntensity : 0.08;
    // an explicit binding makes envMapIntensity live (a material on scene.environment renders it at the scene's intensity)
    if (envTexture) m.envMap = envTexture;
    const own = {
      uRoomEnvDiffuse: { value: Number.isFinite(p.envDiffuse) ? p.envDiffuse : 0 },
      uRoomMatAO: { value: Number.isFinite(p.ao) ? Math.min(1, Math.max(0, p.ao)) : 1 },
    };
    const tableShadow = p.tableShadow === true;
    const wantsMap = (p.lightmap === true || p.lightmap === 'spec') && !p.physical;
    const mapSpec = p.lightmap === 'spec' && !lite;
    const hide = p.hide === true;
    const relief = p.relief === true && hide && wantsMap;
    // the volume: every material that is not on the map takes it (`volume: false` keeps the analytic light); the emitter loop
    // stays for the highlights unless the surface is too rough to show one (or the tier is lite)
    const wantsVolume = p.volume !== false;
    const volSpec = !lite && p.spec !== false && (!!p.roughnessMap || (p.roughness ?? 0.7) < 0.85);
    // the variant follows the room's bake: with a map, a material that takes it compiles ROOM_LM; with a volume, every other
    // one compiles ROOM_VOL (and recompiles when the bake comes or goes: setLightmap, setVolume)
    const mode = () => (wantsMap && lmTexture ? `lm${mapSpec ? '+spec' : ''}${relief ? '+rel' : ''}` : wantsVolume && volume ? `vol${volSpec ? '+spec' : ''}` : '-');
    // (the arena's floor with the table's shadow under the emitters is its own program: `|tb`; without the switch the key is as it was)
    const block = tableShadow && tableBlock;
    if (block) blockUniforms ??= { uRoomTableBlock: { value: new THREE.Vector4(TABLE_BLOCK.strength, TABLE_BLOCK.soft, TABLE_BLOCK.source, 0) } };
    // (the arena's cone for point emitters is its own program too: `|cone`, on every material made while the switch is on)
    const coned = cone;
    const variant = () => `${KEY}|n${limit}|${lite ? 'lite' : 'full'}|${tableShadow ? 'ts' : '-'}|${mode()}|${hide ? 'hide' : '-'}${block ? '|tb' : ''}${coned ? '|cone' : ''}`;
    ownOf.set(m, own);
    m.userData.clubRoom = variant(); // a plain string: userData stays serialisable
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms, own);
      if (block) Object.assign(shader.uniforms, blockUniforms);
      shader.defines = shader.defines ?? {};
      const parsFragment = block ? PARS_FRAGMENT + TABLE_BLOCK_PARS : PARS_FRAGMENT;
      const lightsBlock = block ? LIGHTS_FRAGMENT.replace(TABLE_BLOCK_ANCHOR, TABLE_BLOCK_ANCHOR + TABLE_BLOCK_CALL).replace(TABLE_BLOCK_BAKED_ANCHOR, TABLE_BLOCK_BAKED_CODE) : LIGHTS_FRAGMENT;
      const lightsFragment = coned ? lightsBlock.replace(CONE_ANCHOR, CONE_CODE) : lightsBlock;
      const mapped = wantsMap && !!lmTexture, vol = !mapped && wantsVolume && !!volume;
      const head = `#define ROOM_EMITTERS ${limit}\n${lite ? '#define ROOM_LITE\n' : ''}${tableShadow ? '#define ROOM_TABLE_SHADOW\n' : ''}`
        + `${mapped ? '#define ROOM_LM\n' : ''}${vol ? '#define ROOM_VOL\n' : ''}${mapped || vol ? '#define ROOM_BAKED\n' : ''}`
        + `${(mapped && mapSpec) || (vol && volSpec) ? '#define ROOM_SPEC\n' : ''}${mapped && relief ? '#define ROOM_RELIEF\n' : ''}${hide ? '#define ROOM_HIDE\n' : ''}`;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${head}${PARS_VERTEX}${HIDE_PARS_VERTEX}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLDPOS_VERTEX}${HIDE_VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${head}${parsFragment}`)
        .replace('#include <lights_pars_begin>', `#include <lights_pars_begin>\n${POINT_WRAP_PARS}`)
        .replace('#include <lights_fragment_begin>', `${POINT_WRAP_ON}#include <lights_fragment_begin>\n${POINT_WRAP_OFF}${lightsFragment}`)
        .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${ENV_FRAGMENT}`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FLOOR_END_FRAGMENT}`);
    };
    m.customProgramCacheKey = variant;
    variantOf.set(m, variant);
    try { made.push(new WeakRef(m)); if (wantsMap) lmMaterials.push(new WeakRef(m)); } catch { /* no WeakRef: state() counts less */ }
    return m;
  }

  /** An unlit HDR emitter surface: a lamp shade, a lit sign, a window (a bloom and bokeh source; it also feeds the cube). */
  function emissive(p = {}) {
    const c = new THREE.Color().copy(p.color instanceof THREE.Color ? p.color : new THREE.Color(p.color ?? 0xffffff));
    c.multiplyScalar(Number.isFinite(p.intensity) ? p.intensity : 1);
    const m = new THREE.MeshBasicMaterial({ color: c });
    if (p.map) m.map = p.map;
    if (p.side !== undefined) m.side = p.side;
    if (p.transparent) { m.transparent = true; m.opacity = p.opacity ?? 1; m.depthWrite = false; }
    m.name = p.name || 'club.room.emissive';
    m.userData.clubRoom = 'emissive';
    if (p.hide === true) {
      // the mesh carries `roomSide`: its side of the room is dropped while the camera is behind it (see the header)
      ensure();
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uRoomSides = uniforms.uRoomSides;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n#define ROOM_HIDE\n${HIDE_PARS_VERTEX}`)
          .replace('#include <project_vertex>', `#include <project_vertex>\n${HIDE_VERTEX}`);
      };
      m.customProgramCacheKey = () => HIDE_KEY;
    }
    return m;
  }

  /** Freeze the emitter list into the uniforms (room.js calls it once, after the shell and the props are built). */
  function commit() {
    sync();
    committed = true;
    return state();
  }

  /** The interior box of the room, for the built-in corner and skirting darkening. */
  function setBox(min, max) {
    const u = ensure();
    u.uRoomBoxMin.value.copy(min); u.uRoomBoxMax.value.copy(max);
  }
  /** Room ambient (irradiance, the app's light units): `sky` on up-facing surfaces, `ground` on down-facing ones, their
   * mean plus `side` on vertical ones (walls collect the bounce of the other walls; a floor far from a lamp does not). */
  function setAmbient(sky, ground, side = null) {
    serial += 1;
    const u = ensure();
    if (sky) u.uRoomAmbSky.value.copy(sky);
    if (ground) u.uRoomAmbGround.value.copy(ground);
    if (side) u.uRoomAmbSide.value.copy(side);
  }
  /** The lamp rectangle and the table-top rectangle of the built-in floor shadow (world metres). */
  function setShadow({ lamp = null, table = null, lampY = null, tableY = null, strength = null, ambient = null } = {}) {
    const u = ensure();
    if (lamp) u.uRoomLampRect.value.set(lamp.cx, lamp.cz, lamp.hx, lamp.hz);
    if (table) u.uRoomTableRect.value.set(table.cx, table.cz, table.hx, table.hz);
    if (Number.isFinite(lampY)) u.uRoomShadowY.value.x = lampY;
    if (Number.isFinite(tableY)) u.uRoomShadowY.value.y = tableY;
    if (Number.isFinite(strength)) u.uRoomShadowY.value.z = strength;
    if (Number.isFinite(ambient)) u.uRoomShadowY.value.w = ambient;
  }
  /** The room group moved up or down by dy (the app re-seats the floor per table class): emitters and box follow. */
  function reseat(dy, boxMin = null, boxMax = null) {
    offsetY = Number.isFinite(dy) ? dy : 0;
    if (boxMin && boxMax) setBox(boxMin, boxMax);
    sync();
  }
  /** Bind (or re-bind) the cube every lit material made here reflects. */
  function setEnvMap(tex) {
    envTexture = tex ?? null;
    for (const r of made) { const m = r.deref?.(); if (m && m.envMap !== envTexture) { m.envMap = envTexture; m.needsUpdate = true; } }
  }
  /**
   * The baked light map (room/lightmap.js), or null for the analytic light. `fullScale` = the irradiance a texel value of 1
   * stands for; `lampVisibility` 0..1 = how much of the baked lamp visibility (alpha) is applied to the three lights;
   * `keepPoint` 0..1 = the share of the app's point lights left on the mapped surfaces. Every material made with `lightmap`
   * recompiles into the other variant when a map comes or goes (not when one map replaces another).
   */
  function setLightmap(texture, { fullScale = 16, lampVisibility = 1, keepPoint = 0, floor = null } = {}) {
    const u = ensure();
    const was = !!lmTexture;
    serial += 1;
    lmTexture = texture?.isTexture ? texture : null;
    u.uRoomLightMap.value = lmTexture;
    u.uRoomLM.value.set(fullScale, lampVisibility, keepPoint, 0);
    // for floorIrradiance(): the decoded bytes and where the floor's chart lies in them (`floor`: the chart's atlas record
    // plus `o`, the world position of its origin)
    const img = lmTexture?.image;
    lmData = img?.data && floor ? { data: img.data, size: img.width, fullScale, floor } : null;
    if (was !== !!lmTexture) for (const r of lmMaterials) { const m = r.deref?.(); if (m) { m.userData.clubRoom = variantOf.get(m)?.() ?? m.userData.clubRoom; m.needsUpdate = true; } }
    return !!lmTexture;
  }
  /**
   * The baked light volume (room/lightmap.js), or null: `{ texture: Data3DTexture, data: Uint8Array, dims: [nx, ny, nz],
   * min, max (room coordinates of the grid's box), bias, fullScale }`. Every material made here that is not on the map
   * recompiles into the other variant when a volume comes or goes.
   */
  function setVolume(vol) {
    const u = ensure();
    const was = !!volume;
    volume = vol?.texture?.isTexture && vol.data && Array.isArray(vol.dims) ? { ...vol, bias: Number.isFinite(vol.bias) ? vol.bias : VOLUME_BIAS, fullScale: vol.fullScale ?? u.uRoomLM.value.x } : null;
    u.uRoomVol.value = volume ? volume.texture : null;
    sync();
    if (was !== !!volume) for (const r of made) { const m = r.deref?.(); if (m) { const k = variantOf.get(m)?.(); if (k && k !== m.userData.clubRoom) { m.userData.clubRoom = k; m.needsUpdate = true; } } }
    return !!volume;
  }
  /** The main lamp's pool (see POOL): tangents where its direct light starts and stops fading, and how much of the fade applies. */
  function setPool({ t0 = POOL.t0, t1 = POOL.t1, strength = 1, gain = POOL.gain } = {}) { ensure().uRoomPool.value.set(t0, Math.max(t1, t0 + 1e-3), Math.min(1, Math.max(0, strength)), Math.min(8, Math.max(0, gain))); }
  /**
   * The floor's gloss (see FLOOR_GLOSS): any of sheen, emitter, knee, cap, shadow, and `lamp` (tools: 0 takes the main lamp's
   * own light off the floor, for the pair that shows what the pool is made of). A value that is not a number stays.
   */
  function setFloorGloss(o = {}) {
    const u = ensure(), g = u.uRoomFloor.value, sw = u.uRoomFloorSw.value;
    const n = (v, d, lo = 0, hi = 64) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
    g.set(n(o.sheen, g.x), n(o.emitter, g.y), n(o.knee, g.z), n(o.cap, g.w));
    sw.x = n(o.shadow, sw.x, 0, 1); sw.y = n(o.lamp, sw.y, 0, 4);
    return floorGloss();
  }
  const floorGloss = () => { const g = ensure().uRoomFloor.value, sw = uniforms.uRoomFloorSw.value; return { sheen: g.x, emitter: g.y, knee: g.z, cap: g.w, shadow: sw.x, lamp: sw.y }; };
  /** The table's shadow under the emitters on a floor built with `tableBlock` (see TABLE_BLOCK); a no-op without one.
   * `baked` 0..1: the share of the baked light that is final on that floor (the bake's floor texels saw the table: see
   * TABLE_BLOCK_BAKED_CODE); a value that is not a number keeps the one that is set. */
  function setTableBlock({ strength = TABLE_BLOCK.strength, soft = TABLE_BLOCK.soft, source = TABLE_BLOCK.source, baked = null } = {}) {
    if (!blockUniforms) return false;
    const v = blockUniforms.uRoomTableBlock.value;
    v.set(Math.min(1, Math.max(0, strength)), Math.max(0, soft), Math.max(0, source), Number.isFinite(baked) ? Math.min(1, Math.max(0, baked)) : v.w);
    return true;
  }
  /** The planes of the room's six sides (shell.sides: [nx, ny, nz, w] in room coordinates), or null: nothing is hidden. */
  function setSides(planes) {
    sidePlanes = Array.isArray(planes) && planes.length === 6 ? planes.map((p) => [p[0], p[1], p[2], p[3]]) : null;
    sync();
  }
  /** Dev pages only: forget every emitter (and the map and the side planes). */
  function reset() {
    emitters.length = 0; committed = false; warned = false; offsetY = 0; sidePlanes = null; tableBlock = false; cone = false;
    if (uniforms) { setLightmap(null); setVolume(null); setPool(); setFloorGloss({ ...FLOOR_GLOSS, lamp: 1 }); sync(); }
    lmMaterials.length = 0;
  }

  function state() {
    return {
      emitters: emitters.length, evaluated: Math.min(emitters.length, limit), max: MAX_EMITTERS, limit, lite, committed, serial,
      materials: made.reduce((n, r) => n + (r.deref?.() ? 1 : 0), 0),
      ids: emitters.map((e) => e.id),
      lightmap: { on: !!lmTexture, materials: lmMaterials.reduce((n, r) => n + (r.deref?.() ? 1 : 0), 0), fullScale: uniforms?.uRoomLM.value.x ?? null, lampVisibility: uniforms?.uRoomLM.value.y ?? null, keepPoint: uniforms?.uRoomLM.value.z ?? null },
      volume: { on: !!volume, dims: volume ? volume.dims.slice() : null, bias: volume?.bias ?? null, materials: made.reduce((n, r) => n + (/\|vol/.test(r.deref?.()?.userData?.clubRoom ?? '') ? 1 : 0), 0) },
      pool: uniforms ? { t0: uniforms.uRoomPool.value.x, t1: uniforms.uRoomPool.value.y, strength: uniforms.uRoomPool.value.z, gain: uniforms.uRoomPool.value.w } : { t0: POOL.t0, t1: POOL.t1, strength: 1, gain: POOL.gain },
      floorGloss: floorGloss(),
      variants: made.reduce((acc, r) => { const k = r.deref?.()?.userData?.clubRoom; if (k) acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}),
      sides: !!sidePlanes,
    };
  }

  const api = {
    MAX_EMITTERS,
    addEmitter, material, emissive, commit,
    // not part of the contract (room.js and dev pages only)
    init, removeEmitter, setBox, setAmbient, setShadow, reseat, setEnvMap, setLightmap, setVolume, setPool, setFloorGloss, setSides, setTableBlock, reset, state,
    // the room's light for surfaces that are not room materials (see each function)
    irradianceAt, lampShareAt, floorIrradiance,
    /** The volume for a shader of another module: the uniform OBJECTS and the GLSL that reads them (one sampler3D), or
     * `enabled: false` while the room has no bake. `vec4 clubRoomVolume( vec3 worldPos, vec3 worldNormal )` returns rgb =
     * irradiance / fullScale (multiply by `uRoomLM.x`) and a = the main lamp's visible share. */
    get volume() {
      const u = ensure();
      return { enabled: !!volume, fullScale: volume?.fullScale ?? null, dims: volume ? volume.dims.slice() : null,
        uniforms: { uRoomVol: u.uRoomVol, uRoomVolMin: u.uRoomVolMin, uRoomVolInv: u.uRoomVolInv, uRoomVolDim: u.uRoomVolDim, uRoomLM: u.uRoomLM }, glsl: VOLUME_GLSL };
    },
    uniformsOf: (m) => ownOf.get(m) ?? null,
    get uniforms() { return ensure(); },
    get emitters() { return emitters; },
    /** A counter that moves whenever irradianceAt(), lampShareAt() or floorIrradiance() may answer differently. */
    get serial() { return serial; },
  };
  return api;
}

export const roomLight = makeLight();
