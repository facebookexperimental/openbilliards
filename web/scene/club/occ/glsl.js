// Copyright (c) Meta Platforms, Inc. and affiliates.

// occ/glsl.js — the consumer-side GLSL of the occlusion-and-shadow service (CONTRACT.md section 4.2) and the three patch
// specs that put it on materials through club.adopt.patch (section 8.4). Text only, no three import: the node arm reads it.
//
//   vec2  clubVisibility( vec3 worldPos )   (lamp visibility 0..1, ambient occlusion 0..1) from the table atlas
//   float clubCueShadow( vec3 worldPos )    lamp visibility past the cue capsule under the rectangular lamp(s)
//   float clubFloorShadow( vec3 worldPos )  lamp visibility on the floor;  vec2 clubFloorVis() adds the ambient term
//
// The table atlas is one RGBA8 texture: RG = (lamp visibility, ambient occlusion) for a point at bed level, BA = the same for a
// point on the top surface (cushion tops, rail tops, pocket castings). clubVisibility() picks by world height: the bed layer up
// to uClubVisH.y above the bed plane, the top layer from uClubVisH.z, a blend between (the cushion face under the nose).
// Below the bed plane (a pocket wall) the bed layer is narrowed by what a wall of a round shaft sees of its mouth from depth
// d: the ambient term by the wall-to-open-end form factor, the lamp term by the part of the lamp still above the far edge of
// the mouth; from 3 to 10 cm below the bed it hands over to a box model of the table (a solid rectangle at the rail-top
// height between the point and the lamp), which is what keeps the lamp from shining through the table onto legs, inner
// aprons and the ball return.
//
// What a later patch on the same material may read (file-scope variables, written where the terms join the shadow rail; they
// hold 1 / 1 / 0 before that point and on a material without the patch):
//   float clubOccLampVis   visibility of the lamp past the table and the cue, 0..1 (the app's ball shadows are NOT in it)
//   float clubOccAmbVis    visibility of the room's ambient light past the table and the cue, 0..1
//   float clubOccShare     the share of this fragment's indirect light that the service treats as lamp light, 0..1
// Light a later patch ADDS before the rail line (anchor `reflectedLight.directDiffuse *= spikeShadow;`, mode before) is scaled
// by the rails like everything else; light it adds after the rail must take these factors itself.
import { OCC_CONTACT, OCC_AMBIENT } from './model.js';
import { CUE_SHADOW_GLSL } from './capsule.js';

/** Bump when the text of any patch changes: the number is part of every program cache key. */
export const OCC_PATCH_VERSION = 11;

const LAMP_UNIFORMS = /* glsl */`
uniform vec3 uClubLampPos[ 4 ];
uniform vec2 uClubLampHalf[ 4 ];
uniform int uClubLampCount;
uniform vec4 uClubLampRect;
uniform float uClubLampY;
`;

