// Copyright (c) Meta Platforms, Inc. and affiliates.

// bake-room-scene.mjs — from a built club room to the inputs of the light bake (bake role). Used by the bake page
// (web/tools/club/bake-room.html) and by the node smoke run (bake-room-node.mjs); the compute itself is bake-room-core.mjs.
//
// What becomes a blocker: every lit triangle under the room's group (shell, props, luminaire) as drawn, plus the main table.
// What does not: unlit surfaces (lamp shades, bulbs, lit shelf panels, sign tubes, glow and contact-shadow overlays: light
// comes FROM them, through the registered emitters) and the wall lamps' brass.
// Flags on triangles: 1 = the main table (the floor's own texels and the lamp-visibility channel do not see it: the occlusion
// service owns what the main table does to the floor), 2 = the main table's luminaire (it does not shade its own light),
// 4 = everything else (so a ray can be asked to see the main table alone).
import * as THREE from 'three';
import * as CORE from './bake-room-core.mjs';
import { POOL, VOLUME_BIAS } from '../../scene/club/room/light.js';

export const FLAG_TABLE = 1, FLAG_LUMINAIRE = 2, FLAG_OTHER = 4;

// mean linear colour of the colour maps, by material name (a hint for the bounce only; the direct light does not use it)
const MAP_MEAN = {
  'club.room.floor': [0.205, 0.102, 0.040], 'club.room.wood': [0.188, 0.039, 0.010],
  'club.props.wood': [0.188, 0.039, 0.010], 'club.props.lacquer': [0.188, 0.039, 0.010], 'club.props.leather': [0.22, 0.10, 0.06],
  'club.props.metal': [0.35, 0.35, 0.35], 'club.props.paint': [0.25, 0.25, 0.25], 'club.props.glow': [0.25, 0.25, 0.25],
  'club.props.glass': [0.05, 0.04, 0.03],
  // (the arena's materials: ARENA_ALBEDO and ARENA_VERTEX_MEAN below)
};
const TYPE = { point: 0, rect: 1, tube: 2 };

