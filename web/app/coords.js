// Copyright (c) Meta Platforms, Inc. and affiliates.

// coords.js — kernel (z-up, +y toward foot) ⇄ three.js (y-up, +x toward foot)
// frame bridge. Mapping (see scene/table.js): three.x = k.y, three.y = k.z,
// three.z = k.x. That basis change is the proper rotation −120° about
// (1,1,1)/√3, so kernel orientation quaternions map via conjugation.
import * as THREE from 'three';

// x→z, y→x, z→y as a quaternion (w last in THREE order): (−.5,−.5,−.5,.5)
const QM = new THREE.Quaternion(-0.5, -0.5, -0.5, 0.5);
const QM_INV = QM.clone().invert();
const tmpQ = new THREE.Quaternion();

/** kernel position (kx, ky, kz) → three Vector3 (written into out). */
export function kPosToThree(out, kx, ky, kz) {
  return out.set(ky, kz, kx);
}

/** three position → kernel {x, y, z}. */
export function threePosToK(v) {
  return { x: v.z, y: v.x, z: v.y };
}

/**
 * kernel orientation quaternion (w, x, y, z) → three Quaternion (into out):
 * q_three = QM ∘ q_k ∘ QM⁻¹ (conjugation by the basis change).
 */
export function kQuatToThree(out, kw, kx, ky, kz) {
  tmpQ.set(kx, ky, kz, kw);
  return out.copy(QM).multiply(tmpQ).multiply(QM_INV);
}

/**
 * Aim azimuth: kernel phi (0 = +k.x, π/2 = +k.y) from a three-frame
 * direction (dx, dz) on the table plane. k.x = three.z, k.y = three.x.
 */
export function phiFromThreeDir(dx, dz) {
  return Math.atan2(dx, dz);
}

/** Unit three-frame direction (x, z) for kernel phi. */
export function threeDirFromPhi(phi) {
  return { x: Math.sin(phi), z: Math.cos(phi) };
}
