// Copyright (c) Meta Platforms, Inc. and affiliates.

// Local benchmark adapter: change only the joined-floor composition in the
// historical slow solver. Its enumeration and bisection stay untouched.
import assert from 'node:assert/strict';

export function patchCueFloorReference(source, {withoutJoinFloor = false} = {}) {
  const replace = (before, after) => {
    assert.equal(source.split(before).length - 1, 1, `Reference patch anchor: ${before.slice(0, 90)}`);
    source = source.replace(before, after);
  };
  replace('function mouthCarveAt(m, px, ax, az, nd, cw) {',
    'function mouthCarveAt(m, px, ax, az, nd, cw, baseTop = -Infinity) {');
  const open = `  const cornerOpen = m.cornerThroatW !== undefined && nd <= cw
    ? Math.abs(ax - az)
      < Math.SQRT2 * m.cornerThroatW - (ax + az) * m.cornerThroatSlope
    : Math.abs(ax - az) < (m.cornerHalf - JAW_MARGIN) * Math.SQRT2;
  const sideOpen = m.sideThroatW !== undefined && nd <= cw
    ? Math.abs(px) < m.sideThroatW - az * m.sideThroatSlope
    : Math.abs(px) < m.sideHalf - JAW_MARGIN;
  const open = cornerOpen || sideOpen;
`;
  replace('  const collarTopAt = () => {', open + '  const collarTopAt = () => {');
  replace('if (cornerTop !== null || sideTop !== null) return Math.max(cornerTop ?? -Infinity, sideTop ?? -Infinity);',
    'if (cornerTop !== null || sideTop !== null) return {joinedTop: Math.max(cornerTop ?? -Infinity, sideTop ?? -Infinity)};');
  replace(`  if (ct !== null) return { top: ct };
  const cornerOpen = m.cornerThroatW !== undefined && nd <= cw
    ? Math.abs(ax - az)
      < Math.SQRT2 * m.cornerThroatW - (ax + az) * m.cornerThroatSlope
    : Math.abs(ax - az) < (m.cornerHalf - JAW_MARGIN) * Math.SQRT2;
  if (cornerOpen) return { open: true };
  const sideOpen = m.sideThroatW !== undefined && nd <= cw
    ? Math.abs(px) < m.sideThroatW - az * m.sideThroatSlope
    : Math.abs(px) < m.sideHalf - JAW_MARGIN;
  if (sideOpen) return { open: true };`,
  `  if (ct !== null) {
    if (typeof ct === 'number') return {top: ct, collar: true};
    return {top: open ? ct.joinedTop : Math.max(ct.joinedTop, baseTop), collar: false};
  }
  if (open) return {open: true};`);
  replace('mouthCarveAt(m, x, dx, dz, nd, g.cushionWidth);',
    'mouthCarveAt(m, x, dx, dz, nd, g.cushionWidth, nd <= g.cushionWidth ? g.railTop : g.frameTop);');
  replace('mouthCarveAt(m, px, ax, az, nd, cw);',
    'mouthCarveAt(m, px, ax, az, nd, cw, nd <= cw ? g.railTop : g.frameTop);');
  replace('mouthCarveAt(mouths, px, ax, az, nd, cw);',
    'mouthCarveAt(mouths, px, ax, az, nd, cw, top);');
  if (withoutJoinFloor) {
    // Keep every joined-profile crossing in the enumerator. This isolates
    // the pre-join floor law from historical crossing/epsilon differences.
    replace('      const joinTop = (R, u, w, corner) => {',
      '      return null; // Same-root baseline: collar, open corridor, rail/frame.\n      const joinTop = (R, u, w, corner) => {');
  }
  return source;
}
