#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// js-scan-surface.mjs — the JS reader's DECISION SURFACE, enumerated, with V8 as the oracle.
//
// WHY THIS EXISTS. #795's `30488be0` claimed the regex-versus-division class was "closed by construction". Review
// round 3 (class S4) found four shapes it read wrong, by hand, in fifteen probes — and a hand probe is a lower
// bound, never a class. This file is the answer to "how would you know": it GENERATES the surface the acorn token
// context tracker actually decides over, asks V8 whether each generated source is a program at all, and counts how
// many the reader gets wrong. The numbers are asserted by test-js-scan.mjs against a live run, so a claim about
// this class is a measurement in this tree and not a sentence in a commit message.
//
// THE ORACLE. Each row is built so that its `/` is DIVISION (or, for the `/re/` operands, so that the source holds
// exactly one regex literal), then `new vm.Script(src)` decides whether the row is a program. A row V8 refuses is
// dropped: a reader owes nothing on a non-program. A row V8 accepts has exactly ONE correct token stream — the
// grammar is unambiguous — so the constructed expectation IS the right answer and the reader can be scored.
//   STATED LIMIT, and the reason for the second oracle: `vm.Script` compiles in SCRIPT sourceType, where `await` is
//   an ordinary identifier, while the readers parse as a MODULE, where it is the operator. Rows that turn on that
//   difference (rule R3) are therefore certified by a second oracle — `node --check` on a real `.mjs` file, which
//   is V8 parsing a module — and they are declared as their own axis value so the split is visible, not implied.
//
// WHAT IT MEASURES, in the order the numbers are printed:
//   generated / certified     how many rows exist, and how many V8 says are programs
//   stock wrong               rows the vendored acorn 8.17.0 READER reads wrongly (the size of the class)
//   patched wrong             the same count with lib/acorn-obparser.mjs's R1+R2+R3 applied
//   tokenizer only            the same two parsers with NO parse in front of them. That was what this file scored
//                             until FIX4, and it is a different reader from the one cdp.mjs ships — see the
//                             comment on readRegexes. Kept as its own row so the re-pin is auditable and so the
//                             value of the parse-first step is a number rather than a belief.
//   new wrongs                rows the patch breaks that stock reads correctly. This one must be ZERO; a fix that
//                             trades greens for reds is not a fix (review's arm A4, generalised from four rows to
//                             the whole surface)
//   residue                   what is still wrong, split by whether a PARSE refuses it (a named non-pass) or
//                             accepts it (silently wrong — the certificate's hole, published rather than assumed)
//   condition B               of the stock-wrong rows, how many a stock PARSE accepts: the hole measured on the
//                             defect class itself, which is what makes "a differential is necessary and not
//                             sufficient" a number here
//
// THE AXES ARE DECLARED (S6/C2). SURFACE_AXES lists every axis and every value; generateSurface() tags each row
// with the axis values it was built from; surfaceAxisCoverage() compares the DECLARED (axis, value) pairs with the
// EMITTED ones and the suite asserts SET EQUALITY. A generator whose declared surface diverges from its emitted
// surface is the census bug one level down — a corpus can only be evidence for the surface it actually covers.
//   The `spacing` axis is in that list because of a measurement: a 20-row hand probe found a class the first
//   64,847-row enumeration missed. That enumeration varied the operand and the context but never the WHITESPACE
//   between them, and `let f = async\nfunction g() {}\n/re/.test(s);` is a regex (ASI splits it) while the same
//   source on one line is a division. An axis that is never varied is an assumption, not a measurement.
//
// PORT-LINT NOTE (web/tools/ci-bands-lint.mjs reads this file): every generated source is built INSIDE a function
// — never a top-level const — and the launch call it embeds is assembled from pieces, so the band lint's readers
// see nothing declaration-shaped here. Same rule as js-scan-corpus.mjs, written down for the same reason.
//
// Usage: node web/tools/js-scan-surface.mjs [--json] [--limit N] [--oracle v8-vm-script|v8-node-check-module]
// Exit: 0 clean, 2 the patch broke a row stock acorn read correctly (`newWrongs`), 3 FAILED MEASUREMENT —
// an oracle could not be ASKED, so the numbers this run would print are missing rows for a reason that has
// nothing to do with the reader (GH-750 R4-B).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as acorn from '../../tools/render/lib/vendor/acorn/acorn.mjs';
import { obParser, OB_RULES, OB_PARSE_OPTIONS } from '../../tools/render/lib/acorn-obparser.mjs';

