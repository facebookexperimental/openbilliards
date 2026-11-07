// Copyright (c) Meta Platforms, Inc. and affiliates.

// FIX4: identify the renderer actually served to the letters capture, including
// table.js's local shading imports. Never hash the instrument's checkout here.
import {createHash} from 'node:crypto';
import {waitForHttpReadiness} from '../../../../web/tools/cdp.mjs';

export const RENDERER_FILES = Object.freeze([
  'scene/table.js', 'scene/shading.js', 'scene/clothvisuals.js',
  'scene/diamondproam_nose.js', // C4B: the canonical nose leaf consumed by table.js.
  'scene/diamondproam_corner.js', // C7: the canonical outer PLAN rings and junction finish.
]);

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export async function measureServedRenderer(url, fetchImpl = fetch) {
  const root = new URL('.', url);
  await waitForHttpReadiness(url, fetchImpl);
  const files = {};
  for (const name of [...RENDERER_FILES].sort()) {
    const source = new URL(name, root);
    const response = await fetchImpl(source, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000), // Runtime I/O bound, not a measurement tolerance.
    });
    if (!response.ok) throw new Error(`letters served renderer ${source}: HTTP ${response.status}`);
    files[name] = sha(Buffer.from(await response.arrayBuffer()));
  }
  const payload = Object.entries(files).map(([name, digest]) => `${name}:${digest}\n`).join('');
  return {root_url: root.href, sha256: sha(payload), files};
}
