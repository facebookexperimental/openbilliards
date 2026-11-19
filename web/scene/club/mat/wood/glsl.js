// Copyright (c) Meta Platforms, Inc. and affiliates.

// mat/wood/glsl.js — shader text of the club look's wood part (CONTRACT.md 9.1): rail caps, the table body (aprons, skirts,
// legs) and the rail sights. Pure strings and one pure spec builder, no imports: the node arm reads them without a browser.
//
// What the patch adds to a material the app has already built and shader-patched (shading.js injectAnalytic, then the club
// reflection and occlusion services):
//   1. a FINISH COAT of its own (a thin dielectric layer, F0 0.04) with TWO LOBES, as a satin lacquer has: a narrow one (the
//      lamp's image keeps its shape) and a wide one (the haze: a halo around that image and a soft sheen far from it), plus
//      the fan of the fine scratches that run with the grain. The coat takes
//        - the lamp as an area light: three r170 gives a RectAreaLight no clearcoat term at all. The coat evaluates the same
//          LTC fit three uses for the base lobe, per lobe, for every rectangular light of the scene, and the narrow lobe
//          takes the lamp AS THE FRAME SHOWS IT: the luminaire's lit underside (club/room/lamp/face.js: lit panels between
//          cross bars in a frame, tube strips inside each panel, a glare cut-off away from straight down), so the image in
//          the lacquer is a row of soft pads with brighter bars along them, dimmer toward the lamp's far end, not the
//          light's bare rectangle. Both LTC tables are already bound by three: no sampler is added;
//        - the room, through the cube the scene already binds, looked up with the reflection service's corrected direction
//          when that service patched the material (its GLSL is then in the program), with the lamp's own image capped (the
//          lamp is the area-light term) and with an analytic floor for rays the cube cannot answer (the capture point sits on
//          the table and never sees the floor beside or under it);
//      and removes what the coat reflects from the layers below it. three's own clearcoat is switched off under the coat.
//   2. WOOD AT SCAN RESOLUTION: one colour scan (the ONE added sampler) mapped in rail space, so the grain runs along each rail
//      at its real scale whatever the mesh's own UVs are; the app's own map stays bound and is read low-passed as the style's
//      tone. The scan's normal map takes the material's existing normal-map slot (no sampler added).
//   3. EDGES: the rail cap's outer and inner edges are rounded in the normal (the geometry is not rebuilt), from the rail's
//      cross-section in world space; a cap that is already crowned keeps its own slope where that is steeper.
//   4. SPECULAR ANTI-ALIASING, in closed form: the only place where the coat's normal turns fast is the rounded edge of a rail
//      cap, and its profile is known. The edge's slope is averaged over the pixel's footprint across the edge (so a roll
//      thinner than a pixel is one stable lean, not a normal that depends on where the pixel centre fell) and every lobe is
//      widened by the slope's variance inside that footprint (the kernel of Tokuyoshi and Kaplanyan, "Improved Geometric
//      Specular Antialiasing", 2019, with the variance taken from the profile instead of from screen derivatives of the
//      normal: those are constant over a 2 x 2 pixel block and turned every crease of the cap's mesh and every thin roll
//      into a dotted line of light in round 2).
//   5. What breaks the highlight up: a slow waviness of the coat (its image of the lamp wobbles), handling marks (the haze
//      share drifts), micro-roughness, and the streaks of the scratch fan. All procedural, no sampler.
//   6. THE ROOM'S LIGHT ON THE BODY: the app's table is not a room material, so the room's fixed emitters and its ambient
//      never reached the aprons and legs. Six irradiance values (one per face direction, from the room's own emitter law,
//      wood/layout.js bodyLight) and the lamp's spill on the floor, with the table's own occlusion in closed form: under the
//      overhang, toward the floor, on faces that look under the table.
//   7. OPEN PORES AND DEPTH (round 3): short slits along the grain where the film sank into the wood's pores: there the coat
//      mirrors nothing and the wood under it is darker, so at reading distance the room's image in the lacquer is broken by
//      the grain the way it is on a real rail; from further away only their mean is left (a little less gloss).
// Only `before` / `after` anchors on standard three chunk includes, plus the app's shadow-rail line when it is in the text.

export const WOOD_PATCH_VERSION = 3;

export const WOOD_VARYING = 'varying vec3 vClubWoodPos;';
export const WOOD_VERTEX_ANCHOR = '#include <project_vertex>';
export const WOOD_VERTEX_CODE = /* glsl */`
{
  vec4 clubWoodWp = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    clubWoodWp = batchingMatrix * clubWoodWp;
  #endif
  #ifdef USE_INSTANCING
    clubWoodWp = instanceMatrix * clubWoodWp;
  #endif
  vClubWoodPos = ( modelMatrix * clubWoodWp ).xyz;
}`;
export const SIGHT_VERTEX_CODE = /* glsl */`
${WOOD_VERTEX_CODE}
vClubSightUv = uv;`;

// Round A3: the uniforms of the second hall model (hall === 2; see COAT_BODY_HALL2 and woodFnHall below). `floor` adds
// the floor map's sampler: the one sampler this part adds to such a material (it then carries no scan: `map` is false).
const hallPars2 = (floor) => `uniform vec4 uClubWoodHall;      // the hall body (round A3): tangent of the heads' elevation, the share of a face's light in the room's volume that is the carpet's bounce (taken out: the floor answers it per fragment), contact level at the floor, its height (m)
uniform vec4 uClubWoodFloorBox;  // the floor the body's lacquer mirrors: centre x, z; half extents x, z (the island inside the boards)
uniform vec4 uClubWoodFloorLv;   // its map: radiance scale, coarsest level, metres per texel, on (0 = the floor's four sides, as the club variant has them)
uniform vec4 uClubWoodRing;      // the ring of boards on that rectangle: height of its top (world y), on; radiance of the carpet beyond it against the island's; spare
uniform vec4 uClubWoodHallT;     // per side of the table (+x, -x, +z, -z): tangent of the elevation of the STEEP light on that side (the heads over the rim)
uniform vec4 uClubWoodHallK;     // ... of the LOW light on that side (a key light from a far truss)
uniform vec4 uClubWoodHallW;     // ... the low light's share of that side's direct light
${floor ? 'uniform sampler2D uClubWoodFloorMap; // the carpet\'s radiance around the table, sqrt-coded (the one added sampler of this variant)\n' : ''}`;
// Round A4: the one uniform the third hall model adds to round A3's (hall === 3; see WOOD_FN_OWN and COAT_BODY_HALL3 below).
const OWN_PARS = 'uniform vec4 uClubWoodOwn;       // the body by its own material (round A4): the material\'s own environment gain, factor on the hall\'s lights through its lobe, the lobe\'s half width per unit of alpha (radians), where the two samples sit (share of the half width)\n';

/**
 * Uniforms and globals (after <common>). `map` = false leaves the scan sampler out (a program with no texture unit to
 * spare). `hall`: true = round A2's hall body, 2 = round A3's (with `floor`: its floor map), 3 = round A4's (round A3's
 * uniforms and one more); never with `sight`.
 */
export function woodPars({ map = true, sight = false, hall = false, floor = false, keys = false } = {}) {
  // (round A6, `keys`, with hall 3 only: the key lights' uniforms after the third model's; without it the text is what it was)
  return /* glsl */`
#ifndef CLUB_WOOD_GLSL
#define CLUB_WOOD_GLSL
${WOOD_VARYING}
${hall === 3 && !sight ? hallPars2(floor === true) + OWN_PARS + (keys === true ? KEY_PARS : '') : hall === 2 && !sight ? hallPars2(floor === true) : (hall && !sight ?'uniform vec4 uClubWoodHall;     // the hall body (round A2): tangent of the heads\' elevation, the diffuse share of the face\'s light, contact level at the floor, its height (m)\n' : '')}${sight ? 'varying vec2 vClubSightUv;\nuniform vec4 uClubSight;      // round (1) or rhombus (0), seam darkening, nacre strength, slope of the recess wall' : ''}
${map ? 'uniform sampler2D uClubWoodMap;  // the wood scan, colour (the one added sampler)' : ''}
uniform vec4 uClubWoodSw;       // on, edges, grain, scratches (0..1 each)
uniform vec4 uClubWoodSw2;      // lamp lobe, room reflection, floor proxy, specular anti-aliasing (1 = from the edge profile, with bent normals kept facing the eye; 2 = round 2: screen derivatives, no horizon rule; for pictures)
uniform vec4 uClubWoodCueC;     // the cue in the coat: radiance of its lit side (rgb), on (0..1)
uniform vec3 uClubWoodCueA;     // the cue as a tapered capsule, world: tip end, butt end, radii (the occlusion service's
uniform vec3 uClubWoodCueB;     //   uniform objects under this part's own names: CONTRACT.md 4.2)
uniform vec2 uClubWoodCueR;
uniform float uClubWoodCueOn;
uniform vec4 uClubWoodBand;     // rail band about the table centre: inner half x, inner half z, outer half x, outer half z
uniform vec4 uClubWoodTop;      // rail top height, outer edge radius, inner edge radius, floor height
uniform vec4 uClubWoodRoom;     // table centre x, z; room half extents x, z about that centre
uniform vec4 uClubWoodCoat;     // strength, roughness of the narrow lobe, how far the coat follows the grain relief, micro-roughness variation
uniform vec4 uClubWoodHaze;     // the wide lobe: roughness, its share of the coat's reflection, slope of the coat's waviness, how much handling moves the share
uniform vec4 uClubWoodScr;      // fine scratches along the grain: share of the reflection, lobe along the grain, lobe across it, streak contrast
uniform vec4 uClubWoodPore;     // open pores: how much of the coat's mirror a pore scatters (0.6 of it goes to the wide lobe), how much of the surface they cover, how far they darken the wood, how much less mirror the dark figure carries
uniform vec4 uClubWoodGrain;    // metres per repeat in U, in V; grain along V (1) or along U (0); relief scale
uniform vec4 uClubWoodPlace;     // scan placement: offset per rail in U, in V; margin in U, in V
uniform vec4 uClubWoodTone;     // the scan's mean colour (linear), figure contrast
uniform vec4 uClubWoodBase;     // depth of the colour under the coat (1 = the app's own albedo), the lamp's structure along a roll thinner than a pixel (0..1), spare, slope of the cap's inner edge at the edge
uniform vec4 uClubWoodMode;     // chroma kept from the scan (0 = value only), kind (0 rail cap, 1 body), share of the base lobe kept under the coat, grain upright (legs)
uniform vec4 uClubWoodLampP;    // lamp rectangle: centre x, y, z; area
uniform vec4 uClubWoodLampH;    // lamp rectangle: half x, half z; on; cap on the lamp's own image in the cube
uniform vec3 uClubWoodLampL;    // radiance of the light itself (what it puts on the floor)
uniform vec3 uClubWoodLampM;    // mean radiance of the lamp's lit face seen from straight below (what the wide lobes mirror)
uniform vec4 uClubWoodLampT;    // the face's structure: 0 none, 0.5 panels, 1 panels and tube strips; strip half width, strip spacing, strip half length (shares of the rectangle's half sides)
uniform vec4 uClubWoodLampS;    // its lit panels: count, pitch along the lamp, half length, half width (shares of the half sides)
uniform vec4 uClubWoodLampF;    // radiance of a tube strip (rgb); the lamp's long axis is the light's width (1) or height (0)
uniform vec4 uClubWoodLampG;    // radiance of a panel between the strips (rgb); strips per panel (1 or 3)
uniform vec4 uClubWoodLampC;    // the diffuser's glare cut-off: level far off axis, cosine where it starts to rise, cosine where it is full, how much of it the coat's image takes (0..1)
uniform vec4 uClubWoodFloor;    // floor albedo, on
uniform vec3 uClubWoodFloorR[ 4 ]; // radiance of the floor beside the table from the room's own lamps: +x, -x, +z, -z side
uniform vec3 uClubWoodAmb[ 6 ]; // the room's light on a body part, irradiance / pi, per face direction: +x, -x, +y, -y, +z, -z
uniform vec4 uClubWoodBody;     // body: the room's light on (0..1), the table's own occlusion on (0..1), the floor's bounce on (0..1), height of the skirt's lower edge
uniform vec4 uClubWoodFill;     // tools only: an extra fill on a body part, irradiance / pi (rgb); the coat's matte pedestal: what it returns in every direction (a)
vec3 clubWoodCN = vec3( 0.0, 0.0, 1.0 );   // coat normal, view space
float clubWoodCR = 0.3;                    // roughness of the coat's narrow lobe
float clubWoodCR0 = 0.3;                   // ... before the specular anti-aliasing widened it
float clubWoodHR = 0.5;                    // roughness of its wide lobe
float clubWoodHzK = 1.0;                   // handling marks: factor on the wide lobe's share
float clubWoodBrK = 1.0;                   // streaks: factor on the scratch fan's share
vec3 clubWoodAx = vec3( 1.0, 0.0, 0.0 );   // world direction of the grain
vec3 clubWoodTu = vec3( 1.0, 0.0, 0.0 );   // world direction of +U of the scan
vec3 clubWoodTv = vec3( 0.0, 0.0, 1.0 );   // world direction of +V of the scan
vec3 clubWoodTs = vec3( 0.0, 0.0, 1.0 );   // tangent-space relief of the scan
float clubWoodFig = 1.0;                   // figure: scan luminance over its mean
vec2 clubWoodSC = vec2( 0.0 );             // metres along the grain, across it
float clubWoodFoot = 1.0;                  // metres across the grain covered by one pixel
float clubWoodVar = 0.0;                   // specular anti-aliasing: twice the variance of the coat normal's lean inside one pixel (from the edge profile)
float clubWoodPore = 0.0;                  // open pores: 0 closed film, 1 inside a pore
float clubWoodEdge = 1.0;                  // sights: 0 at the rim, 1 at the centre
float clubWoodRim = 0.2;                   // sights: width of the rim zone, in the same unit
vec2 clubWoodPl = vec2( 0.0 );             // sights: tilt of the nacre's platelets here
vec3 clubWoodIri = vec3( 0.5 );            // sights: interference colour here
#endif
`;
}

