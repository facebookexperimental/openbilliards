// Copyright (c) Meta Platforms, Inc. and affiliates.

// post/grade.js — the club grade pass: exposure, colour balance and the 3D grade table, in scene-linear HDR before the tone map
// (see post/gradelut.js for why there and why the table stores log2 gains). The last club pass before the OutputPass, so the
// buffer it writes is the linear HDR tap the offline accumulator and the preview-ink sampler read.
//
// The app's exposure falloff pass (scene/postfx.js ExposureFalloffShader) sits right before this one and is one full-screen
// draw of its own. When post.js folds it in (`fold`), this shader applies the same arithmetic first, from the app pass's own
// strength uniform, and the app pass is switched off: the club chain then adds NO full-screen pass to the app's chain.
import * as THREE from 'three';
import { fsMaterial } from './fsq.js';
import { buildGradeLut, GRADE_DEFAULTS, LUT_SIZE, LOG_MIN, LOG_RANGE } from './gradelut.js';

const GRADE_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler3D tLut;
uniform float uStrength;
uniform vec3 uGain;        // exposure * colour balance
uniform vec2 uLutCoord;    // scale, offset: [0,1] -> texel centres
uniform float uDither;
uniform float uFold;       // >= 0: the app's exposure falloff at this strength, applied first; < 0: not folded
out vec4 outColor;
float ign( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
void main() {
  vec4 s = texture( tDiffuse, vUv );
  if ( uFold >= 0.0 ) {
    // scene/postfx.js ExposureFalloffShader, line for line
    if ( isnan( s.r + s.g + s.b ) ) s = vec4( 0.0, 0.0, 0.0, 1.0 );
    float d = length( ( vUv - 0.5 ) * vec2( 1.22, 1.0 ) );
    float f = 1.0 - uFold * smoothstep( 0.52, 1.18, d );
    s.rgb *= f;
  }
  vec3 c = max( s.rgb, 0.0 ) * uGain;
  vec3 lc = clamp( ( log2( max( c, 1e-10 ) ) - ( ${LOG_MIN.toFixed(1)} ) ) / ${LOG_RANGE.toFixed(1)}, 0.0, 1.0 );
  c *= exp2( texture( tLut, lc * uLutCoord.x + uLutCoord.y ).rgb * uStrength );
  // a static triangular dither of about one display code value, expressed as a fraction of the linear value (the tone map and
  // the sRGB curve come later): dark room gradients do not band in 8 bits, and it is the same in every tap of the frame
  float n = ign( gl_FragCoord.xy ) + ign( gl_FragCoord.xy + vec2( 31.7, 17.3 ) ) - 1.0;
  float lum = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  float rel = min( uDither * ( 2.2 / 255.0 ) / pow( max( lum * 0.6, 2e-4 ), 0.4545 ), 0.25 );
  c *= 1.0 + 0.5 * n * rel;
  outColor = vec4( c, s.a );
}`;

export function lutTexture(data, size = LUT_SIZE) {
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
  const tex = new THREE.Data3DTexture(half, size, size, size);
  tex.format = THREE.RGBAFormat; tex.type = THREE.HalfFloatType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter; // half-float linear filtering is core in WebGL2
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false; tex.unpackAlignment = 1;
  tex.name = 'club.post.gradeLut';
  tex.userData = { size };
  tex.needsUpdate = true;
  return tex;
}

export function createGrade({ drawer, params = GRADE_DEFAULTS }) {
  let lut = lutTexture(buildGradeLut(params));
  const uniforms = {
    tDiffuse: { value: null }, tLut: { value: lut }, uStrength: { value: 1 }, uGain: { value: new THREE.Vector3(1, 1, 1) },
    uLutCoord: { value: new THREE.Vector2((LUT_SIZE - 1) / LUT_SIZE, 0.5 / LUT_SIZE) }, uDither: { value: 1 }, uFold: { value: -1 },
  };
  const material = fsMaterial('club.post.grade', GRADE_FRAG, uniforms);
  const state = { strength: 1, exposure: 1, balance: new THREE.Vector3(1, 1, 1), dither: 1, params };
  return {
    state,
    get lut() { return lut; },
    /** Replace the table: a Data3DTexture of log2 gains in the layout of gradelut.js, or grade parameters to build one from. */
    setLut(next) {
      const tex = next?.isData3DTexture ? next : lutTexture(buildGradeLut({ ...GRADE_DEFAULTS, ...(next ?? {}) }));
      if (!next?.isData3DTexture) state.params = { ...GRADE_DEFAULTS, ...(next ?? {}) };
      if (tex !== lut) { lut.dispose(); lut = tex; uniforms.tLut.value = tex; }
      const n = tex.userData?.size ?? tex.image?.width ?? LUT_SIZE;
      uniforms.uLutCoord.value.set((n - 1) / n, 0.5 / n);
    },
    /** True when the pass would change the image: at strength 0 and exposure 1 it is skipped, so the frame is the ungraded one exactly. */
    active() { return state.strength !== 0 || state.exposure !== 1 || state.balance.x !== 1 || state.balance.y !== 1 || state.balance.z !== 1; },
    /** `fold` = the app falloff pass's strength when that pass is folded into this draw, null otherwise. */
    render(renderer, source, target, fold = null) {
      const on = this.active();
      uniforms.tDiffuse.value = source;
      uniforms.uStrength.value = state.strength;
      uniforms.uGain.value.copy(state.balance).multiplyScalar(state.exposure);
      uniforms.uDither.value = on ? state.dither : 0;   // a grade that changes nothing adds no dither either
      uniforms.uFold.value = fold === null ? -1 : Math.max(0, Number(fold) || 0);
      drawer.draw(renderer, material, target);
    },
    bytes() { const n = lut.userData?.size ?? LUT_SIZE; return n * n * n * 8; },
    dispose() { lut.dispose(); material.dispose(); },
  };
}
