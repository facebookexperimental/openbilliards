#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-competitor-brands — no competitor product name in anything the app ships.
//
// WHY. The GH-789 gates protect EQUIPMENT de-branding and a provenance census; neither fails
// when a competitor's product name reaches any other shipped surface: a locale string, a
// comment in a shipped file, a page of the site or a string compiled into the kernel. This
// gate does.
//
// THE SHIPPED SET is derived, not listed, so it cannot drift from the packaging:
//   - the Pages artifact (.github/workflows/pages.yml): site/** + web/** minus web/tools/**
//     + tools/render/grade.json. The four assembly lines this derivation relies on are
//     asserted to be present in pages.yml at the rev (PAGES_LINES); a pages.yml that stops
//     saying them fails the gate closed instead of silently shrinking the set.
//   - the native bundles (ios/tools/bundle-manifest.mjs): web/** minus a FROZEN exclusion
//     filter, plus INCLUDE_FILES. Every native exclusion is a subset of web/**, which the
//     Pages artifact already ships, so only INCLUDE_FILES can widen the union; they are read
//     from bundle-manifest.mjs at the rev with the vendored acorn parser and resolved through
//     the tree's symlinks (web/tools/render -> ../../tools/render).
//   - the shell sources the native binaries are built from (NATIVE_ROOTS below).
// Everything else (docs/, specs, crates/ sources, tools/, root *.md, web/tools/) is NOT
// shipped and is not read. That is the only allowlist.
//
// THE READER. One `git ls-tree` + one `git cat-file --batch` over the rev's TREE, never the
// worktree, so the gate says the same thing in CI as locally. The fixture itself (tokens,
// exceptions, pins) is read from the checkout, as check-provenance-tags reads its fixtures.
//
// NORMALISATION before matching (the exception pin stays the RAW trimmed line): JSON/JS \uXXXX
// escapes decoded, the site HTML's space/apostrophe entities decoded, NFKC (full-width Latin ->
// ASCII), the format characters the CJK locales use for line breaking (U+00AD, U+200B-U+200D,
// U+2060, U+FEFF) removed, and no-break spaces folded to a space. Multi-word names wrapped
// across two lines are matched on the joined pair. The wasm string table and other binaries
// are also read as UTF-8 so CJK forms can match there. The selftest plants through a
// temporary index (GIT_INDEX_FILE) into an unreferenced tree; nothing in the worktree, the
// real index or HEAD is touched.
//
// THE RULES are the fixture's (tools/fixtures/competitor-brands.json, `tokens`), printed on
// every run:
//   ascii-boundary-cs  a literal, case-sensitive, with a non-[0-9A-Za-z] character (or the
//                      line edge) on both sides. NOT \b: \b counts `_` as a word character
//                      and misses an underscore-joined form; arm `weak-boundary` pins that.
//   regex-ci           a case-insensitive pattern for multi-word names with optional
//                      separators and apostrophes.
//   literal-cs         a case-sensitive literal for Title-Case product names whose lowercase
//                      form is ordinary English.
//   regex-cs           a case-sensitive pattern: the retired look id 'sp' (the initialism
//                      rule already convicts the upper-case form).
//   hashed             the public tree's form of the brand rules (see "hashed rules" below):
//                      the same matches, without the names in the fixture.
//   cjk-substring      a plain substring: CJK has no boundary to anchor to; the minimum
//                      declared length (fixture `cjk_min_length`) keeps a one-character form
//                      from matching unrelated words.
// Text files (no NUL in the first 8000 bytes, git grep's -I rule) get every rule per line.
// Binary files get the long rules over their raw bytes (latin1 for Latin forms, UTF-8 for
// CJK forms; container metadata) and NOT the two-letter initialism, which random compressed
// bytes would satisfy. The kernel .wasm is the exception: its string table is read as
// UTF-8 runs (fixture `binary_strings`) and every rule applies there, because catalog text
// compiled into the kernel is rendered.
//
// DECLARED NON-BRAND CONTEXTS (`non_brand_contexts`): measured shapes that the initialism
// rule must not convict — side-pocket spec ids, a spin-decay constant, base64 runs. Each is
// asserted to still be PRESENT in its control file and still NOT convicted, so a control
// cannot rot into a tautology (`negative_controls`).
//
// EXCEPTIONS (`exceptions`) are temporary, each with a reason and an `until`, pinned to the
// exact offending line text (text files) or the blob sha (binaries). A new or edited
// offending line is red; an exception line that no longer occurs is red too (stale — delete
// it from the fixture). `pixel_declarations` name occurrences burned into image/video
// frames, which no byte reader can see: pinned to the blob sha, so a changed file must be
// re-checked by eye and re-declared or dropped.
//
// PRIVACY RIDER (scope `binary-strings`): the kernel/rules wasm string tables must not carry the
// build machine's home directory (dependency panic paths). Same reader, same exception mechanism;
// it applies to the wasm string tables only.
//
// RETIRED-ID RIDER (scope `text`): the look id 'sp' is retired, and the look is now 'tournament'
// (GH-973). A quoted 'sp' or a ?look=sp value in a shipped text file is red unless an
// exception pins it: the declared legacy-alias sites, which still accept the old id from stored
// settings, shared links and old bug reports. Text files only: a quoted two-letter id is a source
// construct, and random binary bytes would satisfy it.
//
// NOT PROVEN (printed on every run): token coverage is the declared list; pixels are read
// only through pixel_declarations; inflections the rules do not spell (e.g. a plural) are
// invisible; equipment brands are GH-789's gates', in locales only.
//
// PUBLIC SNAPSHOT. scripts/opensource/sync-public-snapshot/sync.py exports this fixture with the
// pins of manifest-excluded files dropped (their files are absent there), every pin turned into a
// per-token maximum, and the brand rules hashed (--export-fixture), so the public tree runs this
// gate without a published list of names; --selftest builds that snapshot from the rev
// (export_paths.py, private tree only) and proves the gate green on it and still red on a planted
// brand. The selftest's engine arms plant synthetic names through both engines; the arms that
// plant real names live in tools/fixtures/competitor-brands-arms.mjs, which the snapshot excludes.
//
// Usage: node tools/check-competitor-brands.mjs [--rev <rev>] [--selftest] [--list]
//        node tools/check-competitor-brands.mjs --export-fixture < private-fixture.json > public-fixture.json
// Exit: 0 green, 1 red, 2 could not run.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, mkdtempSync, mkdirSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, posix } from 'node:path';
import { tmpdir } from 'node:os';
import * as acorn from './render/lib/vendor/acorn/acorn.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_PATH = 'tools/fixtures/competitor-brands.json';
// FAIL CLOSED (review r4): every bad argument, unreadable fixture, empty rule set, empty shipped set
// or missing locale set exits 2 with a named reason; nothing here can pass by doing nothing.
const argv = process.argv.slice(2);
const refuse = (why) => { process.stdout.write(`check-competitor-brands: could not run — ${why}\n`); process.exit(2); };
const KNOWN_ARGS = new Set(['--rev', '--fixture', '--selftest', '--list', '--emit-exceptions', '--build-snapshot', '--export-fixture']);
const VALUED_ARGS = new Set(['--rev', '--fixture', '--build-snapshot']);
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!KNOWN_ARGS.has(a)) refuse(`unknown argument '${a}'`);
  if (VALUED_ARGS.has(a)) {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) refuse(`${a} needs a value`);
    opts[a] = v; i++;
  } else opts[a] = true;
}
const REV = opts['--rev'] ?? 'HEAD';
// --fixture <path>: judge a tree against another fixture file — the exported one, as the public
// checkout's own CI reads it (tools/test-competitor-brands-matrix.mjs drives this)
let FX;
try {
  FX = JSON.parse(readFileSync(opts['--fixture'] ?? join(ROOT, FIXTURE_PATH), 'utf8'));
} catch (e) { refuse(`fixture ${opts['--fixture'] ?? FIXTURE_PATH}: ${e.message}`); }
if (!Array.isArray(FX.tokens) || FX.tokens.length === 0) refuse('the fixture declares no tokens — a gate with no rules passes everything');
for (const k of ['rendered_catalog_tokens', 'exceptions', 'pixel_declarations', 'non_brand_contexts', 'negative_controls', 'not_proven']) {
  if (!Array.isArray(FX[k])) refuse(`the fixture field '${k}' is not an array`);
}

const NATIVE_ROOTS = ['ios/App/', 'macos/App/', 'ios/ShellCore/Sources/',
  'macos/MacShellCore/Sources/', 'ios/project.yml', 'macos/project.yml'];
const PAGES_YML = '.github/workflows/pages.yml';
const PAGES_LINES = [
  'cp -r site/. dist-pages/',
  'cp -r web/. dist-pages/web/',
  'rm -rf dist-pages/web/tools',
  'cp web/tools/render/grade.json dist-pages/tools/render/grade.json',
];
const BUNDLE_MANIFEST = 'ios/tools/bundle-manifest.mjs';
// Every pages.yml line that writes into the artifact must be one of these; a new one widens
// the shipped set and must be added here (and to the derivation) on purpose.
const PAGES_WRITES = [...PAGES_LINES, "cat > dist-pages/404.html <<'HTML'"];
const PAGES_INCLUDES = [['web/tools/render/grade.json', 'tools/render/grade.json']];

const git = (args, opts = {}) => execFileSync('git', ['-C', ROOT, ...args],
  { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });

// A child that reads stdin gets it from a FILE, never a pipe. Under load (load average ~50) a
// spawnSync stdin pipe was seen to stall for over an hour: `git hash-object -w --stdin` blocked in
// read() on its stdin socket while node waited in kevent (two independent runs, sampled). A file
// descriptor has no writer to wait for. The file lives in one per-process temp directory.
let stdinDir = null;
let stdinSeq = 0;
function execWithStdin(cmd, args, data, opts = {}) {
  if (!stdinDir) {
    stdinDir = mkdtempSync(join(tmpdir(), 'ccb-stdin-'));
    process.on('exit', () => rmSync(stdinDir, { recursive: true, force: true }));
  }
  const f = join(stdinDir, String(stdinSeq++));
  writeFileSync(f, data);
  const fd = openSync(f, 'r');
  try {
    return execFileSync(cmd, args, { ...opts, stdio: [fd, 'pipe', 'inherit'] });
  } finally {
    closeSync(fd);
    rmSync(f, { force: true });
  }
}

