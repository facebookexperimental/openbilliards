// Copyright (c) Meta Platforms, Inc. and affiliates.

import { MM } from './cushion-ring.mjs';

// Dimensionless arithmetic identities derived from the existing SI symbol.
const UNIT = MM / MM, ZERO = UNIT - UNIT, HALF = UNIT / (UNIT + UNIT);

/** Read the default segment count by calling the exported arc sampler.
 * No export directly carries the renderer's continuation allowance, but its
 * retained polygon samples carry the angular step. Recover the requested
 * cut angle from that step, then subtract the cut from exported CN8_MID.DT09.
 * Round inverse-trig noise at the checker's existing double epsilon; accept
 * the result ONLY if the exported end law reproduces every long-rail vertex
 * within the existing positional epsilon. Never scrape renderer source. */
export function readMidjawInputs(G, polys, law) {
  const { middle, CW, L } = G;
  const { CN8_MID, cn8ArcPts, cn8MidJawEnd } = law;
  const [c1u, c1v] = middle.c1, [a0, aJ] = middle.a1;
  const [, ...intervals] = cn8ArcPts(c1u, c1v, middle.r1, a0, aJ);
  const segments = intervals.length;
  const [poly] = polys;
  const [, sample] = poly.slice(midjawTangency(G, poly));
  if (!sample || !sample.every(Number.isFinite) || !segments) {
    throw new Error(`${G.id}: cannot derive middle-jaw inputs from exported arc samples`);
  }
  const [v, y] = sample;
  const aFirst = Math.atan2(v - c1v, y - L * HALF - c1u);
  const dTheta = Math.atan2(Math.sin(aFirst - a0), Math.cos(aFirst - a0));
  const aT = a0 + segments * dTheta;
  const rawAllowance = CN8_MID.DT09 + c1u + middle.r1 * Math.cos(aT);
  const allowance = Number(rawAllowance.toFixed(-Math.log10(1e-12)));
  if (!(allowance > ZERO) || !Number.isFinite(allowance)
    || Math.sign(dTheta) !== Math.sign(aJ - a0)) {
    throw new Error(`${G.id}: cannot derive the middle-jaw allowance from exported arc samples`);
  }
  const cutU = CN8_MID.DT09 - allowance;
  const rebuilt = midjawLongRails(G, polys, cn8MidJawEnd(middle, CW, cutU, segments));
  const fidelity = rebuilt.map((body, rail) => {
    const original = polys[rail];
    if (!original || body.length !== original.length) {
      throw new Error(`${G.id} rail${rail}: exported middle-jaw fidelity failed (vertex count)`);
    }
    const delta = Math.max(...body.flatMap((point, vertex) =>
      point.map((value, axis) => Math.abs(value - original[vertex][axis]))));
    if (!Number.isFinite(delta) || delta > 1e-9) {
      throw new Error(`${G.id} rail${rail}: exported middle-jaw fidelity failed (delta=${delta})`);
    }
    return { rail, vertices: body.length, delta };
  });
  return { allowance, segments, fidelity };
}

function midjawTangency(G, poly) {
  const tangency = poly.findIndex(([x, y]) => x === ZERO && y === G.L * HALF - G.utm);
  if (tangency < ZERO) throw new Error(`${G.id}: middle tangency absent from the exported plan`);
  return tangency;
}

function midjawLongRails(G, polys, end) {
  const { L, W } = G;
  const [poly] = polys;
  const tangency = midjawTangency(G, poly);
  const mapMid = ([u, v]) => [v, L * HALF + u];
  const leftBottom = [...poly.slice(ZERO, tangency + UNIT), ...end.slice(UNIT).map(mapMid)];
  const mirY = (body) => body.map(([x, y]) => [x, L - y]).reverse();
  const mirX = (body) => body.map(([x, y]) => [W - x, y]).reverse();
  const leftTop = mirY(leftBottom);
  return [leftBottom, leftTop, mirX(leftBottom), mirX(leftTop)];
}

/** Restore the unconditional closure through the SAME shared arc law.
 * makeGeom exports G.middle (c1/r1/a1), CW, L, W, utm; railPolysFor exports
 * the existing corner/nose prefix. Only mapMid is reconstructed: [u,v] maps
 * to [v,L/2+u]. The untouched end rails come directly from railPolysFor.
 * Mirroring AND reversing is the renderer's winding-preserving convention. */
export function midjawOverrun(G, polys, law) {
  if (G.render.style !== 'cn8') return polys;
  const { middle, CW } = G;
  const { CN8_MID, cn8ArcPts, cn8MidJawCutAngle } = law;
  const { allowance, segments } = readMidjawInputs(G, polys, law);
  const cutU = CN8_MID.DT09 - allowance;
  const [c1u, c1v] = middle.c1;
  const a0 = middle.a1[0];
  const aT = cn8MidJawCutAngle(middle, cutU);
  const end = [...cn8ArcPts(c1u, c1v, middle.r1, a0, aT, segments), [-cutU, -CW]];
  const longRails = midjawLongRails(G, polys, end);
  return [...longRails, ...polys.slice(longRails.length)];
}