const TOK_OPTIONS = Object.freeze({ ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });

/** The left-hand side a member access hangs off. Each one leaves a DIFFERENT token as the context tracker's
 * lookbehind for the `.`/`?.` that follows, which is the thing under test. */
const LEFT_HANDS = ['obj', 'obj()', 'obj[0]', '(a)', 'this', 'a.b', 'f(1)(2)', 'obj?.a', 'new X()'];
/** How the property is reached. `?.` is the S4 defect's own axis: after it an IdentifierName is a PROPERTY NAME,
 * and stock acorn leaves the keyword's `beforeExpr` in place, so the `/` after it starts a regex. */
const MEMBER_FORMS = ['dot', 'optional-dot', 'bracket', 'optional-bracket'];
/** Every reserved word, every contextual keyword acorn tracks, and one ordinary name as the control. A property
 * named with any of these is a value; the tracker must not read it as the keyword. */
const PROPERTIES = ['await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'let', 'new', 'null', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'yield', 'async', 'get', 'set', 'of', 'as', 'from', 'target', 'meta',
  'foo'];
/** Operands that are not member accesses: the function / class family (R2's own axis, named and anonymous both,
 * because a NAME between `function` and `(` is one more token between the lookbehind and the body), literals,
 * and the forms whose last token is easy to mistake for the start of an expression. */
const LITERALS = ['function () {}', 'function g () {}', 'async function () {}', 'async function g () {}',
  'function* () {}', 'function* g () {}', 'async function* () {}', 'async function* g () {}',
  '(function () {})', '(async function () {})', 'class {}', 'class C {}', '(class {})', 'class extends Y {}',
  'class C extends Y {}', '({})', '({ a: 1 })', '[1]', '(() => 1)', '(async () => 1)', 'new X()', 'new X',
  'x++', 'x--', '(x, y)', '`t`', 'tag`t`', '/re/', '/re/g.source.length', '1n', '0x1f', '1_000', '.5', '1.',
  'x?.()', 'x?.[0]', 'import.meta.url.length', 'of', 'async', 'let', 'get', 'set', 'static'];
// `obj.if` / `obj.of` are deliberately NOT here: the member product already emits those exact sources, and a
// declared value whose every row is deduped away is a declared axis value the surface never covers.
/** The whitespace between the operand's last lookbehind-bearing token and what follows it. A LINE BREAK is not
 * cosmetic: it is ASI, and it flips `async` from a modifier to a complete expression statement. */
const SPACINGS = ['tight', 'spaces', 'line-break'];
/** The statement position the operand sits in — the context stack acorn pushes. `label` and the conditional's
 * alternative are the undecidable pair's two halves; `case`, `return`-with-a-newline and the class static block
 * are the lookbehinds acorn's own updateContext singles out. */
