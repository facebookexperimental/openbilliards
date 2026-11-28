// Copyright (c) Meta Platforms, Inc. and affiliates.

// mat/pocket/glsl.js — the pocket part of the club look as text (CONTRACT.md 10.1, owner: pocket). No three import: the node
// arm reads it. Three pieces share one description of a pocket:
//
//   collar   the patch on the app's casting / boot material (table.js collarMat: MeshPhysical #161617 through shading.js
//            injectAnalytic): a leather albedo that is not black (ONE added sampler), a dielectric highlight instead of a
//            quarter of one, a stitched seam, and the ambient light falling off down the throat
//   lip      the patch on the app's cloth material where it meets a pocket: the cloth turns over the slate edge (the bed's
//            last millimetres are shaded as the roll they are, not as a flat sheet that ends), and the part of the cloth's
//            return that stands under the casting is shaded as the liner it stands in for (no sampler)
//   cup      the patch on the app's unlit cup materials (the drop below the bed, MeshBasic #030303): a liner lit by the
//            lamp through the mouth, by ambient light as a shaft lets it in, with a broad soft highlight (ONE added sampler)
//
// A pocket is described in a folded frame: a table is symmetric in x and z, so every corner pocket is the mirror image of
// the one in +x +z and every side pocket of the one at +z. Two sets of numbers (corner, side) cover the table:
//   A = ( front edge circle: centre x, centre z, radius;  half-width of the mouth across the pocket axis )
//   B = ( rear edge circle:  centre x, centre z, radius;  roll angle of the cloth at the bed edge, radians )
//   C = ( station along the outboard axis, from the front centre, beyond which the cloth's return stands under the casting;
//         height of the casting's top lip over the bed;  inner radius of the app's occlusion film on the bed, from the front
//         centre (0 = none found);  radius of the cup's round end )
// Light. The cloth part lights the bed with the lamp at a gain and a flat ambient level, and drops the app's environment
// probe from the diffuse light (the probe is one cube taken over the bed centre: it holds the lamp's own image and gives every
// surface the centre's value, five to six times the lamp's direct light at a pocket). The casting and the liner stand in the
// same light as the cloth beside them: uClubPktAmb = ( gain of the lamp term, ambient level in units of the lamp's form
// factor, share of the probe's light that is kept on the casting, 0 ).
// The mouth (the opening in the bed plane) is the intersection of the two circles and the band of the half-width.
// Patches use `before` / `after` anchors only and compose with occ-v<N> and mat-cloth-v<N>, which are in the text already.

/** Bump when the text of any piece changes: the number is part of every program cache key. */
export const POCKET_PATCH_VERSION = 1;

/** The app line both light rails are applied on (shading.js SPIKE_APPLY). */
export const SPIKE_RAIL = 'reflectedLight.directDiffuse *= spikeShadow;';
/** After the whole normal stage of a standard material (the app's and the cloth part's), before its clearcoat normal. */
export const ANCHOR_NORMAL_DONE = '#include <clearcoat_normal_fragment_begin>';
export const ANCHOR_LIGHTS = '#include <lights_physical_fragment>';

/** Lamp points per fragment of the liner: a 3 x 2 grid of cell centres over the rectangle, plus the rectangle's nearest point. */
export const LAMP_GRID = [3, 2];
/** Share of the lamp's area the nearest point stands for (the steepest light: the only part that reaches the floor of a drop). */
export const LAMP_NEAR_SHARE = 0.12;
/** Stitch pitch and the thread's share of it; the seam's half-width comes in a uniform. */
export const STITCH_PITCH_M = 0.0052;
export const STITCH_THREAD_SHARE = 0.68;
/** Radius the stitch row runs on round the casting's arc (it sets the dash pitch there, nothing else). */
export const STITCH_ARC_RADIUS_M = 0.07;

const f = (v, d = 4) => Number(v).toFixed(d);

