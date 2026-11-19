#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// arm-plan-mirrors-489.mjs — GH-489 #637 landing (ORDER-SNOOKER-637-LAND-17 PM1 / CORRIGENDUM-2; LAND-18 PMA + X1 + X2 + C2W): the census of
// EVERY `planPlayback(` call site in web/app/*.js, web/tools/*.mjs and tools/render/*.mjs, each classed by the duration it plans — decided by
// the MAX LAW over the parsed expression (the vendored acorn, tools/render/lib/vendor/acorn — 8.17.0), never by a substring or a position
// (behaviour refuter of 4d02dee0, P2 #1: `Math.max(` rewritten to `+`, or the completion term dropped, read ARMED under the regex classes).
//   DEFINITION    framestep.js's own `export function planPlayback(` (the law's home)
//   CONVERTED     the duration is ONE `Math.max(` whose completion-carrying argument is a `sinkCompletionSec(` / `.sinkCompletionSec?.(` call,
//                 a member/identifier named `completion`/`completions` (pb.completions, st5.completions, B.completion, completion), an identifier
//                 whose name starts with `completion` (completionForLaw), or a const resolvable ≤ 2 hops to such a term — possibly under a
//                 depth-0 `??` (the degrade); the expression is resolved ≤ 2 hops (identifier → const init → the pb.segEndSec helper's return)
//   CONSUMER      a caller that receives a duration ALREADY planned by a converted producer (`seg.duration` after the drill builder / runExport's
//                 timeline) — the DECLARED producer table replaces the walk and every producer is printed and shape-checked
//   N-A           a call whose duration is not a record plan (a capability probe with duration 0; a frame-time lookup whose total is unused)
//   PLANT-OR-OLD  a deliberate pre-LAND-16 comparison baseline inside a suite or an arm (`old` / `today` / `plant` bindings; the guard cell's `dur`)
//   WALL-PENDING  a different tool's plan, out of this landing's law, pinned to a b19 issue (printed)
//   UNCONVERTED   'sum' (a depth-0 + - * / touches the completion term), 'dropped' (no completion term), 'unclassed' → NOT ARMED
// LAND-18 X1 cell: every plan-feeding `sinkCompletionSec` call in web/app reads the LAZY index through `game.sinkEntries?.()` (never the raw
// `game.sinkInfo` Map — a quietly staged record exported before any frame planned cold); LAND-18 C2W cells: the drill builder's completion read
// PRECEDES the cueOff skip, and the cue-on write is `Math.max(kernelDuration + cueTail, completion)`; LAND-18 X2 census: every `durs + tails`
// plan in playback.js classed PLAN-ESTIMATE (through pb.segEndSec — must be ALL of plannedMontage / plannedFull / plannedFullFrames; a raw sum
// there is ESTIMATE-RAW → NOT ARMED) / DVR-LIVE(GH-864) (the live schedule, out of this landing) / OTHER (→ NOT ARMED). In-arm plants run the
// same classifier over in-memory mutations of the tree (never a file write) and must each turn NOT ARMED by name.
// LAND-19 (the 4ccc018b behaviour refuter, P2 ×2): PMB1 — a NAME is never the completion term; an identifier counts only through its BINDING
// (≤ 2 hops: the const init or the LAST assignment before the use; a PARAMETER iff every call site feeds a completion term or the
// plant/old/today `.duration` baseline) — a binding carrying a sum → UNCONVERTED(sum), a kernel-duration / unresolvable binding →
// UNCONVERTED(alias: name = expr); PMB2 — the producer → consumer HOP is verified (runExport's timeline takes `planDuration`; renderDrill's
// last `seg.duration =` write before the render call is a declared producer; no later overwrite) else UNCONVERTED(hop: …); PMB3 — the law
// cells run first, a missing plant anchor is its own NOT ARMED cell; class E — the export estimate site is ESTIMATE-UNWITNESSED(GH-866).
//   node tools/render/arm-plan-mirrors-489.mjs [--root <repo root>] [--json <out.json>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { parseArgv: __parseArgv } = await import('./lib/argv.mjs');
const __P = __parseArgv({ tag: 'plan-mirrors-arm', value: ['--root', '--json'], bool: [] });
// the vendored acorn is imported AFTER the argv parse: the parse-first fence judges a static import's module body as a pre-parse sibling
// (acorn's own `new TokenType(` is not an allowlisted constructor); a dynamic import after the parse is an effect in its proper place
// LAND-22 P1 (review 775r8-2): the arm NEVER exits without its verdict — everything after the argv parse runs under ONE module-level try/catch
// (it begins here, AFTER `const __P = __parseArgv(…)`: the parse-first fence refuses a parseArgv under a TryStatement); an internal exception
// prints `[plan-mirrors-arm] INTERNAL — <class>: <message> at <file>:<line>; NOT ARMED`, writes the JSON with `internal_error` when --json is
// given, and exits 1
try {
const acorn = await import('./lib/vendor/acorn/acorn.mjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__P.value('--root') ?? path.join(here, '..', '..'));
const JSON_OUT = __P.value('--json') ?? null;
const SELF = path.resolve(fileURLToPath(import.meta.url));
const GLOBS = [['web/app', '.js'], ['web/tools', '.mjs'], ['tools/render', '.mjs']];
const LIVE_ISSUE = 'GH-864';
const ESTIMATE_ISSUE = 'GH-866'; // LAND-19 class E (case 2): the export estimate has no witness against the plan
const TAG = '[plan-mirrors-arm]';

// ---- AST helpers ----
const FN_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
function parseSrc(src) { return acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true }); }
function walk(node, fn, ancestors = []) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, ancestors);
  const anc = ancestors.concat(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'type' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, fn, anc); } else if (v && typeof v.type === 'string') walk(v, fn, anc);
  }
}
const unchain = (n) => (n && n.type === 'ChainExpression' ? n.expression : n);
const propName = (m) => { const p = m.property; if (!p) return null; if (m.computed) return p.type === 'Literal' ? String(p.value) : null; return p.name ?? null; };
/** The NAMED functions enclosing a node, innermost first (anonymous arrows/callbacks are skipped). */
function fnChain(ancestors) {
  const out = [];
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    if (!FN_TYPES.has(a.type)) continue;
    if (a.type === 'FunctionDeclaration' && a.id) { out.push(a.id.name); continue; }
    const p = ancestors[i - 1];
    if (p && p.type === 'VariableDeclarator' && p.id?.name) out.push(p.id.name);
    else if (p && p.type === 'Property' && p.key) out.push(p.key.name ?? String(p.key.value));
    else if (p && p.type === 'MethodDefinition' && p.key) out.push(p.key.name);
  }
  return out;
}
function fnName(node, ancestors) { const c = fnChain(ancestors); return c.length ? c[0] : '(module)'; }
const chainText = (anc) => { const c = fnChain(anc); return c.length ? c.map((x) => x + '()').join(' in ') : '(module)'; };
function enclosingFn(ancestors) { for (let i = ancestors.length - 1; i >= 0; i--) if (FN_TYPES.has(ancestors[i].type)) return ancestors[i]; return null; }
const oneLine = (s) => s.replace(/\s+/g, ' ').trim();

/** Parse every scanned file once; `read(file)` supplies the text (plants override one file in memory). */
function loadTree(read) {
  const files = new Map();
  for (const [dir, ext] of GLOBS) {
    const abs = path.join(ROOT, dir); if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).filter((x) => x.endsWith(ext)).sort()) {
      const file = path.join(dir, f); const full = path.join(abs, f);
      if (path.resolve(full) === SELF) continue;
      const src = read(file, full);
      let ast;
      try { ast = parseSrc(src); } catch (e) { return { parseError: { file, message: e.message } }; }
      const decls = []; const calls = []; const helper = { node: null, ret: null, line: null };
      walk(ast, (n, anc) => {
        if (n.type === 'VariableDeclarator') decls.push({ node: n, fn: enclosingFn(anc), anc });
        // LAND-22 P2: a compound assignment (`+= -= *= /= ??= ||= &&=`) is a WRITE too — its value is the whole expression (never a completion term)
        if (n.type === 'AssignmentExpression' && n.operator !== '=' && n.left.type === 'Identifier') decls.push({ node: { type: 'VariableDeclarator', id: n.left, init: n, start: n.start, loc: n.loc }, fn: enclosingFn(anc), anc, assign: true, compound: true });
        if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'Identifier') decls.push({ node: { type: 'VariableDeclarator', id: n.left, init: n.right, start: n.start, end: n.end, loc: n.loc }, fn: enclosingFn(anc), anc, assign: true });
        if (n.type === 'CallExpression') calls.push({ node: n, anc });
        if (n.type === 'Property' && (n.key?.name ?? n.key?.value) === 'segEndSec' && n.value && FN_TYPES.has(n.value.type)) {
          helper.node = n; helper.line = n.loc.start.line;
          walk(n.value.body, (m) => { if (m.type === 'ReturnStatement' && !helper.ret) helper.ret = m.argument; });
        }
      });
      files.set(file, { file, src, ast, decls, calls, helper, text: (n) => src.slice(n.start, n.end) });
    }
  }
  return { files };
}

