// Copyright (c) Meta Platforms, Inc. and affiliates.

// Class B arm (review cn8land1 P2, web/scene/table.js net deform closure):
// per-playback-frame cost of the corner cord-net deformation, and the
// byte identity of its output. game.js driveNetDress() calls deform(arr)
// on every playback frame while a cup is occupied (web/app/game.js:1826-1912,
// read-only consumer), building a FRESH argument array each frame:
//   w = smoothstep(min(1, tau / 0.04)); sw = w * swayK * fade(availT - tau)
// Settled cups (w = 1, sw = 0, tau far past the horizon) present identical
// numbers frame after frame; a catch changes them every frame.
// Node only: production buildTable under the CPU vm harness.
// Cross-tree identity: set OB_CN8_BASE_ROOT to an exported base tree
// (web/scene, web/vendor, web/dist/pool-sdk) to compare every frame's
// positions + normals byte-for-byte against that tree's deform.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildTransportInputs } from './cpu_table_inputs.mjs';

const ALIASES = ['chinese8_pro_9ft', 'joy_q8_9ft'];
const CORNERS = [0, 2, 3, 5];
const BALL_R = 0.028575;
const FRAMES = 60;
// Bounds (ORDER-CN8LAND-FIX1 class B): settled <= 0.5 ms per frame (a cached
// cup does no work, so the bound holds for one AND four cups); a catch frame
// recomputes and must stay <= 4 ms per occupied cup.
const BOUND_SETTLED_MS = 0.5;
const BOUND_CATCH_MS_PER_CUP = 4;

const cache = new Map();
// cord mesh -> the build's own (authored) normals, captured before any deform: a reset restores exactly these (GH-976:
// a cached cn8 build must come back identical to a fresh one, so the reset no longer recomputes them)
const pristine = new WeakMap();
function capturePristine(b) {
  for (const i of CORNERS) {
    const m = b.group.getObjectByName(`cn8-net-low-${i}`);
    if (m && !pristine.has(m)) pristine.set(m, m.geometry.attributes.normal.array.slice());
  }
  return b;
}
async function built(alias, root) {
  const key = `${root ?? ''}|${alias}`;
  if (!cache.has(key)) cache.set(key, capturePristine(await buildTransportInputs(root ? { root, tableId: alias } : { tableId: alias })));
  return cache.get(key);
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytesOf = attr => Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength);
const bytesOfArray = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

function driveArgs(net, tau, { availT = 1.0, slot = 0 } = {}) {
  const wr = Math.min(1, tau / 0.04);
  const w = wr * wr * (3 - 2 * wr);
  let sw = w;
  const span = Math.min(0.25, availT);
  const rem = (availT - tau) / span;
  const c = Math.min(1, Math.max(0, rem));
  sw *= c * c * (3 - 2 * c);
  const rest = net.restAt(slot);
  return { x: rest.x, y: rest.y + (1 - w) * 0.02, z: rest.z, r: BALL_R, w, tau, sw };
}
const settledArgs = (net, slot = 0) => ({ ...net.restAt(slot), r: BALL_R, w: 1, sw: 0, tau: 1e6 });

function cornerNets(b) {
  return CORNERS.map(i => {
    const p = b.G.pockets[i];
    const net = b.sinkDressFor(p.x, p.z)?.net;
    const mesh = b.group.getObjectByName(`cn8-net-low-${i}`);
    assert.ok(net?.deform && mesh, `corner ${i}: net closure and cn8-net-low mesh`);
    return { i, net, mesh };
  });
}

function timeFrames(run, frames = FRAMES) {
  const t = [];
  for (let f = 0; f < frames; f++) {
    const start = performance.now();
    run(f);
    t.push(performance.now() - start);
  }
  t.sort((a, b) => a - b);
  return { median: t[frames >> 1], p95: t[Math.floor(frames * 0.95)], max: t[frames - 1] };
}

const fmt = ms => ms.toFixed(3);

