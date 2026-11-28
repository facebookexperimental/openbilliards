#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// js-scan-measure.mjs — the PRODUCER of every number the GH-750 readers are
// described with, and the loader of the BASE readers the differential test
// compares against. Nothing here is typed by hand: the base readers are read
// out of git at the base sha, the tree is `git ls-files`, and the counts are
// printed as a table so a PR body can quote them with the command beside them.
//
//   node web/tools/js-scan-measure.mjs [--base 868bbd57] [--json]
//
// Columns (base readers vs the readers shipped in this checkout, over every
// tracked .mjs/.js outside web/vendor and web/dist):
//   strip-nesting-only   files the ISSUE's own measurement reader (a stack for
//                        templates, no regex mode — kept here verbatim) reads
//                        differently from the base stripper;
//   strip-head           files the shipped stripComments reads differently;
//   strip-head-noshebang the same, ignoring files whose only difference is
//                        the hashbang line (the base read `#!/usr/bin/…` as
//                        code with a regex in it);
//   blank-head           files the shipped blankStrings(stripComments(text))
//                        reads differently from the base pair;
//   blank-head-noshebang the same, ignoring shebang-only differences;
//   derives-flips        files whose derivesFromBase verdict changes;
//   unreadable           sources the reader refuses (FIX2: fail closed; expected 0);
//   fix1-differs         sources the FIX1 heuristic reader (f5262842) read
//                        differently from the tokenizer — the cost of the class;
//   interp-derivations   template interpolations carrying `<base> + <term>`
//                        (files / expressions) and how many files carry such a
//                        derivation ONLY inside an interpolation (a file the
//                        whole-template blanking law would silence).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..');
export const DEFAULT_BASE = '868bbd57';

/** THE TRANSPORT. Every git read in this file goes through here, and git's stdout lands in a FILE, never in a pipe.
 *
 * MEASURED on this machine, which is also the CI runner (2026-09-14, GH-750 FIX4). Reading a blob through a
 * pipe-backed synchronous child fails intermittently: `fatal: unable to stream <oid> to stdout`, exit 128. Two
 * probes over `f5262842:web/tools/lib/ci-bands.mjs` (167 KiB) — 7 failures in 817 at load average 16, 9 in 4000 at
 * load average 20, 0 in 400 in a quiet window. The rate moves with machine load; the SHAPE does not. Every single
 * failure had written exactly 65313 bytes before it died — one 64 KiB pipe buffer. So it is not the repository and
 * it is not the object: git fills the pipe, its next write to a pipe this process owns does not block the way a
 * blocking write should, and git dies. The same read to a FILE: 0 failures in 3000.
 *
 * That boundary is why it hid. `rev-parse` and `cat-file -e` answer in bytes and can never reach it; `ls-tree -r`
 * (814 KiB here) and both READER_SEEDS are far past it, and the seeds are read at EVERY revision the differential
 * touches. So the exposure is proportional to how much of the instrument actually runs.
 *
 * This is not a test-only nicety. It surfaced as THREE DIFFERENT red tests on three consecutive runs of one
 * unchanged tree — once as the whole module, once as S5/B2, once as the S5 walk — and a gate that flakes green is
 * worse than one that is red. It failed LOUDLY every time, which is the only reason it was a flake and not a wrong
 * answer: every caller below turns a non-zero git into a throw. A quieter caller would have recorded a 65313-byte
 * prefix of a 167 KiB file as a measurement, which is the GH-803 class.
 *
 * The exit status and git's own stderr are carried into every error, because "git failed" WITHOUT them is what made
 * this take three runs to name: the old message kept only `Command failed: git show …`, which is the one line that
 * says nothing. One temp file per process, reused and overwritten; it sits beside the mirrors this module already
 * leaves under os.tmpdir(). */
