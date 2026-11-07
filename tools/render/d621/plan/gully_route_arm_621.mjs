#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// gully_route_arm_621.mjs — GULLY-FIX1 C1/C3 arm: the ball-centre ROUTE of every runway of the Diamond gully export
// measured against the SERVED table's own meshes (web/scene/table.js built headless in node with the vendored three),
// plus the aperture-trim ray arm. Read-only; nothing rendered, nothing written except the report the caller names.
//
//   node tools/render/d621/plan/gully_route_arm_621.mjs [--table diamond_proam_9ft] [--track <path>] [--report <out.json>]
//
// C1 (review 644g1 P2-1, ballreturn surface rule): for EVERY runway the ball-centre polyline (support line + r, sampled
// every 5 mm) must stay >= r = 28.575 mm from every face of the table BODY — every mesh whose name carries cabinet /
// leg- / apronband / kerffloor — and the track's OWN hardware (gullybox-*, gullysleeve-*) is measured apart (closest
// approach printed, never a violation). The minimum distance per route and the offending mesh are printed; exit 3 on any
// body distance below r. The openings the entries pass through are real geometry (holes in the side panels), so the
// remaining panel faces are what the rule measures.
// C3 (review 644g1 P2-3): two rays along the table axis at the aperture's top-bar and bottom-bar heights (z = 0) from
// outside the head end: the FIRST hit must be the lip (gullybox-lip) and the wall behind it must sit exactly lipT further
// in — both bars proud of the LEANED wall by the trim thickness.
// Cross-check: the render spec's gully entry edges (render.gully.entries) equal the export's runway edges the sleeves
// and openings are built from (a duplicated number is a defect the arm names).
import { registerHooks } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const TABLE = opt('--table', 'diamond_proam_9ft');
const TRACK = opt('--track', path.join(ROOT, 'web/scene/ballreturn/tracks', `${TABLE}-gully.json`));
const REPORT = opt('--report', null);
const MM = 0.001, R = 0.028575, STEP = 0.005; // MFR ball radius (WPA 2 1/4 in); DERIVED sampling step 5 mm (arm 13c's spacing)

// ---- headless table.js (the app's import map maps 'three' to the vendored build; a few window/document globals are touched at build) ----
const three = path.resolve(ROOT, 'web/vendor/three.module.min.js');
registerHooks({ resolve(s, c, n) { return s === 'three' ? { url: 'file://' + three, shortCircuit: true } : n(s, c); } });
const noop = () => {}; const g = globalThis;
const imageData = (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w | 0) * Math.max(1, h | 0) * 4), width: Math.max(1, w | 0), height: Math.max(1, h | 0) });
const ctx2d = () => { const store = {}; return new Proxy({}, { get: (t, k) => { if (k === 'getImageData') return (x, y, w, h) => imageData(w, h); if (k === 'createImageData') return (w, h) => imageData(typeof w === 'object' ? w.width : w, typeof w === 'object' ? w.height : h); if (k === 'measureText') return () => ({ width: 1 }); if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: noop }); if (k in store) return store[k]; return noop; }, set: (t, k, v) => { store[k] = v; return true; } }); };
const canvas = () => { const c = { width: 1, height: 1, style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop, toDataURL: () => '' }; c.getContext = (kind) => (kind === '2d' ? ctx2d() : null); return c; };
g.window ??= g; g.addEventListener ??= noop; g.removeEventListener ??= noop; g.dispatchEvent ??= () => true;
g.matchMedia ??= () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop });
g.sessionStorage ??= { getItem: () => null, setItem: noop, removeItem: noop }; g.localStorage ??= g.sessionStorage;
g.location ??= { search: '', href: 'http://localhost/', origin: 'http://localhost', pathname: '/' };
g.navigator ??= { userAgent: 'node', language: 'en' };
g.document ??= { createElement: (tag) => (tag === 'canvas' ? canvas() : { getContext: () => null, style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop }), createElementNS: () => canvas(), body: { appendChild: noop, classList: { add: noop, remove: noop } }, documentElement: { style: { setProperty: noop }, classList: { add: noop, remove: noop } }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, head: { appendChild: noop } };
g.requestAnimationFrame ??= () => 0; g.cancelAnimationFrame ??= noop; g.devicePixelRatio ??= 1; g.innerWidth ??= 1280; g.innerHeight ??= 720;
g.CustomEvent ??= class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }; g.Image ??= class Image {};
const THREE = await import('file://' + three);
const tableMod = await import(path.resolve(ROOT, 'web/scene/table.js'));

const built = tableMod.buildTable({ tableId: TABLE });
built.group.updateMatrixWorld(true);