/** Functions that need three's light and environment declarations: spliced in front of <clipping_planes_pars_fragment>. */
export const WOOD_FN_ANCHOR = '#include <clipping_planes_pars_fragment>';
export const WOOD_FN = /* glsl */`
#ifndef CLUB_WOOD_FN
#define CLUB_WOOD_FN
float clubWoodHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float clubWoodNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( clubWoodHash( i ), clubWoodHash( i + vec2( 1.0, 0.0 ) ), f.x ),
              mix( clubWoodHash( i + vec2( 0.0, 1.0 ) ), clubWoodHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
// Share of the lamp rectangle a floor point q (x, z) still sees past the table top: both are axis-aligned rectangles on
// horizontal planes, so the top's projection from q onto the lamp plane is a rectangle and the blocked share is the product
// of two 1-D overlaps (exact for a uniform lamp, without the cosine weights).
float clubWoodFloorVis( vec2 q ) {
  float s = ( uClubWoodLampP.y - uClubWoodTop.w ) / max( uClubWoodTop.x - uClubWoodTop.w, 1e-3 );
  vec2 lo = q + ( uClubWoodRoom.xy - uClubWoodBand.zw - q ) * s;
  vec2 hi = q + ( uClubWoodRoom.xy + uClubWoodBand.zw - q ) * s;
  vec2 ov = clamp( ( min( hi, uClubWoodLampP.xz + uClubWoodLampH.xy ) - max( lo, uClubWoodLampP.xz - uClubWoodLampH.xy ) )
    / max( 2.0 * uClubWoodLampH.xy, vec2( 1e-4 ) ), 0.0, 1.0 );
  return 1.0 - ov.x * ov.y;
}
// Radiance of the floor at fq (x, z) from the lamp's spill past the table top: a plane of known height lit by a rectangle
// of known radiance past a rectangle of known size.
vec3 clubWoodFloorLamp( vec2 fq ) {
  vec3 v = vec3( uClubWoodLampP.x - fq.x, uClubWoodLampP.y - uClubWoodTop.w, uClubWoodLampP.z - fq.y );
  float d2 = dot( v, v );
  float ff = uClubWoodLampP.w * v.y * v.y / ( d2 * ( d2 + 0.3 * uClubWoodLampP.w ) * PI ); // lamp form factor at the floor
  return uClubWoodFloor.rgb * uClubWoodLampL * ( ff * clubWoodFloorVis( fq ) * uClubWoodLampH.z );
}
// ... and from the room's own lamps: one radiance per side of the table (the bar side is warmer than the wall side), blended
// by where the point lies, and less under the table.
vec3 clubWoodFloorRoom( vec2 fq ) {
  vec2 s = ( fq - uClubWoodRoom.xy ) / uClubWoodBand.zw;
  vec2 sp = max( s, 0.0 ), sn = max( - s, 0.0 );
  sp *= sp; sn *= sn;
  vec3 side = ( uClubWoodFloorR[ 0 ] * sp.x + uClubWoodFloorR[ 1 ] * sn.x + uClubWoodFloorR[ 2 ] * sp.y + uClubWoodFloorR[ 3 ] * sn.y )
    / max( sp.x + sn.x + sp.y + sn.y, 1e-3 );
  return side * mix( 0.3, 1.0, smoothstep( 0.7, 1.6, max( abs( s.x ), abs( s.y ) ) ) );
}
// Radiance the coat mirrors from the room: world position P, world reflection direction Rw, the lobe's roughness.
vec3 clubWoodRoomRad( vec3 P, vec3 Rw, float rough ) {
  vec3 d = normalize( Rw );
  vec3 rad = vec3( 0.0 );
  #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
    vec3 l = d;
    #ifdef CLUB_ENV_GLSL
      l = clubEnvDirRough( P, d, rough );
    #endif
    // (the scene's intensity only: the app's per-material environment gain sits in three's own lookup, which calibrates the
    // app's matte lobe; a coat mirrors the room at the room's radiance, the way it mirrors the lamp at the lamp's)
    rad = textureCubeUV( envMap, envMapRotation * l, rough ).rgb * envMapIntensity;
  #endif
  // the lamp is the area-light lobe: its own image in the cube is capped, so the highlight is not counted twice
  if ( uClubWoodLampH.z > 0.5 && d.y > 1e-3 && P.y < uClubWoodLampP.y ) {
    float t = ( uClubWoodLampP.y - P.y ) / d.y;
    vec2 e = abs( P.xz + d.xz * t - uClubWoodLampP.xz ) - uClubWoodLampH.xy;
    float w = 1.0 - smoothstep( 0.0, 0.08 + 2.5 * rough * rough * t, max( e.x, e.y ) );
    rad = mix( rad, min( rad, vec3( uClubWoodLampH.w ) ), w * uClubWoodSw2.x );
  }
  // the floor beside and under the table. The cube is captured from a point on the table: the rail hides the whole floor
  // from it, so a downward ray from the rail's outer edge or from the body has no answer there.
  if ( uClubWoodFloor.w * uClubWoodSw2.z > 0.0 && d.y < -0.02 && P.y > uClubWoodTop.w ) {
    float tf = ( uClubWoodTop.w - P.y ) / d.y;
    vec2 fq = P.xz + d.xz * tf;
    vec2 fc = fq - uClubWoodRoom.xy;
    vec2 e = abs( fc ) - uClubWoodBand.zw;
    // the ray leaves the table: it lands outside the table's outline, or it starts below the top
    float leaves = max( smoothstep( 0.0, 0.04, max( e.x, e.y ) ), step( P.y, uClubWoodTop.x - 0.05 ) );
    float inRoom = step( max( abs( fc.x ) - uClubWoodRoom.z, abs( fc.y ) - uClubWoodRoom.w ), 0.0 );
    vec3 fl = clubWoodFloorLamp( fq ) + clubWoodFloorRoom( fq );
    rad = mix( rad, fl, leaves * inRoom * uClubWoodSw2.z );
  }
  return rad;
}
// One rectangle through three's LTC fit: centre c, half sides a and b (view space, like three's own
// RE_Direct_RectArea_Physical; the corner order is three's, which also decides the lit side).
vec3 clubWoodRect( vec3 N, vec3 V, vec3 P, mat3 mInv, vec3 c, vec3 a, vec3 b ) {
  vec3 rc[ 4 ];
  rc[ 0 ] = c + a - b;
  rc[ 1 ] = c - a - b;
  rc[ 2 ] = c - a + b;
  rc[ 3 ] = c + a + b;
  return LTC_Evaluate( N, V, P, mInv, rc );
}
// The diffuser's glare cut-off (the luminaire's own law, club/room/lamp.js LAW_MAIN): its radiance toward a point, by the
// cosine of the angle between that ray and straight down. uClubWoodLampC.w = how much of it the coat's image takes. The law
// is what a CAMERA sees of the diffuser (it keeps the face from clipping on screen); the light on the table has none and
// the balls mirror the face without it, so by default the lacquer takes none either (0) and rail and ball agree.
float clubWoodCut( float c ) {
  return mix( 1.0, mix( uClubWoodLampC.x, 1.0, smoothstep( uClubWoodLampC.y, uClubWoodLampC.z, abs( c ) ) ), uClubWoodLampC.w );
}
// The lamp in one lobe of the coat: every rectangular light of the scene at the coat's normal and the lobe's roughness (the
// two tables are bound by three for the base lobe). fine > 0.5: the lamp's lit face as the frame shows it. Its pattern is a
// product of two profiles, one along the lamp (lit panels between cross bars, each dimmer by the cut-off toward this point)
// and one across it (tube strips over the panel between them); each profile is integrated as rectangles and the two are
// multiplied over the whole rectangle's integral (exact where the lobe is narrow against the pattern, and its mean where the
// lobe is wide). Otherwise: the face's mean radiance over the whole rectangle (a wide lobe resolves no panel).
// A light without the pattern (any other fixture) is its own rectangle at its own radiance.
// A ROLL THINNER THAN A PIXEL (clubWoodVar is large): the pixel holds the whole fan of the edge's normals, which turn about
// the rail's axis, so the lamp's image is averaged ACROSS the rail and still sharp ALONG it: on the far rails the lamp is a
// thin line broken by the diffuser's cross bars (a rail that runs along the lamp) or by the gaps between its tube strips
// (a rail that runs across it). The widened lobe above would average both ways. So the profile along the rail is taken
// with the lobe's own, unwidened roughness at the one normal of the fan that mirrors the eye onto the lamp's centre line
// (four more rectangle integrals, on those pixels only), and the widened lobe keeps the amount.
vec3 clubWoodLampLobe( vec3 N, vec3 V, vec3 P, float rough, float fine ) {
  vec3 sum = vec3( 0.0 );
  #if NUM_RECT_AREA_LIGHTS > 0
    vec2 uv = LTC_Uv( N, V, rough );
    vec4 t1 = texture2D( ltc_1, uv );
    vec4 t2 = texture2D( ltc_2, uv );
    mat3 mInv = mat3( vec3( t1.x, 0, t1.y ), vec3( 0, 1, 0 ), vec3( t1.z, 0, t1.w ) );
    float fr = 0.04 * t2.x + 0.96 * t2.y;
    vec3 dn = normalize( ( viewMatrix * vec4( 0.0, -1.0, 0.0, 0.0 ) ).xyz );
    for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
      vec3 c = rectAreaLights[ i ].position;
      vec3 hw = rectAreaLights[ i ].halfWidth;
      vec3 hh = rectAreaLights[ i ].halfHeight;
      vec3 full = clubWoodRect( N, V, P, mInv, c, hw, hh );
      vec3 lobe = rectAreaLights[ i ].color * full;
      if ( uClubWoodLampT.x > 0.25 ) {
        lobe = uClubWoodLampM * ( full * clubWoodCut( dot( normalize( P - c ), dn ) ) );
        if ( fine > 0.5 ) {
          // (a turn of the frame by a quarter keeps the corner order: along = height, across = minus width)
          vec3 a = uClubWoodLampF.a > 0.5 ? hw : hh;
          vec3 b = uClubWoodLampF.a > 0.5 ? hh : - hw;
          float pads = 0.0;
          for ( int k = 0; k < 6; k ++ ) {
            if ( float( k ) >= uClubWoodLampS.x ) break;
            vec3 pc = c + a * ( ( float( k ) - 0.5 * ( uClubWoodLampS.x - 1.0 ) ) * uClubWoodLampS.y );
            pads += clubWoodRect( N, V, P, mInv, pc, a * uClubWoodLampS.z, b * uClubWoodLampS.w ).x * clubWoodCut( dot( normalize( P - pc ), dn ) );
          }
          vec3 across = ( uClubWoodLampG.rgb + ( uClubWoodLampF.rgb - uClubWoodLampG.rgb ) * ( uClubWoodLampG.a * uClubWoodLampT.y ) ) * full.x;
          if ( uClubWoodLampT.x > 0.75 ) {
            float tubes = clubWoodRect( N, V, P, mInv, c, a * uClubWoodLampT.w, b * uClubWoodLampT.y ).x;
            if ( uClubWoodLampG.a > 1.5 ) {
              tubes += clubWoodRect( N, V, P, mInv, c + b * uClubWoodLampT.z, a * uClubWoodLampT.w, b * uClubWoodLampT.y ).x;
              tubes += clubWoodRect( N, V, P, mInv, c - b * uClubWoodLampT.z, a * uClubWoodLampT.w, b * uClubWoodLampT.y ).x;
            }
            across = uClubWoodLampG.rgb * full.x + ( uClubWoodLampF.rgb - uClubWoodLampG.rgb ) * tubes;
          }
          float along = pads / max( full.x, 1e-5 );
          float thin = smoothstep( 0.02, 0.1, clubWoodVar ) * uClubWoodBase.y;
          if ( thin > 0.0 ) {
            vec3 ax = normalize( ( viewMatrix * vec4( clubWoodAx, 0.0 ) ).xyz );
            float va = dot( V, ax );
            vec3 e = ( c - P ) - ax * dot( c - P, ax );
            vec3 n2 = normalize( V + sqrt( max( 1.0 - va * va, 0.0 ) ) * normalize( e ) - va * ax );
            vec4 s1 = texture2D( ltc_1, LTC_Uv( n2, V, clubWoodCR0 ) );
            mat3 mInv2 = mat3( vec3( s1.x, 0, s1.y ), vec3( 0, 1, 0 ), vec3( s1.z, 0, s1.w ) );
            float full2 = clubWoodRect( n2, V, P, mInv2, c, hw, hh ).x;
            if ( full2 > 1e-4 ) {
              if ( abs( dot( ax, normalize( a ) ) ) > 0.7 ) {
                // the rail runs along the lamp: its panels and the cross bars between them
                float pads2 = 0.0;
                for ( int k = 0; k < 6; k ++ ) {
                  if ( float( k ) >= uClubWoodLampS.x ) break;
                  vec3 pc = c + a * ( ( float( k ) - 0.5 * ( uClubWoodLampS.x - 1.0 ) ) * uClubWoodLampS.y );
                  pads2 += clubWoodRect( n2, V, P, mInv2, pc, a * uClubWoodLampS.z, b * uClubWoodLampS.w ).x * clubWoodCut( dot( normalize( P - pc ), dn ) );
                }
                along = mix( along, pads2 / full2, thin );
              } else if ( uClubWoodLampT.x > 0.75 ) {
                // the rail runs across the lamp: its tube strips
                float tubes2 = clubWoodRect( n2, V, P, mInv2, c, a * uClubWoodLampT.w, b * uClubWoodLampT.y ).x;
                if ( uClubWoodLampG.a > 1.5 ) {
                  tubes2 += clubWoodRect( n2, V, P, mInv2, c + b * uClubWoodLampT.z, a * uClubWoodLampT.w, b * uClubWoodLampT.y ).x;
                  tubes2 += clubWoodRect( n2, V, P, mInv2, c - b * uClubWoodLampT.z, a * uClubWoodLampT.w, b * uClubWoodLampT.y ).x;
                }
                across = mix( across, ( uClubWoodLampG.rgb * full2 + ( uClubWoodLampF.rgb - uClubWoodLampG.rgb ) * tubes2 ) * ( full.x / full2 ), thin );
              }
            }
          }
          lobe = across * along;
        }
      }
      sum += fr * lobe;
    }
  #endif
  return sum;
}
// Fine scratches along the grain (wiping, brushing) as a population of grooves. Their facets turn about the grain axis, so
// together they are a lobe that is narrow along the grain and wide across it: the streaked sheen a wiped finish shows around
// a lamp's image and, faintly, far from it across the grain. The lamp enters as its nearest point to the mirror ray and its
// solid angle (no table lookup); never more than a mirror would return. World space; T = the grain axis.
vec3 clubWoodBrush( vec3 P, vec3 Nw, vec3 Vw, vec3 T ) {
  if ( uClubWoodLampH.z < 0.5 ) return vec3( 0.0 );
  float nv = dot( Nw, Vw );
  float ty = uClubWoodLampP.y - P.y;
  if ( nv <= 0.0 || ty <= 0.0 ) return vec3( 0.0 );
  vec3 r = reflect( - Vw, Nw );
  vec2 hit = P.xz + r.xz * ( r.y > 0.05 ? ty / r.y : 40.0 );
  vec2 q = uClubWoodLampP.xz + clamp( hit - uClubWoodLampP.xz, - uClubWoodLampH.xy, uClubWoodLampH.xy );
  vec3 l = vec3( q.x - P.x, ty, q.y - P.z );
  float d2 = max( dot( l, l ), 1e-4 );
  l *= inversesqrt( d2 );
  if ( dot( Nw, l ) <= 0.0 ) return vec3( 0.0 );
  vec3 h = normalize( l + Vw );
  vec3 X = normalize( T - Nw * dot( T, Nw ) + vec3( 1e-5, 2e-5, 3e-5 ) );
  vec3 Y = cross( Nw, X );
  float hx = dot( h, X ) / uClubWoodScr.y, hy = dot( h, Y ) / uClubWoodScr.z, hn = dot( h, Nw );
  float den = hx * hx + hy * hy + hn * hn;
  float D = 1.0 / ( PI * uClubWoodScr.y * uClubWoodScr.z * den * den );
  float omega = uClubWoodLampP.w * l.y / d2;                       // solid angle of the lamp from here
  float f = 0.04 + 0.96 * pow( 1.0 - saturate( dot( h, Vw ) ), 5.0 );
  return uClubWoodLampM * ( f * clubWoodCut( l.y ) * min( omega * D / ( 4.0 * max( nv, 0.2 ) ), 1.0 ) );
}
// The cue in the coat. A lobe leaving P along d (world, unit) is covered by the cue (a tapered capsule) by .a; .rgb is what
// the cue shows there. The side the rail looks at is mostly the cue's underside, away from the lamp: the cue reads as a dark
// soft streak that cuts the lamp and the room out of the lacquer under it, lighter where the ray meets its lit flank.
vec4 clubWoodCue( vec3 P, vec3 d, float rough ) {
  if ( uClubWoodCueOn * uClubWoodCueC.a < 0.01 ) return vec4( 0.0 );
  vec3 ab = uClubWoodCueB - uClubWoodCueA, ao = P - uClubWoodCueA;
  float abab = max( dot( ab, ab ), 1e-8 ), abd = dot( ab, d );
  float den = abab - abd * abd;
  float s = den > 1e-8 ? clamp( ( dot( ao, ab ) - dot( ao, d ) * abd ) / den, 0.0, 1.0 ) : 0.0;
  float t = dot( uClubWoodCueA + ab * s - P, d );
  if ( t < 0.003 ) return vec4( 0.0 );
  s = clamp( dot( P + d * t - uClubWoodCueA, ab ) / abab, 0.0, 1.0 );
  vec3 off = P + d * t - ( uClubWoodCueA + ab * s );
  float dist = length( off );
  float r = mix( uClubWoodCueR.x, uClubWoodCueR.y, s );
  float blur = 0.0012 + 1.5 * rough * rough * t;
  float cover = ( 1.0 - smoothstep( r - blur, r + blur, dist ) ) * uClubWoodCueC.a;
  float k = clamp( dist / max( r, 1e-4 ), 0.0, 1.0 );
  vec3 n = normalize( - d * sqrt( 1.0 - k * k ) + off / max( dist, 1e-5 ) * k );
  return vec4( uClubWoodCueC.rgb * ( 0.04 + 0.96 * clamp( n.y, 0.0, 1.0 ) ), cover );
}
// Geometric specular anti-aliasing: the roughness that also covers the normal's variation inside one pixel. The variation
// is clubWoodVar, from the edge profile (WOOD_NORMAL). Tools only (uClubWoodSw2.w = 2): round 2's form, from the screen
// derivatives of the normal, kept as the off arm of the picture pair.
float clubWoodAA( float rough, vec3 n ) {
  float k = min( clubWoodVar, 0.35 ) * min( uClubWoodSw2.w, 1.0 );
  if ( uClubWoodSw2.w > 1.5 ) {
    vec3 nx = dFdx( n ), ny = dFdy( n );
    k = min( 0.5 * ( dot( nx, nx ) + dot( ny, ny ) ), 0.18 );
  }
  float a2 = rough * rough;
  return pow( min( a2 * a2 + k, 1.0 ), 0.25 );
}
// An edge profile u( x ) = clamp( 1 - x / r, 0, 1 ) ^ p along the distance x from the edge (p = 1: a slope that grows
// linearly to the edge; p = 2: the round-over's): its primitive from 0, and its mean and variance over a pixel's footprint
// of width w centred on d (the part of the footprint past the edge is not this face and is left out).
float clubWoodRampInt( float x, float r, float p ) {
  float t = 1.0 - clamp( x / r, 0.0, 1.0 );
  return r / ( p + 1.0 ) * ( 1.0 - pow( t, p + 1.0 ) );
}
vec2 clubWoodRamp( float d, float w, float r, float p ) {
  float a = max( d - 0.5 * w, 0.0 ), b = max( d + 0.5 * w, a + 1e-5 );
  float m1 = ( clubWoodRampInt( b, r, p ) - clubWoodRampInt( a, r, p ) ) / ( b - a );
  float m2 = ( clubWoodRampInt( b, r, 2.0 * p ) - clubWoodRampInt( a, r, 2.0 * p ) ) / ( b - a );
  return vec2( m1, max( m2 - m1 * m1, 0.0 ) );
}
#endif
`;

