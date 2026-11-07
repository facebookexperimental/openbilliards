// Copyright (c) Meta Platforms, Inc. and affiliates.

// token-receipts.mjs — the tokens.css CONTRAST RECEIPTS as a machine test
// (GH-668 S5 kit step 1; backlog rows B-K02 / B-K20 / B-K11 / B-K23).
//
//   node web/tools/token-receipts.mjs              # gate: exit 1 on any red row
//   node web/tools/token-receipts.mjs --print      # the full ledger, no gate
//   node web/tools/token-receipts.mjs --selftest   # red-proofs (mutated sheets)
//   node web/tools/token-receipts.mjs <tokens.css> # judge another sheet
//
// WHY A TEST AND NOT A COMMENT. tokens.css has carried its contrast receipts
// as prose since issue #49 ("text-2 4.9:1 on --ob-bg-1"). The S5 critique
// measured the SAME ink on the grounds the surfaces actually paint it on and
// found 1.93–4.31:1 (52 % shell smoke over lit felt, 82 % kit glass, the
// --ob-bg-3 pressed step) — the receipts were true and the law was still
// broken, because a receipt on one ground says nothing about another. This
// file computes every (ink, ground) pair the kit charter names, over the
// four scene bases the glass sits on, from the token bytes themselves
// (oklch → sRGB, alpha composited, WCAG 2.x relative luminance), and pins:
//
//   * the GROUND LAW (the design charter G7 / B-K02): --ob-text-2 (hint ink) is legal
//     only on an opaque --ob-bg-0/1/2 step or --ob-glass-solid; on the 52 %
//     smoke and the 82 % kit glass the hint role is --ob-text-1 — so text-1
//     must clear 4.5:1 on every glass rung over every base, and the text-2
//     holes are DOCUMENTED rows (the test asserts the hole still exists, so
//     a future retune that closes it also retires the law consciously);
//   * the DANGER INK law (B-K20): .ob-btn--danger label = --ob-danger-text,
//     which clears 4.5:1 on the danger-dim / -dim-2 / -dim-3 washes over
//     opaque steps AND over kit glass on every base; --ob-danger (the hue
//     ink) does not — a documented hole, never a label colour again;
//   * the height ladder (B-K11), --ob-lh-control (B-K23), the z scale
//     (B-K23) and the pill-pad ratio (B-K10): exact values, and the z rungs
//     strictly increasing in declaration order.
//
// The blur is ignored (a blur never changes the mean of what it blurs); the
// four scene bases are the ones tools/measure.py sampled from the shipped
// stills (dark hall, green felt, blue felt, lit rail wood). No browser.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SHEET = path.join(HERE, '..', 'app', 'ui', 'tokens.css');

// ---- colour math -----------------------------------------------------------

