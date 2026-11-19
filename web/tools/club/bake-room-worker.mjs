// Copyright (c) Meta Platforms, Inc. and affiliates.

// bake-room-worker.mjs — one worker of the club room's light bake (web/tools/club/bake-room.html). It receives the scene once,
// builds its own BVH, and shades the texel ranges and the ranges of the light volume's grid points it is handed. They are independent, so the result does not depend on how
// many workers there are or on which one takes a range.
import { buildBVH, shadeTexels, shadeVolume } from './bake-room-core.mjs';

let job = null;
self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'scene') {
    job = { scene: m.scene, bvh: buildBVH(m.scene.tris, m.scene.flags), patchLight: m.patchLight, tex: m.tex, grid: m.grid, opts: m.opts };
    self.postMessage({ type: 'ready' });
  } else if (m.type === 'run') {
    const out = shadeTexels(job.scene, job.bvh, job.patchLight, job.tex, m.from, m.to, job.opts);
    self.postMessage({ type: 'done', from: m.from, to: m.to, out }, [out.buffer]);
  } else if (m.type === 'volume') {
    // a range of grid points of the light volume
    const out = shadeVolume(job.scene, job.bvh, job.patchLight, job.grid, m.from, m.to, job.opts);
    self.postMessage({ type: 'done', volume: true, from: m.from, to: m.to, out }, [out.buffer]);
  }
};
