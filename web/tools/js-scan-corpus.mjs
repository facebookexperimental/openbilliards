#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// js-scan-corpus.mjs — the GENERATED corpus over the JS source reader's own
// DECISION SURFACE (GH-750 class K for T2; the reader is cdp.mjs
// scanJsSource / stripComments / blankStrings).
//
//   node web/tools/js-scan-corpus.mjs            # print the corpus size, the axes and the skip rules
//   node web/tools/js-scan-corpus.mjs --sample 5 # print five generated sources verbatim
//
// WHY A GENERATOR AND NOT MORE HAND-WRITTEN SENTENCES
// --------------------------------------------------
// js-scan-measure.mjs measures the FIX1 heuristic reader (f5262842) against the
// FIX2 tokenizer over every tracked source and reports ZERO differences on all
// 418 of them. So the base-versus-head differential over the real tree cannot
// distinguish FIX1 from FIX2 at all: the whole behavioural difference lives in
// hand-written sentences, and each of those was picked from whatever a review
// round happened to think of. A corpus over the tracked tree is not a corpus
// over the tool's DECISION SURFACE. This module generates that surface instead:
// the regex-versus-division predecessor set crossed with template nesting
// depth, interpolation context, and the comment and string states.
//
// DETERMINISM: no randomness, no clock, no filesystem, no environment. Plain
// nested loops in a fixed axis order, so the same checkout always produces the
// same corpus in the same order, and a cell's id is its coordinates.
//
// THE AXES (each value is a NAME in CORPUS_FLOOR; the floor never shrinks)
//   predecessor   the token class that decides whether the next `/` opens a
//                 REGEX or divides — identifier (ascii, unicode, the contextual
//                 keyword `of`), number (plain and trailing-dot), string,
//                 template, `)`, `]`, `}` as an object-literal close, `}` as a
//                 function/class expression close, `}` as a block close, `}` as
//                 a case block's close, an `if` condition's `)`, postfix `++`
//                 and `--`, a plain binary operator, and each keyword that
//                 permits a regex next (return, typeof, case, in, of, new,
//                 delete, void, instanceof, do, else, yield, await).
//                 Every predecessor is expressed as an EXPRESSION whose `/`
//                 immediately follows the predecessor token — statement-only
//                 forms (return, case, do, else, a block `}`) are wrapped in an
//                 immediately-invoked function so the adjacency survives at any
//                 template depth, rather than being skipped there.
//   depth         template nesting depth 0..3 around the cell.
//   interpolation what else the innermost interpolation holds: nothing, a
//                 string, a line comment, a block comment, a regex, a nested
//                 template, or an object literal whose `}` must not close the
//                 interpolation.
//   comment       none, a line comment, a block comment, and a comment SEQUENCE
//                 appearing inside a string and inside a template (which is not
//                 a comment).
//   string        single, double, template, an escaped quote, a line
//                 continuation, and a quote inside a comment.
//
// PORT-LINT NOTE (web/tools/ci-bands-lint.mjs reads this file): every generated
// source is built INSIDE a function — never a top-level const — and carries no
// port-shaped number and no `<base> + n` arithmetic, so the band lint's readers
// see nothing declaration-shaped here. test-js-scan.mjs tripped that lint twice
// before this rule was written down.
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The regex-versus-division predecessor set. `expr` is a complete JavaScript EXPRESSION in which the `/`
 * immediately follows the named predecessor token, so the same cell embeds unchanged at every template depth
 * and in every interpolation context. `slash` is what the grammar says that `/` is. */