// ---- first-hit caster: three's Raycaster tests every triangle of a mesh once its bounding SPHERE is hit, and the rail
// tops (17k triangles each) have spheres the size of the table; a world-space AABB test first skips the meshes a ray
// cannot touch — the answer (nearest hit over all meshes) is the same, ~4× faster for the 150k-ray fans ----
const MESHES = []; built.group.traverse((m) => { if (m.isMesh && m.geometry) { m.geometry.computeBoundingBox(); MESHES.push({ m, box: m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld) }); } });
const castRay = new THREE.Raycaster(); castRay.far = 8;
const firstHit = (origin, dir, minDist = 0) => {
  castRay.set(origin, dir.clone().normalize());
  let best = null;
  for (const { m, box } of MESHES) {
    if (!castRay.ray.intersectsBox(box)) continue;
    const hits = castRay.intersectObject(m, false);
    for (const h of hits) { if (h.distance > minDist && (!best || h.distance < best.distance)) { best = h; break; } }
  }
  return best;
};
const isBody = (n) => (/(^|-)cabinet-|(^|-)leg-|apronband|kerffloor/.test(n) && !/gullybox|gullysleeve|gullyplate|gullybaffle/.test(n)) || /gullybox-feedbaffle/.test(n); // GULLY-FIX3: the feed baffle is an obstacle the feed never touches
const isOwn = (n) => /gullybox|gullysleeve|gullyplate|gullybaffle/.test(n);
// GULLY-FIX2 C2 (review 644g2 P2-2): a sleeve / escutcheon plate is the track's own hardware ONLY for the entry it wraps
// (name suffix = the runway's pocket tag); for every other route it is an obstacle measured like the body
const ownFor = (meshName, routeId) => (/gullybox/.test(meshName) && !/feedbaffle/.test(meshName)) || (/(gullysleeve|gullyplate|gullybaffle)-([a-z0-9]+)$/.exec(meshName)?.[2] === routeId.slice(0, 2));
const meshes = [];
built.group.traverse((o) => { if (o.isMesh && o.geometry && (isBody(o.name) || isOwn(o.name))) meshes.push(o); });

// world-space triangles per mesh
const tri = new THREE.Triangle(), tmp = new THREE.Vector3(), q = new THREE.Vector3();
const triangles = meshes.map((m) => {
  const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
  const pos = geo.attributes.position; const out = [];
  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1).applyMatrix4(m.matrixWorld);
    const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2).applyMatrix4(m.matrixWorld);
    out.push([a, b, c]);
  }
  const box = new THREE.Box3().setFromObject(m);
  return { name: m.name, own: isOwn(m.name), tris: out, box };
});
const distToMesh = (p, mesh) => {
  // cheap reject: the box grown by the running best
  let best = Infinity;
  for (const [a, b, c] of mesh.tris) {
    tri.set(a, b, c); tri.closestPointToPoint(p, q);
    const d = p.distanceTo(q); if (d < best) best = d;
  }
  return best;
};

