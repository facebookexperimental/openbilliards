// Copyright (c) Meta Platforms, Inc. and affiliates.

// glyph-audit.mjs — STATIC gate for the inlined chrome glyphs (issue GH-246).
// STRING COMPARISONS ONLY. No geometry, no path parsing, no rasterisation.
//
// Why this file exists. The primary chrome pills (#ob-playback / #ob-gear /
// #ob-help / #ob-drills and the always-on HUD chevrons) carry their glyph path
// data INLINE, as a local constant in the module that owns the pill, so the mark
// cannot degrade when `ui/icons.js` fails to load (GH-246 defect 1; the
// cache-poison contract in the module-ownership contract deliberately allows that
// pairing). `ui/icons.js` remains the source for the long tail and keeps those
// names (its exports are FROZEN-STABLE), so the same drawing now lives in two
// places — and the ONLY job here is to stop the two copies from diverging.
//
// Every inlined copy is marked in source with
//
//     const GLYPH_X = /* OB-GLYPH:<icons.js name> */ '<path .../>'
//       + '<path .../>';
//
// and this gate asserts, by string equality:
//   1. the constant's value is BYTE-IDENTICAL to `iconHtml(name)`'s path data;
//   2. the whole <svg> the module will emit (its own `inlineGlyph()` template
//      with the interpolations substituted) is BYTE-IDENTICAL to `iconHtml(name)`
//      — so a local wrapper whose viewBox/stroke-width/fill drifted fails here
//      and not only in a browser;
//   3. the constant is actually USED (a matching-but-dead constant left behind
//      while the pill reverted to a text glyph is the regression, not the fix);
//   4. none of the REQUIRED inlinings disappeared.
// Markers are DISCOVERED, so a newly inlined pill is gated by the commit that
// adds it.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO (scope ruling, 2026-07-28). It used to
// also parse the `playback` path data and compute the clear counter between the
// replay ring and the play triangle analytically. That was the wrong instrument:
// the claim under test — "the ring wraps the triangle with a visible counter at
// 20px" — is about what the RENDERER paints, and every geometric assertion a
// parser makes is a new way for the parser to disagree with Chrome. The counter
// is now MEASURED ON PIXELS by e2e-playback arm 6e, which rasterises the real
// glyph at the real sizes and reports the gap in device px. Nothing about the
// glyph's SHAPE is judged here any more.
//
// usage: node web/tools/glyph-audit.mjs [--verbose]
// exit 0 = clean, 1 = drift.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iconHtml } from '../app/ui/icons.js';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');
// IMPORTED (e2e-playback reuses pathsOf) vs RUN AS THE GATE — only the direct
// run may print/exit.
const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
let bad = 0;
const fail = (msg) => { console.error('GLYPH-AUDIT FAIL:', msg); bad++; };
const ok = (msg) => console.log(`ok: ${msg}`);

/** every inlined glyph that must exist (control id -> module, icons.js name) */
const REQUIRED = [
  ['#ob-playback', 'app/playback.js', 'playback'],
  ['#ob-gear', 'app/settings.js', 'gear'],
  ['#ob-help', 'app/help.js', 'help'],
  ['#ob-drills', 'app/drills.js', 'target'],
  ['#ob-nudge-ccw', 'app/touchwidgets.js', 'chevron-left'],
  ['#ob-nudge-cw', 'app/touchwidgets.js', 'chevron-right'],
];

/** icons.js path data for `name` (the markup INSIDE its <svg> wrapper) */
export function pathsOf(name) {
  const html = iconHtml(name);
  if (!html) throw new Error(`ui/icons.js has no glyph '${name}'`);
  return html.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}

/** Collapse a JS string-concatenation expression to its value WITHOUT eval, by
 * parsing the EXACT grammar the convention mandates: `literal (+ literal)*`,
 * single-quoted (the path data only ever uses double quotes inside).
 *
 * A parser, not a strip-and-join: stripping every '+' would let a stray LEADING
 * plus — `const G = /* OB-GLYPH:x *\/ + '<circle .../>'` — reconstruct the
 * canonical path and pass, while JavaScript evaluates that to NaN and the pill
 * renders the text "NaN". Anything outside the grammar throws. */
function literalValue(expr, where) {
  const lit = /\s*'((?:[^'\\]|\\.)*)'\s*/y;
  const plus = /\+/y;
  const lits = [];
  let i = 0;
  for (;;) {
    lit.lastIndex = i;
    const m = lit.exec(expr);
    if (!m) {
      throw new Error(`${where}: expected a single-quoted string literal at `
        + `offset ${i} of the OB-GLYPH value, got `
        + JSON.stringify(expr.slice(i, i + 24)));
    }
    lits.push(m[1]);
    i = lit.lastIndex;
    if (i >= expr.length) break;
    plus.lastIndex = i;
    if (!plus.exec(expr)) {
      throw new Error(`${where}: expected '+' between string literals at `
        + `offset ${i}, got ${JSON.stringify(expr.slice(i, i + 24))}`);
    }
    i = plus.lastIndex;
  }
  return lits.join('');
}

/** The module's own `inlineGlyph()` template, as ONE source string with the
 * three interpolations intact, so the FULL emitted <svg> can be reconstructed
 * and compared to iconHtml()'s output without a browser. */