// ---- the hall as the table body's lacquer sees it (round A3, the arena venue only) ------------------------------------------------
// Appended to WOOD_FN in the second hall variant and nowhere else (the club venue's text never holds it). Three functions:
//   clubWoodHallFloor  the carpet's radiance at a floor point, for a footprint of a given width: the room's own light on
//                      the carpet (a small map built on the CPU from the room's baked floor irradiance times the carpet's
//                      albedo: wood/layout.js hallFloorField, square-root coded; with `floor` false, or the map switched
//                      off, the four sides of the club variant) plus the main lamp's spill past the table top (the lamp
//                      is a scene light, not a room emitter: clubWoodFloorLamp);
//   clubWoodHallCube   the scene's cube toward where a ray ends (the reflection service's corrected direction);
//   clubWoodHallRad    what a lobe of the coat sees from P along a direction. A FALLING ray meets the floor plane: the
//                      carpet there, as the room holds it (the pool, the table's own shadow, the fall toward the boards),
//                      or, when it reaches the ring of boards above the floor, the board's face as the cube holds it
//                      (looked up toward that point of the ring, so the lit strip sits at the board's top and not at
//                      the horizon of the capture point), or the hall behind the boards when it passes over them. A
//                      RISING ray takes the club variant's answer (the cube, the lamp's image capped), unless it starts
//                      under the table's top and would leave the table's outline above the overhang's lower edge: then
//                      it ends on the underside of the top, which is dark. A mirror ray carries no occlusion factor.
export function woodFnHall({ floor = false } = {}) {
  return /* glsl */`
#ifndef CLUB_WOOD_FN_HALL
#define CLUB_WOOD_FN_HALL
vec3 clubWoodHallFloor( vec2 fq, float foot ) {
  vec3 spill = clubWoodFloorLamp( fq );
${floor ? `  if ( uClubWoodFloorLv.w < 0.5 ) return spill + clubWoodFloorRoom( fq );
  vec2 c = ( fq - uClubWoodFloorBox.xy ) / uClubWoodFloorBox.zw;
  float lod = clamp( log2( max( foot / uClubWoodFloorLv.z, 1.0 ) ), 0.0, uClubWoodFloorLv.y );
  vec3 s = textureLod( uClubWoodFloorMap, clamp( c * 0.5 + 0.5, 0.0, 1.0 ), lod ).rgb;
  return spill + s * s * ( uClubWoodFloorLv.x * mix( 1.0, uClubWoodRing.z, step( 1.0, max( abs( c.x ), abs( c.y ) ) ) ) );` : '  return spill + clubWoodFloorRoom( fq );'}
}
vec3 clubWoodHallCube( vec3 p, vec3 dir, float rough ) {
  vec3 rad = vec3( 0.0 );
  #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
    vec3 l = dir;
    #ifdef CLUB_ENV_GLSL
      l = clubEnvDirRough( p, dir, rough );
    #endif
    rad = textureCubeUV( envMap, envMapRotation * l, rough ).rgb * envMapIntensity;
  #endif
  return rad;
}
vec3 clubWoodHallRad( vec3 P, vec3 Rw, float rough ) {
  vec3 d = normalize( Rw );
  vec2 dh = mix( min( d.xz, vec2( -1e-5 ) ), max( d.xz, vec2( 1e-5 ) ), step( vec2( 0.0 ), d.xz ) );
  if ( d.y > -1e-3 || P.y <= uClubWoodTop.w ) {
    vec3 rad = clubWoodRoomRad( P, d, rough );
    vec2 pc = P.xz - uClubWoodRoom.xy;
    vec2 q = uClubWoodBand.zw - abs( pc );
    float sd = min( q.x, q.y );
    if ( d.y > 0.0 && sd > 0.004 && P.y < uClubWoodTop.x - 0.02 ) {
      vec2 te = ( sign( dh ) * uClubWoodBand.zw - pc ) / dh;
      float edge = mix( uClubWoodTop.x - 0.045, uClubWoodBody.w, smoothstep( 0.01, 0.03, sd ) );
      rad *= 1.0 - smoothstep( edge - 0.02, edge + 0.02, P.y + d.y * min( te.x, te.y ) );
    }
    return rad;
  }
  float tf = ( uClubWoodTop.w - P.y ) / d.y;
  vec3 fl = clubWoodHallFloor( P.xz + d.xz * tf, ( 0.03 + 2.5 * rough * rough * tf ) / max( - d.y, 0.2 ) );
  if ( uClubWoodRing.y > 0.5 ) {
    vec2 tb2 = ( sign( dh ) * uClubWoodFloorBox.zw - ( P.xz - uClubWoodFloorBox.xy ) ) / dh;
    float tb = min( tb2.x, tb2.y );
    if ( tb > 0.0 && tb < tf ) {
      vec3 x = P + d * tb;
      vec3 hall = clubWoodHallCube( P, d, rough );
      vec3 board = hall;
      #ifdef CLUB_ENV_GLSL
        board = clubWoodHallCube( x, normalize( x - uClubEnvPos ), rough );
      #endif
      fl = mix( board, hall, smoothstep( uClubWoodRing.x - 0.03, uClubWoodRing.x + 0.05, x.y ) );
    }
  }
  if ( uClubWoodSw2.z > 0.999 ) return fl;
  return mix( clubWoodRoomRad( P, d, rough ), fl, uClubWoodSw2.z );
}
#endif
`;
}

// ---- the hall as the table body's OWN material sees it (round A4, the arena venue only) ------------------------------------------
// Appended after woodFnHall in the third hall variant and nowhere else. The body keeps the app's material (its colour and
// map, its roughness, its environment gain: wood/layout.js HALL_OWN has the reasons); these two functions are its one
// rough lobe:
//   clubWoodOwnLobe   the lobe for ONE light direction, in closed form (GGX, Smith's correlated visibility, Schlick's
//                     Fresnel at F0 0.04): radiance per unit of irradiance ON THE FACE (the cosine is in the irradiance).
//                     It depends on where the eye is, as every reflection does; nothing is shown or hidden by it;
//   clubWoodOwnRad    what the lobe sees of the hall about a direction. A lobe of roughness 0.6 is 24 degrees wide to
//                     its half height: from a vertical face it holds the carpet AND the hall over it. Two samples through
//                     round A3's clubWoodHallRad, weighted by the lobe's share below the horizon: one bent BELOW it (the
//                     carpet as the room holds it, at a footprint of the lobe's width, or the boards), one bent ABOVE it
//                     (the scene's cube at a roughness of 0.4 at most, never nearer the horizon than uClubWoodOwn.w of
//                     the half width: the cube is taken from a point on the table and holds the lit bed under its own
//                     horizon, which no outer face of the body can see); times the material's own environment gain.
export const WOOD_FN_OWN = /* glsl */`
#ifndef CLUB_WOOD_FN_OWN
#define CLUB_WOOD_FN_OWN
float clubWoodOwnLobe( vec3 N, vec3 V, vec3 L, float a ) {
  float nl = dot( N, L ), nv = max( dot( N, V ), 1e-3 );
  if ( nl <= 0.0 ) return 0.0;
  vec3 H = normalize( V + L );
  float nh = saturate( dot( N, H ) ), vh = saturate( dot( V, H ) ), a2 = a * a;
  float d = nh * nh * ( a2 - 1.0 ) + 1.0;
  float vis = 0.5 / ( nl * sqrt( nv * nv * ( 1.0 - a2 ) + a2 ) + nv * sqrt( nl * nl * ( 1.0 - a2 ) + a2 ) );
  return a2 / ( PI * d * d ) * vis * ( 0.04 + 0.96 * pow( 1.0 - vh, 5.0 ) );
}
vec3 clubWoodOwnRad( vec3 P, vec3 Rw, float rough ) {
  vec3 d = normalize( Rw );
  float s = max( uClubWoodOwn.z * rough * rough, 0.02 );
  float el = asin( clamp( d.y, -1.0, 1.0 ) );
  float down = smoothstep( - s, s, - el );
  vec2 h = d.xz / max( length( d.xz ), 1e-4 );
  vec3 rad = vec3( 0.0 );
  if ( down > 0.002 ) {
    float e = clamp( min( el, - uClubWoodOwn.w * s ), -1.5, -0.05 );
    rad += clubWoodHallRad( P, vec3( h.x * cos( e ), sin( e ), h.y * cos( e ) ), rough ) * down;
  }
  if ( down < 0.998 ) {
    float e = min( max( el, uClubWoodOwn.w * s ), 1.5 );
    rad += clubWoodHallRad( P, vec3( h.x * cos( e ), sin( e ), h.y * cos( e ) ), min( rough, 0.4 ) ) * ( 1.0 - down );   // (0.4 = wood/layout.js HALL_OWN.upRough; the node arm pins the two)
  }
  return rad * uClubWoodOwn.x;
}
#endif
`;
/** Round A7: WOOD_FN_OWN with the lobe's two samples through clubWoodHallRadE (the hall's baked cube: WOOD_FN_HENV above). The node arm checks that exactly two calls change and nothing else. */
export const WOOD_FN_OWN_HENV = WOOD_FN_OWN.split('clubWoodHallRad(').join('clubWoodHallRadE(').split('CLUB_WOOD_FN_OWN').join('CLUB_WOOD_FN_OWN_HENV');

