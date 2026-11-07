// Copyright (c) Meta Platforms, Inc. and affiliates.

// Class A arm (review cn8land1 P1, web/scene/table.js net deform closure):
// a CN8 corner net's deform() closure outlives its build. game.js keeps every
// deformed closure in `netTouched` and its resetNets() runs on every rerack
// (web/app/game.js resetNets: restore every touched sock, clear the set,
// then sweep the retained and live sets; a throwing sock must not strand
// the clear or the sweeps — the A/throw row below slices that production
// body directly).
// After a pot, a switch to a non-CN8 table removes the cn8-net-low-* meshes;
// the stale closure must then be a no-op (never a throw) so the clear runs.
// Node only: production buildTable + prepareEquipment under the CPU vm harness.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTransportInputs } from './cpu_table_inputs.mjs';

const fixtureRoot = fileURLToPath(new URL('../../../', import.meta.url));
const root = process.env.OB_CN8_ARCHIVE_ROOT ?? fixtureRoot;
const CN8 = 'chinese8_pro_9ft';
const POOL = 'diamond_proam_9ft';
const BALL_R = 0.028575;
const CORNERS = [0, 2, 3, 5];

// Local model of the game.js consumer's reset shape (a Set of table-side
// closures); not a copy of the production body — A/throw slices production.
function gameResetNets(netTouched) {
  for (const fx of netTouched) fx.deform([]);
  netTouched.clear();
}

// game.js:1836-1838 rebind + 1839 skip: a non-cn8 build answers null and the
// deform lane skips; a cn8 build answers the LIVE spec.
function gameDriveFrame(b, pocket, netTouched, ball) {
  const cur = b.sinkDressFor(pocket.x, pocket.z);
  if (!cur?.net?.deform) return null;
  cur.net.deform([ball]); netTouched.add(cur.net);
  return cur.net;
}

async function switchTo(b, id) {
  const r = b.prepareEquipment({ table_id: id, cloth_id: 'standard' });
  const ok = r?.then ? await r : r;
  assert.equal(ok, true, `prepareEquipment(${id}) must apply`);
  assert.equal(b.tableId(), id, 'active table id after the switch');
  b.group.updateMatrixWorld(true);
  // rebuild() fires guarded dynamic imports (room.js stub); let them settle.
  await new Promise(resolve => setTimeout(resolve, 60));
}

const restBall = net => ({ ...net.restAt(0), r: BALL_R, w: 1, sw: 0, tau: 1e6 });

test('A/red: CN8 corner pot -> non-CN8 switch -> rerack resetNets never throws and empties netTouched', async () => {
  const b = await buildTransportInputs({ tableId: CN8 });
  const netTouched = new Set();
  const potted = [];
  for (const i of CORNERS) {
    const p = b.G.pockets[i];
    const mesh = b.group.getObjectByName(`cn8-net-low-${i}`);
    assert.ok(mesh, `cn8-net-low-${i} exists on the CN8 build`);
    const base = mesh.geometry.attributes.position.array.slice();
    const net = gameDriveFrame(b, p, netTouched, { ...b.sinkDressFor(p.x, p.z).net.restAt(0), r: BALL_R, w: 1, sw: 0, tau: 1e6 });
    assert.ok(net, `corner ${i} has a net deform lane`);
    assert.notDeepEqual(mesh.geometry.attributes.position.array, base, `corner ${i} sock wraps the potted ball`);
    potted.push({ i, mesh, net });
  }
  assert.equal(netTouched.size, 4, 'four touched closures before the switch');
  await switchTo(b, POOL);
  for (const { i } of potted) {
    assert.equal(b.group.getObjectByName(`cn8-net-low-${i}`), undefined,
      `cn8-net-low-${i} is removed by the non-CN8 rebuild`);
  }
  let thrown = null;
  try { gameResetNets(netTouched); } catch (error) { thrown = error; }
  console.log(`NET-RESET-ACROSS-BUILDS pot=${CN8} switch=${POOL} rerack_throw=${thrown ? `${thrown.name}: ${thrown.message}` : 'none'} netTouched=${netTouched.size}`);
  assert.equal(thrown, null, `resetNets threw after the switch: ${thrown?.name}: ${thrown?.message}`);
  assert.equal(netTouched.size, 0, 'netTouched is empty after the rerack');
  // The next shot on the non-CN8 table proceeds: the deform lane skips
  // (sinkDressFor answers null for a pool corner), nothing is touched, and
  // the rerack after that shot is a clean no-op too.
  for (const i of CORNERS) {
    const p = b.G.pockets[i];
    assert.equal(gameDriveFrame(b, p, netTouched, { x: p.x, y: -0.1, z: p.z, r: BALL_R, w: 1, sw: 0, tau: 1 }), null,
      `pool corner ${i}: no net deform lane`);
  }
  assert.equal(netTouched.size, 0, 'no closure touched by the pool shot');
  gameResetNets(netTouched);
  // A retired closure driven directly (a stale sink entry) is a no-op too.
  let thrown2 = null;
  try { for (const { net } of potted) { net.deform([restBall(net)]); net.deform([]); } } catch (error) { thrown2 = error; }
  assert.equal(thrown2, null, `retired closure threw: ${thrown2?.name}: ${thrown2?.message}`);
});

