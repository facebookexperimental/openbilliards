// Copyright (c) Meta Platforms, Inc. and affiliates.

// camerapresets.js — named camera framings for offline capture and demos
// (web/tools/record.mjs --camera; wired as __test.setCamera in main.js).
// Applied THROUGH the orbit rig (orbit.js createOrbit's {state, apply}) so
// interactive orbit/zoom keeps working from the new pose. All presets are
// computed from live game state (cue ball, aim phi, active-ball bounding
// box), never hardcoded to a scenario.
//
//   default — the app's boot framing (orbit.js defaults)
//   side    — low along a short rail, cue-ball end, whole table in profile
//   top     — overhead, near-orthographic reading of the full bed
//   follow  — behind the cue ball, down the aim line (aim-view framing)
//   closeup — tight on the action cluster (active-ball bounding box)
import * as THREE from 'three';
import { threeDirFromPhi } from './coords.js';
import { TABLE } from '../scene/table.js';

export const CAMERA_PRESETS = ['default', 'side', 'top', 'follow', 'closeup'];

// orbit.js clamps phi (polar from +y) to [0.15, 1.45] — presets stay inside.
const PHI_MIN = 0.16, PHI_MAX = 1.44;

/** Set orbit state so the camera sits at `eye` looking at `target`. */
function pose(orbit, eye, target) {
  const d = new THREE.Vector3().subVectors(eye, target);
  orbit.state.target.copy(target);
  orbit.state.radius = d.length();
  orbit.state.phi = Math.min(PHI_MAX,
    Math.max(PHI_MIN, Math.acos(d.y / d.length())));
  orbit.state.theta = Math.atan2(d.x, d.z);
  orbit.apply();
}

/** Bounding box of the active (on-table) balls, three.js frame. */
function actionBox(game) {
  const box = new THREE.Box3();
  for (const b of game.activeBalls()) box.expandByPoint(b.mesh.position);
  return box;
}

