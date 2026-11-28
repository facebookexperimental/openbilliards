// Copyright (c) Meta Platforms, Inc. and affiliates.

// furniture.js — V16, the FURNITURE CLEARANCE of a ball-return track (order 20, item 0).
//
// The chute of the XW101 track was derived from the side elevation without the table's furniture
// volume, and the first Chrome look (report §23.6) found a ball drawn at rest INSIDE the corner leg
// (`obSnkLeg`) with 174 of 412 stations within one ball radius of a table-body mesh. The rule the
// maintainer set: every station of every runway must clear every table-body mesh by at least one
// ball radius; a violation DISABLES the track for that table (fail-closed, the V13 shape) naming the
// offending meshes and the station spans. A ball inside a leg is worse than no ball.
//
// The test has two parts at every station (5 mm along each route), both against the ball CENTRE and
// both exact over the mesh's triangles in world space (the SDF form the ruling allows; at least as strict
// as e2e arm 13c's 26 sampled rays of length r, which a thin plate between two directions can slip past):
// (a) the SURFACE test — the closest distance from the centre to any triangle of a furniture mesh below r
// (the ball's surface crosses a face); (b) the INSIDE test — the generalised winding number of the mesh's
// triangles about the centre, |w| ≥ 0.5: a ball wholly inside a thick solid has no face within r of its
// centre and a surface test alone passes it (the first XW101 read named the leg only where the chute
// crossed its faces, not where the ball rested inside its capital); the winding number reads an open mesh
// (a lathe without caps) gracefully where a parity test would not (refuter C: a ray through a shared edge
// counts twice — no parity prefilter), and the sign, read through the world matrix's determinant, tells a solid (outward faces, +1) from a shell seen from inside (a sock, a room box, −1) while a mirrored solid still counts. An ENVIRONMENT — the room,
// a floor, a backdrop — is surface-tested and never "inside"; it is told from furniture by the mesh's own
// OPEN-SHELL property (drawn back-side only) or by the track's DECLARATION (`environmentMeshNames`, the V17
// companion), never by enclosure: a solid leg or support can hold every station of a single-pocket chute in
// its box as surely as a room does, and reading that as a container switched the inside test off and left the
// ball deep inside the solid with no face within r of its centre (#737 r8 class C — a 50 mm-margin solid box
// around the single-pocket high terminal fixture reported 76 checked stations clear). An UNDECLARED enclosing
// solid is a collision, and the enclosure is reported (`undeclaredEnclosing`) so the refusal can be read.
// The first ray-based cut of this module took 32 s on the
// snooker scene (the Raycaster over the net's triangles, 26 rays per station); the exact pass is one
// loop over each candidate mesh's triangles per station. Furniture = every visible Mesh in the scene
// except the track's own debug visual, the aim / cue overlays, the balls (SphereGeometry, the ball-set
// group, the meshes this module poses) and any mesh a caller excludes by name. A mesh far from a station
// is skipped by its world AABB expanded by r (cached per evaluation).
//
// Runs in the browser and in node (the table-in-node 'three' hook); nothing here touches the scene.
import { reachSpan, stationAt } from './track.js';
import { handoffFromSink, fallPieceOf, fallPointAt, DEFAULT_DROP_FAMILY } from './kinematics.js';

/** Sampling along each route: one station every 5 mm of D (arm 13c's spacing). */
export const V16_STEP = 0.005;
const EXCLUDE_NAME = /^(obBallReturnDebug|obAim|obCueStick)/;

/** A small non-cryptographic hash (FNV-1a, 32-bit) over a string. */
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** The furniture set of a scene: visible meshes, with the exclusions; each with its world AABB. */
export function furnitureOf(THREE, scene, { excludeGroup = null, excludeNames = EXCLUDE_NAME, hardwareNames = [], assembly = null } = {}) {
  const meshes = []; const hardware = []; const assemblyMeshes = [];
  if (!scene || typeof scene.traverse !== 'function') { meshes.hardware = hardware; meshes.assembly = assemblyMeshes; return meshes; }
  const hwSet = new Set(hardwareNames);
  const asmMatch = typeof assembly === 'function' ? assembly : () => null;
  scene.updateMatrixWorld?.(true);
  const skipped = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.isInstancedMesh) { skipped.push({ name: o.name || o.type, why: 'instanced (the instances are not expanded; the base geometry alone would be a phantom at the object origin — refuter C, D4)' }); return; }
    if (o.userData && o.userData.obReturnPosed) return;                     // a ball this module poses (balls are excluded by their GROUP, never by a sphere test: studs and bolts are spheres too — refuter B)
    for (let p = o; p; p = p.parent) {
      if (!p.visible) return;
      if (p === excludeGroup) return;                                       // the ball-set group
      if (excludeNames.test(p.name || '')) return;                          // the debug visual, the overlays
    }
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    // an unnamed mesh is named by its parent, its geometry and its world box (centre, size in mm) so a refusal names ONE solid
    const sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const mm = (v) => Math.round(v * 1000);
    const name = o.name || `${(o.parent && o.parent.name) || 'scene'}/${o.geometry.type}@(${mm(c.x)},${mm(c.y)},${mm(c.z)})[${mm(sz.x)}×${mm(sz.y)}×${mm(sz.z)}]`;
    if (hwSet.has(o.name)) { hardware.push({ mesh: o, name, bb }); return; }          // the track's OWN hardware (V17): measured apart, never table body
    const decl = asmMatch(o, bb);
    if (decl) { assemblyMeshes.push({ mesh: o, name, bb, decl }); return; }            // the table's POCKET ASSEMBLY (V18): passable on the entry segment only
    meshes.push({ mesh: o, name, bb });
  });
  meshes.skipped = skipped;
  meshes.hardware = hardware;
  meshes.assembly = assemblyMeshes;
  return meshes;
}

/** The cache key of a furniture set: name, geometry uuid, vertex count and the world matrix to 0.1 mm. */
export function furnitureHash(meshes) {
  const parts = [];
  for (const { mesh, name } of meshes) {
    const e = mesh.matrixWorld.elements;
    const pos = mesh.geometry.attributes?.position;
    parts.push(`${name}:${mesh.geometry.uuid}:${pos ? pos.count : 0}:${Array.from(e, (v) => Math.round(v * 1e4)).join(',')}`);
  }
  parts.sort();
  return `${meshes.length}-${fnv(parts.join('|'))}`;
}

