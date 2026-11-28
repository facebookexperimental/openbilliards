// Copyright (c) Meta Platforms, Inc. and affiliates.

// cameratrack.js — smooth tracking / crane camera rig for offline capture
// (record.mjs camera-spec `cuts` gain {mode:'track'|'crane'} directives) and
// live demos. Advances ONLY from the machine's 'frame' hook (t, dt), so under
// --framestep (__test.renderAt, fixed dt sequence) the camera path is a pure
// function of the frame index — deterministic, capture-safe.
//
// Directive (kernel-frame coords, record.mjs camJs convention
// three.x = k.y, three.y = h, three.z = k.x):
//   {
//     target: 'cue' | 'ball:N' | 'action',  // what the camera follows
//     cam?: [kx, ky, h],       // eye; default = camera pose at start()
//     fov?: number,            // eased toward (default: leave as-is)
//     fovSnap?: true,          // apply fov AT start() — a hard CUT. The
//                              // playback player's per-segment directives
//                              // set it (GH-273 WYSIWYG: live tap and
//                              // renderDrill cut identically); authored
//                              // capture cuts (record.mjs) keep the ease.
//     damp?: seconds,          // look-point smoothing time constant (0.35)
//     lookAhead?: seconds,     // lead the target along its velocity (0.25)
//     maxRate?: rad/s,         // pan angular-velocity cap, no jerks (1.2)
//     crane?: { dir: [kx, ky, h], rate: m/s },  // slow eye dolly (mode crane)
//   }
import * as THREE from 'three';
import { kPosToThree } from './coords.js';

