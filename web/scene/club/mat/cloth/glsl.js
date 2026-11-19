// Copyright (c) Meta Platforms, Inc. and affiliates.

// mat/cloth/glsl.js — the cloth patch of the club look as text (CONTRACT.md 9.1, owner: cloth). No three import: the node arm
// reads it. One spec for club.adopt.patch on the app's cloth material (shading.js injectAnalytic, cloth mode), `before` / `after`
// anchors only, so it composes with the occlusion patch in either order.
//
// Four places in the fragment shader:
//   colour   after <map_fragment>: the look's cloth colour (saturation and level of the albedo, any hue)
//   frame    before <clearcoat_normal_fragment_begin>, that is after the app's whole normal stage (nap, twill, dimple): which
//            part of the cloth this fragment is (bed, cushion top, cushion face), the nap flatten and, in the variant with the
//            sampler, the thread-scale weave normal
//   sheen    after <lights_physical_fragment>: sheen amount and colour (the dye's share, the cut at a grazing view, the lamp's
//            throw), the cushion cloth, the dielectric lobe
//   light    after <lights_fragment_end>, that is on the finished light terms and BEFORE the app's shadow rails and the
//            occlusion service read them: the cloth's light as the lamp gives it (see LIGHT below)
//
// Every strength is a uniform and the values written by cloth.js for a switched-off group are the identity, so on / off pairs
// need no second program.

/** Bump when the text of the patch changes: the number is part of the program cache key. */
export const CLOTH_PATCH_VERSION = 3;

export const ANCHOR_COLOUR = '#include <map_fragment>';
export const ANCHOR_FRAME = '#include <clearcoat_normal_fragment_begin>';
export const ANCHOR_SHEEN = '#include <lights_physical_fragment>';
export const ANCHOR_LIGHT = '#include <lights_fragment_end>';
/** The app line both light rails are applied on (shading.js SPIKE_APPLY); the occlusion patch anchors on it. The light piece
 *  of this patch must land before it (the node arm checks the order in the real texts). */
export const SPIKE_RAIL = 'reflectedLight.directDiffuse *= spikeShadow;';

/** The detail fade of the weave tap: narrow side of the pixel footprint from KEEP[0] to KEEP[1] texels, wide side from KEEP[2] to KEEP[3]. */
export const KEEP = [0.6, 1.4, 1.8, 3.2];