// ---- the folded pocket frame (shared by the three pieces) ----
const FRAME = /* glsl */`
uniform vec4 uClubPktCA;
uniform vec4 uClubPktCB;
uniform vec4 uClubPktCC;
uniform vec4 uClubPktSA;
uniform vec4 uClubPktSB;
uniform vec4 uClubPktSC;
uniform vec4 uClubPktK;     // on, collar, lip, arc (0..1 each)
uniform vec4 uClubPktK2;    // liner, stitch, throat, unused
uniform vec4 uClubPktTone;  // leather albedo (linear rgb), tiles of the scan per metre
uniform vec4 uClubPktTex;   // 1 / mean luminance of the scan, contrast exponent, share of the scan's own hue, unused
uniform vec4 uClubPktLip;   // width of the roll band (m), ambient left on the fully turned lip, ambient left on the arc, jaw share of the throat
uniform vec4 uClubPktAmb;   // gain of the lamp term, ambient level (lamp form-factor units), share of the probe kept on the casting, unused
vec4 clubPktA = vec4( 0.0, 0.0, 1.0, 1.0 );
vec4 clubPktB = vec4( 0.0, 0.0, 1.0, 0.0 );
vec4 clubPktC = vec4( 1e3, 0.05, 0.0, 0.0 );
vec2 clubPktU = vec2( 0.0, 1.0 );   // the pocket's outboard axis in the folded frame
vec2 clubPktS = vec2( 1.0 );        // world xz times this = folded xz
// the nearest pocket of a world point: fills the frame above, returns the distance from the front centre in front radii
float clubPktNear( vec3 wp ) {
  vec2 s = vec2( wp.x < 0.0 ? - 1.0 : 1.0, wp.z < 0.0 ? - 1.0 : 1.0 );
  vec2 q = wp.xz * s;
  float dc = distance( q, uClubPktCA.xy );
  float ds = distance( vec2( wp.x, q.y ), uClubPktSA.xy );
  if ( ds < dc ) {
    clubPktA = uClubPktSA; clubPktB = uClubPktSB; clubPktC = uClubPktSC;
    clubPktU = vec2( 0.0, 1.0 ); clubPktS = vec2( 1.0, s.y );
    return ds / max( clubPktA.z, 1e-3 );
  }
  clubPktA = uClubPktCA; clubPktB = uClubPktCB; clubPktC = uClubPktCC;
  clubPktU = vec2( 0.70710678 ); clubPktS = s;
  return dc / max( clubPktA.z, 1e-3 );
}
// signed distance (metres, negative inside) from a point of the bed plane to the edge of the mouth; xz in the folded frame
float clubPktMouth( vec2 q ) {
  float lat = abs( dot( q - clubPktA.xy, vec2( - clubPktU.y, clubPktU.x ) ) ) - clubPktA.w;
  return max( max( length( q - clubPktA.xy ) - clubPktA.z, length( q - clubPktB.xy ) - clubPktB.z ), lat );
}
// ambient light on a wall element of a round shaft at depth d under its open end, relative to an element at the rim:
// 2 ( ( Z.Z + 0.5 ) / sqrt( Z.Z + 1 ) - Z ) with Z = d / 2R (the form factor of the element to the open end is half of this)
float clubPktSky( float z ) { return 2.0 * ( ( z * z + 0.5 ) / sqrt( z * z + 1.0 ) - z ); }
`;

const LEATHER_TEX = /* glsl */`
uniform sampler2D uClubPktLeather;
// the scan's relief of light and dark on the look's own leather colour: the scan is a brown hide, the pocket is near black
vec3 clubPktLeather( vec2 uv ) {
  vec3 t = texture2D( uClubPktLeather, uv ).rgb;
  float l = max( dot( t, vec3( 0.2126, 0.7152, 0.0722 ) ) * uClubPktTex.x, 1e-4 );
  vec3 hue = mix( vec3( 1.0 ), t * uClubPktTex.x / l, uClubPktTex.z );
  return uClubPktTone.rgb * hue * pow( l, uClubPktTex.y );
}
`;
const LEATHER_FLAT = /* glsl */`
vec3 clubPktLeather( vec2 uv ) { return uClubPktTone.rgb; }
`;

// ---- the collar (casting / boot) ----
const COLLAR_PARS = /* glsl */`
uniform vec4 uClubPktSpec;    // F0 of the leather, roughness scale, roughness offset, clearcoat scale
uniform vec4 uClubPktSeam;    // seam station along the section (m), 1 / v repeat of the normal map, half-width of the thread (m), on
uniform vec4 uClubPktThread;  // thread albedo (linear rgb), albedo scale in the needle holes
vec2 clubPktRel = vec2( 1.0, 0.0 );   // folded xz of this fragment from the front centre
float clubPktOnC = 0.0;                // how much of the collar treatment this fragment takes
`;

