// Copyright (c) Meta Platforms, Inc. and affiliates.

// CPU arms only. These are not the outstanding served A1/A3/B1 rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import * as T from '../../web/vendor/three.module.min.js';
import { CLASSES, CALIBRATION, strictDifference, decodeIds, legibility, calibration,
  hudMask, attributeDifference, attributionSensitivity } from './lib/cn8-fix24-metrics.mjs';
import { makeFix24PageTools, pageExpression } from './lib/cn8-fix24-page.mjs';
import { packId, requirePairBinding } from './cn8-fix24-instruments.mjs';
const gray = (values, w = values.length) => ({ w, h: values.length / w, ch: 4,
  data: Uint8Array.from(values.flatMap(v => [v, v, v, 255])) });
const legend = {
  0: { class: 'room_bench_indirect' },
  1: { class: 'pocket_furniture', cover: true, mesh: 'cn8r82-ring-0' },
  2: { class: 'cloth_bed', cover: false },
};
const selection = (n, role = 'new_tip') => ({ role, bbox: [0, 0, n, 1], body_ids: [1],
  source: 'TEST fixture body rectangle; its id excludes the cloth and details' });
const row = (values, role) => legibility(gray(values), new Uint32Array(values.length).fill(1), legend, selection(values.length, role));

test('A3 black cutoff is strictly below encoded 24; 5 percent is inclusive', () => {
  const values = Array(20).fill(24); values[0] = 0;
  assert.equal(row(values, 'new_tip').black_fraction, 0.05);
  assert.equal(row(values, 'new_tip').status, 'PASS');
  values[1] = 23;
  assert.equal(row(values, 'new_tip').status, 'FAIL');
});
test('A3 constant restored floor can PASS with zero spread; spread is advisory', () => {
  const r = row(Array(100).fill(120), 'new_tip');
  assert.equal(r.spread_advisory, 0); assert.equal(r.status, 'PASS');
  assert.equal(row(Array(100).fill(0), 'new_tip').status, 'FAIL');
});
test('A3 rejects a net/cloth mask, an unstated bbox, and an empty body intersection', () => {
  const image = gray([0, 255]);
  assert.throws(() => legibility(image, new Uint32Array([1, 2]), legend,
    { ...selection(2), body_ids: [2] }), /COVER_BODY_IDS_REQUIRED/);
  assert.throws(() => legibility(image, new Uint32Array([1, 2]), legend,
    { ...selection(2), bbox: undefined }), /BODY_BBOX_REQUIRED/);
  assert.throws(() => legibility(image, new Uint32Array([2, 2]), legend, selection(2)), /COVER_BODY_MASK_EMPTY/);
});
test('A3 calibration names all eight fixed rows and fails if the black tip is accepted as legible', () => {
  const rows = Object.entries(CALIBRATION).map(([frame, role]) => ({ frame,
    ...row(Array(10).fill(role === 'base' ? 120 : 0), role) }));
  assert.equal(calibration(rows).status, 'PASS');
  assert.throws(() => calibration(rows.slice(1)), /CALIBRATION_POPULATION_MISMATCH/);
  rows[1] = { frame: 'G06', ...row(Array(10).fill(120), 'old_tip') };
  assert.equal(calibration(rows).status, 'FAIL');
});
test('strict pairing counts a single 1-code RGB difference; no envelope exists', () => {
  const result = strictDifference(gray([0, 80]), gray([1, 80]));
  assert.equal(result.changed_pixels, 1); assert.equal(result.max_channel_delta, 1);
});
test('ID decoder refuses an unregistered color instead of nearest-color guessing', () => {
  const id = { w: 1, h: 1, ch: 4, data: new Uint8Array([3, 0, 0, 255]) };
  assert.throws(() => decodeIds(id, legend), /ID_NOT_IN_LEGEND_3/);
});
const mechanism = { cause: 'TEST named geometry change', file: 'web/scene/table.js', line: 1,
  evidence: 'TEST fixture changed cover edge; no served claim' };
