#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// parse-first-fence.mjs — the FIX10 source fence (ORDER-CN8-731-FIX10, review round 10 on #731), REBUILT ON THE AST after two Fable passes
// showed a text-level fence passing 9, then 34, differently spelled pre-scans. THE LAW: every tool that invalidates a prior artefact
// parses its WHOLE argv to completion FIRST — help exits 0, errors exit 2 — before ANY filesystem or process effect, and its first
// effect takes the PARSED result.
//
// JS (acorn, vendored under lib/vendor/acorn): every .mjs under tools/render is parsed; a tool is JUDGED when it calls parseArgv, imports
// an invalidation helper (under any alias) or references a removal anywhere. For a judged tool, in EXECUTION order — every top-level
// statement before the one holding the parseArgv call, the rest of that statement, the bodies of local functions called on the way
// (call graph), and the module scope of every module it imports (any path, recursively) — the fence FAILS on:
//   * any REFERENCE (call or not — a callback handed to forEach is a reference) to an effect name: rm / rmSync / unlink* / rmdir* /
//     writeFile* / appendFile* / mkdir* / rename* / copyFile* / truncate* / createWriteStream / symlink* / chmod* / utimes* / spawn* /
//     exec* / fork / createServer / listen / open / cp*;
// A VENDORED module (any path with a `vendor/` component — the same directory the file walk already skips) is NOT judged: third-party
// code is not this repo's parse-first law, and judging acorn's module scope reports 465 findings about MIT table construction. It is
// PINNED instead — content sha256 in parse-first-pins.json under `vendor`, keyed by the path below `vendor/`, so one pin covers the
// real path and the web/tools/render symlink both; an unpinned vendored module is a FAIL, a changed one is a FAIL naming both shas,
// and every pin the run actually reached is printed in the HELD line. (GH-750: the first judged tool to reach vendored code was
// web/tools/cdp.mjs, whose JS readers are the vendored acorn; before that the exemption had never been exercised.)
//   * any COMPUTED member access (obj['rm' + 'Sync']), any .call / .apply / .bind / Reflect / Function / eval / new Function, a getter,
//     a tagged template, a dynamic import whose specifier is not a relative string literal (data: URLs), an unknown `new`;
//   * any CALL whose callee is neither allowlisted by FULL dotted name (path.*, JSON.*, Math.*, Object.*, console.*, process.exit /
//     argv.slice / env / cwd, fs READ functions only, new Set / Map / URL / RegExp …) nor a method call by an allowlisted method name
//     on an expression, nor a local function (which is then judged by its body — a local `nope` or `refuse` is judged, never trusted);
//   * a parseArgv call that is not a top-level statement (a parser inside a function is judged from its call site — or refused);
//   * after the parse: any `process.argv` other than the `expandEqArgs(process.argv.slice(2))` view or parseArgv's own argument
//     (a raw reader after the parse is a second reader);
//   * a tool that removes / invalidates but has no parseArgv.
// Python: lib/parse_first_ast.py (the `ast` module) judges each .py the same way — module-level statements in order (compound subtrees,
// decorators, defaults, class bodies), the dispatch's call graph up to parse_args / the positional scripts' marker (which counts only
// when the next statement is an invalidation call), imported local modules and exec_module targets at module scope, open() modes.
// Also: the declaration audit (a flag read as a value is declared under value/multi; a bool is never read as a value; a presence-tested
// flag is declared; a value flag is never read by a raw presence test alone) and a PINNED LIST of the 39 invalidating tools — the fence
// FAILS if any of them stops being judged (a tool cannot drop out silently).
// Limits, stated: a static judgement — a string-built module path, an effect reached through a value the fence cannot type, or a
// helper outside the repo are beyond it; the RUNTIME arms (arms-fix10.sh) remain the evidence that no effect precedes the parse.
// Usage: node tools/render/lib/parse-first-fence.mjs [--root DIR]   (DIR = another tools/render — an export or the red arm's scratch copy)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { spawnSync } from 'node:child_process'; import { createHash } from 'node:crypto';
import * as acorn from './vendor/acorn/acorn.mjs';
import { obParser, OB_PARSE_OPTIONS } from './acorn-obparser.mjs';
import { parseArgv } from './argv.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const __P = parseArgv({ tag: 'parse-first-fence', value: ['--root'], unknown: 'refuse', positionals: 'none' });
const ROOT = path.resolve(__P.value('--root') ?? path.resolve(HERE, '..'));
if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) { console.error(`[parse-first-fence] REFUSED — --root ${JSON.stringify(ROOT)} is not a directory`); process.exit(2); }
const SKIP = new Set(['fixtures', 'node_modules', 'vendor', '__pycache__']);
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p); } else if (/\.(mjs|py)$/.test(e.name)) files.push(p); } })(ROOT);
const rel = (f) => path.relative(path.resolve(ROOT, '..', '..'), f);
const PINS = JSON.parse(fs.readFileSync(path.join(HERE, 'parse-first-pins.json'), 'utf8')); // COMPANION-1b: the pinned / exempt lists live beside the fence as data (see the json's _comment)
const PINNED = PINS.pinned;
// EXEMPT (stated, never silent): tools outside the 39 whose removals are their OWN scratch / run directories, not a prior verdict — they never had a
// parse-first conversion (they are not verdict writers in FIX3's list); each is named in the HELD output with its removal targets, and orbitsweep-488p
// (an evidence generator that clears run dirs under its own --pack) is filed as an open row for a companion, not converted in this round
const EXEMPT_SHA = Object.fromEntries(Object.entries(PINS.exempt).map(([k, v]) => [k, v.sha])); // sha256 of each exempt file at the exemption — an edit re-opens the judgement (Fable pass 4)
const EXEMPT = Object.fromEntries(Object.entries(PINS.exempt).map(([k, v]) => [k, v.why]));
const VENDOR_PIN = PINS.vendor ?? {}; // a third-party module reached from a judged tool: pinned by content, never judged (see the header)
const vendorReached = new Map(); const vendorSha = new Map();
let fail = 0; const held = []; const judgedSet = new Set(); const exempted = [];
const say = (f, line, m) => { console.error(`[parse-first-fence] FAIL ${typeof f === 'string' ? f : rel(f)}:${line} ${m}`); fail++; };