// Albedo. The app's boot is #161617, 0.8 % reflectance: under any light it stays at the bottom of the tone curve (6 / 255
// in the throat, measured), which is why the pocket read as a hole. Dyed leather and moulded rubber return 4-8 %. Only the
// near-black materials of a pocket take the new albedo (a stitch thread or a metal part of another table keeps its own).
// The scan is mapped from world position: round the throat by arc length and height, on the pad top by plan position; the
// arc is measured from the outboard axis, so its seam lies in the open mouth where there is no casting.
const COLLAR_ALBEDO = (tex) => /* glsl */`
{
  float clubPktDist = clubPktNear( vSpikeWorldPos );
  clubPktRel = vSpikeWorldPos.xz * clubPktS - clubPktA.xy;
  vec3 clubPktNw = inverseTransformDirection( nonPerturbedNormal, viewMatrix );
  float clubPktUo = dot( clubPktRel, clubPktU );
  float clubPktWo = dot( clubPktRel, vec2( - clubPktU.y, clubPktU.x ) );
  float clubPktAng = atan( clubPktWo, clubPktUo );
  float clubPktDark = 1.0 - smoothstep( 0.02, 0.06, dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) );
  clubPktOnC = uClubPktK.x * uClubPktK.y * clubPktDark * ( 1.0 - step( 4.0, clubPktDist ) );
  vec2 clubPktUv = mix( vec2( clubPktAng * clubPktA.z, vSpikeWorldPos.y ), vec2( clubPktUo, clubPktWo ), step( 0.6, abs( clubPktNw.y ) ) ) * uClubPktTone.w;
  vec3 clubPktAlb = clubPktLeather( clubPktUv );
  #ifdef USE_NORMALMAP
  if ( uClubPktSeam.w * uClubPktK2.y > 0.0 ) {
    // a stitched seam where the padded roll meets the flat of the pad: a row of thread dashes with needle holes between
    // them, at one station of the section all the way round. It fades out where a pixel is wider than the thread.
    float clubPktV = vNormalMapUv.y * uClubPktSeam.y;
    float clubPktFw = max( fwidth( clubPktV ), 1e-6 );
    float clubPktLine = 1.0 - smoothstep( uClubPktSeam.z, uClubPktSeam.z + clubPktFw, abs( clubPktV - uClubPktSeam.x ) );
    float clubPktAlong = ( clubPktUo > 0.0 ? clubPktAng * ${f(STITCH_ARC_RADIUS_M)} : clubPktUo ) / ${f(STITCH_PITCH_M)};
    float clubPktTri = abs( fract( clubPktAlong ) - 0.5 ) * 2.0;
    float clubPktDash = 1.0 - smoothstep( ${f(STITCH_THREAD_SHARE - 0.06, 2)}, ${f(STITCH_THREAD_SHARE + 0.06, 2)}, clubPktTri );
    float clubPktFade = uClubPktSeam.w * uClubPktK2.y * ( 1.0 - smoothstep( 0.0008, 0.0022, clubPktFw ) );
    clubPktAlb = mix( clubPktAlb, mix( clubPktAlb * uClubPktThread.w, uClubPktThread.rgb, clubPktDash ), clubPktLine * clubPktFade );
  }
  #endif
  diffuseColor.rgb = mix( diffuseColor.rgb, clubPktAlb, clubPktOnC );
}
`;

// The highlight. The app's boot has specularIntensity 0.24: F0 about 1 %, a quarter of a smooth dielectric's, set by its
// authors against a pad that read as polished rubber. The lobe is the app's own area-light lobe (the rectangle through three's
// LTC, with the boot's zoned roughness: glossier rolls, satin pad); the part raises F0 to about 2 % (the full 4.5 % of smooth
// leather was tried: with a lamp this large the pad outshone the cloth in the standing view) so the top lip carries a broad
// soft highlight over an albedo that is no longer black.
const COLLAR_LOBE = /* glsl */`
{
  material.specularColor = mix( material.specularColor, max( material.specularColor, vec3( uClubPktSpec.x ) ), clubPktOnC );
  material.specularF90 = mix( material.specularF90, 1.0, clubPktOnC );
  material.roughness = clamp( mix( material.roughness, material.roughness * uClubPktSpec.y + uClubPktSpec.z, clubPktOnC ), 0.07, 1.0 );
  #ifdef USE_CLEARCOAT
  material.clearcoat *= mix( 1.0, uClubPktSpec.w, clubPktOnC );
  #endif
  // the look's lamp gain is for the diffuse light (it stands for the cloth part's level); the highlight keeps the lamp's own
  // radiance (with the gain on it the pad read as polished metal from the standing view: 160-180 / 255, above the cloth)
  material.diffuseColor *= mix( 1.0, uClubPktAmb.x, clubPktOnC );
}
`;

