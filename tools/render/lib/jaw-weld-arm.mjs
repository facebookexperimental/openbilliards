// Copyright (c) Meta Platforms, Inc. and affiliates.

import { liveJawAnchor } from './jaw-erosion.mjs';

// The neutral key first, then its old-key alias (the checker replays the spec under it); both narrow to the neutral id when the alias block goes.
export const JAW_WELD_TABLES = Object.freeze(['pool_pro_9ft_metal_rim', 'predator_apex_9ft']);
export const JAW_WELD_TABLE = JAW_WELD_TABLES[0];
const difference = (a, b) => { const other = new Set(b); return a.filter((row) => !other.has(row)); };
const pointPair = (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
const edgePair = (edges) => Array.isArray(edges) && edges.length === 2
  && edges.every((edge) => Number.isSafeInteger(edge) && edge >= 0) && edges[0] !== edges[1];
const near = (a, b) => Math.hypot(...a.map((v, axis) => v - b[axis])) <= 1e-9;

/** Fail closed on whole failure sets, one recorded first crossing per row,
 * and the LIVE erosion vertex derived from the unmodified exported plan.
 * Matching counts or mutually corrupted recordings/measurements cannot arm it. */
export function assessJawWeldArm({ base, pert, baseline, fixture, crossings, plans }) {
  const problems = [];
  const sets = { base, pert, baseline: baseline?.rows, recording: fixture?.rows };
  for (const [name, rows] of Object.entries(sets)) {
    if (!Array.isArray(rows) || !rows.every((row) => typeof row === 'string')) {
      problems.push(`${name}: row identities are required`);
    } else if (new Set(rows).size !== rows.length) problems.push(`${name}: duplicate row identity`);
  }
  if (!Array.isArray(crossings) || !Array.isArray(fixture?.crossings) || !Array.isArray(plans)) {
    problems.push('intersection recordings and live plans are required');
  }
  if (problems.length) return { problems, added: [], gone: [] };
  const compare = (actual, expected, label) => {
    const added = difference(actual, expected), gone = difference(expected, actual);
    if (added.length || gone.length) problems.push(`${label}: +${added.length} unexpected / -${gone.length} missing row(s)`);
    if (new Set(actual).size !== actual.length || new Set(expected).size !== expected.length) {
      problems.push(`${label}: duplicate row identity`);
    }
  };
  compare(base, baseline.rows, 'unperturbed versus committed baseline');
  const added = difference(pert, base), gone = difference(base, pert);
  if (gone.length) problems.push(`${gone.length} unperturbed row(s) vanished`);
  if (!fixture.rows.length || !fixture.crossings.length) problems.push('empty arm recording');
  compare(added, fixture.rows, 'differential versus recorded arm');
  const measured = crossings.filter((c) => added.includes(c?.row));
  compare(measured.map((c) => c.row), fixture.rows, 'live intersection coverage');
  compare(fixture.crossings.map((c) => c?.row), fixture.rows, 'recorded intersection coverage');
  if (fixture.rows.some((row) => !JAW_WELD_TABLES.some((id) => row.startsWith(`${id} rail`)))) {
    problems.push('arm recording contains a row on another table');
  }
  for (const c of measured) {
    const recorded = fixture.crossings.find((r) => r?.row === c.row);
    if (!recorded || !pointPair(c.point) || !pointPair(recorded.point)
      || !edgePair(c.edges) || !edgePair(recorded.edges)) {
      problems.push(`intersection differs: finite planar coordinates and edge pairs are required: ${c.row}`);
      continue;
    }
    const identity = JAW_WELD_TABLES.includes(c.id) && recorded.id === c.id
      && Number.isSafeInteger(c.rail) && c.rail >= 0 && recorded.rail === c.rail
      && c.row.startsWith(`${c.id} rail${c.rail}:`)
      && Number.isFinite(c.z) && Number.isFinite(c.o)
      && recorded.z === c.z && recorded.o === c.o
      && c.edges.every((edge, i) => edge === recorded.edges[i]);
    if (!identity || !near(c.point, recorded.point)) {
      problems.push(`intersection differs from the recorded identity or coordinate: ${c.row}`);
    }
    const anchor = liveJawAnchor(c, plans);
    if (!anchor || !pointPair(anchor.point) || !near(c.point, anchor.point)) {
      problems.push(`intersection differs from the live erosion vertex w: ${c.row}`);
    }
  }
  return { problems, added, gone };
}
