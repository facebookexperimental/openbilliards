// Copyright (c) Meta Platforms, Inc. and affiliates.

// bundle-manifest.mjs — game bundle sync + hash manifest pipeline
// (feature 016, contracts/game-bundle.md 3; manifest schema data-model.md 3).
//
//   node ios/tools/bundle-manifest.mjs generate
//     Mirror repo web/ -> ios/App/Resources/web with rsync --delete
//     semantics (verbatim byte copy, relative layout preserved, extraneous
//     destination files removed) applying the FROZEN exclusion filter of
//     game-bundle.md 2, then write bundle-manifest.json (v/source/
//     generatedAt/sourceCommit/files {p, sha256, bytes}) INTO the synced
//     tree. Implemented as a pure-Node mirror so generate and verify share
//     ONE filter implementation and behave identically under GNU rsync-less
//     environments (macOS openrsync vs GNU rsync divergence is a real CI
//     hazard); the operation is exactly the contract's rsync --delete.
//
//   node ios/tools/bundle-manifest.mjs verify
//     INDEPENDENT re-hash of source web/ (same filter) AND the synced tree,
//     each matched against the manifest exactly — extra, missing, or
//     hash/size-diverging files fail with a per-file report and a nonzero
//     exit (SC-002's automated check). Also asserts the canonical wasm
//     dist/pool-wasm/pool_wasm_bg.wasm is present and reports its SHA-256
//     (the determinism token surfaced at distribution level,
//     distribution.md 3).
//
// The synced tree ios/App/Resources/web/ is a BUILD PRODUCT, gitignored:
// the repo never contains a second copy of the game (FR-002).
//
// Exit codes: 0 = OK; 1 = verification delta; 2 = usage/environment error.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { noticeInventory } from '../../tools/notice-inventory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'web');
const DEST = path.join(ROOT, 'ios', 'App', 'Resources', 'web');
const MANIFEST_NAME = 'bundle-manifest.json';
const CANONICAL_WASM = 'dist/pool-wasm/pool_wasm_bg.wasm';
// Third-party notices that MUST ship with the binary (THIRD_PARTY_NOTICES.md):
// vendor/LICENSES.md, every licence text it references, and the MIT notices of
// the Rust crates next to the two wasm binaries (tools/notice-inventory.mjs
// derives the list from LICENSES.md). verify fails when one of them is missing
// from the manifest.
const REQUIRED_NOTICES = noticeInventory(SRC);

// FROZEN exclusion filter (game-bundle.md 2): dev/e2e-only files never
// imported by app.html's module graph. Patterns are root-anchored relative
// to web/ (the capture baselines live at the web/ root — data-model.md 3).
// Additions to this list are integration decisions, not lane edits.
// vendor/gsap (integration decision 2026-10-25, game-bundle.md v1.2): GSAP
// is render-pipeline-only (web/tools/scenario-textanim.mjs and
// scenario-titlecard.mjs load it), so the unused file stays out of the bundle.
const EXCLUDE_DIRS = ['tools', 'vendor/gsap'];
const EXCLUDE_FILES = ['README.md', 'spike.html'];
const EXCLUDE_GLOBS = [/^spike-[^/]*\.png$/, /^app-preview-[^/]*\.png$/, /^e2e-[^/]*\.png$/];

// Include-list EXCEPTIONS to the exclusion filter (integration decision,
// game-bundle.md §2 v1.1 — 023 acceptance deviation D4, run-2026-07-17):
// web/app/offline-render.js loadGrade() fetches
// app://local/tools/render/grade.json at runtime, so the offline export
// tiers fail in BOTH shells without it. Exactly these files ride the
// bundle; the rest of tools/ stays excluded. web/tools/render is a
// symlink (-> repo-root tools/render): the mirror traverses it and the
// synced tree carries a REAL file (no symlink ships in the bundle).
const INCLUDE_FILES = ['tools/render/grade.json'];

// Hygiene (not part of the FROZEN content filter): OS metadata junk is
// never bundle content and would make verify flaky across checkouts.
const JUNK_BASENAMES = new Set(['.DS_Store']);

function excluded(rel) {
  if (JUNK_BASENAMES.has(path.posix.basename(rel))) return true;
  if (INCLUDE_FILES.includes(rel)) return false;
  // Ancestor directories of an include exception stay walkable; their
  // other children still hit the exclusion rules below individually.
  if (INCLUDE_FILES.some((f) => f.startsWith(`${rel}/`))) return false;
  for (const d of EXCLUDE_DIRS) if (rel === d || rel.startsWith(`${d}/`)) return true;
  if (EXCLUDE_FILES.includes(rel)) return true;
  return EXCLUDE_GLOBS.some((g) => g.test(rel));
}

/** Recursively list files under baseDir as sorted posix-relative paths. */
function walk(baseDir, { filter } = {}) {
  const out = [];
  const visit = (rel) => {
    const abs = rel === '' ? baseDir : path.join(baseDir, rel);
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (filter && excluded(childRel)) continue;
      if (entry.isSymbolicLink()) {
        // Symlinks cannot ship verbatim inside an app bundle resource
        // tree; anything reachable must be a real file. The single
        // sanctioned traversal: a symlinked directory on the path to an
        // INCLUDE_FILES exception (web/tools/render -> repo-root
        // tools/render) is followed, and the mirror materializes the
        // included file(s) as REAL files in the synced tree.
        const followable = filter
          && INCLUDE_FILES.some((f) => f.startsWith(`${childRel}/`))
          && fs.statSync(path.join(baseDir, childRel)).isDirectory();
        if (!followable) throw new Error(`symlink in bundle content: ${childRel}`);
        visit(childRel);
      } else if (entry.isDirectory()) {
        visit(childRel);
      } else if (entry.isFile()) {
        out.push(childRel);
      } else {
        throw new Error(`unsupported file type: ${childRel}`);
      }
    }
  };
  visit('');
  out.sort();
  return out;
}