const difference = (a, b) => { const other = new Set(b); return a.filter((row) => !other.has(row)); };

/** Full row identities govern the verdict; matching counts cannot arm it.
 * Coordinates are independently intersected from the actual tested rings,
 * then checked against the recording, live back line AND live circle law.
 * The circle/chord discrepancy is bounded by one segment's sagitta, projected
 * onto the back line it is read along, using only live geometry and exported
 * sampling inputs. No fitted error budget.
 * The positional tolerance is the checker's existing double-geometry epsilon. */
export function assessMidjawArm({ base, pert, baseline, fixture, crossings, law }) {
  const problems = [];
  const lawChecks = new Map();
  const compare = (actual, expected, label) => {
    const added = difference(actual, expected), gone = difference(expected, actual);
    if (added.length || gone.length) problems.push(`${label}: +${added.length} unexpected / -${gone.length} missing row(s)`);
    if (new Set(actual).size !== actual.length || new Set(expected).size !== expected.length) {
      problems.push(`${label}: duplicate row identity`);
    }
  };
  compare(base, baseline.rows, 'unperturbed versus committed baseline');
  if (new Set(pert).size !== pert.length) problems.push('perturbed set: duplicate row identity');
  const added = difference(pert, base), gone = difference(base, pert);
  if (gone.length) problems.push(`${gone.length} unperturbed row(s) vanished`);
  if (!fixture.rows.length || !fixture.crossings.length) problems.push('empty arm recording');
  compare(added, fixture.rows, 'differential versus recorded arm');
  const measured = crossings.filter((c) => added.includes(c.row));
  compare(measured.map((c) => c.row), fixture.rows, 'intersection coverage');
  for (const c of measured) {
    const recorded = fixture.crossings.find((r) => r.id === c.id && r.rail === c.rail);
    if (!Array.isArray(c.point) || c.point.length !== 2) {
      problems.push(`intersection differs: a planar coordinate pair is required: ${c.row}`);
      continue;
    }
    const x = c.point[0] > c.W / 2 ? c.W - c.point[0] : c.point[0];
    if (!recorded || ![...c.point, c.CW, c.W, c.L].every(Number.isFinite)
      || c.edges.join('/') !== recorded.edges.join('/')
      || c.point.some((v, i) => Math.abs(v - recorded.point[i]) > 1e-9)
      || Math.abs(x + c.CW) > 1e-9) {
      problems.push(`intersection differs from the recording or kernel back line: ${c.row}`);
    }
    try {
      const { middle, midjawInputs } = c;
      const [c1u, c1v] = middle.c1, [a0] = middle.a1;
      const cutU = law.CN8_MID.DT09 - midjawInputs.allowance;
      const aT = law.cn8MidJawCutAngle(middle, cutU);
      const dTheta = (aT - a0) / midjawInputs.segments;
      const dv = c.CW + c1v;
      const uLaw = c1u + Math.sqrt(middle.r1 * middle.r1 - dv * dv);
      const [, crossingY] = c.point;
      const uMeasured = -Math.abs(crossingY - c.L * HALF);
      const delta = Math.abs(uMeasured - uLaw);
      // A segment's chord stays within its sagitta r1(1 - cos(dTheta/2)) of the
      // arc, measured along the radius. delta is read along the back line,
      // which the arc crosses at (uLaw - c1u, dv) from c1: the tangent there is
      // perpendicular to that radius, so its angle t to the line has
      // sin t = |uLaw - c1u| / r1. A radial gap s moves the crossing along the
      // line by s / sin t: sin, because the gap is normal to the arc, so the
      // shift is s at t = 90 deg and grows as the line grazes the arc (GH-1080:
      // t is 66.5 deg here; the radial bound held on main only by margin).
      const bound = middle.r1 * (UNIT - Math.cos(dTheta * HALF)) * middle.r1 / Math.abs(uLaw - c1u);
      const orderDeltaMm = Math.abs(Math.abs(uMeasured) * MM - fixture.order_window.centerMm);
      const orderWindowMm = fixture.order_window.halfWidthMm;
      if (![uLaw, uMeasured, delta, bound, orderDeltaMm, orderWindowMm].every(Number.isFinite)
        || delta > bound || orderDeltaMm > orderWindowMm) {
        problems.push(`live middle-jaw law differs: delta=${delta} bound=${bound}; ${c.row}`);
      }
      const key = `${c.id} rail${c.rail}`;
      if (!lawChecks.has(key) || delta > lawChecks.get(key).delta) {
        lawChecks.set(key, { id: c.id, rail: c.rail, uLaw, uMeasured, delta, bound, orderDeltaMm });
      }
    } catch (error) {
      problems.push(`live middle-jaw law unavailable: ${error.message}; ${c.row}`);
    }
  }
  return { problems, added, gone, lawChecks: [...lawChecks.values()] };
}