const PARS = (weave) => /* glsl */`
uniform vec4 uClubClothLamp;    // the lamp rectangle: centre x, centre z, half x, half z (world metres)
uniform vec4 uClubClothLampK;   // lamp y, 1 / form factor at the bed point under the lamp centre, bed plane y, unused
uniform vec4 uClubClothLampL;   // rgb: the lamp's light on a white bed under its centre (radiance x form factor there); w unused
uniform vec4 uClubClothPool;    // direct gain, ambient level of an upward patch (share of the centre's lamp light), floor (share of the centre's level), share of the app's indirect diffuse light that is kept
uniform vec4 uClubClothAmbTint; // rgb: the flat part of the ambient light (share of the centre's lamp light x its colour); w unused
uniform vec4 uClubClothVeil;    // rgb: tint of the light the fibre ends scatter undyed (0 = no veil); w: gain of the environment's specular and sheen legs
uniform vec4 uClubClothShape;   // the lamp's throw (exponent on the pool; 1 = a bare diffuser), veil under the lamp, veil at the dim ends (both: share of what the dye itself returns of the centre's lamp light), share of the sheen that takes the dye's colour
uniform vec4 uClubClothGraze;   // the bed's sheen at a low eye: gain at a grazing view, N.V from which / at which the gain is back to 1; w: share of the app's view-distance fade of the cloth that is taken out
uniform vec4 uClubClothEven;    // the level that replaces the app's view-distance fade (see LIGHT); gain of the lamp's dielectric reflection on the bed; the veil's pool range: at / under z the veil is the dim-end value, from w on the lit value
uniform vec4 uClubClothFace;    // cushion faces: level (share of the bed's light a face gets per unit of hemisphere the bed fills), share of that light the fibre surface returns undyed (the face's veil), gain on the room's ambient cube (0 = not delivered), unused
uniform vec3 uClubClothAmb[ 6 ]; // the room's light without the lamp's own face (club.env.ambient): +x, -x, +y, -y, +z, -z
uniform vec4 uClubClothTone;    // albedo gain, albedo saturation, sheen gain, sheen saturation
uniform vec4 uClubClothCush;    // cushion cloth: sheen gain, sheen roughness scale, albedo gain, on
uniform vec4 uClubClothNear;    // the app's close-up twill takes over inside this view distance: start, end (metres), on; w: gain of the dielectric lobe
uniform vec4 uClubClothGrain;   // the app's relief (nap, twill): share flattened everywhere; pixel size on the cloth (metres) from which / at which the footprint flatten starts / is full; its most
${weave ? /* glsl */`uniform vec4 uClubClothWeaveK;  // weave tiles per metre, weave strength, texture size in texels, unused
uniform vec4 uClubClothNap;     // thread direction on the bed (world x, z), unused x 2
uniform sampler2D uClubClothWeave;` : ''}
vec3 clubClothNw = vec3( 0.0, 1.0, 0.0 ); // the surface normal of this fragment before any relief, world space
float clubClothCushW = 0.0;               // 0 on the bed, 1 on cloth that is stretched over a cushion
float clubClothFaceW = 0.0;               // 1 on a cushion face that does not look up (the nose and the face under it), else 0
float clubClothPoolS = 1.0;               // the lamp pool at this fragment (form factor relative to the bed point under the lamp centre) with the throw applied
float clubClothThrow = 1.0;               // what the throw makes of the app's lamp term here: pool ^ ( throw - 1 )
// saturation as a power of each channel's ratio to the luminance, luminance kept: no negative lobe, zero stays zero, s = 1 is
// the identity (the same form as the look's grade)
vec3 clubClothSat( vec3 c, float s ) {
  const vec3 w = vec3( 0.2126, 0.7152, 0.0722 );
  float l = max( dot( c, w ), 1e-6 );
  vec3 r = pow( max( c / l, vec3( 1e-6 ) ), vec3( s ) );
  return r * ( l / max( dot( r, w ), 1e-6 ) );
}
// one edge of Lambert's contour integral: theta * ( a x b ).y / | a x b | for unit vectors a, b
float clubClothEdge( vec3 a, vec3 b ) {
  float x = clamp( dot( a, b ), - 1.0, 1.0 );
  return acos( x ) * ( a.z * b.x - a.x * b.z ) * inversesqrt( max( 1.0 - x * x, 1e-8 ) );
}
// form factor of the lamp rectangle (horizontal, facing down) at a point below it, for an upward normal: the lamp pool
float clubClothLampFF( vec3 wp ) {
  vec3 c = vec3( uClubClothLamp.x - wp.x, max( uClubClothLampK.x - wp.y, 1e-3 ), uClubClothLamp.y - wp.z );
  vec3 v0 = normalize( c + vec3( - uClubClothLamp.z, 0.0, - uClubClothLamp.w ) );
  vec3 v1 = normalize( c + vec3( uClubClothLamp.z, 0.0, - uClubClothLamp.w ) );
  vec3 v2 = normalize( c + vec3( uClubClothLamp.z, 0.0, uClubClothLamp.w ) );
  vec3 v3 = normalize( c + vec3( - uClubClothLamp.z, 0.0, uClubClothLamp.w ) );
  return abs( clubClothEdge( v0, v1 ) + clubClothEdge( v1, v2 ) + clubClothEdge( v2, v3 ) + clubClothEdge( v3, v0 ) ) * 0.15915494;
}
// the room's ambient cube at a world normal: cosine-weighted mean radiance around each axis, blended by the squared normal
vec3 clubClothAmbAt( vec3 n ) {
  vec3 s = n * n;
  return s.x * ( n.x >= 0.0 ? uClubClothAmb[ 0 ] : uClubClothAmb[ 1 ] )
    + s.y * ( n.y >= 0.0 ? uClubClothAmb[ 2 ] : uClubClothAmb[ 3 ] )
    + s.z * ( n.z >= 0.0 ? uClubClothAmb[ 4 ] : uClubClothAmb[ 5 ] );
}
${weave ? /* glsl */`
// the footprint of this pixel in a tiling texture, in texels: ( narrow side, wide side ) of the ellipse the screen
// derivatives dx, dy of the lookup coordinate span; size: texels per tile
vec2 clubClothFoot( vec2 dx, vec2 dy, float size ) {
  float a = dot( dx, dx ), b = dot( dy, dy ), c = dot( dx, dy );
  float t = a + b, d = sqrt( max( ( a - b ) * ( a - b ) + 4.0 * c * c, 0.0 ) );
  return size * sqrt( max( vec2( 0.5 * ( t - d ), 0.5 * ( t + d ) ), 0.0 ) );
}
// how much of the thread-scale weave survives at this pixel: all of it while a pixel is under ${KEEP[0].toFixed(1)} texel on the narrow side of
// its footprint and ${KEEP[2].toFixed(1)} on the wide side, nothing from ${KEEP[1].toFixed(1)} and ${KEEP[3].toFixed(1)}. A rib is two to three texels wide: past that
// limit a twill is not a weave any more but grain, and under a moving camera it would shimmer.
float clubClothKeep( vec2 foot ) {
  return ( 1.0 - smoothstep( ${KEEP[0].toFixed(2)}, ${KEEP[1].toFixed(2)}, foot.x ) ) * ( 1.0 - smoothstep( ${KEEP[2].toFixed(2)}, ${KEEP[3].toFixed(2)}, foot.y ) );
}` : ''}
`;