test('A/reverse: non-CN8 -> CN8 switch keeps the catch/reset law exact', async () => {
  const b = await buildTransportInputs({ tableId: POOL });
  assert.equal(b.sinkDressFor(b.G.pockets[0].x, b.G.pockets[0].z), null, 'pool build has no cn8 sink specs');
  await switchTo(b, CN8);
  const netTouched = new Set();
  for (const i of CORNERS) {
    const p = b.G.pockets[i];
    const mesh = b.group.getObjectByName(`cn8-net-low-${i}`);
    assert.ok(mesh, `cn8-net-low-${i} exists after the reverse switch`);
    const position = mesh.geometry.attributes.position;
    const base = position.array.slice();
    const net = gameDriveFrame(b, p, netTouched, { ...b.sinkDressFor(p.x, p.z).net.restAt(0), r: BALL_R, w: 1, sw: 0, tau: 1e6 });
    assert.ok(net, `corner ${i}: live net after the reverse switch`);
    assert.notDeepEqual(position.array, base, `corner ${i}: catch deforms the live cords`);
    const caught = position.array.slice();
    net.deform([restBall(net)]);
    assert.deepEqual(position.array, caught, `corner ${i}: catch is a pure function of its arguments`);
  }
  gameResetNets(netTouched);
  assert.equal(netTouched.size, 0);
  for (const i of CORNERS) {
    const mesh = b.group.getObjectByName(`cn8-net-low-${i}`);
    const p = b.G.pockets[i];
    const fresh = b.sinkDressFor(p.x, p.z).net;
    const before = mesh.geometry.attributes.position.array.slice();
    fresh.deform([restBall(fresh)]); fresh.deform([]);
    assert.deepEqual(mesh.geometry.attributes.position.array, before, `corner ${i}: reset restores the exact authored net`);
  }
  console.log(`NET-RESET-REVERSE switch=${POOL}->${CN8} corners=${CORNERS.length} netTouched=${netTouched.size}`);
});

test('A/rebuild: a torn-down build\'s closure is dropped; the rebuilt CN8 table gets fresh closures', async () => {
  // GH-976: with the per-spec table cache on, a switch away DETACHES the CN8 build and the switch back restores it
  // (A/cache-hit below). A real teardown is the cache-off path: the scripted-boot arm table-cache-off.
  const b = await buildTransportInputs({ tableId: CN8, search: '?obtool=1&obArm=table-cache-off' });
  const p = b.G.pockets[0];
  const stale = b.sinkDressFor(p.x, p.z).net;
  const staleMesh = b.group.getObjectByName('cn8-net-low-0');
  stale.deform([restBall(stale)]);
  await switchTo(b, POOL);
  await switchTo(b, CN8);
  const live = b.sinkDressFor(p.x, p.z).net;
  const liveMesh = b.group.getObjectByName('cn8-net-low-0');
  assert.ok(live && live !== stale, 'the rebuilt table publishes a new net closure');
  assert.ok(liveMesh && liveMesh !== staleMesh, 'the rebuilt table draws a new cn8-net-low-0 mesh');
  const liveBase = liveMesh.geometry.attributes.position.array.slice();
  let thrown = null;
  try { stale.deform([restBall(stale)]); } catch (error) { thrown = error; }
  assert.equal(thrown, null, `stale closure threw on the rebuilt table: ${thrown?.name}: ${thrown?.message}`);
  assert.deepEqual(liveMesh.geometry.attributes.position.array, liveBase,
    'a stale closure never writes the rebuilt table\'s cords (same-name mesh of the NEXT build)');
  try { stale.deform([]); } catch (error) { thrown = error; }
  assert.equal(thrown, null, `stale closure reset threw: ${thrown?.name}: ${thrown?.message}`);
  assert.deepEqual(liveMesh.geometry.attributes.position.array, liveBase, 'a stale reset never writes the rebuilt cords');
  live.deform([restBall(live)]);
  assert.notDeepEqual(liveMesh.geometry.attributes.position.array, liveBase, 'the live closure deforms the live cords');
  live.deform([]);
  assert.deepEqual(liveMesh.geometry.attributes.position.array, liveBase, 'the live closure resets exactly');
  console.log(`NET-RESET-REBUILD ${CN8}->${POOL}->${CN8} stale_closure_dropped=${live !== stale} stale_throw=${thrown ? thrown.message : 'none'}`);
});