// ---- the export: ball-centre polylines (support line + r on a channel: h = r) ----
const def = JSON.parse(fs.readFileSync(TRACK, 'utf8'));
const routes = def.runways.map((rw) => ({ id: rw.id, role: rw.role, pts: rw.points_mm.map(([x, y, z]) => new THREE.Vector3(x * MM, y * MM + R, z * MM)) }));
const report = { table: TABLE, track: path.relative(ROOT, TRACK), r_mm: R / MM, step_mm: STEP / MM, routes: [], lip: null, spec_vs_export: null, verdict: null };
let fail = false;
for (const rt of routes) {
  const samples = [];
  for (let i = 0; i < rt.pts.length - 1; i++) {
    const a = rt.pts[i], b = rt.pts[i + 1]; const L = a.distanceTo(b); const n = Math.max(1, Math.ceil(L / STEP));
    for (let k = 0; k <= n; k++) samples.push(new THREE.Vector3().lerpVectors(a, b, k / n));
  }
  let minBody = { d: Infinity, mesh: null, at: null }, minOwn = { d: Infinity, mesh: null, at: null };
  for (const mesh of triangles) {
    // box pre-check against the polyline's own box grown by r + slack
    const pb = new THREE.Box3().setFromPoints(rt.pts).expandByScalar(0.25); // DERIVED pre-check margin: 250 mm, far above any clearance of interest
    if (!pb.intersectsBox(mesh.box)) continue;
    for (const p of samples) {
      if (mesh.box.distanceToPoint(p) > Math.min(ownFor(mesh.name, rt.id) ? minOwn.d : minBody.d, 0.25)) continue; // DERIVED box reject (same 250 mm margin)
      const d = distToMesh(p, mesh);
      const slot = ownFor(mesh.name, rt.id) ? minOwn : minBody;
      if (d < slot.d) { slot.d = d; slot.mesh = mesh.name; slot.at = [p.x, p.y, p.z].map((v) => +(v / MM).toFixed(1)); }
    }
  }
  const ok = minBody.d >= R - 1e-6;
  if (!ok) fail = true;
  report.routes.push({ id: rt.id, role: rt.role, samples: samples.length, min_body_mm: +(minBody.d / MM).toFixed(2), body_mesh: minBody.mesh, body_at_mm: minBody.at, min_own_mm: minOwn.d === Infinity ? null : +(minOwn.d / MM).toFixed(2), own_mesh: minOwn.mesh, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} route ${rt.id.padEnd(8)} (${rt.role.padEnd(5)}) body min ${(minBody.d / MM).toFixed(2).padStart(7)} mm ${String(minBody.mesh).padEnd(22)} at ${JSON.stringify(minBody.at)}  own ${minOwn.mesh ? (minOwn.d / MM).toFixed(2) + ' mm ' + minOwn.mesh : '—'}`);
}

// ---- C1b: the OPENING each entry passes through (ballreturn B1-1 N2a): the ball-centre edge of render.gully meets the side
// panel's leaned outer face at a point that must lie inside a cut hole — measured on the BUILT panel: a ray along the edge
// through the panel plane must hit NO cabinet-side-* face within 60 mm of the crossing (the hole), and the nearest cut
// face is reported; the collector box coverage is re-measured (every tray seat inside the box's x / z extents) ----
{
  const spec = tableMod.TABLE_SPECS[TABLE]; const gy = spec.render.gully;
  if (gy) {
    const G = tableMod.makeGeom(TABLE); const cab = spec.render.cabinet; const hz = G.W / 2 + G.CW + (G.render.frameWidth ?? 0);
    const tanC = Math.tan((cab.leanDeg * Math.PI) / 180), yTop = -cab.topBelowBed;
    const sidePanels = triangles.filter((m) => /cabinet-side-/.test(m.name));
    const rows = [];
    for (const e of gy.entries) {
      const sgn = Math.sign(e.from[2]);
      const a = new THREE.Vector3(e.from[0], e.from[1] + R, e.from[2]), b = new THREE.Vector3(e.to[0], e.to[1] + R, e.to[2]);
      const zOuter = (y) => sgn * ((hz - cab.recessSide) - (yTop - y) * tanC);
      let t = 0.5; for (let i = 0; i < 30; i++) { const y = a.y + (b.y - a.y) * t; const z = a.z + (b.z - a.z) * t; t += (z - zOuter(y)) / (a.z - b.z); } // DERIVED fixed-point start (same solve as table.js)
      const cross = new THREE.Vector3().lerpVectors(a, b, t);
      // the panel faces nearest the crossing: with the hole cut they are the hole's edges (~55 mm away), without it the panel face itself (0 mm)
      let near = Infinity, nearName = null;
      for (const m of sidePanels) { const d = distToMesh(cross, m); if (d < near) { near = d; nearName = m.name; } }
      // ray along the edge through the panel: no side-panel hit within ±60 mm of the crossing = the opening is real
      const ray = new THREE.Raycaster(a.clone(), b.clone().sub(a).normalize(), 0, a.distanceTo(b));
      const hits = ray.intersectObjects(built.group.children, true).filter((h) => /cabinet-side-/.test(h.object.name) && Math.abs(h.point.distanceTo(cross)) < 0.060); // DERIVED window: 60 mm = the hole's half-size 55 + 5
      const ok = hits.length === 0 && near >= R - 1e-6;
      if (!ok) fail = true;
      rows.push({ runway: e.runway, crossing_mm: [cross.x, cross.y, cross.z].map((v) => +(v / MM).toFixed(1)), opening_mm: [gy.openingW / MM, gy.openingH / MM], nearest_cut_face_mm: +(near / MM).toFixed(2), panel: nearName, panel_hits_at_crossing: hits.length, ok });
      console.log(`${ok ? 'PASS' : 'FAIL'} opening ${e.runway.padEnd(7)} crosses ${nearName} at ${JSON.stringify(rows.at(-1).crossing_mm)} through a ${gy.openingW / MM} × ${gy.openingH / MM} hole — panel hits at the crossing ${hits.length}, nearest cut face ${(near / MM).toFixed(2)} mm`);
    }
    report.openings = rows;
    // box coverage: the tray's seats (every point of the tray polyline) vs the box extents built by table.js
    const box = { x: [Infinity, -Infinity], z: [Infinity, -Infinity] };
    for (const m of triangles.filter((m) => /gullybox-(floor|back|end)/.test(m.name))) { box.x = [Math.min(box.x[0], m.box.min.x), Math.max(box.x[1], m.box.max.x)]; box.z = [Math.min(box.z[0], m.box.min.z), Math.max(box.z[1], m.box.max.z)]; }
    const tray = routes.find((r) => r.role === 'tray');
    const inside = tray.pts.every((p) => p.x >= box.x[0] - 1e-6 && p.x <= box.x[1] + 1e-6 && p.z >= box.z[0] - 1e-6 && p.z <= box.z[1] + 1e-6);
    if (!inside) fail = true;
    report.box_coverage = { box_x_mm: box.x.map((v) => +(v / MM).toFixed(1)), box_z_mm: box.z.map((v) => +(v / MM).toFixed(1)), tray_x_mm: [Math.min(...tray.pts.map((p) => p.x)), Math.max(...tray.pts.map((p) => p.x))].map((v) => +(v / MM).toFixed(1)), tray_z_mm: [Math.min(...tray.pts.map((p) => p.z)), Math.max(...tray.pts.map((p) => p.z))].map((v) => +(v / MM).toFixed(1)), every_seat_inside: inside };
    console.log(`${inside ? 'PASS' : 'FAIL'} box coverage: tray x ${JSON.stringify(report.box_coverage.tray_x_mm)} z ${JSON.stringify(report.box_coverage.tray_z_mm)} inside box x ${JSON.stringify(report.box_coverage.box_x_mm)} z ${JSON.stringify(report.box_coverage.box_z_mm)}`);
  }
}

// ---- GULLY-FIX2 C2 (review 644g2 P2-2): a sleeve-wall row per trunk / tray — the minimum distance from the route's
// ball-centre polyline to EVERY sleeve, plate and baffle (they are own hardware only for the entry they wrap) ≥ r ----
{
  const sleeves = triangles.filter((m) => /gullysleeve|gullyplate|gullybaffle/.test(m.name));
  const rows = [];
  for (const rt of routes.filter((r) => r.role !== 'entry')) {
    const samples = [];
    for (let i = 0; i < rt.pts.length - 1; i++) { const a = rt.pts[i], b = rt.pts[i + 1]; const n = Math.max(1, Math.ceil(a.distanceTo(b) / STEP)); for (let k = 0; k <= n; k++) samples.push(new THREE.Vector3().lerpVectors(a, b, k / n)); }
    let best = { d: Infinity, mesh: null };
    for (const m of sleeves) for (const p of samples) { if (m.box.distanceToPoint(p) > Math.min(best.d, 0.25)) continue; const d = distToMesh(p, m); if (d < best.d) best = { d, mesh: m.name }; } // DERIVED box reject (250 mm margin)
    const ok = best.d >= R - 1e-6;
    if (!ok) fail = true;
    rows.push({ route: rt.id, min_sleeve_wall_mm: +(best.d / MM).toFixed(2), mesh: best.mesh, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'} sleeve-wall ${rt.id.padEnd(8)}: nearest sleeve / plate / baffle ${(best.d / MM).toFixed(2)} mm (${best.mesh}) — want ≥ ${R / MM}`);
  }
  report.sleeve_walls = rows;
}

