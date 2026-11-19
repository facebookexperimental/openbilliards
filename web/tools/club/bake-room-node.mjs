#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// bake-room-node.mjs — a smoke run of the club room's light bake in node, with no browser and no GPU (bake role).
//
// It builds the real club room (createRoom(): shell, props, luminaire, emitters) against stand-ins for the app's room, table
// and lights, with a stub for the 2D canvas (textures are not needed to bake: only geometry, emitters and albedo hints are),
// collects the scene (bake-room-scene.mjs) and runs the same core as the bake page (bake-room-core.mjs), single-threaded.
// Use it to see that a change of the shell, the props or the tool still bakes, to read the numbers (texels, triangles, light
// levels, the signature) and to look at the atlas, before spending a job on the loan host. It is NOT how the shipped file is
// made: geometry built here goes through this engine's Math.sin / cos, so its last bits may differ from the browser's.
//
//   node web/tools/club/bake-room-node.mjs [--size 128] [--gather 16] [--patch 16] [--bounces 2] [--tier base|high|lite]
//        [--gain 2] [--amb 1] [--ao 3.5] [--full 16] [--rows a-b] [--out atlas.png] [--alpha alpha.png]
//        [--shot view.png --view V9|V1|V3|V10|far|bar|chairs|up|corner | --cam x,y,z,tx,ty,tz,fov] [--w 640] [--nolm]
//   node web/tools/club/bake-room-node.mjs --hash [--tier base]     the signature and the content hashes only (about 1 s)
//   --venue arena    the arena's hall (web/scene/club/arena/room.js) instead of the club room, in every mode above
//   node web/tools/club/bake-room-node.mjs --emitters               the packed emitter table at full precision
//   node web/tools/club/bake-room-node.mjs --against <record>       this machine's scene against a browser's ?dump=1 scene, bit for bit
// --shot writes a CPU preview of the room under the map just made: one ray per pixel against the same triangles; the shell
// shows its albedo times the map (plus the main lamp through the map's alpha), everything else its patch light. No emitter
// surfaces, no gloss, no post chain: it shows where light and shadow fall, not the app's frame. --nolm shows the shell
// under the unshadowed emitter formulas instead (the analytic light, without its constant ambient), for comparison.
// Keep it small on a shared machine: the default (128 px, 16 rays) is a few seconds of one core.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import nodeModule from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const three = pathToFileURL(path.resolve(here, '../../vendor/three.module.min.js')).href;
// the app's import map, for node: 'three' is the vendored build
if (typeof nodeModule.registerHooks === 'function') nodeModule.registerHooks({ resolve(specifier, context, nextResolve) { return specifier === 'three' ? { url: three, shortCircuit: true } : nextResolve(specifier, context); } });
else nodeModule.register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(three)}, shortCircuit: true }; return n(s, c); }`)}`);

const argv = process.argv.slice(2);
const arg = (name, d) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const num = (name, d) => { const v = Number(arg(name, d)); return Number.isFinite(v) ? v : d; };
const SIZE = num('size', 128);
const ARENA = arg('venue', 'club') === 'arena';
const P = { gather: num('gather', 16), patch: num('patch', 16), bounces: num('bounces', 2), gain: num('gain', ARENA ? 1 : 2), amb: num('amb', 1), ao: num('ao', 3.5), full: num('full', 16), maxEdge: ARENA ? 0.6 : 0.3 };
const tier = arg('tier', 'base');

// ---- a 2D canvas that accepts every call and draws nothing --------------------------------------------------------------------
function fakeCanvas() {
  const canvas = { width: 2, height: 2, style: {}, toDataURL: () => 'data:,', addEventListener() {}, removeEventListener() {} };
  const image = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w | 0) * Math.max(1, h | 0) * 4) });
  const known = {
    canvas, createImageData: (w, h) => image(w?.width ?? w, w?.height ?? h), getImageData: (_x, _y, w, h) => image(w, h),
    measureText: (t) => ({ width: String(t).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), createConicGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}), getLineDash: () => [], getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  const state = {};
  const ctx = new Proxy(known, {
    get(t, k) { if (k in t) return t[k]; if (k in state) return state[k]; return () => undefined; },
    set(_t, k, v) { state[k] = v; return true; },
  });
  canvas.getContext = () => ctx;
  return canvas;
}
globalThis.document = { createElement: (tag) => (tag === 'canvas' ? fakeCanvas() : { style: {}, appendChild() {}, addEventListener() {} }), createElementNS: () => fakeCanvas() };

