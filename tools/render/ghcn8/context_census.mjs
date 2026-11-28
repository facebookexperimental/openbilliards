// Copyright (c) Meta Platforms, Inc. and affiliates.

// FIX25: declaration coverage for production scripts evaluated in fixture VMs.
// This is a static census, not a Proxy sandbox or a claim about path reachability.
// Requires Node >= 22.8 for vm.constants.DONT_CONTEXTIFY; measured on v26.3.1.
// Limitation: sandbox own names are sampled at each census call. An earlier
// sloppy global or test assignment can therefore supply a later script's name.
// This records the current context plus static history, not a runtime-free
// declaration proof for the combined sequence. No eval/Function string census.
import vm from 'node:vm';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from '../lib/vendor/acorn/acorn.mjs';

const intrinsicNames = [...vm.runInNewContext('Object.getOwnPropertyNames(globalThis)')].sort();
const intrinsics = new Set([...intrinsicNames, 'arguments']);
const histories = new WeakMap();
const analyses = new Map();
const seenSites = new Set();
let printedIntrinsics = false;
const hash = text => createHash('sha256').update(text).digest('hex');

function patternNames(node, names) {
  if (!node) return;
  if (node.type === 'Identifier') names.add(node.name);
  else if (node.type === 'RestElement') patternNames(node.argument, names);
  else if (node.type === 'AssignmentPattern') patternNames(node.left, names);
  else if (node.type === 'ArrayPattern') node.elements.forEach(item => patternNames(item, names));
  else if (node.type === 'ObjectPattern') for (const prop of node.properties) {
    patternNames(prop.type === 'RestElement' ? prop.argument : prop.value, names);
  }
}
function children(node, visit) {
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(item => item?.type && visit(item));
    else if (value?.type) visit(value);
  }
}
function hoisted(node, names) {
  if (!node) return;
  if (node.type === 'FunctionDeclaration') { names.add(node.id.name); return; }
  if (['FunctionExpression', 'ArrowFunctionExpression', 'ClassDeclaration', 'ClassExpression'].includes(node.type)) return;
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    node.declarations.forEach(item => patternNames(item.id, names));
  }
  children(node, child => hoisted(child, names));
}
function lexical(statements, names) {
  for (const node of statements) {
    if (node.type === 'VariableDeclaration' && node.kind !== 'var') {
      node.declarations.forEach(item => patternNames(item.id, names));
    } else if (node.type === 'ClassDeclaration' || node.type === 'FunctionDeclaration') names.add(node.id.name);
  }
}