// ---- GULLY-FIX2 C1 (review 644g2 P2-1): from a low side view nothing of the room may show through a cutout — horizontal
// rays along z through each cutout's 110 × 110 window (a 9 × 9 grid of (x, y) offsets about the crossing, both directions)
// must hit table mesh (the escutcheon plate, the sleeve, or the panel); the first hit is printed per cutout ----
{
  const spec = tableMod.TABLE_SPECS[TABLE]; const gy = spec.render.gully;
  if (gy && report.openings) {
    const ray = new THREE.Raycaster(); ray.far = 4;
    const rows = [];
    for (const o of report.openings) {
      const [cx, cy, cz] = o.crossing_mm.map((v) => v * MM); const sgn = Math.sign(cz);
      let misses = 0, total = 0; const firstHits = new Map();
      for (let i = -4; i <= 4; i++) for (let k = -4; k <= 4; k++) {
        const x = cx + i * 0.0125, y = cy + k * 0.0125; // DERIVED grid: 12.5 mm pitch spans the 110 mm cutout ±50 mm
        // from OUTSIDE the table (1 m off the panel) looking in, level along z, far enough to cross the whole table: a ray
        // that exits anywhere is a line of sight through the cabinet (the low side view); a viewpoint inside the cabinet is
        // not a view anyone has, so no inside-out family
        for (const [ox, dz] of [[sgn * 2.0, -sgn]]) {
          ray.set(new THREE.Vector3(x, y, cz + ox * 0.5), new THREE.Vector3(0, 0, dz));
          const hits = ray.intersectObjects(built.group.children, true).filter((h) => h.object.isMesh);
          total++;
          if (!hits.length) misses++; else firstHits.set(hits[0].object.name, (firstHits.get(hits[0].object.name) || 0) + 1);
        }
      }
      const ok = misses === 0;
      if (!ok) fail = true;
      rows.push({ runway: o.runway, rays: total, misses, first_hits: Object.fromEntries(firstHits), ok });
      console.log(`${ok ? 'PASS' : 'FAIL'} cutout ${o.runway.padEnd(7)}: ${total} horizontal rays through the 110 × 110 window, ${misses} miss table mesh; first hits ${JSON.stringify(Object.fromEntries(firstHits))}`);
    }
    report.cutout_rays = rows;
  }
}