function oklchToSrgb(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const gam = (c) => {
    c = Math.min(Math.max(c, 0), 1);
    return c > 0.0031308 ? 1.055 * c ** (1 / 2.4) - 0.055 : 12.92 * c;
  };
  return [gam(r), gam(g), gam(bb)];
}
function lum([r, g, b]) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
// Porter–Duff "over": fg with alpha a on an OPAQUE bg (the base is always
// opaque here: a scene pixel or an opaque token step).
function over(fg, a, bg) { return fg.map((c, i) => c * a + bg[i] * (1 - a)); }
function contrast(x, y) {
  const lx = lum(x), ly = lum(y);
  return (Math.max(lx, ly) + 0.05) / (Math.min(lx, ly) + 0.05);
}
function hex([r, g, b]) {
  return '#' + [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

// ---- tokens.css parsing ----------------------------------------------------

// Comments are lexed out first (the receipts prose quotes colour literals).
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

// Every `--ob-*: value;` in declaration order (the z scale asserts order).
export function parseTokens(css) {
  const out = new Map();
  const re = /(--ob-[a-z0-9-]+)\s*:\s*([^;{}]+);/g;
  let m;
  while ((m = re.exec(stripComments(css)))) out.set(m[1], m[2].trim());
  return out;
}

// Resolve a colour token to { rgb, alpha }. Accepts oklch(L% C h [/ a]),
// #rrggbb, and var(--ob-x) references (one hop is all tokens.css uses).
function colour(tokens, name, depth = 0) {
  const raw = tokens.get(name);
  if (raw == null) throw new Error(`missing token ${name}`);
  const ref = raw.match(/^var\((--ob-[a-z0-9-]+)\)$/);
  if (ref) {
    if (depth > 3) throw new Error(`var() cycle at ${name}`);
    return colour(tokens, ref[1], depth + 1);
  }
  const ok = raw.match(/^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (ok) {
    return { rgb: oklchToSrgb(+ok[1] / 100, +ok[2], +ok[3]), alpha: ok[4] == null ? 1 : +ok[4] };
  }
  const hx = raw.match(/^#([0-9a-f]{6})$/i);
  if (hx) {
    const n = parseInt(hx[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255), alpha: 1 };
  }
  throw new Error(`unparsed colour token ${name}: ${raw}`);
}

// Scene bases the translucent rungs sit over (tools/measure.py samples of
// the shipped stills: dark hall, mid felt green, blue felt, ivory-lit wood).
const BASES = {
  'hall-dark': [0.10, 0.10, 0.09],
  'felt-green': [0.16, 0.42, 0.28],
  'felt-blue': [0.20, 0.36, 0.55],
  'wood-lit': [0.55, 0.38, 0.22],
};

// A ground = an opaque colour after compositing the named token stack over
// a base. stack = [tokenName, ...] painted in order (first = bottom).
function ground(tokens, stack, base) {
  let px = base;
  for (const name of stack) {
    const c = colour(tokens, name);
    px = over(c.rgb, c.alpha, px);
  }
  return px;
}
function ink(tokens, name) { return colour(tokens, name).rgb; }

// ---- the ledger ------------------------------------------------------------
// Each row: id, ink token, ground stack, base name (or 'opaque'), and the
// law: { min } = must clear; { hole } = documented failure that the LAW
// routes around (must STILL fail, so closing it is a conscious act).
const AA = 4.5;
function rows(tokens) {
  const R = [];
  const push = (id, inkName, stack, base, law, note) =>
    R.push({ id, inkName, stack, base, law, note });
  // opaque steps
  for (const t of ['--ob-text-0', '--ob-text-1', '--ob-text-2']) {
    push(`opaque/${t}/bg-1`, t, ['--ob-bg-1'], 'opaque', { min: AA }, 'panel body');
    push(`opaque/${t}/bg-2`, t, ['--ob-bg-2'], 'opaque', { min: AA }, 'raised / hover');
  }
  push('opaque/--ob-text-1/bg-3', '--ob-text-1', ['--ob-bg-3'], 'opaque', { min: AA }, 'pressed step label');
  push('opaque/--ob-text-2/bg-3', '--ob-text-2', ['--ob-bg-3'], 'opaque', { hole: AA },
    'B-K20: hint copy never on --ob-bg-3');
  push('opaque/--ob-accent-text/dim-3', '--ob-accent-text', ['--ob-bg-1', '--ob-accent-dim-3'], 'opaque',
    { min: AA }, 'selected register ink (G9)');
  return R;
}
function glassRows(tokens) {
  const R = [];
  const push = (id, inkName, stack, base, law, note) =>
    R.push({ id, inkName, stack, base, law, note });
  for (const base of Object.keys(BASES)) {
    // --ob-glass-solid (94 %): the text-dense micro-chrome rung — hint ink legal.
    push(`solid/--ob-text-2/${base}`, '--ob-text-2', ['--ob-glass-solid'], base, { min: AA },
      'B-K02: solid rung carries hint ink');
    push(`solid/--ob-text-1/${base}`, '--ob-text-1', ['--ob-glass-solid'], base, { min: AA }, '');
    // shell smoke (52 %): hint role = text-1 (the ground law).
    push(`smoke52/--ob-text-1/${base}`, '--ob-text-1', ['--ob-glass-bg'], base, { min: AA },
      'B-K02: on 52 % smoke the hint role is --ob-text-1');
    // kit glass (82 %): same law.
    push(`glass82/--ob-text-1/${base}`, '--ob-text-1', ['--ob-glass'], base, { min: AA },
      'B-K02: on 82 % kit glass the hint role is --ob-text-1');
    // danger ink over kit glass washes (re-rack / delete buttons on HUD panels).
    for (const wash of ['--ob-danger-dim', '--ob-danger-dim-2', '--ob-danger-dim-3']) {
      push(`glass82/--ob-danger-text/${wash}/${base}`, '--ob-danger-text', ['--ob-glass', wash], base,
        { min: AA }, 'B-K20: danger button ink = --ob-danger-text');
    }
  }
  // documented holes: at least ONE base fails for the old choices (asserted as
  // any-base holes so the law stays justified by the numbers).
  push('smoke52/--ob-text-2/any-base', '--ob-text-2', ['--ob-glass-bg'], 'any', { hole: AA },
    'B-K02: text-2 on 52 % smoke is the measured 1.93–4.31:1 defect');
  push('glass82/--ob-text-2/any-base', '--ob-text-2', ['--ob-glass'], 'any', { info: true },
    'B-K02: modelled 4.6 on the mean lit-wood base, MEASURED 3.9–4.3 on the stills — the law stands on the stills');
  push('glass82/--ob-danger/--ob-danger-dim/any-base', '--ob-danger', ['--ob-glass', '--ob-danger-dim'], 'any',
    { hole: AA }, 'B-K20: the hue ink on its own wash over glass = 3.95–4.64:1');
  // opaque danger washes (buttons inside opaque panels / modals).
  for (const bg of ['--ob-bg-1', '--ob-bg-2']) {
    for (const wash of ['--ob-danger-dim', '--ob-danger-dim-2', '--ob-danger-dim-3']) {
      push(`opaque/--ob-danger-text/${wash}/${bg}`, '--ob-danger-text', [bg, wash], 'opaque', { min: AA }, '');
    }
  }
  return R;
}

function evaluate(tokens, row) {
  const inkRgb = ink(tokens, row.inkName);
  const bases = row.base === 'opaque' ? { opaque: [0, 0, 0] }
    : row.base === 'any' ? BASES : { [row.base]: BASES[row.base] };
  const ratios = Object.entries(bases).map(([b, px]) => {
    const g = ground(tokens, row.stack, px);
    return { base: b, ratio: contrast(inkRgb, g), ground: hex(g) };
  });
  if (row.law.min != null) {
    const worst = ratios.reduce((a, r) => (r.ratio < a.ratio ? r : a));
    return { ...row, ok: worst.ratio >= row.law.min, ratio: worst.ratio, ground: worst.ground,
      verdict: `>= ${row.law.min}` };
  }
  const worst = ratios.reduce((a, r) => (r.ratio < a.ratio ? r : a));
  if (row.law.info) {
    return { ...row, ok: true, ratio: worst.ratio, ground: worst.ground, verdict: 'info (not asserted)' };
  }
  return { ...row, ok: worst.ratio < row.law.hole, ratio: worst.ratio, ground: worst.ground,
    verdict: `hole < ${row.law.hole} (documented)` };
}

// ---- the non-colour laws (exact values) ------------------------------------
const LADDER = {
  '--ob-h-toggle': '20px', '--ob-h-compact': '28px', '--ob-h-toolbar': '34px',
  '--ob-h-control': '40px', '--ob-h-row': '44px', '--ob-h-coarse': '44px', '--ob-h-primary': '48px',
  '--ob-h-thumb': '64px',
  '--ob-lh-control': '1.35',
  '--ob-pill-pad-ratio': '0.4',
};
const Z_ORDER = ['--ob-z-raised', '--ob-z-hud', '--ob-z-shell', '--ob-z-notice',
  '--ob-z-chrome', '--ob-z-modal', '--ob-z-scrim', '--ob-z-dialog', '--ob-z-popover',
  '--ob-z-top'];
function valueRows(tokens) {
  const out = [];
  for (const [k, v] of Object.entries(LADDER)) {
    out.push({ id: `value/${k}`, ok: tokens.get(k) === v, detail: `${tokens.get(k) ?? 'MISSING'} (law ${v})` });
  }
  let prev = -Infinity;
  for (const k of Z_ORDER) {
    const n = Number(tokens.get(k));
    out.push({ id: `z/${k}`, ok: Number.isInteger(n) && n > prev, detail: `${tokens.get(k) ?? 'MISSING'} > ${prev}` });
    if (Number.isInteger(n)) prev = n;
  }
  return out;
}

// ---- runner ----------------------------------------------------------------
export function judge(css) {
  const tokens = parseTokens(css);
  const colourRows = [...rows(tokens), ...glassRows(tokens)].map((r) => {
    try { return evaluate(tokens, r); }
    catch (e) { return { ...r, ok: false, ratio: NaN, ground: '-', verdict: e.message }; }
  });
  return { colourRows, valueRows: valueRows(tokens) };
}

function report(result, { print }) {
  let red = 0;
  for (const r of result.colourRows) {
    if (!r.ok) red++;
    if (print || !r.ok) {
      console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id.padEnd(52)} ${r.ratio.toFixed(2).padStart(6)}:1 on ${r.ground}  ${r.verdict}${r.note ? '  — ' + r.note : ''}`);
    }
  }
  for (const r of result.valueRows) {
    if (!r.ok) red++;
    if (print || !r.ok) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id.padEnd(52)} ${r.detail}`);
  }
  return red;
}

// Red-proofs: each mutation of the shipped sheet must turn at least one
// NAMED row red (a gate that cannot fail is decoration).
function selftest(css) {
  const cases = [
    { name: 'ladder token missing', mut: (s) => s.replace(/--ob-h-control:\s*40px;/, ''), row: /^value\/--ob-h-control/ },
    { name: 'z scale out of order', mut: (s) => s.replace(/--ob-z-dialog:\s*70;/, '--ob-z-dialog: 39;'), row: /^z\/--ob-z-dialog/ },
    { name: 'danger ink regressed to the hue', mut: (s) => s.replace(/--ob-danger-text:\s*oklch\([^)]*\);/, '--ob-danger-text: var(--ob-danger);'), row: /^glass82\/--ob-danger-text/ },
    { name: 'text-2 dimmed below the body law (pre-#49 58 % L)', mut: (s) => s.replace(/--ob-text-2:\s*oklch\(62%/, '--ob-text-2: oklch(58%'), row: /^opaque\/--ob-text-2\/bg-1/ },
    { name: 'text-2 back at 61 % L: the hover step (bg-2) hole reopens', mut: (s) => s.replace(/--ob-text-2:\s*oklch\(62%/, '--ob-text-2: oklch(61%'), row: /^opaque\/--ob-text-2\/bg-2/ },
    { name: 'text-1 dimmed: the smoke ground law loses its substitute', mut: (s) => s.replace(/--ob-text-1:\s*oklch\(76%/, '--ob-text-1: oklch(64%'), row: /^smoke52\/--ob-text-1/ },
    { name: 'glass-solid thinned to 0.62: hint ink leaves the solid rung', mut: (s) => s.replace(/--ob-glass-solid:\s*oklch\(16\.5% 0\.011 165 \/ 0\.94\)/, '--ob-glass-solid: oklch(16.5% 0.011 165 / 0.62)'), row: /^solid\/--ob-text-2/ },
    { name: 'a documented hole silently closed (text-2 on bg-3 lifted)', mut: (s) => s.replace(/--ob-bg-3:\s*oklch\(28\.5%/, '--ob-bg-3: oklch(18.5%'), row: /^opaque\/--ob-text-2\/bg-3/ },
  ];
  let bad = 0;
  const base = judge(css);
  const baseRed = report(base, { print: false });
  console.log(`${baseRed === 0 ? 'PASS' : 'FAIL'} selftest/baseline shipped sheet is green (${baseRed} red)`);
  if (baseRed) bad++;
  for (const c of cases) {
    const mutated = c.mut(css);
    if (mutated === css) { console.log(`FAIL selftest/${c.name}: mutation did not apply`); bad++; continue; }
    const res = judge(mutated);
    const hit = [...res.colourRows, ...res.valueRows].filter((r) => !r.ok && c.row.test(r.id));
    console.log(`${hit.length ? 'PASS' : 'FAIL'} selftest/${c.name} → ${hit.length} named row(s) red`);
    if (!hit.length) bad++;
  }
  return bad;
}

const argv = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('token-receipts.mjs')) {
  const sheet = argv.find((a) => !a.startsWith('--')) ?? DEFAULT_SHEET;
  const css = readFileSync(sheet, 'utf8');
  let red;
  if (argv.includes('--selftest')) red = selftest(css);
  else red = report(judge(css), { print: argv.includes('--print') });
  console.log(`${red === 0 ? 'PASS' : 'FAIL'} token-receipts ${path.relative(process.cwd(), sheet)}: ${red} red row(s)`);
  process.exit(red === 0 ? 0 : 1);
}
