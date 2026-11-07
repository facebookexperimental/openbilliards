// Copyright (c) Meta Platforms, Inc. and affiliates.

// token-grep.mjs — the feature-006 design-token gate (feature 006 (internal spec) T013), moved
// out of a raw ci.yml grep pipeline (issue GH-535).
//
// THE LAW IS UNCHANGED: UI chrome consumes --ob-* tokens only. Every scanned
// file fails on a hardcoded color literal — #hex (3..8 digits), rgb(/rgba(,
// oklch( — with exactly the escapes the shell pipeline allowed:
//
//   * `ob-color-exempt` line annotations (whole-line escape, by design: the
//     annotation names WHY the literal is content, not chrome);
//   * `BALL_COLORS` lines (game content, not chrome);
//   * token expressions — var(--ob-*, fallback) / tok('--ob-x', fallback) /
//     v('--ob-x', fallback) are stripped PER-EXPRESSION, never per-line, so a
//     hardcoded color sitting beside a token use on the same line still fails
//     (the #49 review-finding-4 rule the old sed stages encoded).
//
// WHAT GH-535 CHANGES: comments are no longer part of the scanned surface.
// The raw grep read issue/PR references in code comments as colors — 'PR
// #531' and '#523' are valid 3-digit hex under #[0-9a-fA-F]{3,8}\b — and
// cost two red-CI rounds in one week (dc9eeb85, b1c6fecc), each "fixed" by
// rewording a truthful comment and losing GitHub's auto-linking. A color in
// a comment paints nothing, so the right surface is CODE ONLY:
//
//   * .js/.mjs — // line comments and /* */ block comments are blanked by a
//     STRING-AWARE lexer: 'https://…' never opens a comment, and a regex
//     literal is skipped verbatim (a `/*` INSIDE a regex must not open a
//     phantom block comment and swallow real code — that would be a false
//     NEGATIVE, the one direction this gate must never err in);
//   * .css — /* */ blocks, string-aware (url("/*") stays code);
//   * .html — <!-- --> blocks. Inline <script>/<style> bodies are NOT
//     comment-stripped (kept fully scanned — the conservative direction).
//
// Comment bytes are replaced with spaces, newlines preserved, so reported
// line numbers stay exact and a literal HIDING beside a trailing comment is
// still caught on its own line. Everything the lexer is unsure about stays
// IN the scanned text: uncertainty may only ever produce a false positive.
//
// The --selftest mode red-proves both directions and runs as its own CI
// step: the historical false-positive strings (verbatim from dc9eeb85^ and
// b1c6fecc^) must pass, and hardcoded-color canaries — including the
// digit-only grays #333/#523-as-a-real-CSS-color case that forbids any
// "digits-only means issue number" shortcut — must still fail.
//
// usage:
//   node web/tools/token-grep.mjs <file> [<file>...]   # gate; exit 1 on hits
//   node web/tools/token-grep.mjs --selftest           # red-proof fixtures

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(/;

// ---------------------------------------------------------------------------
// comment stripping (per file type; comment bytes -> spaces, newlines kept)
// ---------------------------------------------------------------------------

// A `/` in JS code position opens a regex literal (not division) when the
// previous significant char cannot end an expression, or the previous word
// is an expression-position keyword. Misjudging regex-vs-division only ever
// keeps MORE text in the scanned surface (false-positive direction), except
// the `/*`-inside-a-regex-read-as-division case, which the keyword list and
// the punctuator set below exist to prevent.
const REGEX_PREV_PUNCT = new Set('(,=:[!&|?{};+-*/%~^<>'.split(''));
const REGEX_PREV_WORDS = new Set([
  'return', 'case', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
  'void', 'do', 'else', 'yield', 'await', 'throw', 'default',
]);
const CONTROL_HEAD_WORDS = new Set(['if', 'for', 'while', 'with']);

// The word (possibly '') immediately preceding position-end of `out`,
// skipping trailing whitespace (blanked comments are whitespace there).
function precedingWord(out) {
  let j = out.length - 1;
  while (j >= 0 && /\s/.test(out[j])) j -= 1;
  const e = j;
  while (j >= 0 && /[A-Za-z0-9_$]/.test(out[j])) j -= 1;
  return out.slice(j + 1, e + 1);
}

// Decide by looking BACKWARD through the already-emitted code (comments are
// spaces there, so they are skipped for free): a trailing identifier must be
// an expression-position keyword; a trailing `)` is a regex position only
// when it closed a CONTROL-FLOW HEAD — `if (ok) /re/.test(s)` (review round-1
// finding: reading that `/` as division let the escaped-slash-then-`*` open
// a phantom block comment) — never when it ended a call/group like `(a+b)/2`.
// Which head the `)` closed is FORWARD-TRACKED by the lexer's paren stack
// (review round-2 finding: a backward paren walk miscounts `')'` inside a
// kept-verbatim string), and passed in as `lastCloseWord`. Otherwise the
// last significant char must be a punctuator that cannot end an expression.
function regexCanFollow(out, lastCloseWord) {
  let j = out.length - 1;
  while (j >= 0 && /\s/.test(out[j])) j -= 1;
  if (j < 0) return true; // start of input
  if (/[A-Za-z0-9_$]/.test(out[j])) {
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(out[k])) k -= 1;
    return REGEX_PREV_WORDS.has(out.slice(k + 1, j + 1));
  }
  if (out[j] === ')') return CONTROL_HEAD_WORDS.has(lastCloseWord);
  return REGEX_PREV_PUNCT.has(out[j]);
}

