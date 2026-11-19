// Copyright (c) Meta Platforms, Inc. and affiliates.

// motion/marks.js — marks on the cloth of the club look (CONTRACT.md section 12.2, owner: marks). Reached only through
// motion.js (`applyMarks(club, kit)`); importing this module does nothing.
//
// What is drawn (marks/model.js says why): a chalk speck and a short smear where the struck ball sat, the pale burn track
// where a ball slid hard before it rolled (a break, a draw shot), a small pale dot where a ball came down on the bed.
// Nothing for a rolling ball.
//
// Where it lives: a term in the cloth's own material (marks/glsl.js, through club.adopt.patch, key `motion-marks-v<N>`),
// fed by one 32 x 2 float texture of records. No mesh, no draw call: the ball return's furniture walk has nothing to find,
// nothing can z-fight, and a mark takes the cloth's light and shadows because it IS the cloth's albedo.
//
// The laws of the round, as kept here:
//   1 read-only     reads the record handed to update() and the table's size (kit.table()); writes only its own texture and
//                   uniforms, and wraps `onBeforeRender` of the cloth materials it patched (the same kind of wrap adopt.js
//                   puts on `onBeforeCompile`)
//   2 pure in time  the records written for a frame are marksAt(model(record), t): the record and t, nothing else. The only
//                   things kept between calls are caches keyed on the record object and the last bytes uploaded (to skip an
//                   upload that would change nothing). Session marks (below) are OFF unless asked for
//   3 never throws  every entry point is wrapped; an error switches the part's output to zero and leaves a note
//   4 no solid      no mesh. An environment capture draws the cloth, so the term is switched to zero for every draw made
//                   by a cube camera or into a cube target (the onBeforeRender wrap): a capture never holds a mark
//   5 look off      this file is loaded by motion.js only
//
// Session marks (marks of EARLIER shots; `?clubmarks=session`, off by default): a bounded list (marks/model.js
// createSession: 6 shots, the oldest fades out, cleared when the table has no record, that is on a re-rack). They are drawn
// only outside PLAYBACK and during a playback that was entered by a live stroke on the very record that stroke made; a
// replay, a loaded record or an export (all enter PLAYBACK with `replay` / `dvr` / no flag, or swap the record) draws
// marksAt(record, t) alone, so one shot's replay stays a function of that shot's record.
//
// Tool knobs on the boot URL: ?clubmarks=session | nochalk | noburn | noland | noguard (capture guard off) | gain:<x>
// (comma list). At run time: club.motion.parts.marks.set({ on, gain, chalk, burn, land, session }).
import * as THREE from 'three';
import { shotMarks, marksAt, marksAtEnd, createSession, recordsBox, RECORD_FLOATS, MARK_CHALK } from './marks/model.js';
import { marksPatchSpec, MARKS_PATCH_VERSION, MARK_MAX, MARKS_LOOK } from './marks/glsl.js';

const stub = (reason) => ({ enabled: false, reason, update() {}, clear() {}, state: () => ({ enabled: false, reason }), dispose() {} });
const text = (e) => String(e?.message ?? e);
const SAMPLER_TYPES = new Set([0x8B5E, 0x8B60, 0x8B5F, 0x8B62, 0x8DC1, 0x8DC4, 0x8DC5, 0x8DCA, 0x8DCB, 0x8DCC, 0x8DCF, 0x8DD2, 0x8DD3, 0x8DD4, 0x8DD7]);
const BOX_GROW = 0.04; // metres the records' bounds are grown by: a mark drawn a pixel wide at a grazing view reaches past its own width