function revTree(rev) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `${rev}^{tree}`],
      { stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// tree reading
// ---------------------------------------------------------------------------
function lsTree(tree) {
  const out = git(['ls-tree', '-r', '-z', '--full-tree', tree]);
  const entries = new Map();
  for (const rec of out.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    const [mode, type, sha] = rec.slice(0, tab).split(' ');
    entries.set(rec.slice(tab + 1), { mode, type, sha });
  }
  return entries;
}

const blobCache = new Map();
function readBlobs(shas) {
  const need = [...new Set(shas)].filter((s) => !blobCache.has(s));
  if (need.length) {
    const buf = execWithStdin('git', ['-C', ROOT, 'cat-file', '--batch'], need.join('\n') + '\n',
      { maxBuffer: 1 << 30 });
    let i = 0;
    while (i < buf.length) {
      const nl = buf.indexOf(10, i);
      const [sha, type, size] = buf.slice(i, nl).toString('latin1').split(' ');
      if (type === 'missing' || size === undefined) throw new Error(`git cat-file: ${sha} missing`);
      const n = Number(size);
      blobCache.set(sha, buf.subarray(nl + 1, nl + 1 + n));
      i = nl + 1 + n + 1;
    }
  }
  return (sha) => blobCache.get(sha);
}

function blobText(entries, path) {
  const e = entries.get(path);
  if (!e) return null;
  return readBlobs([e.sha])(e.sha).toString('utf8');
}

// Resolve a repo path through tree symlinks (mode 120000), component by component.
function resolvePath(entries, path) {
  const parts = path.split('/');
  for (let k = 1; k <= parts.length; k++) {
    const head = parts.slice(0, k).join('/');
    const e = entries.get(head);
    if (e && e.mode === '120000') {
      const target = readBlobs([e.sha])(e.sha).toString('utf8').trim();
      const resolved = posix.normalize(posix.join(posix.dirname(head), target, ...parts.slice(k)));
      return resolvePath(entries, resolved);
    }
  }
  return path;
}

// ---------------------------------------------------------------------------
// the shipped set
// ---------------------------------------------------------------------------
function bundleIncludes(entries) {
  const src = blobText(entries, BUNDLE_MANIFEST);
  if (src === null) throw new ShippedSetError(`${BUNDLE_MANIFEST} is absent at the rev`);
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  let found = null;
  for (const node of ast.body) {
    if (node.type !== 'VariableDeclaration') continue;
    for (const d of node.declarations) {
      if (d.id?.name !== 'INCLUDE_FILES') continue;
      if (d.init?.type !== 'ArrayExpression'
        || !d.init.elements.every((el) => el?.type === 'Literal' && typeof el.value === 'string')) {
        throw new ShippedSetError(`${BUNDLE_MANIFEST}: INCLUDE_FILES is not a literal string array`);
      }
      found = d.init.elements.map((el) => el.value);
    }
  }
  if (found === null) throw new ShippedSetError(`${BUNDLE_MANIFEST}: no INCLUDE_FILES declaration`);
  return found;
}

class ShippedSetError extends Error {}

function shippedSet(entries) {
  const pages = blobText(entries, PAGES_YML);
  if (pages === null) throw new ShippedSetError(`${PAGES_YML} is absent at the rev`);
  const missing = PAGES_LINES.filter((l) => !pages.includes(l));
  if (missing.length) {
    throw new ShippedSetError(`${PAGES_YML} no longer says ${missing.map((l) => `\`${l}\``).join(', ')}`
      + ' — the Pages half of the shipped-set derivation is stale; update PAGES_LINES with the new assembly');
  }
  const writes = pages.split('\n').map((l) => l.trim())
    .filter((l) => !l.startsWith('#') && /dist-pages/.test(l) && /^(cp|rsync|ln|mv|tar|unzip|curl|wget|tee|cat)\b|>\s*dist-pages/.test(l));
  const undeclared = writes.filter((l) => !PAGES_WRITES.includes(l));
  if (undeclared.length) {
    throw new ShippedSetError(`${PAGES_YML} writes into the artifact with undeclared line(s) ${undeclared.map((l) => `\`${l}\``).join(', ')}`
      + ' — declare them in PAGES_WRITES and extend the shipped-set derivation');
  }
  const set = new Map();   // path -> reason
  for (const [path, e] of entries) {
    if (e.type !== 'blob' || e.mode === '120000') continue;
    if (path.startsWith('site/')) set.set(path, 'pages');
    else if (path.startsWith('web/') && !path.startsWith('web/tools/')) set.set(path, 'pages+bundle');
    else if (NATIVE_ROOTS.some((r) => (r.endsWith('/') ? path.startsWith(r) : path === r))) set.set(path, 'native');
  }
  for (const [src, dst] of PAGES_INCLUDES) {
    const real = resolvePath(entries, src);
    if (real !== dst || !entries.has(real)) throw new ShippedSetError(`Pages include ${src} resolves to ${real}, not ${dst}`);
    set.set(real, 'include');
  }
  for (const inc of bundleIncludes(entries)) {
    const real = resolvePath(entries, `web/${inc}`);
    if (!entries.has(real)) throw new ShippedSetError(`bundle INCLUDE_FILES '${inc}' resolves to ${real}, absent at the rev`);
    set.set(real, 'include');
  }
  return set;
}

// ---------------------------------------------------------------------------
// rules
// ---------------------------------------------------------------------------
function compileTokens(fx) {
  return fx.tokens.map((t) => {
    let re = null;
    if (t.rule === 'hashed') {
      if (!['cs', 'ci'].includes(t.fold) || !Array.isArray(t.forms) || !t.forms.length
        || !t.forms.every((f) => Number.isInteger(f.len) && f.len > 1 && f.len <= MAX_FORM && Number.isInteger(f.rk) && /^[0-9a-f]{64}$/.test(f.sha256) && Number.isInteger(f.tail))) {
        throw new Error(`${FIXTURE_PATH}: hashed token ${t.id} is malformed`);
      }
      return { ...t, re: null, short: Boolean(t.short), nonascii: Boolean(t.nonascii),
        stringsOnly: t.scope === 'binary-strings', textOnly: t.scope === 'text' };
    }
    if (t.rule === 'ascii-boundary-cs') {
      const lit = t.form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      re = new RegExp(`(?<![0-9A-Za-z])${lit}(?![0-9A-Za-z])`, 'g');
    } else if (t.rule === 'regex-ci') re = new RegExp(t.pattern, 'gi');
    else if (t.rule === 'regex-cs') re = new RegExp(t.pattern, 'g');
    else if (t.rule === 'literal-cs') re = new RegExp(t.form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    else if (t.rule === 'cjk-substring') {
      if ([...t.form].length < fx.cjk_min_length) {
        throw new Error(`${FIXTURE_PATH}: CJK form '${t.form}' is shorter than cjk_min_length ${fx.cjk_min_length}`);
      }
      re = new RegExp(t.form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    } else throw new Error(`${FIXTURE_PATH}: token ${t.id} has unknown rule '${t.rule}'`);
    return { ...t, re, short: t.rule === 'ascii-boundary-cs' && t.form.length <= 3,
      nonascii: /[^\x00-\x7f]/.test(t.form ?? t.pattern ?? ''),
      stringsOnly: t.scope === 'binary-strings', textOnly: t.scope === 'text' };
  });
}

// ---------------------------------------------------------------------------
// hashed rules (the public snapshot's fixture)
// ---------------------------------------------------------------------------
// The public tree runs this gate too, but must not publish the list of names it looks for. The
// snapshot sync exports this fixture through --export-fixture: every brand rule becomes a `hashed`
// rule that carries, per canonical form, its length, a 32-bit rolling hash and a salted sha256, plus
// the rule's boundary flags. The matcher slides a window of each length over the canonical text; a
// window whose rolling hash is a row's is confirmed by its sha256 before it counts, and is reported
// over the raw text (index, length, matched text), so every caller keeps its semantics. Two folds:
// `cs`, the normalised text itself (literal, initialism and CJK rules), and `ci`, lower case with the
// separators [ ._'’-] removed (the case-insensitive rules, expanded to their finite canonical forms by
// expandCi). The ci fold is stricter than a pattern that forbids or requires a separator inside a
// name, the safe direction. Hashes hide the list from a reader; they do not resist a guess list of
// candidate names, and a two-letter form is invertible by brute force.
const HASH_SALT = 'openbilliards-brand-gate-v1';
const RK_BASE = 257;
const SEP_CI = new Set([' ', '.', '_', '-', "'", '’']);
const SEP_CI_CODES = new Set([...SEP_CI].map((c) => c.charCodeAt(0)));
const hashForm = (s) => createHash('sha256').update(`${HASH_SALT}\0${s}`, 'utf8').digest('hex');
function rkOf(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, RK_BASE) + s.charCodeAt(i)) >>> 0;
  return h;
}
const lowerCache = new Map();
function lowerCode(c) {
  if (c >= 65 && c <= 90) return c + 32;
  if (c < 128) return c;
  let v = lowerCache.get(c);
  if (v === undefined) {
    const s = String.fromCharCode(c).toLowerCase();
    v = s.length === 1 ? s.charCodeAt(0) : c;
    lowerCache.set(c, v);
  }
  return v;
}
const isAlnum = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

// a case-insensitive brand pattern -> its canonical forms under the ci fold. Only the constructs the
// fixture uses are understood: literal letters and digits, a letter class ([eé]), a separator class
// or character (removed by the fold, whatever its quantifier), `?`, and the alphanumeric lookarounds
// at the ends. Anything else refuses: a rule that cannot be hashed must not vanish from the public gate.
function expandCi(pattern) {
  const LB = '(?<![0-9A-Za-z])';
  const RB = '(?![0-9A-Za-z])';
  let p = pattern;
  let lb = false;
  let rb = false;
  if (p.startsWith(LB)) { lb = true; p = p.slice(LB.length); }
  if (p.endsWith(RB)) { rb = true; p = p.slice(0, -RB.length); }
  let forms = [''];
  for (let i = 0; i < p.length;) {
    let alts;
    if (p[i] === '[') {
      const j = p.indexOf(']', i);
      if (j < 0) throw new Error(`pattern ${pattern}: unclosed class`);
      alts = [...p.slice(i + 1, j)];
      if (alts.includes('\\') || alts[0] === '^') throw new Error(`pattern ${pattern}: unsupported class`);
      i = j + 1;
    } else if ('()|^$.+{}\\*?'.includes(p[i])) {
      throw new Error(`pattern ${pattern}: unsupported construct '${p[i]}'`);
    } else {
      alts = [p[i]];
      i += 1;
    }
    let q = '';
    if (p[i] === '?' || p[i] === '*') { q = p[i]; i += 1; }
    if (alts.every((c) => SEP_CI.has(c))) continue;
    if (alts.some((c) => SEP_CI.has(c))) throw new Error(`pattern ${pattern}: a class mixes separators and letters`);
    if (q === '*') throw new Error(`pattern ${pattern}: a repeated letter has no finite form set`);
    const lower = [...new Set(alts.map((c) => String.fromCharCode(lowerCode(c.charCodeAt(0)))))];
    const next = [];
    for (const f of forms) {
      if (q === '?') next.push(f);
      for (const c of lower) next.push(f + c);
    }
    forms = [...new Set(next)];
  }
  forms = forms.filter(Boolean);
  if (!forms.length) throw new Error(`pattern ${pattern}: no canonical form`);
  return { forms, lb, rb };
}

// One pass per fold over the canonical stream of `text`. Each form also carries `tail`, a 12-bit bucket
// of its last two canonical characters: at every canonical character the bucket of the last two is looked
// up in a 4096-entry table, and only on a hit are the bucket's window lengths read back from the text
// (separators skipped under ci) and hashed (the rolling hash, then the sha256 confirmation). The bucket
// narrows the work about a hundredfold and says no more about a form than its sha256 already does.
// index: { cs|ci: { bits, buckets: Map tail -> [len], byLen: Map len -> Map rk -> [{ sha256, tok }] } }
const tailOf = (a, b) => (Math.imul(a, 33) ^ b) & 4095;
const SEP_TABLE = new Uint8Array(0x2020);
for (const c of SEP_CI_CODES) SEP_TABLE[c] = 1;
function hashedIndex(toks) {
  const index = {};
  for (const t of toks) {
    if (t.rule !== 'hashed') continue;
    const ix = (index[t.fold] ??= { bits: new Uint8Array(4096), buckets: new Map(), byLen: new Map() });
    for (const f of t.forms) {
      if (!Number.isInteger(f.tail) || f.tail < 0 || f.tail > 4095 || f.len < 2) throw new Error(`hashed token ${t.id}: a form without a valid tail bucket`);
      ix.bits[f.tail] = 1;
      if (!ix.buckets.has(f.tail)) ix.buckets.set(f.tail, []);
      if (!ix.buckets.get(f.tail).includes(f.len)) ix.buckets.get(f.tail).push(f.len);
      if (!ix.byLen.has(f.len)) ix.byLen.set(f.len, new Map());
      const byRk = ix.byLen.get(f.len);
      if (!byRk.has(f.rk)) byRk.set(f.rk, []);
      byRk.get(f.rk).push({ sha256: f.sha256, tok: t });
    }
  }
  return index;
}
const MAX_FORM = 64;   // the window buffers' size: a longer form refuses at export and at compile time
const winCodes = new Uint16Array(MAX_FORM);
const winRaws = new Int32Array(MAX_FORM);
let FOLD = null;   // UTF-16 code unit -> its lower-case code unit (itself when lower-casing changes the length)
function foldTable() {
  if (!FOLD) {
    FOLD = new Uint16Array(65536);
    for (let c = 0; c < 65536; c++) FOLD[c] = lowerCode(c);
  }
  return FOLD;
}
// the window of L canonical characters that ends at text[i] (whose canonical code is c), read backwards;
// false when the text holds fewer than L canonical characters up to i
function readWindow(text, i, c, L, ci, fold) {
  let k = L - 1;
  let j = i;
  winCodes[k] = c;
  winRaws[k] = i;
  while (k > 0 && --j >= 0) {
    let d = text.charCodeAt(j);
    if (ci) {
      if (d < 0x2020 && SEP_TABLE[d]) continue;
      d = fold[d];
    }
    k--;
    winCodes[k] = d;
    winRaws[k] = j;
  }
  return k === 0;
}
function confirmWindow(text, i, L, ix, out) {
  let h = 0;
  for (let q = 0; q < L; q++) h = (Math.imul(h, RK_BASE) + winCodes[q]) >>> 0;
  const rows = ix.byLen.get(L).get(h);
  if (!rows) return;
  let win = '';
  for (let q = 0; q < L; q++) win += String.fromCharCode(winCodes[q]);
  const sha = hashForm(win);
  const start = winRaws[0];
  for (const r of rows) {
    if (r.sha256 !== sha) continue;
    if (r.tok.lb && start > 0 && isAlnum(text.charCodeAt(start - 1))) continue;
    if (r.tok.rb && i + 1 < text.length && isAlnum(text.charCodeAt(i + 1))) continue;
    out.get(r.tok).push({ index: start, len: i - start + 1 });
  }
}
// both folds in one pass over the text
function hashedSweep(text, index, out) {
  const n = text.length;
  const cs = index.cs;
  const ci = index.ci;
  const fold = foldTable();
  const csBits = cs ? cs.bits : null;
  const ciBits = ci ? ci.bits : null;
  let prevCs = -1;
  let prevCi = -1;
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);
    if (csBits) {
      if (prevCs >= 0) {
        const tb = (Math.imul(prevCs, 33) ^ c) & 4095;
        if (csBits[tb]) {
          for (const L of cs.buckets.get(tb)) if (readWindow(text, i, c, L, false, fold)) confirmWindow(text, i, L, cs, out);
        }
      }
      prevCs = c;
    }
    if (ciBits && !(c < 0x2020 && SEP_TABLE[c])) {
      const fc = fold[c];
      if (prevCi >= 0) {
        const tb = (Math.imul(prevCi, 33) ^ fc) & 4095;
        if (ciBits[tb]) {
          for (const L of ci.buckets.get(tb)) if (readWindow(text, i, fc, L, true, fold)) confirmWindow(text, i, L, ci, out);
        }
      }
      prevCi = fc;
    }
  }
}

// every match of every token in `toks` over `text`: Map token -> [{ index, match }], leftmost
// non-overlapping per token (the regex engine's /g semantics, which the exception counts assume)
const prepCache = new WeakMap();   // a token list -> its hashed index and regex rules (lists are reused)
function prep(toks) {
  let p = prepCache.get(toks);
  if (!p) {
    const hashed = toks.filter((t) => t.rule === 'hashed');
    p = { hashed, regex: toks.filter((t) => t.rule !== 'hashed'), index: hashed.length ? hashedIndex(hashed) : null };
    prepCache.set(toks, p);
  }
  return p;
}
function findAll(text, toks) {
  const p = prep(toks);
  const out = new Map();
  for (const t of toks) out.set(t, []);
  if (p.index) {
    const raw = new Map();
    for (const t of p.hashed) raw.set(t, []);
    hashedSweep(text, p.index, raw);
    for (const [t, hits] of raw) {
      hits.sort((a, b) => a.index - b.index || b.len - a.len);
      let last = -1;
      for (const hh of hits) {
        if (hh.index < last) continue;
        out.get(t).push({ index: hh.index, match: text.slice(hh.index, hh.index + hh.len) });
        last = hh.index + hh.len;
      }
    }
  }
  for (const t of p.regex) {
    t.re.lastIndex = 0;
    let m;
    while ((m = t.re.exec(text))) {
      if (m[0].length === 0) { t.re.lastIndex++; continue; }
      out.get(t).push({ index: m.index, match: m[0] });
    }
  }
  return out;
}

// --export-fixture: the public snapshot's copy of this fixture. Brand rules become hashed rules under
// neutral ids; the privacy and retired-id rules stay as they are (they name no product); exception token
// ids follow the new ids; the prose fields are replaced, and pixel declarations keep their pins but not
// their text. The export refuses when any brand form (4 characters or longer) still occurs in its own
// output, case- and separator-insensitively.
const PUBLIC_PROSE = {
  _what: 'The competitor-brand gate\'s rules for the public tree. The brand rules are hashed (tools/check-competitor-brands.mjs, --export-fixture): each carries its canonical forms\' lengths, rolling hashes and salted sha256s, so the gate can match them without the list being published.',
  _why: 'No competitor product name in anything the app ships.',
  _scope: 'The shipped set the gate derives from pages.yml and the native bundle manifest.',
  _tokens_not_here: 'Equipment manufacturers are covered by other gates, in locales only. Governing bodies and literature are citations.',
  _public_snapshot: 'Exported by the public-snapshot sync: the pins of excluded files are dropped, every pin becomes a per-token maximum (max_counts), and the brand rules are hashed.',
};
const PUBLIC_NOT_PROVEN = [
  'token coverage is the declared list',
  'pixels are read only through pixel_declarations',
  'inflections the rules do not spell are invisible',
  'equipment brands are covered by other gates, in locales only',
  'the retired look id is read only as a quoted id or a ?look= value in shipped text',
  'the home-path rider reads the wasm string tables only',
];
// one brand rule -> its hashed rule under `id` (and the plain canonical forms, for the leak check)
function hashToken(t, id, cjkMin) {
  let forms;
  let fold;
  let lb = false;
  let rb = false;
  if (t.rule === 'regex-ci') {
    ({ forms, lb, rb } = expandCi(t.pattern));
    fold = 'ci';
  } else if (t.rule === 'ascii-boundary-cs') {
    forms = [t.form]; fold = 'cs'; lb = true; rb = true;
  } else if (t.rule === 'literal-cs' || t.rule === 'cjk-substring') {
    if (t.rule === 'cjk-substring' && [...t.form].length < cjkMin) {
      throw new Error(`CJK form of ${t.id} is shorter than cjk_min_length ${cjkMin}`);
    }
    forms = [t.form]; fold = 'cs';
  } else throw new Error(`token ${t.id}: rule '${t.rule}' cannot be hashed`);
  const long = forms.find((f) => f.length > MAX_FORM || f.length < 2);
  if (long) throw new Error(`token ${t.id}: a canonical form of ${long.length} characters (2 to ${MAX_FORM} can be hashed)`);
  return {
    forms,
    rule: {
      id, rule: 'hashed', fold, lb, rb,
      short: t.rule === 'ascii-boundary-cs' && t.form.length <= 3,
      // as the plain rule computes it, from its pattern or form: a non-ASCII separator the forms drop (U+2019)
      // still sends the rule through the UTF-8 pass over raw binaries
      nonascii: /[^\x00-\x7f]/.test(t.pattern ?? t.form),
      forms: forms.map((f) => ({ len: f.length, rk: rkOf(f), sha256: hashForm(f), tail: tailOf(f.charCodeAt(f.length - 2), f.charCodeAt(f.length - 1)) }))
        .sort((a, b) => a.len - b.len || (a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0)),
      ...(t.scope ? { scope: t.scope } : {}),
    },
  };
}
function exportFixture(fx) {
  const idMap = {};
  const brandForms = [];
  let k = 0;
  const tokens = fx.tokens.map((t) => {
    if (t.class && t.class !== 'brand') {
      const { owner, ...rest } = t;   // the descriptive owner text stays private
      return rest;
    }
    const id = `B${String(++k).padStart(2, '0')}`;
    idMap[t.id] = id;
    const h = hashToken(t, id, fx.cjk_min_length);
    brandForms.push(...h.forms);
    return h.rule;
  });
  const mapIds = (ids) => ids.map((x) => idMap[x] ?? x);
  // CANARIES: the synthetic rules, hashed into the exported fixture under canary ids. The public selftest plants
  // the synthetic names through THESE stored hashes, so a gate whose hashing changed after the fixture was
  // exported reads red there (the runtime-hashed synthetic rules alone could not tell)
  const canaries = SYN_TOKENS.map((t) => hashToken(t, `canary-${t.id}`, fx.cjk_min_length ?? 3).rule);
  const out = { ...fx, ...PUBLIC_PROSE, not_proven: PUBLIC_NOT_PROVEN, tokens: [...tokens, ...canaries],
    exceptions: fx.exceptions.map((x) => {
      const y = { ...x, tokens: mapIds(x.tokens) };
      for (const f of ['counts', 'max_counts']) {
        if (x[f]) y[f] = Object.fromEntries(Object.entries(x[f]).map(([tk, v]) => [idMap[tk] ?? tk, v]));
      }
      return y;
    }),
    pixel_declarations: fx.pixel_declarations.map((d) => ({ ...d, text: 'a declared on-frame text' })),
  };
  // the leak check over the whole output
  const text = JSON.stringify(out);
  const lowered = text.toLowerCase();
  const stripped = [...lowered].filter((c) => !SEP_CI.has(c)).join('');
  const leaks = [...new Set(brandForms)].filter((f) => [...f].length >= 4
    && (lowered.includes(f.toLowerCase()) || stripped.includes([...f.toLowerCase()].filter((c) => !SEP_CI.has(c)).join(''))));
  if (leaks.length) throw new Error(`the exported fixture still carries ${leaks.length} brand form(s) in its text`);
  return { fixture: out, idMap };
}

function nonBrandContext(fx, line, idx, len, path) {
  for (const c of fx.non_brand_contexts) {
    if (Array.isArray(c.files) && !c.files.includes(path)) continue;
    if (c.kind === 'following') {
      if (new RegExp(`^(?:${c.pattern})`).test(line.slice(idx + len))) return c.id;
    } else if (c.kind === 'preceding') {
      if (new RegExp(`(?:${c.pattern})$`).test(line.slice(0, idx))) return c.id;
    } else if (c.kind === 'base64-run') {
      let a = idx, b = idx + len;
      const B64 = /[A-Za-z0-9+/=]/;
      while (a > 0 && B64.test(line[a - 1])) a--;
      while (b < line.length && B64.test(line[b])) b++;
      const run = line.slice(a, b);
      if (run.length >= c.min_length && /[+/]/.test(run)) return c.id;
    }
  }
  return null;
}

const FORMAT_CHARS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
function normalise(text) {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&(?:nbsp|#160|#x0*a0);/gi, ' ')
    .replace(/&(?:rsquo|#8217|#x2019|apos|#39|#x0*27);/gi, '\u2019')
    .normalize('NFKC')
    .replace(FORMAT_CHARS, '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ');
}

function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

// printable ASCII runs of a binary (strings(1) with a minimum length)
function printableRuns(buf, min) {
  // UTF-8 runs of non-control characters (a decode error becomes U+FFFD and ends a run), so a
  // CJK or curly-apostrophe form compiled into the string table can match too.
  const runs = [];
  const re = new RegExp(`[^\\u0000-\\u001f\\u007f\\ufffd]{${min},}`, 'g');
  const s = buf.toString('utf8');
  let m;
  while ((m = re.exec(s))) runs.push({ off: m.index, text: m[0] });
  return runs;
}

const scanCache = new Map();
// the five scan modes' token lists, computed once per token list (findAll caches their indexes by list)
const modeCache = new WeakMap();
function modeLists(toks) {
  let m = modeCache.get(toks);
  if (!m) {
    m = {
      sig: toks.map((t) => `${t.id}:${t.rule}`).join(','),
      line: toks.filter((t) => !t.stringsOnly),                                         // text lines
      joined: toks.filter((t) => !t.short && !t.stringsOnly && !t.textOnly),            // wrapped pairs
      strings: toks.filter((t) => !t.textOnly),                                         // wasm string runs
      latin1: toks.filter((t) => !t.short && !t.stringsOnly && !t.textOnly),            // other binaries
      utf8: toks.filter((t) => !t.short && !t.stringsOnly && !t.textOnly && t.nonascii),
    };
    modeCache.set(toks, m);
  }
  return m;
}
function scanBlob(fx, toks, path, sha, buf) {
  const ext = posix.extname(path);
  const strings = fx.binary_strings.exts.includes(ext);
  const lists = modeLists(toks);
  // the token list is part of the key: walks under different rule sets (the synthetic arms) never share a scan
  const key = `${lists.sig}|${sha}|${strings}|${path}`;
  if (scanCache.has(key)) return scanCache.get(key);
  const hits = [];
  const controls = [];
  // A text hit carries its trimmed LINE (the exception pin); a binary hit carries a
  // printable snippet around the match (binary exceptions pin the blob, not the text).
  // list: the mode's rules (modeLists): the initialism and other short rules skip raw binaries, the
  // privacy rider reads wasm string tables only, the retired-id rider reads text lines only
  const scanLine = (raw, where, list, isLine, opts = {}) => {
    const text = isLine ? normalise(raw) : raw;
    for (const [t, ms] of findAll(text, list)) {
      for (const m of ms) {
        if (opts.span && !(m.index < opts.span && m.index + m.match.length > opts.span + 1)) continue;
        const nb = t.short ? nonBrandContext(fx, text, m.index, m.match.length, path) : null;
        const at = where.offset !== undefined ? { offset: where.offset + m.index } : where;
        if (nb) controls.push({ ...at, token: t.id, context: nb });
        else {
          const snip = opts.pin ?? (isLine ? raw.trim()
            : text.slice(Math.max(0, m.index - 40), m.index + m.match.length + 40).replace(/[^\x20-\x7e]/g, '.'));
          hits.push({ ...at, token: t.id, match: m.match, text: snip });
        }
      }
    }
  };
  if (!isBinary(buf)) {
    const lines = buf.toString('utf8').split('\n');
    lines.forEach((l, i) => scanLine(l, { line: i + 1 }, lists.line, true));
    // a multi-word name wrapped across two lines: match on the joined pair, report only matches
    // that span the junction (each line alone was judged above)
    for (let i = 0; i + 1 < lines.length; i++) {
      const left = normalise(lines[i]).trimEnd();
      if (!left) continue;
      const joined = `${left} ${normalise(lines[i + 1]).trimStart()}`;
      scanLine(joined, { line: i + 1 }, lists.joined, false, {
        span: left.length,
        pin: `${lines[i].trim()} \u23ce ${lines[i + 1].trim()}` });
    }
  } else if (strings) {
    for (const r of printableRuns(buf, fx.binary_strings.min_run)) scanLine(r.text, { offset: r.off }, lists.strings, false);
  } else {
    scanLine(buf.toString('latin1'), { offset: 0 }, lists.latin1, false);
    scanLine(buf.toString('utf8'), { offset: 0 }, lists.utf8, false);
  }
  const res = { hits, controls, binary: isBinary(buf) };
  scanCache.set(key, res);
  return res;
}

// ---------------------------------------------------------------------------
// rendered catalog text — the shipped SDK catalog may still CARRY a competitor token until the
// kernel rebake (an exception above), but no rendered field of it may REACH the screen. The
// equipment card renders display_name through the equipment.<id> locale key when one exists, and
// the Details disclosure renders Calibrated/Literature/Estimated source|note through
// equipment.provDetail.<id> when one exists (web/app/atelier.js provDetail; the cue station's
// mirror is web/app/ateliercue.js). So: every catalog entry with a token in a rendered field needs
// that override in EVERY locale, and its renderer must consult the override before the catalog.
// rendered_catalog_tokens apply only here: upstream identifiers may remain in developer
// provenance and the frozen kernel catalog, while player-visible names and dossiers stay neutral.
const CATALOG_JS = 'web/dist/pool-sdk/catalog.js';
const RENDERERS = { cues: 'web/app/ateliercue.js', default: 'web/app/atelier.js' };
const LOCALE_DIR = 'web/app/locales/';
function renderedCatalog(entries, toks, fx) {
  if (!Array.isArray(fx.rendered_catalog_tokens)) throw new ShippedSetError('the fixture has no rendered_catalog_tokens declaration');
  const renderedTokens = [...toks, ...compileTokens({ ...fx, tokens: fx.rendered_catalog_tokens })];
  const src = blobText(entries, CATALOG_JS);
  if (src === null) throw new ShippedSetError(`${CATALOG_JS} is absent at the rev`);
  const head = 'export const CATALOG = ';
  // The literal is JSON-shaped and its only column-0 `};` is its own close.
  const a = src.indexOf(head), b = a < 0 ? -1 : src.indexOf('\n};', a);
  if (a < 0 || b < 0) throw new ShippedSetError(`${CATALOG_JS}: CATALOG literal not found`);
  const cat = JSON.parse(src.slice(a + head.length, b + 2));
  const textTokens = renderedTokens.filter((t) => !t.stringsOnly);
  const hit = (value) => {
    if (typeof value !== 'string') return false;
    const text = normalise(value);
    for (const [t, ms] of findAll(text, textTokens)) {
      if (ms.some((m) => !(t.short && nonBrandContext(fx, text, m.index, m.match.length)))) return true;
    }
    return false;
  };
  const locales = [...entries.keys()].filter((k) => k.startsWith(LOCALE_DIR) && k.endsWith('.json'))
    .map((k) => [k.slice(LOCALE_DIR.length, -5), JSON.parse(blobText(entries, k))]);
  if (locales.length === 0) throw new ShippedSetError(`no locale files under ${LOCALE_DIR} — the override check would pass by finding nothing`);
  const red = [];
  const covered = [];
  for (const [axis, list] of Object.entries(cat)) {
    if (!Array.isArray(list)) continue;
    const renderer = RENDERERS[axis] ?? RENDERERS.default;
    for (const e of list) {
      const c = e.calibration ?? {};
      const rec = c.Calibrated ?? c.Literature ?? c.Estimated ?? {};
      const need = [];
      if (hit(e.display_name)) need.push(`equipment.${e.id}`);
      if (hit(rec.source) || hit(rec.note)) need.push(`equipment.provDetail.${e.id}`);
      for (const key of [`equipment.${e.id}`, `equipment.provDetail.${e.id}`]) {
        const branded = locales.filter(([, d]) => hit(d[key])).map(([l]) => l);
        if (branded.length) red.push(`${CATALOG_JS} ${axis}/${e.id}: ${key} carries a retired player-facing token in ${branded.join(', ')}`);
      }
      if (!need.length) continue;
      for (const key of need) {
        const missing = locales.filter(([, d]) => typeof d[key] !== 'string').map(([l]) => l);
        if (missing.length) red.push(`${CATALOG_JS} ${axis}/${e.id}: a rendered field carries a competitor token and ${key} is missing in ${missing.join(', ')}`);
      }
      const rsrc = blobText(entries, renderer) ?? '';
      if (need.some((k) => k.startsWith('equipment.provDetail.'))) {
        const fn = axis === 'cues' ? 'citation' : 'provDetail';
        const fnAt = rsrc.indexOf(`const ${fn} = (e) => {`);
        const ov = rsrc.indexOf('has(`equipment.provDetail.${e.id}`)', fnAt);
        const cal = rsrc.indexOf('c.Calibrated ?? c.Literature', fnAt);
        if (fnAt < 0 || ov < 0 || cal < 0 || ov > cal) red.push(`${renderer}: ${fn} does not consult equipment.provDetail.<id> before the catalog text, so ${axis}/${e.id}'s branded provenance renders`);
      }
      covered.push(`${axis}/${e.id}`);
    }
  }
  return { red, covered, locales: locales.length };
}

