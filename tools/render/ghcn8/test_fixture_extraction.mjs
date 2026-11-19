// Copyright (c) Meta Platforms, Inc. and affiliates.

// The ghcn8 fixtures execute PRODUCTION text located by symbol NAME, never by
// line number. Class C (cn8land1): the transport lifecycle fixture carries the
// two module-level symbols rebuild() reads (#892 E1). Class D: the rail
// reconstruction carries the corner helper the shipped plans call. Each arm
// proves the carried text is the production text byte for byte, that the
// executed code still reads it, and that a moved, renamed or missing
// declaration fails loudly by name instead of degrading into a fixture-made
// TABLE_BUILD_FAILED or a ReferenceError inside a geometry arm.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { equipmentFixture, rebuildDependencies, productionFunction, productionDeclaration, tableSource }
  from './transport_equipment_fixture.mjs';
import { loadRailBuilder } from './cn8_rail_checks.mjs';
import { buildTransportInputs } from './cpu_table_inputs.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const once = (haystack, needle) => {
  const at = haystack.indexOf(needle);
  return at >= 0 && haystack.indexOf(needle, at + 1) < 0;
};

test('C1 the carried rebuild dependencies are the production text, each declared exactly once', () => {
  const carried = rebuildDependencies();
  const rows = [['_collarEnvMemo', carried.memo], ['_collarEnvPrewarmWarned', carried.warned],
    ['collarEnvelopePrewarm', carried.prewarm]];
  for (const [symbol, text] of rows) {
    assert.ok(once(tableSource, text), `${symbol}: production text is not present exactly once`);
    console.log(JSON.stringify({ arm: 'C1', symbol, bytes: Buffer.byteLength(text), sha256: sha(text),
      production_offset: tableSource.indexOf(text), byte_identical: true }));
  }
  assert.ok(carried.prewarm.startsWith('function collarEnvelopePrewarm(id) {\n'));
  assert.ok(carried.prewarm.endsWith('\n}\n'));
  assert.equal(carried.text, carried.memo + carried.warned + carried.prewarm);
  // GH-976: the table-cache section and clothKeyNow() are carried verbatim too (rebuild() reads both)
  const [envHolders, directHolders] = carried.holders.split('\n').filter(Boolean).map((l) => l + '\n');
  for (const [symbol, text] of [['clothKeyNow', carried.clothKey], ['table-cache section', carried.cache],
    ['_snkEnvGainHolders', envHolders], ['_snkDirectGainHolders', directHolders]]) {
    assert.ok(text && once(tableSource, text), `${symbol}: production text is not present exactly once`);
    console.log(JSON.stringify({ arm: 'C1', symbol, bytes: Buffer.byteLength(text), sha256: sha(text),
      production_offset: tableSource.indexOf(text), byte_identical: true }));
  }
  assert.ok(carried.cache.startsWith('  // ---- GH-976 per-spec table cache') && carried.cache.includes('  function detachForCache() {'));
  assert.equal(carried.cacheText, carried.clothKey + carried.holders + carried.cache);
  // The slice the fixture executes must still READ both symbols; otherwise the carry is dead text.
  const start = tableSource.indexOf('  function rebuild(id) {');
  const end = tableSource.indexOf('\n  const api = {\n    group, clothMat', start);
  assert.ok(start >= 0 && end > start, 'production lifecycle boundaries changed');
  const slice = tableSource.slice(start, end);
  // GH-976: a table-cache hit brings its own memo back, so only a miss pre-warms
  assert.ok(once(slice, '    _collarEnvMemo = null;\n    collarEnvelopePrewarm(id);\n')
    || once(slice, '    _collarEnvMemo = null;\n    if (!rec) collarEnvelopePrewarm(id);\n'),
    'rebuild() no longer resets the memo and pre-warms at one site');
});