let GIT_SINK = null;
const gitRun = (args, cwd) => {
  GIT_SINK = GIT_SINK ?? path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ob-js-scan-git-')), 'out');
  const fd = fs.openSync(GIT_SINK, 'w');
  let r;
  try { r = spawnSync('git', args, { cwd, stdio: ['ignore', fd, 'pipe'], encoding: 'utf8' }); }
  finally { fs.closeSync(fd); }
  return { status: r.error ? null : r.status, signal: r.signal, spawnError: r.error ?? null,
    stderr: String(r.stderr ?? ''), text: fs.readFileSync(GIT_SINK, 'utf8') };
};
/** `git <args>` or throw. `what` names what the caller was trying to learn, so the message says which READING was
 * lost and not merely which process exited. EXPORTED so the suite can arm the transport itself: the flake it fixes
 * lived here and nowhere else, so an arm that can only reach it through a caller is arming the caller. */
export const gitText = (args, cwd, what) => {
  const r = gitRun(args, cwd);
  if (r.status === 0) return r.text;
  throw new Error(`js-scan-measure: git ${args.join(' ')} failed (${what}) — `
    + `exit ${r.status}${r.signal ? `, signal ${r.signal}` : ''}${r.spawnError ? `, ${r.spawnError.message}` : ''}`
    + `; stderr: ${r.stderr.trim().split('\n')[0] || '(empty)'}`);
};

