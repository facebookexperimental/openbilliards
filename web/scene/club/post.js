// Copyright (c) Meta Platforms, Inc. and affiliates.

// post.js — the club look's post chain (CONTRACT.md sections 4.4, 8.5 and 10.2). Owner: post.
//
//   scene -> [club.depth: 0 draws] -> bloom (the app's pass, retuned) -> [club.dof: 3 draws] -> falloff (the app's pass, folded
//         into the next one) -> club.grade (falloff + grade, 1 draw) -> OutputPass (the app's)
//
// The chain is built ON the app's EffectComposer: club passes are inserted into `composer.passes` between its RenderPass and
// its OutputPass, and neither postfx.js nor main.js is edited.
//
// Readability first (CONTRACT.md 10.2). The lens never softens a ball on the bed, the aim line or a pocket, by construction:
// its sharp range ends at the farthest visible point of the table volume and has no near limit, and the shaders multiply the
// blur radius by 0 inside that volume (post/guard.js has the rule and its arithmetic, post/dof.js the shaders). A pixel that
// is not blurred is written back bit for bit, and the lens sits AFTER the app's bloom, so everything that reaches it is the
// same with the lens on and off: on the table the two frames are equal to the last bit, through the grade and the tone map.
//
// Tiers (what a frame costs beyond the app's own chain; the node arm pins it):
//   lite   nothing added: the grade is drawn in place of the app's falloff pass (one draw for one draw); the app's bloom is off.
//   base   camera or a ball moving: as lite plus the app's bloom (the club venue; in the arena the venue row takes the
//          bloom off this tier: tiers.js `tierKnobs`). At rest in a low view: + the lens (3 draws) and one depth
//          blit in the scene pass's resolve. When anything starts to move the lens leaves on a ramp of 0.08 s (4 lens
//          frames at 60 Hz, none of them dearer than the resting frame before; post/focus.js `stillOut`), and it comes back
//          0.12 s after everything rests, eased in. No extra scene render, ever.
//   high   as base, but the lens stays on while the camera moves slowly and fades out with its speed.
// The ambient-occlusion pass and SMAA are OFF on every tier: neither ever showed a gain in a picture (round 1: d11 / d15,
// round 2 report). Their code stays behind the tool switches `clubpost=ao:live` and `clubpost=smaa:1` only.
//
// The taps (GH-329, "what you see is what you export"). Three readers take the frame somewhere other than the screen:
//   1. the offline accumulator (postfx.js createAccumulator): disables the OutputPass, runs composer.render(), sums
//      composer.readBuffer, then runs the OutputPass alone on the average;
//   2. the preview-ink sampler (previewink.js): after a normal frame runs the OutputPass on composer.writeBuffer;
//   3. compile-ahead / warm draws: render the scene into composer.readBuffer between frames.
// Every club pass that changes the picture in linear HDR sits BEFORE the OutputPass and uses the composer's own
// write-then-swap protocol, so after the last of them the composer's buffer roles are exactly what they are without the chain
// (1 and 2 read the graded HDR frame). Both ping-pong targets carry the depth texture, so 3 and an odd number of swaps per
// frame (1) are fine. The folded falloff pass stays in the list (disabled) with its strength uniform, which is what the
// preview-ink sampler's tone model and the app's look code read and write.
//
// The app's own lens. An export may use the app's accumulation-buffer depth of field (main.js renderAccum with opts.dof: the
// eye is jittered over an aperture disc per sub-frame). Two lenses on one frame would be wrong, and the app publishes nothing
// about the export's settings, so the club lens recognises the jitter itself (post/focus.js apertureJitter: the camera pose at
// render time against the pose at the frame hook, inside an accumulator sub-frame, which is a composer.render() with the
// OutputPass disabled) and stands down for exactly those sub-frames, from the first one, with no easing.
//
// Cost rule: a stage whose knob is off is not built and not in the pass list; a stage that is eased out this frame (a standing
// view, a moving camera in `still` mode) is skipped whole, not run at zero strength, and the frame then resolves no depth.
// Programs compile at their first draw, never at install: a tier that never draws a stage never compiles it.
import * as THREE from 'three';
import { Pass } from '../../vendor/jsm/postprocessing/Pass.js';
import { createDrawer, targetBytes } from './post/fsq.js';
import { createDepth } from './post/depth.js';
import { createDof, workScale, DOF_WORK_ROWS } from './post/dof.js';
import { createGrade } from './post/grade.js';
import { DOF_DEFAULTS, viewAperture, cocGain, farGain, apertureJitter, axisBedDepth, createMotion, createGate } from './post/focus.js';
import { GUARD_DEFAULTS, CLASSES, tableBox, growBox, guardZone, classify } from './post/guard.js';
import { CLUB_TUNE } from './post/tune.js';
import { GRADE_DEFAULTS } from './post/gradelut.js';
import { isArena, venueKnobsOf } from './tiers.js';

// the look's tuning of the two app passes and of the club stages: post/tune.js (pure, so the node arms read it)
export { CLUB_TUNE };

const BALL_R = 0.028575;
const MODES = ['off', 'still', 'live'];
const GUARDS = ['full', 'zone', 'mask', 'off'];
const stub = (reason) => ({ enabled: false, reason });

class ClubPass extends Pass {
  constructor(name, swap, fn) { super(); this.name = name; this.needsSwap = swap; this.clubRender = fn; this.isClubPass = true; }
  render(renderer, writeBuffer, readBuffer) { this.clubRender(this, renderer, writeBuffer, readBuffer); }
}

/**
 * `?clubpost=dof:off,grade:0,bloom:0,debug:coc` — a tool override of the tier knobs (pictures, A/B runs).
 *   dof:off|still|live   the lens mode          ao:still|live  the occlusion pass (off on every tier)   smaa:1  SMAA (off on every tier)
 *   fold:0   the grade as a pass of its own after the app's falloff pass (round 1's chain)
 *   guard:zone|mask|off   the proof's controls: `zone` = the sharp range alone (no guard in the shaders), `mask` = the guard
 *            alone (a plain lens focused where the camera looks), `off` = neither (that plain lens: what the rule prevents)
 *   debug:coc|depth|ao   dofscale:N (the working resolution's downscale)   dofwork:N (its largest number of rows; 360 = round 2)
 *   stillout:S   seconds the `still` lens takes to leave when anything moves (0 = the one-frame cut of round 2)
 *   fade:mix|pull   how an eased lens is drawn (the default is a dissolve in a display-like space): `mix` = a cross-fade in
 *            linear light (round 2), `pull` = a closing aperture (every disc shrinks to its point)
 * Numbers for A/B pictures ride the same list: ap (aperture, m), maxr (largest radius / frame height), farmax (far blur at
 * infinity / frame height; 0 = the plain lens law), boost, edge (slope of a disc's edge), gs / ge (grade strength /
 * exposure), gc / gsat (grade contrast / saturation), aoi / aor (occlusion intensity / radius), bs / bt / br (bloom strength /
 * threshold / radius), fs (falloff strength).
 */