function predecessorCells() {
  return [
    // --- the `/` DIVIDES: the predecessor ends a value -----------------------------------------------
    { name: 'identifier', slash: 'division', expr: '(a / 2)' },
    { name: 'identifier-unicode', slash: 'division', expr: '(café / 2)' },
    { name: 'identifier-of-contextual', slash: 'division', expr: '(() => { for (const of of ofs) return of / 2; })()' },
    { name: 'number', slash: 'division', expr: '(1 / 2)' },
    { name: 'number-trailing-dot', slash: 'division', expr: '(1. / 2)' },
    { name: 'string', slash: 'division', expr: "('ab' / 2)" },
    { name: 'template', slash: 'division', expr: '(`cd` / 2)' },
    { name: 'paren-close', slash: 'division', expr: '((a + b) / 2)' },
    { name: 'bracket-close', slash: 'division', expr: '(arr[0] / 2)' },
    { name: 'object-brace-close', slash: 'division', expr: '({ a: 1 } / 2)' },
    // unparenthesised, so that at depth >= 1 the cell IS the review r2 P2-1 S3 shape `${{ … } / 2}`: the object's
    // closing brace must not be taken for the interpolation's
    { name: 'object-brace-close-bare', slash: 'division', expr: '{ valueOf: () => 10 } / 2' },
    { name: 'function-expression-brace', slash: 'division', expr: '(function () {} / 2)' },
    { name: 'class-expression-brace', slash: 'division', expr: '(class {} / 2)' },
    { name: 'postfix-increment', slash: 'division', expr: '(a++ / 2)' },
    { name: 'postfix-decrement', slash: 'division', expr: '(a-- / 2)' },
    // --- the `/` DIVIDES, and the predecessor is one the TOKENIZER ALONE cannot classify --------------
    // Review round 3 class S4 (ORDER-TOOLS-B18-6) hand-probed fifteen shapes against the 18233d6d reader and
    // found four that came back `null` with an EMPTY `unknown` — code silently swallowed as a regex body. The
    // generator could not have found them: it did not enumerate `?.` at all, and it had no unparenthesised
    // function-expression form. Both omissions are repaired here, WITH their controls. A control is not
    // optional: `obj.return / 2` and `obj?.["return"] / 2` were already right on 18233d6d, and a context-tracker
    // patch that turns four reds green while turning three greens red is not a fix. Slash is `division` on every
    // row below — after a property name, after an optional call's `)`, and after a function or class
    // EXPRESSION's `}`, the grammar has a value in hand.
    { name: 'dot-reserved-word', slash: 'division', expr: '(obj.return / 2)' },
    { name: 'optional-chain-identifier', slash: 'division', expr: '(obj?.prop / 2)' },
    { name: 'optional-chain-reserved-word', slash: 'division', expr: '(obj?.return / 2)' },
    { name: 'optional-chain-keyword-in', slash: 'division', expr: '(obj?.in / 2)' },
    { name: 'optional-chain-keyword-typeof', slash: 'division', expr: '(obj?.typeof / 2)' },
    { name: 'optional-chain-computed', slash: 'division', expr: '(obj?.["return"] / 2)' },
    { name: 'optional-chain-call', slash: 'division', expr: '(obj?.() / 2)' },
    { name: 'function-expression-brace-bare', slash: 'division', expr: 'function () {} / 2' },
    { name: 'async-function-expression-brace', slash: 'division', expr: '(async function () {} / 2)' },
    { name: 'async-function-expression-brace-bare', slash: 'division', expr: 'async function () {} / 2' },
    { name: 'generator-expression-brace-bare', slash: 'division', expr: 'function* () {} / 2' },
    { name: 'async-generator-expression-brace-bare', slash: 'division', expr: 'async function* () {} / 2' },
    // --- the `/` OPENS A REGEX: the predecessor wants an operand -------------------------------------
    { name: 'block-brace-close', slash: 'regex', expr: '(() => { if (x) {} /re/.test(y); })()' },
    { name: 'case-block-brace-close', slash: 'regex', expr: '(() => { switch (v) { case 1: { f(); } /re/.test(s); } })()' },
    { name: 'if-condition-close', slash: 'regex', expr: '(() => { if (x) /re/.test(y); })()' },
    { name: 'binary-operator', slash: 'regex', expr: '(a + /re/.source)' },
    { name: 'keyword-return', slash: 'regex', expr: '(() => { return /re/.test(s); })()' },
    { name: 'keyword-typeof', slash: 'regex', expr: '(typeof /re/)' },
    { name: 'keyword-case', slash: 'regex', expr: '(() => { switch (v) { case /re/.source: break; } })()' },
    { name: 'keyword-in', slash: 'regex', expr: "('a' in /re/)" },
    { name: 'keyword-of', slash: 'regex', expr: '(() => { for (const q of /re/) g(q); })()' },
    { name: 'keyword-new', slash: 'regex', expr: '(new /re/())' },
    { name: 'keyword-delete', slash: 'regex', expr: '(delete /re/.source)' },
    { name: 'keyword-void', slash: 'regex', expr: '(void /re/)' },
    { name: 'keyword-instanceof', slash: 'regex', expr: '(s instanceof /re/)' },
    { name: 'keyword-do', slash: 'regex', expr: '(() => { do /re/.test(s); while (f()); })()' },
    { name: 'keyword-else', slash: 'regex', expr: '(() => { if (a) b(); else /re/.test(s); })()' },
    { name: 'keyword-yield', slash: 'regex', expr: '((function* () { return (yield /re/); })())' },
    { name: 'keyword-await', slash: 'regex', expr: '((async () => await /re/)())' },
  ];
}

/** Template nesting depth around the cell: 0 = bare code, 3 = the cell sits in the innermost of three templates. */
function depthValues() { return [0, 1, 2, 3]; }

/** What else the INNERMOST interpolation holds beside the cell. Each wrap keeps the cell expression intact
 * (comma operator / comment prefix), so the predecessor-to-slash adjacency the axis is about never moves. */
function interpolationContexts() {
  return [
    { name: 'none', wrap: (e) => e },
    { name: 'string', wrap: (e) => `('lit', ${e})` },
    { name: 'line-comment', wrap: (e) => `// note\n${e}` },
    { name: 'block-comment', wrap: (e) => `/* note */ ${e}` },
    { name: 'regex', wrap: (e) => `(/rx/, ${e})` },
    { name: 'nested-template', wrap: (e) => '(`inner ${q}`, ' + e + ')' },
    { name: 'object-literal', wrap: (e) => `({ a: 1, b: { c: 2 } }, ${e})` },
    // the object literal at the HEAD of the interpolation, unparenthesised: the shape review round 2 found FIX1 on
    { name: 'bare-object-head', wrap: (e) => `{ a: 1, b: { c: 2 } }, ${e}` },
  ];
}

/** Comment state. The last two put a comment SEQUENCE inside a literal, where it is not a comment at all. */
function commentStates() {
  return [
    { name: 'none', decorate: (line) => line, extra: () => [] },
    { name: 'line', decorate: (line) => `${line} // tail`, extra: () => [] },
    { name: 'block', decorate: (line) => `/* head */ ${line}`, extra: () => [] },
    { name: 'sequence-in-string', decorate: (line) => line, extra: () => ["const ob_cs = '// not a comment /* nor this */';"] },
    { name: 'sequence-in-template', decorate: (line) => line, extra: () => ['const ob_ct = `// not a comment /* nor this */`;'] },
  ];
}