/** Every tracked JS/MJS source the readers are judged on. */
export function trackedSources(repo = REPO) {
  return gitText(['ls-files', '--', '*.mjs', '*.js'], repo, 'the tracked JS/MJS sources the readers are judged on')
    .split('\n').filter(Boolean).filter((f) => !/^web\/(vendor|dist)\//.test(f) && !/(^|\/)node_modules\//.test(f));
}

/** The two reader modules the differential is about. Everything else in the mirror is reached FROM them. */
export const READER_SEEDS = Object.freeze(['web/tools/cdp.mjs', 'web/tools/lib/ci-bands.mjs']);

// A module-relative specifier reaches the mirror in one of two shapes. `imports` are syntactic: the `from '…'` of a
// static import or re-export, a bare `import '…'`, a literal `import('…')`. `candidates` are every module-relative
// string literal that NAMES a JS/JSON file — not decoration: cdp.mjs loads vendored acorn through
// `for (const rel of [A, B]) await import(new URL(rel, import.meta.url).href)`, so the path never appears as an
// import argument at all, and a mirror built from import syntax alone misses it. That is exactly how S5 happened.
const IMPORT_FROM = /(?:^|[\s;})])(?:import|export)\s[^;'"`]{0,300}?\sfrom\s*(['"])([^'"\n]+)\1/g;
const IMPORT_BARE = /(?:^|[\s;})])import\s*(['"])([^'"\n]+)\1/g;
const IMPORT_DYN = /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g;
const RELATIVE_FILE = /(['"])(\.{1,2}\/[^'"\n]*?\.(?:mjs|js|json|cjs))\1/g;

/** Both specifier sets of one source, read off a comment-stripped copy so a path quoted in a comment is not an edge.
 * The stripper is nestingOnlyStripComments — this file's own reader, independent of BOTH readers under test, because
 * an instrument that shares the code it judges cannot report on it. */
export function moduleSpecifiers(text) {
  const src = nestingOnlyStripComments(String(text));
  const imports = new Set(); const candidates = new Set();
  for (const re of [IMPORT_FROM, IMPORT_BARE, IMPORT_DYN]) { re.lastIndex = 0; for (const m of src.matchAll(re)) imports.add(m[2]); }
  RELATIVE_FILE.lastIndex = 0; for (const m of src.matchAll(RELATIVE_FILE)) candidates.add(m[2]);
  return { imports: [...imports], candidates: [...candidates] };
}

/** The set of every path at a revision, read ONCE per revision. Existence is then a set membership test and not a
 * subprocess, which matters twice over: a per-path `git show` costs a fork per candidate, and — measured on this
 * machine, which is also the CI runner — under fork pressure it fails transiently with a status that is
 * indistinguishable from "the path is not in the tree". A tool that reports a failed subprocess as a measurement is
 * the GH-803 class; here it would have silently dropped a real dependency out of the mirror and re-created S5. */
const TREE_PATHS = new Map();
const treeEntries = (sha, repo) => {
  const key = `${repo}\u0000${sha}`;
  let t = TREE_PATHS.get(key);
  if (t) return t;
  const out = gitText(['ls-tree', '-r', '-z', sha], repo, `every path in the tree at ${sha}`);
  const paths = new Set(); const links = new Map();
  for (const rec of out.split('\u0000')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t'); if (tab < 0) continue;
    const rel = rec.slice(tab + 1); paths.add(rel);
    if (rec.slice(0, 6) === '120000') links.set(rel, undefined); // a SYMLINK entry: its blob is the target text, read on demand
  }
  t = { paths, links };
  TREE_PATHS.set(key, t);
  return t;
};
const treePaths = (sha, repo) => treeEntries(sha, repo).paths;
/** SYMLINKS, resolved IN THE TREE (GH-750 FIX4). `git ls-tree -r` lists a symlink as a LEAF blob, so every path
 * THROUGH one — `web/tools/render/lib/…`, the link `web/tools/render → ../../tools/render` — is absent from the
 * listing even though `import` resolves it on disk. That is not a curiosity here: cdp.mjs names its parser twice,
 * once by the real path and once through that very link, so an unresolved link makes the second specifier read as
 * a dependency this revision does not carry. Under the closure's own rules that is a hard error for an import and
 * a lost dependency for a candidate — the S5 defect one level down, in the instrument that was built to close S5.
 * The walk is bounded (8 hops) and restarts after each hop, because a link's target may itself pass through one. */
const linkTargetAt = (sha, repo, rel) => {
  const t = treeEntries(sha, repo);
  let target = t.links.get(rel);
  if (target === undefined) { target = gitText(['show', `${sha}:${rel}`], repo, `the target of the symlink ${rel}`).trim(); t.links.set(rel, target); }
  return target;
};
export function resolveTreePath(sha, rel, repo = REPO) {
  const t = treeEntries(sha, repo);
  const links = [];
  let parts = rel.split('/');
  for (let hops = 0; ; hops++) {
    if (hops > 8) return { real: null, links, why: `more than 8 symlink hops from ${rel}` };
    let hit = -1;
    for (let i = 0; i < parts.length; i++) { if (t.links.has(parts.slice(0, i + 1).join('/'))) { hit = i; break; } }
    if (hit === -1) { const real = parts.join('/'); return { real: t.paths.has(real) ? real : null, links }; }
    const at = parts.slice(0, hit + 1).join('/');
    const target = linkTargetAt(sha, repo, at);
    links.push({ path: at, target });
    if (hit === parts.length - 1 && !t.paths.has(path.posix.normalize(path.posix.join(path.posix.dirname(at), target)))) {
      // the link is the LAST component and its target is not a file in this tree: the caller asked for the link itself
      return { real: at, links: links.slice(0, -1) };
    }
    const re = path.posix.normalize(path.posix.join(path.posix.dirname(at), target));
    if (re.startsWith('..')) return { real: null, links, why: `${at} → ${target} escapes the repository root` };
    parts = [...re.split('/'), ...parts.slice(hit + 1)];
  }
}
/** Read a path that the tree says is THERE, following symlink components. A failure here is a broken git, never an
 * absent file, so it throws. Returns `{ text, real, links }`, or null when nothing in the tree answers to the path. */
const showAt = (sha, rel, repo) => {
  const r = resolveTreePath(sha, rel, repo);
  if (r.real === null) return null;
  try { return { text: gitText(['show', `${sha}:${r.real}`], repo, `the bytes of ${r.real} at ${sha}`), real: r.real, links: r.links }; }
  catch (e) {
    throw new Error(`js-scan-measure: reading ${sha}:${r.real} failed although the path IS in that tree. That is a failed `
      + 'read, not an absent file, and the two must not be confused — the mirror would silently lose a dependency. '
      + `Underlying: ${e.message}`);
  }
};

/** The transitive closure of repo files the reader modules need at `sha`: start from the seeds, follow every
 * module-relative specifier to a path that EXISTS at that revision, repeat to a fixed point. Two rules, and the
 * difference between them is the whole point of walking a graph instead of extending a copy list:
 *   - an IMPORT specifier that resolves to nothing at that revision is a hard error. The readers at that sha could
 *     not have run either, so a mirror that pretends otherwise is fiction;
 *   - a non-import candidate that resolves to nothing is a FALLBACK (cdp.mjs names two parser locations and expects
 *     exactly one to resolve), recorded by name and not copied.
 * A hardcoded second path would have fixed acorn and repeated S5 on the next vendored dependency. Every resolution
 * goes through resolveTreePath, so a specifier that reaches its target through a repository SYMLINK — which is how
 * cdp.mjs's second parser path resolves — is followed, and the links themselves are mirrored so the copy resolves
 * the way the repository does. */
export function mirrorClosure(sha, repo = REPO, seeds = READER_SEEDS) {
  const files = new Map(); const links = new Map(); const fallbacks = []; const queue = [...seeds];
  const note = (got) => { for (const l of got.links) links.set(l.path, l.target); };
  const asked = new Set();
  while (queue.length) {
    const rel = queue.shift();
    if (asked.has(rel)) continue;
    asked.add(rel);
    const got = showAt(sha, rel, repo);
    if (got === null) throw new Error(`js-scan-measure: ${sha} does not carry ${rel}, which the base readers' mirror needs`);
    note(got);
    if (files.has(got.real)) continue;       // keyed by the REAL path: one copy, however many links reach it
    files.set(got.real, got.text);
    if (!/\.(mjs|js|cjs)$/.test(got.real)) continue;
    const dir = path.posix.dirname(rel);     // specifiers resolve against the path the importer NAMES, links included
    const resolve = (spec) => path.posix.normalize(path.posix.join(dir, spec));
    const { imports, candidates } = moduleSpecifiers(got.text);
    for (const spec of imports) {
      if (!spec.startsWith('.')) continue;                       // node: builtins and bare packages are not mirrored
      const target = resolve(spec);
      if (target.startsWith('..')) throw new Error(`js-scan-measure: ${rel} at ${sha} imports ${spec}, which escapes the repository root`);
      const hit = showAt(sha, target, repo);
      if (hit === null) {
        throw new Error(`js-scan-measure: ${rel} at ${sha} imports ${spec} → ${target}, which does not exist at that revision; `
          + 'the mirror cannot be made to hold the readers that revision actually shipped');
      }
      note(hit); queue.push(target);
    }
    for (const spec of candidates) {
      const target = resolve(spec);
      if (target.startsWith('..')) continue;
      const hit = showAt(sha, target, repo);
      if (hit === null) { fallbacks.push(`${rel} names ${spec} → ${target}, absent at ${sha}`); continue; }
      note(hit); queue.push(target);
    }
  }
  return { sha, files: [...files.keys()].sort(), texts: files, links, fallbacks };
}

/** A source every revision of these readers must be able to read, used as the mirror's PRECONDITION check. It is
 * deliberately trivial — one line comment, one launch — so a failure here means the mirror is broken, never that the
 * base and the head disagree. Those two outcomes get told apart by name (GH-804: an arm that cannot distinguish "I
 * could not set up the test" from "the code is wrong" produces a verdict it has no standing to produce). */
const CANARY_BASE_NAME = 'CD' + 'P'; // spelled in pieces on purpose. Written whole, this file's own source would
// carry a port derivation to the BASE reader, and the tree-wide differential would report a row about its own
// instrument (derivesFromBase: base true, head false — measured). A measurement tool may not change what it measures.
const MIRROR_CANARY = `const a = 1; // x\nlaunch({ port: ${CANARY_BASE_NAME} + 25 });\n`;

/** Load web/tools/cdp.mjs + web/tools/lib/ci-bands.mjs AS THEY WERE at `sha`, together with their whole dependency
 * closure at that revision (mirrorClosure), and return both modules. The mirror is left under os.tmpdir().
 * Before returning, the readers are EXERCISED on MIRROR_CANARY: a mirror that loads but cannot read is the S5
 * defect, and it is invisible from the import alone because cdp.mjs catches its own parser-load failure and only
 * throws later, at the first read. */
export async function loadBaseReaders(sha = DEFAULT_BASE, repo = REPO) {
  if (gitRun(['cat-file', '-e', `${sha}^{commit}`], repo).status !== 0) {
    // fail CLOSED: a checkout that cannot see the base (a shallow CI clone, a git-init'd export without the object) must
    // not silently skip the differential — fetch the history (actions/checkout fetch-depth: 0) or the one object
    // (`git fetch <repo> ${sha}`) and re-run
    throw new Error(`js-scan-measure: base sha ${sha} is not reachable from ${repo} — the readers' differential needs it; `
      + 'fetch the history (fetch-depth: 0) or that one object and re-run');
  }
  const closure = mirrorClosure(sha, repo);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ob-js-scan-base-${sha}-`));
  for (const rel of closure.files) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, closure.texts.get(rel));
  }
  for (const [rel, target] of closure.links) { // the repository's own symlinks, so the mirror resolves the way the repository does
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (!fs.existsSync(abs)) fs.symlinkSync(target, abs);
  }
  const cdp = await import(pathToFileURL(path.join(dir, 'web/tools/cdp.mjs')).href);
  const cib = await import(pathToFileURL(path.join(dir, 'web/tools/lib/ci-bands.mjs')).href);
  let canary;
  try { canary = { strip: cdp.stripComments(MIRROR_CANARY), offset: cib.cdpOffsetsUsed(MIRROR_CANARY).maxOffset }; } catch (e) {
    throw new Error(`js-scan-measure: the mirror of ${sha} loaded but its readers cannot READ (${e.message}). `
      + `Mirrored ${closure.files.length} file(s): ${closure.files.join(', ')}. This is a broken instrument, not a `
      + 'disagreement between the base and the head — nothing may be concluded from a differential run against it.');
  }
  if (typeof canary.strip !== 'string' || canary.strip.length !== MIRROR_CANARY.length || canary.offset !== 25) {
    throw new Error(`js-scan-measure: the mirror of ${sha} reads its own canary wrongly (stripComments `
      + `${canary.strip?.length ?? 'n/a'} of ${MIRROR_CANARY.length} chars, cdpOffsetsUsed ${canary.offset} not 25) — `
      + 'the mirror is not the readers that revision shipped');
  }
  return { sha, dir, cdp, cib, closure: closure.files, links: [...closure.links].map(([p, t]) => `${p} → ${t}`), fallbacks: closure.fallbacks };
}

/** THE ONE-READER BASE the differential compares against: the base's TEXT reader rebased onto this checkout's
 * ci-bands LAWS. `base` is a loadBaseReaders() result.
 *
 * Comparing the base's whole ci-bands.mjs with the checkout's compares two law sets as well as two text readers, so
 * every law ci-bands.mjs gains after the base reads as a row the new text reader moved. MEASURED on the merge with
 * main 67855b4f: 33 rows in 5 files that exist only on main (the OB_LIGHTING pin names and per-prefix band pairing of
 * #727, the #737 spawn tokenizer), none of them GH-750's. Here there is ONE law module, the checkout's
 * web/tools/lib/ci-bands.mjs, loaded a second time beside a cdp.mjs that re-exports the base's cdp.mjs (stripComments
 * and everything else as they were at `base.sha`), the base's regex blankStrings (it lived in ci-bands.mjs there) and
 * a certificate that calls every source certified (the base had none). The two sides then differ by the text reader
 * alone, which is what GH-750 changed: a reader edit that moves a row reds the differential by name, a law edit moves
 * both sides alike and is the lint's own business. A name the checkout's ci-bands.mjs imports from cdp.mjs that the
 * base did not export fails this import loudly — decide which side it belongs to, never stub it here. */
export async function rebaseReadersOntoTree(base, repo = REPO) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ob-js-scan-rebased-${base.sha}-`));
  fs.mkdirSync(path.join(dir, 'web', 'tools', 'lib'), { recursive: true });
  for (const rel of ['web/tools/lib/ci-bands.mjs', 'web/tools/ci-bands.json', 'web/tools/lane-bands.json']) {
    fs.copyFileSync(path.join(repo, rel), path.join(dir, rel));
  }
  const at = (rel) => JSON.stringify(pathToFileURL(path.join(base.dir, rel)).href);
  fs.writeFileSync(path.join(dir, 'web', 'tools', 'cdp.mjs'), [
    `export * from ${at('web/tools/cdp.mjs')};`,
    `export { blankStrings } from ${at('web/tools/lib/ci-bands.mjs')};`,
    'export function jsScanCertificate() { return { certified: true, uncertified: null }; }',
    ''].join('\n'));
  const cdp = await import(pathToFileURL(path.join(dir, 'web', 'tools', 'cdp.mjs')).href);
  const cib = await import(pathToFileURL(path.join(dir, 'web', 'tools', 'lib', 'ci-bands.mjs')).href);
  // the rebase is real only if the text reader the laws now call IS the base's, function for function
  if (cdp.stripComments !== base.cdp.stripComments || cdp.blankStrings !== base.cib.blankStrings || cib.blankStrings !== base.cib.blankStrings) {
    throw new Error(`js-scan-measure: the rebased reader in ${dir} does not call the text reader of ${base.sha} — `
      + 'the differential would compare the checkout with itself');
  }
  return { sha: base.sha, dir, cdp, cib };
}

/** The reader issue #750 measured with: a stack for template nesting, otherwise
 * the base stripper's law, and still no regex mode. Kept verbatim because it is
 * the only reader that makes the seven hidden hygiene rows visible (the
 * evidence test) — neither the base nor the shipped reader does. */
export function nestingOnlyStripComments(text, { keepLineComments = false } = {}) {
  const src = String(text); const n = src.length; const k = new Uint8Array(n);
  const stack = [{ t: 'code', brace: 0 }]; let i = 0;
  while (i < n) {
    const top = stack[stack.length - 1]; const c = src[i]; const d = src[i + 1];
    if (top.t === 'code') {
      if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { k[i] = 1; i++; } continue; }
      if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const stop = e === -1 ? n : e + 2; while (i < stop) { k[i] = 2; i++; } continue; }
      if (c === "'" || c === '"' || c === '`') { stack.push({ t: c }); i++; continue; }
      if (c === '{' && stack.length > 1) top.brace++;
      else if (c === '}' && stack.length > 1) { if (top.brace === 0) { stack.pop(); i++; continue; } top.brace--; }
      i++; continue;
    }
    if (top.t === "'" || top.t === '"') {
      if (c === '\n') { stack.pop(); i++; continue; }
      if (c === '\\') { i += 2; continue; }
      if (c === top.t) stack.pop();
      i++; continue;
    }
    if (c === '\\') { i += 2; continue; }
    if (c === '`') { stack.pop(); i++; continue; }
    if (c === '$' && d === '{') { stack.push({ t: 'code', brace: 0 }); i += 2; continue; }
    i++;
  }
  let out = '';
  for (let j = 0; j < n; j++) {
    const c = src[j];
    if (c === '\n') { out += c; continue; }
    if (k[j] === 2) { out += ' '; continue; }
    if (k[j] === 1) { out += keepLineComments ? c : ' '; continue; }
    out += c;
  }
  return out;
}

