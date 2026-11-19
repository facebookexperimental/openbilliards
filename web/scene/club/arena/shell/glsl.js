// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/shell/glsl.js — the carpet's own shading, spliced into the room light's floor material (CONTRACT.md 13.6, 14.2).
// Owner: shell. Pure text and plain numbers: no three import (the node arm applies the patch to three's shader text).
//
// The carpet stays what the shared services expect: a MeshStandardMaterial made by roomLight.material({ tableShadow: true })
// with the standard light chunks, so the room light's floor terms and the occlusion service's floor map patch it as before.
// This patch adds text AFTER three standard chunk includes only (never a replace), on anchors no other club patch uses:
//   <color_fragment>          the carpet's albedo: what a hall carpet shows that a flat colour does not
//   <roughnessmap_fragment>   the walked band is a little smoother than the pile
// What it draws, all from the fragment's world position on the flat floor (no geometry, no texture, no sampler):
//   scan     the colour scan's own contrast about its MEAN (round A3, the albedo law): the scan is a wool berber with
//            dark specks, and at a real albedo the specks read as dirt. Below the mean the scan is pulled toward it by
//            `conLow`, above it by `conHigh`, and the result is scaled by `norm` so that the mean stays the stated one
//            (../shell.js measures the scan and computes `norm` with tex.js scanTransfer: the same law in JS).
//   rolls    the HALL's carpet is broadloom in rolls laid across. One roll is a hair lighter or darker than the next
//            (dye lot, the lay of its pile); the seam between two is a hairline that shows in stretches and a narrow
//            band of pile pressed flat beside it.
//   tiles    the ISLAND's carpet is laid in carpet tiles (round A5; until round A4 it was three rolls along x and
//            read as a smooth sheet at play distance), quarter-turned: every second tile's pile lies across its
//            neighbour's, each tile is its own dye lot, a hairline shows where two meet. What makes the tiles read
//            is the lay (below), not paint.
//   grain    the heathered yarn at the scale a standing eye resolves (clusters of 1 to 2 cm and of 4 cm), faded out
//            before a pixel's footprint reaches their size.
//   edge     the island is a second carpet laid on the hall's, and an edging profile lies over the joint (geometry, in
//            ../shell.js). Here: the profile's contact shade on the carpet under it and a finger's width beside it.
//   pile     a loop pile is matt seen from above. At a low angle one looks at the sides of the fibres: the carpet lifts
//            (`sheen`), and it shows which way the pile leans: leaning toward the eye it is darker, leaning away lighter.
//            The lean is a tile's lay (the island) or the roll's own (the hall) plus the tracks of the machine that
//            last cleaned it (bands one head wide, alternating, crisp in places and scuffed out in others).
//            Round A5, the island under directed light: the lean also shows against the LIGHT, which comes down from
//            the rig over the table (a pile that leans toward it is lit a little more), and the sheen follows the
//            light too (fibres seen against the light glow along their sides). Both use one direction per floor
//            point, to the nearest point under the rig's rectangle: geometry of the hall, nothing of the camera's.
//   wear     where people walk (a band around the table, the two ways in from the west corners) the pile is pressed: a
//            shade darker, a little smoother, the tracks gone.
//   mottle   slow unevenness over metres, so no tile of the colour map is seen to repeat.
// Every term scales the DIFFUSE ALBEDO, so every light that reaches the carpet (the table light's pool, the heads, the
// backdrop's amber wash, the rail's cool spill, the baked map when there is one) is coloured by it alike: the carpet takes
// the colour of the light near it because nothing here adds light.
// Lines narrower than a pixel are drawn by coverage (their share of the pixel's footprint on the floor), so a seam fades
// with distance instead of crawling.

export const CARPET_PATCH_KEY = 'arena-carpet-v3';

export const CARPET_PARS = /* glsl */`
uniform vec4 uArenaIsl;      // the island's carpet: x0, z0, x1, z1 (world metres)
uniform vec4 uArenaRoll;     // x unused since round A5 (the island's roll width: the island is tiles now), y the hall's roll width, z seam strength 0..1, w the edge's contact half width
uniform vec4 uArenaPile;     // x sheen at a low angle, y lean contrast, z wear, w mottle
uniform vec4 uArenaTab;      // the table's footprint: centre x, centre z, half x, half z
uniform vec4 uArenaWalk;     // x the walked band's distance from the rail, y its width, z the track width, w tracks 0..1
uniform vec4 uArenaTape;     // x how dark the carpet is where the edging profile stands on it (0..1), yzw unused
uniform vec4 uArenaIn[ 2 ];  // the two ways in: a segment each (x0, z0, x1, z1) from a gap in the boards to the table's head
uniform vec4 uArenaSw;       // tools: x everything (0 = the plain carpet), y the edge's contact shade, z the view terms (sheen, lean), w the scan's contrast law (0 = the scan as it is)
uniform vec4 uArenaMean;     // rgb the mean of map x material colour, linear (the vertex colour is not in it)
uniform vec4 uArenaCon;      // x contrast below the mean, y above it (1 = the map's own), z the scale that keeps the mean
uniform vec4 uArenaTile;     // x the island's tile size (m), y a tile seam's strength against a roll seam's, z fine grain, w coarse grain
uniform vec4 uArenaRig;      // the rig over the table: x half length, y half width, z height over the floor (m), w the lay's share against the light
float arenaHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float arenaNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( arenaHash( i ), arenaHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( arenaHash( i + vec2( 0.0, 1.0 ) ), arenaHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
// a line of half width hw (m) at distance d (m) from the fragment, over a pixel footprint fw (m): its share of the pixel
float arenaLine( float d, float hw, float fw ) {
  float w = max( hw, 0.5 * fw );
  return ( hw / w ) * ( 1.0 - smoothstep( 0.7 * w, 1.3 * w, abs( d ) ) );
}
float arenaSeg( vec2 p, vec4 s ) {
  vec2 a = s.xy, b = s.zw - s.xy;
  return length( p - a - b * clamp( dot( p - a, b ) / max( dot( b, b ), 1e-6 ), 0.0, 1.0 ) );
}
`;