// ---- GULLY-FIX5 (review 644g5 P2): containment from the SIDES. For every cutout a fan through its whole 110 × 110 window
// (the 9 × 9 grid of the sweep above, 12.5 mm, ON the leaned outer face), origins 40 mm back along each ray, directions =
// the inward panel normal turned by an azimuth of −80° … +80° about the vertical (5°) and a pitch of −40° … +40° (5°:
// a standing eye looking down at the cutout 0.52 m above the floor … a floor-level eye looking up 40°). The review order
// asked for azimuth ±60° and pitch 0 … +40°; review's own ray sits at azimuth 75° (atan2(0.74, 0.198)) and pitch 40°, so
// the fan reaches ±80° — a fan that cannot see the ray that motivated it would prove nothing — and the downward rows are
// the standing eye at the same rule. Admissible first hits = an
// unlit sleeve / plate / baffle / collector surface (any pocket's — the sleeves of the two middles are collinear) or the
// panel itself (dm-cabinet-side-l / -r: the ray clipped the cutout's reveal or the panel face), or any first hit whose
// point lies OUTSIDE the panel's outer face (a leg / the apron seen from outside at a grazing azimuth — the ray never
// entered; keyed 'outside:<name>'); anything else INSIDE (the cabinet board, the far panel, the legs' inner faces, the
// rails …) or a MISS (the background) fails. Census per pitch row.
// FIXED ROW: review 644g5's ray verbatim — (−0.369971, −0.571394, −0.725558) along (0.739942, 0.642788, 0.198267), which
// slipped past the s1 sleeve's rim, through the plate's hole and out through the cabinet to the background.
{
  const spec = tableMod.TABLE_SPECS[TABLE]; const gy = spec.render.gully;
  if (gy && report.openings) {
    const admissible = (n) => /gullysleeve|gullyplate|gullybaffle|gullybox/.test(n) || /^dm-cabinet-side-[lr]$/.test(n);
    const tanC = Math.tan((spec.render.cabinet.leanDeg * Math.PI) / 180); // the side panels lean IN going down: the outer face at height y is cz + sgn·(y − cy)·tanC
    const pitches = []; for (let d = -40; d <= 40; d += 5) pitches.push(d);
    const azimuths = []; for (let d = -80; d <= 80; d += 5) azimuths.push(d); // DERIVED: ±80° covers review's 75° ray with a 5° row to spare
    const rows = []; let allOk = true;
    for (const o of report.openings) {
      const [cx, cy, cz] = o.crossing_mm.map((v) => v * MM); const sgn = Math.sign(cz);
      const perPitch = []; let bad = 0, misses = 0, total = 0; const offenders = [];
      for (const pd of pitches) {
        const pitch = pd * Math.PI / 180; const counts = new Map(); let rowBad = 0, rowMiss = 0, rowN = 0;
        for (const ad of azimuths) {
          const az = ad * Math.PI / 180;
          const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(az), Math.sin(pitch), -sgn * Math.cos(pitch) * Math.cos(az)); // inward = −sgn·z
          for (let i = -4; i <= 4; i++) for (let k = -4; k <= 4; k++) {
            const y = cy + k * 0.0125, zFace = cz + sgn * (y - cy) * tanC; // DERIVED 12.5 mm grid row; the LEANED outer face at this height (±3.8 mm over the window)
            const entry = new THREE.Vector3(cx + i * 0.0125, y, zFace); // DERIVED grid: 12.5 mm over the 110 mm window, ON the face
            const origin = entry.clone().addScaledVector(dir, -0.040); // 40 mm CLEARANCE back along the ray: ≥ 5.3 mm outside the face even at 80° / 40°, clear of the 1 mm-proud plate
            const h = firstHit(origin, dir, 0); rowN++; total++;
            // a first hit OUTSIDE the panel's outer face never entered the cabinet (a leg or the apron seen from outside at
            // a grazing azimuth): admissible, counted under its own key; a hit INSIDE must be unlit hardware or the panel
            const outside = h && sgn * h.point.z > sgn * (cz + sgn * (h.point.y - cy) * tanC) + 0.0005;
            const n = h ? (outside && !admissible(h.object.name) ? 'outside:' + h.object.name : h.object.name) : null;
            if (n === null) { rowMiss++; misses++; counts.set('MISS', (counts.get('MISS') || 0) + 1); if (offenders.length < 6) offenders.push({ pitch: pd, az: ad, dx_mm: i * 12.5, dy_mm: k * 12.5, first: 'MISS' }); continue; }
            counts.set(n, (counts.get(n) || 0) + 1);
            if (!admissible(n) && !n.startsWith('outside:')) { rowBad++; bad++; if (offenders.length < 6) offenders.push({ pitch: pd, az: ad, dx_mm: i * 12.5, dy_mm: k * 12.5, first: n }); }
          }
        }
        perPitch.push({ pitch_deg: pd, rays: rowN, misses: rowMiss, foreign: rowBad, first_hits: Object.fromEntries(counts) });
        console.log(`  side fan ${o.runway.padEnd(7)} pitch ${String(pd).padStart(3)}°: ${rowN} rays, ${rowMiss} miss, ${rowBad} foreign — ${JSON.stringify(Object.fromEntries(counts))}`);
      }
      const ok = bad === 0 && misses === 0; if (!ok) { fail = true; allOk = false; }
      rows.push({ runway: o.runway, rays: total, misses, lit_or_foreign_first_hits: bad, rows: perPitch, offenders, ok });
      console.log(`${ok ? 'PASS' : 'FAIL'} side fan ${o.runway.padEnd(7)}: ${total} rays through the 110 × 110 window (33 azimuths × 17 pitches × 81 points), ${misses} misses, ${bad} first hits on a non-collector surface${offenders.length ? ' — offenders ' + JSON.stringify(offenders) : ''}`);
    }
    report.side_fans = rows;
    console.log(`${allOk ? 'PASS' : 'FAIL'} side fans: ${rows.length} cutouts, ${rows.reduce((a, r) => a + r.rays, 0)} rays, ${rows.reduce((a, r) => a + r.misses, 0)} misses, ${rows.reduce((a, r) => a + r.lit_or_foreign_first_hits, 0)} foreign`);
    // review 644g5's ray, verbatim from /tmp/obreview-644g5.log (origin and direction DERIVED by review, kept as a fixed row)
    const f = { id: 'review-644g5 low oblique side ray through the s1 cutout', origin: [-0.369971, -0.571394, -0.725558], dir: [0.739942, 0.642788, 0.198267] };
    const h = firstHit(new THREE.Vector3(...f.origin), new THREE.Vector3(...f.dir), 0); const n = h ? h.object.name : null;
    const okF = n !== null && admissible(n);
    if (!okF) fail = true;
    (report.fixed_rays ??= []).push({ id: f.id, origin: f.origin, dir: f.dir, first: n ?? 'MISS', ok: okF });
    console.log(`${okF ? 'PASS' : 'FAIL'} fixed ray ${f.id}: first hit ${n ?? 'MISS'} (want an unlit sleeve / plate / baffle / collector surface or the panel)`);
  }
}