// ---- the hall's baked reflection in the body's own lobe (round A7, the arena venue only; CONTRACT.md 19.1) --------------------------
// Spliced between woodFnHall and WOOD_FN_OWN in the third hall variant WITH the hall cube (`henv`) and nowhere else. The
// lobe's two samples then go through clubWoodHallRadE in place of clubWoodHallRad (WOOD_FN_OWN_HENV below: the same text
// with that one name changed). What changes is WHICH picture of the hall a ray reads where it leaves the table:
//   a rising ray           the hall's own baked cube with the hall's box as the local correction (the stands, the drape,
//                          the roof and its lenses where they are seen from the body), in place of the scene's cube, which
//                          is taken 11 cm over the bed and holds the hood overhead and the bed below its horizon;
//   a ray to the boards    the board's face from the baked cube, looked up toward the point of the ring the ray meets, and
//                          the hall over the boards by the box;
//   a ray to the carpet    stays on the floor map (the room's own baked floor irradiance: exact under the table's side),
//                          unless uClubWoodHallEnv.y turns the cube on there too (a tool's pair).
// uClubWoodHallEnv.x mixes the first two in (0 = round A6's answer, text and numbers). The table's own underside still
// ends a rising ray that starts under the top, as in clubWoodHallRad. `HALL_GLSL` (env/hall.js, handed in by the caller:
// this file imports nothing) declares the cube, its box and clubHallEnv / clubHallEnvFar.
export const HENV_PARS = /* glsl */`
#ifndef CLUB_WOOD_HENV_PARS
#define CLUB_WOOD_HENV_PARS
uniform vec4 uClubWoodHallEnv;  // the hall's baked cube in the body's lobe (round A7): share on rising rays and the boards, share on the carpet, spare, spare
#endif
`;
export const WOOD_FN_HENV = /* glsl */`
#ifndef CLUB_WOOD_FN_HENV
#define CLUB_WOOD_FN_HENV
vec3 clubWoodHallRadE( vec3 P, vec3 Rw, float rough ) {
  vec3 own = clubWoodHallRad( P, Rw, rough );
  if ( uClubWoodHallEnv.x + uClubWoodHallEnv.y < 1e-4 ) return own;
  vec3 d = normalize( Rw );
  vec2 dh = mix( min( d.xz, vec2( -1e-5 ) ), max( d.xz, vec2( 1e-5 ) ), step( vec2( 0.0 ), d.xz ) );
  if ( d.y > -1e-3 || P.y <= uClubWoodTop.w ) {
    vec3 rad = clubHallEnv( P, d, rough );
    vec2 pc = P.xz - uClubWoodRoom.xy;
    vec2 q = uClubWoodBand.zw - abs( pc );
    float sd = min( q.x, q.y );
    if ( d.y > 0.0 && sd > 0.004 && P.y < uClubWoodTop.x - 0.02 ) {
      vec2 te = ( sign( dh ) * uClubWoodBand.zw - pc ) / dh;
      float edge = mix( uClubWoodTop.x - 0.045, uClubWoodBody.w, smoothstep( 0.01, 0.03, sd ) );
      rad *= 1.0 - smoothstep( edge - 0.02, edge + 0.02, P.y + d.y * min( te.x, te.y ) );
    }
    return mix( own, rad, uClubWoodHallEnv.x );
  }
  float tf = ( uClubWoodTop.w - P.y ) / d.y;
  if ( uClubWoodRing.y > 0.5 ) {
    vec2 tb2 = ( sign( dh ) * uClubWoodFloorBox.zw - ( P.xz - uClubWoodFloorBox.xy ) ) / dh;
    float tb = min( tb2.x, tb2.y );
    if ( tb > 0.0 && tb < tf ) {
      vec3 x = P + d * tb;
      vec3 board = clubHallEnvFar( x - uClubHallPos, rough );
      vec3 over = clubHallEnv( P, d, rough );
      return mix( own, mix( board, over, smoothstep( uClubWoodRing.x - 0.03, uClubWoodRing.x + 0.05, x.y ) ), uClubWoodHallEnv.x );
    }
  }
  vec3 fp = P + d * tf;
  return mix( own, clubHallEnvFar( fp - uClubHallPos, rough ) + clubWoodFloorLamp( fp.xz ), uClubWoodHallEnv.y );
}
#endif
`;

// ---- the hall's key lights on the table's body, each with its own direction (round A6, the arena venue only) ----------------------
// Appended after WOOD_FN_OWN in the third hall variant WITH KEYS and nowhere else (wood/layout.js HALL_KEYS has the reasons).
//   clubWoodKeyE      one key's irradiance on a face, by the room light's own law for a point emitter (room/light.js: the
//                     reach window, the cone or the shaded lamp's lobe, the source size in the near field); the unit
//                     direction to the key comes back in L. No occlusion. (wood/layout.js hallKeyLight is its JS mirror.)
//   clubWoodKeyShade  the share of that light that passes the table's own overhangs along L: the ray leaves the table's
//                     outline somewhere; under the rail's edge for a point on the skirt, under the skirt's foot for what
//                     hangs below it. A face on the table's far side or one that looks under the table fails the same
//                     test by itself (its ray crosses under the whole table). The edge is as wide as the key's source
//                     makes it over that path. (wood/layout.js hallKeyShade.)
// Light positions and a surface normal: no term reads the camera.
export const KEY_PARS = /* glsl */`uniform vec4 uClubWoodKeyP[ 4 ];  // the hall's key lights (round A6): position (world), reach
uniform vec4 uClubWoodKeyC[ 4 ];  // colour x candela on the axis; the square of the source size
uniform vec4 uClubWoodKeyA[ 4 ];  // unit axis; the cone as the room light packs it (2 + cos of the field half angle, 4 + cos for a bell; 0..1 a shaded lamp's beam share)
uniform vec4 uClubWoodKeyS[ 4 ];  // its shutter: the unit normal of a plane through the key, pointing to the lit side; has one (0 | 1)
uniform vec4 uClubWoodKeyF[ 4 ];  // its second blade (out of focus, at the table's foot), the same form
uniform vec4 uClubWoodKeyD[ 8 ];  // its two side blades (2 i and 2 i + 1: vertical planes past the two legs of its side), the same form
uniform vec4 uClubWoodKeyN;       // how many of them; on (0..1); a factor on the key's source size in its shadow's edge (1 = the record's); half width of the edge at the casting edge (m)
uniform vec4 uClubWoodKeyW;       // per side of the table (+x, -x, +z, -z): the keys' share of that side's direct light in the room's number (taken out of it)
`;
export const WOOD_FN_KEY = /* glsl */`
#ifndef CLUB_WOOD_FN_KEY
#define CLUB_WOOD_FN_KEY
vec3 clubWoodKeyE( int i, vec3 P, vec3 N, out vec3 L, out float soft ) {
  vec4 kp = uClubWoodKeyP[ i ], kc = uClubWoodKeyC[ i ], ka = uClubWoodKeyA[ i ];
  vec3 l = kp.xyz - P;
  float d2 = dot( l, l );
  L = l * inversesqrt( max( d2, 1e-8 ) );
  soft = sqrt( kc.w / max( d2, 1e-8 ) );   // the source's size over its distance: the edge of its shadow grows by this per metre of path
  float w = d2 / ( kp.w * kp.w );
  if ( w >= 1.0 ) return vec3( 0.0 );
  w = 1.0 - w * w; w *= w;
  float ca = - dot( L, ka.xyz ), emit = 1.0;
  if ( ka.w > 1.5 ) {
    float c = ka.w > 3.5 ? ka.w - 4.0 : ka.w - 2.0;
    emit = smoothstep( c, mix( c, 1.0, ka.w > 3.5 ? 1.0 : 0.64 ), ca );   // (0.64 = wood/layout.js KEY_CONE_BEAM = room/light.js CONE.beam; the node arm pins the three)
  } else if ( ka.w > 0.0 ) emit = ( 1.0 - ka.w ) + ka.w * 2.4 * ca * ca * ( ca > 0.0 ? 1.0 : 0.55 );
  vec4 ks = uClubWoodKeyS[ i ], kf = uClubWoodKeyF[ i ];
  if ( ks.w > 0.5 ) emit *= smoothstep( -0.0105, 0.0105, - dot( L, ks.xyz ) );   // (0.0105 = wood/layout.js KEY_SHUTTER_SOFT = the bake's SHUTTER_SOFT)
  if ( kf.w > 0.5 ) emit *= smoothstep( -0.08, 0.08, - dot( L, kf.xyz ) );       // (0.08 = wood/layout.js KEY_FOOT_SOFT = the bake's SHUTTER_SOFT_FOOT)
  vec4 kd0 = uClubWoodKeyD[ 2 * i ], kd1 = uClubWoodKeyD[ 2 * i + 1 ];
  if ( kd0.w > 0.5 ) emit *= smoothstep( -0.02, 0.02, - dot( L, kd0.xyz ) );     // (0.02 = wood/layout.js KEY_SIDE_SOFT = the bake's SHUTTER_SOFT_SIDE)
  if ( kd1.w > 0.5 ) emit *= smoothstep( -0.02, 0.02, - dot( L, kd1.xyz ) );
  return kc.rgb * ( emit * w * max( dot( N, L ), 0.0 ) / ( d2 + kc.w ) );
}
float clubWoodKeyShade( vec3 P, vec3 L, float soft ) {
  vec2 pc = P.xz - uClubWoodRoom.xy;
  vec2 dh = mix( min( L.xz, vec2( -1e-5 ) ), max( L.xz, vec2( 1e-5 ) ), step( vec2( 0.0 ), L.xz ) );
  float below = step( P.y, uClubWoodBody.w );
  vec2 half2 = uClubWoodBand.zw - uClubWoodRing.w * below;
  vec2 te = ( sign( dh ) * half2 - pc ) / dh;
  float t = max( min( te.x, te.y ), 0.0 );
  float e = uClubWoodKeyN.w + uClubWoodKeyN.z * soft * t;
  return 1.0 - smoothstep( - e, e, P.y + L.y * t - mix( uClubWoodTop.x - 0.045, uClubWoodBody.w, below ) );
}
#endif
`;

// ---- wood (rail cap and body): after <map_fragment> ---------------------------------------------------------------------------
// Mapping. Rail cap (kind 0): the fragment belongs to the long rail or the end rail whichever band it is further into
// (the mitre rule), the grain runs along that rail, and the across coordinate starts at the cap's inner edge and goes outward
// over the top and on down the outer face, so the figure wraps the edge (and a strip of the scan 0.3 m wide is all a rail
// ever reads). Body (kind 1): by the face's dominant axis; grain level on panels, upright on legs.
// The scan is sampled with analytic gradients, so a change of region is not a mip seam.
// Round A4, `own` (the third hall model only; without it the text is what it was): the app's colour and its own map stay
// the albedo, at full resolution; the figure the lobe follows is that map's value against its own low-passed tone.
const OWN_ALBEDO = /* glsl */`  #ifdef USE_MAP
    clubWoodFig = clamp( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( dot( diffuse * cwTint, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-6 ), 0.2, 3.0 );
  #endif
  diffuseColor.rgb *= mix( 1.0, uClubWoodBase.x, uClubWoodSw.x * uClubWoodSw.z );`;
