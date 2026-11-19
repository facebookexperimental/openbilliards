// Copyright (c) Meta Platforms, Inc. and affiliates.

// ensure-three.mjs — resolve the scene modules' bare 'three' import to the
// COMMITTED real library (web/vendor/three.module.min.js) for plain-node
// geometry tooling (check-cushion-profile / check-cue-clearance /
// section-compare).
//
// This replaces the old lib/three-stub.mjs bootstrap. The stub's naive
// ear-clipper preserved the input contour's winding, while real three.js
// ShapeUtils.triangulateShape (earcut) always emits shape-space-CCW
// triangles regardless of input winding — so the stub silently VALIDATED
// the isClockWise-conditional cap flip in cushionGeom that inverted every
// end-rail top cap into a down-facing, back-face-culled hole (issue #308,
// the wpa-lag see-through rail). section-compare.mjs also carried a
// "KNOWN STUB ARTIFACT" waiver for dropped ears on welded rings — a
// second stub/real divergence of the same class. Node geometry gates must
// exercise the SAME triangulation contract the app ships, so they now
// import the committed vendored module itself.
//
// Corrective, not just on-demand: a stale stub install is overwritten.
// Both historical bootstrap locations are handled — <repo>/node_modules
// (check-cushion-profile, check-cue-clearance) and <repo>/web/node_modules
// (section-compare) — because whichever is nearer to web/scene/table.js
// shadows the other during module resolution.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// realpathed: this module is reachable both as tools/render/lib/… and via
// the web/tools/render symlink, and the two bases resolve '..' differently
const here = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
const repo = path.resolve(here, '..', '..', '..');

/** repo root (realpathed), for symlink-agnostic sibling-module imports. */
export const repoRoot = repo;

/** file:// URL of a repo-relative module (symlink-agnostic import base). */
export const repoUrl = (rel) => pathToFileURL(path.join(repo, rel)).href;

export function ensureRealThree() {
  const vendor = path.join(repo, 'web', 'vendor', 'three.module.min.js');
  if (!fs.existsSync(vendor)) {
    throw new Error(`committed three module missing: ${vendor}`);
  }
  // The module BYTES are copied into the alias package rather than
  // re-exported by file URL: a bare `export * from 'file:///…/web/vendor/
  // three.module.min.js'` leaves the target outside any `type: module`
  // package scope, and Node versions without default module-syntax
  // detection (≤ 22.6) then parse the vendored ESM file as CommonJS and
  // abort (review review P2). Inside the generated package the copy IS in
  // an ESM scope, on every supported Node. Content-compared per run, so
  // a vendored three upgrade propagates on the next checker invocation.
  const bytes = fs.readFileSync(vendor);
  const pkgJson = JSON.stringify({
    name: 'three', version: '0.0.0-vendored-copy', type: 'module', main: 'index.js',
  });
  const dirs = [path.join(repo, 'node_modules', 'three')];
  // correct a stale web/node_modules/three only if that location exists —
  // never create a node_modules tree inside the served web/ docroot anew
  const webDir = path.join(repo, 'web', 'node_modules', 'three');
  if (fs.existsSync(webDir)) dirs.push(webDir);
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    const idx = path.join(dir, 'index.js');
    const pkg = path.join(dir, 'package.json');
    if (!fs.existsSync(idx) || !fs.readFileSync(idx).equals(bytes)) {
      fs.writeFileSync(idx, bytes);
    }
    if (!fs.existsSync(pkg) || fs.readFileSync(pkg, 'utf8') !== pkgJson) {
      fs.writeFileSync(pkg, pkgJson);
    }
  }
}