const COLOUR = /* glsl */`
diffuseColor.rgb = clubClothSat( diffuseColor.rgb, uClubClothTone.y ) * uClubClothTone.x;
`;

// Which cloth this fragment is. The bed looks up and lies in the bed plane; everything else the material covers is cloth
// stretched over a cushion (or a pocket cut), and of that the faces that do not look up (the nose and the face under it) are
// lit differently: the lamp is behind their horizon and their light is what the bed in front of them returns.
//
// The weave (variant with the sampler only; off by default on every tier, see cloth.js): ONE tap at the scan's true thread
// scale, faded by the pixel footprint. At 1280 x 720 no fixed view resolves a 0.65 mm rib beyond the half metre inside which
// the app's own close-up twill is on, so the tap is for large frames; round 1's second tap (the same texture stretched 8 x
// along the threads) is gone: its ribs were 2 mm across and read as diagonal streaks on the bed and the cushion tops.
// The weave coordinate is built from WORLD AXES, never from a normal: along the threads, and across them the horizontal
// distance, on a cushion folded over its profile ( | distance | minus height ).
const FRAME = (weave) => /* glsl */`
{
  vec3 clubWp = vSpikeWorldPos;
  clubClothNw = inverseTransformDirection( nonPerturbedNormal, viewMatrix );
  // the app's relief (table.js makeNapNormal, the close-up twill) shows in the lamp term only. Under the club light the lamp
  // term is most of the cloth's light, and the relief reads as coarse grain: a share of it is flattened everywhere, and
  // nearly all of it where a pixel is wider on the cloth than half a rib of the weave (0.65 mm ribs: from there on the
  // relief cannot be drawn as a weave, only as pebble grain at a low angle, and under a moving camera it would shimmer).
  {
    vec3 clubFw = fwidth( clubWp );
    float clubFlat = max( uClubClothGrain.x, uClubClothGrain.w * smoothstep( uClubClothGrain.y, uClubClothGrain.z, length( clubFw ) ) );
    normal = normalize( mix( normal, nonPerturbedNormal, clubFlat ) );
  }
  // the lamp pool, once per fragment: the rectangle's form factor relative to the bed point under its centre, and the throw.
  // A canopy with a shade or louvres does not emit like a bare diffuser: it sends more of its light straight down, so the
  // light falls faster toward the ends than the form factor alone (exponent 1 = the bare diffuser, the app's lamp term)
  {
    float clubPool = clamp( clubClothLampFF( clubWp ) * uClubClothLampK.y, 0.0, 1.25 );
    clubClothThrow = pow( max( clubPool, 1e-3 ), uClubClothShape.x - 1.0 );
    clubClothPoolS = clubPool * clubClothThrow;
  }
  float clubUp = clubWp.y - uClubClothLampK.z;
  clubClothCushW = uClubClothCush.w * max( 1.0 - smoothstep( 0.93, 0.995, clubClothNw.y ), smoothstep( 0.002, 0.006, abs( clubUp ) ) );
  clubClothFaceW = clubClothCushW * ( 1.0 - smoothstep( 0.55, 0.9, clubClothNw.y ) );
${weave ? /* glsl */`
  if ( uClubClothWeaveK.y > 0.0 ) {
    vec3 clubAx = abs( clubClothNw.x ) > abs( clubClothNw.z ) + 0.02
      ? vec3( - uClubClothNap.y, 0.0, uClubClothNap.x ) : vec3( uClubClothNap.x, 0.0, uClubClothNap.y );
    vec3 clubTw = normalize( clubAx - clubClothNw * dot( clubAx, clubClothNw ) );
    vec3 clubBw = cross( clubClothNw, clubTw );
    float clubAcross = dot( clubWp, cross( vec3( 0.0, 1.0, 0.0 ), clubAx ) );
    vec2 clubUv = vec2( dot( clubWp, clubAx ), mix( clubAcross, abs( clubAcross ) - clubUp, clubClothCushW ) ) * uClubClothWeaveK.x;
    vec2 clubDx = dFdx( clubUv ), clubDy = dFdy( clubUv );
    float clubFine = clubClothKeep( clubClothFoot( clubDx, clubDy, uClubClothWeaveK.z ) ) * uClubClothWeaveK.y;
    // the app fades its own thread-scale twill in at arm's length (shading.js SPIKE_DETAIL): there this tap hands over to it
    clubFine *= mix( 1.0, smoothstep( uClubClothNear.x, uClubClothNear.y, length( vViewPosition ) ), uClubClothNear.z );
    if ( clubFine > 0.004 ) {
      vec2 clubDn = ( textureGrad( uClubClothWeave, clubUv, clubDx, clubDy ).xy * 2.0 - 1.0 ) * clubFine;
      normal = normalize( normal + normalize( mat3( viewMatrix ) * clubTw ) * clubDn.x + normalize( mat3( viewMatrix ) * clubBw ) * clubDn.y );
    }
  }` : ''}
}
`;