export function woodAlbedo({ map = true, own = false } = {}) {
  return /* glsl */`
{
  vec3 cwP = vClubWoodPos;
  vec3 cwDx = dFdx( cwP ), cwDy = dFdy( cwP );
  vec3 cwC = cross( cwDx, cwDy );
  float cwL = length( cwC );
  vec3 cwFN = cwL > 1e-16 ? cwC / cwL : vec3( 0.0, 1.0, 0.0 );   // world face normal, toward the viewer
  vec2 cwQ = cwP.xz - uClubWoodRoom.xy;
  vec2 cwSg = vec2( cwQ.x < 0.0 ? -1.0 : 1.0, cwQ.y < 0.0 ? -1.0 : 1.0 );
  vec3 cwA, cwX;   // along the grain, across it
  float cwId;
  float cwOff = 0.0;
  if ( uClubWoodMode.y < 0.5 ) {
    vec2 cwIn = abs( cwQ ) - uClubWoodBand.xy;
    bool cwLong = cwIn.y > cwIn.x;
    cwA = cwLong ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 0.0, 1.0 );
    cwX = ( cwLong ? vec3( 0.0, 0.0, cwSg.y ) : vec3( cwSg.x, 0.0, 0.0 ) ) - vec3( 0.0, 1.0, 0.0 );
    cwId = cwLong ? ( cwSg.y > 0.0 ? 0.0 : 1.0 ) : ( cwSg.x > 0.0 ? 2.0 : 3.0 );
    cwOff = ( cwLong ? uClubWoodBand.y + uClubWoodRoom.y * cwSg.y : uClubWoodBand.x + uClubWoodRoom.x * cwSg.x ) - uClubWoodTop.x;
  } else {
    vec3 cwAb = abs( cwFN );
    if ( uClubWoodMode.w > 0.5 ) { cwA = vec3( 0.0, 1.0, 0.0 ); cwX = cwAb.z > cwAb.x ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 0.0, 1.0 ); cwId = 4.0; }
    else if ( cwAb.y > 0.7 ) { cwA = vec3( 1.0, 0.0, 0.0 ); cwX = vec3( 0.0, 0.0, 1.0 ); cwId = 5.0; }
    else if ( cwAb.z > cwAb.x ) { cwA = vec3( 1.0, 0.0, 0.0 ); cwX = vec3( 0.0, -1.0, 0.0 ); cwId = cwSg.y > 0.0 ? 6.0 : 7.0; }
    else { cwA = vec3( 0.0, 0.0, 1.0 ); cwX = vec3( 0.0, -1.0, 0.0 ); cwId = cwSg.x > 0.0 ? 8.0 : 9.0; }
  }
  clubWoodAx = cwA;
  clubWoodSC = vec2( dot( cwA, cwP ), dot( cwX, cwP ) - cwOff );
  vec2 cwSCx = vec2( dot( cwA, cwDx ), dot( cwX, cwDx ) ), cwSCy = vec2( dot( cwA, cwDy ), dot( cwX, cwDy ) );
  clubWoodFoot = length( vec2( cwSCx.y, cwSCy.y ) );
  bool cwV = uClubWoodGrain.z > 0.5;
  clubWoodTu = cwV ? cwX : cwA;
  clubWoodTv = cwV ? cwA : cwX;
  vec2 cwUv = ( cwV ? clubWoodSC.yx : clubWoodSC.xy ) / uClubWoodGrain.xy + uClubWoodPlace.xy * cwId + uClubWoodPlace.zw;
  vec2 cwUvx = ( cwV ? cwSCx.yx : cwSCx.xy ) / uClubWoodGrain.xy, cwUvy = ( cwV ? cwSCy.yx : cwSCy.xy ) / uClubWoodGrain.xy;
  vec3 cwRel = vec3( 1.0 );
${map ? `  vec3 cwCol = textureGrad( uClubWoodMap, cwUv, cwUvx, cwUvy ).rgb;
  const vec3 cwLuma = vec3( 0.2126, 0.7152, 0.0722 );
  clubWoodFig = clamp( dot( cwCol, cwLuma ) / max( dot( uClubWoodTone.rgb, cwLuma ), 1e-4 ), 0.2, 3.0 );
  // the scan's hue against its mean, held near its value figure: a channel whose mean is near zero (the blue of a red
  // veneer) is mostly file noise, and its ratio must not swing the hue
  vec3 cwHue = clamp( cwCol / max( uClubWoodTone.rgb, vec3( 2e-3 ) ) / clubWoodFig, 0.6, 1.6 );
  cwRel = mix( vec3( clubWoodFig ), clubWoodFig * cwHue, uClubWoodMode.x );
  cwRel = mix( vec3( 1.0 ), cwRel, uClubWoodTone.a );` : ''}
  #ifdef USE_NORMALMAP_TANGENTSPACE
    if ( uClubWoodGrain.w > 0.0 ) clubWoodTs = textureGrad( normalMap, cwUv, cwUvx, cwUvy ).xyz * 2.0 - 1.0;
  #endif
  // open pores: slits along the grain in two sizes (about 0.5 mm x 11 mm and 0.25 mm x 4.5 mm), more of them where the
  // figure is dark (the early wood). Each size is drawn only while a pixel is smaller than its slits, across the grain and
  // along it; past that only their mean is left, which still follows the figure (bands of less gloss along the grain)
  if ( uClubWoodPore.y > 1e-4 ) {
    float cwFootA = length( vec2( cwSCx.x, cwSCy.x ) );
    float cwV1 = clamp( 1.7 - clubWoodFoot * 2200.0, 0.0, 1.0 ) * clamp( 1.7 - cwFootA * 140.0, 0.0, 1.0 );
    float cwV2 = clamp( 1.7 - clubWoodFoot * 4800.0, 0.0, 1.0 ) * clamp( 1.7 - cwFootA * 330.0, 0.0, 1.0 );
    float cwTh = 1.0 - uClubWoodPore.y * clamp( 1.6 - 0.6 * clubWoodFig, 0.5, 1.6 );
    float cwP1 = smoothstep( cwTh, cwTh + 0.1, clubWoodNoise( vec2( clubWoodSC.x * 90.0, clubWoodSC.y * 1800.0 ) + cwId * 7.3 ) );
    float cwP2 = smoothstep( cwTh + 0.03, cwTh + 0.15, clubWoodNoise( vec2( clubWoodSC.x * 220.0 + 3.7, clubWoodSC.y * 4000.0 ) + cwId * 3.1 ) );
    clubWoodPore = mix( 0.5 * ( 1.0 - cwTh ), max( cwP1, 0.7 * cwP2 * cwV2 ), cwV1 ) * uClubWoodSw.z;
  }
  // the app's own map, low-passed: the style's tone without its coarse grain
  vec3 cwTint = vec3( 1.0 );
  #ifdef USE_MAP
    cwTint = texture2D( map, vMapUv, 6.0 ).rgb;
  #endif
${own ? OWN_ALBEDO : '  diffuseColor.rgb = mix( diffuseColor.rgb, diffuse * cwTint * cwRel * ( uClubWoodBase.x * ( 1.0 - uClubWoodPore.z * clubWoodPore ) ), uClubWoodSw.x * uClubWoodSw.z );'}
}`;
}

// ---- wood: after <normal_fragment_maps> ----------------------------------------------------------------------------------------
// Edges of the rail cap. A round-over of radius r seen on the two flat faces that meet at the edge: on the top face the slope
// toward the outside grows from 0 at r to 1 (45 degrees) at the edge, on the outer face the slope toward the top does the
// same, so the two meet. A face that already slopes more (a crowned cap, a modelled bevel) keeps its own normal.
export const WOOD_NORMAL = /* glsl */`
{
  vec3 cwG = normalize( inverseTransformDirection( nonPerturbedNormal, viewMatrix ) );
  vec3 cwN = cwG;
  if ( uClubWoodMode.y < 0.5 && uClubWoodSw.y > 0.0 ) {
    vec2 cwQ = vClubWoodPos.xz - uClubWoodRoom.xy;
    vec2 cwSg = vec2( cwQ.x < 0.0 ? -1.0 : 1.0, cwQ.y < 0.0 ? -1.0 : 1.0 );
    vec2 cwIn = abs( cwQ ) - uClubWoodBand.xy, cwOut = uClubWoodBand.zw - abs( cwQ );
    float cwUp = cwG.y;
    float cwTopW = smoothstep( 0.45, 0.85, cwUp ) * uClubWoodSw.y;
    // Every edge profile below is read as its MEAN over the pixel's footprint across the edge (a box 1.7 pixels wide: the
    // variance of a Gaussian of half a pixel), and the profile's variance inside that footprint widens the lobes
    // (clubWoodVar). The distances are linear in the world position, so their screen derivatives are the same in every
    // pixel of a face. Tools (uClubWoodSw2.w = 2): the point sample of round 2
    float cwWin = uClubWoodSw2.w > 1.5 ? 0.0 : 1.7;
    // outer edge
    bool cwOx = cwOut.x < cwOut.y;
    vec3 cwOd = cwOx ? vec3( cwSg.x, 0.0, 0.0 ) : vec3( 0.0, 0.0, cwSg.y );
    float cwDo = cwOx ? cwOut.x : cwOut.y;
    vec2 cwT = clubWoodRamp( cwDo, cwWin * length( vec2( dFdx( cwDo ), dFdy( cwDo ) ) ), uClubWoodTop.y, 2.0 );
    float cwHave = dot( cwG, cwOd );
    float cwTo = max( cwT.x * cwUp - max( cwHave, 0.0 ), 0.0 ) * cwTopW;
    cwN += cwOd * cwTo;
    clubWoodVar += 2.0 * cwT.y * cwTopW * step( 1e-5, cwTo ) / pow2( 1.0 + cwTo * cwTo );
    // the outer face under that edge
    float cwH = uClubWoodTop.x - vClubWoodPos.y;
    vec2 cwS = clubWoodRamp( cwH, cwWin * length( vec2( dFdx( cwH ), dFdy( cwH ) ) ), uClubWoodTop.y, 2.0 );
    float cwSideW = ( 1.0 - smoothstep( 0.15, 0.45, cwUp ) ) * step( cwDo, 0.006 ) * step( 0.0, cwHave ) * uClubWoodSw.y;
    float cwSf = max( cwS.x * cwHave - cwUp, 0.0 ) * cwSideW;
    cwN.y += cwSf;
    clubWoodVar += 2.0 * cwS.y * cwSideW * step( 1e-5, cwSf ) / pow2( 1.0 + cwSf * cwSf );
    // inner edge (where the wood meets the cushion cloth): an eased edge whose slope grows linearly to uClubWoodBase.w at the
    // edge. It has to roll past about 60 degrees: from every play view the far rails mirror the lamp only on the part of
    // this edge that leans 40 to 62 degrees toward the table (layout.js lampRollRange), and that thin line is the gloss cue
    bool cwIx = cwIn.x > cwIn.y;
    vec3 cwId2 = cwIx ? vec3( - cwSg.x, 0.0, 0.0 ) : vec3( 0.0, 0.0, - cwSg.y );
    float cwDi = cwIx ? cwIn.x : cwIn.y;
    vec2 cwR = clubWoodRamp( max( cwDi, 0.0 ), cwWin * length( vec2( dFdx( cwDi ), dFdy( cwDi ) ) ), uClubWoodTop.z, 1.0 );
    float cwU = cwR.x * step( -0.004, cwDi ) * uClubWoodBase.w;
    // (against max( lean, 0 ): a cap that is crowned toward the outside leans away from this edge over its whole width, and
    // raising that negative lean to zero would flatten the crown everywhere, not only at the edge)
    float cwUi = max( cwU * cwUp - max( dot( cwG, cwId2 ), 0.0 ), 0.0 ) * cwTopW;
    cwN += cwId2 * cwUi;
    clubWoodVar += 2.0 * cwR.y * uClubWoodBase.w * uClubWoodBase.w * cwTopW * step( 1e-5, cwUi ) / pow2( 1.0 + cwUi * cwUi );
    cwN = normalize( cwN );
  }
  // the scan's relief, in the frame the scan was mapped in
  vec3 cwTu = normalize( clubWoodTu - cwN * dot( clubWoodTu, cwN ) + vec3( 1e-5, 2e-5, 3e-5 ) );
  vec3 cwTv = normalize( clubWoodTv - cwN * dot( clubWoodTv, cwN ) + vec3( 3e-5, 1e-5, 2e-5 ) );
  vec3 cwRelief = ( cwTu * clubWoodTs.x + cwTv * clubWoodTs.y ) * ( uClubWoodGrain.w * uClubWoodSw.z );
  vec3 cwAlong = uClubWoodGrain.z > 0.5 ? cwTv : cwTu;
  vec3 cwAcross = uClubWoodGrain.z > 0.5 ? cwTu : cwTv;
  // the coat is never optically flat: a slow waviness (drawn out along the grain, 6 cm by 2 cm), so the edges of the lamp's
  // image in it are not ruled. Gone where a pixel is wider than a wave (the anti-aliasing takes over)
  vec2 cwWp = clubWoodSC * vec2( 17.0, 48.0 );
  float cwWv = clamp( 1.4 - clubWoodFoot * 110.0, 0.0, 1.0 ) * uClubWoodHaze.z * uClubWoodSw.w;
  vec2 cwWave = vec2( 0.0 );
  if ( cwWv > 0.0 ) {
    cwWave = vec2( clubWoodNoise( cwWp + vec2( 0.4, 0.0 ) ) - clubWoodNoise( cwWp - vec2( 0.4, 0.0 ) ),
                   clubWoodNoise( cwWp + vec2( 0.0, 0.4 ) ) - clubWoodNoise( cwWp - vec2( 0.0, 0.4 ) ) ) * ( 2.5 * cwWv );
  }
  vec3 cwBase = normalize( cwN + cwRelief );
  vec3 cwCoat = normalize( cwN + cwRelief * uClubWoodCoat.z + cwAlong * cwWave.x + cwAcross * cwWave.y );
  // A bent normal must still face the eye. The round-over of an edge on the far side of the table leans away from the
  // camera by up to 45 degrees on a face seen at 20: its shading normal looked away, the lobes were evaluated at a
  // cosine of zero with a mirror direction inside the wood, and single pixels along those edges came out white (the
  // broken white line of round 2's wide views; two pixels at 253 on the foot rail of the standing view before this
  // line). Such a normal is turned back until it is 5 degrees inside the horizon: the part of a roll that cannot be seen
  // shades like the last part that can.
  vec3 cwEye = normalize( vViewPosition );
  vec3 cwCv = normalize( ( viewMatrix * vec4( cwCoat, 0.0 ) ).xyz );
  cwCv = normalize( cwCv + cwEye * max( 0.09 - dot( cwCv, cwEye ), 0.0 ) );
  vec3 cwBv = normalize( ( viewMatrix * vec4( cwBase, 0.0 ) ).xyz );
  cwBv = normalize( cwBv + cwEye * max( 0.09 - dot( cwBv, cwEye ), 0.0 ) );
  clubWoodCN = mix( normalize( ( viewMatrix * vec4( cwCoat, 0.0 ) ).xyz ), cwCv, step( uClubWoodSw2.w, 1.5 ) );
  normal = normalize( mix( normal, mix( normalize( ( viewMatrix * vec4( cwBase, 0.0 ) ).xyz ), cwBv, step( uClubWoodSw2.w, 1.5 ) ), uClubWoodSw.x ) );
}`;

// ---- wood and sights: after <lights_physical_fragment> ---------------------------------------------------------------------------
export const WOOD_ROUGHNESS = /* glsl */`
{
  // micro-roughness: a slow drift along the grain (handling, wiping) and a finer one; open pores are a little rougher
  float cwDrift = clubWoodNoise( clubWoodSC * vec2( 7.0, 31.0 ) ) - 0.5 + 0.5 * ( clubWoodNoise( clubWoodSC * vec2( 23.0, 140.0 ) + 5.7 ) - 0.5 );
  float cwR = uClubWoodCoat.y * ( 1.0 + uClubWoodCoat.w * ( 1.6 * cwDrift + 0.5 * ( 1.0 - clubWoodFig ) ) );
  clubWoodCR0 = clamp( cwR, 0.045, 1.0 );
  clubWoodCR = clubWoodAA( clubWoodCR0, clubWoodCN );
  clubWoodHR = clubWoodAA( clamp( uClubWoodHaze.x, 0.045, 1.0 ), clubWoodCN );
  // handling marks: where hands and cloths pass, the film scatters more (patches a hand wide, drawn out along the rail)
  float cwSm = clubWoodNoise( clubWoodSC * vec2( 3.1, 17.0 ) + 11.3 ) + 0.5 * clubWoodNoise( clubWoodSC * vec2( 9.0, 44.0 ) + 2.9 );
  clubWoodHzK = 1.0 + uClubWoodHaze.w * ( cwSm / 0.75 - 1.0 );
  // the scratch fan in streaks: two families of lines along the grain, each gone where a pixel is wider than its lines
  float cwS1 = clubWoodNoise( vec2( clubWoodSC.x * 2.3, clubWoodSC.y * 130.0 ) + 4.1 );
  float cwS2 = clubWoodNoise( vec2( clubWoodSC.x * 5.1 + 3.0, clubWoodSC.y * 520.0 ) );
  float cwV1 = clamp( 1.5 - clubWoodFoot * 130.0, 0.0, 1.0 ), cwV2 = clamp( 1.5 - clubWoodFoot * 520.0, 0.0, 1.0 );
  clubWoodBrK = 1.0 + uClubWoodScr.w * ( 1.3 * ( cwS1 - 0.5 ) * cwV1 + 1.1 * ( cwS2 - 0.5 ) * cwV2 );
  material.roughness = mix( material.roughness, clubWoodAA( material.roughness, normal ), uClubWoodSw.x );
  // the matting agent of a satin coat also returns a little of the light in every direction: a pedestal under the lobes,
  // which is what keeps a satin black from being a hole wherever no lobe reaches (uClubWoodFill.a, per finish). On a rail
  // cap it rides the material's own diffuse term (the lamp lights the cap). On a body part it is applied to the room's
  // light only (the coat block): the app's own indirect terms on the body come from a cube and a bake taken over the cloth,
  // which a skirt never sees, and they are calibrated for the app's near-zero body albedo
  material.diffuseColor += vec3( uClubWoodFill.a * uClubWoodSw.x * ( 1.0 - step( 0.5, uClubWoodMode.y ) ) );
  #ifdef USE_CLEARCOAT
    material.clearcoat *= 1.0 - uClubWoodSw.x;   // the coat below replaces three's (which has no area-light term)
  #endif
}`;