// content hash: two FNV-1a passes over the bytes of typed arrays -> 16 hex digits (the same form as the room's signature)
function hashOf(...arrays) {
  let h1 = 0x811c9dc5, h2 = 0x9747b28c;
  for (const a of arrays) {
    const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    for (let i = 0; i < u.length; i++) { h1 = Math.imul(h1 ^ u[i], 0x01000193); h2 = Math.imul(h2 ^ u[i], 0x01000193) ^ (h2 >>> 13); }
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
// whose triangles they are, for the content hashes (a stale report names the owner whose geometry moved)
// (the arena: `shell` = the hall, `props` = the rig's fixed parts and the surround)
const ownerOf = (flag, name) => (flag === FLAG_TABLE ? 'table' : flag === FLAG_LUMINAIRE ? 'luminaire' : /^(club\.room|arena\.hall|arena\.shell)\./.test(name) ? 'shell' : 'props');
// the arena's parts by material name (`arena.<part>.<name>`: CONTRACT 13.7), for a finer split of `props` and of the luminaire
// class (the rig IS the luminaire's owner): a stale report then names the role whose geometry moved
const ARENA_PARTS = ['rig', 'surround', 'floor'];
const arenaPartOf = (name) => { const m = /^arena\.([a-z]+)\./.exec(name); return m && ARENA_PARTS.includes(m[1]) ? m[1] : null; };
// (`roof`: the arena's lid charts, round A6: counted with the minor charts, so the mean indirect light by kind, which
// the room takes as its analytic ambient, is what it was without them; the club room has no chart of that kind)
const KIND = { floor: 0, wall: 1, ceil: 2, minor: 3, roof: 3 };
// The bake's constant room ambient at amb = 1 (irradiance; sky on up-facing surfaces, ground on down-facing ones, their mean
// plus side on vertical ones). Weighted per point by how open the hemisphere is, it stands for the light this model does not
// carry: lamp shades and lit glass as area sources, the bar's bottles, light through the door.
// Level (round 2): the app's tone map has a long toe (a radiance under about 0.03 lands under 20 of 255), and the room's
// paints and woods reflect 6 to 10 %: with the round-1b level (walls about 0.6) every surface away from a lamp sat at 5 to 12
// of 255 and no baked shadow could show. A club room's house light is a tenth to a twentieth of the table's: an open wall gets about 1.25 here, less toward
// the ceiling, the floor and the corners (the openness is measured over 3.5 m, so it grades whole walls, not only their edges).
// Round 3: the house light is moved off the floor and onto the walls and the ceiling. Round 2 gave the floor 0.52 (red), the
// ceiling 0.38 and added 0.80 on vertical surfaces: with it the floor around the played table held more light than the
// lamp's own spill (0.72 at 1 m from the long rail), and the walls between the wall lamps and the beams sat at the tone
// curve's toe. A club room's house light is wall light and ceiling light (shaded lamps, a lit bar, light through a door);
// the floor is what is left over.
export const BAKE_AMBIENT = Object.freeze({ sky: [0.34, 0.281, 0.216], ground: [0.75, 0.632, 0.493], side: [1.45, 1.16, 0.888] });
// The light volume's grid: cells of about 0.4 m, grid points at cell centres, the box = the room's interior.
export const VOLUME_CELL = 0.4;
// The arena (room.venue === 'arena'): a hall of 25 x 9.5 x 25 m. Its volume has cells of 0.8 m (about 12 000 grid points:
// twice the club room's, where 0.4 m would be seventeen times), its house light is the hall's own analytic ambient (the
// room's state carries it: arena/shell.js HALL), and the main lamp's pool is the one the hall set on the room light.
export const ARENA_VOLUME_CELL = 0.8;
// The height of a cell: 0.4 m. Seating rows rise 0.3 m, a board is 0.9 m tall with a lit rail on top, the table stands
// 0.8 m: with cells 0.8 m high a board's face read 2.2 / 2.3 / 3.0 units at 0.1 / 0.45 / 0.8 m up, with 0.4 m 1.8 / 2.6 / 5.1
// (the rail's light on the face next to it). 31 x 24 x 31 grid points, about 120 kB more in the file (trial b5 | b6, A2).
export const ARENA_VOLUME_CELL_Y = 0.4;
// The arena's table body as the bounce sees it (linear albedo before `gain`): the tournament fixture's apron and legs are a
// pale grey. A hint, as every albedo here: the bake page builds a stand-in table, not the app's.
// (0.035: the venue's hall body, wood/layout.js HALL_BODY: a dark matte body; A1's pale grey stood at about 0.2)
const ARENA_TABLE_BODY = [0.035, 0.035, 0.035];
// The arena's materials whose colour lives in a MAP the tool cannot read in node (an atlas of printed panels, decks and
// rails; the furniture's atlas): the surface's mean diffuse albedo, linear, before `gain`. Absolute: the material's colour
// and the vertex colours are not multiplied in. Without a row such a material would count as 0.25 (a pale grey board ring
// around the island, which the first bakes had). A part can also set `material.userData.bakeAlbedo = [r, g, b]` (the same
// meaning; it wins over this table). Hints for the BOUNCE only: the direct light does not read them.
// The numbers are the owners' (scratch/surround/NEED-FROM-bake.md 01:09Z, scratch/floor/NEED-FROM-bake.md 00:53Z): the mean
// linear colour of what each material really samples.
const ARENA_ALBEDO = {
  'arena.surround.board': [0.020, 0.040, 0.105],   // the printed panels: a dark slate blue, marks a few per cent of the area
  'arena.surround.deck': [0.030, 0.031, 0.036],    // decks, treads, fascias, the plinth, armrests, housings
  'arena.surround.metal': [0.070, 0.070, 0.075],   // aluminium frames, dark caps, painted steel, black tube, by area
  'arena.surround.seats': [0.052, 0.011, 0.014],   // the seat cards of the base and lite tiers (0.075, 0.016, 0.02 over the 70 % that is opaque)
  'arena.floor.hard': [0.030, 0.030, 0.035],       // cameras, pedestals, desks: black paint, rubber, anodised metal, dark cloth
  'arena.floor.leather': [0.033, 0.018, 0.012],    // the players' chairs: dark brown leather
};
// The arena's shell materials whose hue is in the VERTEX COLOUR and whose map is a relative pattern: albedo = vertex colour x
// this number. The material's own colour is NOT read: the shell changes it when a scan replaces its code-drawn canvas (the
// carpet: colour x the map's mean stays 0.80), and the bake page loads the scan while node does not; the product must not
// depend on that (the tree test compares albedo hashes of the two). The backdrop's map holds each floor light's scallop:
// mean 0.62 (the shell's numbers: scratch/shell/NEED-FROM-bake.md, 00:52Z).
// (the backdrop's map: 0.34 on every row since 01:16Z, 0.62 before: scratch/shell/NEED-FROM-bake.md)
const ARENA_VERTEX_MEAN = { 'arena.hall.carpet': 0.80, 'arena.hall.backdrop': 0.34 };
// The carpet's share in the bounce, on top of `gain` (which doubles every albedo, as in the club room). The island's carpet
// has an albedo of 0.03 and stands under about 10 units of the heads' light (the bed gets 5.7): in the frame it is a mid
// grey beside the bed. A hall gets that same grey from a carpet that reflects 15 to 20 % under a fifth of that light, and
// such a carpet throws back five to six times more light RELATIVE to the direct light around it: onto the board faces,
// the front rows, the table's legs and apron, and under the table. Scaling the bounce albedo by k gives exactly the
// picture of the scene with albedo x k under light / k (the direct picture is the same; every bounce path through the
// carpet gains k). So for the bounce the carpet counts at the albedo the frame shows: x 3 on top of `gain` 2, about 0.18
// on the island. A modelling choice for one material, recorded in the albedo hash; the direct light does not read it.
const ARENA_BOUNCE = { 'arena.hall.carpet': 3 };
// ROUND A3, THE ALBEDO LAW (CONTRACT 15.2): a room that publishes the albedo table (`room.layout.ALBEDO`: arena/layout.js)
// bounces what it reflects. The rows of ARENA_ALBEDO are rebuilt from the table (the hue of each row stays, its luminance
// is the table's value), the table's body takes the table's value, the carpet's x 3 share above is OFF (the carpet's
// albedo is now what round A2 pretended for the bounce), and the page's default `gain` for the arena is 1, not 2.
// A room without the table (a tree before round A3) keeps everything above as it was.
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const toLum = (c, v) => { const k = v / Math.max(1e-6, lum(c)); return c.map((x) => Math.round(x * k * 1000) / 1000); };
function arenaAlbedoRows(AL, metal) {
  if (!AL || !(AL.board > 0)) return null;
  return {
    'arena.surround.board': toLum(ARENA_ALBEDO['arena.surround.board'], AL.board),      // the navy print at the table's value
    'arena.surround.deck': toLum([1, 1.03, 1.16], AL.deck),                             // decks, treads, risers, fascias: dark painted board
    'arena.surround.metal': toLum(ARENA_ALBEDO['arena.surround.metal'], metal),         // frames, caps, painted steel: the metal share
    // the seat cards of the base and lite tiers: graphite fabric over the 70 % of a card that is opaque
    'arena.surround.seats': toLum([1, 1.03, 1.1], AL.seatFabric * 0.7),
    'arena.floor.hard': toLum(ARENA_ALBEDO['arena.floor.hard'], AL.camera),             // cameras, pedestals, platforms: matt black
    'arena.floor.leather': toLum(ARENA_ALBEDO['arena.floor.leather'], AL.leather),      // the players' chairs
  };
}

/**
 * collectScene(room, { table, cloth, hood, lamp, params, size }) -> everything bake-room-core.mjs needs.
 *   room    the club room service (createRoom's result), built and shown
 *   table   { group, cloth?: Mesh } the main table (or its stand-in); `cloth` is the mesh whose top is the lit bed
 *   hood    a mesh that stands in for the luminaire when the room has none (optional)
 *   lamp    { color: hex, intensity } of the app's rectangular lamp (its rectangle is read from the room's state)
 *   params  { gain, amb, ao, gather, maxEdge, volPhases }
 *   size    atlas size to rasterise at
 */
export function collectScene(room, { table = null, hood = null, lamp = null, params, size }) {
  const P = params;
  const T = [], F = [], A = [];
  const skipped = {}, added = {};
  const owned = { shell: [], props: [], luminaire: [], table: [] }; // world-space triangle coordinates by owner, in traversal order
  const arena = room.venue === 'arena';
  // (round A3: the hall's albedo table, when the room publishes one: see arenaAlbedoRows above)
  const lawRows = arena ? arenaAlbedoRows(room.layout?.ALBEDO ?? null, room.layout?.METAL_BOUNCE ?? 0.07) : null;
  const rowOf = (name) => (lawRows && lawRows[name]) || ARENA_ALBEDO[name] || null;
  const ownedPart = {};                                             // the arena only: the same by part (rig, surround, floor)
  const albedoOf = {};                                              // the arena only: sums of the bounce albedo by material
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  function addMesh(mesh, flag, albedoOverride = null) {
    const g = mesh.geometry, m = mesh.material;
    const posA = g.attributes.position;
    let colA = m.vertexColors ? g.attributes.color : null;
    // (the arena: an absolute albedo by `userData.bakeAlbedo` or by name: ARENA_ALBEDO; then no vertex colour is multiplied in)
    const ub = arena ? m.userData?.bakeAlbedo : null;
    const absolute = albedoOverride ? null : arena ? (Array.isArray(ub) && ub.length === 3 && ub.every(Number.isFinite) ? ub : rowOf(m.name)) : null;
    const vm = arena && !albedoOverride && !absolute ? (ARENA_VERTEX_MEAN[m.name] ?? null) : null;
    const base = albedoOverride ?? absolute ?? (vm !== null ? [vm, vm, vm] : null) ?? (() => { const mm = MAP_MEAN[m.name] ?? (m.map ? [0.25, 0.25, 0.25] : [1, 1, 1]); return [m.color.r * mm[0], m.color.g * mm[1], m.color.b * mm[2]]; })();
    if (absolute) colA = null;
    const n = g.index ? g.index.count : posA.count;
    const ix = (k) => (g.index ? g.index.getX(k) : k);
    const bounce = arena && !albedoOverride && !lawRows ? (ARENA_BOUNCE[m.name] ?? 1) : 1; // (1 for every club material: the product is bit for bit what it was; 1 under the albedo law)
    const cl = bounce === 1 ? (v) => Math.min(0.9, Math.max(0, v * P.gain)) : (v) => Math.min(0.9, Math.max(0, v * P.gain * bounce));
    const own = owned[ownerOf(flag, m.name || '')];
    const part = arena ? arenaPartOf(m.name || '') : null, ownPart = part ? (ownedPart[part] ??= []) : null;
    let count = 0;
    // an instanced mesh is every one of its instances (the arena's seats and truss members); a plain mesh is itself
    const worlds = mesh.isInstancedMesh === true
      ? Array.from({ length: mesh.count }, (_, i) => { const im = new THREE.Matrix4(); mesh.getMatrixAt(i, im); return im.premultiply(mesh.matrixWorld); })
      : [mesh.matrixWorld];
    for (const world of worlds) for (let k = 0; k + 2 < n; k += 3) {
      const a = ix(k), b = ix(k + 1), c = ix(k + 2);
      va.fromBufferAttribute(posA, a).applyMatrix4(world); vb.fromBufferAttribute(posA, b).applyMatrix4(world); vc.fromBufferAttribute(posA, c).applyMatrix4(world);
      T.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
      own.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
      if (ownPart) ownPart.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
      F.push(flag);
      let r = base[0], gg = base[1], bl = base[2];
      if (colA) {
        r *= (colA.getX(a) + colA.getX(b) + colA.getX(c)) / 3; gg *= (colA.getY(a) + colA.getY(b) + colA.getY(c)) / 3; bl *= (colA.getZ(a) + colA.getZ(b) + colA.getZ(c)) / 3;
      }
      A.push(cl(r), cl(gg), cl(bl));
      count += 1;
    }
    const key = m.name || mesh.name || 'unnamed';
    added[key] = (added[key] ?? 0) + count;
    // (the arena: the mean bounce albedo per material, after `gain`, for the record: a hint that is far off shows here)
    if (arena && count > 0) {
      const s = (albedoOf[key] ??= [0, 0, 0, 0]);
      for (let k = A.length - 3 * count; k < A.length; k += 3) { s[0] += A[k]; s[1] += A[k + 1]; s[2] += A[k + 2]; }
      s[3] += count;
    }
  }
  const shown = (o) => { for (let p = o; p; p = p.parent) { if (p === room.group) return true; if (!p.visible) return false; } return true; };
  const under = (o, name) => { for (let p = o; p; p = p.parent) if (p.name === name) return true; return false; };
  room.group.updateMatrixWorld(true);
  // The props and the luminaire join the room's group in the order their modules finish loading. The triangle order must not
  // depend on that (the solve is a pure function of the arrays): shell first, then the props, then the luminaire, each in its
  // own traversal order.
  const found = { shell: [], props: [], luminaire: [] };
  room.group.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const m = o.material;
    // the luminaire shows and hides with the player's camera (its own rule): for the bake it is always there
    const luminaire = under(o, 'clubLamp');
    const why = !(luminaire ? o.visible : shown(o)) ? 'hidden' : !(m?.isMeshStandardMaterial) ? 'unlit (emitter surface or overlay)' : o.name === 'clubRoomBrass' ? 'lamp hardware' : null;
    if (why) { skipped[why] = (skipped[why] ?? 0) + 1; return; }
    const flag = luminaire ? FLAG_LUMINAIRE : FLAG_OTHER;
    found[ownerOf(flag, m.name || '')].push([o, flag]);
  });
  for (const who of ['shell', 'props', 'luminaire']) for (const [o, flag] of found[who]) addMesh(o, flag);
  // the main table: the lit cloth bounces a neutralised cloth colour (the player can change the cloth; the map must not carry
  // one cloth's hue), everything else on it is dark
  if (table?.group) {
    table.group.updateMatrixWorld(true);
    const cloth = new THREE.Color(0x2f6fc0).lerp(new THREE.Color(0.5, 0.45, 0.37), 0.5);
    // (the arena's table is the tournament fixture's: a pale grey body and legs, not the club table's dark wood: its underside
    // and legs send the lit carpet's light on under the table)
    const tb = lawRows ? room.layout.ALBEDO.tableBody : null;
    const body = arena ? (tb > 0 ? [tb, tb, tb] : ARENA_TABLE_BODY) : [0.02, 0.02, 0.02];
    table.group.traverse((o) => { if (o.isMesh) addMesh(o, FLAG_TABLE, o === table.cloth ? [cloth.r, cloth.g, cloth.b] : body); });
  }
  const st = room.state();
  // without the club luminaire a hood stands in for it
  if (hood && st.lamp?.status !== 'built') { hood.updateMatrixWorld(true); addMesh(hood, FLAG_LUMINAIRE, [0.02, 0.03, 0.02]); }
  const srcT = Float32Array.from(T), srcF = Uint8Array.from(F), srcA = Float32Array.from(A);
  const tess = CORE.tessellate(srcT, srcF, srcA, P.maxEdge);

  // emitters: the room light's live list, packed exactly as web/scene/club/room/light.js sync() packs its uniforms
  // in the order of their ids: the props and the luminaire register theirs in the order their modules finish loading, and a
  // sum over emitters must not depend on that
  // (the arena also hands emitters that only the bake evaluates: `room.bakeEmitters`, records of the same form)
  // (round A6b, the arena only: `room.bakeRules`: { skip: [id prefixes the bake leaves out] }. Round A7: that is all of
  // it; the table stops light by its triangles. The club room has no such member.)
  const rules = arena && room.bakeRules ? room.bakeRules : null;
  const list = [...room.light.emitters, ...(arena && Array.isArray(room.bakeEmitters) ? room.bakeEmitters : [])]
    .filter((e) => !(rules && Array.isArray(rules.skip) && rules.skip.some((m) => String(e.id).startsWith(m))))
    .sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  const E = new Float32Array(list.length * CORE.EM_STRIDE);
  const nv = new THREE.Vector3(), av = new THREE.Vector3();
  list.forEach((e, i) => {
    const o = i * CORE.EM_STRIDE, t = TYPE[e.type] ?? 0, sz = e.size ?? [0, 0];
    const k = e.intensity * (t === 1 ? Math.max(1e-4, sz[0] * sz[1]) : 1);
    E.set([e.position.x, e.position.y, e.position.z, e.radius, e.color.r * k, e.color.g * k, e.color.b * k, t], o);
    if (e.normal) nv.copy(e.normal).normalize(); else nv.set(0, 0, 0);
    if (e.axis) av.copy(e.axis).normalize(); else av.set(0, 1, 0);
    let rs = 0, clear = 0.03;
    if (t === 1) {
      if (!e.normal) nv.set(0, -1, 0);
      av.addScaledVector(nv, -av.dot(nv));
      if (av.lengthSq() < 1e-6) { av.set(1, 0, 0); if (Math.abs(nv.x) > 0.9) av.set(0, 0, 1); av.addScaledVector(nv, -av.dot(nv)); }
      av.normalize();
      E.set([nv.x, nv.y, nv.z, sz[0] / 2, av.x, av.y, av.z, sz[1] / 2], o + 8);
      clear = 0.02;
    } else if (t === 2) {
      // (the arena only: a tube that carries a `normal` is one-sided: room/light.js sync(); a club tube is omni)
      const sided = arena && !!e.normal;
      E.set([sided ? nv.x : 0, sided ? nv.y : 0, sided ? nv.z : 0, sz[1] || 0.02, av.x, av.y, av.z, (sz[0] || 0.5) / 2], o + 8);
      clear = Math.max(0.03, 2 * (sz[1] || 0.02));
    } else {
      // (a cone, the arena only: room/light.js CONE and its sync(): 2 (a profile) or 4 (a wash) + cos(field half angle) in
      // the axis vector's w)
      const coned = arena && e.axis && Number.isFinite(e.cone) && e.cone > 0 && e.cone < 90;
      E.set([nv.x, nv.y, nv.z, sz[0] || 0.05, av.x, av.y, av.z, coned ? (e.bell === true ? 4 : 2) + Math.cos((e.cone * Math.PI) / 180) : e.axis ? Math.min(1, Math.max(0, sz[1] || 0.6)) : 0], o + 8);
      // the lamp as a shadow caster: a small sphere (a shade is about 0.18 m across), cleared of its own shade and hardware
      rs = Math.min(0.085, Math.max(0.03, (sz[0] || 0.05) * 0.35));
      // (a cone, the arena only: the head's own source radius, up to 0.4 m: a bank of profile lights or a frosted lens
      // casts a shadow edge as wide as it is; the 0.085 m cap above is a club wall lamp's shade)
      if (coned) rs = Math.min(0.4, Math.max(0.03, sz[0] || 0.05));
      clear = rs + 0.03;
    }
    E[o + 16] = rs; E[o + 17] = clear;
    // (shutters, the arena only, round A6: bake-room-core.mjs emitterTerm. `e.shutter`: a blade in focus, `e.foot`: a
    // blade out of focus; each the unit normal [x, y, z] of a plane through a point emitter, pointing to the lit side.
    // No club emitter carries one: the two numbers stay 0.)
    if (arena && t === 0) { E[o + 18] = CORE.packShutter(e.shutter); E[o + 19] = CORE.packShutter(e.foot); }
    // (side blades, the arena only: `e.sides`: two more planes of the same form, for a point emitter without a normal:
    // they ride in its normal's three numbers under the mark CORE.SIDED: bake-room-core.mjs emitterTerm)
    if (arena && t === 0 && !e.normal && Array.isArray(e.sides)) { E[o + 8] = CORE.packShutter(e.sides[0]); E[o + 9] = CORE.packShutter(e.sides[1]); E[o + 10] = CORE.SIDED; }
  });

  // the main lamp: its rectangle as the room reads it from the app's rect lights, its radiance from the caller
  let lampData = null;
  if (lamp && st.lampRect) {
    const c = new THREE.Color(lamp.color);
    // `pool`: the shaded lamp's open cone, as the shader applies it (room/light.js POOL / clubRoomLampPool)
    // (the arena sets its own pool on the room light: read it there; the club room's is the module's constant)
    const pl = arena ? room.light.state().pool : null;
    // (the arena, round A4: the gain is the hall's BAKED row, `levels.poolGain`. While no map is in use, as on the bake
    // page, the room light carries the analytic frame's stand-in gain (layout.js LIGHT.poolGainAnalytic), which a bake
    // must not take. A hall without that row has the same number in both places.)
    const plGain = pl && Number.isFinite(st.levels?.poolGain) ? st.levels.poolGain : pl?.gain;
    lampData = { cx: st.lampRect.cx, cz: st.lampRect.cz, hx: st.lampRect.hx, hz: st.lampRect.hz, y: st.lampRect.y, clear: 0.02, L: [c.r * lamp.intensity, c.g * lamp.intensity, c.b * lamp.intensity], pool: pl ? [pl.t0, pl.t1, plGain] : [POOL.t0, POOL.t1, POOL.gain] };
  }

  // texels: the shell's second UV set, rasterised
  const atlas = room.shell.lightmap;
  const chartKind = Int8Array.from(atlas.charts.map((c) => KIND[c.kind]));
  // (the arena's carpet SEES the main table: the rig's heads stand around it and their shadows of the table are the
  // floor's own light; the occlusion service keeps the table lamp's shadow, which is the alpha channel's and never sees the table)
  // (`params.floorTable === false`, the page's `floortable=0`: the arena's carpet ignores the table as the club's floor does)
  const floorSeesTable = arena && P.floorTable !== false;
  const chartIgnore = Uint8Array.from(atlas.charts.map((c) => (c.kind === 'floor' && !floorSeesTable ? FLAG_TABLE : 0)));
  const meshes = room.shell.lightmapMeshes.map((mesh) => {
    const g = mesh.geometry;
    mesh.updateMatrixWorld(true);
    const position = new Float32Array(g.attributes.position.count * 3), normal = new Float32Array(position.length);
    const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    // the normal a texel is lit with: the vertex's own, or the one the shell names (relief baked as its flat wall)
    const own = g.userData.lm.normal ?? null;
    for (let i = 0; i < g.attributes.position.count; i++) {
      va.fromBufferAttribute(g.attributes.position, i).applyMatrix4(mesh.matrixWorld); position.set([va.x, va.y, va.z], 3 * i);
      if (own && own[3 * i] === own[3 * i]) vb.set(own[3 * i], own[3 * i + 1], own[3 * i + 2]); else vb.fromBufferAttribute(g.attributes.normal, i);
      vb.applyMatrix3(nm).normalize(); normal.set([vb.x, vb.y, vb.z], 3 * i);
    }
    return { position, normal, lm: Float32Array.from(g.attributes.lm.array), index: Uint32Array.from(g.index.array), chart: g.userData.lm.chart, depth: g.userData.lm.depth };
  });
  const tex = CORE.rasterize(meshes, size);

  // the constant room ambient (BAKE_AMBIENT scaled by `amb`), weighted per texel by how open the hemisphere is
  // (`params.house`: another house light than the tool's, for the candidates page only; a bake that makes a file never sets it)
  const scaled = (a) => a.map((v) => v * P.amb);
  const hallAmbient = arena && st.levels?.ambientSky ? { sky: st.levels.ambientSky, ground: st.levels.ambientGround, side: st.levels.ambientSide } : null;
  const H = P.house?.sky && P.house.ground && P.house.side ? P.house : (hallAmbient ?? BAKE_AMBIENT);
  const ambient = { sky: scaled(H.sky), ground: scaled(H.ground), side: scaled(H.side) };
  // the light volume's grid over the room's interior box (grid points at cell centres)
  const bmin = room.box.min, bmax = room.box.max;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  // (the arena: cells of ARENA_VOLUME_CELL across the floor and ARENA_VOLUME_CELL_Y in height; `params.volCell` = [across,
  // height], the page's `volcell=a,h`, is for a trial)
  const okCell = (v) => Number.isFinite(v) && v >= 0.25 && v <= 1.6;
  const cell = arena ? (okCell(P.volCell?.[0]) ? P.volCell[0] : ARENA_VOLUME_CELL) : VOLUME_CELL;
  const cellY = arena ? (okCell(P.volCell?.[1]) ? P.volCell[1] : okCell(P.volCell?.[0]) ? P.volCell[0] : ARENA_VOLUME_CELL_Y) : VOLUME_CELL;
  const grid = {
    dims: [Math.max(2, Math.round((bmax.x - bmin.x) / cell)), Math.max(2, Math.round((bmax.y - bmin.y) / cellY)), Math.max(2, Math.round((bmax.z - bmin.z) / cell))],
    min: [r3(bmin.x), r3(bmin.y), r3(bmin.z)], max: [r3(bmax.x), r3(bmax.y), r3(bmax.z)], bias: VOLUME_BIAS,
  };
  // What exactly was baked, as content hashes of single-precision values (the record carries them; bake-room.mjs compares them
  // with the tree it writes into). `geometry` covers every blocker triangle and its class; the four owners split it.
  const lampArr = Float32Array.from(lampData ? [lampData.cx, lampData.cz, lampData.hx, lampData.hz, lampData.y, ...lampData.L] : []);
  const content = {
    geometry: hashOf(srcT, srcF),
    shell: hashOf(Float32Array.from(owned.shell)), props: hashOf(Float32Array.from(owned.props)),
    luminaire: hashOf(Float32Array.from(owned.luminaire)), table: hashOf(Float32Array.from(owned.table)),
    emitters: hashOf(E, lampArr), albedo: hashOf(srcA),
    triangles: { shell: owned.shell.length / 9, props: owned.props.length / 9, luminaire: owned.luminaire.length / 9, table: owned.table.length / 9 },
  };
  // (the arena: the parts' own hashes and triangle counts ride beside the four classes; the club record has no such member)
  if (arena) content.parts = Object.fromEntries(ARENA_PARTS.map((k) => [k, { hash: hashOf(Float32Array.from(ownedPart[k] ?? [])), triangles: (ownedPart[k] ?? []).length / 9 }]));
  return {
    content,
    scene: { tris: tess.tris, flags: tess.flags, albedo: tess.albedo, emitters: E, lamp: lampData, chartIgnore },
    tex, chartKind, atlas, grid, opts: { gatherRays: P.gather, aoRadius: P.ao, ambient, volumePhases: P.volPhases ?? 4 },
    info: { skipped, added, emitterIds: list.map((e) => e.id), triangles: tess.tris.length / 9, sourceTriangles: T.length / 9, texels: tex.count,
      ...(arena ? { floorTable: floorSeesTable, albedo: Object.fromEntries(Object.entries(albedoOf).map(([k, s]) => [k, [s[0] / s[3], s[1] / s[3], s[2] / s[3]].map((v) => Math.round(v * 1000) / 1000)])) } : {}) },
  };
}

