// Copyright (c) Meta Platforms, Inc. and affiliates.

// pages-artifact-gate.mjs — artifact-level gate for the Pages layout (GH-247).
//
// Defect class: THE PACKAGED LAYOUT DIFFERS FROM THE DEV LAYOUT. In a repo
// checkout `web/tools/render` is a symlink into the repo-root `tools/`, so a
// dev server resolves `/tools/render/grade.json` fine; `pages.yml` strips
// `dist-pages/web/tools` from the artifact, so on a published site
// `offline-render.js loadGrade()` (which every export tier awaited at the
// time — they all set `grade: 'sp'`; since GH-329 the in-app tiers ship
// grade: 0 and the fetch is spec-driven only, but grade.json REMAINS a
// runtime-fetched invariant: the cdp.mjs served-tree preflight probes it as
// the dangling-symlink tripwire and scripted graded renders still load it)
// 404'd and Export threw instead of rendering. No live
// deploy exists to e2e (Pages is disabled), so this artifact assertion IS the
// gate: enumerate the URLs the app fetches at RUNTIME, site-root-relative,
// and require each to exist non-empty in the assembled artifact.
//
// usage: node web/tools/pages-artifact-gate.mjs <dist-pages-dir>
//
// Grow REQUIRED when the app grows a runtime fetch — a path missing here is
// a 404 on the published site. The iOS bundle solves the same class with
// ios/tools/bundle-manifest.mjs INCLUDE_FILES; keep the two in agreement.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { noticeInventory } from '../../tools/notice-inventory.mjs';

const REQUIRED = [
  // entry points (site root redirects; PLAY NOW links ../web/app.html)
  'index.html',
  'web/app.html',
  // runtime fetches, resolved against the serving layout (app at /web/):
  // offline-render.js:160 new URL('../../tools/render/grade.json', import.meta.url)
  // -> SITE ROOT /tools/render/grade.json (the GH-247 404)
  'tools/render/grade.json',
  // kernel glue: web/dist/pool-wasm/pool_wasm.js:508 fetches its sibling
  'web/dist/pool-wasm/pool_wasm_bg.wasm',
  // rules glue via the SDK (pool-sdk/rules/backend.js -> pool_rules.js:402)
  'web/dist/pool-rules/pool_rules_bg.wasm',
  // i18n dictionaries (i18n.js:29 fetches ./locales/<locale>.json; boot
  // ALWAYS awaits the English fetch before the UI initialises, the other
  // six are selected-locale fetches — all seven are runtime URLs)
  ...['en', 'zh-CN', 'es', 'ja', 'de', 'fr', 'ko']
    .map((l) => `web/app/locales/${l}.json`),
  // PWA install surface (branch pwa-standalone): app.html links the
  // manifest + apple-touch-icon and registers ./sw.js on load; the manifest
  // references the two icon renders. All are runtime fetches on the
  // published site (the browser fetches manifest/icons on install, sw.js on
  // every visit). sw.js precaches its own enumerated tree — freshness is
  // gated by `node web/tools/gen-sw-precache.mjs --check`, presence here.
  'web/manifest.webmanifest',
  'web/sw.js',
  'web/app/icons/icon-192.png',
  'web/app/icons/icon-512.png',
  'web/app/icons/apple-touch-icon.png',
  // the update notice's take-over re-trigger (#1167): app/swupdate.js starts
  // new Worker(new URL('../sw-retrigger.js', import.meta.url)), a sibling of
  // sw.js inside its scope, outside the precache
  'web/sw-retrigger.js',
];

// Third-party notices that must ship in every distribution of the app
// (THIRD_PARTY_NOTICES.md): web/vendor/LICENSES.md, every licence text it
// references, and the MIT notices of the Rust crates next to the two wasm
// binaries — derived from this checkout's LICENSES.md by
// tools/notice-inventory.mjs. The published site is a distribution of those
// binaries; vendor/NOTICE-pooltool.txt and vendor/LICENSES.md are also runtime
// fetches since the settings About Licences row (it reads them inline).
const NOTICES = noticeInventory(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
  .map((rel) => `web/${rel}`);

const root = process.argv[2];
if (!root || !fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('usage: node web/tools/pages-artifact-gate.mjs <dist-pages-dir>');
  process.exit(2);
}
let bad = 0;
for (const rel of REQUIRED) {
  const st = fs.statSync(path.join(root, rel), { throwIfNoEntry: false });
  if (!st?.isFile() || st.size === 0) {
    console.error(`PAGES-ARTIFACT FAIL: ${rel} missing or empty — the published site 404s it`);
    bad += 1;
  } else {
    console.log(`PAGES-ARTIFACT ok: ${rel} (${st.size} bytes)`);
  }
}
for (const rel of NOTICES) {
  const st = fs.statSync(path.join(root, rel), { throwIfNoEntry: false });
  if (!st?.isFile() || st.size === 0) {
    console.error(`PAGES-ARTIFACT FAIL: ${rel} missing or empty — a third-party notice the app must ship with (THIRD_PARTY_NOTICES.md)`);
    bad += 1;
  } else {
    console.log(`PAGES-ARTIFACT ok: ${rel} (${st.size} bytes)`);
  }
}
console.log(bad
  ? `PAGES-ARTIFACT: ${bad} required path(s) absent from the artifact`
  : `PAGES-ARTIFACT: complete (${REQUIRED.length} runtime-fetched paths and ${NOTICES.length} notices present)`);
process.exit(bad ? 1 : 0);
