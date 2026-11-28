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
  // ---- deferred mode (the stage flow of club/index.js; never on without it) ---------------------------------------------------
  // While the game is live on the app's dark stage the look is built OFF STAGE: nothing may change a material the stage is
  // drawing. defer() turns the mode on. patch() and write() then QUEUE their change: patch() answers as if the wrap were
  // installed (and writes userData.clubKeys for its readers), so a caller patches each material once, and no hook, define or
  // version of the material is touched. flush() installs the queue in call order and ends the mode (the look's one swap);
  // rehearse(fn) installs it, calls fn and takes it out again in reverse order, all in one task (the look compiles its
  // programs under the state the swap will leave, and the stage's next frame finds every material as it was); drop() empties
  // it and takes the keys back (the look is abandoned: the app's materials are as the app made them).
  // AFTER drop() THE ADOPTER TAKES NOTHING MORE: patch() and write() change nothing and answer false, for good. The look
  // that was abandoned still has work on its way (a scan that arrives late restyles its part and asks for a map swap, a
  // capture's tap): with the mode simply ended, that work was applied at once, on a material of the room the player is
  // then looking at. Nothing of an abandoned look may reach the scene.
  let deferred = false, dropped = false;
  let seated = 0; // maps seated again by a wrap's on() (see wrapOf)
  const queue = []; // { material, key, on(), off(), addedKey } in call order

  // one wrap as a pair: on() installs it exactly as patch() always did, off() takes it out while the hooks still stand as
  // on() left them (a wrap another module put on top later is not cut out of the chain)
  function wrapOf(material, spec, name) {
    let prevCompile, prevKey, prevDefines, compileFn = null, keyFn = null, isOn = false;
    // The uniforms map three made for the last variant this wrap compiled, and the renderer that made it. three keeps ONE map
    // per material, that of the variant the material CREATED last, and uploads every variant's uniforms from it. A variant
    // the rehearsal compiled is FOUND at the swap, not created: this hook does not run again, and the map may by then be one
    // that a later variant made WITHOUT the wrap (the stage's own frames and bakes go on after the rehearsal). The wrap's
    // uniforms would then never be uploaded and its program would read zeros. on() seats the kept map again.
    let seat = null, seatOf = null;
    return {
      on() {
        if (isOn) return;
        isOn = true;
        prevCompile = material.onBeforeCompile;
        prevKey = material.customProgramCacheKey;
        prevDefines = material.defines;
        const before = prevCompile, keyBefore = prevKey;
        material.onBeforeCompile = compileFn = function clubCompile(shader, renderer) {
          if (typeof before === 'function') before.call(this, shader, renderer);
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
          seat = shader.uniforms; seatOf = renderer ?? null; // (three stores this very object as the material's map)
        };
        material.customProgramCacheKey = keyFn = function clubKey() {
          asked?.add(spec.key);
          return (typeof keyBefore === 'function' ? String(keyBefore.call(this)) : '') + '|club:' + spec.key;
        };
        if (spec.defines) { material.defines = { ...(material.defines ?? {}), ...spec.defines }; }
        if (seat !== null && seatOf !== null) {
          try {
            const held = seatOf.properties?.get?.(material);
            if (held && held.uniforms && held.uniforms !== seat) { held.uniforms = seat; held.uniformsList = null; seated += 1; }
          } catch { /* a renderer that keeps no such map: nothing to seat */ }
        }
        material.needsUpdate = true;
      },
      off() {
        if (!isOn) return;
        isOn = false;
        if (material.onBeforeCompile === compileFn) material.onBeforeCompile = prevCompile;
        if (material.customProgramCacheKey === keyFn) material.customProgramCacheKey = prevKey;
        if (spec.defines) material.defines = prevDefines;
        material.needsUpdate = true;
      },
    };
  }

  /**
   * Wrap one material. spec = { key, uniforms?, pars?, vertexPars?, apply: [{ anchor, mode: 'before'|'after'|'replace', code,
   * stage?: 'vertex'|'fragment' }], defines? }. `key` names the patch AND every variant of its text (a tier or option that changes
   * the code must change the key). Returns true when the wrap was installed (in deferred mode: queued), false when the material
   * already carries this key, and after drop() (nothing is touched, no key is written).
   */
  function patch(material, spec) {
    if (!material || !spec || typeof spec.key !== 'string' || !spec.key) return false;
    if (dropped) return false;
    // "Already carries" is read from the material's own hooks, never from userData: the app shares one userData object between
    // two cloth materials (table.js midWallMatFor) and three's Material.clone() copies userData but not the hooks, so
    // userData.clubKeys can name a wrap the material does not have. The key chain is the one three compiles by; a wrap the app
    // copied onto a clone or wrapped again later still answers (an app key that throws ends the walk where it threw).
    asked = new Set();
    try { material.customProgramCacheKey(); } catch { /* the wraps above the throw have answered */ }
    const carried = asked.has(spec.key);
    asked = null;
    if (carried) return false;
    if (deferred && queue.some((q) => q.material === material && q.key === spec.key)) return false; // queued: it will carry it
    const keys = (material.userData.clubKeys ??= []); // still written for its readers (mat/wood.js, room.js, arena/room.js)
    const addedKey = !keys.includes(spec.key);
    if (addedKey) keys.push(spec.key);
    const name = material.name || material.userData?.obClass || material.type;
    const wrap = wrapOf(material, spec, name);
    if (deferred) queue.push({ material, key: spec.key, on: wrap.on, off: wrap.off, addedKey });
    else wrap.on();
    try { patches.push({ material: new WeakRef(material), name, key: spec.key }); } catch { patches.push({ material: null, name, key: spec.key }); }
    return true;
  }

  /**
   * A direct write on a material the app draws (a map swapped in, a tap in front of a patch): `apply()` now, or, in deferred
   * mode, queued with the wraps in call order; `revert()` undoes it (rehearse() and nothing else calls it). `apply` may run
   * more than once (rehearse, then flush) and must read what it replaces when it runs, not when it was queued. After drop()
   * `apply` is never called and the answer is false.
   */
  function write(apply, revert) {
    if (typeof apply !== 'function' || dropped) return false;
    if (!deferred) { apply(); return true; }
    queue.push({ material: null, key: null, on: apply, off: typeof revert === 'function' ? revert : () => {}, addedKey: false });
    return true;
  }
  function defer() { if (!dropped) deferred = true; }
  /** Install everything queued, in call order, and end the deferred mode. Returns how many changes were installed. */
  function flush() {
    deferred = false;
    const jobs = queue.splice(0);
    let n = 0;
    for (const q of jobs) { try { q.on(); n += 1; } catch (e) { console.warn('[club] adopt: a queued change threw and is skipped:', e); } }
    return n;
  }
  /** Install the queue, call fn, take the queue out again (reverse order); one task. The mode and the queue stay. */
  function rehearse(fn) {
    const on = [];
    try {
      for (const q of queue) { q.on(); on.push(q); }
      return fn();
    } finally {
      for (let i = on.length - 1; i >= 0; i--) { try { on[i].off(); } catch (e) { console.warn('[club] adopt: a queued change could not be taken out:', e); } }
    }
  }
  /** Empty the queue without installing it and take back the keys patch() wrote for it. The mode ends, and so does the adopter: patch() and write() take nothing after this. */
  function drop() {
    deferred = false; dropped = true;
    for (const q of queue.splice(0)) {
      if (!q.addedKey || !q.material) continue;
      try { const keys = q.material.userData?.clubKeys; const i = Array.isArray(keys) ? keys.indexOf(q.key) : -1; if (i >= 0) keys.splice(i, 1); } catch { /* the material is gone */ }
      for (let i = patches.length - 1; i >= 0; i--) { if (patches[i].key === q.key && patches[i].material?.deref?.() === q.material) { patches.splice(i, 1); break; } }
    }
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
      ...(deferred || queue.length ? { deferred, queued: queue.length } : {}), // the stage flow only: absent otherwise
      ...(seated ? { seated } : {}), // the stage flow only: absent otherwise
      ...(dropped ? { dropped: true } : {}), // a failed stage only: absent otherwise
    };
  }

  return { enabled: true, THREE, classify, find, patch, patchClass, state, write, defer, flush, rehearse, drop };
}