// after <color_fragment>: diffuseColor holds map x vertex colour. The three locals are read again at the later anchors.
export const CARPET_COLOR = /* glsl */`
float arenaTapeK = 0.0;
float arenaWearK = 0.0;
{
  // the scan's contrast about its mean (a fragment darker than the mean is pulled toward it by x, a lighter one by y;
  // z keeps the mean where it was: the albedo law pins the MEAN)
  vec3 aMean = uArenaMean.rgb * vColor;
  float aRel = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( dot( aMean, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-6 );
  float aCon = mix( 1.0, aRel < 1.0 ? uArenaCon.x : uArenaCon.y, uArenaSw.w );
  diffuseColor.rgb = max( aMean + ( diffuseColor.rgb - aMean ) * aCon, vec3( 0.0 ) ) * mix( 1.0, uArenaCon.z, uArenaSw.w );
  vec2 aw = vRoomWP.xz;
  vec3 aToCam = cameraPosition - vRoomWP;
  vec3 aV = aToCam / max( length( aToCam ), 1e-4 );
  float aGraze = 1.0 - clamp( aV.y, 0.0, 1.0 );           // 0 seen from straight above, 1 at the horizon
  vec2 aFw2 = fwidth( aw );
  float aFw = max( aFw2.x, aFw2.y );                      // the pixel's footprint on the floor (m)
  vec2 aDI = max( uArenaIsl.xy - aw, aw - uArenaIsl.zw );
  float aSdI = max( aDI.x, aDI.y );                       // signed distance to the island's edge (negative inside)
  float aIn = step( aSdI, 0.0 );
  // the hall's own carpet: broadloom in rolls that run along z (seams at constant x)
  float aRw = uArenaRoll.y;
  float aAlong = aw.y;
  vec2 aDir = vec2( 0.0, 1.0 );                                 // the way the pile lies
  float aRc = aw.x / aRw + 0.5;
  float aRoll = floor( aRc );
  float aSeam = ( 0.5 - abs( fract( aRc ) - 0.5 ) ) * aRw;      // metres to the nearest seam
  float aLot = arenaHash( vec2( aRoll, 7.0 ) );
  float aSeamK = 1.0;                                           // the seam's strength
  float aLay = 0.0;                                             // a tile's own lay (broadloom: the roll's faint one alone)
  if ( aIn > 0.5 ) {
    // the island (round A5): carpet tiles counted from the island's corner, quarter-turned: every second tile's
    // pile lies across its neighbour's; each tile its own dye lot; a hairline where two tiles meet
    vec2 aTc = ( aw - uArenaIsl.xy ) / uArenaTile.x;
    vec2 aTi = floor( aTc ), aTf = fract( aTc );
    float aTurn = mod( aTi.x + aTi.y, 2.0 );
    aDir = aTurn < 0.5 ? vec2( 1.0, 0.0 ) : vec2( 0.0, 1.0 );
    aAlong = aTurn < 0.5 ? aw.x : aw.y;
    aRoll = aTi.x + 57.0 * aTi.y;
    aSeam = min( min( aTf.x, 1.0 - aTf.x ), min( aTf.y, 1.0 - aTf.y ) ) * uArenaTile.x;
    aLot = arenaHash( aTi + vec2( 7.0, 31.0 ) );
    aSeamK = uArenaTile.y;
    aLay = 1.0 - smoothstep( 0.10, 0.30, aFw );                 // (gone before a tile nears a pixel's footprint)
  }
  float aShade = 1.0 + ( aLot - 0.5 ) * 0.035;
  float aSeamVis = 0.3 + 0.7 * arenaNoise( vec2( aAlong * 0.8, aRoll * 3.1 + 11.0 ) );
  aShade *= 1.0 - uArenaRoll.z * aSeamK * aSeamVis * ( 0.34 * arenaLine( aSeam, 0.0022, aFw ) + 0.035 * arenaLine( aSeam, 0.014, aFw ) );
  // mottle
  aShade *= 1.0 + uArenaPile.w * ( arenaNoise( aw * 0.9 + 3.0 ) - 0.5 ) + 0.5 * uArenaPile.w * ( arenaNoise( aw * 5.3 + 17.0 ) - 0.5 );
  // the yarn's grain (round A5): heathered clusters at two scales, each gone before a pixel's footprint reaches it
  aShade *= 1.0 + uArenaTile.z * ( arenaNoise( aw * 61.0 + 2.0 ) - 0.5 ) * ( 1.0 - smoothstep( 0.010, 0.035, aFw ) )
                + uArenaTile.w * ( arenaNoise( aw * 23.0 + 9.0 ) - 0.5 ) * ( 1.0 - smoothstep( 0.03, 0.10, aFw ) );
  // wear: the band people walk around the table, and the two ways in
  vec2 aDT = abs( aw - uArenaTab.xy ) - uArenaTab.zw;
  float aSdT = length( max( aDT, 0.0 ) ) + min( max( aDT.x, aDT.y ), 0.0 );
  float aBand = ( aSdT - uArenaWalk.x ) / max( uArenaWalk.y, 1e-3 );
  float aWear = exp( - aBand * aBand );
  float aW0 = arenaSeg( aw, uArenaIn[ 0 ] ) / 0.38, aW1 = arenaSeg( aw, uArenaIn[ 1 ] ) / 0.38;
  aWear = max( aWear, 0.8 * max( exp( - aW0 * aW0 ), exp( - aW1 * aW1 ) ) );
  aWear *= aIn * ( 0.5 + 0.5 * arenaNoise( aw * 1.7 + 5.0 ) );
  arenaWearK = aWear * uArenaSw.x;
  aShade *= 1.0 - 0.06 * uArenaPile.z * aWear;
  // the pile's lean: a tile's lay (the island) or the roll's (the hall), and the tracks of the machine that last
  // cleaned it (bands one head wide, alternating: along x on the island, along z outside it). Where people walk
  // the pile is pressed flat: the lay and the tracks go.
  vec2 aTDir = mix( vec2( 0.0, 1.0 ), vec2( 1.0, 0.0 ), aIn );
  float aT = ( mix( aw.x, aw.y, aIn ) + 0.05 * arenaNoise( vec2( mix( aw.y, aw.x, aIn ) * 0.6, 3.0 ) ) ) / max( uArenaWalk.z, 0.05 );
  float aTrack = clamp( sin( 3.14159265 * aT ) * 2.5, - 1.0, 1.0 );
  float aCrisp = smoothstep( 0.25, 0.7, arenaNoise( aw * 0.23 + 40.0 ) ) * ( 1.0 - smoothstep( 0.12, 0.35, aFw ) );
  vec2 aLean = aDir * ( 0.3 * ( aLot - 0.5 ) + aLay * ( 1.0 - 0.7 * aWear ) ) + aTDir * ( aTrack * aCrisp * uArenaWalk.w * ( 1.0 - 0.75 * aWear ) );
  aLean += vec2( - aDir.y, aDir.x ) * 0.25 * ( arenaNoise( aw * 0.6 + 9.0 ) - 0.5 );
  vec2 aVh = aV.xz / max( length( aV.xz ), 1e-4 );
  float aView = uArenaSw.z;
  aShade *= 1.0 - aView * uArenaPile.y * dot( aLean, aVh ) * aGraze * sqrt( aGraze );
  // the lean against the LIGHT (round A5, the island): its light comes down from the rig over the table, so at a
  // floor point it arrives from the nearest point under the rig's rectangle, at an angle whose tangent is that
  // distance over the rig's height. A pile that leans toward the light is lit a little more, one that leans away a
  // little less (the tilt of the fibres' mean facet); zero under the rig, zero in the mean of the two lays.
  vec2 aOff = aw - uArenaTab.xy;
  vec2 aTo = clamp( aOff, - uArenaRig.xy, uArenaRig.xy ) - aOff;
  float aTl = length( aTo );
  aShade *= 1.0 + aView * aIn * uArenaRig.w * dot( aLean, aTo / max( aTl, 1e-4 ) ) * min( aTl / max( uArenaRig.z, 0.5 ), 1.5 );
  // the pile's sheen at a low angle FOLLOWS THE LIGHT (round A5): fibres seen against the light glow along their
  // sides, fibres lit from behind the eye do not. On the island the factor goes from 0 (the light comes from behind
  // the eye) to 2 (the eye looks toward the rig), 1 in the mean of all directions and 1 under the rig; outside the
  // island the sheen is the plain one of round A4.
  float aSh = mix( 1.0, 1.0 - dot( aVh, aTo / max( aTl, 1e-4 ) ), aIn * min( aTl / max( uArenaRig.z, 0.5 ), 1.0 ) );
  aShade *= 1.0 + aView * uArenaPile.x * aGraze * aGraze * aGraze * aSh;
  // the edging profile on the island's joint (geometry): its contact shade on the carpet under it and beside its feet
  arenaTapeK = arenaLine( aSdI, uArenaRoll.w, aFw ) * uArenaSw.y * uArenaSw.x;
  diffuseColor.rgb *= mix( 1.0, aShade, uArenaSw.x ) * ( 1.0 - uArenaTape.x * arenaTapeK );
}
`;
export const CARPET_ROUGH = /* glsl */`
roughnessFactor = clamp( roughnessFactor - 0.05 * arenaWearK, 0.4, 1.0 );
`;

/** The carpet's defaults (a look table: set against the frames; none of them moves the albedo's mean by more than the
 * mottle's and the wear's few per cent). */
export const CARPET = Object.freeze({
  // (sheen: the lift of the pile's sides at a low angle. 0.34 in A2 lifted the far carpet by 16 % against the near one at
  // V10 and flattened the fall-off of the pool toward the boards; a level-loop pile has little of it)
  // (tracks: 1.0 until round A4. Two app frames at V10 under the same baked light, 7 m from the camera, differing in
  // this value only: at 1.0 the machine tracks (0.38 m wide, straight edged) put plateaus and a step of 5 levels of 255
  // in 8 px on the carpet where the light itself falls by 1 to 2 per 8 px (... 69 67 62 61 ...); at 0.3 that step is 1
  // (... 66 65 64 63 ...). The fall of the light across those rows is the light's own and stays; so does the roll
  // seam's step of 3 to 4. Straight-edged bands on a soft pool of light read as edges of light: hence 0.3)
  seam: 1.0, sheen: 0.14, lean: 0.085, wear: 1.0, mottle: 0.05, tracks: 0.3,
  // Round A5 (the island's carpet under directed light; round A4's read as a smooth sheet at V1 and TV):
  //   tile, tileSeam   the island is laid in carpet TILES of this size (m), quarter-turned: every second tile's pile
  //                    lies across its neighbour's. `tileSeam`: the hairline between two tiles against a roll seam's.
  //   lay              how much a tile's lay shows against the LIGHT: the island's light comes down from the rig over
  //                    the table, and a pile that leans toward it is lit a little more than one that leans away
  //                    (x the tangent of the light's angle off the vertical: nothing under the rig, most at the
  //                    boards). Against the EYE it shows by `lean`, as the tracks do. Both are zero in the mean of
  //                    the two lays.
  //   grain, grain2    the heathered yarn at the scale a standing eye resolves: clusters of 1 to 2 cm and of 4 cm,
  //                    each faded out before a pixel's footprint reaches its size (no crawl at a distance)
  //                    (dev page n6 at V1: at 0.07 / 0.05 the tiles read and the pile inside a tile did not: a sheet
  //                    of smooth squares; 0.18 / 0.08 is a peak of 9 % and 4 %, about half of that in the mean)
  tile: 0.5, tileSeam: 0.4, lay: 0.10, grain: 0.18, grain2: 0.08,
  // the contact shade under and beside the edging profile (a share of the carpet's albedo taken away)
  edgeContact: 0.55,
  // the scan's contrast about its mean: dark specks to 0.35 of their depth, light fibres to 0.7 of their height
  conLow: 0.35, conHigh: 0.70,
});

/**
 * The patch as an adopt.patch spec (../../adopt.js): `{ key, uniforms, pars, apply }`. `uniforms` are the caller's uniform
 * OBJECTS (carpetUniforms below, or three vectors of the same shapes).
 */
export function carpetPatchSpec(uniforms) {
  return {
    key: CARPET_PATCH_KEY, uniforms, pars: CARPET_PARS,
    apply: [
      { anchor: '#include <color_fragment>', mode: 'after', code: CARPET_COLOR },
      { anchor: '#include <roughnessmap_fragment>', mode: 'after', code: CARPET_ROUGH },
    ],
  };
}

// ---- the carpet, round A6: the nap under the island's DIRECTED light (patch v4) --------------------------------------------
// Round A5's island was quarter-turned tiles whose lay showed against one direction per floor point (toward the rig
// over the table): a checker laid with a ruler, even from the boards to the table, and its light-following part was
// proven on the dev page only. Round A6 gives the island one dominant direction (the rig's four TABLE KEYS: profile
// spots at the south-west corner, a pair at half level at the north-east: ../rig/plan.js HALL.tableKeys), and v4
// answers it. Same anchors, same law (every term scales the diffuse albedo or the roughness; nothing adds light):
//   the light   what the pile's lean shows against is the light the carpet really stands in, as a small model of
//               its DIRECTED part: each table key (candela x cosine / distance squared inside its cone, on the lit
//               side of its shutter), and the rig's fill with the lamp's spill (from over the table, by the side of
//               the table, falling off outward); against them the light that has no direction (the hall's ambient,
//               the bounce). A leaning pile's mean facet is tilted: of a light at elevation e and azimuth a against
//               the lean it takes cos(tilt) + sin(tilt) x cot(e) x cos(a). The factor here is the sum of that over
//               the directed lights, weighted by each light's share of all the light at the fragment: where a key
//               carries half the light, two tiles that lean toward it and away from it stand a sixth apart; where
//               the light comes from straight above or from all sides, nothing shows. The bake holds irradiance
//               without a direction, so this is the part of the carpet's look the map cannot carry.
//   the lay     quarter-turned, as a fitter lays it: some tiles laid like their neighbour, some turned half round
//               (four directions in all), each tile its own lean and its own dye lot. No two rows read alike.
//   wear        the ring the players walk around the table (0.6 to 1.6 m out), the ways in, the floor in front of
//               the two players' chairs: the pile pressed flat (the lay and the tracks go), smoother (more sheen at
//               a low angle), soiled by a few per cent (0.04 at the most: what walked-in dust does to a mid grey).
//   sheen       at a low angle fibres seen AGAINST the directed light glow along their sides: the factor follows
//               the mean direction of the directed light at the fragment and its share (v3 used the rig alone).
//   tape        a few pieces of cloth tape on the island (spike marks for the table's place and a floor mark): a
//               pale matt grey, drawn by coverage; another material's albedo, not light.
export const CARPET_PATCH_KEY_4 = 'arena-carpet-v4';
export const CARPET_KEYS = 4;
export const CARPET_MARKS = 6;