/** String state, one extra declaration per cell. `quote-in-comment` is the state where the quote characters
 * are inside a comment and open nothing. */
function stringStates() {
  return [
    { name: 'single', line: () => "const ob_s = 'plain';" },
    { name: 'double', line: () => 'const ob_s = "plain";' },
    { name: 'template', line: () => 'const ob_s = `plain`;' },
    { name: 'escaped-quote', line: () => "const ob_s = 'it\\'s and \\\"q\\\"';" },
    { name: 'line-continuation', line: () => "const ob_s = 'a\\\nb';" },
    { name: 'quote-in-comment', line: () => "// a quote ' a double \" and a backtick `" },
  ];
}

/** The SKIP RULES, printed by every consumer — a cell is never dropped silently.
 * Each rule states the combination it removes and why the combination cannot exist. */
function skipRules() {
  return [
    {
      id: 'depth0-has-no-interpolation',
      reason: 'template nesting depth 0 is bare code: there is no interpolation to hold an interpolation context, '
        + 'so at depth 0 the interpolation axis collapses to `none`',
      applies: ({ depth, interp }) => depth === 0 && interp !== 'none',
    },
  ];
}

/** The axis values this corpus is pinned to. THE CORPUS NEVER SHRINKS: test-js-scan.mjs asserts that every name
 * here is still produced, so deleting an axis value is a failing test, not a quiet loss of coverage.
 * RETIRING A ROW: a value that is genuinely wrong is moved into RETIRED below with a one-line reason and stays
 * visible there forever. It is never deleted from this file and never quietly dropped from a loop. */
export const CORPUS_FLOOR = Object.freeze({
  predecessor: Object.freeze(predecessorCells().map((p) => p.name)),
  depth: Object.freeze(depthValues().map((d) => `d${d}`)),
  interpolation: Object.freeze(interpolationContexts().map((c) => c.name)),
  comment: Object.freeze(commentStates().map((c) => c.name)),
  string: Object.freeze(stringStates().map((c) => c.name)),
});

/** Axis values and divergence classes retired because they were WRONG (not because they were slow or
 * inconvenient), each with the reason and the date. A retired name keeps its row here so the history of the
 * surface is readable; the floor test reads this map and stops requiring the named value. A row leaves the
 * corpus ONLY through this map — deleting it from an axis or from the inventory is a failing test. Empty is
 * the correct state. */
export const RETIRED = Object.freeze({
  'head-residual:await-is-a-name-to-the-tokenizer':
    'CLOSED 2026-09-14 by GH-750 FIX4 rule R3 — in a module `await` is the operator and never an identifier — applied through '
    + '`acorn.Parser.extend` in tools/render/lib/acorn-obparser.mjs so the vendored bytes stay byte-identical. GH-799 is answered by a REMEDY, '
    + 'not by an allowlist. The class row stays in divergenceClasses() and its census count stays pinned at 0: a class that reads 0 forever is a '
    + 'regression guard, and deleting the row would throw that guard away. The same fact is now counted from the other side by `tok:await-is-a-name`, '
    + 'which separates the pre-remedy tokenizer reader (30488be0) from the head on the 30 depth-0 cells where the difference survives blankStrings.',
});

/** ---- THE THREE-WAY DIVERGENCE CLASS TABLE -----------------------------------------------------------
 * Every difference the three-way differential finds between the base reader (868bbd57), the FIX1 heuristic
 * reader (f5262842) and the head tokenizer must be NAMED by one of these classes. A divergence that matches
 * no class is RED: the suite prints the source, all three readings and the offset of the first difference,
 * and STOPS — deciding what the reader should do is a fix order's business, not a test commit's.
 *
 * `applies` is a predicate over the CELL'S COORDINATES, not over the diff text: a class is a statement about
 * the decision surface ("a regex after `instanceof`"), not a pattern match on an output. */
/** The predecessor sets the classes below are stated over. LISTED, never matched by pattern: a pattern silently
 * swallows the next predecessor somebody adds, and a class that quietly widens is a class that stops being a
 * statement about a mechanism. Adding a predecessor to a set is a deliberate edit with a census to re-pin. */
const FUNCTION_EXPRESSION_BRACE = new Set([
  'function-expression-brace', 'class-expression-brace', 'function-expression-brace-bare',
  'generator-expression-brace-bare', 'async-function-expression-brace',
  'async-function-expression-brace-bare', 'async-generator-expression-brace-bare',
]);
/** The subset of the above that the tokenizer-era reader got WRONG — every one of them begins with `async`. That
 * boundary is the finding: `function () {} / 2` and `function* () {} / 2` were already right, so the defect was
 * never "a function expression's brace", it was the `async` token in front of it. */
const ASYNC_FUNCTION_EXPRESSION_BRACE = new Set([
  'async-function-expression-brace', 'async-function-expression-brace-bare', 'async-generator-expression-brace-bare',
]);
/** `?.` followed by a RESERVED WORD, which after `?.` is a property name and nothing else. `optional-chain-identifier`,
 * `optional-chain-computed` and `optional-chain-call` are deliberately NOT here: the tokenizer-era reader read all
 * three correctly, and they are the controls that keep a remedy from being an overfit to three strings. */
const OPTIONAL_CHAIN_RESERVED_WORD = new Set([
  'optional-chain-reserved-word', 'optional-chain-keyword-in', 'optional-chain-keyword-typeof',
]);