function sha256(absPath) {
  return createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

/** Hash every listed rel path under baseDir -> Map(rel -> {sha256, bytes}). */
function hashTree(baseDir, rels) {
  const map = new Map();
  for (const rel of rels) {
    const abs = path.join(baseDir, rel);
    map.set(rel, { sha256: sha256(abs), bytes: fs.statSync(abs).size });
  }
  return map;
}

function sourceCommit() {
  try {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'web/'],
      { cwd: ROOT, encoding: 'utf8' }).trim();
    if (dirty !== '') return 'dirty';
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'dirty';
  }
}

function removeEmptyDirs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirs(path.join(dir, entry.name));
  }
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

function generate() {
  if (!fs.existsSync(SRC)) throw new Error(`source tree missing: ${SRC}`);
  const srcRels = walk(SRC, { filter: true });
  fs.mkdirSync(DEST, { recursive: true });

  // Mirror with --delete semantics: copy every included source file
  // byte-verbatim, then remove anything in the destination that is not in
  // the source set (including any stale bundle-manifest.json — the fresh
  // one is written after the mirror).
  const srcSet = new Set(srcRels);
  for (const rel of walk(DEST)) {
    if (!srcSet.has(rel)) fs.rmSync(path.join(DEST, rel));
  }
  removeEmptyDirs(DEST);
  fs.mkdirSync(DEST, { recursive: true });
  for (const rel of srcRels) {
    const to = path.join(DEST, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(SRC, rel), to);
  }

  const hashed = hashTree(SRC, srcRels);
  const manifest = {
    v: 1,
    source: 'web/',
    generatedAt: new Date().toISOString(),
    sourceCommit: sourceCommit(),
    files: srcRels.map((rel) => ({
      p: rel, sha256: hashed.get(rel).sha256, bytes: hashed.get(rel).bytes,
    })),
  };
  fs.writeFileSync(path.join(DEST, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);

  const totalBytes = manifest.files.reduce((n, f) => n + f.bytes, 0);
  console.log(`generate OK: ${manifest.files.length} files, ${totalBytes} bytes -> ${path.relative(ROOT, DEST)}`);
  console.log(`sourceCommit: ${manifest.sourceCommit}`);
  const wasm = manifest.files.find((f) => f.p === CANONICAL_WASM);
  if (!wasm) throw new Error(`canonical wasm missing from bundle: ${CANONICAL_WASM}`);
  console.log(`canonical wasm sha256: ${wasm.sha256}`);
}

/** Compare one side against the manifest; returns a list of report lines. */
function diffSide(label, actual, manifestMap) {
  const lines = [];
  for (const [rel, meta] of manifestMap) {
    const got = actual.get(rel);
    if (!got) {
      lines.push(`MISSING  [${label}] ${rel}`);
    } else if (got.sha256 !== meta.sha256) {
      lines.push(`HASH     [${label}] ${rel}: manifest ${meta.sha256} != actual ${got.sha256}`);
    } else if (got.bytes !== meta.bytes) {
      lines.push(`SIZE     [${label}] ${rel}: manifest ${meta.bytes} != actual ${got.bytes}`);
    }
  }
  for (const rel of actual.keys()) {
    if (!manifestMap.has(rel)) lines.push(`EXTRA    [${label}] ${rel}`);
  }
  return lines;
}

function verify() {
  const manifestPath = path.join(DEST, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest missing: ${path.relative(ROOT, manifestPath)} (run generate first)`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.v !== 1 || !Array.isArray(manifest.files)) {
    throw new Error(`manifest schema unrecognized (v=${manifest.v})`);
  }
  const manifestMap = new Map(manifest.files.map((f) => [f.p, f]));
  if (manifestMap.size !== manifest.files.length) {
    throw new Error('manifest contains duplicate paths');
  }

  // Independent re-hash of BOTH sides (the whole point: neither side is
  // trusted from the generate run).
  const srcMap = hashTree(SRC, walk(SRC, { filter: true }));
  const destRels = walk(DEST).filter((rel) => rel !== MANIFEST_NAME);
  const destMap = hashTree(DEST, destRels);

  const report = [
    ...diffSide('source web/', srcMap, manifestMap),
    ...diffSide('synced tree', destMap, manifestMap),
  ];
  if (!manifestMap.has(CANONICAL_WASM)) {
    report.push(`MISSING  [manifest] ${CANONICAL_WASM} (canonical wasm MUST ship — FR-002/SC-002)`);
  }
  for (const rel of REQUIRED_NOTICES) {
    if (!manifestMap.has(rel)) report.push(`MISSING  [manifest] ${rel} (third-party notice MUST ship — THIRD_PARTY_NOTICES.md)`);
  }
  if (report.length > 0) {
    console.error(`verify FAIL: ${report.length} delta(s)`);
    for (const line of report) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log(`verify OK: ${manifestMap.size} files, 100% hash identity on both sides; ${REQUIRED_NOTICES.length} third-party notices present`);
  console.log(`canonical wasm sha256: ${manifestMap.get(CANONICAL_WASM).sha256}`);
}

const mode = process.argv[2];
try {
  if (mode === 'generate') generate();
  else if (mode === 'verify') verify();
  else {
    console.error('usage: node ios/tools/bundle-manifest.mjs <generate|verify>');
    process.exit(2);
  }
} catch (err) {
  console.error(`${mode ?? 'bundle-manifest'} ERROR: ${err.message}`);
  process.exit(2);
}
