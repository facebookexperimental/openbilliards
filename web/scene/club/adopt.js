// Copyright (c) Meta Platforms, Inc. and affiliates.

// adopt.js — run-time adoption of the app's existing materials by the club look (CONTRACT.md section 4.3).
//
// The table, ball and cue materials are created and shader-patched by modules this look must not edit (table.js, balls.js,
// cuestick.js through shading.js injectAnalytic). The club look extends them from the outside: it WRAPS a material's
// onBeforeCompile (the previous hook runs first, then the club splice) and its customProgramCacheKey (previous key + a club
// suffix). The same pattern already exists in the app (the venue fill hook in lightingvisuals.js, the pocket leather in
// table.js). Because the wrap is installed only from this module, a boot without the club look compiles the exact programs it
// compiled before.
//
// A splice is all-or-nothing per material: if any anchor of a patch is missing from the shader text, nothing of that patch is
// applied, the miss is recorded and logged once, and the material keeps its previous program text (under the club key).
import * as THREE from 'three';
import { applyPatchText } from './patchtext.js';

export { applyPatchText };

// Set while patch() asks a material which club wraps its own hooks carry: every club key wrap in the chain adds its key.
let asked = null;

export function createAdopt(club) {
  const classifiers = new Map(); // cls -> [(object3d, material) => boolean]
  const patches = []; // { material: WeakRef, name, key }
  const missed = []; // { material, key, anchor }
  let anchorsHit = 0, compiled = 0;

  const byObClass = (cls) => (_o, m) => m?.userData?.obClass === cls;
  for (const cls of ['cloth', 'railwood', 'apron']) classifiers.set(cls, [byObClass(cls)]);
  classifiers.set('cue', [(o) => { for (let p = o; p; p = p.parent) if (p.name === 'obCueStick') return true; return false; }]);

  /** Add a classifier for a surface class (additive; the owner of a surface registers how its materials are recognised). */
  function classify(cls, fn) {
    if (typeof fn !== 'function') return;
    if (!classifiers.has(cls)) classifiers.set(cls, []);
    classifiers.get(cls).push(fn);
  }

  /** Every distinct live material of a surface class, found through the scene graph (and the ball set for 'ball'). */
  function find(cls) {
    const out = new Set();
    if (cls === 'ball') {
      for (const b of club.ctx?.game?.ballSet?.balls ?? []) if (b?.mesh?.material) out.add(b.mesh.material);
      return [...out];
    }
    const tests = classifiers.get(cls) ?? [];
    if (!tests.length) return [];
    club.ctx?.scene?.traverse?.((o) => {
      if (!o.isMesh || !o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (tests.some((t) => { try { return t(o, m) === true; } catch { return false; } })) out.add(m);
      }
    });
    return [...out];
  }

  /**
   * Wrap one material. spec = { key, uniforms?, pars?, vertexPars?, apply: [{ anchor, mode: 'before'|'after'|'replace', code,
   * stage?: 'vertex'|'fragment' }], defines? }. `key` names the patch AND every variant of its text (a tier or option that changes
   * the code must change the key). Returns true when the wrap was installed, false when the material already carries this key.
   */
  function patch(material, spec) {
    if (!material || !spec || typeof spec.key !== 'string' || !spec.key) return false;
    // "Already carries" is read from the material's own hooks, never from userData: the app shares one userData object between
    // two cloth materials (table.js midWallMatFor) and three's Material.clone() copies userData but not the hooks, so
    // userData.clubKeys can name a wrap the material does not have. The key chain is the one three compiles by; a wrap the app
    // copied onto a clone or wrapped again later still answers (an app key that throws ends the walk where it threw).
    asked = new Set();
    try { material.customProgramCacheKey(); } catch { /* the wraps above the throw have answered */ }
    const carried = asked.has(spec.key);
    asked = null;
    if (carried) return false;
    const keys = (material.userData.clubKeys ??= []); // still written for its readers (mat/wood.js, room.js, arena/room.js)
    if (!keys.includes(spec.key)) keys.push(spec.key);
    const prevCompile = material.onBeforeCompile;
    const prevKey = material.customProgramCacheKey;
    const name = material.name || material.userData?.obClass || material.type;
    material.onBeforeCompile = function clubCompile(shader, renderer) {
      if (typeof prevCompile === 'function') prevCompile.call(this, shader, renderer);
      compiled += 1;
      const r = applyPatchText(shader.vertexShader, shader.fragmentShader, spec);
      if (!r.ok) {
        for (const anchor of r.missed) {
          if (!missed.some((x) => x.material === name && x.key === spec.key && x.anchor === anchor)) {
            missed.push({ material: name, key: spec.key, anchor });
            console.error(`[club] adopt: anchor not found — patch '${spec.key}' skipped on material '${name}': ${anchor}`);
          }
        }
        return;
      }
      anchorsHit += (spec.apply?.length ?? 0) + (spec.pars ? 1 : 0) + (spec.vertexPars ? 1 : 0);
      if (spec.uniforms) Object.assign(shader.uniforms, spec.uniforms);
      shader.vertexShader = r.vs;
      shader.fragmentShader = r.fs;
    };
    material.customProgramCacheKey = function clubKey() {
      asked?.add(spec.key);
      return (typeof prevKey === 'function' ? String(prevKey.call(this)) : '') + '|club:' + spec.key;
    };
    if (spec.defines) { material.defines = { ...(material.defines ?? {}), ...spec.defines }; }
    material.needsUpdate = true;
    try { patches.push({ material: new WeakRef(material), name, key: spec.key }); } catch { patches.push({ material: null, name, key: spec.key }); }
    return true;
  }

  /** patch() over every material of a class; returns how many wraps were installed. */
  function patchClass(cls, spec) {
    let n = 0;
    for (const m of find(cls)) if (patch(m, spec)) n += 1;
    return n;
  }

  function state() {
    return {
      patched: patches.length, compiled, anchorsHit,
      anchorsMissed: missed.map((x) => ({ ...x })),
      keys: [...new Set(patches.map((p) => p.key))],
    };
  }

  return { enabled: true, THREE, classify, find, patch, patchClass, state };
}