const TABLE_GLSL = /* glsl */`
uniform sampler2D uClubVisMap;
uniform vec4 uClubVisRect;
uniform vec4 uClubVisH;
uniform vec4 uClubTableBox;
uniform vec4 uClubTableTop;
uniform vec4 uClubOccK;
uniform float uClubOccLamp;
uniform float uClubOccAmbient;
uniform float uClubOccFaces;
float clubOccLampVis = 1.0;
float clubOccAmbVis = 1.0;
float clubOccShare = 0.0;
// ( lamp visibility, ambient occlusion, how much of the surface's indirect light is lamp light in disguise: 1 on the table top,
//   0 under and beside the table, where the lamp never reaches and the ambient light is the room's own ).
// wn: the world normal. faces: 1 for wood and apron materials, 0 for cloth, 2 for pocket parts (castings, collars, boots). A top-down atlas describes surfaces that look up,
// and the cloth under a cushion nose; it says nothing true about a skirt under the rail overhang, the outer face of a rail or
// the side of a leg (a bed-level point outside the rails reads "lamp fully hidden, half the sky gone", which painted the whole
// table body black). Those faces, and everything deeper under the table than a pocket, take a box model of the table instead.
vec3 clubVisibility3( vec3 wp, vec3 wn, float faces ) {
  vec2 uv = ( wp.xz - uClubVisRect.xy ) * uClubVisRect.zw;
  vec4 t = texture2D( uClubVisMap, clamp( uv, 0.0, 1.0 ) );
  float h = wp.y - uClubVisH.x;
  // the top layer is for faces that look up. The under-face of a cushion nose looks down at the bed strip under the overhang
  // and is lit and shaded with it (the same nose hides the same part of the lamp from both), so it keeps the bed layer.
  vec3 v = vec3( mix( t.rg, t.ba, smoothstep( uClubVisH.y, uClubVisH.z, h ) * smoothstep( - 0.25, 0.15, wn.y ) ), 1.0 );
  vec2 e = min( uv, 1.0 - uv );
  v.xy = mix( vec2( 1.0 ), v.xy, step( 0.0, min( e.x, e.y ) ) );
  if ( h < - 0.002 ) {
    // a pocket wall at depth d under a mouth of radius R (uClubVisH.w), Z = d / 2R.
    // ambient: the form factor from an element of the wall of a round shaft to its open end is ( Z.Z + 0.5 ) / sqrt( Z.Z + 1 ) - Z,
    // 0.5 at the rim; relative to the rim that is 0.63 at 25 mm (the foot of the cloth lip), 0.39 at 50 mm, 0.15 at 100 mm.
    // lamp: the wall across the mouth sees a lamp point of elevation e while tan e > Z; the lamp spans the elevations between
    // its nearest and its farthest point, so the lit share falls from 1 to 0 as atan Z crosses that span (no faster: the far
    // wall of a corner pocket really is lamp-lit 4-5 cm down; the walls that face away are dark by their own normal).
    float d = - h - 0.002;
    float z = d / ( 2.0 * uClubVisH.w );
    float sky = 2.0 * ( ( z * z + 0.5 ) / sqrt( z * z + 1.0 ) - z );
    vec2 dl = abs( wp.xz - uClubLampRect.xy );
    float up = max( uClubLampY - wp.y, 1e-3 );
    float eHi = atan( up, max( length( max( dl - uClubLampRect.zw, 0.0 ) ), 1e-3 ) );
    float eLo = atan( up, length( dl + uClubLampRect.zw ) );
    float lampIn = clamp( ( eHi - atan( z ) ) / max( eHi - eLo, 1e-3 ), 0.0, 1.0 );
    // .z: the share of the indirect light that stands in for lamp light is light from lamp-lit surroundings; in a hole the
    // surroundings are the liner, and only what comes through the mouth is left of it
    v *= vec3( lampIn, sky, sky );
  }
  if ( uClubTableTop.y > 0.5 ) {
    // faces 2 (pocket parts) never take the box model: what hangs in a hole is described by its depth under the mouth
    float side = faces > 0.5 && faces < 1.5 ? 1.0 - smoothstep( 0.15, 0.55, wn.y ) : 0.0;
    float wBox = faces > 1.5 ? 0.0 : max( smoothstep( 0.03, 0.10, - h ), side );
    if ( wBox > 0.0 ) {
      // sd: signed distance to the table outline, negative inside
      vec2 q = abs( wp.xz - uClubTableBox.xy ) - uClubTableBox.zw;
      float sd = max( q.x, q.y );
      // the lamp past the table: a lamp point is hidden when the ray to it crosses the rail-top plane inside the outline
      float k = ( uClubLampY - wp.y ) / max( uClubTableTop.x - wp.y, 1e-3 );
      vec2 lo = wp.xz + ( uClubTableBox.xy - uClubTableBox.zw - wp.xz ) * k;
      vec2 hi = wp.xz + ( uClubTableBox.xy + uClubTableBox.zw - wp.xz ) * k;
      vec2 l0 = uClubLampRect.xy - uClubLampRect.zw, l1 = uClubLampRect.xy + uClubLampRect.zw;
      vec2 f = clamp( ( min( l1, hi ) - max( l0, lo ) ) / max( l1 - l0, vec2( 1e-4 ) ), 0.0, 1.0 );
      float lampPast = wp.y < uClubTableTop.x ? 1.0 - f.x * f.y : 1.0;
      // 0 well inside the outline (inner aprons, ball return, the inner sides of the legs), 1 on the outer faces. Position alone
      // cannot tell them apart: the legs and the lower body stand 5-15 cm inside the outline and their outward faces see the
      // whole room, so a face whose normal points away from the table centre counts as outer wherever it stands.
      vec2 away = ( wp.xz - uClubTableBox.xy ) / max( uClubTableBox.zw, vec2( 1e-3 ) );
      float facing = smoothstep( 0.05, 0.4, dot( wn.xz, away / max( length( away ), 1e-3 ) ) );
      float outer = max( smoothstep( - 0.14, - 0.02, sd ), min( faces, 1.0 ) * facing );
      // the direct floor: under the table next to nothing arrives; the outer faces keep the room's fill light, which is not the
      // lamp (the lamp itself is behind them). The ambient term: a mild darkening under the overhang and toward the floor, deep
      // shade under the table.
      float low = clamp( ( uClubTableTop.x - wp.y ) / 0.8, 0.0, 1.0 );
      vec3 box = vec3( max( lampPast, mix( uClubTableTop.w, 1.0, outer ) ), mix( uClubTableTop.z, 1.0 - 0.15 * low, outer * 0.9 ), 0.0 );
      v = mix( v, box, wBox );
    }
  }
  return v;
}
vec2 clubVisibility( vec3 wp ) { return clubVisibility3( wp, vec3( 0.0, 1.0, 0.0 ), 0.0 ).xy; }
`;