export async function applyMarks(club, kit = null) {
  const ctx = club?.ctx ?? {};
  const adopt = club?.adopt;
  if (typeof adopt?.patch !== 'function' || typeof adopt?.find !== 'function') return stub('no adoption service');
  let asked = '';
  try { asked = String(ctx.query?.get?.('clubmarks') ?? ''); } catch { /* unreadable query: the defaults */ }
  const tokens = asked.split(',').map((s) => s.trim()).filter(Boolean);
  const flags = { on: 1, chalk: tokens.includes('nochalk') ? 0 : 1, burn: tokens.includes('noburn') ? 0 : 1, land: tokens.includes('noland') ? 0 : 1 };
  let gain = 1;
  for (const tok of tokens) { const m = /^gain:([0-9.]+)$/.exec(tok); if (m && Number.isFinite(Number(m[1]))) gain = Math.min(8, Math.max(0, Number(m[1]))); }
  let sessionOn = tokens.includes('session');
  const guard = { on: !tokens.includes('noguard'), zeroed: 0 };
  const knobCap = Number((kit?.knobs ?? club?.knobs)?.motionMarks);
  const cap = Math.max(1, Math.min(MARK_MAX, Number.isFinite(knobCap) && knobCap > 0 ? Math.floor(knobCap) : MARK_MAX));
  const notes = [];
  const note = (s) => { if (notes.length < 8) notes.push(String(s)); try { kit?.note?.(String(s)); } catch { /* a note never throws */ } };

  // ---- the record texture and the uniforms (shared objects: one set for every cloth material) ----
  const data = new Float32Array(MARK_MAX * 2 * 4);
  let tex = null;
  try {
    tex = new THREE.DataTexture(data, MARK_MAX, 2, THREE.RGBAFormat, THREE.FloatType);
    tex.name = 'club.motion.marks.records';
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.needsUpdate = true;
  } catch (e) { return stub(`no record texture (${text(e)})`); }
  const U = {
    uClubMarkTex: { value: tex },
    uClubMarkK: { value: new THREE.Vector4(0, 0, 0, 0) },
    uClubMarkC: { value: new THREE.Vector4(MARKS_LOOK.chalk[0], MARKS_LOOK.chalk[1], MARKS_LOOK.chalk[2], 0) },
    uClubMarkBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  const drawn = { n: 0, uploads: 0, same: 0, updates: 0, lastT: null, box: [0, 0, 0, 0], source: 'none' };
  let dead = null; // set once: the reason the part's output is zero for good
  function writeLook() {
    U.uClubMarkK.value.z = MARKS_LOOK.burn * gain;
    U.uClubMarkK.value.w = MARKS_LOOK.burnNeutral * gain;
    U.uClubMarkC.value.w = Math.min(1, MARKS_LOOK.chalkCover * gain);
  }
  writeLook();

  /** Put a list of records into the texture (nothing is uploaded when the bytes would be the same). */
  function write(records, bedY) {
    const n = dead || !flags.on ? 0 : Math.min(records.length, cap, MARK_MAX);
    let changed = n !== drawn.n;
    for (let i = 0; i < n; i++) {
      const r = records[i];
      const o0 = i * 4, o1 = (MARK_MAX + i) * 4;
      for (let k = 0; k < 4; k++) {
        const a = Math.fround(r[k]), b = Math.fround(r[4 + k]);
        if (data[o0 + k] !== a) { data[o0 + k] = a; changed = true; }
        if (data[o1 + k] !== b) { data[o1 + k] = b; changed = true; }
      }
    }
    drawn.n = n;
    U.uClubMarkK.value.x = n;
    U.uClubMarkK.value.y = Number.isFinite(bedY) ? bedY : 0;
    if (changed) {
      const box = n ? recordsBox(records.slice(0, n), BOX_GROW) : [0, 0, 0, 0];
      drawn.box = box;
      U.uClubMarkBox.value.set(box[0], box[1], box[2], box[3]);
      if (n) { tex.needsUpdate = true; drawn.uploads += 1; }
    } else drawn.same += 1;
  }

  // ---- the model of a record (a cache keyed on the record object; rebuilt when the table or a switch changes) ----
  let models = new WeakMap();
  let lastCounts = null;
  const tableNow = () => {
    let t = null;
    try { t = typeof kit?.table === 'function' ? kit.table() : null; } catch { t = null; }
    if (!t) {
      try {
        const sys = ctx.game?.template?.system;
        const length = Number(sys?.table?.length), width = Number(sys?.table?.width), ballR = Number(sys?.balls?.[0]?.params?.r);
        if (length > 0 && width > 0 && ballR > 0) t = { bedY: 0, ballR, halfL: length / 2, halfW: width / 2 };
      } catch { t = null; }
    }
    return t;
  };
  function modelOf(record, table) {
    const key = table ? `${table.ballR}|${table.halfL}|${table.halfW}` : 'no table';
    const hit = models.get(record);
    if (hit && hit.key === key) return hit.model;
    const model = shotMarks(record, table ? { ballR: table.ballR, halfL: table.halfL, halfW: table.halfW } : {});
    model.marks = model.marks.filter((m) => (m.kind === 'track' ? flags.burn : m.kind === 'land' ? flags.land : flags.chalk) > 0);
    models.set(record, { key, model });
    lastCounts = { ...model.counts, kept: model.marks.length };
    return model;
  }

  // ---- session marks (off unless asked for; see the header) ----
  const session = createSession({ shots: 6, perShot: 10 });
  let liveRecord = null; // the record of the live stroke whose playback is running
  const withSession = (own, record, playback) => {
    if (!sessionOn) return own;
    // a playback: the record's own marks; the earlier shots only under the live stroke that made this very record
    if (playback) return liveRecord && liveRecord === record ? session.list(Math.max(0, cap - own.length)).concat(own) : own;
    // between shots: the session (the played shot is its newest entry); with an empty session, the record as it stands
    return session.size ? session.list(cap) : own;
  };

  // ---- the patch, and the capture guard ----
  const done = new WeakSet();
  const patched = []; // { ref, name }
  const skipped = [];
  const isAnalytic = (m) => { try { return typeof m.customProgramCacheKey === 'function' && String(m.customProgramCacheKey()).startsWith('spike'); } catch { return false; } };
  const isCapture = (renderer, camera) => {
    try { if (camera?.parent?.type === 'CubeCamera') return true; } catch { /* no parent */ }
    try { if (renderer?.getRenderTarget?.()?.isWebGLCubeRenderTarget === true) return true; } catch { /* no target */ }
    return false;
  };
  function guardMaterial(m) {
    const prev = m.onBeforeRender;
    m.onBeforeRender = function clubMarksGuard(renderer, scene, camera, geometry, object, group) {
      if (typeof prev === 'function') prev.call(this, renderer, scene, camera, geometry, object, group);
      // an environment capture must not hold a mark: the count is zero for every draw of a cube face, and the frame's own
      // count for every other draw
      if (dead || !guard.on) return;
      const zero = isCapture(renderer, camera);
      if (zero) guard.zeroed += 1;
      U.uClubMarkK.value.x = zero ? 0 : drawn.n;
    };
  }
  function patchAll() {
    let n = 0;
    let found = [];
    try { found = adopt.find('cloth'); } catch (e) { note(`find('cloth') failed: ${text(e)}`); }
    for (const m of found) {
      if (done.has(m)) continue;
      const name = m?.name || m?.userData?.obClass || m?.type || 'cloth';
      // the term reads the world position the app's analytic shading hands the cloth (shading.js `vSpikeWorldPos`)
      if (!m?.isMeshPhysicalMaterial || !isAnalytic(m)) { if (!skipped.includes(name)) skipped.push(name); continue; }
      if (adopt.patch(m, marksPatchSpec({ uniforms: U }))) {
        done.add(m); n += 1;
        try { guardMaterial(m); } catch (e) { note(`capture guard not installed on ${name}: ${text(e)}`); }
        try { patched.push({ ref: new WeakRef(m), name }); } catch { patched.push({ ref: null, name }); }
      }
    }
    return n;
  }

  // sampler units of a material's live program (state() only; never per frame)
  const gl = (() => { try { return ctx.renderer?.getContext?.() ?? null; } catch { return null; } })();
  function samplersOf(material) {
    try {
      const prog = ctx.renderer?.properties?.get?.(material)?.currentProgram;
      if (!gl || !prog?.program) return null;
      const n = gl.getProgramParameter(prog.program, gl.ACTIVE_UNIFORMS);
      let units = 0, bound = false;
      for (let i = 0; i < n; i++) {
        const a = gl.getActiveUniform(prog.program, i);
        if (!a || !SAMPLER_TYPES.has(a.type)) continue;
        units += a.size;
        if (a.name === 'uClubMarkTex') bound = true;
      }
      return { units, bound, patched: String(prog.cacheKey ?? '').includes(`motion-marks-v${MARKS_PATCH_VERSION}`) };
    } catch { return null; }
  }

  const fail = (where, e) => {
    if (!dead) { dead = `${where}: ${text(e)}`; note(`marks off after ${where} failed: ${text(e)}`); }
    drawn.n = 0;
    try { U.uClubMarkK.value.x = 0; } catch { /* the uniform is ours */ }
  };

  /** One frame: the marks of `record` at ball time `t` (motion.js calls this while a record exists). */
  function update(t, record, info) {
    if (dead) return;
    try {
      drawn.updates += 1; drawn.lastT = t;
      const table = tableNow();
      const model = record ? modelOf(record, table) : null;
      const own = model ? marksAt(model, Number(t), cap) : [];
      const list = withSession(own, record, info?.playback === true);
      drawn.source = list === own ? 'record' : 'record + session';
      write(list, table?.bedY ?? 0);
    } catch (e) { fail('update', e); }
  }
  /** No record (boot, a new rack): nothing is on the cloth, and the session's marks go with the rack. */
  function clear() {
    if (dead) return;
    try { session.clear(); liveRecord = null; if (drawn.n !== 0 || U.uClubMarkK.value.x !== 0) write([], U.uClubMarkK.value.y); } catch (e) { fail('clear', e); }
  }
  /** State changes feed the session list only (never the marks of the record being played). */
  function onState(next, prev, entry, record) {
    if (dead) return;
    try {
      if (next === 'PLAYBACK') liveRecord = entry?.strike === true && record ? record : null;
      else if (prev === 'PLAYBACK') {
        if (sessionOn && liveRecord && liveRecord === record) session.push(record, marksAtEnd(modelOf(record, tableNow()), cap));
        liveRecord = null;
      }
      patchAll(); // a state change is rare: cloth materials that appeared since (a rebuilt table, a late table) take the term
    } catch (e) { fail('onState', e); }
  }
  /** Table / fixture / look changed: new cloth materials are patched; cached models are dropped (the table's size may differ). */
  function rebuild(_reason) {
    try { models = new WeakMap(); return patchAll(); } catch (e) { fail('rebuild', e); return 0; }
  }
  /** Tools: switches for on / off pairs in one page load. */
  function set(next = {}) {
    try {
      let remodel = false;
      for (const k of ['chalk', 'burn', 'land']) if (typeof next?.[k] === 'number' || typeof next?.[k] === 'boolean') { const v = next[k] ? 1 : 0; if (v !== flags[k]) { flags[k] = v; remodel = true; } }
      if (typeof next?.on === 'number' || typeof next?.on === 'boolean') { flags.on = next.on ? 1 : 0; if (!flags.on) { drawn.n = 0; U.uClubMarkK.value.x = 0; } }
      if (typeof next?.gain === 'number' && Number.isFinite(next.gain)) { gain = Math.min(8, Math.max(0, next.gain)); writeLook(); }
      if (typeof next?.session === 'boolean') { sessionOn = next.session; if (!sessionOn) session.clear(); }
      if (typeof next?.guard === 'boolean') guard.on = next.guard;
      if (remodel) models = new WeakMap();
    } catch (e) { fail('set', e); }
    return { ...flags, gain, session: sessionOn, guard: guard.on };
  }
  function state() {
    const mats = [];
    for (const p of patched) {
      const m = p.ref?.deref?.();
      if (p.ref && !m) continue;
      const s = m ? samplersOf(m) : null;
      mats.push({ name: p.name, samplers: s ? s.units : null, recordSamplerBound: s ? s.bound : null, compiledWithPatch: s ? s.patched : null });
    }
    const records = [];
    for (let i = 0; i < drawn.n; i++) {
      const o0 = i * 4, o1 = (MARK_MAX + i) * 4;
      records.push({ kind: data[o1 + 3] >= MARK_CHALK ? 'chalk' : 'burn', a: [+data[o0].toFixed(4), +data[o0 + 1].toFixed(4)], b: [+data[o0 + 2].toFixed(4), +data[o0 + 3].toFixed(4)], half: +data[o1].toFixed(4), s: [+data[o1 + 1].toFixed(3), +data[o1 + 2].toFixed(3)] });
    }
    return {
      enabled: !dead, reason: dead, key: `motion-marks-v${MARKS_PATCH_VERSION}`, home: 'a term in the cloth material (no mesh, no draw call)',
      patched: mats.length, materials: mats, skipped: skipped.slice(), addedSamplers: 1, drawCalls: 0, triangles: 0,
      texture: { width: MARK_MAX, height: 2, format: 'RGBA32F', bytes: MARK_MAX * 2 * 16, uploads: drawn.uploads, unchanged: drawn.same },
      cap, floatsPerRecord: RECORD_FLOATS, drawn: drawn.n, t: drawn.lastT, updates: drawn.updates, source: drawn.source, box: drawn.box.map((v) => +v.toFixed(3)),
      records, model: lastCounts, look: { ...MARKS_LOOK, gain }, switches: { ...flags },
      guard: { on: guard.on, cubeDrawsZeroed: guard.zeroed },
      session: { on: sessionOn, shots: session.size, rule: 'drawn only outside PLAYBACK and in the playback of the live stroke that made the record' },
      notes: notes.slice(),
    };
  }
  function dispose() {
    dead = dead ?? 'disposed';
    drawn.n = 0;
    try { U.uClubMarkK.value.x = 0; } catch { /* ours */ }
    try { session.clear(); } catch { /* ours */ }
    try { tex.dispose(); } catch { /* gone */ }
  }

  let n = 0;
  try { n = patchAll(); } catch (e) { return stub(`patch failed (${text(e)})`); }
  if (n === 0 && skipped.length) note(`no cloth material could take the term (${skipped.join(', ')})`);
  return { enabled: true, reason: null, update, clear, onState, rebuild, set, state, dispose, uniforms: U };
}
