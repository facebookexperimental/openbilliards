// Copyright (c) Meta Platforms, Inc. and affiliates.

// occ/capsule.js — the cue's shadow under the rectangular lamp, in closed form (CONTRACT.md section 4.2: clubCueShadow).
//
// The cue is a tapered capsule: axis A (tip, radius rA) -> B (butt, radius rB). From a receiver point P the silhouette of the
// tapered body is bounded by the two planes through P that touch both end spheres, so on the lamp plane (y = lamp height) the
// blocked lamp points lie between two straight lines. The blocked share of the lamp is the area of the lamp rectangle clipped by
// those two half-planes and by two end cuts, over the lamp area: one convex polygon clip (Sutherland-Hodgman, four half-planes)
// and a shoelace sum. No sampling, no noise, no banding. The two round caps are replaced by straight cuts across the projected
// axis, moved outward by pi/4 of the local half-width (a half disc and a strip of that depth have the same area).
//
// The two planes. With e1 = A - P and e2 = B - P, the unit normal n of a touching plane satisfies n.e1 = rA and n.e2 = rB.
// Write n = k ± a.m, m the unit normal of the plane (P, A, B) and k inside that plane: k = alpha.e1 + beta.e2 solves the 2x2
// Gram system, |k|² = alpha.rA + beta.rB, a = sqrt(1 - |k|²). A lamp point S is blocked when (k + a.m).(S - P) >= 0 and
// (k - a.m).(S - P) >= 0. A receiver inside the cone itself (|k| >= 1) keeps a small positive a: the wedge opens to a half-space.
//
// This file has NO imports: the node arm (web/tools/club/test-club-occ.mjs) runs cueShadow() against a brute-force ray test.
// CUE_SHADOW_GLSL is the same code line for line; change the two together.

/** Outward shift of the two end cuts, in local half-widths (a half disc and a w x (pi/4)w strip have the same area). */
export const CUE_CAP = 0.7853981633974483;
/** The part of the axis within this height of the receiver (or of the lamp plane) is ignored: it cannot stand between them. */
export const CUE_EPS_Y = 0.0015;

// keep the half-plane { nx*x + nz*z <= bound } of a convex polygon (at most 8 vertices in, at most 8 out)
function clipHalfPlane(poly, n, nx, nz, bound) {
  const out = [];
  if (n < 1) return out;
  let prev = poly[n - 1];
  let dPrev = bound - (nx * prev[0] + nz * prev[1]);
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const dCur = bound - (nx * cur[0] + nz * cur[1]);
    if (dCur >= 0) {
      if (dPrev < 0 && out.length < 8) { const t = dPrev / (dPrev - dCur); out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]); }
      if (out.length < 8) out.push(cur);
    } else if (dPrev >= 0 && out.length < 8) {
      const t = dPrev / (dPrev - dCur);
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
    }
    prev = cur; dPrev = dCur;
  }
  return out;
}

/**
 * Lamp visibility (0..1) at receiver p past the capsule a (radius ra) -> b (radius rb), for a horizontal rectangular lamp centred
 * at lp with half-extents lh = [half x, half z]. All points are [x, y, z] in world metres.
 */
