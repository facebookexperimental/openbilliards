// Copyright (c) Meta Platforms, Inc. and affiliates.

// Execute the actual capture helper. Only browser/app endpoints are VM
// fixtures: these tests do not establish served archive passability.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initialLifecycleSettings, seedArchiveSession, runLifecycle } from './capture_transport_lifecycle.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const harness = fs.readFileSync(new URL('./capture_transport_lifecycle.mjs', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const binding = { harness_sha256: hash(harness), helper_sha256: hash(seedArchiveSession.toString()),
  boundary: 'TEST actual driver/helper; VM app, recorder, settings and CDP endpoints; no Chrome and no served result' };

async function page({ table, gameId = 'heyball', badTag = false, drift = false } = {}) {
  // Production sanitizeSpec migrates persisted JOY to Pro. This is the
  // endpoint's input fixture, not a claim that the browser has run it.
  const values = { game: gameId, equipment: { table_id: 'chinese8_pro_9ft' } };
  let state = 'AIM', active = 'chinese8_pro_9ft', ready = 'READY', pending = null, shotCount = 0;
  const records = [], events = [], scenarios = [], waits = [];
  const game = { gameId, seed: 47, template: { system: { equipment: { ...values.equipment } } },
    rerack() { events.push('rerack'); this.template.system.equipment = { ...values.equipment }; },
    shoot() {
      events.push('shoot:' + state);
      if (!['AIM', 'BALL_IN_HAND'].includes(state)) return 'not in an aiming state';
      const equipment = { ...this.template.system.equipment };
      state = 'SIMULATING'; shotCount++; scenarios.push(shotCount);
      setImmediate(() => { state = 'PLAYBACK'; setImmediate(() => {
        records.push(JSON.stringify({ initial: { equipment: badTag ? { table_id: 'predator_apex_9ft' } : equipment } }));
        state = 'AIM'; events.push('settled');
      }); });
      return {};
    },
  };
  const window = {
    __settings: {
      get: () => structuredClone(values),
      setTransientEquipment(spec) {
        events.push('transient-request'); ready = 'PENDING';
        pending = new Promise(resolve => setImmediate(() => {
          values.equipment = { ...spec }; active = spec.table_id; ready = 'READY';
          events.push('transient-ready'); resolve(true);
        }));
        return pending;
      },
      async setTransientGame(id) {
        await pending; values.game = id; game.gameId = id; events.push('game-ready'); return true;
      },
    },
    __tableBuild: { status: () => ({ status: ready }) },
    __test: { state: () => state, scenarios: () => scenarios },
    __archive: {
      flush: async () => {}, sessions: async () => records.length ? [{ id: 'fixture-session', gameId: 'heyball' }] : [],
      session: async () => ({ gameId: 'heyball' }), records: async () => [...records],
    },
  };
  const context = vm.createContext({ window, console });
  const settings = new vm.SyntheticModule(['ctx'], function () { this.setExport('ctx', { game }); }, { context });
  const tableModule = new vm.SyntheticModule(['activeTableId'], function () { this.setExport('activeTableId', () => active); }, { context });
  for (const module of [settings, tableModule]) { await module.link(() => {}); await module.evaluate(); }
  const evaluate = expression => vm.runInContext(expression, context, {
    importModuleDynamically: specifier => {
      if (specifier === './app/settings.js') return settings;
      if (specifier === './scene/table.js') return tableModule;
      throw new Error('Unexpected driver import: ' + specifier);
    },
  });
  const wait = async expression => {
    waits.push(expression);
    for (let i = 0; i < 20; i++) {
      if (await evaluate(expression)) {
        if (drift && expression.includes('ctx.game.gameId')) values.equipment.table_id = 'predator_apex_9ft';
        return;
      }
      await tick();
    }
    throw new Error('VM fixture wait did not settle: ' + expression);
  };
  return { evaluate, wait, table, events, records, waits, shots: () => shotCount };
}

for (const table of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
  test(`SEED actual helper settles two shots and verifies every tag: ${table}`, async () => {
    for (const startTable of ['pool_pro_9ft_metal_rim', 'wpa_spec_9ft']) {
      const initial = initialLifecycleSettings({ kind: 'archive', table }, startTable);
      assert.equal(initial.game, 'heyball');
      assert.equal(initial.equipment.table_id, table);
      assert.equal(initial.equipmentByGame.heyball.table_id, table);
      const p = await page({ table });
      const result = await seedArchiveSession(p);
      assert.deepEqual(p.events.filter(event => event === 'settled' || event.startsWith('shoot:')),
        ['shoot:AIM', 'settled', 'shoot:AIM', 'settled']);
      assert.deepEqual([...result.session.record_tables], [table, table]);
      assert.equal(result.prepared.settings.equipment.table_id, table);
      assert.equal(result.prepared.active, table);
      assert.equal(result.prepared.rack_table, table);
      if (table === 'joy_q8_9ft') assert.deepEqual(p.events.slice(0, 4),
        ['transient-request', 'transient-ready', 'game-ready', 'rerack']);
      console.log(JSON.stringify({ arm: 'SEED', status: 'PASS', table, startTable,
        initial, before_seed: result.prepared, session: result.session, events: p.events, binding }));
    }
  });
}