// A small pushdown lexer, because flat single-pass scanning has real
// false-NEGATIVE paths (review round 2): nested template literals — the
// nested opening backtick of `${`…`}` must not read as the outer template's
// close (a `/*` in the nested text would then swallow the rest of the file)
// — and `)` control-head attribution across strings. Frames:
//   { interp:false, braces:0 }  top-level code
//   { interp:true,  braces:n }  code inside a template `${ … }`
// plus a template-text mode entered on a backtick; `${` pushes an interp
// code frame, whose depth-0 `}` returns to the template text.
function stripJs(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const frames = [{ interp: false, braces: 0 }];
  let inTemplate = false;
  const parens = []; // preceding word of each open '(' in CODE position
  let lastCloseWord = ''; // preceding word of the most recently closed '('
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (inTemplate) {
      // Template TEXT: verbatim (scanned). Only three special sequences.
      if (c === '\\' && i + 1 < n) { out += c + d; i += 2; continue; }
      if (c === '`') { out += c; i += 1; inTemplate = false; continue; }
      if (c === '$' && d === '{') {
        out += '${';
        i += 2;
        frames.push({ interp: true, braces: 0 });
        inTemplate = false;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (c === '/' && d === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }
    if (c === "'" || c === '"') {
      // String literal: verbatim (scanned) through the close.
      out += c;
      i += 1;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < n) { out += src[i] + src[i + 1]; i += 2; continue; }
        out += src[i];
        i += 1;
      }
      if (i < n && src[i] === c) { out += c; i += 1; }
      continue;
    }
    if (c === '`') {
      out += c;
      i += 1;
      inTemplate = true;
      continue;
    }
    if (c === '/' && regexCanFollow(out, lastCloseWord)) {
      // Regex literal: verbatim (scanned) through the unescaped close.
      out += c;
      i += 1;
      let inClass = false;
      while (i < n && (inClass || src[i] !== '/') && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < n) { out += src[i] + src[i + 1]; i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        out += src[i];
        i += 1;
      }
      if (i < n && src[i] === '/') { out += '/'; i += 1; }
      continue;
    }
    if (c === '(') {
      parens.push(precedingWord(out));
    } else if (c === ')') {
      lastCloseWord = parens.pop() ?? '';
    } else if (c === '{') {
      frames[frames.length - 1].braces += 1;
    } else if (c === '}') {
      const top = frames[frames.length - 1];
      if (top.interp && top.braces === 0) {
        frames.pop();
        inTemplate = true; // back into the enclosing template's text
      } else if (top.braces > 0) {
        top.braces -= 1;
      }
    }
    out += c;
    i += 1;
  }
  return out;
}

function stripCss(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }
    if (c === "'" || c === '"') {
      out += c;
      i += 1;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < n) { out += src[i] + src[i + 1]; i += 2; continue; }
        out += src[i];
        i += 1;
      }
      if (i < n && src[i] === c) { out += c; i += 1; }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

// `<!--` opens a markup comment only in DATA position. Not inside a tag (a
// quoted attribute value like data-marker="<!--" is plain text — review
// round-1 finding: blanking from there swallowed real markup through the
// next `-->` or EOF), and not inside a RAW-TEXT element (`<script>`/
// `<style>`/`<textarea>`/`<title>` bodies are character data — review
// round-2 finding; those bodies stay fully scanned, verbatim, which is also
// the documented inline-code posture). Tag/quote/raw-text state only ever
// SUPPRESSES stripping, so a misread — e.g. a bare `<` comparison inside
// unwrapped inline code — keeps more text in the surface, never less.
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

