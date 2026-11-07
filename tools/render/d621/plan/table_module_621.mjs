// Copyright (c) Meta Platforms, Inc. and affiliates.

// DERIVED: load the real table module in memory for render-only geometry diagnostics.
// No kernel is loaded, rebuilt, replaced, or simulated. Private render functions are
// exposed only in this VM module; the on-disk application module is not instrumented.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ensureRealThree, repoRoot } from '../../lib/ensure-three.mjs';

export async function tableModule(revision = null) {
  ensureRealThree();
  const rel = 'web/scene/table.js';
  const maxBuffer = fs.statSync(path.join(repoRoot, rel)).size * 2; // CLEARANCE: twice the current source byte count.
  const source = revision
    ? execFileSync('git', ['show', `${revision}:${rel}`], { cwd: repoRoot, encoding: 'utf8', maxBuffer })
    : fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  const identifier = pathToFileURL(path.join(repoRoot, rel)).href;
  const resolve = (specifier) => specifier === 'three'
    ? pathToFileURL(path.join(repoRoot, 'node_modules/three/index.js')).href
    : new URL(specifier, identifier).href;
  const cache = new Map();
  const mod = new vm.SourceTextModule(source + `
export { frameGeom as d621FrameGeom };
// Historical main predates these Pro-Am diagnostics; public entry snapshots
// still load that immutable source without requiring later private helpers.
export const d621RailPlans = typeof proamRailPlans === 'function' ? proamRailPlans : null;
export const d621CrownedPlankGeom = typeof crownedPlankGeom === 'function' ? crownedPlankGeom : null;
export const d621CrownDropAt = typeof crownDropAt === 'function' ? crownDropAt : null;
export const d621CrownedOrientationCensus = typeof crownedOrientationCensus === 'function'
  ? crownedOrientationCensus : null;
export const d621CornerQuarter = typeof cornerQuarter === 'function' ? cornerQuarter : null;
export const d621CornerRingAt = typeof cornerRingAt === 'function' ? cornerRingAt : null;
export const d621CrownedOuterSkin = typeof crownedOuterSkin === 'function' ? crownedOuterSkin : null;
export const d621ApronGeometry = typeof proamApronGeometry === 'function' ? proamApronGeometry : null;
`, { identifier, importModuleDynamically: (specifier) => import(resolve(specifier)) });
  await mod.link(async (specifier) => {
    const url = resolve(specifier);
    if (!cache.has(url)) {
      const ns = await import(url);
      const dependency = new vm.SyntheticModule(Object.keys(ns), function expose() {
        for (const key of Object.keys(ns)) this.setExport(key, ns[key]);
      }, { identifier: url });
      cache.set(url, dependency);
    }
    return cache.get(url);
  });
  await mod.evaluate();
  return { api: mod.namespace, source,
    sourceSha256: createHash('sha256').update(source).digest('hex'), revision };
}