export function analyzeFreeIdentifiers(code) {
  if (analyses.has(code)) return analyses.get(code);
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  const scopes = [], references = new Map(), globalWrites = new Set();
  const declared = name => scopes.some(scope => scope.has(name));
  function ref(node, mode) {
    if (declared(node.name)) return;
    const item = references.get(node.name) ?? { name: node.name, read: 0, write: 0, typeof: 0, lines: [] };
    item[mode]++;
    if (!item.lines.includes(node.loc.start.line)) item.lines.push(node.loc.start.line);
    references.set(node.name, item);
  }
  function pattern(node, mode = null) {
    if (!node) return;
    if (node.type === 'Identifier') { if (mode) ref(node, mode); }
    else if (node.type === 'AssignmentPattern') { pattern(node.left, mode); walk(node.right); }
    else if (node.type === 'RestElement') pattern(node.argument, mode);
    else if (node.type === 'ArrayPattern') node.elements.forEach(item => pattern(item, mode));
    else if (node.type === 'ObjectPattern') for (const prop of node.properties) {
      if (prop.type === 'RestElement') pattern(prop.argument, mode);
      else { if (prop.computed) walk(prop.key); pattern(prop.value, mode); }
    }
    else walk(node); // A member assignment reads its receiver/computed key.
  }
  function fn(node) {
    const params = new Set();
    if (node.id) params.add(node.id.name);
    node.params.forEach(param => patternNames(param, params));
    scopes.push(params);
    // Body var bindings are not in scope for parameter defaults.
    node.params.forEach(param => pattern(param));
    if (node.body.type === 'BlockStatement') {
      const body = new Set(); hoisted(node.body, body); lexical(node.body.body, body);
      scopes.push(body); node.body.body.forEach(walk); scopes.pop();
    } else walk(node.body);
    scopes.pop();
  }
  function walk(node) {
    if (!node) return;
    switch (node.type) {
      case 'Program': {
        const scope = new Set(); hoisted(node, scope); lexical(node.body, scope);
        scopes.push(scope); node.body.forEach(walk); scopes.pop(); return;
      }
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': fn(node); return;
      case 'BlockStatement': case 'StaticBlock': {
        const scope = new Set(); lexical(node.body, scope);
        if (node.type === 'StaticBlock') hoisted(node, scope);
        scopes.push(scope); node.body.forEach(walk); scopes.pop(); return;
      }
      case 'SwitchStatement': {
        walk(node.discriminant);
        const scope = new Set(); lexical(node.cases.flatMap(item => item.consequent), scope);
        scopes.push(scope); node.cases.forEach(item => { walk(item.test); item.consequent.forEach(walk); });
        scopes.pop(); return;
      }
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const scope = new Set(), init = node.init ?? node.left;
        if (init?.type === 'VariableDeclaration' && init.kind !== 'var') {
          init.declarations.forEach(item => patternNames(item.id, scope));
        }
        scopes.push(scope);
        if (node.left && node.left.type !== 'VariableDeclaration') pattern(node.left, 'write');
        else walk(init);
        walk(node.test); walk(node.update); walk(node.right); walk(node.body); scopes.pop(); return;
      }
      case 'CatchClause': {
        const scope = new Set(); patternNames(node.param, scope);
        scopes.push(scope); pattern(node.param); walk(node.body); scopes.pop(); return;
      }
      case 'VariableDeclaration': node.declarations.forEach(item => { pattern(item.id); walk(item.init); }); return;
      case 'ClassDeclaration': case 'ClassExpression': {
        const scope = new Set(); if (node.id) scope.add(node.id.name);
        scopes.push(scope); walk(node.superClass); walk(node.body); scopes.pop(); return;
      }
      case 'MethodDefinition': case 'PropertyDefinition': case 'Property':
        if (node.computed) walk(node.key); walk(node.value); return;
      case 'MemberExpression': walk(node.object); if (node.computed) walk(node.property); return;
      case 'LabeledStatement': walk(node.body); return;
      case 'BreakStatement': case 'ContinueStatement': case 'MetaProperty': case 'PrivateIdentifier': return;
      case 'AssignmentExpression': {
        const left = node.left;
        if (left.type === 'MemberExpression' && left.object.type === 'Identifier'
          && left.object.name === 'globalThis' && !declared('globalThis')) {
          if (!left.computed) globalWrites.add(left.property.name);
          else if (left.property.type === 'Literal' && typeof left.property.value === 'string') globalWrites.add(left.property.value);
        }
        pattern(left, 'write'); if (node.operator !== '=') pattern(left, 'read'); walk(node.right); return;
      }
      case 'UpdateExpression': pattern(node.argument, 'read'); pattern(node.argument, 'write'); return;
      case 'UnaryExpression':
        if (node.operator === 'typeof' && node.argument.type === 'Identifier') ref(node.argument, 'typeof');
        else walk(node.argument); return;
      case 'Identifier': ref(node, 'read'); return;
      case 'WithStatement': throw new Error('CONTEXT CENSUS refuses dynamic with scope');
      default: children(node, walk);
    }
  }
  walk(ast);
  const top = new Set(); hoisted(ast, top); lexical(ast.body, top);
  const result = { references: [...references.values()].sort((a, b) => a.name.localeCompare(b.name)),
    top: [...top], globalWrites: [...globalWrites] };
  analyses.set(code, result);
  return result;
}