// ---- the max law over a resolved expression ----
function isSinkCall(n) {
  n = unchain(n); if (!n || n.type !== 'CallExpression') return false;
  const c = unchain(n.callee);
  return (c.type === 'Identifier' && c.name === 'sinkCompletionSec') || (c.type === 'MemberExpression' && propName(c) === 'sinkCompletionSec');
}
function memberHasCompletion(n) {
  let m = unchain(n);
  while (m && m.type === 'MemberExpression') { const nm = propName(m); if (nm === 'completion' || nm === 'completions') return true; m = unchain(m.object); }
  return false;
}
/** The nearest preceding `const <name> = …` whose scope encloses the use — SCOPE-CORRECT (LAND-21 L1, review 775r7 P2): the innermost
 * binding wins. Walking outward from the use, the first enclosing function that binds `name` — as a PARAMETER (→ null here: paramRule owns it)
 * or by a const/assignment declared inside it before the use — decides; module-level consts count only when no enclosing function binds the
 * name. Before L1 an OUTER `const completion = sinkCompletionSec(…)` was resolved ahead of a shadowing parameter `completion`, so a 60-frame
 * plan fed through that parameter read CONVERTED. Returns { shadowedByParam: fn } when a parameter binds the name. */
function resolveIdent(F, name, useNode, useAnc) {
  const useSet = new Set(useAnc);
  // LAND-24 S2: a switch's cases share ONE lexical scope — a declarator directly in a case is scoped to the SwitchStatement, never the case
  const SCOPE_TYPES = new Set(['BlockStatement', 'Program', 'SwitchStatement', 'StaticBlock', 'ForStatement', 'ForOfStatement', 'ForInStatement']);
  const scopeOf = (anc) => { for (let i = anc.length - 1; i >= 0; i--) { const a = anc[i]; if (SCOPE_TYPES.has(a.type) || FN_TYPES.has(a.type)) return a; } return null; };
  const declList = (b) => b.type === 'BlockStatement' ? b.body : b.type === 'SwitchStatement' ? b.cases.flatMap((c) => c.consequent) : [];
  // LAND-24 S2 (CORR-1): a BlockStatement OR a SwitchStatement (its cases share one scope) declares the name by a non-var declarator
  const blockDeclares = (b, nm) => !!b && (b.type === 'BlockStatement' || b.type === 'SwitchStatement') && declList(b).some((st) => st.type === 'VariableDeclaration' && st.kind !== 'var' && st.declarations.some((dc) => dc.id.type === 'Identifier' && dc.id.name === nm));
  // LAND-23 Q3 (review 775r9-3; CORR-1): visibility governs const/let/class DECLARATORS only — a candidate iff its nearest enclosing
  // BlockStatement / Program / for-head / SwitchCase is an ancestor of the use; `var` declarators and ALL writes stay function-wide candidates
  // (LAND-22 P2 stands), except a write inside a block that itself declares the name (a block-local write, not the parameter's)
  const visible = (d) => {
    const anc = d.anc ?? [];
    if (d.assign) { for (let i = anc.length - 1; i >= 0; i--) { const a = anc[i]; if (FN_TYPES.has(a.type)) break; if (blockDeclares(a, name) && !useSet.has(a)) return false; } return true; }
    const declParent = anc[anc.length - 1]; if (declParent && declParent.type === 'VariableDeclaration' && declParent.kind === 'var') return true;
    const sc = scopeOf(anc); return !sc || useSet.has(sc);
  };
  const isDecl = (d, fn) => d.node.id?.type === 'Identifier' && d.node.id.name === name && d.node.init && d.node.start < useNode.start && d.fn === fn && visible(d);
  for (let i = useAnc.length - 1; i >= 0; i--) {
    const a = useAnc[i]; if (!FN_TYPES.has(a.type)) continue;
    // LAND-22 P2 (review 775r8-1; CORR-1): the innermost enclosing function that BINDS the name decides alone — inside it the LAST write
    // textually before the use (`=`, a compound operator, or an inner shadowing declaration) is the binding; only a function with no such
    // write that declares the name as a PARAMETER runs the parameter rule; enclosing scopes are consulted only when no function binds it
    const hasParam = a.params.some((q) => q.type === 'Identifier' && q.name === name);
    const inner = F.decls.filter((d) => isDecl(d, a));
    if (inner.length) { const d = inner[inner.length - 1]; return hasParam && d.assign ? { ...d, overwroteParam: a } : d; }
    if (hasParam) {
      const outerFns = new Set(useAnc.slice(0, i).filter((x) => FN_TYPES.has(x.type)));
      const outer = F.decls.filter((d) => d.node.id?.type === 'Identifier' && d.node.id.name === name && d.node.init && (d.fn === null || outerFns.has(d.fn)));
      return { shadowedByParam: a, shadowed: outer.length ? outer[outer.length - 1] : null };
    }
  }
  const top = F.decls.filter((d) => isDecl(d, null));
  return top.length ? top[top.length - 1] : null;
}
/** LAND-19 PMB1: the enclosing function that declares `name` as a plain parameter, with the function's binding name and the parameter index. */
function paramOf(F, name, useAnc) {
  for (let i = useAnc.length - 1; i >= 0; i--) {
    const a = useAnc[i]; if (!FN_TYPES.has(a.type)) continue;
    const idx = a.params.findIndex((q) => q.type === 'Identifier' && q.name === name);
    if (idx < 0) continue;
    const p = useAnc[i - 1];
    const fname = a.type === 'FunctionDeclaration' && a.id ? a.id.name : p && p.type === 'VariableDeclarator' && p.id?.name ? p.id.name : p && p.type === 'Property' && p.key ? (p.key.name ?? String(p.key.value)) : null;
    return { fn: a, idx, fname };
  }
  return null;
}
/** The binding name a call's RESULT lands in (`const plant935 = seg(…).frames` → 'plant935'), if any. */
function resultBinding(anc) {
  for (let i = anc.length - 1; i >= 0; i--) { const a = anc[i]; if (a.type === 'VariableDeclarator') return a.id?.name ?? null; if (a.type === 'AssignmentExpression') return a.left?.name ?? null; if (FN_TYPES.has(a.type) || a.type === 'ExpressionStatement' || a.type === 'ReturnStatement') return null; }
  return null;
}
/** LAND-19 PMB1 (CORRIGENDUM-1 §5 ii): a PARAMETER is the completion term iff EVERY call site in the file feeds it a completion term (a sink call,
 * a completion(s) member, a resolvable binding) or a `.duration` member whose result binds to /^(plant|old|today)/ (the PLANT-OR-OLD baseline). */
