// Copyright (c) Meta Platforms, Inc. and affiliates.

// cinelight.js — the studio-lighting variant for the cinematic export tier
// (issue #259): the EXACT brand-photography rig the hero loop / table-wide
// stills shipped with (the imagery provenance ledger "Shared harness"
// tools/render/break-scrub.mjs RIG_JS), tuned ON TOP of look 'tournament' —
// background wall props hidden, world crush 0.55, lamp/hemi/fill dim 7.6/0.05/0.4,
// exposure 0.80, rack-zone + cue-ball-key warm rims. The destructive
// ledger ops (cueStickOff / envOff / hideBallAt) are deliberately
// EXCLUDED.
//
// LEAF module (the ownership ledger rule-5 corollary): imports 'three' ONLY (the
// vendored import-map name — zero app-module edges). offline-render.js
// reaches it through a GUARDED dynamic import per the renderDrill
// precedent: a stale cached graph degrades to an honest thrown error,
// never a half-lit export.
//
// Revert contract (the #243-class plate-drift wall): install() SNAPSHOTS
// every value it will touch BEFORE touching it — material color clones,
// light intensity+color, far-group visibility, toneMappingExposure, the
// scene.environment ref AND every material holding the shared env texture
// by ref — and revert() restores those EXACT snapshot values (never an
// inverse-multiply, which is float-lossy). renderTimeline runs revert() in
// its finally on EVERY exit path (success / AbortError / encoder-stall
// watchdog).
//
// RECORDED DEVIATION from the #259 design's ordered ops ("__rebakeEnv after
// install AND revert"): __rebakeEnv() mutates the ONE shared boot-time
// cube bake in place, and that bake is IRREPRODUCIBLE — it ran with
// scene.environment still null (main.js bakes first, assigns after) and
// the boot cue pose, so any re-bake feeds the current env back into itself
// and lands on different texels. A rebake-based revert therefore breaks
// the mandated exact revert proof (same-boot standard-hash A/A around a
// cinelight export). Instead the studio world is baked into a PRIVATE cube
// render target (mirroring the boot bake's camera/params via the __dbg
// cubeCam handle) and swapped in — scene.environment plus every material
// that holds the shared texture by ref (ball materials do; game.js wires
// envMap: cubeRT.texture) — and revert restores the UNTOUCHED originals
// and disposes the private target. Same visual intent (reflections track
// the studio light), exactly restorable world.
import * as THREE from 'three';

// review env-r13 P1 (boot cache contract): the announce protocol is
// VERSIONED at module load — v2 = the boolean __cinelight direct-gate
// window + __cinelightEnv probe-swap flag on the ob:cinelight event.
// offline-render refuses to install a leaf that does not declare v2
// (honest stale throw BEFORE any scene mutation), so a cached earlier
// leaf can never pair half-announced with a fresh table.js. Cached
// INTERMEDIATE consumers degrade to their own recorded semantics
// (r7/r8: boolean gate only; r9-r11: legacy-boolean = full studio).
if (typeof window !== 'undefined') window.__cinelightCap = 2;

const BALL_RADIUS = 0.028575; // FALLBACK ball marker only (the ledger
// darkenWorld exclusion used geometry radius); the REAL exclusion set is
// the live `ballMeshes` handle — review round-1 P2: snooker/carom equipment
// builds spheres at other radii, and those balls must neither darken nor
// contaminate the env bake

/**
 * Install the studio-lighting rig over the live scene. `cubeCam` = the
 * boot CubeCamera (window.__dbg.cubeCam — pose/near/far mirror for the
 * private bake; null degrades to no env swap, reflections keep the
 * gameplay bake). `ballMeshes` = the live game's ball meshes (albedo +
 * bake exclusion set; empty degrades to the WPA-radius marker). Returns
 * `{ revert() }`; revert is idempotent. Throws BEFORE mutating anything
 * if the expected lighting rig cannot be found (no partial install to
 * unwind), and FAILURE-ATOMIC past that point: any install throw (a GL
 * call on a lost context, the private cube bake) rolls the scene back to
 * the snapshot before rethrowing — a throwing install returns no handle,
 * so nobody downstream could revert it (merge review round P2).
 */
