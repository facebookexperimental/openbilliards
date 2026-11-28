// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/lamp.js — the main table's luminaire as the club look shows it (CONTRACT.md 9.2). Owner: lamp. Called by club/room.js.
//
// The app's light is not touched: its RectAreaLight(s), the shared emitter uniforms and the baked maps stay exactly as they are.
// This module owns only what is SEEN where that light comes from:
//
//   1. A club-built luminaire on the app's emitter rectangles (read every frame from the room's `lightRefs.rectLights`, so a
//      fixture or table change re-shapes it): room/lamp/model.js. Its emitting faces sit on the emitter rectangles and take the
//      app's own lamp-face colour every frame, so brightness and look changes carry over and the environment cube holds the same
//      radiance in the same place as before.
//   2. The app's own luminaire meshes (canopy face, hood, rods, or the active fixture's meshes) are not drawn under club. They
//      are hidden for the length of each render of the scene and put back right after it (scene.onBeforeRender / onAfterRender,
//      chained like club/env.js does), so no app property keeps a club value: the app's fade (scene/lampfade.js), its fixture
//      layer and its camera scripts go on writing their own properties and never see a difference.
//   3. The camera rule (room/lamp/rule.js): the luminaire is SOLID or ABSENT, never translucent at rest. It is absent when
//      its body would hide part of the playing surface in frame (COVER) and, under the default view policy `whole`, also
//      when the frame would hold only a band or a sliver of it (WHOLE: the lamp is shown well or not at all; at the app's
//      orbit radius the top edge of the frame cuts the shade at every pitch, and at the boot camera that band is 28 % of
//      the frame's height). A change of state is a short dissolve by ordered dither (no blending, no transparent pass, no
//      program change), and a camera cut changes state at once.
//      - a render through a CubeCamera (the environment cube, a probe) is the app's: see point 4;
//      - a render for which the app itself took its luminaire away (a scripted overhead move) gets none of ours either;
//      - the floor mirror follows COVER only: a lamp the frame merely cuts still hangs in the room, and the floor shows it.
//   4. The table's light does not move with this model. The app's cloth takes a large share of its light from the environment
//      cube (and the club look's ambient capture, the app's own probes), and the cube holds the lamp. So every render through
//      a CubeCamera is LEFT TO THE APP: this module does nothing for it, the app's own luminaire is drawn as the app has it
//      (its face, hood and rods, with its fade suspended by the app's bake bracket) and the club lamp is not. A cube render
//      is then the same picture as with the club lamp off, by construction. The club lamp is what cameras and the floor
//      mirror see. (What the balls and the lacquer mirror of the lamp is its emitting face, which is the same rectangle.)
//   5. The diffuser as a CAMERA sees it (and the floor mirror, which re-renders this mesh). The light it throws is the
//      app's and is not touched; what is drawn is a picture that survives the exposure of the table:
//      - a cut-off law in ABSOLUTE levels: a tube core is shown at FACE_SHOW[0] of a unit white to a level eye and at
//        FACE_SHOW[1] to a camera straight below, between them by smoothstep(c0, c1, c) of the light's own law (FACE_LAW;
//        c = cosine between the view ray and the vertical), times the app's brightness setting, in the HUE of the app's
//        lamp face. The app's face is 20 to 25 units of white on the canopy and 10 on the other fixtures: any share of
//        that which keeps a tube under white on one fixture clips it on the other, and round 2's law (0.07 to 1 of the
//        app's colour) gave every camera under the lamp a white slab;
//      - a display contrast on the published levels (room/lamp/face.js `levels`): the diffuser between two tube strips
//        (0.45 of a core) is drawn at 0.45 ^ FACE_GAMMA = 0.2, so the strips stay strips after the tone map;
//      - a frame with depth (model.js FRAME_DEPTH) and a lit inside that falls off toward the rim.
//
// Tool switches on the boot URL: ?clublamp=off (do not build: the app's luminaire and its fade stay), ?clublamp=solid|absent
// (pin the state), ?clublampview=whole|keep (the view policy: `whole` = the default, `keep` = COVER only, the round-2
// behaviour), ?clublamphang=<metres> (hang the visible lamp that much higher than the app's emitter plane: a tool, the
// light does not move), ?clublampstyle=r2 (the round-2 object and face: the off arm of the round-3 pairs),
// ?clublampcube=own (cube renders show this lamp, with its own face and glow, instead of the app's: the round-1b
// behaviour, the off arm of the cloth pair), ?clublampface=flat (no cut-off on the diffuser at all), ?clublampgrad=off (no
// gradient of the table's light on the shade), ?clublampspill=1|0|follow (register the lamp's glow with the room light, or
// do not, whatever the room asked for; `follow` = the glow follows the fixture instead of the baked canopy numbers: see
// lampSpillBaked). The same switches at run time, for pairs inside one boot: the built lamp's `set({ view, hang, style,
// mirrorGain })` (mirrorGain: a render of any camera but the player's, i.e. the floor mirror, is shown the diffuser at
// the LIGHT's radiance, the app face's colour through FACE_LAW, times this gain; 1 by default). Importing this module
// does nothing.
import * as THREE from 'three';
import { RULE, coverCount, nextState, bodyInFrame, frameShare, nextWhole } from './lamp/rule.js';
import { buildModel, classify, FACE_PANEL_V } from './lamp/model.js';
import { lampFace, lampSpill, lampSpillBaked, lampShield, FACE } from './lamp/face.js';

const FADE_S = 0.18;            // length of the dissolve between the two states
const CUT_M = 0.6;              // the eye moved this far between two frames: a cut, not a move
const CUT_COS = Math.cos((25 * Math.PI) / 180);
const GLASS_LEVEL = 0.55;      // radiance of the backlit glass and the lit paint at brightness 1 (scene-linear, before texture and vertex colour)
const FADE_KEY = 'club-lamp-fade-v4';
const PROBE_MAX_TRIANGLES = 40000; // the rod probe leaves out meshes larger than this
const SHADE_COLOR = 0x348a5c;   // green enamel
const BOUNCE_LEVEL = 1.9;       // irradiance from the lit table on a face at the rim that looks straight down, at brightness 1
const BOUNCE_FLAT = 0.8;        // the same without the gradient (?clublampgrad=off: one level over the whole lamp, as in round 1b)
const SHADE_MIRROR = 0.4;       // share of the table's mirror image the enamel's coat keeps (1 = as the cube holds the cloth: a blue rim from above)
// ... and none of it at grazing view angles: the cube is captured at the cloth, so a face seen edge-on from above mirrors
// "the cloth" at full Fresnel strength wherever its reflection points down (a saturated blue outline around the shade from
// a raised eye). Two parts: (1) the table's mirror image this module puts back fades out between these two cosines of the
// angle between the normal and the eye; (2) the CLEAR COAT's own cube lookups below the cube's horizon are faded as
// roomLight.material fades the base lobe's (room/light.js ENV_FRAGMENT fades `radiance` only: the coat kept the whole
// cloth, which is where the blue edge came from).
const GRAZE = [0.06, 0.5];
const CROWN_SHARE = 0.1;        // share of that light left at the crown (the body is in the way of the table up there)
const BRASS_COLOR = 0xdcb161;
const FACE_DEFAULT = [10, 9, 7.1]; // the app's canopy face colour, used only when the app's face cannot be read
// the diffuser's cut-off: radiance x (low + (1 - low) * smoothstep(c0, c1, cos of the angle between the view ray and straight down))
const FACE_LAW = [0.07, 0.5, 0.95];
// what a camera is shown of a tube core, in units of white at brightness 1: to a level eye, to a camera straight below (the
// header, point 5). Read against app frames at a seated eye: 0.55 put the strips near level 195 of 255 and the panel between
// them near 115 (a lamp that looks switched down); 1.4 and more clips the strips into the panel.
const FACE_SHOW = [0.8, 1.5];
const FACE_GAMMA = 2;           // display contrast of the diffuser's published panel level
const HANG_MAX = 0.4;           // ?clublamphang= is clamped to this (metres)

