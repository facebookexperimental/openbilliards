// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-page-selftest.mjs — ORDER-LIGHT-C2-FIX20 X1 fixture: hdrReadSrc must PROVE the GPU readback wrote the buffer.
// Runs the page string returned by hdrReadSrc(2) under plain node (three resolved to the committed vendored module through
// ensure-three.mjs, the only node-side precedent) with a stub renderer:
//   case 1 — readRenderTargetPixels writes NOTHING           → the helper must THROW by name ('HDR readback wrote nothing: …');
//   case 2 — readRenderTargetPixels writes HALF the buffer   → THROW by name with the untouched count;
//   case 3 — readRenderTargetPixels writes the whole buffer  → finite metrics (nan 0, neg 0, finite max) — the sensitivity control;
//            the judgment of a capture stays with the comparator (lighting-pixel-strict.py), never here.
// The string under test is evaluated UNMODIFIED (its `await import('three')` resolves from this file's location).
// Exit 0 iff all three cases read as expected, 3 otherwise. Seal-step wiring is b19 (GH-846).
import { ensureRealThree } from './ensure-three.mjs';
ensureRealThree();
const { hdrReadSrc } = await import('./lighting-page.mjs');
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const W = 4, H = 2;
function stub(mode) {
  return {
    domElement: { width: W, height: H },
    getRenderTarget() { return null; }, setRenderTarget() {}, render() {},
    readRenderTargetPixels(rt, x, y, w, h, buf) {
      if (mode === 'none') return;                                            // three's bail: logs, returns, writes nothing
      const n = mode === 'half' ? Math.floor(buf.length / 2) : buf.length;
      for (let i = 0; i < n; i++) buf[i] = (i % 4 === 3) ? 1 : 0.25;
    },
  };
}
async function run(mode) {
  globalThis.window = { __dbg: { renderer: stub(mode), camera: {}, scene: {} } };
  try { const r = await eval(hdrReadSrc(2)); return { ok: true, r }; }
  catch (e) { return { ok: false, err: String(e && e.message || e) }; }
}
const total = W * H * 4; let bad = 0;
const c1 = await run('none');
const w1 = !c1.ok && c1.err.startsWith(`HDR readback wrote nothing: ${total}/${total} float32 components (W*H*4) untouched`);
console.log(`[page-selftest] case 1 (readback writes nothing): ${c1.ok ? 'RETURNED ' + JSON.stringify(c1.r).slice(0, 80) : 'threw: ' + c1.err.slice(0, 160)} → ${w1 ? 'THROWN BY NAME as expected' : 'UNEXPECTED'}`); if (!w1) bad++;
const c2 = await run('half');
const w2 = !c2.ok && c2.err.startsWith(`HDR readback wrote nothing: ${total / 2}/${total} float32 components (W*H*4) untouched`);
console.log(`[page-selftest] case 2 (readback writes half): ${c2.ok ? 'RETURNED' : 'threw: ' + c2.err.slice(0, 160)} → ${w2 ? 'THROWN BY NAME with the untouched count' : 'UNEXPECTED'}`); if (!w2) bad++;
const c3 = await run('full');
const w3 = c3.ok && c3.r.nan === 0 && c3.r.neg === 0 && Number.isFinite(c3.r.max) && c3.r.w === 2 && c3.r.h === 1 && typeof c3.r.b64 === 'string';
console.log(`[page-selftest] case 3 (readback writes the buffer): ${c3.ok ? JSON.stringify({ w: c3.r.w, h: c3.r.h, nan: c3.r.nan, neg: c3.r.neg, max: c3.r.max }) : 'threw: ' + c3.err.slice(0, 160)} → ${w3 ? 'FINITE METRICS (sensitivity control)' : 'UNEXPECTED'}`); if (!w3) bad++;
console.log(`[page-selftest] ${bad === 0 ? 'PASS' : 'FAIL'} — ${3 - bad}/3 cases as expected (exit ${bad === 0 ? 0 : 3})`);
process.exit(bad === 0 ? 0 : 3);