// The throat. The inner wall of the casting stands in a shaft that is open upward and, above the bed, toward the table
// (between the jaws). A wall element at depth d under the top lip keeps clubPktSky( d / 2R ) of the rim's ambient light
// through the top, plus a share of what the top lost through the jaws. Below the bed plane the occlusion service's own
// depth law takes over (it starts from 1 at the bed plane), so this term is held at its bed-plane value there.
const COLLAR_THROAT = /* glsl */`{
    float clubPktLen = max( length( clubPktRel ), 1e-4 );
    float clubPktInw = dot( spikeWn.xz * clubPktS, - clubPktRel ) / clubPktLen;
    float clubPktWall = smoothstep( 0.25, 0.75, clubPktInw ) * ( 1.0 - smoothstep( 0.45, 0.85, abs( spikeWn.y ) ) )
      * ( 1.0 - smoothstep( clubPktA.z + 0.004, clubPktA.z + 0.014, clubPktLen ) );
    float clubPktSk = clubPktSky( max( clubPktC.y - max( vSpikeWorldPos.y, 0.0 ), 0.0 ) / ( 2.0 * clubPktA.z ) );
    spikeOcc *= mix( 1.0, clubPktSk + uClubPktLip.w * ( 1.0 - clubPktSk ), clubPktWall * uClubPktK.x * uClubPktK2.z );
    // the same light as the cloth beside it: the probe cut to the look's ambient level (the diffuse colour carries the lamp
    // gain, so the share is divided by it)
    spikeOcc *= mix( 1.0, uClubPktAmb.z / max( uClubPktAmb.x, 1e-3 ), clubPktOnC );
  }
  `;

// ---- the cloth lip ----
const LIP_PARS = /* glsl */`
uniform vec4 uClubPktLip2; // share of the cloth's sheen that the turned lip loses, light left on the bed between the hole and the app's film, unused x 2
float clubPktFilm = 0.0;   // 1 on the ring of bed between the edge of the hole and the inner edge of the app's occlusion film
float clubPktRoll = 0.0;   // 0 on the open bed, 1 where the cloth has turned over the slate edge
float clubPktArc = 0.0;    // 1 on the part of the cloth's return that stands under the casting
`;

// The roll. The app's bed is a flat sheet that ends at the hole in a sharp edge, and the return below it is a vertical wall:
// a hard drawn rim. Real cloth turns over a rounded slate edge. Inside the band the normal turns toward the middle of the
// hole, up to the roll angle at the edge, and the return starts from that same normal and reaches the vertical one band
// further down, so the lamp term and the sheen follow the curvature (the turned cloth faces away from a lamp that hangs
// over the table). A lip that the app models as a round has roll angle 0 and keeps its own normals.
// The arc. On the casting side of the hole the cloth's return stands a few millimetres in front of the boot's hem, which
// curls outward behind it (measured on pool_pro_9ft: the return reaches 14.2 mm under the bed, the leather crosses its
// surface 8.2 mm down): a 6 mm band of fully lit cloth across the far wall of the pocket. No cloth hangs there on a real
// table: the liner does. The band takes the liner's albedo and loses the cloth's sheen.
const LIP_NORMAL = /* glsl */`
{
  clubPktRoll = 0.0; clubPktArc = 0.0; clubPktFilm = 0.0;
  float clubPktDist = clubPktNear( vSpikeWorldPos );
  if ( clubPktDist < 2.0 && uClubPktK.x > 0.0 ) {
    vec2 clubPktRel = vSpikeWorldPos.xz * clubPktS - clubPktA.xy;
    float clubPktLen = max( length( clubPktRel ), 1e-4 );
    vec3 clubPktNi = inverseTransformDirection( nonPerturbedNormal, viewMatrix );
    vec3 clubPktIn = normalize( mat3( viewMatrix ) * vec3( - clubPktRel.x * clubPktS.x, 0.0, - clubPktRel.y * clubPktS.y ) );
    float clubPktY = vSpikeWorldPos.y;
    float clubPktSharp = step( 0.001, clubPktB.w );
    if ( clubPktY > - 0.0006 ) {
      clubPktRoll = ( 1.0 - smoothstep( 0.0, uClubPktLip.x, clubPktLen - clubPktA.z ) ) * step( clubPktY, 0.0006 ) * step( 0.9, clubPktNi.y )
        * uClubPktK.z * clubPktSharp;
      float clubPktAn = clubPktB.w * clubPktRoll * clubPktRoll;
      normal = normalize( normal * cos( clubPktAn ) + clubPktIn * sin( clubPktAn ) );
      // a flat sheet that is shaded as a roll shows parts of the roll that a real one hides behind its own horizon: the normal
      // never turns past the eye (seen on the dev page before this line: a normal that faced away from the eye lit up as a
      // white rim, the specular terms' behaviour at and past grazing)
      vec3 clubPktEye = normalize( vViewPosition );
      float clubPktNv = dot( normal, clubPktEye );
      if ( clubPktNv < 0.15 ) normal = normalize( normal + clubPktEye * ( 0.15 - clubPktNv ) );
      // the app's occlusion film on the bed in front of a mouth (table.js tongueao) starts at a radius of its own; where the
      // hole's edge lies inside that radius (4 mm at the side pockets of pool_pro_9ft) a ring of bed at open-bed brightness
      // is left between a darkened band and the hole: the light line round the lip. The ring takes the film's edge value.
      clubPktFilm = step( 0.001, clubPktC.z ) * ( 1.0 - smoothstep( clubPktC.z - 0.0004, clubPktC.z + 0.0008, clubPktLen ) )
        * step( clubPktY, 0.0006 ) * step( 0.9, clubPktNi.y ) * uClubPktK.z;
    } else {
      float clubPktT = ( 1.0 - smoothstep( 0.0, uClubPktLip.x, - clubPktY ) ) * ( 1.0 - step( 0.5, clubPktNi.y ) ) * uClubPktK.z * clubPktSharp;
      float clubPktAn = ( 1.5707963 - clubPktB.w ) * clubPktT;
      normal = normalize( normal * cos( clubPktAn ) + normalize( mat3( viewMatrix ) * vec3( 0.0, 1.0, 0.0 ) ) * sin( clubPktAn ) );
      clubPktRoll = uClubPktK.z * clubPktSharp;
      clubPktArc = uClubPktK.w * smoothstep( clubPktC.x - 0.003, clubPktC.x + 0.003, dot( clubPktRel, clubPktU ) );
      diffuseColor.rgb = mix( diffuseColor.rgb, uClubPktTone.rgb, clubPktArc );
    }
  }
}
`;
// The cloth's sheen lobe grows toward grazing angles, and a normal that turns away from the eye is at a grazing angle: left
// alone, the roll shows as a bright rim round the hole (seen on the dev page). The fibres of a cloth that turns over an edge
// are seen end-on there, not along their length: the lobe is taken out with the turn, and with it the smooth-dielectric
// lobe, which no pile surface has at a grazing angle.
const LIP_LOBE = /* glsl */`
{
  float clubPktKeep = ( 1.0 - clubPktArc ) * ( 1.0 - uClubPktLip2.x * clubPktRoll );
  #ifdef USE_SHEEN
  material.sheenColor *= clubPktKeep;
  #endif
  material.specularColor *= clubPktKeep;
  material.specularF90 *= clubPktKeep;
}
`;
// The turned lip looks across the hole at the liner, not at the room: its ambient light (and the grazing sheen that the
// probe put on it as a bright rim) falls to a share. The arc takes the throat's bed-plane share.
const LIP_RAIL = /* glsl */`{
    spikeOcc *= mix( 1.0, uClubPktLip.y, clubPktRoll * clubPktRoll ) * mix( 1.0, uClubPktLip.z, clubPktArc );
    float clubPktRing = mix( 1.0, uClubPktLip2.y, clubPktFilm );
    spikeOcc *= clubPktRing;
    spikeShadow *= clubPktRing;
  }
  `;