const FADE_PARS = /* glsl */`
uniform float uClubLampFade;
float clubLampDither( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
`;
const FADE_MAIN = /* glsl */`
if ( uClubLampFade < 0.999 && uClubLampFade <= clubLampDither( gl_FragCoord.xy ) ) discard;
`;
// the diffuser (the face material): the cut-off law, from the fragment's world position
const LAW_PARS_VERTEX = /* glsl */`
varying vec3 vClubLampWP;
`;
const LAW_VERTEX = /* glsl */`
vClubLampWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
`;
const LAW_PARS = /* glsl */`
varying vec3 vClubLampWP;
uniform vec4 uClubLampLaw;
uniform float uClubLampShow;
`;
const LAW_MAIN = /* glsl */`
{
  float lampC = abs( normalize( cameraPosition - vClubLampWP ).y );
  diffuseColor.rgb *= mix( uClubLampLaw.x, uClubLampLaw.w, smoothstep( uClubLampLaw.y, uClubLampLaw.z, lampC ) );
  diffuseColor.rgb *= uClubLampShow;
}
`;

// The environment cube is captured from just above the cloth, under the lamp. A reflection lookup from a surface of the lamp
// that lands on the lamp's own emitting face is not what that surface sees in that direction (it sees the ceiling), so those
// lookups take a ceiling radiance instead. uClubLampSelf = the faces' bounding rectangle relative to the capture point
// (centre x, centre z, half x, half z); uClubLampSelfUp = (height above the capture point, ceiling radiance rgb).
const SELF_PARS = /* glsl */`
uniform vec4 uClubLampSelf;
uniform vec4 uClubLampSelfUp;
float clubLampSelf( vec3 r ) {
  if ( r.y <= 0.0 ) return 0.0;
  vec2 hit = r.xz * ( uClubLampSelfUp.x / max( r.y, 1e-3 ) ) - uClubLampSelf.xy;
  vec2 soft = uClubLampSelf.zw * 0.5 + 0.25;
  vec2 m = 1.0 - smoothstep( uClubLampSelf.zw, uClubLampSelf.zw + soft, abs( hit ) );
  return m.x * m.y;
}
`;
// The lamp hangs right over the lit cloth: its outside is lit from below by the table, and its brass and lacquer mirror the
// cloth in every downward direction. Two terms, on the lamp's own lit materials only:
//   - diffuse: an irradiance from below (uClubLampBounce = the cloth's colour pulled toward white, times a level), strongest on
//     faces that look down, zero on faces that look straight up, and falling from the rim to the crown (uClubLampGrad: rim
//     height, crown height, share left at the crown): the skirt sees the cloth beside the lamp, the crown sees the lamp;
//   - mirror: the cube lookup for a reflection that goes DOWN and lands on the table (uClubLampTable = centre x, centre z,
//     half x, half z of the cloth). The cube is captured just above the cloth, so below its horizon it holds the lit cloth,
//     which is what the lamp sees there. roomLight.material fades those lookups out for the room's far surfaces
//     (room/light.js ENV_FRAGMENT: smoothstep( -0.30, 0.02, r.y )); for the lamp this puts the same share back, inside the
//     table's outline as seen from the fragment. (Coupled to those two numbers of light.js: see the report.)
const BOUNCE_PARS = /* glsl */`
uniform vec3 uClubLampBounce;
uniform vec4 uClubLampTable;
uniform vec4 uClubLampGrad;
uniform vec3 uClubLampGraze;
`;
const BOUNCE_MAIN = (withWorldPos, mirror = 1) => /* glsl */`
{
  vec3 lampBN = inverseTransformDirection( geometryNormal, viewMatrix );
  float lampH = 1.0;
  ${withWorldPos ? `{
    float lampT = 1.0 - clamp( ( vRoomWP.y - uClubLampGrad.x ) / max( uClubLampGrad.y - uClubLampGrad.x, 1e-3 ), 0.0, 1.0 );
    lampH = mix( uClubLampGrad.z, 1.0, lampT * sqrt( lampT ) );
  }` : ''}
  #if defined( RE_IndirectDiffuse )
    irradiance += uClubLampBounce * ( ( 0.5 - 0.5 * lampBN.y ) * lampH );
  #endif
  #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  {
    vec3 lampBR = inverseTransformDirection( reflect( - geometryViewDir, geometryNormal ), viewMatrix );
    float lampDown = ( 1.0 - smoothstep( -0.30, 0.02, lampBR.y ) ) * ${Number(mirror).toFixed(3)};
    lampDown *= smoothstep( uClubLampGraze.x, uClubLampGraze.y, abs( dot( geometryNormal, geometryViewDir ) ) );
    ${withWorldPos ? `if ( lampBR.y < -1e-3 ) {
      vec2 lampHit = vRoomWP.xz + lampBR.xz * ( vRoomWP.y / ( - lampBR.y ) ) - uClubLampTable.xy;
      vec2 lampIn = 1.0 - smoothstep( uClubLampTable.zw, uClubLampTable.zw + 0.35, abs( lampHit ) );
      lampDown *= lampIn.x * lampIn.y;
    }` : ''}
    if ( lampDown > 0.0 ) {
      radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness ) * lampDown;
      #ifdef USE_CLEARCOAT
        clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness ) * lampDown;
      #endif
    }
  }
  #endif
}
`;
const SELF_MAIN = /* glsl */`
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
{
  vec3 lampR = inverseTransformDirection( reflect( - geometryViewDir, geometryNormal ), viewMatrix );
  float lampSelf = clubLampSelf( lampR );
  radiance = mix( radiance, uClubLampSelfUp.yzw, lampSelf );
  #ifdef USE_CLEARCOAT
    clearcoatRadiance = mix( clearcoatRadiance, uClubLampSelfUp.yzw, lampSelf );
    // the coat's own lookups below the cube's horizon (the lit cloth): faded as the base lobe's are; the share of the table's
    // image that belongs there comes back in the bounce block, limited at grazing angles
    vec3 lampRC = inverseTransformDirection( reflect( - geometryViewDir, geometryClearcoatNormal ), viewMatrix );
    clearcoatRadiance *= mix( 1.0, smoothstep( -0.30, 0.02, lampRC.y ), uClubLampGraze.z );
  #endif
}
#endif
`;

// The diffuser as cameras see it: ONE PANEL of the face (room/lamp/face.js: every panel of a face is the same), drawn from the
// face's own numbers. Tube strips behind the panel in the layout the app's own face uses (three across a wide face, one
// along a narrow one), dimming toward both ends of the panel, as tubes do, so every panel reads as a lit pad between the
// cross bars. Canvas rows 32..160 = the panel (v 0..0.8, model.js FACE_PANEL_V), rows 0..24 = plain white (the frame takes its
// colour from the vertex colours there). The environment cube never sees this texture (the header, point 4).
const FACE_W = 256, FACE_H = 160;
function drawFace(cv, face, gamma = FACE_GAMMA) {
  const g = cv.getContext('2d');
  const top = Math.round(FACE_H * (1 - FACE_PANEL_V[1])), rows = FACE_H - top;
  const lv = face?.levels ?? FACE.levels;
  const size = face?.panelSize ?? [0.66, 0.64];
  const tubes = face?.tubes ?? [];
  const unit = (v, d) => Math.min(1, Math.max(0.02, Number.isFinite(v) ? v : d));
  // the diffuser between two strips glows at `levels.panel` of a strip's core (a prismatic panel spreads the tubes' light);
  // both ends of the panel fall to `levels.tubeEnd` of the level beside them over `tubeEnd` metres
  const panel = unit(lv.panel, 0.45), endLevel = unit(lv.tubeEnd, 0.35);
  const endLen = Math.min(0.45, (face?.tubeEnd ?? 0) / Math.max(size[0], 1e-3));
  const shown = Math.pow(panel, gamma); // the panel between two strips as it is drawn (display contrast)
  const enc = (v) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2)); // the texture is sRGB-encoded
  const img = g.createImageData(FACE_W, FACE_H), d = img.data;
  const across = new Float32Array(FACE_H);
  for (let y = 0; y < FACE_H; y++) {
    // metres from the panel's centre line (the rows above the panel repeat its first row: a margin for the filter)
    const a = ((Math.max(y, top) - top + 0.5) / rows - 0.5) * size[1];
    let t = 0;
    for (const tb of tubes) {
      const ext = Math.max(tb.half * (24 / 15.6), 1e-4); // the strip's full half width (the app's profile: 50 % at 15.6 of 24)
      t = Math.max(t, Math.min(1, Math.max(0, 1 - Math.abs(a - tb.offset) / ext) / 0.7));
    }
    across[y] = t * t * (3 - 2 * t);
  }
  for (let x = 0; x < FACE_W; x++) {
    const u = (x + 0.5) / FACE_W, e = endLen > 0 ? Math.min(1, Math.min(u, 1 - u) / endLen) : 1;
    const along = endLevel + (1 - endLevel) * (e * e * (3 - 2 * e));
    for (let y = 0; y < FACE_H; y++) {
      const o = 4 * (y * FACE_W + x);
      d[o + 3] = 255;
      if (y < top - 8) { d[o] = d[o + 1] = d[o + 2] = 255; continue; } // plain white: the frame's texel
      const t = across[y];
      const level = (shown + (1 - shown) * t) * along;
      d[o] = enc(level); d[o + 1] = enc(level * (0.95 + 0.015 * t)); d[o + 2] = enc(level * (0.82 + 0.066 * t));
    }
  }
  g.putImageData(img, 0, 0);
}
function faceTexture() {
  const cv = document.createElement('canvas');
  cv.width = FACE_W; cv.height = FACE_H;
  try { drawFace(cv, null); } catch { /* no 2d canvas: a plain white face */ }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.name = 'club.lamp.face';
  tex.userData.key = '';
  return tex;
}