// ---------------------------------------------------------------------------
// the walk
// ---------------------------------------------------------------------------
function walk(tree, fx = FX) {
  if (!Array.isArray(fx.tokens) || fx.tokens.length === 0) throw new ShippedSetError('the fixture declares no tokens — a gate with no rules passes everything');
  const toks = compileTokens(fx);
  const entries = lsTree(tree);
  const shipped = shippedSet(entries);
  const paths = [...shipped.keys()].sort();
  if (paths.length === 0) throw new ShippedSetError('the shipped set is empty — nothing would be judged');
  const get = readBlobs(paths.map((p) => entries.get(p).sha));
  const red = [];
  const excepted = [];
  const controlsSeen = [];
  let text = 0, binary = 0;
  // Exception kinds: `lines` (exact trimmed lines) and `blob` (+ `count`) are strict pins, with
  // optional declared per-token `counts` that must equal the measured hits; `max_counts` is the
  // PUBLIC-tree rule for an artifact the public checkout rebuilds (at most those per-token
  // counts, absence passes) and is refused in the private tree, which pins exact bytes.
  const privateTree = entries.has(SNAPSHOT_HELPER);
  const exByFile = new Map();
  for (const ex of fx.exceptions) {
    if (!exByFile.has(ex.file)) exByFile.set(ex.file, []);
    exByFile.get(ex.file).push({ ...ex, left: ex.lines ? [...ex.lines] : null, hitCount: 0, tally: {} });
  }
  for (const p of paths) {
    const { sha } = entries.get(p);
    const res = scanBlob(fx, toks, p, sha, get(sha));
    if (res.binary) binary++; else text++;
    for (const c of res.controls) controlsSeen.push({ file: p, ...c });
    const exs = exByFile.get(p) || [];
    const mc = exs.find((x) => x.max_counts);
    if (mc) {
      for (const h of res.hits) {
        const n = mc.tally[h.token] ?? 0;
        const ok = !privateTree && (mc.max_counts[h.token] ?? 0) > n;
        if (ok) mc.tally[h.token] = n + 1;
        (ok ? excepted : red).push({ file: p, ...h });
      }
      continue;
    }
    // Binary hits are judged one by one against a blob pin. Text hits are judged per LINE
    // OCCURRENCE: one pinned line covers every hit on one occurrence of that exact line
    // (a line may carry two tokens), provided the exception declares all of them.
    const lineGroups = new Map();
    for (const h of res.hits) {
      if (h.line === undefined) {
        const ex = exs.find((x) => x.blob && x.blob === sha && x.tokens.includes(h.token));
        if (ex) { ex.hitCount++; ex.tally[h.token] = (ex.tally[h.token] ?? 0) + 1; }
        (ex ? excepted : red).push({ file: p, ...h });
        continue;
      }
      const gk = `${h.line}|${h.text}`;   // a wrapped-pair hit carries its own two-line pin
      if (!lineGroups.has(gk)) lineGroups.set(gk, []);
      lineGroups.get(gk).push(h);
    }
    for (const hs of lineGroups.values()) {
      const text = hs[0].text;
      const ex = exs.find((x) => x.left && x.left.includes(text) && hs.every((h) => x.tokens.includes(h.token)));
      if (ex) {
        ex.left.splice(ex.left.indexOf(text), 1);
        for (const h of hs) ex.tally[h.token] = (ex.tally[h.token] ?? 0) + 1;
      }
      for (const h of hs) (ex ? excepted : red).push({ file: p, ...h });
    }
  }
  const stale = [];
  for (const [file, exs] of exByFile) {
    for (const ex of exs) {
      if (ex.max_counts) {
        if (privateTree) stale.push(`${file}: a max_counts (public rebuilt-artifact) exception in the private tree — the private tree pins exact lines or bytes`);
        continue;   // never stale: a rebuilt artifact may drop strings (e.g. after the kernel text rebake)
      }
      if (ex.counts && (ex.blob ? entries.get(file)?.sha === ex.blob : true)) {
        const drift = Object.keys({ ...ex.counts, ...ex.tally }).filter((k) => (ex.counts[k] ?? 0) !== (ex.tally[k] ?? 0));
        if (drift.length) stale.push(`${file}: declared per-token counts ${JSON.stringify(ex.counts)} but measured ${JSON.stringify(ex.tally)}`);
      }
      if (ex.blob) {
        const e = entries.get(file);
        if (!e || e.sha !== ex.blob) stale.push(`${file}: exception pinned to blob ${ex.blob.slice(0, 12)} but the rev has ${e ? e.sha.slice(0, 12) : 'no such file'}`);
        else if (ex.hitCount !== ex.count) stale.push(`${file}: exception declares ${ex.count} hit(s) in blob ${ex.blob.slice(0, 12)}, measured ${ex.hitCount}`);
      } else {
        for (const l of ex.left) stale.push(`${file}: exception line no longer occurs: ${JSON.stringify(l)}`);
      }
    }
  }
  const pixel = [];
  for (const d of fx.pixel_declarations) {
    const e = entries.get(d.file);
    if (!e || e.sha !== d.blob) pixel.push(`${d.file}: pixel declaration pinned to blob ${d.blob.slice(0, 12)} but the rev has ${e ? e.sha.slice(0, 12) : 'no such file'} — re-check the frames and re-declare or drop it`);
  }
  const ctrl = [];
  for (const c of fx.negative_controls) {
    const n = controlsSeen.filter((s) => s.file === c.file && s.context === c.context).length;
    if (n < c.min_present) ctrl.push(`${c.file}: negative control '${c.context}' expects >= ${c.min_present} declared non-brand occurrence(s), measured ${n}`);
  }
  const rendered = renderedCatalog(entries, toks, fx);
  return { shipped, paths, text, binary, red, excepted, stale, pixel, ctrl, controlsSeen, entries, rendered, fx };
}