const BASE_NAMES = '(?:CDP|CDP_PORT|CDPP|CDP0|CDP_BASE|cdp0|cdpPort|PORT|HTTP_PORT|http0|SERVE)';
const DERIV = new RegExp(`\\b${BASE_NAMES}\\s*\\+\\s*(?:\\(|\\d{1,3}\\b|[A-Za-z_$][\\w$]*)`, 'g');

/** Interpolation derivations: `${ … PORT + n … }` expressions in a source, read
 * off the shipped scanner's kinds (code at template depth). */
export function interpolationDerivations(text, head) {
  const src = String(text); const { kinds } = head.cdp.scanJsSource(src);
  const T = head.cdp.JS_SCAN.TEMPLATE; const exprs = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === '$' && src[i + 1] === '{' && (kinds[i] & T)) {
      let depth = 0; let j = i + 2;
      for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') { if (depth === 0) break; depth--; } }
      const body = src.slice(i + 2, j);
      if (DERIV.test(body)) exprs.push(body.trim().slice(0, 80));
      DERIV.lastIndex = 0;
      i = j + 1; continue;
    }
    i++;
  }
  return exprs;
}

/** Does a difference between two readings sit ONLY on a hashbang first line? */
const shebangOnly = (src, a, b) => src.startsWith('#!') && a.slice(a.indexOf('\n')) === b.slice(b.indexOf('\n'));