export function installCineLight({ scene, renderer, camera, cubeCam = null,
  ballMeshes = [] }) {
  // locate the rig with the break-scrub.mjs RIG_JS semantics (hemi = last
  // in traverse order, FIRST point light as the fill) — EXCEPT the lamps:
  // the recipe's single `rect` was tuned on the one-lamp canopy rig, and
  // the lighting fixtures (issue #89) run three/four active RectAreaLights
  // (pendant bar / perimeter ring). Dimming only the last one left the
  // others at full power — badly overexposed studio exports (review round-1
  // P2) — so EVERY RectAreaLight is snapshotted and the SET is normalized
  // to the tuned total below.
  const rects = [];
  let hemi = null, fill = null;
  scene.traverse((o) => {
    if (o.isRectAreaLight) rects.push(o);
    else if (o.isHemisphereLight) hemi = o;
    else if (o.isPointLight) fill ??= o;
  });
  if (!rects.length || !hemi || !fill) {
    throw new Error('cinelight: lighting rig not found '
      + `(rects ${rects.length}, hemi ${!!hemi}, fill ${!!fill})`);
  }
  const ballSet = new Set(ballMeshes);
  const isBallMesh = (o) => (ballSet.size ? ballSet.has(o)
    : o.geometry?.parameters?.radius === BALL_RADIUS);

  // ---- snapshot (before ANY mutation) ---------------------------------------
  const envTex = scene.environment;
  const snap = {
    exposure: renderer.toneMappingExposure,
    environment: envTex,
    // GH-440: the env-probe validity extent paired with the CURRENT shared
    // bake (window seam, feature-detected — a stale table.js returns null
    // and both hooks below no-op)
    envExtent: window.__envExtent?.get?.() ?? null,
    lights: [...rects, hemi, fill].map((l) => ({
      l, intensity: l.intensity, color: l.color.clone() })),
    farGroups: [],   // [{ g, visible }]
    materials: [],   // [{ m, color }] exact pre-values (color.clone())
    envMats: [],     // materials holding the shared env texture BY REF
    balls: [],       // ball meshes hidden during the private bake
  };
  const seen = new Set();
  scene.traverse((o) => {
    // background props: located BY NAME (room.js's frozen legacy carrier
    // `obFarPropTable`, today holding the wall props). The legacy position
    // probe (4.25, 2.0 — the removed far prop table's wall-clipping spot)
    // is kept ONLY for the cache-poison contract: a stale cached room.js
    // still carries that unnamed group at the old coordinates, and this
    // module must degrade to hiding it rather than exporting with the prop
    // table lit.
    if (o.isGroup && (o.name === 'obFarPropTable'
      || (Math.abs(o.position.x - 4.25) < 0.01
        && Math.abs(o.position.z - 2.0) < 0.01))) {
      snap.farGroups.push({ g: o, visible: o.visible });
    }
    if (!o.isMesh || !o.material) return;
    const isBall = isBallMesh(o);
    if (isBall) snap.balls.push(o);
    // GH-489 W12 (review r1 P2): rib panels carry a material ARRAY
    // (burgundy face + gold frame edges) — the scalar path skipped them,
    // so cinematic darkening left the flutes at day brightness. Every
    // array member routes through the same snapshot/dedupe law.
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (envTex && mat.envMap === envTex && !snap.envMats.includes(mat)) {
        snap.envMats.push(mat);
      }
      if (mat.color && !isBall && !seen.has(mat)) {
        seen.add(mat);
        snap.materials.push({ m: mat, color: mat.color.clone() });
      }
    }
  });

  // ---- revert (exact snapshot restore; idempotent) ---------------------------
  // Declared BEFORE the install ops so the install can roll itself back:
  // the GL calls below (fill.clone(), the private cube bake) can throw on a
  // lost/failing context AFTER the world is already darkened, and a throwing
  // install returns NO handle — renderTimeline's finally would have nothing
  // to revert and the live table would stay studio-lit until reload (merge
  // review round P2). Every value revert touches is already snapshotted, so
  // running it mid-install restores exactly the untouched world.
  const rims = [];
  let privRT = null;
  let reverted = false;
  const revert = () => {
    if (reverted) return;
    reverted = true;
    // GH-489 env round (review env-r7 P2): drop the studio-rig announce
    // FIRST so seam listeners (table.js's strip-occlusion gate) re-read a
    // world that is about to be the restored gameplay rig. Window seam +
    // event, feature-detected — zero import edges (leaf contract); a
    // stale table.js simply never listens (pre-round behavior).
    if (typeof window !== 'undefined') {
      window.__cinelight = false;
      window.__cinelightEnv = false;
      try { window.dispatchEvent(new Event('ob:cinelight')); } catch { /* headless */ }
    }
    for (const { m, color } of snap.materials) m.color.copy(color);
    for (const { l, intensity, color } of snap.lights) {
      l.intensity = intensity;
      l.color.copy(color);
    }
    for (const { g, visible } of snap.farGroups) g.visible = visible;
    renderer.toneMappingExposure = snap.exposure;
    // the ORIGINAL bake was never touched — restoring the refs restores
    // the exact pre-export reflections, no re-bake needed or wanted
    scene.environment = snap.environment;
    // GH-440: the restored probe pairs with the snapshotted validity extent
    if (snap.envExtent) window.__envExtent?.set?.(...snap.envExtent);
    for (const m of snap.envMats) {
      m.envMap = envTex;
      m.needsUpdate = true;
    }
    for (const L of rims) {
      L.removeFromParent();
      L.dispose?.();
    }
    privRT?.dispose();
  };

  try {
    // ---- install (the ledger's ordered ops) ------------------------------------
    // hideFar()
    for (const { g } of snap.farGroups) g.visible = false;
    // darkenWorld(0.55) — over the snapshotted material set (dedupe done)
    for (const { m } of snap.materials) m.color.multiplyScalar(0.55);
    // dim(7.6, 0.05, 0.4) — the lamp term normalizes the EFFECTIVELY LIT
    // emitter set to the tuned 7.6 TOTAL, preserving the fixture's own
    // balance (a one-lamp canopy rig lands at exactly the recipe's 7.6; an
    // all-dark rig degrades to the recipe value on the last lit lamp).
    // lightingvisuals keeps the canopy RectAreaLight in the scene with
    // visible=false and its intensity intact when another fixture is active
    // (review r2 P2: counting it starved the live fixture's share) — the
    // invisible lamps stay in the SNAPSHOT (restore-safe) but out of the
    // normalization.
    const litRects = rects.filter((l) => l.visible);
    const lampTotal = litRects.reduce((s, l) => s + l.intensity, 0);
    if (lampTotal > 0) {
      for (const l of litRects) l.intensity = l.intensity / lampTotal * 7.6;
    } else if (litRects.length) {
      litRects[litRects.length - 1].intensity = 7.6;
    }
    hemi.intensity = 0.05;
    fill.intensity = 0.4;
    // expose(0.80)
    renderer.toneMappingExposure = 0.80;
    // rims — positioned in the camera frame AT INSTALL, then static
    const rim = (tx, ty, tz, side, lift, back, intensity, hex) => {
      const cam = camera.position;
      const d = { x: tx - cam.x, y: ty - cam.y, z: tz - cam.z };
      const n = Math.hypot(d.x, d.y, d.z);
      d.x /= n; d.y /= n; d.z /= n;
      const r = { x: -d.z, z: d.x };
      const rn = Math.hypot(r.x, r.z);
      const L = fill.clone();
      L.color.setHex(hex);
      L.intensity = intensity;
      L.distance = 0;
      L.decay = 2;
      L.position.set(tx + (r.x / rn) * side + d.x * back, ty + lift,
        tz + (r.z / rn) * side + d.z * back);
      scene.add(L);
      rims.push(L);
    };
    // THREE.js light hex constants, not DOM/CSS color literals — this leaf is
    // deliberately NOT in ci.yml's design-token chrome list (recorded in the
    // OWNERSHIP ledger; the grep gate covers UI chrome, not scene lighting)
    rim(0.635, 0.03, 0, 0.4, 0.35, 0.5, 4.0, 0xffc98a);   // rack zone
    rim(-0.635, 0.03, 0, -0.28, 0.22, -0.5, 1.2, 0xffd9a8); // cue-ball key

    // GH-489 env round (review env-r7 P2, moved by env-r8 P2, split by
    // env-r9 P2-2): announce the studio window BEFORE the private cube
    // bake below — the bake photographs the live world, and table.js's
    // snooker strip-occlusion transport must already be at identity or
    // the baked reflections (used by EVERY export frame) carry rim lights
    // strip-shadowed. TWO booleans, never a shape (review env-r12 P2-2:
    // an object made a cached earlier table.js read `=== true` as OFF —
    // additive seams must stay cache-safe both ways): `__cinelight` gates
    // the strip-specific DIRECT term (off whenever the rims carry the
    // key); `__cinelightEnv` gates the probe-tied env compensation and
    // only flips once the private studio probe actually replaces the
    // under-gained gameplay probe (env-r9: with cubeCam null the gameplay
    // probe stays, its under-representation persists, and the
    // compensation must ride).
    // The dispatch is synchronous, so the uniforms land before
    // cam6.update() renders. Failure-atomic via the existing catch →
    // revert() path, whose FIRST act clears this flag and re-announces.
    // Same event/seam shape as the ob:relight announce; a stale table.js
    // never listens (pre-round behavior).
    if (typeof window !== 'undefined') {
      window.__cinelight = true;       // BOOLEAN (review env-r12 P2-2)
      window.__cinelightEnv = false;   // probe not yet swapped
      try { window.dispatchEvent(new Event('ob:cinelight')); } catch { /* headless */ }
    }

    // env: bake the studio-lit world into the PRIVATE target and swap it in
    // (see the recorded deviation in the header). Balls hidden for the bake
    // (the main.js rebakeEnv law); the bake samples the ORIGINAL env — no
    // self-feedback, so two installs from the same world bake identically.
    if (cubeCam) {
      privRT = new THREE.WebGLCubeRenderTarget(cubeCam.renderTarget?.width
        ?? 512, { type: THREE.HalfFloatType });
      const cam6 = new THREE.CubeCamera(cubeCam.near ?? 0.02,
        cubeCam.far ?? 40, privRT);
      cam6.position.copy(cubeCam.position);
      const shown = snap.balls.filter((b) => b.visible);
      shown.forEach((b) => { b.visible = false; });
      // GH-404/GH-407 (the scene/lampfade.js suspendForBake law, verbatim
      // from main.js rebakeEnv): every cube bake photographs the AUTHORED
      // luminaire — the occluder-fade is a camera fact, not a venue fact.
      // This install runs at renderTimeline's segment-0 boundary BEFORE the
      // first frame's staging snap consumes, so without the bracket the
      // bake captured the LIVE viewport's residual fade (measured on
      // GH-407: fade 0 entering render A vs 1 entering render B baked a
      // lamp-less vs lamp-lit env — 301 of 302 lit frames differed across
      // two ambient camera poses; the e2e-export #259 cam-independence
      // red). Window seam, feature-detected: zero import edges, a stale
      // lampfade.js degrades to the pre-404 bake.
      const restoreFade = window.__lampfade?.suspendForBake?.();
      // >>> cinelight bake visuals (lifted verbatim by web/tools/test-cinelight-bake.mjs: keep it self-contained —
      // it may reach only its root argument)
      // GH-1103: the gameplay visuals stay out of the studio cube like the balls — every cue rod (buildCue names
      // every build obCueStick: aim's live rod, cuepost's and cuestrike's) and every aim overlay (obAim*: the
      // preview and the call / snap / zone / rest assists), the rule main.js hideGameplayVisualsForBake applies to
      // every gameplay bake. An export entered from AIM installs before any PLAYBACK frame hid them (renderTimeline:
      // setManual, then game.replay, no frame before this install), so the live rod and the preview were baked into
      // the cube EVERY export frame reflects. It runs inside the lamp-fade (and an open shell's) bracket, which may
      // show them for the bake; the returned undo makes exactly the nodes hidden here visible again.
      const hideGameplayVisuals = (root) => {
        const hidden = [];
        root.traverse((o) => {
          const nm = o.name || ''; // a nameless node must never throw inside the bake
          if (o.visible && (nm === 'obCueStick' || nm.startsWith('obAim'))) hidden.push(o);
        });
        hidden.forEach((o) => { o.visible = false; });
        return () => { hidden.forEach((o) => { o.visible = true; }); };
      };
      // <<< cinelight bake visuals
      const restoreDyn = hideGameplayVisuals(scene);
      try {
        cam6.update(renderer, scene);
      } finally {
        // the hidden-for-the-bake window is install-internal state (revert()
        // restores nothing about ball visibility) — a throwing bake must not
        // leave the table's balls invisible; same for the fade bracket and the
        // gameplay visuals (undone first: the brackets nest)
        restoreDyn();
        restoreFade?.();
        shown.forEach((b) => { b.visible = true; });
      }
      scene.environment = privRT.texture;
      // GH-440: the private probe records the CURRENT table — the validity
      // extent must pair with it (revert restores the snapshot pairing)
      window.__envExtent?.sync?.();
      for (const m of snap.envMats) {
        m.envMap = privRT.texture;
        m.needsUpdate = true; // same-type cube swap: uniform refresh only
      }
      // review env-r9 P2-2: only NOW is the under-gained gameplay probe
      // actually replaced — the probe-tied env compensation may drop to
      // identity (the private studio probe photographed the lit world
      // faithfully, gate already off during the bake). cubeCam-null
      // installs never reach here: the gameplay probe stays and the
      // compensation keeps riding it.
      if (typeof window !== 'undefined') {
        window.__cinelightEnv = true; // the private studio probe is live
        try { window.dispatchEvent(new Event('ob:cinelight')); } catch { /* headless */ }
      }
    }
  } catch (e) {
    revert(); // failure-atomic: no partial install ever escapes this module
    throw e;
  }

  return { revert };
}
