// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-sfx-rotation.mjs — node gate for the SFX bank's anti-machine-gun
// seeded rotation (no Chrome): drives the REAL web/app/synth.js scheduleCue
// through a minimal BaseAudioContext mock and asserts
//   1. eight consecutive cue seeds cycle through >1 variant (true seeded
//      round-robin — the pre-fix rnd()-draw selection measured seeds 0-3
//      all landing on the last variant of a 4-clip tier);
//   2. consecutive seeds never repeat a variant (tier size >= 2);
//   3. the same seed picks the same clip on independent contexts — the
//      live scheduler (AudioContext) and the export renderer
//      (OfflineAudioContext) call this exact function with the same
//      deriveCues-index seeds, so per-seed determinism IS live/export
//      voicing agreement.
//
//   node web/tools/check-sfx-rotation.mjs
import { SFX_FILES, scheduleCue, DEFAULT_PROFILE } from '../app/synth.js';

let failures = 0;
const fail = (msg) => { console.error('FAIL:', msg); failures++; };

// ---- minimal BaseAudioContext mock (only what synth.js voices touch) ----
const param = () => ({
  value: 0,
  setValueAtTime() {}, linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
});
const node = () => ({
  buffer: null, loop: false, type: '',
  playbackRate: param(), frequency: param(), Q: param(), gain: param(),
  connect: (n) => n, start() {}, stop() {},
});
const mockCtx = () => ({
  sampleRate: 48000,
  createBufferSource: node, createGain: node, createBiquadFilter: node,
  createBuffer: (_ch, len) => ({ getChannelData: () => new Float32Array(len) }),
});

// ---- a full fake bank whose clip lookups record the picked variant ----
const picked = [];
class SpyMap extends Map {
  get(k) { picked.push(k); return super.get(k); } // bankBuffer: chosen clip only
}
const clips = new SpyMap();
for (const tiers of Object.values(SFX_FILES)) {
  for (const list of Object.values(tiers)) {
    for (const n of list) clips.set(n, { rate: 44100, data: new Float32Array(64) });
  }
}

/** Voice one cue on a FRESH context/buffer-cache; return the picked clip. */
function pick(type, gain, seed) {
  const bank = { clips, buffers: new WeakMap() };
  const ac = mockCtx();
  picked.length = 0;
  scheduleCue(ac, node(), {}, type, gain, 0, { profile: DEFAULT_PROFILE, seed, bank });
  if (picked.length !== 1) fail(`${type} g=${gain} seed=${seed}: expected 1 bank pick, got ${picked.length}`);
  return picked[0];
}

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
for (const [type, gain, tierName] of [
  ['click', 0.9, 'h'], ['click', 0.5, 'm'], ['cue', 0.8, 'h'],
  ['cushion', 0.9, 'h'], ['pocket', 0.6, 'r'],
]) {
  const names = SEEDS.map((s) => pick(type, gain, s));
  const tierLen = SFX_FILES[type][tierName].length;
  const distinct = new Set(names);
  console.log(`${type}/${tierName} seeds 0-7 ->`, names.map((n) => n.replace(/^\w+-/, '')).join(' '));
  if (distinct.size <= 1) fail(`${type}/${tierName}: 8 consecutive seeds voiced ONE variant (machine-gun)`);
  if (distinct.size !== Math.min(tierLen, SEEDS.length)) {
    fail(`${type}/${tierName}: expected all ${tierLen} variants across 8 consecutive seeds, saw ${distinct.size}`);
  }
  for (let i = 1; i < names.length; i++) {
    if (names[i] === names[i - 1]) fail(`${type}/${tierName}: consecutive seeds ${i - 1},${i} repeated ${names[i]}`);
  }
  // live/export agreement: same seed, independent contexts, same clip
  for (const s of SEEDS) {
    if (pick(type, gain, s) !== names[s]) fail(`${type}/${tierName} seed=${s}: pick not deterministic across contexts`);
  }
}

// synth fallback must not touch the bank (regression guard for the seam)
picked.length = 0;
scheduleCue(mockCtx(), node(), {}, 'click', 0.9, 0, { profile: DEFAULT_PROFILE, seed: 0, bank: null });
if (picked.length) fail('bank-less scheduleCue touched the bank');

if (failures) { console.error(`check-sfx-rotation: ${failures} failure(s)`); process.exit(1); }
console.log('check-sfx-rotation PASS — seeded round-robin cycles variants, live/export agree');