export async function measure({ base = DEFAULT_BASE, repo = REPO, files = null } = {}) {
  const B = await loadBaseReaders(base, repo);
  const H = { cdp: await import('./cdp.mjs'), cib: await import('./lib/ci-bands.mjs') };
  files = files ?? trackedSources(repo);
  const out = { base, head: gitText(['rev-parse', '--short', 'HEAD'], repo, 'the head this run measures').trim(),
    tree: gitText(['rev-parse', 'HEAD^{tree}'], repo, 'the tree this run measures').trim().slice(0, 12), // provenance: every artefact names the tree it was produced on
    dirty: gitText(['status', '--porcelain', '--', 'web/tools/cdp.mjs', 'web/tools/lib/ci-bands.mjs'], repo, 'whether either reader is edited in the worktree').trim() !== '',
    // B3: the differential must be able to PROVE it ran. `compared` counts sources both readers actually read;
    // `precondition` is the mirror's own setup result, reported separately from any disagreement it finds.
    compared: 0, nonPass: [], precondition: { base, mirrored: B.closure.length, files: B.closure, fallbacks: B.fallbacks, canary: 'read OK' },
    files: files.length, unreadable: [], stripNestingOnly: [], stripHead: [], stripHeadNoShebang: [], blankHead: [], blankHeadNoShebang: [], derivesFlips: [],
    interpFiles: [], interpExpressions: 0, interpOnlyFiles: [], fix1Differs: [] };
  // the FIX1 heuristic reader (f5262842) — the reading review round 2 reviewed — for the "what did the class cost" row.
  // A checkout without that object (a shallow clone) makes the row unavailable; that is NAMED here rather than swallowed,
  // because a row that silently reads 0 is indistinguishable from a row that measured 0 (GH-803).
  let F1 = null;
  try { F1 = await loadBaseReaders('f5262842', repo); }
  catch (e) { out.nonPass.push({ kind: 'instrument', text: `the FIX1 oracle f5262842 could not be loaded, so the "cost of the class" row measured NOTHING: ${e.message}` }); }
  for (const rel of files) {
    const t = fs.readFileSync(path.join(repo, rel), 'utf8');
    let sh;
    try { sh = H.cdp.stripComments(t); } catch (e) { out.unreadable.push(`${rel}: ${e.message}`); continue; } // FIX2: fail closed, counted
    const sb = B.cdp.stripComments(t); const sn = nestingOnlyStripComments(t);
    if (F1 && F1.cdp.blankStrings(F1.cdp.stripComments(t)) !== H.cdp.blankStrings(sh)) out.fix1Differs.push(rel);
    if (sb !== sn) out.stripNestingOnly.push(rel);
    if (sb !== sh) { out.stripHead.push(rel); if (!shebangOnly(t, sb, sh)) out.stripHeadNoShebang.push(rel); }
    const bb = B.cib.blankStrings(sb); const bh = H.cib.blankStrings(sh);
    if (bb !== bh) { out.blankHead.push(rel); if (!shebangOnly(t, bb, bh)) out.blankHeadNoShebang.push(rel); }
    const db = B.cib.derivesFromBase(t); const dh = H.cib.derivesFromBase(t);
    if (db !== dh) out.derivesFlips.push(`${rel}: ${db} → ${dh}`);
    const ex = interpolationDerivations(t, H);
    if (ex.length) { out.interpFiles.push(rel); out.interpExpressions += ex.length; if (!dh) out.interpOnlyFiles.push(rel); }
    out.compared++;
  }
  if (!out.compared) {
    out.nonPass.push({ kind: 'instrument', text: `the differential compared 0 of ${files.length} source(s) against ${base}: it produced no reading on `
      + 'either side, so it has agreed about nothing. A differential that silently compares nothing reads exactly like '
      + 'agreement — this line exists so it cannot.' });
  }
  // A SUBJECT non-pass, named as one. `unreadable` already had a table row, but a row in a table is not a non-pass, and a
  // reader who sees only "NON-PASS: none" above a table with entries in it has been told two different things. The kind is
  // what separates them: an INSTRUMENT non-pass says the comparison could not be set up and the verdict is void; a SUBJECT
  // non-pass says the comparison ran and this tracked source defeated the reader — a finding ABOUT the tree, which is the
  // FIX2 fail-closed law working, not the instrument failing. Only `instrument` clears `ok` (see measureReport).
  for (const u of out.unreadable) out.nonPass.push({ kind: 'subject', text: `a tracked source defeated the head reader and was not compared — ${u}` });
  return out;
}