test('C2 a switch runs the production rebuild through to populate; the pre-warm declines on a timerless host', async () => {
  for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    const f = equipmentFixture();
    await f.ready; f.dispatch(alias); await f.settle();
    assert.equal(f.built.id, alias);
    assert.deepEqual(f.errors, []);
    // Production collarEnvelopePrewarm returns false BEFORE specFor() when the host has
    // neither requestIdleCallback nor setTimeout; the fixture context declares neither,
    // so that is the branch it takes here (asserted, not assumed).
    assert.equal(typeof f.context.setTimeout, 'undefined');
    assert.equal(typeof f.context.requestIdleCallback, 'undefined');
    assert.equal(f.api().collarEnvelopePrewarm(alias), false);
    assert.equal(f.api().collarEnvMemo(), null);
    console.log(JSON.stringify({ arm: 'C2', table: alias, built: f.built.id, errors: f.errors.length,
      prewarm_scheduled: false, memo_after_rebuild: null }));
  }
});

test('C3 red arm: a missing, duplicated or renamed production declaration fails loudly by name', () => {
  const memoLine = '\nlet _collarEnvMemo = null;\n';
  assert.ok(once(tableSource, memoLine));
  const missing = tableSource.replace(memoLine, '\n');
  assert.throws(() => equipmentFixture({ sourceText: missing }), /Production declaration _collarEnvMemo matched 0 times/);
  const twice = tableSource.replace(memoLine, memoLine + 'let _collarEnvMemo = null;\n');
  assert.throws(() => equipmentFixture({ sourceText: twice }), /Production declaration _collarEnvMemo matched 2 times/);
  const head = '\nfunction collarEnvelopePrewarm(id) {';
  assert.ok(once(tableSource, head));
  const renamed = tableSource.replace(head, '\nfunction collarEnvelopePrewarmRenamed(id) {');
  assert.throws(() => equipmentFixture({ sourceText: renamed }), /Production function collarEnvelopePrewarm is absent/);
  console.log(JSON.stringify({ arm: 'C3', plants: ['missing', 'duplicated', 'renamed'], refused: 3 }));
});

// ---- class D: the rail reconstruction ------------------------------------
const clipSource = fs.readFileSync(new URL('../../../web/scene/cn8mid.js', import.meta.url), 'utf8');
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const geometryRow = g => ({ vertices: g.attributes.position.count, index: g.index ? g.index.count : null,
  position_sha256: sha(bytes(g.attributes.position.array)), uv_sha256: sha(bytes(g.attributes.uv.array)),
  normal_sha256: g.attributes.normal ? sha(bytes(g.attributes.normal.array)) : null,
  groups: Array.from(g.groups, x => [x.start, x.count, x.materialIndex]) });
const PLANK_ALIASES = ['chinese8_pro_9ft', 'joy_q8_9ft'];

test('D1 the rail reconstruction carries cn8JoyWoodCorner and CN8_JOY_CORNER as production text, each declared once', () => {
  const helper = productionFunction(tableSource, 'cn8JoyWoodCorner');
  const constant = productionDeclaration(tableSource, 'CN8_JOY_CORNER');
  const builder = loadRailBuilder(tableSource, clipSource);
  for (const [symbol, text] of [['cn8JoyWoodCorner', helper], ['CN8_JOY_CORNER', constant]]) {
    assert.ok(once(tableSource, text), `${symbol}: production text is not present exactly once`);
    assert.ok(builder.code.includes(text.trimEnd()), `${symbol}: the reconstruction does not carry the production text`);
    console.log(JSON.stringify({ arm: 'D1', symbol, bytes: Buffer.byteLength(text), sha256: sha(text),
      production_offset: tableSource.indexOf(text), carried_byte_identical: true }));
  }
  // The shipped plans read the helper with the retained datum and the layer insets.
  assert.equal(tableSource.split('cn8JoyWoodCorner(CN8_R82, sideInset, endInset)').length - 1, 2,
    'the long and end rail plans no longer call the helper at two sites');
});

