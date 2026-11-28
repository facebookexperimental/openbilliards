// Copyright (c) Meta Platforms, Inc. and affiliates.

// Content identity and lossless transport carriers. No ray tracing lives here.
// SHA-256 follows FIPS 180-4. The key hashes recipe inputs and integer topology;
// positions are not a runtime identity: at table scale one quantum is one ULP.
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64), tail = new Uint8Array(128);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  function block(source, offset) {
    for (let i = 0; i < 16; i++) {
      const p = offset + 4 * i;
      w[i] = (source[p] << 24) | (source[p + 1] << 16) | (source[p + 2] << 8) | source[p + 3];
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      w[i] = w[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3))
        + w[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10));
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25))
        + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22))
        + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const result = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) state[i] += result[i];
  }
  const full = bytes.length - bytes.length % 64;
  for (let offset = 0; offset < full; offset += 64) block(bytes, offset);
  tail.set(bytes.subarray(full)); tail[bytes.length - full] = 0x80;
  const padded = bytes.length - full < 56 ? 64 : 128;
  const view = new DataView(tail.buffer);
  view.setUint32(padded - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(padded - 4, (bytes.length * 8) >>> 0);
  block(tail, 0); if (padded === 128) block(tail, 64);
  return Array.from(state, x => x.toString(16).padStart(8, '0')).join('');
}

export const RECEIVER = /^(?:cn8-(?:net|fallbag|net-apron|net-liner)-[0235]|cn8r82-(?:wallface|tongue|endroll)-[0235]-[ab]|cn8r82-rollface-[0235])$/;
export const CLOTH_SURFACE = /^cn8-(?:bed|cushion-[0-5])$/;
export const CORNERS = [[0, -1, -1], [2, 1, -1], [3, -1, 1], [5, 1, 1]];

// Canonical metadata also preserves signed zero. Texture pixels, material
// colour and existing transport OUTPUTS are deliberately not solver inputs.
export function canonical(value, arrays = new WeakMap()) {
  if (typeof value === 'number') {
    if (Object.is(value, -0)) return { negative_zero: true };
    if (!Number.isFinite(value)) throw new Error('CN8_TRANSPORT_NONFINITE_INPUT');
    return value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (value.isBufferAttribute) return { array: canonical(value.array, arrays),
    itemSize: value.itemSize, normalized: value.normalized };
  if (ArrayBuffer.isView(value)) {
    if (!arrays.has(value)) arrays.set(value, { type: value.constructor.name,
      length: value.length, sha256: sha256(value) });
    return arrays.get(value);
  }
  if (Array.isArray(value)) return value.map(child => canonical(child, arrays));
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key], arrays)]));
}

export function transportIdentity(group, geometry, constants, solverVersion) {
  if (!/^[0-9a-f]{64}$/.test(solverVersion)) throw new Error('CN8_TRANSPORT_SOLVER_VERSION_MISSING');
  const arrays = new WeakMap();
  const solids = [], receivers = [], members = [];
  const shape = attribute => attribute ? { type: attribute.array.constructor.name,
    count: attribute.count, itemSize: attribute.itemSize, normalized: attribute.normalized } : null;
  let ordinal = 0, triangleStart = 0;
  function visit(object, visible, path) {
    visible = visible && object.visible;
    if (object.isMesh) {
      const identity = ordinal++, g = object.geometry, name = object.name || '(unnamed)';
      if (visible) {
        if (object.isInstancedMesh || object.isSkinnedMesh) throw new Error('CN8_TRANSPORT_UNEXPANDED_SOLID');
        const materialArray = Array.isArray(object.material);
        const materials = (materialArray ? object.material : [object.material]).map(m => m
          ? { visible: m.visible, transparent: m.transparent, opacity: m.opacity } : null);
        const position = g.getAttribute('position'), index = g.getIndex();
        const end = Math.min(index?.count ?? position.count, g.drawRange.start + g.drawRange.count);
        let triangles = 0;
        for (let i = g.drawRange.start; i + 2 < end; i += 3) {
          const candidates = materialArray ? g.groups.filter(range => range.start <= i
            && range.start + range.count >= i + 3).map(range => materials[range.materialIndex]) : materials;
          for (const m of candidates) if (m?.visible && !m.transparent && m.opacity === 1) triangles++;
        }
        if (triangles) {
          solids.push({ ordinal: identity, name, path, position: shape(position),
            index: index ? canonical(index, arrays) : null,
            groups: canonical(g.groups), draw: [g.drawRange.start, end], materialArray, materials });
          members.push({ ordinal: identity, name, path: 'table' + path.map(i => '/' + i).join(''), triangleStart, triangles,
            vertices: position.count, source: 'Completed table mesh position/index/draw-range/material/transform definitions' });
          triangleStart += triangles;
        }
        if (RECEIVER.test(name) || group.userData.cn8Furniture && CLOTH_SURFACE.test(name)) {
          const smooth = g.userData.cn8Smooth?.nrm;
          receivers.push({ ordinal: identity, name, position: shape(position),
            normal: shape(g.getAttribute('normal')), uv: shape(g.getAttribute('uv')),
            smoothNormal: smooth ? { type: smooth.constructor.name, length: smooth.length } : null });
        }
      }
    }
    object.children.forEach((child, i) => visit(child, visible, path.concat(i)));
  }
  visit(group, true, []);
  // The complete builder source (including derived profile constants) is in
  // solverVersion. Only catalog recipe inputs enter this key; transcendental
  // intermediates, normals and Float32 position bytes do not. Both aliases
  // use the same physical catalog recipe, so they share one solved artifact.
  const inputs = { schema: 2, solverVersion, solids, receivers,
    recipe: canonical(geometry.transportRecipe ?? { L: geometry.L, W: geometry.W,
      kernel: geometry.kernel, render: geometry.render }) };
  return { key: sha256(JSON.stringify(inputs)), inputs, members, triangles: triangleStart };
}

// The only runtime arithmetic after lookup is the original colour response.
// Float64 f / bounce-share carriers preserve the solver's exact intermediates
// for every cloth colour; Float32 rounding happens at the original final write.
export function applyLinerCoefficients(color, coefficients, clothColor) {
  if (coefficients.length !== color.count * 2) throw new Error('CN8_TRANSPORT_COEFFICIENT_LENGTH');
  const luminance = Math.max(1e-6, .2126 * clothColor.r + .7152 * clothColor.g + .0722 * clothColor.b);
  const r = clothColor.r / luminance, g = clothColor.g / luminance, b = clothColor.b / luminance;
  for (let i = 0; i < color.count; i++) {
    const f = coefficients[2 * i], bs = coefficients[2 * i + 1];
    color.setXYZ(i, f * (1 + bs * (r - 1)), f * (1 + bs * (g - 1)), f * (1 + bs * (b - 1)));
  }
  color.needsUpdate = true;
}
