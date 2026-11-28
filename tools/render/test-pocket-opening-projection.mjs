#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Geometric counterexamples for the actual-bed subtraction check. These
// fixtures contain no renderer contour or production construction helper.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectPocketOpenings} from './pocket-opening-projection.mjs';

const G = {L: 0.5, W: 0.5, pockets: [{corner: false}]};
const frame = () => ({nx: 0, nz: 0, ux: 1, uz: 0});
const vertex = ([u, w, y = 0.036]) => ({x: u, y, z: w});
function fixture(positive, {bay = false, duplicateBed = false} = {}) {
  let nextId = 0;
  const row = (points, name) => ({name, id: nextId++, tri: Object.fromEntries(
    points.map((p, i) => [['a', 'b', 'c'][i], vertex(p)]))});
  const bedRows = [];
  const rectangle = (u0, w0, u1, w1) => {
    const a = [u0, w0, 0], b = [u1, w0, 0], c = [u1, w1, 0], d = [u0, w1, 0];
    bedRows.push(row([a, b, c], 'bed'), row([a, c, d], 'bed'));
  };
  rectangle(-0.3, -0.3, 0.3, -0.04);
  rectangle(-0.3, 0.04, 0.3, 0.3);
  rectangle(-0.3, -0.04, 0.025, 0.04);
  if (!bay) rectangle(0.075, -0.04, 0.3, 0.04);
  if (duplicateBed) bedRows.push(...bedRows.map(r => ({...r, id: nextId++})));
  const clear = [[-0.02, 0.05], [0.12, 0.05], [0.05, 0.10]];
  const cushion = (points, name) => ({name, cushion: true, rows: [row(points, name)],
    box: {min: {x: -0.02, y: 0, z: -0.1}, max: {x: 0.12, y: 0.05, z: 0.1}}});
  return {meshes: [{name: 'bed', rows: bedRows,
    box: {min: {x: -0.3, y: 0, z: -0.3}, max: {x: 0.3, y: 0, z: 0.3}}},
  cushion(positive ?? clear, 'positive-jaw'),
  cushion(clear.map(([u, w]) => [u, -w]), 'negative-jaw')]};
}
const check = (data, exact = false) => projectPocketOpenings(data, G, frame, {exact});
const verdicts = r => r.rows.map(row => [row.jaw, row.status, row.uncovered_fragments, row.uncovered_segments,
  row.summed_overlap_mm2, row.witness]);
const crossing = [[0, 0.025], [0.10, 0.025], [0.05, 0.075]];

test('a cushion outside the submitted hole passes both paths', () => {
  const data = fixture(), fast = check(data), exact = check(data, true);
  assert.equal(fast.status, 'PASS');
  assert.deepEqual(verdicts(fast), verdicts(exact));
});
test('all vertices can lie on the bed while a triangle covers the hole', () => {
  const data = fixture(crossing), fast = check(data), exact = check(data, true);
  assert.equal(fast.status, 'FAIL');
  const jaw = fast.rows.find(r => r.jaw === 1);
  assert(jaw.summed_overlap_mm2 > 100);
  assert(jaw.witness.depth_mm > 0);
  assert.deepEqual(verdicts(fast), verdicts(exact));
});
test('a vertical cloth triangle can cross the hole with all vertices outside', () => {
  const data = fixture([[0, 0.03, 0], [0.10, 0.03, 0], [0, 0.03, 0.04]]);
  const fast = check(data), exact = check(data, true);
  const jaw = fast.rows.find(r => r.jaw === 1);
  assert.equal(fast.status, 'FAIL');
  assert.equal(jaw.summed_overlap_mm2, 0);
  assert(jaw.uncovered_segments > 0);
  assert(jaw.witness.depth_mm > 0);
  assert.deepEqual(verdicts(fast), verdicts(exact));
});
test('a side bay is detected without a closed hole boundary', () => {
  const data = fixture(crossing, {bay: true});
  assert.equal(check(data).status, 'FAIL');
  assert.deepEqual(verdicts(check(data)), verdicts(check(data, true)));
});
test('duplicate submitted bed triangles cannot cover a missing region twice', () => {
  const normal = check(fixture(crossing));
  const repeated = check(fixture(crossing, {duplicateBed: true}));
  assert.equal(repeated.status, 'FAIL');
  for (const row of repeated.rows) {
    const prior = normal.rows.find(r => r.jaw === row.jaw);
    assert.equal(row.status, prior.status);
    assert(Math.abs(row.summed_overlap_mm2 - prior.summed_overlap_mm2) < 1e-9);
    assert(Math.abs(row.witness.depth_mm - prior.witness.depth_mm) < 1e-9);
  }
});
test('an exact shared edge is a boundary, not a protrusion', () => {
  const data = fixture([[0, 0.04], [0.10, 0.04], [0.05, 0.10]]);
  assert.equal(check(data).status, 'PASS');
  assert.deepEqual(verdicts(check(data)), verdicts(check(data, true)));
});

