// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
// One browser producer for the direct and ordered-transition material fences.
export const MATERIAL_EXPORT = `(() => {
  const scene = window.__dbg.scene; scene.updateMatrixWorld(true);
  let table = null; scene.traverse((o) => { if (!table && o.name === 'obTable') table = o; });
  const inTable = new Set(); if (table) table.traverse((o) => inTable.add(o));
  const texCache = new Map();
  const fnv = (bytes, h0 = [0xcbf29ce4, 0x84222325]) => { // FNV-1a 64 as two 32-bit halves
    let hi = h0[0] >>> 0, lo = h0[1] >>> 0;
    for (let i = 0; i < bytes.length; i++) { lo ^= bytes[i];
      const lo2 = (lo & 0xffff) * 0x1b3, lo1 = (lo >>> 16) * 0x1b3, hi2 = (hi & 0xffff) * 0x1b3, hi1 = (hi >>> 16) * 0x1b3; // x 0x100000001b3
      let nlo = lo2 + ((lo1 & 0xffff) << 16); let carry = ((lo2 >>> 16) + (lo1 & 0xffff)) >>> 16; carry += (lo1 >>> 16);
      let nhi = (hi2 + ((hi1 & 0xffff) << 16) + lo + carry) >>> 0; lo = nlo >>> 0; hi = nhi; }
    return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0'); };
  const pix = (img) => { try {
      if (!img) return null;
      if (img.data && img.width) return { w: img.width, h: img.height, bytes: img.data instanceof Uint8Array || img.data instanceof Uint8ClampedArray ? img.data : new Uint8Array(img.data.buffer || img.data) };
      const w = img.width || img.videoWidth || 0, h = img.height || img.videoHeight || 0; if (!w || !h) return null;
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      return { w, h, bytes: g.getImageData(0, 0, w, h).data };
    } catch (e) { return { err: String(e).slice(0, 80) }; } };
  const texHash = (t) => { if (!t) return null; if (texCache.has(t.uuid)) return texCache.get(t.uuid);
    let rec;
    if (t.isCubeTexture) { const faces = (t.image || []).map((f) => { const p = pix(f); return p && p.bytes ? fnv(p.bytes) + ':' + p.w + 'x' + p.h : (p && p.err) || 'nopix'; }); rec = { kind: 'cube', faces, colorSpace: t.colorSpace }; }
    else { const p = pix(t.image); rec = { kind: t.isDataTexture ? 'data' : 'image', hash: p && p.bytes ? fnv(p.bytes) : null, size: p ? [p.w, p.h] : null, err: p && p.err, colorSpace: t.colorSpace, repeat: t.repeat ? [t.repeat.x, t.repeat.y] : null, wrap: [t.wrapS, t.wrapT] }; }
    texCache.set(t.uuid, rec); return rec; };
  const hex = (c) => c && c.getHexString ? c.getHexString() : null; const v2 = (v) => v ? [v.x, v.y] : null;
  const num = (x) => (typeof x === 'number' ? Number(x.toFixed(6)) : (x === undefined ? undefined : x));
  const matRec = (m) => ({ type: m.type, name: m.name || '', obClass: (m.userData && m.userData.obClass) || null,
    color: hex(m.color), emissive: hex(m.emissive), emissiveIntensity: num(m.emissiveIntensity), roughness: num(m.roughness), metalness: num(m.metalness),
    envMapIntensity: num(m.envMapIntensity), clearcoat: num(m.clearcoat), clearcoatRoughness: num(m.clearcoatRoughness), specularIntensity: num(m.specularIntensity), sheen: num(m.sheen),
    opacity: num(m.opacity), transparent: !!m.transparent, side: m.side, normalScale: v2(m.normalScale), clearcoatNormalScale: v2(m.clearcoatNormalScale),
    map: texHash(m.map), normalMap: texHash(m.normalMap), roughnessMap: texHash(m.roughnessMap), metalnessMap: texHash(m.metalnessMap), emissiveMap: texHash(m.emissiveMap),
    clearcoatNormalMap: texHash(m.clearcoatNormalMap), aoMap: texHash(m.aoMap), alphaMap: texHash(m.alphaMap), envMap: texHash(m.envMap) });
  const rows = []; const counts = {};
  scene.traverse((o) => { if (!o.isMesh || !o.geometry) return; const nm = o.name || ''; if (!(nm.startsWith('dm-') || inTable.has(o))) return;
    const k = nm || '(unnamed)'; counts[k] = (counts[k] || 0) + 1; const key = counts[k] > 1 ? k + '#' + counts[k] : k;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    rows.push({ key, name: nm, slots: mats.map((m) => m ? matRec(m) : null) }); });
  return JSON.stringify({ table: (window.__test.equipment && window.__test.equipment()) || null, tableFound: !!table, meshes: rows.length, textures: texCache.size, rows });
})()`;