// ---------------------------------------------------------------- JS
const EFFECT_NAMES = new Set(['rm', 'rmSync', 'unlink', 'unlinkSync', 'rmdir', 'rmdirSync', 'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'mkdir', 'mkdirSync', 'mkdtemp', 'mkdtempSync', 'rename', 'renameSync', 'copyFile', 'copyFileSync', 'cp', 'cpSync', 'truncate', 'truncateSync', 'ftruncateSync', 'createWriteStream', 'symlink', 'symlinkSync', 'link', 'linkSync', 'chmod', 'chmodSync', 'chown', 'chownSync', 'utimes', 'utimesSync', 'writeSync', 'openSync', 'open', 'spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork', 'createServer', 'listen', 'connect', 'Worker', 'eval', 'Function', 'Reflect', 'Proxy', 'Atomics', 'WebAssembly', 'fetch', 'XMLHttpRequest', 'WebSocket', 'kill', 'abort']);
const FS_READ = new Set(['readFileSync', 'existsSync', 'statSync', 'lstatSync', 'realpathSync', 'readdirSync', 'accessSync', 'readlinkSync', 'constants', 'promises']);
const PURE_BASES = { zlib: null, path: null, JSON: null, Math: null, Object: new Set(['freeze', 'keys', 'values', 'entries', 'assign', 'fromEntries', 'create', 'hasOwn', 'is', 'getOwnPropertyNames', 'defineProperty']), Array: new Set(['from', 'isArray', 'of']), Number: null, String: null, Boolean: null, Symbol: null, console: null, Date: new Set(['now']), Intl: null, Buffer: new Set(['from', 'alloc', 'byteLength', 'concat', 'isBuffer']), process: new Set(['exit', 'cwd', 'on', 'once', 'off', 'emitWarning', 'hrtime', 'nextTick', 'uptime', 'memoryUsage']), url: null, os: new Set(['tmpdir', 'homedir', 'platform', 'cpus', 'EOL', 'constants', 'hostname', 'type', 'arch', 'release']), crypto: new Set(['createHash', 'randomUUID', 'randomBytes']), util: new Set(['inspect', 'format', 'promisify', 'types']), performance: new Set(['now']), globalThis: new Set([]) };
const CTOR_ALLOW = new Set(['Set', 'Map', 'WeakMap', 'WeakSet', 'URL', 'URLSearchParams', 'RegExp', 'Error', 'TypeError', 'RangeError', 'Date', 'Promise', 'TextDecoder', 'TextEncoder', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'Int32Array', 'ArrayBuffer', 'DataView', 'Array', 'Object', 'String', 'Number', 'Boolean', 'AbortController', 'Intl.NumberFormat', 'Intl.DateTimeFormat']);
const ID_ALLOW = new Set(['String', 'Number', 'Boolean', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Symbol', 'BigInt', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'structuredClone', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'Error', 'fileURLToPath', 'pathToFileURL', 'resolve', 'join', 'dirname', 'basename', 'extname', 'relative', 'normalize', 'isAbsolute', 'createRequire', 'expandEqArgs', 'argv', 'parseArgv', '__parseArgv', 'createHash', 'inspect', 'format', 'promisify', 'require', 'import']);
const BUFFER_METHODS = new Set(['readUInt32BE', 'readUInt16BE', 'readUInt8', 'readInt32BE', 'readInt16BE', 'readInt8', 'readUInt32LE', 'readUInt16LE', 'readInt32LE', 'readInt16LE', 'readFloatLE', 'readFloatBE', 'readDoubleLE', 'readDoubleBE', 'readBigUInt64LE', 'readBigUInt64BE', 'subarray', 'equals', 'copy', 'write', 'writeUInt32BE', 'writeUInt16BE', 'writeUInt8', 'writeInt32BE', 'writeInt16BE', 'fill', 'indexOf', 'toString', 'compare', 'byteLength', 'inflateSync', 'deflateSync', 'gunzipSync', 'gzipSync', 'crc32']);
const METHOD_ALLOW = new Set(['slice', 'map', 'filter', 'includes', 'indexOf', 'lastIndexOf', 'startsWith', 'endsWith', 'trim', 'trimStart', 'trimEnd', 'split', 'join', 'find', 'findIndex', 'findLast', 'some', 'every', 'has', 'get', 'set', 'add', 'delete', 'push', 'pop', 'shift', 'unshift', 'splice', 'toFixed', 'toPrecision', 'replace', 'replaceAll', 'test', 'match', 'matchAll', 'exec', 'sort', 'toSorted', 'reverse', 'concat', 'padStart', 'padEnd', 'repeat', 'toString', 'toUpperCase', 'toLowerCase', 'at', 'flat', 'flatMap', 'reduce', 'reduceRight', 'forEach', 'entries', 'keys', 'values', 'fill', 'charCodeAt', 'codePointAt', 'charAt', 'localeCompare', 'substring', 'substr', 'search', 'normalize', 'toLocaleString', 'valueOf', 'then', 'catch', 'finally', 'update', 'digest', 'toISOString', 'getTime', 'toJSON', 'length', 'size', 'next', 'return', 'throw', 'trunc', 'round', 'floor', 'ceil', 'abs', 'min', 'max', 'sqrt', 'hypot', 'pow', 'sign', 'atan2', 'sin', 'cos', 'tan', 'log', 'error', 'warn', 'info', 'debug', 'table', 'group', 'groupEnd', 'stringify', 'parse', 'freeze', 'assign', 'fromEntries', 'isInteger', 'isSafeInteger', 'from', 'of', 'isArray', 'hasOwn', 'is', 'now', 'exit', 'cwd', 'on', 'once', 'off', 'emitWarning', 'href', 'pathname', 'searchParams', 'append', 'toSpliced', 'with', 'clear']);
// `exec` is both RegExp.prototype.exec and child_process.exec — a member `.exec(` on a RegExp literal / test expression is a method, `exec(` bare or on a child_process binding is an effect
// THE SAME PARSER THE READERS USE (GH-750 FIX4). Stock acorn's regex-versus-division context tracking is wrong on
// three measured surfaces, and being wrong there is not a token-stream curiosity: the vendored parser REFUSES
// `const n = obj?.return / 2;`, `const n = obj?.in / 2;`, `const n = obj?.typeof / 2;`, `const n = obj?.default / 2;`
// and `const x = async function () {} / 2;` outright — `Unterminated regular expression`, measured on all five.
// REACH, stated exactly: this fence parses the JUDGED tools (a parseArgv call, an invalidation import, or a removal
// spelling) and the module scope of every module they import, recursively — NOT every .mjs under the walk. So the
// five shapes bite precisely there, and one of those imported modules is web/tools/cdp.mjs, whose readers are the
// subject of GH-750. A tool that writes any of the five is reported as `unparseable`, which reads as a tool the
// parse-first law cannot judge when in fact the tool is fine and the parser is not. Measured on a synthetic --root
// holding one judged tool with all five shapes: stock acorn says `FAIL … unparseable: Unterminated regular
// expression (9:23)`; obParser judges it and holds. The second row matters more than the first — the truth table in
// web/tools/test-js-scan.mjs also plants an effect BEFORE the parse in that same tool, so "the fence stopped
// refusing" can be told apart from "the fence stopped looking".
// obParser() is acorn.Parser.extend with rules R1/R2/R3; it is built on first use (never at module scope, which
// this fence would otherwise have to allowlist), the vendored bytes are untouched and still content-pinned, and its
// static `parse` is acorn's own.
const jsParse = (src, f) => { try { return obParser().parse(src, { ...OB_PARSE_OPTIONS, allowAwaitOutsideFunction: true }); } catch (e) { say(f, e.loc?.line || 1, `unparseable: ${e.message.slice(0, 100)}`); return null; } };
const pr_isNum = (p) => p.type === 'Literal' && typeof p.value === 'number';
const dotted = (n) => { const parts = []; while (n && n.type === 'MemberExpression') { if (n.computed) return null; parts.push(n.property.name); n = n.object; } if (n && n.type === 'Identifier') { parts.push(n.name); return parts.reverse().join('.'); } if (n && (n.type === 'ThisExpression' || n.type === 'MetaProperty')) { parts.push(n.type === 'ThisExpression' ? 'this' : 'import.meta'); return parts.reverse().join('.'); } return null; };
function* children(n) { for (const k of Object.keys(n)) { if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue; const v = n[k]; if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') yield x; } else if (v && typeof v.type === 'string') yield v; } }
const containsParse = (n, deep = false) => { let found = false; (function w(x) { if (found || !x) return; if (x.type === 'CallExpression' && x.callee.type === 'Identifier' && /^(__)?parseArgv$/.test(x.callee.name)) { found = true; return; } if (!deep && /Function/.test(x.type)) return; /* a parse inside a merely-defined function (even the statement's own) is not executed by this statement */ for (const c of children(x)) w(c); })(n); return found; };

class JsJudge {
  constructor(file, src, ast, seen, asSibling = false) { this.asSibling = asSibling; this.effectAliases = new Set(); this.file = file; this.src = src; this.ast = ast; this.seen = seen; this.funcs = new Map(); this.imports = new Map(); this.fsBindings = new Set(); this.judgedFuncs = new Set(); this.collect(); }
  collect() {
    this.isMainBinding = false;
    for (const st of this.ast.body) {
      if (st.type === 'VariableDeclaration') for (const d of st.declarations) if (d.id.type === 'Identifier' && d.id.name === 'isMain' && d.init && /import\.meta\.url|process\.argv\[1\]|fileURLToPath/.test(this.src.slice(d.init.start, d.init.end))) this.isMainBinding = true;
      if (st.type === 'FunctionDeclaration' && st.id) this.funcs.set(st.id.name, st);
      if (st.type === 'VariableDeclaration') for (const d of st.declarations) if (d.id.type === 'Identifier' && d.init && /Function/.test(d.init.type)) this.funcs.set(d.id.name, d.init);
      if (st.type === 'ExportNamedDeclaration' && st.declaration) { const d = st.declaration; if (d.type === 'FunctionDeclaration' && d.id) this.funcs.set(d.id.name, d); if (d.type === 'VariableDeclaration') for (const x of d.declarations) if (x.id.type === 'Identifier' && x.init && /Function/.test(x.init.type)) this.funcs.set(x.id.name, x.init); }
      if (st.type === 'ImportDeclaration') { const spec = st.source.value; for (const s of st.specifiers) { const local = s.local.name; const imported = s.type === 'ImportSpecifier' ? (s.imported.name ?? s.imported.value) : (s.type === 'ImportDefaultSpecifier' ? 'default' : '*'); this.imports.set(local, { spec, imported }); if (/^(node:)?fs(\/promises)?$/.test(spec)) this.fsBindings.add(local); } }
    }
  }
  fail(n, m) { say(this.file, n.loc?.start.line ?? 0, m); }
  // judge everything EXECUTED by node (expressions and statements), following calls to local functions
  judge(node, skipParse = false) {
    const stack = [node];
    while (stack.length) {
      const n = stack.pop(); if (!n) continue;
      switch (n.type) {
        case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': continue; // a definition executes nothing (judged when called)
        case 'ClassDeclaration': case 'ClassExpression': { if (n.superClass) stack.push(n.superClass); for (const m of n.body.body) { if (m.type === 'StaticBlock') { for (const st of m.body) stack.push(st); continue; } if (m.computed && m.key) stack.push(m.key); if (m.static && m.value) stack.push(m.value); if (m.kind === 'get' || m.kind === 'set') this.fail(m, 'a getter / setter in the region — an effect can hide behind a property read'); } continue; }
        case 'TaggedTemplateExpression': this.fail(n, 'a tagged template ahead of the parser is a call by another name'); continue;
        case 'ImportExpression': { const s = n.source; if (s.type === 'Literal' && typeof s.value === 'string' && s.value.startsWith('.')) this.sibling(s.value, n); else if (s.type === 'Literal' && /^node:/.test(s.value)) { /* builtin */ } else this.fail(n, `a dynamic import whose specifier is not a relative string literal: ${this.src.slice(s.start, s.end).slice(0, 60)}`); continue; }
        case 'MemberExpression': {
          if (n.computed && pr_isNum(n.property)) { stack.push(n.object); continue; }
          if (n.computed) { const o = n.object; const pr = n.property; const moduleish = (o.type === 'Identifier' && (this.imports.has(o.name) || this.fsBindings.has(o.name) || o.name === 'process' || o.name === 'globalThis' || o.name === 'Reflect')) || o.type === 'AwaitExpression' || o.type === 'ImportExpression' || (o.type === 'CallExpression' && o.callee.type === 'Identifier' && /^(require|import)$/.test(o.callee.name)) || (o.type === 'MemberExpression' && dotted(o) && /^(process|globalThis|import\.meta)/.test(dotted(o)));
            const stringy = (pr.type === 'Literal' && typeof pr.value === 'string') || pr.type === 'TemplateLiteral' || pr.type === 'CallExpression' || pr.type === 'ConditionalExpression' || pr.type === 'LogicalExpression' || (pr.type === 'BinaryExpression' && pr.operator === '+' && (pr.left.type === 'Literal' && typeof pr.left.value === 'string' || pr.right.type === 'Literal' && typeof pr.right.value === 'string'));
            if (moduleish || stringy) { this.fail(n, `a computed member access ahead of the parser: ${this.src.slice(n.start, n.end).slice(0, 60)}`); continue; }
            stack.push(n.object); stack.push(n.property); continue; }
          if (!n.computed) { const p = n.property.name; if (EFFECT_NAMES.has(p) && !(p === 'exec' && this.isRegExpish(n.object)) && !(p === 'open' && false)) this.fail(n, `a reference to an effect: .${p}`); if ((p === 'call' || p === 'apply' || p === 'bind') ) this.fail(n, `.${p} — an indirect invocation ahead of the parser`); const base = dotted(n.object); if (base && this.fsBindings.has(base.split('.')[0]) && !FS_READ.has(p)) this.fail(n, `fs.${p} is not a read`); }
          stack.push(n.object); if (n.computed) stack.push(n.property); continue; }
        case 'Identifier': { if (EFFECT_NAMES.has(n.name) && !this.funcs.has(n.name)) this.fail(n, `a reference to an effect: ${n.name}`); const imp = this.imports.get(n.name); if (imp && /^(node:)?fs(\/promises)?$/.test(imp.spec) && imp.imported !== '*' && imp.imported !== 'default' && !FS_READ.has(imp.imported)) this.fail(n, `${n.name} is fs.${imp.imported}, not a read`); if (imp && /^(node:)?child_process$/.test(imp.spec)) this.fail(n, `${n.name} is child_process.${imp.imported}`); continue; }
        case 'NewExpression': { const d = dotted(n.callee); if (!d || !CTOR_ALLOW.has(d)) this.fail(n, `new ${d || '<computed>'}( is not an allowlisted constructor`); for (const a of n.arguments) { if (a.type === 'FunctionExpression' || a.type === 'ArrowFunctionExpression') stack.push(a.body); else if (a.type === 'Identifier' && this.funcs.has(a.name)) this.judgeFunc(a.name, n); else stack.push(a); } continue; }
        case 'CallExpression': {
          const c = n.callee;
          { const cn = c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed ? c.property.name : null); if (cn && EFFECT_NAMES.has(cn) && !(cn === 'exec' && c.type === 'MemberExpression' && this.isRegExpish(c.object)) && !this.funcs.has(cn)) { this.fail(n, `a call to an effect: ${cn}( — the backstop runs before any allow-list`); for (const a of n.arguments) stack.push(a); continue; } }
          if (skipParse && c.type === 'Identifier' && /^(__)?parseArgv$/.test(c.name)) { for (const a of n.arguments) stack.push(a); continue; }
          if (c.type === 'Identifier') {
            if (this.effectAliases.has(c.name)) { this.fail(n, `${c.name}( is an effect bound under a local name`); for (const a of n.arguments) stack.push(a); continue; }
            if (this.funcs.has(c.name)) this.judgeFunc(c.name, n);
            else if (this.imports.has(c.name)) { const imp = this.imports.get(c.name); if (!(ID_ALLOW.has(c.name) || ID_ALLOW.has(imp.imported) || FS_READ.has(imp.imported))) this.fail(n, `${c.name}( (imported ${imp.imported} from ${imp.spec}) is not an allowlisted read / declaration`); }
            else if (!ID_ALLOW.has(c.name)) this.fail(n, `${c.name}( is not an allowlisted read / declaration nor a local function`);
          } else if (c.type === 'MemberExpression') {
            const d = dotted(c);
            if (d === null) { if (!c.computed && (METHOD_ALLOW.has(c.property.name) || ID_ALLOW.has(c.property.name) || BUFFER_METHODS.has(c.property.name))) { /* a method on an expression */ } else this.fail(n, `a call through a computed / complex callee: ${this.src.slice(c.start, c.end).slice(0, 60)}`); stack.push(c); }
            else { const [base, ...restParts] = d.split('.'); const last = restParts[restParts.length - 1]; const bd = this.fsBindings.has(base) ? 'fs' : (this.imports.get(base)?.spec?.replace(/^node:/, '') ?? null);
              const ok = (bd === 'fs' && FS_READ.has(last) && restParts.length === 1) || (base in PURE_BASES && (PURE_BASES[base] === null || PURE_BASES[base].has(restParts[0]))) || (base === 'process' && d === 'process.argv.slice') || (base === 'process' && restParts[0] === 'env') || (this.imports.has(base) && bd && !/^(fs|child_process|net|http|https|worker_threads|dgram|cluster|vm|repl|inspector)$/.test(bd) && bd.startsWith('.') === false && METHOD_ALLOW.has(last)) || (this.imports.has(base) && bd && bd.startsWith('.') && (METHOD_ALLOW.has(last) || ID_ALLOW.has(last))) || (!this.imports.has(base) && !(base in PURE_BASES) && (METHOD_ALLOW.has(last) || BUFFER_METHODS.has(last)) && !this.fsBindings.has(base));
              if (!ok) this.fail(n, `${d}( is not an allowlisted read / declaration`); stack.push(c); }
          } else if (c.type === 'FunctionExpression' || c.type === 'ArrowFunctionExpression') { stack.push(c.body); }
          else { this.fail(n, `a call through ${c.type} ahead of the parser`); stack.push(c); }
          { const deferred = c.type === 'MemberExpression' && !c.computed && /^(on|once|addListener|prependListener|prependOnceListener|removeListener|off)$/.test(c.property.name); // an event registration runs its callback later (exit / signal hooks), never ahead of the parse
            for (const a of n.arguments) { if (a.type === 'FunctionExpression' || a.type === 'ArrowFunctionExpression') { if (!deferred) stack.push(a.body); } else if (a.type === 'Identifier' && this.funcs.has(a.name)) { if (!deferred) this.judgeFunc(a.name, n); } else stack.push(a); } continue; } } // a callback executes inside the callee — its body is judged (Fable pass 4)
        case 'VariableDeclarator': { const init = n.init; const fromFs = init && ((init.type === 'Identifier' && this.fsBindings.has(init.name)) || (init.type === 'CallExpression' && init.callee.type === 'Identifier' && init.callee.name === 'require' && init.arguments[0]?.type === 'Literal' && /^(node:)?(fs|fs\/promises|child_process)$/.test(String(init.arguments[0].value))) || (init.type === 'AwaitExpression' && init.argument.type === 'ImportExpression' && init.argument.source.type === 'Literal' && /^(node:)?(fs|fs\/promises|child_process)$/.test(String(init.argument.source.value)))); // a builtin effect module bound by destructure / alias; a relative lib import is judged by its own module scope (an effect under an allowlisted export name is a stated limit)
          if (fromFs) { const effectful = !(init.type === 'Identifier'); if (n.id.type === 'Identifier') { if (init.type === 'Identifier') this.fsBindings.add(n.id.name); else this.effectAliases.add(n.id.name); } else if (n.id.type === 'ObjectPattern') { for (const pr of n.id.properties) { if (pr.type !== 'Property') { this.fail(pr, 'a rest pattern over a module binding'); continue; } const key = pr.key.type === 'Identifier' && !pr.computed ? pr.key.name : (pr.key.type === 'Literal' ? String(pr.key.value) : null); const local = pr.value.type === 'Identifier' ? pr.value.name : null; if (key === null) { this.fail(pr, 'a computed key over a module binding'); continue; } if (EFFECT_NAMES.has(key) || (!FS_READ.has(key) && (init.type !== 'Identifier' || true))) { if (!FS_READ.has(key)) { this.fail(pr, `${key} bound from a module binding is an effect (as ${local})`); if (local) this.effectAliases.add(local); } } } } }
          if (init && !fromFs && n.id.type === 'Identifier' && /Function/.test(init.type)) { /* a function definition: judged when called */ } else { if (init) stack.push(init); stack.push(n.id); } continue; }
        case 'ImportDeclaration': { if (n.source.value.startsWith('.')) this.sibling(n.source.value, n); continue; }
        case 'IfStatement': { const t = n.test; const txt = this.src.slice(t.start, t.end); const isMainIdiom = (t.type === 'BinaryExpression' && /^(===|!==|==|!=)$/.test(t.operator) && /import\.meta\.url|process\.argv\[1\]|fileURLToPath/.test(txt)) || (t.type === 'Identifier' && /^isMain$/.test(t.name) && this.isMainBinding) || (t.type === 'UnaryExpression' && t.operator === '!' && t.argument.type === 'Identifier' && t.argument.name === 'isMain' && this.isMainBinding); if (this.asSibling && isMainIdiom) continue; for (const ch of children(n)) stack.push(ch); continue; }
        case 'AwaitExpression': stack.push(n.argument); continue;
        case 'Property': case 'MethodDefinition': { if (n.kind === 'get' || n.kind === 'set') { this.fail(n, 'a getter / setter in the region — an effect can hide behind a property read'); continue; } for (const ch of children(n)) stack.push(ch); continue; }
        default: for (const ch of children(n)) stack.push(ch);
      }
    }
  }
  // a VENDORED module is pinned, not judged: the parse-first law is about THIS repo's tools, and a static judge cannot read a
  // third-party parser's table construction as anything but unknown constructors. The pin is the arm — an edit to the vendored
  // bytes re-opens the judgement by name, and an unpinned vendored import is refused rather than silently trusted.
  vendored(p, key, spec, node) {
    let sha = vendorSha.get(p); if (sha === undefined) { sha = createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16); vendorSha.set(p, sha); }
    const pin = VENDOR_PIN[key];
    if (!pin) { this.fail(node, `imports ${spec}, a VENDORED module that is not pinned — add ${JSON.stringify(key)} to parse-first-pins.json vendor with sha ${sha}, its licence and why it is not judged`); return; }
    if (pin.sha !== sha) { this.fail(node, `imports ${spec}, whose vendored bytes changed (sha ${sha} \u2260 pinned ${pin.sha}) — re-read the module and re-state the pin`); return; }
    if (!vendorReached.has(key)) vendorReached.set(key, `${key} — ${pin.why} (pinned ${sha})`);
  }
  isRegExpish(obj) { return obj && (obj.type === 'Literal' && obj.regex || obj.type === 'NewExpression' && dotted(obj.callee) === 'RegExp' || (obj.type === 'Identifier' && /^(re|rx|RE|pat|PAT|regex|REGEX)/i.test(obj.name)) || (obj.type === 'MemberExpression' && !obj.computed && /^(RE|PAT|REGEX)/i.test(obj.property.name || ''))); }
  registerLocals(node) { (function w(x, self, top) { if (!x) return; if (!top && /Function/.test(x.type)) return; if (x.type === 'FunctionDeclaration' && x.id && !top) { self.funcs.set(x.id.name, x); } if (x.type === 'VariableDeclaration') for (const d of x.declarations) if (d.id.type === 'Identifier' && d.init && /Function/.test(d.init.type) && !self.funcs.has(d.id.name)) self.funcs.set(d.id.name, d.init); for (const c of children(x)) w(c, self, false); })(node, this, true); }
  judgeFunc(name, callNode) { if (this.judgedFuncs.has(name)) return; this.judgedFuncs.add(name); const fn = this.funcs.get(name); this.registerLocals(fn.body); const body = fn.body; if (body.type === 'BlockStatement') { for (const st of body.body) { if (containsParse(st, true)) { this.judge(st, true); return 'parse'; } this.judge(st); } } else this.judge(body); return null; }
  sibling(spec, node) { const p = path.resolve(path.dirname(this.file), spec); if (!fs.existsSync(p)) { this.fail(node, `imports ${spec}, which does not exist`); return; } if (this.seen.has(p)) return; this.seen.add(p); if (!/\.(mjs|js|cjs)$/.test(p)) return;
    { const parts = p.split(path.sep); const vi = parts.lastIndexOf('vendor'); if (vi !== -1) { this.vendored(p, parts.slice(vi + 1).join('/'), spec, node); return; } } const src = fs.readFileSync(p, 'utf8'); const ast = jsParse(src, p); if (!ast) return; const j = new JsJudge(p, src, ast, this.seen, true); const before = fail; for (const st of ast.body) j.judge(st); if (fail > before) say(this.file, node.loc?.start.line ?? 0, `imports ${spec}, whose module scope carries an effect (see the lines above)`); }
}

const INV_IMPORT = /\b(invalidatePrior|invalidateForMode|priorArtefactsOf)\b/;
const REMOVAL_ANY = /\b(rmSync|unlinkSync|rmdirSync|renameSync|truncateSync|unlink|rmdir|rename|truncate)\s*\(|\bfs\.rm\s*\(|\bfs\.promises\.(rm|unlink|rmdir|rename|truncate)\s*\(|\.rm\s*\(|from '(node:)?fs\/promises'/;
for (const f of files.filter((p) => p.endsWith('.mjs') && !p.split(path.sep).includes('lib')).sort()) {
  const src = fs.readFileSync(f, 'utf8'); const R = rel(f);
  const hasParser = /\b(__)?parseArgv\s*\(/.test(src); const invalidates = INV_IMPORT.test(src) || REMOVAL_ANY.test(src);
  if (!hasParser && !invalidates) continue;
  const short = R.replace(/^tools\/render\//, '');
  if (!hasParser && EXEMPT[short]) { const sha = createHash('sha256').update(src).digest('hex').slice(0, 16); if (sha !== EXEMPT_SHA[short]) { say(f, 1, `an EXEMPT tool changed (sha ${sha} ≠ pinned ${EXEMPT_SHA[short]}) — its removals must be re-read and the pin re-stated`); continue; } exempted.push(`${short} — ${EXEMPT[short]} (pinned ${sha})`); continue; }
  judgedSet.add(short);
  const ast = jsParse(src, f); if (!ast) continue;
  if (!hasParser) { say(f, 1, 'the tool removes / invalidates but has no parseArgv — no parse to completion before its first effect'); continue; }
  const j = new JsJudge(f, src, ast, new Set([path.resolve(f)]));
  // execution order at module level: statements before the parser statement, then the parser statement minus the parse call itself
  let parserLine = null; const before = fail;
  for (const st of ast.body) if (st.type === 'ImportDeclaration') j.judge(st); // ESM imports are hoisted: every static import runs before any statement, whatever its line (Fable pass 4)
  // ONE parse: a second parseArgv anywhere, or a parse under a condition, is refused (a lax first parse or a skipped branch would leave effects unparsed)
  { let calls = 0; let conditional = false; (function w(x, underCond) { if (!x) return; if (x.type === 'CallExpression' && x.callee.type === 'Identifier' && /^(__)?parseArgv$/.test(x.callee.name)) { calls++; if (underCond) conditional = true; } const cond = underCond || x.type === 'ConditionalExpression' || x.type === 'LogicalExpression' || x.type === 'IfStatement' || x.type === 'SwitchStatement' || x.type === 'TryStatement'; for (const c of children(x)) w(c, cond); })(ast, false); if (calls > 1) say(f, 1, `${calls} parseArgv calls — one parse only`); if (conditional) say(f, 1, 'the parseArgv call sits under a condition — the parse must be unconditional'); if (calls > 1 || conditional) continue; }
  for (const st of ast.body) {
    if (st.type === 'ImportDeclaration') continue;
    if (containsParse(st)) { parserLine = st.loc.start.line; j.judge(st, true); break; }
    // a call to a local function that reaches the parser: judged inside judgeFunc
    j.judge(st);
    if (j.judgedFuncs.size && [...j.judgedFuncs].some((nm) => containsParse(j.funcs.get(nm), true))) { parserLine = st.loc.start.line; break; }
  }
  if (parserLine === null) { say(f, 1, 'parseArgv is never reached from module level (a parser inside an uncalled function is no parser)'); continue; }
  // after the parse: no raw process.argv reader but the expanded view / parseArgv's own argument
  const lines = src.split('\n'); let firstInv = null;
  lines.forEach((l, i) => { if (i + 1 <= parserLine) return; if (/process\.argv/.test(l) && !/expandEqArgs\(process\.argv\.slice\(2\)\)/.test(l) && !/^\s*\/\//.test(l) && !/process\.argv\.slice\(\d\)\s*[,}\]]/.test(l)) say(f, i + 1, 'process.argv read after the parse — a second reader (use __P.has / __P.value / the expanded view)'); if (firstInv === null && /(?<![\w.])(invalidatePrior|invalidateForMode|__inv0?|__ifm[0-9a-z]*|__invalidatePrior|__invalidateForMode|priorArtefactsOf)\s*\(/.test(l) && !/^\s*\/\//.test(l)) firstInv = i + 1; });
  // the declaration audit
  const m = src.match(/parseArgv\(\{([\s\S]*?)\}\s*(?:,\s*\w+)?\)/); if (m) { const spec = m[1];
    const lst = (name) => { const mm = spec.match(new RegExp(name + '\\s*:\\s*\\[([\\s\\S]*?)\\]')); if (!mm) return new Set(); const out = new Set(mm[1].match(/'--[\w-]+'/g)?.map((x) => x.slice(1, -1)) || []); const sp = mm[1].match(/\.\.\.(\w+)/); if (sp) { const setm = src.match(new RegExp('const ' + sp[1] + ' = new Set\\(\\[([\\s\\S]*?)\\]\\)')); if (setm) for (const x of setm[1].match(/'--[\w-]+'/g) || []) out.add(x.slice(1, -1)); } return out; };
    const val = lst('value'), boo = lst('bool'); const multi = new Set([...spec.matchAll(/'(--[\w-]+)'\s*:\s*\d/g)].map((x) => x[1]));
    const vread = new Set([...src.matchAll(/(?:argOf|__pathOpt|__stringOpt|__listOpt|__numOpt|pathOpt|stringOpt|listOpt|numOpt|pOpt3|__po0?|__so0?|__P\.value|__P\.values)\(\s*'(--[\w-]+)'/g)].map((x) => x[1]).concat([...src.matchAll(/indexOf\(\s*'(--[\w-]+)'\s*\)\s*\+\s*1/g)].map((x) => x[1])));
    const pread = new Set([...src.matchAll(/(?:\.includes|\.has|__P\.has)\(\s*'(--[\w-]+)'/g)].map((x) => x[1]));
    for (const mm of src.matchAll(/\[\s*'(--[\w-]+)'\s*,\s*'[\w-]+'(\s*,\s*'value')?\s*\]/g)) (mm[2] ? vread : pread).add(mm[1]);
    const rawPres = new Set([...src.matchAll(/(?:args|argv|ARGS|ARGV)\.includes\(\s*'(--[\w-]+)'/g)].map((x) => x[1]));
    for (const fl of vread) if (!val.has(fl) && !multi.has(fl)) say(f, 0, `declaration audit: ${fl} is read as a VALUE but not declared under value/multi${boo.has(fl) ? ' (declared bool)' : ''}`);
    for (const fl of pread) if (!val.has(fl) && !boo.has(fl) && !multi.has(fl) && fl !== '--help') say(f, 0, `declaration audit: ${fl} is tested by presence but declared nowhere`);
    for (const fl of val) if (!vread.has(fl) && rawPres.has(fl)) say(f, 0, `declaration audit: ${fl} is declared a VALUE flag but read only by a raw presence test`); }
  if (fail === before) held.push(`${R} (parser@${parserLine}${firstInv ? ` < invalidation@${firstInv}` : ''})`);
}
// ---------------------------------------------------------------- python
const pyFiles = files.filter((p) => p.endsWith('.py') && !p.split(path.sep).includes('lib'));
if (pyFiles.length) {
  const r = spawnSync('python3', [path.join(HERE, 'parse_first_ast.py'), ROOT, ...pyFiles], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout.trim()) { console.error(`[parse-first-fence] FAIL the python judge did not run: ${(r.stderr || '').split('\n').filter((l) => l && !/SDK/.test(l)).slice(-2).join(' | ').slice(0, 200)}`); fail++; }
  else for (const res of JSON.parse(r.stdout)) { if (!res.judged) continue; judgedSet.add(res.file.replace(/^tools\/render\//, '')); if (res.findings.length) for (const x of res.findings) say(res.file, x.line, `${x.kind}: ${x.text}`); else held.push(`${res.file} (parser@${res.parser_line}${res.first_inv_line ? ` < invalidation@${res.first_inv_line}` : ''})`); }
}
// ---------------------------------------------------------------- the pinned list: no invalidating tool drops out of the judged set
for (const p of PINNED) if (!judgedSet.has(p)) say(`tools/render/${p}`, 0, 'a known invalidating tool is no longer judged (missing, or its parser / invalidation calls are no longer recognised) — the fence cannot let it drop out silently');
if (fail) { console.error(`[parse-first-fence] FAIL — ${fail} finding(s)`); process.exit(2); }
console.log(`[parse-first-fence] HELD — ${held.length} judged tools carry no KNOWN pre-scan spelling ahead of their parse (AST, execution order: no effect reference or call, no unknown call, no computed / indirect invocation, no callback body with an effect, no hoisted-import or sibling-module effect; one unconditional parse; no raw argv reader after it; declarations match their readers; the 39 pinned tools all judged; exempt files pinned by sha). A static judgement cannot prove the ABSENCE of an effect — the runtime arms (help-only / repeated-blank / error-forms, destination byte-identical) are the evidence of the law:\n  ${held.sort().join('\n  ')}\n  EXEMPT (stated): ${exempted.join(' | ') || 'none'}\n  VENDORED (pinned by content, not judged): ${[...vendorReached.values()].sort().join(' | ') || 'none reached'}`);