// The source line is measured from the exact selected production source,
// including a mutation-copy root. SLICED rows are never rewritten constants.
export function sourceSupply(name, classification, file, source, pattern) {
  const match = pattern.exec(source);
  if (!match) throw new Error(`CONTEXT SUPPLY SOURCE MISSING: ${file} ${name}`);
  const line = source.slice(0, match.index).split('\n').length;
  return { name, class: classification, source: `${file}:${line}`,
    source_sha256: hash(match[0]), ...(classification === 'SLICED' ? { code: match[0] } : {}) };
}
export function contextSite(url, anchor, label) {
  const text = fs.readFileSync(new URL(url), 'utf8'), offset = text.indexOf(anchor);
  if (offset < 0) throw new Error(`CONTEXT SITE MISSING: ${anchor}`);
  const file = new URL(url).pathname.split('/tools/').at(-1);
  return `tools/${file}:${text.slice(0, offset).split('\n').length} ${label}`;
}

// Contextified global accessors swallow thrown getter errors in Node's VM
// bridge (even typeof then sees undefined). A real VM global preserves the
// named POISONED refusal. This is test-only and feature-detected, never a
// Proxy interceptor. Other fixture contexts need no constructor change.
export function createCensusedContext(bindings) {
  if (vm.constants?.DONT_CONTEXTIFY === undefined) {
    throw new Error('CONTEXT CENSUS requires vm.constants.DONT_CONTEXTIFY for POISONED globals');
  }
  return Object.assign(vm.createContext(vm.constants.DONT_CONTEXTIFY), bindings);
}

// HOST scope only. The closure has no sandbox, pb or txBar binding; it can
// only append a call receipt and returns undefined. It cannot repair a subject.
function callStub(calls, name) {
  return function (...args) { calls.push({ name, args }); };
}
function poisoned(name) {
  return () => { throw new Error(`CONTEXT MISSING reached: ${name}`); };
}
const metadata = row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'code'));

