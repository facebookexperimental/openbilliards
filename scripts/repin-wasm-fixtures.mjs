// Copyright (c) Meta Platforms, Inc. and affiliates.

// repin-wasm-fixtures.mjs — the VERSION-ONLY canonical-wasm repin cascade
// (GH-343; procedure = the 9ca9490f/#283 round, mechanized so the ceremony
// is one command and every proof is executed, never trusted):
//
//   1. legacy-links.json: re-simulate every pinned scenario on the NEW
//      committed dist, SPLICE the old version string back into the record
//      bytes and require the OLD pinned record_sha256 byte-for-byte (the
//      splice-proof: only the embedded stamp moved), then restamp
//      record_sha256 + kernel_version and append the repin note.
//   2. kernel-corpus.json: require the version-pinned break-fixture entry's
//      NEW event stream (version-free bytes) to keep its events_sha256,
//      then restamp pinned_kernel_version.
//   3. sdk/ts/test/fixtures/golden_record.json: re-simulate from its own
//      inputs on the new dist; require a version-only splice (old bytes
//      reproduced with the old stamp spliced back) and write the new bytes.
//
// ABORTS on any divergence beyond the stamp: a real physics change must go
// through the flip-cascade repin protocol instead, never this script.
//
//   node scripts/repin-wasm-fixtures.mjs "<note text>"   (run from repo root)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'web');
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const note = process.argv[2];
if (!note) {
  console.error('usage: node scripts/repin-wasm-fixtures.mjs "<repin note>"');
  process.exit(2);
}

const { init } = await import(path.join(webDir, 'dist', 'pool-sdk', 'engine.js'));
const eng = await init(path.join(webDir, 'dist', 'pool-wasm', 'pool_wasm.js'));
const newV = eng.version();

// ---- 1. legacy-links.json splice-proof + restamp ----------------------------
const linksPath = path.join(webDir, 'tools', 'fixtures', 'legacy-links.json');
const linksText = readFileSync(linksPath, 'utf8');
const links = JSON.parse(linksText);
const oldV = links.kernel_version;
if (oldV === newV) {
  console.error(`legacy-links.json already pinned on ${newV} — nothing to do`);
  process.exit(2);
}
let proved = 0;
let total = 0;
for (const entry of links.entries) {
  const newShas = [];
  entry.scenarios.forEach((scenario, i) => {
    total += 1;
    // the corpus pins the APP's record surface: the ECMAScript-normalized
    // re-serialization JSON.stringify(JSON.parse(record)) — the
    // share.test.ts G2 convention, byte-compared there and in e2e-share
    const rec = JSON.stringify(JSON.parse(eng.simulateJson(scenario)));
    const spliced = rec.replaceAll(`"kernel_version":"${newV}"`,
      `"kernel_version":"${oldV}"`);
    if (spliced === rec) {
      console.error(`${entry.name}#${i}: new record does not carry ${newV}`);
      process.exit(1);
    }
    if (sha256(spliced) !== entry.record_sha256[i]) {
      console.error(`${entry.name}#${i}: SPLICE-PROOF FAILED — the record `
        + 'diverges beyond the version stamp; this is NOT a version-only '
        + 'repin (flip-cascade protocol required)');
      process.exit(1);
    }
    proved += 1;
    newShas.push(sha256(rec));
  });
  entry.record_sha256 = newShas;
}
links.kernel_version = newV;
links._readme.push(note);
writeFileSync(linksPath, `${JSON.stringify(links, null, 1)}\n`);
console.log(`legacy-links.json: splice-proof ${proved}/${total}, `
  + `restamped ${oldV} -> ${newV}`);

// ---- 2. kernel-corpus.json version-pinned entries ---------------------------
const corpusPath = path.join(webDir, 'tools', 'fixtures', 'kernel-corpus.json');
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const breakScenario = readFileSync(path.join(root, 'crates', 'pool-wasm',
  'tests', 'fixtures', 'break_scenario.json'), 'utf8').trim();
for (const pin of corpus.scenarios) {
  if (!pin.pinned_kernel_version) continue;
  if (pin.name !== 'pool-wasm-break-fixture') {
    console.error(`unexpected version-pinned entry ${pin.name}`);
    process.exit(1);
  }
  const events = JSON.stringify(JSON.parse(eng.simulateJson(breakScenario)).events);
  if (sha256(events) !== pin.events_sha256) {
    console.error(`${pin.name}: NEW event stream != pinned events_sha256 — `
      + 'not a version-only repin (flip-cascade protocol required)');
    process.exit(1);
  }
  pin.pinned_kernel_version = newV;
  console.log(`kernel-corpus.json: ${pin.name} events byte-identical, `
    + `pinned_kernel_version -> ${newV}`);
}
writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 1)}\n`);

// ---- 3. sdk golden_record.json ----------------------------------------------
const goldenPath = path.join(root, 'sdk', 'ts', 'test', 'fixtures',
  'golden_record.json');
const oldGolden = readFileSync(goldenPath, 'utf8');
const g = JSON.parse(oldGolden);
const oldGoldenV = g.kernel_version;
const newGolden = eng.simulateJson(JSON.stringify(
  { system: g.initial, shot: g.shot, options: g.options }));
const splicedGolden = newGolden.replaceAll(`"kernel_version":"${newV}"`,
  `"kernel_version":"${oldGoldenV}"`);
if (splicedGolden !== oldGolden) {
  console.error('golden_record.json: SPLICE-PROOF FAILED — record diverges '
    + 'beyond the version stamp');
  process.exit(1);
}
writeFileSync(goldenPath, newGolden);
console.log(`golden_record.json: version-only splice proven, `
  + `restamped ${oldGoldenV} -> ${newV}`);

// ---- 4. web/sw.js VERSION + precache manifest (branch pwa-standalone) -------
// The PWA service worker's cache name derives from the shipped kernel
// stamps plus a hash over every precached byte — a dist repin MUST reprint
// it, or installed clients keep serving the pre-repin snapshot offline.
execFileSync(process.execPath,
  [path.join(webDir, 'tools', 'gen-sw-precache.mjs')], { stdio: 'inherit' });

console.log('repin cascade complete — now run: node scripts/bench-wasm.mjs '
  + '&& (cd sdk/ts && npm test); in the PRIVATE tree additionally: node '
  + 'web/tools/e2e-share.mjs --corpus (the corpus arm imports the pre012 '
  + 'fixture, which never ships)');