// ---- GULLY-FIX3 / FIX4 (review 644g3 P2, 644g4 P2 ×2): the collector box must be SEALED against every head-end sightline
// in azimuth AND elevation. Two fans + two fixed rays, every ray classified by its FIRST hit:
//   admissible = an unlit collector surface (gullybox-*: floor / ceiling / back / ends / feed baffles / lip) or the head
//                wall itself (dm-cabinet-end-h — a ray whose line clips the opening's reveal never entered the box);
//   failure    = anything else (the cabinet board, the far end wall, the side panels, legs, another pocket's hardware,
//                the apron band …) or a MISS (a ray that leaves the table = the background seen through the box).
// HEAD-END FAN — review's viewpoint: azimuth 0, pitch −30° … +30° (5°: a standing eye looking down to a low crouch looking
//   up), origins 1.75 m before the aperture, aimed through every point of the opening (z ±275 / 10 mm, y −335 … −245 /
//   10 mm = the ball-centre band, 4–5 mm inside the edges); first-hit census printed PER PITCH ROW.
// OBLIQUE FAN — the same origin points ON the aperture plane (the wall's mid-thickness, where every (y, z) inside the
//   opening is air), azimuth −60° … +60° (5°) × pitch −30° … +30° (5°), z ±275 / 25 mm, y / 20 mm; census per pitch row.
// FIXED RAYS — the two rays review 644g4 named, verbatim: (1) from (−3, 0.376948, −0.05) along (1, −tan 20°, 0) — it hit
//   dm-cabinet-board through the left chute mouth under the feed baffle; (2) from (−1.726314, −0.517, −0.25) 30° upward —
//   it missed every mesh through the slit between the ceiling's front edge and the leaned lintel.
{
  const spec = tableMod.TABLE_SPECS[TABLE]; const cab = spec.render.cabinet;
  const o = (cab.openings || []).find((h) => h.ends === 'head');
  const floorMesh = built.group.children.find((c) => c.name === 'dm-gullybox-floor');
  if (!o || !floorMesh) { fail = true; console.log('FAIL head-end fans: no head opening / no dm-gullybox-floor mesh to anchor the aperture plane'); }
  else {
    const ray = new THREE.Raycaster(); ray.far = 8;
    const admissible = (n) => /gullybox/.test(n) || n === 'dm-cabinet-end-h';
    // the floor's front edge sits 4 mm inside the wall's thickness at the lintel (table.js frontX); 2 mm further in is
    // still inside the 16 mm wall — every (y, z) of the opening is air there (the hole runs through the whole thickness)
    const xAperture = floorMesh.position.x - floorMesh.geometry.parameters.width / 2 + 0.002; // 2 mm CLEARANCE in from the front edge, DERIVED
    const castFrom = (origin, dir) => { const h = firstHit(origin, dir, 0.0005); return h ? h.object.name : null; };
    const runFan = (label, azDegs, pitchDegs, zStep, yStep, standoff) => {
      const rows = []; let bad = 0, misses = 0, total = 0; const offenders = [];
      for (const pd of pitchDegs) {
        const pitch = pd * Math.PI / 180; const counts = new Map(); let rowBad = 0, rowMiss = 0, rowN = 0;
        for (const ad of azDegs) {
          const az = ad * Math.PI / 180;
          const dir = new THREE.Vector3(Math.cos(pitch) * Math.cos(az), Math.sin(pitch), Math.cos(pitch) * Math.sin(az));
          for (let z = -0.275; z <= 0.2751; z += zStep) for (let y = o.yTop - o.h + 0.004; y <= o.yTop - 0.004 + 1e-9; y += yStep) { // DERIVED: inside the 560 × 98 opening by 5 / 4 mm
            const entry = new THREE.Vector3(xAperture, y, z);
            const origin = standoff ? entry.clone().addScaledVector(dir, -standoff) : entry;
            const n = castFrom(origin, dir); rowN++; total++;
            if (n === null) { rowMiss++; misses++; counts.set('MISS', (counts.get('MISS') || 0) + 1); if (offenders.length < 8) offenders.push({ pitch: pd, az: ad, z_mm: +(z / MM).toFixed(0), y_mm: +(y / MM).toFixed(0), first: 'MISS' }); continue; }
            counts.set(n, (counts.get(n) || 0) + 1);
            if (!admissible(n)) { rowBad++; bad++; if (offenders.length < 8) offenders.push({ pitch: pd, az: ad, z_mm: +(z / MM).toFixed(0), y_mm: +(y / MM).toFixed(0), first: n }); }
          }
        }
        rows.push({ pitch_deg: pd, rays: rowN, misses: rowMiss, foreign: rowBad, first_hits: Object.fromEntries(counts) });
        console.log(`  ${label} pitch ${String(pd).padStart(3)}°: ${rowN} rays, ${rowMiss} miss, ${rowBad} foreign — ${JSON.stringify(Object.fromEntries(counts))}`);
      }
      const ok = bad === 0 && misses === 0;
      if (!ok) fail = true;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${total} rays, ${misses} misses, ${bad} first hits on a non-collector surface${offenders.length ? ' — offenders ' + JSON.stringify(offenders) : ''}`);
      return { rays: total, misses, lit_or_foreign_first_hits: bad, rows, offenders };
    };
    const pitches = []; for (let d = -30; d <= 30; d += 5) pitches.push(d);
    const azimuths = []; for (let d = -60; d <= 60; d += 5) azimuths.push(d);
    // grids DERIVED: 10 / 10 mm over the opening for the axial fan, 25 / 20 mm for the oblique one (13 pitch × 25 azimuth rows);
    // 1.75 m standoff = review 644g4's second ray's distance from the wall (DERIVED, a line's first hit does not depend on it)
    report.head_fan = runFan('head-end fan', [0], pitches, 0.010, 0.010, 1.75);
    report.oblique_fan = runFan('oblique fan', azimuths, pitches, 0.025, 0.020, 0);
    // the two review 644g4 rays, verbatim from /tmp/obreview-644g4.log (origins and directions DERIVED by review, kept as fixed rows)
    const fixed = [
      { id: 'review-644g4-1 elevated 20° down through the left chute mouth', origin: [-3, 0.376948, -0.05], dir: [1, -Math.tan(20 * Math.PI / 180), 0] },
      { id: 'review-644g4-2 low 30° up at the lintel slit', origin: [-1.726314, -0.517, -0.25], dir: [Math.cos(30 * Math.PI / 180), Math.sin(30 * Math.PI / 180), 0] },
    ];
    report.fixed_rays ??= []; // GULLY-FIX7 (review 644g7 P3): never reset — the side-fan block above already appended review-644g5's row
    for (const f of fixed) {
      const n = castFrom(new THREE.Vector3(...f.origin), new THREE.Vector3(...f.dir));
      const ok = n !== null && /gullybox/.test(n);
      if (!ok) fail = true;
      report.fixed_rays.push({ id: f.id, origin: f.origin, dir: f.dir, first: n ?? 'MISS', ok });
      console.log(`${ok ? 'PASS' : 'FAIL'} fixed ray ${f.id}: first hit ${n ?? 'MISS'} (want an unlit collector surface)`);
    }
  }
}

// ---- GULLY-FIX6 (review 644g6 P2 #1 / #3): (a) EXCURSION — no vertex of an entry baffle may stand outside its panel's
// outer face (the tilted 200 × 200 planes reached 31 mm outside); the plate is 1 mm proud BY CONSTRUCTION (its escutcheon
// offset) and is held to that; the sleeve's outer part is the channel from the pocket boot to the panel, outside by design
// (reported, not deciding — its rim near the baffle is inside). (b) review's +Z ray (−0.95, −0.34, −1.5) → (0, 0, 1) as a
// fixed row: first hit must be the panel, never a baffle. (c) UNIQUE NAMES: every built mesh name occurs once (the
// alignment dump indexes by name: shared names had collapsed 142 meshes into 137). ----
{
  const spec = tableMod.TABLE_SPECS[TABLE]; const gy = spec.render.gully;
  const names = []; built.group.traverse((o) => { if (o.isMesh && o.geometry) names.push(o.name || ''); });
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  const okNames = dupes.length === 0 && names.every((n) => n);
  if (!okNames) fail = true;
  report.mesh_names = { built: names.length, unique: new Set(names).size, duplicates: dupes, unnamed: names.filter((n) => !n).length };
  console.log(`${okNames ? 'PASS' : 'FAIL'} unique names: ${names.length} built meshes, ${new Set(names).size} unique${dupes.length ? ' — duplicates ' + JSON.stringify(dupes) : ''}`);
  if (gy && report.openings) {
    const tanC = Math.tan((spec.render.cabinet.leanDeg * Math.PI) / 180);
    const rows = []; const v = new THREE.Vector3();
    for (const o of report.openings) {
      const [cx, cy, cz] = o.crossing_mm.map((q) => q * MM); const sgn = Math.sign(cz); const pt = o.runway.slice(0, 2);
      for (const kind of ['gullybaffle', 'gullyplate', 'gullysleeve']) {
        const m = built.group.children.find((c) => c.name === `dm-${kind}-${pt}`);
        if (!m) { fail = true; rows.push({ mesh: `dm-${kind}-${pt}`, missing: true }); console.log(`FAIL excursion dm-${kind}-${pt}: mesh missing`); continue; }
        const pos = m.geometry.getAttribute('position'); let maxOut = -Infinity;
        for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); const out = sgn * (v.z - (cz + sgn * (v.y - cy) * tanC)); if (out > maxOut) maxOut = out; }
        const limit = kind === 'gullyplate' ? 0.0012 : 0; // DERIVED: plate = its 1 mm CLEARANCE proud offset + 0.2 mm epsilon; baffle AND sleeve (D-3e RS, TASTE audit 2 P2 g3): nothing outside the panel's outer face — the sleeve's rim is mitred 0.3 mm inside it
        const ok = limit === null ? true : maxOut <= limit;
        if (!ok) fail = true;
        rows.push({ mesh: m.name, max_outward_excursion_mm: +(maxOut / MM).toFixed(2), limit_mm: limit === null ? 'BY DESIGN (boot → panel channel)' : +(limit / MM).toFixed(2), ok });
        console.log(`${limit === null ? 'INFO' : ok ? 'PASS' : 'FAIL'} excursion ${m.name.padEnd(18)}: max ${(maxOut / MM).toFixed(2).padStart(7)} mm outside the panel's outer face${limit === null ? ' (by design: the channel from the boot)' : ` — limit ${(limit / MM).toFixed(1)}`}`);
      }
    }
    report.excursions = rows;
    // review 644g6's ray, verbatim (DERIVED by review, kept as a fixed row): it hit dm-gullybaffle-c0 31 mm outside the panel
    const h = firstHit(new THREE.Vector3(-0.95, -0.34, -1.5), new THREE.Vector3(0, 0, 1), 0); const n = h ? h.object.name : 'MISS';
    const okZ = /^dm-cabinet-side-[lr]$/.test(n);
    if (!okZ) fail = true;
    (report.fixed_rays ??= []).push({ id: 'review-644g6 +Z ray at the c0 baffle flap', origin: [-0.95, -0.34, -1.5], dir: [0, 0, 1], first: n, ok: okZ });
    console.log(`${okZ ? 'PASS' : 'FAIL'} fixed ray review-644g6 +Z at (−0.95, −0.34, −1.5): first hit ${n} (want the panel, never a baffle)`);
  }
}