export function createCameraTrack({ machine, game, camera }) {
  let spec = null;
  const eye = new THREE.Vector3(), look = new THREE.Vector3();
  const craneDir = new THREE.Vector3();
  const tgt = new THREE.Vector3(), prevTgt = new THREE.Vector3();
  const desired = new THREE.Vector3(), vel = new THREE.Vector3();
  const dirPrev = new THREE.Vector3(), dirNew = new THREE.Vector3();
  const q = new THREE.Quaternion(), qId = new THREE.Quaternion();
  let firstFrame = true;

  /** Resolve the directive's target to a world point (three frame). */
  function targetPoint(out) {
    if (spec.target === 'action') {
      // centroid of the active-ball bounding box — frames multi-ball action
      const box = new THREE.Box3();
      for (const b of game.activeBalls()) box.expandByPoint(b.mesh.position);
      return box.isEmpty() ? out.set(0, 0, 0) : box.getCenter(out);
    }
    const id = spec.target === 'cue'
      ? (game.record?.events?.[0]?.kind?.Strike?.ball
        ?? game.cueBall?.()?.id ?? 0) // GH-383: carom two-cue aware
      : Number(spec.target.split(':')[1]);
    const ball = game.ballSet.balls.find((b) => b.id === id);
    // pocketed/missing → hold the last smoothed look (camera settles gently).
    // GH-650: a POCKETED ball the ball-return extension is posing along the
    // return track (`mesh.userData.obReturnPosed`, set only by web/scene/
    // ballreturn/index.js while it owns the pose) also HOLDS — its frame hook
    // runs AFTER this one, so a visibility test would read the previous frame's
    // pose in realtime but the parked (invisible) ball under seek(): realtime
    // and framestep captures diverged. The marker is read ONLY together with
    // `pocketed`: a ball a backward seek just revived (pocketed false, visible)
    // is followed on that very frame even though the extension's hook has not
    // cleared its marker yet (review r1 P2-3 — no seek-history dependence). The
    // marker is never set with the extension off, so every shipped table (incl.
    // the cn8 net class, which keeps a netted ball `pocketed && visible` and
    // FOLLOWED) behaves exactly as before.
    return ball && ball.mesh.visible && !(ball.pocketed && ball.mesh.userData.obReturnPosed) ? out.copy(ball.mesh.position) : out.copy(look);
  }

  machine.on('frame', (t, dt) => {
    if (!spec || !(dt > 0)) return;
    targetPoint(tgt);
    if (firstFrame) { prevTgt.copy(tgt); firstFrame = false; }
    // look-ahead along the target's velocity (finite difference, per frame)
    vel.subVectors(tgt, prevTgt).divideScalar(dt);
    const vlen = Math.min(vel.length(), 4); // clamp glitches
    if (vel.lengthSq() > 0) vel.setLength(vlen);
    desired.copy(tgt).addScaledVector(vel, spec.lookAhead).setY(0.02);
    prevTgt.copy(tgt);
    // damped pan: exponential approach of the look point…
    const k = 1 - Math.exp(-dt / spec.damp);
    dirPrev.subVectors(look, eye);
    look.lerp(desired, k);
    // …with a hard angular-velocity cap so cuts to a fast target never jerk
    const rPrev = dirPrev.length();
    if (rPrev > 1e-6) {
      dirNew.subVectors(look, eye);
      const rNew = dirNew.length();
      const ang = dirPrev.angleTo(dirNew);
      const maxAng = spec.maxRate * dt;
      if (ang > maxAng && rNew > 1e-6) {
        q.setFromUnitVectors(dirPrev.normalize(), dirNew.normalize());
        q.slerp(qId.identity(), 1 - maxAng / ang); // partial rotation only
        look.copy(dirPrev.applyQuaternion(q).setLength(rNew)).add(eye);
      }
    }
    // crane: slow eye dolly during long rolls (mode 'crane' or crane field)
    if (spec.craneRate) eye.addScaledVector(craneDir, spec.craneRate * dt);
    if (spec.fov) {
      camera.fov += (spec.fov - camera.fov) * k;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(eye);
    camera.lookAt(look);
  });

  window.__track = {
    start(s) {
      spec = {
        target: s.target ?? 'cue',
        damp: s.damp ?? 0.35,
        lookAhead: s.lookAhead ?? 0.25,
        maxRate: s.maxRate ?? 1.2,
        fov: s.fov ?? 0,
        craneRate: s.crane?.rate ?? 0,
      };
      if (s.cam) kPosToThree(eye, s.cam[0], s.cam[1], s.cam[2]);
      else eye.copy(camera.position);
      if (s.fovSnap && spec.fov) {
        // GH-273 review round 3: a per-segment camera directive is a CUT.
        // Without the snap the fov EASED from whatever the previous writer
        // left — history — so an exported chase segment entered from
        // overhead eased 78→40 while the live player cut instantly. The
        // rig owns the snap so both paths ride one mechanism; the frame
        // handler's ease then holds it (target == current).
        camera.fov = spec.fov;
        camera.updateProjectionMatrix();
      }
      if (s.crane?.dir) kPosToThree(craneDir, s.crane.dir[0], s.crane.dir[1], s.crane.dir[2]).normalize();
      // seed the look point from the target so the first frame doesn't swing
      firstFrame = true;
      targetPoint(look).setY(0.02);
      camera.position.copy(eye);
      camera.lookAt(look);
      return true;
    },
    stop() { spec = null; },
    active: () => !!spec,
    // GH-997: the follower's integrated state, so an offline render that
    // rewinds into the middle of a track segment (offline-render.js
    // trackRing) re-renders each frame under the exact state it first
    // rendered under. Everything else the handler touches is per-frame
    // scratch or derived from these.
    snapshot() {
      if (!spec) return null;
      return { spec, eye: eye.toArray(), look: look.toArray(),
        prevTgt: prevTgt.toArray(), craneDir: craneDir.toArray(),
        firstFrame, fov: camera.fov };
    },
    restore(s) {
      if (!s) return false;
      spec = s.spec;
      eye.fromArray(s.eye);
      look.fromArray(s.look);
      prevTgt.fromArray(s.prevTgt);
      craneDir.fromArray(s.craneDir);
      firstFrame = s.firstFrame;
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
      camera.position.copy(eye);
      camera.lookAt(look);
      return true;
    },
  };
}