// ---- the cup (the drop below the bed) ----
// The app draws the drop as an unlit box (MeshBasic #030303, floor #010101: "the analytic light has no occlusion and lit its
// end wall grey through the throat"). The patch keeps the app's meshes and material objects and replaces what the material
// returns with a lit liner whose light knows the mouth. No mesh is added, hidden or moved: the ball-return system reads
// every visible mesh of the scene as furniture (web/scene/ballreturn/furniture.js), and a club-owned liner mesh in the drop
// would stand in the path of a pocketed ball (the first build of this part hung a bag there; see the report).
const CUP_VERTEX_PARS = /* glsl */`
varying vec3 vClubPktWp;
varying vec3 vClubPktN;
`;
const CUP_VERTEX = /* glsl */`
vClubPktWp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vClubPktN = normalize( mat3( modelMatrix ) * normal );
`;

// Light in the drop, all analytic, no map:
//   lamp     six points of the lamp rectangle and its point nearest to the fragment (the steepest rays, which alone reach
//            the floor); each reaches the fragment only if its ray crosses the bed plane inside the mouth (soft edge: the
//            penumbra of the lamp patch a point stands for, growing with depth). The cup is wider than the mouth, so the
//            top of its wall stands in the slate's shadow and the light lands lower down. Diffuse by the point-to-patch
//            form factor, plus a GGX lobe per point at the liner's roughness (the broad soft highlight).
//   ambient  a wall keeps clubPktSky of the rim's ambient light, measured from the casting's top lip and continued from the
//            collar's throat law; a face that looks up keeps the form factor of the mouth's disc as seen from its depth
//   fill     a set level over the whole drop, so that its unlit side is a dark surface and not pure black (designed)
// Shape that the app's box does not have is in the normal only: the round end is shaded as a cylinder (it is 28 flat
// facets), the wall has a bag's belly, and wall and floor meet in a quarter-round fillet.
export const HEM_BAND = 0.012;   // depth of the hem's contact shadow on the liner (m)
export const HEM_SHADE = 0.45;   // the lamp light kept right under the hem
const CUP_PARS = (tex) => /* glsl */`
${FRAME}
${tex ? 'uniform sampler2D uClubPktLeatherN;' : ''}
uniform vec4 uClubPktLamp;    // the lamp rectangle: centre x, centre z, half x, half z
uniform vec4 uClubPktLampC;   // lamp radiance (colour x intensity), lamp height
uniform vec4 uClubPktLin;     // fill level (lamp form-factor units), F0, roughness, strength of the scan's normal
uniform vec4 uClubPktLin2;    // penumbra at the mouth (m), penumbra per metre of depth, fillet radius (m), the liner's albedo as a share of the casting's
uniform vec4 uClubPktCup;     // height of the cup's floor: corner pockets, side pockets; belly (largest slope of the wall); height of the cup's top
varying vec3 vClubPktWp;
varying vec3 vClubPktN;
vec3 clubPktLiner( vec3 wp, vec3 n ) {
  clubPktNear( wp );
  vec2 rel = wp.xz * clubPktS - clubPktA.xy;
  float len = max( length( rel ), 1e-4 );
  vec2 lat = vec2( - clubPktU.y, clubPktU.x );
  float uo = dot( rel, clubPktU ), wo = dot( rel, lat );
  float rc = clubPktC.w, rf = max( uClubPktLin2.z, 1e-3 );
  float bottom = clubPktU.x > 0.1 ? uClubPktCup.x : uClubPktCup.y;
  bool up = abs( n.y ) > 0.5;
  // the inward direction at this place of the cup's outline (round end: toward its axis; straight sides: across)
  vec2 inF = uo > 0.0 ? - rel / len : - sign( wo ) * lat;
  vec3 inW = vec3( inF.x * clubPktS.x, 0.0, inF.y * clubPktS.y );
  vec2 tuv;
  vec3 lit = wp;   // where this fragment's lamp light is taken
  float hem = 1.0; // the hem's contact shadow on the top of the wall
  if ( up ) {
    float edge = uo > 0.0 ? rc - len : rc - abs( wo );
    float a = 0.7854 * ( 1.0 - clamp( edge / rf, 0.0, 1.0 ) );
    n = normalize( vec3( 0.0, 1.0, 0.0 ) * cos( a ) + inW * sin( a ) );
    tuv = wp.xz * uClubPktTone.w;
  } else {
    if ( uo > 0.0 ) n = inW;
    // the belly: a liner is a bag hung from the casting, not a pipe. Under the rim it falls away outward, most steeply half
    // way down, and stands upright again where the fillet begins: the wall leans away from the lamp more and more with depth
    // over the part a player's view reaches (normal only). A first version let the lower half turn back toward the lamp:
    // from a low view the lit lower half read as a floor a few centimetres under the rim (dev picture d7).
    float wallT = clamp( ( uClubPktCup.w - wp.y ) / max( uClubPktCup.w - bottom - rf, 1e-3 ), 0.0, 1.0 );
    n = normalize( n - vec3( 0.0, 1.0, 0.0 ) * ( uClubPktCup.z * sin( 3.1415927 * wallT ) ) );
    float a = 0.7854 * ( 1.0 - clamp( ( wp.y - bottom ) / rf, 0.0, 1.0 ) );
    n = normalize( n * cos( a ) + vec3( 0.0, 1.0, 0.0 ) * sin( a ) );
    float arc = uo > 0.0 ? atan( wo, uo ) * rc : sign( wo ) * ( 1.5707963 * rc - uo );
    tuv = vec2( arc, wp.y ) * uClubPktTone.w;
    // The app's cup is wider than the hole: its wall stands 18 mm behind the hem, in the slate's shadow for its first
    // centimetres, and takes the lamp lower down. Lit as the box it is, the drop read as a lit floor just under the rim (dev
    // picture d6). A liner hangs from the hem. The wall keeps its place, and its LIGHT is taken where the liner would hang:
    // at the edge of the opening straight inward of the fragment, at the fragment's own depth. A look decision, stated in
    // the report: it moves the lamp's shadow line on the wall, not the wall.
    float tF = ( clubPktA.z - 0.002 ) / len;
    float tB = ( clubPktA.w - 0.002 ) / max( abs( wo ), 1e-4 );
    vec2 e = clubPktA.xy - clubPktB.xy;
    vec2 dir = rel / len;
    float ed = dot( e, dir ), rg = clubPktB.z - 0.002;
    float tR = ( - ed + sqrt( max( ed * ed - dot( e, e ) + rg * rg, 0.0 ) ) ) / len;
    vec2 hung = clubPktA.xy + rel * min( 1.0, min( tF, min( tB, tR ) ) );
    lit = vec3( hung.x * clubPktS.x, wp.y, hung.y * clubPktS.y );
    // the boot's hem stands inboard of the wall's top: its contact shadow on the liner's first millimetres (without it the
    // wall's top edge, upright and fully lit, drew a thin light line under the hem: dev picture d8)
    hem = mix( ${f(HEM_SHADE, 3)}, 1.0, smoothstep( 0.0, ${f(HEM_BAND, 4)}, uClubPktCup.w - wp.y ) );
  }
  vec3 alb = uClubPktTone.rgb * uClubPktLin2.w;
${tex ? /* glsl */`
  {
    // the scan's normal in a frame from the surface's own derivatives (the frame three builds for a mesh without tangents)
    vec3 mapN = texture2D( uClubPktLeatherN, tuv ).xyz * 2.0 - 1.0;
    mapN.xy *= uClubPktLin.w;
    vec3 q0 = dFdx( wp ), q1 = dFdy( wp );
    vec2 st0 = dFdx( tuv ), st1 = dFdy( tuv );
    vec3 q1perp = cross( q1, n ), q0perp = cross( n, q0 );
    vec3 T = q1perp * st0.x + q0perp * st1.x;
    vec3 B = q1perp * st0.y + q0perp * st1.y;
    float det = max( dot( T, T ), dot( B, B ) );
    float sc = det == 0.0 ? 0.0 : inversesqrt( det );
    n = normalize( T * ( mapN.x * sc ) + B * ( mapN.y * sc ) + n * mapN.z );
  }` : ''}
  float d = max( - wp.y, 0.0 );
  vec3 v = normalize( cameraPosition - wp );
  float nv = max( dot( n, v ), 0.0 );
  float a = max( uClubPktLin.z * uClubPktLin.z, 0.02 );
  float a2 = a * a;
  float k = 0.5 * a + 0.1;
  float pen = uClubPktLin2.x + uClubPktLin2.y * d;
  float ff = 0.0, sp = 0.0;
  vec2 nearXz = clamp( lit.xz, uClubPktLamp.xy - uClubPktLamp.zw, uClubPktLamp.xy + uClubPktLamp.zw );
  for ( int i = 0; i < ${LAMP_GRID[0] * LAMP_GRID[1] + 1}; i ++ ) {
    vec2 o = vec2( ( float( i / ${LAMP_GRID[1]} ) + 0.5 ) * ${f(2 / LAMP_GRID[0], 6)} - 1.0, ( float( i - ${LAMP_GRID[1]} * ( i / ${LAMP_GRID[1]} ) ) + 0.5 ) * ${f(2 / LAMP_GRID[1], 6)} - 1.0 );
    vec2 lp = i < ${LAMP_GRID[0] * LAMP_GRID[1]} ? uClubPktLamp.xy + o * uClubPktLamp.zw : nearXz;
    float share = i < ${LAMP_GRID[0] * LAMP_GRID[1]} ? ${f((1 - LAMP_NEAR_SHARE) / (LAMP_GRID[0] * LAMP_GRID[1]), 6)} : ${f(LAMP_NEAR_SHARE, 6)};
    vec3 L = vec3( lp.x, uClubPktLampC.w, lp.y ) - lit;
    float r2 = max( dot( L, L ), 1e-4 );
    vec3 l = L * inversesqrt( r2 );
    vec2 at = ( lit.xz + L.xz * ( d / max( L.y, 1e-3 ) ) ) * clubPktS;
    float vis = 1.0 - smoothstep( - pen, pen, clubPktMouth( at ) );
    float nl = max( dot( n, l ), 0.0 );
    float w = share * vis * nl * max( l.y, 0.0 ) / r2;
    ff += w;
    vec3 h = normalize( l + v );
    float nh = max( dot( n, h ), 0.0 );
    float dd = nh * nh * ( a2 - 1.0 ) + 1.0;
    float fr = uClubPktLin.y + ( 1.0 - uClubPktLin.y ) * pow( 1.0 - max( dot( v, h ), 0.0 ), 5.0 );
    sp += w * fr * a2 / ( 3.14159265 * dd * dd ) * 0.25 / ( mix( nl, 1.0, k ) * mix( nv, 1.0, k ) );
  }
  float dA = 4.0 * uClubPktLamp.z * uClubPktLamp.w;
  ff *= hem * uClubPktAmb.x * dA / 3.14159265;
  sp *= hem * dA;
  float top = clubPktC.y;
  float sk = clubPktSky( ( d + top ) / ( 2.0 * clubPktA.z ) );
  float wall = sk + uClubPktLip.w * ( 1.0 - sk ) * exp( - d / 0.02 );
  float rho2 = len * len, dep2 = ( d + top ) * ( d + top ), R2 = clubPktA.z * clubPktA.z;
  float s3 = rho2 + dep2 + R2;
  float disc = 0.5 * ( 1.0 - ( rho2 + dep2 - R2 ) / sqrt( max( s3 * s3 - 4.0 * rho2 * R2, 1e-12 ) ) );
  // the ambient level is that of an open face that looks up; a wall in the open takes about 0.7 of it (a room lights a
  // vertical face from the side as well as from above), a floor the share of its hemisphere that the mouth's disc fills
  float amb = uClubPktAmb.y * mix( 0.7 * wall, disc, smoothstep( 0.3, 0.8, n.y ) );
  // the fill. Black leather returns so little that the unlit side of a drop is pure black after the tone curve's toe
  // (physically about 0.002 in these units from the second bounce). A set level keeps it a dark surface whose shape can
  // still be read: a designed fill, not a measurement (the report says so).
  float bounce = uClubPktLin.x * ( 0.7 + 0.3 * n.y );
  return uClubPktLampC.rgb * ( alb * ( ff + amb + bounce ) + sp );
}
`;
// off (the strength at 0) the material returns exactly what the app's material returns
const CUP_LIGHT = /* glsl */`
outgoingLight = mix( outgoingLight, clubPktLiner( vClubPktWp, normalize( vClubPktN ) ), uClubPktK.x * uClubPktK2.x );
`;
export const ANCHOR_CUP_VERTEX = '#include <project_vertex>';
export const ANCHOR_CUP_OUT = '#include <opaque_fragment>';