/** World-space triangles of a mesh: Float64Array of 9 numbers per triangle (cached per evaluation by the caller). */
function trianglesOf(THREE, mesh) {
  const g = mesh.geometry; const pos = g.attributes?.position; if (!pos) return new Float64Array(0);
  const idx = g.index ? g.index.array : null; const n = idx ? idx.length : pos.count;
  const out = new Float64Array(n * 3); const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { const k = idx ? idx[i] : i; v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld); out[3 * i] = v.x; out[3 * i + 1] = v.y; out[3 * i + 2] = v.z; }
  return out;
}
/** The closest distance from p to one triangle (Ericson, Real-Time Collision Detection §5.1.5), squared. */
function triDist2(t, i, px, py, pz) {
  const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let qx, qy, qz;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
  else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz; const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + v * abx; qy = ay + v * aby; qz = az + v * abz; }
      else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz; const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + w * acx; qy = ay + w * acy; qz = az + w * acz; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); qx = bx + w * (cx - bx); qy = by + w * (cy - by); qz = bz + w * (cz - bz); }
            else { const denom = 1 / (va + vb + vc); const v = vb * denom, w = vc * denom; qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w; }
          }
        }
      }
    }
  }
  return (qx - px) ** 2 + (qy - py) ** 2 + (qz - pz) ** 2;
}
/** A uniform grid over a triangle soup (cell = `cell` metres): triangle indices per cell, keyed by integer cell coordinates
 * relative to the soup's minimum corner. Built once per mesh per evaluation; a query reads the 27 cells around a point. */
function buildGrid(tris, cell) {
  let minx = Infinity, miny = Infinity, minz = Infinity;
  for (let i = 0; i < tris.length; i += 3) { if (tris[i] < minx) minx = tris[i]; if (tris[i + 1] < miny) miny = tris[i + 1]; if (tris[i + 2] < minz) minz = tris[i + 2]; }
  const cells = new Map(); const K = 4096;
  const key = (ix, iy, iz) => (ix * K + iy) * K + iz;
  const n = tris.length / 9; const stamp = new Int32Array(n);
  for (let t = 0; t < n; t++) {
    const i = 9 * t;
    const x0 = Math.min(tris[i], tris[i + 3], tris[i + 6]), x1 = Math.max(tris[i], tris[i + 3], tris[i + 6]);
    const y0 = Math.min(tris[i + 1], tris[i + 4], tris[i + 7]), y1 = Math.max(tris[i + 1], tris[i + 4], tris[i + 7]);
    const z0 = Math.min(tris[i + 2], tris[i + 5], tris[i + 8]), z1 = Math.max(tris[i + 2], tris[i + 5], tris[i + 8]);
    const ix0 = Math.floor((x0 - minx) / cell), ix1 = Math.floor((x1 - minx) / cell), iy0 = Math.floor((y0 - miny) / cell), iy1 = Math.floor((y1 - miny) / cell), iz0 = Math.floor((z0 - minz) / cell), iz1 = Math.floor((z1 - minz) / cell);
    for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) { const k = key(ix, iy, iz); let a = cells.get(k); if (!a) { a = []; cells.set(k, a); } a.push(t); }
  }
  let stampGen = 0;
  /** Squared distance from p to the nearest triangle within one cell (≥ `cell`) of p, or Infinity. */
  const near2 = (px, py, pz) => {
    const cx = Math.floor((px - minx) / cell), cy = Math.floor((py - miny) / cell), cz = Math.floor((pz - minz) / cell);
    stampGen += 1; let best = Infinity;
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const a = cells.get(key(ix, iy, iz)); if (!a) continue;
      for (const t of a) { if (stamp[t] === stampGen) continue; stamp[t] = stampGen; const d2 = triDist2(tris, 9 * t, px, py, pz); if (d2 < best) best = d2; }
    }
    return best;
  };
  /** Parity of a +x ray from p against the soup (cells along the ray only): odd = a closed solid holds p; an open sheet can
   * give odd too — the caller confirms with the winding number, which it then computes for a few stations, not all. */
  const maxix = (() => { let mx = -Infinity; for (let i = 0; i < tris.length; i += 3) if (tris[i] > mx) mx = tris[i]; return Math.floor((mx - minx) / cell); })();
  const parityX = (px, py, pz) => {
    const cy = Math.floor((py - miny) / cell), cz = Math.floor((pz - minz) / cell); const cx0 = Math.floor((px - minx) / cell);
    stampGen += 1; let crossings = 0;
    for (let ix = cx0; ix <= maxix; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const a = cells.get(key(ix, iy, iz)); if (!a) continue;
      for (const t of a) {
        if (stamp[t] === stampGen) continue; stamp[t] = stampGen;
        const i = 9 * t;
        // Möller–Trumbore, ray (p, +x)
        const e1x = tris[i + 3] - tris[i], e1y = tris[i + 4] - tris[i + 1], e1z = tris[i + 5] - tris[i + 2];
        const e2x = tris[i + 6] - tris[i], e2y = tris[i + 7] - tris[i + 1], e2z = tris[i + 8] - tris[i + 2];
        // h = d × e2 with d = (1,0,0) → (0, -e2z, e2y); a = e1·h
        const det = -e1y * e2z + e1z * e2y; if (Math.abs(det) < 1e-18) continue;
        const inv = 1 / det; const sx = px - tris[i], sy = py - tris[i + 1], sz = pz - tris[i + 2];
        const u = (-sy * e2z + sz * e2y) * inv; if (u < 0 || u > 1) continue;
        // q = s × e1; v = d·q = (s × e1)x = sy*e1z - sz*e1y
        const v = (sy * e1z - sz * e1y) * inv; if (v < 0 || u + v > 1) continue;
        const tt = (e2x * (sy * e1z - sz * e1y) + e2y * (sz * e1x - sx * e1z) + e2z * (sx * e1y - sy * e1x)) * inv;
        if (tt > 1e-12) crossings += 1;
      }
    }
    return crossings & 1;
  };
  return { near2, parityX, cells: cells.size };
}
/** The generalised winding number of a triangle soup about p (Jacobson et al. 2013), signed: +1 inside a closed solid with
 * outward faces, 0 outside, −1 inside a shell seen from inside, fractional near an opening. */
function windingNumber(tris, px, py, pz) {
  let omega = 0;
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const ax = tris[i] - px, ay = tris[i + 1] - py, az = tris[i + 2] - pz;
    const bx = tris[i + 3] - px, by = tris[i + 4] - py, bz = tris[i + 5] - pz;
    const cx = tris[i + 6] - px, cy = tris[i + 7] - py, cz = tris[i + 8] - pz;
    const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
    if (la < 1e-12 || lb < 1e-12 || lc < 1e-12) continue;
    const num = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    const den = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (bx * cx + by * cy + bz * cz) * la + (cx * ax + cy * ay + cz * az) * lb;
    omega += 2 * Math.atan2(num, den);
  }
  return omega / (4 * Math.PI);
}
export const V16_INSIDE_W = 0.5;