test('SEED precondition refuses the old nine-ball preamble before a shot', async () => {
  const p = await page({ table: 'chinese8_pro_9ft', gameId: 'nine_ball' });
  await assert.rejects(seedArchiveSession(p), /phase 1 must boot the heyball game/);
  assert.equal(p.shots(), 0);
  console.log(JSON.stringify({ arm: 'SEED-PREAMBLE-RED', refused: true, shots: p.shots(), binding }));
});

test('SEED settings pairing is checked before any shot', async () => {
  const p = await page({ table: 'chinese8_pro_9ft', drift: true });
  await assert.rejects(seedArchiveSession(p), /Settings must name the seed table BEFORE seeding/);
  assert.equal(p.shots(), 0);
});

test('SEED persisted tags are read back and wrong tags refuse', async () => {
  const p = await page({ table: 'chinese8_pro_9ft', badTag: true });
  await assert.rejects(seedArchiveSession(p), /Seeded session is not CN8-tagged/);
  assert.equal(p.shots(), 2);
});

test('SEED the old scenarios-count wait plant refuses the second shot', async () => {
  const source = seedArchiveSession.toString();
  const predicate = '"[\'AIM\',\'BALL_IN_HAND\'].includes(window.__test.state())"';
  assert.equal(source.split(predicate).length - 1, 2, 'Both state waits are the production predicate');
  const plant = source.replace('    await wait(' + predicate + ', 120000);\n', '')
    .replace(predicate, '`window.__test.scenarios().length>=${k+1}`');
  const plantedHelper = new Function('assert', 'return (' + plant + ');')(assert);
  const p = await page({ table: 'chinese8_pro_9ft' });
  await assert.rejects(plantedHelper(p), /Archive seeding shot refused: not in an aiming state/);
  assert.equal(p.shots(), 1);
  await tick(); await tick();
  console.log(JSON.stringify({ arm: 'SEED-SETTLE-RED', shots: p.shots(),
    plant_sha256: hash(plant), binding }));
});

test('DRY validation never consumes or changes a served evidence destination', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-cn8-fix18-dry-'));
  const evidence = path.join(temp, 'served'), bindingPath = path.join(temp, 'binding.json');
  fs.writeFileSync(bindingPath, JSON.stringify({ path: root,
    table_sha256: hash(fs.readFileSync(path.join(root, 'web/scene/table.js'))),
    status: 'TEST current source; not a committed seal binding' }));
  const config = { binding: bindingPath, out: evidence, table: 'chinese8_pro_9ft',
    kind: 'archive', expect: 'PASS', start_table: 'pool_pro_9ft_metal_rim', archive_stage: 'phase1' };
  const first = path.join(temp, 'first.json'); fs.writeFileSync(first, JSON.stringify(config));
  const firstResult = await runLifecycle(['--config', first, '--dry-check']);
  assert.equal(firstResult.status, 'DRY-CHECK-PASS');
  assert.equal(fs.existsSync(evidence), false);
  assert.ok(fs.existsSync(path.join(temp, 'dry/first/LIFECYCLE.json')));
  fs.mkdirSync(evidence); fs.writeFileSync(path.join(evidence, 'sentinel'), 'already served\n');
  const saved = hash(fs.readFileSync(path.join(evidence, 'sentinel')));
  const second = path.join(temp, 'second.json'); fs.writeFileSync(second, JSON.stringify(config));
  const secondResult = await runLifecycle(['--config', second, '--dry-check']);
  assert.equal(secondResult.status, 'DRY-CHECK-PASS');
  assert.deepEqual(fs.readdirSync(evidence), ['sentinel']);
  assert.equal(hash(fs.readFileSync(path.join(evidence, 'sentinel'))), saved);
  const dryBranch = harness.indexOf('if (dryCheck) {');
  assert.ok(harness.indexOf("check(!fs.existsSync(out), 'Refusing to overwrite lifecycle evidence')") > dryBranch);
  console.log(JSON.stringify({ arm: 'DRY', status: 'PASS', path: temp, before: saved,
    after: hash(fs.readFileSync(path.join(evidence, 'sentinel'))), binding }));
});
