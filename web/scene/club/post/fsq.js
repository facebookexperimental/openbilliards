// Copyright (c) Meta Platforms, Inc. and affiliates.

// post/fsq.js — small helpers shared by the club post passes: one full-screen triangle, raw GLSL ES 3.00 materials, render
// targets with a known byte size. Nothing here runs at import time.
import * as THREE from 'three';
import { FullScreenQuad } from '../../../vendor/jsm/postprocessing/Pass.js';

// the vendored full-screen triangle is already in clip space (-1..3), so the vertex stage needs no matrix
export const VERT = /* glsl */`
precision highp float;
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

export const FRAG_HEAD = /* glsl */`
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
in vec2 vUv;
`;

/** A raw full-screen material. `frag` is the body after FRAG_HEAD (it declares its own outputs). */
export function fsMaterial(name, frag, uniforms, { defines = null, blending = THREE.NoBlending, extra = null } = {}) {
  const m = new THREE.RawShaderMaterial({
    name, glslVersion: THREE.GLSL3, uniforms, vertexShader: VERT, fragmentShader: FRAG_HEAD + frag,
    depthTest: false, depthWrite: false, toneMapped: false, blending,
    ...(defines ? { defines } : {}), ...(extra ?? {}),
  });
  return m;
}

const BYTES = { [THREE.UnsignedByteType]: 1, [THREE.HalfFloatType]: 2, [THREE.FloatType]: 4, [THREE.UnsignedIntType]: 4 };
const CHANNELS = { [THREE.RedFormat]: 1, [THREE.RGFormat]: 2, [THREE.RGBAFormat]: 4, [THREE.DepthFormat]: 1 };

/** A club-owned colour target without depth. opts: { type, format, filter, count, name }. */
export function makeTarget(w, h, { type = THREE.HalfFloatType, format = THREE.RGBAFormat, filter = THREE.LinearFilter, count = 1, name = 'club.post' } = {}) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type, format, count, depthBuffer: false, stencilBuffer: false, minFilter: filter, magFilter: filter, generateMipmaps: false,
  });
  rt.textures.forEach((t, i) => { t.name = count > 1 ? `${name}.${i}` : name; });
  rt.userData = { clubName: name };
  return rt;
}

/** Bytes of a target's colour attachments (the number the cost report states). */
export function targetBytes(rt) {
  if (!rt) return 0;
  let n = 0;
  for (const t of rt.textures ?? [rt.texture]) n += rt.width * rt.height * (CHANNELS[t.format] ?? 4) * (BYTES[t.type] ?? 1);
  return n;
}

/** Resize when the size differs; returns true when it changed. */
export function fitTarget(rt, w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (rt.width === w && rt.height === h) return false;
  rt.setSize(w, h);
  return true;
}

/** One shared triangle; draw(renderer, material, target) binds the target (null = the screen) and draws without clearing. */
export function createDrawer() {
  const quad = new FullScreenQuad(null);
  let draws = 0;
  return {
    draw(renderer, material, target) {
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      quad.material = material;
      renderer.setRenderTarget(target);
      quad.render(renderer);
      renderer.autoClear = auto;
      draws += 1;
      // three does not throw when a program fails to link: it logs, marks the program (diagnostics.runnable = false) and
      // the draw call draws nothing. A target that was not drawn must not be taken as the frame, so that case is thrown
      // here: every club pass catches it, keeps its buffers unswapped and gives the app chain back (post.js fail()).
      if (renderer.properties?.get?.(material)?.currentProgram?.diagnostics?.runnable === false) throw new Error(`the program of ${material.name} did not link`);
    },
    take() { const n = draws; draws = 0; return n; },
    dispose() { /* the vendored triangle geometry is shared with the app's passes: nothing to free here */ },
  };
}