// Sheen. On a cushion the same cloth is pulled tight over the rubber: a narrower, stronger lobe and a slightly deeper colour.
// The smooth-dielectric lobe (4 % white at every angle on top of the dyed fibre) is turned down on the bed, where the sheen
// lobe is the cloth's surface reflection; a cushion face is seen at grazing angles and keeps it.
const SHEEN = /* glsl */`
{
  #ifdef USE_SHEEN
  // the sheen is light that went through dyed fibre: a share of it takes the dye's own colour at the sheen's luminance (any
  // dye; the app's sheen tint is a paler rung of the hue, which is what washes a low view toward pastel)
  const vec3 clubLw = vec3( 0.2126, 0.7152, 0.0722 );
  vec3 clubDyeHue = material.diffuseColor / max( dot( material.diffuseColor, clubLw ), 1e-5 );
  vec3 clubSheen = mix( material.sheenColor, min( clubDyeHue * dot( material.sheenColor, clubLw ), vec3( 4.0 ) ), uClubClothShape.w );
  // at a low eye the sheen lobe's reflectance climbs steeply and the bed turns into one pale sheet: on the bed it is cut
  // toward grazing (a look value); a cushion keeps its band. The lamp's throw shapes the lamp sheen like the lamp's light.
  float clubNdV = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
  float clubGraze = mix( mix( uClubClothGraze.x, 1.0, smoothstep( uClubClothGraze.y, uClubClothGraze.z, clubNdV ) ), 1.0, clubClothCushW );
  material.sheenColor = clubClothSat( clubSheen, uClubClothTone.w )
    * ( uClubClothTone.z * mix( 1.0, uClubClothCush.x, clubClothCushW ) * clubGraze * clubClothThrow );
  material.sheenRoughness = clamp( material.sheenRoughness * mix( 1.0, uClubClothCush.y, clubClothCushW ), 0.07, 1.0 );
  #endif
  material.diffuseColor *= mix( 1.0, uClubClothCush.z, clubClothCushW );
  float clubSpec = mix( uClubClothNear.w, 1.0, clubClothFaceW );
  material.specularColor *= clubSpec;
  material.specularF90 *= clubSpec;
}
`;