/**
 * ONE point against ONE prepared mesh: the surface distance from the centre to the nearest triangle and the
 * generalised winding number about it (0 unless the mesh is read as a solid and the centre is inside its box).
 * The winding sign is read through the world matrix's determinant, so a mirrored solid still counts (refuter C, D2).
 * `null` when the centre is outside the mesh's grown box — nothing to ask. This is the single site both readers
 * of "is a ball inside this mesh" go through: the V16 station sweep below and `furnitureProbe`, the drawn-frame
 * probe (round 11 class A) that judges V16's own law. Lazily builds the mesh's triangles and grid on `f`.
 */
function meshRead(THREE, f, r, x, y, z, origin) {
  origin.set(x, y, z);
  if (!f.box.containsPoint(origin)) return null;
  if (!f.tris) { f.tris = trianglesOf(THREE, f.mesh); f.grid = buildGrid(f.tris, 2 * r); }
  const d = Math.sqrt(f.grid.near2(x, y, z));
  let w = 0;
  if (f.solid !== false && f.bb.containsPoint(origin)) { w = windingNumber(f.tris, x, y, z); f.wound = (f.wound ?? 0) + 1; if (f.det < 0) w = -w; }
  return { d, w };
}

/** A furniture mesh prepared for `meshRead`: its grown box, its class, and the sign of its world matrix. */
function prepare(THREE, f, r, { shell = false, declared = false } = {}) {
  return { ...f, box: f.bb.clone().expandByScalar(r), tris: null, grid: null, shell, declared, solid: !shell && !declared, det: f.mesh.matrixWorld.determinant() };
}

const cache = new Map(); // key → { material, result }: a hit is served only when the stored material equals the read's byte for byte
let evaluations = 0;
/** Real evaluations so far (the cache is a module-level Map keyed by the geometry key below + the furniture hashes). */
export function furnitureEvaluations() { return evaluations; }
export function clearFurnitureCache() { cache.clear(); }
/** HARNESS seam (#707 prep FIX6 B, node row r70c): the cache Map itself, so an arm can corrupt a stored entry's material and
 * expect the recompute — the design cache exposes the same through the controller facade (lifecycle L22f). */
export function furnitureCacheEntries() { return cache; }

/** A synchronous FNV-1a 64 over a string (hex, 16 chars): the geometry key's digest. Synchronous on purpose — an awaited
 * crypto.subtle digest would add a macrotask to every cache hit and move a late activation's join instant by a frame
 * (lifecycle L66 Door B pins that instant). */
export const geometryKeyHash = (text) => { let h = 0xcbf29ce484222325n; for (let i = 0; i < text.length; i++) { h ^= BigInt(text.charCodeAt(i)); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; } return h.toString(16).padStart(16, '0'); };
/** The GEOMETRY key material shared by BOTH caches — V19's design verdict in index.js and the V16 clearance below — one
 * builder, never two (#707 prep FIX6 B, review 707m6 P2-2): `table id | track id | radius | { the track definition BYTES, the
 * kernel cups, the visual falls }`, as `key` (the digest form) and `material` (the bytes themselves). A hit is served only
 * when the stored material equals the caller's byte for byte (FIX1 A1's rule — the maintainer ruling of 2026-09-18, lifecycle
 * L22f), so a same-id re-activation that fetched NEW track
 * JSON, or a table whose cups or falls moved, can never read an older verdict — before this the clearance cache was keyed on
 * table | track | radius | the furniture hashes alone and a re-fetched route returned the previous route's clearance. */
export function geometryKey({ tableId = '?', trackId = '?', r, def = null, cups = null, falls = null }) {
  const text = JSON.stringify({ def, cups, falls });
  const head = `${tableId}|${trackId}|${r}`;
  return { key: `${head}|${geometryKeyHash(text)}`, material: `${head}|${text}` };
}
/** A caller that passes no definition (the browser look instruments, the older node rows) is keyed on the built track OBJECT:
 * a per-object serial stands in for the bytes, so such a read is a hit only for the SAME object and never across tracks. */
const trackSerials = new WeakMap(); let trackSeq = 0;
const trackSerialOf = (t) => { let s = trackSerials.get(t); if (!s) { s = ++trackSeq; trackSerials.set(t, s); } return s; };
/** The V16 cache key + material: the geometry key above and the furniture components (the furniture hash, the track's own
 * hardware, the declared assembly, the declared environment names). */
function furnitureCacheParts({ tableId = '?', trackId = '?', r, def = null, cups = null, falls = null, furniture, environmentNames = null }) {
  const env = [...new Set(environmentNames ?? [])].sort().join(',');
  const tail = `${furnitureHash(furniture)}|hw:${furnitureHash(furniture.hardware ?? [])}|asm:${furnitureHash(furniture.assembly ?? [])}|env:${env}`;
  const geo = geometryKey({ tableId, trackId, r, def, cups, falls });
  return { key: `${geo.key}|${tail}`, material: `${geo.material}|${tail}` };
}
/** The V16 cache key — the ONE builder, used by the read below AND by any caller that has to decide whether the furniture it
 * is looking at is the furniture the current activation was cleared against. Round 8 added the `env` component here and left
 * the module's recheck comparing a hand-built string without it, so NO broadcast ever matched and every settings change (even
 * sound) tore the activation down: one builder, one string, both sides (#737 r9 class A). Since FIX6 B the key carries the
 * geometry (the track bytes, cups, falls) as well: a recheck passes the activation's own. */
export function furnitureCacheKey(args) { return furnitureCacheParts(args).key; }

/**
 * V16: every station of every route of `track` against the furniture of `scene`.
 * Returns { row: 'V16', evaluated, why?, key, stations, meshes, violations: [{ runway, D, s, mesh, distance, depth }],
 *           byMesh: [{ mesh, hits, worstDepth, spans: [{ runway, sMin, sMax, DMin, DMax }] }],
 *           entryClearance: [{ row: 'V20', route, runway, clear, required, deficit, firstContactD, mesh, stations, worstDepth }],
 *           entryReason, reason }.
 * `evaluated` is false (and nothing is a violation) when there is no scene or no 'three' — a headless host with no seam;
 * the caller states that in its report. `reason` is the refusal text when there are violations, else null — V20's
 * entry-clearance clause first (a definition whose entry has less than one ball diameter of clear runway above it, the
 * band the landing law seats an arriving ball in), then V16's own, each counting only the stations it owns.
 */
