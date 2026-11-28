// Copyright (c) Meta Platforms, Inc. and affiliates.

// post/depth.js — scene depth for the club post chain, without a second scene pass.
//
// The app's composer renders the scene into a 4x multisampled half-float target whose depth is NOT resolved (nothing read it).
// The chain gives each of the composer's two ping-pong targets a depth texture; three r170 then resolves the multisampled depth
// into it in the same blit that resolves the colour (WebGLTextures.updateMultisampleRenderTarget, `resolveDepthBuffer`). Both
// targets get one because the RenderPass draws into whichever is `readBuffer`, and that alternates when a frame has an odd
// number of swapping passes (the offline accumulator disables the OutputPass, one swap fewer).
//
// The resolve flag is ARMED only for frames whose lens can run (post.js decides at the frame hook), and only until the lens
// has read the depth: a frame without the lens resolves colour only, exactly as the app's chain does. While the flag is OFF
// three INVALIDATES the resolved depth attachment at every resolve of that target, so the depth texture is valid from the
// scene render until the first resolve after disarm() and no longer: the lens reads it before it disarms.
// The linear copy (view distance in metres, a club-owned R32F target) is drawn only for a consumer that asks for it
// (`post.depthTexture`, the occlusion pass behind its tool switch).
import * as THREE from 'three';
import { fsMaterial, makeTarget, fitTarget } from './fsq.js';

const COPY_FRAG = /* glsl */`
uniform sampler2D tDepth;
uniform vec2 uNearFar;
out highp vec4 outDepth;
void main() {
  float z = texture( tDepth, vUv ).r;
  // perspective depth [0,1] -> positive view distance in metres (the far plane where nothing was drawn)
  float d = uNearFar.x * uNearFar.y / ( uNearFar.y - z * ( uNearFar.y - uNearFar.x ) );
  outDepth = vec4( d, 0.0, 0.0, 1.0 );
}`;

export function createDepth({ composer, drawer }) {
  const targets = [composer.renderTarget1, composer.renderTarget2];
  const saved = targets.map((rt) => ({ rt, depthTexture: rt.depthTexture, resolveDepthBuffer: rt.resolveDepthBuffer }));
  for (const rt of targets) {
    const dt = new THREE.DepthTexture(rt.width, rt.height);
    dt.name = 'club.post.sceneDepth';
    rt.depthTexture = dt;
    rt.resolveDepthBuffer = true;
    rt.dispose(); // re-created with the depth attachment on next use (the app's renderQuality does the same for `samples`)
  }
  const linear = makeTarget(targets[0].width, targets[0].height, {
    type: THREE.FloatType, format: THREE.RedFormat, filter: THREE.NearestFilter, name: 'club.post.linearDepth' });
  const uniforms = { tDepth: { value: null }, uNearFar: { value: new THREE.Vector2(0.01, 50) } };
  const material = fsMaterial('club.post.depthCopy', COPY_FRAG, uniforms);
  let armed = true, linearDrawn = false;

  return {
    linear,
    /** True once the linear copy has been drawn (its bytes count from then on). */
    get linearUsed() { return linearDrawn; },
    get texture() { return linear.texture; },
    /** True when `rb` carries a depth texture this module attached and the flag was armed for the scene render. */
    valid(rb) { return armed && !!rb?.depthTexture?.isDepthTexture && rb.resolveDepthBuffer === true; },
    /** Copy the frame's depth out of `rb` (the RenderPass target) as linear view distance. */
    copy(renderer, rb, camera) {
      fitTarget(linear, rb.width, rb.height);
      uniforms.tDepth.value = rb.depthTexture;
      uniforms.uNearFar.value.set(camera.near, camera.far);
      drawer.draw(renderer, material, linear);
      linearDrawn = true;
    },
    /** Later resolves blit colour only (and from the next one on the depth textures no longer hold the frame's depth). */
    disarm() { if (!armed) return; armed = false; for (const rt of targets) rt.resolveDepthBuffer = false; },
    /** Before a scene render: resolve depth with colour. */
    arm() { if (armed) return; armed = true; for (const rt of targets) rt.resolveDepthBuffer = true; },
    get armed() { return armed; },
    bytes() { return targets.reduce((n, rt) => n + rt.width * rt.height * 4, 0); }, // two 24-bit depth textures (4 bytes a texel)
    dispose() {
      for (const s of saved) {
        const dt = s.rt.depthTexture;
        s.rt.depthTexture = s.depthTexture; s.rt.resolveDepthBuffer = s.resolveDepthBuffer;
        s.rt.dispose(); dt?.dispose?.();
      }
      linear.dispose(); material.dispose();
    },
  };
}