/** The texel slots a job computes for rows [y0, y1): the band plus the margin its filters and its fill reach (12 rows). */
export function slotsForRows(tex, rows, margin = 12) {
  const want = [];
  for (let s = 0; s < tex.count; s++) if (tex.y[s] >= rows[0] - margin && tex.y[s] < rows[1] + margin) want.push(s);
  return want;
}

/** The mean indirect light over a job's own rows (see bake-room-core.mjs meanIndirect). */
export function ambientOfRows(tex, shaded, chartKind, rows) {
  const chart = [], slots = [];
  for (let s = 0; s < tex.count; s++) if (tex.y[s] >= rows[0] && tex.y[s] < rows[1]) { chart.push(tex.chart[s]); slots.push(s); }
  const own = new Float32Array(slots.length * CORE.TEXEL_STRIDE);
  slots.forEach((s, i) => own.set(shaded.subarray(s * CORE.TEXEL_STRIDE, (s + 1) * CORE.TEXEL_STRIDE), i * CORE.TEXEL_STRIDE));
  return CORE.meanIndirect({ count: slots.length, chart: Int16Array.from(chart) }, own, chartKind);
}

/**
 * The app's main table (pool_pro_9ft) as a few boxes, for pages that build the club room without the app. Its hull is the
 * app table's own bounding box to the last bit (half extents 1.4478 x 0.8128 m, rail top at y = 0.0562, read from the app
 * and stored, like the app's vertices, in single precision): the room derives its keep-out rectangle from that box, the props
 * plan and the emitter positions follow from the rectangle, and the bake's signature hashes those positions.
 * Returns { group, cloth (the mesh of the lit bed), materials: { cloth, dark } }.
 * `venue` (round A5; the ARENA only: the club room's stand-in is, block for block, what it always was): with 'arena' the
 * body under the rails is the app table's real section (the table role's per-mesh boxes of `pool_pro_9ft`, read in the
 * app 2026-11-15): a skirt that ends 0.133 m under the bed plane, a cabinet set back 0.16 m inside it whose underside
 * hangs at -0.387, and four tapered legs at their real centres. CONTRACT 17.2 asks for the table's shadow on the carpet
 * with an edge that reads: the one block that stood in for skirt and cabinet cast that edge from 0.51 m over the floor
 * (the real skirt: 0.66 m) and let a low key light 1.09 m under the outline (the real cabinet: 0.69 m). The hull (the
 * rails) is the same in both, so the room's keep-out rectangle and everything derived from it do not move.
 */
