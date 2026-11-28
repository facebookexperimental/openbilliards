// Copyright (c) Meta Platforms, Inc. and affiliates.

// loft-degenerate.mjs — the ONE definition of a degenerate cushion-loft triangle
// (issue #728): a triangle that carries no surface and must be skipped by every
// gate that reads loft faces, never booked as a face.
//
// A triangle (A, B, C) with vertices read as doubles from the f32 position
// array is degenerate iff:
//   'repeated'  — two of the three welded vertex keys are equal. The weld key
//                 is the position at WELD_DP = 7 decimals, verbatim from
//                 check-loft-manifold.mjs openEdges (base fa46bc7a :53/:62).
//   'zero-area' — the keys are distinct but the cross product (B−A)×(C−A) is
//                 exactly 0 in every component, verbatim from openEdges
//                 (base fa46bc7a :65).
//                 No epsilon: collinear slivers with distinct vertices were
//                 counted as faces and bridged T-junctions (review round 4
//                 on #672).
// Otherwise the triangle is a face (null).
//
// Derivation from the loft construction (web/scene/table.js): the collapse
// copies `ring[j] = ring[i]` (:2882) emit exact-position duplicates; the
// coincident-quad skip (:2948) and the skirt drop (:3024) decline to emit
// some degenerate quads; earcut ears triangulated over a contour carrying
// repeated points (:3034) contribute the rest. Measured on the fa46bc7a tree
// over the 10 catalog tables (58 lofts, unclipped cushionGeom output): 4576
// degenerate triangles, ALL exact-position duplicates — 0 weld-key duplicates
// with differing positions, 0 exact-zero-cross triangles with distinct keys,
// 0 degenerate triangles on any cap plane — so the weld key == the exact
// position on this tree and the check-cushion-profile rule-5 divergence is
// latent (its only proof is the plant arm).
//
// Readers: check-loft-manifold.mjs openEdges (degenerate skip) and its
// per-loft DEGENERATE census line; check-cushion-profile.mjs rule 5 (cap
// triangles skipped before the ny test) and its identical census line; the
// arms-728.sh cross-gate agreement arm compares those lines byte-for-byte.
// tools/render/lib/coplanar.mjs (:25/:55, `len === 0` skip) applies the same
// definition to live-scene triangles; it is a Chrome row and stays a
// separate reader.
//
// Pure geometry: no THREE import, no node APIs. The census duck-types the
// geometry (getAttribute('position').array, getIndex()?.array), so it runs on
// indexed and non-indexed geometries alike.

/** Weld-key decimals: positions that agree to 1e-7 m are one vertex. */
export const WELD_DP = 7;

/** Cap-plane half-thickness: |y − zCap| ≤ 1e-6 m reads as on the plane (the
 * rule-5 F32Z, shared so the census and the rule select the same triangles). */
export const CAP_PLANE_F32Z = 1e-6;

/** Weld key of vertex i in a flat [x0,y0,z0, x1,…] position array. */
export function weldKey(p, i) {
  return `${p[3 * i].toFixed(WELD_DP)},${p[3 * i + 1].toFixed(WELD_DP)},${p[3 * i + 2].toFixed(WELD_DP)}`;
}

/** 'repeated' | 'zero-area' | null for the triangle (a, b, c) over the flat
 * position array p — the pre-#728 openEdges tests (base fa46bc7a :62/:65), verbatim. */
export function isDegenerateTri(p, a, b, c) {
  const ka = weldKey(p, a), kb = weldKey(p, b), kc = weldKey(p, c);
  if (ka === kb || kb === kc || ka === kc) return 'repeated';
  const ux = p[3 * b] - p[3 * a], uy = p[3 * b + 1] - p[3 * a + 1], uz = p[3 * b + 2] - p[3 * a + 2];
  const vx = p[3 * c] - p[3 * a], vy = p[3 * c + 1] - p[3 * a + 1], vz = p[3 * c + 2] - p[3 * a + 2];
  if (uy * vz - uz * vy === 0 && uz * vx - ux * vz === 0 && ux * vy - uy * vx === 0) return 'zero-area';
  return null;
}

/** Per-loft census over the (unclipped) geometry: { repeated, zeroArea,
 * capPlane, capDegenerate, capRepeated, capZeroArea }. repeated/zeroArea split
 * the degenerate count by class; capPlane counts the triangles lying on the
 * cap plane y = zCap (all three vertices within CAP_PLANE_F32Z — the rule-5
 * selection, shared: rule 5 binds its F32Z to this constant); capDegenerate /
 * capRepeated / capZeroArea split the degenerate triangles among those by
 * class. The gates print repeated/zero-area/cap-plane as the DEGENERATE line
 * and use the cap splits in the plant arms (each definition branch gets its
 * own plant: index-reuse and weld-only feed `repeated`, collinear feeds
 * `zero-area`). */
export function degenerateCensus(geo, zCap) {
  const p = geo.getAttribute('position').array;
  const ix = geo.getIndex() ? geo.getIndex().array : null;
  const n = ix ? ix.length : p.length / 3;
  let repeated = 0, zeroArea = 0, capPlane = 0, capDegenerate = 0, capRepeated = 0, capZeroArea = 0;
  for (let k = 0; k < n; k += 3) {
    const a = ix ? ix[k] : k, b = ix ? ix[k + 1] : k + 1, c = ix ? ix[k + 2] : k + 2;
    const cls = isDegenerateTri(p, a, b, c);
    if (cls === 'repeated') repeated++;
    else if (cls === 'zero-area') zeroArea++;
    if (Math.abs(p[3 * a + 1] - zCap) <= CAP_PLANE_F32Z
      && Math.abs(p[3 * b + 1] - zCap) <= CAP_PLANE_F32Z
      && Math.abs(p[3 * c + 1] - zCap) <= CAP_PLANE_F32Z) {
      capPlane++;
      if (cls === 'repeated') { capDegenerate++; capRepeated++; }
      else if (cls === 'zero-area') { capDegenerate++; capZeroArea++; }
    }
  }
  return { repeated, zeroArea, capPlane, capDegenerate, capRepeated, capZeroArea };
}