const CUE_GLSL = /* glsl */`
uniform vec3 uClubCueA;
uniform vec3 uClubCueB;
uniform vec2 uClubCueR;
uniform float uClubCueOn;
uniform vec4 uClubCueBox;
${CUE_SHADOW_GLSL}
float clubCueShadow( vec3 wp ) {
  if ( uClubCueOn < 0.5 ) return 1.0;
  if ( wp.x < uClubCueBox.x || wp.z < uClubCueBox.y || wp.x > uClubCueBox.z || wp.z > uClubCueBox.w ) return 1.0;
  float vis = 0.0;
  float n = 0.0;
  for ( int e = 0; e < 4; e ++ ) {
    if ( e >= uClubLampCount ) break;
    vis += clubCueShadowOne( wp, uClubCueA, uClubCueB, uClubCueR.x, uClubCueR.y, uClubLampPos[ e ], uClubLampHalf[ e ] );
    n += 1.0;
  }
  return n > 0.0 ? vis / n : 1.0;
}
// the cue as a blocker of ambient light: the form factor from a horizontal element to a long cylinder of radius r whose axis
// passes at height hc and sideways distance x is r.hc / ( hc.hc + x.x ) (strip formula ( sin t2 - sin t1 ) / 2 across the axis);
// 0.22 right under a shaft 28 mm up, gone a few centimetres to the side. The radius follows the taper; past either end the
// distance to the axis grows and the term fades by itself.
float clubCueAmbient( vec3 wp ) {
  if ( uClubCueOn < 0.5 ) return 1.0;
  if ( wp.x < uClubCueBox.x || wp.z < uClubCueBox.y || wp.x > uClubCueBox.z || wp.z > uClubCueBox.w ) return 1.0;
  vec3 ab = uClubCueB - uClubCueA;
  float t = clamp( dot( wp - uClubCueA, ab ) / max( dot( ab, ab ), 1e-8 ), 0.0, 1.0 );
  vec3 c = uClubCueA + ab * t - wp;
  float hc = c.y;
  if ( hc <= 0.0 ) return 1.0;
  float r = mix( uClubCueR.x, uClubCueR.y, t );
  return 1.0 - clamp( r * hc / max( dot( c, c ), r * r ), 0.0, 1.0 );
}
`;