function stripHtml(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let inTag = false;
  let quote = '';
  let tagName = '';
  let rawUntil = ''; // e.g. '</script' — verbatim until this reappears
  while (i < n) {
    const c = src[i];
    if (rawUntil) {
      if (src.slice(i, i + rawUntil.length).toLowerCase() === rawUntil) {
        rawUntil = ''; // reprocess the closing tag as a normal tag
        continue;
      }
      out += c;
      i += 1;
      continue;
    }
    if (!inTag && src.startsWith('<!--', i)) {
      out += '    ';
      i += 4;
      while (i < n && !src.startsWith('-->', i)) {
        out += src[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < n) { out += '   '; i += 3; }
      continue;
    }
    if (inTag) {
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        inTag = false;
        if (RAW_TEXT_ELEMENTS.has(tagName)) rawUntil = `</${tagName}`;
      }
    } else if (c === '<') {
      inTag = true;
      let k = i + 1;
      const closing = src[k] === '/';
      if (closing) k += 1;
      let name = '';
      while (k < n && /[A-Za-z0-9]/.test(src[k])) { name += src[k]; k += 1; }
      tagName = closing ? '' : name.toLowerCase();
    }
    out += c;
    i += 1;
  }
  return out;
}

function stripComments(src, path) {
  if (path.endsWith('.css')) return stripCss(src);
  if (path.endsWith('.html') || path.endsWith('.htm')) return stripHtml(src);
  return stripJs(src);
}

// ---------------------------------------------------------------------------
// the gate
// ---------------------------------------------------------------------------

