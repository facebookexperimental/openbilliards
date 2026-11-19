// Copyright (c) Meta Platforms, Inc. and affiliates.

// TESSELLATION: synthetic lower-face fixtures, never copied MODEL vertices.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialFacingSupport, lowerFaceSupport, SAMPLING_LAW} from './letters_sampling_621.mjs';

test('lower face supplies its own endpoint and retains the three-row minimum', () => {
  const profile = [[25.4, 0], [24.7, 1.6], [0.15, 36.05], [0, 36.5125]];
  assert.equal(lowerFaceSupport(profile, 36.5125).top_y_mm, 36.05);
  assert.equal(SAMPLING_LAW.minimum_fit_rows, 3);
  assert.equal(SAMPLING_LAW.thresholds.CP01_mm, .25);
  assert.equal(SAMPLING_LAW.thresholds.CP09_deg, 1);
});

test('collinear triangle splits do not move the lower-face endpoint', () => {
  // TESSELLATION: insert exact subdivisions on the same synthetic face.
  const a = [24.7, 1.6], b = [.15, 36.05];
  const points = [0, .2, .4, .6, .8, 1].map(t => a.map((x, i) => x + t * (b[i] - x)));
  const profile = [[25.4, 0], ...points, [0, 36.5125]];
  assert.ok(Math.abs(lowerFaceSupport(profile, 36.5125).top_y_mm - b[1]) < 1e-9);
});

test('absent support remains unresolved rather than using a radius-derived window', () => {
  assert.equal(lowerFaceSupport([], 36.5125), null);
  assert.equal(lowerFaceSupport([[0, 36.5125]], 36.5125), null);
  assert.match(SAMPLING_LAW.crest, /no radius-derived aperture/);
});

const twoFaces = (angle = 51) => {
  // TESSELLATION: an analytic synthetic jaw and two distinct straight faces.
  const arc = Array.from({length: 7}, (_, i) => {
    const t = i / 6 * 39 * Math.PI / 180;
    return [80 - 21 * Math.sin(t), 21 * (1 - Math.cos(t))];
  });
  const f = arc.at(-1), slope = Math.tan(angle * Math.PI / 180);
  const h = [f[0] - 5 * slope, f[1] + 5];
  return [...arc, [f[0] - 2 * slope, f[1] + 2], h, [h[0] - 40, h[1] + 60]];
};

test('a short initial face remains the measured face before a longer terminal return', () => {
  assert.deepEqual(initialFacingSupport(twoFaces()), {start: 6, end: 8, arc_points: 7});
  assert.equal(SAMPLING_LAW.coordinate_precision_mm, .0001);
});

test('the face selector measures an incorrect angle without selecting the expected angle', () => {
  const points = twoFaces(57), support = initialFacingSupport(points);
  const a = points[support.start], b = points[support.end];
  const angle = Math.atan2(a[0] - b[0], b[1] - a[1]) * 180 / Math.PI;
  assert.ok(Math.abs(angle - 57) < 1e-10);
  assert.ok(Math.abs(angle - 51) > .25);
});

test('three arc points or a straight chain do not establish a circular-jaw witness', () => {
  assert.equal(initialFacingSupport(twoFaces().slice(4)), null);
  assert.equal(initialFacingSupport([[4, 0], [3, 1], [2, 2], [1, 3], [0, 4]]), null);
});