function report(w, emit) {
  emit(`COMPETITOR BRANDS IN SHIPPED SURFACES (${FIXTURE_PATH})\n`);
  const by = {};
  for (const r of w.shipped.values()) by[r] = (by[r] || 0) + 1;
  emit(`  shipped set: ${w.paths.length} files (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}); ${w.text} text, ${w.binary} binary\n`);
  emit(`  rules: ${FX.tokens.length} tokens (${[...new Set(FX.tokens.map((t) => t.rule))].join(', ')}); ascii-boundary = non-[0-9A-Za-z] both sides, not \\b\n`);
  for (const r of w.red) {
    const at = r.line !== undefined ? `${r.file}:${r.line}` : `${r.file}@${r.offset}`;
    emit(`  RED   ${at} [${r.token}] ${JSON.stringify(r.match)} — ${r.text.slice(0, 160)}\n`);
  }
  for (const s of w.stale) emit(`  RED   stale exception — ${s}\n`);
  for (const s of w.pixel) emit(`  RED   ${s}\n`);
  for (const s of w.ctrl) emit(`  RED   ${s}\n`);
  for (const s of w.rendered.red) emit(`  RED   rendered catalog text — ${s}\n`);
  emit(`  rendered catalog text: ${w.rendered.covered.length} entr${w.rendered.covered.length === 1 ? 'y' : 'ies'} carry a retired player-facing token in a rendered field (${w.rendered.covered.join(', ') || 'none'}); each needs its locale override in ${w.rendered.locales}/${w.rendered.locales} locales and a renderer that prefers it\n`);
  emit(`  catalog-only token rules: ${w.fx.rendered_catalog_tokens.map((t) => t.id).join(', ') || 'none'}; developer provenance and site media are outside these rules\n`);
  const exFiles = [...new Set(w.excepted.map((e) => e.file))];
  emit(`  excepted: ${w.excepted.length} occurrence(s) in ${exFiles.length} file(s), each pinned in the fixture with a reason and an until\n`);
  for (const ex of w.fx.exceptions) emit(`    EXCEPTION ${ex.file} [${ex.tokens.join(',')}] ${ex.max_counts ? `max ${JSON.stringify(ex.max_counts)} (public rebuilt artifact) ` : ''}until ${ex.until}\n`);
  for (const d of w.fx.pixel_declarations) emit(`    PIXEL     ${d.file} "${d.text}" until ${d.until}\n`);
  const ctx = {};
  for (const c of w.controlsSeen) ctx[c.context] = (ctx[c.context] || 0) + 1;
  emit(`  non-brand contexts declined: ${Object.entries(ctx).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}; negative controls ${FX.negative_controls.length - w.ctrl.length}/${FX.negative_controls.length} hold\n`);
  for (const n of FX.not_proven) emit(`  NOT PROVEN: ${n}\n`);
  const reds = w.red.length + w.stale.length + w.pixel.length + w.ctrl.length + w.rendered.red.length;
  emit(`check-competitor-brands: ${w.paths.length} shipped files, ${reds} RED, ${w.excepted.length} excepted\n`);
  return reds;
}