const THREE = await import('three');
const { TIERS } = await import('../../scene/club/tiers.js');
const { createRoom } = ARENA ? await import('../../scene/club/arena/room.js') : await import('../../scene/club/room.js');
const CORE = await import('./bake-room-core.mjs');
const { collectScene, slotsForRows, ambientOfRows, tableStandIn, ARENA_FLOOR_Y } = await import('./bake-room-scene.mjs');

// ---- stand-ins for the app (the same numbers as web/tools/club/bake-room.html) -------------------------------------------------
const FLOOR_Y = ARENA ? ARENA_FLOOR_Y : -0.79, CEIL_Y = 2.45; // (the arena's carpet stands at the table's soles: bake-room-scene.mjs)
const LAMP = { w: 2.05, d: 0.66, y: 1.02, color: 0xf6f7f9, intensity: 7.8 };
const scene = new THREE.Scene();
const appGroup = new THREE.Group();
const std = (color) => new THREE.MeshStandardMaterial({ color });
const appFloor = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), std(0x3a2a20)); appFloor.rotation.x = -Math.PI / 2; appFloor.position.y = FLOOR_Y; appGroup.add(appFloor);
const appWalls = new THREE.Mesh(new THREE.BoxGeometry(9, CEIL_Y - FLOOR_Y + 0.02, 6), std(0x8a8070)); appGroup.add(appWalls);
const hood = new THREE.Mesh(new THREE.BoxGeometry(LAMP.w + 0.14, 0.10, LAMP.d + 0.14), std(0x142014)); hood.position.set(0, LAMP.y + 0.055, 0); appGroup.add(hood);
const lampFace = new THREE.Mesh(new THREE.PlaneGeometry(LAMP.w, LAMP.d), new THREE.MeshBasicMaterial({ color: 0xffffff })); lampFace.rotation.x = Math.PI / 2; lampFace.position.set(0, LAMP.y, 0); appGroup.add(lampFace);
const rectLight = new THREE.RectAreaLight(LAMP.color, LAMP.intensity, LAMP.w, LAMP.d); rectLight.position.set(0, LAMP.y, 0); rectLight.lookAt(0, 0, 0); appGroup.add(rectLight);
const hemi = new THREE.HemisphereLight(0x3a3a3e, 0x2a2a2c, 1.25); appGroup.add(hemi);
const fill = new THREE.PointLight(0xd9dcdf, 2.2, 0, 2); fill.position.set(3.2, 1.9, -2.3); appGroup.add(fill);
scene.add(appGroup);
const appRoom = { group: appGroup, giRefs: { floor: appFloor, hemi }, envRefs: [], lightRefs: { group: appGroup, rectLights: [rectLight], hemi, fill, lampFace, hood, rods: [], walls: appWalls, floor: appFloor } };
// (round A5, the arena only: the app table's real section under the rails; the club room's stand-in is unchanged)
const standIn = ARENA ? tableStandIn({ venue: 'arena' }) : tableStandIn();
const tableGroup = standIn.group, clothMesh = standIn.cloth;
scene.add(tableGroup);
scene.updateMatrixWorld(true);