function paramRule(F, name, useAnc, hops, trail) {
  const pr = paramOf(F, name, useAnc); if (!pr || !pr.fname) return { ok: false, alias: `${name} = <not a resolvable binding>` };
  const sites = [];
  for (const { node: c, anc } of F.calls) {
    const cal = unchain(c.callee); const hit = (cal.type === 'Identifier' && cal.name === pr.fname) || (cal.type === 'MemberExpression' && propName(cal) === pr.fname);
    if (!hit) continue;
    const arg = c.arguments[pr.idx]; const line = c.loc.start.line;
    const fnLine = pr.fn.loc.start.line;
    if (!arg) { sites.push({ ok: false, why: `${name} → param of ${pr.fname}() at :${fnLine} is fed <nothing> at :${line}`, site: { line, expr: '<nothing>' } }); continue; }
    const r = isCompletionTerm(F, arg, anc, hops, trail.concat(`param ${name} ← ${oneLine(F.text(arg))} at :${line}`));
    if (r.ok) { sites.push({ ok: true }); continue; }
    const a = unchain(arg); const bind = resultBinding(anc.concat(c));
    if (a.type === 'MemberExpression' && propName(a) === 'duration' && bind && /^(plant|old|today)/.test(bind)) { sites.push({ ok: true, baseline: `${bind} = the PLANT-OR-OLD baseline (.duration) at :${line}` }); continue; }
    sites.push({ ok: false, why: `${name} → param of ${pr.fname}() at :${fnLine} is fed ${oneLine(F.text(arg))} at :${line}`, site: { line, expr: oneLine(F.text(arg)) } });
  }
  if (!sites.length) return { ok: false, alias: `${name} → param of ${pr.fname}() has no call site in the file`, viaParam: true, pr };
  const bad = sites.find((s) => !s.ok); if (bad) return { ok: false, alias: bad.why, viaParam: true, pr, site: bad.site };
  return { ok: true, kind: `parameter ${name} of ${pr.fname}() (every call site feeds a completion term or the plant/old/today .duration baseline)`, trail };
}
function isCompletionTerm(F, n, useAnc, hops = 2, trail = []) {
  n = unchain(n); if (!n) return { ok: false };
  if (n.type === 'LogicalExpression' && n.operator === '??') return isCompletionTerm(F, n.left, useAnc, hops, trail.concat('?? degrade'));
  if (isSinkCall(n)) return { ok: true, kind: 'sinkCompletionSec call', trail };
  if (n.type === 'Identifier') {
    // LAND-19 PMB1: a NAME is never the term — its BINDING is (≤ 2 hops: the const init or the LAST `name = …` assignment before the use, then once more)
    if (hops <= 0) return { ok: false, alias: `${n.name} = <beyond 2 hops>` };
    const d = resolveIdent(F, n.name, n, useAnc);
    if (d && d.shadowedByParam) {
      // LAND-21 PMB5 (review 775r7 P2): the innermost lexical binding is the parameter — an outer `const completion = …` is never consulted
      const r = paramRule(F, n.name, useAnc, hops, trail.concat(`${n.name} = a parameter of the enclosing function (shadows any outer binding)`));
      if (!r.ok && r.pr) {
        const sh = d.shadowed ? ` (shadows const ${n.name} at :${d.shadowed.node.loc.start.line})` : ' (no outer binding shadowed)';
        const site = r.site ? `; call site :${r.site.line} feeds ${r.site.expr}` : '; no call site';
        (F.notes ??= new Set()).add(`resolved ${n.name} → param #${r.pr.idx} of ${r.pr.fname}() at :${r.pr.fn.loc.start.line}${sh}${site}`);
      }
      return r;
    }
    if (d) {
      const r = isCompletionTerm(F, d.node.init, d.anc, hops - 1, trail.concat(`${n.name} → ${d.assign ? 'assignment' : 'const'} at :${d.node.loc.start.line}`));
      if (r.ok) return r;
      // LAND-22 P2: a parameter overwritten before the plan is classed by the write, in the class label
      if (d.overwroteParam) return { ok: false, alias: `${n.name} ← ${oneLine(F.text(d.node.init))} at :${d.node.loc.start.line} — the parameter was overwritten before the plan`, viaParam: true, init: d.node.init, initAnc: d.anc };
      return { ok: false, alias: `${n.name} = ${oneLine(F.text(d.node.init))} (:${d.node.loc.start.line})`, init: d.node.init, initAnc: d.anc };
    }
    return paramRule(F, n.name, useAnc, hops, trail);
  }
  if (n.type === 'MemberExpression' && memberHasCompletion(n)) return { ok: true, kind: `member ${oneLine(F.text(n))}`, trail };
  return { ok: false };
}
function containsCompletionTerm(F, n, useAnc) {
  let found = false;
  walk(n, (m) => { if (!found && m !== n && isCompletionTerm(F, m, useAnc, 1).ok) found = true; });
  return found || isCompletionTerm(F, n, useAnc, 1).ok;
}
/** { cls: 'max' | 'sum' | 'dropped' | 'unclassed', term, why } for the expression a plan duration resolves to. */
function shapeOf(F, expr, useAnc) {
  const e = unchain(expr); if (!e) return { cls: 'unclassed', why: 'no expression' };
  const isMathMax = e.type === 'CallExpression' && unchain(e.callee).type === 'MemberExpression' && unchain(unchain(e.callee).object).name === 'Math' && propName(unchain(e.callee)) === 'max';
  if (isMathMax) {
    const terms = e.arguments.map((a) => ({ a, r: isCompletionTerm(F, a, useAnc) }));
    const carrying = terms.filter((t) => t.r.ok);
    if (carrying.length) return { cls: 'max', term: carrying[0].r.kind + (carrying[0].r.trail.length ? ` (${carrying[0].r.trail.join(' → ')})` : ''), why: `Math.max(${e.arguments.length} args), completion-carrying: ${carrying.map((t) => oneLine(F.text(t.a))).join(' | ')}` };
    const touched = terms.filter((t) => containsCompletionTerm(F, t.a, useAnc));
    if (touched.length) return { cls: 'sum', why: `a completion term sits INSIDE arithmetic at depth 0 of Math.max: ${touched.map((t) => oneLine(F.text(t.a))).join(' | ')}` };
    // LAND-19 PMB1: an identifier argument whose BINDING carries a sum with the completion term → 'sum' by law; a binding that is a kernel
    // duration (or unresolvable) → 'alias' — never CONVERTED on the strength of its name
    for (const t of terms) {
      if (!t.r.ok && t.r.init && t.r.init.type !== 'Identifier' && containsCompletionTerm(F, t.r.init, t.r.initAnc ?? useAnc)) return { cls: 'sum', why: `alias ${t.r.alias} carries the completion term inside arithmetic (a SUM behind a name)` };
    }
    const aliased = terms.find((t) => !t.r.ok && t.r.alias);
    if (aliased) return { cls: aliased.r.viaParam ? `alias: ${aliased.r.alias}` : 'alias', why: `alias: ${aliased.r.alias} — the name is not the term; its binding is neither a sinkCompletionSec call nor a completion(s) member` };
    return { cls: 'dropped', why: `Math.max without a completion term: ${oneLine(F.text(e))}` };
  }
  if (e.type === 'BinaryExpression' && ['+', '-', '*', '/'].includes(e.operator)) {
    if (containsCompletionTerm(F, e, useAnc)) return { cls: 'sum', why: `the completion term is SUMMED, not max'ed: ${oneLine(F.text(e))}` };
    return { cls: 'dropped', why: `a plain arithmetic plan without the completion term: ${oneLine(F.text(e))}` };
  }
  if (isCompletionTerm(F, e, useAnc).ok) return { cls: 'unclassed', why: `the completion term ALONE (no kernel + tail term): ${oneLine(F.text(e))}` };
  return { cls: 'dropped', why: `no completion term: ${oneLine(F.text(e))}` };
}
/** Resolve a planPlayback duration expression ≤ 2 hops: identifier → const init → the pb.segEndSec helper's return. */
function resolveDuration(F, expr, useAnc) {
  const hops = []; let cur = unchain(expr); let anc = useAnc;
  for (let h = 0; h < 2 && cur; h++) {
    if (cur.type === 'Identifier') {
      const d = resolveIdent(F, cur.name, cur, anc);
      if (!d) { hops.push(`${cur.name}: no const binding found`); break; }
      // LAND-22 20d (review 775r8 P2): a PARAMETER binding carries no declarator node — the walk stops on the identifier and shapeOf →
      // isCompletionTerm → paramRule judges it by its call sites (the prep-20c form dereferenced d.node.loc here and aborted the arm)
      if (d.shadowedByParam) { // LAND-22 P1 (review 775r8-2; CORR-1): the parameter binding hops to EVERY call site of the enclosing function
        const pr = paramOf(F, cur.name, anc);
        if (!pr || !pr.fname) { hops.push(`${cur.name} → param of (anonymous fn) — not a resolvable binding`); return { expr: null, hops, paramSites: [] }; }
        const sites = [];
        for (const { node: c, anc: canc } of F.calls) {
          const cal = unchain(c.callee); const hit = (cal.type === 'Identifier' && cal.name === pr.fname) || (cal.type === 'MemberExpression' && propName(cal) === pr.fname);
          if (!hit) continue;
          const arg = c.arguments[pr.idx]; sites.push({ line: c.loc.start.line, arg: arg ? unchain(arg) : null, anc: canc.concat(c), text: arg ? oneLine(F.text(arg)) : '<nothing>' });
        }
        if (!sites.length) { hops.push(`${cur.name} → param of ${pr.fname}() has no call site in the file`); return { expr: null, hops, paramSites: [], noCallSite: `${cur.name} → param of ${pr.fname}() has no call site in the file` }; }
        for (const st of sites) hops.push(`${cur.name} → param #${pr.idx} of ${pr.fname}() at :${pr.fn.loc.start.line} ← ${st.text} at :${st.line}`);
        return { expr: null, hops, paramSites: sites };
      }
      hops.push(`${cur.name} → const at :${d.node.loc.start.line}`); cur = unchain(d.node.init); anc = d.anc; continue;
    }
    if (cur.type === 'CallExpression' && unchain(cur.callee).type === 'MemberExpression' && propName(unchain(cur.callee)) === 'segEndSec') {
      if (!F.helper.ret) { hops.push('pb.segEndSec(): helper NOT FOUND in this file'); cur = null; break; }
      hops.push(`pb.segEndSec(…) → the helper's return at :${F.helper.ret.loc.start.line}`); cur = unchain(F.helper.ret); anc = []; continue;
    }
    break;
  }
  return { expr: cur, hops };
}

// ---- the declared producer table (anchor text located once; the expression at the anchor is shape-checked) ----
const PRODUCERS = [
  { key: 'runExport planDuration', file: 'web/app/offline-render.js', anchor: 'const planDuration = Math.max(', kind: 'decl', role: 'plan' },
  { key: 'renderDrill completion read', file: 'web/app/offline-render.js', anchor: 'const completion = framestepNs.sinkCompletionSec?.(kernelDuration', kind: 'decl', role: 'completion' },
  { key: 'renderDrill quiet write', file: 'web/app/offline-render.js', anchor: 'seg.duration = Math.max(kernelDuration, completion)', kind: 'assign', role: 'plan' },
  { key: 'renderDrill cue-on write', file: 'web/app/offline-render.js', anchor: 'seg.duration = Math.max(kernelDuration + cueTail, completion)', kind: 'assign', role: 'plan' },
  { key: 'estimate planDuration', file: 'web/app/export.js', anchor: 'const planDuration = Math.max(', kind: 'decl', role: 'plan' },
  { key: 'pb.segEndSec helper', file: 'web/app/playback.js', anchor: 'return Math.max(pb.durs[i] + tailSec', kind: 'return', role: 'plan' },
  { key: 'DVR staging completion', file: 'web/app/playback.js', anchor: 'const completion = framestepNs.sinkCompletionSec?.(durs[i]', kind: 'decl', role: 'completion' },
  { key: '[LEAD4] want5', file: 'web/tools/e2e-export.mjs', anchor: 'const want5 = planPlayback({', kind: 'site', role: 'site' },
  { key: 'completionForLaw', file: 'web/tools/e2e-export.mjs', anchor: 'const completionForLaw = sinkCompletionSec(', kind: 'decl', role: 'completion-node' },
];
const DECLARED_DEFAULT = { file: 'web/app/offline-render.js', anchor: 'const duration = kernelDuration;', note: 'the drill builder\'s declared default before the probe (printed, not classed)' };
// CONSUMER sites (`seg.duration` in offline-render.js) by enclosing function → the producers that fill their timeline
const CONSUMERS = {
  renderTimeline: ['runExport planDuration (via the runExport timeline)', 'renderDrill quiet write', 'renderDrill cue-on write'],
  renderDrill: ['renderDrill quiet write', 'renderDrill cue-on write'],
};
// X2 census: playback.js functions
const ESTIMATE_FNS = new Set(['plannedMontage', 'plannedFull', 'plannedFullFrames']);
const LIVE_FNS = new Set(['locate', 'refreshSchedule', 'strikeAlphaLive', 'setPlaying', 'leadAssocSeg', 'effWindow', 'includedSegments']);
const NON_PLAN = [['evalAlpha', 'the cut-fade drop law: event-time comparisons against the kernel duration (EVENT; the fade clock itself is X7)'], ['renderAtT', 'the ballT clamp at the kernel duration (EVENT); its beat clock departs at E_i (X4)'], ['savePlan', 'fade inclusion against the kernel duration (EVENT) and the POV clip end (WALK-KEY); the GH-299 pin is X6, not a non-plan read'], ['planHasFades', 'event-time comparison (EVENT)'], ['realtimeWallSec', 'the realtime ceiling (b0 = cum + E_i, + beatSec — a WALL on a different quantity; a beat origin, X4; kept by ruling 4)']];

