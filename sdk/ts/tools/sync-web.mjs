// Copyright (c) Meta Platforms, Inc. and affiliates.

// sync-web.mjs — mirror the compiled SDK (dist/src/*.js + .d.ts) into
// web/dist/pool-sdk/ so the browser app (the SDK's first customer, issue
// #12) can import it with plain relative ESM paths from the served web/
// root — no bundler, and file:// stays workable. The copy is COMMITTED;
// regenerate with `npm run build` after SDK changes.
//
// MIRROR semantics (CI-gate soundness): stale *.js/*.d.ts in the
// destination with no counterpart in dist/src are DELETED, so removing an
// SDK module removes its shipped compiled copy too (the ci.yml gate stages
// the directory and diffs the index, catching both additions and deletions).
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'dist', 'src');
const dest = path.join(here, '..', '..', '..', 'web', 'dist', 'pool-sdk');

const wanted = (f) => f.endsWith('.js') || f.endsWith('.d.ts');

// The public snapshot heals its copyright header onto the dist files it
// rebuilds (sync.py heal_dist_headers), and tsc drops a source's leading
// header from the .d.ts it emits, so a byte copy there would undo the heal
// and fail the ci.yml sync gate. In that tree only, the mirror writes each
// file exactly as the heal leaves it. The heal reads with Python's universal
// newlines (CRLF and CR become LF) and looks for the holder in the first 800
// code points: a file holding it is left as it is, byte for byte; any other
// file is written LF-normalized, with the header line and a blank line
// prepended, after the #! line if there is one (a #! line with no newline
// fails the heal, so the mirror refuses it too).
// tools/test-snapshot-export-pins.py holds both sides of this marker, and
// its row H3 holds the mirror byte-equal to the heal. The sync marks the
// public tree by stamping that header on line 1 of this very file on export;
// the private tree never carries the line, so the private mirror stays a
// byte copy. Keep this literal out of the file's first 800 characters: the
// export skips the header when the head already names the holder.
const HEADER_LINE = '// Copyright (c) Meta Platforms, Inc. and affiliates.\n';
const PUBLIC_SNAPSHOT = readFileSync(fileURLToPath(import.meta.url), 'utf8')
  .startsWith(HEADER_LINE);
function asHealed(text, rel) {
  const lf = text.replace(/\r\n?/g, '\n');
  // 800 code points always fit in the first 1600 UTF-16 units
  if ([...lf.slice(0, 1600)].slice(0, 800).join('').includes(HEADER_LINE.slice(3, -1))) return text;
  if (!lf.startsWith('#!')) return `${HEADER_LINE}\n${lf}`;
  const nl = lf.indexOf('\n') + 1;
  if (nl === 0) throw new Error(`sync-web: ${rel} is a #! line with no newline, which the dist header heal refuses`);
  return `${lf.slice(0, nl)}\n${HEADER_LINE}\n${lf.slice(nl)}`;
}

/** Relative paths of wanted files under `root`, recursing into
 * subdirectories (e.g. rules/ — the game-rules modules ship too). */
function walk(root, prefix = '') {
  const out = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const rel = path.join(prefix, e.name);
    if (e.isDirectory()) out.push(...walk(path.join(root, e.name), rel));
    else if (wanted(e.name)) out.push(rel);
  }
  return out;
}

mkdirSync(dest, { recursive: true });
const srcFiles = walk(src);
let removed = 0;
for (const f of walk(dest)) {
  if (!srcFiles.includes(f)) {
    rmSync(path.join(dest, f));
    removed += 1;
  }
}
for (const f of srcFiles) {
  mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
  if (PUBLIC_SNAPSHOT) {
    writeFileSync(path.join(dest, f), asHealed(readFileSync(path.join(src, f), 'utf8'), f));
  } else {
    cpSync(path.join(src, f), path.join(dest, f));
  }
}
console.log(`sync-web: copied ${srcFiles.length} files` +
  (removed ? `, removed ${removed} stale` : '') +
  ` -> ${path.relative(process.cwd(), dest)}`);