const CONTEXTS = [
  ['const-init', 'const n = ', ';'], ['assign', 'let n; n = ', ';'], ['call-arg', 'x(', ');'],
  ['call-arg-2', 'x(a, ', ');'], ['object-value', 'o = { k: ', ' };'], ['if-body', 'if (1) n = ', ';'],
  ['for-body', 'for (;;) { n = ', '; break; }'], ['return', 'function f() { return ', '; }'],
  ['return-newline', 'function f() { return\n', '; }'], ['case-body', 'switch (1) { case 1: n = ', '; }'],
  ['case-test', 'switch (1) { case ', ': break; }'], ['label', 'l: n = ', ';'],
  ['do-body', 'do { n = ', '; } while (0);'], ['method-body', 'class C { m() { n = ', '; } }'],
  ['static-block', 'class C { static { n = ', '; } }'], ['field-init', 'class C { f = ', '; }'],
  ['try-body', 'try { n = ', '; } catch {}'], ['array-element', '[', '];'],
  ['typeof-operand', 'n = typeof ', ';'], ['void-operand', 'n = void ', ';'], ['logical-right', 'n = a || ', ';'],
  ['conditional-consequent', 'n = a ? ', ' : b;'], ['conditional-alternative', 'n = a ? b : ', ';'],
  ['arrow-body', 'f = () => ', ';'], ['await-operand', 'async function g() { n = await ', '; }'],
  ['yield-operand', 'function* g() { n = yield ', '; }'], ['else-body', 'if (1) {} else n = ', ';'],
  ['while-body', 'while (0) n = ', ';'], ['paren', 'n = (', ');'], ['export-init', 'export const n = ', ';'],
  ['not-operand', 'n = !', ';'], ['negate-operand', 'n = -', ';'], ['comma-right', 'n = a, ', ';'],
  ['block', '{ n = ', '; }'], ['new-arg', 'n = new C(', ');'], ['for-of-list', 'for (const q of [', ']) {}'],
];
/** Hand-written rows for shapes a product cannot reach: a keyword used as a property THROUGH a binding, `for
 * await`, and the module-only `await` rows that carry rule R3. The last group is certified by the module oracle. */
function extraRows(launch) {
  const L = launch;
  return [
    ['keyword-property-binding', 'script', `o = { await: 1 }; n = o.await / 2 + ${L};`],
    ['keyword-property-optional', 'script', `o = { await: 1 }; n = o?.await / 2 + ${L};`],
    ['keyword-property-inline', 'script', `n = ({ await: 1 }).await / 2 + ${L};`],
    ['keyword-method', 'script', `class C { await() { return 1; } } n = new C().await() / 2 + ${L};`],
    ['keyword-field', 'script', `class C { await = 2; } n = new C().await / 2 + ${L};`],
    ['await-unparenthesised', 'script', `async function g() { n = await x / 2 + ${L}; }`],
    ['await-parenthesised', 'script', `async function g() { n = (await x) / 2 + ${L}; }`],
    ['for-await', 'script', `async function g() { for await (const q of y) { n = 1 / 2 + ${L}; } }`],
    ['labelled-block', 'script', `label: { n = 2 / 2 + ${L}; }`],
    // R3: in a MODULE `await` is the operator at top level, so the `/` after it starts a REGEX. In a SCRIPT the
    // same characters are `await / re /` — a division by an identifier. Only the module oracle can score these.
    ['module-await-regex', 'module', 'const n = await /re/;'],
    ['module-await-regex-flags', 'module', 'const n = await /re/g;'],
    ['module-await-call-regex', 'module', 'const n = await /re/.test("x");'],
    ['module-await-division', 'module', 'const await_ = 4; const n = await Promise.resolve(8) / 2;'],
    ['module-await-member', 'module', 'const o = { await: 1 }; const n = o.await / 2;'],
  ];
}

/** The declared surface (S6/C2). Every axis, every value, and — for the suite — the exact set a run must emit. */
export const SURFACE_AXES = Object.freeze([
  Object.freeze({ id: 'family', what: 'how the row was built', values: Object.freeze(['member', 'literal', 'extra']) }),
  Object.freeze({ id: 'leftHand', what: 'the expression a member access hangs off (the `.`/`?.` lookbehind)', values: Object.freeze([...LEFT_HANDS]) }),
  Object.freeze({ id: 'memberForm', what: 'how the property is reached — `?.` is the S4 defect’s own axis', values: Object.freeze([...MEMBER_FORMS]) }),
  Object.freeze({ id: 'property', what: 'the reserved / contextual word used as a property name', values: Object.freeze([...PROPERTIES]) }),
  Object.freeze({ id: 'literal', what: 'a non-member operand: the function / class family, literals, update expressions', values: Object.freeze([...LITERALS]) }),
  Object.freeze({ id: 'spacing', what: 'the whitespace before the `/` — `line-break` is ASI, which a 20-row hand probe caught the first enumeration missing', values: Object.freeze([...SPACINGS]) }),
  Object.freeze({ id: 'context', what: 'the statement position, i.e. the token context acorn pushes', values: Object.freeze(CONTEXTS.map((c) => c[0])) }),
  Object.freeze({ id: 'oracle', what: 'which V8 decides whether the row is a program', values: Object.freeze(['v8-vm-script', 'v8-node-check-module']) }),
]);