export const CARPET_PARS_4 = /* glsl */`
uniform vec4 uArenaIsl;      // the island's carpet: x0, z0, x1, z1 (world metres)
uniform vec4 uArenaRoll;     // x unused, y the hall's roll width, z seam strength 0..1, w the edge's contact half width
uniform vec4 uArenaPile;     // x sheen at a low angle, y lean contrast against the eye, z wear, w mottle
uniform vec4 uArenaTab;      // the table's footprint: centre x, centre z, half x, half z
uniform vec4 uArenaWalk;     // x the walked ring's distance from the rail (its middle), y its half width, z the track width, w tracks 0..1
uniform vec4 uArenaTape;     // x how dark the carpet is where the edging profile stands on it (0..1), y the tape pieces 0..1, z a piece's albedo against the carpet's mean, w unused
uniform vec4 uArenaIn[ 2 ];  // the two ways in: a segment each (x0, z0, x1, z1)
uniform vec4 uArenaSw;       // tools: x everything (0 = the plain carpet), y the edge's contact shade, z the nap terms (against the eye and against the light), w the scan's contrast law
uniform vec4 uArenaMean;     // rgb the mean of map x material colour, linear (the vertex colour is not in it)
uniform vec4 uArenaCon;      // x contrast below the mean, y above it (1 = the map's own), z the scale that keeps the mean
uniform vec4 uArenaTile;     // x the island's tile size (m), y a tile seam's strength against a roll seam's, z fine grain, w coarse grain
uniform vec4 uArenaRig;      // the rig over the table: x half length, y half width, z height over the floor (m), w the sine of the pile's lean
uniform vec4 uArenaKeyP[ ${CARPET_KEYS} ];   // a table key: xyz its lens (world metres), w its candela (0 = none)
uniform vec4 uArenaKeyD[ ${CARPET_KEYS} ];   // xyz its axis (unit, pointing where the light travels), w the cosine of its cone's half angle
uniform vec4 uArenaKeyS[ ${CARPET_KEYS} ];   // its shutter on the floor's plane: lit where x * X + y * Z + z >= 0 (world X, Z); w unused
uniform vec4 uArenaKeyF[ ${CARPET_KEYS} ];   // its second blade (at the table's foot, out of focus) on the floor's plane: x * X + y * Z + z = metres into the lit side; w the soft edge's half width (m)
uniform vec4 uArenaFill;     // the light near the table that is not a key's (units): x from over the table on its south and west sides, y on its north and east sides, z without a direction; w the length over which x and y fall off outward (m)
uniform vec4 uArenaLay;      // the fitter's hand: x the share of tiles turned half round, y the share laid like their neighbour, z the spread of a tile's own lean, w the spread of a tile's dye lot
uniform vec4 uArenaSeat[ 2 ];  // the floor in front of a player's chair: x, z, the worn patch's radius (m); w unused
uniform vec4 uArenaMark[ ${CARPET_MARKS} ];  // a piece of tape: centre x, z, half length along x, half length along z (0, 0 = none)
float arenaHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float arenaNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( arenaHash( i ), arenaHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( arenaHash( i + vec2( 0.0, 1.0 ) ), arenaHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float arenaLine( float d, float hw, float fw ) {
  float w = max( hw, 0.5 * fw );
  return ( hw / w ) * ( 1.0 - smoothstep( 0.7 * w, 1.3 * w, abs( d ) ) );
}
float arenaSeg( vec2 p, vec4 s ) {
  vec2 a = s.xy, b = s.zw - s.xy;
  return length( p - a - b * clamp( dot( p - a, b ) / max( dot( b, b ), 1e-6 ), 0.0, 1.0 ) );
}
`;