const FLOOR_GLSL = /* glsl */`
uniform sampler2D uClubFloorMap;
uniform vec4 uClubFloorRect;
uniform vec4 uClubFloorK;
vec2 clubFloorVis( vec3 wp ) {
  vec2 uv = ( wp.xz - uClubFloorRect.xy ) * uClubFloorRect.zw;
  vec2 v = texture2D( uClubFloorMap, clamp( uv, 0.0, 1.0 ) ).rg;
  vec2 e = min( uv, 1.0 - uv );
  return mix( vec2( 1.0 ), v, smoothstep( 0.0, 0.03, min( e.x, e.y ) ) );
}
float clubFloorShadow( vec3 wp ) { return clubFloorVis( wp ).x; }
`;

/**
 * The JS twin of the two rails (TABLE_ON_RAIL below), for the node arm and for numbers in reports. D, I: the surface's
 * unshadowed direct and indirect light; S, O: the app's own lamp-shadow and occlusion rails (balls); lampVis, ambVis: the
 * service's visibilities; a: the true-ambient share; cap: the cap of the lamp share; kx: the contact knob (uClubOccK.x);
 * top: 1 on the table top, 0 beside and under the table. Returns { direct, indirect, total, share } as light, not factors.
 */
export function occRails({ D, I, S = 1, O = 1, lampVis = 1, ambVis = 1, a = OCC_AMBIENT, cap = 1, kx = OCC_CONTACT, top = 1 }) {
  const share = Math.min(cap, Math.max(0, Math.min(1, 1 - a * (D + I) / Math.max(I, 1e-6)))) * top;
  const ambRail = O * ambVis;
  const lampRail = S * lampVis * (1 - kx + kx * ambRail);
  const occ = ambRail * (1 - share) + lampRail * share;
  return { direct: D * lampRail, indirect: I * occ, total: D * lampRail + I * occ, share };
}

/** Everything, for a club-owned shader that wants all three functions (it then binds occ.table / occ.floor / occ.cue uniforms). */
export const OCC_GLSL = LAMP_UNIFORMS + TABLE_GLSL + CUE_GLSL + FLOOR_GLSL;
export const OCC_TABLE_GLSL = LAMP_UNIFORMS + TABLE_GLSL + CUE_GLSL;
export const OCC_FLOOR_GLSL = FLOOR_GLSL;

const WP_VERTEX_PARS = 'varying vec3 vClubOccWp;';
const WP_VERTEX = /* glsl */`
{
  vec4 clubOccWp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
  clubOccWp = instanceMatrix * clubOccWp;
  #endif
  vClubOccWp = ( modelMatrix * clubOccWp ).xyz;
}`;