export function cueShadow(p, a, b, ra, rb, lp, lh) {
  const lo = p[1] + CUE_EPS_Y, hi = lp[1] - CUE_EPS_Y;
  if (hi <= lo) return 1;
  // clip the axis to lo < y < hi
  let s0 = 0, s1 = 1;
  const dy = b[1] - a[1];
  if (Math.abs(dy) < 1e-9) {
    if (a[1] <= lo || a[1] >= hi) return 1;
  } else {
    const tLo = (lo - a[1]) / dy, tHi = (hi - a[1]) / dy;
    s0 = Math.max(0, Math.min(tLo, tHi));
    s1 = Math.min(1, Math.max(tLo, tHi));
    if (s1 <= s0) return 1;
  }
  const e1 = [a[0] + (b[0] - a[0]) * s0 - p[0], a[1] + dy * s0 - p[1], a[2] + (b[2] - a[2]) * s0 - p[2]];
  const e2 = [a[0] + (b[0] - a[0]) * s1 - p[0], a[1] + dy * s1 - p[1], a[2] + (b[2] - a[2]) * s1 - p[2]];
  const rA = ra + (rb - ra) * s0, rB = ra + (rb - ra) * s1;
  // m = e1 x e2 (normalised below), k = alpha.e1 + beta.e2
  let mx = e1[1] * e2[2] - e1[2] * e2[1], my = e1[2] * e2[0] - e1[0] * e2[2], mz = e1[0] * e2[1] - e1[1] * e2[0];
  const c2 = Math.max(mx * mx + my * my + mz * mz, 1e-16);
  const cInv = 1 / Math.sqrt(c2);
  mx *= cInv; my *= cInv; mz *= cInv;
  const g11 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2], g22 = e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2];
  const g12 = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2];
  const alpha = (rA * g22 - rB * g12) / c2, beta = (rB * g11 - rA * g12) / c2;
  const kx = alpha * e1[0] + beta * e2[0], ky = alpha * e1[1] + beta * e2[1], kz = alpha * e1[2] + beta * e2[2];
  const aa = Math.sqrt(Math.max(1 - (alpha * rA + beta * rB), 1e-4));
  const H = lp[1] - p[1];
  // lamp-plane coordinates are relative to the lamp centre; o = P in those coordinates
  const ox = p[0] - lp[0], oz = p[2] - lp[2];
  let poly = [[lh[0], lh[1]], [-lh[0], lh[1]], [-lh[0], -lh[1]], [lh[0], -lh[1]]];
  // the two touching planes: keep n.(S - P) >= 0, that is (-n_xz).S <= n_y.H - n_xz.o
  for (const sg of [1, -1]) {
    const nx = kx + sg * aa * mx, ny = ky + sg * aa * my, nz = kz + sg * aa * mz;
    poly = clipHalfPlane(poly, poly.length, -nx, -nz, ny * H - nx * ox - nz * oz);
  }
  // the end cuts, across the projected axis
  const tA = H / e1[1], tB = H / e2[1];
  const ax = ox + e1[0] * tA, az = oz + e1[2] * tA;
  const bx = ox + e2[0] * tB, bz = oz + e2[2] * tB;
  let dx = bx - ax, dz = bz - az;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 1e-6) { dx /= len; dz /= len; } else { dx = 1; dz = 0; }
  const wInv = CUE_CAP / (aa * Math.max(Math.sqrt(mx * mx + mz * mz), 1e-4));
  poly = clipHalfPlane(poly, poly.length, -dx, -dz, -(dx * ax + dz * az) + rA * tA * wInv);
  poly = clipHalfPlane(poly, poly.length, dx, dz, dx * bx + dz * bz + rB * tB * wInv);
  const n = poly.length;
  if (n < 3) return 1;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const q = poly[i], r = poly[(i + 1) % n];
    area += q[0] * r[1] - r[0] * q[1];
  }
  return 1 - Math.min(Math.abs(area) * 0.5 / (4 * lh[0] * lh[1]), 1);
}

/**
 * A conservative world rectangle [minX, minZ, maxX, maxZ] outside which the capsule shadows nothing at or above the plane
 * y = yRecv, for the lamps `lamps` = [{ pos: [x, y, z], half: [hx, hz] }]. Receivers outside it skip the whole evaluation.
 */
export function cueShadowBounds(a, b, ra, rb, lamps, yRecv) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  const add = (x, z, pad) => { minX = Math.min(minX, x - pad); maxX = Math.max(maxX, x + pad); minZ = Math.min(minZ, z - pad); maxZ = Math.max(maxZ, z + pad); };
  for (const [q, r] of [[a, ra], [b, rb]]) add(q[0], q[2], r);
  for (const lamp of lamps) {
    const ly = lamp.pos[1];
    for (const [q0, r] of [[a, ra], [b, rb]]) {
      // an end above the lamp plane cannot shadow: slide it down the axis to just under the lamp
      let q = q0;
      const top = ly - 0.05;
      if (q[1] > top) {
        const o = q0 === a ? b : a;
        if (o[1] >= top) continue;
        const s = (top - o[1]) / (q0[1] - o[1]);
        q = [o[0] + (q0[0] - o[0]) * s, top, o[2] + (q0[2] - o[2]) * s];
      }
      const h = Math.max(q[1] - yRecv, 0);
      const t = (ly - yRecv) / Math.max(ly - q[1], 0.05); // the projection scale from a lamp point down to the receiver plane
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const cx = lamp.pos[0] + sx * lamp.half[0], cz = lamp.pos[2] + sz * lamp.half[1];
        add(cx + (q[0] - cx) * t, cz + (q[2] - cz) * t, r * t + 0.002 + h * 0.02);
      }
    }
  }
  return [minX, minZ, maxX, maxZ];
}

/**
 * The GLSL twin of cueShadow(): `float clubCueShadowOne( vec3 p, vec3 a, vec3 b, float ra, float rb, vec3 lp, vec2 lh )`.
 * Needs GLSL ES 3.00 (local arrays, dynamic indices), which is what three r170 compiles.
 */