export function applyCameraPreset(name, { orbit, game, camera }) {
  // GH-441 (review r8 P2): a preset apply takes fov OWNERSHIP — cancel any
  // post-exit aim-view fov settle, or a one-shot `__test.setCamera('top')`
  // before a renderAt export would have its wide fov pulled toward 40 on
  // every exported frame (feature-detected seam; stale aim.js = no settle
  // to cancel).
  window.__aim?.fovSettleCancel?.();
  const cue = game.cueBall().mesh.position;
  // ACTIVE table dims (feature 012, render-capacity.md §4): the sim table
  // of the current rack template — the frozen TABLE mirror framed the 12-ft
  // snooker table ~0.5 m short. Kernel length = three.x span (long axis).
  // scale ≥ 1 widens the whole-table presets; the default 9-ft footprint
  // keeps scale = 1 and every preset byte-identical to pre-012.
  const dims = game.template?.system?.table ?? TABLE;
  const scale = Math.max(1, dims.length / TABLE.length);
  // `top` widens the fov (it must sit UNDER the hanging light box at
  // y = 1.02, see scene/room.js LIGHT_POS); every other preset restores it.
  // Longer tables widen it further: the under-light radius cannot grow, so
  // fit comes from the horizontal fov needed for length/2 (+6% margin) at
  // the pinned radius, clamped to a still-readable 110°.
  const setFov = (fov) => {
    if (!camera || camera.fov === fov) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  };
  let topFov = 78;
  if (scale > 1 && camera) {
    const ha = Math.atan((dims.length * 0.53) / 0.985); // horizontal half-angle
    const v = 2 * THREE.MathUtils.radToDeg(
      Math.atan(Math.tan(ha) / Math.max(camera.aspect, 1)));
    topFov = Math.min(110, Math.max(78, v));
  }
  setFov(name === 'top' ? topFov : 40);
  switch (name) {
    case 'default': {
      // orbit.js boot defaults (radius follows the active table length)
      orbit.state.target.set(0, 0.05, 0);
      Object.assign(orbit.state, { radius: 2.7 * scale, theta: -0.9, phi: 1.05 });
      orbit.apply();
      return true;
    }
    case 'side': {
      // low behind the short rail nearest the cue ball, looking up-table
      const sign = cue.x >= 0 ? 1 : -1;
      pose(orbit,
        new THREE.Vector3(sign * (dims.length / 2 + 0.95 * scale), 0.34 * scale, 0),
        new THREE.Vector3(-sign * dims.length * 0.12, 0.02, 0));
      return true;
    }
    case 'top': {
      // near-overhead (orbit's polar clamp keeps a whisper of tilt, which
      // also keeps lookAt's up vector well-conditioned); the camera must
      // stay under the hanging light box (y = 1.02), so it flies low with
      // a wide fov — long axis lands horizontal on a 16:9 viewport.
      // issue #89: a lighting fixture hanging LOWER than the canopy (the
      // pendant bar's shade aperture ~0.90 m) caps the under-light radius
      // via the feature-detected __lighting seam; the fov widens to keep
      // the full bed. Canopy default: clearanceY 1.02 → radius exactly
      // 0.985 and the pinned fov — byte-identical framing.
      const clearY = window.__lighting?.state?.()?.clearanceY ?? 1.02;
      const topR = Math.min(0.985, clearY - 0.035);
      if (topR < 0.985 && camera) {
        const ha = Math.atan((dims.length * 0.53) / topR);
        setFov(Math.min(110, Math.max(topFov,
          2 * THREE.MathUtils.radToDeg(
            Math.atan(Math.tan(ha) / Math.max(camera.aspect, 1))))));
      }
      orbit.state.target.set(0, 0, 0);
      Object.assign(orbit.state, { radius: topR, theta: 0, phi: PHI_MIN });
      orbit.apply();
      return true;
    }
    case 'follow': {
      // behind the cue ball, down the aim line (aim.js aim-view framing)
      const d = threeDirFromPhi(game.phi);
      pose(orbit,
        new THREE.Vector3(cue.x - d.x * 0.80, 0.33, cue.z - d.z * 0.80),
        new THREE.Vector3(cue.x + d.x * 0.9, 0.0, cue.z + d.z * 0.9));
      return true;
    }
    case 'closeup': {
      // tight on the action cluster, viewed from behind the aim direction
      const box = actionBox(game);
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const spread = Math.hypot(size.x, size.z);
      const dist = Math.min(2.0, Math.max(0.5, spread * 1.15 + 0.28));
      const d = threeDirFromPhi(game.phi);
      pose(orbit,
        new THREE.Vector3(c.x - d.x * dist * 0.9, dist * 0.55,
          c.z - d.z * dist * 0.9),
        new THREE.Vector3(c.x, 0.02, c.z));
      return true;
    }
    default:
      return false;
  }
}

// ------------------------------------------------------------------ GH-441
// Default-camera register: the Settings → Display 'Default camera' control
// (settings.js 'camera' key, 'orbit' | 'overhead') selects the pose the
// LIVE rig starts from at boot and returns to on every fresh rack. It is a
// starting/'return home' pose, never a lock — the player orbits away
// freely (orbit.js clamps apply) and the aim view glides down as always
// (single-pose law, issue #56).
//
// 'overhead' is a DERIVED top-down register, distinct from the byte-pinned
// 'top' CAPTURE preset above: 'top' predates GH-381 and ducks UNDER the
// hanging luminaire (radius ≤ 0.985, wide 78–110° fov); the register flies
// HIGH with a TIGHT fov so the bed reads near-orthographic — legitimate
// since the GH-381 occluder-fade dissolves the lamp assembly whenever the
// eye rises above its plane (scene/lampfade.js). Nothing here is per-class:
// height falls out of the ACTIVE bed size + fov + viewport aspect, so all
// three table classes (pool/snooker/carom) frame with one margin law.
//
// Broadcast/export rigs (camerascript.js, cameratrack.js, record.mjs,
// offline-render.js camera segments) never read the setting or this
// register — replays and exports keep their own cameras (GH-441 design
// record, constraint 4).

/** Vertical fov [deg] of the overhead register — tight enough that the bed
 * reads near-orthographic (≤ ~9% corner-vs-center scale falloff on a 16:9
 * pool frame), wide enough that the fitted radius stays inside the orbit
 * zoom clamp for every table class on landscape viewports. */
