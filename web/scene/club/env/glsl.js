// Copyright (c) Meta Platforms, Inc. and affiliates.

// env/glsl.js — shader text of the reflection service (CONTRACT.md section 4.1). Pure strings, no imports: the node arm can
// read them without a browser.
//
// The app keeps ONE environment cube, captured from a point just above the middle of the cloth (main.js: the centre of the
// app's parallax box, 11.5 cm over the bed) and bound as scene.environment. A cube is only right at its capture point; a flat
// glossy surface somewhere else (a rail top, the apron, the floor) shows the room displaced unless the lookup is corrected.
// clubEnvDir() does that correction with four proxies, all read from uniforms the service keeps current:
//   1. the room box          — the reflected ray is intersected with the room and the cube is looked up toward that point
//                              from the capture position (parallax-corrected cube map);
//   2. the cloth rectangle   — a downward ray from above the bed that lands on the cloth sees the cloth where the capture
//                              recorded it, on the bed plane, not on the room floor below it;
//   3. the lamp rectangle    — the luminaire hangs between the table and the ceiling, far inside the room box. A ray that
//                              crosses its plane inside its footprint sees the lamp at that point (the app's own projection
//                              does the same by putting its box top on the lamp plane); a ray that passes beside it goes on to
//                              the room. From the capture point the fixture hides a patch of ceiling. A ray that passed beside
//                              the fixture and lands in that patch is looked up toward its OWN crossing point on the lamp's
//                              plane: what the capture point sees beside the fixture on that side, and the same lookup as the
//                              fixture's at the footprint's edge. Where a lookup has to change sides it turns ROUND the
//                              fixture, never across its face (a direction that crossed the face returned a second, squeezed
//                              lamp: bright lines along the rail tops). The turn packs what lies round the fixture into a
//                              narrow strip, so a steep look down a rail top can show one thin line of a roof lamp there. A
//                              ray that does not cross the lamp's plane from below and lands in the patch is slid to the
//                              fixture's edge, as before;
//   4. the table outline     — the capture point looks down on the table, so every lookup below its horizon returns cloth
//                              and rail. A surface that cannot see the table top (the apron, the floor, a rail's outer face)
//                              must never mirror it: such a lookup is raised to just above the table's outline, where the
//                              cube holds the low part of the walls, and further by the width of the lobe's prefilter, so
//                              the lit cloth does not bleed in through the blur.
// Everything is closed form and branch-light: one ray/box, two ray/plane tests, no texture.