test('B1 partitions every changed pixel and refuses a nonzero unnamed mechanism', () => {
  const a = gray([0, 0, 0]), b = gray([10, 10, 10]), ids = new Uint32Array([1, 2, 0]);
  const hud = new Uint8Array([0, 0, 1]);
  const run = mechanisms => attributeDifference(a, b, ids, ids, legend, legend, hud, hud, mechanisms);
  const first = run({ pocket_furniture: mechanism });
  assert.equal(first.status, 'FAIL');
  assert.equal(first.rows.find(r => r.class === 'cloth_bed').status, 'FAIL');
  const full = run(Object.fromEntries(CLASSES.map(c => [c, mechanism])));
  assert.equal(full.status, 'PASS');
  assert.equal(full.rows.reduce((sum, r) => sum + r.count, 0), 3);
  assert.equal(full.rows.find(r => r.class === 'HUD').count, 1);
});
test('B1 +1-pixel ID plant moves class counts at a changed geometry edge', () => {
  const a = gray([0, 0, 0]), b = gray([0, 1, 0]), ids = new Uint32Array([1, 2, 0]);
  const hud = new Uint8Array(3);
  const result = attributionSensitivity([a, b, ids, ids, legend, legend, hud, hud, {}]);
  assert.equal(result.status, 'PASS');
  assert.equal(result.baseline.find(r => r.class === 'cloth_bed').count, 1);
  assert.equal(result.shifted.find(r => r.class === 'pocket_furniture').count, 1);
});
test('HUD probe distinguishes transparent overlay from bare canvas and refuses replay drift', () => {
  const black = gray([0, 10, 60]), white = gray([255, 137, 60]);
  assert.deepEqual([...hudMask(black, white, black, [0, 0, 3, 1])], [0, 1, 1]);
  assert.throws(() => hudMask(black, white, gray([0, 11, 60]), [0, 0, 3, 1]), /HUD_PROBE_REPLAY_NONZERO/);
});
function binding() {
  return { actual_state: { camera: { matrixWorld: [1], projectionMatrix: [2] },
    table_beacon: 'joy_q8_9ft', activeTableId_raw: 'joy_q8_9ft', equipment: { table_id: 'joy_q8_9ft' },
    canvas_rect_css: [0, 0, 1280, 800], device_pixel_ratio: 1 } };
}
test('bound ID refuses camera and alias mismatches', () => {
  requirePairBinding(binding(), binding());
  const different = binding(); different.actual_state.camera.matrixWorld = [3];
  assert.throws(() => requirePairBinding(binding(), different), /ID_CAMERA_MISMATCH/);
  const wrongAlias = binding(); wrongAlias.actual_state.activeTableId_raw = 'chinese8_pro_9ft';
  assert.throws(() => requirePairBinding(binding(), wrongAlias), /ID_TABLE_MISMATCH/);
});
function fixture(throwOnRender = false) {
  const scene = new T.Scene(), table = new T.Group(); table.name = 'obTable'; table.userData.tableId = 'chinese8_pro_9ft'; scene.add(table);
  const plank = new T.Mesh(new T.BoxGeometry(2, 1, 1), new T.MeshStandardMaterial()); plank.name = 'cn8-plank-4'; table.add(plank);
  const camera = new T.PerspectiveCamera(), canvas = { getBoundingClientRect: () => ({ x: 0, y: 0, width: 2, height: 2 }) };
  const state = { target: null, viewport: new T.Vector4(2, 3, 4, 5), scissor: new T.Vector4(6, 7, 8, 9), scissorTest: true,
    clear: new T.Color(0.25, 0.5, 0.75), alpha: 0.4 };
  const renderer = { domElement: canvas, toneMapping: 77, outputColorSpace: 'fixture-space', autoClear: false, shadowMap: { enabled: true },
    getDrawingBufferSize: out => out.set(2, 2), getRenderTarget: () => state.target,
    getViewport: out => out.copy(state.viewport), getScissor: out => out.copy(state.scissor), getScissorTest: () => state.scissorTest,
    getClearColor: out => out.copy(state.clear), getClearAlpha: () => state.alpha,
    setRenderTarget: value => { state.target = value; },
    setViewport: (...args) => { state.viewport = args.length === 1 ? args[0].clone() : new T.Vector4(...args); },
    setScissor: value => { state.scissor = value.clone(); }, setScissorTest: value => { state.scissorTest = value; },
    setClearColor: (color, alpha) => { state.clear = color?.isColor ? color.clone() : new T.Color(color); state.alpha = alpha; }, clear() {},
    render(copy) {
      assert.notEqual(copy.getObjectByName(plank.name).material, plank.material);
      if (throwOnRender) throw new Error('TEST render refusal');
    },
    readRenderTargetPixels: (_target, _x, _y, _w, _h, out) => { out.fill(0); for (let i = 3; i < out.length; i += 4) out[i] = 255; },
  };
  const env = { __dbg: { scene, renderer, camera }, devicePixelRatio: 1, btoa: s => Buffer.from(s, 'binary').toString('base64') };
  const read = () => JSON.stringify({ ...state, toneMapping: renderer.toneMapping, outputColorSpace: renderer.outputColorSpace,
    autoClear: renderer.autoClear, shadowEnabled: renderer.shadowMap.enabled });
  return { tools: makeFix24PageTools(T, env), plank, state: read };
}
test('ID page operation keeps original buffers/materials and restores renderer state on success', () => {
  const f = fixture(), before = f.state(), material = f.plank.material, geometry = f.plank.geometry;
  const result = f.tools.idRender();
  assert.equal(result.original_scene_materials_untouched, true);
  assert.equal(f.plank.material, material); assert.equal(f.plank.geometry, geometry); assert.equal(f.state(), before);
  assert.ok(Object.values(result.legend).some(r => r.class === 'rail_top_wood'));
  assert.ok(Object.values(result.legend).some(r => r.class === 'rail_side'));
  assert.ok(packId(result).record.png_sha256);
});
test('ID page operation also restores renderer state on a rendering refusal', () => {
  const f = fixture(true), before = f.state();
  assert.throws(() => f.tools.idRender(), /TEST render refusal/); assert.equal(f.state(), before);
});
test('page expressions are inert, self-contained programs until the authorized page calls them', () => {
  for (const action of ['census', 'inventory', 'snapshot', 'idRender', 'hudUnderlay']) {
    assert.doesNotThrow(() => new vm.Script(pageExpression(action, action === 'hudUnderlay' ? 'black' : {})));
  }
  assert.throws(() => pageExpression('launch'), /PAGE_ACTION_INVALID/);
});
test('A1 distinguishes a scene hemisphere from active linked irradiance and records the material floor', async () => {
  const scene = new T.Scene(), table = new T.Group(); table.name = 'obTable'; scene.add(table);
  const material = new T.MeshPhysicalMaterial({ color: 0xac8d6c, emissive: 0x796750,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const cover = new T.Mesh(new T.BoxGeometry(1, 1, 1), material); cover.name = 'cn8r82-ring-0'; cover.position.x = 2; table.add(cover);
  scene.add(new T.HemisphereLight(0xffffff, 0, 0.22));
  const values = { uLightPos: [0, 1.02, 0], ambientLightColor: [0, 0, 0] };
  const gl = { ACTIVE_UNIFORMS: 1, getProgramParameter: () => Object.keys(values).length,
    getActiveUniform: (_p, i) => ({ name: Object.keys(values)[i] }), getUniformLocation: (_p, name) => name,
    getUniform: (_p, name) => values[name], getShaderSource: shader => `TEST ${shader}` };
  const renderer = { getContext: () => gl, properties: { get: () => ({ currentProgram: { program: {}, vertexShader: 'vertex', fragmentShader: 'fragment' } }) },
    domElement: { getBoundingClientRect: () => ({ x: 0, y: 0, width: 2, height: 2 }) } };
  const tools = makeFix24PageTools(T, { __dbg: { scene, renderer, camera: new T.PerspectiveCamera() }, crypto: webcrypto });
  const first = await tools.census();
  assert.equal(first.rows[0].material.emissive, '796750');
  assert.equal(first.rows[0].material.polygonOffset, true);
  assert.ok(first.lights.some(r => r.type === 'HemisphereLight'));
  assert.equal(first.rows[0].irradiance.hemisphere_compiled, false);
  assert.equal(first.rows[0].irradiance.reach, 'INERT_ZERO_LINKED_UNIFORMS');
  assert.equal(first.rows[0].irradiance.n_dot_l_nonpositive_fraction, 1);
  values['hemisphereLights[0].skyColor'] = [1, 1, 1];
  const second = await tools.census();
  assert.equal(second.rows[0].irradiance.hemisphere_compiled, true);
  assert.equal(second.rows[0].irradiance.reach, 'NONZERO_INPUT_TRANSFER_REQUIRES_GLSL_READ');
});