// ---- wood and sights: the coat ---------------------------------------------------------------------------------------------------
// Variant 'rail': in front of the app's shadow-rail line, inside its block, so the lamp term is shadowed and the room term
// occluded by the lines that follow (the app's ball shadows and the occlusion service's visibility ride those rails).
// Variant 'plain': after <lights_fragment_end> on a material the app did not inject.
export const WOOD_RAIL_LINE = 'reflectedLight.directDiffuse *= spikeShadow;';
export const WOOD_PLAIN_ANCHOR = '#include <lights_fragment_end>';
// Round A2 (CONTRACT.md section 14): the body block of the coat has two forms. COAT_BODY_ROOM is the club room's (the text
// of rounds 2 to 4, unchanged: WOOD_COAT below is the same string as before). COAT_BODY_HALL is the arena's: the table
// stands in a hall under hard light from a rig of heads hung steeply above its own sides, on a matt carpet those heads
// light. What differs:
//   - the heads past the overhang. A room's light comes from all around, so an overhang takes a share of the upper half
//     (the soft form above). A head's light comes from one steep direction: under the rail the skirt has a shadow with an
//     edge, and what stands behind the skirt (a leg set in from the outline, the inner cabinet) is in the skirt's shadow
//     as far down as the overhang reaches at that elevation: reach = overhang x tan(elevation), a penumbra from 0.6 to 1.5
//     of it because the heads along a side stand at different elevations. uClubWoodHall.x = that tangent, read from the
//     room (its light on the floor beside the table over its light on the table's sides). A face that looks under the
//     table sees no head;
//   - the hall's own diffuse light (uClubWoodHall.y of the face's light: the lit carpet, the boards, the seats) keeps the
//     soft form, so a shadowed leg is dark and not black;
//   - the foot on the carpet: a short contact darkening (uClubWoodHall.z over the lowest uClubWoodHall.w metres) in place
//     of the room form's 30 cm fall toward a dark floor: the carpet beside a leg is lit;
//   - the carpet's light coming back up is the heads' light on it (uClubWoodFloorR) as well as the main lamp's spill, and
//     it takes the soft form only (an overhang's hard shadow is not in the floor's light);
//   - an upward face of a body part (a stretcher, a foot plate) is shaded by how far it lies inside the outline.
const COAT_BODY_ROOM = /* glsl */`    vec2 cwBq = vClubWoodPos.xz - uClubWoodRoom.xy;
    vec2 cwBs = vec2( cwBq.x < 0.0 ? -1.0 : 1.0, cwBq.y < 0.0 ? -1.0 : 1.0 );
    float cwBh = max( vClubWoodPos.y - uClubWoodTop.w, 0.0 );                                 // height over the floor
    vec2 cwBn = abs( cwNw.xz );
    // how far the face stands inside the table's outline, along its own normal: the overhang above it
    float cwBi = max( dot( uClubWoodBand.zw - abs( cwBq ), cwBn ) / max( cwBn.x + cwBn.y, 1e-3 ), 0.0 );
    // depth under that overhang's lower edge: the rail for the skirt itself, the skirt's lower edge for what stands behind it
    float cwBd = max( mix( uClubWoodTop.x - 0.045, uClubWoodBody.w, smoothstep( 0.01, 0.03, cwBi ) ) - vClubWoodPos.y, 0.0 );
    float cwUpVis = cwBd / sqrt( cwBd * cwBd + cwBi * cwBi + 1e-6 );                          // share of the upper half it still sees
    float cwOutward = cwNw.x * cwBn.x * cwBs.x + cwNw.z * cwBn.y * cwBs.y;                    // 1 looks away from the table's middle, -1 under it
    float cwOcc = mix( 0.3, 1.0, cwUpVis ) * mix( 0.2, 1.0, smoothstep( -0.4, 0.3, cwOutward ) ) * mix( 0.35, 1.0, smoothstep( 0.0, 0.3, cwBh ) );
    cwOcc = mix( 1.0, cwOcc, uClubWoodBody.y );
    // the lamp's spill off the floor: the floor point this face sees 45 degrees down along its normal, times the floor's
    // share of the face's hemisphere (half of it for a wall). Higher up the face that point lies further out, in the light
    vec3 cwBounce = clubWoodFloorLamp( vClubWoodPos.xz + cwNw.xz * cwBh ) * ( 0.25 * ( 1.0 - cwNw.y ) * uClubWoodBody.z );
    vec3 cwBody = ( cwE * uClubWoodBody.x + cwBounce ) * cwOcc + uClubWoodFill.rgb * ( 0.65 + 0.35 * cwNw.y );
    reflectedLight.indirectDiffuse += cwBody * ( material.diffuseColor + uClubWoodFill.a ) * cwOn;
    cwRoom *= mix( 1.0, cwOcc, 0.7 );`;
const COAT_BODY_HALL = /* glsl */`    vec2 cwBq = vClubWoodPos.xz - uClubWoodRoom.xy;
    vec2 cwBs = vec2( cwBq.x < 0.0 ? -1.0 : 1.0, cwBq.y < 0.0 ? -1.0 : 1.0 );
    float cwBh = max( vClubWoodPos.y - uClubWoodTop.w, 0.0 );                                 // height over the floor
    vec2 cwBn = abs( cwNw.xz );
    // how far the face stands inside the table's outline: along its own normal (a wall), by the nearer side (a face that looks up)
    vec2 cwBin = uClubWoodBand.zw - abs( cwBq );
    float cwBi = max( mix( dot( cwBin, cwBn ) / max( cwBn.x + cwBn.y, 1e-3 ), min( cwBin.x, cwBin.y ), cwN2.y ), 0.0 );
    // depth under that overhang's lower edge: the rail for the skirt itself, the skirt's lower edge for what stands behind it
    float cwBd = max( mix( uClubWoodTop.x - 0.045, uClubWoodBody.w, smoothstep( 0.01, 0.03, cwBi ) ) - vClubWoodPos.y, 0.0 );
    float cwUpVis = cwBd / sqrt( cwBd * cwBd + cwBi * cwBi + 1e-6 );                          // share of the upper half it still sees
    float cwOutward = cwNw.x * cwBn.x * cwBs.x + cwNw.z * cwBn.y * cwBs.y;                    // 1 looks away from the table's middle, -1 under it
    float cwOpen = mix( smoothstep( -0.4, 0.3, cwOutward ), 1.0, cwN2.y * step( 0.0, cwNw.y ) );
    // the heads: hard light from steeply above, past the overhang (see the note above this text)
    float cwReach = cwBi * uClubWoodHall.x;
    float cwSun = smoothstep( 0.6 * cwReach, 1.5 * cwReach + 0.01, cwBd + 0.004 ) * cwOpen;
    float cwFoot = mix( uClubWoodHall.z, 1.0, smoothstep( 0.0, max( uClubWoodHall.w, 1e-3 ), cwBh ) );
    // the hall's diffuse light: the soft form
    float cwSoft = mix( 0.3, 1.0, cwUpVis ) * mix( 0.25, 1.0, cwOpen ) * cwFoot;
    float cwOcc = mix( cwSun * cwFoot, cwSoft, clamp( uClubWoodHall.y, 0.0, 1.0 ) );
    cwOcc = mix( 1.0, cwOcc, uClubWoodBody.y );
    cwSoft = mix( 1.0, cwSoft, uClubWoodBody.y );
    // the carpet's light coming back up: the floor point this face sees 45 degrees down along its normal, lit by the main
    // lamp's spill and by the heads, times the floor's share of the face's hemisphere
    vec2 cwFq = vClubWoodPos.xz + cwNw.xz * cwBh;
    vec3 cwBounce = ( clubWoodFloorLamp( cwFq ) + clubWoodFloorRoom( cwFq ) ) * ( 0.25 * ( 1.0 - cwNw.y ) * uClubWoodBody.z );
    vec3 cwBody = cwE * ( uClubWoodBody.x * cwOcc ) + cwBounce * cwSoft + uClubWoodFill.rgb * ( 0.65 + 0.35 * cwNw.y );
    reflectedLight.indirectDiffuse += cwBody * ( material.diffuseColor + uClubWoodFill.a ) * cwOn;
    cwRoom *= mix( 1.0, cwSoft, 0.7 );`;
// Round A3 (CONTRACT.md section 15): the second hall body. What differs from COAT_BODY_HALL (wood/layout.js HALL_BODY2
// has the reasons and the arithmetic):
//   - the coat's image of the room is not touched here: the coat block reads it through clubWoodHallRad (coatText's
//     second argument), which answers per ray (the floor as the room holds it, the boards, the underside of the top);
//   - the heads' hard light is the face's light WITHOUT its bounce share (uClubWoodHall.y, set from the room's numbers:
//     the room's light volume holds the carpet's bounce as a face mean) and never reaches a face that looks down;
//   - the carpet's light coming back up is read per fragment from the same floor the coat mirrors: the floor point the
//     face looks at, over a wide footprint, times the floor's share of the face's hemisphere (half for a wall, all of
//     it for a face that looks down). Under the table that floor is dark, beside it lit: the underside of the cabinet
//     and the inner faces of the legs are dim, not black, and need no factor of their own.
const COAT_BODY_HALL2 = /* glsl */`    vec2 cwBq = vClubWoodPos.xz - uClubWoodRoom.xy;
    vec2 cwBs = vec2( cwBq.x < 0.0 ? -1.0 : 1.0, cwBq.y < 0.0 ? -1.0 : 1.0 );
    float cwBh = max( vClubWoodPos.y - uClubWoodTop.w, 0.0 );                                 // height over the floor
    vec2 cwBn = abs( cwNw.xz );
    float cwUpF = cwN2.y * step( 0.0, cwNw.y ), cwDnF = cwN2.y * step( cwNw.y, 0.0 );         // a face that looks up, down
    // how far the face stands inside the table's outline: along its own normal (a wall), by the nearer side (a level face)
    vec2 cwBin = uClubWoodBand.zw - abs( cwBq );
    float cwBi = max( mix( dot( cwBin, cwBn ) / max( cwBn.x + cwBn.y, 1e-3 ), min( cwBin.x, cwBin.y ), cwN2.y ), 0.0 );
    // depth under that overhang's lower edge: the rail for the skirt itself, the skirt's lower edge for what stands behind it
    float cwBd = max( mix( uClubWoodTop.x - 0.045, uClubWoodBody.w, smoothstep( 0.01, 0.03, cwBi ) ) - vClubWoodPos.y, 0.0 );
    float cwOutward = cwNw.x * cwBn.x * cwBs.x + cwNw.z * cwBn.y * cwBs.y;                    // 1 looks away from the table's middle, -1 under it
    float cwOpen = mix( smoothstep( -0.4, 0.3, cwOutward ), 1.0, cwUpF );
    // the heads and the keys: hard light past the overhang. Two lights reach each side of the table, a steep one (the
    // heads over the rim) and a low one (a key from a far truss), and each casts the overhang's shadow by its own
    // elevation: reach = overhang x tangent. A level face takes the steep light's mean. A short contact at the foot
    vec4 cwSd = vec4( max( cwNw.x, 0.0 ), max( - cwNw.x, 0.0 ), max( cwNw.z, 0.0 ), max( - cwNw.z, 0.0 ) );
    cwSd /= max( cwSd.x + cwSd.y + cwSd.z + cwSd.w, 1e-3 );
    float cwRh = cwBi * mix( dot( cwSd, uClubWoodHallT ), uClubWoodHall.x, cwN2.y );
    float cwRk = cwBi * dot( cwSd, uClubWoodHallK );
    float cwSun = mix( smoothstep( 0.6 * cwRh, 1.5 * cwRh + 0.01, cwBd + 0.004 ), smoothstep( 0.6 * cwRk, 1.5 * cwRk + 0.01, cwBd + 0.004 ),
      dot( cwSd, uClubWoodHallW ) * ( 1.0 - cwN2.y ) ) * cwOpen * ( 1.0 - cwDnF );
    cwSun *= mix( uClubWoodHall.z, 1.0, smoothstep( 0.0, max( uClubWoodHall.w, 1e-3 ), cwBh ) );
    cwSun = mix( 1.0, cwSun, uClubWoodBody.y );
    // the carpet's light coming back up
    vec2 cwFq = vClubWoodPos.xz + cwNw.xz * max( cwBh, 0.12 );
    vec3 cwBounce = clubWoodHallFloor( cwFq, 0.25 + 1.5 * cwBh ) * ( 0.5 * ( 1.0 - cwNw.y ) * uClubWoodBody.z );
    vec3 cwBody = cwE * ( uClubWoodBody.x * ( 1.0 - uClubWoodHall.y ) * cwSun ) + cwBounce + uClubWoodFill.rgb * ( 0.65 + 0.35 * cwNw.y );
    reflectedLight.indirectDiffuse += cwBody * ( material.diffuseColor + uClubWoodFill.a ) * cwOn;`;
