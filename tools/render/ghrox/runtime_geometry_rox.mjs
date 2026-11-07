#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
/** Browser-free execution of the shipping OX pocket constructors, not a second builder.
 * Compare the complete pocket-name inventory with a sealed live dump, at
 * dump_rox_scene's six-decimal precision (and raw precision when available).
 * Every output mesh field is regenerated; the baseline supplies comparison only.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { isRoxMain } from './lib/cli_rox.mjs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../../web/vendor/three.module.min.js';
import * as clothvisualsMod from '../../../web/scene/clothvisuals.js';
import { censusTableAttributes } from './geometry_attributes_rox.mjs';
import { materialSlots } from './material_slots_rox.mjs';

export const TABLE_PATH = fileURLToPath(new URL('../../../web/scene/table.js', import.meta.url));
export const REGENERATED_MESH_FIELDS = Object.freeze(['name', 'parent', 'inTable', 'visible', 'matVisible',
  'matName', 'matType', 'hex', 'verts', 'indexed', 'tris', 'positions', 'raw_positions', 'indices', 'material_slots']);
export const REGENERATED_DUMP_FIELDS = Object.freeze(['units', 'up', 'frame', 'table', 'kernel', 'pockets',
  'meshes', 'meshCount', 'totalTris', 'source_sha256', 'attribute_gate', 'attribute_gate_scope', 'runtime_geometry_replay']);
const MATERIAL_FIELDS = ['type', 'side', 'color', 'roughness', 'metalness', 'opacity', 'transparent',
  'visible', 'envMapIntensity', 'normalMap', 'map'];
function onlyFields(record, allowed, label) {
  assert(Object.keys(record).every(key => allowed.includes(key)), `RUNTIME_FIELDS_REFUSED: ${label}`);
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function between(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  assert(a >= 0 && b > a && text.indexOf(start, a + start.length) < 0, `runtime source boundary refused: ${start}`);
  return text.slice(a, b);
}
function once(text, needle, replacement) {
  assert.equal(text.split(needle).length, 2, `runtime instrumentation boundary refused: ${needle}`);
  return text.replace(needle, replacement);
}

export function shippingClothMaterial(source = fs.readFileSync(TABLE_PATH, 'utf8'), render = null) {
  // Execute the shipping material declaration. Texture pixels do not affect
  // Mesh.raycast's side test; texture objects keep the constructor unchanged.
  const declaration = between(source, '  const clothMat = new THREE.MeshPhysicalMaterial({', '\n  // per-discipline nap normals');
  assert(source.includes('const bed = new THREE.Mesh(bedGeo, clothMat);'));
  assert(source.includes('const clothMaterial = bedCloth ? bedCloth.material : apronMat;'));
  const context = { THREE, clothMottle: new THREE.Texture(), makeNapNormal: () => new THREE.Texture(),
    clothvisualsMod, applyClothVisual: clothvisualsMod.applyClothVisual, __render: render };
  // The default OX factory variant is applied after the shared declaration in
  // buildTable. Execute that same prefix; no saved look/color/condition is read.
  const style = render ? between(source, '  function styleCloth(G) {', '    // GH-542 condition layer, composed LAST') : '';
  vm.runInNewContext(`${declaration}
    ${render ? `const _clothColor = '', _lookCloth = null;
      let clothMottleFaint = null; const makeClothMap = () => new THREE.Texture();
      ${style}\nreturn vBase; }
      const visual = styleCloth({render: __render}); clothMat.roughness = visual.roughness ?? clothMat.roughness;` : ''}
    globalThis.material = clothMat;`, context);
  return context.material;
}

function shippingPocketMaterials(source, cloth) {
  const declarations = between(source, '    const roxCupMat = new THREE.MeshStandardMaterial(', '\n    const bedCloth =');
  const aluminium = between(source, 'function roxAlMat() {', '\n/** The slab cut at one pocket');
  // Execute shipping scalar material properties and sidedness. Like the cloth
  // helper, texture objects replace pixels; this is not an app/material boot.
  const context = { THREE, __cloth: cloth };
  vm.runInNewContext(`const ROX_ENV_CONTENT_FREE = null;
    const roxEnvCube = () => new THREE.CubeTexture();
    ${aluminium}\n${declarations}
    globalThis.materials = { cup: roxCupMat, well: roxWellMat, metal: roxAlMat(), cloth: __cloth };`, context);
  return context.materials;
}

export function construct({ source = fs.readFileSync(TABLE_PATH, 'utf8'), kernelOverride = {}, tap = null, notchTap = null } = {}) {
  const entryKey = source.includes('  pool_pro_9ft_k55: {') ? 'pool_pro_9ft_k55' : 'rasson_ox_9ft'; const entry = between(source, `  ${entryKey}: {`, '\n  },').replace(`  ${entryKey}:`, '') + '\n}';
  const geomSource = between(source, 'export function makeGeom(', '\nconst G0 =').replace('export ', '');
  let block = between(source, 'const ROX_BED_ABOVE_FLOOR =', '\nexport function buildTable(');
  if (tap) {
    // Instrument observations only; actual runtime arithmetic and emitted vertices run unchanged.
    const a = block.indexOf('function roxCornerPocket('), b = block.indexOf('function roxSidePocket(');
    let corner = block.slice(a, b);
    corner = once(corner, 'const V = (r, deg, z) => {', 'const V = (r, deg, z) => { __tap("vertex", {tag, r, deg, z});');
    corner = once(corner, 'const innerC = ', '__tap("cup", {tag, contact, span, nC, Rin, Rout});\n  const innerC = ');
    corner = once(corner, 'fanAngles.sort((p, q) => p - q);', 'fanAngles.sort((p, q) => p - q); __tap("fan", {tag, span, angles: [...fanAngles]});');
    corner = once(corner, 'let R0 = Math.abs(deg) === span ? Rout : roxRayPolyline(Pm, u, outerC)[0];',
      'let R0 = Math.abs(deg) === span ? Rout : roxRayPolyline(Pm, u, outerC)[0]; __tap("binding", {tag, span, deg, Rout, R0});');
    block = block.slice(0, a) + corner + block.slice(b);
  }
  if (notchTap) {
    const a = block.indexOf('function roxFrontNotch('), b = block.indexOf('function roxPocketCut(', a);
    const fan = 'for (const poly of polygons) for (let k = 1; k + 1 < poly.length; k++)';
    const notch = once(block.slice(a, b), fan, `__notchTap({sx, sz, polygons});\n      ${fan}`);
    block = block.slice(0, a) + notch + block.slice(b);
  }
  const context = { THREE, __tap: tap, __notchTap: notchTap, __override: kernelOverride };
  vm.runInNewContext(`const spec = (${entry}); Object.assign(spec.kernel, __override);
    const specFor = id => { if (id !== 'rasson_ox_9ft') throw Error('runtime table refused'); return spec; };
    ${geomSource}\n${block}
    globalThis.api = {makeGeom, roxCornerPocket, roxSidePocket, roxPocketCut};`, context,
  { filename: TABLE_PATH, timeout: 60000 });
  const { makeGeom, roxCornerPocket, roxSidePocket, roxPocketCut } = context.api;
  const G = makeGeom('rasson_ox_9ft'), group = new THREE.Group();
  group.name = 'obTable';
  const clothMaterial = shippingClothMaterial(source, G.render);
  const mats = shippingPocketMaterials(source, clothMaterial);
  const dm = (mesh, name) => { mesh.name = `dm-${name}`; return mesh; };
  for (const p of G.pockets) {
    const tag = p.corner ? `${p.x > 0 ? 'px' : 'nx'}${p.z > 0 ? 'pz' : 'nz'}` : (p.z > 0 ? 'pz' : 'nz');
    if (p.corner) roxCornerPocket(group, dm, G, p, mats, tag);
    else roxSidePocket(group, dm, G, p, mats, tag);
    roxPocketCut(group, dm, G, p, p.corner ? `corner-${tag}` : `side-${tag}`, mats, clothMaterial);
  }
  group.updateMatrixWorld(true);
  return { G, group, meshes: group.children.map(mesh => {
    assert(mesh.isMesh && !mesh.isInstancedMesh, `unsupported runtime object ${mesh.name}`);
    const g = mesh.geometry, p = g.attributes.position, M = mesh.matrixWorld.elements, positions = [], raw_positions = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const world = [M[0]*x + M[4]*y + M[8]*z + M[12], M[1]*x + M[5]*y + M[9]*z + M[13],
        M[2]*x + M[6]*y + M[10]*z + M[14]];
      raw_positions.push(...world);
      positions.push(...world.map(n => +n.toFixed(6)));
    }
    const indices = g.index ? Array.from(g.index.array) : [], materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const record = { name: mesh.name, parent: mesh.parent.name, inTable: mesh.parent === group,
      visible: mesh.visible, matVisible: materials.every(m => m.visible),
      matName: materials[0].name, matType: materials[0].type, hex: materials[0].color?.getHexString() || '',
      verts: p.count, indexed: !!g.index, tris: indices.length ? indices.length / 3 : p.count / 3,
      positions, raw_positions, indices,
      material_slots: materialSlots(mesh.material) };
    onlyFields(record, REGENERATED_MESH_FIELDS, mesh.name);
    record.material_slots.forEach(m => onlyFields(m, MATERIAL_FIELDS, mesh.name + '/material'));
    return record;
  }) };
}

function main() {
  const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
  assert(args.includes('--baseline'), '--baseline live dump required');
  const baselinePath = path.resolve(value('--baseline'));
  const sourcePath = args.includes('--source') ? path.resolve(value('--source')) : TABLE_PATH;
  const raw = fs.readFileSync(baselinePath), baseline = JSON.parse(raw), source = fs.readFileSync(sourcePath, 'utf8');
  const { G, meshes, group } = construct({ source }), emitted = new Map(meshes.map(m => [m.name, m]));
  assert.equal(emitted.size, meshes.length, 'duplicate runtime mesh names');
  // The pocket constructors own this baseline namespace. Every emitted name,
  // including a stray outside that namespace, participates in the comparison.
  const pockets = baseline.meshes.filter(m => m.name?.startsWith('dm-pocket-rox-'));
  const originals = new Map(pockets.map(m => [m.name, m]));
  assert.equal(originals.size, pockets.length, 'duplicate baseline pocket mesh names');
  const added = [...emitted.keys()].filter(name => !originals.has(name)).sort();
  const removed = [...originals.keys()].filter(name => !emitted.has(name)).sort();
  const changed = [], matched = [];
  // The baseline orders comparisons only. No field, including raw_* or material
  // descriptions, is copied from a baseline mesh into the fresh record.
  const result = pockets.filter(old => emitted.has(old.name)).map(old => {
    const fresh = emitted.get(old.name);
    const fields = ['positions', 'indices', ...(Object.hasOwn(old, 'raw_positions') ? ['raw_positions'] : [])];
    const same = fields.every(key => JSON.stringify(old[key]) === JSON.stringify(fresh[key]));
    (same ? matched : changed).push(old.name);
    return fresh;
  }).concat(added.map(name => emitted.get(name)));
  assert.equal(result.length, meshes.length, 'output must contain exactly the current emissions');
  const attributeGate = censusTableAttributes(group);
  const proof = { mode: 'actual shipping pocket constructors; browser-free geometry replay; NOT a fresh app/material boot',
    full_scene: false, mesh_scope: 'current constructor emissions only; baseline pocket namespace dm-pocket-rox-*',
    baseline: baselinePath, baseline_sha256: hash(raw), source: sourcePath, source_sha256: hash(source),
    helper_sha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))), baseline_pocket_meshes: pockets.length,
    dependencies_sha256: Object.fromEntries(['../../../web/scene/clothvisuals.js', '../../../web/vendor/three.module.min.js']
      .map(name => [name, hash(fs.readFileSync(new URL(name, import.meta.url)))])),
    constructor_meshes: meshes.length, output_meshes: result.length, matched, changed, added, removed,
    identical: changed.length === 0 && added.length === 0 && removed.length === 0,
    inherited_other_meshes: 0, omitted_non_pocket_meshes: baseline.meshes.length - pockets.length,
    baseline_pocket_meshes_sha256: hash(JSON.stringify(pockets)), output_meshes_sha256: hash(JSON.stringify(result)),
    regenerated_mesh_fields: REGENERATED_MESH_FIELDS, regenerated_dump_fields: REGENERATED_DUMP_FIELDS,
    metadata: 'All mesh fields, frame datums, kernel and attribute census are regenerated. Shipping material properties run with texture objects, not pixels. Baseline supplies only comparisons and common-name order; no inherited geometry, metadata, boot, rig, frame or WebGL evidence.' };
  if (args.includes('--out')) {
    const out = path.resolve(value('--out'));
    assert(out !== baselinePath && !fs.existsSync(out), 'refuse overwrite of existing evidence');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const output = { units: 'm', up: 'Y', frame: 'three.js world; x=length, y=bed height, z=width', table: 'rasson_ox_9ft',
      kernel: G.kernel, pockets: G.pockets,
      meshes: result, meshCount: result.length, totalTris: result.reduce((n, m) => n + m.tris, 0),
      source_sha256: proof.source_sha256, attribute_gate: attributeGate,
      attribute_gate_scope: 'current pocket constructor group only; not a live full-table census', runtime_geometry_replay: proof };
    onlyFields(output, REGENERATED_DUMP_FIELDS, 'dump');
    result.forEach(m => onlyFields(m, REGENERATED_MESH_FIELDS, m.name));
    fs.writeFileSync(out, JSON.stringify(output));
    proof.output = out;
    proof.output_sha256 = hash(fs.readFileSync(out));
  }
  console.log(JSON.stringify(proof, null, 2));
  // Retain requested diagnostic output even when identity or attributes refuse.
  assert(attributeGate.passed, 'RUNTIME_ATTRIBUTE_REFUSED: ' + JSON.stringify(attributeGate.failures));
  if (args.includes('--expect-identical')) assert(proof.identical, 'RUNTIME_IDENTITY_REFUSED: ' +
    JSON.stringify({ added, removed, changed }));
}
if (isRoxMain(import.meta.url)) main();
