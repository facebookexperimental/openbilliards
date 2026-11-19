// Copyright (c) Meta Platforms, Inc. and affiliates.

// acorn-obparser.mjs — the ONE patched JavaScript reader (GH-750 FIX4, review round 3 on #795, class S4).
//
// WHY THIS FILE EXISTS, AND WHY IT IS NOT AN EDIT TO acorn.mjs
// -----------------------------------------------------------
// acorn resolves `/` — regex literal or division operator — from a token-context stack updated by
// `updateContext(prevType)`: ONE token of lookbehind, no re-lex, and no feedback from the parser. Three places
// where that lookbehind is not enough are patched here, through acorn's OWN extension point
// (`Parser.extend`, vendor/acorn/acorn.mjs:667), so the vendored file stays BYTE-IDENTICAL. That matters
// beyond hygiene: two entry points read JavaScript in this repo — this lib's parse-first-fence and
// web/tools/cdp.mjs's js-scan readers — and both must be the same reader. A patch inside the vendored bytes
// would make "which acorn" a question with two answers.
//
// THE CLAIM THIS FILE DOES NOT MAKE. Regex-versus-division is NOT decidable from the token immediately behind
// the `/`. The three sources below are the proof. Every one is a legal ES MODULE (V8, `node --check` on a
// `.mjs`), in every one the token before `function` is a colon, and the correct answer is not the same:
//     switch (x) { case 1: function f() {}
//     /re/.test(y); }                          // a DECLARATION in the case's block, so this is a REGEX
//     const n = a ? b : function () {} / 2;    // the conditional's alternative is an OPERAND, so this DIVIDES
//     const o = { k: function () {} / 2 };     // the property's value is an OPERAND, so this DIVIDES
// Measured, not assumed (web/tools/test-js-scan.mjs S4/A6): this reader gets the first and the third right and
// the second WRONG — it opens a regex at the `/` and runs on. What happens next is NOT one thing, and the
// difference is the whole point of the certificate:
//   * with nothing after it to close the regex, the tokenizer raises and cdp.mjs reports a named JsScanError;
//   * with a trailing `// …` comment to close it, the source tokenizes but the GRAMMAR refuses the result, and
//     cdp.mjs reports `js-scan-uncertified <line>:<col> …`;
//   * with a LINE BREAK before the `/` as well, the wrong reading is itself a legal program. The parse succeeds,
//     nothing is reported, and a launch call vanishes into a "regex". That is the hole, and it is not assumed to
//     be empty: js-scan-surface.mjs measures it at 9 sources out of 189590 V8-certified ones.
// So the rules below close the classes that ARE decidable from the token stream, and the CERTIFICATE (a
// successful parse, see cdp.mjs acornSpans) covers most of what is left — necessary, and measured not to be
// sufficient.
//   The pair this comment carried before FIX4 was `l: function f() {}` against the conditional. It is a true
// pair in a SCRIPT and no pair at all here: a labelled function declaration is a SyntaxError in strict mode, so
// under OB_PARSE_OPTIONS (`sourceType: 'module'`, which R3 needs) the first half is not a program. A proof of a
// reader's limit has to be written in the dialect that reader reads.
//
// THE THREE RULES, each measured against V8 over an enumerated surface (web/tools/js-scan-surface.mjs):
//   R1  `obj?.return / 2`  — after `?.` an IdentifierName is a PROPERTY NAME. Stock acorn suppresses the
//       keyword reading only after a plain `.` (acorn.mjs:2520), so after `?.` every keyword whose
//       `beforeExpr` is true leaves `exprAllowed` on and the following `/` opens a regex that swallows the
//       rest of the line. The broken set was SWEPT, not guessed: of acorn's 35 keyword token types exactly
//       the 13 with `beforeExpr === true` are wrong after `?.` (case default delete do else extends in
//       instanceof new return throw typeof void), plus the contextual `of`, which is a `name` token. Zero
//       partition mismatches.
//   R2  `x = async function () {} / 2`  — `_function` / `_class` pick f_expr vs f_stat from `prevType`
//       (acorn.mjs:2572). With `async` in front, `prevType` is a `name`, whose `beforeExpr` is false, so an
//       async function EXPRESSION is filed as a declaration and its closing `}` turns `exprAllowed` back on.
//       The decision is re-anchored on the token BEFORE `async`, and only when no line break separates them:
//       `let n = async` newline `function g() {}` is ASI, and there the `async` really did end a statement.
//       A bare `name` lookbehind is answered from the `exprAllowed` that name itself left behind, which is how
//       the contextual keywords carry their meaning — `for (const q of function () {} / 2 ? [] : [])` is an
//       expression because `of` asked for an operand, while `class C { get function() {} }` is not.
//   R3  `await /re/`  — the standalone tokenizer emits `await` as a plain `name` because async-ness is a
//       PARSER decision, so `await /re/` read as a division. In a MODULE `await` is always the operator, so a
//       module reader can decide it without the parser. This closes GH-799, which 18233d6d pinned as a known
//       head residual in web/tools/js-scan-corpus.mjs.
//
// The rules add no state to the token stream beyond one extra lookbehind slot (`_obPrev2`), and over every
// tracked JavaScript source in this repo the patched and the stock token streams are IDENTICAL — the surface
// they change is the surface stock acorn was reading wrong.
import * as acorn from './vendor/acorn/acorn.mjs';