// The cloth's light. What the app hands over at this point, per fragment:
//   direct     the lamp (a rectangle of light 1 m over the bed) with its true falloff: the rectangle's form factor
//   indirect   the environment cube's irradiance, taken at one point over the bed centre and holding the lamp's own face:
//              two to four times the direct term and the same on the whole bed (measured, round 1b)
// The second is the lamp once more without its falloff, and it is why the cloth was flat. Here it is replaced by what a room
// gives a bed under its lamp:
//   lamp       the direct term x a gain (the look's exposure was set for a bed that received the lamp twice) x the throw
//              (pool ^ ( throw - 1 ): the fixture sends more of its light straight down than a bare diffuser)
//   ambient    the room's own light at a set LEVEL (a share of the centre's lamp light): as much of it as club.env.ambient
//              holds (the room without the lamp's face, as an ambient cube: it brings the room's colour and how much less
//              arrives from the side than from above), the rest as a flat warm term. The level is the look's, not the
//              capture's: cloth.js scales the cube so an upward patch gets no more than that share from it
//   floor      no upward patch falls under a set share of the centre's level: the corner tips stay readable
//   face       a cushion face that does not look up has the lamp behind its horizon and sees the bed in front of it over
//              half its hemisphere and more. It gets a share of that bed's level (lamp pool at that place) x the share of
//              its hemisphere the bed fills, and that much less of the ambient light: the same blue at a lower level.
//              The share is a look value: one diffuse bounce off this dye would return 3-5 % of the bed's light, which
//              leaves the faces near black (measured on the dev page); a real cloth returns far more toward a low eye
//              (fibre forward scatter), and reference frames show these faces at about half the bed.
//   veil       the fibre surface scatters a little light whatever the dye. Its level is a share of what the dye itself
//              returns (a dark dye gets a small veil and stays its colour), and it runs AGAINST the pool: next to none under
//              the lamp, where the cloth is its deepest and most saturated, and the most at the dim ends, where the lamp's
//              light arrives low and a fibre surface returns more of it undyed. Through the look's grade and tone map a dim
//              saturated blue loses its red channel entirely and turns to ink; the veil at the ends is what keeps them the
//              cloth's colour and the far balls on a readable ground
//   even       the app darkens the cloth's diffuse light with the distance and the angle of the eye (shading.js SPIKE_APPLY,
//              `spikeTone`: 1 at arm's length, 0.71 from the standing view; the constants are APP_TONE below and the node arm
//              pins the app's lines). Under the lamp pool that makes the near field of a low view the brightest cloth in
//              the frame whatever the lamp does. The same expression is evaluated here and divided out, and one level is
//              put in its place: the cloth's light is then a property of the bed, the same from every eye
// It lands before the shadow rails: the occlusion service splits the indirect light by the balance of the two terms it finds
// there, so it must find the cloth's real balance (a ball shadow keeps the ambient share and loses the lamp).
/** The app's view-distance fade of the cloth as shading.js writes it (SPIKE_APPLY, SPIKE_CLOTH block): the node arm checks these lines are still there. */
export const APP_TONE = Object.freeze({
  far: 'float spikeFar = smoothstep( 0.55, 3.0, spikeVd );',
  graze: 'float spikeGraze = 1.0 - spikeNdV;',
  tone: 'float spikeTone = 1.0 - spikeFar * ( 0.20 + 0.14 * spikeGraze );',
  ndv: 'float spikeNdV = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );',
});