/** Uniform declarations + clubEnvDir(). Guarded, so a second service may paste the same text into one program. */
export const ENV_GLSL = /* glsl */`
#ifndef CLUB_ENV_GLSL
#define CLUB_ENV_GLSL
uniform vec3 uClubEnvBoxMin;
uniform vec3 uClubEnvBoxMax;
uniform vec3 uClubEnvPos;
uniform float uClubEnvMix;    // 1 = corrected lookup, 0 = the uncorrected direction (an A/B switch for tools)
uniform vec4 uClubEnvLamp;    // lamp footprint on a horizontal plane: centre x, centre z, half x, half z
uniform vec4 uClubEnvLampY;   // plane height, on (0 | 1), soft edge start, soft edge end (metres past the footprint)
uniform vec4 uClubEnvRim;     // table outline seen from the capture point: half x, half z, rim height, on (0 | 1)
uniform vec4 uClubEnvBed;     // cloth rectangle: half x, half z, bed height, on (0 | 1)
uniform vec2 uClubEnvTableC;  // table centre (x, z)

vec3 clubEnvSafe( vec3 d ) {
  return mix( min( d, vec3( -1e-5 ) ), max( d, vec3( 1e-5 ) ), step( vec3( 0.0 ), d ) );
}
// distance from p along the unit direction d to the room box (0 when p is outside it)
float clubEnvBoxT( vec3 p, vec3 d ) {
  vec3 t3 = ( mix( uClubEnvBoxMin, uClubEnvBoxMax, step( vec3( 0.0 ), d ) ) - p ) / clubEnvSafe( d );
  return max( min( t3.x, min( t3.y, t3.z ) ), 0.0 );
}
// slide a point c (relative to a rectangle's centre, half extents h) radially out to the rectangle's edge when it is inside
vec2 clubEnvPushOut( vec2 c, vec2 h ) {
  vec2 a = abs( c ) / h;
  float m = max( a.x, a.y );
  return m < 1.0 ? c / max( m, 1e-3 ) : c;
}
// distance of the plan point b from a rectangle of half extents h (negative inside; round about its corners outside)
float clubEnvRectD( vec2 b, vec2 h ) {
  vec2 u = abs( b ) - h;
  return length( max( u, 0.0 ) ) + min( max( u.x, u.y ), 0.0 );
}
// a smooth radius about the rectangle's centre: 1 on the rounded outline that touches its four sides from inside, 1.0905 on
// the one through its corners (a super-ellipse of power 8)
float clubEnvRound( vec2 b, vec2 h ) {
  vec2 a = b / h;
  a *= a; a *= a;
  return sqrt( sqrt( sqrt( dot( a, a ) ) ) );
}
// from the plan point a to the plan point b by k, ROUND the rectangle and never across it: the bearing turns the shorter
// way, the smooth radius goes evenly from a's to b's and, on the way, not under the outline through the corners
vec2 clubEnvRoundTo( vec2 a, vec2 b, vec2 h, float k ) {
  float ra = clubEnvRound( a, h ), rb = clubEnvRound( b, h );
  vec2 ua = a / max( length( a ), 1e-4 ), ub = b / max( length( b ), 1e-4 );
  vec2 v = mix( ua, ub, k );
  float n = length( v );
  vec2 dir = n > 1e-3 ? v / n : ua;
  // (the lift to the corners' outline only where the bearing really turns: two points on one bearing go straight)
  float lift = max( 1.0905 - min( ra, rb ), 0.0 ) * min( 8.0 * k * ( 1.0 - k ), 1.0 ) * min( 2.0 * ( 1.0 - dot( ua, ub ) ), 1.0 );
  float r = mix( ra, rb, k ) + lift;
  return dir * ( r / max( clubEnvRound( dir, h ), 1e-4 ) );
}
// Corrected cube lookup direction for the reflection direction r (world space) leaving the world position p, for a lobe of
// the given roughness (three's roughness, 0..1). The roughness only widens the keep-out above the table's outline (4.).
vec3 clubEnvDirRough( vec3 p, vec3 r, float roughness ) {
  vec3 d = normalize( r );
  float t = clubEnvBoxT( p, d );
  // 2. the cloth, recorded on the bed plane
  if ( uClubEnvBed.w > 0.5 && d.y < -1e-4 && p.y > uClubEnvBed.z ) {
    vec2 b = p.xz + d.xz * ( ( uClubEnvBed.z - p.y ) / d.y );
    if ( all( lessThan( abs( b - uClubEnvTableC ), uClubEnvBed.xy ) ) ) {
      return mix( d, normalize( vec3( b.x, uClubEnvBed.z, b.y ) - uClubEnvPos ), uClubEnvMix );
    }
  }
  // 1. the room box
  vec3 l = p + d * t - uClubEnvPos;
  if ( uClubEnvLampY.y > 0.5 ) {
    float up = uClubEnvLampY.x - uClubEnvPos.y;
    vec2 ring = uClubEnvLamp.zw + uClubEnvLampY.w;
    // the room point as the capture point sees it on the lamp's plane (relative to the footprint's centre), and how deep
    // the fixture hides it: m under 1 = hidden
    vec2 c = vec2( 0.0 );
    float m = 2.0;
    if ( up > 0.0 && l.y > up ) {
      c = uClubEnvPos.xz + l.xz * ( up / l.y ) - uClubEnvLamp.xy;
      vec2 a = abs( c ) / ring;
      m = max( a.x, a.y );
    }
    float tl = d.y > 1e-4 && p.y < uClubEnvLampY.x ? ( uClubEnvLampY.x - p.y ) / d.y : t;
    if ( tl < t ) {
      // 3b. the ray crosses the lamp's plane on its way up, at x
      vec3 x = p + d * tl;
      vec2 xc = x.xz - uClubEnvLamp.xy;
      float e = clubEnvRectD( xc, uClubEnvLamp.zw );
      if ( e <= uClubEnvLampY.z ) {
        l = x - uClubEnvPos; // inside the footprint: the fixture at that point
      } else if ( up > 0.0 ) {
        // beside the footprint by e. A room point the fixture hides is looked up toward the ray's OWN crossing point: what
        // the capture point sees beside the fixture on the side the ray passes; it joins the fixture's own lookup at the
        // footprint's edge with no blend. Where the room point is about to come into view (m toward 1), and for a visible
        // one over the soft edge, the lookup turns ROUND the fixture to it, never across the emitting face (a straight blend
        // between the two sides crossed the face: a second, squeezed lamp).
        vec2 q = m < 1.0 ? clubEnvRoundTo( xc, c, uClubEnvLamp.zw, smoothstep( 0.75, 1.0, m ) ) : c;
        q = clubEnvRoundTo( q, xc, uClubEnvLamp.zw, 1.0 - smoothstep( uClubEnvLampY.z, uClubEnvLampY.w, e ) );
        l = vec3( q.x + uClubEnvLamp.x - uClubEnvPos.x, up, q.y + uClubEnvLamp.y - uClubEnvPos.z );
      }
    } else if ( m < 1.0 ) {
      // 3a. a room point the fixture hides from the capture point, for a ray that does not cross the lamp's plane from below
      c = clubEnvPushOut( c, ring );
      l = vec3( c.x + uClubEnvLamp.x - uClubEnvPos.x, up, c.y + uClubEnvLamp.y - uClubEnvPos.z );
    }
  }
  // 4. never the table's own image for a ray that did not go to the table: keep the lookup above the table's outline as the
  //    capture point sees it, by the width of the prefiltered lobe (three's cube-UV levels are Gaussians of about
  //    1.45 * roughness^2 radians; twice that keeps the lit cloth out of a glossy lobe's kernel). The lift stops at 10
  //    degrees: a rough lobe averages half the cube whatever its centre, and lifting it further only aims it at the lamp.
  if ( uClubEnvRim.w > 0.5 ) {
    float h = length( l.xz );
    if ( h < 1e-4 ) { l.xz = vec2( 1e-4, 0.0 ); h = 1e-4; }
    vec2 b = l.xz / h;
    vec2 sg = vec2( b.x >= 0.0 ? 1.0 : -1.0, b.y >= 0.0 ? 1.0 : -1.0 );
    vec2 tb = ( sg * uClubEnvRim.xy - ( uClubEnvPos.xz - uClubEnvTableC ) ) / max( abs( b ), vec2( 1e-5 ) ) * sg;
    float dr = max( min( tb.x, tb.y ), 1e-3 );
    float smin = ( uClubEnvRim.z - uClubEnvPos.y ) / dr + tan( min( 2.9 * roughness * roughness, 0.17 ) );
    l.y = max( l.y, smin * h );
  }
  return mix( d, normalize( l ), uClubEnvMix );
}
// the contract's form (CONTRACT.md 4.1): a mirror-sharp lobe
vec3 clubEnvDir( vec3 p, vec3 r ) { return clubEnvDirRough( p, r, 0.0 ); }
#endif
`;