export function runCensusedScript(code, context, { site, supply = [], calls = [] }) {
  if (!Array.isArray(calls) || Object.getPrototypeOf(calls) !== Array.prototype
    || calls.push !== Array.prototype.push) {
    throw new Error(`CONTEXT STUB RECEIPTS (${site})`);
  }
  if (!printedIntrinsics) {
    console.log('CONTEXT INTRINSICS: ' + JSON.stringify({ derived: intrinsicNames, implicit: ['arguments'] }));
    printedIntrinsics = true;
  }
  if (supply.some(row => row.class === 'POISONED') && vm.runInContext('globalThis', context) !== context) {
    throw new Error(`CONTEXT POISON GLOBAL (${site}): createCensusedContext required`);
  }
  const history = histories.get(context) ?? { names: new Set(), installed: new Set() };
  const rows = new Map();
  for (const row of supply) {
    if (rows.has(row.name)) throw new Error(`CONTEXT SUPPLY DUPLICATE (${site}): ${row.name}`);
    if (!['SLICED', 'STUBBED', 'HOST', 'TEST-ASSIGNED', 'POISONED', 'WRITE-ONLY ADVISORY'].includes(row.class)) {
      throw new Error(`CONTEXT SUPPLY CLASS (${site}): ${row.name}`);
    }
    if (row.class === 'SLICED' && (typeof row.code !== 'string'
      || !analyzeFreeIdentifiers(row.code).top.includes(row.name))) {
      throw new Error(`CONTEXT SUPPLY DECLARATION (${site}): ${row.name}`);
    }
    if (row.class === 'HOST' && !Object.hasOwn(context, row.name) && !(row.name in globalThis)) {
      throw new Error(`CONTEXT HOST MISSING (${site}): ${row.name}`);
    }
    if (row.class === 'TEST-ASSIGNED' && !Object.hasOwn(context, row.name)) {
      throw new Error(`CONTEXT TEST-ASSIGNED MISSING (${site}): ${row.name}`);
    }
    rows.set(row.name, row);
  }
  const prefix = supply.filter(row => row.class === 'SLICED' && !history.installed.has(row.name))
    .map(row => row.code).join('\n');
  const script = prefix + '\n' + code;
  const analysis = analyzeFreeIdentifiers(script);
  const own = new Set(Object.getOwnPropertyNames(context));
  const explicitGlobals = new Set(analysis.globalWrites);
  const missing = [], advisory = [], bindings = [];
  for (const ref of analysis.references) {
    const row = rows.get(ref.name);
    const mode = ref.read ? 'missing_read' : ref.write ? 'write_only' : 'typeof_guarded_read';
    let provider = row?.class ?? (own.has(ref.name) ? 'SANDBOX OWN'
      : intrinsics.has(ref.name) ? 'INTRINSIC' : history.names.has(ref.name) ? 'EARLIER SCRIPT'
        : explicitGlobals.has(ref.name) ? 'SCRIPT GLOBAL WRITE' : null);
    // A typeof elsewhere does not make an ordinary free read safe. Only
    // typeof-only references may remain absent without a runtime binding.
    if (!provider && mode === 'typeof_guarded_read') provider = 'TYPEOF ONLY (ABSENT)';
    if (!provider || (row?.class === 'WRITE-ONLY ADVISORY' && mode !== 'write_only')) missing.push(ref.name);
    if (mode === 'write_only' && row?.class === 'WRITE-ONLY ADVISORY') advisory.push(ref.name);
    bindings.push({ ...ref, mode, class: provider, source: row?.source ?? provider });
  }
  if (missing.length) {
    const message = `CONTEXT MISSING (${site}): ${missing.sort().join(', ')}`;
    throw new Error(message);
  }
  const signature = site + '\n' + JSON.stringify(supply.map(metadata));
  if (!seenSites.has(signature)) {
    seenSites.add(signature);
    console.log(`CONTEXT MISSING (${site}): none`);
    for (const name of advisory) console.log(`CONTEXT ADVISORY (${site}): ${name} write_only; ${rows.get(name).source}`);
    console.log('CONTEXT SUPPLY: ' + JSON.stringify({ site, script_sha256: hash(script),
      rows: supply.map(metadata), bindings }));
  }
  for (const row of supply) {
    if (row.class === 'STUBBED' && !history.installed.has(row.name)) context[row.name] = callStub(calls, row.name);
    if (row.class === 'HOST' && !own.has(row.name)) {
      context[row.name] = globalThis[row.name];
    }
    if (row.class === 'POISONED' && !history.installed.has(row.name)) {
      const refuse = poisoned(row.name);
      Object.defineProperty(context, row.name, { configurable: true, get: refuse, set: refuse });
    }
  }
  const result = vm.runInContext(script, context);
  analysis.top.forEach(name => history.names.add(name));
  analysis.globalWrites.forEach(name => history.names.add(name));
  supply.forEach(row => history.installed.add(row.name));
  histories.set(context, history);
  return result;
}

// Both preview suites use the same builder and the same host-only stub factory.
// SUPPLY rows remain explicit in each importing suite's header.
export function createTxBarFixture({ source, api, site, supply }) {
  const start = source.indexOf('  function syncTxBar() {');
  const end = source.indexOf('\n  }\n', start) + 4;
  if (start < 0 || end <= start) throw new Error('Production transaction bar boundaries');
  const body = source.slice(start, end);
  const keep = { hidden: false }, note = { dataset: {}, textContent: '' };
  const bar = { hidden: true, querySelector: selector => selector.includes('atelier-keep') ? keep : note };
  const ui = vm.createContext({ txBar: bar, sapi: () => api, t: key => key });
  const calls = [];
  runCensusedScript(body, ui, { site, supply, calls });
  return { ui, bar, keep, note, calls, body,
    read: () => ({ bar_hidden: bar.hidden, keep_visible: !bar.hidden && !keep.hidden }) };
}