// Round A4 (CONTRACT.md 16.3): the third hall body, the table BY ITS OWN MATERIAL (wood/layout.js HALL_OWN). The
// geometry of the table's own shade is round A3's (the overhang's shadow per light, the contact at the carpet, the
// carpet's light coming back up from the floor map). What differs:
//   - the matt part is the hall's light on the material's own albedo (uClubWoodFill.a is 0 for this finish: no pedestal);
//   - the "coat" of this block is the material's own lobe at its own roughness (uClubWoodCoat.y), read through
//     clubWoodOwnRad (coatText's second argument), and it takes the hall's lights too: per side of the table the steep
//     light and the low one, as two directions in the face's own vertical plane at the elevations the room's numbers
//     give (uClubWoodHallT, uClubWoodHallK), each with its own overhang shadow, through clubWoodOwnLobe;
//   - the contact at the carpet is laid on the lobe's view of the hall as well (the map's texels are wider than a foot);
//   - there is no lamp term (coatText's third argument): the table's lamp is behind every outward face of the body and
//     above the table's top for every other one, and a lobe this wide would let it through the top.
const COAT_BODY_HALL3 = /* glsl */`    vec2 cwBq = vClubWoodPos.xz - uClubWoodRoom.xy;
    vec2 cwBs = vec2( cwBq.x < 0.0 ? -1.0 : 1.0, cwBq.y < 0.0 ? -1.0 : 1.0 );
    float cwBh = max( vClubWoodPos.y - uClubWoodTop.w, 0.0 );                                 // height over the floor
    vec2 cwBn = abs( cwNw.xz );
    float cwUpF = cwN2.y * step( 0.0, cwNw.y ), cwDnF = cwN2.y * step( cwNw.y, 0.0 );         // a face that looks up, down
    // how far the face stands inside the table's outline: along its own normal (a wall), by the nearer side (a level face)
    vec2 cwBin = uClubWoodBand.zw - abs( cwBq );
    float cwBi = max( mix( dot( cwBin, cwBn ) / max( cwBn.x + cwBn.y, 1e-3 ), min( cwBin.x, cwBin.y ), cwN2.y ), 0.0 );
    // the table's own overhangs (wood/layout.js ownShade is this rule in JS). Two edges can hide a light: the rail's
    // underside for every point (cwDr under it; reach = inset x tangent), and the skirt's lower edge for what hangs BELOW
    // it (cwDs under it; reach = how far the point stands inside the skirt's own foot, uClubWoodRing.w, x tangent). A
    // point is below the skirt when it is below its lower edge, not when it stands 3 cm inside the outline (round A3's
    // test: the default table's skirt is a slanted blind, and most of it counted as standing behind itself)
    float cwDr = max( uClubWoodTop.x - 0.045 - vClubWoodPos.y, 0.0 );
    float cwDs = uClubWoodBody.w - vClubWoodPos.y;
    float cwIs = max( cwBi - uClubWoodRing.w, 0.0 );
    float cwBelow = step( 0.0, cwDs );
    float cwOutward = cwNw.x * cwBn.x * cwBs.x + cwNw.z * cwBn.y * cwBs.y;                    // 1 looks away from the table's middle, -1 under it
    float cwOpen = mix( smoothstep( -0.4, 0.3, cwOutward ), 1.0, cwUpF );
    // two lights per side of the table (a steep one, a low one), each with the overhangs' shadow by its own elevation
    vec4 cwSd = vec4( max( cwNw.x, 0.0 ), max( - cwNw.x, 0.0 ), max( cwNw.z, 0.0 ), max( - cwNw.z, 0.0 ) );
    cwSd /= max( cwSd.x + cwSd.y + cwSd.z + cwSd.w, 1e-3 );
    float cwTs = mix( dot( cwSd, uClubWoodHallT ), uClubWoodHall.x, cwN2.y ), cwTk = dot( cwSd, uClubWoodHallK );
    float cwFoot = mix( 1.0, mix( uClubWoodHall.z, 1.0, smoothstep( 0.0, max( uClubWoodHall.w, 1e-3 ), cwBh ) ), uClubWoodBody.y );
    float cwLit = cwOpen * ( 1.0 - cwDnF ) * cwFoot;
    float cwShS = smoothstep( 0.6 * cwBi * cwTs, 1.5 * cwBi * cwTs + 0.01, cwDr + 0.004 ) * mix( 1.0, smoothstep( 0.6 * cwIs * cwTs, 1.5 * cwIs * cwTs + 0.01, cwDs + 0.004 ), cwBelow );
    float cwShK = smoothstep( 0.6 * cwBi * cwTk, 1.5 * cwBi * cwTk + 0.01, cwDr + 0.004 ) * mix( 1.0, smoothstep( 0.6 * cwIs * cwTk, 1.5 * cwIs * cwTk + 0.01, cwDs + 0.004 ), cwBelow );
    float cwSunS = mix( 1.0, cwShS * cwLit, uClubWoodBody.y );
    float cwSunK = mix( 1.0, cwShK * cwLit, uClubWoodBody.y );
    float cwWk = dot( cwSd, uClubWoodHallW ) * ( 1.0 - cwN2.y );
    // the matt part: the hall's direct light and the carpet's light coming back up, on the material's own albedo
    vec2 cwFq = vClubWoodPos.xz + cwNw.xz * max( cwBh, 0.12 );
    vec3 cwBounce = clubWoodHallFloor( cwFq, 0.25 + 1.5 * cwBh ) * ( 0.5 * ( 1.0 - cwNw.y ) * uClubWoodBody.z );
    vec3 cwDir = cwE * ( uClubWoodBody.x * ( 1.0 - uClubWoodHall.y ) );
    vec3 cwBody = cwDir * mix( cwSunS, cwSunK, cwWk ) + cwBounce + uClubWoodFill.rgb * ( 0.65 + 0.35 * cwNw.y );
    // (the finish's matt pedestal follows the app's own map: uClubWoodPore.z, which this variant's albedo text does not read)
    reflectedLight.indirectDiffuse += cwBody * ( material.diffuseColor + uClubWoodFill.a * mix( 1.0, clubWoodFig, uClubWoodPore.z ) ) * cwOn;
    // the same lights through the material's own lobe (cwE is irradiance / pi)
    vec3 cwHd = vec3( cwNw.x, 0.0, cwNw.z ) / max( length( cwNw.xz ), 1e-3 );
    float cwAl = clubWoodCR * clubWoodCR;
    float cwLs = ( 1.0 - cwWk ) * cwSunS * clubWoodOwnLobe( cwNw, cwVw, normalize( cwHd + vec3( 0.0, cwTs, 0.0 ) ), cwAl )
      + cwWk * cwSunK * clubWoodOwnLobe( cwNw, cwVw, normalize( cwHd + vec3( 0.0, cwTk, 0.0 ) ), cwAl );
    cwRoom = cwRoom * cwFoot + cwDir * ( PI * cwFilm * uClubWoodOwn.y * cwLs );`;
// Round A6 (CONTRACT.md 18.1; wood/layout.js HALL_KEYS): the third hall body WITH THE HALL'S KEY LIGHTS EVALUATED BY
// THEMSELVES. Built from COAT_BODY_HALL3's own text by exact line replacements (HALL3_KEY_EDITS: the node arm checks that
// every one of them hits exactly once), so the text without keys is not touched by a character. What differs:
//   - per key (clubWoodKeyE, clubWoodKeyShade above): its light on the face from where it stands, past the table's own
//     overhangs along ITS direction, on the matt part and through the material's own lobe (clubWoodOwnLobe with the true
//     direction to the key). A leg's face toward a key is lit, its other outer face takes the cosine, a face that looks
//     under the table takes none; the apron's shadow falls across the leg's head where the key's ray meets the skirt's foot;
//   - the side's own number (the room's volume at the outline) keeps the rest: the keys' share of it at the same stations
//     (uClubWoodKeyW, from wood/layout.js hallKeyShares) comes out of the steep-and-low mix, so no light is counted twice;
//   - the contact at the carpet is laid on the carpet's light coming back up as well (the floor map's texels are wider
//     than a sole: at the foot that light comes from the strip of carpet the sole itself shades).
export const HALL3_KEY_EDITS = Object.freeze([
  ['    float cwWk = dot( cwSd, uClubWoodHallW ) * ( 1.0 - cwN2.y );',
    `    float cwWk = dot( cwSd, uClubWoodHallW ) * ( 1.0 - cwN2.y );
    // round A6: the hall's key lights by themselves, each from where it stands
    float cwKw = dot( cwSd, uClubWoodKeyW ) * ( 1.0 - cwN2.y ) * uClubWoodKeyN.y;
    vec3 cwKeyD = vec3( 0.0 ), cwKeyS = vec3( 0.0 );
    for ( int cwKi = 0; cwKi < 4; cwKi ++ ) {
      if ( float( cwKi ) >= uClubWoodKeyN.x ) break;
      vec3 cwKl; float cwKs;
      vec3 cwKe = clubWoodKeyE( cwKi, vClubWoodPos, cwNw, cwKl, cwKs );
      if ( cwKe.r + cwKe.g + cwKe.b <= 0.0 ) continue;
      cwKe *= mix( 1.0, clubWoodKeyShade( vClubWoodPos, cwKl, cwKs ) * cwFoot, uClubWoodBody.y );
      cwKeyD += cwKe;
      cwKeyS += cwKe * clubWoodOwnLobe( cwNw, cwVw, cwKl, clubWoodCR * clubWoodCR );
    }
    cwKeyD *= uClubWoodBody.x * uClubWoodKeyN.y * RECIPROCAL_PI;
    cwKeyS *= uClubWoodBody.x * uClubWoodKeyN.y;`],
  ['    vec3 cwBounce = clubWoodHallFloor( cwFq, 0.25 + 1.5 * cwBh ) * ( 0.5 * ( 1.0 - cwNw.y ) * uClubWoodBody.z );',
    '    vec3 cwBounce = clubWoodHallFloor( cwFq, 0.25 + 1.5 * cwBh ) * ( 0.5 * ( 1.0 - cwNw.y ) * uClubWoodBody.z * cwFoot );'],
  ['    vec3 cwBody = cwDir * mix( cwSunS, cwSunK, cwWk ) + cwBounce + uClubWoodFill.rgb * ( 0.65 + 0.35 * cwNw.y );',
    '    vec3 cwBody = cwDir * ( ( 1.0 - cwWk - cwKw ) * cwSunS + cwWk * cwSunK ) + cwKeyD + cwBounce + uClubWoodFill.rgb * ( 0.65 + 0.35 * cwNw.y );'],
  ['    float cwLs = ( 1.0 - cwWk ) * cwSunS * clubWoodOwnLobe(',
    '    float cwLs = ( 1.0 - cwWk - cwKw ) * cwSunS * clubWoodOwnLobe('],
  ['    cwRoom = cwRoom * cwFoot + cwDir * ( PI * cwFilm * uClubWoodOwn.y * cwLs );',
    '    cwRoom = cwRoom * cwFoot + cwDir * ( PI * cwFilm * uClubWoodOwn.y * cwLs ) + cwKeyS * ( cwFilm * uClubWoodOwn.y );'],
]);
const COAT_BODY_HALL3K = HALL3_KEY_EDITS.reduce((text, [from, to]) => text.split(from).join(to), COAT_BODY_HALL3);
// (`rad`: the function a lobe of the coat reads the room through. The default is the club's; the text with it is the
// text of rounds 2 to 4 and of round A2's hall variant, character for character. `lamp` false (round A4's third hall
// body only): no lamp lobe at all; with it the text is what it was.)
const COAT_LAMP = /* glsl */`  vec3 cwLamp = clubWoodLampLobe( clubWoodCN, cwCV, geometryPosition, clubWoodCR, 1.0 ) * cwCore;
  if ( cwHz > 0.0 ) cwLamp += clubWoodLampLobe( clubWoodCN, cwCV, geometryPosition, clubWoodHR, 0.0 ) * cwHz;
  if ( cwBr > 0.0 ) cwLamp += clubWoodBrush( vClubWoodPos, cwNw, cwVw, clubWoodAx ) * cwBr;
  cwLamp *= uClubWoodSw2.x;`;
const coatText = (body, rad = 'clubWoodRoomRad', lamp = true) => /* glsl */`
{
  float cwOn = uClubWoodSw.x;
  vec3 cwCV = geometryViewDir;
  float cwNV = saturate( dot( clubWoodCN, cwCV ) );
  vec3 cwNw = normalize( inverseTransformDirection( clubWoodCN, viewMatrix ) );
  vec3 cwVw = normalize( inverseTransformDirection( cwCV, viewMatrix ) );
  // the coat's three lobes: narrow (the lamp's image), wide (the haze), and the fan of the scratches along the grain
  // an open pore is a slit where the film sank and broke: what the smooth film would mirror there is scattered instead, so
  // over a pore part of the narrow lobe's share goes to the wide one. Against a dark reflection a pore is a lighter matte
  // slit (it still catches the lamp), against a bright one a darker slit: the grain reads on a black rail either way
  float cwHz = clamp( uClubWoodHaze.y * clubWoodHzK + 0.6 * uClubWoodPore.x * clubWoodPore, 0.0, 0.9 );
  float cwBr = clamp( uClubWoodScr.x * clubWoodBrK, 0.0, 0.5 ) * uClubWoodSw.w * ( 1.0 - cwHz );
  // a little less mirror where the figure is dark: the early wood drinks more of the finish
  float cwFilm = 1.0 - uClubWoodPore.w * clamp( 1.0 - clubWoodFig, 0.0, 1.0 );
  float cwCore = ( 1.0 - cwHz - cwBr ) * cwFilm;
${lamp ? COAT_LAMP : '  vec3 cwLamp = vec3( 0.0 );'}
  vec3 cwMirror = reflect( - cwCV, clubWoodCN );
  vec3 cwRw = normalize( inverseTransformDirection( normalize( mix( cwMirror, clubWoodCN, clubWoodCR * clubWoodCR ) ), viewMatrix ) );
  vec3 cwEnvF = EnvironmentBRDF( clubWoodCN, cwCV, vec3( 0.04 ), 1.0, clubWoodCR );
  vec3 cwRoom = ${rad}( vClubWoodPos, cwRw, clubWoodCR ) * cwEnvF * ( ( 1.0 - cwHz ) * cwFilm );
  if ( cwHz > 0.0 ) {
    vec3 cwRh = normalize( inverseTransformDirection( normalize( mix( cwMirror, clubWoodCN, clubWoodHR * clubWoodHR ) ), viewMatrix ) );
    cwRoom += ${rad}( vClubWoodPos, cwRh, clubWoodHR ) * EnvironmentBRDF( clubWoodCN, cwCV, vec3( 0.04 ), 1.0, clubWoodHR ) * cwHz;
  }
  cwRoom *= uClubWoodSw2.y;
  vec4 cwCue = clubWoodCue( vClubWoodPos, cwRw, clubWoodCR );
  cwLamp *= 1.0 - cwCue.a;
  cwRoom = mix( cwRoom, cwCue.rgb * cwEnvF, cwCue.a );
  // what the coat reflects never reaches the layers under it; and the surface under a coat is no longer an air interface
  // (coat and wood have nearly the same index), so most of the material's own specular lobe goes with it
  float cwKeep = 1.0 - cwOn * uClubWoodCoat.x * ( 0.04 + 0.96 * pow( 1.0 - cwNV, 5.0 ) );
  float cwUnder = cwKeep * mix( 1.0, uClubWoodMode.z, cwOn * uClubWoodCoat.x );
  reflectedLight.directDiffuse *= cwKeep;
  reflectedLight.indirectDiffuse *= cwKeep;
  // The body in the room's light. An outward face of the cabinet looks away from the lamp and the scene's own lights leave
  // it next to nothing: what reaches it is the room (its lamps and its ambient, one value per face direction, the bar side
  // warmer than the wall side) and the lamp's spill coming back off the floor. The table shades itself: under the rail and
  // the apron's overhang, toward the floor, and on every face that looks under the table.
  if ( uClubWoodMode.y > 0.5 ) {
    vec3 cwN2 = cwNw * cwNw;
    vec3 cwE = cwN2.x * ( cwNw.x > 0.0 ? uClubWoodAmb[ 0 ] : uClubWoodAmb[ 1 ] )
             + cwN2.y * ( cwNw.y > 0.0 ? uClubWoodAmb[ 2 ] : uClubWoodAmb[ 3 ] )
             + cwN2.z * ( cwNw.z > 0.0 ? uClubWoodAmb[ 4 ] : uClubWoodAmb[ 5 ] );
${body}
  }
  reflectedLight.directSpecular = reflectedLight.directSpecular * cwUnder + cwLamp * ( cwOn * uClubWoodCoat.x );
  reflectedLight.indirectSpecular = reflectedLight.indirectSpecular * cwUnder + cwRoom * ( cwOn * uClubWoodCoat.x );
}`;
export const WOOD_COAT = coatText(COAT_BODY_ROOM);
/** Round A2: the coat with the hall's body block (the arena venue's table body; see the note above COAT_BODY_ROOM). */
export const WOOD_COAT_HALL = coatText(COAT_BODY_HALL);
/** Round A3: the coat with the second hall body; its lobes read the room through clubWoodHallRad (woodFnHall). */
export const WOOD_COAT_HALL2 = coatText(COAT_BODY_HALL2, 'clubWoodHallRad');
/** Round A4: the third hall body (the table by its own material): one lobe read through clubWoodOwnRad, no lamp term. */
export const WOOD_COAT_HALL3 = coatText(COAT_BODY_HALL3, 'clubWoodOwnRad', false);
/** Round A6: the third hall body with the hall's key lights evaluated by themselves (COAT_BODY_HALL3K above). */
export const WOOD_COAT_HALL3K = coatText(COAT_BODY_HALL3K, 'clubWoodOwnRad', false);