const LIGHT = /* glsl */`
{
  // the level an upward patch at this place gets, in units of the centre's lamp light: lamp pool (with the throw) x gain + flat ambient
  float clubRel = uClubClothPool.x * clubClothPoolS + uClubClothPool.y;
  float clubFill = max( uClubClothPool.z * ( uClubClothPool.x + uClubClothPool.y ) - clubRel, 0.0 );
  // the share of this fragment's hemisphere that the bed in front of it fills (a face only)
  float clubBedFF = clubClothFaceW * 0.5 * ( 1.0 - clubClothNw.y );
  vec3 clubRoom = uClubClothFace.z * clubClothAmbAt( inverseTransformDirection( normal, viewMatrix ) )
    + uClubClothLampL.rgb * uClubClothAmbTint.rgb;
  vec3 clubAmb = clubRoom * ( 1.0 - clubBedFF ) + uClubClothLampL.rgb * ( clubFill * ( 1.0 - clubClothFaceW ) );
  vec3 clubBounce = uClubClothLampL.rgb * ( ( clubRel + clubFill ) * clubBedFF * uClubClothFace.x );
  // the app's view-distance fade (APP_TONE), divided out and replaced by one level; the app applies its own after this piece
  // (only where the app applies it: its SPIKE_CLOTH define)
  float clubEven = 1.0;
  #ifdef SPIKE_CLOTH
  {
    float clubAppTone = 1.0 - smoothstep( 0.55, 3.0, length( vViewPosition ) )
      * ( 0.20 + 0.14 * ( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ) ) );
    clubEven = mix( 1.0, uClubClothEven.x / max( clubAppTone, 0.5 ), uClubClothGraze.w );
  }
  #endif
  reflectedLight.directDiffuse *= uClubClothPool.x * clubClothThrow * clubEven;
  // the lamp's reflection in the smooth-dielectric lobe. three's area-light term keeps a grazing Fresnel part whatever the
  // specular colour ( ( 1 - specularColor ) * t2.y ), so the SHEEN piece's gain does not reach it: at a low eye it is a white
  // sheet over the lit cloth (measured: over half of the neutral light at the low aim view). It gets its own gain on the bed
  // and does not take the lamp gain; a cushion face keeps the lamp gain.
  reflectedLight.directSpecular *= clubClothThrow * clubEven * mix( uClubClothEven.y, uClubClothPool.x, clubClothFaceW );
  // the veil: a share of the dye's own return, from uClubClothShape.y under the lamp to uClubClothShape.z at the dim ends
  // (one value over the whole end zone: a corner tip is not veiled more than the end rail beside it)
  vec3 clubVeil = uClubClothLampL.rgb * uClubClothVeil.rgb * ( dot( material.diffuseColor, vec3( 0.2126, 0.7152, 0.0722 ) )
    * mix( uClubClothShape.z, uClubClothShape.y, smoothstep( uClubClothEven.z, uClubClothEven.w, clubClothPoolS ) ) );
  reflectedLight.indirectDiffuse = reflectedLight.indirectDiffuse * uClubClothPool.w + material.diffuseColor * ( clubAmb + clubBounce ) * clubEven;
  reflectedLight.indirectSpecular = reflectedLight.indirectSpecular * uClubClothVeil.w + clubVeil + clubBounce * uClubClothFace.y;
  #ifdef USE_SHEEN
  sheenSpecularIndirect *= uClubClothVeil.w;
  #endif
}
`;

/**
 * The adopt.patch spec for one cloth material. `weave`: the variant with the weave sampler (one added sampler); without it the
 * patch adds none. `uniforms`: the part's shared uniform OBJECTS (cloth.js).
 */
export function clothPatchSpec({ weave = false, uniforms = {} } = {}) {
  return {
    key: `mat-cloth-v${CLOTH_PATCH_VERSION}${weave ? '-w' : ''}`,
    uniforms,
    pars: PARS(weave),
    apply: [
      { anchor: ANCHOR_COLOUR, mode: 'after', code: COLOUR },
      { anchor: ANCHOR_FRAME, mode: 'before', code: FRAME(weave) },
      { anchor: ANCHOR_SHEEN, mode: 'after', code: SHEEN },
      { anchor: ANCHOR_LIGHT, mode: 'after', code: LIGHT },
    ],
  };
}

/** Names of the uniforms the patch text declares (the node arm checks the part supplies exactly these). */
export function clothUniformNames(weave = false) {
  const names = ['uClubClothLamp', 'uClubClothLampK', 'uClubClothLampL', 'uClubClothPool', 'uClubClothAmbTint', 'uClubClothVeil', 'uClubClothShape',
    'uClubClothGraze', 'uClubClothEven', 'uClubClothFace', 'uClubClothAmb', 'uClubClothTone', 'uClubClothCush', 'uClubClothNear', 'uClubClothGrain'];
  if (weave) names.push('uClubClothWeaveK', 'uClubClothNap', 'uClubClothWeave');
  return names;
}
