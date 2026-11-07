// Copyright (c) Meta Platforms, Inc. and affiliates.

// O3: contact classification is one published Float32 position quantum at
// this actual solid set's table-space magnitude. No physical clearance is
// fitted to a frame, and no geometry/identity tolerance is changed.
import * as THREE from '../../../web/vendor/three.module.min.js';

export function meshQuantum(group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), point = new THREE.Vector3();
  let magnitude = 0, vertices = 0;
  group.traverse(object => {
    if (!object.isMesh) return;
    let visible = true; for (let o = object; o; o = o.parent) visible &&= o.visible;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!visible || !materials.some(m => m?.visible && !m.transparent && m.opacity === 1)) return;
    const position = object.geometry.getAttribute('position'), matrix = inverse.clone().multiply(object.matrixWorld);
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(matrix);
      magnitude = Math.max(magnitude, Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)); vertices++;
    }
  });
  if (!(magnitude > 0) || !Number.isFinite(magnitude)) throw new Error('Contact quantum needs finite actual solids');
  const value = new Float32Array([magnitude]), words = new Uint32Array(value.buffer), rounded = value[0];
  words[0]++;
  const quantum = value[0] - rounded;
  return { tag: 'DERIVED / IEEE-754 binary32 next representable value at the actual table-space magnitude',
    magnitude_m: magnitude, float32_magnitude_m: rounded, next_float32_m: value[0],
    quantum_m: quantum, quantum_mm: quantum * 1000, vertices,
    boundary: 'Distances strictly below one storage quantum are contact/seam hits; equality and all farther hits remain occluders. This does not change the interpenetration test allowance or any published vertex.' };
}