// A submitted 7-ft return edge crosses the jaw axis just before its endpoint.
// Reconstructing that intersection before testing the shared bed edge used
// to turn roundoff into an uncovered segment on both sides of the axis.
function clippedBoundaryFixture({offset = 0, shift = 0, mirror = 1, reverse = false} = {}) {
  const a = [0.09059106063702316, -0.001545367811443231];
  const b = [0.13674666449718237, 0.020302631225937];
  const c = [0.09061141756485391, 3.068290572311172e-08];
  const bedPoints = [a, b, c].map(([u, w]) => [u + shift, mirror * w, 0]);
  const returnPoints = [[...a, 0], [...a, -0.0142], [...c, -0.0142]]
    .map(([u, w, y]) => [u + shift - offset, mirror * w, y]);
  if (reverse) returnPoints.reverse();
  const mesh = (name, points, cushion = false) => ({name, cushion,
    rows: [{name, id: cushion ? 1 : 0, tri: Object.fromEntries(
      points.map((p, i) => [['a', 'b', 'c'][i], vertex(p)]))}],
    box: {min: {x: Math.min(...points.map(p => p[0])), y: Math.min(...points.map(p => p[2])), z: Math.min(...points.map(p => p[1]))},
      max: {x: Math.max(...points.map(p => p[0])), y: Math.max(...points.map(p => p[2])), z: Math.max(...points.map(p => p[1]))}}});
  return {meshes: [mesh('bed', bedPoints), mesh('vertical-return', returnPoints, true)]};
}
const boundaryGeometry = {L: 0.05, W: 0.025, pockets: [{corner: true}]};
const checkBoundary = (data, exact = false) => projectPocketOpenings(data, boundaryGeometry, frame, {exact});

test('window clipping preserves a submitted vertical edge shared with the bed', () => {
  for (const mirror of [-1, 1]) for (const reverse of [false, true]) for (const shift of [-0.05, 0, 0.05]) {
    const data = clippedBoundaryFixture({mirror, reverse, shift});
    const fast = checkBoundary(data), exact = checkBoundary(data, true);
    assert.equal(fast.status, 'PASS', JSON.stringify({mirror, reverse, shift}));
    assert.deepEqual(verdicts(fast), verdicts(exact));
    assert(fast.rows.every(r => r.uncovered_segments === 0));
  }
});

test('parameter clipping still detects a vertical return displaced into the hole', () => {
  for (const mirror of [-1, 1]) for (const offset of [1e-12, 4e-9, 0.001]) {
    const data = clippedBoundaryFixture({mirror, offset});
    const fast = checkBoundary(data), exact = checkBoundary(data, true);
    assert.equal(fast.status, 'FAIL', JSON.stringify({mirror, offset}));
    assert(fast.rows.some(r => r.uncovered_segments > 0));
    assert.deepEqual(verdicts(fast), verdicts(exact));
  }
});
test('a separate cloth flap is checked even when it is not named cushion', () => {
  const data = fixture(), cloth = {};
  data.meshes[0].materials = [cloth];
  data.meshes.push({name: 'cloth-flap', materials: [cloth], cushion: false,
    box: {min: {x: 0, y: 0.036, z: 0.025}, max: {x: 0.1, y: 0.036, z: 0.075}},
    rows: [{name: 'cloth-flap', id: 100, tri: {a: vertex(crossing[0]), b: vertex(crossing[1]), c: vertex(crossing[2])}}]});
  const fast = check(data), exact = check(data, true);
  assert.equal(fast.status, 'FAIL');
  assert(fast.rows.find(r => r.jaw === 1).cloth_meshes.includes('cloth-flap'));
  assert.deepEqual(verdicts(fast), verdicts(exact));
});
test('a below-bed cloth lip still cannot project into the opening', () => {
  const data = fixture(), cloth = {};
  data.meshes[0].materials = [cloth];
  data.meshes.push({name: 'fall-lip', materials: [cloth], cushion: false,
    box: {min: {x: 0.04, y: -0.0048, z: 0.0352}, max: {x: 0.06, y: 0, z: 0.04}},
    rows: [{name: 'fall-lip', id: 102, tri: {
      a: vertex([0.04, 0.04, 0]), b: vertex([0.06, 0.04, 0]), c: vertex([0.05, 0.0352, -0.0048])}}]});
  const fast = check(data), exact = check(data, true);
  assert.equal(fast.status, 'FAIL');
  assert(fast.rows.find(r => r.jaw === 1).cloth_meshes.includes('fall-lip'));
  assert.deepEqual(verdicts(fast), verdicts(exact));
});
test('an undrawn bed refuses the check instead of proving an empty opening', () => {
  const data = fixture(); data.meshes.shift();
  assert.equal(check(data).status, 'REFUSED');
});
test('a narrow cloth flap on the pocket axis cannot escape both jaws', () => {
  const data = fixture(), cloth = {};
  data.meshes[0].materials = [cloth];
  data.meshes.push({name: 'axis-cloth-flap', materials: [cloth], cushion: false,
    box: {min: {x: 0.04, y: 0.036, z: -0.002}, max: {x: 0.06, y: 0.036, z: 0.002}},
    rows: [{name: 'axis-cloth-flap', id: 101, tri: {
      a: vertex([0.04, -0.002]), b: vertex([0.06, 0]), c: vertex([0.04, 0.002])}}]});
  const fast = check(data), exact = check(data, true);
  assert.equal(fast.status, 'FAIL');
  assert(fast.rows.every(r => r.summed_overlap_mm2 > 0));
  assert.deepEqual(verdicts(fast), verdicts(exact));
});