function divergenceClasses() {
  return [
    // --- base 868bbd57 vs the head tokenizer: the three wholesale defects issue #750 opened on ------------
    { id: 'base:flat-template-nesting', pair: 'base-vs-head', origin: 'issue #750',
      reason: 'the base reader has ONE flat template mode, so an inner backtick closes the outer template and everything after it is misread',
      applies: (c) => c.depth >= 2 || (c.depth >= 1 && (c.interpolation === 'nested-template' || c.predecessor === 'template')) },
    { id: 'base:no-regex-literal', pair: 'base-vs-head', origin: 'issue #750 / FIX1 S2',
      reason: 'the base reader has no regex-literal concept at all: a regex body stands as code and a quote inside it opens a string',
      applies: (c) => c.slash === 'regex' },
    { id: 'base:line-continuation-ends-the-string', pair: 'base-vs-head', origin: 'GENERATED (this corpus)',
      reason: 'the base string scanner pops on a newline, so a backslash-newline line continuation ends the string early and the rest of the literal reads as code',
      applies: (c) => c.string === 'line-continuation' },
    // --- FIX1 f5262842 vs the head tokenizer: what the class cost, one row per decision -------------------
    { id: 'fix1:object-in-interpolation', pair: 'fix1-vs-head', origin: 'review r2 P2-1 (S3), verbatim in test-js-scan.mjs',
      reason: 'an object literal at the head of an interpolation, then division: FIX1 took the object\'s `}` for the interpolation close',
      applies: (c) => c.predecessor === 'object-brace-close-bare' },
    { id: 'fix1:function-or-class-expression', pair: 'fix1-vs-head', origin: 'review r2 P2-1, widened by the S4 cells',
      reason: 'a function or class EXPRESSION\'s `}` ends a value, so the `/` after it divides; FIX1 read the brace as a block end and opened a regex. '
        + 'The five bare / async / generator forms arrived with the S4 cells: the same mechanism, five more shapes, and FIX1 misreads every one of them',
      applies: (c) => FUNCTION_EXPRESSION_BRACE.has(c.predecessor) },
    { id: 'fix1:trailing-dot-number', pair: 'fix1-vs-head', origin: 'review r2 P2-2',
      reason: 'a trailing-dot number (`1.`) is a complete value, so `1. / 2` divides; FIX1\'s last-character rule saw a `.`',
      applies: (c) => c.predecessor === 'number-trailing-dot' },
    { id: 'fix1:unicode-identifier', pair: 'fix1-vs-head', origin: 'review r2 P2-2',
      reason: 'a non-ASCII identifier ends a value; FIX1\'s ASCII word rule did not recognise it',
      applies: (c) => c.predecessor === 'identifier-unicode' },
    { id: 'fix1:regex-after-if-condition', pair: 'fix1-vs-head', origin: 'review r2 (maintainer ARM A on 30488be0)',
      reason: 'the `)` that closes an `if` CONDITION is followed by a statement, so a `/` there opens a regex; FIX1 read every `)` as a value end',
      applies: (c) => c.predecessor === 'if-condition-close' },
    { id: 'fix1:regex-after-case-block-brace', pair: 'fix1-vs-head', origin: 'review r2 (maintainer ARM A on 30488be0)',
      reason: 'the `}` that closes a case clause\'s block is a block end, so a `/` after it opens a regex; FIX1 read it as an object close',
      applies: (c) => c.predecessor === 'case-block-brace-close' },
    { id: 'fix1:regex-after-for-of-keyword', pair: 'fix1-vs-head', origin: 'GENERATED (this corpus) — no review round named it',
      reason: 'the `of` of a for-of head wants an operand, so `of /re/` is a regex; FIX1 treated `of` as a value because it is also an identifier '
        + '(the review sentence covered the OTHER half of this decision — `of` as a value, division — and that half FIX1 already read correctly)',
      applies: (c) => c.predecessor === 'keyword-of' },
    { id: 'fix1:regex-after-instanceof', pair: 'fix1-vs-head', origin: 'GENERATED (this corpus) — no review round named it',
      reason: '`instanceof` wants an operand, so `s instanceof /re/` is a regex; FIX1\'s keyword list did not carry it',
      applies: (c) => c.predecessor === 'keyword-instanceof' },
    // --- a residual of the HEAD reader itself, found by this corpus, reported, and now CLOSED -------------
    // RETIRED 2026-09-14: rule R3 closed it. The row stays, and its census count stays pinned at 0, because a
    // class that reads 0 forever is a regression guard; deleting it would throw that guard away. The same fact
    // is counted from the other side by `tok:await-is-a-name` below.
    { id: 'head-residual:await-is-a-name-to-the-tokenizer', pair: 'fix1-vs-head', issue: 799, origin: 'GENERATED (this corpus) — REPORTED under GH-799, CLOSED by FIX4 rule R3',
      reason: 'the ONLY divergence where the HEAD is the reader that differs from the grammar: acorn\'s standalone tokenizer emits `await` as a '
        + 'plain `name` token (async-ness is a PARSER decision), so the head reads `await /re/` as division while FIX1 read a regex. Pinned here so '
        + 'it cannot change unnoticed — pinning is NOT approval: changing cdp.mjs is a fix order\'s business. No tracked source carries the shape '
        + '(js-scan-measure reports 0 FIX1-vs-head differences over 418 files), so it is latent, not live. Re-verification NARROWED this finding: `yield /re/` does NOT share the limit — it reads as a regex in '
        + 'both readers, in statement and in expression position — so the residual is specific to `await`, not general to '
        + 'restricted productions. The narrowing came from re-verifying the claim, not from the run that produced it.',
      applies: (c) => c.predecessor === 'keyword-await' },
    // --- the tokenizer-era reader 30488be0 vs the head: WHAT FIX4 CHANGED, counted ------------------------
    // 30488be0 is the revision whose commit message claimed the regex-versus-division class was "closed by
    // construction". It was not (ORDER-TOOLS-B18-6 class S4, review round 3, four shapes found by hand in fifteen
    // probes). These three classes are that claim's retraction, expressed as a census: each one names a rule the
    // head reader now applies through acorn.Parser.extend, and the count is how many cells the rule moves.
    // Note what the reader pair is for: base and FIX1 both read all three classes CORRECTLY, so the base-vs-head
    // and fix1-vs-head columns are BLIND to S4 — the defect lived only in the intermediate reader, which is not
    // one of the three. A differential is necessary and not sufficient, and here is the measurement of that.
    { id: 'tok:optional-chain-property-is-a-keyword', pair: 'tok-vs-head', origin: 'review r3 S4 (ORDER-TOOLS-B18-6) — remedy rule R1',
      reason: 'after `?.` an IdentifierName is a PROPERTY NAME, so `obj?.return` ends a value and the `/` after it divides. The tokenizer-era reader '
        + 'kept the keyword\'s own semantics, which set exprAllowed, so it opened a regex and swallowed the rest of the line. Plain `obj.return` was '
        + 'already right (`dot-reserved-word` separates nothing here) — the defect was the `?.` path alone',
      applies: (c) => OPTIONAL_CHAIN_RESERVED_WORD.has(c.predecessor) },
    { id: 'tok:async-function-expression-is-a-declaration', pair: 'tok-vs-head', origin: 'review r3 S4 (ORDER-TOOLS-B18-6) — remedy rule R2',
      reason: 'the function/class context decision reads the token behind the `function` keyword; with `async` in front it saw a `name` and chose the '
        + 'STATEMENT context, so the expression\'s `}` read as a block end and the `/` after it opened a regex. The rule now looks behind `async` and '
        + 'reads a `name` lookbehind through its own exprAllowed. The non-async forms were already right, which is why the set is `async`-prefixed only',
      applies: (c) => ASYNC_FUNCTION_EXPRESSION_BRACE.has(c.predecessor) },
    { id: 'tok:await-is-a-name', pair: 'tok-vs-head', issue: 799, origin: 'GENERATED (this corpus), reported as GH-799 — remedy rule R3',
      reason: 'in a MODULE `await` is the operator and never an identifier, so `await /re/` is a regex. The standalone tokenizer emits `await` as a plain '
        + '`name` token because async-ness is a parser decision, and read a division. This is GH-799, and this row is the count of its remedy. It '
        + 'separates only at depth 0: from depth 1 up the cell sits inside a template, and blankStrings blanks a template whole, so the difference — '
        + 'which moves no delimiter — leaves no mark on the output. That blindness is the comparison function\'s, not the corpus\'s',
      applies: (c) => c.predecessor === 'keyword-await' },
  ];
}
export { divergenceClasses };