// after <color_fragment>: diffuseColor holds map x vertex colour. The three locals are read again at the later anchor.
export const CARPET_COLOR_4 = /* glsl */`
float arenaTapeK = 0.0;
float arenaWearK = 0.0;
float arenaMarkK = 0.0;
{
  // the scan's contrast about its mean (as in v3: the albedo law pins the MEAN)
  vec3 aMean = uArenaMean.rgb * vColor;
  float aRel = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( dot( aMean, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-6 );
  float aCon = mix( 1.0, aRel < 1.0 ? uArenaCon.x : uArenaCon.y, uArenaSw.w );
  diffuseColor.rgb = max( aMean + ( diffuseColor.rgb - aMean ) * aCon, vec3( 0.0 ) ) * mix( 1.0, uArenaCon.z, uArenaSw.w );
  vec2 aw = vRoomWP.xz;
  vec3 aToCam = cameraPosition - vRoomWP;
  vec3 aV = aToCam / max( length( aToCam ), 1e-4 );
  float aGraze = 1.0 - clamp( aV.y, 0.0, 1.0 );           // 0 seen from straight above, 1 at the horizon
  vec2 aFw2 = fwidth( aw );
  float aFw = max( aFw2.x, aFw2.y );                      // the pixel's footprint on the floor (m)
  vec2 aDI = max( uArenaIsl.xy - aw, aw - uArenaIsl.zw );
  float aSdI = max( aDI.x, aDI.y );                       // signed distance to the island's edge (negative inside)
  float aIn = step( aSdI, 0.0 );
  // the hall's own carpet: broadloom in rolls that run along z (seams at constant x)
  float aRw = uArenaRoll.y;
  float aAlong = aw.y;
  vec2 aDir = vec2( 0.0, 1.0 );                                 // the way the pile lies
  float aRc = aw.x / aRw + 0.5;
  float aRoll = floor( aRc );
  float aSeam = ( 0.5 - abs( fract( aRc ) - 0.5 ) ) * aRw;      // metres to the nearest seam
  float aLot = arenaHash( vec2( aRoll, 7.0 ) );
  float aSeamK = 1.0;                                           // the seam's strength
  float aLay = 0.0;                                             // a tile's own lay (broadloom: the roll's faint one alone)
  float aTone = 0.035;                                          // the spread of a dye lot
  if ( aIn > 0.5 ) {
    // the island: carpet tiles counted from the island's corner, quarter-turned BY HAND: every second tile's pile
    // lies across its neighbour's, but a share of them is laid like the neighbour and a share is turned half round
    vec2 aTc = ( aw - uArenaIsl.xy ) / uArenaTile.x;
    vec2 aTi = floor( aTc ), aTf = fract( aTc );
    float aH1 = arenaHash( aTi + vec2( 3.0, 17.0 ) ), aH2 = arenaHash( aTi + vec2( 41.0, 5.0 ) );
    float aTurn = mod( aTi.x + aTi.y + step( aH1, uArenaLay.y ), 2.0 );
    float aFlip = aH2 < uArenaLay.x ? - 1.0 : 1.0;
    aDir = ( aTurn < 0.5 ? vec2( 1.0, 0.0 ) : vec2( 0.0, 1.0 ) ) * aFlip;
    aAlong = aTurn < 0.5 ? aw.x : aw.y;
    aRoll = aTi.x + 57.0 * aTi.y;
    aSeam = min( min( aTf.x, 1.0 - aTf.x ), min( aTf.y, 1.0 - aTf.y ) ) * uArenaTile.x;
    aLot = arenaHash( aTi + vec2( 7.0, 31.0 ) );
    aSeamK = uArenaTile.y;
    // (a tile's own lean; gone before a tile nears a pixel's footprint)
    aLay = ( 1.0 - smoothstep( 0.10, 0.30, aFw ) ) * ( 1.0 + uArenaLay.z * ( arenaHash( aTi + vec2( 23.0, 2.0 ) ) - 0.5 ) );
    aTone = uArenaLay.w;
  }
  float aShade = 1.0 + ( aLot - 0.5 ) * aTone;
  float aSeamVis = 0.3 + 0.7 * arenaNoise( vec2( aAlong * 0.8, aRoll * 3.1 + 11.0 ) );
  aShade *= 1.0 - uArenaRoll.z * aSeamK * aSeamVis * ( 0.34 * arenaLine( aSeam, 0.0022, aFw ) + 0.035 * arenaLine( aSeam, 0.014, aFw ) );
  // mottle
  aShade *= 1.0 + uArenaPile.w * ( arenaNoise( aw * 0.9 + 3.0 ) - 0.5 ) + 0.5 * uArenaPile.w * ( arenaNoise( aw * 5.3 + 17.0 ) - 0.5 );
  // the yarn's grain: heathered clusters at two scales, each gone before a pixel's footprint reaches it
  aShade *= 1.0 + uArenaTile.z * ( arenaNoise( aw * 61.0 + 2.0 ) - 0.5 ) * ( 1.0 - smoothstep( 0.010, 0.035, aFw ) )
                + uArenaTile.w * ( arenaNoise( aw * 23.0 + 9.0 ) - 0.5 ) * ( 1.0 - smoothstep( 0.03, 0.10, aFw ) );
  // wear: the ring the players walk around the table, the two ways in, the floor in front of the two chairs
  vec2 aDT = abs( aw - uArenaTab.xy ) - uArenaTab.zw;
  float aSdT = length( max( aDT, 0.0 ) ) + min( max( aDT.x, aDT.y ), 0.0 );
  float aBand = ( aSdT - uArenaWalk.x ) / max( uArenaWalk.y, 1e-3 );
  float aWear = exp( - aBand * aBand );
  float aW0 = arenaSeg( aw, uArenaIn[ 0 ] ) / 0.38, aW1 = arenaSeg( aw, uArenaIn[ 1 ] ) / 0.38;
  aWear = max( aWear, 0.8 * max( exp( - aW0 * aW0 ), exp( - aW1 * aW1 ) ) );
  vec2 aS0 = ( aw - uArenaSeat[ 0 ].xy ) / max( uArenaSeat[ 0 ].z, 0.05 ), aS1 = ( aw - uArenaSeat[ 1 ].xy ) / max( uArenaSeat[ 1 ].z, 0.05 );
  aWear = max( aWear, 0.9 * max( exp( - dot( aS0, aS0 ) ), exp( - dot( aS1, aS1 ) ) ) );
  aWear *= aIn * ( 0.45 + 0.55 * arenaNoise( aw * 1.7 + 5.0 ) ) * ( 0.7 + 0.3 * arenaNoise( aw * 0.45 + 21.0 ) );
  arenaWearK = aWear * uArenaSw.x;
  aShade *= 1.0 - 0.04 * uArenaPile.z * aWear;                 // (walked-in dust: four per cent at the most)
  // the pile's lean: a tile's lay (the island) or the roll's (the hall), and the tracks of the machine that last
  // cleaned it (bands one head wide, alternating: along x on the island, along z outside it). Where people walk
  // the pile is pressed flat: the lay and the tracks go.
  vec2 aTDir = mix( vec2( 0.0, 1.0 ), vec2( 1.0, 0.0 ), aIn );
  float aT = ( mix( aw.x, aw.y, aIn ) + 0.05 * arenaNoise( vec2( mix( aw.y, aw.x, aIn ) * 0.6, 3.0 ) ) ) / max( uArenaWalk.z, 0.05 );
  float aTrack = clamp( sin( 3.14159265 * aT ) * 2.5, - 1.0, 1.0 );
  float aCrisp = smoothstep( 0.25, 0.7, arenaNoise( aw * 0.23 + 40.0 ) ) * ( 1.0 - smoothstep( 0.12, 0.35, aFw ) );
  vec2 aLean = aDir * ( 0.3 * ( aLot - 0.5 ) * ( 1.0 - aIn ) + aLay * ( 1.0 - 0.45 * aWear ) ) + aTDir * ( aTrack * aCrisp * uArenaWalk.w * ( 1.0 - 0.75 * aWear ) );
  aLean += vec2( - aDir.y, aDir.x ) * 0.25 * ( arenaNoise( aw * 0.6 + 9.0 ) - 0.5 );
  vec2 aVh = aV.xz / max( length( aV.xz ), 1e-4 );
  float aView = uArenaSw.z;
  // against the EYE: leaning toward the eye the pile is darker, leaning away lighter (at a low angle)
  aShade *= 1.0 - aView * uArenaPile.y * dot( aLean, aVh ) * aGraze * sqrt( aGraze );
  // against the LIGHT. The directed light at this fragment: the rig's fill and the lamp's spill come from over the
  // table (from the nearest point under the rig's rectangle, at an angle whose tangent is that distance over the
  // rig's height), stronger on the table's north and east sides (the keys carry the south and the west), falling
  // off outward; each table key from its lens, inside its cone, on the lit side of its shutter.
  vec2 aOff = aw - uArenaTab.xy;
  vec2 aTo = clamp( aOff, - uArenaRig.xy, uArenaRig.xy ) - aOff;
  float aTl = length( aTo );
  float aSW = smoothstep( - 0.6, 0.6, 0.7 * aOff.y - 0.4 * aOff.x );
  float aErig = mix( uArenaFill.y, uArenaFill.x, aSW ) / ( 1.0 + aTl * aTl / max( uArenaFill.w * uArenaFill.w, 0.01 ) );
  float aEsum = aErig + uArenaFill.z;                           // all the light the model knows of (units)
  // the sum over the directed lights of: light x the horizontal direction TO it x the cotangent of its elevation
  vec2 aGrad = aErig * min( aTl / max( uArenaRig.z, 0.5 ), 1.5 ) * aTo / max( aTl, 1e-4 );
  for ( int aKn = 0; aKn < ${CARPET_KEYS}; aKn ++ ) {
    vec3 aK = uArenaKeyP[ aKn ].xyz - vRoomWP;                  // to the key's lens
    float aKd2 = max( dot( aK, aK ), 1e-4 );
    float aKi = inversesqrt( aKd2 );
    float aKc = - dot( aK, uArenaKeyD[ aKn ].xyz ) * aKi;       // the cosine of the angle off the key's axis
    float aKw = smoothstep( uArenaKeyD[ aKn ].w - 0.03, uArenaKeyD[ aKn ].w + 0.03, aKc ) * step( 0.0, uArenaKeyS[ aKn ].x * aw.x + uArenaKeyS[ aKn ].y * aw.y + uArenaKeyS[ aKn ].z );
    // (the second blade: the key's light fades out over the half metre in front of the table)
    aKw *= smoothstep( - uArenaKeyF[ aKn ].w, uArenaKeyF[ aKn ].w, uArenaKeyF[ aKn ].x * aw.x + uArenaKeyF[ aKn ].y * aw.y + uArenaKeyF[ aKn ].z );
    float aKe = uArenaKeyP[ aKn ].w * aKw * max( aK.y, 0.0 ) * aKi / aKd2;   // candela x cosine / distance squared
    aEsum += aKe;
    aGrad += aKe * aK.xz / max( aK.y, 0.2 );
  }
  // a pile that leans by the angle whose sine is uArenaRig.w: its mean facet takes sin x cot(elevation) x
  // cos(azimuth against the lean) more of each directed light; weighted by that light's share of all the light
  aShade *= 1.0 + aView * aIn * uArenaRig.w * dot( aLean, aGrad ) / max( aEsum, 1e-3 );
  // the sheen at a low angle follows the directed light: fibres seen against it glow along their sides (twice the
  // plain sheen looking straight into the light, none with the light behind the eye), by how directed the light is
  float aGl = length( aGrad );
  vec2 aLh = aGrad / max( aGl, 1e-4 );
  float aDsh = aIn * clamp( aGl / max( aEsum, 1e-3 ), 0.0, 1.0 );
  float aSh = mix( 1.0, 1.0 - dot( aVh, aLh ), aDsh );
  aShade *= 1.0 + aView * uArenaPile.x * aGraze * aGraze * aGraze * aSh * ( 1.0 + 1.5 * aWear );
  // the edging profile on the island's joint (geometry): its contact shade on the carpet under it and beside its feet
  arenaTapeK = arenaLine( aSdI, uArenaRoll.w, aFw ) * uArenaSw.y * uArenaSw.x;
  diffuseColor.rgb *= mix( 1.0, aShade, uArenaSw.x ) * ( 1.0 - uArenaTape.x * arenaTapeK );
  // a few pieces of tape on the island (by coverage: a piece fades with distance instead of crawling)
  float aMk = 0.0;
  for ( int aMn = 0; aMn < ${CARPET_MARKS}; aMn ++ ) {
    vec2 aMd = abs( aw - uArenaMark[ aMn ].xy ) - uArenaMark[ aMn ].zw;
    float aMs = max( aMd.x, aMd.y );
    aMk = max( aMk, step( 0.001, max( uArenaMark[ aMn ].z, uArenaMark[ aMn ].w ) ) * ( 1.0 - smoothstep( - 0.5 * aFw, 0.5 * aFw, aMs ) ) );
  }
  arenaMarkK = aMk * uArenaTape.y * uArenaSw.x;
  diffuseColor.rgb = mix( diffuseColor.rgb, aMean * uArenaTape.z, arenaMarkK );
}
`;
export const CARPET_ROUGH_4 = /* glsl */`
roughnessFactor = clamp( roughnessFactor - 0.05 * arenaWearK - 0.30 * arenaMarkK, 0.4, 1.0 );
`;

/** The v4 look table (round A6; the rows v3 has keep their v3 values unless a row here says otherwise). */
export const CARPET_4 = Object.freeze({
  // the pile's lean: the sine of its angle (a low loop pile leans by ten to twelve degrees)
  nap: 0.20,
  // the fitter's hand: the share of tiles turned half round, the share laid like their neighbour, the spread of a
  // tile's own lean (0.75 to 1.25 of the mean), the spread of a tile's dye lot (two per cent either way)
  flip: 0.14, swap: 0.08, leanSpread: 0.5, lot: 0.04,
  // the walked ring: its middle's distance from the rail and its half width (0.6 to 1.6 m out), the worn patch in
  // front of a player's chair (radius, m; `seatOff`: how far in front of the chair, toward the table)
  ring: 1.1, ringHalf: 0.5, seat: 0.6, seatOff: 0.55,
  // the light near the table that is not a key's, in the room light's units (the lane's level note for round A6,
  // version 2: the eight heads carry the pool all round, as in round A5, and each key ends half a metre in front of
  // the table: beside the table 3.4 units, of which the heads and the lamp's spill 3.0 and the ambient with the
  // bounce 0.4; at the boards' foot 1.4, of which 1.0 from over the table) and the length over which the directed
  // part falls off outward (3.0 -> 1.0 over the 2.5 m from the rig's edge to the boards: 1.8 m)
  fillSW: 3.0, fillNE: 3.0, flat: 0.4, fillFall: 1.8,
  // tape: on / off, a piece's albedo against the carpet's mean (a grey matt cloth tape of 0.25 on a carpet of 0.13)
  // Round A7: OFF. The two ticks beside the table read at V10 and V9 as two stray white dashes (the look-check's
  // note iii; the floor role traced them to these pieces: 67 against the carpet's 44 at V10), and a lone tick in
  // the lit pool is not how a crew marks a table's place. The pieces stay in the patch as a tool's switch
  // (`?arenahall=carpetTape:1`: the on arm of the pair).
  tape: 0, tapeAlbedo: 1.9,
  // the keys' side blades in the light model (CARPET_COLOR_4S): 0 = not read (the v4 text), 1 = read when the rig's
  // plan frames its keys with them, 2 = always (tools: the compile check before the rig switches them on)
  sides: 1,
});