/** The report as LINES plus a verdict, so the same thing a human reads is the thing a test asserts on. The precondition
 * is printed FIRST and always, pass or fail: an instrument that cannot tell "I could not set up the comparison" from
 * "the two sides disagree" produces a verdict it has no standing to produce (GH-804). Non-passes carry a KIND for the
 * same reason one level in — "the reader could not be constructed" and "this source defeats the reader" are different
 * facts with different owners, and only the first one voids the verdict. */
export function measureReport(r) {
  const lines = [];
  lines.push(`js-scan-measure PRECONDITION: mirror of ${r.precondition.base} = ${r.precondition.mirrored} file(s) `
    + `[${r.precondition.files.join(', ')}], canary ${r.precondition.canary}`
    + (r.precondition.fallbacks.length ? `; fallback path(s) not present at that revision: ${r.precondition.fallbacks.join('; ')}` : ''));
  lines.push(`js-scan-measure COMPARED: ${r.compared} of ${r.files} tracked source(s) read by BOTH readers`);
  if (r.nonPass.length) lines.push('js-scan-measure NON-PASS KINDS: [instrument] the comparison could not be set up, so the '
    + 'verdict is void; [subject] the comparison ran and a tracked source defeated the reader, which is a finding about the tree');
  for (const n of r.nonPass) lines.push(`js-scan-measure NON-PASS [${n.kind}]: ${n.text}`);
  return { lines, ok: !r.nonPass.some((n) => n.kind === 'instrument') && r.compared > 0 };
}

