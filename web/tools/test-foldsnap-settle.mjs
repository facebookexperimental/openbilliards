// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-foldsnap-settle.mjs — unit gate for the GH-887 settle judge
// (foldsnap-probe.mjs judgeStop / stopFacts): an integral scrollTop is
// judged against floor/ceil of each fractional stop, a fractional
// scrollTop keeps the 0.5 px tolerance. Dependency-free ESM:
//
//   node web/tools/test-foldsnap-settle.mjs
import { judgeStop, stopFacts } from './foldsnap-probe.mjs';

const F = [0, 137.734375];
const I = [0, 138];
const ROWS = [
  ['int137-fracstop', F, 137, true, 'integral'],
  ['int138-fracstop', F, 138, true, 'integral'],
  ['int0-fracstop', F, 0, true, 'integral'],
  ['int138-intstop', I, 138, true, 'integral'],
  ['frac137.667-fracstop', F, 137.667, true, 'fractional'],
  ['int131-fracstop', F, 131, false, 'integral'],
  ['int136-fracstop', F, 136, false, 'integral'],
  ['int139-fracstop', F, 139, false, 'integral'],
  ['int137-intstop', I, 137, false, 'integral'],
  ['frac137.1-fracstop', F, 137.1, false, 'fractional'],
  ['frac137.015625-fracstop', F, 137.015625, false, 'fractional'],
  ['nan', F, NaN, false, 'none'],
  ['empty-stops', [], 137, false, 'none'],
  ['null-stops', null, 137, false, 'none'],
];

const bad = [];
for (const [id, stops, scrollTop, expOn, expBranch] of ROWS) {
  const J = judgeStop(stops, scrollTop);
  if (J.on !== expOn || J.branch !== expBranch) {
    console.log(`MISMATCH ${id} expected on=${expOn} got on=${J.on} branch ${J.branch}`);
    bad.push(id);
  }
}
const factsGot = stopFacts(judgeStop(F, 137), 3);
const factsWant = 'raw scrollTop 137 dpr 3 nearest 137.734375 delta -0.734375 branch integral';
let factsOk = factsGot === factsWant;
if (!factsOk) {
  console.log(`MISMATCH facts ${factsGot}`);
  bad.push('facts');
}
const rowsOk = ROWS.length - bad.filter((x) => x !== 'facts').length;
if (!bad.length) {
  console.log(`PASS test-foldsnap-settle rows ${rowsOk}/${ROWS.length} facts 1/1`);
  process.exit(0);
}
console.log(`FAIL test-foldsnap-settle mismatch [${bad.join(',')}]`);
process.exit(1);
