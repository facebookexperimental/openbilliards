// Copyright (c) Meta Platforms, Inc. and affiliates.

// lampfade.js — GH-381 Option A (owner decision 2026-08-05): the venue
// luminaire OCCLUDER-FADE. The lamp assembly stays at its UMB-compliant
// y = 1.02 hang (Ch. II Art. 15: light source >= 1 m over the bed) and
// instead camera-fades out when the eye rises above the lamp plane — from
// up there every view of the table looks THROUGH the fixture's occlusion
// shadow (the #381 defect: a 2.19 m hood amputating the far end of the
// carom table), while from a venue-height eye the lamp is part of the shot.
// Camera-only by construction: this module writes MATERIAL properties
// (transparent/opacity/depthWrite/material.visible) and never touches a
// light, a bake, the env cubemap, or Object3D.visible — illumination is
// analytic RectAreaLight + baked GI + the boot-baked env cubemap, none of
// which read mesh visibility, so cloth pixels are bit-identical faded vs
// not (the e2e-lighting invariance arm renders the proof).
//
// TRIGGER — eye height over the ACTIVE fixture's emitter plane
// (window.__lighting state().clearanceY; canopy default = room.js
// LIGHT_POS.y = 1.02), mapped over a fixed band:
//     eyeY <= plane+FADE_BAND_LO  → 1 (authored)
//     eyeY >= plane+FADE_BAND_HI  → 0 (gone)
//     between                     → linear ramp
// Chosen over the eye→bed sightline-cone × assembly-AABB test on orbit UX
// grounds: the orbit camera always looks at the table, so "eye above the
// lamp plane" already IS the occlusion predicate — and it is MONOTONE in
// the orbit's polar angle, so a vertical gesture crosses it at most once.
// A cone×AABB test is non-monotone in azimuth (the ±0.75 m suspension rods
// swing in and out of the cone edge), which would strobe the fade during a
// horizontal orbit at grazing heights — exactly the flicker this design
// must exclude. The continuous ramp fills the hysteresis slot MEMORYLESS:
// steady-state opacity is a pure function of the pose (no latched
// above/below state to flap at the threshold or go stale across fixture
// swaps and scripted pose writes — the camerascript stateless-canopy
// lesson, review P2 r5), so orbiting across the plane produces a smooth
// partial fade, never a binary flip.
// FADE_BAND_LO 0.02: the top-preset clearance law (camerapresets.js
// topR = clearY − 0.035, φ = 0.15, target y 0.05) parks the eye ≤ ~5.3 mm
// ABOVE the emitter plane by design — that sanctioned under-lamp pose must
// stay bit-authored (e2e-aim's top-cam luminance floors pin its pixels).
// FADE_BAND_HI 0.12: the canopy hood's top face sits at plane+0.105 — by
// the time the eye clears the housing, the housing is gone.
//
// TRANSITION — `fade` chases the band target through a rate limiter
// (FADE_S full swing ≈ 200 ms, inside the 150–250 ms spec) and is eased
// with smoothstep at the write, so preset jumps / scripted __test.camera
// teleports dissolve instead of popping, while a slow drag through the
// band tracks the hand directly. dt comes from the frame bus (main.js live
// RAF and the manual renderAt/renderAccum paths), never the wall clock —
// offline framestep renders stay deterministic. The FIRST update snaps to
// the pose target (a boot above the plane must not play a dissolve over
// the first frames).
//
// STAGING BOUNDARIES (GH-404): the rate limiter's residue is LIVE-VIEWPORT
// state and must never cross a random-access staging boundary — the
// build-17 e2e-playback 3t byte-parity regression measured exactly that
// leak: a DVR seek(T) rate-limited from whatever value earlier live frames
// left (each re-seek a different byte image of the same T), and a
// renderDrill run inherited the live residue so a clip's first frames
// depended on what the user did before pressing Export. snapNext() arms a
// ONE-SHOT: the next SCRIPTED update() (renderAt/renderAccum pass
// scripted=true; the live RAF loop never does) derives `fade` memorylessly
// from that frame's FINAL staged pose (the boot-snap law, re-run at the
// boundary) instead of stepping from residue; ANY update retires the flag,
// so an abort path that armed a snap and never rendered its frame —
// cancelled export, throwing dispatch, renderer hiccup mid-seek — unwinds
// into the live loop, whose next frame clears the leaked flag WITHOUT
// snapping (review r1+r2 P3: a live-view jump is impossible by
// construction). Consumers: playback.js renderAtT on every non-play
// staging (open / seek / scrub / capture entry) and offline-render.js
// renderTimeline at FRAME ZERO's render dispatch — WITHIN a render or a
// DVR play run frames keep the rate-limited ramp above, so a camera
// crossing the band mid-clip still dissolves identically live and
// exported (WYSIWYG), while seek(T) and a plan's frames become pure
// functions of the staged state.
//
// WRITE DISCIPLINE (the one-writer law): this module is the ONLY writer of
// material.{transparent,opacity,depthWrite,visible} on the fixture meshes;
// Object3D.visible stays owned by lightingvisuals.js (fixture swap) +
// camerascript.js (overhead hide), and material.color by look.js /
// lightingvisuals.js — disjoint properties, no last-writer races.
//   fade == 1   authored state restored from the per-material stash and
//               the stash dropped — steady state below the plane is
//               write-free and byte-authored (opaque pass, zero cost).
//   0 < f < 1   transparent=true, opacity eased. Emissive faces (the ~10×
//               HDR lamp-face law, room.js) get inverse-Reinhard-
//               compensated alpha: linear alpha on an HDR-L source stays
//               tonemap-clipped at white until α < ~1/L, which would leave
//               a full-bright panel floating over a mostly-faded housing —
//               α = k/(L−(L−1)k) dims it perceptually IN STEP with the
//               housing (L re-read from material.color each write; look
//               regrades and brightness own that color live). depthWrite
//               keeps its authored value: the shells are convex and
//               separated, and three sorts the transparent pass back-to-
//               front, so inter-object occlusion stays correct mid-fade
//               (the glow read through the translucent hood from above is
//               the physically right image for a translucent housing).
//   fade == 0   material.visible=false — zero draw calls / fill cost (the
//               hood can cover a third of a DPR3 phone frame).
//
// MESH SET — the canopy assembly (lampFace/hood/rods via room.js
// activeRoom.lightRefs; harmless no-ops while a non-canopy fixture keeps
// them Object3D-hidden) plus the active non-canopy assembly via the
// feature-detected __lighting.fixtureMeshes() seam (the per-fixture plane
// already rides clearanceY, so ring/pendant/luminaire get the same cure).
// A stale lightingvisuals.js without the getter degrades to canopy-only
// fading; a stale room.js to a no-op — cache-poison contract
// (the ownership ledger rule 5), namespace import + optional chaining throughout.
//
// LEAF module: reached ONLY via a guarded dynamic import from main.js
// (the camerascript seam shape). Publishes the ONE debug/test seam
// window.__lampfade { value, plane, force, snapNext, suspendForBake } (the
// __rebakeEnv/__dbg precedent — not a feature API). main.js's rebakeEnv
// brackets its cube bake with suspendForBake() so ball-crown reflections
// always hold the AUTHORED lamp regardless of where the camera stands;
// playback.js / offline-render.js bracket staging boundaries with
// snapNext() (GH-404 — every consumer feature-detects: a stale module
// without the seam keeps the pre-404 behavior, never a dead path).
import * as roomMod from './room.js';

