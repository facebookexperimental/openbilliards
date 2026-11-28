// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/rig/mat.js — materials, shader patches and code-drawn textures of the arena's light rig (CONTRACT.md 13.6). Owner: rig.
//
// Every lit material comes from the room-light service (`roomLight.material`), every glowing one from `roomLight.emissive`;
// without the service (a dev page with a stand-in) the same parameters go to plain three materials. No three light is made.
// Three small patches are added on top, each AFTER a standard chunk include (the room light's own text and other services'
// `before` / `after` anchors still hit), each with its own share of the program key:
//
//   fade    the dissolve of the table light's housing between SOLID and ABSENT (room/lamp.js's ordered dither, the same
//           law: no blending, no transparent pass);
//   bounce  the lit table as a light from below, on the rig's own lit materials: the form factor of a disc of the bed's
//           area seen from the fragment (R^2 / (d^2 + R^2) x (h / d)^2), on faces that look down, as diffuse light and as
//           the share of it a brushed metal mirrors. It is what makes the underside of the truss and of the housing read;
//   law     what a camera is shown of an emitting face against the angle to its axis (the diffuser: the vertical; a lamp
//           head's lens: its own normal): `mix(low, peak, smoothstep(c0, c1, cosine)) x show`.
//
// Importing this module does nothing.
import * as THREE from 'three';
import { LENS_ATLAS, lensLaw } from './plan.js';

export const RIG_KEY = 'arena-rig-v8';
/** GPU bytes of the three code-drawn textures, with mips (RGBA8). (Round A5: the lens texture is a 512 px atlas.) */
export const TEX_BYTES = Object.freeze({ brushed: Math.round((64 * 256 * 4 * 4) / 3), lens: Math.round((LENS_ATLAS.size * LENS_ATLAS.size * 4 * 4) / 3), face: Math.round((256 * 160 * 4 * 4) / 3) });

