// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-gikey-drive.js — ORDER-LIGHT-C2-FIX5 class G (review r7 P2, gi.js:211): the bake-key race as a scripted sequence.
// Evaluated as the body of a `--poke-raw gikey=<this file>` (tools/render/lighting-capture.mjs wraps it in an IIFE and waits on
// window.__pokePending). Sequence: (1) open the studio window exactly as the studio sets do (web/app/cinelight.js installCineLight —
// it announces window.__cinelight and dispatches ob:cinelight; under the venue rig rule gi.js suspends the bake: roomBaked and uGiOn
// both false while giBound / roomAssets keep the previous fixture's maps); (2) request ANOTHER baked fixture through the real entry
// point (window.__lighting.apply → gi.setFixture) on a boot that holds every GI apply open after its assets arrived (?giDelay=3000):
// the new request is pending; (3) close the window (revert) while it is pending; (4) a per-frame trace (rAF) from before (2) until the
// new request completes records { giOn, giBound, bakeFixture, fixture, applySeq, appliedSeq, cine }. A frame with giOn = 1 while the
// BOUND fixture is not the REQUESTED one is a STALE re-enable — the finding (the 793c8d67 rule re-enabled the old bake at the window's
// close until the new request completed; main kept GI off through the interval). Reads only fields both trees carry (gi.state.*,
// gi.uniforms.uGiOn) so the same script runs on main's export for the pairwise row. Any failure lands in window.__giTrace.error and
// window.__pokeResult.error — the capture FAILS the set.
window.__pokePending = true; window.__giTrace = null;
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const G = window.__gi; const L = window.__lighting; const d = window.__dbg;
  const frames = []; let raf = 0, tracing = false;
  const snap = () => { const s = G.state; return { t: Math.round(performance.now()), giOn: G.uniforms.uGiOn.value, giBound: s.giBound ? 1 : 0, bakeFixture: s.bakeFixture ?? null, fixture: s.fixture ?? null,
    applySeq: s.applySeq ?? null, appliedSeq: s.appliedSeq ?? null, cine: window.__cinelight === true ? 1 : 0, roomBaked: s.roomBaked ? 1 : 0 }; };
  const tick = () => { if (!tracing) return; frames.push(snap()); raf = requestAnimationFrame(tick); };
  try {
    if (!G || !G.state || !G.uniforms || !L || typeof L.apply !== 'function' || !d) throw new Error('gikey: __gi / __lighting.apply / __dbg missing');
    const s0 = snap(); if (s0.giOn !== 1 || !s0.bakeFixture) throw new Error('gikey: the boot has no bound bake (giOn ' + s0.giOn + ', bakeFixture ' + s0.bakeFixture + ') — the race needs a bound fixture');
    // GH-975 S2: the pool-class ring bake was dropped, and an unbaked fixture neutralizes SYNCHRONOUSLY (no held asset load, no stale-key
    // path), so the race pairs the two fixtures that still ship committed pool-class bakes: pdt_studio and the canopy. The target's bake is
    // asserted against the served manifest, so a future manifest change fails here by name instead of silently bypassing the race.
    const from = s0.bakeFixture; const to = from === 'canopy_panel' ? 'pdt_studio' : 'canopy_panel';
    const mf = G.state.manifest, lk = G.state.look;
    if (!mf || G.state.bakeClass !== 'pool') throw new Error('gikey: the race pair resolves on the pool class (bakeClass ' + G.state.bakeClass + ', manifest ' + (mf ? 'loaded' : 'missing') + ')');
    const bakedOn = (fx) => (fx === 'canopy_panel' ? !!(mf.looks && mf.looks[lk]) // gi.js entryFor, pool class
      : !!(mf.fixtures && mf.fixtures[fx] && mf.fixtures[fx].looks && mf.fixtures[fx].looks[lk] && !mf.fixtures[fx].looks[lk].unbaked));
    if (!bakedOn(to)) throw new Error('gikey: the target fixture ' + to + ' ships no committed bake for look ' + lk + ' — the race needs an asynchronous baked load');
    // (1) the studio window
    const m = await import('/app/cinelight.js');
    const h = m.installCineLight({ scene: d.scene, renderer: d.renderer, camera: d.camera, cubeCam: d.cubeCam, ballMeshes: (window.__test && window.__test.ballMeshes) ? window.__test.ballMeshes() : [] });
    await wait(200);
    const s1 = snap(); const opened = window.__cinelight === true;
    // (4) trace from here
    tracing = true; raf = requestAnimationFrame(tick);
    // (2) the fixture request under the window (the apply is held open after its assets by ?giDelay=3000)
    L.apply(to, undefined);
    await wait(400);
    const s2 = snap(); const pendingAtClose = s2.applySeq !== s2.appliedSeq;
    // (3) close the window while the request is pending
    const closedAtFrame = frames.length; h.revert(); await wait(50);
    const s3 = snap();
    // run until the request completes (bounded)
    let completed = false; for (let i = 0; i < 400; i++) { await wait(50); const s = snap(); if (s.applySeq === s.appliedSeq && s.fixture === to) { completed = true; break; } }
    await wait(200); tracing = false; if (raf) cancelAnimationFrame(raf);
    const stale = frames.filter((f) => f.giOn === 1 && f.bakeFixture !== f.fixture);
    const onBefore = frames.filter((f, i) => f.giOn === 1 && f.applySeq !== f.appliedSeq);
    window.__giTrace = { frames: frames.length, staleOn: stale.length, onBeforeComplete: onBefore.length, completed, closedAtFrame, opened: opened ? 1 : 0, pendingAtClose: pendingAtClose ? 1 : 0,
      from, to, staleFirst: stale.length ? JSON.stringify(stale[0]) : null, s0, s1, s2, s3, last: snap(), sample: frames.filter((f, i) => i % 5 === 0).slice(0, 80) };
    window.__pokeResult = { ok: true, frames: frames.length, staleOn: stale.length, onBeforeComplete: onBefore.length, completed, opened, pendingAtClose, from, to };
  } catch (e) {
    tracing = false; if (raf) cancelAnimationFrame(raf);
    window.__giTrace = { error: String(e && e.message || e), frames: frames.length };
    window.__pokeResult = { error: 'gikey: ' + String(e && e.message || e) };
  } finally { window.__pokePending = false; }
})();