function findAnchor(F, anchor) {
  const i = F.src.indexOf(anchor); if (i < 0) return null;
  if (F.src.indexOf(anchor, i + 1) >= 0) return { dup: true };
  return { index: i, line: F.src.slice(0, i).split('\n').length };
}
function nodeAtAnchor(F, a, kind, anchorLen) {
  const pos = a.index + anchorLen - 1; let best = null; // the innermost node containing the anchor's last character
  walk(F.ast, (n, anc) => {
    const inside = n.start <= pos && n.end > pos; if (!inside) return;
    if (kind === 'decl' && n.type === 'VariableDeclarator' && n.init) best = { expr: n.init, anc };
    if (kind === 'assign' && n.type === 'AssignmentExpression') best = { expr: n.right, anc };
    if (kind === 'return' && n.type === 'ReturnStatement') best = { expr: n.argument, anc };
  });
  return best;
}
function mentions(F, n, name) { let f = false; walk(n, (m) => { if (f) return; if (m.type === 'Identifier' && m.name === name) f = true; if (m.type === 'MemberExpression' && propName(m) === name) f = true; }); return f; }

// ---- the analysis (pure over `read`) ----
function analyze(read) {
  const out = { lines: [], sites: [], producers: [], census: [], cells: [], reasons: [] };
  const say = (s) => out.lines.push(`${TAG} ${s}`);
  const tree = loadTree(read);
  if (tree.parseError) { out.reasons.push(`${tree.parseError.file} failed to parse: ${tree.parseError.message}`); return out; }
  const files = tree.files;
  // (1) producers
  for (const p of PRODUCERS) {
    const F = files.get(p.file); const rec = { ...p, ok: false };
    if (!F) { rec.why = 'file missing'; out.producers.push(rec); continue; }
    const a = findAnchor(F, p.anchor);
    if (!a || a.dup) { rec.why = a?.dup ? 'anchor not unique' : 'anchor MISSING'; out.producers.push(rec); continue; }
    rec.line = a.line;
    if (p.kind === 'site') { rec.ok = true; rec.why = 'a planPlayback site (classed below)'; out.producers.push(rec); continue; }
    const at = nodeAtAnchor(F, a, p.kind, p.anchor.length);
    if (!at) { rec.why = 'no node at the anchor'; out.producers.push(rec); continue; }
    rec.expr = oneLine(F.text(at.expr));
    if (p.role === 'plan') { const s = shapeOf(F, at.expr, at.anc); rec.shape = s.cls; rec.ok = s.cls === 'max'; rec.why = s.why; }
    else if (p.role === 'completion') {
      const call = unchain(at.expr.type === 'LogicalExpression' ? at.expr.left : at.expr);
      const arg = isSinkCall(call) ? unchain(call).arguments[1] : null;
      const cold = arg ? mentions(F, arg, 'sinkInfo') : true; const acc = arg ? mentions(F, arg, 'sinkEntries') : false;
      rec.ok = isSinkCall(call) && !cold && acc; rec.why = !isSinkCall(call) ? 'not a sinkCompletionSec call' : cold ? `COLD READ of game.sinkInfo at ${p.file}:${a.line}` : acc ? 'the lazy accessor game.sinkEntries?.() feeds the completion' : 'the entries argument is neither the accessor nor a completion member';
    } else if (p.role === 'completion-node') { rec.ok = isSinkCall(at.expr); rec.why = rec.ok ? 'a node suite\'s own sinkCompletionSec over the page\'s sink index (outside web/app; the X1 rule is web/app\'s)' : 'not a sinkCompletionSec call'; }
    out.producers.push(rec);
  }
  { const F = files.get(DECLARED_DEFAULT.file); const a = F ? findAnchor(F, DECLARED_DEFAULT.anchor) : null; say(`declared default ${DECLARED_DEFAULT.file}:${a && !a.dup ? a.line : '?'}  ${DECLARED_DEFAULT.anchor}  — ${DECLARED_DEFAULT.note}`); }
  // LAND-19 PMB2 (CORRIGENDUM-1 §6): the hop from producer to consumer is VERIFIED, never assumed — (a) runExport's timeline literal takes the
  // producer identifier `planDuration` as its `duration`, and no later write to a timeline entry's duration precedes the render call;
  // (b) inside renderDrill every `seg.duration =` write before the render call is a declared producer and the LAST one is a producer.
  out.hops = [];
  { const F = files.get('web/app/offline-render.js');
    if (F) {
      const producerTexts = new Set(out.producers.filter((p) => p.kind === 'assign' && p.expr).map((p) => p.expr));
      let runFn = null, drillFn = null;
      walk(F.ast, (n) => { if (n.type === 'FunctionDeclaration' && n.id?.name === 'runExport') runFn = n; if (n.type === 'FunctionDeclaration' && n.id?.name === 'renderDrill') drillFn = n; });
      if (!runFn) out.hops.push({ ok: false, why: 'hop: runExport not found' });
      else {
        let tl = null, renderLine = null; const writes = [];
        walk(runFn, (n, anc) => {
          if (n.type === 'VariableDeclarator' && n.id?.name === 'timeline' && n.init?.type === 'ArrayExpression') tl = n;
          if (n.type === 'CallExpression' && unchain(n.callee).name === 'renderTimeline' && renderLine === null) renderLine = n.loc.start.line;
          if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && propName(n.left) === 'duration' && /timeline/.test(F.text(n.left))) writes.push(n.loc.start.line);
        });
        const first = tl?.init.elements?.[0]; const prop = first && first.type === 'ObjectExpression' ? first.properties.find((q) => q.type === 'Property' && (q.key.name ?? q.key.value) === 'duration') : null;
        const takes = prop ? oneLine(F.text(prop.value)) : '(no duration property)';
        const ok = !!prop && unchain(prop.value).type === 'Identifier' && unchain(prop.value).name === 'planDuration';
        out.hops.push({ ok, why: ok ? `hop OK: runExport's timeline (:${tl.loc.start.line}) takes duration: planDuration (the declared producer)` : `hop: runExport timeline takes ${takes} at :${tl ? tl.loc.start.line : '?'} — not the declared producer planDuration` });
        const late = writes.filter((l) => renderLine === null || l < renderLine);
        if (late.length) out.hops.push({ ok: false, why: `hop: runExport timeline duration overwritten at :${late.join(', :')} before the render call` });
      }
      if (!drillFn) out.hops.push({ ok: false, why: 'hop: renderDrill not found' });
      else {
        let renderLine = null; const writes = [];
        walk(drillFn, (n) => {
          if (n.type === 'CallExpression' && unchain(n.callee).name === 'renderTimeline' && renderLine === null) renderLine = n.loc.start.line;
          if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && propName(n.left) === 'duration' && unchain(n.left.object).name === 'seg') writes.push({ line: n.loc.start.line, text: oneLine(F.text(n.right)) });
        });
        const before = writes.filter((w) => renderLine === null || w.line < renderLine);
        const foreign = before.filter((w) => !producerTexts.has(w.text));
        const last = before[before.length - 1];
        if (!before.length) out.hops.push({ ok: false, why: 'hop: renderDrill writes no seg.duration before its render call' });
        else if (foreign.length) out.hops.push({ ok: false, why: `hop: renderDrill seg.duration overwritten at :${foreign.map((w) => w.line).join(', :')} (${foreign.map((w) => w.text).join(' | ')}) — not a declared producer` });
        else out.hops.push({ ok: true, why: `hop OK: renderDrill's ${before.length} seg.duration writes (:${before.map((w) => w.line).join(', :')}) are the declared producers; the LAST (:${last.line}) is ${last.text}; render call at :${renderLine ?? '?'}` });
      }
    }
    for (const h of out.hops) say(`${h.why}`);
    const badHops = out.hops.filter((h) => !h.ok); if (badHops.length) out.reasons.push(`PMB2 hop: ${badHops.map((h) => h.why).join('; ')}`);
  }
  for (const p of out.producers) say(`producer ${p.key} @ ${p.file}:${p.line ?? '?'}  ${p.expr ?? ''}  → ${p.ok ? 'OK' : 'NOT OK'} — ${p.why}`);
  for (const F of files.values()) for (const note of F.notes ?? []) say(`PMB5 ${F.file}: ${note}`);
  const producerLine = (key) => { const p = out.producers.find((x) => x.key === key.replace(/ \(via .*\)$/, '')); return p ? `${key} @ :${p.line ?? '?'} ${p.ok ? 'OK' : 'NOT OK'}` : `${key} (no producer record)`; };
  // (2) sites
  let unconverted = 0;
  for (const F of files.values()) {
    walk(F.ast, (n, anc) => {
      if (n.type === 'FunctionDeclaration' && n.id?.name === 'planPlayback' && F.file === 'web/app/framestep.js') out.sites.push({ file: F.file, line: n.loc.start.line, duration: '(definition)', cls: 'DEFINITION', why: 'the law\'s home' });
    });
    for (const { node: n, anc } of F.calls) {
      const c = unchain(n.callee); const isPP = (c.type === 'Identifier' && c.name === 'planPlayback') || (c.type === 'MemberExpression' && propName(c) === 'planPlayback');
      if (!isPP) continue;
      const line = n.loc.start.line; const fn = fnName(n, anc);
      const arg0 = n.arguments[0]; let durExpr = null; let shorthand = false;
      if (arg0 && arg0.type === 'ObjectExpression') { const p = arg0.properties.find((q) => q.type === 'Property' && (q.key.name ?? q.key.value) === 'duration'); if (p) { durExpr = p.value; shorthand = !!p.shorthand; } }
      const site = { file: F.file, line, fn, duration: durExpr ? oneLine(F.text(durExpr)) + (shorthand ? '  [shorthand]' : '') : '(none)' };
      const parent = anc[anc.length - 1]; const declName = parent && parent.type === 'VariableDeclarator' ? parent.id?.name : null;
      let cls = null; let why = null;
      if (F.file === 'web/tools/record.mjs') { cls = 'WALL-PENDING(GH-862)'; why = 'a different tool\'s plan (the scenario recorder\'s own clock + --tailsec budget) — out of this landing\'s law; b19 issue GH-862'; }
      else if (F.file === 'web/app/offline-render.js' && durExpr && durExpr.type === 'Literal' && durExpr.value === 0) { cls = 'N-A'; why = 'LEADIN_CAPABLE: a capability probe with duration 0 (no record planned)'; }
      else if (F.file === 'web/tools/e2e-export.mjs' && parent && parent.type === 'MemberExpression' && propName(parent) === 'timeAt') { cls = 'N-A'; why = '[GH-329 wysiwyg] t3: a frame-time lookup (planPlayback(...).timeAt(K3)) on the live record — the plan total is unused'; }
      else if (declName && ['old', 'today', 'plant'].includes(declName) && (F.file.startsWith('web/tools/') || F.file.startsWith('tools/render/'))) { cls = 'PLANT-OR-OLD'; why = `the \`${declName}\` binding: a deliberate pre-LAND-16 / plant comparison baseline inside a suite or an arm (never the app's plan)`; }
      else if (F.file === 'tools/render/arm-sink-completion-489.mjs' && durExpr && durExpr.type === 'Identifier' && durExpr.name === 'dur') { cls = 'PLANT-OR-OLD'; why = 'the leaf arm\'s C2 guard cell: the `dur` baseline the max plan is compared against in the same expression'; }
      else if (F.file === 'web/tools/test-dvr864-verdict.mjs' && c.type === 'MemberExpression' && unchain(c.object)?.type === 'Identifier' && unchain(c.object).name === 'V' && durExpr && (durExpr.type === 'Identifier' || durExpr.type === 'MemberExpression')) { cls = 'N-A'; why = 'DECLARED FILE RULE (GH-864 OQ11): the verdict selftest\'s V.planPlayback fixture calls plan quoted constants (E1, DURS[2]) through the verdict module\'s re-export of framestep\'s planPlayback to assert frame counts — never the app\'s plan'; }
      else if (F.file === 'web/app/offline-render.js' && durExpr && unchain(durExpr).type === 'MemberExpression' && propName(unchain(durExpr)) === 'duration' && unchain(unchain(durExpr).object).name === 'seg') {
        const owner = fnChain(anc).find((x) => CONSUMERS[x]); const prods = owner ? CONSUMERS[owner] : null;
        if (!prods) { cls = 'UNCONVERTED'; why = `a seg.duration consumer in an undeclared function ${chainText(anc)} — declare its producers`; }
        else { const fn = owner; const bad = prods.map((k) => out.producers.find((x) => x.key === k.replace(/ \(via .*\)$/, ''))).filter((p) => !p || !p.ok); const badHop = (out.hops ?? []).filter((h) => !h.ok); cls = bad.length ? 'UNCONVERTED' : badHop.length ? 'UNCONVERTED(hop)' : 'CONSUMER'; why = `${fn}() plans a segment whose duration its producers already set to max(kernel + tail, completion): ${prods.map(producerLine).join('; ')}${bad.length ? ' — a producer is NOT OK' : ''}${badHop.length ? ' — ' + badHop.map((h) => h.why).join('; ') : ' — hop verified'}`; }
      } else if (durExpr) {
        const r = resolveDuration(F, durExpr, anc);
        let s;
        if (r.paramSites && r.paramSites.length) { // LAND-22 P1: every call site's argument must class max, else the first non-max site's why
          const shapes = r.paramSites.map((st) => ({ st, sh: st.arg ? shapeOf(F, st.arg, st.anc) : { cls: 'dropped', why: 'no argument fed' } }));
          const bad = shapes.find((x) => x.sh.cls !== 'max');
          s = bad ? { cls: `param: ${bad.sh.why} (call site :${bad.st.line})`, why: `a parameter-bound plan: call site :${bad.st.line} feeds ${bad.st.text} — ${bad.sh.why}` } : { cls: 'max', term: shapes.map((x) => x.sh.term).join(' | '), why: `a parameter-bound plan: every call site feeds a max plan (${shapes.map((x) => ':' + x.st.line).join(', ')})` };
        } else if (r.noCallSite) s = { cls: `alias: ${r.noCallSite}`, why: `a parameter-bound plan with no call site: ${r.noCallSite}` };
        else s = r.expr ? shapeOf(F, r.expr, anc) : { cls: 'unclassed', why: r.hops.join('; ') };
        if (s.cls === 'max' && F.file === 'web/app/export.js' && fnChain(anc).includes('clipFrames')) { cls = `ESTIMATE-UNWITNESSED(${ESTIMATE_ISSUE})`; why = `CONVERTED by the parsed max law — max(kernel + tail, ${s.term})${r.hops.length ? ` — hops: ${r.hops.join(' → ')}` : ''}; but NO node or browser row equates the estimate's frame count with the plan (class E case 2, ${ESTIMATE_ISSUE}: expose clipFrames/planDuration through __export for the suite)`; }
        else if (s.cls === 'max') { cls = 'CONVERTED'; why = `max(kernel + tail, ${s.term})${r.hops.length ? ` — hops: ${r.hops.join(' → ')}` : ''}`; }
        else { cls = `UNCONVERTED(${s.cls})`; why = `${s.why}${r.hops.length ? ` — hops: ${r.hops.join(' → ')}` : ''}`; }
      } else { cls = 'UNCONVERTED(unclassed)'; why = 'no duration property'; }
      if (cls.startsWith('UNCONVERTED')) unconverted++;
      out.sites.push({ ...site, cls, why });
    }
  }
  out.sites.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  for (const s of out.sites) say(`${s.file}:${s.line}  duration: ${s.duration}  → ${s.cls} — ${s.why}`);
  const byClass = {}; for (const s of out.sites) { const k = s.cls.replace(/\(.*\)$/, s.cls.startsWith('UNCONVERTED') ? '' : '$&'); byClass[k] = (byClass[k] ?? 0) + 1; }
  say(`sites ${out.sites.length}: ${Object.entries(byClass).map(([k, v]) => `${k} ${v}`).join(', ')}; UNCONVERTED ${unconverted}`);
  if (unconverted) out.reasons.push(`${unconverted} UNCONVERTED planPlayback site(s)`);
  const badProd = out.producers.filter((p) => !p.ok); if (badProd.length) out.reasons.push(`producer(s) NOT OK: ${badProd.map((p) => `${p.key} (${p.why})`).join('; ')}`);
  // (3) X1 cell — every plan-feeding sinkCompletionSec call in web/app reads the accessor; SETTLE reads named
  { const F1 = ['web/app/export.js', 'web/app/offline-render.js', 'web/app/playback.js']; const rows = []; let cold = 0;
    for (const file of F1) { const F = files.get(file); if (!F) continue; for (const { node: n } of F.calls) { if (!isSinkCall(n)) continue; const arg = n.arguments[1]; const c = arg ? mentions(F, arg, 'sinkInfo') : true; const a = arg ? (mentions(F, arg, 'sinkEntries') || memberHasCompletion(arg)) : false; if (c || !a) cold++; rows.push(`${file}:${n.loc.start.line} ${c ? 'COLD (game.sinkInfo)' : a ? 'PLAN accessor' : 'PLAN (entries neither accessor nor completion member)'}`); } }
    const settle = []; for (const [file, nm] of [['web/app/game.js', 'g.sinkInfo'], ['web/app/main.js', 'game.sinkInfo']]) { const F = files.get(file); if (!F) continue; for (const { node: n } of F.calls) if (isSinkCall(n)) settle.push(`${file}:${n.loc.start.line} SETTLE (${nm}: the realtime deadline, the same record already animating)`); }
    const ok = cold === 0 && rows.length > 0;
    out.cells.push({ name: 'X1 plan reads through the lazy accessor', ok, detail: `${rows.length} PLAN call(s): ${rows.join('; ')}; ${settle.length} SETTLE call(s): ${settle.join('; ')}; cold reads ${cold}` });
    if (!ok) out.reasons.push(`X1: cold read of game.sinkInfo on a plan path (${rows.filter((r) => /COLD|neither/.test(r)).join('; ')})`); }
  // (4) C2W cells — the drill builder: completion read BEFORE the cueOff skip; the cue-on write is max(kernelDuration + cueTail, completion)
  { const F = files.get('web/app/offline-render.js'); let Lc = null, Li = null, writes = [];
    if (F) walk(F.ast, (n, anc) => {
      const fn = fnName(n, anc.concat(n));
      if (n.type === 'VariableDeclarator' && n.id?.name === 'completion' && n.init && isSinkCall(unchain(n.init).type === 'LogicalExpression' ? unchain(n.init).left : n.init) && fnName(n, anc) === 'renderDrill') Lc = n.loc.start.line;
      if (n.type === 'IfStatement' && unchain(n.test).type === 'MemberExpression' && propName(unchain(n.test)) === 'cueOff' && n.consequent?.type === 'ContinueStatement' && fnName(n, anc) === 'renderDrill') Li = Li ?? n.loc.start.line;
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && propName(n.left) === 'duration' && n.left.object.name === 'seg' && fnName(n, anc) === 'renderDrill') writes.push({ line: n.loc.start.line, right: n.right, anc });
      void fn;
    });
    const c1ok = Lc !== null && Li !== null && Lc < Li;
    out.cells.push({ name: 'C2W1 completion read precedes the cueOff skip', ok: c1ok, detail: `completion read at :${Lc ?? '?'}, \`if (seg.cueOff) continue;\` at :${Li ?? '?'}` });
    if (!c1ok) out.reasons.push(`C2W1: the drill builder's completion read (:${Lc ?? '?'}) does not precede the cueOff skip (:${Li ?? '?'})`);
    const cueOn = F && writes.length ? writes[writes.length - 1] : null; let c2ok = false; let d2 = 'no seg.duration write found';
    if (cueOn) { const r = unchain(cueOn.right); const isMax = r.type === 'CallExpression' && unchain(r.callee).type === 'MemberExpression' && unchain(unchain(r.callee).object).name === 'Math' && propName(unchain(r.callee)) === 'max'; const a0 = isMax ? unchain(r.arguments[0]) : null; const a1 = isMax ? unchain(r.arguments[1]) : null; c2ok = isMax && r.arguments.length === 2 && a0.type === 'BinaryExpression' && a0.operator === '+' && a0.left.name === 'kernelDuration' && a0.right.name === 'cueTail' && a1.type === 'Identifier' && a1.name === 'completion'; d2 = `cue-on write at :${cueOn.line}: ${oneLine(F.text(cueOn.right))} (${writes.length} seg.duration writes in renderDrill: ${writes.map((w) => `:${w.line}`).join(' ')})`; }
    out.cells.push({ name: 'C2W2 cue-on write is Math.max(kernelDuration + cueTail, completion)', ok: c2ok, detail: d2 });
    if (!c2ok) out.reasons.push(`C2W2: the cue-on write is not Math.max(kernelDuration + cueTail, completion) — ${d2}`); }
  // (5) X2 census over playback.js
  { const F = files.get('web/app/playback.js'); const rows = []; let estRaw = 0, other = 0, plan = 0, live = 0; const seen = new Set();
    if (F) {
      if (F.helper.line) rows.push({ line: F.helper.line, fn: 'segEndSec', cls: 'DEFINITION', text: oneLine(F.text(F.helper.ret ?? F.helper.node)) });
      for (const { node: n, anc } of F.calls) { const c = unchain(n.callee); if (c.type === 'MemberExpression' && propName(c) === 'segEndSec') { const ch = fnChain(anc); const isEst = ch.some((x) => ESTIMATE_FNS.has(x)); if (isEst) plan++; rows.push({ line: n.loc.start.line, fn: chainText(anc), cls: isEst ? 'PLAN-ESTIMATE (via pb.segEndSec)' : 'HELPER-CALL (outside the three estimates — informational)', text: oneLine(F.text(n)) }); } }
      walk(F.ast, (n, anc) => {
        if (n.type !== 'BinaryExpression' || n.operator !== '+') return;
        let durs = false, tails = false; walk(n, (m) => { if (m.type === 'MemberExpression') { const p = propName(m); if (p === 'durs' && unchain(m.object).name === 'pb') durs = true; if (p === 'tails') tails = true; } });
        if (!durs || !tails) return; const line = n.loc.start.line; if (seen.has(line)) return; seen.add(line);
        const ch = fnChain(anc); let cls; if (ch[0] === 'segEndSec') return; if (ch.some((x) => ESTIMATE_FNS.has(x))) { cls = 'ESTIMATE-RAW'; estRaw++; } else if (ch.some((x) => LIVE_FNS.has(x))) { cls = `DVR-LIVE(${LIVE_ISSUE})`; live++; } else { cls = 'OTHER'; other++; }
        rows.push({ line, fn: chainText(anc), cls, text: oneLine(F.text(n)).slice(0, 120) });
      });
      rows.sort((a, b) => a.line - b.line);
    }
    out.census = rows; for (const r of rows) say(`durs+tails web/app/playback.js:${r.line} in ${r.fn.endsWith(')') ? r.fn : r.fn + '()'} → ${r.cls}  ${r.text}`);
    say(`durs+tails census over web/app/playback.js: PLAN-ESTIMATE ${plan} (want 3: ${[...ESTIMATE_FNS].join(', ')}), DVR-LIVE(${LIVE_ISSUE}) ${live}, ESTIMATE-RAW ${estRaw} (must be 0), OTHER ${other} (must be 0); non-plan consumers (declared): ${NON_PLAN.map(([f, w]) => `${f}: ${w}`).join('; ')}`);
    const ok = F && plan === 3 && estRaw === 0 && other === 0 && F.helper.ret !== null;
    out.cells.push({ name: 'X2 every export estimate plans through pb.segEndSec', ok, detail: `helper at :${F?.helper.line ?? '?'}; PLAN-ESTIMATE ${plan}/3; ESTIMATE-RAW ${estRaw}; OTHER ${other}; DVR-LIVE ${live}` });
    if (!ok) out.reasons.push(`X2: ${estRaw ? 'an export estimate still sums durs + tails' : other ? 'an unclassed durs + tails consumer exists' : plan !== 3 ? `only ${plan} of the three estimates call pb.segEndSec` : 'the pb.segEndSec helper is missing'}`); }
  // (6) GH-864 law cells X3-X7 over playback.js (class (a): the live schedule ends each segment at E_i = pb.segEndSec(i, tails[i]); fade
  // clock F1). The classifications are the design census's (the X4 allow list, the X5 member classes), ported, not re-derived here.
  { const F = files.get('web/app/playback.js');
    const X4_FNS = ['locate', 'livePovSpec', 'renderAtT', 'syncCueArm', 'realtimeWallSec']; // the beat-origin functions
    const X4_ALLOW = [ // a declared read: the whitespace-collapsed text of its innermost enclosing CallExpression contains the allow text
      ['renderAtT', 'Math.min(at.local, pb.durs[at.i])', 'EVENT: the ballT clamp (the kernel sampler clamps at the record end)'],
      ['livePovSpec', 'povScriptClipped(pb?.recs?.[i], pb?.durs?.[i])', 'WALK-KEY: the rise-carrying base script clips at durs, as the export clips its POV script'],
    ];
    const HELPERS = new Set(['segEndSec', 'segExtSec']);
    const isPbMember = (m, prop) => m && m.type === 'MemberExpression' && !m.computed && propName(m) === prop && unchain(m.object)?.type === 'Identifier' && unchain(m.object).name === 'pb';
    const txt = (n) => F.text(n).replace(/\s+/g, ' ');
    const x3 = new Map(); const x4 = []; const x5 = []; const x6 = []; const x7 = { loops: 0, bareTo: [], extTo: 0 };
    if (F) {
      // X3: the pb.segEndSec calls inside the seven LIVE functions
      walk(F.ast, (n, anc) => {
        if (n.type !== 'CallExpression') return;
        const c = unchain(n.callee); if (c.type !== 'MemberExpression' || propName(c) !== 'segEndSec') return;
        const ch = fnChain(anc); const f = [...LIVE_FNS].find((x) => ch.includes(x));
        if (f) (x3.get(f) || x3.set(f, []).get(f)).push(n.loc.start.line);
      });
      // X4: every computed pb.durs[...] member inside the five beat-origin functions
      walk(F.ast, (n, anc) => {
        if (n.type !== 'MemberExpression' || !n.computed) return;
        if (!isPbMember(unchain(n.object), 'durs')) return;
        const ch = fnChain(anc); const owner = X4_FNS.find((f) => ch.includes(f)); if (!owner) return;
        let ctx = null; for (let i = anc.length - 1; i >= 0; i--) if (anc[i].type === 'CallExpression') { ctx = txt(anc[i]); break; }
        const allow = X4_ALLOW.find(([f, t]) => f === owner && ctx !== null && ctx.includes(t));
        x4.push({ line: n.loc.start.line, owner, cls: allow ? allow[2] : 'UNDECLARED' });
      });
      // X5: every pb.tails member (read or write) in the file
      walk(F.ast, (n, anc) => {
        if (!isPbMember(n, 'tails')) return;
        const parent = anc[anc.length - 1]; const ch = fnChain(anc); let cls;
        if (parent && parent.type === 'AssignmentExpression' && parent.left === n) cls = 'WRITE';
        else if (ch[0] && HELPERS.has(ch[0])) cls = `DEFINITION (${ch[0]} body)`;
        else if (ch.includes('state') && anc.some((a) => a.type === 'Property' && a.key?.name === 'tails')) cls = 'STATE-SEAM';
        else {
          let helperArg = null;
          for (let i = anc.length - 1; i >= 0; i--) {
            const a = anc[i]; if (a.type !== 'CallExpression') continue;
            const c = unchain(a.callee);
            if (c.type === 'MemberExpression' && HELPERS.has(propName(c)) && a.arguments.some((arg) => arg.start <= n.start && n.end <= arg.end)) { helperArg = propName(c); break; }
          }
          cls = helperArg ? `HELPER-ARG (${helperArg})` : 'OTHER';
        }
        x5.push({ line: n.loc.start.line, chain: chainText(anc), cls });
      });
      // X6: savePlan's GH-299 degraded-beat pin = the consequent of the ConditionalExpression whose test reads pb.tails0
      walk(F.ast, (n, anc) => {
        if (n.type !== 'ConditionalExpression' || !fnChain(anc).includes('savePlan')) return;
        if (!txt(n.test).includes('pb.tails0')) return;
        x6.push({ line: n.consequent.loc.start.line, cons: txt(n.consequent) });
      });
      // X7: the evalAlpha cut-fade loop (the for-of over pb?.plan?.cuts) compares on the ext-inclusive clock
      walk(F.ast, (n, anc) => {
        if (n.type !== 'ForOfStatement' || !fnChain(anc).includes('evalAlpha')) return;
        if (!txt(n.right).includes('plan?.cuts')) return;
        x7.loops += 1;
        walk(n.body, (m) => {
          if (m.type === 'Identifier' && m.name === 'To') x7.bareTo.push(m.loc.start.line);
          if (m.type === 'CallExpression' && unchain(m.callee).type === 'Identifier' && unchain(m.callee).name === 'extTo') x7.extTo += 1;
        });
      });
    }
    const liveN = out.census.filter((r) => r.cls === `DVR-LIVE(${LIVE_ISSUE})`).length;
    const missing = [...LIVE_FNS].filter((f) => !x3.has(f));
    const x3ok = !!F && missing.length === 0 && liveN === 0;
    out.cells.push({ name: 'X3 every DVR-LIVE function ends its segment through pb.segEndSec', ok: x3ok, detail: `${LIVE_FNS.size - missing.length} of the ${LIVE_FNS.size} LIVE functions call pb.segEndSec (${[...LIVE_FNS].filter((f) => x3.has(f)).map((f) => `${f} :${x3.get(f).join(' :')}`).join(', ')})${missing.length ? `; missing ${missing.join(', ')}` : ''}; DVR-LIVE(${LIVE_ISSUE}) ${liveN}` });
    if (!x3ok) out.reasons.push(`X3: ${LIVE_FNS.size - missing.length} of the ${LIVE_FNS.size} LIVE functions call pb.segEndSec (missing ${missing.join(', ') || 'none'}); DVR-LIVE(${LIVE_ISSUE}) ${liveN} (want 0: every live span ends at E_i)`);
    const und = x4.filter((r) => r.cls === 'UNDECLARED');
    const x4ok = !!F && und.length === 0;
    out.cells.push({ name: 'X4 every beat origin is E_i', ok: x4ok, detail: `${x4.length} pb.durs[...] read(s) in ${X4_FNS.join('/')}: ${x4.map((r) => `:${r.line} ${r.owner} ${r.cls.replace(/:.*$/, '')}`).join(', ') || 'none'}; UNDECLARED ${und.length}` });
    if (!x4ok) out.reasons.push(`X4: UNDECLARED ${und.length} [${und.map((r) => `:${r.line} ${r.owner}`).join(' ')}] (a beat origin reads the kernel duration, not E_i)`);
    const X5_ORDER = ['HELPER-ARG', 'DEFINITION', 'WRITE', 'STATE-SEAM', 'OTHER'];
    const by = {}; for (const r of x5) { const k = r.cls.replace(/ \(.*\)$/, ''); by[k] = (by[k] ?? 0) + 1; }
    const oth = x5.filter((r) => r.cls === 'OTHER');
    const x5ok = !!F && oth.length === 0;
    out.cells.push({ name: 'X5 no pb.tails read outside the helpers', ok: x5ok, detail: `${x5.length} pb.tails members: ${X5_ORDER.map((k) => `${k} ${by[k] ?? 0}`).join(', ')}` });
    if (!x5ok) out.reasons.push(`X5: OTHER ${oth.length} [${oth.map((r) => `:${r.line} ${r.chain}`).join('; ')}] (a pb.tails read outside pb.segEndSec / pb.segExtSec)`);
    const x6ok = x6.length === 1 && x6[0].cons === 'pb.segEndSec(x.i, 0)';
    out.cells.push({ name: 'X6 the GH-299 degraded-beat pin is pb.segEndSec(x.i, 0)', ok: x6ok, detail: x6.length ? x6.map((r) => `:${r.line} ${r.cons}`).join(' | ') : 'no pin found' });
    if (!x6ok) out.reasons.push(x6.length === 1 ? `X6: the pin is ${x6[0].cons} (want pb.segEndSec(x.i, 0))` : `X6: ${x6.length} degraded-beat pin conditionals in savePlan (want 1)`);
    const x7ok = x7.loops === 1 && x7.bareTo.length === 0 && x7.extTo >= 1;
    out.cells.push({ name: 'X7 the evalAlpha cut-fade compare runs on the ext-inclusive clock', ok: x7ok, detail: `cut-fade loops in evalAlpha ${x7.loops}; bare To ${x7.bareTo.length}${x7.bareTo.length ? ` [${x7.bareTo.map((l) => ':' + l).join(' ')}]` : ''}; extTo ${x7.extTo}` });
    if (!x7ok) out.reasons.push(`X7: ${x7.loops !== 1 ? `cut-fade loops ${x7.loops} (want 1); ` : ''}bare To ${x7.bareTo.length}; extTo ${x7.extTo} (want bare To 0 and extTo >= 1)`); }
  return out;
}

