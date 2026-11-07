// Copyright (c) Meta Platforms, Inc. and affiliates.

// pages-link-gate.mjs — link-integrity gate for the assembled Pages artifact.
//
// Defect class (owner audit 2026-08-28): "ships in the repo" and "served by
// Pages" are different survival criteria — 143 relative hrefs into sdk/,
// crates/, scripts/ and docs/ resolved fine on a repo-root dev serve and
// 404'd on the assembled artifact. Additionally GitHub PROJECT pages serve
// under /<repo>/, so an href that escapes the artifact root does not clamp
// like a localhost-root preview — it silently leaves the project subpath.
// This gate therefore treats ANY root-escaping resolution as a failure and
// requires every internal target to exist in the artifact.
//
// usage: node web/tools/pages-link-gate.mjs <dist-pages-dir>
//
// Companion of pages-artifact-gate.mjs (runtime-fetched URLs); this one
// covers authored hyperlinks/media refs. Both run in pages.yml before
// upload — no live deploy exists to e2e, so the artifact assertion IS the
// gate.

import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root || !fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('usage: node web/tools/pages-link-gate.mjs <dist-pages-dir>');
  process.exit(2);
}

const pages = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.html')) pages.push(full);
  }
})(root);

const ATTR = /(?:href|src|poster)="([^"]+)"/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
let bad = 0;
let checked = 0;
for (const pg of pages) {
  const rel = path.relative(root, pg);
  const text = fs.readFileSync(pg, 'utf8');
  for (const m of text.matchAll(ATTR)) {
    const href = m[1];
    if (EXTERNAL.test(href) || href.startsWith('#')) continue;
    const bare = href.split('#')[0].split('?')[0];
    if (!bare) continue;
    checked += 1;
    // resolve like a browser against the page URL, but WITHOUT root
    // clamping: on a project-pages subpath, escaping the root is a 404
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(rel), bare));
    if (resolved.startsWith('..') || path.posix.isAbsolute(bare)) {
      console.error(`LINK-GATE FAIL: ${rel} -> ${href} escapes the artifact root (project-pages subpath 404)`);
      bad += 1;
      continue;
    }
    let full = path.join(root, resolved);
    if (fs.statSync(full, { throwIfNoEntry: false })?.isDirectory()) {
      full = path.join(full, 'index.html');
    }
    if (!fs.statSync(full, { throwIfNoEntry: false })?.isFile()) {
      console.error(`LINK-GATE FAIL: ${rel} -> ${href} (missing ${resolved})`);
      bad += 1;
    }
  }
}
console.log(bad
  ? `LINK-GATE: ${bad} dead/escaping link(s) across ${pages.length} page(s)`
  : `LINK-GATE: complete (${checked} internal refs across ${pages.length} pages all resolve)`);
process.exit(bad ? 1 : 0);