/** The rule set as DATA, so a test can assert coverage by name instead of by reading this comment. */
export const OB_RULES = Object.freeze([
  Object.freeze({ id: 'R1', what: 'after `?.` an IdentifierName is a property name', probe: 'const n = obj?.return / 2;' }),
  Object.freeze({ id: 'R2', what: 'the function/class context decision looks behind `async` and reads a `name` lookbehind through its own exprAllowed', probe: 'const n = async function () {} / 2;' }),
  Object.freeze({ id: 'R3', what: 'in a module `await` is the operator, never an identifier', probe: 'const n = await /re/;' }),
]);

/** The options every reader in this repo uses. `sourceType: module` is not a preference: R3 depends on it,
 * and every JavaScript source this repo tracks is an ES module. */
export const OB_PARSE_OPTIONS = Object.freeze({ ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, locations: true });

/** The patched Parser, built ON FIRST USE. Lazy is not an optimisation here: parse-first-fence.mjs judges the
 * MODULE SCOPE of everything it imports, and a `Parser.extend` call at module scope is a call it cannot
 * allowlist. A function definition executes nothing, so the whole rule set stays inside one.
 * The returned class's static `parse` and `tokenizer` are acorn's own, so both entry points come for free. */
let PARSER = null;
export function obParser() {
  if (PARSER) return PARSER;
  const tt = acorn.tokTypes;
  const tc = acorn.tokContexts;
  const NL = acorn.lineBreak;
  PARSER = acorn.Parser.extend((Base) => class ObScanParser extends Base {
    updateContext(prevType) {
      const type = this.type;
      // the token BEFORE prevType, captured at entry so it carries the `exprAllowed` that token left behind
      const prev2 = this._obPrev2;
      this._obPrev2 = { type: prevType, start: this.lastTokStart, end: this.lastTokEnd, exprAllowed: this.exprAllowed };
      // R1 — `obj?.return`, `obj?.in`, `obj?.typeof` …: the name after `?.` is a property, so no operand follows
      if (prevType === tt.questionDot && (type.keyword || type === tt.name)) { this.exprAllowed = false; return; }
      // R3 — a module's `await` is the AwaitExpression operator, so an operand follows it
      if (type === tt.name && prevType !== tt.dot && prevType !== tt.questionDot
        && this.options.sourceType === 'module' && this.input.slice(this.start, this.end) === 'await') { this.exprAllowed = true; return; }
      // R2 — is this `function` / `class` an expression or a declaration?
      if (type === tt._function || type === tt._class) {
        let aType = prevType; let aStart = this.lastTokStart; let aEnd = this.lastTokEnd; let aAllowed = this.exprAllowed;
        if (prevType === tt.name && this.input.slice(aStart, aEnd) === 'async' && !NL.test(this.input.slice(aEnd, this.start))) {
          // `async function` is one operand-position pair: the decision belongs to the token before `async`
          if (prev2) { aType = prev2.type; aStart = prev2.start; aEnd = prev2.end; aAllowed = prev2.exprAllowed; }
          else { aType = tt.eof; aStart = 0; aEnd = 0; aAllowed = false; } // `async function` at the very start of input is a declaration
        }
        if (aType === tt.name) { this.context.push(aAllowed ? tc.f_expr : tc.f_stat); this.exprAllowed = false; return; }
        if (aType !== prevType) {
          // hand acorn's own rule the re-anchored lookbehind, SPAN INCLUDED — it reads `input.slice(lastTokEnd, start)`
          // for the `return` line-break case, so moving the type without the span would answer a different question
          const s = this.lastTokStart; const e = this.lastTokEnd; const st = this.start;
          this.lastTokStart = aStart; this.lastTokEnd = aEnd; this.start = s;
          try { super.updateContext(aType); } finally { this.lastTokStart = s; this.lastTokEnd = e; this.start = st; }
          return;
        }
      }
      super.updateContext(prevType);
    }
  });
  return PARSER;
}
