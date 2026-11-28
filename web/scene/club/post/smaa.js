// Copyright (c) Meta Platforms, Inc. and affiliates.

// post/smaa.js — SMAA after the tone map, attached so that every path that tone-maps to the screen gets it.
//
// SMAA needs display-referred colour, so it has to follow the OutputPass. A pass appended after the OutputPass would be on the
// screen only: the offline accumulator calls the OutputPass by itself on its averaged buffer (`resolve()`), so an exported frame
// would lack it. Instead the app's OutputPass INSTANCE gets a wrapped render(): whenever it is asked to draw to the screen, it
// draws into an 8-bit club target and the vendored SMAAPass draws that to the screen. Calls that render the OutputPass into a
// target (the preview-ink sampler) pass straight through, and the composer's pass list and buffer swaps are untouched.
// Any failure restores the plain OutputPass for good.
import * as THREE from 'three';
import { makeTarget, fitTarget, targetBytes } from './fsq.js';

export function createSmaa({ output, SMAAPass }) {
  const ldr = makeTarget(4, 4, { type: THREE.UnsignedByteType, filter: THREE.LinearFilter, name: 'club.post.display' });
  const pass = new SMAAPass(4, 4);
  // the vendored pass allocates half-float edge and weight targets; SMAA's own formats are 8 bit, a quarter of the bytes
  pass.edgesRT.texture.type = THREE.UnsignedByteType;
  pass.weightsRT.texture.type = THREE.UnsignedByteType;
  pass.renderToScreen = true;
  pass.clear = true; // the edge and weight shaders discard: their targets are cleared every frame whatever renderer.autoClear is
  const hadOwn = Object.prototype.hasOwnProperty.call(output, 'render');
  const plain = output.render;
  const state = { on: true, failed: null, frames: 0 };
  const texturesReady = () => pass.areaTexture.image?.complete === true && pass.searchTexture.image?.complete === true
    && pass.areaTexture.image.naturalWidth > 0 && pass.searchTexture.image.naturalWidth > 0;

  output.render = function clubOutputRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    if (!state.on || state.failed || this.renderToScreen !== true || !readBuffer || !texturesReady()) {
      return plain.call(this, renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    }
    try {
      if (fitTarget(ldr, readBuffer.width, readBuffer.height)) pass.setSize(ldr.width, ldr.height);
      this.renderToScreen = false;
      try { plain.call(this, renderer, ldr, readBuffer, deltaTime, maskActive); } finally { this.renderToScreen = true; }
      pass.render(renderer, null, ldr);
      state.frames += 1;
    } catch (e) {
      state.failed = String(e?.message ?? e);
      console.warn('[club] post: SMAA failed and is off — the plain output pass stays:', e);
      return plain.call(this, renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    }
    return undefined;
  };

  return {
    state,
    targets() { return [ldr, pass.edgesRT, pass.weightsRT]; },
    bytes() { return targetBytes(ldr) + targetBytes(pass.edgesRT) + targetBytes(pass.weightsRT); },
    dispose() {
      if (hadOwn) output.render = plain; else delete output.render;
      ldr.dispose(); pass.dispose();
    },
  };
}
