// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
/** Vertex-buffer integrity for every mesh of the built table.
 * Self-contained so the identical gate executes against live objects via CDP.
 */
export function censusTableAttributes(table) {
  const rows = [];
  if (table) table.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry, position = geometry?.getAttribute('position');
    const attributes = Object.fromEntries(Object.entries(geometry?.attributes || {}).map(([name, a]) => [name, a.count]));
    for (const [name, targets] of Object.entries(geometry?.morphAttributes || {})) {
      targets.forEach((a, i) => { attributes[`morph.${name}[${i}]`] = a.count; });
    }
    const reasons = [], index = geometry?.index;
    let maxIndex = -1, invalidIndices = 0;
    if (index) for (let i = 0; i < index.count; i++) {
      const vertex = index.getX(i);
      if (!Number.isInteger(vertex) || vertex < 0) invalidIndices++;
      else maxIndex = Math.max(maxIndex, vertex);
    }
    else if (position) maxIndex = position.count - 1;
    const requiredCount = maxIndex + 1;
    if (!position) reasons.push('missing position attribute');
    if (invalidIndices) reasons.push(`${invalidIndices} invalid vertex indices`);
    for (const [name, count] of Object.entries(attributes)) {
      if (!Number.isInteger(count) || count < 0) reasons.push(`${name} has invalid count ${count}`);
      if (count !== position?.count) reasons.push(`${name} count ${count} != position count ${position?.count}`);
      if (count < requiredCount) reasons.push(`${name} count ${count} < maxIndex + 1 (${requiredCount})`);
    }
    rows.push({ name: mesh.name || `(unnamed mesh ${rows.length})`, parent: mesh.parent?.name || '',
      indexed: !!index, indexCount: index?.count ?? 0, maxIndex, requiredCount,
      attributes, passed: reasons.length === 0, reasons });
  });
  const failures = rows.filter(row => !row.passed);
  return { rule: 'Every geometry vertex attribute count equals position.count and is >= maxIndex + 1; non-indexed maxIndex is position.count - 1.',
    tableFound: !!table, meshCount: rows.length, failedMeshCount: failures.length,
    passed: !!table && rows.length > 0 && failures.length === 0, rows, failures };
}