// The keys' SIDE blades (round A6, after the half-way bake: the rig frames each table key with two more blades, one
// past each leg of the side it faces, ../rig/plan.js tableKeySides: a key's light on the carpet ends at the table's
// corners). A variant of the v4 text under its own key: two more planes per key in the light model, nothing else.
export const CARPET_PATCH_KEY_4S = 'arena-carpet-v4s';
export const CARPET_PARS_4S = /* glsl */`${CARPET_PARS_4}
uniform vec4 uArenaKeyA[ ${CARPET_KEYS} ];   // a key's first side blade on the floor's plane: x * X + y * Z + z = metres into the lit side; w the soft edge's half width (m)
uniform vec4 uArenaKeyB[ ${CARPET_KEYS} ];   // its second side blade, the same
`;
const CARPET_SIDE_ANCHOR = '    float aKe = uArenaKeyP[ aKn ].w * aKw';
export const CARPET_SIDE_4 = /* glsl */`    // (the side blades: the key's light ends at the table's corners)
    aKw *= smoothstep( - uArenaKeyA[ aKn ].w, uArenaKeyA[ aKn ].w, uArenaKeyA[ aKn ].x * aw.x + uArenaKeyA[ aKn ].y * aw.y + uArenaKeyA[ aKn ].z )
         * smoothstep( - uArenaKeyB[ aKn ].w, uArenaKeyB[ aKn ].w, uArenaKeyB[ aKn ].x * aw.x + uArenaKeyB[ aKn ].y * aw.y + uArenaKeyB[ aKn ].z );
`;
export const CARPET_COLOR_4S = CARPET_COLOR_4.replace(CARPET_SIDE_ANCHOR, `${CARPET_SIDE_4}${CARPET_SIDE_ANCHOR}`);

// ---- the carpet, round A7 (patch v5): one lay, a fitter's hand, the machine's lanes ---------------------------------------
// Round A6's island was quarter-turned tiles. Under the keys that is a checker: at V10 tile stood against tile by up
// to 13 levels on the right, at the broadcast pose it read only beside the table, and a stronger nap would only have
// made the checker stronger. v5 lays the tiles ONE way (the pile along the table's long axis, the arrows on the
// tiles' backs aligned: how a broadloom-look tile is laid), by hand: each tile a few degrees off the line and with
// a lean of its own, a small share quarter-turned or half-turned (uArenaLay.y, .x). What carries the variation then
// is what a floor carries: the cleaning machine's lanes (soft-edged: uArenaHand.y), the pile pressed flat where
// people walk (uArenaHand.z), and the nap's own slow change against the directed light from one end of the island
// to the other. The sided v4 text with four lines replaced and one more uniform. Nothing adds light; the baked
// irradiance has no part in it. (If a replaced line is ever not found, CARPET_COLOR_5 is null and the spec stays v4s.)
export const CARPET_PATCH_KEY_5 = 'arena-carpet-v5';
export const CARPET_PARS_5 = /* glsl */`${CARPET_PARS_4S}
uniform vec4 uArenaHand;     // v5: x how far a tile's lay is off the line (the tangent of its angle, either way), y the lanes' edge (0 = v4's hard trapezoid, 1 = a sine), z how flat the pile is pressed where people walk (0..1), w unused
`;
export const CARPET_SWAPS_5 = Object.freeze([
  ['    float aTurn = mod( aTi.x + aTi.y + step( aH1, uArenaLay.y ), 2.0 );',
    '    float aTurn = step( aH1, uArenaLay.y );                         // (v5: ONE lay; a share of the tiles quarter-turned)'],
  ['    aDir = ( aTurn < 0.5 ? vec2( 1.0, 0.0 ) : vec2( 0.0, 1.0 ) ) * aFlip;',
    '    float aOffLine = ( arenaHash( aTi + vec2( 13.0, 29.0 ) ) - 0.5 ) * 2.0 * uArenaHand.x;\n    aDir = ( aTurn < 0.5 ? vec2( 1.0, aOffLine ) : vec2( aOffLine, 1.0 ) ) * aFlip;'],
  ['  float aTrack = clamp( sin( 3.14159265 * aT ) * 2.5, - 1.0, 1.0 );',
    '  float aTrack = clamp( sin( 3.14159265 * aT ) * mix( 2.5, 1.0, uArenaHand.y ), - 1.0, 1.0 );'],
  ['aLay * ( 1.0 - 0.45 * aWear ) )', 'aLay * ( 1.0 - uArenaHand.z * aWear ) )'],
]);
export const CARPET_COLOR_5 = CARPET_SWAPS_5.every(([a]) => CARPET_COLOR_4S.split(a).length === 2) ? CARPET_SWAPS_5.reduce((s, [a, b]) => s.replace(a, b), CARPET_COLOR_4S) : null;
/** The v5 look table (round A7; a row v4 has keeps its v4 value unless a row here says otherwise). */
export const CARPET_5 = Object.freeze({
  // the switch (../shell.js HALL.carpetV5 reads it): 1 = the island's carpet is v5, 0 = v4
  on: 1,
  // the pile's lean (the sine of its angle), the share of tiles half-turned and quarter-turned, the spread of a
  // tile's own lean (0.6 to 1.4 of the mean), how far a tile lies off the line (the tangent: about ten degrees)
  nap: 0.22, flip: 0.05, swap: 0.08, leanSpread: 0.8, off: 0.18,
  // the machine's lanes: their strength against a tile's lay (v4: 0.3 with hard edges), their edge (1 = a sine);
  // where people walk the pile is pressed flat by this share (v4: 0.45)
  tracks: 0.7, soft: 1.0, flat: 0.5,
  // the lean against the EYE under v5, against the hall's `carpetLean` (v4's 0.085: x 1.3 = 0.11)
  eye: 1.3,
  // (set by arithmetic before any picture, scratch/shell/napmodel-a7.mjs, the nap terms per pixel box in JS; against
  // v4 at the same boxes: at the broadcast pose beside the table 40 to 48 % of the 12 px blocks move by 5 levels or
  // more with the terms on (v4: 16 to 27 %), at V10 on the right the blocks' p90 - p10 is 7 levels (v4: 11, a checker).
  // At the island's far end, at level 40, a pile of this lean cannot move a block by 5: bound in the round's report.)
});

/**
 * The v4 patch as an adopt.patch spec (the same two anchors as v3, after-only). With side blades in the uniforms
 * (`uArenaKeyA`: carpetUniforms4 with `look4.sides`) it is the variant `arena-carpet-v4s`; with the hand's row too
 * (`uArenaHand`: `look4.hand`) it is `arena-carpet-v5`.
 */
export function carpetPatchSpec4(uniforms) {
  const sided = !!uniforms?.uArenaKeyA, v5 = sided && !!uniforms?.uArenaHand && !!CARPET_COLOR_5;
  return {
    key: v5 ? CARPET_PATCH_KEY_5 : sided ? CARPET_PATCH_KEY_4S : CARPET_PATCH_KEY_4, uniforms, pars: v5 ? CARPET_PARS_5 : sided ? CARPET_PARS_4S : CARPET_PARS_4,
    apply: [
      { anchor: '#include <color_fragment>', mode: 'after', code: v5 ? CARPET_COLOR_5 : sided ? CARPET_COLOR_4S : CARPET_COLOR_4 },
      { anchor: '#include <roughnessmap_fragment>', mode: 'after', code: CARPET_ROUGH_4 },
    ],
  };
}

/**
 * The v4 uniforms as plain arrays: carpetUniforms()' rows, re-read where v4 gives them another meaning, plus the
 * directed light. `keys`: up to CARPET_KEYS table keys `{ p: [x, y, z] (the lens, world), d: [x, y, z] (its axis, unit),
 * i: candela, cone: half angle in degrees, n: [x, y, z] (its shutter's normal: lit where dot(n, point - p) >= 0) }`;
 * `floorY`: the floor's height (the shutter is reduced to a line on it); `chairs`: `[{ x, z }]` (the players' chairs);
 * `marks`: up to CARPET_MARKS tape pieces `[x, z, half x, half z]`; `look4`: CARPET_4 with any override.
 */
