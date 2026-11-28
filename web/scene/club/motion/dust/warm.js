// Copyright (c) Meta Platforms, Inc. and affiliates.

// motion/dust/warm.js - the dust's shader program is linked BEFORE any strike (CONTRACT.md section 12). Owner: dust.
//
// Why: three links a material's program the first time the material is drawn. For the dust that was the frame of the
// first strike: a shader compile on the one frame where the player watches the cue ball leave. This file asks three to
// link the program while the look is built (`renderer.compileAsync` / `renderer.compile`), with the mesh hidden:
// nothing is drawn, no draw call is made, no picture can show it.
//
// What has to match for the linked program to be the one the first strike uses (three keys a program by the material AND
// by the state it is drawn in; a mismatch means a second link at the strike):
//   - the lights the camera sees, by kind and count (they are in every program's key, also of a material that reads no
//     light): the compile is given the app's scene, so three counts the same lights as in a frame;
//   - where the scene is drawn to: into a render target (the app's composer: no tone map, linear output) or straight to
//     the screen (a dev page: the renderer's tone map and output colour space). The compile runs with a throw-away
//     1 x 1 target bound in the first case and with no target in the second; what was bound before is put back;
//   - the scene's fog.
// The same things are folded into one number, the "light set signature", from the lights the part already lists. The
// part asks `check()` on every call it gets (one small loop): when the signature is not the one last linked for (the
// look hid or showed a lamp between the build and the first frame, a table or fixture change), the program is linked
// again, there and then, which is still before the strike. A program linked for a state that never comes stays in
// three's cache unused until the material is disposed.
//
// No imports and no three: the renderer, the camera, the scene, the hidden mesh and a target factory are handed in, so
// the node arm drives this file with stand-ins. Nothing here is part of the picture: the same frame is drawn whether the
// program was linked early or at its first use.

const text = (e) => String(e?.message ?? e);

/** True when the object and all its ancestors are visible (what three's traverseVisible sees). */
function shown(o) { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; }

/**
 * The part of a program's key that this file can read ahead, as one number: the visible lights the camera sees by kind
 * (and whether they cast a shadow), the scene's fog, and where the scene is drawn to. Pure; no allocation.
 */
export function lightSetSignature(lights, camera, scene, renderer, toTarget) {
  let d = 0, p = 0, s = 0, r = 0, h = 0, lp = 0, sh = 0, sm = 0;
  const layers = camera?.layers ?? null;
  if (Array.isArray(lights)) {
    for (const l of lights) {
      if (!l || !shown(l)) continue;
      if (layers && l.layers && typeof l.layers.test === 'function' && !l.layers.test(layers)) continue;
      if (l.isDirectionalLight) d += 1; else if (l.isSpotLight) { s += 1; if (l.map) sm += 1; } else if (l.isPointLight) p += 1;
      else if (l.isRectAreaLight) r += 1; else if (l.isHemisphereLight) h += 1; else if (l.isLightProbe) lp += 1; else continue;
      if (l.castShadow === true) sh += 1;
    }
  }
  const fog = scene?.fog ? (scene.fog.isFogExp2 ? 2 : 1) : 0;
  // drawn to the screen: the renderer's tone map and output colour space are in the key; into a target they are not
  let out = 1;
  if (!toTarget) { const tm = Number(renderer?.toneMapping) || 0; const cs = String(renderer?.outputColorSpace ?? ''); let c = 0; for (let i = 0; i < cs.length; i++) c = (c * 31 + cs.charCodeAt(i)) % 997; out = 2 + tm * 1000 + c; }
  const shadows = renderer?.shadowMap?.enabled === true ? 1 + (Number(renderer.shadowMap.type) || 0) : 0;
  let k = 17;
  for (const v of [d, p, s, r, h, lp, sh, sm, fog, shadows, out]) k = (k * 131 + v) % 2147483647;
  return k;
}

/**
 * The warm-up of one hidden object's material. `renderer` is a three WebGLRenderer (or null: the warm-up then stands
 * down and says so), `object` the hidden mesh, `scene` the app's scene (its lights are counted), `toTarget` whether the
 * app draws the scene into a render target, `makeTarget()` gives a throw-away 1 x 1 render target with `dispose()`.
 * Returns `{ check(lights, reason) -> boolean (a link was asked for), state() }`. Never throws; after three failures it
 * stops trying (the program is then linked at its first draw, as before).
 */