test('D2 reconstruction plus the production call-site trim/batch text reproduces the shipped six planks byte for byte', async () => {
  const builder = loadRailBuilder(tableSource, clipSource);
  // The shipped call site post-processes each plank (GH-666 DT-09 trim, then the
  // domain re-batch); that text is sliced by anchor and executed as written.
  const siteHead = '      trimPlankCutFace(geo, G, [';
  const siteTail = '      cn8D3BatchDomains(geo);\n';
  const a = tableSource.indexOf(siteHead);
  const b = tableSource.indexOf(siteTail, a);
  assert.ok(a >= 0 && b > a && tableSource.indexOf(siteHead, a + 1) < 0, 'the shipped plank call site changed');
  const site = tableSource.slice(a, b + siteTail.length);
  const helpers = new Function('THREE', 'CN8_R82', 'CN8_D2_SECTION',
    productionFunction(tableSource, 'trimPlankCutFace') + productionFunction(tableSource, 'cn8D3BatchDomains')
    + '\nreturn { trimPlankCutFace, cn8D3BatchDomains };')(THREE, builder.corner.K, builder.corner.S);
  const post = new Function('geo', 'G', 'F', 'CN8_MID', 'trimPlankCutFace', 'cn8D3BatchDomains', site);
  for (const id of PLANK_ALIASES) {
    const built = await buildTransportInputs({ tableId: id });
    const shipped = new Map();
    built.group.traverse(m => { if (m.isMesh && /^cn8-plank-\d$/.test(m.name)) shipped.set(m.name, m); });
    assert.equal(shipped.size, 6, `${id}: six shipped planks`);
    const planks = builder.build(built.G);
    const F = builder.build.frameGeom(built.G);
    assert.equal(planks.length, 6);
    for (const plank of planks) {
      post(plank.geometry, built.G, F, builder.build.CN8_MID, helpers.trimPlankCutFace, helpers.cn8D3BatchDomains);
      const expected = geometryRow(shipped.get(plank.name).geometry);
      const actual = geometryRow(plank.geometry);
      assert.deepEqual(actual, expected, `${id} ${plank.name} differs from the shipped mesh`);
      console.log(JSON.stringify({ arm: 'D2', table: id, plank: plank.name, ...actual, byte_identical: true }));
    }
  }
});

test('D3 red arms: the 8b6e28fb failure is reproduced by name; a declared helper without its constant is refused at load', () => {
  const input = JSON.parse(fs.readFileSync(new URL('../../../docs/geometry/cn8-pocket-d3-source-inputs.json', import.meta.url)));
  const [L, W] = input.mfr_playing_dimensions_mm.value.map(value => value / 1000);
  const { K } = loadRailBuilder(tableSource, clipSource).corner;
  const G = { L, W, CW: 0, cd: 0, template: true, render: { style: 'cn8', frameWidth: K.A_R, frameTop: K.DECK },
    kernel: { sidePocketRadius: K.R, cornerPocketRadius: K.R, sidePocketDepth: 0 } };
  // A renderer whose plans call the helper the reconstruction does not carry.
  const head = '\nfunction cn8JoyWoodCorner(';
  assert.ok(once(tableSource, head));
  const uncarried = loadRailBuilder(tableSource.replace(head, '\nfunction cn8JoyWoodCornerAbsent('), clipSource);
  assert.throws(() => uncarried.build(G), /cn8JoyWoodCorner is not defined/);
  // A renderer that declares the helper but lost its constant is refused before any build.
  const constant = productionDeclaration(tableSource, 'CN8_JOY_CORNER');
  assert.throws(() => loadRailBuilder(tableSource.replace(constant, ''), clipSource), /Rail frame\/options declarations are absent/);
  console.log(JSON.stringify({ arm: 'D3', plants: ['helper-uncarried', 'constant-missing'], refused: 2 }));
});