/** PINNED DEFECTS — a divergence where the HEAD reader, not the old one, disagrees with the grammar.
 *
 * A pin is an allowlist entry when it is SILENT. These are not silent: each one is bound to an issue in
 * committed data (not to a comment), asserts the EXACT current wrong output so that ANY change to the reader —
 * a fix or a regression — flips the assertion and forces this table to be updated, and prints a named
 * non-pass line in the suite output that a gate can read instead of reading the exit code.
 *
 * Pinning is NOT approval. Changing cdp.mjs is a fix order's business, never a test commit's.
 */
export const CLOSED_DEFECTS = Object.freeze([Object.freeze({
  id: 'head-residual:await-is-a-name-to-the-tokenizer',
  issue: 799,
  fixedBy: 'GH-750 FIX4 rule R3 (2026-09-14)',
  cell: 'keyword-await|d0|none|none|single',
  src: "const ob_s = 'plain';\nconst ob_v = ((async () => await /re/)());\n",
  // what the reader did BEFORE the remedy (30488be0 .. fdafd181), verbatim — the regex left unblanked because the tokenizer read a division
  wasOutput: "const ob_s =        ;\nconst ob_v = ((async () => await /re/)());\n",
  // what the grammar says, and what the head reads TODAY: in a module `await` is always a keyword, so `/re/` is a regex
  // and blanks to its own delimiters. The assertion in test-js-scan.mjs is now `=== grammarOutput`, and it is the arm that
  // stops the residual from coming back the next time somebody touches the context rules.
  grammarOutput: "const ob_s =        ;\nconst ob_v = ((async () => await /  /)());\n",
  why: 'acorn\'s standalone tokenizer emits `await` as a plain `name` token because async-ness is a PARSER decision. '
    + 'Moving from a heuristic to a principled tokenizer traded a case the heuristic got accidentally right for one the '
    + 'tokenizer gets wrong on principle. Latent, not live: 0 tracked sources carry the shape, it does not cascade, and it '
    + 'fails loud (an unblanked regex gains a false lint row) rather than quiet.',
})]);



