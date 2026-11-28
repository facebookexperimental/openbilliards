// Copyright (c) Meta Platforms, Inc. and affiliates.

// env/mirror.js — a planar mirror for a horizontal plane (the club floor; CONTRACT.md 4.1 `env.mirror`, high tier).
//
// The scene is rendered once more from the camera's reflection in the plane into a half-resolution, half-float target with
// mips; a material then finds the world point its reflected ray reaches at `matrix * point` in that texture (env/glsl.js
// clubEnvFloorRadiance). The virtual camera is a proper rotation of the real one (position, target and up are each
// reflected), so winding and culling are unchanged; its near plane is replaced by the mirror plane (oblique clipping), so
// nothing below the plane leaks in. No light, shadow or program state is touched: the target has the same encoding and tone
// mapping state as the composer's own scene target, so the scene's materials reuse the programs they already have.
import * as THREE from 'three';

export function createMirror({ scale = 0.5, clipBias = 0.003, name = 'clubFloorMirror' } = {}) {
  const target = new THREE.WebGLRenderTarget(4, 4, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: true, depthBuffer: true, stencilBuffer: false, samples: 0,
  });
  target.texture.name = name;
  const camera = new THREE.PerspectiveCamera();
  camera.name = name + 'Camera';
  camera.matrixAutoUpdate = true;
  const matrix = new THREE.Matrix4();
  const uniforms = {
    uClubMirrorMap: { value: target.texture },
    uClubMirrorMatrix: { value: matrix },
    uClubMirrorParams: { value: new THREE.Vector4(0, 1, 0, 2.0) },
    uClubMirrorTexel: { value: new THREE.Vector2(0.25, 0.25) },
  };
  const counts = { renders: 0, skipped: 0, width: 4, height: 4 };

  const normal = new THREE.Vector3(0, 1, 0);
  const planePoint = new THREE.Vector3(), camPos = new THREE.Vector3(), view = new THREE.Vector3();
  const rot = new THREE.Matrix4(), lookAt = new THREE.Vector3(), tgt = new THREE.Vector3();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const size = new THREE.Vector2();
  let busy = false;

  /** Keep the target at `scale` x the size the caller renders at (drawing-buffer pixels). */
  function setSize(w, h) {
    const tw = Math.max(4, Math.floor(w * scale)), th = Math.max(4, Math.floor(h * scale));
    if (tw === counts.width && th === counts.height) return;
    target.setSize(tw, th);
    counts.width = tw; counts.height = th;
    uniforms.uClubMirrorTexel.value.set(1 / tw, 1 / th);
    uniforms.uClubMirrorParams.value.z = Math.max(0, Math.floor(Math.log2(Math.max(tw, th))) - 2);
  }

  /**
   * Render the mirror image of `scene` for `camera` about the plane y = planeY. Called from inside the caller's own render
   * (scene.onBeforeRender), so it saves and restores the renderer state it changes. Returns true when a picture was made.
   */
  function update(renderer, scene, mainCamera, planeY) {
    if (busy || !mainCamera?.isPerspectiveCamera) return false;
    planePoint.set(0, planeY, 0);
    camPos.setFromMatrixPosition(mainCamera.matrixWorld);
    view.subVectors(planePoint, camPos);
    if (view.dot(normal) > 0) { counts.skipped += 1; return false; } // the camera is under the plane
    view.reflect(normal).negate().add(planePoint);
    rot.extractRotation(mainCamera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    tgt.subVectors(planePoint, lookAt).reflect(normal).negate().add(planePoint);
    camera.position.copy(view);
    camera.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    camera.lookAt(tgt);
    camera.near = mainCamera.near; camera.far = mainCamera.far;
    camera.layers.mask = mainCamera.layers.mask;
    camera.updateMatrixWorld();
    camera.projectionMatrix.copy(mainCamera.projectionMatrix);
    // world -> mirror texture coordinates (before the near plane is replaced)
    matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    matrix.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
    // oblique near plane = the mirror plane (Lengyel), so geometry below the plane is clipped
    plane.setFromNormalAndCoplanarPoint(normal, planePoint).applyMatrix4(camera.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pe = camera.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + pe[8]) / pe[0];
    q.y = (Math.sign(clip.y) + pe[9]) / pe[5];
    q.z = -1.0;
    q.w = (1.0 + pe[10]) / pe[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pe[2] = clip.x; pe[6] = clip.y; pe[10] = clip.z + 1.0 - clipBias; pe[14] = clip.w;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    renderer.getDrawingBufferSize(size);
    const rt = renderer.getRenderTarget();
    if (rt) size.set(rt.width, rt.height);
    setSize(size.x, size.y);
    // focal length in mirror texels: half the height times cot(fov / 2)
    uniforms.uClubMirrorParams.value.y = 0.5 * counts.height * mainCamera.projectionMatrix.elements[5];

    const face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const xr = renderer.xr.enabled, autoClear = renderer.autoClear;
    busy = true;
    try {
      renderer.xr.enabled = false;
      renderer.autoClear = true;
      renderer.setRenderTarget(target);
      renderer.state.buffers.depth.setMask(true); // the depth mask may be off when called between draws
      renderer.render(scene, camera);
      counts.renders += 1;
    } finally {
      busy = false;
      renderer.xr.enabled = xr;
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(rt, face, mip);
    }
    return true;
  }

  function bytes() {
    // RGBA16F colour with a mip chain (x 4/3) + a 24-bit depth buffer
    return Math.round(counts.width * counts.height * (8 * 4 / 3 + 4));
  }

  function dispose() { target.dispose(); }

  return { target, texture: target.texture, matrix, camera, uniforms, update, setSize, counts, bytes, dispose };
}