const SPACER = Object.freeze({ tight: ' ', spaces: '   ', 'line-break': '\n' });

/** Build the surface. Every row carries `axes`, and only the axes that built it. */
export function generateSurface() {
  const launch = 'launchChrome({ ' + 'port' + ': CDP + 25 })'; // assembled: the band lint reads source text, and a tool may not declare a port
  const tail = ' // ratio';                                    // a trailing comment: a mis-read `/` swallows it, which is how S4 was visible
  const rows = []; const seen = new Set();
  const add = (row) => { if (seen.has(row.src)) return; seen.add(row.src); row.id = `r${rows.length}`; rows.push(row); };
  const operandText = (form, left, prop) => (form === 'dot' ? `${left}.${prop}`
    : form === 'optional-dot' ? `${left}?.${prop}`
      : form === 'bracket' ? `${left}["${prop}"]` : `${left}?.["${prop}"]`);
  for (const [context, pre, suf] of CONTEXTS) {
    for (const spacing of SPACINGS) {
      const gap = SPACER[spacing];
      for (const left of LEFT_HANDS) for (const memberForm of MEMBER_FORMS) for (const property of PROPERTIES) {
        const op = operandText(memberForm, left, property);
        add({ src: `${pre}${op}${gap}/ 2 + ${launch}${suf}${tail}`,
          want: 0, oracle: 'v8-vm-script', axes: { family: 'member', leftHand: left, memberForm, property, spacing, context, oracle: 'v8-vm-script' } });
      }
      for (const literal of LITERALS) {
        add({ src: `${pre}${literal}${gap}/ 2 + ${launch}${suf}${tail}`,
          want: literal.includes('/re/') ? 1 : 0, oracle: 'v8-vm-script',
          axes: { family: 'literal', literal, spacing, context, oracle: 'v8-vm-script' } });
      }
    }
  }
  for (const [name, mode, src] of extraRows(launch)) {
    add({ src: mode === 'module' ? src : `${src}${tail}`, want: /\/re\//.test(src) ? 1 : 0,
      oracle: mode === 'module' ? 'v8-node-check-module' : 'v8-vm-script',
      axes: { family: 'extra', extra: name, oracle: mode === 'module' ? 'v8-node-check-module' : 'v8-vm-script' } });
  }
  return rows;
}

/** DECLARED vs EMITTED (axis, value) pairs. The suite asserts these two sets are EQUAL. */
export function surfaceAxisCoverage(rows = generateSurface()) {
  const declared = new Set();
  for (const a of SURFACE_AXES) for (const v of a.values) declared.add(`${a.id}=${v}`);
  const emitted = new Set();
  for (const r of rows) for (const [k, v] of Object.entries(r.axes)) { if (k === 'extra') continue; emitted.add(`${k}=${v}`); }
  const missing = [...declared].filter((x) => !emitted.has(x)).sort();
  const undeclared = [...emitted].filter((x) => !declared.has(x)).sort();
  return { declared: declared.size, emitted: emitted.size, missing, undeclared, equal: missing.length === 0 && undeclared.length === 0 };
}

/** GH-750 R4-B (review round 4, P2-2): AN ORACLE THAT CANNOT BE ASKED IS A FAILED MEASUREMENT.
 * The oracle's job is to answer a question about the INPUT. "The child could not be spawned" is not one of its
 * answers, and recording it as `false` — as `catch { out.set(r.id, false) }` did — converts an outage into a
 * verdict. Measured on 054c2ba8, with execFileSync patched to throw EAGAIN: the CLI exits 0 and prints
 * "V8-certified 189585", five rows lighter, with nothing on stderr. Those five rows are the WHOLE evidence base
 * for rule R3 (module `await`), because script-mode `vm.Script` gives the wrong answer for them by construction.
 * Same law as `pipeline-hides-exit-status`, one level in: never `catch { return <a verdict> }` around a
 * subprocess, and never around anything else that can fail for reasons the question does not cover. */