for (const alias of ALIASES) {
  test(`B/cost: per-frame deform cost, 1 and 4 occupied cups, settled and during a catch: ${alias}`, async () => {
    const b = await built(alias);
    const nets = cornerNets(b);
    const geom = nets[0].mesh.geometry;
    console.log(`NET-DEFORM-MESH table=${alias} vertices=${geom.attributes.position.count} triangles=${geom.index.count / 3}`);
    const rows = [];
    for (const cups of [1, 4]) {
      const active = nets.slice(0, cups);
      // catch: tau advances one frame at a time (fresh args every frame)
      for (const { net } of nets) net.deform([]);
      const catchT = timeFrames(f => { for (const { net } of active) net.deform([driveArgs(net, (f + 1) / FRAMES)]); });
      // settled: the same numbers every frame (fresh objects, as game.js builds them)
      for (const { net } of active) net.deform([settledArgs(net)]);
      const settledT = timeFrames(() => { for (const { net } of active) net.deform([settledArgs(net)]); });
      rows.push({ cups, state: 'catch', ...catchT, bound: BOUND_CATCH_MS_PER_CUP * cups });
      rows.push({ cups, state: 'settled', ...settledT, bound: BOUND_SETTLED_MS });
      for (const { net } of nets) net.deform([]);
    }
    for (const r of rows) {
      console.log(`NET-DEFORM-COST table=${alias} cups=${r.cups} state=${r.state} median_ms=${fmt(r.median)} p95_ms=${fmt(r.p95)} max_ms=${fmt(r.max)} bound_ms=${r.bound} ${r.median <= r.bound ? 'OK' : 'OVER'}`);
    }
    for (const r of rows) {
      assert.ok(r.median <= r.bound,
        `${alias} cups=${r.cups} ${r.state}: median ${fmt(r.median)} ms exceeds the ${r.bound} ms bound`);
    }
  });

  test(`B/normals: deformed normals equal a full three.js computeVertexNormals of the same positions; a reset restores the build's own normals: ${alias}`, async () => {
    const b = await built(alias);
    const T = b.THREE;
    const nets = cornerNets(b);
    let checked = 0;
    for (const { i, net, mesh } of nets) {
      const g = mesh.geometry;
      const states = [
        [driveArgs(net, 1 / FRAMES)], [driveArgs(net, 0.02)], [driveArgs(net, 0.3)], [driveArgs(net, 0.9)],
        [settledArgs(net), driveArgs(net, 0.02, { slot: 1 })], [settledArgs(net), driveArgs(net, 0.3, { slot: 1 })],
        [settledArgs(net), settledArgs(net, 1)], [settledArgs(net)], [],
      ];
      for (const args of states) {
        net.deform(args);
        if (args.length === 0) {
          // the reset: the build's own normals, byte for byte (not a recompute of the authored positions)
          const want = pristine.get(mesh);
          assert.ok(want, `corner ${i}: the build's own normals were captured before any deform`);
          assert.equal(sha(bytesOf(g.attributes.normal)), sha(bytesOfArray(want)),
            `corner ${i} reset: normals differ from the build's own`);
          checked++;
          continue;
        }
        const ref = new T.BufferGeometry();
        ref.setAttribute('position', new T.BufferAttribute(g.attributes.position.array.slice(), 3));
        ref.setIndex(new T.BufferAttribute(g.index.array.slice(), 1));
        ref.computeVertexNormals();
        assert.equal(sha(bytesOf(g.attributes.normal)), sha(bytesOf(ref.attributes.normal)),
          `corner ${i} balls=${args.length} tau=${args[args.length - 1]?.tau ?? 'rest'}: normals differ from a full recompute`);
        checked++;
      }
    }
    console.log(`NET-DEFORM-NORMALS table=${alias} states_checked=${checked} occupied_identical_to_full_recompute=true reset_identical_to_build=true`);
  });

  test(`B/seek: a repeated frame equals its first evaluation and reset restores the authored mesh: ${alias}`, async () => {
    const b = await built(alias);
    const nets = cornerNets(b);
    for (const { i, net, mesh } of nets) {
      const g = mesh.geometry;
      const snap = () => sha(Buffer.concat([bytesOf(g.attributes.position), bytesOf(g.attributes.normal)]));
      const base = snap();
      const A = [driveArgs(net, 0.3)];
      const B = [settledArgs(net), driveArgs(net, 0.05, { slot: 1 })];
      net.deform(A); const a1 = snap();
      net.deform(B); const b1 = snap();
      assert.notEqual(a1, b1, `corner ${i}: distinct states produce distinct meshes`);
      net.deform(A); assert.equal(snap(), a1, `corner ${i}: seek back reproduces frame A`);
      net.deform(A); assert.equal(snap(), a1, `corner ${i}: the repeated frame A is unchanged`);
      net.deform(B); net.deform(B); assert.equal(snap(), b1, `corner ${i}: the repeated frame B is unchanged`);
      net.deform([settledArgs(net)]); const s1 = snap();
      net.deform([settledArgs(net)]); assert.equal(snap(), s1, `corner ${i}: settled frame is stable`);
      net.deform([]); assert.equal(snap(), base, `corner ${i}: reset restores the authored positions and normals`);
      net.deform([]); assert.equal(snap(), base, `corner ${i}: a second reset is a no-op`);
    }
    console.log(`NET-DEFORM-SEEK table=${alias} corners=${nets.length} seek_identity=true`);
  });

  test(`B/identity: every frame's positions + normals and the settled mesh match the base tree: ${alias}`, async t => {
    const baseRoot = process.env.OB_CN8_BASE_ROOT;
    if (!baseRoot) { t.skip('set OB_CN8_BASE_ROOT=<exported base tree> to run the cross-tree identity arm'); return; }
    // Fresh builds on both sides (the shared cache entry was deformed by the
    // subtests above): both trees start from their authored cord meshes.
    const head = capturePristine(await buildTransportInputs({ tableId: alias }));
    const base = await buildTransportInputs({ root: baseRoot, tableId: alias });
    const hn = cornerNets(head), bn = cornerNets(base);
    let frames = 0;
    {
      // Stated fact, not a gate: whether the authored normals equal a
      // three.js recompute of the authored positions. Since GH-976 the
      // head's reset restores the build's own normals instead of a
      // recompute, so on reset frames only the positions are compared
      // across the trees and the head's normals must be its own build's.
      const T = head.THREE; const g = hn[0].mesh.geometry;
      const ref = new T.BufferGeometry();
      ref.setAttribute('position', new T.BufferAttribute(g.attributes.position.array.slice(), 3));
      ref.setIndex(new T.BufferAttribute(g.index.array.slice(), 1));
      ref.computeVertexNormals();
      console.log(`NET-DEFORM-AUTHORED table=${alias} authored_normals_equal_recompute=${sha(bytesOf(g.attributes.normal)) === sha(bytesOf(ref.attributes.normal))}`);
    }
    for (let k = 0; k < CORNERS.length; k++) {
      const H = hn[k], Bn = bn[k];
      const meshSha = m => sha(Buffer.concat([...Object.keys(m.geometry.attributes).sort().map(k => bytesOf(m.geometry.attributes[k])),
        bytesOf(m.geometry.index)]));
      assert.equal(meshSha(H.mesh), meshSha(Bn.mesh), `corner ${H.i}: authored cord mesh differs from the base tree`);
      const seq = [];
      for (let f = 0; f < FRAMES; f++) seq.push(n => [driveArgs(n, (f + 1) / FRAMES)]);
      for (const tau of [0.02, 0.3]) seq.push(n => [settledArgs(n), driveArgs(n, tau, { slot: 1 })]);
      seq.push(n => [settledArgs(n), settledArgs(n, 1)], n => [settledArgs(n)], n => [settledArgs(n)], () => [], () => []);
      for (const make of seq) {
        const args = make(H.net);
        H.net.deform(args); Bn.net.deform(make(Bn.net));
        if (args.length === 0) {
          assert.equal(sha(bytesOf(H.mesh.geometry.attributes.position)), sha(bytesOf(Bn.mesh.geometry.attributes.position)),
            `corner ${H.i} frame ${frames}: reset positions differ from the base tree`);
          assert.equal(sha(bytesOf(H.mesh.geometry.attributes.normal)), sha(bytesOfArray(pristine.get(H.mesh))),
            `corner ${H.i} frame ${frames}: the head's reset normals differ from its own build's`);
        } else {
          const hs = sha(Buffer.concat([bytesOf(H.mesh.geometry.attributes.position), bytesOf(H.mesh.geometry.attributes.normal)]));
          const bs = sha(Buffer.concat([bytesOf(Bn.mesh.geometry.attributes.position), bytesOf(Bn.mesh.geometry.attributes.normal)]));
          assert.equal(hs, bs, `corner ${H.i} frame ${frames}: deformed positions/normals differ from the base tree`);
        }
        frames++;
      }
      const shapeSha = m => sha(Buffer.concat([...Object.keys(m.geometry.attributes).filter(k => k !== 'normal').sort()
        .map(k => bytesOf(m.geometry.attributes[k])), bytesOf(m.geometry.index)]));
      assert.equal(shapeSha(H.mesh), shapeSha(Bn.mesh), `corner ${H.i}: settled mesh after reset differs from the base tree`);
      assert.equal(sha(bytesOf(H.mesh.geometry.attributes.normal)), sha(bytesOfArray(pristine.get(H.mesh))),
        `corner ${H.i}: the head's settled normals after reset differ from its own build's`);
    }
    console.log(`NET-DEFORM-IDENTITY table=${alias} base_root=${baseRoot} frames_compared=${frames} identical=true`);
  });
}