export function createWarm({ renderer = null, camera = null, scene = null, object = null, name = '', toTarget = true, makeTarget = null, note = () => {} } = {}) {
  const usable = !!renderer && (typeof renderer.compile === 'function' || typeof renderer.compileAsync === 'function') && !!camera && !!scene && !!object;
  const stats = {
    usable, reason: usable ? null : 'no renderer, camera, scene or object to compile with', toTarget: toTarget === true,
    checks: 0, links: 0, ready: 0, failures: 0, lastReason: null, lastSignature: null, programsBefore: null, programsAfter: null, mine: null, error: null,
  };
  let linkedFor = null;
  const programs = () => { try { const list = renderer?.info?.programs; return Array.isArray(list) ? list : null; } catch { return null; } };
  const mine = () => { const list = programs(); if (!list || !name) return null; let n = 0; for (const p of list) if (p && p.name === name) n += 1; return n; };

  // the work three leaves for a program's first use (the link status and the uniform and attribute tables): done as soon
  // as the driver has the program ready, so the strike does not pay for it either
  function finish() {
    try {
      const list = programs();
      if (list && name) for (const p of list) { if (p && p.name === name) { p.getUniforms?.(); p.getAttributes?.(); } }
      stats.ready += 1; stats.mine = mine();
    } catch (e) { stats.error = `first use: ${text(e)}`; }
  }

  function link(reason) {
    let target = null, bound = false, prev = null, face = 0, mip = 0;
    try {
      prev = typeof renderer.getRenderTarget === 'function' ? renderer.getRenderTarget() : null;
      face = typeof renderer.getActiveCubeFace === 'function' ? renderer.getActiveCubeFace() : 0;
      mip = typeof renderer.getActiveMipmapLevel === 'function' ? renderer.getActiveMipmapLevel() : 0;
      if (toTarget) {
        if (typeof makeTarget !== 'function') throw new Error('no target factory');
        target = makeTarget();
        renderer.setRenderTarget(target); bound = true;
      } else if (prev !== null) { renderer.setRenderTarget(null); bound = true; }
      const list = programs();
      stats.programsBefore = list ? list.length : null;
      // the object is hidden: three compiles the materials of hidden objects too, and draws nothing here
      let pending = null;
      if (typeof renderer.compileAsync === 'function') pending = renderer.compileAsync(object, camera, scene);
      else renderer.compile(object, camera, scene);
      stats.links += 1; stats.lastReason = String(reason);
      stats.programsAfter = list ? list.length : null; stats.mine = mine();
      if (pending && typeof pending.then === 'function') pending.then(finish, (e) => { stats.error = `compile: ${text(e)}`; });
      else finish();
      return true;
    } catch (e) {
      stats.failures += 1; stats.error = text(e);
      try { note(`warm-up failed (${text(e)}): the program is linked at its first draw`); } catch { /* a note never throws */ }
      return false;
    } finally {
      try { if (bound) renderer.setRenderTarget(prev, face, mip); } catch (e) { stats.error = `restore: ${text(e)}`; }
      try { target?.dispose?.(); } catch { /* a throw-away target */ }
    }
  }

  return {
    /** Link the program if it was not linked for the light set the camera sees now. Cheap when nothing changed. */
    check(lights, reason = 'frame') {
      if (!usable || stats.failures >= 3) return false;
      try {
        stats.checks += 1;
        if (object.visible === true) return false; // already drawn: three has its program
        const sig = lightSetSignature(lights, camera, scene, renderer, toTarget === true);
        if (sig === linkedFor) return false;
        const ok = link(reason);
        // a failed link is tried again on the next change only after the count above allows it; a done one is remembered
        if (ok) { linkedFor = sig; stats.lastSignature = sig; }
        return ok;
      } catch (e) { stats.failures += 1; stats.error = text(e); return false; }
    },
    state() { return { ...stats, mine: mine() ?? stats.mine }; },
  };
}