// the glass of the band: the top quarter of the canvas is plain white (the lit paint inside takes its colour from there), the
// rest is warm opal glass, brightest at mid height where the tubes are, with soft clouds; it tiles along the band
function glassTexture() {
  const W = 256, H = 128, flat = 32;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, flat);
  const gr = g.createLinearGradient(0, flat, 0, H);
  gr.addColorStop(0, 'rgb(176,120,60)');
  gr.addColorStop(0.45, 'rgb(255,204,134)');
  gr.addColorStop(0.62, 'rgb(255,208,142)');
  gr.addColorStop(1, 'rgb(190,132,68)');
  g.fillStyle = gr; g.fillRect(0, flat, W, H - flat);
  let seed = 7411;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  g.save();
  g.beginPath(); g.rect(0, flat, W, H - flat); g.clip();
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W, y = flat + rnd() * (H - flat), r = 10 + rnd() * 26, dark = rnd() < 0.55;
    for (const dx of [-W, 0, W]) {
      const rg = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      rg.addColorStop(0, dark ? 'rgba(120,70,20,0.16)' : 'rgba(255,246,220,0.18)');
      rg.addColorStop(1, dark ? 'rgba(120,70,20,0)' : 'rgba(255,246,220,0)');
      g.fillStyle = rg; g.fillRect(x + dx - r, y - r, 2 * r, 2 * r);
    }
  }
  g.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.name = 'club.lamp.glass';
  return tex;
}

const smooth = (u) => u * u * (3 - 2 * u);