const FADE_PARS = /* glsl */`
uniform float uRigFade;
float rigDither( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
`;
const FADE_MAIN = /* glsl */`
if ( uRigFade < 0.999 && uRigFade <= rigDither( gl_FragCoord.xy ) ) discard;
`;
const BOUNCE_PARS = /* glsl */`
uniform vec3 uRigBounce;
uniform vec4 uRigTable;
`;
// the wash: light on the rig's own steel that is not one of the room light's emitters (the hall's low house wash on the
// roof steel, a lit can's spill on the truss beside it), a colour per vertex (arena/rig/truss.js markWash), arriving from
// below and from the sides: diffuse on every face (most on the ones that look down) and the share a metal mirrors of it
const WASH_PARS_VERTEX = /* glsl */`
attribute vec3 rigWash;
varying vec3 vRigWash;
`;
const WASH_VERTEX = /* glsl */`
vRigWash = rigWash;
`;
const WASH_PARS = /* glsl */`
varying vec3 vRigWash;
uniform float uRigWash;
`;
// uRigTable: centre x, centre z, R^2 (the bed's area over pi), the bed plane's height
// (Round A3: rounds A1 and A2 also held the heads' light on the table light's box down to a SHARE here (6 % on its top,
// 16 % on its sides, 30 % of the baked irradiance), because the room light's point emitter was a broad lobe and lit the box
// from 60 degrees off a head's axis: the satin band stood at 159 of 255 beside a bed at 150. The heads are cones now
// (room/light.js CONE; the box stands outside every one, in the analytic light and in the bake), so the share is gone and
// the box takes the hall's light as every other surface does. What stays is geometry, not a level: `down`.)
const BOUNCE_MAIN = (withWorldPos, mirror, down, wash) => /* glsl */`
{
  vec3 rigN = inverseTransformDirection( geometryNormal, viewMatrix );
  ${down ? `{
    // A face that looks down (the lip, the plate between the faces of a ring of strips) is lit by the table alone: the
    // lamp's own spill emitter stands inside the box and drew a hot spot on that plate (dev frame shots/rig/f1.jpg)
    float rigDown = 1.0 - smoothstep( 0.15, 0.7, - rigN.y );
    reflectedLight.directDiffuse *= rigDown;
    reflectedLight.directSpecular *= rigDown;
    #if defined( RE_IndirectDiffuse )
      irradiance *= rigDown;
    #endif
  }` : ''}
  float rigF = 0.3;
  ${withWorldPos ? `{
    vec2 rigO = vRoomWP.xz - uRigTable.xy;
    float rigH = max( vRoomWP.y - uRigTable.w, 0.05 );
    float rigD2 = rigH * rigH + dot( rigO, rigO );
    rigF = ( uRigTable.z / ( rigD2 + uRigTable.z ) ) * ( rigH * rigH / rigD2 );
  }` : ''}
  #if defined( RE_IndirectDiffuse )
    irradiance += uRigBounce * ( ( 0.5 - 0.5 * rigN.y ) * rigF );
    ${wash ? 'irradiance += vRigWash * ( uRigWash * ( 0.62 - 0.38 * rigN.y ) );' : ''}
  #endif
  #if defined( RE_IndirectSpecular )
  {
    vec3 rigR = inverseTransformDirection( reflect( - geometryViewDir, geometryNormal ), viewMatrix );
    // the cube is captured just above the cloth: below its horizon it holds the lit cloth in every direction, which up here
    // is true only inside the table's outline, and at a brushed metal's roughness the prefiltered cube carries that cloth
    // far above its horizon (the truss came out cloth-coloured from every side: dev frames shots/rig/d4.jpg, d5.jpg). So
    // only lookups that point well up keep the cube (the roof, the house lights); the table comes back as the term below
    radiance *= smoothstep( 0.3, 0.75, rigR.y );
    radiance += uRigBounce * ( RECIPROCAL_PI * ${Number(mirror).toFixed(3)} * rigF * ( 1.0 - smoothstep( -0.7, 0.1, rigR.y ) ) );
    ${wash ? `radiance += vRigWash * ( uRigWash * RECIPROCAL_PI * ${Number(mirror).toFixed(3)} * ( 1.0 - smoothstep( -0.6, 0.35, rigR.y ) ) );` : ''}
  }
  #endif
}
`;
const LAW_PARS_VERTEX = /* glsl */`
varying vec3 vRigWP;
varying vec3 vRigAxis;
`;
const LAW_VERTEX = (axis) => /* glsl */`
vRigWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vRigAxis = ${axis === 'normal' ? 'normalize( mat3( modelMatrix ) * normal )' : 'vec3( 0.0, -1.0, 0.0 )'};
`;
const LAW_PARS = /* glsl */`
varying vec3 vRigWP;
varying vec3 vRigAxis;
uniform vec4 uRigLaw;
uniform float uRigShow;
`;
const LAW_MAIN = (axis) => /* glsl */`
{
  float rigC = dot( normalize( cameraPosition - vRigWP ), normalize( vRigAxis ) );
  rigC = ${axis === 'normal' ? 'max( rigC, 0.0 )' : 'abs( rigC )'};
  diffuseColor.rgb *= mix( uRigLaw.x, uRigLaw.w, smoothstep( uRigLaw.y, uRigLaw.z, rigC ) ) * uRigShow;
}
`;