// ---------------------------------------------------------------------------
// selftest — plants through a temporary index into an unreferenced tree
// ---------------------------------------------------------------------------
const IDX = join(tmpdir(), `check-competitor-brands-index-${process.pid}`);
// the entries of `a` beyond their count in `b`: a comparison of two hit lists that counts each hit, so two hits on
// one side against one on the other differ (the engine-equality arms use it both ways)
function multisetMinus(a, b) {
  const left = new Map();
  for (const x of b) left.set(x, (left.get(x) ?? 0) + 1);
  const out = [];
  for (const x of a) {
    const n = left.get(x) ?? 0;
    if (n > 0) left.set(x, n - 1); else out.push(x);
  }
  return out;
}

function plantedTree(rev, plants) {
  const env = { ...process.env, GIT_INDEX_FILE: IDX };
  const g = (...a) => git(a, { env }).trim();
  g('read-tree', rev);
  for (const [path, content] of Object.entries(plants)) {
    if (content === null) { g('update-index', '--force-remove', path); continue; }
    const sha = execWithStdin('git', ['-C', ROOT, 'hash-object', '-w', '--stdin'], content).toString().trim();
    g('update-index', '--add', '--cacheinfo', `100644,${sha},${path}`);
  }
  const tree = g('write-tree');
  rmSync(IDX, { force: true });
  return tree;
}