const main = async () => {
  const argv = process.argv.slice(2);
  const base = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : DEFAULT_BASE;
  const r = await measure({ base });
  const report = measureReport(r);
  if (argv.includes('--json')) { console.log(JSON.stringify({ ...r, report: report.lines, ok: report.ok }, null, 1)); if (!report.ok) process.exitCode = 2; return; }
  for (const l of report.lines) console.log(l);
  console.log(`js-scan-measure: base ${r.base} vs head ${r.head} (tree ${r.tree})${r.dirty ? ' (readers DIRTY in the working tree)' : ''}, ${r.files} tracked sources\n`);
  console.log('| reading | files that differ | note |\n|---|---|---|');
  console.log(`| stripComments, nesting-only reader (the issue's) vs base | ${r.stripNestingOnly.length} | |`);
  console.log(`| stripComments, head vs base | ${r.stripHead.length} | ${r.stripHeadNoShebang.length} excluding shebang-only |`);
  console.log(`| blankStrings(stripComments), head vs base | ${r.blankHead.length} | ${r.blankHeadNoShebang.length} excluding shebang-only |`);
  console.log(`| derivesFromBase verdict flips | ${r.derivesFlips.length} | ${r.derivesFlips.join('; ') || '—'} |`);
  console.log(`| interpolation derivations | ${r.interpExpressions} expressions in ${r.interpFiles.length} files | ${r.interpOnlyFiles.length} file(s) carry one ONLY inside an interpolation${r.interpOnlyFiles.length ? ': ' + r.interpOnlyFiles.join(', ') : ''} |`);
  console.log(`| unreadable sources (FIX2 fail-closed law) | ${r.unreadable.length} | ${r.unreadable.join('; ') || 'every tracked source parses'} |`);
  console.log(`| FIX1 heuristic reader (f5262842) vs the tokenizer, blankStrings(stripComments) | ${r.fix1Differs.length} | ${r.fix1Differs.length ? r.fix1Differs.join(', ') : (r.fix1Differs.length === 0 && 'identical on every tracked source')} |`);
  console.log(`\nstrip nesting-only vs base (${r.stripNestingOnly.length}):\n  ${r.stripNestingOnly.join('\n  ')}`);
  console.log(`\ninterpolation-derivation files (${r.interpFiles.length}):\n  ${r.interpFiles.join('\n  ')}`);
  if (!report.ok) process.exitCode = 2; // a run that compared nothing, or named a non-pass, must not exit 0
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