/** The arena's floor and the table's soles on the bake page and in the node build (round A7). In the app the default
 * pool table stands its levellers' soles 21.88 mm OVER the app's floor (-0.79; the soles at -0.76812) and arena/room.js
 * seats the whole hall up to the soles. The page builds no seat: its floor stays the app's floor (every floor-relative
 * number, the room's signature among them, is then the app's to the last bit) and the TABLE's stand-in stands
 * ARENA_SOLE_LIFT lower, soles on that floor: the same hall and table, seen from the floor. Before round A7 the stand-in
 * reached down to -0.79 with its bed at 0: the skirt's foot stood 0.657 m over the carpet (the app: 0.635) and every leg
 * was 22 mm too long (the table role's boxes of the app's table: TABLE-BOXES-A7.md of the lane). The club page is as it was. */
export const ARENA_FLOOR_Y = -0.79;
export const ARENA_SOLE_LIFT = 0.02188;
export function tableStandIn({ venue = 'club' } = {}) {
  const group = new THREE.Group();
  group.name = 'obTable';
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2f6fc0, roughness: 0.92 });
  cloth.userData.obClass = 'cloth';
  const dark = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.5 });
  const block = (x0, x1, y0, y1, z0, z1, m) => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) > 0 ? x1 : x0, p.getY(i) > 0 ? y1 : y0, p.getZ(i) > 0 ? z1 : z0);
    g.computeBoundingBox(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, m);
    group.add(mesh);
    return mesh;
  };
  // (round A7, the ARENA only: the rails' top stands at 0.0447 in the app (`dm-railtop-*`; 0.0562 is the top of the six
  // pocket collars) and the levellers end ARENA_SOLE_LIFT over the app's floor; the whole stand-in is then set down by
  // that much (below), soles on the page's floor. The club's stand-in keeps both numbers and stands where it stood.)
  const arena = venue === 'arena';
  const HX = 1.4478, HZ = 0.8128, TOP = arena ? 0.0447 : 0.0562, FLOOR = arena ? ARENA_FLOOR_Y + ARENA_SOLE_LIFT : -0.79;
  const bed = block(-1.27, 1.27, -0.02, 0, -0.635, 0.635, cloth);
  for (const s of [-1, 1]) {
    block(-HX, HX, -0.02, TOP, s > 0 ? 0.635 : -HZ, s > 0 ? HZ : -0.635, dark);       // long rails
    block(s > 0 ? 1.27 : -HX, s > 0 ? HX : -1.27, -0.02, TOP, -0.635, 0.635, dark);    // end rails
  }
  if (arena) {
    block(-1.4414, 1.4414, -0.1328, -0.02, -0.8064, 0.8064, dark);                     // the skirt (a blind around the cabinet)
    block(-1.279, 1.279, -0.387, -0.069, -0.640, 0.640, dark);                         // the cabinet, set back inside it
    for (const [x, z] of [[-1.2037, -0.5687], [1.2037, -0.5687], [-1.2037, 0.5687], [1.2037, 0.5687]]) {
      // a leg: square, 0.2192 m at its top (y -0.133), tapered to 0.1262 at y -0.7631; its leveler runs on to the floor
      const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const top = p.getY(i) > 0, h = top ? 0.1096 : 0.0631; p.setXYZ(i, x + (p.getX(i) > 0 ? h : -h), top ? -0.133 : -0.7631, z + (p.getZ(i) > 0 ? h : -h)); }
      g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
      group.add(new THREE.Mesh(g, dark));
      block(x - 0.0631, x + 0.0631, FLOOR, -0.7631, z - 0.0631, z + 0.0631, dark);
    }
    // (round A7) set down onto the page's floor: the soles at ARENA_FLOOR_Y, the bed plane ARENA_SOLE_LIFT under 0
    group.position.y = -ARENA_SOLE_LIFT;
    group.updateMatrixWorld(true);
    return { group, cloth: bed, materials: { cloth, dark } };
  }
  block(-1.43, 1.43, -0.28, -0.02, -0.795, 0.795, dark);                               // body
  for (const [x, z] of [[-1.12, -0.56], [1.12, -0.56], [-1.12, 0.56], [1.12, 0.56]]) block(x - 0.11, x + 0.11, FLOOR, -0.28, z - 0.11, z + 0.11, dark); // legs
  return { group, cloth: bed, materials: { cloth, dark } };
}
