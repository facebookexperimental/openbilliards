// Copyright (c) Meta Platforms, Inc. and affiliates.

// mat/index.js — material upgrades on adopted surfaces (CONTRACT.md sections 4.3 and 9). Owner: lead (wiring only).
// Each surface has its own module and owner; a part that is missing, fails to load or throws leaves that surface on the
// tournament material. Parts are applied in the order below, after the occlusion and reflection services have patched.
// Literal specifiers only: the served-strings gate pins every dynamic import by its literal path.
const PARTS = [
  ['cloth', './cloth.js', () => import('./cloth.js'), 'applyCloth'],
  ['wood', './wood.js', () => import('./wood.js'), 'applyWood'],
  ['pocket', './pocket.js', () => import('./pocket.js'), 'applyPocket'],
];

export async function createMaterials(club) {
  const parts = {};
  let any = false;
  for (const [key, file, load, fn] of PARTS) {
    try {
      const mod = await load();
      if (typeof mod?.[fn] !== 'function') { parts[key] = { enabled: false, reason: `${file} has no ${fn}` }; continue; }
      const part = await mod[fn](club);
      parts[key] = part && typeof part === 'object' ? part : { enabled: false, reason: `${fn} returned nothing` };
      if (parts[key].enabled === true) any = true;
    } catch (e) {
      parts[key] = { enabled: false, reason: String(e?.message ?? e) };
      console.warn(`[club] material part '${key}' is unavailable — that surface stays on the tournament material:`, e);
    }
  }
  return {
    enabled: any,
    reason: any ? null : 'no material part is built',
    parts,
    /** table / fixture / look changed: every part re-finds and re-patches its materials */
    rebuild(reason) { for (const p of Object.values(parts)) { try { p.rebuild?.(reason); } catch (e) { console.warn('[club] material rebuild failed:', e); } } },
    state() { const o = {}; for (const [k, p] of Object.entries(parts)) o[k] = p.state?.() ?? { enabled: p.enabled === true, reason: p.reason ?? null }; return o; },
  };
}