function overrides(query) {
  const out = {};
  const raw = query?.get?.('clubpost');
  if (typeof raw !== 'string') return out;
  for (const part of raw.split(',')) { const [k, v] = part.split(':'); if (k) out[k.trim()] = (v ?? '1').trim(); }
  return out;
}

export async function createPost(club) {
  const ctx = club?.ctx ?? {};
  const { renderer, composer, camera } = ctx;
  if (!renderer?.isWebGLRenderer || !Array.isArray(composer?.passes) || !camera) return stub('no renderer, composer or camera');
  if (renderer.capabilities?.isWebGL2 === false) return stub('WebGL2 is required');
  if (renderer.capabilities?.reverseDepthBuffer === true) return stub('a reversed depth buffer is not supported');
  const cine = composer.__obCine ?? null;
  const output = cine?.output ?? composer.passes.find((p) => p?.uniforms?.toneMappingExposure) ?? null;
  const appBloom = cine?.bloom ?? null;
  const falloff = composer.passes.find((p) => p?.uniforms?.strength && p?.uniforms?.tDiffuse) ?? null;
  const renderPass = composer.passes[0];
  if (!output || !composer.passes.includes(output) || !renderPass?.scene) return stub('the composer is not the app chain (RenderPass ... OutputPass)');

  const knobs = club?.knobs ?? {};
  const ov = overrides(ctx.query);
  const mode = (v, d) => (MODES.includes(v) ? v : d);
  const flag = (v, d) => (v === undefined ? d : !(v === '0' || v === 'off' || v === 'false'));
  const cfg = {
    dof: mode(ov.dof, mode(knobs.dof, 'off')),
    // the occlusion pass and SMAA: off on every tier whatever the tier table says (see the header); tool switches only
    ao: mode(ov.ao, 'off'),
    aoScale: Number(knobs.aoScale) > 0 ? Math.min(1, Number(knobs.aoScale)) : 0.5,
    smaa: flag(ov.smaa, false),
    grade: flag(ov.grade, knobs.grade !== false),
    bloom: flag(ov.bloom, knobs.bloom === true),
    fold: flag(ov.fold, true),
    guard: GUARDS.includes(ov.guard) ? ov.guard : 'full',
    scale: Number(ov.dofscale) >= 2 ? Math.min(6, Math.round(Number(ov.dofscale))) : 0,
    // the working resolution's largest number of rows (post/dof.js workScale): the tier table's `dofWorkRows` knob (720
    // on every tier since round 3; 360 = round 2's fixed far field), the module's own when the table has none, or a tool's
    // how an eased lens (a gate between 0 and 1) is drawn. 'dissolve': the lens's picture is dissolved into the sharp frame
    // in a display-like space (post/dof.js), so a lamp's disc fades as evenly as the wall beside it. 'mix' (round 2): the
    // same in linear light, where a disc many times over the white point stays white at full size down to the last frame
    // and then jumps. 'pull': the aperture closes and every disc shrinks to its point; at the working resolution a disc under
    // about 1.5 texels of radius is a 3 x 3 block, so the shrinking discs pass through a square on the way (the dev page's strip)
    fade: ov.fade === 'mix' || ov.fade === 'pull' ? ov.fade : 'dissolve',
    workRows: Number(ov.dofwork) >= 90 ? Math.round(Number(ov.dofwork)) : (Number(knobs.dofWorkRows) >= 90 ? Math.round(Number(knobs.dofWorkRows)) : DOF_WORK_ROWS),
  };
  let debug = ['coc', 'depth', 'ao'].includes(ov.debug) ? ov.debug : null;
  const wantDepth = cfg.dof !== 'off' || cfg.ao !== 'off' || debug !== null;

  const drawer = createDrawer();
  const errors = [];
  let dead = false;
  const built = { depth: null, ao: null, dof: null, grade: null, smaa: null };
  const passes = { depth: null, ao: null, dof: null, grade: null };
  const frame = {
    draws: 0, active: [], shown: [], depthValid: false, dofAmount: 0, aoAmount: 0, viewAperture: 0, zone: null, box: null, cut: false,
    speed: 0, farPx: 0, capPx: 0, scale: 2, appLens: false, accum: false, folded: false,
  };
  // the camera pose at the last frame hook (before the app's accumulation lens moves the eye), and how often that lens was seen
  const hook = { pose: new Array(7).fill(0), prev: null, alt: [0, 0, -1], fresh: false };
  const seen = { appLensFrames: 0, accumFrames: 0, depthFrames: 0, frames: 0 };
  const poseNow = new Array(7).fill(0);

  // ---- frame state (the lens, its gates, the guard) ---------------------------------------------------------------------------
  const opt = { ...DOF_DEFAULTS };
  if (ov.stillout !== undefined && Number(ov.stillout) >= 0) opt.stillOut = Math.min(1, Number(ov.stillout));
  const motion = createMotion(opt);
  const dofGate = createGate(cfg.dof, { fade: true }, opt);
  const aoGate = createGate(cfg.ao, { fade: false }, opt);
  const dofState = { aperture: opt.aperture, maxRadius: opt.maxRadius, farMax: opt.farMax, detect: true, auto: true, target: null, manualFocus: 2.0, boost: 1.5, edge: 1.0 };
  let pendingDt = 0, clockNow = 0;
  let armWanted = wantDepth, linearWanted = false;
  const probe = { pending: false, raw: null };
  // values set before show() (the stages do not exist yet) are kept here and applied when they are built
  const pre = { gradeStrength: CLUB_TUNE.grade.strength, gradeExposure: CLUB_TUNE.grade.exposure, aoIntensity: CLUB_TUNE.ao.intensity, aoRadius: CLUB_TUNE.ao.radius };
  // Round A1 (CONTRACT.md 13.3): the venue's grade. Under the `arena` venue the grade takes the venue row's strength,
  // exposure and table parameters (tiers.js VENUES.arena.grade: neutral to slightly cool, a little flatter than the club
  // grade). Under the club venue `venueGrade` is null and nothing below takes another path: the values above and the table
  // of post/gradelut.js GRADE_DEFAULTS, as before. Tools: `?clubpost=vgrade:0` under arena = the club grade in the hall (the
  // off arm of a pair; it does nothing under the club venue).
  let venueGrade = null;
  try { venueGrade = isArena(club) && ov.vgrade !== '0' ? (venueKnobsOf(club)?.grade ?? null) : null; } catch { venueGrade = null; }
  // grade parameters a tool sets (`?clubpost=gc:..,gsat:..`, post.grade.setLut({...})) are laid over the venue's table, as they
  // are laid over GRADE_DEFAULTS under the club venue (post/grade.js setLut); a ready-made table texture passes through
  const venueLut = (v) => (venueGrade?.params && v && typeof v === 'object' && v.isData3DTexture !== true ? { ...venueGrade.params, ...v } : v);
  if (venueGrade) {
    if (Number.isFinite(venueGrade.strength) && venueGrade.strength >= 0) pre.gradeStrength = venueGrade.strength;
    if (Number.isFinite(venueGrade.exposure) && venueGrade.exposure > 0) pre.gradeExposure = venueGrade.exposure;
  }
  const vP = new THREE.Vector3(), vS = new THREE.Vector3(), vDir = new THREE.Vector3(), vT = new THREE.Vector3();
  const qC = new THREE.Quaternion();
  const pose = new Array(8).fill(0);
  const ballsFlat = [];

  function liveBalls() {
    const out = [];
    try {
      for (const b of ctx.game?.ballSet?.balls ?? []) {
        if (!b || b.pocketed || !b.mesh || b.mesh.visible === false) continue;
        out.push(b.mesh);
      }
    } catch { /* the game object changed shape: no ball subjects */ }
    return out;
  }

  // ---- the table volume (post/guard.js): read from the scene's table meshes by their material class, never from numbers here ----
  const table = { box: tableBox({}), reads: 0, tries: 0, sinceRead: 0 };
  const bbCloth = new THREE.Box3(), bbRail = new THREE.Box3(), bbMesh = new THREE.Box3();
  function readTable() {
    let cloth = null, rail = null;
    try {
      const root = ctx.table?.group?.isObject3D ? ctx.table.group : ctx.scene;
      bbCloth.makeEmpty(); bbRail.makeEmpty();
      root?.updateWorldMatrix?.(true, true);
      root?.traverseVisible?.((o) => {
        if (!o.isMesh || !o.geometry?.attributes?.position) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        const isCloth = ms.some((m) => m?.userData?.obClass === 'cloth');
        if (!isCloth && !ms.some((m) => m?.userData?.obClass === 'railwood')) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        bbMesh.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        if (!bbMesh.isEmpty()) (isCloth ? bbCloth : bbRail).union(bbMesh);
      });
      if (!bbCloth.isEmpty()) cloth = { min: bbCloth.min.toArray(), max: bbCloth.max.toArray() };
      if (!bbRail.isEmpty()) rail = { min: bbRail.min.toArray(), max: bbRail.max.toArray() };
    } catch { cloth = null; rail = null; /* the scene changed shape: the default table stands in */ }
    table.box = tableBox({ cloth, rail });
    table.reads += 1; table.sinceRead = 0;
  }

  /** Per frame, after the scene render (matrices are current): motion, gates, the guard, the sharp range, which stages run. */
  function prepare(rb) {
    const dt = pendingDt; pendingDt = 0;
    seen.frames += 1;
    const persp = camera.isPerspectiveCamera === true;
    camera.matrixWorld.decompose(vP, qC, vS);
    pose[0] = vP.x; pose[1] = vP.y; pose[2] = vP.z; pose[3] = qC.x; pose[4] = qC.y; pose[5] = qC.z; pose[6] = qC.w; pose[7] = camera.fov ?? 0;
    const balls = liveBalls();
    ballsFlat.length = 0;
    for (const m of balls) { const e = m.matrixWorld.elements; ballsFlat.push(e[12], e[13], e[14]); }
    // an accumulator sub-frame (the OutputPass is off) whose eye left the hook pose the way the app's aperture jitter moves
    // it: the app's lens is on this frame, the club lens is not. The motion tracker is fed the hook pose (the camera's real
    // path), so the gate neither sees the jitter as speed nor has anything to ease back from when the export ends.
    const accum = output.enabled === false;
    poseNow[0] = camera.position.x; poseNow[1] = camera.position.y; poseNow[2] = camera.position.z;
    poseNow[3] = camera.quaternion.x; poseNow[4] = camera.quaternion.y; poseNow[5] = camera.quaternion.z; poseNow[6] = camera.quaternion.w;
    const appLens = accum && hook.fresh && dofState.detect && apertureJitter(hook.pose, poseNow, hook.alt);
    hook.fresh = false;
    frame.accum = accum; frame.appLens = appLens;
    if (accum) seen.accumFrames += 1;
    if (appLens) {
      seen.appLensFrames += 1;
      // the hook pose as a world pose (the camera has no moving parent between the hook and the render)
      const dx = poseNow[0] - hook.pose[0], dy = poseNow[1] - hook.pose[1], dz = poseNow[2] - hook.pose[2];
      pose[0] -= dx; pose[1] -= dy; pose[2] -= dz;
      if (camera.parent === null || camera.parent?.isScene) { pose[3] = hook.pose[3]; pose[4] = hook.pose[4]; pose[5] = hook.pose[5]; pose[6] = hook.pose[6]; }
    }
    const mv = motion.step(pose, ballsFlat, dt);
    frame.cut = mv.cut; frame.speed = mv.speed;
    const step = { dt, speed: mv.speed, cut: mv.cut, ballsMoving: mv.ballsMoving };
    // inside an accumulate nothing eases over sub-frames a millisecond long: a camera faster than the fade band takes the
    // lens out at once (this is also the fallback when a rig moved the camera after the hook and the exact test missed)
    if (accum && dofState.detect && !mv.cut && mv.speed > opt.speedHigh) dofGate.snap(0);
    const dofAmount = dofGate.step(step);
    const aoAmount = aoGate.step(step);

    // the view's lens weight: low and flat = full lens; standing, wide or top-down = none
    vDir.set(0, 0, -1).applyQuaternion(qC);
    const pitchDown = Math.asin(Math.max(-1, Math.min(1, -vDir.y)));
    // below 5 % of the lens the blur is under a pixel everywhere: the stage is skipped, and the rest is re-spread over 0..1
    const vAp = persp ? Math.max(0, (viewAperture(vP.y, pitchDown, opt) - 0.05) / 0.95) : 0;
    frame.viewAperture = vAp;

    // the guard: the table volume grown to hold every live ball, and the sharp range that ends at its farthest visible point
    if (table.box.from === 'default' && table.tries < 20 && (table.sinceRead += 1) >= 30) { table.tries += 1; readTable(); }
    const box = growBox(table.box, ballsFlat, BALL_R);
    frame.box = box;
    const P = camera.projectionMatrix.elements;
    const tanY = 1 / P[5], tanX = 1 / P[0];
    const e = camera.matrixWorld.elements;
    const unit = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
    const cam = {
      pos: [vP.x, vP.y, vP.z], right: unit(e[0], e[1], e[2]), up: unit(e[4], e[5], e[6]), fwd: unit(-e[8], -e[9], -e[10]),
      tanX: tanX * (1 + Math.abs(P[8])), tanY: tanY * (1 + Math.abs(P[9])), near: camera.near,
    };
    const zoneGuard = cfg.guard === 'full' || cfg.guard === 'zone';
    const gz = persp ? guardZone(box, cam) : null;
    let zoneFar = null;
    if (zoneGuard) zoneFar = gz ? gz.far : null;
    else zoneFar = axisBedDepth(cam.pos, cam.fwd) ?? 1.5;   // the controls: a plain lens focused where the camera looks
    const depthOf = (v) => { vT.copy(v).applyMatrix4(camera.matrixWorldInverse); return -vT.z; };
    if (zoneFar !== null && dofState.target) zoneFar = Math.max(zoneFar, depthOf(dofState.target) + GUARD_DEFAULTS.zonePad);
    if (zoneFar !== null && !dofState.auto && !dofState.target) zoneFar = Math.max(zoneFar, dofState.manualFocus);
    frame.zone = zoneFar !== null ? { near: gz ? gz.near : camera.near, far: zoneFar, visible: gz ? gz.visible : false } : null;

    const depthOk = !!built.depth && built.depth.valid(rb);
    frame.depthValid = depthOk;
    if (depthOk) seen.depthFrames += 1;
    let lensOn = persp && depthOk && zoneFar !== null && cfg.dof !== 'off' && !appLens && dofAmount * vAp * dofState.aperture > 1e-3;
    if (built.dof && zoneFar !== null) {
      const scale = cfg.scale || workScale(rb.height, cfg.workRows);
      frame.scale = scale;
      const pull = cfg.fade === 'pull' ? dofAmount : 1;
      const gainPx = cocGain(dofState.aperture * vAp * pull, tanY, rb.height);      // full-resolution pixels per 1/metre
      // the room rule: the back wall's blur is bounded (the bound shrinks with the view's lens weight, so a rising camera
      // loses the lens evenly, close-up or not; `pull` is 1 unless a tool asked for the closing aperture)
      const gainFar = farGain(gainPx, zoneFar, dofState.farMax * rb.height * vAp * pull);
      frame.capPx = built.dof.setLens(1 / zoneFar, gainFar, Math.max(2, dofState.maxRadius * rb.height), scale);
      frame.farPx = Math.min(frame.capPx, gainFar / zoneFar);                // the blur of a point at infinity
      built.dof.setGuard(box, cfg.guard === 'full' || cfg.guard === 'mask' ? GUARD_DEFAULTS.soft : -1, camera.matrixWorld, P);
      built.dof.uniforms.gather.uBoost.value = dofState.boost;
      built.dof.uniforms.gather.uEdge.value = dofState.edge;
      // a lens whose largest blur is under the composite's blend threshold changes no pixel: it is not drawn
      if (frame.farPx < 0.3 * scale) lensOn = false;
    }
    frame.dofAmount = lensOn ? dofAmount : 0;
    frame.aoAmount = persp && depthOk && cfg.ao !== 'off' ? aoAmount : 0;
    const dbg = debug !== null && depthOk;
    // under 2 % a stage is not drawn at all (the eased value passes through it on the way in and out)
    if (passes.ao) passes.ao.enabled = frame.aoAmount > 0.02 || (dbg && debug === 'ao');
    if (passes.dof) passes.dof.enabled = frame.dofAmount > 0.02 || (dbg && debug !== 'ao') || (probe.pending && depthOk && zoneFar !== null);
    return { ao: passes.ao?.enabled === true, lens: passes.dof?.enabled === true };
  }

  function fail(where, e) {
    if (dead) return;
    dead = true;
    errors.push(`${where}: ${e?.message ?? e}`);
    console.warn(`[club] post: ${where} failed — the club post chain is off, the app chain stays:`, e);
    for (const p of Object.values(passes)) { if (p) { p.enabled = false; p.needsSwap = false; } }
    try { syncFold(); } catch { /* best effort */ }
    try { built.depth?.disarm(); } catch { /* best effort */ }
  }

  // ---- the app's falloff pass, folded into the grade's draw ---------------------------------------------------------------------
  // The pass stays in the list with its strength uniform (the app's look code writes it, the preview-ink sampler's tone model
  // reads it); only its `enabled` flag is taken, and given back whenever the grade would not draw (a tool set strength 0, a
  // debug view, a failure, dispose): the frame without the grade is then the app's frame, byte for byte.
  let installed = false;
  const fold = { on: false, was: true };
  function syncFold() {
    const want = installed && !dead && cfg.fold && !!falloff && !!built.grade && built.grade.active() && debug === null;
    if (want === fold.on) return;
    if (want) {
      if (falloff.enabled === false) return;   // the app has switched its pass off: nothing to fold
      fold.was = falloff.enabled; falloff.enabled = false; fold.on = true;
    } else { falloff.enabled = fold.was; fold.on = false; }
  }

  // ---- build ----------------------------------------------------------------------------------------------------------------
  // the only awaits come first, so the composer is never left half changed across a frame
  // the two stages that are off on every tier are not even fetched unless their tool switch asks for them
  let smaaMods = null, aoMod = null;
  if (cfg.ao !== 'off' || debug === 'ao') {
    try { aoMod = await import('./post/ao.js'); }
    catch (e) { errors.push(`ao: ${e?.message ?? e}`); console.warn('[club] post: the occlusion pass is unavailable:', e); }
  }
  if (cfg.smaa) {
    try { smaaMods = await Promise.all([import('../../vendor/jsm/postprocessing/SMAAPass.js'), import('./post/smaa.js')]); }
    catch (e) { errors.push(`smaa: ${e?.message ?? e}`); console.warn('[club] post: SMAA is unavailable:', e); }
  }
  // Everything that changes the app's composer happens in install(), called once by show(): the look's services come in
  // together in index.js's single show pass (CONTRACT.md 8.1), and until then the frame is the tournament frame.
  function install() {
    if (wantDepth) {
      built.depth = createDepth({ composer, drawer });
      // right after the scene pass: the frame's decisions, no draw of its own (the linear copy only for a consumer of it)
      passes.depth = new ClubPass('club.depth', false, (self, r, wb, rb) => {
        if (dead) return;
        try {
          const need = prepare(rb);
          if (frame.depthValid && (need.ao || linearWanted)) { built.depth.copy(r, rb, camera); frame.active.push('depth'); }
          // nothing reads the depth later in this frame: the following passes resolve colour only
          if (!need.lens) built.depth.disarm();
        } catch (e) { fail('depth', e); }
      });
      if (aoMod) {
        built.ao = aoMod.createAo({ drawer, scale: cfg.aoScale });
        built.ao.state.intensity = pre.aoIntensity; built.ao.state.radius = pre.aoRadius;
        passes.ao = new ClubPass('club.ao', false, (self, r, wb, rb) => {
          if (dead) return;
          try {
            built.ao.compute(r, built.depth.texture, rb.width, rb.height, camera.projectionMatrix.elements);
            if (debug === 'ao') built.ao.show(r, rb); else built.ao.apply(r, rb, frame.aoAmount);
            frame.active.push('ao');
          } catch (e) { fail('ao', e); }
        });
        passes.ao.enabled = false;
      }
      if (cfg.dof !== 'off' || debug === 'coc' || debug === 'depth') {
        built.dof = createDof({ drawer });
        passes.dof = new ClubPass('club.dof', true, (self, r, wb, rb) => {
          if (dead) { self.needsSwap = false; return; }
          try {
            const args = { color: rb.texture, depthTex: rb.depthTexture, fullW: rb.width, fullH: rb.height, near: camera.near, far: camera.far, scale: frame.scale };
            // the depth texture is read in this pass and not after it: from here on resolves blit colour only
            built.depth.disarm();
            const mix = cfg.fade === 'pull' ? 1 : frame.dofAmount;
            built.dof.uniforms.comp.uDissolve.value = cfg.fade === 'dissolve' ? 1 : 0;
            if (probe.pending) { probe.pending = false; probe.raw = built.dof.probe(r, args, mix); }
            const dbg = debug === 'coc' ? 1 : debug === 'depth' ? 2 : 0;
            if (debug === 'ao' || (!(frame.dofAmount > 0.02) && dbg === 0)) { self.needsSwap = false; return; }
            self.needsSwap = true;
            built.dof.render(r, { ...args, target: self.renderToScreen ? null : wb, amount: mix, debug: dbg });
            frame.active.push('dof');
          } catch (e) { self.needsSwap = false; fail('dof', e); }
        });
        passes.dof.enabled = false;
      }
    }
    // the grade pass is always in the list: it is the last club pass, so it also closes the frame's bookkeeping
    if (cfg.grade) {
      built.grade = venueGrade?.params ? createGrade({ drawer, params: { ...GRADE_DEFAULTS, ...venueGrade.params } }) : createGrade({ drawer });
      built.grade.state.strength = pre.gradeStrength; built.grade.state.exposure = pre.gradeExposure;
    }
    passes.grade = new ClubPass('club.grade', false, (self, r, wb, rb) => {
      self.needsSwap = false;
      if (dead) return;
      try {
        frame.folded = fold.on;
        if (built.grade && debug === null && (built.grade.active() || fold.on)) {
          built.grade.render(r, rb.texture, self.renderToScreen ? null : wb, fold.on ? falloff.uniforms.strength.value : null);
          self.needsSwap = true;
          frame.active.push('grade');
        }
        // a frame that comes without a frame hook (a tool's composer.render()) keeps the state the last hook asked for
        if (built.depth) { if (armWanted) built.depth.arm(); else built.depth.disarm(); }
      } catch (e) { self.needsSwap = false; fail('grade', e); }
      frame.shown = frame.active.slice(); frame.active.length = 0;
      frame.draws = drawer.take();
    });
    if (smaaMods) built.smaa = smaaMods[1].createSmaa({ output, SMAAPass: smaaMods[0].SMAAPass });
    // insert: depth (and the tool's occlusion pass) right after the RenderPass; the lens right after the app's bloom, so the
    // bloom it sees is the bloom of the sharp frame (equal with the lens on and off); the grade right before the OutputPass
    let at = 1;
    for (const key of ['depth', 'ao']) { if (passes[key]) { composer.insertPass(passes[key], at); at += 1; } }
    if (passes.dof) {
      const ib = appBloom ? composer.passes.indexOf(appBloom) : -1;
      composer.insertPass(passes.dof, ib >= 0 ? ib + 1 : at);
    }
    composer.insertPass(passes.grade, composer.passes.indexOf(output));
    installed = true;
    readTable();
    syncFold();
  }
  function uninstall() {
    installed = false;
    try { syncFold(); } catch { /* best effort */ }
    for (const p of Object.values(passes)) { if (p) composer.removePass(p); }
    for (const key of ['smaa', 'ao', 'dof', 'grade', 'depth']) { try { built[key]?.dispose(); } catch { /* best effort */ } built[key] = null; }
  }

  // ---- the app's bloom and falloff, retuned for a room with real emissive sources ------------------------------------------------
  // Written once (and on a studio-window close), never per frame: a later writer (a tool's renderQuality, window.__obBloom's
  // rig tracking, which lives inside the pass's own strength getter) keeps its say.
  const before = { bloom: null, falloff: null, taken: false };
  function takeBefore() {
    if (before.taken) return;
    before.taken = true;
    before.bloom = appBloom ? { strength: appBloom.strength, radius: appBloom.radius, threshold: appBloom.threshold } : null;
    before.falloff = falloff ? falloff.uniforms.strength.value : null;
  }
  const want = {
    bloom: { ...CLUB_TUNE.bloom, strength: cfg.bloom ? CLUB_TUNE.bloom.strength : 0 },
    falloff: CLUB_TUNE.falloff,
  };
  // Round A2 (CONTRACT.md section 14): the venue's bloom and falloff. A venue row may carry `bloom` ({ strength, radius,
  // threshold }: any of them) and `falloff` (the app pass's strength); a member it does not carry, and every member under
  // the club venue (whose row holds null for both), is the value above. Tools: `?clubpost=vbloom:0` under arena = the
  // club's bloom and falloff in the hall (the off arm of a pair; it does nothing under the club venue).
  let venueTune = null;
  try {
    const row = isArena(club) && ov.vbloom !== '0' ? venueKnobsOf(club) : null;
    if (row) {
      const b = row.bloom && typeof row.bloom === 'object' ? row.bloom : null;
      const num = (v, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? v : null);
      const t = { strength: num(b?.strength, 0, 3), radius: num(b?.radius, 0, 1), threshold: num(b?.threshold, 0, 100), falloff: num(row.falloff, 0, 1) };
      if (t.strength !== null || t.radius !== null || t.threshold !== null || t.falloff !== null) venueTune = t;
    }
  } catch { venueTune = null; }
  if (venueTune) {
    if (venueTune.radius !== null) want.bloom.radius = venueTune.radius;
    if (venueTune.threshold !== null) want.bloom.threshold = venueTune.threshold;
    if (venueTune.strength !== null && cfg.bloom) want.bloom.strength = venueTune.strength;
    if (venueTune.falloff !== null) want.falloff = venueTune.falloff;
  }
  let parked = false;
  function applyTune() {
    if (typeof window !== 'undefined' && window.__cinelight === true) { // a studio window owns the chain: park the write
      if (!parked) { parked = true; window.addEventListener('ob:cinelight', onStudioClose); }
      return false;
    }
    takeBefore();
    if (appBloom) { appBloom.strength = want.bloom.strength; appBloom.radius = want.bloom.radius; appBloom.threshold = want.bloom.threshold; }
    if (falloff && want.falloff !== null) falloff.uniforms.strength.value = want.falloff;
    return true;
  }
  function onStudioClose() {
    if (window.__cinelight === true) return;
    window.removeEventListener('ob:cinelight', onStudioClose); parked = false;
    applyTune();
  }

  // the numeric tool overrides, applied once after show()
  function applyNumbers() {
    const num = (k) => (ov[k] !== undefined && Number.isFinite(Number(ov[k])) ? Number(ov[k]) : null);
    const set = (k, fn) => { const v = num(k); if (v !== null) fn(v); };
    set('ap', (v) => { post.dof.aperture = v; }); set('maxr', (v) => { post.dof.maxRadius = v; }); set('boost', (v) => { post.dof.highlight = v; });
    set('farmax', (v) => { post.dof.farMax = v; }); set('edge', (v) => { post.dof.edge = v; });
    if (ov.applens === '0') post.dof.detectAppLens = false;
    set('gs', (v) => { post.grade.strength = v; }); set('ge', (v) => { post.grade.exposure = v; });
    if (num('gc') !== null || num('gsat') !== null) post.grade.setLut({ ...(num('gc') !== null ? { contrast: num('gc') } : {}), ...(num('gsat') !== null ? { saturation: num('gsat') } : {}) });
    set('aoi', (v) => { post.ao.intensity = v; }); set('aor', (v) => { post.ao.radius = v; });
    set('bs', (v) => { post.bloom.strength = v; }); set('bt', (v) => { post.bloom.threshold = v; }); set('br', (v) => { post.bloom.radius = v; });
    set('fs', (v) => { post.falloff.strength = v; });
  }

  // ---- the frame hook: the pose before the app's lens moves the eye, and whether this frame's scene pass resolves its depth ------
  // Depth is resolved only for a frame whose lens can run: a low view (the lens weight of the hook pose is above 0) in which
  // the gate is open or opening, or the first frame after a jump of the camera (a cut snaps the gate open in that same frame).
  // Every other frame resolves colour only, as the app's chain does.
  const takeHookPose = () => {
    const p = camera.position, q = camera.quaternion;
    if (!p || !q) return;
    hook.pose[0] = p.x; hook.pose[1] = p.y; hook.pose[2] = p.z; hook.pose[3] = q.x; hook.pose[4] = q.y; hook.pose[5] = q.z; hook.pose[6] = q.w;
    // the view axis of camera.matrixWorld as it stands now (it may still be last frame's: see apertureJitter)
    const e = camera.matrixWorld?.elements;
    if (e) { const l = Math.hypot(e[8], e[9], e[10]) || 1; hook.alt[0] = -e[8] / l; hook.alt[1] = -e[9] / l; hook.alt[2] = -e[10] / l; }
    hook.fresh = true;
    if (!built.depth) return;
    let want = debug !== null || cfg.ao !== 'off' || linearWanted || probe.pending;
    if (!want && cfg.dof !== 'off' && dofState.aperture > 0 && camera.isPerspectiveCamera === true) {
      // the view axis of the hook pose, and its lens weight
      const ay = -2 * (q.y * q.z - q.w * q.x);
      const pitchDown = Math.asin(Math.max(-1, Math.min(1, -ay)));
      const weight = (viewAperture(p.y, pitchDown, opt) - 0.05) / 0.95;
      if (weight > 0) {
        let jump = hook.prev === null;
        if (!jump) {
          const move = Math.hypot(p.x - hook.prev[0], p.y - hook.prev[1], p.z - hook.prev[2]);
          const dot = Math.abs(q.x * hook.prev[3] + q.y * hook.prev[4] + q.z * hook.prev[5] + q.w * hook.prev[6]);
          jump = move > opt.cutMove || 2 * Math.acos(Math.min(1, dot)) > opt.cutTurn;
        }
        want = jump || dofGate.amount > 0 || dofGate.target > 0;
      }
    }
    hook.prev = hook.pose.slice();
    armWanted = want;
    if (want) built.depth.arm(); else built.depth.disarm();
  };
  const offFrame = club?.onFrame?.((clock, dt) => { clockNow = clock; pendingDt += Math.max(0, Number(dt) || 0); takeHookPose(); });

  // the club programs three has compiled so far (a program compiles at its first draw)
  const compiled = () => {
    try { return (renderer.info?.programs ?? []).map((p) => p?.name).filter((n) => typeof n === 'string' && n.startsWith('club.post')); } catch { return []; }
  };

  // ---- the service (CONTRACT.md 4.4) ------------------------------------------------------------------------------------------
  const post = {
    enabled: true,
    reason: null,
    shown: false,
    config: cfg,
    /**
     * Put the chain into the app's composer and retune the app's bloom and falloff (index.js calls this once, in its show
     * pass; a dev page calls it itself). A failure removes everything again and leaves the app chain: enabled becomes false.
     */
    show() {
      if (post.shown || dead) return post.enabled;
      try { install(); applyTune(); post.shown = true; applyNumbers(); syncFold(); } catch (e) {
        try { uninstall(); } catch { /* best effort */ }
        dead = true; post.enabled = false; post.reason = String(e?.message ?? e);
        errors.push(`show: ${post.reason}`);
        console.warn('[club] post: the chain could not be installed — the app chain stays:', e);
      }
      return post.enabled;
    },
    /**
     * A table, fixture, brightness or look change: the app may have rewritten its bloom and falloff, so the club values go
     * back in, and the table volume is read again from the scene.
     */
    rebuild() { if (post.shown && !dead) { applyTune(); table.tries = 0; readTable(); } },
    /** Scene depth of the current frame as LINEAR view distance in metres (R32F). Reading it switches the copy on (one draw a frame). */
    get depthTexture() { if (built.depth) linearWanted = true; return built.depth?.texture ?? null; },
    dof: {
      get enabled() { return cfg.dof !== 'off' && !dead; },
      mode: cfg.dof,
      /** The far end of the sharp range, metres of view depth (there is no near end). A value set here only ever extends it. */
      get focus() { return frame.zone?.far ?? dofState.manualFocus; },
      set focus(v) { if (Number(v) > 0) dofState.manualFocus = Number(v); },
      get aperture() { return dofState.aperture; },
      set aperture(v) { if (Number(v) >= 0) dofState.aperture = Number(v); },
      get maxRadius() { return dofState.maxRadius; },
      set maxRadius(v) { if (Number(v) > 0) dofState.maxRadius = Math.min(0.05, Number(v)); },
      /** Far-field blur at infinity as a fraction of the frame height (the room rule, post/focus.js farGain); 0 = the plain lens law. */
      get farMax() { return dofState.farMax; },
      set farMax(v) { if (Number(v) >= 0) dofState.farMax = Math.min(0.05, Number(v)); },
      /** Tools only (A/B): false = do not look for the app's lens (the old behaviour: both lenses overlap, the gate eases out). */
      get detectAppLens() { return dofState.detect; },
      set detectAppLens(v) { dofState.detect = !!v; },
      /** True on a frame where the app's own accumulation lens was recognised (the club lens stood down); and how many so far. */
      get appLens() { return frame.appLens; },
      get appLensFrames() { return seen.appLensFrames; },
      get highlight() { return dofState.boost; },
      set highlight(v) { if (Number(v) >= 0) dofState.boost = Number(v); },
      get edge() { return dofState.edge; },
      set edge(v) { if (Number(v) > 0) dofState.edge = Number(v); },
      /** With `auto` false and no target, `focus` extends the sharp range. The table volume is always inside it. */
      get auto() { return dofState.auto; },
      set auto(v) { dofState.auto = !!v; },
      /** Keep this world point sharp too (the sharp range is extended to it; it can never shrink below the table). null clears it. */
      setFocusTarget(v) { dofState.target = v && Number.isFinite(v.x) ? new THREE.Vector3(v.x, v.y, v.z) : null; },
      /** Seconds the `still` mode's lens takes to leave once anything moves (post/focus.js); 0 = in one frame. Tools may set it (A/B). */
      get stillOut() { return opt.stillOut; },
      set stillOut(v) { if (Number(v) >= 0) opt.stillOut = Math.min(1, Number(v)); },
      /** Take the settled state now (a tool that jumps the camera and takes one still). */
      snap() { dofGate.snap(1); aoGate.snap(1); motion.reset(); hook.prev = null; },
      get amount() { return frame.dofAmount; },
      get viewAperture() { return frame.viewAperture; },
      get zone() { return frame.zone ? { ...frame.zone } : null; },
      /** Tools only (the proof's controls): 'full' | 'zone' | 'mask' | 'off', as `clubpost=guard:` (see overrides()). */
      set guardMode(v) { if (GUARDS.includes(v)) cfg.guard = v; },
      /** The table volume in force (world metres) and what it was read from. */
      get guard() { const b = frame.box ?? table.box; return { mode: cfg.guard, min: b.min.slice(), max: b.max.slice(), from: b.from, reads: table.reads }; },
      /**
       * Tools only: the readability proof in numbers. Renders the current frame once more and reads the lens's own values
       * back (never call this per frame): for every pixel the blur radius, whether it was written back unchanged, and the
       * guard's weight; each pixel is put into a class by its WORLD position rebuilt here from the depth, independently of
       * the shaders (post/guard.js classify). Returns per class the pixel count, the largest blur radius (pixels) and the
       * largest blend factor (0 = every pixel of the class is the lens-off pixel); `mask: true` adds the class of every
       * pixel in canvas row order.
       */
      probe({ mask = false } = {}) {
        if (dead || !built.dof || !built.depth || !post.shown) return { ok: false, reason: 'the lens is not built on this tier' };
        probe.pending = true; probe.raw = null;
        built.depth.arm();
        try { composer.render(); } finally { probe.pending = false; }
        const raw = probe.raw; probe.raw = null;
        if (!raw) return { ok: false, reason: frame.zone === null ? 'the table is behind the camera: the lens is off' : 'the lens pass did not run (no depth this frame)' };
        const { w, h, data } = raw;
        const P = camera.projectionMatrix.elements, m = camera.matrixWorld.elements;
        const sx = 2 / P[0], sy = 2 / P[5], ox = (P[8] - 1) / P[0], oy = (P[9] - 1) / P[5];
        const geo = { box: frame.box ?? table.box, balls: ballsFlat.slice(), R: BALL_R };
        const stats = CLASSES.map(() => ({ px: 0, maxCoc: 0, maxBlend: 0, minGuard: 1 }));
        const out = { blurredPx: 0, sumCoc: 0 };
        const cls = mask ? new Uint8Array(w * h) : null;
        const wp = [0, 0, 0];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const d = data[i + 3];
            const vx = (((x + 0.5) / w) * sx + ox) * d, vy = (((y + 0.5) / h) * sy + oy) * d, vz = -d;
            wp[0] = m[0] * vx + m[4] * vy + m[8] * vz + m[12]; wp[1] = m[1] * vx + m[5] * vy + m[9] * vz + m[13]; wp[2] = m[2] * vx + m[6] * vy + m[10] * vz + m[14];
            const c = classify(wp, geo);
            const s = stats[c];
            s.px += 1;
            if (data[i] > s.maxCoc) s.maxCoc = data[i];
            if (data[i + 1] > s.maxBlend) s.maxBlend = data[i + 1];
            if (data[i + 2] < s.minGuard) s.minGuard = data[i + 2];
            if (c === 0) { if (data[i + 1] > 0) out.blurredPx += 1; out.sumCoc += data[i]; }
            if (cls) cls[(h - 1 - y) * w + x] = c;
          }
        }
        const r3 = (v) => +v.toFixed(4);
        const classes = {};
        let tpx = 0, tCoc = 0, tBlend = 0;
        CLASSES.forEach((name, k) => {
          const s = stats[k];
          classes[name] = { px: s.px, maxCoc: r3(s.maxCoc), maxBlend: r3(s.maxBlend), minGuard: s.px ? r3(s.minGuard) : null };
          if (k !== 0) { tpx += s.px; tCoc = Math.max(tCoc, s.maxCoc); tBlend = Math.max(tBlend, s.maxBlend); }
        });
        classes.outside.blurredPx = out.blurredPx;
        classes.outside.meanCoc = stats[0].px ? r3(out.sumCoc / stats[0].px) : 0;
        const b = geo.box;
        return {
          ok: true, size: [w, h], guard: cfg.guard,
          lens: { amount: r3(frame.dofAmount), viewAperture: r3(frame.viewAperture), zoneFar: frame.zone ? r3(frame.zone.far) : null,
            tableInFrame: frame.zone?.visible ?? false, farPx: r3(frame.farPx), capPx: r3(frame.capPx), scale: frame.scale, drawn: frame.dofAmount > 0.02 },
          box: { min: b.min.map(r3), max: b.max.map(r3), from: b.from },
          table: { px: tpx, maxCoc: r3(tCoc), maxBlend: r3(tBlend) },
          classes,
          ...(cls ? { mask: cls } : {}),
        };
      },
    },
    ao: {
      get enabled() { return cfg.ao !== 'off' && !dead; },
      mode: cfg.ao,
      get intensity() { return built.ao?.state.intensity ?? pre.aoIntensity; },
      set intensity(v) { if (Number(v) >= 0) { pre.aoIntensity = Number(v); if (built.ao) built.ao.state.intensity = pre.aoIntensity; } },
      get radius() { return built.ao?.state.radius ?? pre.aoRadius; },
      set radius(v) { if (Number(v) > 0) { pre.aoRadius = Number(v); if (built.ao) built.ao.state.radius = pre.aoRadius; } },
      get amount() { return frame.aoAmount; },
    },
    bloom: {
      get strength() { return appBloom?.strength ?? 0; },
      set strength(v) { want.bloom.strength = Number(v) || 0; applyTune(); },
      get radius() { return appBloom?.radius ?? 0; },
      set radius(v) { want.bloom.radius = Number(v) || 0; applyTune(); },
      get threshold() { return appBloom?.threshold ?? 0; },
      set threshold(v) { want.bloom.threshold = Number(v) || 0; applyTune(); },
    },
    falloff: {
      get strength() { return falloff?.uniforms.strength.value ?? 0; },
      set strength(v) { want.falloff = Number(v) || 0; applyTune(); },
      /** True while the app's falloff pass is switched off and its arithmetic runs inside the grade's draw. Tools may set it (A/B). */
      get folded() { return fold.on; },
      set folded(v) { cfg.fold = !!v; syncFold(); },
    },
    grade: {
      get enabled() { return cfg.grade && !dead; },
      get lut() { return built.grade?.lut ?? null; },
      set lut(v) { built.grade?.setLut(venueLut(v)); },
      setLut(v) { built.grade?.setLut(venueLut(v)); },
      get strength() { return built.grade?.state.strength ?? (cfg.grade ? pre.gradeStrength : 0); },
      set strength(v) { pre.gradeStrength = Math.max(0, Number(v) || 0); if (built.grade) built.grade.state.strength = pre.gradeStrength; syncFold(); },
      get exposure() { return built.grade?.state.exposure ?? pre.gradeExposure; },
      set exposure(v) { if (Number(v) > 0) { pre.gradeExposure = Number(v); if (built.grade) built.grade.state.exposure = pre.gradeExposure; syncFold(); } },
      get balance() { return built.grade?.state.balance ?? null; },
      get dither() { return built.grade?.state.dither ?? 0; },
      set dither(v) { if (built.grade) built.grade.state.dither = Math.max(0, Number(v) || 0); },
    },
    smaa: {
      get enabled() { return !!built.smaa && built.smaa.state.on && !built.smaa.state.failed; },
      set enabled(v) { if (built.smaa) built.smaa.state.on = !!v; },
      get frames() { return built.smaa?.state.frames ?? 0; },
    },
    /** The buffer that holds the finished linear HDR frame (after the last composer.render()): what the accumulator and the ink sampler read. */
    get hdrTap() { return output.enabled === false ? composer.readBuffer : composer.writeBuffer; },
    get debug() { return debug; },
    set debug(v) { debug = ['coc', 'depth', 'ao'].includes(v) ? v : null; if (debug !== null && built.depth) { armWanted = true; built.depth.arm(); } syncFold(); },
    /** The chain follows the composer (its targets are fitted to the composer's buffers at render time); kept for the contract. */
    setSize() { /* nothing to do: every club target is fitted to the composer's current buffer size when it is drawn */ },
    /** Advance the eased state by dt seconds (the frame hook does this in the app; a dev page calls render(dt)). */
    update(clock, dt) { clockNow = clock; pendingDt += Math.max(0, Number(dt) || 0); takeHookPose(); },
    render(dt = 0) { post.update(clockNow + dt, dt); composer.render(); },
    counts() {
      const targets = [];
      const add = (list) => { for (const t of list ?? []) targets.push({ name: t.userData?.clubName ?? t.texture?.name ?? 'target', w: t.width, h: t.height, bytes: targetBytes(t) }); };
      if (built.depth?.linearUsed) add([built.depth.linear]);
      add(built.ao?.targets()); add(built.dof?.targets()); add(built.smaa?.targets());
      const sceneDepth = built.depth?.bytes() ?? 0;
      const lut = built.grade?.bytes() ?? 0;
      const programs = compiled();
      return {
        config: { ...cfg, debug, stillOut: opt.stillOut }, tier: club?.tier ?? null, knobsNotUsed: { ao: knobs.ao ?? null, smaa: knobs.smaa ?? null },
        // round A1: the venue's grade when the venue is not the club room (absent under club): what the table was built from
        ...(venueGrade ? { venueGrade: { strength: pre.gradeStrength, exposure: pre.gradeExposure, params: built.grade ? { ...built.grade.state.params } : null } } : {}),
        ...(venueTune ? { venueTune: { ...venueTune } } : {}), // round A2: the venue's bloom and falloff (absent under the club venue)
        shown: post.shown, installed,
        passes: { inList: Object.values(passes).filter(Boolean).length, list: composer.passes.map((p) => `${p.name ?? p.constructor?.name ?? 'pass'}${p.enabled === false ? ' (off)' : ''}`) },
        frame: { active: frame.shown.slice(), draws: frame.draws, dof: +frame.dofAmount.toFixed(3), ao: +frame.aoAmount.toFixed(3),
          viewAperture: +frame.viewAperture.toFixed(3), zone: frame.zone ? [+frame.zone.near.toFixed(3), +frame.zone.far.toFixed(3)] : null,
          tableInFrame: frame.zone?.visible ?? false, farPx: +frame.farPx.toFixed(2), capPx: +frame.capPx.toFixed(2), scale: frame.scale,
          appLens: frame.appLens, accum: frame.accum, depthValid: frame.depthValid, depthArmedNext: built.depth?.armed ?? false,
          folded: frame.folded, smaa: post.smaa.enabled },
        guard: { mode: cfg.guard, from: (frame.box ?? table.box).from, min: (frame.box ?? table.box).min.map((v) => +v.toFixed(3)), max: (frame.box ?? table.box).max.map((v) => +v.toFixed(3)), reads: table.reads },
        seen: { ...seen },
        programs: { compiled: programs, n: programs.length },
        targets,
        bytes: { targets: targets.reduce((n, t) => n + t.bytes, 0), sceneDepthTextures: sceneDepth, lut,
          total: targets.reduce((n, t) => n + t.bytes, 0) + sceneDepth + lut },
        errors: errors.slice(),
      };
    },
    dispose() {
      offFrame?.();
      if (parked) window.removeEventListener('ob:cinelight', onStudioClose);
      if (post.shown) {
        if (appBloom && before.bloom) { appBloom.strength = before.bloom.strength; appBloom.radius = before.bloom.radius; appBloom.threshold = before.bloom.threshold; }
        if (falloff && before.falloff !== null) falloff.uniforms.strength.value = before.falloff;
      }
      uninstall();
      dead = true;
      post.enabled = false; post.reason = 'disposed';
    },
  };
  return post;
}