// the analytic-shadow rail of shading.js injectAnalytic: spikeShadow scales every direct leg (diffuse, specular, sheen, clearcoat)
// and spikeOcc every indirect leg, a few lines below this marker. The club terms join the two rails right before they are applied.
//
// The light model the two rails implement (v10). A surface's unshadowed light is D (the direct legs: the lamp) + I (the
// indirect legs: hemisphere, environment, baked bounce). In this renderer most of what lights the bed arrives through I
// (measured in the app: with the lamp's direct light fully hidden the cloth kept about two thirds of its brightness), and
// most of that I stands in for lamp light: it is there because the lamp is, and a real lamp-lit bed keeps only its true
// ambient share in an umbra. So I is split per fragment:
//     s = clamp( 1 - a.( D + I ) / I, 0, 1 )      a = uClubOccAmbient, the share of the unshadowed light that is true ambient
//     lamp part   s.I        follows the lamp rail: the app's ball shadows x lamp visibility past the table x past the cue
//     ambient     ( 1 - s ).I follows the ambient rail: the app's ball occlusion x ambient visibility
// so a full lamp shadow in open air leaves exactly a.( D + I ), whatever the balance of D and I is: when another patch lowers
// the flat ambient until I <= a.( D + I ), s reaches 0 and the rails are the plain ones (lamp visibility on the direct legs,
// ambient visibility on the indirect legs). uClubOccLamp caps s (0 switches the split off).
// uClubOccK = ( contact, ambient visibility, lamp visibility, cue ) strengths. K.x, "contact", is the LOOK knob of the model and
// not physics: the share of the ambient rail (the app's ball occlusion x ambient visibility) that also scales the lamp part,
// D and s.I alike. Physically it is 0: a cushion nose faces the lamp and takes none of its light from the bed in front of it,
// and a ball's lamp shadow is already in the lamp rail. Its value and the measurements behind it are in occ/model.js
// (OCC_CONTACT: 0.5 in round 1b, when the cloth sat on the shoulder of the tone curve and the physical band was 4 levels
// deep; 0.25 since round 2, when the physical band reads by itself); ?cluboccoff=contact shows the frame without.
const SPIKE_RAIL = 'reflectedLight.directDiffuse *= spikeShadow;';
const LUMA = 'vec3( 0.2126, 0.7152, 0.0722 )';
const TABLE_ON_RAIL = /* glsl */`{
    vec3 clubOccV = clubVisibility3( vSpikeWorldPos, spikeWn, uClubOccFaces );
    clubOccLampVis = mix( 1.0, clubOccV.x, uClubOccK.z ) * mix( 1.0, clubCueShadow( vSpikeWorldPos ), uClubOccK.w );
    clubOccAmbVis = mix( 1.0, clubOccV.y, uClubOccK.y ) * mix( 1.0, clubCueAmbient( vSpikeWorldPos ), uClubOccK.w );
    float clubOccD = dot( reflectedLight.directDiffuse, ${LUMA} ), clubOccI = dot( reflectedLight.indirectDiffuse, ${LUMA} );
    clubOccShare = min( uClubOccLamp, clamp( 1.0 - uClubOccAmbient * ( clubOccD + clubOccI ) / max( clubOccI, 1e-6 ), 0.0, 1.0 ) ) * clubOccV.z;
    float clubOccAmbRail = spikeOcc * clubOccAmbVis;
    float clubOccLampRail = spikeShadow * clubOccLampVis * mix( 1.0, clubOccAmbRail, uClubOccK.x );
    spikeOcc = mix( clubOccAmbRail, clubOccLampRail, clubOccShare );
    spikeShadow = clubOccLampRail;
  }
  `;