export function carpetUniforms4(plan, { table = { cx: 0, cz: 0, hx: 1.45, hz: 0.82 }, gaps = [], look = CARPET, look4 = CARPET_4, mean = 0.8, rig = { length: 5.2, width: 3.0, bottomH: 3.24 }, keys = [], floorY = 0, chairs = [], marks = [] } = {}) {
  const u = carpetUniforms(plan, { table, gaps, look, mean, rig });
  u.uArenaWalk.value = [look4.ring, look4.ringHalf, plan.carpet.track, look.tracks];
  u.uArenaTape.value = [look.edgeContact, look4.tape, look4.tapeAlbedo, 0];
  u.uArenaRig.value = [rig.length / 2, rig.width / 2, rig.bottomH, look4.nap];
  const KP = [], KD = [], KS = [], KF = [];
  for (let i = 0; i < CARPET_KEYS; i++) {
    const k = keys[i];
    if (!k) { KP.push(0, 1e4, 0, 0); KD.push(0, -1, 0, 2); KS.push(0, 0, -1, 0); KF.push(0, 0, 1, 1); continue; }
    KP.push(k.p[0], k.p[1], k.p[2], k.i);
    KD.push(k.d[0], k.d[1], k.d[2], Math.cos(((k.cone ?? 24) * Math.PI) / 180));
    // dot(n, (X, floorY, Z) - p) >= 0  <=>  n.x X + n.z Z + (n.y (floorY - p.y) - n.x p.x - n.z p.z) >= 0
    KS.push(k.n[0], k.n[2], k.n[1] * (floorY - k.p[1]) - k.n[0] * k.p[0] - k.n[2] * k.p[2], 0);
    // the second blade (`foot`: its plane's normal, lit side; `soft`: the edge's half width on the carpet): the same
    // reduction, scaled so that the expression is metres into the lit side on the floor's plane. None: always lit.
    const f = k.foot, fl = f ? Math.hypot(f[0], f[2]) : 0;
    if (f && fl > 1e-6) KF.push(f[0] / fl, f[2] / fl, (f[1] * (floorY - k.p[1]) - f[0] * k.p[0] - f[2] * k.p[2]) / fl, k.soft ?? 0.37);
    else KF.push(0, 0, 1, 1);
  }
  u.uArenaKeyP = { value: KP }; u.uArenaKeyD = { value: KD }; u.uArenaKeyS = { value: KS }; u.uArenaKeyF = { value: KF };
  // the side blades (`look4.sides` > 0 and a key with `sides: [n, n]`, two vertical planes' normals, lit side between
  // them): the same reduction; `softSide`: the edge's half width on the carpet (the bake's side blade: 0.02 in the
  // sine at 4.6 m). A key without them: always lit. Without `look4.sides`, or when no key has side blades, the
  // uniforms are not made (the v4 text).
  if (look4.sides > 0 && keys.some((k) => k?.sides)) {
    const KA = [], KB = [];
    for (let i = 0; i < CARPET_KEYS; i++) {
      const k = keys[i];
      for (const [j, out] of [[0, KA], [1, KB]]) {
        const s = k?.sides?.[j], sl = s ? Math.hypot(s[0], s[2]) : 0;
        if (s && sl > 1e-6) out.push(s[0] / sl, s[2] / sl, (s[1] * (floorY - k.p[1]) - s[0] * k.p[0] - s[2] * k.p[2]) / sl, k.softSide ?? 0.09);
        else out.push(0, 0, 1, 1);
      }
    }
    u.uArenaKeyA = { value: KA }; u.uArenaKeyB = { value: KB };
    // (round A7, v5: the fitter's hand; only beside the side blades: `look4.hand` = { off, soft, flat })
    if (look4.hand) { u.uArenaHand = { value: [look4.hand.off, look4.hand.soft, look4.hand.flat, 0] }; u.uArenaPile.value[1] = look.lean * CARPET_5.eye; }
  }
  u.uArenaFill = { value: [look4.fillSW, look4.fillNE, look4.flat, look4.fillFall] };
  u.uArenaLay = { value: [look4.flip, look4.swap, look4.leanSpread, look4.lot] };
  // the floor in front of a player's chair: `seatOff` from the chair toward the table's centre
  const seats = chairs.slice(0, 2).map((c) => { const dx = table.cx - c.x, dz = table.cz - c.z, l = Math.hypot(dx, dz) || 1; return [c.x + (dx / l) * look4.seatOff, c.z + (dz / l) * look4.seatOff, look4.seat, 0]; });
  while (seats.length < 2) seats.push([1e4, 1e4, 0.5, 0]);
  u.uArenaSeat = { value: seats.flat() };
  const M = [];
  for (let i = 0; i < CARPET_MARKS; i++) { const m = marks[i]; M.push(...(m ? [m[0], m[1], m[2], m[3]] : [1e4, 1e4, 0, 0])); }
  u.uArenaMark = { value: M };
  return u;
}

/**
 * The v4 light model in JS (the same arithmetic as CARPET_COLOR_4, for the node arm and for bounds): at the floor
 * point (x, z) the model's light `sum` (units) and `grad` = [gx, gz] (the sum over the directed lights of light x the
 * horizontal direction to it x the cotangent of its elevation); `u` = carpetUniforms4()'s result, `floorY` the floor.
 */
export function carpetLightAt(x, z, u, floorY) {
  const T = u.uArenaTab.value, R = u.uArenaRig.value, Fl = u.uArenaFill.value;
  const ox = x - T[0], oz = z - T[1];
  const tx = Math.min(R[0], Math.max(-R[0], ox)) - ox, tz = Math.min(R[1], Math.max(-R[1], oz)) - oz, tl = Math.hypot(tx, tz);
  const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const sw = ss(-0.6, 0.6, 0.7 * oz - 0.4 * ox);
  const eRig = (Fl[1] + (Fl[0] - Fl[1]) * sw) / (1 + (tl * tl) / Math.max(Fl[3] * Fl[3], 0.01));
  let sum = eRig + Fl[2];
  const k0 = (eRig * Math.min(tl / Math.max(R[2], 0.5), 1.5)) / Math.max(tl, 1e-4);
  const grad = [k0 * tx, k0 * tz], keys = [];
  for (let i = 0; i < CARPET_KEYS; i++) {
    const P = u.uArenaKeyP.value.slice(4 * i, 4 * i + 4), D = u.uArenaKeyD.value.slice(4 * i, 4 * i + 4), S = u.uArenaKeyS.value.slice(4 * i, 4 * i + 4);
    const k = [P[0] - x, P[1] - floorY, P[2] - z], d2 = Math.max(k[0] * k[0] + k[1] * k[1] + k[2] * k[2], 1e-4), inv = 1 / Math.sqrt(d2);
    const c = -(k[0] * D[0] + k[1] * D[1] + k[2] * D[2]) * inv;
    const Fo = u.uArenaKeyF.value.slice(4 * i, 4 * i + 4);
    let w = ss(D[3] - 0.03, D[3] + 0.03, c) * (S[0] * x + S[1] * z + S[2] >= 0 ? 1 : 0) * ss(-Fo[3], Fo[3], Fo[0] * x + Fo[1] * z + Fo[2]);
    for (const side of [u.uArenaKeyA, u.uArenaKeyB]) if (side) { const A = side.value.slice(4 * i, 4 * i + 4); w *= ss(-A[3], A[3], A[0] * x + A[1] * z + A[2]); }
    const e = (P[3] * w * Math.max(k[1], 0) * inv) / d2;
    keys.push(e); sum += e;
    grad[0] += (e * k[0]) / Math.max(k[1], 0.2); grad[1] += (e * k[2]) / Math.max(k[1], 0.2);
  }
  return { sum, grad, rig: eRig, keys };
}

// ---- the backdrop: the floor lights' scallops as LIGHT (round A4) ---------------------------------------------------------
// The wash on the backdrop is one tube emitter of the room light (`hall.wash.0`): smooth along the cloth, hot at its
// foot, falling off upward; the bake holds it. A row of floor lights does not land smoothly: each unit leaves a
// scallop. Until round A3 the scallops were painted into the cloth's colour map, which is right under the wash alone
// and wrong under any other light. Now the map's ALPHA holds each point's share S of its row's light (../tex.js
// washScallops: every row has the mean `share`), and this text adds
//     wash(p) x ( S / share - 1 ) x the cloth's diffuse colour / pi
// to the fragment's diffuse light: `wash(p)` is the tube's own irradiance on the cloth at p by the room light's tube
// law (room/light.js: colour x intensity x window x cosine / (d^2 + half length x d + radius^2)), evaluated in the
// cloth's own frame from the map's UV (so a re-seated floor moves nothing). The term is zero in the mean of every
// row: the bake's light, its bounce and the cloth's exposure stay what they were; with the wash at 0 it is zero.
// It can take light away between two units; the sum of the fragment's diffuse light never goes under zero.
// Spliced after <lights_fragment_end> (after-only: the room light's own text after that include stays where it is).
// Round A5, the cloth's RELIEF under the wash. A row of floor lights grazes the cloth, and a grazing light shows
// every millimetre the cloth stands out of its plane: where it lies over one of the frame's rails (a ridge: its
// underside faces the lights, its upper side turns away), how it bows between two rails, the ripples of its tension.
// Until round A4 the rails were painted into the colour map (a light band under each, a dark one over it), which is
// right under this wash alone. Now they are LIGHT: the cloth's surface slope up the wall (dh/dy, analytic: the rails'
// ridges, the bow, the ripples) tilts the facet against the wash's own direction at the fragment, and the wash's
// light there is scaled by cos(tilted) / cos(flat). Only the wash is re-weighted (the term is zero with the wash at
// 0 and near zero in the mean); the house light and the bake's bounce see flat cloth.
export const BACKDROP_RELIEF = Object.freeze({ proud: 0.010, half: 0.045, bow: 0.012, ripple: 0.004 });
export const BACKDROP_PATCH_KEY = 'arena-backdrop-v2';
export const BACKDROP_PARS = /* glsl */`
uniform vec4 uArenaWashG;    // the cloth: x length, y height (m); the wash tube: z its distance from the cloth, w its height
uniform vec4 uArenaWashT;    // the tube: x centre along the cloth, y half length, z near-field radius, w window radius
uniform vec4 uArenaWashC;    // rgb colour x intensity, w on / off (tools)
uniform vec4 uArenaWashS;    // x the row share, y alpha offset, z alpha scale, w unused
uniform vec4 uArenaWashA;    // the tube's aim (round A5, a one-sided tube): x its normal's part up the cloth, y its part OUT of the cloth, z 1 = one-sided (0 = omni), w unused
uniform vec4 uArenaWashR;    // the frame's rails behind the cloth: x, y their heights (m), z how far the cloth stands proud over a rail (m), w the ridge's half width (m)
uniform vec4 uArenaWashB;    // x the cloth's bow between two rails (m), y the depth of its tension ripples (m), z the relief on / off (tools), w unused
float arenaWHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float arenaWNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( arenaWHash( i ), arenaWHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( arenaWHash( i + vec2( 0.0, 1.0 ) ), arenaWHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
`;
export const BACKDROP_LIGHT = /* glsl */`
#ifdef USE_MAP
{
  vec2 wP = vMapUv * uArenaWashG.xy;                                   // metres along the cloth, metres up it
  float wA = clamp( wP.x - uArenaWashT.x, - uArenaWashT.y, uArenaWashT.y );
  vec3 wL = vec3( uArenaWashT.x + wA - wP.x, uArenaWashG.w - wP.y, uArenaWashG.z );   // to the tube's nearest point (z: out of the cloth)
  float wD2 = dot( wL, wL );
  float wWin = wD2 / ( uArenaWashT.w * uArenaWashT.w );
  wWin = wWin >= 1.0 ? 0.0 : ( 1.0 - wWin * wWin ) * ( 1.0 - wWin * wWin );
  float wInv = inversesqrt( max( wD2, 1e-8 ) );
  float wCos = wL.z * wInv;
  // (a one-sided tube: the room light's cosine lobe around the emitter's normal, toward the fragment)
  float wEmit = mix( 1.0, max( - ( uArenaWashA.x * wL.y + uArenaWashA.y * wL.z ) * wInv, 0.0 ), uArenaWashA.z );
  vec3 wE = uArenaWashC.rgb * ( wEmit * wWin * wCos / ( wD2 + uArenaWashT.y * sqrt( wD2 ) + uArenaWashT.z * uArenaWashT.z ) );
  float wS = clamp( ( sampledDiffuseColor.a - uArenaWashS.y ) / uArenaWashS.z, 0.0, 1.0 );
  // the cloth's slope up the wall: the rails' ridges, the bow between two rails, the tension's ripples
  float wR0 = ( wP.y - uArenaWashR.x ) / uArenaWashR.w, wR1 = ( wP.y - uArenaWashR.y ) / uArenaWashR.w;
  float wSy = - 2.0 * uArenaWashR.z / uArenaWashR.w * ( wR0 * exp( - wR0 * wR0 ) + wR1 * exp( - wR1 * wR1 ) );
  float wBay = max( uArenaWashR.y - uArenaWashR.x, 0.5 );
  wSy += uArenaWashB.x * 3.14159265 / wBay * cos( 3.14159265 * fract( wP.y / wBay ) );
  wSy += uArenaWashB.y * ( arenaWNoise( vec2( wP.x * 1.3, ( wP.y + 0.03 ) * 7.0 ) ) - arenaWNoise( vec2( wP.x * 1.3, ( wP.y - 0.03 ) * 7.0 ) ) ) / 0.06;
  // the tilted facet against the wash's direction, over the flat cloth's (wL.z is the row's distance from the cloth)
  float wRel = mix( 1.0, clamp( 1.0 - wSy * wL.y / max( wL.z, 0.05 ), 0.0, 3.0 ), uArenaWashB.z );
  reflectedLight.indirectDiffuse += wE * ( wS / uArenaWashS.x * wRel - 1.0 ) * uArenaWashC.w * BRDF_Lambert( material.diffuseColor );
  reflectedLight.indirectDiffuse = max( reflectedLight.indirectDiffuse, - reflectedLight.directDiffuse );
}
#endif
`;