// ---- round A6: the table light's lit lower edge (the skirt of arena/rig/housing.js: `arena.rig.edge`). CONTRACT 18.1:
// "its lamp rows read and the edge falls off toward its ends (no uniform bar)". What is behind that skirt is the edge of
// the opal sheet, lit by the rows of LED boards that run along the box above it. A SURFACE LAW OF POSITION on the
// box's outer face (world metres; nothing in it knows where the camera stands):
//   along a LONG side   the nearest row's boards, one every EDGE.pitch metres: each board's image at 1, the gap between
//                       two boards at EDGE.gap (the sheet spreads a board's light: a soft lobe, not a dot);
//   along an END        the ends of the EDGE.rows rows, side by side across the box: a lobe per row;
//   toward a face's ends the sheet's edge darkens (the last board stands short of the corner): down to 1 - EDGE.fall,
//                       and the corner itself, the frame's post, to EDGE.corner;
//   the frame           a dark joint line where two sections of the box meet, at each third of a long side.
// `gain` holds the edge's flux near what the uniform skirt gave (the law's mean over a long side is about 0.67).
// The skirt's fall up its height stays in the vertex colours (housing.js SEAM_*). `uRigEdgeOn` 0: the uniform skirt of
// rounds A1 to A5 (the off arm of the pair: `?clubrig=noedge`). The bezel inside the opening (the same mesh) is not on
// the outer face and keeps its level.
export const EDGE = Object.freeze({ pitch: 0.28, gap: 0.5, rows: 4, fall: 0.45, corner: 0.5, joint: 0.3, gain: 1.3 });
const EDGE_PARS_VERTEX = /* glsl */`
varying vec3 vRigEWP;
`;
const EDGE_VERTEX = /* glsl */`
vRigEWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
`;
const EDGE_PARS = /* glsl */`
varying vec3 vRigEWP;
uniform vec4 uRigEdge;      // the box's outer face: centre x, centre z, half extent along x, half extent along z
uniform float uRigEdgeOn;
float rigEdgeLaw( vec3 p ) {
  vec2 d = vec2( p.x - uRigEdge.x, p.z - uRigEdge.y );
  vec2 h = uRigEdge.zw;
  vec2 q = abs( d ) - h;
  // (the bezel inside the opening lies more than 6 cm inside the outer face: it keeps its level)
  if ( max( q.x, q.y ) < -0.06 ) return 1.0;
  bool faceZ = q.y > q.x;                       // a face that looks along z: it runs along x
  bool boxLongX = h.x >= h.y;
  float run = faceZ ? d.x : d.y;
  float halfRun = faceZ ? h.x : h.y;
  bool longSide = faceZ == boxLongX;
  float pitch = longSide ? ${EDGE.pitch.toFixed(3)} : ( 2.0 * halfRun ) / ${EDGE.rows.toFixed(1)};
  // a lobe per board (or per row's end), centred in its cell
  float cell = 0.5 + 0.5 * cos( 6.2831853 * ( run / pitch + ( longSide ? 0.0 : 0.5 ) ) );
  float image = mix( ${EDGE.gap.toFixed(3)}, 1.0, smoothstep( 0.12, 0.88, cell ) );
  float s = abs( run ) / max( halfRun, 1e-4 );
  float fall = 1.0 - ${EDGE.fall.toFixed(3)} * smoothstep( 0.5, 1.0, s );
  float post = mix( ${EDGE.corner.toFixed(3)}, 1.0, smoothstep( 0.0, 0.05, halfRun - abs( run ) ) );
  float joint = 1.0;
  if ( longSide && halfRun > 0.6 ) {
    float dj = abs( abs( run ) - halfRun / 3.0 );
    joint = mix( ${EDGE.joint.toFixed(3)}, 1.0, smoothstep( 0.003, 0.008, dj ) );
  }
  return ${EDGE.gain.toFixed(3)} * image * fall * post * joint;
}
`;
const EDGE_MAIN = /* glsl */`
diffuseColor.rgb *= mix( 1.0, rigEdgeLaw( vRigEWP ), uRigEdgeOn );
`;
/** The edge law on the CPU (the arm's copy of EDGE_PARS): the factor at `run` metres from a face's middle. */
export function edgeLaw(run, halfRun, longSide) {
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const pitch = longSide ? EDGE.pitch : (2 * halfRun) / EDGE.rows;
  const cell = 0.5 + 0.5 * Math.cos(2 * Math.PI * (run / pitch + (longSide ? 0 : 0.5)));
  const image = EDGE.gap + (1 - EDGE.gap) * sm(0.12, 0.88, cell);
  const fall = 1 - EDGE.fall * sm(0.5, 1, Math.abs(run) / halfRun);
  const post = EDGE.corner + (1 - EDGE.corner) * sm(0, 0.05, halfRun - Math.abs(run));
  const joint = longSide && halfRun > 0.6 ? EDGE.joint + (1 - EDGE.joint) * sm(0.003, 0.008, Math.abs(Math.abs(run) - halfRun / 3)) : 1;
  return EDGE.gain * image * fall * post * joint;
}

