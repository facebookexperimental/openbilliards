// Copyright (c) Meta Platforms, Inc. and affiliates.

// orbit.js — minimal orbit/zoom/pan camera rig (no vendored OrbitControls).
// Right-drag (or shift+left-drag) orbits, wheel zooms, middle-drag pans the
// orbit target (issue #56). Left-drag is left to the aim controller. Angles
// clamped so the camera never dives under the bed; when the integrator
// publishes `state.bounds` (half-extents from the ACTIVE table footprint +
// margin — aim.js derives them from game.template, null = unclamped) USER
// pans are clamped inside pan() — the ONLY user-target-write path (desktop
// middle-drag and the touch.js three-finger pan both route through it).
// Programmatic target writes stay exact: the aim-view chase (aim.js) damps
// orbit.state toward look = ball + d·1.0 every frame, and a near-rail aim
// legitimately looks PAST the clamp (#56 review F1 — clamping in apply()
// pinned the target and translated the whole pose back along the aim line).
// Single-pose law (issue #56): starting a camera gesture while the aim view
// is engaged disengages it IN PLACE through the window seam — the rig pose
// is the only pose, so there is nothing to jump back to. Wheel zoom follows
// the same law (#56 review F2: without the disengage the chase lerps the
// radius straight back — rubber-band).
import * as THREE from 'three';

// pan gain: world metres per pointer px per radius unit — scales with the
// view radius so pan speed tracks the zoom level (issue #56).
const PAN_GAIN = 0.0018;

export function createOrbit(camera, dom, {
  target = new THREE.Vector3(0, 0.05, 0),
  radius = 2.7, theta = -0.9, phi = 1.05,
} = {}) {
  const s = { target, radius, theta, phi, bounds: null }; // phi: polar from +y
  let dragging = false, panning = false, lastX = 0, lastY = 0;

  function apply() {
    s.phi = Math.min(1.45, Math.max(0.15, s.phi));
    s.radius = Math.min(6.5, Math.max(0.7, s.radius));
    camera.position.set(
      s.target.x + s.radius * Math.sin(s.phi) * Math.sin(s.theta),
      s.target.y + s.radius * Math.cos(s.phi),
      s.target.z + s.radius * Math.sin(s.phi) * Math.cos(s.theta));
    camera.lookAt(s.target);
  }

  /** Pan: translate the orbit target in the camera's ground-plane basis
   * (grab semantics — the scene follows the pointer). Screen-right on the
   * ground plane is (cosθ, 0, −sinθ); screen-up is the away-from-camera
   * direction (−sinθ, 0, −cosθ). USER pans clamp to `state.bounds` HERE —
   * not in apply() — so the aim-view chase writes stay exact (#56 review
   * F1). A target a disengaged near-rail aim view left out of bounds is
   * kept (pose continuity) and pulled back by the next pan (recorded
   * choice: clamp-on-next-user-pan). */
  function pan(dx, dy) {
    const g = s.radius * PAN_GAIN;
    const sinT = Math.sin(s.theta), cosT = Math.cos(s.theta);
    s.target.x += (-dx * cosT - dy * sinT) * g;
    s.target.z += (dx * sinT - dy * cosT) * g;
    if (s.bounds) { // pan clamp: ACTIVE table footprint + margin (issue #56)
      s.target.x = Math.min(s.bounds.x, Math.max(-s.bounds.x, s.target.x));
      s.target.z = Math.min(s.bounds.z, Math.max(-s.bounds.z, s.target.z));
    }
    apply();
  }

  dom.addEventListener('pointerdown', (e) => {
    if (e.button === 1) { // middle-drag = pan (issue #56 M9)
      // disengage-in-place: a camera gesture exits the aim view first
      // (window seam — zero import edges; absent seam = plain pan)
      try { window.__aim?.setAimView?.(false); } catch { /* seam absent */ }
      panning = true; lastX = e.clientX; lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
      // same disengage-in-place law for orbit starts; while AIMING these
      // presses never reach here (aim.js claims fine-aim / aim-view power
      // with stopImmediatePropagation), so gameplay claims are untouched
      try { window.__aim?.setAimView?.(false); } catch { /* seam absent */ }
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });
  dom.addEventListener('pointermove', (e) => {
    if (panning) {
      pan(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
      return;
    }
    if (!dragging) return;
    s.theta -= (e.clientX - lastX) * 0.005;
    s.phi -= (e.clientY - lastY) * 0.005;
    lastX = e.clientX; lastY = e.clientY;
    apply();
  });
  const end = (e) => {
    if (dragging || panning) {
      dragging = false; panning = false;
      dom.releasePointerCapture?.(e.pointerId);
    }
  };
  dom.addEventListener('pointerup', end);
  dom.addEventListener('pointercancel', end);
  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  dom.addEventListener('wheel', (e) => {
    // disengage-in-place: wheel zoom is a camera gesture like the drags
    // above (#56 review F2) — while the aim view is engaged the chase
    // would lerp the written radius straight back (rubber-band), so exit
    // the aim view first (mirrors the pointerdown branches; no-op when
    // the aim view is not engaged or the seam is absent)
    try { window.__aim?.setAimView?.(false); } catch { /* seam absent */ }
    s.radius *= Math.exp(e.deltaY * 0.001);
    apply();
    e.preventDefault();
  }, { passive: false });

  apply();
  return { state: s, apply, pan, isOrbiting: () => dragging || panning };
}