const query = new URLSearchParams(`clublm=0&clubtier=${tier}`);
// textures are never fetched: every request keeps its flat placeholder (no stand-in canvases are generated)
const assets = { enabled: true, texture: (_id, o = {}) => o.fallback ?? new THREE.Texture(), ready: async () => undefined, bytes: async () => null, state: () => ({ failed: [] }) };
const club = {
  enabled: true, tier, knobs: TIERS[tier], time: { value: 0 }, ...(ARENA ? { venue: 'arena' } : {}),
  ctx: { renderer: null, scene, camera: new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 60), room: appRoom, table: { group: tableGroup }, rebakeEnv() {}, query },
  assets, adopt: null, env: { enabled: false }, occ: { enabled: false }, post: { enabled: false }, onFrame() {}, offFrame() {},
};
const warn = console.warn;
const warnings = [];
console.warn = (...a) => { warnings.push(a.map((x) => (x instanceof Error ? x.stack : String(x))).join(' ').slice(0, 400)); };
const t0 = Date.now();
const room = await createRoom(club);
console.warn = warn;
if (!room.enabled) { console.error(`createRoom returned a stub: ${room.reason}`); for (const w of warnings) console.error(`  ${w}`); process.exit(1); }
const tRoom = Date.now() - t0;
const st = room.state();