/**
 * Add the rig's patches to a material. `fade`: { value } (the dissolve) | null; `bounce`: { color: { value: Color },
 * table: { value: Vector4 }, mirror, down } | null (`down`: true = a face that looks down is lit by the table alone: the
 * table light's box, whose own spill emitter stands inside it); `law`: { law: { value: Vector4 }, show: { value }, axis: 'y' | 'normal' } |
 * null. `log` = { done: [], missed: [] }. A missing anchor leaves the material unpatched (it is drawn as it was) and is
 * recorded and logged once.
 */
export function patch(m, { fade = null, bounce = null, law = null, edge = null } = {}, log = { done: [], missed: [] }) {
  const prevCompile = m.onBeforeCompile;
  const prevKey = Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') ? m.customProgramCacheKey : null;
  const wash = bounce?.wash ?? null; // { value }: the wash's level (the per-vertex colours times this)
  // (`edge`, round A6: { box: { value: Vector4 }, on: { value } }: the lit lower edge's law of position, EDGE above)
  const kind = `${fade ? 'f' : ''}${bounce ? `b${bounce.mirror ?? 1}${bounce.down ? 'd' : ''}${wash ? 'w' : ''}` : ''}${law ? `l${law.axis === 'normal' ? 'n' : 'y'}` : ''}${edge ? 'e' : ''}`;
  m.onBeforeCompile = function rigPatch(shader, renderer) {
    if (typeof prevCompile === 'function') prevCompile.call(this, shader, renderer);
    const f = shader.fragmentShader, v = shader.vertexShader;
    const need = ['#include <clipping_planes_pars_fragment>']
      .concat(fade ? ['#include <clipping_planes_fragment>'] : [])
      .concat(bounce ? ['#include <lights_fragment_end>'] : [])
      .concat(law || edge ? ['#include <color_fragment>'] : []);
    const needVertex = law || wash || edge ? ['#include <common>', '#include <project_vertex>'] : [];
    if (need.some((a) => !f.includes(a)) || needVertex.some((a) => !v.includes(a))) {
      if (!log.missed.includes(m.name)) { log.missed.push(m.name); console.error(`[club] arena rig: shader anchors missing in '${m.name}' (it is drawn unpatched)`); }
      return;
    }
    let pars = '';
    let out = f;
    if (fade) { shader.uniforms.uRigFade = fade; pars += FADE_PARS; out = out.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FADE_MAIN}`); }
    if (bounce) {
      shader.uniforms.uRigBounce = bounce.color; shader.uniforms.uRigTable = bounce.table; pars += BOUNCE_PARS;
      // the fragment's world position is a varying of roomLight.material; a plain fallback material has none
      out = out.replace('#include <lights_fragment_end>', `${BOUNCE_MAIN(f.includes('varying vec3 vRoomWP'), bounce.mirror ?? 1, bounce.down === true, !!wash)}\n#include <lights_fragment_end>`);
      if (wash) {
        shader.uniforms.uRigWash = wash; pars += WASH_PARS;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${WASH_PARS_VERTEX}`)
          .replace('#include <project_vertex>', `#include <project_vertex>\n${WASH_VERTEX}`);
      }
    }
    if (law) {
      shader.uniforms.uRigLaw = law.law; shader.uniforms.uRigShow = law.show; pars += LAW_PARS;
      out = out.replace('#include <color_fragment>', `#include <color_fragment>\n${LAW_MAIN(law.axis)}`);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${LAW_PARS_VERTEX}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${LAW_VERTEX(law.axis)}`);
    }
    if (edge) {
      shader.uniforms.uRigEdge = edge.box; shader.uniforms.uRigEdgeOn = edge.on; pars += EDGE_PARS;
      out = out.replace('#include <color_fragment>', `#include <color_fragment>\n${EDGE_MAIN}`);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${EDGE_PARS_VERTEX}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${EDGE_VERTEX}`);
    }
    shader.fragmentShader = out.replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>\n${pars}`);
    if (!log.done.includes(m.name)) log.done.push(m.name);
  };
  m.customProgramCacheKey = function rigKey() {
    let k = '';
    try { k = typeof prevKey === 'function' ? String(prevKey.call(this)) : ''; } catch { k = ''; }
    return `${k}|${RIG_KEY}+${kind}`;
  };
  return m;
}

/** A lit material from the room-light service, or a plain standard material with the same parameters. */
export function lit(roomLight, p) {
  let m = null;
  try { m = typeof roomLight?.material === 'function' ? roomLight.material(p) : null; } catch { m = null; }
  if (!m) {
    m = new THREE.MeshStandardMaterial();
    m.color.set(p.color ?? 0xffffff); m.roughness = p.roughness ?? 0.7; m.metalness = p.metalness ?? 0;
    m.vertexColors = p.vertexColors === true; m.envMapIntensity = p.envMapIntensity ?? 1;
    if (p.roughnessMap) m.roughnessMap = p.roughnessMap;
    m.name = p.name;
  }
  return m;
}

/** An unlit emitter surface from the room-light service, or a plain basic material. */
export function glow(roomLight, p) {
  let m = null;
  try { m = typeof roomLight?.emissive === 'function' ? roomLight.emissive(p) : null; } catch { m = null; }
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color ?? 0xffffff).multiplyScalar(p.intensity ?? 1) });
    if (p.map) m.map = p.map;
    m.name = p.name;
    m.userData.clubRoom = 'emissive';
  }
  if (p.vertexColors) m.vertexColors = true;
  return m;
}

const canvas = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };

/**
 * Brushed aluminium as a roughness map (three reads the green channel): fine streaks along v (the tube's length), a few
 * wider bands, scuffs. 64 x 256 (u around the tube, v along it), tiles both ways. Seeded: the same picture on every boot.
 */
export function brushedTexture() {
  const W = 64, H = 256;
  const cv = canvas(W, H);
  try {
    const g = cv.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    let seed = 5231;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const col = new Float32Array(W);
    for (let x = 0; x < W; x++) col[x] = 0.78 + 0.22 * rnd();           // streaks: one level per column, along the whole tube
    for (let k = 0; k < 3; k++) { const x0 = Math.floor(rnd() * W), wd = 3 + Math.floor(rnd() * 6); for (let x = x0; x < x0 + wd; x++) col[x % W] *= 0.9; }
    for (let y = 0; y < H; y++) {
      const band = 0.96 + 0.04 * Math.sin((y / H) * Math.PI * 2 * 3);    // a slow change along the tube (handling marks)
      for (let x = 0; x < W; x++) {
        const v = Math.round(255 * Math.min(1, col[x] * band * (0.97 + 0.03 * rnd())));
        const o = 4 * (y * W + x);
        d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  } catch { /* no 2d canvas: a flat map */ }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.name = 'arena.rig.brushed';
  return tex;
}

/**
 * A lamp head's lens as the camera sees it lit: a hot core, a bright field with the rings of a stepped lens, a fall to the
 * rim, a dark bezel line. 128 x 128, sRGB; the material's colour carries the level.
 */
// Round A5 (CONTRACT 17.4, 17.1): the texture is an ATLAS (arena/rig/plan.js LENS_ATLAS): the round lens as before in
// its corner, an LED flood's face (rows of emitters: a hot core in each dim cell, a dark frame: the round A4 floods'
// faces were flat white rectangles), and the four slides of the hanging screens. `words`: the layout's WORDS (a slide
// carries ONE of them and geometric marks; nothing else is ever written); `navy`: the palette's board colour.
export function lensTexture(words = [], navy = '#0c1a33') {
  const S = LENS_ATLAS.size;
  const cv = canvas(S, S);
  try {
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    const enc = (v) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2));
    {
      const [x0, y0, L] = LENS_ATLAS.lens;
      const img = g.createImageData(L, L), d = img.data;
      for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
        const r = Math.hypot(x + 0.5 - L / 2, y + 0.5 - L / 2) / (L / 2);
        // core (the lamp behind the lens), the stepped ring around it, the rim: plan.js lensLaw().
        // (Round A5: the core is a plateau out to half the radius; it was a Gaussian of 0.22 R at 0.8. The table role
        // measured the first cores in the app (its READY note of 09:29Z): a lens of 5 x 3 pixels on screen is sampled
        // near the map's MEAN, which was 0.135 of the material's colour: just over the bloom threshold, a halo of 3 to
        // 8 levels. The mean is 0.4 now (plan.js lensMean): a far lens passes the gate with most of its level.)
        const { level: v, core } = lensLaw(r);
        const o = 4 * (y * L + x);
        d[o] = enc(v); d[o + 1] = enc(v * (0.96 + 0.04 * core)); d[o + 2] = enc(v * (0.86 + 0.14 * core)); d[o + 3] = 255;
      }
      g.putImageData(img, x0, y0);
    }
    {
      // an LED flood's face: 8 x 5 emitters behind small lenses; between them the dim reflector tray; a dark frame
      const [x0, y0, W, H] = LENS_ATLAS.led, NX = 8, NY = 5, M = 4;
      const img = g.createImageData(W, H), d = img.data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = 4 * (y * W + x);
        d[o + 3] = 255;
        if (x < M || y < M || x >= W - M || y >= H - M) continue; // the frame: black
        const cx = ((x - M + 0.5) / (W - 2 * M)) * NX, cy = ((y - M + 0.5) / (H - 2 * M)) * NY;
        const r = Math.hypot(cx - Math.floor(cx) - 0.5, cy - Math.floor(cy) - 0.5) * 2; // 0 at a cell's centre, 1 at its side
        const core = Math.exp(-(r * r) / (2 * 0.5 * 0.5)); // (0.5 of a cell: the face's mean is 0.4, for the same reason as the lens)
        const v = Math.min(1, core * 0.9 + 0.055 * (1 - Math.min(1, r) ** 2) + 0.02);
        d[o] = enc(v); d[o + 1] = enc(v * (0.96 + 0.04 * core)); d[o + 2] = enc(v * (0.88 + 0.12 * core));
      }
      g.putImageData(img, x0, y0);
    }
    // the screens' slides: a white ground, a navy band with geometric marks, one word in navy
    LENS_ATLAS.slides.forEach((rect, i) => {
      const [x0, y0, W, H] = rect, M = 3, word = String(words[i % Math.max(1, words.length)] ?? '');
      g.save();
      g.beginPath(); g.rect(x0 + M, y0 + M, W - 2 * M, H - 2 * M); g.clip();
      g.fillStyle = '#f1f3f6'; g.fillRect(x0, y0, W, H);
      const band = Math.round(H * 0.3);
      g.fillStyle = navy; g.fillRect(x0, y0 + H - band, W, band);
      // marks: a slanted pair of bars at the right of the band, three diamonds at its left (the boards' own vocabulary)
      g.fillStyle = '#f1f3f6';
      const by = y0 + H - band / 2;
      for (let k = 0; k < 3; k++) { const mx = x0 + 26 + k * 20; g.beginPath(); g.moveTo(mx, by - 6); g.lineTo(mx + 6, by); g.lineTo(mx, by + 6); g.lineTo(mx - 6, by); g.closePath(); g.fill(); }
      for (let k = 0; k < 2; k++) { const mx = x0 + W - 58 + k * 18; g.beginPath(); g.moveTo(mx + 8, by - 13); g.lineTo(mx + 18, by - 13); g.lineTo(mx + 6, by + 13); g.lineTo(mx - 4, by + 13); g.closePath(); g.fill(); }
      g.fillStyle = '#c7882f'; g.fillRect(x0 + 16, y0 + 16, 34, 5); // (a short amber bar: the palette's wash colour, muted)
      if (word) {
        g.fillStyle = navy; g.textAlign = 'center'; g.textBaseline = 'middle';
        let px = 58;
        g.font = `700 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
        const wide = g.measureText(word).width;
        if (wide > W - 40) { px = Math.floor((px * (W - 40)) / wide); g.font = `700 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`; }
        g.fillText(word, x0 + W / 2, y0 + (H - band) / 2 + 6);
      }
      g.restore();
    });
  } catch { /* no 2d canvas: a plain black texture (every lit face goes dark; the materials still compile) */ }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.name = 'arena.rig.lens';
  return tex;
}