function emitterTemplate(file, src) {
  const m = /const inlineGlyph = \(paths, name, size = 20\) =>([\s\S]*?);\n/
    .exec(src);
  if (!m) {
    throw new Error(`${file}: no canonical `
      + '`const inlineGlyph = (paths, name, size = 20) => ...;` emitter — the '
      + 'inlined-glyph convention requires one so its output can be compared '
      + 'to ui/icons.js iconHtml() statically');
  }
  // GH-245 (parked from the GH-246 review trail): the SAME sticky-regex parse
  // literalValue() uses, not a strip-and-join. Stripping every '+' before
  // judging the residue let two off-grammar shapes reconstruct the canonical
  // markup and PASS: a '+' deleted between two template chunks (a JS syntax
  // error the audit should name itself) and a leading unary '+' (the module
  // evaluates it to `NaN<svg …`). Anything outside `template (+ template)*`
  // throws with its offset.
  const body = m[1];
  const tpl = /\s*`([^`]*)`\s*/y;
  const plus = /\+/y;
  const chunks = [];
  let i = 0;
  for (;;) {
    tpl.lastIndex = i;
    const c = tpl.exec(body);
    if (!c) {
      throw new Error(`${file}: inlineGlyph is not a plain template-literal `
        + `concatenation — expected a backtick template at offset ${i}, got `
        + JSON.stringify(body.slice(i, i + 24)));
    }
    chunks.push(c[1]);
    i = tpl.lastIndex;
    if (i >= body.length) break;
    plus.lastIndex = i;
    if (!plus.exec(body)) {
      throw new Error(`${file}: expected '+' between inlineGlyph template `
        + `chunks at offset ${i}, got ${JSON.stringify(body.slice(i, i + 24))}`);
    }
    i = plus.lastIndex;
  }
  return chunks.join('');
}

/** every `const IDENT = /* OB-GLYPH:name *\/ <expr>;` in a source file */
function markersIn(file) {
  const src = fs.readFileSync(path.join(webDir, file), 'utf8');
  const out = [];
  const re = /const\s+([A-Za-z_$][\w$]*)\s*=\s*\/\* OB-GLYPH:([A-Za-z0-9-]+) \*\/([\s\S]*?);\n/g;
  for (const m of src.matchAll(re)) {
    const [, ident, name, expr] = m;
    const refs = (src.match(new RegExp(`\\b${ident}\\b`, 'g')) ?? []).length;
    const value = literalValue(expr, `${file} OB-GLYPH:${name}`);
    const tpl = emitterTemplate(file, src);
    out.push({
      name,
      ident,
      value,
      markup: tpl.replaceAll('${size}', '20').replaceAll('${name}', name)
        .replaceAll('${paths}', value),
      // the constant is referenced somewhere BESIDES its own declaration, in a
      // file that still carries an inlineGlyph() emitter. Not "passed directly
      // to inlineGlyph": touchwidgets.js legitimately routes its chevrons
      // through a local mkNudge() factory. The per-CONTROL proof is arm 6d.
      used: refs > 1 && /inlineGlyph\(/.test(src),
    });
  }
  return out;
}

/** every discovered marker, `${file}|${name}` -> marker record */
export function inlinedGlyphs() {
  const jsFiles = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(webDir, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) jsFiles.push(rel);
    }
  })('app');
  const found = new Map();
  const dupes = [];
  const errors = [];
  for (const f of jsFiles) {
    // a source that violates the convention is a FAIL LINE, not a stack trace
    let markers;
    try { markers = markersIn(f); } catch (e) { errors.push(`${f}: ${e.message}`); continue; }
    for (const m of markers) {
      const key = `${f}|${m.name}`;
      if (found.has(key)) dupes.push(key);
      found.set(key, m);
    }
  }
  return { found, dupes, errors };
}

function auditDrift() {
  const { found, dupes, errors } = inlinedGlyphs();
  for (const e of errors) fail(e);
  for (const k of dupes) fail(`duplicate OB-GLYPH marker ${k}`);
  if (!found.size) {
    fail('no OB-GLYPH markers found at all — the primary chrome pills lost '
      + 'their inlined glyphs (GH-246 defect 1 would be back)');
  }
  for (const [key, m] of found) {
    const [file, name] = key.split('|');
    let want;
    try { want = pathsOf(name); } catch (e) { fail(e.message); continue; }
    if (m.value === want) {
      if (verbose) console.log(`     ${file} OB-GLYPH:${name} = ${m.value}`);
      ok(`${file} inlines ui/icons.js '${name}' byte-identically`);
    } else {
      fail(`${file} OB-GLYPH:${name} has DRIFTED from ui/icons.js\n`
        + `  inlined : ${m.value}\n  icons.js: ${want}`);
    }
    const wantFull = iconHtml(name);
    if (m.markup === wantFull) {
      ok(`${file} emits '${name}' with iconHtml()'s exact <svg> wrapper`);
    } else {
      fail(`${file} emits '${name}' with a DRIFTED <svg> wrapper — the inlined`
        + ' mark would not render identically to the icons.js one\n'
        + `  emits   : ${m.markup}\n  iconHtml: ${wantFull}`);
    }
    if (m.used) {
      ok(`${file} USES ${m.ident} and carries an inlineGlyph() emitter`);
    } else {
      fail(`${file} declares OB-GLYPH:${name} as ${m.ident} but never uses it`
        + ' (or lost its inlineGlyph emitter) — the constant is dead data and'
        + ' the control is back on a text glyph (GH-246 defect 1). The'
        + ' per-control proof is e2e-playback arm 6d.');
    }
  }
  for (const [id, file, name] of REQUIRED) {
    if (!found.has(`${file}|${name}`)) {
      fail(`${id} must carry an inlined OB-GLYPH:${name} in ${file}`
        + ' (GH-246: the primary chrome pills may not depend on ui/icons.js)');
    }
  }
}

if (isMain) {
  auditDrift();
  console.log(bad ? `\nGLYPH-AUDIT: ${bad} failure(s)`
    : '\nGLYPH-AUDIT: clean (string identity only — the playback counter is '
      + 'measured on PIXELS by e2e-playback arm 6e)');
  process.exitCode = bad ? 1 : 0;
}