const col = collectScene(room, { table: { group: tableGroup, cloth: clothMesh }, hood, lamp: { color: LAMP.color, intensity: LAMP.intensity }, params: P, size: SIZE });
const { scene: sceneData, tex, chartKind, atlas, opts } = col;
// --hash: only what identifies the scene a bake would read (the room's signature and the content hashes), then stop.
// bake-room.mjs compares this with the record of the map it writes or checks.
// --emitters: the emitter table as the bake packs it, at full precision (to find which number differs between two machines)
if (argv.includes('--emitters')) {
  const E = sceneData.emitters, n = E.length / CORE.EM_STRIDE;
  for (let i = 0; i < n; i++) console.log(JSON.stringify({ id: col.info.emitterIds[i], row: Array.from(E.subarray(i * CORE.EM_STRIDE, (i + 1) * CORE.EM_STRIDE)) }));
  console.log(JSON.stringify({ lamp: sceneData.lamp }));
  process.exit(0);
}
// --texels: where each chart's texels lie (round A7: the arena room packs the map itself, arena/layout.js LM_PACK; this
// is the check that every texel lies in its chart's rectangle and which part of the world a chart holds). It rasterises
// the second UV set and stops: no light is computed.
if (argv.includes('--texels')) {
  const t = col.tex, k = SIZE / atlas.size, rows = [], r3t = (v) => Math.round(v * 1000) / 1000;
  for (let c = 0; c < atlas.charts.length; c++) {
    const ch = atlas.charts[c], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    let n = 0, out = 0;
    for (let s = 0; s < t.count; s++) {
      if (t.chart[s] !== c) continue;
      n++;
      for (let a = 0; a < 3; a++) { const v = t.pos[3 * s + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
      const x = t.x[s] + 0.5, y = t.y[s] + 0.5, w = ch.rot ? ch.h : ch.w, h = ch.rot ? ch.w : ch.h;
      if (x < ch.x * k - 0.5 || x > (ch.x + (ch.rot ? h : w)) * k + 0.5 || y < ch.y * k - 0.5 || y > (ch.y + (ch.rot ? w : h)) * k + 0.5) out++;
    }
    rows.push({ chart: `${ch.kind}:${ch.of}`, rect: [ch.x, ch.y, ch.w, ch.h], texels: n, outside: out, min: lo.map(r3t), max: hi.map(r3t) });
  }
  console.log(JSON.stringify({ size: SIZE, texels: t.count, charts: rows }));
  process.exit(0);
}
if (argv.includes('--hash')) {
  const s0 = room.lightmap.signature();
  if (ARENA) console.log(JSON.stringify({ sig: s0.sig, soft: s0.soft, parts: s0.parts ?? null, tier, venue: 'arena', content: col.content, rig: st.rig.status, surround: st.surround.status, floor: st.floorPart?.status ?? null, lamp: st.lamp.status, emitters: col.info.emitterIds.length, emitterIds: col.info.emitterIds, pool: sceneData.lamp?.pool ?? null,
    atlas: { size: atlas.size, texelsPerMetre: atlas.scale, charts: atlas.charts.map((c) => `${c.kind}:${c.of} ${c.mw}x${c.mh} m -> ${c.w}x${c.h} px`) }, sourceTriangles: col.info.sourceTriangles,
    albedo: col.info.albedo ?? null, floorAlbedo: room.floor?.albedo ?? null }));
  else console.log(JSON.stringify({ sig: s0.sig, soft: s0.soft, tier, content: col.content, props: st.props.status, lamp: st.lamp.status, emitters: col.info.emitterIds.length, pool: sceneData.lamp?.pool ?? null }));
  process.exit(0);
}
// --against <record of a ?dump=1 job>: does this machine build the scene the browser built? Compares the tessellated blocker
// triangles (per class), their albedo and the emitter table bit for bit with the dump, then stops.
if (arg('against', null)) {
  const dump = JSON.parse(fs.readFileSync(arg('against'), 'utf8')).eval?.scene;
  if (!dump?.tris) { console.error('--against needs the record of a job run with ?dump=1'); process.exit(1); }
  const un = (b64, Type) => { const u8 = zlib.gunzipSync(Buffer.from(CORE.fromBase64(b64))); return new Type(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)); };
  const theirs = { tris: un(dump.tris, Float32Array), flags: un(dump.flags, Uint8Array), albedo: un(dump.albedo, Float32Array), emitters: un(dump.emitters, Float32Array) };
  const bits = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
  const cmp = (name, a, b) => {
    let worst = 0, differ = 0;
    if (a.length === b.length) for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) { differ += 1; worst = Math.max(worst, Math.abs(a[i] - b[i])); }
    return { name, here: a.length, browser: b.length, identical: a.length === b.length && Buffer.compare(bits(a), bits(b)) === 0, valuesThatDiffer: a.length === b.length ? differ : null, largestDifference: worst };
  };
  const pick = (sc, flag, from = sc.tris, n = 9) => { const out = []; for (let t = 0; t < sc.flags.length; t++) if (sc.flags[t] === flag) for (let k = 0; k < n; k++) out.push(from[n * t + k]); return Float32Array.from(out); };
  const classes = { table: 1, luminaire: 2, 'shell + props': 4 };
  const out = [cmp('triangles (all, in order)', sceneData.tris, theirs.tris),
    ...Object.entries(classes).map(([n, f]) => cmp(`triangles: ${n}`, pick(sceneData, f), pick(theirs, f))),
    ...Object.entries(classes).map(([n, f]) => cmp(`albedo: ${n}`, pick(sceneData, f, sceneData.albedo, 3), pick(theirs, f, theirs.albedo, 3))),
    cmp('emitters', sceneData.emitters, theirs.emitters)];
  console.log(JSON.stringify({ against: path.basename(arg('against')), node: process.version, size: SIZE, results: out }, null, 1));
  process.exit(out.every((r) => r.identical) ? 0 : 2);
}
let rows = [0, SIZE];
if (arg('rows', null)) { const [a, b] = String(arg('rows')).split('-').map(Number); if (b > a) rows = [Math.max(0, a), Math.min(SIZE, b)]; }
const want = slotsForRows(tex, rows);
const t1 = Date.now();
const bvh = CORE.buildBVH(sceneData.tris, sceneData.flags);
const patchLight = CORE.solvePatches(sceneData, bvh, { rays: P.patch, bounces: P.bounces });
const t2 = Date.now();
const shaded = new Float32Array(tex.count * CORE.TEXEL_STRIDE);
for (let i = 0; i < want.length;) { let j = i; while (j + 1 < want.length && want[j + 1] === want[j] + 1) j += 1; shaded.set(CORE.shadeTexels(sceneData, bvh, patchLight, tex, want[i], want[j] + 1, opts), want[i] * CORE.TEXEL_STRIDE); i = j + 1; }
const t3 = Date.now();
const fin = CORE.finish(tex, shaded, SIZE, { fullScale: P.full });
const mi = ambientOfRows(tex, shaded, chartKind, rows);
const sig = room.lightmap.signature();