const OVERHEAD_FOV = 22;
/** One margin constant for every class: half-extents framed are
 * (bed/2 + rail overhang) × this (the presets' 0.53 = 0.5 × 1.06 law). */
const OVERHEAD_MARGIN = 1.06;
/** Rail overhang past the cushion nose [m]: cushion + wood rail top of the
 * DEFAULT table entry (scene/table.js TABLE mirror). Per-entry rails vary
 * by ≲ ±0.03 m — absorbed by OVERHEAD_MARGIN, no per-class constants. */
const RAIL_OVERHANG = TABLE.cushionWidth + TABLE.frameWidth;
/** orbit.js apply() zoom ceiling (duplicated-literal law — change with
 * orbit.js): the register writes THROUGH the rig, so this is a hard cap. */
const ORBIT_RADIUS_MAX = 6.5;

/** Derive the overhead register for a bed of `dims` (kernel table: length
 * spans three.x — the long axis; width spans three.z) on a viewport of
 * `aspect`. Pure math, exported for the e2e formula probes.
 *
 * The long axis rides the LONG screen dimension (theta 0 on landscape, π/2
 * on portrait), then the eye height is whatever the tight OVERHEAD_FOV
 * needs to fit both framed half-extents; phi sits at the orbit polar floor
 * (a whisper of tilt keeps lookAt's up vector well-conditioned — the 'top'
 * preset precedent; the ~1% cos(phi) height cost and the small keystone
 * asymmetry are absorbed by OVERHEAD_MARGIN). When the fitted radius would
 * exceed the orbit zoom clamp (snooker on portrait phones), the radius
 * pins at the clamp and the fov widens to keep the fit — the 'top' preset
 * pinned-radius law, with the pin at the top of the range instead of under
 * the lamp. */
export function overheadRegister(dims, aspect) {
  const a = Math.min(5, Math.max(0.2, aspect || 1));
  const ex = (dims.length / 2 + RAIL_OVERHANG) * OVERHEAD_MARGIN;
  const ez = (dims.width / 2 + RAIL_OVERHANG) * OVERHEAD_MARGIN;
  // required eye height over the bed for a vertical half-tangent tanV
  // (horizontal half-tangent = tanV × aspect; three.js fov is vertical)
  const need = (tanV) => (a >= 1
    ? Math.max(ex / (tanV * a), ez / tanV)   // landscape: x → screen-x
    : Math.max(ex / tanV, ez / (tanV * a))); // portrait: x → screen-y
  let fov = OVERHEAD_FOV;
  let radius = need(Math.tan(THREE.MathUtils.degToRad(fov) / 2))
    / Math.cos(PHI_MIN);
  if (radius > ORBIT_RADIUS_MAX) {
    radius = ORBIT_RADIUS_MAX;
    const h = radius * Math.cos(PHI_MIN);
    const tanV = a >= 1
      ? Math.max(ex / (h * a), ez / h)
      : Math.max(ex / h, ez / (h * a));
    fov = 2 * THREE.MathUtils.radToDeg(Math.atan(tanV));
  }
  return { radius, theta: a >= 1 ? 0 : Math.PI / 2, phi: PHI_MIN, fov };
}

/** Apply the default-camera register for `mode` through the orbit rig.
 * 'overhead' poses the derived register; anything else (the 'orbit'
 * default and any stale persisted string) restores the boot framing — the
 * 'default' preset pose + the 40° play fov. Callers gate WHEN this runs
 * (main.js: real-user boots + fresh racks + live settings flips; scripted
 * boots pin 'orbit' by never calling it — the bootLook law). */
export function applyDefaultCamera(mode, { orbit, game, camera }) {
  if (mode !== 'overhead') {
    return applyCameraPreset('default', { orbit, game, camera });
  }
  const dims = game.template?.system?.table ?? TABLE;
  const reg = overheadRegister(dims, camera?.aspect ?? 1);
  if (camera && camera.fov !== reg.fov) {
    camera.fov = reg.fov;
    camera.updateProjectionMatrix();
  }
  orbit.state.target.set(0, 0, 0);
  Object.assign(orbit.state,
    { radius: reg.radius, theta: reg.theta, phi: reg.phi });
  orbit.apply();
  return true;
}