export async function buildLamp(club, { box = null, floorY = null, tableBounds = null, roomLight = null, appRoom = null, spill = false } = {}) {
  const ctx = club?.ctx ?? {};
  const scene = ctx.scene?.isScene ? ctx.scene : null;
  const win = typeof window !== 'undefined' ? window : null;
  const group = new THREE.Group();
  group.name = 'clubLamp';
  // where the build's time went (ms since the call), kept in state().build
  const clockNow = () => { try { return performance.now(); } catch { return Date.now(); } };
  const builtAt = clockNow(), build = { textures: null, materials: null, model: null, bed: null, total: null };
  const lap = (k) => { build[k] = Math.round((clockNow() - builtAt) * 10) / 10; };
  const off = (reason) => ({
    enabled: false, reason, group, emissives: [], update() {}, setTier() { return false; },
    counts: () => ({ drawCalls: 0, triangles: 0, materials: 0, textures: 0, textureBytes: 0 }), state: () => ({ enabled: false, reason }), dispose() {},
  });
  const queryOf = (k) => { try { return ctx.query?.get?.(k) ?? null; } catch { return null; } };
  const mode = queryOf('clublamp');
  // tool switches (the off arms of the pairs; see the header)
  const hangOf = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(HANG_MAX, Math.max(0, n)) : 0; };
  const tool = {
    cubeOwn: queryOf('clublampcube') === 'own', faceFlat: queryOf('clublampface') === 'flat', gradOff: queryOf('clublampgrad') === 'off',
    spill: (spill === true || ['1', 'follow'].includes(queryOf('clublampspill'))) && queryOf('clublampspill') !== '0',
    spillFollow: queryOf('clublampspill') === 'follow',
    // round 3: the view policy ('whole' | 'keep'), the tool hang (metres over the app's emitter plane), the style ('r3' | 'r2'),
    // and a gain on what the floor mirror is shown of the diffuser (1 = the light's own radiance)
    view: queryOf('clublampview') === 'keep' ? 'keep' : 'whole', hang: hangOf(queryOf('clublamphang') ?? 0),
    style: queryOf('clublampstyle') === 'r2' ? 'r2' : 'r3', mirrorGain: 1,
  };
  const room = appRoom ?? ctx.room ?? null;
  const lr = room?.lightRefs ?? null;
  if (!lr) return off('the app room has no lightRefs');

  // ---- what the app lights the table with ------------------------------------------------------------------------------------
  const corner = new THREE.Vector3();
  function readEmitters() {
    const out = [];
    for (const l of lr.rectLights ?? []) {
      if (!l?.isRectAreaLight || l.visible === false || !(l.intensity > 0)) continue;
      l.updateWorldMatrix(true, false);
      let ax = Infinity, bx = -Infinity, az = Infinity, bz = -Infinity, y = 0;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        corner.set((sx * l.width) / 2, (sy * l.height) / 2, 0).applyMatrix4(l.matrixWorld);
        ax = Math.min(ax, corner.x); bx = Math.max(bx, corner.x); az = Math.min(az, corner.z); bz = Math.max(bz, corner.z);
        y += corner.y / 4;
      }
      const r = (v) => Math.round(v * 1e4) / 1e4;
      const e = { x: r((ax + bx) / 2), y: r(y), z: r((az + bz) / 2), w: r(bx - ax), d: r(bz - az) };
      if (e.w > 0.02 && e.d > 0.02 && Number.isFinite(e.y)) out.push(e);
    }
    return out;
  }
  const signature = (list, ceil, detail) => `${detail}|${ceil.toFixed(3)}|` + list.map((e) => `${e.x},${e.y},${e.z},${e.w},${e.d}`).join(';');

  // ---- the lamp's own glow as a fixed emitter of the room light (lampSpill). Registered only when the room asks for it
  // (`spill: true` in the build args) or a tool does (?clublampspill=1): a new emitter id changes the signature the room's
  // baked map is checked against, so admitting it is the room owner's decision. Its level is fixed (the bake holds it).
  const spillState = { on: tool.spill, follow: tool.spillFollow, registered: [], error: null };
  function registerSpill(list) {
    if (!tool.spill || typeof roomLight?.addEmitter !== 'function') return;
    try {
      const specs = tool.spillFollow ? lampSpill(list) : lampSpillBaked();
      for (const id of spillState.registered) if (!specs.some((sp) => sp.id === id)) roomLight.removeEmitter?.(id);
      spillState.registered = [];
      for (const sp of specs) {
        roomLight.addEmitter({
          id: sp.id, type: sp.type, position: new THREE.Vector3(...sp.position), axis: new THREE.Vector3(...sp.axis), size: sp.size.slice(),
          color: new THREE.Color(...sp.color), intensity: sp.intensity, radius: sp.radius,
        });
        spillState.registered.push(sp.id);
      }
    } catch (e) { spillState.error = String(e?.message ?? e); }
  }
  // ?clublamp=off switches the visible object only: the room keeps the same emitter list (and so the same baked map) in both
  // arms of a pair
  if (mode === 'off') {
    try { registerSpill(readEmitters()); } catch { /* the room stands without the glow */ }
    return { ...off('off by ?clublamp=off'), state: () => ({ enabled: false, reason: 'off by ?clublamp=off', spill: { ...spillState, registered: spillState.registered.slice() } }) };
  }

  // the ceiling the rods reach: the club room's height above the app floor, which re-seats per table class
  const floor0 = Number.isFinite(floorY) ? floorY : (Number.isFinite(lr.floor?.position?.y) ? lr.floor.position.y : -0.79);
  const height = Number.isFinite(box?.max?.y) ? box.max.y - floor0 : 3.24;
  const ceilNow = () => (Number.isFinite(lr.floor?.position?.y) ? lr.floor.position.y : floor0) + height;

  // ---- materials (made once; the geometry is rebuilt when the emitter set changes) -----------------------------------------
  let detail = [0, 1, 2].includes(club?.knobs?.roomDetail) ? club.knobs.roomDetail : 1;
  const uFade = { value: 1 };
  const patch = { done: [], missed: [] };
  const uSelf = { value: new THREE.Vector4(0, 0, 1.03, 0.33) }, uSelfUp = { value: new THREE.Vector4(0.9, 0.11, 0.095, 0.075) };
  const uBounce = { value: new THREE.Color(0.64, 0.7, 0.8) }, uTable = { value: new THREE.Vector4(0, 0, 1.3, 0.67) };
  // x rim height, y crown height, z share of the table's light left at the crown, w unused
  const uGrad = { value: new THREE.Vector4(0.93, 1.34, tool.gradOff ? 1 : CROWN_SHARE, 0) };
  // x low, y c0, z c1 (the light's law, FACE_LAW: `face().law` publishes these three), w the peak a camera is shown in the
  // place of 1 (round 3: FACE_SHOW[1] / FACE_SHOW[0] of low; round-2 style: 1). uShow scales the app face's colour (which
  // the material keeps, as other modules read it there) so that low x colour = FACE_SHOW[0] of a unit white (see tick).
  const PEAK = FACE_LAW[0] * FACE_SHOW[1] / FACE_SHOW[0];
  const uLaw = { value: new THREE.Vector4(FACE_LAW[0], FACE_LAW[1], FACE_LAW[2], PEAK) };
  const uShow = { value: 1 };
  const uGraze = { value: new THREE.Vector3(GRAZE[0], GRAZE[1], 1) }; // z: the coat's fade below the horizon (0 = round 2)
  function applyStyle() {
    const r2 = tool.style === 'r2';
    if (tool.faceFlat) uLaw.value.set(1, FACE_LAW[1], FACE_LAW[2], 1);
    else uLaw.value.set(FACE_LAW[0], FACE_LAW[1], FACE_LAW[2], r2 ? 1 : PEAK);
    if (r2 || tool.faceFlat) uShow.value = 1;
    if (r2) uGraze.value.set(-2, -1, 0); else uGraze.value.set(GRAZE[0], GRAZE[1], 1); // round 2: no limit at grazing angles
  }
  applyStyle();
  // kind: 'lit' (shade, brass: dissolve + self mask + the table's light), 'glow' (dissolve), 'face' (dissolve + cut-off)
  function fadePatch(m, kind, { mirror = 1 } = {}) {
    const litSelf = kind === 'lit';
    // (a material without its own key function gets the plain key: three's default is the hook's source text)
    const prevCompile = m.onBeforeCompile, prevKey = Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') ? m.customProgramCacheKey : null;
    m.onBeforeCompile = function clubLampFade(shader, renderer) {
      if (typeof prevCompile === 'function') prevCompile.call(this, shader, renderer);
      const f = shader.fragmentShader, v = shader.vertexShader;
      const need = ['#include <clipping_planes_pars_fragment>', '#include <clipping_planes_fragment>']
        .concat(litSelf ? ['#include <lights_fragment_maps>', '#include <lights_fragment_end>'] : kind === 'face' ? ['#include <color_fragment>'] : []);
      const needVertex = kind === 'face' ? ['#include <common>', '#include <project_vertex>'] : [];
      if (need.some((a) => !f.includes(a)) || needVertex.some((a) => !v.includes(a))) {
        if (!patch.missed.includes(m.name)) { patch.missed.push(m.name); console.error(`[club] lamp: shader anchors missing in '${m.name}' (it is drawn unpatched: no dissolve)`); }
        return;
      }
      shader.uniforms.uClubLampFade = uFade;
      if (litSelf) { shader.uniforms.uClubLampSelf = uSelf; shader.uniforms.uClubLampSelfUp = uSelfUp; shader.uniforms.uClubLampBounce = uBounce; shader.uniforms.uClubLampTable = uTable; shader.uniforms.uClubLampGrad = uGrad; shader.uniforms.uClubLampGraze = uGraze; }
      else if (kind === 'face') { shader.uniforms.uClubLampLaw = uLaw; shader.uniforms.uClubLampShow = uShow; }
      const pars = litSelf ? SELF_PARS + BOUNCE_PARS : kind === 'face' ? LAW_PARS : '';
      let out = f
        .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>\n${FADE_PARS}${pars}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FADE_MAIN}`);
      if (litSelf) {
        // the fragment's world position is a varying of roomLight.material; a plain fallback material has none
        const withWorldPos = f.includes('varying vec3 vRoomWP');
        out = out.replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${SELF_MAIN}`)
          .replace('#include <lights_fragment_end>', `${BOUNCE_MAIN(withWorldPos, mirror)}\n#include <lights_fragment_end>`);
      } else if (kind === 'face') {
        out = out.replace('#include <color_fragment>', `#include <color_fragment>\n${LAW_MAIN}`);
        shader.vertexShader = v.replace('#include <common>', `#include <common>\n${LAW_PARS_VERTEX}`)
          .replace('#include <project_vertex>', `#include <project_vertex>\n${LAW_VERTEX}`);
      }
      shader.fragmentShader = out;
      if (!patch.done.includes(m.name)) patch.done.push(m.name);
    };
    m.customProgramCacheKey = function clubLampKey() {
      let k = '';
      try { k = typeof prevKey === 'function' ? String(prevKey.call(this)) : ''; } catch { k = ''; }
      return `${k}|${FADE_KEY}+${kind}${litSelf ? `+m${mirror}` : ''}`;
    };
    return m;
  }
  const lit = (p) => {
    let m = null;
    try { m = typeof roomLight?.material === 'function' ? roomLight.material(p) : null; } catch { m = null; }
    if (!m) {
      // no room light service: a plain lit material with the same parameters
      m = p.physical ? new THREE.MeshPhysicalMaterial({ clearcoat: p.clearcoat ?? 0, clearcoatRoughness: p.clearcoatRoughness ?? 0 }) : new THREE.MeshStandardMaterial();
      m.color.set(p.color); m.roughness = p.roughness; m.metalness = p.metalness; m.vertexColors = p.vertexColors === true;
      m.envMapIntensity = p.envMapIntensity ?? 1; m.name = p.name;
    }
    return fadePatch(m, 'lit', { mirror: p.tableMirror ?? 1 });
  };
  const faceTex = faceTexture(), glassTex = glassTexture();
  lap('textures');
  // enamel under a clear coat; brass as lacquered sheet (not a pure mirror: a share of it takes diffuse light, so it stays
  // warm where it mirrors a dark ceiling)
  const mats = {
    shade: lit({ color: SHADE_COLOR, roughness: 0.42, metalness: 0, physical: detail > 0, clearcoat: 1, clearcoatRoughness: 0.14, envMapIntensity: 0.6, vertexColors: true, tableMirror: SHADE_MIRROR, name: 'club.lamp.shade' }),
    brass: lit({ color: BRASS_COLOR, roughness: 0.27, metalness: 0.82, envMapIntensity: 1.25, vertexColors: true, name: 'club.lamp.brass' }),
    glow: fadePatch(new THREE.MeshBasicMaterial({ map: glassTex, vertexColors: true, name: 'club.lamp.glow' }), 'glow'),
    face: fadePatch(new THREE.MeshBasicMaterial({ map: faceTex, vertexColors: true, name: 'club.lamp.face' }), 'face'),
  };
  mats.glow.userData.clubRoom = 'emissive'; mats.face.userData.clubRoom = 'emissive';
  lap('materials');
  const meshes = {};
  for (const k of ['shade', 'brass', 'glow', 'face']) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mats[k]);
    mesh.name = `clubLamp.${k}`;
    mesh.visible = false;
    meshes[k] = mesh;
    group.add(mesh);
  }

  // ---- what a rod meets above the lamp: the ceiling, or a beam of the club room that runs over the table ------------------------
  // One ray per rod, at build time only, against the meshes of the room that stand over that point (never the whole scene).
  const ray = new THREE.Raycaster(), rayFrom = new THREE.Vector3(), rayUp = new THREE.Vector3(0, 1, 0), probeBox = new THREE.Box3();
  const roomRoot = () => {
    const r = club?.room?.group?.isObject3D ? club.room.group : (group.parent && group.parent !== scene ? group.parent : null);
    return r ?? null;
  };
  const probe = { root: null, rays: 0, hits: 0, skipped: 0 };
  function ceilAt(x, z, fromY) {
    const ceil = ceilNow();
    const root = probe.root;
    if (!root) return ceil;
    let best = ceil;
    try {
      rayFrom.set(x, fromY + 0.05, z);
      ray.set(rayFrom, rayUp); ray.near = 0; ray.far = Math.max(0.1, ceil - fromY + 0.5);
      probe.rays += 1;
      root.updateWorldMatrix(true, true);
      root.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        for (let p = o; p; p = p.parent) if (p === group) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        probeBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        if (x < probeBox.min.x || x > probeBox.max.x || z < probeBox.min.z || z > probeBox.max.z || probeBox.max.y < fromY + 0.05) return;
        // a ray test visits every triangle of a mesh: the room's shell (beams, ceiling) is a few thousand; the big merged
        // prop batches are not over the table and are left out
        const tris = ((o.geometry.index?.count ?? o.geometry.attributes.position?.count ?? 0) / 3) * (o.isInstancedMesh ? o.count : 1);
        if (tris > PROBE_MAX_TRIANGLES) { probe.skipped += 1; return; }
        const hit = ray.intersectObject(o, false)[0];
        if (hit && hit.point.y < best) best = hit.point.y;
      });
      if (best < ceil) probe.hits += 1;
    } catch { best = ceil; }
    return best;
  }

  // ---- build / rebuild -------------------------------------------------------------------------------------------------------
  let model = null, sig = '', rebuilds = 0, modelVersion = 0, lastError = null;
  function rebuild(force = false) {
    if (win?.__cinelight === true && model) return false; // a studio window owns the lights: keep what hangs
    const list = readEmitters();
    if (!list.length) return false;
    const ceil = ceilNow();
    probe.root = roomRoot();
    const s = signature(list, ceil, detail) + `|${probe.root?.uuid ?? 'no room'}|${tool.hang}|${tool.style}`;
    if (!force && s === sig) return false;
    // ?clublamphang: the visible lamp hangs that much higher than the emitters (a tool: the light and face() do not move)
    const hung = tool.hang > 0 ? list.map((e) => ({ ...e, y: Math.round((e.y + tool.hang) * 1e4) / 1e4 })) : list;
    const next = buildModel(hung, { detail, ceilY: ceil, ceilAt, r2: tool.style === 'r2' });
    for (const k of Object.keys(meshes)) {
      const old = meshes[k].geometry;
      meshes[k].geometry = next.parts[k].geometry();
      meshes[k].visible = next.parts[k].triangles > 0;
      old.dispose();
    }
    // the panel texture follows the face's layout (tube strips, panel proportions); drawn again only when that changed
    const f0 = next.face?.faces?.[0] ?? null;
    const gamma = tool.style === 'r2' ? 1 : FACE_GAMMA;
    const key = (f0 && f0.shape === 'rect' ? `${f0.tubes.map((t) => `${t.offset},${t.half}`).join(';')}|${f0.panelSize.join('x')}|${f0.tubeEnd}` : 'plain') + `|g${gamma}`;
    if (faceTex.userData.key !== key) {
      try { drawFace(faceTex.image, f0 && f0.shape === 'rect' ? f0 : null, gamma); faceTex.userData.key = key; faceTex.needsUpdate = true; } catch { /* keeps the last drawing */ }
    }
    uGrad.value.x = next.span.lo; uGrad.value.y = Math.max(next.span.lo + 0.05, next.span.top);
    model = next; sig = s; rebuilds += 1; modelVersion += 1;
    registerSpill(list);
    return true;
  }


  // ---- the playing surface (for the camera rule) --------------------------------------------------------------------------------
  const bed = { minX: -1.27, maxX: 1.27, minZ: -0.635, maxZ: 0.635, from: 'default' };
  const tmpBox = new THREE.Box3(), clothBox = new THREE.Box3();
  let bedVersion = 0;
  function readBed() {
    let got = false;
    try {
      clothBox.makeEmpty();
      const root = ctx.table?.group?.isObject3D ? ctx.table.group : scene;
      root?.traverse?.((o) => {
        if (!o.isMesh || !o.material) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        if (!ms.some((m) => m?.userData?.obClass === 'cloth')) return;
        tmpBox.setFromObject(o);
        if (!tmpBox.isEmpty()) clothBox.union(tmpBox);
      });
      const w = clothBox.max.x - clothBox.min.x, d = clothBox.max.z - clothBox.min.z;
      if (!clothBox.isEmpty() && w > 1 && w < 5 && d > 0.5 && d < 3) {
        got = true;
        if (bed.minX !== clothBox.min.x || bed.maxX !== clothBox.max.x || bed.minZ !== clothBox.min.z || bed.maxZ !== clothBox.max.z) bedVersion += 1;
        bed.minX = clothBox.min.x; bed.maxX = clothBox.max.x; bed.minZ = clothBox.min.z; bed.maxZ = clothBox.max.z; bed.from = 'cloth';
      }
    } catch { got = false; }
    if (!got && bed.from === 'default' && tableBounds && Number.isFinite(tableBounds.minX)) {
      const k = 1.55 + 0.18; // the keep-out rectangle is the table plus the stroke room; the rails are about 0.18 m
      const b = { minX: tableBounds.minX + k, maxX: tableBounds.maxX - k, minZ: tableBounds.minZ + k, maxZ: tableBounds.maxZ - k };
      if (b.maxX - b.minX > 1 && b.maxZ - b.minZ > 0.5) { Object.assign(bed, b, { from: 'tableBounds' }); bedVersion += 1; }
    }
  }

  // ---- the app's own luminaire meshes ---------------------------------------------------------------------------------------------
  let appAll = [], appActive = [], appLightsRef = null, appFace = null;
  function readApp() {
    const canopy = [lr.lampFace, lr.hood, ...(lr.rods ?? [])].filter((o) => o?.isObject3D);
    let fx = null;
    try { fx = win?.__lighting?.fixtureMeshes?.() ?? null; } catch { fx = null; }
    const list = Array.isArray(fx) ? fx.filter((o) => o?.isObject3D) : [];
    appAll = canopy.concat(list);
    appActive = list.length ? list : canopy;
    appLightsRef = lr.rectLights ?? null;
    appFace = null;
    for (const m of list) { if (m.material?.isMeshBasicMaterial && m.material.color?.isColor) { appFace = m.material.color; break; } }
    if (!appFace && lr.lampFace?.material?.color?.isColor) appFace = lr.lampFace.material.color;
  }
  // `mine`: the app meshes this module holds hidden right now. A render nested in another one (the floor mirror is drawn from
  // inside the player's render) finds them hidden by the outer render's hook: that is not the app taking its luminaire out.
  const mine = new Set();
  const chainShown = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false && !mine.has(p)) return false; return true; };
  // in the scene, under groups that are shown (the club room is built hidden and shown in one step: until then the app's
  // luminaire stays on screen)
  const attached = () => { for (let p = group.parent; p; p = p.parent) { if (p.visible === false) return false; if (p === scene) return true; } return false; };

  // ---- the camera rule ---------------------------------------------------------------------------------------------------------
  // `target` / `fade`: what the player's view shows. `room` / `fadeRoom`: COVER alone (what the floor mirror shows: a lamp
  // the frame merely cuts still hangs in the room). `reason`: why the player's view has no lamp, or null.
  const st = {
    target: null, fade: 1, forced: mode === 'solid' || mode === 'absent' ? mode : null,
    room: null, fadeRoom: 1, reason: null,
    cover: { visible: 0, tight: 0, loose: 0 }, whole: { state: null, inFrame: 1, ofFrame: 0 }, evals: 0, cuts: 0, changes: 0,
  };
  let serial = 0, evalSerial = -1, dtAcc = 0, camHint = null, hasPrev = false, snapNext = false;
  // The app's own fade has a staging-boundary law: playback seeks and the first frame of an export call
  // window.__lampfade.snapNext() so that frame is a pure function of its pose (no dissolve carried over a seek). The same call
  // is listened to here (the app's function runs unchanged), so club frames keep that law.
  const snapTap = { on: false, orig: null, wrapped: null };
  function tapSnap() {
    if (snapTap.on) return;
    const lf = win?.__lampfade;
    if (!lf || typeof lf.snapNext !== 'function') return;
    snapTap.orig = lf.snapNext;
    snapTap.wrapped = function clubLampSnapNext(...a) { snapNext = true; return snapTap.orig.apply(this, a); };
    try { lf.snapNext = snapTap.wrapped; snapTap.on = true; } catch { /* a sealed seam: no staging snap */ }
  }
  function untapSnap() {
    const lf = win?.__lampfade;
    if (snapTap.on && lf && lf.snapNext === snapTap.wrapped) lf.snapNext = snapTap.orig;
    snapTap.on = false;
  }
  const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), prevEye = new THREE.Vector3(), prevFwd = new THREE.Vector3();
  const vp = new THREE.Matrix4();
  const camSig = new Float64Array(13);
  let coverKey = '';
  function evaluate(cam) {
    evalSerial = serial;
    st.evals += 1;
    eye.setFromMatrixPosition(cam.matrixWorld);
    cam.getWorldDirection(fwd);
    // a cut: the first frame, a jump of the camera, or a staging boundary the app announced (a seek, the first frame of an export)
    const cut = !hasPrev || snapNext || eye.distanceTo(prevEye) > CUT_M || fwd.dot(prevFwd) < CUT_COS;
    snapNext = false;
    prevEye.copy(eye); prevFwd.copy(fwd); hasPrev = true;
    let target, roomState, reason = null;
    if (st.forced) { target = roomState = st.forced; reason = st.forced === 'absent' ? 'pinned' : null; }
    else if (!model) target = roomState = 'solid';
    else {
      // the counts are a pure function of the pose, the body and the bed: recompute only when one of them moved
      const e = cam.matrixWorld.elements, p = cam.projectionMatrix.elements;
      let same = coverKey === `${modelVersion}|${bedVersion}`;
      const now = [e[12], e[13], e[14], e[8], e[9], e[10], e[0], e[1], e[2], p[0], p[5], p[8], p[9]];
      for (let i = 0; i < 13; i++) { if (camSig[i] !== now[i]) { same = false; camSig[i] = now[i]; } }
      if (!same) {
        coverKey = `${modelVersion}|${bedVersion}`;
        vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        const arg = { eye: [eye.x, eye.y, eye.z], viewProj: vp.elements, bed, boxes: model.boxes };
        const t = coverCount({ ...arg, margin: RULE.tight });
        st.cover.visible = t.visible; st.cover.tight = t.covered;
        st.cover.loose = t.covered > 0 ? t.covered : coverCount({ ...arg, margin: RULE.loose }).covered;
        // WHOLE: how much of the body the frame holds, and how much of the frame the body fills
        if (cam.isPerspectiveCamera && Math.abs(p[5]) > 1e-6 && Math.abs(p[0]) > 1e-6) {
          st.whole.inFrame = bodyInFrame({ viewProj: vp.elements, boxes: model.boxes }).share;
          const len = (i) => Math.hypot(e[i], e[i + 1], e[i + 2]) || 1, lr0 = len(0), lu = len(4), lf = len(8);
          st.whole.ofFrame = frameShare({
            eye: arg.eye, boxes: model.boxes,
            basis: { right: [e[0] / lr0, e[1] / lr0, e[2] / lr0], up: [e[4] / lu, e[5] / lu, e[6] / lu], forward: [-e[8] / lf, -e[9] / lf, -e[10] / lf], tanY: 1 / p[5], aspect: p[5] / p[0] },
          }).share;
        } else { st.whole.inFrame = 1; st.whole.ofFrame = 0; }
      }
      roomState = nextState(cut ? null : st.room, st.cover.tight, st.cover.loose);
      target = roomState;
      if (roomState === 'absent') reason = 'it would hide part of the bed';
      if (tool.view === 'whole') {
        st.whole.state = nextWhole(cut ? null : st.whole.state, st.whole.inFrame, st.whole.ofFrame);
        if (roomState !== 'absent' && st.whole.state === 'absent') {
          target = 'absent';
          reason = st.whole.inFrame < RULE.wholeIn ? 'the frame cuts it' : 'it would fill the frame';
        }
      } else st.whole.state = null;
    }
    if (target !== st.target) st.changes += 1;
    st.target = target; st.room = roomState; st.reason = reason;
    const goal = target === 'absent' ? 0 : 1, goalRoom = roomState === 'absent' ? 0 : 1;
    if (cut) { st.fade = goal; st.fadeRoom = goalRoom; st.cuts += 1; }
    else {
      const step = dtAcc / FADE_S;
      if (st.fade !== goal) st.fade += Math.min(step, Math.max(-step, goal - st.fade));
      if (st.fadeRoom !== goalRoom) st.fadeRoom += Math.min(step, Math.max(-step, goalRoom - st.fadeRoom));
    }
    dtAcc = 0;
  }

  // ---- render hooks: per render, hide the app's luminaire and show ours as that camera should see it ----------------------------
  const hook = { installed: false, off: false, error: null, renders: 0, cubeRenders: 0, cubeApp: 0, appHiddenRenders: 0, drawn: 0, drawnOther: 0, programs: 'unchecked' };
  const stack = [];
  function before(cam) {
    const rec = { hidden: null, set: false, shown: false, fade: 1 };
    if (!model || !attached()) return rec;
    hook.renders += 1;
    const cube = cam?.parent?.type === 'CubeCamera';
    if (cube && !tool.cubeOwn) {
      // a cube render is left to the app (the header, point 4): its own luminaire as it has it, none of ours
      hook.cubeRenders += 1; hook.cubeApp += 1;
      group.visible = false;
      rec.set = true; rec.shown = false; rec.fade = uFade.value;
      return rec;
    }
    if (lr.rectLights !== appLightsRef) readApp(); // a fixture swap since this frame's tick: hide the new meshes at once
    let appShown = appActive.length === 0;
    for (const o of appActive) if (chainShown(o)) { appShown = true; break; }
    for (const o of appAll) {
      if (o.visible) { o.visible = false; (rec.hidden ??= []).push(o); mine.add(o); }
    }
    if (!appShown) {
      // the app took its luminaire out of this render (a scripted overhead move): none of ours either
      hook.appHiddenRenders += 1;
      group.visible = false;
    } else if (cube) {
      // ?clublampcube=own: the cube holds this lamp, solid
      hook.cubeRenders += 1; hook.drawn += 1;
      group.visible = true; uFade.value = 1;
    } else {
      const player = camHint ?? ctx.camera ?? null;
      const isPlayer = cam === player || !player;
      if (evalSerial !== serial) {
        // (a render of another camera that comes first in a frame, e.g. a mirror pass drawn before the player's hook ran,
        // decides from the player's camera: its matrices are already this frame's)
        if (isPlayer && cam?.isCamera) evaluate(cam);
        else if (player?.isCamera) evaluate(player);
      }
      const f = isPlayer ? st.fade : st.fadeRoom;
      group.visible = f > 0;
      uFade.value = smooth(f);
      // a mirror is shown the LIGHT, not the display picture: the app face's colour through the light's own law (peak 1),
      // times the tool gain. (What the floor then does with that radiance is the floor's: room/light.js rolls it off.)
      if (!isPlayer && tool.style !== 'r2' && !tool.faceFlat) { rec.law = [uLaw.value.w, uShow.value]; uLaw.value.w = 1; uShow.value = tool.mirrorGain; }
      if (group.visible) { hook.drawn += 1; if (!isPlayer) hook.drawnOther += 1; }
    }
    rec.set = true; rec.shown = group.visible; rec.fade = uFade.value;
    return rec;
  }
  function after(rec) {
    if (rec?.hidden) for (const o of rec.hidden) { o.visible = true; mine.delete(o); }
    if (rec?.law) { uLaw.value.w = rec.law[0]; uShow.value = rec.law[1]; }
    // back inside an outer render (this one was nested in it): what that render's hook had set
    const outer = stack.length ? stack[stack.length - 1] : null;
    if (outer?.set) { group.visible = outer.shown; uFade.value = outer.fade; return; }
    // between renders the group holds the player's state (tools, bounds and other services read it there)
    group.visible = !!model && st.fade > 0;
    uFade.value = smooth(st.fade);
  }
  function heal() {
    while (stack.length) { const rec = stack.pop(); if (rec?.hidden) for (const o of rec.hidden) o.visible = true; }
    mine.clear();
    applyStyle(); // a render that threw may have left the mirror's law in the uniform
  }
  function installHook() {
    if (!scene || hook.installed) return;
    const prevBefore = scene.onBeforeRender, prevAfter = scene.onAfterRender;
    scene.onBeforeRender = function clubLampBefore(r, s, cam, rt) {
      if (typeof prevBefore === 'function') prevBefore.call(this, r, s, cam, rt);
      if (hook.off || hook.error) return;
      try { stack.push(before(cam)); } catch (e) { hook.error = String(e?.message ?? e); heal(); group.visible = false; console.warn('[club] lamp: render hook failed and is off (the app luminaire is back):', e); }
    };
    scene.onAfterRender = function clubLampAfter(r, s, cam) {
      if (!hook.off && !hook.error) { try { after(stack.pop()); } catch (e) { hook.error = String(e?.message ?? e); heal(); group.visible = false; } }
      if (typeof prevAfter === 'function') prevAfter.call(this, r, s, cam);
    };
    hook.installed = true;
  }

  // ---- degrade law for the shaders: a lamp material whose program did not link draws nothing, and the app's luminaire is
  // hidden under club, so the table would have no lamp at all. Once the lamp has been drawn, the programs are checked; if one is
  // not runnable the club lamp stands down for the page load and the app's luminaire (with its own fade) is back.
  function checkPrograms() {
    const props = ctx.renderer?.properties;
    if (typeof props?.get !== 'function') { hook.programs = 'unknown (no renderer)'; return; }
    let ready = 0;
    for (const k of Object.keys(mats)) {
      if (!meshes[k].visible) { ready += 1; continue; }
      const prog = props.get(mats[k])?.currentProgram;
      if (!prog) continue;
      if (prog.diagnostics && prog.diagnostics.runnable === false) {
        hook.programs = `failed: ${mats[k].name}`;
        hook.error = `the program of '${mats[k].name}' did not link`;
        heal(); group.visible = false;
        console.error(`[club] lamp: ${hook.error} — the club luminaire is off and the app luminaire is back`);
        return;
      }
      ready += 1;
    }
    if (ready === Object.keys(mats).length) hook.programs = 'ok';
  }

  // ---- per frame ---------------------------------------------------------------------------------------------------------------
  const parentInv = new THREE.Matrix4();
  const faceColor = new THREE.Color(), bounceTint = new THREE.Color(0.8, 0.87, 1.0), WARM_WHITE = new THREE.Color(1.0, 0.9, 0.74);
  let ticks = 0;
  function tick(_clock, dt) {
    serial += 1; ticks += 1;
    dtAcc = Math.min(0.5, dtAcc + (Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60));
    if (stack.length) heal(); // a render threw between the hooks
    if (hook.programs === 'unchecked' && hook.drawn >= 2 && !hook.error) { try { checkPrograms(); } catch { hook.programs = 'unknown'; } }
    try {
      readApp();
      // the emitter set is re-read only when the cheap signature of the lights moved (and once a little after the start: the
      // room's beams may have been added after this lamp was built)
      const quick = quickSig();
      if (ticks === 90 || quick !== quickSeen || lr.rectLights !== lightsSeen || roomRoot() !== probe.root) {
        quickSeen = quick; lightsSeen = lr.rectLights ?? null;
        if (rebuild(ticks === 90)) bedAt = ticks;
      }
      if (ticks >= bedAt) { readBed(); bedAt = ticks + 600; }
      if (!snapTap.on && ticks % 60 === 1) tapSnap(); // the app's fade module lands by its own dynamic import
      // the luminaire is bed-relative (the app keeps the lamp-over-bed distance when the floor re-seats), whatever group holds it
      const parent = group.parent;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        parentInv.copy(parent.matrixWorld).invert();
        if (!group.matrix.equals(parentInv)) { group.matrix.copy(parentInv); group.matrixWorldNeedsUpdate = true; }
      }
      // where the cube was captured, and the faces' bounding rectangle seen from there (the self-reflection mask)
      if (model) {
        const cp = club?.env?.uniforms?.uClubEnvPos?.value ?? win?.__dbg?.cubeCam?.position ?? null;
        const px = cp?.isVector3 ? cp.x : 0, py = cp?.isVector3 ? cp.y : 0.115, pz = cp?.isVector3 ? cp.z : 0;
        const f = model.faces;
        uSelf.value.set((f.minX + f.maxX) / 2 - px, (f.minZ + f.maxZ) / 2 - pz, (f.maxX - f.minX) / 2, (f.maxZ - f.minZ) / 2);
        uSelfUp.value.x = Math.max(0.05, f.y - py);
      }
      // the emitting faces follow the app's own lamp-face colour (brightness, look, fixture)
      if (appFace) faceColor.copy(appFace); else faceColor.setRGB(FACE_DEFAULT[0], FACE_DEFAULT[1], FACE_DEFAULT[2]);
      mats.face.color.copy(faceColor);
      // round 3: what is DRAWN keeps the hue of the app's face and takes the brightness setting; its level is FACE_SHOW
      // whatever the app face's own level (20 to 25 on the canopy, 10 on the other fixtures). The round-2 style and
      // ?clublampface=flat draw the app's colour itself.
      uShow.value = tool.style === 'r2' || tool.faceFlat ? 1 : (brightness * FACE_SHOW[0]) / (FACE_LAW[0] * Math.max(faceColor.r, faceColor.g, faceColor.b, 1e-3));
      // the glass band and the lit paint inside follow the brightness setting only: the face colour also carries the look's
      // own base level and tint, which a pane of amber glass does not take
      if (brightAt >= 0 && ticks >= brightAt) { readBrightness(); brightAt = brightAt === 0 ? -1 : ticks + 600; }
      mats.glow.color.setScalar(GLASS_LEVEL * brightness);
      // the table under the lamp: its outline, and its colour as light from below
      uTable.value.set((bed.minX + bed.maxX) / 2, (bed.minZ + bed.maxZ) / 2, (bed.maxX - bed.minX) / 2, (bed.maxZ - bed.minZ) / 2);
      if (ticks % 120 === 1) {
        let cloth = null;
        try { cloth = club?.adopt?.find?.('cloth')?.[0]?.color ?? null; } catch { cloth = null; }
        if (cloth?.isColor) bounceTint.copy(cloth).lerp(WARM_WHITE, 0.5); else bounceTint.setRGB(0.62, 0.68, 0.78);
        bounceTint.multiplyScalar(1 / Math.max(bounceTint.r, bounceTint.g, bounceTint.b, 1e-3));
      }
      uBounce.value.copy(bounceTint).multiplyScalar((tool.gradOff ? BOUNCE_FLAT : BOUNCE_LEVEL) * brightness);
    } catch (e) {
      if (!lastError) console.warn('[club] lamp: frame update failed:', e);
      lastError = String(e?.message ?? e);
    }
  }
  group.matrixAutoUpdate = false;
  let quickSeen = NaN, lightsSeen = null, bedAt = 0;
  function quickSig() {
    let h = detail + ceilNow() * 101;
    for (const l of lr.rectLights ?? []) {
      if (!l?.isRectAreaLight) continue;
      h = h * 31 + l.position.x * 7.1 + l.position.y * 13.7 + l.position.z * 17.3 + l.width * 3.3 + l.height * 5.9 + (l.visible === false ? 1 : 0) + (l.intensity > 0 ? 0 : 2);
    }
    return h;
  }
  let brightness = 1, brightAt = 2;
  function readBrightness() {
    try { const b = win?.__lighting?.state?.()?.brightness; if (Number.isFinite(b)) brightness = Math.min(1.6, Math.max(0.4, b)); } catch { /* no lighting layer: 1 */ }
  }
  const onRelight = () => { brightAt = ticks + 2; bedAt = Math.min(bedAt, ticks + 30); };
  const EVENTS = ['ob:settings', 'ob:relight', 'ob:table-state'];
  try { for (const t of EVENTS) win?.addEventListener?.(t, onRelight); } catch { /* no window events */ }

  let selfDriven = false;
  try {
    readApp();
    rebuild(true);
    lap('model');
    readBed();
    lap('bed');
    if (!model) return off('no active rect light to hang a luminaire on');
    installHook();
    if (typeof club?.onFrame === 'function') { club.onFrame(tick); selfDriven = true; }
    tick(0, 0);
    lap('total');
  } catch (e) {
    hook.off = true; heal();
    console.warn('[club] lamp: the luminaire failed to build — the app luminaire stays:', e);
    return off(String(e?.message ?? e));
  }

  // where the lamp hangs against the bed, in metres (state().position): `emitter` = what this lamp is built on (the app's rect
  // lights), `shared` = the app's shared emitter uniforms as club/env.js holds them (the same rectangle by another road),
  // `body` = the lamp's outline in plan, `bed` = the cloth's bounds. `offset` = lamp centre minus bed centre.
  function position() {
    if (!model) return null;
    const r = (v) => Math.round(v * 1e4) / 1e4;
    const f = model.faces;
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (const b of model.boxes) { bx0 = Math.min(bx0, b.min[0]); bx1 = Math.max(bx1, b.max[0]); bz0 = Math.min(bz0, b.min[2]); bz1 = Math.max(bz1, b.max[2]); }
    let shared = null;
    try {
      const u = club?.env?.uniforms;
      const l = u?.uClubEnvLamp?.value, ly = u?.uClubEnvLampY?.value;
      if (l?.isVector4 && ly?.y > 0.5) shared = { cx: r(l.x), cz: r(l.y), hx: r(l.z), hz: r(l.w), y: r(ly.x) };
    } catch { shared = null; }
    const bc = [(bed.minX + bed.maxX) / 2, (bed.minZ + bed.maxZ) / 2];
    const lc = [(f.minX + f.maxX) / 2, (f.minZ + f.maxZ) / 2];
    return {
      // (`y` is the app's emitter plane; the drawn diffuser hangs `hang` higher under the tool switch ?clublamphang)
      emitter: { cx: r(lc[0]), cz: r(lc[1]), hx: r((f.maxX - f.minX) / 2), hz: r((f.maxZ - f.minZ) / 2), y: r(f.y - tool.hang) },
      hang: tool.hang,
      shared,
      body: { cx: r((bx0 + bx1) / 2), cz: r((bz0 + bz1) / 2), hx: r((bx1 - bx0) / 2), hz: r((bz1 - bz0) / 2), rimY: r(model.span.lo), topY: r(model.span.top) },
      bed: { cx: r(bc[0]), cz: r(bc[1]), hx: r((bed.maxX - bed.minX) / 2), hz: r((bed.maxZ - bed.minZ) / 2), from: bed.from },
      offset: [r(lc[0] - bc[0]), r(lc[1] - bc[1])],
      groupWorld: (() => { try { group.updateWorldMatrix(true, false); const e = group.matrixWorld.elements; return [r(e[12]), r(e[13]), r(e[14])]; } catch { return null; } })(),
    };
  }

  const TIER_DETAIL = { lite: 0, base: 1, high: 2 };
  return {
    enabled: true,
    group,
    emissives: [meshes.face, meshes.glow],
    /** Per frame (CONTRACT.md 9.2). The module also drives itself through club.onFrame, so a second call in a frame is free;
     * `dt` is read only when it does not (dev pages). The state itself is decided at render time, from the render's camera. */
    update(camera, dt) {
      if (camera?.isCamera) camHint = camera;
      if (!selfDriven) tick(0, dt);
    },
    setTier(tier) {
      const d = tier === club?.tier && [0, 1, 2].includes(club?.knobs?.roomDetail) ? club.knobs.roomDetail : TIER_DETAIL[tier];
      if (![0, 1, 2].includes(d)) return false;
      if (d !== detail) { detail = d; rebuild(true); }
      return true;
    },
    counts() {
      let drawCalls = 0, triangles = 0, vertices = 0;
      for (const k of Object.keys(meshes)) {
        const g = meshes[k].geometry;
        if (!meshes[k].visible || !g.index) continue;
        drawCalls += 1; triangles += g.index.count / 3; vertices += g.attributes.position.count;
      }
      // `drawCalls` = what the lamp costs per scene render while it is solid; `drawn` = what the player's view draws now
      return { drawCalls, drawn: st.fade > 0 ? drawCalls : 0, triangles, vertices, materials: 4, textures: 2, textureBytes: FACE_W * FACE_H * 4 + 256 * 128 * 4, kind: model?.kind ?? null, detail };
    },
    // additions (tools, the room's state record)
    /** The diffuser as plain data for the current emitters (room/lamp/face.js lampFace): panels, frame, tube strips. Read-only.
     * Two live values ride along: `law` [low, c0, c1] (the LIGHT's cut-off: radiance x (low + (1 - low) * smoothstep(c0,
     * c1, cosine to the vertical))) and `color` [r, g, b] (a tube core's radiance: the app's lamp-face colour). What a
     * camera is shown of the diffuser is another matter (absolute levels: state().face.show). The data is that of the
     * app's emitters: a tool hang (?clublamphang) does not move it. */
    face() {
      const f = lampFace(readEmitters());
      if (f) { f.law = [uLaw.value.x, uLaw.value.y, uLaw.value.z]; f.color = mats.face.color.toArray(); }
      return f;
    },
    /** The lamp's own glow as room-light emitter specs for the current emitters (lampSpill). Nothing is registered by this. */
    spill() { return lampSpill(readEmitters()); },
    /** Where the skirt cuts the diffuser's light, for the current emitters (room/lamp/face.js lampShield). Read-only. */
    shield() { return lampShield(readEmitters()); },
    /** Pin the state ('solid' | 'absent') or hand it back to the rule (null). */
    force(v) { st.forced = v === 'solid' || v === 'absent' ? v : null; hasPrev = false; coverKey = ''; evalSerial = -1; },
    /** Tools: the boot switches at run time, for pairs inside one boot. `view` 'whole' | 'keep'; `hang` metres (0 .. 0.4);
     * `style` 'r3' | 'r2'; `mirrorGain` a gain on the light's radiance the floor mirror is shown of the diffuser. Returns the
     * values in force. The next frame is a cut (the state is a pure function of the pose). */
    set(o = {}) {
      let again = false;
      if (o.view === 'whole' || o.view === 'keep') tool.view = o.view;
      if (o.hang !== undefined) { const h = hangOf(o.hang); if (h !== tool.hang) { tool.hang = h; again = true; } }
      if (o.style === 'r3' || o.style === 'r2') { if (o.style !== tool.style) { tool.style = o.style; again = true; } }
      if (Number.isFinite(o.mirrorGain) && o.mirrorGain >= 0) tool.mirrorGain = Math.min(20, o.mirrorGain);
      applyStyle();
      if (again) { try { rebuild(true); } catch (e) { lastError = String(e?.message ?? e); } }
      hasPrev = false; coverKey = ''; evalSerial = -1;
      return { view: tool.view, hang: tool.hang, style: tool.style, mirrorGain: tool.mirrorGain };
    },
    state() {
      return {
        enabled: true, kind: model?.kind ?? null, detail, emitters: readEmitters(), ceilY: ceilNow(), rebuilds,
        state: st.target, fade: st.fade, forced: st.forced, cover: { ...st.cover }, evals: st.evals, cuts: st.cuts, changes: st.changes,
        // round 3: the view policy, what COVER alone says (the floor mirror follows it), the frame shares, why it is absent
        view: tool.view, room: st.room, fadeRoom: st.fadeRoom, reason: st.reason,
        whole: { state: st.whole.state, inFrame: Math.round(st.whole.inFrame * 1e3) / 1e3, ofFrame: Math.round(st.whole.ofFrame * 1e3) / 1e3, wholeIn: RULE.wholeIn, wholeOut: RULE.wholeOut, frameMax: RULE.frameMax },
        hang: tool.hang, style: tool.style,
        bed: { ...bed }, hull: model?.boxes ?? [], attached: attached(), selfDriven, brightness,
        build: { ...build }, position: position(), tool: { ...tool }, span: model ? { ...model.span } : null,
        face: model?.face ? { kind: model.face.kind, panels: model.face.panels.length, frame: { ...model.face.frame }, panelSize: model.face.faces[0].panelSize ?? null, law: [uLaw.value.x, uLaw.value.y, uLaw.value.z], peak: uLaw.value.w, show: tool.style === 'r2' || tool.faceFlat ? null : FACE_SHOW.slice(), scale: Math.round(uShow.value * 1e4) / 1e4, gamma: tool.style === 'r2' ? 1 : FACE_GAMMA } : null,
        spill: { ...spillState, registered: spillState.registered.slice() },
        app: { meshes: appAll.length, active: appActive.length, faceColor: appFace ? appFace.toArray() : null, fade: (() => { try { return win?.__lampfade?.value?.() ?? null; } catch { return null; } })() },
        probe: { room: !!probe.root, rays: probe.rays, hits: probe.hits, skipped: probe.skipped }, stagingSnap: snapTap.on,
        hook: { ...hook, depth: stack.length }, fadePatch: { done: patch.done.slice(), missed: patch.missed.slice() }, lastError,
      };
    },
    dispose() {
      hook.off = true; heal(); untapSnap();
      try { club?.offFrame?.(tick); } catch { /* no frame bus */ }
      try { for (const t of EVENTS) win?.removeEventListener?.(t, onRelight); } catch { /* nothing to remove */ }
      group.parent?.remove(group);
      for (const k of Object.keys(meshes)) { meshes[k].geometry.dispose(); mats[k].dispose(); }
      faceTex.dispose(); glassTex.dispose();
    },
  };
}

export { classify as lampKind };
// the lit underside and the lamp's glow as plain data (read-only for other modules): room/lamp/face.js
export { lampFace, lampSpill, lampSpillBaked, lampShield };
