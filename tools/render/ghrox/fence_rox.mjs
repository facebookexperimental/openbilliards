#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
// fence_rox.mjs — the A2 FENCE PROOF for web/scene/table.js (maintainer ruling A2-3).
//
// A2 may add to table.js exactly three kinds of thing:
//   (1) the TABLE_SPECS.rasson_ox_9ft entry,
//   (2) ONE contiguous block of `rox*`-prefixed helpers (functions / consts whose names start
//       with `rox` or `ROX_`),
//   (3) additive `style === 'rasson_ox'` (or `G.render.style === 'rasson_ox'`) branches,
// plus the codebase's sanctioned opt-in render pin: a shared line may change ONLY by wrapping a
// literal into `G.render.<key> ?? <the same literal>` (entries without the key render as before).
// No line inside an existing diamond / predator / cn8 / snooker / carom / generic branch may change.
//
// Proof method (comment-stripped): both versions are tokenised (strings and template literals kept,
// // and /* */ comments removed, blank lines dropped), diffed with the system `diff`, and every hunk
// is classified. The tool also brace-matches every `style === '<other>'` branch body in the base and
// in the live file and compares their sha256 (the ruling's "comment-stripped hashes of every
// non-rox branch identical to <base>"). Exit 1 on any violation with --judge.
//
// Usage: node tools/render/ghrox/fence_rox.mjs --base <pre-rox-table.js> [--file web/scene/table.js] [--judge] [--json out.json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const baseArg = argOf('--base', null);
if (!baseArg || baseArg.startsWith('--')) {
  console.error('Usage: fence_rox.mjs --base <pre-rox-table.js> [--file web/scene/table.js] [--judge] [--redarm] [--json out.json]');
  process.exit(2);
}
const BASE = path.resolve(baseArg);
const FILE = argOf('--file', 'web/scene/table.js');
const JUDGE = argv.includes('--judge');
const JSON_OUT = argOf('--json', null);
const REDARM = argv.includes('--redarm');
const LIVE_PATH = argOf('--live', null); // a scratch copy to judge instead of the repo file (red arms)

function stripComments(src) {
  // A small lexer: keeps string / template / regex-free code, removes comments, drops blank lines.
  let out = ''; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; } out += src[i]; i++; }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim().length > 0);
}
const sha = (t) => createHash('sha256').update(t).digest('hex');