export const CUE_SHADOW_GLSL = /* glsl */`
int clubCueClip( inout vec2 poly[ 8 ], int n, vec2 nrm, float bound ) {
  vec2 q[ 8 ];
  int m = 0;
  if ( n < 1 ) return 0;
  vec2 prev = poly[ n - 1 ];
  float dPrev = bound - dot( nrm, prev );
  for ( int i = 0; i < 8; i ++ ) {
    if ( i >= n ) break;
    vec2 cur = poly[ i ];
    float dCur = bound - dot( nrm, cur );
    if ( dCur >= 0.0 ) {
      if ( dPrev < 0.0 && m < 8 ) { q[ m ] = mix( prev, cur, dPrev / ( dPrev - dCur ) ); m ++; }
      if ( m < 8 ) { q[ m ] = cur; m ++; }
    } else if ( dPrev >= 0.0 && m < 8 ) {
      q[ m ] = mix( prev, cur, dPrev / ( dPrev - dCur ) ); m ++;
    }
    prev = cur; dPrev = dCur;
  }
  for ( int i = 0; i < 8; i ++ ) poly[ i ] = q[ i ];
  return m;
}
float clubCueShadowOne( vec3 p, vec3 a, vec3 b, float ra, float rb, vec3 lp, vec2 lh ) {
  float lo = p.y + ${CUE_EPS_Y}, hi = lp.y - ${CUE_EPS_Y};
  if ( hi <= lo ) return 1.0;
  float s0 = 0.0, s1 = 1.0;
  float dy = b.y - a.y;
  if ( abs( dy ) < 1e-9 ) {
    if ( a.y <= lo || a.y >= hi ) return 1.0;
  } else {
    float tLo = ( lo - a.y ) / dy, tHi = ( hi - a.y ) / dy;
    s0 = max( 0.0, min( tLo, tHi ) );
    s1 = min( 1.0, max( tLo, tHi ) );
    if ( s1 <= s0 ) return 1.0;
  }
  vec3 e1 = mix( a, b, s0 ) - p;
  vec3 e2 = mix( a, b, s1 ) - p;
  float rA = mix( ra, rb, s0 ), rB = mix( ra, rb, s1 );
  vec3 m = cross( e1, e2 );
  float c2 = max( dot( m, m ), 1e-16 );
  m *= inversesqrt( c2 );
  float g11 = dot( e1, e1 ), g22 = dot( e2, e2 ), g12 = dot( e1, e2 );
  float alpha = ( rA * g22 - rB * g12 ) / c2, beta = ( rB * g11 - rA * g12 ) / c2;
  vec3 k = alpha * e1 + beta * e2;
  float aa = sqrt( max( 1.0 - ( alpha * rA + beta * rB ), 1e-4 ) );
  float H = lp.y - p.y;
  vec2 o = p.xz - lp.xz;
  vec2 poly[ 8 ];
  poly[ 0 ] = vec2( lh.x, lh.y ); poly[ 1 ] = vec2( - lh.x, lh.y ); poly[ 2 ] = vec2( - lh.x, - lh.y ); poly[ 3 ] = vec2( lh.x, - lh.y );
  poly[ 4 ] = vec2( 0.0 ); poly[ 5 ] = vec2( 0.0 ); poly[ 6 ] = vec2( 0.0 ); poly[ 7 ] = vec2( 0.0 );
  int n = 4;
  vec3 nP = k + aa * m, nM = k - aa * m;
  n = clubCueClip( poly, n, - nP.xz, nP.y * H - dot( nP.xz, o ) );
  n = clubCueClip( poly, n, - nM.xz, nM.y * H - dot( nM.xz, o ) );
  float tA = H / e1.y, tB = H / e2.y;
  vec2 A2 = o + e1.xz * tA;
  vec2 B2 = o + e2.xz * tB;
  vec2 d = B2 - A2;
  float len = length( d );
  d = len > 1e-6 ? d / len : vec2( 1.0, 0.0 );
  float wInv = ${CUE_CAP} / ( aa * max( length( m.xz ), 1e-4 ) );
  n = clubCueClip( poly, n, - d, - dot( d, A2 ) + rA * tA * wInv );
  n = clubCueClip( poly, n, d, dot( d, B2 ) + rB * tB * wInv );
  if ( n < 3 ) return 1.0;
  float area = 0.0;
  vec2 q = poly[ n - 1 ];
  for ( int i = 0; i < 8; i ++ ) {
    if ( i >= n ) break;
    vec2 r = poly[ i ];
    area += q.x * r.y - r.x * q.y;
    q = r;
  }
  return 1.0 - min( abs( area ) * 0.5 / ( 4.0 * lh.x * lh.y ), 1.0 );
}
`;