/** World position varying of the patched materials (declared in both stages; written after <project_vertex>). */
export const ENV_VARYING = 'varying vec3 vClubEnvPos;';
export const ENV_VERTEX_ANCHOR = '#include <project_vertex>';
export const ENV_VERTEX_CODE = /* glsl */`
{
  vec4 clubEnvWp = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    clubEnvWp = batchingMatrix * clubEnvWp;
  #endif
  #ifdef USE_INSTANCING
    clubEnvWp = instanceMatrix * clubEnvWp;
  #endif
  vClubEnvPos = ( modelMatrix * clubEnvWp ).xyz;
}`;

// The three shapes a material's environment code can have when the club patch meets it (the app's injectAnalytic runs first):
//   A  the app's own parallax chunk (rail wood, and every material the table flags for it): one line computes `corrected`
//   B  the app's chunk with the stock reflection vector (its warm / gain variants)
//   C  three's stock chunk, still an unresolved include — the one include line reserved for this service to replace
export const ANCHOR_A = 'vec3 corrected = spikeParallax( worldReflect, vSpikeWorldPos );';
export const ANCHOR_B = 'vec3 corrected = worldReflect;';
export const ANCHOR_C = '#include <envmap_physical_pars_fragment>';
/** Spliced after the line of shape A or B: re-aim the app's lookup (its own content terms and ball glints stay). */
export const ENV_REAIM = '\n    corrected = clubEnvDirRough( vClubEnvPos, worldReflect, roughness );';