export class OracleUnavailableError extends Error {
  constructor(oracle, rowId, cause) {
    super(`ORACLE UNAVAILABLE (${oracle}) on row ${rowId}: ${cause?.message ?? cause}`);
    this.name = 'OracleUnavailableError';
    this.oracleUnavailable = true;
    this.oracle = oracle;
    this.row = rowId;
    // the subprocess's own diagnostics, PRESERVED: `catch {}` threw these away, which is exactly what made an
    // unavailable oracle indistinguishable from "V8 says no"
    for (const k of ['status', 'signal', 'code', 'errno', 'syscall', 'path']) if (cause?.[k] !== undefined && cause?.[k] !== null) this[k] = cause[k];
    this.childStderr = cause?.stderr ? String(cause.stderr).trim() : null;
  }
}

/** V8, module mode: `node --check` on a real .mjs file. Used only for the R3 rows, so the spawn count is the size
 * of that family and not of the surface. Returns the verdicts AND what it was asked, so the caller can publish
 * coverage instead of a bare total. */
function moduleOracle(rows) {
  const verdicts = new Map();
  if (!rows.length) return { verdicts, asked: 0, answered: 0 };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-js-scan-surface-'));
  let asked = 0;
  for (const r of rows) {
    const f = path.join(dir, `${r.id}.mjs`);
    fs.writeFileSync(f, r.src + '\n');
    asked += 1;
    try { execFileSync(process.execPath, ['--check', f], { stdio: ['ignore', 'ignore', 'pipe'] }); verdicts.set(r.id, true); }
    catch (e) {
      // THE ONLY outcome that is a verdict about the input: the child ran to completion and exited 1 because V8
      // refused the source. A signal, any other status, ENOENT, EMFILE, EAGAIN — none of those are about the row.
      if (e?.status === 1 && !e.signal) { verdicts.set(r.id, false); continue; }
      throw new OracleUnavailableError('v8-node-check-module', r.id, e);
    }
  }
  return { verdicts, asked, answered: verdicts.size };
}

/** THE READING, TAKEN THE WAY THE SHIPPED READER TAKES IT (GH-750 FIX4).
 * This used to be a standalone `Parser.tokenizer(src)` loop. That is not what cdp.mjs does, and the two DISAGREE.
 * `acornSpans` parses FIRST and collects the parser's own token stream through `onToken`; only when the parse is
 * refused does it fall back to the standalone tokenizer, and a source that is not even lexically readable throws.
 * The parser's stream is better informed than the tokenizer's — acorn's context stack is updated from inside the
 * grammar — and on this surface that difference is worth nine token-level misreadings per operand family:
 * `n = a ? b : async function g () {} / 2 + launchChrome(…)` tokenizes to ONE regex token standalone and to ZERO
 * under a parse, which is the right answer. Scoring the tokenizer and publishing the number as this repo's reader
 * is the instrument mismatch the OC3 ruling names: a spread derived under one normalizer may not score a
 * reading taken under another. Both numbers are published below — `wrong` is the shipped reader, `tokenizerOnly`
 * is what the same parser gets without the parse in front of it, which is what the parse-first step is worth. */
const readRegexes = (Parser, src) => {
  const toks = [];
  try {
    Parser.parse(src, { ...OB_PARSE_OPTIONS, locations: false, onToken: (t) => toks.push(t) });
    return { n: toks.filter((t) => t.type.label === 'regexp').length, certified: true, unreadable: false };
  } catch {
    toks.length = 0; // the parser emits tokens up to the point it refused; none of them are evidence
    try { for (const t of Parser.tokenizer(src, TOK_OPTIONS)) toks.push(t); }
    catch { return { n: null, certified: false, unreadable: true }; }
    return { n: toks.filter((t) => t.type.label === 'regexp').length, certified: false, unreadable: false };
  }
};
/** The same source read with NO parse in front of it — the number this file published before FIX4. */
const tokenizerOnlyRegexCount = (Parser, src) => {
  try { let n = 0; for (const t of Parser.tokenizer(src, TOK_OPTIONS)) if (t.type.label === 'regexp') n += 1; return n; }
  catch { return null; }
};