// ---- run: shipped tree, then the in-arm plants (in-memory mutations of one file each) ----
const readDisk = (file, full) => fs.readFileSync(full, 'utf8');
const shipped = analyze(readDisk);
for (const l of shipped.lines) console.log(l);
if (shipped.reasons.length && shipped.lines.length === 0) { console.log(`${TAG} NOT ARMED — ${shipped.reasons.join('; ')}`); process.exit(1); }
let cellNo = 0; const cellLines = [];
const cell = (name, ok, detail) => { cellNo++; const l = `${TAG} cell ${cellNo}: ${name} — ${ok ? 'as required' : 'NOT as required'} (${detail})`; cellLines.push({ name, ok, detail }); console.log(l); return ok; };
let armed = shipped.reasons.length === 0;
// LAND-19 PMB3: the LAW cells (X1, C2W, X2, the PMB2 hop) run BEFORE the plant cells, so a real alias / sum / hop defect reads there by name;
// a plant cell whose anchor is missing stays NOT ARMED (rc 1) as its OWN cell — 'PLANT ANCHOR MISSING (refactor?)' — with the law verdict
// printed beside it, never substituted for it (the rule: an arm that cannot plant is not armed, and a missing anchor is never 'alias'/'sum').
const byClassShipped = {}; for (const s of shipped.sites) { const k = s.cls.startsWith('UNCONVERTED') ? 'UNCONVERTED' : s.cls; byClassShipped[k] = (byClassShipped[k] ?? 0) + 1; }
const lawVerdict = `${shipped.reasons.length === 0 ? 'ARMED' : 'NOT ARMED (' + shipped.reasons.join('; ').slice(0, 160) + ')'} — ${Object.entries(byClassShipped).map(([k, v]) => `${k} ${v}`).join(', ')}`;
shipped.cells.push({ name: 'PMB2 producer → consumer hops verified', ok: (shipped.hops ?? []).every((h) => h.ok) && (shipped.hops ?? []).length > 0, detail: (shipped.hops ?? []).map((h) => h.why).join(' | ') || 'no hop record' });
for (const c of shipped.cells) armed = cell(c.name, c.ok, c.detail) && armed;
const plants = [
  { name: 'plant helper-sum (the pb.segEndSec max rewritten to a sum)', file: 'web/app/playback.js', old: 'return Math.max(pb.durs[i] + tailSec, pb.completions?.[i] ?? pb.durs[i]);', new: 'return pb.durs[i] + tailSec + (pb.completions?.[i] ?? 0);', expect: /UNCONVERTED planPlayback site|producer\(s\) NOT OK: pb\.segEndSec helper/ },
  { name: 'plant cold-read (runExport reads the raw game.sinkInfo Map again)', file: 'web/app/offline-render.js', old: 'framestepNs.sinkCompletionSec?.(game.duration, game.sinkEntries?.() ?? []) ?? game.duration); // degrade: the pre-LAND-16 plan\n  const timeline', new: 'framestepNs.sinkCompletionSec?.(game.duration, game.sinkInfo?.values() ?? []) ?? game.duration); // degrade: the pre-LAND-16 plan\n  const timeline', expect: /X1: cold read of game\.sinkInfo/ },
  { name: 'plant c2-skip-before-read (the cueOff skip moved above the completion read)', file: 'web/app/offline-render.js', old: '      probeStaged = true;\n      const kernelDuration = seg.duration;\n      const completion = framestepNs.sinkCompletionSec?.(kernelDuration, game.sinkEntries?.() ?? []) ?? kernelDuration;\n      seg.duration = Math.max(kernelDuration, completion);\n      // a cueOff plan neither arms NOR extends by the cue (see above) — the\n      // completion above stands; only the cue probes are skipped\n      if (seg.cueOff) continue;', new: '      probeStaged = true;\n      if (seg.cueOff) continue;\n      const kernelDuration = seg.duration;\n      const completion = framestepNs.sinkCompletionSec?.(kernelDuration, game.sinkEntries?.() ?? []) ?? kernelDuration;\n      seg.duration = Math.max(kernelDuration, completion);', expect: /C2W1: the drill builder's completion read/ },
  { name: 'plant c2-sum-not-max (the cue-on write summed)', file: 'web/app/offline-render.js', old: 'seg.duration = Math.max(kernelDuration + cueTail, completion);', new: 'seg.duration = completion + cueTail;', expect: /C2W2: the cue-on write is not Math\.max/ },
  { name: 'plant cap-raw-sum (plannedFull reads durs + tails again)', file: 'web/app/playback.js', old: '+ (x.endT ?? pb.segEndSec(x.i, pb.tails?.[x.i] ?? 0)) - x.startT, 0) // LAND-18 X2\n      / pb.speed;', new: '+ (x.endT ?? (pb.durs[x.i] + (pb.tails?.[x.i] ?? 0))) - x.startT, 0)\n      / pb.speed;', expect: /X2: an export estimate still sums durs \+ tails/ },
  { name: 'plant alias (the estimate takes a completion-NAMED alias bound to the kernel duration — pma-3c shape)', file: 'web/app/export.js', old: '      framestepNs.sinkCompletionSec?.(game.duration, game.sinkEntries?.() ?? []) ?? game.duration); // degrade: the pre-LAND-16 plan\n    return planPlayback({ duration: planDuration, slowmo,', new: '      completionUsed); // PLANT: a completion-named alias\n    return planPlayback({ duration: planDuration, slowmo,', pre: { old: '    const planDuration = Math.max(game.duration + cueTail,\n', new: '    const completionUsed = game.duration;\n    const planDuration = Math.max(game.duration + cueTail,\n' }, expect: /UNCONVERTED planPlayback site/, expectLine: /alias: completionUsed = game\.duration/ },
  { name: 'plant hop (runExport\'s timeline rewired to game.duration + cueTail, the producer left dead — pma-7 shape)', file: 'web/app/offline-render.js', old: '    recordJson: null, record: game.record, duration: planDuration,', new: '    recordJson: null, record: game.record, duration: game.duration + cueTail,', expect: /PMB2 hop: hop: runExport timeline takes game\.duration \+ cueTail/ },
  { name: 'plant max-dropped (runExport plans game.duration + cueTail)', file: 'web/app/offline-render.js', old: 'const planDuration = Math.max(game.duration + cueTail,\n', new: 'const planDuration = (game.duration + cueTail) || Math.max(game.duration + cueTail,\n', expect: /producer\(s\) NOT OK: runExport planDuration|UNCONVERTED planPlayback site/ },
  { name: 'plant P-X3 (refreshSchedule sums durs + tails again)', file: 'web/app/playback.js', old: 'total += pb.segEndSec(i, pb.tails[i]) + (pb.beats[i]?.beatSec ?? 0);', new: 'total += pb.durs[i] + pb.tails[i] + (pb.beats[i]?.beatSec ?? 0);', expect: /X3: .*refreshSchedule/ },
  { name: 'plant P-X4 (livePovSpec\'s beat origin reads the kernel duration again)', file: 'web/app/playback.js', old: 'const tW = pb.segEndSec(i, pb.tails?.[i] ?? 0);', new: 'const tW = pb.durs[i];', expect: /X4: .*livePovSpec/ },
  { name: 'plant P-X5 (the evalAlpha dips add-back sums pb.tails again)', file: 'web/app/playback.js', old: 'for (let i = 0; i < n; i++) s += pb.segExtSec(i);\n        return s;', new: 'for (let i = 0; i < n; i++) s += pb.tails?.[i] ?? 0;\n        return s;', expect: /X5: .*evalAlpha/ },
  { name: 'plant P-X6 (the GH-299 degraded-beat pin reverted to the kernel duration)', file: 'web/app/playback.js', old: '? pb.segEndSec(x.i, 0) : null),', new: '? pb.durs[x.i] : null),', expect: /X6: / },
  { name: 'plant P-X7 (the cut-fade compare reverted to the collapsed clock)', file: 'web/app/playback.js', old: 'const A = outClockSec(s0 + Math.min(tA, pb.durs[c.seg])) + extTo(c.seg) / pb.speed;\n      const h = csSec(c.dur) / 2;\n      if (ToG < A - h || ToG > A + h) continue;\n      a = Math.max(a, fadeS(1 - Math.abs(ToG - A) / h));', new: 'const A = outClockSec(s0 + Math.min(tA, pb.durs[c.seg]));\n      const h = csSec(c.dur) / 2;\n      if (To < A - h || To > A + h) continue;\n      a = Math.max(a, fadeS(1 - Math.abs(To - A) / h));', expect: /X7: .*bare To 3/ },
  { name: 'plant verdict-rule-scope (a bare planPlayback call in the GH-864 verdict selftest is judged by the max law; the declared file rule covers only its V.planPlayback fixture calls)', file: 'web/tools/test-dvr864-verdict.mjs', old: '  const k2 = V.planPlayback({ duration: DURS[2],', new: '  const k2 = planPlayback({ duration: DURS[2],', expect: /(^|; )1 UNCONVERTED planPlayback site\(s\)/, expectLine: /UNCONVERTED\(dropped\) no completion term: DURS\[2\]/ },
];
for (const p of plants) {
  const full = path.join(ROOT, p.file); const src = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  const n = src.split(p.old).length - 1;
  if (n !== 1) { armed = cell(p.name, false, `PLANT ANCHOR MISSING (refactor?) — re-anchor the plant; anchor count ${n} in ${p.file} (want 1); law verdict over the tree: ${lawVerdict}`) && armed; continue; }
  let mutated = src.replace(p.old, p.new);
  if (p.pre) { const k = mutated.split(p.pre.old).length - 1; if (k !== 1) { armed = cell(p.name, false, `PLANT ANCHOR MISSING (refactor?) — re-anchor the plant; pre-anchor count ${k} in ${p.file} (want 1); law verdict over the tree: ${lawVerdict}`) && armed; continue; } mutated = mutated.replace(p.pre.old, p.pre.new); }
  const r = analyze((file, f) => (file === p.file ? mutated : readDisk(file, f)));
  const reason = r.reasons.join('; ');
  const siteText = r.sites.map((s) => `${s.cls} ${s.why}`).join('\n');
  const ok = r.reasons.length > 0 && p.expect.test(reason) && (!p.expectLine || p.expectLine.test(siteText));
  const named = p.expectLine ? (siteText.match(p.expectLine) || [''])[0] : '';
  armed = cell(p.name, ok, ok ? `NOT ARMED by name: ${reason.slice(0, 200)}${named ? ' — site: ' + named : ''}` : `expected ${p.expect}${p.expectLine ? ' + site ' + p.expectLine : ''} — got: ${reason.slice(0, 200) || 'ARMED (the plant was not caught)'}`) && armed;
}
const cellsOk = cellLines.filter((c) => c.ok).length;
if (JSON_OUT) { fs.mkdirSync(path.dirname(path.resolve(JSON_OUT)), { recursive: true }); fs.writeFileSync(JSON_OUT, JSON.stringify({ tool: 'arm-plan-mirrors-489', root: ROOT, sites: shipped.sites, producers: shipped.producers, census: shipped.census, cells: cellLines, cellCount: cellLines.length, armed, reasons: shipped.reasons }, null, 1)); }
console.log(`${TAG} cells ${cellLines.length} (${cellsOk} as required); ${armed ? 'ARMED — every planPlayback site is classed by the max law, every producer is OK, no plan path reads game.sinkInfo, the drill builder reads before it skips and max\'es at the cue-on write, every export estimate plans through pb.segEndSec, every plant is RED by name' : 'NOT ARMED — ' + (shipped.reasons.join('; ') || 'a cell is NOT as required (listed above)')}`);
process.exit(armed ? 0 : 1);
} catch (e) {
  const TAG_I = '[plan-mirrors-arm]';
  const frame = String(e && e.stack || '').split('\n').map((l) => l.trim()).find((l) => /^at .*:\d+:\d+\)?$/.test(l)) ?? '';
  const m = /\(?((?:file:\/\/)?[^()\s]+):(\d+):\d+\)?$/.exec(frame); const where = m ? `${m[1].replace(/^file:\/\//, '')}:${m[2]}` : '(no frame)';
  const cls = e && e.constructor && e.constructor.name ? e.constructor.name : 'Error'; const msg = e && e.message !== undefined ? e.message : String(e);
  console.log(`${TAG_I} INTERNAL — ${cls}: ${msg} at ${where}; NOT ARMED`);
  const jsonOut = __P.value('--json') ?? null;
  if (jsonOut) { try { fs.mkdirSync(path.dirname(path.resolve(jsonOut)), { recursive: true }); fs.writeFileSync(jsonOut, JSON.stringify({ tool: 'arm-plan-mirrors-489', armed: false, internal_error: { class: cls, message: msg, stack: String(e && e.stack || '') } }, null, 1)); } catch { /* the line above is the verdict */ } }
  process.exit(1);
}