export async function furnitureClearance({ track, r, scene, tableId = '?', trackId = '?', excludeGroup = null, hardwareNames = null, environmentNames = null, assembly = null, step = V16_STEP, THREE: THREEin = null, def = null, pockets = null, falls = null } = {}) {
  if (!track || !(r > 0)) return { row: 'V16', evaluated: false, why: 'no track', violations: [], byMesh: [], reason: null };
  if (!scene) return { row: 'V16', evaluated: false, why: 'no scene', violations: [], byMesh: [], reason: null };
  let THREE = THREEin;
  if (!THREE) { try { THREE = await import('three'); } catch { return { row: 'V16', evaluated: false, why: 'no three', violations: [], byMesh: [], reason: null }; } }
  const hwNames = hardwareNames ?? track.hardwareMeshNames ?? [];
  const envNames = [...new Set(environmentNames ?? track.environmentMeshNames ?? [])];   // the declared environment (#737 r8 class C)
  const envSet = new Set(envNames);
  const furniture = furnitureOf(THREE, scene, { excludeGroup, hardwareNames: hwNames, assembly });
  const defBytes = def ?? { builtTrackObject: trackSerialOf(track) };            // no definition passed: keyed on the built track object (never across tracks)
  const { key, material } = furnitureCacheParts({ tableId, trackId, r, def: defBytes, cups: pockets, falls, furniture, environmentNames: envNames });
  const hit = cache.get(key);
  if (hit && hit.material === material) return { ...hit.result, cached: true }; // served only when the stored MATERIAL equals this read's byte for byte (FIX6 B, FIX1 A1's rule; a 64-bit collision costs one recompute, never a stale verdict)
  evaluations += 1;

  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const origin = new THREE.Vector3();
  const routes = [...(track.routes?.values?.() ?? [])];
  if (track.trayRoute && !routes.includes(track.trayRoute)) routes.push(track.trayRoute);
  const tmp = {};
  // every station first (the containers are told from the furniture by the box that holds them all)
  const all = [];
  const allBox = new THREE.Box3();
  const fallArcs = [];                                                          // the visible falls swept (FIX4 A)
  for (const route of routes) {
    const rid = route.pocket ?? route.id ?? '?';
    // EVERY position the kinematics can DRAW a ball at, from the route's own reachable span
    // (track.js reachSpan — the one function poseAt draws by, so the scanned set IS the drawable set;
    // order 23b round 11 class A). CONTINUOUS from the span's top down to the wall: below the entry a
    // ball rolls through every D, and above it — round 10 class B read this span as DISCRETE, which was
    // wrong — a ball seated behind a MOVING tail rolls down through every station between two seats.
    // Sweeping only to the entry cleared a furniture box through the upstream ball of a full queue and
    // then, on the generic bed, through a ball rolling 15.3 mm inside the apron 65 mm above the entry.
    const { top } = reachSpan(route, r);
    // above the entry the scan applies the SAME exit-line test poseAt applies to the pose it draws, so the
    // two readers agree position by position: a station the pocket hides is not a position a ball is ever
    // seen at, and asking the furniture about it is what made round 10's first cut refuse a shipped fixture.
    const hidden = (st) => Number.isFinite(route.exitY) && st.y + r > route.exitY;
    const at = (Dq) => { const st = stationAt(route, Dq, r, tmp); return { D: Dq, x: st.x, y: st.y, z: st.z, hid: hidden(st) }; };
    const keep = (p) => { all.push({ route, rid, D: p.D, x: p.x, y: p.y, z: p.z }); allBox.expandByPoint(origin.set(p.x, p.y, p.z)); };
    // the band above the entry, on the SAME grid anchored at the entry (so no station of the pre-round-11
    // sweep moves — the entry segment and the hardware read the same D's they always did), the top itself
    // exactly (the runway top, one ball length above the entry, the station r59 names), and — wherever the
    // exit line cuts the band — the CROSSING itself. That last one is not a nicety: the highest D the module
    // still draws sits at an arbitrary point between two grid stations, it is the most exposed position on
    // the whole route, and the grid alone leaves the scan up to a FULL step short of it (measured: 2.757 mm
    // on TEST-terminal-chutes-high, against the half step the grid otherwise guarantees).
    let prev = at(route.total);                                  // the entry is drawn by definition: the test reads D > total
    const walk = (p) => {
      if (p.hid !== prev.hid) {                                  // bisect the crossing, keep its drawn side
        let lo = prev.hid ? p.D : prev.D, hi = prev.hid ? prev.D : p.D;
        for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (at(mid).hid) hi = mid; else lo = mid; }
        keep(at(lo));
      }
      if (!p.hid) keep(p);
      prev = p;
    };
    for (let D = route.total + step; D <= top - 1e-9; D += step) walk(at(D));
    if (top > route.total + 1e-9) walk(at(top));
    for (let D = route.total; D >= -1e-9; D -= step) { const st = stationAt(route, Math.max(0, D), r, tmp); keep({ D: Math.max(0, D), x: st.x, y: st.y, z: st.z }); }
    // (#707 prep FIX4 A, review 707m4 P2-1) the VISIBLE FALL: poseAt draws a ballistic descent from the hand-off (the fall centre
    // at the shield height) to the entry that is not on the rolling path at all — furniture standing in that descent but clear
    // of the runway was approved and the drawn ball went through it (a 5 mm box on the synthetic fixture: 0 violations, 5.36 mm
    // penetration). The sweep now samples that descent through kinematics.js fallPointAt — the ONE fall law poseAt draws,
    // over the ONE fall piece solveShot builds (fallPieceOf) — from the first drawn instant (the ball's top at the exit line,
    // as poseAt culls above it) to the landing, at this sweep's own step, for the canonical LEGACY hand-off of the pocket
    // (the arc every legacy host draws) and for the slowest start (vDown 0, the early-ownership bound): every pivot capture's
    // arc lies between the two, and the r-sphere test at both brackets it. The arc needs the pocket's cups and visual falls
    // (the built track keeps neither): a caller that gives none gets NO fall sweep and the facade says so (`fallSwept: false`)
    // — the controller always passes them and refuses when the sweep could not run.
    if (Number.isInteger(route.pocket) && Array.isArray(pockets) && pockets[route.pocket]) {
      const cup = pockets[route.pocket]; const fallDisc = (Array.isArray(falls) && falls[route.pocket]) ? falls[route.pocket] : cup;
      const h = handoffFromSink({ t: 0, pocket: cup, fall: fallDisc, r, tFall: DEFAULT_DROP_FAMILY.tFall, glide: DEFAULT_DROP_FAMILY.glide }, { track, pockets, r });
      if (h && h.route === route) {
        const dy = h.yH - h.yE;
        const arcs = [['legacy', fallPieceOf(h, r, route)], ['rest', fallPieceOf({ ...h, vDown: 0, tLand: h.tH + (dy > 0 ? Math.sqrt(2 * dy / 9.8) : 0) }, r, route)]];
        for (const [arc, piece] of arcs) {
          const T = piece.t1 - piece.t0; if (!(T > 0)) continue;
          const drawnAt = (tau) => fallPointAt(piece, tau, tmp).y + r <= piece.exitY + 1e-9;
          if (!drawnAt(T)) continue;                                        // the whole descent is culled inside the assembly: nothing drawn, nothing to sweep
          let lo = 0, hi = T; if (drawnAt(0)) hi = 0; else for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (drawnAt(mid)) hi = mid; else lo = mid; }
          const tShow = hi;
          // the fine walk, then the sweep's step along the arc (chord ≤ step): the points ARE fallPointAt's values
          const N = 400; let last = null, acc = 0, n = 0;
          for (let i = 0; i <= N; i++) {
            const tau = tShow + (T - tShow) * (i / N); const q = fallPointAt(piece, tau, {});
            if (last) acc += Math.hypot(q.x - last.x, q.y - last.y, q.z - last.z);
            if (!last || acc >= step - 1e-9 || i === N) { all.push({ route, rid, D: route.total + acc + (arc === 'rest' ? 1e-7 : 0), x: q.x, y: q.y, z: q.z, fall: { arc, tau, pocket: route.pocket } }); allBox.expandByPoint(origin.set(q.x, q.y, q.z)); if (last) acc = 0; n += 1; }
            last = q;
          }
          fallArcs.push({ route: rid, pocket: route.pocket, arc, tShow, T, stations: n, x0: h.x0, z0: h.z0, yH: h.yH, xE: h.xE, yE: h.yE, zE: h.zE, vDown: piece.vDown });
        }
      }
    }
  }
  const BackSide = THREE.BackSide;
  const grown = furniture.map((f) => {
    const mats = Array.isArray(f.mesh.material) ? f.mesh.material : [f.mesh.material];
    const shell = mats.every((m) => m && m.side === BackSide);           // drawn from inside only: a room, a sky
    const declared = envSet.has(f.mesh.name);                              // named by the track as an environment (the V17 companion)
    const enclosing = f.bb.containsBox(allBox);                            // holds every station in its box — REPORTED, never the class itself
    return { ...prepare(THREE, f, r, { shell, declared }), enclosing };
  });
  // an enclosing mesh that is neither an open shell nor declared: read as the solid it is (the class C defect), named in the read
  const undeclaredEnclosing = grown.filter((f) => f.enclosing && f.solid).map((f) => f.name);
  const violations = [];
  const culled = [];                                                        // hits where the module never draws the ball (inside the assembly above the exit line)
  const aboveByRoute = new Map();                                           // route -> the drawn violations ABOVE its entry (V20's band)
  const stations = all.length;
  // the table's declared pocket assembly (V18): passable from the capture point to the first station whose sphere is clear of
  // every declared assembly mesh — measured per route — and furniture again beyond it
  const asm = (furniture.assembly ?? []).map((f) => { const g = prepare(THREE, f, r); g.solid = undefined; return g; });   // an assembly mesh is read solid-or-not by its own winding, never classed
  const assemblyPass = [];                                                  // hits inside the entry segment (reported, not violations)
  const entrySegments = [];                                                 // per route: where the entry segment ends
  const probe = (f, st) => meshRead(THREE, f, r, st.x, st.y, st.z, origin);  // { d, w } of a station against one mesh (surface + inside)
  // (#707 prep FIX1 A2, review 707m1 P2-2) the entry segment's END is decided DOWNSTREAM from the capture point, over the whole
  // route, BEFORE any station is classified. A route's stations are listed upstream band first (D > total: the drawn positions
  // above the entry) and then the sweep from the entry down to the wall (D = total … 0, descending). The old walk closed the
  // segment at its FIRST clear station in LIST order, so an upstream sample outside the declared cup closed it before the sweep
  // had reached the entry, and the cup counted as furniture when the scan came back down through it (11 false violations on
  // TEST-terminal-chutes with a 50 mm declared cup at pocket 4's entry). Now every station's assembly hit is read once; per
  // route the first CLEAR station at or below the entry (descending D) closes the segment; every station above that D — the
  // upstream band included — is inside it (an assembly hit there is a pass); a route the assembly never clears is passable whole.
  // The upstream band is still judged against FURNITURE exactly as before (V20's band reads it).
  // …and both passes run PER ROUTE inside that route's task (review of FIX1: a table-wide pre-pass before the first breath would
  // put every route's assembly reads into one synchronous slice — the block class A1 removed from V19). The verdict bytes are
  // the same: a route's entry end depends on that route's stations only.
  const asmHitAt = new Array(all.length).fill(null);
  const entryEnd = new Map();                                               // route → { DEnd, sEnd, runway, wholeRoute }
  const blocks = [];                                                        // [start, end) index ranges of `all`, one per route, in list order
  for (let i = 0; i < all.length; i++) { if (!blocks.length || all[blocks[blocks.length - 1][0]].route !== all[i].route) blocks.push([i, i + 1]); else blocks[blocks.length - 1][1] = i + 1; }
  const prepassRoute = (b0, b1) => {
    if (!asm.length) return;
    for (let i = b0; i < b1; i++) {
      const st = all[i]; origin.set(st.x, st.y, st.z);
      let best = null;
      for (const f of asm) {
        const pw = probe(f, st); if (!pw) continue;
        const hit = pw.d < r - 1e-6 || pw.w >= V16_INSIDE_W;
        if (hit && (!best || pw.d < best.d)) best = { name: f.name, d: pw.d, inside: pw.w >= V16_INSIDE_W, decl: f.decl };
      }
      asmHitAt[i] = best;
    }
    const st0 = all[b0]; let close = null;
    for (let j = b0; j < b1; j++) { const q = all[j]; if (q.D > q.route.total + 1e-9) continue; if (!asmHitAt[j]) { close = q; break; } }
    const loc = close && st0.route.segs ? locateS(st0.route, close.D) : null;
    const wallRw = st0.route.segs ? locateS(st0.route, 0).rw : '?';         // a route the assembly never clears reports its wall runway (as before)
    const seg = close ? { DEnd: close.D, sEnd: loc ? loc.s : null, runway: loc ? loc.rw : '?', wholeRoute: false } : { DEnd: 0, sEnd: null, runway: wallRw, wholeRoute: true };
    entryEnd.set(st0.route, seg); entrySegments.push({ route: st0.rid, ...seg });
  };
  for (const [b0, b1] of blocks) {
    await new Promise((res) => setTimeout(res, 0));                          // one route per task: the frame loop breathes between them
    prepassRoute(b0, b1);
    for (let i = b0; i < b1; i++) {
    const st = all[i];
    origin.set(st.x, st.y, st.z);
    const asmHit = asmHitAt[i];                                              // the assembly read of this station (the pre-pass above)
    const seg = entryEnd.get(st.route);
    const inEntry = !!seg && (seg.wholeRoute || st.D > seg.DEnd + 1e-12);       // inside the entry segment: an assembly hit is a pass
    if (inEntry && asmHit) { const loc = st.route.segs ? locateS(st.route, st.D) : null; assemblyPass.push({ runway: loc ? loc.rw : st.rid, route: st.rid, D: st.D, s: loc ? loc.s : null, mesh: asmHit.name, id: asmHit.decl.id, kind: asmHit.decl.kind, inside: asmHit.inside, distance: asmHit.d }); }
    let surf = null, inside = null;
    if (!inEntry && asmHit) { surf = { name: asmHit.name, d: asmHit.d, assembly: true }; if (asmHit.inside) inside = { name: asmHit.name, w: 1, d: asmHit.d, assembly: true }; } // beyond the entry segment the assembly is furniture again
    for (const f of grown) {
      const tA = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      // the surface distance (exact within one cell (2r) of the centre — r away is all the rule asks) and the inside
      // test, solids only, wherever the centre lies inside the mesh's own box: the winding number over every triangle —
      // refuter C refuted a +x-ray parity prefilter (a ray through a shared edge or vertex counts twice, 10 of 24
      // cylinders and 3 of 24 boxes missed; duplicated faces count even). Read even where a face is within r: a station
      // inside the post AND touching the mould is the post's (attribution), the mould in `also`. The SIGN is kept (an
      // open tube or a sock seen from inside reads w < 0 — the net skirt around a chute's entry gives −0.6 to −0.9 with
      // the ball's centre in its air, not its cloth — and a room box −1); a solid MIRRORED by a negative world scale has
      // its winding flipped by the mirror, so `meshRead` reads the sign through the matrix determinant (refuter C, D2).
      // An inside-out export (det > 0, inward faces) would still read as a shell: latent, named.
      const pw = meshRead(THREE, f, r, st.x, st.y, st.z, origin);
      f.ms = (f.ms ?? 0) + ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tA); f.asked = (f.asked ?? 0) + (pw ? 1 : 0);
      if (!pw) continue;
      if (pw.d < r - 1e-6 && (!surf || pw.d < surf.d)) surf = { name: f.name, d: pw.d };   // touching at exactly r is clear (refuter B, h)
      if (pw.w >= V16_INSIDE_W && (!inside || pw.w > inside.w)) inside = { name: f.name, w: pw.w, d: Number.isFinite(pw.d) ? pw.d : 0 };
    }
    if (surf || inside) {
      const loc = st.route.segs ? locateS(st.route, st.D) : null;
      // the module draws the ball here iff its top is at or below the route's exit line; above it the ball is culled inside the
      // pocket assembly by the module's own visibility law and is never shown — a hit there is REPORTED (the assembly the
      // definition claims to pass through: cup, bag, net) and is not a violation (refuter B's defect 2: a chute begins under the
      // ring inside the bag by construction). What the exit line itself must be — below the lowest solid — is the schema's
      // exit_below_y premise; a drawn station inside furniture is this row's.
      const drawn = st.y + r <= (Number.isFinite(st.route.exitY) ? st.route.exitY : Infinity) + 1e-9;
      const rec = { runway: loc ? loc.rw : st.rid, route: st.rid, D: st.D, s: loc ? loc.s : null, drawn,
        mesh: inside ? inside.name : surf.name, inside: !!inside, w: inside ? inside.w : 0, assemblyBeyondEntry: !!((inside && inside.assembly) || (!inside && surf && surf.assembly)),
        distance: inside ? inside.d : surf.d, depth: inside ? r + inside.d : r - surf.d,        // wholly inside: the radius plus the way to the nearest face
        also: surf && inside && surf.name !== inside.name ? surf.name : null };
      (drawn ? violations : culled).push(rec);
      // above the entry the same hit is also the ENTRY-CLEARANCE row's (V20): the runway is the definition's, not the run's
      if (st.fall) { rec.fall = { arc: st.fall.arc, tau: st.fall.tau, pocket: st.fall.pocket }; rec.runway = `fall→pocket ${st.fall.pocket}`; rec.s = null; } // the visible fall: a V16 violation by name, not the runway's entry band (V20)
      else if (drawn && st.D > st.route.total + 1e-9) { const arr = aboveByRoute.get(st.route) ?? []; arr.push(rec); aboveByRoute.set(st.route, arr); }
    }
    }
  }
  // the track's own hardware, measured apart (V17): the closest approach of the ball's centre over every station — the ball rides
  // its wires (d = r by the seat law) and passes through its ring; a d below r by more than the export grain says the built
  // hardware and the schema's seat disagree (reported, never a refusal: the hardware is the track's own)
  const ownHardware = (furniture.hardware ?? []).map((f) => {
    const tris = trianglesOf(THREE, f.mesh); const grid = buildGrid(tris, 2 * r); const box = f.bb.clone().expandByScalar(r);
    let dMin = Infinity, at = null, below = 0;
    for (const st of all) { origin.set(st.x, st.y, st.z); if (!box.containsPoint(origin)) continue; const d = Math.sqrt(grid.near2(st.x, st.y, st.z)); if (d < dMin) { dMin = d; at = { runway: st.rid, D: st.D }; } if (d < r - 1e-4) below += 1; }
    return { mesh: f.name, triangles: tris.length / 9, dMin, at, stationsBelowR: below };
  });
  // one grouping, asked twice: over every violation (the record the callers read) and — when the entry-clearance row
  // owns some of them — over the REST, so the two refusals never count the same station twice (V20 below)
  const group = (list) => {
    const byMeshMap = new Map();
    for (const v of list) {
      const m = byMeshMap.get(v.mesh) ?? { mesh: v.mesh, hits: 0, inside: 0, drawn: 0, culledHits: 0, assemblyBeyondEntry: 0, worstDepth: 0, spans: new Map() };
      m.hits += 1; if (v.inside) m.inside += 1; if (v.drawn) m.drawn += 1; if (v.assemblyBeyondEntry) m.assemblyBeyondEntry += 1; if (v.depth > m.worstDepth) m.worstDepth = v.depth;
      const k = String(v.runway);
      const sp = m.spans.get(k) ?? { runway: v.runway, sMin: Infinity, sMax: -Infinity, DMin: Infinity, DMax: -Infinity };
      if (v.s !== null) { sp.sMin = Math.min(sp.sMin, v.s); sp.sMax = Math.max(sp.sMax, v.s); }
      sp.DMin = Math.min(sp.DMin, v.D); sp.DMax = Math.max(sp.DMax, v.D);
      m.spans.set(k, sp);
      byMeshMap.set(v.mesh, m);
    }
    return byMeshMap;
  };
  const fallHits = violations.filter((v) => v.fall);                          // the visible-fall hits (FIX4 A): named in the reason, counted on the facade
  const byMeshMap = group(violations);
  const assemblyMap = new Map();
  for (const v of culled) { const m = assemblyMap.get(v.mesh) ?? { mesh: v.mesh, hits: 0, inside: 0, worstDepth: 0, sMin: Infinity, sMax: -Infinity }; m.hits += 1; if (v.inside) m.inside += 1; if (v.depth > m.worstDepth) m.worstDepth = v.depth; if (v.s !== null) { m.sMin = Math.min(m.sMin, v.s); m.sMax = Math.max(m.sMax, v.s); } assemblyMap.set(v.mesh, m); }
  const culledByMesh = [...assemblyMap.values()].sort((a, b) => b.hits - a.hits);
  const byMesh = [...byMeshMap.values()].map((m) => ({ ...m, spans: [...m.spans.values()] })).sort((a, b) => b.inside - a.inside || b.worstDepth - a.worstDepth || b.hits - a.hits);
  const mm = (x) => (x * 1000).toFixed(1);
  const mm2 = (x) => (x * 1000).toFixed(2);   // the entry-clearance row states millimetres a definition acts on: two places
  // ---- V20: the ENTRY-CLEARANCE row (order BR-737-FIX10 ruling (c)) ------------------------------------------
  // The landing law seats an arriving ball up to ONE BALL DIAMETER above the entry (track.js seatUpstream =
  // route.total + 2r, the bound `seatFor` already enforces against a resting tail), so those 2r are part of the
  // definition's own geometry, as much as the run below them. A definition whose entry has less than 2r of clear
  // runway is refused HERE, at definition time, by name — with the mesh that stands in the band and the deficit —
  // instead of being left for a reader to find later as a ball drawn inside the table. Three fixtures shipped with
  // 50.0 mm of the 57.15 (#737 r11's finding); this is the rule that stops the next one. Two hits stay plain V16's:
  // a violation at or BELOW the entry (a leg across the run is a different defect, and moving the entry cannot cure
  // it) and an assembly hit beyond the entry segment (that mesh is the pocket's, not the runway's).
  const entryRows = [];
  const entryOwned = new Set();
  for (const [route, vs] of aboveByRoute) {
    const own = vs.filter((v) => !v.assemblyBeyondEntry);
    if (!own.length) continue;
    for (const v of own) entryOwned.add(v);
    const lowest = own.reduce((a, b) => (b.D < a.D ? b : a));
    // the FIRST contact, bisected: the sweep's grid reports the band's foot only to a step, and the number this
    // refusal states is the definition's deficit — the same 60-iteration bisection the visibility crossing uses.
    const hitAt = (D) => {
      const st = stationAt(route, D, r, tmp);
      if (Number.isFinite(route.exitY) && st.y + r > route.exitY) return null;   // not drawn there: not this row's
      let near = null;
      for (const f of grown) {
        const pw = meshRead(THREE, f, r, st.x, st.y, st.z, origin);
        if (!pw) continue;
        if (pw.w >= V16_INSIDE_W) return { mesh: f.name, inside: true, d: pw.d };
        if (pw.d < r - 1e-6 && (!near || pw.d < near.d)) near = { mesh: f.name, inside: false, d: pw.d };
      }
      return near;
    };
    // the bracket: the highest scanned station of this route BELOW the lowest violating one (clear by construction —
    // any grown-mesh hit between them would have been the lowest) and the violating station itself
    let lo = route.total;
    for (const st2 of all) { if (st2.route === route && st2.D < lowest.D - 1e-12 && st2.D > lo) lo = st2.D; }
    let hi = lowest.D;
    if (hitAt(route.total)) { lo = route.total; hi = route.total; }              // the entry itself is in it: no runway at all
    else for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (hitAt(mid)) hi = mid; else lo = mid; }
    const clear = Math.max(0, hi - route.total);
    const at = hitAt(hi) ?? { mesh: lowest.mesh, inside: lowest.inside };
    entryRows.push({ row: 'V20', route: lowest.route, runway: lowest.runway, clear, required: 2 * r, deficit: 2 * r - clear,
      firstContactD: hi, mesh: at.mesh, inside: !!at.inside, stations: own.length, worstDepth: Math.max(...own.map((v) => v.depth)),
      meshes: [...new Set(own.map((v) => v.mesh))] });
  }
  const entryReason = entryRows.length
    ? `ball-return track refused [V20]: ` + entryRows.map((e) => `the entry of route ${e.route} (runway ${e.runway}) has ${mm2(e.clear)} mm of clear runway above it, ${mm2(e.deficit)} mm short of the one ball diameter (${mm2(e.required)} mm) the landing law seats an arriving ball in — ${e.mesh} stands in that band from ${mm2(e.clear)} mm above the entry (${e.stations} drawn station${e.stations > 1 ? 's' : ''} inside it, worst ${mm2(e.worstDepth)} mm${e.meshes.length > 1 ? `; also ${e.meshes.filter((n) => n !== e.mesh).join(', ')}` : ''})`).join('; ')
      + ` — the runway above the entry is the definition's own geometry (track.js seatUpstream): move the entry along its own route until this row reports the full diameter clear`
    : null;
  const plain = violations.filter((v) => !entryOwned.has(v));
  const plainByMesh = entryRows.length ? [...group(plain).values()].map((m) => ({ ...m, spans: [...m.spans.values()] })).sort((a, b) => b.inside - a.inside || b.worstDepth - a.worstDepth || b.hits - a.hits) : byMesh;
  const v16Reason = plain.length
    ? `ball-return track refused [V16]: ${plain.length} of ${stations} drawn stations within one ball radius of the table body${culled.length ? ` (+ ${culled.length} culled inside the pocket assembly above the exit line, reported, not counted)` : ''} — ` +
      plainByMesh.map((m) => `${m.mesh} (${m.spans.map((sp) => `${sp.runway} ${Number.isFinite(sp.sMin) ? `s ${mm(sp.sMin)}–${mm(sp.sMax)} mm` : `D ${mm(sp.DMin)}–${mm(sp.DMax)} mm`}`).join('; ')}${m.inside ? `, ${m.inside} station${m.inside > 1 ? 's' : ''} wholly inside` : ''}${m.assemblyBeyondEntry ? `, a declared assembly mesh BEYOND the entry segment` : ''}, worst ${mm(m.worstDepth)} mm inside)`).join(', ') +
      (fallHits.length ? ` [${fallHits.length} of them on the VISIBLE FALL into ${[...new Set(fallHits.map((v) => `pocket ${v.fall.pocket}`))].join(', ')} — t +${(Math.min(...fallHits.map((v) => v.fall.tau)) * 1e3).toFixed(0)}–${(Math.max(...fallHits.map((v) => v.fall.tau)) * 1e3).toFixed(0)} ms after the hand-off, worst depth ${mm2(Math.max(...fallHits.map((v) => v.depth)))} mm: the descent poseAt draws from the pocket to the entry, not the runway]` : '') +
      (assemblyPass.length ? ` [the entry segments passed ${assemblyPass.length} declared assembly stations: ${entrySegments.map((e) => `${e.route} ${e.wholeRoute ? 'the whole route' : `to s ${e.sEnd !== null ? mm(e.sEnd) : '?'} mm`}`).join('; ')}]` : '')
      // an enclosing solid that named itself neither an open shell nor a declared environment is furniture: say so, so the
      // reader knows why a mesh holding every station was not taken for the room (#737 r8 class C)
      + (undeclaredEnclosing.some((n) => byMeshMap.has(n)) ? ` [${undeclaredEnclosing.filter((n) => byMeshMap.has(n)).join(', ')} holds every station of the track in its box and is neither drawn back-side only nor declared as an environment by this track: enclosure is not a class]` : '')
    : null;
  // both rows read the same sweep, and each counts only what it owns: the entry-clearance refusal leads (it is the
  // one a definition can act on), the run's own violations follow
  const reason = entryReason ? (v16Reason ? `${entryReason}. ALSO on the same read, below the entry: ${v16Reason}` : entryReason) : v16Reason;
  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  const cost = grown.filter((f) => f.asked).map((f) => ({ mesh: f.name, triangles: f.tris ? f.tris.length / 9 : 0, stationsAsked: f.asked, wound: f.wound ?? 0, ms: +f.ms.toFixed(1) })).sort((a, b) => b.ms - a.ms).slice(0, 12);
  const drawnViolations = violations.length;
  const out = { row: 'V16', evaluated: true, key, stations, meshes: furniture.length, fallSwept: fallArcs.length > 0, fallArcs, fallStations: all.filter((q) => q.fall).length, fallViolations: fallHits.length, skipped: furniture.skipped ?? [], hardwareNames: hwNames, environmentNames: envNames, environmentDeclared: grown.filter((f) => f.declared).map((f) => f.name), openShells: grown.filter((f) => f.shell).map((f) => f.name), undeclaredEnclosing, ownHardware, assemblyDeclared: (furniture.assembly ?? []).map((f) => ({ mesh: f.name, id: f.decl.id, kind: f.decl.kind, solidSimplification: f.decl.solidSimplification })), assemblyPass, entrySegments, violations, drawnViolations, culled, culledByMesh, byMesh, entryClearance: entryRows, entryReason, reason, ms, cost, cached: false };
  cache.set(key, { material, result: out });
  return out;
}