export const ORACLE_IDS = Object.freeze(['v8-vm-script', 'v8-node-check-module']);

/** Run the surface. Returns counts and the residue, never a verdict — the suite decides what the numbers must be. */
export function measureSurface({ rows = generateSurface(), limit = null, oracle = null } = {}) {
  const Patched = obParser();
  if (oracle !== null && !ORACLE_IDS.includes(oracle)) throw new Error(`unknown oracle ${JSON.stringify(oracle)} — declared: ${ORACLE_IDS.join(', ')}`);
  const picked = oracle === null ? rows : rows.filter((r) => r.oracle === oracle);
  const use = limit === null ? picked : picked.slice(0, limit);
  // R4-B: asked / answered / accepted, per oracle. `certified` alone falls for two unrelated reasons — V8 refused
  // the rows, or V8 was never reached — and only one of them is a measurement.
  const oracles = Object.fromEntries(ORACLE_IDS.map((id) => [id, { asked: 0, answered: 0, accepted: 0 }]));
  const mod = moduleOracle(use.filter((r) => r.oracle === 'v8-node-check-module'));
  oracles['v8-node-check-module'].asked = mod.asked;
  oracles['v8-node-check-module'].answered = mod.answered;
  const moduleVerdict = mod.verdicts;
  let certified = 0;
  const stockWrong = []; const patchedWrong = [];
  const stockTokWrong = []; const patchedTokWrong = [];
  const patchedRead = new Map(); const stockRead = new Map();
  for (const r of use) {
    const tally = oracles[r.oracle];
    if (r.oracle === 'v8-node-check-module') {
      if (!moduleVerdict.has(r.id)) throw new OracleUnavailableError(r.oracle, r.id, new Error('the oracle recorded no verdict for this row'));
      if (!moduleVerdict.get(r.id)) continue;
    } else {
      tally.asked += 1;
      // the same discrimination in process: a SyntaxError IS V8's answer about this source; anything else
      // (a resource limit, an internal error) is the oracle failing to answer, and must not read as "not a program"
      try { new vm.Script(r.src, { filename: 'surface.js' }); tally.answered += 1; }
      catch (e) {
        if (!(e instanceof SyntaxError)) throw new OracleUnavailableError(r.oracle, r.id, e);
        tally.answered += 1; continue;
      }
    }
    tally.accepted += 1;
    certified += 1;
    for (const [P, bag, tokBag, seen] of [[acorn.Parser, stockWrong, stockTokWrong, stockRead], [Patched, patchedWrong, patchedTokWrong, patchedRead]]) {
      const read = readRegexes(P, r.src);
      seen.set(r.id, read);
      if (read.unreadable || read.n !== r.want) bag.push(r);
      if (tokenizerOnlyRegexCount(P, r.src) !== r.want) tokBag.push(r);
    }
  }
  const stockSet = new Set(stockWrong.map((r) => r.id));
  const newWrongs = patchedWrong.filter((r) => !stockSet.has(r.id));
  // the certificate splits the residue: a row the PARSE refused was reported, a row it accepted was not
  const refused = patchedWrong.filter((r) => !patchedRead.get(r.id).certified);
  const silent = patchedWrong.filter((r) => patchedRead.get(r.id).certified);
  const stockAcceptedByParse = stockWrong.filter((r) => stockRead.get(r.id).certified);
  const asyncBucket = stockWrong.filter((r) => /async function/.test(r.src));
  const patchedSet = new Set(patchedWrong.map((r) => r.id));
  return {
    generated: use.length, certified, oracles,
    stockWrong: stockWrong.length, patchedWrong: patchedWrong.length, newWrongs: newWrongs.map((r) => r.src),
    tokenizerOnly: { stockWrong: stockTokWrong.length, patchedWrong: patchedTokWrong.length },
    residue: patchedWrong.map((r) => r.src).sort(),
    residueRefusedByParse: refused.length, residueAcceptedByParse: silent.map((r) => r.src).sort(),
    conditionB: { stockWrong: stockWrong.length, acceptedByStockParse: stockAcceptedByParse.length },
    conditionA: { bucket: asyncBucket.length, closed: asyncBucket.filter((r) => !patchedSet.has(r.id)).length, stillWrong: asyncBucket.filter((r) => patchedSet.has(r.id)).map((r) => r.src) },
    rules: OB_RULES.map((r) => r.id),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const argv = process.argv.slice(2);
  const limitAt = argv.indexOf('--limit');
  const oracleAt = argv.indexOf('--oracle');
  let m;
  try {
    m = measureSurface({ limit: limitAt === -1 ? null : Number(argv[limitAt + 1]), oracle: oracleAt === -1 ? null : argv[oracleAt + 1] });
  } catch (e) {
    if (!e?.oracleUnavailable) throw e;
    // R4-B: a FAILED MEASUREMENT. No result line is printed — a number nobody can trust is worse than no number —
    // and the exit code is its own, distinct from 2 (`newWrongs`, which IS a verdict about the reader).
    console.error(`js-scan-surface: ${e.message}`);
    console.error(`  code=${e.code ?? '-'} errno=${e.errno ?? '-'} syscall=${e.syscall ?? '-'} status=${e.status ?? '-'} signal=${e.signal ?? '-'}`);
    if (e.childStderr) console.error(`  child stderr: ${e.childStderr}`);
    console.error('  The oracle could not be ASKED, so this run has no measurement to report: rows would be missing for '
      + 'a reason that has nothing to do with the reader. Recording that as "V8 refused the source" is how a coverage '
      + 'collapse rides out as a clean run. Exit 3.');
    process.exit(3);
  }
  const cov = surfaceAxisCoverage();
  if (argv.includes('--json')) { console.log(JSON.stringify({ ...m, coverage: cov }, null, 2)); }
  else {
    console.log(`js-scan surface: generated ${m.generated}, V8-certified ${m.certified}`);
    console.log(`  axes: ${cov.declared} declared (axis, value) pairs, ${cov.emitted} emitted, ${cov.equal ? 'SET EQUAL' : `MISSING ${cov.missing.join(' ')} UNDECLARED ${cov.undeclared.join(' ')}`}`);
    for (const [id, o] of Object.entries(m.oracles)) console.log(`  oracle ${id}: asked ${o.asked}, answered ${o.answered}, accepted ${o.accepted}`);
    console.log(`  stock acorn wrong: ${m.stockWrong}`);
    console.log(`  with ${m.rules.join('+')} wrong: ${m.patchedWrong}   (new wrongs: ${m.newWrongs.length})`);
    console.log(`  same two readers WITHOUT the parse in front of them (tokenizer only): stock ${m.tokenizerOnly.stockWrong}, patched ${m.tokenizerOnly.patchedWrong} — the difference is what parse-first is worth, and it is why this file scores the shipped reader and not a tokenizer loop`);
    for (const s of m.newWrongs) console.log(`    NEW ${JSON.stringify(s)}`);
    for (const s of m.residue) console.log(`    RESIDUE ${JSON.stringify(s)}`);
    console.log(`  residue: parse REFUSES ${m.residueRefusedByParse}, parse ACCEPTS (silently wrong) ${m.residueAcceptedByParse.length}`);
    console.log(`  CONDITION A: stock rows with \`async function\`: ${m.conditionA.bucket} -> closed ${m.conditionA.closed}, still wrong ${m.conditionA.stillWrong.length}`);
    console.log(`  CONDITION B: of ${m.conditionB.stockWrong} stock-wrong rows a stock PARSE accepts ${m.conditionB.acceptedByStockParse} — the certificate's measured hole`);
  }
  process.exit(m.newWrongs.length ? 2 : 0);
}
