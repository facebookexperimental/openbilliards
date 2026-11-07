// Copyright (c) Meta Platforms, Inc. and affiliates.

// Shared by the profile gate and its pocket-scale plan overlay. Coordinates
// are kernel-plan metres; MM is the SI conversion already used by the gate.
export const MM = 1000;

// The gate's original STRICT crossing predicate: touching/collinear segments
// are not self-intersections. Keep this law identical in both instruments.
export const segInter = (a, b, c, d) => {
  const cr = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

/** Explicit line intersection, evaluated only after the strict segment test. */
export function intersectionPoint(a, b, c, d) {
  if (!segInter(a, b, c, d)) return null;
  const ab = [b[0] - a[0], b[1] - a[1]];
  const cd = [d[0] - c[0], d[1] - c[1]];
  const ac = [c[0] - a[0], c[1] - a[1]];
  const t = (ac[0] * cd[1] - ac[1] * cd[0]) / (ab[0] * cd[1] - ab[1] * cd[0]);
  return [a[0] + t * ab[0], a[1] + t * ab[1]];
}

/** Same edge order as rule 2; the gate reads the first, overlays read all. */
export function* ringCrossings(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const point = intersectionPoint(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]);
      if (point) yield { edges: [i, j], point };
    }
  }
}

/** Include both endpoints, including oBase when it is not a step multiple. */
export function* denseOffsets(oBase, step) {
  const last = Math.floor(oBase / step);
  if (!(step > 0) || !Number.isSafeInteger(last)) throw new Error('invalid or unrepresentable dense sweep step');
  for (let k = 0; k <= last; k++) yield k * step;
  if (last * step < oBase) yield oBase;
}