/**
 * The DRAWN-FRAME PROBE (order 23b round 11, arm r61): the same furniture read as V16, asked about an arbitrary
 * world point instead of a route station. V16 is a TOOL — it answers "is every position the module can draw a ball
 * at clear of the furniture"; this answers "is THIS ball, at the centre the module actually drew it at this frame,
 * inside the furniture", which is the law itself. Their disagreement is the whole of round 11 class A: V16 scanned
 * the fixed seats while `poseAt` drew a ball rolling through the band above them, so the validator reported no
 * violation with a ball 15.3 mm inside the generic table's apron. Both now read one span (`track.js reachSpan`) and
 * one point test (`meshRead`), so an arm can sample a whole lifecycle and hold the two against each other.
 *
 * Returns `{ evaluated, why?, meshes, probe }`; `probe(x, y, z)` returns null when the point is clear of every
 * furniture mesh, else the nearest/deepest hit `{ mesh, inside, w, distance, depth, assembly }` in V16's own shape.
 * The table's declared pocket assembly is reported with `assembly: true` (V18 lets a route pass through it near its
 * capture point), so a caller can count the two apart.
 */
export async function furnitureProbe({ r, scene, excludeGroup = null, hardwareNames = null, environmentNames = null, assembly = null, THREE: THREEin = null } = {}) {
  if (!(r > 0)) return { evaluated: false, why: 'no radius', meshes: 0, probe: () => null };
  if (!scene) return { evaluated: false, why: 'no scene', meshes: 0, probe: () => null };
  let THREE = THREEin;
  if (!THREE) { try { THREE = await import('three'); } catch { return { evaluated: false, why: 'no three', meshes: 0, probe: () => null }; } }
  const envSet = new Set(environmentNames ?? []);
  const furniture = furnitureOf(THREE, scene, { excludeGroup, hardwareNames: hardwareNames ?? [], assembly });
  const BackSide = THREE.BackSide;
  const grown = furniture.map((f) => {
    const mats = Array.isArray(f.mesh.material) ? f.mesh.material : [f.mesh.material];
    return prepare(THREE, f, r, { shell: mats.every((m) => m && m.side === BackSide), declared: envSet.has(f.mesh.name) });
  });
  const asm = (furniture.assembly ?? []).map((f) => { const g = prepare(THREE, f, r); g.solid = undefined; return g; });
  const origin = new THREE.Vector3();
  const probe = (x, y, z) => {
    let surf = null, inside = null;
    for (const list of [grown, asm]) for (const f of list) {
      const pw = meshRead(THREE, f, r, x, y, z, origin);
      if (!pw) continue;
      const isAsm = list === asm;
      if (pw.d < r - 1e-6 && (!surf || pw.d < surf.d)) surf = { name: f.name, d: pw.d, assembly: isAsm };
      if (pw.w >= V16_INSIDE_W && (!inside || pw.w > inside.w)) inside = { name: f.name, w: pw.w, d: Number.isFinite(pw.d) ? pw.d : 0, assembly: isAsm };
    }
    if (!surf && !inside) return null;
    const win = inside ?? surf;
    return { mesh: win.name, inside: !!inside, w: inside ? inside.w : 0, distance: win.d, depth: inside ? r + inside.d : r - surf.d, assembly: !!win.assembly };
  };
  return { evaluated: true, meshes: furniture.length, assemblyMeshes: asm.length, probe };
}

/** The runway id and the station along it of a route station D (via the route's own segments). */
function locateS(route, D) {
  const segs = route.segs;
  let seg = segs[segs.length - 1];
  for (const sg of segs) { if (D > sg.D1 - 1e-12) { seg = sg; break; } }
  const along = seg.D0 - D;
  let s;
  if (seg.kind === 'line') s = seg.s0 + along;
  else { const ext = seg.sTo - seg.sFrom; s = seg.sFrom + (seg.len > 0 ? Math.max(0, Math.min(1, along / seg.len)) : 0) * ext; }
  return { rw: seg.rw.id, s };
}