/** PINNED DEFECTS — a divergence where the HEAD reader, not the old one, disagrees with the grammar.
 *
 * EMPTY, and empty is the correct state. It held exactly one row, GH-799, from `18233d6d` until FIX4; that row
 * is now in CLOSED_DEFECTS above with the rule that closed it, and it is asserted the other way round — the head
 * must AGREE with the grammar on it. A pin is an allowlist entry when it is silent, so the rules a pin must obey
 * stay written down here for the next one: bound to an issue in committed data (never to a comment), asserting
 * the EXACT current wrong output so that any change — a fix or a regression — flips the assertion, and printing
 * a named non-pass line the gate can read instead of reading the exit code. Pinning is NOT approval; changing
 * cdp.mjs is a fix order's business, never a test commit's. */
export const PINNED_DEFECTS = Object.freeze([]);


/** The classes that name a divergence for `pair` on this cell (empty = RED: an unnamed divergence). */
export function classifyDivergence(cell, pair) {
  return divergenceClasses().filter((k) => k.pair === pair && k.applies(cell)).map((k) => k.id);
}

/** Build one cell's module source. Everything is assembled HERE, inside a function, never as a top-level
 * const — the band lint reads this file and judges declaration lines raw. */
function cellSource(pred, depth, interp, comment, str) {
  let body = pred.expr;
  if (depth > 0) {
    body = interp.wrap(body);
    for (let d = 0; d < depth; d++) body = '`t' + d + ' ${' + body + '} tail`';
  }
  const main = comment.decorate(`const ob_v = ${body};`);
  return [...comment.extra(), str.line(), main, ''].join('\n');
}

/** Generate the whole corpus. Returns the cells in a fixed order, the skipped combinations with the rule that
 * removed each, and the wall time in ms. A cell is `{ id, predecessor, slash, depth, interpolation, comment,
 * string, src }`; `id` is the cell's coordinates and is stable across runs. */