function stripTokenExprs(line) {
  return line
    // var(--ob-…) with one nesting level, exactly the old sed class pattern
    .replace(/var\(--ob-[^()]*(?:\([^()]*\)[^()]*)*\)/g, '')
    .replace(/(?:tok|v)\('--ob-[^)]*\)/g, '');
}

export function scanSource(path, src) {
  const rawLines = src.split('\n');
  const codeLines = stripComments(src, path).split('\n');
  const hits = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const raw = rawLines[i];
    // The whole-line escapes check the RAW line: the ob-color-exempt marker
    // lives in a comment, which the code view no longer carries.
    if (raw.includes('ob-color-exempt')) continue;
    if (raw.includes('BALL_COLORS')) continue;
    if (COLOR_RE.test(stripTokenExprs(codeLines[i] ?? ''))) {
      hits.push(`${path}:${i + 1}:${raw}`);
    }
  }
  return hits;
}

function runGate(files) {
  let bad = 0;
  for (const f of files) {
    const hits = scanSource(f, readFileSync(f, 'utf8'));
    for (const h of hits) console.error(h);
    bad += hits.length;
  }
  if (bad > 0) {
    console.error(`token-grep: ${bad} line(s) with hardcoded color literals — use`
      + ` --ob-* tokens (web/app/ui/tokens.css), or annotate content literals`
      + ` ob-color-exempt`);
    process.exit(1);
  }
  console.log(`token-grep: ${files.length} file(s) clean`);
}

// ---------------------------------------------------------------------------
// GH-668 B-K23 / B-K13 (S5 kit step 8) — the HYGIENE law, on the same
// comment-stripped code surface as the colour law:
//
//   * line-height literals (`normal`, `1.35`, any bare number / px / em) —
//     the ladder is --ob-lh-tight / --ob-lh-body / --ob-lh-control /
//     --ob-lh-glyph (tokens.css), nothing else;
//   * bare `z-index:` integers — the stacking order is the semantic
//     --ob-z-* scale (tokens.css; token-receipts pins its order);
//   * `::-webkit-scrollbar` recipes and `scrollbar-width / -color` outside
//     kit.css — the kit owns ONE thin-scrollbar rule (.ob-scroll + its own
//     panes) and the strip's hide idiom; surfaces add the class;
//   * `text-transform: uppercase` outside kit.css — the caps voice is the
//     kit's G7 role (.ob-caps / .ob-badge / section heads), which is also
//     where its :lang(ja|ko|zh) arm lives; a surface restating uppercase
//     paints small grey CJK text again (B-K13);
//   * `letter-spacing` literals (0 = no tracking, allowed) — tracking comes
//     from --ob-track-caps / --ob-track-display only.
//
// Surfaces the slices have not reached yet ride a FROZEN ledger (HYG_OK):
// one row per file naming the EXACT literal set it may still carry and the
// row that retires it. The ledger only shrinks and every row must still
// match something (liveness) — a row that stops matching is red, so the
// ledger cannot rot into documentation. kit.css may carry only its own
// law-bearing sites (HYG_KIT_OWN); tokens.css defines values, not
// declarations, and stays out of the scan.

const HYG_TAIL = String.raw`(?=\s*(?:[;}"'\x60\\]|!important|$))`;
const HYG_RULES = [
  { id: 'line-height', re: new RegExp(String.raw`line-height\s*:\s*(normal|-?\d*\.?\d+(?:px|em|rem|%)?)` + HYG_TAIL, 'g'),
    norm: (m) => `line-height: ${m[1]}` },
  { id: 'z-index', re: new RegExp(String.raw`z-index\s*:\s*(-?\d+)` + HYG_TAIL, 'g'),
    norm: (m) => `z-index: ${m[1]}` },
  { id: 'webkit-scrollbar', re: /(\S*)::-webkit-scrollbar(?:-[a-z-]+)?/g,
    norm: (m) => `${m[1]}::-webkit-scrollbar` },
  { id: 'scrollbar', re: /scrollbar-(width|color)\s*:\s*([^;}"'`\\]+)/g,
    norm: (m) => `scrollbar-${m[1]}: ${m[2].trim()}` },
  { id: 'uppercase', re: /text-transform\s*:\s*uppercase/g,
    norm: () => 'text-transform: uppercase' },
  { id: 'letter-spacing', re: new RegExp(String.raw`letter-spacing\s*:\s*(-?\d*\.?\d+(?:px|em|rem)?)` + HYG_TAIL, 'g'),
    norm: (m) => `letter-spacing: ${m[1]}`, skip: (m) => parseFloat(m[1]) === 0 },
];

/** every hygiene hit in one file: [{ line, id, norm, raw }] (code surface only) */
export function scanHygiene(path, src) {
  const rawLines = src.split('\n');
  const codeLines = stripComments(src, path).split('\n');
  const hits = [];
  for (let i = 0; i < codeLines.length; i += 1) {
    const code = codeLines[i];
    const row = [];
    for (const rule of HYG_RULES) {
      rule.re.lastIndex = 0;
      for (const m of code.matchAll(rule.re)) {
        if (rule.skip && rule.skip(m)) continue;
        row.push({ col: m.index, line: i + 1, id: rule.id, norm: rule.norm(m), raw: rawLines[i] ?? '' });
      }
    }
    row.sort((a, b) => a.col - b.col); // left-to-right within a line
    for (const h of row) hits.push({ line: h.line, id: h.id, norm: h.norm, raw: h.raw });
  }
  return hits;
}

// kit.css's own law-bearing sites: the one scrollbar rule (+ the strip's
// hide idiom and its pre-Safari-18.2 ::-webkit-scrollbar belt) and the caps
// role's uppercase. Anything else in kit.css is red with no ledger escape.
const HYG_KIT_OWN = {
  'web/app/ui/kit.css': /^(\.ob-strip::-webkit-scrollbar|scrollbar-width: (none|thin)|scrollbar-color: .+|text-transform: uppercase)$/,
};

// HYG_OK — the FROZEN ledger (authored from the step-8 census; shrink-only).
// [file, /^(exact normalized hits)$/, who retires it]
const HYG_OK = [
  ['web/app.html', /^(letter-spacing: -0\.012em|letter-spacing: 0\.02em|line-height: 0\.92|line-height: 1|text-transform: uppercase|z-index: (5|6|8|9|40|60))$/,
    'boot lockup (-0.012em / 0.92 / uppercase / z 60) + the GH-694 boot-failed card drop to 8 (PR #706 landed on main after this ledger froze; twin of --ob-z-shell) → B-SH03 (owner Q1 default B, slice 2); #err notice 9, toolbar 40, HUD widget blocks 5 / 6, the ⓘ glyph line-height 1 → B-SH rows (slice 2) consume --ob-z-* / --ob-lh-glyph'],
  ['web/app/settings.js', /^z-index: 70$/, 'stale-cache fallback cssText (dialog.js absent) → B-SH07 (slice 2)'],
  ['web/app/help.js', /^z-index: 70$/, 'stale-cache fallback cssText (dialog.js absent) — help overlay, no S5 row; rides the settings family pass'],
  ['web/app/drills.js', /^z-index: 70$/, 'stale-cache fallback cssText (dialog.js absent) — drills panel, no S5 row; rides the settings family pass'],
  ['web/app/export.js', /^z-index: (40|50|60)$/, 'export button 40 / modal 60 / card 50 (its own stacking context) — export chrome adopts the kit with the replays slice (6)'],
  ['web/app/share.js', /^z-index: (41|42)$/, 'share toast 41 / import card 42 — slice 6 (B-K16 ledger twin)'],
  ['web/app/hud.js', /^z-index: (7|8)$/, 'HUD instrument panels (literal twins of --ob-z-hud / --ob-z-shell) → the S5 slice 3b HUD-family follow-up (GH-668); the chooser caps literal left with slice 3 G6 (the kit .ob-caps role)'],
  ['web/app/aimwidgets.js', /^(text-transform: uppercase|z-index: (5|6))$/, 'gameplay instruments (aim widgets — PLAN §4 allow-list)'],
  ['web/app/shell.js', /^(text-transform: uppercase|z-index: (8|9))$/, 'hall chrome #ob-shell 8 / decision prompt 9 (twins of --ob-z-shell / --ob-z-notice) + the boot-notice caps → B-SH rows (slice 2)'],
  ['web/app/ui/help.css', /^(line-height: 1|text-transform: uppercase|z-index: 70)$/, 'help overlay: caps head, × glyph line-height, dialog z — no S5 row; rides the settings family pass'],
  ['web/app/ui/settings-modal.css', /^(\S*::-webkit-scrollbar|scrollbar-width: none|z-index: 1)$/,
    'B-K19 consumer: phone tabs hide idiom → kit strip, z 1 local (the caps row labels went to the kit control / caps roles with GH-668 S5 slice 2 — B-SH07 / R5; the body scrollbar restyle retired in step 9 — the body wears .ob-scroll)'],
  ['web/app/ui/touch.css', /^(line-height: 1|text-transform: uppercase|z-index: (4|6|45|50|60|80))$/, 'gameplay touch instruments (PLAN §4 allow-list: touch.css) — its z twins (45 / 50 / 60 / 80) re-rung in a touch hygiene pass'],
  ['web/app/ui/playback.css', /^z-index: (1|2|3|5|55|89|90|92|94|95)$/,
    'DVR instrument sheet (the caps labels went to the kit .ob-caps with GH-668 S5 slice 6 G4): player 55 + the capture / resume ladder 89–95 sits ABOVE --ob-z-top 80 (disclosed finding, re-rung with the export / save flow); in-strip local order 1 / 2 / 3 / 5'],
  ['web/app/ui/shell.css', /^z-index: 8$/, 'hall chrome twin of --ob-z-shell → B-SH rows (slice 2)'],
  ['web/app/ui/atelier.css', /^(\S*::-webkit-scrollbar|scrollbar-width: none)$/,
    'B-EQ04 (slice 5): rail + colour hide idiom = ONE consolidated selector pair since G4 (GH-668 kit follow-up K-1 retires it — the kit strip is a bordered pill, not a paint-less rail); G8 re-rung z 8 / 3 onto --ob-z-shell / --ob-z-raised and the close glyph line-height onto the kit icon pill (step 9 retired the station caps (R14) and every 1.35 → --ob-lh-control; G3 the chip caps → .ob-badge)'],
  ['web/app/ui/play.css', /^(\S*::-webkit-scrollbar|scrollbar-width: none)$/,
    'B-PL rows (slice 3): games rail hide idiom → kit strip (step 9: the body thin scrollbar → .ob-scroll; G5: the caps h3 + 0.04em literals left with the kit .ob-caps role)'],
];

/**
 * Judge a whole run: hits per file vs the kit-own map and the ledger.
 * Returns { red: [{ path, line, id, norm, why }], dead: [file], ledgered }.
 * Pure — the selftest feeds it synthetic runs.
 */
export function judgeHygiene(perFile, ledger = HYG_OK, kitOwn = HYG_KIT_OWN) {
  const red = []; const seen = new Set(); let ledgered = 0;
  const suffixOf = (path, key) => path === key || path.endsWith('/' + key) || path.endsWith(key);
  for (const [path, hits] of perFile) {
    const own = Object.entries(kitOwn).find(([k]) => suffixOf(path, k));
    const row = ledger.find(([k]) => suffixOf(path, k));
    for (const h of hits) {
      if (own && own[1].test(h.norm)) continue;
      if (!own && row && row[1].test(h.norm)) { seen.add(row[0]); ledgered += 1; continue; }
      red.push({ path, line: h.line, id: h.id, norm: h.norm,
        why: own ? 'kit sheet: only its own law-bearing sites may carry this'
          : row ? `not in this file's frozen ledger row (${row[2]})`
            : 'no ledger row — consume the kit (token / role class / .ob-scroll) or add a frozen row with its retiring slice' });
    }
  }
  const scanned = new Set([...perFile.keys()]);
  const dead = ledger
    .filter(([k]) => [...scanned].some((p) => suffixOf(p, k)) && !seen.has(k))
    .map(([k]) => k);
  return { red, dead, ledgered };
}

function runHygiene(files, { report = false } = {}) {
  const perFile = new Map();
  for (const f of files) {
    if (/(^|\/)tokens\.css$/.test(f)) continue; // values, not declarations
    perFile.set(f, scanHygiene(f, readFileSync(f, 'utf8')));
  }
  if (report) {
    for (const [f, hits] of perFile) {
      if (!hits.length) continue;
      const set = [...new Set(hits.map((h) => h.norm))].sort();
      console.log(`${f}: ${hits.length} hit(s) — ${set.join(' | ')}`);
    }
    return 0;
  }
  const { red, dead, ledgered } = judgeHygiene(perFile);
  for (const r of red) console.error(`${r.path}:${r.line}: hygiene ${r.id}: \`${r.norm}\` — ${r.why}`);
  for (const d of dead) console.error(`token-grep hygiene: ledger row for ${d} matches nothing — delete it (liveness)`);
  if (red.length || dead.length) {
    console.error(`token-grep hygiene: ${red.length} red line(s), ${dead.length} dead ledger row(s)`
      + ` — GH-668 B-K23 / B-K13: line-height / z-index / scrollbar / uppercase / letter-spacing`
      + ` come from tokens.css + kit.css roles (the design charter G7 + Ladders)`);
    return 1;
  }
  console.log(`token-grep hygiene: ${perFile.size} file(s) clean (${ledgered} ledgered literal(s), ${HYG_OK.length} frozen rows live)`);
  return 0;
}

// ---------------------------------------------------------------------------
// --selftest: the GH-535 red-proofs
// ---------------------------------------------------------------------------

const CASES = [
  // -- historical false positives (verbatim shapes from dc9eeb85^/b1c6fecc^):
  //    each MUST pass now ------------------------------------------------
  {
    name: 'js block comment, PR #531 (shell.js, dc9eeb85^)',
    path: 'x.js',
    src: [
      'export function f() {',
      '  /* `autoFocus`: script-focus the quick-play control.',
      "   * Boot opens pass FALSE (owner nit, PR #531 round 3): pre-interaction",
      '   * script focus MATCHES the heuristic. */',
      '  return 1;',
      '}',
    ].join('\n'),
    want: 0,
  },
  {
    name: 'js line comment, PR #531 (shell.js, dc9eeb85^)',
    path: 'x.js',
    src: '    // FR-007(1) Enter-on-arrival WITHOUT the boot auto-focus (owner nit,\n    // PR #531 round 3): while NOTHING has focus\n    go();\n',
    want: 0,
  },
  {
    name: 'js line comment, bare #523 (ateliercue.js, b1c6fecc^)',
    path: 'x.js',
    src: '// hand-maintained mapping — the #523 anti-drift rule; e2e arm E mirrors\nconst plain = 1;\n',
    want: 0,
  },
  {
    name: 'js line comment, GH-523 spelling stays clean too',
    path: 'x.js',
    src: '// the GH-523 anti-drift rule (and GH-535 while we are here)\n',
    want: 0,
  },
  {
    name: 'css block comment, bare #523 (atelier.css, b1c6fecc^)',
    path: 'x.css',
    src: '/* Advanced tier (coordinator ruling 2: table station,\n   behind the disclosure; #523 plain-language-first law) */\nsummary { min-height: 32px; }\n',
    want: 0,
  },
  {
    name: 'html comment, issue reference',
    path: 'x.html',
    src: '<div>\n  <!-- capture re-baselined per #496; see PR #531 -->\n</div>\n',
    want: 0,
  },

  // -- canaries: real hardcoded colors MUST still fail -------------------
  {
    name: 'canary: css hex color',
    path: 'x.css',
    src: '.ob-hud { color: #abc; }\n',
    want: 1,
  },
  {
    name: 'canary: css digit-only hex (#523 IS a valid color in code position)',
    path: 'x.css',
    src: '.x { border-color: #523; }\n.y { color: #333; }\n',
    want: 2,
  },
  {
    name: 'canary: js string color',
    path: 'x.js',
    src: "el.style.background = '#ff0000';\n",
    want: 1,
  },
  {
    name: 'canary: color survives its own trailing comment',
    path: 'x.js',
    src: "paint('#f00'); // reworded per PR #531 round 3\n",
    want: 1,
  },
  {
    name: 'canary: rgba( and oklch(',
    path: 'x.css',
    src: '.a { color: rgba(0, 0, 0, 0.5); }\n.b { color: oklch(0.62 0.2 250); }\n',
    want: 2,
  },
  {
    name: 'canary: // inside a string is NOT a comment (https:// hazard)',
    path: 'x.js',
    src: "const u = 'https://ob.test/x'; paint('#0ff');\n",
    want: 1,
  },
  {
    name: 'canary: template-literal css text',
    path: 'x.js',
    src: 'el.style.cssText = `color: #fff`;\n',
    want: 1,
  },
  {
    name: 'canary: html inline style attribute',
    path: 'x.html',
    src: '<div style="color:#fff">x</div>\n',
    want: 1,
  },
  {
    name: 'canary: /* inside a regex literal must not swallow code',
    path: 'x.js',
    src: "const parts = s.split(/\\/*/); paint('#e11');\n",
    want: 1,
  },
  {
    name: 'canary: regex after return keyword must not swallow code',
    path: 'x.js',
    src: "function g(s) { return /a\\/*b/.test(s); }\npaint('#e22');\n",
    want: 1,
  },
  {
    name: 'canary: regex after an if-head must not swallow code (review r1)',
    path: 'x.js',
    src: "if (ok) /a\\/*b/.test(s);\npaint('#e33');\n",
    want: 1,
  },
  {
    name: 'canary: division then a real block comment still strips',
    path: 'x.js',
    src: "const x = a / /* half, per #531 */ 2;\npaint('#e44');\n",
    want: 1,
  },
  {
    name: 'canary: <!-- in a quoted attribute is not a comment (review r1)',
    path: 'x.html',
    src: '<div data-marker="<!--">x</div>\n<div style="color:#0f0">y</div>\n',
    want: 1,
  },
  {
    name: 'canary: regex after export default must not swallow code (review r2)',
    path: 'x.js',
    src: "export default /a\\/*b/;\npaint('#f0e');\n",
    want: 1,
  },
  {
    name: "canary: quoted ')' inside a control head keeps the head (review r2)",
    path: 'x.js',
    src: "if (foo(')')) /a\\/*b/.test(s);\npaint('#e55');\n",
    want: 1,
  },
  {
    name: 'canary: nested template backtick is not the outer close (review r2)',
    path: 'x.js',
    src: 'const t = `a ${`/*`} b`;\npaint(\'#00f\');\n',
    want: 1,
  },
  {
    name: 'canary: <!-- inside a raw-text <script> body is text (review r2)',
    path: 'x.html',
    src: "<script>const marker = '<!--'; paint('#abc')</script>\n",
    want: 1,
  },
  {
    name: 'escape: html comment after a raw-text element still strips',
    path: 'x.html',
    src: '<script>let a = 1;</script>\n<!-- see PR #531 -->\n<style>.x { color: var(--ob-ink); }</style>\n',
    want: 0,
  },

  // -- the pre-existing escapes stay law ----------------------------------
  {
    name: 'escape: var(--ob-*, fallback) is stripped per-expression',
    path: 'x.css',
    src: '.x { color: var(--ob-accent, #fff); }\n',
    want: 0,
  },
  {
    name: 'escape: token fallback beside a REAL literal still fails (#49 f4)',
    path: 'x.css',
    src: '.x { color: var(--ob-accent, #fff); border: 1px solid #123; }\n',
    want: 1,
  },
  {
    name: "escape: tok('--ob-x', fallback) / v('--ob-x', fallback)",
    path: 'x.js',
    src: "const a = tok('--ob-hud-bg', '#111');\nconst b = v('--ob-line-2', '#222');\n",
    want: 0,
  },
  {
    name: 'escape: ob-color-exempt line annotation',
    path: 'x.js',
    src: "ctx.fillStyle = '#efe9d8'; // ob-color-exempt: cue-ball face\n",
    want: 0,
  },
  {
    name: 'escape: BALL_COLORS line (game content)',
    path: 'x.js',
    src: "const BALL_COLORS = ['#fdd017', '#0247fe'];\n",
    want: 0,
  },
];

// GH-668 B-K23 / B-K13 hygiene red-proofs: every rule fires on a literal
// and stays silent on the token form; the judge rejects an unledgered hit,
// rejects a kit.css hit outside its own sites, and flags a dead ledger row.
const HYG_CASES = [
  { name: 'hygiene: line-height normal / 1.35 / 1 / 18px fire; var(--ob-lh-*) does not', path: 'x.css',
    src: 'a{line-height: normal}\nb{line-height:1.35;}\nc{line-height: 1}\nd{line-height: 18px}\ne{line-height: var(--ob-lh-body)}\nf{line-height: var(--ob-lh-control)}',
    want: ['line-height: normal', 'line-height: 1.35', 'line-height: 1', 'line-height: 18px'] },
  { name: 'hygiene: bare z-index fires; var(--ob-z-*) does not; a comment never does', path: 'x.css',
    src: 'a{z-index: 70}\nb{z-index:8;}\nc{z-index: var(--ob-z-dialog)}\n/* z-index: 99 */',
    want: ['z-index: 70', 'z-index: 8'] },
  { name: 'hygiene: JS cssText z-index literal fires (drills/help/settings fallbacks)', path: 'x.js',
    src: "el.style.cssText = 'position:fixed;inset:0;z-index:70;display:flex;';\n// z-index: 5 in a comment is not a hit",
    want: ['z-index: 70'] },
  { name: 'hygiene: ::-webkit-scrollbar carries its selector; scrollbar-width / -color fire', path: 'x.css',
    src: '#body::-webkit-scrollbar { width: 8px; }\n#body::-webkit-scrollbar-thumb { background: red; }\n.p { scrollbar-width: thin; scrollbar-color: var(--ob-bg-3) transparent; }',
    want: ['#body::-webkit-scrollbar', '#body::-webkit-scrollbar', 'scrollbar-width: thin', 'scrollbar-color: var(--ob-bg-3) transparent'] },
  { name: 'hygiene: uppercase + letter-spacing literal fire; --ob-track-* and 0 do not', path: 'x.css',
    src: '.a{text-transform: uppercase; letter-spacing: 0.04em}\n.b{letter-spacing: var(--ob-track-caps)}\n.c{letter-spacing: 0}\n.d{letter-spacing: -0.012em}',
    want: ['text-transform: uppercase', 'letter-spacing: 0.04em', 'letter-spacing: -0.012em'] },
  { name: 'hygiene: html style block scanned, html comment not', path: 'x.html',
    src: '<style>\n#x { z-index: 40; line-height: 0.92 }\n</style>\n<!-- z-index: 1 -->',
    want: ['z-index: 40', 'line-height: 0.92'] },
];
const HYG_JUDGE_CASES = [
  { name: 'hygiene judge: an unledgered surface literal is red',
    run: () => judgeHygiene(new Map([['web/app/ui/zzz.css', [{ line: 1, id: 'z-index', norm: 'z-index: 8', raw: '' }]]]), [], {}),
    ok: (r) => r.red.length === 1 && r.dead.length === 0 },
  { name: 'hygiene judge: a ledgered literal passes and credits its row (live)',
    run: () => judgeHygiene(new Map([['web/app/ui/zzz.css', [{ line: 1, id: 'z-index', norm: 'z-index: 8', raw: '' }]]]), [['web/app/ui/zzz.css', /^z-index: 8$/, 't']], {}),
    ok: (r) => r.red.length === 0 && r.dead.length === 0 && r.ledgered === 1 },
  { name: 'hygiene judge: a literal outside its file\'s row is red (the row is exact)',
    run: () => judgeHygiene(new Map([['web/app/ui/zzz.css', [{ line: 1, id: 'z-index', norm: 'z-index: 9', raw: '' }]]]), [['web/app/ui/zzz.css', /^z-index: 8$/, 't']], {}),
    ok: (r) => r.red.length === 1 && r.dead.includes('web/app/ui/zzz.css') },
  { name: 'hygiene judge: a ledger row matching nothing in a scanned file is dead',
    run: () => judgeHygiene(new Map([['web/app/ui/zzz.css', []]]), [['web/app/ui/zzz.css', /^z-index: 8$/, 't']], {}),
    ok: (r) => r.dead.length === 1 && r.red.length === 0 },
  { name: 'hygiene judge: kit.css keeps only its own sites (.ob-strip pseudo, one scrollbar rule, caps uppercase); a kit line-height literal is red with no ledger escape',
    run: () => judgeHygiene(new Map([['web/app/ui/kit.css', [
      { line: 1, id: 'webkit-scrollbar', norm: '.ob-strip::-webkit-scrollbar', raw: '' },
      { line: 2, id: 'scrollbar', norm: 'scrollbar-width: thin', raw: '' },
      { line: 3, id: 'uppercase', norm: 'text-transform: uppercase', raw: '' },
      { line: 4, id: 'line-height', norm: 'line-height: 1', raw: '' },
      { line: 5, id: 'webkit-scrollbar', norm: '.ob-select__list::-webkit-scrollbar', raw: '' },
    ]]]), [['web/app/ui/kit.css', /^line-height: 1$/, 'no escape']]),
    ok: (r) => r.red.length === 2 && r.red.every((x) => /kit sheet/.test(x.why)) },
];

function runSelftest() {
  let failed = 0;
  for (const c of CASES) {
    const hits = scanSource(c.path, c.src);
    const ok = hits.length === c.want;
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name}`
      + (ok ? '' : ` — want ${c.want} hit(s), got ${hits.length}`
        + (hits.length ? `:\n      ${hits.join('\n      ')}` : '')));
  }
  for (const c of HYG_CASES) {
    const got = scanHygiene(c.path, c.src).map((h) => h.norm);
    const ok = JSON.stringify(got) === JSON.stringify(c.want);
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name}` + (ok ? '' : ` — want ${JSON.stringify(c.want)}, got ${JSON.stringify(got)}`));
  }
  for (const c of HYG_JUDGE_CASES) {
    const r = c.run(); const ok = c.ok(r);
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name}` + (ok ? '' : ` — got ${JSON.stringify(r)}`));
  }
  const total = CASES.length + HYG_CASES.length + HYG_JUDGE_CASES.length;
  if (failed > 0) {
    console.error(`token-grep selftest: ${failed}/${total} case(s) FAILED`);
    process.exit(1);
  }
  console.log(`token-grep selftest: ${total}/${total} cases pass`);
}

// CLI entry only when run directly — e2e-ui's kit-laws.mjs imports the
// scanners (A12 static) without tripping the usage exit.
const isMain = !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
const args = isMain ? process.argv.slice(2) : null;
if (!isMain) { /* imported */ } else if (args[0] === '--selftest') {
  runSelftest();
} else if (args[0] === '--hygiene-report') {
  process.exit(runHygiene(args.slice(1), { report: true }));
} else if (args.length > 0) {
  runGate(args);
  process.exit(runHygiene(args));
} else {
  console.error('usage: node web/tools/token-grep.mjs [--selftest | --hygiene-report <file>... | <file>...]');
  process.exit(2);
}
