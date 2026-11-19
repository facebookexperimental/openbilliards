// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
export const SIGHT_FIELDS = ['color', 'metalness', 'roughness', 'envMapIntensity'];

/** Ordered-transition identity: report missing meshes and the exact fields
 * inherited from a previous table. Empty expected OX sights cannot pass. */
export function sightDifferences(expected, actual, { requireSights = false } = {}) {
  const differences = [];
  if (!Array.isArray(expected) || !Array.isArray(actual)) return [{ field: 'sights', why: 'missing inventory' }];
  if (requireSights && expected.length === 0) differences.push({ field: 'sights', why: 'empty fresh OX inventory' });
  const index = (rows, side) => {
    const map = new Map();
    for (const row of rows) {
      if (map.has(row.name)) differences.push({ name: row.name, field: 'name', why: `duplicate ${side} sight` });
      map.set(row.name, row);
    }
    return map;
  };
  const before = index(expected, 'expected'), after = index(actual, 'actual');
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(name), b = after.get(name);
    if (!a || !b) { differences.push({ name, field: 'name', why: a ? 'missing actual sight' : 'added actual sight' }); continue; }
    for (const field of SIGHT_FIELDS) {
      if (a[field] === undefined || b[field] === undefined || a[field] !== b[field]) {
        differences.push({ name, field, expected: a[field], actual: b[field] });
      }
    }
  }
  return differences;
}