/**
 * One panel of the table light's diffuser as cameras see it (the layout of room/lamp.js's face texture, so the geometry's
 * uv convention is shared: canvas rows 32..160 = the panel, v 0..0.8; rows 0..24 = plain white for the frame's texel).
 * An opal sheet over rows of LEDs: it glows evenly, a little brighter along the rows (`face.tubes`: the strips the face
 * publishes, at `levels.panel` between them) and it falls off toward the frame on all four sides (`levels.tubeEnd` at the
 * very edge, over `face.tubeEnd` metres), which is what keeps a lit sheet from reading as a white card.
 */
export const FACE_TEX = Object.freeze({ w: 256, h: 160, gamma: 1.35 });
export function drawFace(cv, face, panelV = [0, 0.8]) {
  const { w: FW, h: FH, gamma } = FACE_TEX;
  const g = cv.getContext('2d');
  const top = Math.round(FH * (1 - panelV[1])), rows = FH - top;
  const lv = face?.levels ?? { panel: 0.8, tubeEnd: 0.6 };
  const size = face?.panelSize ?? [0.66, 0.64];
  const tubes = face?.tubes ?? [];
  const unit = (v, dflt) => Math.min(1, Math.max(0.02, Number.isFinite(v) ? v : dflt));
  const panel = Math.pow(unit(lv.panel, 0.8), gamma), endLevel = unit(lv.tubeEnd, 0.6);
  const endLen = Math.max(0.02, Math.min(0.45, (face?.tubeEnd ?? 0.09) / Math.max(size[0], 1e-3)));
  const endAcross = Math.max(0.02, Math.min(0.45, (face?.tubeEnd ?? 0.09) / Math.max(size[1], 1e-3)));
  const enc = (v) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2));
  const sm = (t) => t * t * (3 - 2 * t);
  const img = g.createImageData(FW, FH), d = img.data;
  const across = new Float32Array(FH), edgeA = new Float32Array(FH);
  for (let y = 0; y < FH; y++) {
    const s = (Math.max(y, top) - top + 0.5) / rows, a = (s - 0.5) * size[1];
    let t = 0;
    // an LED row behind opal: a wide soft band (twice the published half width to its foot)
    for (const tb of tubes) t = Math.max(t, Math.max(0, 1 - Math.abs(a - tb.offset) / Math.max(tb.half * 2.4, 1e-4)));
    across[y] = sm(t);
    edgeA[y] = endLevel + (1 - endLevel) * sm(Math.min(1, Math.min(s, 1 - s) / endAcross));
  }
  for (let x = 0; x < FW; x++) {
    const u = (x + 0.5) / FW;
    const along = endLevel + (1 - endLevel) * sm(Math.min(1, Math.min(u, 1 - u) / endLen));
    for (let y = 0; y < FH; y++) {
      const o = 4 * (y * FW + x);
      d[o + 3] = 255;
      if (y < top - 8) { d[o] = d[o + 1] = d[o + 2] = 255; continue; }
      const t = across[y];
      // the corner takes the lower of the two edge falls, softened (a product would dig a dark notch into every corner)
      const level = (panel + (1 - panel) * t) * Math.min(along, edgeA[y]) * (0.75 + 0.25 * Math.max(along, edgeA[y]));
      d[o] = enc(level); d[o + 1] = enc(level * (0.985 + 0.01 * t)); d[o + 2] = enc(level * (0.95 + 0.03 * t));
    }
  }
  g.putImageData(img, 0, 0);
}
export function faceTexture() {
  const cv = canvas(FACE_TEX.w, FACE_TEX.h);
  try { drawFace(cv, null); } catch { /* no 2d canvas: a plain face */ }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.name = 'arena.rig.face';
  tex.userData.key = '';
  return tex;
}