// Floor-only additions (inside the replaced chunk, after three's cube-UV sampler and env uniforms are declared):
//   - the table as a box occluder: the cube was captured above the table and cannot hold its underside, so without this the
//     floor mirrors the far wall straight through the table;
//   - the varnish coat: a plank floor's own roughness is that of the wood under the varnish; the room in a real floor is
//     mirrored by the varnish on top (a thin dielectric coat: F0 0.04, its own roughness), which is why a floor that looks
//     matte from above carries streaks of every lamp toward the far wall. One extra lobe, weighted by Schlick's Fresnel term;
//     the layers under it lose what the coat reflects;
//   - the planar mirror (high tier), sampled by the coat lobe only (the wood under it is too rough to resolve it).
export function envFloorGlsl({ mirror = false } = {}) {
  return /* glsl */`
uniform vec3 uClubEnvTableMin;   // the table body as a box (world)
uniform vec3 uClubEnvTableMax;
uniform vec4 uClubEnvTableTint;  // rgb = radiance of the table's shaded underside and sides, a = on (0 | 1)
uniform vec4 uClubEnvCoat;       // varnish: strength (0 = off), roughness, how far it follows the normal map (0..1), unused
${mirror ? `uniform sampler2D uClubMirrorMap;   // the scene mirrored in the floor plane (linear HDR, with mips)
uniform mat4 uClubMirrorMatrix;     // world position -> mirror texture coordinates (projective)
uniform vec4 uClubMirrorParams;     // on (0..1), focal length in mirror texels, highest mip, lobe half-angle scale
uniform vec2 uClubMirrorTexel;      // 1 / size` : ''}
// cube lookup for a ray leaving the floor, with the table in the way; occ = how much of the ray the table blocks,
// dist = estimated distance to what the ray reaches
vec3 clubEnvFloorCube( vec3 p, vec3 d, float roughness, out float occ, out float dist ) {
  float far = clubEnvBoxT( p, d );
  if ( uClubEnvLampY.y > 0.5 && d.y > 1e-4 && p.y < uClubEnvLampY.x ) { // the lamp hangs well inside the room box
    float tl = ( uClubEnvLampY.x - p.y ) / d.y;
    vec2 u = abs( p.xz + d.xz * tl - uClubEnvLamp.xy ) - uClubEnvLamp.zw;
    far = mix( far, min( far, tl ), 1.0 - smoothstep( uClubEnvLampY.z, uClubEnvLampY.w, max( u.x, u.y ) ) );
  }
  vec3 inv = 1.0 / clubEnvSafe( d );
  vec3 t0 = ( uClubEnvTableMin - p ) * inv;
  vec3 t1 = ( uClubEnvTableMax - p ) * inv;
  vec3 tlo = min( t0, t1 ), thi = max( t0, t1 );
  float tn = max( max( tlo.x, tlo.y ), max( tlo.z, 0.0 ) );
  float tf = min( min( thi.x, thi.y ), thi.z );
  // soft edge: the chord through the box shrinks to nothing at its silhouette; the edge widens with the lobe (about
  // 3 * roughness^2 radians across) and with the distance to the box
  occ = uClubEnvTableTint.a * smoothstep( 0.0, 0.02 + 6.0 * roughness * roughness * ( 0.3 + tn ), tf - tn );
  dist = mix( far, min( tn, far ), occ );
  vec3 rad = textureCubeUV( envMap, envMapRotation * clubEnvDirRough( p, d, roughness ), roughness ).rgb;
  return mix( rad, uClubEnvTableTint.rgb, occ );
}
// the wood under the varnish
vec3 clubEnvFloorRadiance( vec3 p, vec3 r, float roughness ) {
  float occ, dist;
  return clubEnvFloorCube( p, normalize( r ), roughness, occ, dist );
}
// the varnish
vec3 clubEnvFloorCoat( vec3 p, vec3 r, float roughness ) {
  vec3 d = normalize( r );
  float occ, dist;
  vec3 rad = clubEnvFloorCube( p, d, roughness, occ, dist );
${mirror ? `  if ( uClubMirrorParams.x > 0.0 ) {
    // The mirror texture is the real scene seen from the camera's reflection in the floor, so the world point this ray
    // reaches appears in it at uClubMirrorMatrix * point. The distance to that point is the estimate above; it only matters
    // for a bent normal and for the blur radius (a reflection is sharp where the object meets the floor and softens with
    // distance along the ray).
    vec4 q = uClubMirrorMatrix * vec4( p + d * dist, 1.0 );
    vec2 uv = q.xy / max( q.w, 1e-4 );
    float cone = uClubMirrorParams.w * roughness * roughness;
    float px = cone * dist / max( dist + distance( p, cameraPosition ), 1e-3 ) * uClubMirrorParams.y;
    float lod = clamp( log2( max( px, 1.0 ) ), 0.0, uClubMirrorParams.z );
    vec2 s = uClubMirrorTexel * px;
    // five taps, stretched along the screen vertical: a rough floor smears a reflection toward the viewer
    vec3 mir = textureLod( uClubMirrorMap, uv, lod ).rgb * 0.28
      + textureLod( uClubMirrorMap, uv + s * vec2( 0.25, 0.55 ), lod ).rgb * 0.18
      + textureLod( uClubMirrorMap, uv + s * vec2( -0.25, -0.55 ), lod ).rgb * 0.18
      + textureLod( uClubMirrorMap, uv + s * vec2( -0.12, 1.1 ), lod ).rgb * 0.18
      + textureLod( uClubMirrorMap, uv + s * vec2( 0.12, -1.1 ), lod ).rgb * 0.18;
    float edge = smoothstep( 0.0, 0.02, min( min( uv.x, 1.0 - uv.x ), min( uv.y, 1.0 - uv.y ) ) ) * step( 1e-4, q.w );
    rad = mix( rad, mir, uClubMirrorParams.x * edge );
  }` : ''}
  return rad;
}
`;
}

/** The varnish lobe, spliced after <lights_fragment_end> on the floor (every reflectedLight term is final there). */
export const ENV_COAT_ANCHOR = '#include <lights_fragment_end>';
export const ENV_COAT_CODE = /* glsl */`
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
if ( uClubEnvCoat.x > 0.0 ) {
  vec3 clubCoatN = normalize( mix( nonPerturbedNormal, geometryNormal, uClubEnvCoat.z ) );
  float clubCoatNV = saturate( dot( clubCoatN, geometryViewDir ) );
  float clubCoatF = uClubEnvCoat.x * ( 0.04 + 0.96 * pow( 1.0 - clubCoatNV, 5.0 ) );
  vec3 clubCoatR = inverseTransformDirection( reflect( - geometryViewDir, clubCoatN ), viewMatrix );
  vec3 clubCoatRad = clubEnvFloorCoat( vClubEnvPos, clubCoatR, uClubEnvCoat.y );
  reflectedLight.indirectDiffuse *= 1.0 - clubCoatF;
  reflectedLight.indirectSpecular = reflectedLight.indirectSpecular * ( 1.0 - clubCoatF ) + clubCoatRad * clubCoatF;
}
#endif
`;

/**
 * Replacement for three r170's <envmap_physical_pars_fragment> (shape C). The text is the stock chunk with one change: the
 * radiance lookup goes through clubEnvDir (and, on the floor, through clubEnvFloorRadiance). Irradiance is untouched.
 */
export function envChunk({ floor = false, mirror = false } = {}) {
  const radiance = floor
    ? 'vec3 clubEnvRad = clubEnvFloorRadiance( vClubEnvPos, reflectVec, roughness );'
    : 'vec3 clubEnvRad = textureCubeUV( envMap, envMapRotation * clubEnvDirRough( vClubEnvPos, reflectVec, roughness ), roughness ).rgb;';
  return /* glsl */`
#ifdef USE_ENVMAP
	#ifdef ENVMAP_TYPE_CUBE_UV
${floor ? envFloorGlsl({ mirror }) : ''}
	#endif
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			${radiance}
			return clubEnvRad * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif
`;
}

/**
 * The splice list for one material, chosen from the fragment text the previous compile hooks produced (pure; the node arm
 * calls it). `frag` null (nothing compiled yet) is treated as shape C.
 */
export function envApply(frag, { floor = false, mirror = false } = {}) {
  const vertex = { stage: 'vertex', anchor: ENV_VERTEX_ANCHOR, mode: 'after', code: ENV_VERTEX_CODE };
  const text = typeof frag === 'string' ? frag : '';
  if (text.includes(ANCHOR_A)) return { shape: 'A', apply: [vertex, { anchor: ANCHOR_A, mode: 'after', code: ENV_REAIM }] };
  if (text.includes(ANCHOR_B)) return { shape: 'B', apply: [vertex, { anchor: ANCHOR_B, mode: 'after', code: ENV_REAIM }] };
  const apply = [vertex, { anchor: ANCHOR_C, mode: 'replace', code: envChunk({ floor, mirror }) }];
  if (floor) apply.push({ anchor: ENV_COAT_ANCHOR, mode: 'after', code: ENV_COAT_CODE });
  return { shape: 'C', apply };
}
