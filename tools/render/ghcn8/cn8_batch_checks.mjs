// Copyright (c) Meta Platforms, Inc. and affiliates.

// Independent per-triangle identity and material-group census for ORDER-12 B.
import { createHash } from 'node:crypto';

const digest = array => createHash('sha256').update(Buffer.from(
  array.buffer, array.byteOffset, array.byteLength)).digest('hex');

export function batchBuffers(geometry, name) {
  return { name, attributes: Object.fromEntries(Object.entries(geometry.attributes)
    .map(([key, value]) => [key, { type: value.array.constructor.name,
      itemSize: value.itemSize, count: value.count, sha256: digest(value.array) }])),
  indices: geometry.index ? Array.from(geometry.index.array) : null,
  groups: geometry.groups.map(group => ({ ...group })) };
}

function triangleAssignments(row, failures) {
  const count = row.attributes?.position?.count;
  if (!Number.isInteger(count) || count <= 0) {
    failures.push(`${row.name}: missing vertex count`); return new Map();
  }
  const indices = row.indices ?? Array.from({ length: count }, (_, i) => i);
  if (indices.length % 3 || indices.some(i => !Number.isInteger(i) || i < 0 || i >= count)) {
    failures.push(`${row.name}: malformed indices`); return new Map();
  }
  const coverage = new Uint8Array(indices.length), triangles = new Map();
  for (const group of row.groups) {
    if (![group.start, group.count, group.materialIndex].every(Number.isInteger)
      || group.start < 0 || group.count <= 0 || group.start % 3 || group.count % 3
      || group.start + group.count > indices.length || group.materialIndex < 0) {
      failures.push(`${row.name}: malformed material range`); continue;
    }
    for (let offset = group.start; offset < group.start + group.count; offset += 3) {
      for (let i = 0; i < 3; i++) coverage[offset + i]++;
      const key = indices.slice(offset, offset + 3).join(',');
      if (triangles.has(key)) failures.push(`${row.name}: duplicate triangle ${key}`);
      triangles.set(key, group.materialIndex);
    }
  }
  if (coverage.some(value => value !== 1)) failures.push(`${row.name}: triangle coverage is not exactly once`);
  return triangles;
}

export function measureMaterialBatches(before, after) {
  const failures = [], changedAttributes = [];
  const original = triangleAssignments(before, failures);
  const batched = triangleAssignments(after, failures);
  if (before.name !== after.name) failures.push('Mismatched plank identity');
  for (const name of new Set([...Object.keys(before.attributes), ...Object.keys(after.attributes)])) {
    if (JSON.stringify(before.attributes[name]) !== JSON.stringify(after.attributes[name])) changedAttributes.push(name);
  }
  if (changedAttributes.length) failures.push('Vertex attribute bytes changed');
  let changedMaterials = 0, missing = 0, extra = 0;
  for (const [triangle, material] of original) {
    if (!batched.has(triangle)) missing++;
    else if (batched.get(triangle) !== material) changedMaterials++;
  }
  for (const triangle of batched.keys()) if (!original.has(triangle)) extra++;
  if (missing || extra || changedMaterials) failures.push('Per-triangle winding/identity/material changed');
  const domains = new Set(after.groups.map(group => group.materialIndex));
  // Three domains are emitted by cn8D3RailGeometry: X/Y, Z/Y and cap X/Z.
  if (after.groups.length > 3 || after.groups.length !== domains.size) failures.push('Material domains are not individually batched');
  let end = 0;
  for (const group of after.groups) {
    if (group.start !== end) failures.push('Material groups are not contiguous');
    end = group.start + group.count;
  }
  const afterIndexCount = after.indices?.length ?? after.attributes.position.count;
  if (end !== afterIndexCount) failures.push('Material groups do not span the draw');
  return { name: after.name, tag: 'DERIVED actual index/attribute/material assignments',
    status: failures.length ? 'FAIL' : 'PASS',
    groups_before: before.groups.length, groups_after: after.groups.length,
    triangle_count_before: original.size, triangle_count_after: batched.size,
    index_changed: JSON.stringify(before.indices) !== JSON.stringify(after.indices),
    changed_attributes: changedAttributes, changed_triangle_materials: changedMaterials,
    missing_triangles: missing, extra_triangles: extra, groups: after.groups, failures };
}