// per chart kind: mean and range of the lit texels (green), so a look change can be read as numbers
const byKind = {};
for (let s = 0; s < tex.count; s++) {
  const i = tex.y[s] * SIZE + tex.x[s];
  if (!fin.valid[i]) continue;
  const k = ['floor', 'wall', 'ceil', 'minor'][chartKind[tex.chart[s]]];
  const b = (byKind[k] ??= { n: 0, sum: 0, min: Infinity, max: 0, lampVis: 0 });
  const e = fin.lit[4 * i + 1];
  b.n += 1; b.sum += e; b.min = Math.min(b.min, e); b.max = Math.max(b.max, e); b.lampVis += fin.lit[4 * i + 3];
}
for (const b of Object.values(byKind)) { b.mean = +(b.sum / b.n).toFixed(4); b.lampVis = +(b.lampVis / b.n).toFixed(3); b.min = +b.min.toFixed(4); b.max = +b.max.toFixed(3); delete b.sum; }

console.log(JSON.stringify({
  size: SIZE, tier, params: P, ms: { room: tRoom, scene: t1 - t0 - tRoom, patches: t2 - t1, texels: t3 - t2, finish: Date.now() - t3 },
  signature: { sig: sig.sig, soft: sig.soft }, atlas: { scale: atlas.scale, charts: atlas.charts.length },
  scene: col.info, content: col.content, stats: fin.stats, ambient: { sky: mi.sky, ground: mi.ground, side: mi.side }, greenByKind: byKind,
  room: ARENA ? { rig: st.rig.status, surround: st.surround.status, lamp: st.lamp.status, emitters: st.light.emitters, shell: st.shell }
    : { props: st.props.status, lamp: st.lamp.status, emitters: st.light.emitters, lampsCovered: st.lampsCovered, shell: st.shell },
  warnings: warnings.slice(0, 8),
}, null, 1));

// ---- optional pictures of the atlas (8-bit PNG, RGB as stored / alpha as grey) --------------------------------------------------
const png = (file, rgb) => pngWH(file, rgb, SIZE, SIZE);
if (arg('out', null)) { const rgb = new Uint8Array(SIZE * SIZE * 3); for (let i = 0; i < SIZE * SIZE; i++) { rgb[3 * i] = fin.rgba[4 * i]; rgb[3 * i + 1] = fin.rgba[4 * i + 1]; rgb[3 * i + 2] = fin.rgba[4 * i + 2]; } png(arg('out'), rgb); }
if (arg('alpha', null)) { const rgb = new Uint8Array(SIZE * SIZE * 3); for (let i = 0; i < SIZE * SIZE; i++) rgb[3 * i] = rgb[3 * i + 1] = rgb[3 * i + 2] = fin.rgba[4 * i + 3]; png(arg('alpha'), rgb); }