/** Names of the uniforms each piece declares (the node arm checks the part supplies exactly these). */
export const FRAME_UNIFORMS = ['uClubPktCA', 'uClubPktCB', 'uClubPktCC', 'uClubPktSA', 'uClubPktSB', 'uClubPktSC', 'uClubPktK', 'uClubPktK2', 'uClubPktTone', 'uClubPktTex', 'uClubPktLip', 'uClubPktAmb'];
export function collarUniformNames(tex = true) { return [...FRAME_UNIFORMS, 'uClubPktSpec', 'uClubPktSeam', 'uClubPktThread', ...(tex ? ['uClubPktLeather'] : [])]; }
export function lipUniformNames() { return [...FRAME_UNIFORMS, 'uClubPktLip2']; }
export function cupUniformNames(tex = true) { return [...FRAME_UNIFORMS, 'uClubPktLamp', 'uClubPktLampC', 'uClubPktLin', 'uClubPktLin2', 'uClubPktCup', ...(tex ? ['uClubPktLeatherN'] : [])]; }

const pick = (uniforms, names) => Object.fromEntries(names.filter((n) => uniforms[n]).map((n) => [n, uniforms[n]]));

/** adopt.patch spec for a casting / boot material. `tex`: the variant with the leather scan (ONE added sampler). */
export function collarPatchSpec({ tex = true, uniforms = {} } = {}) {
  return {
    key: `mat-pocket-v${POCKET_PATCH_VERSION}:collar${tex ? '-t' : ''}`,
    uniforms: pick(uniforms, collarUniformNames(tex)),
    pars: FRAME + (tex ? LEATHER_TEX : LEATHER_FLAT) + COLLAR_PARS,
    apply: [
      { anchor: ANCHOR_NORMAL_DONE, mode: 'before', code: COLLAR_ALBEDO(tex) },
      { anchor: ANCHOR_LIGHTS, mode: 'after', code: COLLAR_LOBE },
      { anchor: SPIKE_RAIL, mode: 'before', code: COLLAR_THROAT },
    ],
  };
}