export const FADE_BAND_LO = 0.02; // m over the emitter plane: fade begins
export const FADE_BAND_HI = 0.12; // m over the plane: fully faded
export const FADE_S = 0.2;        // full-swing transition time [s]

const smooth = (u) => u * u * (3 - 2 * u);

export function createLampFade({ camera } = {}) {
  let fade = null;   // effective fade; null until the first update snaps
  let forced = null; // test/render override (window.__lampfade.force)
  let snapPending = false; // one-shot staging-boundary snap (GH-404)

  /** The ACTIVE fixture's emitter plane (fallback: canopy LIGHT_POS). */
  function plane() {
    const y = window.__lighting?.state?.()?.clearanceY;
    return Number.isFinite(y) ? y : (roomMod.LIGHT_POS?.y ?? 1.02);
  }

  function eachMesh(fn) {
    const lr = roomMod.activeRoom?.instance?.lightRefs;
    if (lr) {
      if (lr.lampFace) fn(lr.lampFace);
      if (lr.hood) fn(lr.hood);
      for (const rod of lr.rods ?? []) fn(rod);
    }
    const fx = window.__lighting?.fixtureMeshes?.();
    if (fx) for (const m of fx) fn(m);
  }

  /** Flip material.transparent WITH the recompile flag: this three build
   * bakes `transparent` into the program cache key, so a bare flip keeps
   * rendering through the OLD program — the fade VALUE ramps while the
   * pixels pop (measured: opacity 0.5 without needsUpdate rendered
   * byte-identical to opaque; with it, the blend appears). One compile per
   * material per DIRECTION, then both program variants sit in the cache —
   * later crossings are plain program switches. Opacity alone is a live
   * uniform and needs no flag. */
  function setTransparent(mat, on) {
    if (mat.transparent === on) return;
    mat.transparent = on;
    mat.needsUpdate = true;
  }

  function applyTo(mesh, f) {
    const mat = mesh.material;
    if (!mat) return;
    if (f >= 1) {
      const base = mat.userData.obLampFadeBase;
      if (!base) return; // never faded — steady state stays write-free
      setTransparent(mat, base.transparent);
      mat.opacity = base.opacity;
      mat.depthWrite = base.depthWrite;
      mat.visible = base.visible;
      delete mat.userData.obLampFadeBase;
      return;
    }
    // stash the AUTHORED state on first touch (fixture-swap rebuilds start
    // authored, so a fresh assembly adopts the current fade on this frame —
    // no flash of a new lamp while the eye is above the plane)
    const base = mat.userData.obLampFadeBase ??= {
      transparent: mat.transparent, opacity: mat.opacity,
      depthWrite: mat.depthWrite, visible: mat.visible,
    };
    if (f <= 0) { mat.visible = false; return; }
    mat.visible = base.visible;
    setTransparent(mat, true);
    mat.depthWrite = base.depthWrite;
    const k = smooth(f);
    // inverse-Reinhard HDR compensation (header): L ≤ 1 degrades to α = k
    const c = mat.color;
    const L = Math.max(c?.r ?? 1, c?.g ?? 1, c?.b ?? 1, 1);
    mat.opacity = base.opacity * (k / (L - (L - 1) * k));
  }

  const apply = (f) => eachMesh((m) => applyTo(m, f));

  /** Advance toward the pose target and write the materials. `dt` is the
   * frame bus delta [s]; `scripted` marks the manual renderAt/renderAccum
   * paths (main.js passes true there, never from the live RAF loop). */
  function update(dt, scripted = false) {
    // the one-shot is honored ONLY on a scripted frame and retired by the
    // first update of ANY kind (review GH-404 r2 P3): every abort path that
    // arms a snap and then never renders its frame — a cancelled export, a
    // throwing dispatch, a renderer hiccup mid-seek — unwinds into the
    // live RAF loop, whose next frame CLEARS the leaked flag without
    // snapping. A live-view jump is impossible by construction, no unwind
    // bookkeeping anywhere. Stale-pairing degrades (cache-poison
    // contract): stale lampfade.js ignores the extra arg (pre-404
    // behavior); stale main.js never passes it, so the one-shot is inert
    // and staging keeps the pre-404 ramp — never a dead path.
    const snap = scripted && snapPending;
    snapPending = false;
    if (forced !== null) { fade = forced; apply(fade); return; }
    const eyeY = camera?.position?.y;
    if (!Number.isFinite(eyeY)) return;
    const p = plane();
    const u = (eyeY - (p + FADE_BAND_LO)) / (FADE_BAND_HI - FADE_BAND_LO);
    const target = 1 - Math.min(1, Math.max(0, u));
    if (fade === null || snap) {
      // boot snap / staging-boundary snap (GH-404 header law): the fade is
      // a pure function of this frame's staged pose — no residue crosses a
      // random-access boundary and no dissolve plays over it
      fade = target;
    } else {
      const step = (Number.isFinite(dt) && dt > 0 ? dt : 1 / 60) / FADE_S;
      fade += Math.min(step, Math.max(-step, target - fade));
    }
    apply(fade);
  }

  window.__lampfade = {
    /** Effective fade [0..1] (1 = authored/opaque). */
    value: () => fade ?? 1,
    plane,
    /** GH-404 staging-boundary law (header): arm a ONE-SHOT — the next
     * SCRIPTED update() snaps `fade` to that frame's final staged pose
     * target instead of rate-limiting from live residue. Retired by any
     * update (a live frame clears it without snapping); forced wins. */
    snapNext: () => { snapPending = true; },
    /** Pin the fade (deterministic gates / render tooling); force(null)
     * hands control back to the pose (rate-limited from the pinned value). */
    force: (v) => {
      forced = (v === null || v === undefined)
        ? null : Math.min(1, Math.max(0, +v));
      if (forced !== null) { fade = forced; apply(fade); }
    },
    /** Env-bake bracket (main.js rebakeEnv): restore the authored assembly
     * for the cube bake, return the undo. null = already authored.
     * GH-972: "authored" includes the canopy meshes a scripted overhead move
     * hid by Object3D.visible (app/camerascript.js setCanopyHidden) — under
     * the canopy fixture they are part of the lit venue, and a bake without
     * them photographs a lamp-less room that outlives the script. (Under any
     * other fixture the lighting layer keeps them hidden: not touched.) */
    suspendForBake: () => {
      const f = fade;
      const shown = [];
      const lr = roomMod.activeRoom?.instance?.lightRefs;
      if (lr && (window.__lighting?.state?.()?.fixture ?? 'canopy_panel') === 'canopy_panel') {
        for (const m of [lr.lampFace, lr.hood, ...(lr.rods ?? [])]) {
          if (m && m.visible === false) { m.visible = true; shown.push(m); }
        }
      }
      const faded = !(f === null || f >= 1);
      if (faded) apply(1);
      if (!faded && !shown.length) return null;
      return () => {
        if (faded) apply(f);
        for (const m of shown) m.visible = false;
      };
    },
  };
  return { update };
}
