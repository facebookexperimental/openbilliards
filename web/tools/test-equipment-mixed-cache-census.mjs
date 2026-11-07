#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-equipment-mixed-cache-census — the #789 mixed-cache equipment census, as a gate.
//
// #789 renamed the internal equipment ids (table / cloth / ballset / cue) behind rename twins
// (web/scene/equipmentalias.js TABLE_RENAMES; the catalog superseded_by for the other axes). The
// service worker can serve a mix of fresh and stale modules, so every entry point that consumes an
// equipment id has one behavior per cache column:
//   FRESH  every module, the SDK catalog and the kernel are current
//   S1     a stale pre-#789 SDK catalog (web/dist/pool-sdk)
//   S2     the archived kernel wasm b6b5dc3f, which lacks the new ids
//   S3     a pre-v20 web/scene/table.js (TABLE_SPECS lacks the new ids)
//   S4     saved pre-rename ids in settings storage
// The census (web/tools/fixtures/equipment-mixed-cache-census.json) records one row per entry point
// E1..E27, its call sites, and per column the gate, the expected behavior, the disclosure and either
// the tests that pin it or an open status. Before this file the census was prose, and a cell could go
// unpinned, or a call site could move out from under its citation, with every gate green.
//
// DIGEST SUB-CELLS. A retired id the catalog keeps only as a digest row (web/scene/equipmentalias.js)
// meets the S1/S2/S3 siblings through other code than a renamed id does, so an S1, S2 or S3 cell may
// carry an optional "digest" sub-cell: the same fields as a cell, judged by the same checks (status,
// RED, NO_TEST, NO_ISSUE, CASE_ABSENT, FILE_ABSENT, NA_NO_REASON, BROWSER_ONLY, PENDING_ISSUE). Where the
// digest behavior differs by save era, "digest" is an array of such sub-cells, each naming its "era".
// A digest sub-cell on FRESH or S4 is a SHAPE failure. Sub-cells are counted apart from the cells: the
// totals line prints the cell counts, then the digest sub-cell counts after "digest sub-cells".
//
// THE ASSERTION. The gate is red when:
//   RED           a cell has status "red": no pinning test yet, and not accepted for a follow-up
//   NO_TEST       a "green" cell lists no test reference
//   NO_ISSUE      a "red-accepted" cell names no issue
//   CASE_ABSENT   a test reference's case id has no DEFINING occurrence in its file (below)
//   FILE_ABSENT   a cited file (call site or test reference) does not exist at the rev
//   ANCHOR_ABSENT a call site's line span [start, end] no longer contains its anchor token
//   NA_NO_REASON  an "n/a" cell gives no reason
//   SHAPE         the rows are not exactly E1..E27, a row lacks a column, a status is unknown, or a digest
//                 sub-cell sits on FRESH/S4 (or, in an era array, names no era)
//   BROWSER_ONLY  a "green" cell whose every test reference is a browser suite (see below)
//   PENDING_ISSUE (--strict only) a "red-accepted" cell whose issue is still the FOLLOWUP-PENDING placeholder
// A browser suite is a test file named e2e-*.mjs, or one whose own text reaches the Chrome launcher
// (the launcher helper, cdp.mjs, puppeteer; the helper name is spelled as a character class below so
// this node gate's own text never reads as a launcher). A cell pinned only by browser suites is not green here: it carries
// status "browser-pinned" (pinned only by a browser suite, which runs in a real browser outside this
// node gate, so this gate can check that the cited case exists but never runs it) and a "browser_run"
// field naming that suite; it is counted on its own and needs its test references (NO_TEST) like a
// green cell.
// The status tokens this gate reads: "green", "browser-pinned", "red", "red-accepted" (open, and
// accepted for a tracked follow-up issue) and "n/a"; the issue placeholder token is FOLLOWUP-PENDING.
// A case id is a literal string that the pinning test prints or declares (an L80 report id template
// such as `L80d ${k}`, an e2e check/fail message prefix, a scenario row's key). A DEFINING occurrence
// is one inside a string or template literal of the file's code (the file is lexed with the vendored
// acorn tokenizer) that sits in a REGISTRATION position: the leading literal of the first argument
// of a check / report / fail / test / it call, or the first element of an array literal (the
// scenario rows `['L83 E16 S4', 'title', ...]`). It must not be an element of a drift plant's
// `expected: [...]` array, and it must be bounded: the character before it is not an identifier
// character, and after it the literal ends, holds only whitespace, or goes on with a character
// that is neither an identifier character nor a space followed by one (so 'L82q S4' is not found
// inside 'L82q S4 settings'). A comment, a helper declaration, a call in code, another case's
// description that quotes the id, and the plant list that expects it never define a case: each of
// those survives the deletion of the case it names. A renamed or deleted case turns the cell red. The profile names a cell lists next to an L80 case ("K P2") are composed at run time by
// that suite and are informational here.
//
// PENDING-ISSUE. A red-accepted cell's issue may be the placeholder FOLLOWUP-PENDING until the
// follow-up issue is filed and its number is substituted; every run prints how many remain. --strict fails (exit 1) while any remains;
// the default mode reports them and keeps exit 0.
//
// Read-only. Every cited file is read with `git show <rev>:<path>` (the committed tree, not the
// worktree), as tools/check-provenance-tags.mjs does; the fixture itself is read from the working
// tree. The disclosure line printed on every run says which rev was read.
//
// Usage: node web/tools/test-equipment-mixed-cache-census.mjs [--rev <rev>] [--strict] [--selftest]
//   --rev <rev> other than HEAD is full-history-only (a depth-1 checkout holds HEAD alone); the default
//   is HEAD, which tools/check-test-history-reads.mjs relies on for this file's head-rev exemption.
//   exit 0 = every cell pinned, accepted or n/a; 1 = ran, and it is red; 2 = could not run.
//   --strict also fails on every FOLLOWUP-PENDING placeholder issue.
//   --selftest plants each failure mode on a copy of the fixture whose open cells are accepted (the
//   control, which must pass) and requires every plant to raise exactly its own failure code; the
//   case-evasion plants serve synthetic suite texts, and each pass arm must stay green.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE_REL = 'web/tools/fixtures/equipment-mixed-cache-census.json';
const COLUMNS = ['FRESH', 'S1', 'S2', 'S3', 'S4'];
const STATUSES = ['green', 'browser-pinned', 'red', 'red-accepted', 'n/a'];
const ROW_IDS = Array.from({ length: 27 }, (_, i) => `E${i + 1}`);
const DIGEST_COLUMNS = ['S1', 'S2', 'S3'];
const PLACEHOLDER = 'FOLLOWUP-PENDING';