let liveSrc = fs.readFileSync(LIVE_PATH ? path.resolve(LIVE_PATH) : path.join(REPO, FILE), 'utf8');
const baseSrc0 = fs.readFileSync(BASE, 'utf8');
console.log(`FENCE BASE ${BASE} sha256=${sha(baseSrc0)}`);
function analyse(liveSrc, baseSrc) {
const live = stripComments(liveSrc), base = stripComments(baseSrc);
const ROX_LINE = /'rasson_ox'/; // E: only an explicit style test may ride a shared line; rox* helper calls in shared code are NOT sanctioned
const balanced = (l) => (l.match(/[{([]/g) || []).length === (l.match(/[})\]]/g) || []).length;
// Remove every sanctioned rox block from the LIVE text; what remains must equal the base text
// except for sanctioned single-line opt-in render pins. Block forms (the builder brief pins them):
//   A  `pool_pro_9ft_k55: {` or `rasson_ox_9ft: {` ... `},` (the TABLE_SPECS entry, under the neutral key or the old one)
//   B  `function rox…(` / `const rox…` / `const ROX_…`   (helpers; brace-matched, self-contained)
//   C  `if (style === 'rasson_ox') {` ... `}`            (standalone branch incl. its closing brace)
//   D  `} else if (style === 'rasson_ox') {` ...          (else-chain branch; its closing brace belongs
//                                                          to the base's next `} else …` / `}` line)
//   E  a single self-contained line containing the style test 'rasson_ox' (a ternary arm / one-line branch)
const removed = []; const kept = [];
for (let i = 0; i < live.length;) {
  const l = live[i];
  const isEntry = /^\s*(?:pool_pro_9ft_k55|rasson_ox_9ft): \{\s*$/.test(l);
  const isHelper = /^\s*(export )?(async )?(function\*? |const |let )(rox[A-Z_]\w*|ROX_\w*)/.test(l);
  const isIf = /^\s*if \((?:style|G\.render\.style) === 'rasson_ox'\)\s*\{\s*$/.test(l);
  const isElse = /^\s*\}\s*else if \((?:style|G\.render\.style) === 'rasson_ox'\)\s*\{\s*$/.test(l);
  if (isEntry || isHelper || isIf || isElse) {
    const kind = isEntry ? 'A entry' : isHelper ? 'B helper' : isIf ? 'C if-branch' : 'D else-branch';
    let depth = 0, j = i, opened = false;
    for (; j < live.length; j++) {
      const t = j === i && isElse ? live[j].replace(/^\s*\}/, '') : live[j];
      const opens = (t.match(/\{/g) || []).length, closes = (t.match(/\}/g) || []).length;
      if (isElse && j > i && depth === 1 && /^\s*\}/.test(live[j])) {
        // this line's leading brace closes the rox else-branch and belongs to the base chain: stop before it
        j -= 1; break;
      }
      depth += opens - closes; if (opens) opened = true;
      if (opened && depth <= 0) break;
    }
    removed.push({ kind, live_line: i + 1, lines: j - i + 1, head: l.trim().slice(0, 90) });
    i = j + 1; continue;
  }
  if (ROX_LINE.test(l) && balanced(l)) { removed.push({ kind: 'E rox line', live_line: i + 1, lines: 1, head: l.trim().slice(0, 90) }); i++; continue; }
  kept.push(l); i++;
}
// residual diff: kept vs base — only opt-in pins may remain
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'rox-fence2-'));
const fa2 = path.join(tmp2, 'base.txt'), fb2 = path.join(tmp2, 'kept.txt');
fs.writeFileSync(fa2, base.join('\n') + '\n'); fs.writeFileSync(fb2, kept.join('\n') + '\n');
const diff2 = spawnSync('diff', ['-U0', fa2, fb2], { encoding: 'utf8', maxBuffer: 1 << 28 });
fs.rmSync(tmp2, { recursive: true, force: true });
const hunks2 = [];
{
  let cur = null;
  for (const l of diff2.stdout.split('\n')) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(l);
    if (m) { cur = { a0: +m[1], b0: +m[3], del: [], add: [] }; hunks2.push(cur); continue; }
    if (!cur) continue;
    if (l.startsWith('-')) cur.del.push(l.slice(1)); else if (l.startsWith('+')) cur.add.push(l.slice(1));
  }
}
// G  a SANCTIONED SHARED HUNK: an insertion (no deletion) whose added lines equal, line for line, one entry of
//    this allowlist — each entry names the order that sanctioned it. Nothing else on a shared line is ever OK.
const SANCTIONED_SHARED_HUNKS = [
  { id: 'G1 styleMaterials preamble: woodMat relief-scale reset to the creation values (ORDER-ROX-21B-REISSUE condition 1, review r12 P2 class)',
    add: ['    woodMat.normalScale.set(0.16, 0.16);', '    woodMat.clearcoatNormalScale.set(0.08, 0.08);'] },
];
const findings = []; const classified = removed.slice();
for (const h of hunks2) {
  let kind = 'VIOLATION';
  if (h.del.length === 0 && h.add.length > 0) {
    const g = SANCTIONED_SHARED_HUNKS.find((e) => e.add.length === h.add.length && e.add.every((l, i) => l === h.add[i]));
    if (g) kind = g.id;
  }
  if (h.del.length === 1 && h.add.length === 1) {
    const o = h.del[0], w = h.add[0];
    const m = /G\.render\.(\w+) \?\? /.exec(w);
    if (m) {
      const u1 = w.replace(new RegExp(`\\(G\\.render\\.${m[1]} \\?\\? ([^()]+)\\)`), '$1');
      const u2 = w.replace(`G.render.${m[1]} ?? `, '');
      if (u1 === o || u2 === o) kind = `F opt-in render pin G.render.${m[1]}`;
    }
  }
  classified.push({ kind, base_line: h.a0, removed: h.del.length, added: h.add.length, head: (h.add[0] || h.del[0] || '').trim().slice(0, 90) });
  if (kind === 'VIOLATION') findings.push({ base_line: h.a0, removed: h.del.slice(0, 8), added: h.add.slice(0, 8) });
}
// branch-body hashes for every OTHER style
function branchBodies(lines) {
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /(?:^|[^A-Za-z_])(?:style|G\.render\.style) === '(diamond|predator|cn8|snooker|carom|generic)'\)\s*\{\s*$/.exec(lines[i]);
    if (!m) continue;
    // a branch body ends at the first line whose LEADING brace closes it (`} else …`, `}`), so an
    // else-if chain yields one body per branch and an inserted rox branch never lands in a neighbour's hash
    let depth = 0, j = i, end = i;
    for (; j < lines.length; j++) {
      const t = j === i ? lines[j].replace(/^\s*\}/, '') : lines[j];
      if (j > i && /^\s*\}/.test(lines[j]) && depth - 1 <= 0) { end = j - 1; break; }
      depth += (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length;
      end = j;
      if (j > i && depth <= 0) break;
    }
    const body = lines.slice(i, end + 1).join('\n');
    (out[m[1]] ||= []).push({ head: lines[i].trim().slice(0, 80), n: j - i + 1, sha: sha(body) });
  }
  return out;
}
const bb = branchBodies(base), lb = branchBodies(live);
const branchReport = {};
for (const st of Object.keys({ ...bb, ...lb })) {
  const a = (bb[st] || []).map((x) => x.sha), b = (lb[st] || []).map((x) => x.sha);
  const same = a.length === b.length && a.every((s, k) => s === b[k]);
  branchReport[st] = { base_blocks: a.length, live_blocks: b.length, identical: same };
  if (!same) findings.push({ branch: st, note: `branch bodies differ: base ${a.length} blocks, live ${b.length}` });
}
return { base: BASE, base_sha256: sha(baseSrc), file: FILE, base_stripped_lines: base.length, live_stripped_lines: live.length, residual_after_rox_removal: kept.length, rox_blocks: removed, residual_hunks: classified.filter((c) => !removed.includes(c)), branches: branchReport, violations: findings, ok: findings.length === 0 };
}
const report = analyse(liveSrc, baseSrc0);
const { rox_blocks: removed, residual_hunks: residual, branches: branchReport, violations: findings } = report;
if (REDARM) {
  // ADR-0009: a fence that cannot go red proves nothing. Three in-memory mutants of the LIVE file:
  const mutants = [];
  const diamondIdx = liveSrc.indexOf("if (style === 'diamond') {");
  mutants.push(['a literal inside the diamond branch changes', liveSrc.slice(0, diamondIdx) + "if (style === 'diamond') {\n      woodMat.roughness = 0.123;" + liveSrc.slice(diamondIdx + "if (style === 'diamond') {".length), false]);
  mutants.push(['a non-rox line is inserted outside any rox block', liveSrc.replace("export const TABLE_SPECS = {", "const ROGUE_UNFENCED = 1;\nexport const TABLE_SPECS = {"), false]);
  mutants.push(['an UNLISTED shared insertion next to the sanctioned G1 reset (must go RED)', liveSrc.replace("    woodMat.clearcoatNormalScale.set(0.08, 0.08);\n", "    woodMat.clearcoatNormalScale.set(0.08, 0.08);\n    woodMat.sheen = 0.5;\n"), false]);
  mutants.push(['a sanctioned rox helper block is added (must stay OK)', liveSrc.replace("export const TABLE_SPECS = {", "function roxProbeHelper(G) {\n  return G.render.frameTop;\n}\nexport const TABLE_SPECS = {"), true]);
  mutants.push(['a sanctioned opt-in pin (must stay OK)', liveSrc.replace("const railSeatY = G.render.railSeatY ?? 0.006;", "const railSeatY = G.render.roxProbeSeat ?? G.render.railSeatY ?? 0.006;"), true]);
  let bad = 0;
  for (const [name, src, mustPass] of mutants) {
    const r = analyse(src, baseSrc0);
    const pass = r.violations.length === 0;
    const ok = pass === mustPass;
    if (!ok) bad++;
    console.log(`${ok ? 'OK ' : 'BAD'} red-arm: ${name} -> ${pass ? 'fence OK' : 'VIOLATION'} (expected ${mustPass ? 'OK' : 'VIOLATION'})`);
  }
  console.log(`fence red-arm: ${mutants.length - bad}/${mutants.length} mutants behaved as required`);
  if (bad) process.exit(1);
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
console.log(`fence_rox vs ${BASE}: ${removed.length} rox block(s) removed [` + removed.map((c) => `${c.kind}@${c.live_line}(${c.lines})`).join(', ') + `]; residual hunks ${residual.length}: ` + residual.map((c) => `${c.kind}@${c.base_line}`).join(', '));
console.log('branch bodies:', Object.entries(branchReport).map(([k, v]) => `${k} ${v.identical ? 'IDENTICAL' : 'DIFFER'} (${v.base_blocks})`).join(' | '));
if (findings.length) { console.log(`FENCE VIOLATIONS: ${findings.length}`); for (const f of findings) console.log(' ', JSON.stringify(f).slice(0, 400)); }
else console.log('FENCE OK — table.js differs from the base only by the sanctioned rox additions');
process.exit(JUDGE && findings.length ? 1 : 0);
