#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Draw submission controls for the assembled-pocket collector. The full
// emitted-scene drawRange=0 red arm lives in check-pocket-assembly-equivalence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visibleTriangleRanges} from './check-pocket-assembly.mjs';

const solid = {visible: true, transparent: false, side: 0};
const geometry = (count = 12) => ({attributes: {position: {count}},
  index: null, groups: [], drawRange: {start: 0, count: Infinity}});
const spans = (g, m = solid) => visibleTriangleRanges(g, m).map(({start, end}) => [start, end]);

test('zero draw count removes indexed and non-indexed collars', () => {
  const g = geometry(); g.drawRange.count = 0;
  assert.deepEqual(spans(g), []);
  g.index = {count: 9};
  assert.deepEqual(spans(g), []);
});
test('draw range clips to the submitted index buffer', () => {
  const g = geometry(30); g.index = {count: 12};
  g.drawRange = {start: 6, count: 30};
  assert.deepEqual(spans(g), [[6, 12]]);
});
test('an incomplete trailing triangle supplies no surface', () => {
  const g = geometry(); g.drawRange = {start: 6, count: 2};
  assert.deepEqual(spans(g), []);
});
test('scalar material ignores geometry groups as the renderer does', () => {
  const g = geometry(); g.groups = [{start: 6, count: 3, materialIndex: 8}];
  assert.deepEqual(spans(g), [[0, 12]]);
});
test('material arrays submit only groups with a visible assigned material', () => {
  const g = geometry(18);
  assert.deepEqual(spans(g, [solid]), []);
  g.groups = [{start: 0, count: 3, materialIndex: 0},
    {start: 3, count: 3, materialIndex: 1}, {start: 6, count: 3, materialIndex: 9},
    {start: 12, count: 6, materialIndex: 0}];
  assert.deepEqual(spans(g, [solid, {...solid, visible: false}]), [[0, 3], [12, 18]]);
});
test('groups intersect drawRange without filling gaps between draws', () => {
  const g = geometry(18); g.drawRange = {start: 3, count: 12};
  g.groups = [{start: 0, count: 6, materialIndex: 0}, {start: 12, count: 6, materialIndex: 0}];
  assert.deepEqual(spans(g, [solid]), [[3, 6], [12, 15]]);
});