// ---- sights ------------------------------------------------------------------------------------------------------------------------
// A sight is a flat marker 0.2 to 0.6 mm over the rail cap (a rhombus 25 x 16 mm on the default table). Inlaid look, built to
// read at the size a sight has on screen (18 x 5 pixels at the side-pocket view, 8 x 4 at the standing view):
//   - mother-of-pearl, not white paint: a pale body of low albedo (so the lamp does not clip it) under a strong, broad,
//     tinted lustre whose platelets lie a few degrees off the surface in patches 6 to 10 mm wide. The lustre turns with the
//     view: at one camera some patches of a sight are lit and others not, and no two sights look alike;
//   - let into the wood: the rim zone is a dark glue line and the wall of a shallow recess, shaded by the lamp (dark on the
//     side whose wall looks away from it). The zone is never thinner than a pixel and a half on screen, i.e. it is drawn
//     wider than it is from a distance (stated in the report);
//   - under the rail's own coat: the same lobes as the wood around it, so the lamp's image runs over the inlay.
// clubWoodEdge = 0 at the rim, 1 at the centre (the marker is a three CircleGeometry: uv = position / r).
export const SIGHT_ALBEDO = /* glsl */`
{
  vec2 csC = vClubSightUv - 0.5;
  clubWoodEdge = uClubSight.x > 0.5 ? 1.0 - 2.0 * length( csC ) : 1.0 - 2.0 * ( abs( csC.x ) + abs( csC.y ) );
  clubWoodRim = max( 0.18, 1.6 * fwidth( clubWoodEdge ) );
  clubWoodSC = vClubWoodPos.xz;
  clubWoodFoot = length( vec2( length( dFdx( vClubWoodPos ) ), length( dFdy( vClubWoodPos ) ) ) );
  vec2 csQ = abs( vClubWoodPos.xz - uClubWoodRoom.xy ) - uClubWoodBand.xy;
  clubWoodAx = csQ.y > csQ.x ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 0.0, 1.0 );
  vec3 csV = normalize( cameraPosition - vClubWoodPos );
  float csB1 = clubWoodNoise( vClubWoodPos.xz * vec2( 150.0, 62.0 ) + 9.0 );
  float csB2 = clubWoodNoise( vClubWoodPos.xz * vec2( 48.0, 135.0 ) + 3.1 );
  clubWoodPl = vec2( csB1 - 0.5, csB2 - 0.5 );
  // interference colour: it turns with the direction of view and from patch to patch (pink to green)
  float csPh = 9.0 * dot( csV.xz, vec2( 0.8, 0.6 ) ) + 8.0 * csB1 + 5.0 * csB2;
  clubWoodIri = 0.5 + 0.5 * cos( csPh + vec3( 0.0, 2.1, 4.2 ) );
  // the orient: light and dark bands that slide across the inlay as the eye moves (the layers return the light in a lobe
  // that leans with each patch), so a sight is never one flat tone and no two sights show the same bands
  float csBand = 0.5 + 0.5 * cos( 6.0 * dot( csV.xz, vec2( -0.6, 0.8 ) ) + 9.0 * csB2 + 4.0 * csB1 + 1.3 );
  float csSeam = smoothstep( 0.0, clubWoodRim, clubWoodEdge );
  vec3 csBody = vec3( 0.16, 0.154, 0.138 ) * mix( 1.0, 0.45 + 1.1 * csBand, uClubSight.z ) * mix( vec3( 1.0 ), 0.5 + clubWoodIri, 0.55 * uClubSight.z );
  // from afar the rim zone would cover the whole sight (it is never thinner than a pixel and a half) and the glue line
  // would darken all of it: the line and the recess wall fade out once the zone passes a third of the sight, so a sight
  // stays a readable mark at aiming distance
  float csNear = 1.0 - smoothstep( 0.3, 0.7, clubWoodRim );
  csBody *= mix( 1.0 - uClubSight.y * csNear, 1.0, csSeam );
  diffuseColor.rgb = mix( diffuseColor.rgb, csBody, uClubWoodSw.x );
}`;
export const SIGHT_NORMAL = /* glsl */`
{
  // the recess wall: over the rim zone the normal leans toward the middle of the sight (the wall of a recess faces inward),
  // by uClubSight.w at the rim. The lean's direction is the surface gradient of the edge coordinate, built the way three's
  // bump map builds one from screen derivatives
  vec3 csPx = dFdx( - vViewPosition ), csPy = dFdy( - vViewPosition );
  vec3 csR1 = cross( csPy, normal ), csR2 = cross( normal, csPx );
  float csDet = dot( csPx, csR1 );
  vec3 csGrad = sign( csDet ) * ( dFdx( clubWoodEdge ) * csR1 + dFdy( clubWoodEdge ) * csR2 );
  float csLen = length( csGrad );
  vec3 csDir = csLen > 1e-12 ? csGrad / csLen : vec3( 0.0 );
  float csWall = ( 1.0 - smoothstep( 0.3 * clubWoodRim, clubWoodRim, clubWoodEdge ) ) * uClubSight.w * uClubWoodSw.y
    * ( 1.0 - smoothstep( 0.3, 0.7, clubWoodRim ) );
  vec3 csN = normalize( normal + csDir * csWall );
  // the platelets of the nacre lie a few degrees off the surface, patch by patch: the base lobe (the lustre) follows them,
  // the coat over the inlay does not
  vec3 csTx = normalize( ( viewMatrix * vec4( 1.0, 0.0, 0.0, 0.0 ) ).xyz ), csTz = normalize( ( viewMatrix * vec4( 0.0, 0.0, 1.0, 0.0 ) ).xyz );
  vec3 csBase = normalize( csN + ( csTx * clubWoodPl.x + csTz * clubWoodPl.y ) * ( 0.6 * uClubSight.z ) );
  clubWoodCN = csN;
  normal = normalize( mix( normal, csBase, uClubWoodSw.x ) );
}`;
export const SIGHT_ROUGHNESS = /* glsl */`
{
  clubWoodCR0 = clamp( uClubWoodCoat.y, 0.045, 1.0 );
  clubWoodCR = clubWoodAA( clubWoodCR0, clubWoodCN );
  clubWoodHR = clubWoodAA( clamp( uClubWoodHaze.x, 0.045, 1.0 ), clubWoodCN );
  // nacre's lustre: a broad, strong, tinted lobe (its stacked platelets return far more than one dielectric surface); none
  // in the glue line
  float csSeam = mix( 1.0, smoothstep( 0.0, clubWoodRim, clubWoodEdge ), 1.0 - smoothstep( 0.3, 0.7, clubWoodRim ) );
  material.roughness = mix( material.roughness, clubWoodAA( 0.36, normal ), uClubWoodSw.x );
  material.specularColor = mix( material.specularColor, ( 0.05 + 0.17 * clubWoodIri ) * ( uClubSight.z * csSeam ), uClubWoodSw.x );
}`;

/**
 * The adopt.patch pieces for one material (pure; the node arm calls it).
 *   kind  'wood' (rail caps and body: the uniforms say which) | 'sight'
 *   frag  the fragment text the earlier compile hooks produced (null = nothing compiled yet): picks the coat's anchor
 *   map   false = no scan sampler (the program has no texture unit to spare)
 *   hall  true = the hall's body block (round A2: the arena venue's table body; never a sight). Its own key, its own text;
 *         without it every string is what it was before the option existed.
 *         2 = round A3's hall body (COAT_BODY_HALL2 with woodFnHall appended to the functions): key suffix `+hall2`.
 *         3 = round A4's hall body, the table by its own material (COAT_BODY_HALL3, WOOD_FN_OWN after woodFnHall, the
 *         albedo text's `own` tail): key suffix `+hall3`; it never binds the scan (`map` is taken as false).
 *   floor (with hall 2 or 3 only) true = the floor map's sampler in place of the scan's: key suffix `+floor`; `map` is
 *         then taken as false whatever was passed (one sampler per material from this part).
 * Returns { key, variant, pars, vertexPars, apply }.
 */
export function woodPatchParts(kind, frag, { map = true, hall = false, floor = false, keys = false, henv = null } = {}) {
  const text = typeof frag === 'string' ? frag : '';
  const rail = text.includes(WOOD_RAIL_LINE);
  const sight = kind === 'sight';
  const inHall2 = hall === 2 && !sight;
  // (round A4: the third hall body. It never binds the scan: its albedo is the app's own colour and map)
  const inHall3 = hall === 3 && !sight;
  // (round A6, `keys` true with hall 3 only: the hall's key lights evaluated by themselves: key suffix `+keys`, the key
  // lights' uniforms and functions, COAT_BODY_HALL3K; no sampler. Without it every string is what it was.)
  const withKeys = inHall3 && keys === true;
  // (round A7, `henv` = the env service's HALL_GLSL text, with hall 3 and keys only: the hall's baked cube in the body's
  // lobe: key suffix `+henv`, one sampler (the cube), WOOD_FN_HENV and WOOD_FN_OWN_HENV. Without it every string is what it was.)
  const withHenv = withKeys && typeof henv === 'string' && henv.length > 0;
  const withFloor = ( inHall2 || inHall3 ) && floor === true;
  const withMap = map && !sight && !withFloor && !inHall3;
  const inHall = hall === true && !sight;
  const coatCode = withKeys ? WOOD_COAT_HALL3K : (inHall3 ? WOOD_COAT_HALL3 : (inHall2 ? WOOD_COAT_HALL2 : (inHall ? WOOD_COAT_HALL : WOOD_COAT)));
  const coat = rail
    ? { anchor: WOOD_RAIL_LINE, mode: 'before', code: coatCode }
    : { anchor: WOOD_PLAIN_ANCHOR, mode: 'after', code: coatCode };
  return {
    key: `mat-wood-v${WOOD_PATCH_VERSION}:${sight ? 'sight' : (withMap ? 'wood' : 'wood-nomap')}${inHall ? '+hall' : ''}${inHall2 ? '+hall2' : ''}${inHall3 ? '+hall3' : ''}${withFloor ? '+floor' : ''}${withKeys ? '+keys' : ''}${withHenv ? '+henv' : ''}`,
    variant: rail ? 'rail' : 'plain',
    vertexPars: sight ? `${WOOD_VARYING}\nvarying vec2 vClubSightUv;` : WOOD_VARYING,
    pars: woodPars({ map: withMap, sight, hall: inHall3 ? 3 : (inHall2 ? 2 : inHall), floor: withFloor, keys: withKeys }) + (withHenv ? HENV_PARS + henv : ''),
    apply: [
      { stage: 'vertex', anchor: WOOD_VERTEX_ANCHOR, mode: 'after', code: sight ? SIGHT_VERTEX_CODE : WOOD_VERTEX_CODE },
      { anchor: WOOD_FN_ANCHOR, mode: 'before', code: withHenv ? WOOD_FN + woodFnHall({ floor: withFloor }) + WOOD_FN_HENV + WOOD_FN_OWN_HENV + WOOD_FN_KEY : inHall3 ? WOOD_FN + woodFnHall({ floor: withFloor }) + WOOD_FN_OWN + (withKeys ? WOOD_FN_KEY : '') : (inHall2 ? WOOD_FN + woodFnHall({ floor: withFloor }) : WOOD_FN) },
      { anchor: '#include <map_fragment>', mode: 'after', code: sight ? SIGHT_ALBEDO : woodAlbedo({ map: withMap, own: inHall3 }) },
      { anchor: '#include <normal_fragment_maps>', mode: 'after', code: sight ? SIGHT_NORMAL : WOOD_NORMAL },
      { anchor: '#include <lights_physical_fragment>', mode: 'after', code: sight ? SIGHT_ROUGHNESS : WOOD_ROUGHNESS },
      coat,
    ],
  };
}
