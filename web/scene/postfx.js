// Copyright (c) Meta Platforms, Inc. and affiliates.

// postfx.js — composer chain: MSAA half-float render, bloom, gentle
// pre-tonemap exposure falloff (replaces the old hard vignette), ACES output.
import * as THREE from 'three';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { FullScreenQuad } from '../vendor/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';

// multiplies linear HDR before tone mapping: reads as the light pool falling
// off toward the room, not a black picture-frame.
const ExposureFalloffShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.46 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      if ( isnan( c.r + c.g + c.b ) ) c = vec4( 0.0, 0.0, 0.0, 1.0 );
      float d = length( ( vUv - 0.5 ) * vec2( 1.22, 1.0 ) );
      float f = 1.0 - strength * smoothstep( 0.52, 1.18, d );
      gl_FragColor = vec4( c.rgb * f, c.a );
    }`,
};

// `samples` is additive (spike default 8× MSAA; the playable app passes 4
// to hold the 60 fps budget with ten live balls).
//
// GH-263 render-scale law (ONE policy, boot and resize symmetric): the
// composer renders at `pixelRatio` × CSS — default renderer.getPixelRatio(),
// i.e. min(devicePixelRatio, 2) interactive / 1 scripted per the main.js
// retina pin. Pre-fix, the CSS-sized target passed to EffectComposer left
// the composer's latent _pixelRatio (captured from the renderer in its
// constructor) unapplied at boot but multiplied into every later setSize —
// so the FIRST window resize silently flipped the whole chain from CSS
// resolution to full-DPR (two render qualities for one build; e2e-userboot
// arm 4 is the gate). setPixelRatio runs BEFORE addPass so render targets
// AND passes are coherently sized (pre-fix, bloom was DPR-sized against
// CSS-sized targets even at boot).
export function createPostFX(renderer, scene, camera, w, h,
  { samples = 8, pixelRatio } = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, rt);
  const pr = pixelRatio ?? renderer.getPixelRatio();
  composer.setPixelRatio(pr);
  composer.addPass(new RenderPass(scene, camera));
  // exposed on __obCine so looks can retune it: the reference footage clips specular
  // crests hard at the ball silhouette (zero halo), so setLook('tournament') in
  // web/app/main.js drops the strength — mirroring the falloff-pass retune.
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.16, 0.5, 1.1);
  composer.addPass(bloom);
  // GH-489 PASS-2 CURE (boot bloom halo, verdict §4.4): under the
  // studio_xw101 capture rig (brightness 1.4) the pass painted a
  // +40-45L background halo over 60-100 px hugging the boot silhouette
  // (the retired 皮套灯罩 class, resurrected preset-specifically; the
  // venue rigs at brightness 1.0 measured crisp). Mechanism, measured
  // through a live threshold ladder (1.54 → 7.0, halo INVARIANT;
  // strength 0, halo dead at +6-9): the sources are the brass
  // hardware's mirror glints of the re-lit lamp (HDR 10-30) — no
  // threshold separates them from the lamp faces themselves, so the
  // charter's KILL arm applies: a brightness-scaled rig is a CAPTURE
  // preset, and under it the pass switches off entirely. At brightness
  // 1.0 the chain is byte-identical (the getter returns the request
  // verbatim). lightingvisuals.applyValues() calls the feature-detected
  // hook on every rig write.
  // review pass2-r1 P1: the kill must SURVIVE retunes — setLook('tournament')
  // and renderQuality({ bloom }) write bloom.strength directly after a
  // rig apply, which re-armed the halo under the still-bright rig. The
  // strength property becomes a REQUEST register: writers set the
  // requested strength; the render-time getter returns 0 while a
  // brightness>1 rig is active and the request verbatim otherwise.
  let bloomStrengthReq = bloom.strength;
  let bloomRigBright = false;
  Object.defineProperty(bloom, 'strength', {
    get() { return bloomRigBright ? 0 : bloomStrengthReq; },
    set(v) { bloomStrengthReq = v; },
  });
  window.__obBloom = {
    pass: bloom,
    // review pass2-r2 P2 + r5 P2: TABLE-CLASS-scoped — the measured halo
    // mechanism (brass mirror glints under the re-lit rig) is the snooker
    // XW101 family; a pool/carom user hanging the snooker luminaire
    // cross-table, or sliding brightness above 1.0 there, keeps the stock
    // bloom. GH-975: every lamp over the 12-ft bed is now matched to the
    // photo-fit level, so the kill no longer depends on which lamp hangs
    // (`fixture` stays in the signature for mixed-vintage callers).
    track(brightness, fixture, bakeClass) {
      bloomRigBright = Math.max(1, brightness || 1) > 1.001
        && bakeClass === 'snooker_12ft';
    },
  };
  composer.addPass(new ShaderPass(ExposureFalloffShader));
  const output = new OutputPass();
  composer.addPass(output);
  // createAccumulator + look handle; `pixelRatio` records the applied
  // composer ratio for consumers (offline-render.js pins it to 1 around
  // exports so output pixels never depend on device DPR — WYSIWYG law).
  composer.__obCine = { renderer, output, w, h, bloom, pixelRatio: pr };
  // keep the record truthful through later changes (offline-render pin/
  // restore, __test.renderQuality scale) without touching the vendor class.
  const applyPixelRatio = composer.setPixelRatio.bind(composer);
  composer.setPixelRatio = (pr) => {
    composer.__obCine.pixelRatio = pr;
    applyPixelRatio(pr);
  };
  return composer;
}

// offline sub-frame accumulator (record.mjs --shutter/--dof, main.js
// __test.renderAccum): N sub-frames are rendered through the normal chain
// with the OutputPass DISABLED, so the pre-tonemap linear HDR result is
// summed (weight 1/N) into a float target; resolve() then runs the OutputPass
// (ACES + sRGB) ONCE on the average — true linear-light motion blur, no
// tonemapped-ghost stepping, and only one screenshot per output frame.
export function createAccumulator(composer) {
  const { renderer, output, w, h } = composer.__obCine;
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.FloatType, depthBuffer: false });
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, weight: { value: 1 } },
    vertexShader: ExposureFalloffShader.vertexShader,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float weight; varying vec2 vUv;
      void main() { gl_FragColor = vec4( texture2D( tDiffuse, vUv ).rgb * weight, 1.0 ); }`,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
    depthTest: false, depthWrite: false, transparent: true,
  });
  const quad = new FullScreenQuad(mat);
  return {
    begin() {
      // follow the composer's CURRENT size: the in-app exporter re-renders
      // at output resolution (offline-render.js resizes the composer), so a
      // boot-sized accumulation buffer would silently soften every frame
      const rb = composer.readBuffer;
      if (rt.width !== rb.width || rt.height !== rb.height) {
        rt.setSize(rb.width, rb.height);
      }
      const c = renderer.getClearColor(new THREE.Color());
      const a = renderer.getClearAlpha();
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, false, false);
      renderer.setClearColor(c, a);
      renderer.setRenderTarget(null);
    },
    /** Render the current scene state through the composer (pre-tonemap) and
     * add it into the average with `weight` (callers pass 1/N). */
    add(weight) {
      const toScreen = composer.renderToScreen;
      output.enabled = false;
      composer.renderToScreen = false; // falloff must land in readBuffer
      composer.render();
      output.enabled = true;
      composer.renderToScreen = toScreen;
      mat.uniforms.tDiffuse.value = composer.readBuffer.texture;
      mat.uniforms.weight.value = weight;
      const autoClear = renderer.autoClear;
      renderer.autoClear = false; // additive: must NOT wipe the running sum
      renderer.setRenderTarget(rt);
      quad.render(renderer);
      renderer.setRenderTarget(null);
      renderer.autoClear = autoClear;
    },
    /** Tonemap the accumulated average to the screen. */
    resolve() {
      output.renderToScreen = true;
      output.render(renderer, null, rt);
    },
    /** Release the float target — after a 4K export it is the feature's
     * single largest GPU allocation (rgba32f at 3840×2160 ≈ 133 MB) and
     * would otherwise be retained for the rest of the session. Callers
     * (main.js __test.releaseAccum ← offline-render.js finally) recreate
     * the accumulator lazily on next use. */
    dispose() {
      rt.dispose();
      mat.dispose();
      quad.dispose?.();
    },
  };
}
