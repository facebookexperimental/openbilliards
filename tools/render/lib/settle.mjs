// Copyright (c) Meta Platforms, Inc. and affiliates.

// settle.mjs — NOTE-CENSUS-SETTLE (fence-law addendum, 2026-09-09): a census / identity dump hashes a scene
// only after every geometry attribute has held still. The ballreturn lane found a baked occlusion attribute
// (obPocketCap aOccl) landing in three asynchronous stages up to ~3.6 s after __test.ready, so the same tree
// hashed differently per load. Rule: the per-mesh attribute signature (every attribute's name, version and
// count, the index version, the group count, the material count) must read IDENTICAL on >= `reads`
// consecutive polls before any hash is taken; past `capMs` the run REFUSES by name — no hash is taken from
// a scene still being written.
import { refusal } from './serve-check.mjs';

export const GEOMETRY_SIGNATURE_EXPR = `(() => {
  const scene = window.__dbg && window.__dbg.scene; if (!scene) return 'no-scene';
  // attribute IDENTITY: a stage that REPLACES an attribute with a fresh BufferAttribute of the same count restarts
  // version at 0 (table.js lands aOccl that way), so each attribute object gets a serial on first sight — a
  // replacement is a new serial. Interleaved attributes carry version/uuid on their shared .data buffer.
  const ids = (window.__obSettleIds = window.__obSettleIds || { m: new WeakMap(), n: 0 });
  const idOf = (x) => { if (!x || typeof x !== 'object') return '-'; if (!ids.m.has(x)) ids.m.set(x, ++ids.n); return ids.m.get(x); };
  const sigOf = (a) => { const src = a && a.isInterleavedBufferAttribute && a.data ? a.data : a; return idOf(a) + '.' + idOf(src) + '.' + (src ? src.version : '-') + '/' + (a ? a.count : '-'); };
  const parts = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return; const g = o.geometry; const at = g.attributes || {}; const mo = g.morphAttributes || {};
    parts.push(o.uuid + ':' + idOf(g) + ':' + Object.keys(at).sort().map((k) => k + '=' + sigOf(at[k])).join(',')
      + (g.index ? ';i=' + sigOf(g.index) : '') + ';mo=' + Object.keys(mo).sort().map((k) => k + '=' + (mo[k] || []).map(sigOf).join('+')).join(',')
      + ';g=' + (g.groups || []).length + ';m=' + (Array.isArray(o.material) ? o.material.length : 1));
  });
  return parts.length + '|' + parts.join('|');
})()`;

/** Poll the page's geometry signature through `evalJ` until it reads identical `reads` times in a row
 *  (default 5 reads, 500 ms apart = a 2 s hold — the snooker pocket occlusion lands in three stages about a second
 *  apart, so a 1 s hold could fall between two of them); refuse by name after `capMs` (default 30 s). `guard` is the caller's
 *  closed-socket guard. Returns { reads, changes, lastChangeMs, ms, meshes } for the report line. */
export async function awaitGeometrySettle(evalJ, { tag = 'settle', reads = 5, intervalMs = 500, capMs = 30000, guard = () => {} } = {}) {
  const t0 = Date.now(); let last = null, same = 0, changes = 0, lastChangeAt = 0, n = 0;
  while (Date.now() - t0 < capMs) {
    guard('waiting for the geometry to settle');
    let sig; try { sig = String(await evalJ(GEOMETRY_SIGNATURE_EXPR)); } catch (e) { if (e && (e.cdpDeadline || e.cdpClosed)) throw refusal(tag, `CDP ${e.cdpDeadline ? 'command deadline' : 'socket closed'} while waiting for the geometry to settle: ${e.message} — the renderer stopped answering; the run stops here`); throw e; } n++; // FIX7: named, never a bare FAILED
    if (sig === last) same++; else { if (last !== null) { changes++; lastChangeAt = Date.now() - t0; } last = sig; same = 1; }
    if (same >= reads) return { reads: n, changes, lastChangeMs: lastChangeAt, ms: Date.now() - t0, meshes: Number(sig.split('|')[0]) || 0 };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw refusal(tag, `geometry attributes did not settle within ${capMs} ms (${changes} change(s), the last at +${lastChangeAt} ms, ${n} reads) — no hash is taken from a scene still being written`);
}