// The app's baked lamp visibility (shading.js SPIKE_APPLY: the alpha of the GI plan / flank maps, folded into spikeShadow one
// line above the rail) is a coarse earlier answer to the question the table atlas answers per texel. Left in, the two multiply,
// and through uClubOccLamp its wide offset band shows as a second stripe along every cushion and its zero texels as black
// steps beside the pocket castings. These two splices bracket the app line: the value before it is kept and, as far as the
// club terms are faded in, put back. (Not a division: where the baked value is zero there is nothing left to divide.)
const GI_VISIBILITY_LINE = 'spikeShadow *= mix( 1.0, gi.a, uGiShadow );';
const GI_VISIBILITY_KEEP = '      float clubOccRail = spikeShadow;';
const GI_VISIBILITY_UNDO = '      spikeShadow = mix( spikeShadow, clubOccRail, uClubOccGi );';
const TABLE_PLAIN = /* glsl */`
{
  vec3 clubOccV = clubVisibility3( vClubOccWp, inverseTransformDirection( normal, viewMatrix ), uClubOccFaces );
  clubOccLampVis = mix( 1.0, clubOccV.x, uClubOccK.z ) * mix( 1.0, clubCueShadow( vClubOccWp ), uClubOccK.w );
  clubOccAmbVis = mix( 1.0, clubOccV.y, uClubOccK.y ) * mix( 1.0, clubCueAmbient( vClubOccWp ), uClubOccK.w );
  float clubOccLd = dot( reflectedLight.directDiffuse, ${LUMA} ), clubOccLi = dot( reflectedLight.indirectDiffuse, ${LUMA} );
  clubOccShare = min( uClubOccLamp, clamp( 1.0 - uClubOccAmbient * ( clubOccLd + clubOccLi ) / max( clubOccLi, 1e-6 ), 0.0, 1.0 ) ) * clubOccV.z;
  float clubOccD = clubOccLampVis * mix( 1.0, clubOccAmbVis, uClubOccK.x );
  float clubOccI = mix( clubOccAmbVis, clubOccD, clubOccShare );
  reflectedLight.directDiffuse *= clubOccD;
  reflectedLight.directSpecular *= clubOccD;
  reflectedLight.indirectDiffuse *= clubOccI;
  reflectedLight.indirectSpecular *= clubOccI;
  #ifdef USE_SHEEN
  sheenSpecularDirect *= clubOccD;
  sheenSpecularIndirect *= clubOccI;
  #endif
  #ifdef USE_CLEARCOAT
  clearcoatSpecularDirect *= clubOccD;
  #endif
}`;
// The floor. uClubFloorK = ( floor of the direct scale, ambient strength, share of the lamp shadow that also dims the indirect
// light, on ). Two splices: right after the three lights are summed (the lamp and the app's fill light, before a room material
// adds its own emitters, which the table does not hide the way it hides the lamp) the lamp visibility scales the direct light;
// after all light is in, the ambient term scales everything, and the indirect light takes a share of the lamp shadow as well:
// the floor's environment term holds the lamp panel's own image and the bounce of the lit cloth, and neither reaches under
// the table.
const FLOOR_DIRECT = /* glsl */`
vec2 clubOccF = mix( vec2( 1.0 ), clubFloorVis( vClubOccWp ), uClubFloorK.w );
float clubOccD = max( clubOccF.x, uClubFloorK.x );
reflectedLight.directDiffuse *= clubOccD;
reflectedLight.directSpecular *= clubOccD;
#ifdef USE_SHEEN
sheenSpecularDirect *= clubOccD;
#endif
#ifdef USE_CLEARCOAT
clearcoatSpecularDirect *= clubOccD;
#endif
`;
const FLOOR_INDIRECT = /* glsl */`
{
  float clubOccA = mix( 1.0, clubOccF.y, uClubFloorK.y );
  float clubOccI = clubOccA * mix( 1.0, clubOccD, uClubFloorK.z );
  reflectedLight.directDiffuse *= clubOccA;
  reflectedLight.directSpecular *= clubOccA;
  reflectedLight.indirectDiffuse *= clubOccI;
  reflectedLight.indirectSpecular *= clubOccI;
  #ifdef USE_SHEEN
  sheenSpecularDirect *= clubOccA;
  sheenSpecularIndirect *= clubOccI;
  #endif
  #ifdef USE_CLEARCOAT
  clearcoatSpecularDirect *= clubOccA;
  #endif
}`;