export function generateCorpus() {
  const t0 = process.hrtime.bigint();
  const preds = predecessorCells(); const depths = depthValues(); const interps = interpolationContexts();
  const comments = commentStates(); const strings = stringStates(); const rules = skipRules();
  const cells = []; const skipped = [];
  for (const pred of preds) {
    for (const depth of depths) {
      for (const interp of interps) {
        for (const comment of comments) {
          for (const str of strings) {
            const coords = { predecessor: pred.name, depth, interp: interp.name, comment: comment.name, string: str.name };
            const rule = rules.find((r) => r.applies(coords));
            const id = `${pred.name}|d${depth}|${interp.name}|${comment.name}|${str.name}`;
            if (rule) { skipped.push({ id, rule: rule.id }); continue; }
            cells.push({ id, predecessor: pred.name, slash: pred.slash, depth, interpolation: interp.name,
              comment: comment.name, string: str.name, src: cellSource(pred, depth, interp, comment, str) });
          }
        }
      }
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { cells, skipped, rules: rules.map((r) => ({ id: r.id, reason: r.reason })), ms,
    axes: { predecessor: preds.length, depth: depths.length, interpolation: interps.length, comment: comments.length, string: strings.length } };
}

/** One line per consumer log: the size, the axes, the wall time and every skip rule with its count. */
export function corpusSummary(corpus = generateCorpus()) {
  const byRule = new Map();
  for (const s of corpus.skipped) byRule.set(s.rule, (byRule.get(s.rule) ?? 0) + 1);
  const axes = Object.entries(corpus.axes).map(([k, v]) => `${k} ${v}`).join(' × ');
  const skips = corpus.rules.map((r) => `    SKIP RULE ${r.id} (${byRule.get(r.id) ?? 0} cells): ${r.reason}`).join('\n');
  return `  js-scan corpus: ${corpus.cells.length} generated cells (${axes}), ${corpus.skipped.length} skipped, built in ${corpus.ms.toFixed(1)} ms\n`
    + `${axisSetEqualityLine(axisSetEquality(corpus))}\n${skips}`;
}

/** ---- THE COMMITTED INVENTORY: the floor, as DATA a test asserts against ------------------------------
 * js-scan-corpus.inventory.json is the corpus census checked into the repo: the axis value NAMES, the cell
 * counts per predecessor, the skip-rule counts, and the three-way divergence census by class name. It is the
 * floor. test-js-scan.mjs compares the generator's LIVE output against it by name and by count, so an edit
 * that drops a decision-surface class, an axis value or a separating class FAILS instead of passing quietly —
 * a law nobody can break by accident is worth more than a law in a comment.
 * To change it deliberately: `node web/tools/js-scan-corpus.mjs --write-inventory`, and say in the commit
 * message which class moved and why. A class leaves only through RETIRED above, never by deletion. */
/** The reader as it stood at 30488be0 — the revision whose commit message claimed the regex-versus-division
 * class was "closed by construction". It is a census COLUMN, not a base: it is the only one of the four readers
 * that carries class S4, so it is the only one against which the S4 remedy is measurable. cdp.mjs and
 * ci-bands.mjs are byte-identical from 30488be0 through fdafd181, so this one sha stands for that whole era. */
export const TOKENIZER_ERA_READER = '30488be0';

export const INVENTORY_FILE = fileURLToPath(new URL('./js-scan-corpus.inventory.json', import.meta.url));

/** Cells per predecessor — the count that falls if a depth, interpolation, comment or string value is dropped. */
export function cellsPerPredecessor(corpus = generateCorpus()) {
  const per = {};
  for (const c of corpus.cells) per[c.predecessor] = (per[c.predecessor] ?? 0) + 1;
  return per;
}

/** ---- DECLARED SURFACE vs EMITTED SURFACE ------------------------------------------------------------
 * The axis values that actually appear on a generated cell. CORPUS_FLOOR is what this generator DECLARES it
 * enumerates; this is what it EMITS. They are computed by two different routes on purpose — the floor from the
 * axis functions, this from the cells — so a value that is declared and then deduplicated, skipped or dropped
 * somewhere in the product shows up as a difference instead of being invisible.
 *
 * WHY THIS EXISTS. Review round 3 class S6 measured the gap directly: `js-scan-corpus.mjs` contained zero
 * occurrences of `?.`, so the generated corpus COULD NOT contain the failing class, and the suite passing was
 * therefore not evidence of anything. A declared surface that diverges from the emitted surface is the census
 * bug one level down, and the remedy is the same one the SP census took in `bcddfa5a`: publish the instrument's
 * own axis list as data and assert SET EQUALITY, in BOTH directions. Subset is not enough in either direction —
 * declared-not-emitted is coverage claimed and not delivered, emitted-not-declared is coverage delivered and
 * not pinned, and the second one is how an axis value gets deleted later without a single test going red. */
export function emittedAxisValues(corpus = generateCorpus()) {
  const seen = { predecessor: new Set(), depth: new Set(), interpolation: new Set(), comment: new Set(), string: new Set() };
  for (const c of corpus.cells) {
    seen.predecessor.add(c.predecessor); seen.depth.add(`d${c.depth}`); seen.interpolation.add(c.interpolation);
    seen.comment.add(c.comment); seen.string.add(c.string);
  }
  const out = {};
  for (const [axis, set] of Object.entries(seen)) out[axis] = [...set].sort();
  return out;
}

/** SET EQUALITY between the declared surface (CORPUS_FLOOR minus RETIRED) and the emitted surface. Returns the
 * verdict and, per axis, exactly which names are on one side only — a boolean nobody can act on is not a result. */
export function axisSetEquality(corpus = generateCorpus()) {
  const emitted = emittedAxisValues(corpus);
  const perAxis = Object.keys(emitted).map((axis) => {
    const declared = CORPUS_FLOOR[axis].filter((v) => !RETIRED[v]);
    const e = emitted[axis].filter((v) => !RETIRED[v]);
    return { axis, declared: declared.length, emitted: e.length,
      declaredNotEmitted: declared.filter((v) => !e.includes(v)), emittedNotDeclared: e.filter((v) => !declared.includes(v)) };
  });
  return { equal: perAxis.every((a) => !a.declaredNotEmitted.length && !a.emittedNotDeclared.length), perAxis };
}

/** The one-line verdict, printed by every consumer next to the corpus size. */
export function axisSetEqualityLine(eq = axisSetEquality()) {
  const total = eq.perAxis.reduce((n, a) => n + a.declared, 0);
  const emitted = eq.perAxis.reduce((n, a) => n + a.emitted, 0);
  if (eq.equal) return `  js-scan corpus surface: ${total} declared axis values = ${emitted} emitted, SET EQUAL on all ${eq.perAxis.length} axes`;
  const bad = eq.perAxis.filter((a) => a.declaredNotEmitted.length || a.emittedNotDeclared.length)
    .map((a) => `${a.axis}: declared-not-emitted [${a.declaredNotEmitted.join(' ')}] emitted-not-declared [${a.emittedNotDeclared.join(' ')}]`);
  return `  js-scan corpus surface: NOT SET EQUAL (${total} declared, ${emitted} emitted) — ${bad.join('; ')}`;
}

/** The census the inventory pins: sizes, axis names DECLARED and EMITTED, per-predecessor counts, skip-rule
 * counts and — when the readers are supplied — the divergence counts by class name. `readers` is
 * `{ base, fix1, tok, head }`, each `{ sha, blank(src) }`; without it the differential section is omitted. */
export function buildInventory(readers = null, corpus = generateCorpus()) {
  const byRule = {};
  for (const s of corpus.skipped) byRule[s.rule] = (byRule[s.rule] ?? 0) + 1;
  const inv = {
    note: 'GENERATED census of the js-scan decision-surface corpus — the FLOOR. Do not hand-edit: '
      + 'node web/tools/js-scan-corpus.mjs --write-inventory. A class leaves only through RETIRED in js-scan-corpus.mjs.',
    corpus: { cells: corpus.cells.length, skipped: corpus.skipped.length, axes: corpus.axes },
    axisValues: { predecessor: CORPUS_FLOOR.predecessor.slice(), depth: CORPUS_FLOOR.depth.slice(),
      interpolation: CORPUS_FLOOR.interpolation.slice(), comment: CORPUS_FLOOR.comment.slice(), string: CORPUS_FLOOR.string.slice() },
    emittedAxisValues: emittedAxisValues(corpus),
    axisSetEquality: axisSetEquality(corpus),
    cellsPerPredecessor: cellsPerPredecessor(corpus),
    skipRules: byRule,
    retired: { ...RETIRED },
  };
  if (readers) inv.differential = readerCensus(readers, corpus);
  // the pinned and the CLOSED defects both travel in the committed DATA, bound to their issue — not in a
  // comment somebody can drop. A closed row keeps its issue and the rule that closed it: that is how a future
  // reader learns the residual existed and what answered it, instead of finding no trace of either.
  inv.pinnedDefects = PINNED_DEFECTS.map((d) => ({ id: d.id, issue: d.issue, cell: d.cell, src: d.src,
    headOutput: d.headOutput, grammarOutput: d.grammarOutput }));
  inv.closedDefects = CLOSED_DEFECTS.map((d) => ({ id: d.id, issue: d.issue, fixedBy: d.fixedBy, cell: d.cell, src: d.src,
    wasOutput: d.wasOutput, grammarOutput: d.grammarOutput }));
  return inv;
}

/** The differential itself: every cell read by all FOUR readers, every difference classified.
 *
 * WHY FOUR. It was three — base 868bbd57, FIX1 f5262842, head — and three could not see class S4. The base and
 * FIX1 readers both get `obj?.return / 2` and `async function () {} / 2` RIGHT; the reader that got them wrong
 * was the intermediate tokenizer at 30488be0, which was not one of the three. So the corpus enumerated a surface
 * the differential was structurally unable to judge, and the suite stayed green through a P1 regression. Adding
 * `tok` is the repair, and it is also the demonstration: a differential is chosen when you choose its columns,
 * and a column you left out is a class you cannot see. Every reader this PR has shipped is now a column.
 *
 * Each reader is `{ sha, blank(src) }`. Returns the counts and — the RED case — the unnamed divergences in full. */
export function readerCensus({ base, fix1, tok, head }, corpus = generateCorpus()) {
  const t0 = process.hrtime.bigint();
  const classes = {}; const unnamed = [];
  for (const k of divergenceClasses()) classes[k.id] = 0;
  const pairCounts = { baseVsFix1: 0, baseVsHead: 0, fix1VsHead: 0, tokVsHead: 0 };
  let headUnreadable = 0;
  const read = (r, src) => { try { return r.blank(src); } catch (e) { return `THROW ${e.message.slice(0, 80)}`; } };
  const firstDiff = (a, b) => { let i = 0; while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++; return i; };
  for (const cell of corpus.cells) {
    const h = read(head, cell.src); const b = read(base, cell.src); const f = read(fix1, cell.src); const t = read(tok, cell.src);
    if (typeof h === 'string' && h.startsWith('THROW ')) headUnreadable += 1;
    if (b !== f) pairCounts.baseVsFix1 += 1;
    for (const [pair, key, other] of [['base-vs-head', 'baseVsHead', b], ['fix1-vs-head', 'fix1VsHead', f], ['tok-vs-head', 'tokVsHead', t]]) {
      if (other === h) continue;
      pairCounts[key] += 1;
      const named = classifyDivergence(cell, pair);
      if (!named.length) unnamed.push({ pair, id: cell.id, src: cell.src, base: b, fix1: f, tok: t, head: h, firstDiff: firstDiff(other, h) });
      for (const id of named) classes[id] += 1;
    }
  }
  return { base: base.sha, fix1: fix1.sha, tok: tok.sha, cells: corpus.cells.length, ...pairCounts,
    headUnreadable, classes, unnamed, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
}

const main = async () => {
  const argv = process.argv.slice(2);
  const corpus = generateCorpus();
  console.log(corpusSummary(corpus));
  if (argv.includes('--write-inventory')) {
    // the readers are loaded HERE (never at import time): the git-backed loader belongs to the measurement
    // tool, and the generator itself must stay a pure, dependency-free function
    const fs = await import('node:fs');
    const { loadBaseReaders, REPO, DEFAULT_BASE } = await import('./js-scan-measure.mjs');
    const head = await import('./cdp.mjs');
    const B = await loadBaseReaders(DEFAULT_BASE, REPO); const F = await loadBaseReaders('f5262842', REPO);
    const T = await loadBaseReaders(TOKENIZER_ERA_READER, REPO);
    const readers = {
      base: { sha: B.sha, blank: (s) => B.cib.blankStrings(B.cdp.stripComments(s)) },
      fix1: { sha: F.sha, blank: (s) => F.cdp.blankStrings(F.cdp.stripComments(s)) },
      tok: { sha: T.sha, blank: (s) => T.cib.blankStrings(T.cdp.stripComments(s)) },
      head: { sha: 'HEAD', blank: (s) => head.blankStrings(head.stripComments(s)) },
    };
    const inv = buildInventory(readers, corpus);
    if (!inv.axisSetEquality.equal) {
      console.error(`REFUSING to write the inventory: ${axisSetEqualityLine(inv.axisSetEquality)}`);
      console.error('  the declared surface and the emitted surface must be the SAME SET — fix the generator or the floor, not the inventory');
      process.exit(1);
    }
    if (inv.differential.unnamed.length) {
      console.error(`REFUSING to write the inventory: ${inv.differential.unnamed.length} UNNAMED divergence(s); name them in divergenceClasses() first`);
      console.error(JSON.stringify(inv.differential.unnamed[0], null, 1));
      process.exit(1);
    }
    delete inv.differential.unnamed; delete inv.differential.ms; // the census is the pin; wall time is a log line, not data
    fs.writeFileSync(INVENTORY_FILE, `${JSON.stringify(inv, null, 1)}\n`);
    console.log(`  wrote ${INVENTORY_FILE}`);
    return;
  }
  const n = argv.includes('--sample') ? Number(argv[argv.indexOf('--sample') + 1]) : 0;
  for (let i = 0; i < n && i < corpus.cells.length; i++) {
    const step = Math.floor(corpus.cells.length / Math.max(n, 1));
    const c = corpus.cells[i * step];
    console.log(`\n--- ${c.id} (slash = ${c.slash}) ---\n${c.src}`);
  }
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
