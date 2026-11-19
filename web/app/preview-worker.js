// Copyright (c) Meta Platforms, Inc. and affiliates.

// preview-worker.js — off-main-thread aim-preview simulation (STREAM-A,
// perf wave). preview.js posts the EXACT scenario JSON its synchronous path
// would submit (byte-identical construction, same wasm binary — so the
// ghost still matches the eventual shot record bit-for-bit); this worker
// runs the kernel sim + record parse + sampling (preview-compute.js) and
// returns plain kernel-frame numbers. Rationale (perf-aim.mjs forensics):
// recompute is ~1 ms typical but spikes >16 ms on rack-bound aims — inside
// the rAF frame hook that was a dropped frame (aim stutter, "mouse jumps")
// every time the aim swept across the pack.
import * as glue from '../dist/pool-wasm/pool_wasm.js';
import { init as initSdk } from '../dist/pool-sdk/index.js';
import { computePreview } from './preview-compute.js';

const enginePromise = initSdk(glue);

self.onmessage = async (e) => {
  const { id } = e.data;
  try {
    const engine = await enginePromise;
    const res = computePreview(engine, e.data);
    const transfers = [res.cuePts.buffer];
    if (res.practice) transfers.push(res.practice.pts.buffer);
    if (res.cuePost) transfers.push(res.cuePost.pts.buffer);
    self.postMessage({ id, ...res }, transfers);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message ?? String(err) });
  }
};