// ---- optional CPU preview -------------------------------------------------------------------------------------------------------
if (arg('shot', null)) {
  const VIEWS = {
    V1: [[-2.3, 1.05, 1.35], [0.1, 0, 0], 40], V3: [[-2.15, 0.62, 0], [0.6, 0, 0], 38], V9: [[-4.0, 1.6, 2.6], [0, 0.3, 0], 50], V10: [[-4.2, 0.95, 2.8], [0, 0.25, 0], 50],
    far: [[-1.6, 0.9, -0.9], [2.2, -0.5, -4.6], 46], bar: [[0.6, 0.7, 2.2], [4.6, -0.4, -0.6], 46], chairs: [[-1.4, 0.5, 0.2], [-5.5, -0.5, -1.2], 44],
    up: [[-3.2, 0.2, 2.2], [1.5, 2.45, -1.5], 60], corner: [[1.5, 0.3, -2.0], [5.5, -0.6, -6.0], 40], back: [[3.6, 1.2, -2.6], [-1, 0.2, 1.0], 50],
    north: [[-0.6, 0.8, 1.2], [0.4, 0.75, -6], 48], west: [[1.0, 0.9, -0.5], [-5.5, 0.2, -1.5], 50], south: [[0.5, 0.9, -2.5], [-0.5, 0.2, 3.6], 55],
  };
  let [pos, tgt, fov] = VIEWS[arg('view', 'V9')] ?? VIEWS.V9;
  if (arg('cam', null)) { const c = String(arg('cam')).split(',').map(Number); pos = c.slice(0, 3); tgt = c.slice(3, 6); fov = c[6] || 40; }
  const W = num('w', 640), H = Math.round((W * 9) / 16);
  const noLm = argv.includes('--nolm');
  // the shell alone, with its light-map UVs and albedo per vertex
  const SHELL_ALBEDO = { clubRoomFloor: [0.123, 0.057, 0.021], clubRoomPlaster: [1, 1, 1], clubRoomWood: [0.139, 0.031, 0.009] };
  const sTris = [], sUV = [], sCol = [], sNor = [];
  const v = new THREE.Vector3();
  for (const mesh of room.shell.lightmapMeshes) {
    const g = mesh.geometry, base = SHELL_ALBEDO[mesh.name] ?? [0.2, 0.2, 0.2];
    const useCol = mesh.material.vertexColors === true;
    for (let k = 0; k < g.index.count; k += 3) {
      for (let c = 0; c < 3; c++) {
        const i = g.index.getX(k + c);
        v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(mesh.matrixWorld); sTris.push(v.x, v.y, v.z);
        sUV.push(g.attributes.lm.getX(i), g.attributes.lm.getY(i));
        sCol.push(base[0] * (useCol ? g.attributes.color.getX(i) : 1), base[1] * (useCol ? g.attributes.color.getY(i) : 1), base[2] * (useCol ? g.attributes.color.getZ(i) : 1));
        sNor.push(g.attributes.normal.getX(i), g.attributes.normal.getY(i), g.attributes.normal.getZ(i));
      }
    }
  }
  const shellBvh = CORE.buildBVH(Float32Array.from(sTris), null);
  const lit = fin.lit;
  const sample = (s, t, out) => {
    const x = Math.min(SIZE - 1.001, Math.max(0, s * SIZE - 0.5)), y = Math.min(SIZE - 1.001, Math.max(0, t * SIZE - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    for (let c = 0; c < 4; c++) {
      const a = lit[4 * (y0 * SIZE + x0) + c], b = lit[4 * (y0 * SIZE + x0 + 1) + c], d = lit[4 * ((y0 + 1) * SIZE + x0) + c], e = lit[4 * ((y0 + 1) * SIZE + x0 + 1) + c];
      out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
    }
  };
  const fwd = new THREE.Vector3(tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd);
  const th = Math.tan((fov * Math.PI) / 360);
  const rgb = new Uint8Array(W * H * 3);
  const pat = CORE.makePatterns(8);
  const E = sceneData.emitters, NE = E.length / CORE.EM_STRIDE;
  const aces = (x) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
  const enc = (x) => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  const lm4 = [0, 0, 0, 0];
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const sx = ((px + 0.5) / W * 2 - 1) * th * (W / H), sy = (1 - (py + 0.5) / H * 2) * th;
      let dx = fwd.x + right.x * sx + up.x * sy, dy = fwd.y + right.y * sx + up.y * sy, dz = fwd.z + right.z * sx + up.z * sy;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const sh = CORE.nearest(shellBvh, pos[0], pos[1], pos[2], dx, dy, dz, 1e9, 0);
      const st2 = CORE.HIT.t, su = CORE.HIT.u, sv = CORE.HIT.v, sBack = CORE.HIT.back;
      const ah = CORE.nearest(bvh, pos[0], pos[1], pos[2], dx, dy, dz, 1e9, 0);
      const at = CORE.HIT.t;
      let r = 0, g = 0, b = 0;
      if (ah >= 0 && (sh < 0 || at < st2 - 0.002)) {
        // a prop, a table, the luminaire: flat patch light
        const al = sceneData.albedo;
        r = al[3 * ah] * patchLight[3 * ah] / Math.PI; g = al[3 * ah + 1] * patchLight[3 * ah + 1] / Math.PI; b = al[3 * ah + 2] * patchLight[3 * ah + 2] / Math.PI;
      } else if (sh >= 0 && !sBack) {
        const w0 = 1 - su - sv, o6 = sh * 6, o9 = sh * 9;
        const s = w0 * sUV[o6] + su * sUV[o6 + 2] + sv * sUV[o6 + 4], t = w0 * sUV[o6 + 1] + su * sUV[o6 + 3] + sv * sUV[o6 + 5];
        const alb = [0, 1, 2].map((c) => w0 * sCol[o9 + c] + su * sCol[o9 + 3 + c] + sv * sCol[o9 + 6 + c]);
        let nx = w0 * sNor[o9] + su * sNor[o9 + 3] + sv * sNor[o9 + 6], ny = w0 * sNor[o9 + 1] + su * sNor[o9 + 4] + sv * sNor[o9 + 7], nz = w0 * sNor[o9 + 2] + su * sNor[o9 + 5] + sv * sNor[o9 + 8];
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const hx = pos[0] + dx * st2, hy = pos[1] + dy * st2, hz = pos[2] + dz * st2;
        let er = 0, eg = 0, eb = 0, lampVis = 1;
        if (noLm) {
          for (let e = 0; e < NE; e++) { const k = CORE.emitterTerm(E, e, hx, hy, hz, nx, ny, nz); if (k > 0) { er += E[e * CORE.EM_STRIDE + 4] * k; eg += E[e * CORE.EM_STRIDE + 5] * k; eb += E[e * CORE.EM_STRIDE + 6] * k; } }
          const amb = 1 / Math.max(P.amb, 1e-6); const upw = 0.5 + 0.5 * ny, sd = 1 - ny * ny, A = opts.ambient;
          er += (A.ground[0] + (A.sky[0] - A.ground[0]) * upw + A.side[0] * sd) * amb; eg += (A.ground[1] + (A.sky[1] - A.ground[1]) * upw + A.side[1] * sd) * amb; eb += (A.ground[2] + (A.sky[2] - A.ground[2]) * upw + A.side[2] * sd) * amb;
        } else { sample(s, t, lm4); er = lm4[0]; eg = lm4[1]; eb = lm4[2]; lampVis = lm4[3]; }
        // the main lamp, live in the app: here its unshadowed light times the map's alpha (and, on the floor, the main table's shadow)
        if (sceneData.lamp) {
          // ignore mask: the floor sees the main table alone (the occlusion service's shadow in the app), the rest sees nothing
          CORE.lampTerm(bvh, pat, sceneData.lamp, hx + nx * 0.004, hy + ny * 0.004, hz + nz * 0.004, nx, ny, nz, 0, ny > 0.9 && hy < -0.7 ? 6 : 7, true);
          const k = CORE.LOUT[1] * (noLm ? 1 : lampVis);
          er += sceneData.lamp.L[0] * k; eg += sceneData.lamp.L[1] * k; eb += sceneData.lamp.L[2] * k;
        }
        r = alb[0] * er / Math.PI; g = alb[1] * eg / Math.PI; b = alb[2] * eb / Math.PI;
      }
      const o = 3 * (py * W + px), ex = 0.85;
      rgb[o] = enc(aces(r * ex)); rgb[o + 1] = enc(aces(g * ex)); rgb[o + 2] = enc(aces(b * ex));
    }
  }
  pngWH(arg('shot'), rgb, W, H);
}
function pngWH(file, rgb, W, H) {
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  const crc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32BE(data.length, 0); h.write(type, 4, 'latin1'); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([h.subarray(4), data])), 0); return Buffer.concat([h, data, c]); };
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