const argv = process.argv.slice(2);
const revArg = argv.indexOf('--rev');
const REV = revArg >= 0 ? argv[revArg + 1] : 'HEAD';
const SELFTEST = argv.includes('--selftest');
const STRICT = argv.includes('--strict');
const known = new Set(['--rev', '--selftest', '--strict']);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--rev') { i++; continue; }
  if (!known.has(argv[i])) {
    process.stdout.write(`test-equipment-mixed-cache-census: unknown argument ${argv[i]}\n`);
    process.exit(2);
  }
}

function git(args) {
  return execFileSync('git', ['-C', ROOT, ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
}

let revSha;
try {
  revSha = git(['rev-parse', '--verify', '--quiet', `${REV}^{commit}`]).trim();
} catch {
  process.stdout.write(`test-equipment-mixed-cache-census: rev ${REV} does not exist under ${ROOT}`
    + ' - refusing to report on a tree that was never read\n');
  process.exit(2);
}

/** A reader of `git show <sha>:<path>`: the file's lines, or null when the path is absent there. */
function makeReader(sha) {
  const cache = new Map();
  return (path) => {
    if (!cache.has(path)) {
      let lines = null;
      try { lines = git(['show', `${sha}:${path}`]).split('\n'); } catch { lines = null; }
      cache.set(path, lines);
    }
    return cache.get(path);
  };
}

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

let acorn;
try {
  acorn = await import(pathToFileURL(join(ROOT, 'tools', 'render', 'lib', 'vendor', 'acorn', 'acorn.mjs')).href);
} catch (e) {
  process.stdout.write(`test-equipment-mixed-cache-census: cannot load the vendored acorn tokenizer: ${e.message}\n`);
  process.exit(2);
}

/** The string and template literals of a file's code: [{ text, inExpected, reg }], or null when it does not lex. `text`
 * is the literal's source between its quotes (a template's `${...}` parts verbatim); `inExpected` marks a literal inside
 * an `expected: [...]` array (a drift plant's expected failing set); `reg` marks a literal in a registration position
 * (registrationAt). Comments are never literals. */
const literalCache = new WeakMap();
function literalsOf(lines) {
  if (literalCache.has(lines)) return literalCache.get(lines);
  const src = lines.join('\n');
  const tt = acorn.tokTypes;
  const out = [];
  try {
    const ctxStack = []; // 'tpl' (inside a template's text), 'expr' (a ${ } part), '{' (a block or object)
    const tplStart = [];
    let brackets = 0; let expectedAt = null; let p1 = null; let p2 = null;
    for (const tok of acorn.tokenizer(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowReturnOutsideFunction: true })) {
      const inExpected = expectedAt !== null;
      if (tok.type === tt.string) out.push({ text: src.slice(tok.start + 1, tok.end - 1), value: tok.value, inExpected, reg: registrationAt(p1, p2) });
      else if (tok.type === tt.backQuote) {
        if (ctxStack.at(-1) === 'tpl') {
          ctxStack.pop(); const st = tplStart.pop();
          out.push({ text: src.slice(st.start + 1, tok.end - 1), value: null, inExpected, reg: st.reg });
        } else { ctxStack.push('tpl'); tplStart.push({ start: tok.start, reg: registrationAt(p1, p2) }); }
      } else if (tok.type === tt.dollarBraceL) ctxStack.push('expr');
      else if (tok.type === tt.braceL) ctxStack.push('{');
      else if (tok.type === tt.braceR) ctxStack.pop();
      else if (tok.type === tt.bracketL) {
        brackets += 1;
        if (expectedAt === null && p1?.type === tt.colon && p2?.type === tt.name && p2.value === 'expected') expectedAt = brackets;
      } else if (tok.type === tt.bracketR) {
        if (expectedAt === brackets) expectedAt = null;
        brackets -= 1;
      }
      p2 = p1; p1 = tok;
    }
  } catch { literalCache.set(lines, null); return null; }
  literalCache.set(lines, out);
  return out;
}

// The callees whose first argument names a case: the suites' report/check/fail printers and a test runner's test/it.
const REGISTRARS = new Set(['check', 'report', 'fail', 'test', 'it']);
/** Is a literal whose two preceding tokens are p1, p2 (nearest first) in a registration position? Either the
 * leading token of a registrar call's first argument (`check('L99 S1 ' + x)`: p1 the open paren, p2 the callee name), or
 * the first element of an array literal (a scenario row `['L99 S1', 'title', ...]`: p1 an open bracket that p2 does not
 * turn into a subscript). A string anywhere else, such as a case description that quotes another case's id, never is. */
function registrationAt(p1, p2) {
  const tt = acorn.tokTypes;
  if (!p1) return false;
  if (p1.type === tt.parenL) return p2?.type === tt.name && REGISTRARS.has(p2.value);
  if (p1.type !== tt.bracketL) return false;
  const subscript = p2 && (p2.type === tt.name || p2.type === tt.parenR || p2.type === tt.bracketR || p2.type === tt.string
    || p2.type === tt.num || p2.type === tt.backQuote || p2.type === tt.questionDot);
  return !subscript;
}

const ID_CHAR = /[A-Za-z0-9_$]/;
/** Is `c` present in `s` with bounded ends (not the prefix or suffix of a longer id)? */
function boundedIn(s, c) {
  for (let i = s.indexOf(c); i >= 0; i = s.indexOf(c, i + 1)) {
    const before = i === 0 ? '' : s[i - 1];
    const rest = s.slice(i + c.length);
    const leftOk = !before || !ID_CHAR.test(before);
    const rightOk = !rest.trim() || (!ID_CHAR.test(rest[0]) && !(rest[0] === ' ' && ID_CHAR.test(rest[1] ?? '')));
    if (leftOk && rightOk) return true;
  }
  return false;
}

/** Where does the case id occur: 'defining', or why not ('in-expected', 'prefix', 'unregistered', 'not-literal', 'absent',
 * 'unlexable'). */
function caseOccurrence(lines, c) {
  if (!lines.join('\n').includes(c)) return 'absent';
  const lits = literalsOf(lines);
  if (!lits) return 'unlexable';
  const has = (l) => l.text.includes(c) || (typeof l.value === 'string' && l.value.includes(c));
  const bounded = (l) => boundedIn(l.text, c) || (typeof l.value === 'string' && boundedIn(l.value, c));
  if (lits.some((l) => !l.inExpected && l.reg && has(l) && bounded(l))) return 'defining';
  if (lits.some((l) => !l.inExpected && l.reg && has(l))) return 'prefix';
  if (lits.some((l) => !l.inExpected && has(l))) return 'unregistered';
  if (lits.some((l) => l.inExpected && has(l))) return 'in-expected';
  return 'not-literal';
}
const OCCURRENCE_WHY = {
  absent: 'is not present',
  unlexable: 'cannot be judged: the file does not lex',
  prefix: 'occurs in a literal only as part of a longer id',
  unregistered: 'occurs only in a literal that registers no case (not a check/report/fail/test/it call\'s first argument, not a scenario row\'s first element)',
  'in-expected': 'occurs only in a drift plant\'s expected array',
  'not-literal': 'occurs only outside a string literal (a comment, a declaration or code)',
};

/** Is the cited test file a browser suite (its name, or its own text reaching the Chrome launcher)? */
function isBrowserSuite(file, lines) {
  if (/(^|\/)e2e-[^/]*\.mjs$/.test(file)) return true;
  return !!lines && /launch[C]hrome|cdp\.mjs|puppeteer/.test(lines.join('\n'));
}

/** Judge a census object against a reader. Returns { failures: [{ code, where, msg }], counts, digestCounts, red, pending }
 * (red and pending list cells and digest sub-cells alike). */
function judge(fx, read, { strict = false } = {}) {
  const failures = [];
  const fail = (code, where, msg) => failures.push({ code, where, msg });
  const counts = { cells: 0, green: 0, 'browser-pinned': 0, red: 0, 'red-accepted': 0, 'n/a': 0, pending: 0 };
  const digestCounts = { ...counts };
  const red = [];
  const pending = [];
  const rows = Array.isArray(fx?.rows) ? fx.rows : [];
  const ids = rows.map((r) => r?.id);
  if (ids.join(',') !== ROW_IDS.join(',')) {
    fail('SHAPE', 'rows', `rows must be exactly ${ROW_IDS[0]}..${ROW_IDS[ROW_IDS.length - 1]} in order, got [${ids.join(', ')}]`);
  }
  const checkRef = (where, t) => {
    if (!t || !nonEmpty(t.file) || !nonEmpty(t.case)) {
      fail('SHAPE', where, 'a test reference needs a file and a case id string');
      return;
    }
    const lines = read(t.file);
    if (!lines) { fail('FILE_ABSENT', where, `test file ${t.file} does not exist at the rev`); return; }
    const occ = caseOccurrence(lines, t.case);
    if (occ !== 'defining') {
      fail('CASE_ABSENT', where, `case id ${JSON.stringify(t.case)} ${OCCURRENCE_WHY[occ]} in ${t.file} (no defining occurrence)`);
    }
  };
  /** Judge one cell, or one digest sub-cell, into `cnt` (the cell counts or the digest sub-cell counts). */
  const judgeCell = (where, c, cnt) => {
    cnt.cells++;
    if (!STATUSES.includes(c.status)) { fail('SHAPE', where, `unknown status ${JSON.stringify(c.status)}`); return; }
    cnt[c.status]++;
    const tests = Array.isArray(c.tests) ? c.tests : [];
    tests.forEach((t, i) => checkRef(`${where} test[${i}]`, t));
    if (c.status === 'green' || c.status === 'browser-pinned') {
      if (!tests.length) fail('NO_TEST', where, `a ${c.status} cell lists no pinning test`);
      if (!nonEmpty(c.gate) || !nonEmpty(c.expected)) fail('SHAPE', where, `a ${c.status} cell needs a gate and an expected behavior`);
      if (c.status === 'browser-pinned' && !nonEmpty(c.browser_run)) fail('SHAPE', where, 'a browser-pinned cell names no browser_run (the browser suite that pins it)');
      const valid = tests.filter((t) => t && nonEmpty(t.file) && read(t.file));
      if (c.status === 'green' && tests.length && valid.length === tests.length && valid.every((t) => isBrowserSuite(t.file, read(t.file)))) {
        fail('BROWSER_ONLY', where, `every pin is a browser suite (${[...new Set(valid.map((t) => t.file))].join(', ')}): status browser-pinned with a browser_run, or a node test`);
      }
    } else if (c.status === 'red') {
      red.push(where);
      fail('RED', where, `no pinning test and not accepted: ${c.why ?? '(no reason recorded)'}`);
    } else if (c.status === 'red-accepted') {
      if (!nonEmpty(c.issue)) fail('NO_ISSUE', where, 'a red-accepted cell names no issue');
      else if (c.issue.includes(PLACEHOLDER)) {
        cnt.pending++; pending.push(where);
        if (strict) fail('PENDING_ISSUE', where, `the issue is still the ${PLACEHOLDER} placeholder (--strict)`);
      }
    } else if (!nonEmpty(c.reason)) {
      fail('NA_NO_REASON', where, 'an n/a cell gives no reason');
    }
  };
  for (const r of rows) {
    const rid = r?.id ?? '?';
    if (!nonEmpty(r?.name)) fail('SHAPE', rid, 'row has no name');
    const sites = Array.isArray(r?.call_sites) ? r.call_sites : [];
    if (!sites.length) fail('SHAPE', rid, 'row lists no call site');
    for (const s of sites) {
      const [path, start, end, token] = Array.isArray(s) ? s : [];
      const where = `${rid} ${path}:${start}-${end}`;
      if (!nonEmpty(path) || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start
        || !nonEmpty(token)) {
        fail('SHAPE', where, 'a call site is [path, start, end, anchor token] with 1 <= start <= end');
        continue;
      }
      const lines = read(path);
      if (!lines) { fail('FILE_ABSENT', where, `${path} does not exist at the rev`); continue; }
      const span = lines.slice(start - 1, end).join('\n');
      if (!span.includes(token)) {
        const at = [];
        lines.forEach((l, i) => { if (l.includes(token)) at.push(i + 1); });
        fail('ANCHOR_ABSENT', where, `anchor ${JSON.stringify(token)} is not in the span`
          + (at.length ? ` (found at line ${at.slice(0, 5).join(', ')})` : ' (absent from the file)'));
      }
    }
    const cells = r?.cells && typeof r.cells === 'object' ? r.cells : {};
    for (const col of COLUMNS) {
      const where = `${rid}.${col}`;
      const c = cells[col];
      if (!c || typeof c !== 'object') { fail('SHAPE', where, 'missing column'); continue; }
      judgeCell(where, c, counts);
      if (c.digest === undefined) continue;
      if (!DIGEST_COLUMNS.includes(col)) { fail('SHAPE', `${where}.digest`, `a digest sub-cell sits on ${DIGEST_COLUMNS.join('/')} only`); continue; }
      const subs = Array.isArray(c.digest) ? c.digest : [c.digest];
      if (!subs.length) fail('SHAPE', `${where}.digest`, 'an empty digest era array');
      subs.forEach((d, i) => {
        const dWhere = Array.isArray(c.digest) ? `${where}.digest[${nonEmpty(d?.era) ? d.era : i}]` : `${where}.digest`;
        if (!d || typeof d !== 'object' || Array.isArray(d)) { fail('SHAPE', dWhere, 'a digest sub-cell is an object'); return; }
        if (Array.isArray(c.digest) && !nonEmpty(d.era)) fail('SHAPE', dWhere, 'a digest sub-cell in an era array names no era');
        if (d.digest !== undefined) fail('SHAPE', dWhere, 'a digest sub-cell carries no digest sub-cell of its own');
        judgeCell(dWhere, d, digestCounts);
      });
    }
    for (const k of Object.keys(cells)) {
      if (!COLUMNS.includes(k)) fail('SHAPE', `${rid}.${k}`, 'unknown column');
    }
  }
  return { failures, counts, digestCounts, red, pending };
}

const countsLine = (c, unit = 'cells') => `${unit} ${c.cells}, green ${c.green}, browser-pinned ${c['browser-pinned']}, red ${c.red}, red-accepted ${c['red-accepted']}, n/a ${c['n/a']}`;
const pendingLine = (p) => `PENDING-ISSUE ${p.length} (red-accepted cells whose issue is the ${PLACEHOLDER} placeholder${p.length ? `: ${p.join(', ')}` : ''})`;

function loadFixture() {
  return JSON.parse(readFileSync(join(ROOT, FIXTURE_REL), 'utf8'));
}

function disclose() {
  process.stdout.write(`test-equipment-mixed-cache-census: cited files read with git show ${REV}:<path>`
    + ` (${revSha.slice(0, 12)}; the committed tree, not the worktree); fixture ${FIXTURE_REL} read from the working tree\n`);
}

function main() {
  let fx;
  try { fx = loadFixture(); } catch (e) {
    process.stdout.write(`test-equipment-mixed-cache-census: cannot read ${FIXTURE_REL}: ${e.message}\n`);
    process.exit(2);
  }
  disclose();
  const { failures, counts, digestCounts, red, pending } = judge(fx, makeReader(revSha), { strict: STRICT });
  const byCode = {};
  for (const f of failures) {
    if (f.code !== 'RED') process.stdout.write(`FAIL ${f.code} ${f.where}: ${f.msg}\n`);
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }
  if (red.length) process.stdout.write(`red cells (${red.length}): ${red.join(', ')}\n`);
  process.stdout.write(`failures by code: ${JSON.stringify(byCode)}\n`);
  process.stdout.write(`${pendingLine(pending)}${STRICT ? '; --strict: each is a failure' : '; default mode: reported, not a failure (--strict fails on them)'}\n`);
  const verdict = failures.length ? 'RED' : 'GREEN';
  process.stdout.write(`census: ${countsLine(counts)}; ${countsLine(digestCounts, 'digest sub-cells')} -> ${verdict}\n`);
  process.exit(failures.length ? 1 : 0);
}

function selftest() {
  let base;
  try { base = loadFixture(); } catch (e) {
    process.stdout.write(`selftest: cannot read ${FIXTURE_REL}: ${e.message}\n`);
    process.exit(2);
  }
  disclose();
  const read = makeReader(revSha);
  // The control: the real census with every open cell accepted. It must pass, or no plant can
  // prove anything (a plant that fails on an already-failing fixture fired on nothing).
  const control = structuredClone(base);
  const digestsOf = (c) => (c?.digest === undefined ? [] : [c.digest].flat());
  for (const r of control.rows) {
    for (const col of COLUMNS) {
      for (const c of [r.cells[col], ...digestsOf(r.cells[col])]) {
        if (c?.status === 'red') { c.status = 'red-accepted'; c.issue = 'SELFTEST-CONTROL'; }
      }
    }
  }
  const find = (fx, pred) => {
    for (const r of fx.rows) for (const col of COLUMNS) if (pred(r.cells[col])) return r.cells[col];
    throw new Error('selftest: no cell matches a plant precondition');
  };
  const findDigest = (fx, pred) => {
    for (const r of fx.rows) for (const col of DIGEST_COLUMNS) for (const d of digestsOf(r.cells[col])) if (pred(d)) return d;
    throw new Error('selftest: no digest sub-cell matches a plant precondition');
  };
  const withTests = (c) => c?.status === 'green' && c.tests?.length;
  const SYN_FILE = 'web/tools/selftest-synthetic-suite.mjs';
  const SYN_CASE = 'L99 selftest S1';
  const synth = (fx, c, text) => { find(fx, withTests).tests = [{ file: SYN_FILE, case: c }]; return { files: { [SYN_FILE]: text.split('\n') } }; };
  // a plant's reader: the rev's files, with the plant's synthetic or edited texts in front
  const readWith = (files) => (path) => (files && Object.hasOwn(files, path) ? files[path] : read(path));
  const absentCase = `selftest-absent-case-${'x'.repeat(8)}-${Date.now().toString(36)}`;
  const plants = [
    ['no-pinning-test', 'NO_TEST', (fx) => { find(fx, withTests).tests = []; }],
    ['open-red-cell', 'RED', (fx) => { const c = find(fx, withTests); c.status = 'red'; c.why = 'selftest'; }],
    ['accepted-without-issue', 'NO_ISSUE', (fx) => { delete find(fx, (c) => c?.status === 'red-accepted').issue; }],
    ['accepted-blank-issue', 'NO_ISSUE', (fx) => { find(fx, (c) => c?.status === 'red-accepted').issue = '  '; }],
    ['case-id-absent', 'CASE_ABSENT', (fx) => { find(fx, withTests).tests[0].case = absentCase; }],
    ['test-file-absent', 'FILE_ABSENT', (fx) => { find(fx, withTests).tests[0].file = 'web/tools/selftest-no-such-suite.mjs'; }],
    ['anchor-token-absent', 'ANCHOR_ABSENT', (fx) => { fx.rows[0].call_sites[0][3] = absentCase; }],
    ['span-moved-off-anchor', 'ANCHOR_ABSENT', (fx) => {
      const s = fx.rows[8].call_sites[0];
      s[1] = 1; s[2] = 1; // line 1 of the scene module never holds the prepareEquipment anchor
    }],
    ['call-site-file-absent', 'FILE_ABSENT', (fx) => { fx.rows[0].call_sites[0][0] = 'web/app/selftest-no-such-module.js'; }],
    ['na-without-reason', 'NA_NO_REASON', (fx) => { delete find(fx, (c) => c?.status === 'n/a').reason; }],
    ['missing-row', 'SHAPE', (fx) => { fx.rows.splice(23, 1); }],
    ['missing-column', 'SHAPE', (fx) => { delete fx.rows[3].cells.S3; }],
    ['unknown-status', 'SHAPE', (fx) => { find(fx, withTests).status = 'pinned'; }],
    // a digest sub-cell is judged like a cell: an open red one fails the gate though its parent cell is green
    ['digest-subcell-red', 'RED', (fx) => { const d = findDigest(fx, withTests); d.status = 'red'; d.why = 'selftest'; }],
    // the digest sub-cell shape: never on FRESH/S4, never an empty era array, an era per array element, never nested
    ['digest-on-FRESH', 'SHAPE', (fx) => { fx.rows[0].cells.FRESH.digest = structuredClone(findDigest(fx, withTests)); }],
    ['digest-empty-era-array', 'SHAPE', (fx) => { find(fx, (c) => c?.digest !== undefined).digest = []; }],
    ['digest-missing-era', 'SHAPE', (fx) => { delete find(fx, (c) => Array.isArray(c?.digest) && c.digest.length).digest[0].era; }],
    ['digest-nested', 'SHAPE', (fx) => { const d = findDigest(fx, withTests); d.digest = structuredClone(d); }],
    // a digest sub-cell's pins are checked like a cell's
    ['digest-case-absent', 'CASE_ABSENT', (fx) => { findDigest(fx, withTests).tests[0].case = absentCase; }],
    ['digest-no-test', 'NO_TEST', (fx) => { findDigest(fx, withTests).tests = []; }],
    ['green-browser-only', 'BROWSER_ONLY', (fx) => { find(fx, (c) => c?.status === 'browser-pinned').status = 'green'; }],
    ['browser-pinned-without-test', 'NO_TEST', (fx) => { find(fx, (c) => c?.status === 'browser-pinned').tests = []; }],
    ['browser-pinned-without-browser-run', 'SHAPE', (fx) => { delete find(fx, (c) => c?.status === 'browser-pinned').browser_run; }],
    // the three case evasions, each on a synthetic suite text: the cited id survives only where a deleted case leaves it
    ['case-only-in-plant-expected', 'CASE_ABSENT', (fx) => synth(fx, SYN_CASE,
      "const plants = [\n  { name: 'p', anchor: 'a', replacement: 'b', expected: ['L99 selftest S1', 'L99 selftest S2'] },\n];\n")],
    ['case-only-in-comment', 'CASE_ABSENT', (fx) => synth(fx, SYN_CASE, '// L99 selftest S1: a case the suite no longer runs\n/* L99 selftest S1 */\nconst x = 1;\n')],
    ['case-only-as-prefix', 'CASE_ABSENT', (fx) => synth(fx, SYN_CASE, "report('L99 selftest S1 settings', true);\nreport(`L99 selftest S1x ${k}`, true);\n")],
    ['case-only-in-code', 'CASE_ABSENT', (fx) => synth(fx, 'async function switchL99(axis, id)', 'async function switchL99(axis, id) { return axis + id; }\n')],
    // a deleted case whose id another case's description still quotes (a bounded literal, but a row's second element)
    ['case-only-in-description', 'CASE_ABSENT', (fx) => synth(fx, SYN_CASE,
      "const rows = [\n  ['L99 selftest S2', 'a scene that substitutes (L99 selftest S1): refused', async () => ''],\n];\ncheck('L99 other', true);\n")],
    // the same id as a plain argument of a call that registers nothing
    ['case-only-in-other-call', 'CASE_ABSENT', (fx) => synth(fx, SYN_CASE, "if (process.argv.includes('L99 selftest S1')) run();\n")],
    // the real suite with one scenario's defining line deleted: its id still occurs in the drift plants' expected arrays
    // the real suite with the 'L81 readback' row deleted: another case's description still quotes '(L81 readback)'
    ['real-case-deleted-kept-in-description', 'CASE_ABSENT', (fx, rd) => {
      const file = 'web/tools/test-ballreturn-lifecycle.mjs'; const c = 'L81 readback';
      const lines = rd(file);
      const at = lines.findIndex((l) => l.includes(`['${c}',`));
      if (at < 0) throw new Error(`selftest: no defining line for ${c}`);
      const cut = [...lines.slice(0, at), ...lines.slice(at + 1)];
      if (!cut.some((l) => l.includes(`(${c})`) && !l.includes('expected'))) throw new Error(`selftest: no description quotes (${c}) (the evasion is not reachable)`);
      find(fx, withTests).tests = [{ file, case: c }];
      return { files: { [file]: cut } };
    }],
    ['real-case-deleted-kept-in-expected', 'CASE_ABSENT', (fx, rd) => {
      const file = 'web/tools/test-ballreturn-lifecycle.mjs'; const c = 'L83 E4 S3';
      const lines = rd(file);
      const at = lines.findIndex((l) => l.includes(`['${c}',`));
      if (at < 0) throw new Error(`selftest: no defining line for ${c}`);
      const cut = [...lines.slice(0, at), ...lines.slice(at + 1)];
      if (!cut.join('\n').includes(c)) throw new Error(`selftest: ${c} is gone with its defining line (the evasion is not reachable)`);
      find(fx, withTests).tests = [{ file, case: c }];
      return { files: { [file]: cut } };
    }],
    // --strict: a placeholder issue fails; the default mode only counts it
    ['strict-pending-placeholder', 'PENDING_ISSUE', (fx) => { find(fx, (c) => c?.status === 'red-accepted').issue = PLACEHOLDER; return { strict: true }; }],
  ];
  // pass arms: a defining occurrence in each accepted shape stays green (the case check does not over-reach)
  const passes = [
    ['defining-literal', (fx) => synth(fx, SYN_CASE, "const plants = [{ expected: ['L99 selftest S1'] }];\n// L99 selftest S1\nreport('L99 selftest S1', true);\n")],
    ['defining-template', (fx) => synth(fx, 'L99 selftest ${k}', 'for (const k of ks) report(`L99 selftest ${k}`, ok);\n')],
    ['defining-message-prefix', (fx) => synth(fx, SYN_CASE, "fail('L99 selftest S1: the pick was not refused (' + id + ')');\ncheck('L99 selftest S1 (FRESH)', ok);\n")],
    ['defining-literal-trailing-space', (fx) => synth(fx, SYN_CASE, "check('L99 selftest S1 ' + detail, ok);\n")],
    ['defining-scenario-row', (fx) => synth(fx, SYN_CASE, "const rows = [\n  ['L99 selftest S1', 'a title', async () => ''],\n];\n")],
    ['defining-test-call', (fx) => synth(fx, SYN_CASE, "test('L99 selftest S1: every id encodes', async () => {});\n")],
    ['defining-message-mid-template', (fx) => synth(fx, 'did not re-rack L99', 'fail(`${axis}=${id} did not re-rack L99 (${st})`);\n')],
    ['strict-no-placeholder', (fx) => {
      for (const r of fx.rows) for (const col of COLUMNS) { const c = r.cells[col]; if (c?.status === 'red-accepted') c.issue = '#0'; }
      return { strict: true };
    }],
  ];
  let ok = true;
  const ctl = judge(control, read);
  const ctlGreen = ctl.failures.length === 0;
  process.stdout.write(`${ctlGreen ? 'ok  ' : 'FAIL'} control (open cells accepted): ${ctl.failures.length} failure(s); ${countsLine(ctl.counts)}; ${countsLine(ctl.digestCounts, 'digest sub-cells')}\n`);
  for (const f of ctl.failures) process.stdout.write(`       ${f.code} ${f.where}: ${f.msg}\n`);
  ok &&= ctlGreen;
  // The real fixture itself must be red exactly by its open cells (the RED code alone), so the plant
  // arm above and the live run judge the same document.
  const live = judge(base, read);
  const liveOnlyRed = live.failures.every((f) => f.code === 'RED') && live.failures.length === live.red.length;
  process.stdout.write(`${liveOnlyRed ? 'ok  ' : 'FAIL'} live fixture: every failure is an open red cell or digest sub-cell (${live.red.length} red)\n`);
  ok &&= liveOnlyRed;
  for (const [name, code, plant] of plants) {
    const fx = structuredClone(control);
    const opt = plant(fx, read) ?? {};
    const { failures } = judge(fx, readWith(opt.files), { strict: !!opt.strict });
    const codes = [...new Set(failures.map((f) => f.code))];
    const fired = failures.length > 0 && codes.length === 1 && codes[0] === code;
    process.stdout.write(`${fired ? 'ok  ' : 'FAIL'} plant ${name}: want ${code}, got ${failures.length} failure(s) [${codes.join(', ')}]\n`);
    if (!fired) for (const f of failures.slice(0, 5)) process.stdout.write(`       ${f.code} ${f.where}: ${f.msg}\n`);
    ok &&= fired;
  }
  for (const [name, arm] of passes) {
    const fx = structuredClone(control);
    const opt = arm(fx, read) ?? {};
    const { failures } = judge(fx, readWith(opt.files), { strict: !!opt.strict });
    const green = failures.length === 0;
    process.stdout.write(`${green ? 'ok  ' : 'FAIL'} pass arm ${name}: want no failure, got ${failures.length}\n`);
    if (!green) for (const f of failures.slice(0, 5)) process.stdout.write(`       ${f.code} ${f.where}: ${f.msg}\n`);
    ok &&= green;
  }
  process.stdout.write(`selftest: ${ok ? 'every plant caught, every pass arm green' : 'a plant was missed or a pass arm went red'} (${plants.length} plants + ${passes.length} pass arms + control + live)\n`);
  process.exit(ok ? 0 : 1);
}

if (SELFTEST) selftest(); else main();
