// Copyright (c) Meta Platforms, Inc. and affiliates.

// debugvisual.js — TEST-only visual of a ball-return track (feature 037): the
// support lines (two tubes per twin-rail runway, a strip per channel runway) and
// the tray box, attached at SCENE ROOT under one group named `obBallReturnDebug`
// (never inside `obTable`, never on a shipped table — index.js only imports this
// for a `status: TEST` definition with `debug_visual: true`). Real tables get
// their wires / hooks / drawers from the body waves as table furniture.
import * as THREE from 'three';

export function attachDebugVisual({ scene, track, r }) {
  if (!scene || !track) return null;
  const old = scene.getObjectByName('obBallReturnDebug');
  if (old) scene.remove(old);
  const group = new THREE.Group();
  group.name = 'obBallReturnDebug';
  // [TEST-ONLY LOOK] the colours / metalness / roughness below, the 4 mm strip
  // thickness and the 1.2 r tray wall are NOT reads of anything — they exist so
  // a TEST fixture can be SEEN in a gate capture. This module is installed only
  // for `doc.status: TEST` + `debug_visual: true` (index.js), never on a shipped
  // table; the real slide / gully meshes come from the table lanes' models.
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.7, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22252a, metalness: 0.3, roughness: 0.7 });
  const add = (mesh, name) => { mesh.name = `obBallReturnDebug-${name}`; group.add(mesh); };
  const v = (p) => new THREE.Vector3(p[0], p[1], p[2]);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const [id, rest] of track.rests ?? []) { // terminal-chutes: a dark plate across the stop face
    if (track.tray) break;
    const rw = rest.runway;
    let s = rest.wallS;
    const e = rw.edges.find((ed) => s <= ed.s0 + ed.len + 1e-9) ?? rw.edges[rw.edges.length - 1];
    const u = Math.max(0, Math.min(e.len, s - e.s0));
    const c = [e.p0[0] + e.t[0] * u, e.p0[1] + e.t[1] * u + r * 0.6, e.p0[2] + e.t[2] * u];
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.004, r * 1.6, (rw.support.gauge ?? rw.support.width ?? 0.05) + 0.02), dark);
    plate.position.set(c[0], c[1], c[2]);
    plate.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), v(e.t));
    add(plate, `${id}-stop`);
  }
  for (const rw of track.runways.values()) {
    const sup = rw.support;
    const isTray = track.tray ? rw.id === track.tray.runway.id : false; // trunk-tray collector look; chutes are drawn as wires with a stop plate
    if (sup.kind === 'twin-rail') {
      // per-vertex lateral = the adjacent edge's rolling axis (n̂ × t̂, horizontal)
      const lat = rw.pts.map((_, i) => {
        const e = rw.edges[Math.min(i, rw.edges.length - 1)];
        const a = e.axis;
        const l = Math.hypot(a[0], a[1], a[2]) || 1;
        return [a[0] / l, a[1] / l, a[2] / l];
      });
      for (const side of [-1, 1]) {
        const path = new THREE.CurvePath();
        const off = (i) => v([rw.pts[i][0] + side * lat[i][0] * sup.gauge / 2,
          rw.pts[i][1] + side * lat[i][1] * sup.gauge / 2, rw.pts[i][2] + side * lat[i][2] * sup.gauge / 2]);
        for (let i = 0; i + 1 < rw.pts.length; i++) path.add(new THREE.LineCurve3(off(i), off(i + 1)));
        const geo = new THREE.TubeGeometry(path, Math.max(8, rw.pts.length * 6), sup.railR, 8, false);
        add(new THREE.Mesh(geo, steel), `${rw.id}-rail${side < 0 ? 'L' : 'R'}`);
      }
      continue;
    }
    // channel: a strip per edge (floor), plus low side walls on the tray
    for (const [i, e] of rw.edges.entries()) {
      const thick = 0.004;
      const geo = new THREE.BoxGeometry(e.len, thick, sup.width);
      const m = new THREE.Mesh(geo, isTray ? dark : steel);
      const mid = v([(e.p0[0] + e.p1[0]) / 2, (e.p0[1] + e.p1[1]) / 2 - thick / 2, (e.p0[2] + e.p1[2]) / 2]);
      m.position.copy(mid);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), v(e.t));
      add(m, `${rw.id}-floor${i}`);
      if (isTray) {
        const wallH = r * 1.2;
        for (const side of [-1, 1]) {
          const lat = cross(e.n, e.t);
          const w = new THREE.Mesh(new THREE.BoxGeometry(e.len, wallH, thick), dark);
          w.position.set(mid.x + side * lat[0] * sup.width / 2, mid.y + wallH / 2, mid.z + side * lat[2] * sup.width / 2);
          w.quaternion.copy(m.quaternion);
          add(w, `${rw.id}-wall${side < 0 ? 'L' : 'R'}${i}`);
        }
        if (i === rw.edges.length - 1) { // the end wall
          const ew = new THREE.Mesh(new THREE.BoxGeometry(thick, wallH, sup.width), dark);
          ew.position.copy(v(e.p1)).add(new THREE.Vector3(0, wallH / 2, 0));
          ew.quaternion.copy(m.quaternion);
          add(ew, `${rw.id}-endwall`);
        }
      }
    }
  }
  scene.add(group);
  return group;
}
