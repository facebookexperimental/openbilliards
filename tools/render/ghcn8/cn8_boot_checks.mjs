// Copyright (c) Meta Platforms, Inc. and affiliates.

// ORDER-14 E1: page module requests, distinct from the worker's cache fill.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const CATALOG_TABLES = ['chinese8_pro_9ft', 'joy_q8_9ft', 'diamond_proam_9ft',
  'predator_apex_9ft', 'wpbsa_snooker_12ft', 'umb_carom_284', 'wpa_generic_9ft',
  'wpa_spec_9ft', 'diamond_redlabel_9ft', 'owner_proam_9ft_2026_07'];
export const TRANSPORT_MODULES = ['cn8transport.js', 'cn8transport-core.js',
  'cn8transport-codec.js', 'cn8transport-data.js'];
const leaf = url => TRANSPORT_MODULES.includes(new URL(url, 'http://instrument.invalid').pathname.split('/').at(-1));

export function assertBootCensus(rows) {
  const failures = [];
  for (const table of CATALOG_TABLES) for (const direction of ['forward', 'mirror']) {
    const matching = rows.filter(row => row.table === table && row.direction === direction);
    if (matching.length !== 1) { failures.push(`${table}/${direction}: missing or duplicate boot`); continue; }
    const row = matching[0], cn8 = table === 'chinese8_pro_9ft' || table === 'joy_q8_9ft';
    if (!Number.isFinite(row.first_frame_ms) || row.first_frame_ms <= 0) failures.push(`${table}/${direction}: first frame absent`);
    for (const field of ['requested_modules', 'parsed_modules']) {
      if (!Array.isArray(row[field])) { failures.push(`${table}/${direction}: ${field} absent`); continue; }
      const found = new Set(row[field].filter(leaf).map(url => new URL(url, 'http://instrument.invalid').pathname.split('/').at(-1)));
      if (!cn8 && found.size || cn8 && TRANSPORT_MODULES.some(name => !found.has(name))) {
        failures.push(`${table}/${direction}: ${field} transport leaf membership differs: ${[...found]}`);
      }
    }
  }
  if (rows.length !== CATALOG_TABLES.length * 2) failures.push('Boot census cardinality differs');
  if (failures.length) throw new Error('CN8_TRANSPORT_BOOT_GRAPH: ' + failures.join('; '));
  return { status: 'PASS', boots: rows.length, cn8_boots: 4, non_cn8_boots: 16 };
}

// Parse unconditional source edges, including an import after a comment on
// the same line. The served census below adds observed dynamic boot leaves.
export function staticModuleGraph(root, entry = 'web/app/main.js', overrides = {}) {
  return bootModuleGraph(root, { entry, overrides }).modules;
}

// Use Node's bundled Acorn for ImportExpression syntax. The static closure
// is independently parsed by V8. Regex literals, comments, strings and
// template interpolation cannot be mistaken for an import call by a regex.
const acornSource = process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
if (typeof acornSource !== 'string') throw new Error('A1_IMPORT_PARSER_UNAVAILABLE');
const acornModule = {exports:{}};
vm.runInNewContext(acornSource,{module:acornModule,exports:acornModule.exports});
const acorn=acornModule.exports;
export const parserIdentity={engine:'Node bundled Acorn',version:acorn.version,node:process.version};
export function literalDynamicImports(source){
 const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}),queue=[ast],specs=[];
 while(queue.length){const node=queue.pop();if(!node||typeof node!=='object')continue;
  if(node.type==='ImportExpression'&&node.source?.type==='Literal'&&typeof node.source.value==='string')specs.push(node.source.value);
  for(const value of Object.values(node)){if(Array.isArray(value))queue.push(...value);else if(value&&typeof value==='object')queue.push(value);}
 }
 return [...new Set(specs)];
}
const resolve=(name,spec)=>spec==='three'?'web/vendor/three.module.min.js':spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(name),spec.split('?')[0])):null;
export function bootModuleGraph(root,{entry='web/app/main.js',observedModules=[],overrides={}}={}){
 const observed=new Set(observedModules),visited=new Set(),queue=[entry,...observed],edges=[];
 // Runtime-resolved import(specifier) calls (shell panel map and WASM
 // loader) do not have a literal source edge. Their ACTUALLY requested and
 // parsed non-CN8 boot modules are additional measured roots. Every static
 // dependency of these roots is traversed too, so a planted static edge
 // cannot hide in a computed boot leaf. No unobserved CN8-only path is seeded.
 const measuredBootRoots=[...observed].sort();
 while(queue.length){const name=queue.pop();if(visited.has(name))continue;visited.add(name);const source=overrides[name]??fs.readFileSync(path.join(root,name),'utf8');
  const parsed=new vm.SourceTextModule(source,{identifier:name});
  for(const spec of parsed.dependencySpecifiers){const target=resolve(name,spec);if(target){edges.push({from:name,to:target,kind:'static-v8-parsed'});queue.push(target);}}
  for(const spec of literalDynamicImports(source)){const target=resolve(name,spec);if(target&&observed.has(target)){edges.push({from:name,to:target,kind:'literal-import()-observed-on-default-non-CN8-boot'});queue.push(target);}}
 }
 return {parserIdentity,measuredBootRoots,modules:[...visited].sort(),edges,observed_not_reached:[...observed].filter(n=>!visited.has(n)).sort(),dynamic_leaf_condition:'Default non-CN8 requested AND parsed modules are measured roots, covering computed import(specifier) calls as well as literal import(). Literal edges retain their source parent; static dependencies of every reached module are unconditional. V8 parses static imports including same-line comment prefixes. No unobserved CN8-only dynamic path is followed.'};
}
export function observedModuleSet(rows){const out=new Set();for(const row of rows){if(['chinese8_pro_9ft','joy_q8_9ft'].includes(row.table))continue;const parsed=new Set(row.parsed_modules);for(const url of row.requested_modules)if(parsed.has(url)){const name=new URL(url).pathname.split('/model-viewer/trees/after/')[1];if(name?.endsWith('.js')||name?.endsWith('.mjs'))out.add(name);}}return [...out].sort();}
export function assertSettledBootCensus(rows){
 const result=assertBootCensus(rows),failures=[];
 for(const r of rows)if(r.settle?.status!=='PASS'||!r.settle.ready||!r.settle.boot_overlay_absent||r.settle.missing_leaves?.length||!(r.settle.stable_module_ms>=r.settle.required_stable_ms)||r.settle.required_stable_ms!==1000)failures.push(r.table+'/'+r.direction+': default boot leaves not settled');
 if(failures.length)throw new Error('CN8_TRANSPORT_BOOT_GRAPH: '+failures.join('; '));return {...result,settled_boots:rows.length};
}
