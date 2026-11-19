// Copyright (c) Meta Platforms, Inc. and affiliates.

// Lossless patches for generated pocket seams. No geometry solver lives here.
// The compiler and the runtime use this carrier; certification is independent.
import * as carrier from './cn8transport-codec.js';
import * as identity from './cn8transport-core.js';

export const SCHEMA = 'diamond-pocket-seams/1';
const TYPES = { Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array };
const requireValue = (value, code) => {
  if (!value) { const error = new Error('POCKET_SEAM_' + code); error.code = 'POCKET_SEAM_' + code; throw error; }
};
function capabilities() {
  requireValue(typeof carrier.encode === 'function' && typeof carrier.decode === 'function'
    && typeof identity.sha256 === 'function', 'CODEC_CAPABILITY');
}
export function signature(G) {
  return [G.L, G.W, G.CW].join('/');
}
export function supportNames(G) {
  return ['dm-bed-cloth', ...Array.from({ length: 6 }, (_, i) => 'dm-railtop-' + i),
    ...Array.from({ length: 4 }, (_, i) => 'dm-cornerblock-' + i),
    ...G.pockets.map((p, i) => 'dm-bootcollar-' + (p.corner ? 'c' : 's') + i)];
}
export function meshMap(group, names) {
  const wanted = new Set(names), result = new Map();
  group.traverse(object => {
    if (!wanted.has(object.name)) return;
    requireValue(object.isMesh && !result.has(object.name), 'INPUT_NAME_' + object.name);
    result.set(object.name, object);
  });
  requireValue(result.size === wanted.size, 'INPUT_MISSING');
  return result;
}
export function geometryIdentity(geometry) {
  capabilities();
  const attributes = {};
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.getAttribute(name);
    requireValue(attribute && !attribute.isInterleavedBufferAttribute && TYPES[attribute.array.constructor.name], 'ATTRIBUTE_TYPE');
    attributes[name] = { type: attribute.array.constructor.name, item_size: attribute.itemSize,
      normalized: attribute.normalized, length: attribute.array.length, sha256: identity.sha256(attribute.array) };
  }
  const index = geometry.getIndex();
  requireValue(index && TYPES[index.array.constructor.name], 'INDEX_REQUIRED');
  return { attributes, index: { type: index.array.constructor.name, length: index.array.length,
    sha256: identity.sha256(index.array) },
    draw_range: { start: geometry.drawRange.start,
      count: geometry.drawRange.count === Infinity ? 'Infinity' : geometry.drawRange.count },
    groups: geometry.groups.map(row => ({ start: row.start, count: row.count, material_index: row.materialIndex })) };
}
export function inputIdentity(group, G) {
  const names = supportNames(G), meshes = meshMap(group, names), result = [];
  // Room placement is not a mesh input. All paths are expressed relative
  // to the table root, with the same chart used by the offline compiler.
  group.updateWorldMatrix(true, true);
  for (const name of names) {
    const mesh = meshes.get(name), materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let visible = true; const chain = [];
    for (let p = mesh; p && p !== group; p = p.parent) { visible = visible && p.visible; chain.push(p); }
    const relative = group.matrix.clone().identity();
    for (let i = chain.length - 1; i >= 0; i--) relative.multiply(chain[i].matrix);
    result.push({ mesh: name, geometry: geometryIdentity(mesh.geometry), visible,
      matrix: Array.from(relative.elements),
      materials: materials.map(material => material ? { visible: material.visible,
        transparent: material.transparent, opacity: material.opacity } : null) });
  }
  return result;
}
export function snapshotGeometry(geometry) {
  return { identity: geometryIdentity(geometry),
    attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, a]) => [name, a.array.slice()])),
    index: geometry.index.array.slice() };
}
function sameScalarBytes(a, b, index) {
  const n = a.BYTES_PER_ELEMENT;
  const x = new Uint8Array(a.buffer, a.byteOffset + index * n, n);
  const y = new Uint8Array(b.buffer, b.byteOffset + index * n, n);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return false;
  return true;
}
export function encodePatch(name, before, geometry) {
  capabilities();
  const after = geometryIdentity(geometry), attributes = {};
  requireValue(JSON.stringify(Object.keys(before.identity.attributes)) === JSON.stringify(Object.keys(after.attributes)), 'ATTRIBUTE_SET');
  for (const key of Object.keys(after.attributes)) {
    const a = before.attributes[key], b = geometry.attributes[key].array;
    const old = before.identity.attributes[key], next = after.attributes[key];
    requireValue(old.type === next.type && old.item_size === next.item_size
      && old.normalized === next.normalized && b.length >= a.length, 'ATTRIBUTE_LAYOUT');
    const at = [], values = [];
    for (let i = 0; i < a.length; i++) if (!sameScalarBytes(a, b, i)) { at.push(i); values.push(b[i]); }
    attributes[key] = { length: b.length, updates: carrier.encode(new Uint32Array(at)),
      values: carrier.encode(new b.constructor(values)), tail: carrier.encode(b.slice(a.length)) };
  }
  const parents = geometry.userData.pocketSeam?.originalTriangles;
  const index = geometry.index.array, oldTriangles = before.index.length / 3;
  requireValue(index.constructor.name === before.index.constructor.name, 'INDEX_CARRIER_TYPE');
  requireValue(Array.isArray(parents) && parents.length * 3 === index.length, 'PARENT_MAP');
  const replacements = [], offsets = [0], triangles = [];
  let at = 0;
  for (let parent = 0; parent < oldTriangles; parent++) {
    const start = at;
    while (at < parents.length && parents[at] === parent) at++;
    requireValue(at === parents.length || parents[at] > parent, 'PARENT_ORDER');
    if (at - start === 1 && [0, 1, 2].every(j => index[3 * start + j] === before.index[3 * parent + j])) continue;
    replacements.push(parent);
    for (let i = 3 * start; i < 3 * at; i++) triangles.push(index[i]);
    offsets.push(triangles.length);
  }
  requireValue(at === parents.length, 'PARENT_RANGE');
  return { mesh: name, before: before.identity, after, attributes,
    index: { parents: carrier.encode(new Uint32Array(replacements)), offsets: carrier.encode(new Uint32Array(offsets)),
      triangles: carrier.encode(new index.constructor(triangles)) } };
}
export function decodePatch(row) {
  capabilities();
  const attributes = Object.fromEntries(Object.entries(row.attributes).map(([name, patch]) => [name, {
    length: patch.length, updates: carrier.decode(patch.updates), values: carrier.decode(patch.values), tail: carrier.decode(patch.tail),
  }]));
  const index = Object.fromEntries(Object.entries(row.index).map(([name, value]) => [name, carrier.decode(value)]));
  requireValue(index.parents instanceof Uint32Array && index.offsets instanceof Uint32Array
    && index.offsets.length === index.parents.length + 1 && index.offsets[0] === 0
    && index.offsets.at(-1) === index.triangles.length, 'INDEX_PATCH');
  return { ...row, attributes, index };
}
function sameLayout(geometry, expected) {
  const names = Object.keys(geometry.attributes).sort(), wanted = Object.keys(expected.attributes).sort();
  if (names.length !== wanted.length || names.some((name, i) => name !== wanted[i])) return false;
  for (const name of names) {
    const attribute = geometry.attributes[name], shape = expected.attributes[name];
    if (!attribute || attribute.isInterleavedBufferAttribute || attribute.array.constructor.name !== shape.type
      || attribute.itemSize !== shape.item_size || attribute.normalized !== shape.normalized
      || attribute.array.length !== shape.length) return false;
  }
  const index = geometry.index, draw = geometry.drawRange;
  if (!index || index.array.constructor.name !== expected.index.type || index.count !== expected.index.length
    || draw.start !== expected.draw_range.start
    || draw.count !== (expected.draw_range.count === 'Infinity' ? Infinity : expected.draw_range.count)
    || geometry.groups.length !== expected.groups.length) return false;
  return geometry.groups.every((group, i) => group.start === expected.groups[i].start
    && group.count === expected.groups[i].count && group.materialIndex === expected.groups[i].material_index);
}
function applyGeometryPatch(mesh, patch, checkedInput, verifyBytes) {
  const source = mesh.geometry;
  requireValue(verifyBytes
    ? JSON.stringify(checkedInput ?? geometryIdentity(source)) === JSON.stringify(patch.before)
    : sameLayout(source, patch.before), 'PATCH_INPUT_' + mesh.name);
  const geometry = new source.constructor();
  try {
    for (const [name, row] of Object.entries(patch.attributes)) {
      const original = source.attributes[name], Type = original.array.constructor;
      requireValue(Number.isSafeInteger(row.length) && row.length >= original.array.length
        && row.values.constructor.name === Type.name && row.tail.constructor.name === Type.name
        && row.updates.length === row.values.length && row.tail.length + original.array.length === row.length, 'ATTRIBUTE_PATCH');
      const array = new Type(row.length); array.set(original.array); array.set(row.tail, original.array.length);
      let previous = -1;
      for (let i = 0; i < row.updates.length; i++) {
        const at = row.updates[i];
        requireValue(at > previous && at < original.array.length, 'ATTRIBUTE_PATCH_ORDER');
        array[at] = row.values[i]; previous = at;
      }
      geometry.setAttribute(name, new original.constructor(array, original.itemSize, original.normalized));
    }
    const { parents, offsets, triangles } = patch.index;
    const Type = TYPES[patch.after.index.type], output = new Type(patch.after.index.length);
    let sourceParent = 0, cursor = 0;
    for (let i = 0; i < parents.length; i++) {
      const parent = parents[i];
      requireValue(parent >= sourceParent && parent < source.index.count / 3
        && offsets[i] <= offsets[i + 1] && offsets[i] % 3 === 0 && offsets[i + 1] % 3 === 0, 'INDEX_PATCH_ORDER');
      const unchanged = source.index.array.subarray(sourceParent * 3, parent * 3);
      output.set(unchanged, cursor); cursor += unchanged.length;
      const replacement = triangles.subarray(offsets[i], offsets[i + 1]);
      output.set(replacement, cursor); cursor += replacement.length; sourceParent = parent + 1;
    }
    const suffix = source.index.array.subarray(sourceParent * 3);
    output.set(suffix, cursor); cursor += suffix.length;
    requireValue(cursor === output.length, 'INDEX_PATCH_LENGTH');
    // Use the generic index-attribute constructor, not setIndex(array),
    // which would choose a possibly different integer carrier.
    geometry.setIndex(new source.index.constructor(output, 1, false));
    const draw = patch.after.draw_range;
    geometry.setDrawRange(draw.start, draw.count === 'Infinity' ? Infinity : draw.count);
    for (const row of patch.after.groups) geometry.addGroup(row.start, row.count, row.material_index);
    geometry.userData = { ...source.userData, pocketSeamArtifact: { schema: SCHEMA, input: patch.before.index.sha256,
      output: patch.after.index.sha256 } };
    requireValue(verifyBytes
      ? JSON.stringify(geometryIdentity(geometry)) === JSON.stringify(patch.after)
      : sameLayout(geometry, patch.after), 'PATCH_OUTPUT_' + mesh.name);
    return geometry;
  } catch (error) { geometry.dispose(); throw error; }
}
// Build and audit callers verify every byte. The browser's guarded leaf
// first binds the carrier to the source version; its per-build work checks
// layouts and reconstructs buffers without hashing whole meshes again.
export function applyPatch(mesh, patch, checkedInput = null) {
  return applyGeometryPatch(mesh, patch, checkedInput, true);
}
export function applyRuntimePatch(mesh, patch) {
  return applyGeometryPatch(mesh, patch, null, false);
}