// ---- the exit signs: what a sign's own light leaves on the pier, the reveal and the door under it (round A5) -------------
// A sign is a small source (CONTRACT 17.4): its lit face and the window in its box's underside are emissive faces of
// the lens mesh. What that light leaves on the matt surfaces around it is added here, on the matt material alone,
// as LIGHT on the fragment's own diffuse colour: for each of the four signs a point at the box's lower front edge
// with two cosine lobes (the face, along the wall's inward normal; the window, straight down), each of an intensity
// that is its radiance x its area (a Lambert face's intensity along its normal), inverse square with a near-field
// radius, inside a reach of a metre and a half. No emitter of the room light is registered (the shell's share
// stays 4), nothing is baked (the light is a few tenths of a unit within half a metre of the box and reaches no other
// part's surface), and nothing depends on the camera. The matt mesh carries no table-shadow terms.
// The positions are the mesh's own (as built); the fragment's world position less the model matrix's translation
// gives the same frame when the room re-seats its floor.
export const SIGN_PATCH_KEY = 'arena-signglow-v1';
export const SIGN_PARS = /* glsl */`
uniform mat4 modelMatrix;
uniform vec4 uArenaSignP[ 4 ];   // xyz the source point as built (the box's lower front edge), w 1 = lit (0 = off, tools)
uniform vec4 uArenaSignN[ 4 ];   // xyz the wall's inward normal (the face's own), w unused
uniform vec4 uArenaSignF;        // rgb the face's radiance x its area (m2), w the near-field radius squared (m2)
uniform vec4 uArenaSignD;        // rgb the down window's radiance x its area (m2), w the reach (m)
`;
export const SIGN_LIGHT = /* glsl */`
{
  vec3 sP = vRoomWP - modelMatrix[ 3 ].xyz;
  vec3 sN = normalize( inverseTransformDirection( geometryNormal, viewMatrix ) );
  vec3 sE = vec3( 0.0 );
  for ( int i = 0; i < 4; i ++ ) {
    vec3 sL = uArenaSignP[ i ].xyz - sP;                     // to the source
    float sD2 = dot( sL, sL );
    float sW = sD2 / ( uArenaSignD.w * uArenaSignD.w );
    if ( sW >= 1.0 ) continue;
    sW = 1.0 - sW * sW; sW *= sW;
    vec3 sDir = sL * inversesqrt( max( sD2, 1e-8 ) );
    float sCos = max( dot( sN, sDir ), 0.0 );
    float sFace = max( - dot( sDir, uArenaSignN[ i ].xyz ), 0.0 );   // the fragment stands in front of the face
    float sDown = max( sDir.y, 0.0 );                               // the fragment stands under the window
    sE += ( uArenaSignF.rgb * sFace + uArenaSignD.rgb * sDown ) * ( uArenaSignP[ i ].w * sW * sCos / ( sD2 + uArenaSignF.w ) );
  }
  reflectedLight.indirectDiffuse += sE * BRDF_Lambert( material.diffuseColor );
}
`;

// ---- the roof's bells: what a lit bell leaves on the steel deck over it (round A5) --------------------------------------
// CONTRACT 17.2 for the roof: the lid and what hangs under it read only where a lit fixture is near. Nothing in the
// hall's bake points up (the lid holds a tenth of a unit of bounce: black), so the light a bell leaks through the vent
// ring at its top is added here, on the matt material alone and on the high tier alone, as LIGHT on the fragment's
// own diffuse colour: for each lit bell of the rig's roof plan a point at the bell's top with a narrow lobe straight
// up (cosine squared), inverse square with a near-field radius, inside a reach of a few metres, by the fragment's own
// normal (the deck's ribs take it face on, a tray's underside at a slant; whatever faces away stays a silhouette).
// No emitter of the room light is registered, nothing is baked, nothing depends on the camera. A fragment under the
// bells' tops skips the loop. The text rides in the sign patch (one patch on the matt material; it declares the
// model matrix): the positions are the mesh's own, as built.
export const ROOF_PATCH_KEY = 'arena-roofglow-v1';
export const ROOF_BELLS = 40;
export const ROOF = Object.freeze({ near: 0.2, reach: 4.5 });
export const ROOF_PARS = /* glsl */`
uniform vec4 uArenaBell[ ${ROOF_BELLS} ];   // xyz a lit bell's top as built, w its intensity straight up (0 = none)
uniform vec4 uArenaBellC;        // rgb the bells' tint, w the height (as built) under which no fragment takes this light
uniform vec4 uArenaBellR;        // x the near-field radius squared (m2), y the reach squared (m2); z, w unused
`;
export const ROOF_LIGHT = /* glsl */`
{
  vec3 bP = vRoomWP - modelMatrix[ 3 ].xyz;
  if ( bP.y > uArenaBellC.w ) {
    vec3 bN = normalize( inverseTransformDirection( geometryNormal, viewMatrix ) );
    float bE = 0.0;
    for ( int i = 0; i < ${ROOF_BELLS}; i ++ ) {
      vec3 bL = uArenaBell[ i ].xyz - bP;                      // to the bell's top
      float bD2 = dot( bL, bL );
      float bW = bD2 / uArenaBellR.y;
      if ( bW >= 1.0 || bL.y >= 0.0 ) continue;                // out of reach, or not over the bell's top
      bW = 1.0 - bW * bW; bW *= bW;
      float bI = inversesqrt( max( bD2, 1e-6 ) );
      float bUp = - bL.y * bI;                                 // the cosine of the angle off straight up, at the bell
      float bCos = max( dot( bN, bL ) * bI, 0.0 );
      bE += uArenaBell[ i ].w * bUp * bUp * bCos * bW / ( bD2 + uArenaBellR.x );
    }
    reflectedLight.indirectDiffuse += uArenaBellC.rgb * bE * BRDF_Lambert( material.diffuseColor );
  }
}
`;

/**
 * The roof term's uniforms as plain arrays. `bells`: up to ROOF_BELLS `{ p: [x, y, z] (a lit bell's top, as built),
 * i: its intensity straight up }`; `tint`: [r, g, b]; `under`: the height (as built) under which nothing is lit.
 */
export function roofUniforms({ bells, tint, under, near = ROOF.near, reach = ROOF.reach }) {
  const B = [];
  for (let i = 0; i < ROOF_BELLS; i++) { const b = bells[i]; B.push(...(b ? [b.p[0], b.p[1], b.p[2], b.i] : [0, -1e4, 0, 0])); }
  return { uArenaBell: { value: B }, uArenaBellC: { value: [tint[0], tint[1], tint[2], under] }, uArenaBellR: { value: [near * near, reach * reach, 0, 0] } };
}

/**
 * The bells' light in JS (the same arithmetic as ROOF_LIGHT, for the node arm and for bounds): the irradiance (times
 * the tint) at point `p` with unit normal `n` from the bells `[{ p, i }]`.
 */
