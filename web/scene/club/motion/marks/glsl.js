// Copyright (c) Meta Platforms, Inc. and affiliates.

// motion/marks/glsl.js — the marks term in the cloth material as text (CONTRACT.md section 12, owner: marks). No three
// import: the node arm reads it. One spec for club.adopt.patch on the app's cloth material (shading.js injectAnalytic,
// cloth mode), one `before` anchor, so it composes with the occlusion patch and the cloth part's patch in any order.
//
// Why a term in the cloth's own shader and not a decal mesh: a mark is a change of the cloth's ALBEDO, so it takes the
// lamp pool, the ball shadows, the cue shadow and the contact darkening exactly as the cloth beside it does, lies under
// every overlay (the aim line, the ball shadows) by construction, cannot z-fight, adds no mesh (nothing for the ball
// return's furniture walk to find) and no draw call. It costs ONE sampler on the cloth program: a 32 x 2 float texture of
// records, read with texelFetch.
//
// Where: right before <lights_physical_fragment>, the last point at which `diffuseColor` is the cloth's finished albedo
// (after the app's map, its wear terms and the cloth part's colour piece, all of which sit after <map_fragment>).
//
// With no record to draw the count is 0 and the branch is not taken: `diffuseColor` is not written, the texture is not
// read, and the cloth's pixels are the ones the program without this term gives.

/** Bump when the text of the patch changes: the number is part of the program cache key. */
export const MARKS_PATCH_VERSION = 1;
/** The most records one frame can draw (the loop bound and the width of the record texture). */
export const MARK_MAX = 32;

export const ANCHOR_MARKS = '#include <lights_physical_fragment>';

const PARS = /* glsl */`
uniform highp sampler2D uClubMarkTex; // row 0: a.x, a.z, b.x, b.z (world metres); row 1: half width (m), strength at a, strength at b, kind (0 burn, 1 chalk) + seed
uniform vec4 uClubMarkK;   // number of records, bed plane y, gain of a burn on the cloth's own colour, share of the cloth's luminance a burn adds as neutral light
uniform vec4 uClubMarkC;   // rgb: the albedo of chalk dust; w: the share of the cloth a chalk mark of strength 1 covers
uniform vec4 uClubMarkBox; // the records' bounds in the bed plane: min x, min z, max x, max z
`;