// Round A6, the arena venue only (occ/model.js FEET has the reasons): the contact of the table's soles on the carpet. One
// factor on everything the carpet returns (the app's lights, the room's emitters, its baked light: the line is there
// under any of them), spliced in right before the fragment's colour is written. uClubFeet[ i ] = a sole's footprint
// (centre x, z; half extents x, z); uClubFeetK = ( how many, depth, reach in metres, spare ). The floor patch's varying
// (vClubOccWp) is read at the splice: this piece goes only on a material that carries the floor patch.
// (occ/model.js feetVis is clubFeetVis in JS.)
export const OCC_FEET_GLSL = /* glsl */`
uniform vec4 uClubFeet[ 4 ];
uniform vec4 uClubFeetK;
float clubFeetVis( vec3 p ) {
  float k = 0.0;
  for ( int i = 0; i < 4; i ++ ) {
    if ( float( i ) >= uClubFeetK.x ) break;
    vec2 d = max( abs( p.xz - uClubFeet[ i ].xy ) - uClubFeet[ i ].zw, 0.0 );
    float t = clamp( 1.0 - length( d ) / max( uClubFeetK.z, 1e-4 ), 0.0, 1.0 );
    k = max( k, t * t );
  }
  return 1.0 - uClubFeetK.y * k;
}`;
const FEET_OUT = /* glsl */`
outgoingLight *= clubFeetVis( vClubOccWp );
`;

/**
 * The adopt.patch spec of one kind:
 *   'feet'   (round A6, the arena's carpet, on top of 'floor' only) the contact line round the table's soles
 *   'table'  a material that went through shading.js injectAnalytic (cloth, rail wood, aprons): joins its shadow rail
 *   'gi'     the same materials as 'table': takes the app's baked lamp visibility out of the shadow rail (its own patch and
 *            its own uniform, so a change of that app line costs this correction only, never the main patch)
 *   'plain'  a standard / physical material of the same classes without that injection: carries its own world position
 *   'floor'  the club floor: the floor map only
 * `uniforms` are the service's shared uniform OBJECTS. Only before / after anchors are used.
 */
export function occPatchSpec(kind, { uniforms = {} } = {}) {
  if (kind === 'table') {
    return {
      key: `occ-v${OCC_PATCH_VERSION}`, uniforms, pars: OCC_TABLE_GLSL,
      apply: [{ anchor: SPIKE_RAIL, mode: 'before', code: TABLE_ON_RAIL }],
    };
  }
  if (kind === 'gi') {
    return {
      key: `occ-v${OCC_PATCH_VERSION}-gi`, uniforms, pars: 'uniform float uClubOccGi;',
      apply: [
        { anchor: GI_VISIBILITY_LINE, mode: 'before', code: GI_VISIBILITY_KEEP },
        { anchor: GI_VISIBILITY_LINE, mode: 'after', code: GI_VISIBILITY_UNDO },
      ],
    };
  }
  if (kind === 'plain') {
    return {
      key: `occ-v${OCC_PATCH_VERSION}-plain`, uniforms, pars: `${WP_VERTEX_PARS}\n${OCC_TABLE_GLSL}`, vertexPars: WP_VERTEX_PARS,
      apply: [
        { stage: 'vertex', anchor: '#include <project_vertex>', mode: 'after', code: WP_VERTEX },
        { anchor: '#include <lights_fragment_end>', mode: 'after', code: TABLE_PLAIN },
      ],
    };
  }
  if (kind === 'floor') {
    return {
      key: `occ-v${OCC_PATCH_VERSION}-floor`, uniforms, pars: `${WP_VERTEX_PARS}\n${OCC_FLOOR_GLSL}`, vertexPars: WP_VERTEX_PARS,
      apply: [
        { stage: 'vertex', anchor: '#include <project_vertex>', mode: 'after', code: WP_VERTEX },
        { anchor: '#include <lights_fragment_begin>', mode: 'after', code: FLOOR_DIRECT },
        { anchor: '#include <lights_fragment_end>', mode: 'after', code: FLOOR_INDIRECT },
      ],
    };
  }
  if (kind === 'feet') {
    return {
      key: `occ-v${OCC_PATCH_VERSION}-feet`, uniforms, pars: OCC_FEET_GLSL,
      apply: [{ anchor: '#include <opaque_fragment>', mode: 'before', code: FEET_OUT }],
    };
  }
  throw new Error(`occPatchSpec: unknown kind ${kind}`);
}