// The public snapshot (scripts/opensource/sync-public-snapshot) exports this tree through
// sync.py's own per-file pipeline: manifest exclusions remove files, text files are rewritten,
// and THIS fixture is exported with the pins of excluded files dropped. export_paths.py runs
// that pipeline for the gate-relevant paths; the result is planted into an unreferenced tree.
const SNAPSHOT_HELPER = 'scripts/opensource/sync-public-snapshot/export_paths.py';
function snapshotTree(base, entries) {
  // the gate-relevant paths, plus scripts/opensource/** (the snapshot excludes it; its absence is
  // what tells walk() it is reading the public tree)
  const paths = [...new Set([...shippedSet(entries).keys(), FIXTURE_PATH, PAGES_YML, BUNDLE_MANIFEST,
    ...[...entries.keys()].filter((q) => q.startsWith('scripts/opensource/'))])];
  const tmp = mkdtempSync(join(tmpdir(), 'ccb-snapshot-'));
  try {
    const res = JSON.parse(execWithStdin('python3', ['-I', join(ROOT, SNAPSHOT_HELPER), '--rev', base, '--out', tmp],
      paths.join('\n'), { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }));
    const env = { ...process.env, GIT_INDEX_FILE: IDX };
    const g = (args, input) => (input === undefined
      ? execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', env, maxBuffer: 1 << 28 })
      : execWithStdin('git', ['-C', ROOT, ...args], input, { encoding: 'utf8', env, maxBuffer: 1 << 28 })).trim();
    g(['read-tree', base]);
    const info = res.excluded.map((q) => `0 ${'0'.repeat(40)}\t${q}`);
    if (res.exported.length) {
      const shas = g(['hash-object', '-w', '--stdin-paths'], res.exported.map((q) => join(tmp, q)).join('\n')).split('\n');
      res.exported.forEach((q, i) => info.push(`100644 ${shas[i]}\t${q}`));
    }
    if (info.length) g(['update-index', '--index-info'], info.join('\n') + '\n');
    const tree = g(['write-tree']);
    rmSync(IDX, { force: true });
    const fx = res.exported.includes(FIXTURE_PATH)
      ? JSON.parse(readFileSync(join(tmp, FIXTURE_PATH), 'utf8')) : FX;
    return { tree, fx, res };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// A PERMITTED public scrub of the modelled snapshot: one fewer occurrence of each pinned token
// in every max_counts file where possible (each removal re-scanned: exactly one hit of that token
// gone), so the public rule's "fewer passes" is exercised by the matrix test.
function scrubTree(tree, fx) {
  const toks = compileTokens(fx);
  const ents = lsTree(tree);
  const plants = {};
  const log = [];
  for (const ex of fx.exceptions.filter((x) => x.max_counts)) {
    const e = ents.get(ex.file);
    if (!e) { log.push(`${ex.file}: absent`); continue; }
    let buf = Buffer.from(readBlobs([e.sha])(e.sha));
    const bin = isBinary(buf);
    let k = 0;
    const count = (b, tok) => scanBlob(fx, toks, ex.file, `scrub:${e.sha}:${k++}`, b).hits.filter((h) => h.token === tok);
    for (const tok of Object.keys(ex.max_counts)) {
      const hits = count(buf, tok);
      if (!hits.length) { log.push(`${ex.file} ${tok}: 0 present`); continue; }
      const needle = Buffer.from(hits[0].match, bin ? 'latin1' : 'utf8');
      let done = false;
      for (let i = buf.indexOf(needle), tries = 0; i >= 0 && tries < 400; i = buf.indexOf(needle, i + 1), tries++) {
        const cand = Buffer.from(buf);
        cand.fill(0x58, i, i + needle.length);
        if (count(cand, tok).length === hits.length - 1) { buf = cand; done = true; break; }
      }
      log.push(`${ex.file} ${tok}: ${hits.length} -> ${done ? hits.length - 1 : `${hits.length} (no single removal found)`}`);
    }
    plants[ex.file] = buf;
  }
  return { tree: Object.keys(plants).length ? plantedTree(tree, plants) : tree, log };
}

// SYNTHETIC RULES. The public tree's selftest cannot plant real names (that would publish the list), so
// the engine arms plant made-up names, one per rule kind, and run twice: with the plain rules (the regex
// engine) and with the same rules hashed (the public engine). The control arm proves none of them
// occurs in the shipped tree. The arms that plant real names live in a private module
// (tools/fixtures/competitor-brands-arms.mjs, excluded from the snapshot) and run when the checkout has it.
const SYN_PLANT = { initials: 'QXJ', name: "Zor's Quex", title: 'Quorvex Arena', cjk: '\u30be\u30eb\u30af\u30a8\u30af\u30b9' };
const SYN_TOKENS = [
  { id: 'syn-initials', rule: 'ascii-boundary-cs', form: SYN_PLANT.initials },
  { id: 'syn-name', rule: 'regex-ci', pattern: "(?<![0-9A-Za-z])zor['’]?s?[ ._-]*quex(?![0-9A-Za-z])" },
  { id: 'syn-title', rule: 'literal-cs', form: SYN_PLANT.title },
  { id: 'syn-cjk', rule: 'cjk-substring', form: SYN_PLANT.cjk },
];
const SYN_FX = {
  plain: { ...FX, tokens: [...FX.tokens, ...SYN_TOKENS] },
  hashed: { ...FX, tokens: [...FX.tokens, ...SYN_TOKENS.map((t) => hashToken(t, `${t.id}#h`, FX.cjk_min_length ?? 3).rule)] },
};
const PRIVATE_ARMS = 'tools/fixtures/competitor-brands-arms.mjs';
async function loadPrivateArms() {
  try {
    readFileSync(join(ROOT, PRIVATE_ARMS));
  } catch { return null; }
  return import(pathToFileURL(join(ROOT, PRIVATE_ARMS)).href);
}
// a repo token id -> the id under the fixture this run was given (the export renames brand rules)
function idOf(privId) {
  if (!FX.tokens.some((t) => t.rule === 'hashed')) return privId;
  const plain = JSON.parse(readFileSync(join(ROOT, FIXTURE_PATH), 'utf8'));
  return exportFixture(plain).idMap[privId] ?? privId;
}

async function selftest() {
  const base = revTree(REV);
  const entries = lsTree(base);
  const text = (p) => blobText(entries, p);
  const bin = (p) => readBlobs([entries.get(p).sha])(entries.get(p).sha);
  const replaceLine = (p, re, fn) => {
    const t = text(p);
    const lines = t.split('\n');
    const k = lines.findIndex((l) => re.test(l));
    if (k < 0) throw new Error(`selftest: no line matching ${re} in ${p}`);
    lines[k] = fn(lines[k]);
    return lines.join('\n');
  };
  const appendLine = (p, line) => text(p).replace(/\n?$/, `\n${line}\n`);
  const jsonAdd = (p, key, value) => {
    const o = JSON.parse(text(p));
    o[key] = value;
    return JSON.stringify(o, null, 2) + '\n';
  };
  // Mutations of pinned lines stay inside the matched token (a JSON string or a comment keeps
  // its syntax): duplicate the first token match (an EDITED branded line), or blank every match
  // with X of the same length (a REMOVED branded line). review r2: appending text after a
  // catalog.js line broke the CATALOG literal and crashed the gate instead of reading red.
  const mtoks = compileTokens(FX).filter((tk) => !tk.stringsOnly);
  const dupFirstToken = (l) => {
    let best = null;
    for (const ms of findAll(l, mtoks).values()) {
      if (ms.length && (!best || ms[0].index < best.index)) best = { index: ms[0].index, s: ms[0].match };
    }
    return best ? l.slice(0, best.index) + best.s + ' ' + l.slice(best.index) : l;
  };
  const blankTokens = (l) => {
    for (const tk of mtoks) {
      for (const m of findAll(l, [tk]).get(tk)) l = l.slice(0, m.index) + 'X'.repeat(m.match.length) + l.slice(m.index + m.match.length);
    }
    return l;
  };
  const firstEx = FX.exceptions.find((e) => e.lines && e.lines.length);
  const binEx = FX.exceptions.find((e) => e.blob);
  const arms = [
    // [name, plants | () => plants, expect: 'red' | 'green', predicate on the walk (optional)]
    ['control (no plant)', {}, 'green'],
    ['home path in a shipped wasm string table', { 'web/dist/pool-wasm/zz-selftest.wasm': Buffer.concat([Buffer.from([0, 97, 115, 109, 0]), Buffer.from('/home/someone/.cargo/registry/src/x.rs')]) }, 'red'],
    ['home path in a text file is out of the rider\'s scope', { 'web/app/aim.js': appendLine('web/app/aim.js', '// /home/someone/x') }, 'green'],
    ["the retired look id returns to shipped code ('sp')", { 'web/app/aim.js': appendLine('web/app/aim.js', "const look = 'sp';") }, 'red', (w) => w.red.some((r) => r.token === 'look-id-sp')],
    ['the retired look id in a shipped link (?look=sp)', { 'site/index.html': appendLine('site/index.html', '<a href="app.html?look=sp">play</a>') }, 'red', (w) => w.red.some((r) => r.token === 'look-id-sp')],
    ["FP: words that start with sp ('spin', ?look=spin)", { 'web/app/aim.js': appendLine('web/app/aim.js', "const k = 'spin'; // app.html?look=spin, 'Sp'") }, 'green'],
    ['FP: look=sp inside a longer word or a property assignment (outlook=sp, e.look=sp)', { 'web/app/aim.js': appendLine('web/app/aim.js', '// app.html?outlook=sp; e.look=sp, nolook=sp') }, 'green'],
    ['the retired look id entity-quoted in site HTML (&#39;sp&#39;, &quot;sp&quot;)', { 'site/index.html': appendLine('site/index.html', '<span data-look="x">&#39;sp&#39; &quot;sp&quot;</span>') }, 'red', (w) => w.red.filter((r) => r.token === 'look-id-sp').length === 2],
    ['the retired look id in typographic quotes (a locale value, site HTML entities)', { 'web/app/locales/en.json': jsonAdd('web/app/locales/en.json', 'zz.selftest', 'the \u201csp\u201d look'), 'site/index.html': appendLine('site/index.html', '<p>&ldquo;sp&rdquo; and &lsquo;sp&rsquo;</p>') }, 'red', (w) => w.red.filter((r) => r.token === 'look-id-sp').length === 3],
    ["the retired look id's bytes in a binary asset (scope text)", { 'web/assets/zz-selftest.bin': Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from("x'sp'x look=sp ")]) }, 'green'],
  ];
  const dropKey = (p, key) => {
    const o = JSON.parse(text(p));
    if (!(key in o)) throw new Error(`selftest: ${p} has no ${key}`);
    delete o[key];
    return JSON.stringify(o, null, 2) + '\n';
  };
  // No shipped catalog entry carries a declared token today, so the override arms first plant the
  // synthetic title into pool_used's provenance (the entry whose locale overrides they exercise), and
  // judge with the synthetic rules; without the plant every arm would read green by construction.
  const synPoolUsed = () => {
    const src = text(CATALOG_JS);
    const out = src.replace(/("id": "pool_used",[\s\S]*?"source": ")/, `$1${SYN_PLANT.title}-fitted; `);
    if (out === src) throw new Error(`selftest: ${CATALOG_JS} has no pool_used provenance source to plant into`);
    return out;
  };
  arms.push(['rendered catalog text: a locale loses its Details override (ja, pool_used)', { [CATALOG_JS]: synPoolUsed(), 'web/app/locales/ja.json': dropKey('web/app/locales/ja.json', 'equipment.provDetail.pool_used') }, 'red', (w) => w.rendered.red.length === 1, SYN_FX.hashed]);
  arms.push(['rendered catalog text: provDetail stops consulting the override', { [CATALOG_JS]: synPoolUsed(), 'web/app/atelier.js': text('web/app/atelier.js').replace('if (has(`equipment.provDetail.${e.id}`)) return t(`equipment.provDetail.${e.id}`);', '') }, 'red', (w) => w.rendered.red.length >= 1, SYN_FX.hashed]);
  arms.push(['rendered catalog text: the planted pool_used token with every override in place', { [CATALOG_JS]: synPoolUsed() }, 'red', (w) => w.rendered.red.length === 0, SYN_FX.hashed]);
  arms.push(['rendered catalog text: a cue entry carrying the synthetic title has no locale override', { [CATALOG_JS]: text(CATALOG_JS).replace(/("cues": \[\s*\{[\s\S]*?"source": ")/, `$1${SYN_PLANT.title}-tuned; `) }, 'red', (w) => w.rendered.red.some((r) => r.includes('cues/') && r.includes('missing')), SYN_FX.hashed]);
  arms.push(['catalog-only token: a locale loses its Details override (ja, carom)', { 'web/app/locales/ja.json': dropKey('web/app/locales/ja.json', 'equipment.provDetail.carom') }, 'red', (w) => w.rendered.red.some((r) => r.includes('equipment.provDetail.carom is missing in ja'))]);
  arms.push(['catalog-only token: a legacy alias loses its own override', { 'web/app/locales/fr.json': dropKey('web/app/locales/fr.json', 'equipment.provDetail.simonis_860_tournament') }, 'red', (w) => w.rendered.red.some((r) => r.includes('equipment.provDetail.simonis_860_tournament is missing in fr'))]);
  arms.push(['catalog-only token: a locale loses its table name override', { 'web/app/locales/de.json': dropKey('web/app/locales/de.json', 'equipment.wpa_generic_9ft') }, 'red', (w) => w.rendered.red.some((r) => r.includes('equipment.wpa_generic_9ft is missing in de'))]);
  arms.push(['catalog-only token: a Details override carries the retired name', { 'web/app/locales/fr.json': jsonAdd('web/app/locales/fr.json', 'equipment.provDetail.stronge_realistic', 'pooltool') }, 'red', (w) => w.rendered.red.some((r) => r.includes('equipment.provDetail.stronge_realistic carries'))]);
  arms.push(['catalog-only token: folded and word-joined text is still read', { 'web/app/locales/fr.json': jsonAdd('web/app/locales/fr.json', 'equipment.provDetail.stronge_realistic', 'ＰＯＯＬ\u200bＴＯＯＬ') }, 'red', (w) => w.rendered.red.some((r) => r.includes('equipment.provDetail.stronge_realistic carries'))]);
  arms.push(['catalog-only token: the cue dossier bypasses its locale override', { 'web/app/ateliercue.js': text('web/app/ateliercue.js').replace('if (has(`equipment.provDetail.${e.id}`)) return t(`equipment.provDetail.${e.id}`);', '') }, 'red', (w) => w.rendered.red.some((r) => r.includes('ateliercue.js: citation does not consult'))]);
  arms.push(['catalog-only token: developer provenance remains outside the rendered-text rule', { 'docs/research/zz-upstream-selftest.md': 'pooltool reference provenance\n', 'web/zz-upstream-selftest.js': '// pooltool developer provenance\n' }, 'green']);
  // the arms that plant real names: private module only (its absence is the public tree)
  const priv = await loadPrivateArms();
  if (priv) arms.push(...priv.brandArms({ jsonAdd, appendLine, text, dropKey, id: idOf, CATALOG_JS }));
  else if (entries.has(SNAPSHOT_HELPER)) {
    bad++;
    process.stdout.write(`  FAIL real-name arms: ${PRIVATE_ARMS} is unreadable in the private tree, so the real-name arms would vanish\n`);
  } else process.stdout.write(`  n/a  real-name arms: ${PRIVATE_ARMS} is not in this checkout (the public snapshot excludes it)\n`);
  if (firstEx) {
    arms.push(['excepted line edited (still branded)', { [firstEx.file]: text(firstEx.file).split('\n').map((l) => (l.trim() === firstEx.lines[0] ? dupFirstToken(l) : l)).join('\n') }, 'red']);
    arms.push(['excepted line de-branded in place (stale exception)', { [firstEx.file]: text(firstEx.file).split('\n').map((l) => (l.trim() === firstEx.lines[0] ? blankTokens(l) : l)).join('\n') }, 'red']);
  }
  // a legacy-alias site drops the old id (the rename's migration gone): its exact pin goes stale.
  // Private tree only, like the two arms above: the exported fixture carries max_counts, not lines.
  const aliasEx = FX.exceptions.find((e) => e.lines && e.tokens.includes('look-id-sp'));
  if (aliasEx) {
    arms.push([`a legacy-alias site drops the old id (${posix.basename(aliasEx.file)}: stale pin)`, { [aliasEx.file]: text(aliasEx.file).split('\n').map((l) => (l.trim() === aliasEx.lines[0] ? blankTokens(l) : l)).join('\n') }, 'red']);
  }
  if (binEx) {
    arms.push(['excepted binary changed (blob pin)', { [binEx.file]: Buffer.concat([bin(binEx.file), Buffer.from([0])]) }, 'red']);
  } else {
    // since the GH-973/GH-977 kernel rebake the fixture pins no binary; the arm returns with the first blob pin
    process.stdout.write('  n/a  excepted binary changed (blob pin): the fixture pins no binary\n');
  }
  const mcEx = FX.exceptions.find((e) => e.max_counts);
  if (mcEx) {
    const tok0 = Object.keys(mcEx.max_counts)[0];
    // a form the token's own rule matches: a copy of one the file already carries (any rule, hashed
    // included), else the retired id's quoted form; a bare rule id would plant nothing and leave the
    // arm green by construction
    const mcTok = compileTokens(FX).find((tk) => tk.id === tok0);
    const seen = mcTok && !isBinary(bin(mcEx.file)) ? findAll(normalise(text(mcEx.file)), [mcTok]).get(mcTok) : [];
    const extra = seen?.length ? ` ${seen[0].match} ` : ({ 'look-id-sp': " 'sp' " }[tok0] ?? tok0);
    // max + 1 separate occurrences: exceeds the declared maximum whatever the file carries today
    // (a permitted public scrub may already have removed some — review r3)
    const grow = (q, s, n) => (isBinary(bin(q))
      ? Buffer.concat([bin(q), ...Array.from({ length: n }, () => Buffer.concat([Buffer.from([0]), Buffer.from(`xxxxxx${s}xxxxxx`)]))])
      : text(q).replace(/\n?$/, '\n' + Array.from({ length: n }, () => `// ${s}\n`).join('')));
    arms.push([`rebuilt artifact carries more ${tok0} than declared (max ${mcEx.max_counts[tok0]} + 1 planted)`, { [mcEx.file]: grow(mcEx.file, extra, mcEx.max_counts[tok0] + 1) }, 'red']);
    arms.push(['rebuilt artifact gains an undeclared (synthetic) name', { [mcEx.file]: grow(mcEx.file, SYN_PLANT.title, 1) }, 'red', undefined, SYN_FX.hashed]);
  }
  for (const d of FX.pixel_declarations) {
    arms.push([`pixel declaration re-check (${posix.basename(d.file)} changed)`, { [d.file]: Buffer.concat([bin(d.file), Buffer.from([0])]) }, 'red']);
  }
  arms.push(['negative control removed', (() => {
    const c = FX.negative_controls[0];
    return { [c.file]: text(c.file).replace(new RegExp(c.strip_pattern, 'g'), 'XX') };
  })(), 'red']);

  let bad = 0;
  const privateTree = entries.has(SNAPSHOT_HELPER);
  let skipped = 0;
  for (const [name, plants, expect, pred, armFx] of arms) {
    // an arm planted into content this tree does not have would change nothing and read a
    // false verdict: SKIP it by name (allowed in the public tree, a failure in the private one)
    const noop = Object.keys(plants).length && Object.entries(plants).every(([q, c]) => {
      const e = entries.get(q);
      if (!e) return false;
      const cur = readBlobs([e.sha])(e.sha);
      return Buffer.isBuffer(c) ? cur.equals(c) : cur.toString('utf8') === c;
    });
    if (noop) {
      skipped++;
      if (privateTree) bad++;
      process.stdout.write(`  ${privateTree ? 'FAIL' : 'SKIP'} ${name}: its plant changes nothing in this tree\n`);
      continue;
    }
    const tree = Object.keys(plants).length ? plantedTree(base, plants) : base;
    const w = walk(tree, armFx ?? FX);
    const reds = w.red.length + w.stale.length + w.pixel.length + w.ctrl.length + w.rendered.red.length;
    const got = reds ? 'red' : 'green';
    const ok = got === expect && (!pred || pred(w));
    if (!ok) bad++;
    process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: expect ${expect}, got ${got} (${reds} red)\n`);
  }

  // THE SYNTHETIC CASES, once per engine (the plain rules and the same rules hashed): a control walk over the
  // unplanted tree (no synthetic name may occur there, or every case below would prove nothing), then ONE walk
  // over a tree carrying every case at once, each case judged on its own line (tagged synNN in its key or text)
  // or its own file.
  let synRun = 0;
  {
    const I = SYN_PLANT.initials;
    const JA = '\u30c8\u30fc\u30ca\u30e1\u30f3\u30c8';
    const cjk = SYN_PLANT.cjk;
    const cjkEscaped = [...cjk].map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
    const fullWidth = [...I].map((c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).join('');
    const wasmOf = (x) => Buffer.concat([Buffer.from([0, 97, 115, 109, 0]), Buffer.from(`xx${x}xx`, 'utf8')]);
    const binOf = (x) => Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(x)]);
    // [tag, label, file, kind (json | line | blob), payload, expect, the synthetic rule a red case must hit]
    const cases = [
      ['syn01', 'synthetic initials in a locale value', 'web/app/locales/en.json', 'json', `${I} tournament gray`, 'red', 'syn-initials'],
      ['syn02', 'synthetic initials in a compound', 'web/app/locales/de.json', 'json', `${I}-Turniergrau`, 'red', 'syn-initials'],
      ['syn03', 'synthetic initials beside CJK text', 'web/app/locales/ja.json', 'json', `${I} ${JA}`, 'red', 'syn-initials'],
      ['syn04', `the \\b blind spot through the initials rule (${I}_look)`, 'web/app/aim.js', 'line', `// syn04 see ${I}_look`, 'red', 'syn-initials'],
      ['syn05', 'full-width synthetic initials', 'web/app/locales/ja.json', 'json', `${fullWidth} ${JA}`, 'red', 'syn-initials'],
      ['syn06', 'FP synthetic initials inside longer words', 'web/app/aim.js', 'line', `// syn06 A${I} ${I}A`, 'green'],
      ['syn07', 'the synthetic name with an apostrophe and a space', 'site/index.html', 'line', `<!-- syn07 like ${SYN_PLANT.name} -->`, 'red', 'syn-name'],
      ['syn08', 'the synthetic name joined by &rsquo; and &nbsp;', 'site/index.html', 'line', '<!-- syn08 Zor&rsquo;s&nbsp;Quex -->', 'red', 'syn-name'],
      ['syn09', 'the synthetic name upper-case with a hyphen', 'web/app/aim.js', 'line', '// syn09 ZORS-QUEX', 'red', 'syn-name'],
      ['syn10', 'FP the synthetic name inside a longer word', 'web/app/aim.js', 'line', '// syn10 xzorquex zorquexy', 'green'],
      ['syn11', 'the synthetic title wrapped across two lines', 'site/index.html', 'line', '<p>syn11 like Quorvex\n  Arena does</p>', 'red', 'syn-title'],
      ['syn12', 'FP the synthetic title in lower case', 'web/app/aim.js', 'line', '// syn12 a quorvex arena', 'green'],
      ['syn13', 'the synthetic CJK form in a locale value', 'web/app/locales/ja.json', 'json', `${cjk}\u98a8`, 'red', 'syn-cjk'],
      ['syn14', 'the synthetic CJK form word-joined (U+2060)', 'web/app/locales/ja.json', 'json', `${cjk[0]}\u2060${cjk.slice(1)}`, 'red', 'syn-cjk'],
      ['syn15', 'the synthetic CJK form \\u-escaped in a source line', 'web/app/aim.js', 'line', `// syn15 "${cjkEscaped}"`, 'red', 'syn-cjk'],
      ['syn16', 'the synthetic CJK form in a wasm string table', 'web/dist/pool-wasm/zz-syn16.wasm', 'blob', wasmOf(cjk), 'red', 'syn-cjk'],
      ['syn17', "the synthetic name's bytes in a binary asset", 'web/assets/zz-syn17.bin', 'blob', binOf('ZorsQuex'), 'red', 'syn-name'],
      ['syn18', "the synthetic initials' bytes in a binary asset (short rules skip raw binaries)", 'web/assets/zz-syn18.bin', 'blob', binOf(` ${I} `), 'green'],
      ['syn19', 'the synthetic name in a non-shipped research doc', 'docs/research/zz-syn19.md', 'blob', `${SYN_PLANT.name}\n`, 'green'],
      ['syn20', 'the synthetic name in the bundle include (grade.json)', 'tools/render/grade.json', 'json', 'ZorsQuex', 'red', 'syn-name'],
      ['syn21', 'the synthetic initials in a native shell source', 'macos/App/Sources/MainMenu.swift', 'line', `// syn21 ${I} look`, 'red', 'syn-initials'],
      ['syn22', "the synthetic name's UTF-8 bytes with a curly apostrophe in a binary asset", 'web/assets/zz-syn22.bin', 'blob', Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from('Zor\u2019sQuex', 'utf8')]), 'red', 'syn-name'],
    ];
    const plants = {};
    const jsonPlants = {};
    for (const [tag, , file, kind, payload] of cases) {
      if (kind === 'blob') plants[file] = payload;
      else if (kind === 'json') (jsonPlants[file] ??= JSON.parse(text(file)))[`zz.${tag}`] = payload;
      else plants[file] = (plants[file] ?? text(file)).replace(/\n?$/, `\n${payload}\n`);
    }
    for (const [file, o] of Object.entries(jsonPlants)) plants[file] = JSON.stringify(o, null, 2) + '\n';
    const planted = plantedTree(base, plants);
    const engines = [['plain rules', SYN_FX.plain, (id) => id], ['hashed rules', SYN_FX.hashed, (id) => `${id}#h`]];
    // the exported fixture's own canary rules (the public tree): the stored hashes against this gate's matcher
    if (FX.tokens.some((t) => t.id.startsWith('canary-'))) engines.push(['the fixture\'s canary rules', FX, (id) => `canary-${id}`]);
    else process.stdout.write('  n/a  canary rules: this fixture carries none (the repo fixture; the export adds them)\n');
    const perEngine = [];
    for (const [tag, fx, idOfRule] of engines) {
      const ruleIds = new Set(SYN_TOKENS.map((t) => idOfRule(t.id)));
      const isSyn = (r) => ruleIds.has(r.token);
      const control = walk(base, fx).red.filter(isSyn);
      const cOk = control.length === 0;
      if (!cOk) bad++;
      synRun++;
      process.stdout.write(`  ${cOk ? 'ok  ' : 'FAIL'} ${tag}: control (no plant): no synthetic name occurs in the shipped tree${cOk ? '' : ` — ${control.length} hit(s), first ${control[0].file}`}\n`);
      const w = walk(planted, fx);
      const verdicts = [];
      for (const [ctag, label, file, kind, , expect, rule] of cases) {
        const hits = w.red.filter((r) => isSyn(r) && r.file === file && (kind === 'blob' || r.text.includes(ctag)));
        const hit = hits.some((r) => !rule || r.token === idOfRule(rule));
        verdicts.push(`${ctag}:${hits.length}`);
        const ok = expect === 'red' ? hit : !hit;
        if (!ok) bad++;
        synRun++;
        process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} ${tag}: ${label}: expect ${expect}, got ${hit ? 'red' : 'green'}\n`);
      }
      perEngine.push([tag, verdicts.join(' ')]);
    }
    // the engines agree case by case (hit counts, not only red or green)
    const same = perEngine.every(([, v]) => v === perEngine[0][1]);
    if (!same) bad++;
    synRun++;
    process.stdout.write(`  ${same ? 'ok  ' : 'FAIL'} the engines agree on every synthetic case's hit count${same ? '' : `: ${perEngine.map(([t, v]) => `${t} [${v}]`).join(' | ')}`}\n`);
  }
  // the real rules through both engines (private module only): every brand rule realized in the scanner's
  // shapes, plaintext hits == hashed hits
  if (priv?.brandDifferential && !FX.tokens.some((t) => t.rule === 'hashed')) {
    const d = priv.brandDifferential({ FX, base, text, plantedTree, walk, exportFixture, expandCi, SEP_CI, multisetMinus });
    const ok = d.onlyPlain.length === 0 && d.onlyHashed.length === 0 && d.plain > 0;
    if (!ok) bad++;
    synRun++;
    process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} differential: ${d.rules} brand rules realized, ${d.plain} plaintext hit(s), ${d.hashed} hashed, ${d.onlyPlain.length + d.onlyHashed.length} differ; ${d.stricter.length} canonical form(s) outside their pattern's language, where the hashed fold is stricter by design (not planted)\n`);
    for (const x of d.onlyPlain.slice(0, 5)) process.stdout.write(`    plaintext only: ${x}\n`);
    for (const x of d.onlyHashed.slice(0, 5)) process.stdout.write(`    hashed only: ${x}\n`);
  }
  // fail closed: a fixture with zero tokens is refused, never a vacuous pass
  {
    let refused = false;
    try { walk(base, { ...FX, tokens: [] }); } catch (e) { refused = e instanceof ShippedSetError; }
    if (!refused) bad++;
    process.stdout.write(`  ${refused ? 'ok  ' : 'FAIL'} a fixture with zero tokens: expect a refusal, got ${refused ? 'refusal' : 'a verdict'}\n`);
  }
  // the pixel-declaration pin holds with or without live declarations (the per-declaration arm
  // above loops over the fixture's list): a declaration pinned to a blob the rev does not have
  // is red, the same declaration pinned to the file's own blob is green
  {
    const q = walk(base).paths.find((p) => /\.(?:mp4|webp|png)$/.test(p));
    const pinned = (blob) => walk(base, { ...FX, pixel_declarations: [...FX.pixel_declarations,
      { file: q, blob, text: 'selftest', checked: 'selftest', until: 'selftest' }] }).pixel.some((s) => s.startsWith(`${q}: `));
    const stale = q !== undefined && pinned('0'.repeat(40));
    const own = q !== undefined && !pinned(entries.get(q).sha);
    if (!(stale && own)) bad++;
    process.stdout.write(`  ${stale && own ? 'ok  ' : 'FAIL'} pixel declaration pin (${q ?? 'no shipped image or video'}): a blob the rev does not have → ${stale ? 'red' : 'green'}, the file's own blob → ${own ? 'green' : 'red'}\n`);
  }
  // the private tree pins exact lines or bytes: a max_counts (public rebuilt-artifact) entry is refused
  // here. Private-tree only: the exported fixture already carries max_counts and no counts (review r3).
  if (!privateTree) {
    process.stdout.write('  SKIP a max_counts entry in the private tree is refused: this is not the private tree\n');
  } else {
    const loose = { ...FX, exceptions: FX.exceptions.map((x, i) => (i === 0 ? { file: x.file, tokens: x.tokens, max_counts: x.counts, reason: 'selftest', until: 'selftest' } : x)) };
    const w = walk(base, loose);
    const n = w.red.length + w.stale.length + w.pixel.length + w.ctrl.length + w.rendered.red.length;
    const ok = n > 0 && w.stale.some((s) => s.includes('max_counts'));
    if (!ok) bad++;
    process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} a max_counts entry in the private tree is refused: expect red, got ${n ? `red (${n})` : 'green'}\n`);
  }
  // the public snapshot: green with the exported fixture; the unexported fixture over the
  // same tree reproduces the stale-pin failure; a planted brand and an edited pinned line on a
  // shipped file still go red there
  let extra = 0;
  if (!entries.has(SNAPSHOT_HELPER)) {
    process.stdout.write(`  SKIP snapshot arms: ${SNAPSHOT_HELPER} is not in this tree (the public snapshot excludes it)\n`);
  } else {
    const snap = snapshotTree(base, entries);
    const snapEntries = lsTree(snap.tree);
    const sText = (q) => blobText(snapEntries, q);
    const plantOn = (plants) => {
      const env = { ...process.env, GIT_INDEX_FILE: IDX };
      execFileSync('git', ['-C', ROOT, 'read-tree', snap.tree], { env });
      for (const [q, content] of Object.entries(plants)) {
        const sha = execWithStdin('git', ['-C', ROOT, 'hash-object', '-w', '--stdin'], content).toString().trim();
        execFileSync('git', ['-C', ROOT, 'update-index', '--add', '--cacheinfo', `100644,${sha},${q}`], { env });
      }
      const tr = execFileSync('git', ['-C', ROOT, 'write-tree'], { env, encoding: 'utf8' }).trim();
      rmSync(IDX, { force: true });
      return tr;
    };
    const reds = (w) => w.red.length + w.stale.length + w.pixel.length + w.ctrl.length + w.rendered.red.length;
    const privCat = FX.exceptions.find((x) => x.file === CATALOG_JS && x.lines?.length);
    // The web/dist pin arms exercise how the snapshot exports pins on rebuilt files. Since the
    // GH-973/GH-977 kernel rebake the fixture pins no web/dist file, so they have no subject;
    // they come back with the first web/dist pin (privCat / distPins below).
    const distPins = FX.exceptions.filter((x) => x.file.startsWith('web/dist/'));
    const look = 'web/scene/look.js';
    const wasm = 'web/dist/pool-wasm/pool_wasm_bg.wasm';
    const sBin = (q) => readBlobs([snapEntries.get(q).sha])(snapEntries.get(q).sha);
    // the d98c1d6b export: excluded-file pins dropped, web/dist pins exported VERBATIM
    const verbatimFx = { ...snap.fx, exceptions: [...snap.fx.exceptions.filter((x) => !x.file.startsWith('web/dist/')),
      ...FX.exceptions.filter((x) => x.file.startsWith('web/dist/'))] };
    const crashes = (fn) => { try { fn(); return false; } catch { return true; } };
    // The export boundary arms need private pins the public tree cannot honour. Since the
    // GH-973/GH-977 kernel rebake and the drag-shot re-render no fixture pin differs between the
    // trees, so the arms plant their own subjects: blob pins at PRIVATE bytes (no hit, count 0,
    // consistent there), one on the snapshot helper, which the snapshot always excludes (its
    // absence is how walk() knows it reads the public tree), and one on the kernel wasm, whose
    // public rebuild rewrites the build stamp. Each must add exactly one stale pin over the
    // public tree (counted against the same fixture unplanted, which may pin the file itself);
    // the control proves both hold on the private tree.
    const plantPin = (file) => ({ file, tokens: ['home-path'], blob: entries.get(file).sha, count: 0, counts: {},
      reason: 'selftest plant (export boundary arm)', until: 'never' });
    const plantedFx = { ...FX, exceptions: [...FX.exceptions, plantPin(SNAPSHOT_HELPER), plantPin(wasm)] };
    const snapWalks = new Map();
    const staleOn = (fx, file) => {
      if (!snapWalks.has(fx)) snapWalks.set(fx, walk(snap.tree, fx));
      return snapWalks.get(fx).stale.filter((s) => s.startsWith(`${file}: exception pinned to blob ${entries.get(file).sha.slice(0, 12)} `)).length;
    };
    const plantedStale = (file) => staleOn(plantedFx, file) - staleOn(FX, file);
    const sArms = [
      ['snapshot: the exported fixture over the public tree (rebuilt web/dist modelled)', () => reds(walk(snap.tree, snap.fx)), (n) => n === 0, 'green'],
      ['snapshot: the UNEXPORTED fixture over the public tree (planted pin on the excluded snapshot helper goes stale)', () => plantedStale(SNAPSHOT_HELPER), (n) => n === 1, 'red'],
      ['snapshot: the UNEXPORTED fixture over the public tree (planted pin on the rebuilt kernel wasm goes stale)', () => plantedStale(wasm), (n) => n === 1, 'red'],
      ['snapshot control: those planted private pins hold on the private tree', () => reds(walk(base, plantedFx)) - reds(walk(base, FX)), (n) => n === 0, 'green'],
      ...(distPins.length ? [['snapshot PLANTED RED (review r2 #2): web/dist pins exported verbatim over the public rebuild', () => reds(walk(snap.tree, verbatimFx)), (n) => n > 0, 'red']] : []),
      ...(privCat ? [
        ['snapshot PLANTED RED (review r2 #1): the d98c1d6b mutation (text after a catalog.js line) crashes the gate', () => crashes(() => walk(plantOn({ [CATALOG_JS]: sText(CATALOG_JS).split('\n').map((l) => (l.trim() === privCat.lines[0] ? `${l} ${SYN_PLANT.initials}` : l)).join('\n') }), snap.fx)), (c) => c === true, 'crash'],
        ['snapshot: the token-preserving edit of the same catalog.js line reads red, no crash', () => reds(walk(plantOn({ [CATALOG_JS]: sText(CATALOG_JS).split('\n').map((l) => (l.trim() === privCat.lines[0] ? dupFirstToken(l) : l)).join('\n') }), snap.fx)), (n) => n > 0, 'red'],
      ] : []),
      ['snapshot: a pinned text file the public tree hand-scrubbed (tokens gone) stays green', () => reds(walk(plantOn({ [look]: blankTokens(sText(look)) }), snap.fx)), (n) => n === 0, 'green'],
      ['snapshot: the rebuilt wasm carries an un-remapped home path', () => reds(walk(plantOn({ [wasm]: Buffer.concat([sBin(wasm), Buffer.from([0]), Buffer.from('/home/someone/.cargo/registry/src/x/lib.rs')]) }), snap.fx)), (n) => n > 0, 'red'],
    ];
    if (priv) sArms.push(...priv.snapshotBrandArms({ reds, walk, plantOn, sText, sBin, look, wasm, snapFx: snap.fx, CATALOG_JS }));
    // the two engines agree on the public tree: every hit (red, excepted, declined) keyed by file, place
    // and the rule's repo id, under the exported (hashed) rules and under the repo's plaintext rules with
    // the export's exceptions mapped back
    const sameHits = () => {
      const plain = JSON.parse(readFileSync(join(ROOT, FIXTURE_PATH), 'utf8'));
      const back = Object.fromEntries(Object.entries(exportFixture(plain).idMap).map(([k, v]) => [v, k]));
      const unmap = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [back[k] ?? k, v]));
      // the canary rules are synthetic (judged by the synthetic cases); both sides here carry the real rules only
      const hashedFx = { ...snap.fx, tokens: snap.fx.tokens.filter((t) => !t.id.startsWith('canary-')) };
      const plainFx = { ...hashedFx,
        tokens: hashedFx.tokens.map((t) => (t.rule === 'hashed' ? plain.tokens.find((u) => u.id === back[t.id]) : t)),
        exceptions: snap.fx.exceptions.map((x) => ({ ...x, tokens: x.tokens.map((k) => back[k] ?? k),
          ...(x.max_counts ? { max_counts: unmap(x.max_counts) } : {}), ...(x.counts ? { counts: unmap(x.counts) } : {}) })) };
      if (plainFx.tokens.some((t) => !t)) throw new Error('selftest: a hashed rule has no plaintext twin');
      const sig = (w) => [
        ...w.red.map((r) => `R ${r.file}:${r.line ?? `@${r.offset}`} ${back[r.token] ?? r.token}`),
        ...w.excepted.map((r) => `E ${r.file}:${r.line ?? `@${r.offset}`} ${back[r.token] ?? r.token}`),
        ...w.controlsSeen.map((c) => `C ${c.file}:${c.line ?? `@${c.offset}`} ${back[c.token] ?? c.token} ${c.context}`),
      ].sort();
      const a = sig(walk(snap.tree, hashedFx));
      const b = sig(walk(snap.tree, plainFx));
      const onlyA = multisetMinus(a, b);
      const onlyB = multisetMinus(b, a);
      process.stdout.write(`  engine equality over the public tree: ${a.length} hit(s) hashed, ${b.length} plaintext, ${onlyA.length + onlyB.length} differ\n`);
      for (const x of onlyA.slice(0, 5)) process.stdout.write(`    hashed only: ${x}\n`);
      for (const x of onlyB.slice(0, 5)) process.stdout.write(`    plaintext only: ${x}\n`);
      return onlyA.length + onlyB.length;
    };
    sArms.push(['snapshot: the hashed rules and the plaintext rules give the same hits over the public tree', sameHits, (n) => n === 0, 'green']);
    if (!distPins.length) process.stdout.write('  n/a  snapshot PLANTED RED (review r2 #2): the fixture pins no web/dist file\n');
    if (!privCat) process.stdout.write('  n/a  snapshot catalog.js pin arms (review r2 #1 + the token-preserving edit): the fixture pins no catalog.js line\n');
    process.stdout.write(`  snapshot built: ${snap.res.excluded.length} excluded, ${snap.res.exported.length} exported (web/dist modelled as the public rebuild), ${snap.res.verbatim.length} verbatim; exported fixture: ${snap.fx.exceptions.length} exception(s) (${snap.fx.exceptions.filter((x) => x.max_counts).length} max_counts), ${snap.fx.pixel_declarations.length} pixel declaration(s)\n`);
    for (const [name, run, ok, expect] of sArms) {
      const v = run();
      const good = ok(v);
      if (!good) bad++;
      process.stdout.write(`  ${good ? 'ok  ' : 'FAIL'} ${name}: expect ${expect}, got ${typeof v === 'boolean' ? (v ? 'crash' : 'no crash') : (v ? `red (${v})` : 'green')}\n`);
    }
    extra = sArms.length;
  }
  // an undeclared write into the Pages artifact refuses
  {
    const tree = plantedTree(base, { [PAGES_YML]: text(PAGES_YML).replace('mkdir -p dist-pages/tools/render', 'mkdir -p dist-pages/tools/render\n          cp -r docs/research/. dist-pages/research/') });
    let refused = false;
    try { walk(tree); } catch (e) { refused = e instanceof ShippedSetError; }
    if (!refused) bad++;
    process.stdout.write(`  ${refused ? 'ok  ' : 'FAIL'} pages.yml undeclared artifact write: expect a ShippedSetError refusal, got ${refused ? 'refusal' : 'a verdict'}\n`);
  }
  // shipped-set derivation fails closed when pages.yml stops saying its assembly lines
  {
    const tree = plantedTree(base, { [PAGES_YML]: text(PAGES_YML).replace('rm -rf dist-pages/web/tools', 'rm -rf dist-pages/web/scratch') });
    let refused = false;
    try { walk(tree); } catch (e) { refused = e instanceof ShippedSetError; }
    if (!refused) bad++;
    process.stdout.write(`  ${refused ? 'ok  ' : 'FAIL'} pages.yml assembly drift: expect a ShippedSetError refusal, got ${refused ? 'refusal' : 'a verdict'}\n`);
  }
  // the weak reader (\b) stays blind to an underscore-joined form — pins why the rule is not \b
  {
    const weak = new RegExp(`\\b${SYN_PLANT.initials}\\b`).test(`see ${SYN_PLANT.initials}_DRAG`);
    const strong = new RegExp(`(?<![0-9A-Za-z])${SYN_PLANT.initials}(?![0-9A-Za-z])`).test(`see ${SYN_PLANT.initials}_DRAG`);
    const ok = !weak && strong;
    if (!ok) bad++;
    process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} weak-boundary: \\b${SYN_PLANT.initials}\\b ${weak ? 'matches' : 'misses'} ${SYN_PLANT.initials}_DRAG, the declared rule ${strong ? 'matches' : 'misses'} it — do not loosen the rule to \\b\n`);
  }
  // the engine-equality comparisons count each hit: two hits on one side against one on the other differ, while a
  // presence-only comparison (the defect this pins) sees no difference; order does not matter
  {
    const twice = multisetMinus(['h', 'h'], ['h']).length;
    const order = multisetMinus(['h', 'k'], ['k', 'h']).length + multisetMinus(['k', 'h'], ['h', 'k']).length;
    const presence = ['h', 'h'].filter((x) => !['h'].includes(x)).length;
    const ok = twice === 1 && order === 0 && presence === 0;
    if (!ok) bad++;
    process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} hit multiplicity: two hits against one differ by ${twice} (a presence-only comparison sees ${presence}); the same hits in another order differ by ${order}\n`);
  }
  process.stdout.write(bad ? `check-competitor-brands --selftest: ${bad} FAILURE(S)\n`
    : `check-competitor-brands --selftest: OK (${arms.length + 6 + extra - skipped} arms and ${synRun} synthetic cases run, ${skipped} skipped)\n`);
  return bad === 0;
}

// ---------------------------------------------------------------------------
if (opts['--export-fixture']) {
  // the public snapshot's fixture: the (exclusion-filtered) private fixture on stdin, the hashed one on
  // stdout (sync.apply_competitor_fixture_patch); reads no tree
  let input;
  try { input = JSON.parse(readFileSync(0, 'utf8')); } catch (e) { refuse(`--export-fixture: stdin is not a fixture (${e.message})`); }
  if (!Array.isArray(input?.tokens) || input.tokens.length === 0) refuse('--export-fixture: the input declares no tokens');
  let out;
  try { out = exportFixture(input).fixture; } catch (e) { refuse(`--export-fixture: ${e.message}`); }
  // exit only after the write drained: a large fixture through a pipe must never be cut short
  process.stdout.write(JSON.stringify(out, null, 1) + '\n', () => process.exit(0));
  await new Promise(() => {});
}
const tree = revTree(REV);
if (!tree) {
  process.stdout.write(`check-competitor-brands: rev ${REV} does not exist under ${ROOT}`
    + ' — refusing to report on a tree that was never read\n');
  process.exitCode = 2;
} else if (argv.includes('--build-snapshot')) {
  // --build-snapshot <dir> (private tree only): the modelled public snapshot of the rev, its
  // permitted-scrub variant, and the exported fixture written to <dir> — the inputs of
  // tools/test-competitor-brands-matrix.mjs. Prints one JSON line.
  try {
    const dir = opts['--build-snapshot'];
    const ents = lsTree(tree);
    if (!ents.has(SNAPSHOT_HELPER)) throw new Error(`${SNAPSHOT_HELPER} is not in this tree (the private tree builds the snapshot)`);
    const snap = snapshotTree(tree, ents);
    mkdirSync(dir, { recursive: true });
    const fixture = join(dir, 'competitor-brands.public.json');
    writeFileSync(fixture, JSON.stringify(snap.fx, null, 1) + '\n');
    const scrubbed = scrubTree(snap.tree, snap.fx);
    process.stdout.write(JSON.stringify({ public: snap.tree, scrubbed: scrubbed.tree, scrubs: scrubbed.log, fixture }) + '\n');
    process.exitCode = 0;
  } catch (e) {
    process.stdout.write(`check-competitor-brands --build-snapshot: could not run — ${e.message}\n`);
    process.exitCode = 2;
  }
} else if (argv.includes('--selftest')) {
  try {
    process.exitCode = (await selftest()) ? 0 : 1;
  } catch (e) {
    process.stdout.write(`check-competitor-brands --selftest: could not run — ${e.message}\n`);
    process.exitCode = 2;
  }
} else {
  try {
    const w = walk(tree);
    if (argv.includes('--emit-exceptions')) {
      // Skeleton pins for the CURRENT red hits (text: exact trimmed lines; binary: blob sha +
      // count). The reason and until are the author's to write; nothing is added silently.
      const byFile = new Map();
      for (const r of w.red) {
        if (!byFile.has(r.file)) byFile.set(r.file, { file: r.file, tokens: new Set(), lines: [], n: 0, counts: {} });
        const g = byFile.get(r.file);
        g.tokens.add(r.token); g.n++; g.counts[r.token] = (g.counts[r.token] ?? 0) + 1;
        if (r.line !== undefined && !(g.seen ??= new Set()).has(r.line)) { g.seen.add(r.line); g.lines.push(r.text); }
      }
      const out = [...byFile.values()].map((g) => {
        const e = w.entries.get(g.file);
        const isText = w.red.some((r) => r.file === g.file && r.line !== undefined);
        // per-token counts are part of every pin: the private scan checks them and the public export
        // turns them into max_counts (sync.py refuses a pin without them)
        return isText
          ? { file: g.file, tokens: [...g.tokens].sort(), lines: g.lines, counts: g.counts, reason: '', until: '' }
          : { file: g.file, tokens: [...g.tokens].sort(), blob: e.sha, count: g.n, counts: g.counts, reason: '', until: '' };
      });
      if (!out.length) {
        process.stdout.write('check-competitor-brands --emit-exceptions: nothing to emit — the scan has no red hit\n');
        process.exitCode = 1;
      } else {
        process.stdout.write(JSON.stringify(out, null, 1) + '\n');
        process.exitCode = 0;
      }
    } else {
      if (argv.includes('--list')) {
        for (const e of w.excepted) process.stdout.write(`  excepted ${e.file}:${e.line ?? '@' + e.offset} [${e.token}] ${e.text.slice(0, 160)}\n`);
      }
      process.exitCode = report(w, (t) => process.stdout.write(t)) ? 1 : 0;
    }
  } catch (e) {
    process.stdout.write(`check-competitor-brands: could not run — ${e.message}\n`);
    process.exitCode = 2;
  }
}