export function bellOn(p, n, bells, { near = ROOF.near, reach = ROOF.reach } = {}) {
  let E = 0;
  for (const b of bells) {
    const l = [b.p[0] - p[0], b.p[1] - p[1], b.p[2] - p[2]], d2 = l[0] * l[0] + l[1] * l[1] + l[2] * l[2];
    let w = d2 / (reach * reach);
    if (w >= 1 || l[1] >= 0) continue;
    w = (1 - w * w) * (1 - w * w);
    const il = 1 / Math.sqrt(Math.max(d2, 1e-6)), up = -l[1] * il, cos = Math.max(0, (n[0] * l[0] + n[1] * l[1] + n[2] * l[2]) * il);
    E += (b.i * up * up * cos * w) / (d2 + near * near);
  }
  return E;
}

/**
 * The sign patch as an adopt.patch spec (the matt material; after-only, on a standard include). With `roof` (the
 * uniforms of roofUniforms) the same patch also carries the bells' light on the roof (ROOF_LIGHT), under another key.
 */
export function signPatchSpec(uniforms, roof = null) {
  if (!roof) return { key: SIGN_PATCH_KEY, uniforms, pars: SIGN_PARS, apply: [{ anchor: '#include <lights_fragment_end>', mode: 'after', code: SIGN_LIGHT }] };
  return { key: `${SIGN_PATCH_KEY}.${ROOF_PATCH_KEY}`, uniforms: { ...uniforms, ...roof }, pars: SIGN_PARS + ROOF_PARS, apply: [{ anchor: '#include <lights_fragment_end>', mode: 'after', code: SIGN_LIGHT + ROOF_LIGHT }] };
}

/**
 * Round A6: the bells' light as a patch of its own (the lid's material when the lid is a mesh of its own on the light
 * map). The hall's bake carries the bells' uplight from round A6 on, so this compiles only when a tool asks for the
 * stand-in again (`?arenahall=bellUp:<level>`: the off arm of a pair is the tree as it is).
 */
export function roofPatchSpec(roof) {
  return { key: ROOF_PATCH_KEY, uniforms: { ...roof }, pars: `uniform mat4 modelMatrix;\n${ROOF_PARS}`, apply: [{ anchor: '#include <lights_fragment_end>', mode: 'after', code: ROOF_LIGHT }] };
}

/**
 * The sign patch's uniforms as plain arrays. `signs`: up to four `{ p: [x, y, z] (as built), n: [x, y, z] }`; `face`,
 * `down`: [r, g, b] radiance x area of the lit face and of the down window; `near`: the near-field radius (m);
 * `reach`: the window radius (m).
 */
export function signUniforms({ signs, face, down, near = 0.08, reach = 1.5 }) {
  const P = [], N = [];
  for (let i = 0; i < 4; i++) { const s = signs[i]; P.push(...(s ? [s.p[0], s.p[1], s.p[2], 1] : [0, -1e4, 0, 0])); N.push(...(s ? [s.n[0], s.n[1], s.n[2], 0] : [0, 0, 1, 0])); }
  return {
    uArenaSignP: { value: P }, uArenaSignN: { value: N },
    uArenaSignF: { value: [face[0], face[1], face[2], near * near] },
    uArenaSignD: { value: [down[0], down[1], down[2], reach] },
  };
}

/**
 * The sign's light in JS (the same arithmetic as SIGN_LIGHT, for the node arm and for bounds): irradiance [r, g, b]
 * at point `p` with unit normal `n` from one sign `{ p, n }`.
 */
export function signOn(p, n, sign, { face, down, near = 0.08, reach = 1.5 }) {
  const l = [sign.p[0] - p[0], sign.p[1] - p[1], sign.p[2] - p[2]], d2 = l[0] * l[0] + l[1] * l[1] + l[2] * l[2];
  let w = d2 / (reach * reach);
  if (w >= 1) return [0, 0, 0];
  w = (1 - w * w) * (1 - w * w);
  const il = 1 / Math.sqrt(Math.max(d2, 1e-8)), dir = l.map((v) => v * il);
  const cos = Math.max(0, n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2]);
  const kf = Math.max(0, -(dir[0] * sign.n[0] + dir[1] * sign.n[1] + dir[2] * sign.n[2])), kd = Math.max(0, dir[1]);
  const k = (w * cos) / (d2 + near * near);
  return [0, 1, 2].map((c) => (face[c] * kf + down[c] * kd) * k);
}

/** The backdrop patch as an adopt.patch spec. */
export function backdropPatchSpec(uniforms) {
  return { key: BACKDROP_PATCH_KEY, uniforms, pars: BACKDROP_PARS, apply: [{ anchor: '#include <lights_fragment_end>', mode: 'after', code: BACKDROP_LIGHT }] };
}

/**
 * The backdrop patch's uniforms as plain arrays. `cloth` = { length, height }; `tube` = the wash emitter in the cloth's
 * frame: { off (its distance from the cloth), h (its height above the floor), centre (along the cloth), half (half its
 * length), radius (near field), window }; `color` = [r, g, b] linear x intensity; `share` = the scallop grid's row mean;
 * `alpha` = how the map's alpha holds the share ({ offset, scale }).
 */
export function backdropUniforms({ cloth, tube, color, share, alpha, relief = null }) {
  return {
    uArenaWashG: { value: [cloth.length, cloth.height, tube.off, tube.h] },
    uArenaWashT: { value: [tube.centre, tube.half, tube.radius, tube.window] },
    uArenaWashC: { value: [color[0], color[1], color[2], 1] },
    uArenaWashS: { value: [share, alpha.offset, alpha.scale, 0] },
    // (`tube.aim`: the one-sided tube's normal in the cloth's frame, [up the cloth, out of the cloth]; none = omni)
    uArenaWashA: { value: Array.isArray(tube.aim) ? [tube.aim[0], tube.aim[1], 1, 0] : [0, 0, 0, 0] },
    // (round A5) the cloth's relief under the wash: `relief` = { rails: [heights], proud, half, bow, ripple }; a rail
    // that is not there stands far under the floor
    uArenaWashR: { value: [relief?.rails?.[0] ?? -100, relief?.rails?.[1] ?? -100, relief?.proud ?? BACKDROP_RELIEF.proud, relief?.half ?? BACKDROP_RELIEF.half] },
    uArenaWashB: { value: [relief?.bow ?? BACKDROP_RELIEF.bow, relief?.ripple ?? BACKDROP_RELIEF.ripple, relief ? 1 : 0, 0] },
  };
}

/**
 * The room light's tube law in JS (the same arithmetic as BACKDROP_LIGHT, for the node arm and for bounds): the wash's
 * irradiance per unit of colour x intensity on the cloth at (s along it, h up it). `aim` (round A5): the one-sided
 * tube's normal in the cloth's frame, [up the cloth, out of the cloth]; without it the tube is omni.
 */
export function washOnCloth(s, h, { off, h: th, centre, half, radius, window, aim = null }) {
  const a = Math.min(half, Math.max(-half, s - centre));
  const lx = centre + a - s, ly = th - h, d2 = lx * lx + ly * ly + off * off;
  let w = d2 / (window * window);
  if (w >= 1) return 0;
  w = (1 - w * w) * (1 - w * w);
  const emit = Array.isArray(aim) ? Math.max(0, -(aim[0] * ly + aim[1] * off) / Math.sqrt(d2)) : 1;
  return (emit * w * (off / Math.sqrt(d2))) / (d2 + half * Math.sqrt(d2) + radius * radius);
}

/**
 * The patch's uniforms as plain arrays (three uploads an array as a vector): `plan` = shell/plan.js shellPlan(), `table` =
 * { cx, cz, hx, hz } (the table's footprint; the room moves it when it has read the real table), `gaps` = the boards'
 * walk-ins `[{ side, from, to }]` (layout.boards.gaps), `look` = CARPET with any override, `mean` = the colour map's mean.
 */
export function carpetUniforms(plan, { table = { cx: 0, cz: 0, hx: 1.45, hz: 0.82 }, gaps = [], look = CARPET, mean = 0.8, rig = { length: 5.2, width: 3.0, bottomH: 3.24 } } = {}) {
  const isl = plan.island, c = plan.carpet;
  // a way in: from the middle of a gap in the boards to the nearer corner of the table's head, kept 0.6 m off the table
  const ways = gaps.slice(0, 2).map((g) => {
    const z = g.side === 'north' ? isl.z0 : isl.z1, sign = g.side === 'north' ? -1 : 1;
    return [(g.from + g.to) / 2, z, table.cx - table.hx - 0.3, table.cz + sign * (table.hz + 0.6)];
  });
  while (ways.length < 2) ways.push([1e4, 1e4, 1e4 + 1, 1e4]);   // (no gap: a segment far outside the hall)
  return {
    uArenaIsl: { value: [isl.x0, isl.z0, isl.x1, isl.z1] },
    uArenaRoll: { value: [c.roll, c.outerRoll, look.seam, c.trim.width / 2 + c.trim.foot] },
    uArenaPile: { value: [look.sheen, look.lean, look.wear, look.mottle] },
    uArenaTab: { value: [table.cx, table.cz, table.hx, table.hz] },
    uArenaWalk: { value: [c.walk, c.walkWidth, c.track, look.tracks] },
    uArenaTape: { value: [look.edgeContact, 0, 0, 0] },
    uArenaIn: { value: ways.flat() },
    uArenaSw: { value: [1, 1, 1, 1] },
    // (round A5) the island's tiles and the yarn's grain; the rig over the table as the island's light: its half
    // length and half width (the heads hang on its long sides), its height over the floor, the lay's share
    uArenaTile: { value: [look.tile ?? CARPET.tile, look.tileSeam ?? CARPET.tileSeam, look.grain ?? CARPET.grain, look.grain2 ?? CARPET.grain2] },
    uArenaRig: { value: [rig.length / 2, rig.width / 2, rig.bottomH, look.lay ?? CARPET.lay] },
    // (the code-drawn canvas: grey, its mean `mean`, its own contrast; ../shell.js writes the scan's numbers when it loads)
    uArenaMean: { value: [mean, mean, mean, 0] },
    uArenaCon: { value: [1, 1, 1, 0] },
  };
}