// ---- C3: the aperture trim rays (head end, z = 0, at the top-bar and bottom-bar centre heights) ----
{
  const spec = tableMod.TABLE_SPECS[TABLE]; const cab = spec.render.cabinet;
  const o = (cab.openings || []).find((h) => h.ends === 'head');
  const lipTop = built.group.children.find((c) => c.name === 'dm-gullybox-lip-top'); const lipW = lipTop ? lipTop.geometry.parameters.height : 0.010, lipT = 0.003; // DERIVED: the bar width READ from the built top bar (D-3b: 10 mm; the FIX1 literal was 20), 3 mm proud (PHOTO-open)
  const G = tableMod.makeGeom(TABLE); const hx = G.L / 2 + G.CW + (G.render.frameWidthEnd ?? G.render.frameWidth ?? 0);
  const ray = new THREE.Raycaster(); ray.far = 5;
  const rows = [];
  for (const [tag, y] of [['top', o.yTop + lipW / 2], ['bottom', o.yTop - o.h - lipW / 2]]) {
    ray.set(new THREE.Vector3(-3, y, 0), new THREE.Vector3(1, 0, 0));
    const hits = ray.intersectObjects(built.group.children, true).filter((h) => h.object.isMesh && !/apronband/.test(h.object.name)).map((h) => ({ name: h.object.name, x_mm: +(h.point.x / MM).toFixed(2) }));
    const lip = hits.find((h) => /gullybox-lip/.test(h.name)), wall = hits.find((h) => /cabinet-end-h/.test(h.name));
    const proud = lip && wall ? +(wall.x_mm - lip.x_mm).toFixed(2) : null;
    const ok = lip && wall && hits[0] && /gullybox-lip/.test(hits[0].name) && Math.abs(proud - lipT / MM) < 0.05; // epsilon 0.05 mm
    if (!ok) fail = true;
    rows.push({ bar: tag, y_mm: +(y / MM).toFixed(1), first_hit: hits[0]?.name ?? null, lip_x_mm: lip?.x_mm ?? null, wall_x_mm: wall?.x_mm ?? null, proud_mm: proud, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'} lip ${tag.padEnd(6)} y ${(y / MM).toFixed(1)}: first hit ${hits[0]?.name ?? 'none'}, lip x ${lip?.x_mm ?? '—'}, wall x ${wall?.x_mm ?? '—'}, proud ${proud ?? '—'} mm (want ${lipT / MM})`);
  }
  report.lip = rows;
  // spec-vs-export cross-check of the gully entry edges the sleeves / openings are built from
  const ge = spec.render.gully ? [...(spec.render.gully.entries ?? []), ...(spec.render.gully.feeds ?? [])] : null;
  if (ge) {
    const mism = [];
    for (const e of ge) {
      const rw = def.runways.find((r) => r.id === e.runway);
      const want = rw ? [rw.points_mm[e.edge], rw.points_mm[e.edge + 1]] : null;
      const got = [e.from, e.to].map((p) => p.map((v) => +(v / MM).toFixed(3)));
      const same = want && got.every((p, i) => p.every((v, k) => Math.abs(v - want[i][k]) < 0.05)); // epsilon 0.05 mm
      if (!same) mism.push({ runway: e.runway, edge: e.edge, spec: got, export: want });
    }
    report.spec_vs_export = { entries: ge.length, mismatches: mism };
    if (mism.length) fail = true;
    console.log(`${mism.length ? 'FAIL' : 'PASS'} spec-vs-export: ${ge.length} gully entry + feed edges in render.gully match the export${mism.length ? ' — mismatches ' + JSON.stringify(mism) : ''}`);
  } else {
    console.log('SKIP spec-vs-export: render.gully absent on this entry');
  }
}
// ---- GULLY-FIX7 (review 644g7 P3): the fixed-ray LEDGER — every fixed ray that executed must serialize into the saved report;
// on an entry with render.gully that is four rows (644g4 ×2, 644g5, 644g6) with distinct ids. A reset of report.fixed_rays
// between blocks silently dropped a row once; this count is the guard against it recurring. ----
const FIXED_RAYS_EXPECTED = tableMod.TABLE_SPECS[TABLE].render.gully ? 4 : 0; // DERIVED: the fixed rows named in this file
const fixedIds = (report.fixed_rays ?? []).map((r) => r.id);
const okLedger = fixedIds.length === FIXED_RAYS_EXPECTED && new Set(fixedIds).size === fixedIds.length;
if (!okLedger) fail = true;
report.fixed_ray_ledger = { serialized: fixedIds.length, expected: FIXED_RAYS_EXPECTED, ids: fixedIds, ok: okLedger };
console.log(`${okLedger ? 'PASS' : 'FAIL'} fixed-ray ledger: ${fixedIds.length} rows serialized (want ${FIXED_RAYS_EXPECTED}, distinct ids) — ${JSON.stringify(fixedIds)}`);
report.verdict = fail ? 'FAIL' : 'PASS';
if (REPORT) fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
console.log(`[gully-route-arm] ${report.verdict} — ${report.routes.length} routes, r ${R / MM} mm, step ${STEP / MM} mm, ${triangles.length} body/own meshes measured`);
process.exit(fail ? 3 : 0);