const TERM = /* glsl */`
{
  // screen derivatives are taken before the branch (they are undefined inside non-uniform control flow)
  vec2 clubMarkP = vSpikeWorldPos.xz;
  vec2 clubMarkDx = dFdx( clubMarkP ), clubMarkDy = dFdy( clubMarkP );
  if ( uClubMarkK.x > 0.5 && abs( vSpikeWorldPos.y - uClubMarkK.y ) < 0.003
    && clubMarkP.x > uClubMarkBox.x && clubMarkP.y > uClubMarkBox.y && clubMarkP.x < uClubMarkBox.z && clubMarkP.y < uClubMarkBox.w ) {
    float clubMarkBurn = 0.0, clubMarkChalk = 0.0;
    for ( int clubMarkI = 0; clubMarkI < ${MARK_MAX}; clubMarkI ++ ) {
      if ( float( clubMarkI ) >= uClubMarkK.x ) break;
      vec4 clubMarkS = texelFetch( uClubMarkTex, ivec2( clubMarkI, 0 ), 0 );
      vec4 clubMarkV = texelFetch( uClubMarkTex, ivec2( clubMarkI, 1 ), 0 );
      vec2 clubMarkPa = clubMarkP - clubMarkS.xy, clubMarkBa = clubMarkS.zw - clubMarkS.xy;
      float clubMarkL2 = dot( clubMarkBa, clubMarkBa );
      bool clubMarkLine = clubMarkL2 > 1e-9;
      float clubMarkH = clubMarkLine ? clamp( dot( clubMarkPa, clubMarkBa ) / clubMarkL2, 0.0, 1.0 ) : 0.0;
      float clubMarkDist = length( clubMarkPa - clubMarkBa * clubMarkH );
      // (the profile below: a burn, track or landing dot, is level over its middle half and falls off over the rest, so it
      // reads as a band or a spot at a small change of level; a chalk speck is a soft patch with no level part)
      // the pixel's size on the cloth across the mark: a mark narrower than a pixel is drawn a pixel wide and that much
      // fainter (the same light; no broken line at a distance, no shimmer under a moving eye)
      vec2 clubMarkT = clubMarkLine ? clubMarkBa * inversesqrt( clubMarkL2 ) : vec2( 0.0 );
      vec2 clubMarkN = vec2( - clubMarkT.y, clubMarkT.x );
      float clubMarkFoot = clubMarkLine
        ? abs( dot( clubMarkN, clubMarkDx ) ) + abs( dot( clubMarkN, clubMarkDy ) )
        : 0.5 * ( length( clubMarkDx ) + length( clubMarkDy ) );
      float clubMarkW = max( clubMarkV.x, 0.7 * clubMarkFoot );
      if ( clubMarkDist >= 1.6 * clubMarkW ) continue;
      float clubMarkThin = clubMarkV.x / clubMarkW; // a line keeps its light per length, a dot its light in all
      bool clubMarkSoft = clubMarkV.w >= 1.0 && ! clubMarkLine; // a chalk speck
      float clubMarkA = ( 1.0 - smoothstep( clubMarkSoft ? 0.0 : 0.5 * clubMarkW, clubMarkSoft ? 1.6 * clubMarkW : 1.3 * clubMarkW, clubMarkDist ) )
        * mix( clubMarkV.y, clubMarkV.z, clubMarkH ) * ( clubMarkLine ? clubMarkThin : clubMarkThin * clubMarkThin );
      float clubMarkSeed = fract( clubMarkV.w );
      if ( clubMarkV.w < 1.0 ) {
        // a burn is not an even line: the fibre catches more here and less there. Two slow waves along the track, placed
        // by world position (so the parts of a curved track join) and shifted by the mark's seed
        float clubMarkU = dot( clubMarkP, clubMarkT ) + clubMarkSeed * 7.0;
        clubMarkA *= 0.9 + 0.1 * sin( clubMarkU * 61.0 ) * sin( clubMarkU * 143.0 + clubMarkSeed * 40.0 );
        clubMarkBurn = max( clubMarkBurn, clubMarkA );
      } else {
        clubMarkChalk = max( clubMarkChalk, clubMarkA );
      }
    }
    // a burn: the glazed fibre returns more of the cloth's own colour and a little undyed light
    diffuseColor.rgb = diffuseColor.rgb * ( 1.0 + uClubMarkK.z * clubMarkBurn )
      + vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) * uClubMarkK.w * clubMarkBurn );
    // chalk: powder lying on the cloth covers a share of it (an areal mix, the form of the app's own chalk deposit)
    // (where chalk lies on a burn the two do not add up: the mark stays within the look's bound; and no channel moves by
    // more than a small share of itself and of the cloth's luminance: blue chalk on a dye with little blue must not shout)
    vec3 clubMarkAdd = ( uClubMarkC.rgb - diffuseColor.rgb ) * ( uClubMarkC.w * clubMarkChalk * ( 1.0 - 0.7 * clubMarkBurn ) );
    vec3 clubMarkCap = 0.07 * diffuseColor.rgb + vec3( 0.02 * dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) );
    diffuseColor.rgb += clamp( clubMarkAdd, - clubMarkCap, clubMarkCap );
  }
}
`;

/**
 * The look of a mark (all look values, set on the fixed views through the look's grade): how far a mark of strength 1 moves
 * the cloth's albedo. A burn multiplies the cloth's own colour by 1 + `burn` and adds `burnNeutral` of its luminance as
 * undyed light; chalk covers `chalkCover` of the cloth with powder of albedo `chalk` (a pale blue: generic cue chalk).
 * The node arm bounds them: no mark may move the albedo by more than a small share.
 */
export const MARKS_LOOK = Object.freeze({ burn: 0.066, burnNeutral: 0.0012, chalk: Object.freeze([0.1, 0.4, 0.75]), chalkCover: 0.014 });

/** The adopt.patch spec for one cloth material. `uniforms`: the part's shared uniform OBJECTS (marks.js). */
export function marksPatchSpec({ uniforms = {} } = {}) {
  return {
    key: `motion-marks-v${MARKS_PATCH_VERSION}`,
    uniforms,
    pars: PARS,
    apply: [{ anchor: ANCHOR_MARKS, mode: 'before', code: TERM }],
  };
}

/** Names of the uniforms the patch text declares (the node arm checks the part supplies exactly these). */
export function marksUniformNames() {
  return ['uClubMarkTex', 'uClubMarkK', 'uClubMarkC', 'uClubMarkBox'];
}
