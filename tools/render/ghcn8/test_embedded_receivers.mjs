// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { loadCornerBuilder } from './cn8_emitted_checks.mjs';
import { embeddedReceiverIndex, inheritColumnTransport, inheritGuardedColumnTransport, assertFreeDonors, inheritComponents } from './cn8_embedded_receivers.mjs';
import { receiverTopology, embeddedBoundaryGuard } from './cn8_receiver_topology.mjs';

const builder = loadCornerBuilder(fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8'));
const q = 2 ** -23;
function fixture() {
  const group = new THREE.Group(), cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  cube.name = 'adjacent-cube'; group.add(cube);
  const snapshot = builder.solidRayTree(group), classifier = embeddedReceiverIndex(snapshot, q);
  return { snapshot, classifier };
}
test('O3 interior receivers are embedded regardless of an arbitrary lighting result', () => {
  const { snapshot, classifier } = fixture();
  const result = classifier.classify([0, 0, 0], [0, 1, 0], 99);
  assert.equal(result.length, 1); assert.equal(result[0].reason, 'INSIDE');
  assert.equal(result[0].signed_distance_m, -1);
  assert.deepEqual(classifier.classify([0, 0, 0], [0, 1, 0], 0), []);
  assert.deepEqual(classifier.classify([0, 1 + 2 * q, 0], [0, -1, 0], 99), []);
  snapshot.geometry.dispose();
});
test('the surface branch requires an opposing normal and checks every incident face', () => {
  const { snapshot, classifier } = fixture();
  assert.deepEqual(classifier.classify([0, 1, 0], [0, 1, 0], 99), []);
  assert.equal(classifier.classify([0, 1, 0], [0, -1, 0], 99)[0].reason, 'WITHIN_QUANTUM_OPPOSED_SURFACE');
  assert.equal(classifier.classify([0, 1 + q, 0], [0, -1, 0], 99).length, 1);
  assert.equal(classifier.classify([1, 1, 0], [-1, 0, 0], 99).length, 1);
  assert.deepEqual(classifier.classify([1, 1, 0], [1, 1, 0], 99), []);
  snapshot.geometry.dispose();
});
test('column inheritance selects the nearest FREE input and never crosses a column', () => {
  const values = [NaN, 1, NaN, 2, 7, NaN], positions = [0,0,0, 1,0,0, 0,0,1, 1,0,1, 0,0,3, 1,0,3];
  const embedded = [[{}], [], [{}], [], [], [{}]];
  const result = inheritColumnTransport(values, positions, 2, embedded);
  assert.deepEqual(result.values, [7, 1, 7, 2, 7, 2]);
  assert.deepEqual(result.inherited.map(row => [row.vertex, row.source_vertex]), [[0,4], [2,4], [5,3]]);
  assert.deepEqual(result.unresolved, []);
});
test('an entirely embedded column names its refusal instead of inventing a light value', () => {
  const result = inheritColumnTransport([NaN, NaN], [0,0,0, 0,0,1], 1, [[{}], [{}]]);
  assert.equal(result.inherited.length, 0); assert.equal(result.unresolved.length, 2);
  assert.ok(result.unresolved.every(row => row.refusal === 'CN8_EMBEDDED_COLUMN_AND_ONE_RING_HAVE_NO_FREE_RECEIVER'));
});

test('R4 a zero published normal keeps a named refusal at both a surface and an interior point', () => {
  const { snapshot, classifier } = fixture();
  assert.throws(() => classifier.classify([0, 1, 0], [0, 0, 0], 99), /CN8_EMBEDDED_ZERO_PUBLISHED_NORMAL/);
  assert.throws(() => classifier.classify([0, 0, 0], [0, 0, 0], 99), /CN8_EMBEDDED_ZERO_PUBLISHED_NORMAL/);
  snapshot.geometry.dispose();
});

test('Q1 the retired non-boundary and depth guards are disclosure only', () => {
  const { snapshot, classifier } = fixture();
  const sheet = new THREE.PlaneGeometry(1, 1, 2, 2);
  sheet.translate(-1, 0, 0);
  const topology = receiverTopology(sheet), vertex = 4;
  assert.equal(topology.vertices[vertex].boundary, false);
  for (const depth of [5.9e-6, 0.0045]) {
    const origin = new THREE.Vector3().fromBufferAttribute(sheet.attributes.position, vertex).toArray();
    origin[0] += depth;
    const classified = classifier.classify(origin, [0, 0, 1], 99);
    assert.equal(classified.length, 1); assert.equal(classified[0].reason, 'INSIDE');
    const decision = embeddedBoundaryGuard('cn8r82-wallface-fixture', vertex, classified, topology);
    assert.equal(decision.status, 'INHERIT'); assert.equal(decision.boundary, false);
    const classifications = Array.from({ length: 9 }, () => []); classifications[vertex] = classified;
    const values = new Float32Array(9).fill(0.75); values[vertex] = NaN;
    const result = inheritGuardedColumnTransport('cn8r82-wallface-fixture', values,
      sheet.attributes.position.array, 3, classifications, topology);
    assert.equal(result.values[vertex], .75);
    assert.equal(result.inherited.length, 1);
  }
  snapshot.geometry.dispose(); sheet.dispose();
});

test('boundary detection joins exact duplicate attribute vertices without moving them', () => {
  const indexed = new THREE.PlaneGeometry(1, 1, 2, 2), split = indexed.toNonIndexed();
  const before = Buffer.from(split.attributes.position.array.buffer).toString('hex');
  const topology = receiverTopology(split);
  assert.equal(topology.boundary_edges, 8);
  const center = topology.vertices.filter(row => {
    const p = split.attributes.position; return p.getX(row.vertex) === 0 && p.getY(row.vertex) === 0;
  });
  assert.ok(center.length > 1); assert.ok(center.every(row => !row.boundary));
  assert.equal(Buffer.from(split.attributes.position.array.buffer).toString('hex'), before);
  indexed.dispose(); split.dispose();
});

test('opposite duplicate faces do not erase the sheet boundary or expose its diagonal', () => {
  const sheet = new THREE.PlaneGeometry(1, 1);
  const ids = Array.from(sheet.index.array);
  sheet.setIndex([...ids, ...ids.flatMap((_, i) => i % 3 ? [] : [ids[i], ids[i + 2], ids[i + 1]])]);
  const topology = receiverTopology(sheet);
  assert.equal(topology.boundary_edges, 4);
  assert.equal(topology.duplicate_faces, 2);
  assert.equal(topology.nonmanifold_edges, 0);
  sheet.dispose();
});

test('an ineligible storage vertex cannot masquerade as the nearest FREE receiver', () => {
  const result = inheritColumnTransport([NaN, 7, 9], [0,0,0, 0,0,1, 0,0,2], 1,
    [[{}], [], []], [true, false, true]);
  assert.equal(result.values[0], 9);
  assert.equal(result.inherited[0].source_vertex, 2);
  assert.equal(result.inherited[0].longitudinal_distance_m, 2);
  const refusal = inheritColumnTransport([NaN, 7, 9], [0,0,0, 0,0,1, 0,0,2], 1,
    [[{}], [], []], [true, false, false]);
  assert.equal(refusal.unresolved[0].refusal, 'CN8_EMBEDDED_COLUMN_AND_ONE_RING_HAVE_NO_FREE_RECEIVER');
});


test('Q2 open sheets and a hollow uncapped carrier cannot manufacture occupied volume', () => {
  for (const geometry of [new THREE.PlaneGeometry(2, 2), new THREE.CylinderGeometry(1, 1, 2, 16, 1, true)]) {
    const group = new THREE.Group(), mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.name = 'open-carrier'; group.add(mesh);
    const tree = builder.solidRayTree(group), classifier = embeddedReceiverIndex(tree, q);
    assert.equal(classifier.members[0].proof, null);
    assert.deepEqual(classifier.classify([0, 0, 0], [0, 1, 0], 99), []);
    tree.geometry.dispose(); geometry.dispose();
  }
});

test('Q2 a published closed volume remains valid when one face winding is reversed', () => {
  const group = new THREE.Group(), geometry = new THREE.BoxGeometry(2, 2, 2);
  [geometry.index.array[0], geometry.index.array[1]] = [geometry.index.array[1], geometry.index.array[0]];
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  const tree = builder.solidRayTree(group), classifier = embeddedReceiverIndex(tree, q);
  assert.equal(classifier.classify([.1, .2, .3], [0, 1, 0], 99)[0].reason, 'INSIDE');
  assert.deepEqual(classifier.classify([.1, 1.1, .3], [0, 1, 0], 99), []);
  tree.geometry.dispose(); geometry.dispose();
});

test('A4 an embedded donor is refused even if its value looks plausible', () => {
  assert.throws(() => assertFreeDonors([{ vertex: 0, source_vertex: 1 }], [[{}], [{}]]),
    /CN8_EMBEDDED_DONOR_IS_NOT_FREE/);
  assert.throws(() => inheritComponents(new Float32Array([.75,.75,.75,.75,.75,.75]), 3,
    [{ vertex: 0, source_vertex: 1 }], [[{}], [{}]]), /CN8_EMBEDDED_DONOR_IS_NOT_FREE/);
  const { snapshot, classifier } = fixture();
  // A stale empty classification mask must not bypass the independent
  // geometric donor certificate used by the complete census.
  assert.doesNotThrow(() => assertFreeDonors([{ vertex: 0, source_vertex: 1 }], [[{}], []]));
  assert.throws(() => classifier.certifyFree([0, 0, 0], [0, 1, 0], 99), /CN8_EMBEDDED_DONOR_IS_NOT_FREE/);
  assert.equal(classifier.certifyFree([2, 0, 0], [0, 1, 0], 99).status, 'FREE');
  snapshot.geometry.dispose();
});

test('A5 applying inheritance twice is byte-identical, including signed zero', () => {
  const classifications = [[{}], [], [{}], []], plan = [{vertex:0,source_vertex:1},{vertex:2,source_vertex:3}];
  const values = new Float32Array([0,0,0, .5,-0,.25, 0,0,0, .75,.125,.375]);
  const once = inheritComponents(values, 3, plan, classifications);
  const twice = inheritComponents(once, 3, plan, classifications);
  assert.deepEqual(new Uint8Array(once.buffer), new Uint8Array(twice.buffer));
  assert.ok(Object.is(once[1], -0));
});

test('A6 an entirely embedded column and one-ring trigger the atomic named refusal', () => {
  const sheet = new THREE.PlaneGeometry(1, 1, 2, 2), topology = receiverTopology(sheet);
  const values = new Float32Array(9).fill(.5), before = values.slice();
  assert.throws(() => inheritGuardedColumnTransport('fixture', values, sheet.attributes.position.array,
    3, Array.from({ length: 9 }, () => [{}]), topology),
    /CN8_EMBEDDED_COLUMN_AND_ONE_RING_HAVE_NO_FREE_RECEIVER/);
  assert.deepEqual(values, before); sheet.dispose();
});

test('Q2 one-ring fallback is used only after the entire own column has no FREE input', () => {
  const sheet = new THREE.PlaneGeometry(2, 2, 2, 2), topology = receiverTopology(sheet);
  const classes = Array.from({ length: 9 }, (_, i) => i % 3 === 1 ? [{}] : []);
  const values = Float32Array.from([1,NaN,2,3,NaN,4,5,NaN,6]);
  const result = inheritGuardedColumnTransport('fixture', values, sheet.attributes.position.array, 3, classes, topology);
  assert.ok(result.inherited.every(row => row.method === 'ONE_RING'));
  assert.ok(result.inherited.every(row => !classes[row.source_vertex].length));
  assert.equal(result.values[4], 3); sheet.dispose();
});