test('A/cache-hit: a re-entry restores the cached CN8 build; its closure is live again and resets exactly (GH-976)', async () => {
  const b = await buildTransportInputs({ tableId: CN8 });
  const p = b.G.pockets[0];
  const net = b.sinkDressFor(p.x, p.z).net;
  const mesh = b.group.getObjectByName('cn8-net-low-0');
  const base = mesh.geometry.attributes.position.array.slice();
  net.deform([restBall(net)]);
  assert.notDeepEqual(mesh.geometry.attributes.position.array, base, 'the closure deforms the cords before the switch');
  await switchTo(b, POOL);
  // while detached the closure is a no-op (its mesh left the group), never a throw
  let thrown = null;
  try { net.deform([restBall(net)]); net.deform([]); } catch (error) { thrown = error; }
  assert.equal(thrown, null, `the detached build's closure threw: ${thrown?.name}: ${thrown?.message}`);
  await switchTo(b, CN8);
  const live = b.sinkDressFor(p.x, p.z).net;
  const liveMesh = b.group.getObjectByName('cn8-net-low-0');
  assert.equal(live, net, 'the cache hit brings the same net closure back');
  assert.equal(liveMesh, mesh, 'the cache hit brings the same cn8-net-low-0 mesh back');
  assert.deepEqual(liveMesh.geometry.attributes.position.array, base,
    'the switch away reset the dented sock while attached: the restored cords are the authored ones');
  live.deform([restBall(live)]);
  assert.notDeepEqual(liveMesh.geometry.attributes.position.array, base, 'the restored closure deforms the restored cords');
  live.deform([]);
  assert.deepEqual(liveMesh.geometry.attributes.position.array, base, 'and resets them exactly');
  console.log(`NET-RESET-CACHE-HIT ${CN8}->${POOL}->${CN8} same_closure=true same_mesh=true restored_authored=true`);
});

test('A/throw: a throwing sock never strands the clear or the sweeps, and the first error is rethrown', () => {
  const gameSource = fs.readFileSync(path.join(root, 'web/app/game.js'), 'utf8');
  const start = gameSource.indexOf('  const resetNets = () => {');
  assert.ok(start >= 0, 'Production resetNets anchor');
  const slice = gameSource.slice(start, gameSource.indexOf('\n  };\n', start) + 5);
  const calls = [], swept = [];
  const first = new Error('first stale closure');
  const sock = (name, error) => ({ deform(list) { calls.push(`${name}:${list.length}`); if (error) throw error; } });
  const netTouched = new Set([sock('a', null), sock('b', first), sock('c', null), sock('d', new Error('second stale closure'))]);
  const nettedRetained = new Map(), restRetained = new Map();
  const setNetBallEnv = (b) => { swept.push(`env:${b.id}`); };
  const setWellBallOccl = (b) => { swept.push(`occl:${b.id}`); };
  const g = { ballSet: { balls: [{ id: 1 }, { id: 2 }] } };
  const resetNets = new Function('netTouched', 'nettedRetained', 'restRetained', 'setNetBallEnv', 'setWellBallOccl', 'g',
    slice + '\nreturn resetNets;')(netTouched, nettedRetained, restRetained, setNetBallEnv, setWellBallOccl, g);
  let thrown = null;
  try { resetNets(); } catch (error) { thrown = error; }
  console.log(`NET-RESET-THROW calls=${calls.join(',')} netTouched=${netTouched.size} swept=${swept.length} rethrown=${thrown?.message ?? 'none'}`);
  assert.deepEqual(calls, ['a:0', 'b:0', 'c:0', 'd:0'], 'every touched sock is reset past a throwing one');
  assert.equal(netTouched.size, 0, 'netTouched is cleared past a throwing sock');
  assert.deepEqual(swept, ['env:1', 'env:2', 'occl:1', 'occl:2'], 'both live-set sweeps run past a throwing sock');
  assert.equal(thrown, first, 'resetNets rethrows the first error');
});