/** adopt.patch spec for the cloth material (the lip of every pocket). Adds no sampler. */
export function lipPatchSpec({ uniforms = {} } = {}) {
  return {
    key: `mat-pocket-v${POCKET_PATCH_VERSION}:lip`,
    uniforms: pick(uniforms, lipUniformNames()),
    pars: FRAME + LIP_PARS,
    apply: [
      { anchor: ANCHOR_NORMAL_DONE, mode: 'before', code: LIP_NORMAL },
      { anchor: ANCHOR_LIGHTS, mode: 'after', code: LIP_LOBE },
      { anchor: SPIKE_RAIL, mode: 'before', code: LIP_RAIL },
    ],
  };
}

/** adopt.patch spec for the app's unlit cup materials (walls and floor of the drop). `tex`: with the leather scan's normal (ONE added sampler). */
export function cupPatchSpec({ tex = true, uniforms = {} } = {}) {
  return {
    key: `mat-pocket-v${POCKET_PATCH_VERSION}:cup${tex ? '-t' : ''}`,
    uniforms: pick(uniforms, cupUniformNames(tex)),
    pars: CUP_PARS(tex),
    vertexPars: CUP_VERTEX_PARS,
    apply: [
      { stage: 'vertex', anchor: ANCHOR_CUP_VERTEX, mode: 'after', code: CUP_VERTEX },
      { anchor: ANCHOR_CUP_OUT, mode: 'before', code: CUP_LIGHT },
    ],
  };
}
