// Copyright (c) Meta Platforms, Inc. and affiliates.

// ballreturn-fence.mjs — the ball-return lane's NON-TARGET fence (feature 037,
// issue #650; the standing mesh + MATERIAL identity law — snooker R3-SNK-11 /
// Diamond review r4 P1): with the extension's flag OFF (every shipped table), every
// catalog table's mesh inventory under `obTable` must be identical between the
// BASE tree (`git archive <base> web`, served) and the NEW tree (this checkout,
// served) — per mesh a GEOMETRY hash (name + matrixWorld + EVERY geometry attribute by name, the index and the draw groups — NOTE-FENCE-NORMALS 2026-09-09; positions + indices + normals + uvs before) and
// a MATERIAL identity record (class, colour, emissive, roughness, metalness,
// envMapIntensity, clearcoat(+roughness), sheen, transmission, ior,
// specularIntensity, normalScale, bumpScale, side, transparent, opacity, alphaTest,
// depthWrite, flatShading, vertexColors, onBeforeCompile presence, per texture slot
// a 32×32 content hash + size + repeat + wrap + colour space). Meshes are matched by
// (order, name). The scene root is ALSO inventoried by name so a stray
// `obBallReturnDebug*` group on a flag-off boot is a red.
//
//   node tools/render/ballreturn-fence.mjs [--base 68a92cca] --out /tmp/ballreturn/fence [--tables a,b] [--red-arm] [--red-tree e221de6f|none] [--red-tree-seek 54464367|none] [--git <checkout>] [--camera-only] [--http 9702] [--cdp 9703]
//   node tools/render/ballreturn-fence.mjs [--base 68a92cca] --selftest-ids   (node only: print the per-tree id pairs and the booted-identity legs, no boot)
//
// BASE (#789): the default --base is 68a92cca, the first base the booted-identity read can fence (its buildTable
// publishes obTable.userData.tableId). --base stays the override; a base without the beacon refuses loudly and names
// the requirement. The selftest arm `--base c01bb535 --selftest-ids` is that refusal (exit 1 with REQUIRE_BEACON):
// a correct refusal, not a defect. Fence records taken against c01bb535 before #789 stand as history under the
// old rack-equipment identity read.
//
// PER-TREE TABLE IDS (#789): --tables names the COMPARISON KEY of each row, a table id of the NEW
// tree. Each tree boots the id it knows for that key: the key itself when it is a TABLE_SPECS key
// there, else the old id the NEW tree's equipmentalias.js maps to it (a TABLE_RENAMES pair, or the
// key found in the tree whose FNV-1a 64 digest is the key's digest alias row). An archived base
// that predates the rename would otherwise fall back to wpa_generic_9ft without a word and the row
// would compare two different tables. A key a tree cannot map is refused by name before any boot;
// a row whose SCENE did not build the tree's id is refused after boot (BOOTED IDENTITY below).
//
// CAMERA ROW (seal 2, verification B1): the one line the lane edits outside its
// module, web/app/cameratrack.js, must be inert with the flag off. On the cn8 net
// class (chinese8_pro_9ft) a netted ball stays `pocketed && visible` and the
// `__track` rig FOLLOWS it on main; the row pots a ball there on BASE and NEW,
// starts the rig on `ball:N`, framesteps across the pocket event and compares the
// camera pose + the target's (visible, pocketed, position) per frame — bit-identical
// or DRIFT. `--red-tree <sha>` runs the same row on a third tree that must DIFFER
// from BASE (the seal-1 hunk keyed on `pocketed` held the camera): the arm's red.
//
// One Chrome (chrome-headless-shell, cdp.mjs resolution), one static server at a
// time; ports default into the lane band 9700–9709. exit 0 = every table identical
// (geometry AND material AND root inventory) and the red arm fired on every field
// class; 3 otherwise. Report: <out>/fence.md + per-table dumps.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from '../../web/tools/cdp.mjs';

/** The served-tree assertion of THIS harness (order 22, NOTE-BR-FENCE-PREFLIGHT): the fence serves a BASE EXPORT on purpose, which
 * cdp.mjs's checkout-based preflight (GH-248 / 557) rightly refuses — so the fence asserts the identity the right way instead of
 * skipping the check: the served /app.html must equal, byte for byte (sha-256), the app.html of the tree this step serves. */
async function assertServedTree(webDir, httpPort, label) {
  const local = fs.readFileSync(path.join(webDir, 'app.html'));
  const localSha = createHash('sha256').update(local).digest('hex');
  let served = null;
  for (let i = 0; i < 20 && !served; i++) { try { const r = await fetch(`http://127.0.0.1:${httpPort}/app.html`, { cache: 'no-store' }); if (r.ok) served = Buffer.from(await r.arrayBuffer()); } catch { /* not up yet */ } if (!served) await sleep(150); }
  if (!served) throw new Error(`[preflight] ${label}: no answer from :${httpPort} for app.html`);
  const servedSha = createHash('sha256').update(served).digest('hex');
  if (servedSha !== localSha) throw new Error(`[preflight] ${label}: :${httpPort} serves app.html ${served.length} B sha ${servedSha.slice(0, 12)} ≠ the ${label} tree's ${local.length} B sha ${localSha.slice(0, 12)} — another tree is answering; refusing to capture`);
  console.log(`[preflight] ${label}: :${httpPort}/app.html == ${path.join(webDir, 'app.html')} (${local.length} B, sha ${localSha.slice(0, 12)}) — the served tree is the ${label} tree`);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
// ---------------------------------------------------------------------------
// argv — strict, parsed ONCE to completion before the first effect (FIX10,
// ORDER-CN8-731-FIX10; review r8 P2 on #770). What stood here was
// `args.includes(k) ? args[args.indexOf(k) + 1] : d`, the exact pair FIX10
// removed from 39 tools: `indexOf` is FIRST-occurrence, so `--out A --out B`
// bound A while every strict reader in the repo binds B; and a blank or
// trailing value was never refused, so `--out ''` fell through to
// fs.mkdirSync(OUT) below with the empty string. This tool is judged by the
// repo-wide fence (lib/parse-first-fence.mjs) like every other
// tools/render/*.mjs outside lib/ — it removes (three mkdtemp scratch trees),
// so the fence requires the parse and is right to.
// ---------------------------------------------------------------------------
// declared in the category its reader uses — the fence's declaration audit
// reads these two Sets and cross-checks them against every __P.value / __P.has
// call site in this file
const FLAGS_VALUE = new Set(['--base', '--out', '--http', '--cdp', '--red-tree',
  '--red-tree-seek', '--git', '--camera-table', '--tables']);
const FLAGS_BOOL = new Set(['--red-arm', '--camera-only', '--selftest-ids']);
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs');
// RAW argv, never pre-expanded (review r9 P2 on #770). parseArgv refuses a boolean ASSIGNMENT
// (`--red-arm=--camera-only`, `--camera-only=--help`) by reading the UNexpanded tokens
// (lib/argv.mjs:104) and only then expands, once. Handing it an already-expanded array moved the
// guard's input out from under it: `--red-arm=--camera-only` became two valid switches, so an
// invalid line silently enabled --camera-only — the 10-table mesh/material census and its red arm
// skipped, the run still reporting itself green — and `--camera-only=--help` printed the usage and
// exited 0 without the fence running at all. `--flag=value` is unaffected: the one expansion
// inside parseArgv is what implements it (FIX9), and this tool never reads argv again.
// It is bound one line ABOVE the parse because the repo-wide fence refuses a `process.argv` read
// AFTER the parse as a second reader, and the allowance it does carry is written for the
// pre-expanded spelling — the spelling that hid this defect. Bound before, it is the same one view.
const RAW_ARGV = process.argv.slice(2);
const __P = __parseArgv({ tag: 'ballreturn-fence', value: [...FLAGS_VALUE], bool: [...FLAGS_BOOL],
  unknown: 'refuse', positionals: 'none' }, RAW_ARGV);
const BASE = String(__P.value('--base', '68a92cca'));
const REQUIRE_BEACON = 'base tree does not publish obTable.userData.tableId; use --base at or after 68a92cca';
const OUT = String(__P.value('--out', '/tmp/ballreturn/fence'));
// the LAYOUT pins run-gate sets for the claim it made come BEFORE the undeclared-space defaults (ci-bands r9/r10; #737 r9
// class B: with the declaration unparseable this tool read as UNDECLARED and the pin rule never ran, so under run-gate it
// would have bound outside its own claim). Precedence: the flag, then the pin, then the default.
const HTTP = Number(__P.value('--http', process.env.OB_E2E_PORT ?? 8462));
const CDP = Number(__P.value('--cdp', process.env.OB_E2E_CDP_PORT ?? 16465));
// One static server, one CDP endpoint (the lane band 9460-9489 is claimed by run-gate --band / the flags). The declaration
// below must stay a BARE one-liner — cdp.mjs parsePortInventory (GH-410) refuses a trailing comment and fails closed, which
// exits run-gate 2 before a single check runs (#737 r9 class B).
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--cdp': 'cdp' };

const RED_ARM = __P.has('--red-arm');
const RED_TREE_OPT = String(__P.value('--red-tree', 'e221de6f')); // a tree the CAMERA row must reject (seal 1 e221de6f: the `!ball.pocketed` hold); 'none' skips (never a seal run)
const RED_TREE = RED_TREE_OPT === 'none' ? null : RED_TREE_OPT;
const GIT = String(__P.value('--git', repo)); // the git checkout used for `git archive` (NEW may be a git-archive export, which is not a checkout)
const CAMERA_TABLE = String(__P.value('--camera-table', 'chinese8_pro_9ft')); // the cn8 NET class: a netted ball stays pocketed && visible
const CAMERA_ONLY = __P.has('--camera-only'); // iterate the camera rows without the 10-table census (never a seal run)
const RED_TREE_SEEK_OPT = String(__P.value('--red-tree-seek', '54464367')); // the seal-2 tree: its cameratrack predicate held a stale marker on a revived ball (P2-3)
const RED_TREE_SEEK = RED_TREE_SEEK_OPT === 'none' ? null : RED_TREE_SEEK_OPT;
const SEEK_TABLE = 'wpa_generic_9ft'; // the fixture's table; NEW arms the TEST track by URL, BASE (main) has no module and ignores it
const TABLES = String(__P.value('--tables', 'wpa_generic_9ft,wpa_spec_9ft,diamond_redlabel_9ft,diamond_proam_9ft,predator_apex_9ft,wpbsa_snooker_12ft,umb_carom_284,chinese8_pro_9ft,joy_q8_9ft,pool_pro_9ft_measured')).split(',');
const SELFTEST_IDS = __P.has('--selftest-ids');
const log = (...a) => console.error('[ballreturn-fence]', ...a);

// ---- per-tree table ids (#789) ----------------------------------------------------
// The TABLE_SPECS keys a tree's web/scene/table.js declares: the top-level keys of the
// `export const TABLE_SPECS = {` literal (a computed `[NAME]` key read from its string const)
// and every `TABLE_SPECS.<id> =` alias line.
function treeTableKeys(tableJs) {
  const keys = new Set();
  const lines = tableJs.split('\n');
  const start = lines.findIndex((l) => l.startsWith('export const TABLE_SPECS = {'));
  if (start < 0) throw new Error('web/scene/table.js declares no `export const TABLE_SPECS = {` literal');
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('};'); i++) {
    const m = /^ {2}([a-z0-9_]+): \{/.exec(lines[i]);
    if (m) keys.add(m[1]);
    const c = /^ {2}\[([A-Z0-9_]+)\]: \{/.exec(lines[i]);
    if (!c) continue;
    const v = new RegExp(`^(?:export )?const ${c[1]} = '([a-z0-9_]+)';`, 'm').exec(tableJs);
    if (!v) throw new Error(`web/scene/table.js: computed TABLE_SPECS key [${c[1]}] has no string const`);
    keys.add(v[1]);
  }
  for (const m of tableJs.matchAll(/^TABLE_SPECS\.([a-z0-9_]+) = /gm)) keys.add(m[1]);
  return keys;
}
// The id a tree with `keys` boots for the comparison key `key`, or null when it has none.
function treeTableId(keys, key) {
  if (keys.has(key)) return key;
  const renamed = Object.keys(equipmentAlias.TABLE_RENAMES).filter((old) => equipmentAlias.TABLE_RENAMES[old] === key && keys.has(old));
  const row = equipmentAlias.ALIAS_DIGESTS.find((r) => r.axis === 'table' && r.neutral_id === key);
  const digested = row ? [...keys].filter((k) => equipmentAlias.fnv1a64Hex(k) === row.digest) : [];
  const found = [...renamed, ...digested];
  return found.length === 1 ? found[0] : null;
}
// comparison key -> this tree's id, for every --tables key; a key the tree cannot map is refused.
function treeTableIds(tableJs, label) {
  const keys = treeTableKeys(tableJs);
  const ids = {};
  for (const key of TABLES) {
    ids[key] = treeTableId(keys, key);
    if (ids[key] === null) throw new Error(`${label}: table ${key} has no id on this tree (not a TABLE_SPECS key, no single renamed or digest-aliased key) — refusing to boot a fallback table`);
  }
  return ids;
}
const equipmentAlias = await import(new URL('../../web/scene/equipmentalias.js', import.meta.url).href);
// The census boot URL, one builder for the boot and the --selftest-ids leaf.
const bootUrl = (id) => `http://127.0.0.1:${HTTP}/app.html?seed=1&norec=1&table=${id}`;

// ---- booted identity (#789) ----------------------------------------------------------
// The row judges the table the SCENE built: obTable.userData.tableId, the build's own id (web/scene/table.js
// buildTable publishes it on trees since the GH-666 identity beacon, 68a92cca among them; an older base such as
// c01bb535 publishes none), read by DUMP_JS as sceneTableId. Never the rack equipment: __test.equipment() names the
// kernel template's table, which a ?table= boot does not set, so a correct base boot of a renamed or digest-aliased id
// read as a fallback. Exact id: a twin the scene substituted is refused, and so is a tree that publishes no identity.
function bootedTableRefusal(label, key, id, d) {
  const built = d.sceneTableId ?? null;
  if (built === id) return null;
  if (built === null) return label === 'base' ? `${label} ${id}: ${REQUIRE_BEACON}` : `${label} ${id}: the scene published no table identity (obTable.userData.tableId) — a tree without the identity beacon cannot be fenced; refusing`;
  return `${label} ${id}: the scene built ${JSON.stringify(built)}, not the tree's id for ${key} — refusing a fallback table`;
}

if (SELFTEST_IDS) {
  // Node only: resolve every key on BASE and on the NEW tree and print the pair. Every id must be a
  // TABLE_SPECS key of its own tree; the NEW tree boots the key itself; and each digest alias row
  // whose twin is a key the BASE lacks must reach there a different id whose digest is the row's
  // digest (never the key, never the wpa_generic_9ft fallback).
  const baseJs = execFileSync('git', ['-C', GIT, 'show', `${BASE}:web/scene/table.js`], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const newJs = fs.readFileSync(path.join(repo, 'web/scene/table.js'), 'utf8');
  const baseKeys = treeTableKeys(baseJs), newKeys = treeTableKeys(newJs);
  const baseIds = treeTableIds(baseJs, 'base'), newIds = treeTableIds(newJs, 'new');
  let bad = 0;
  for (const key of TABLES) {
    const row = equipmentAlias.ALIAS_DIGESTS.find((r) => r.axis === 'table' && r.neutral_id === key);
    let note = '';
    if (newIds[key] !== key || !newKeys.has(key)) { bad++; note += ' FAIL: the NEW tree does not boot the key itself'; }
    if (!baseKeys.has(baseIds[key])) { bad++; note += ' FAIL: the base id is not a TABLE_SPECS key of the base tree'; }
    if (row && !baseKeys.has(key)) {
      const ok = baseIds[key] !== key && baseIds[key] !== 'wpa_generic_9ft' && equipmentAlias.fnv1a64Hex(baseIds[key]) === row.digest;
      if (!ok) bad++;
      note += ok ? ` digest ${row.digest} ok` : ` FAIL: the base id is not the digest row's retired id`;
    }
    console.log(`[ballreturn-fence] ids ${key}: base ${baseIds[key]} / new ${newIds[key]}${note}`);
  }
  // BOOTED IDENTITY legs (#789), node only. The leaf: each tree's own resolveBootTableId (and bootQueryTableId when the
  // tree has one) sliced from its web/scene/table.js with the vendored acorn, run in a fresh vm context on the census's
  // boot URL — main.js calls buildTable without a tableId, so this is the build's id. The NEW tree's kernel answers from
  // its committed wasm catalog; the base leaf must not consult a kernel or storage (a stub that throws). The dump: this
  // file's own DUMP_JS run against a scene stub whose obTable carries that id, with __test.equipment() null (the stub
  // value, not a measured one; the verdict must not read it). The stub's obTable carries the id only when the tree's
  // own buildTable publishes the beacon (read from its source below), so a tree without it is refused here as in a boot.
  // The verdict: this file's own bootedTableRefusal.
  const { parse } = await import(new URL('./lib/vendor/acorn/acorn.mjs', import.meta.url).href);
  const vm = await import('node:vm');
  const topFns = (src) => {
    const map = new Map();
    for (const n of parse(src, { ecmaVersion: 'latest', sourceType: 'module' }).body) {
      const d = n.type === 'ExportNamedDeclaration' ? n.declaration : n;
      if (d && d.type === 'FunctionDeclaration') map.set(d.id.name, (map.get(d.id.name) ?? []).concat([src.slice(d.start, d.end)]));
    }
    return map;
  };
  const strConst = (js, name) => {
    const m = new RegExp(`^(?:export )?const ${name} = '([a-z0-9_]+)';`, 'm').exec(js);
    if (!m) throw new Error(`web/scene/table.js has no string const ${name}`);
    return m[1];
  };
  const bootLeaf = (tableJs, kernelIds) => {
    const fns = topFns(tableJs);
    const names = ['resolveBootTableId', 'bootQueryTableId'].filter((n) => n === 'resolveBootTableId' || fns.has(n));
    for (const n of names) if ((fns.get(n) ?? []).length !== 1) throw new Error(`web/scene/table.js declares ${n} ${(fns.get(n) ?? []).length} time(s)`);
    const refuse = (what) => () => { throw new Error(`the boot leaf consulted ${what}`); };
    const ctx = vm.createContext({ URLSearchParams, location: { search: '' }, equipmentAlias,
      TABLE_SPECS: Object.fromEntries([...treeTableKeys(tableJs)].map((k) => [k, {}])),
      SCRIPTED_PIN_TABLE_ID: strConst(tableJs, 'SCRIPTED_PIN_TABLE_ID'), APP_DEFAULT_TABLE_ID: strConst(tableJs, 'APP_DEFAULT_TABLE_ID'),
      kernelTableKnown: kernelIds ? (t) => kernelIds.has(t) : refuse('a kernel'), console: { warn: () => {}, log: () => {} },
      localStorage: { getItem: refuse('localStorage') }, sessionStorage: { getItem: refuse('sessionStorage') } });
    vm.runInContext(names.map((n) => fns.get(n)[0]).join('\n') + '\nglobalThis.__resolve = resolveBootTableId;', ctx);
    return (id) => { ctx.location.search = new URL(bootUrl(id)).search; return ctx.__resolve(); };
  };
  // DUMP_JS and bootedTableRefusal as THIS source text declares them (a plant edits the text, never the running module).
  const fenceParts = (src) => {
    let dumpJs = null;
    for (const n of parse(src, { ecmaVersion: 'latest', sourceType: 'module' }).body) {
      if (n.type !== 'VariableDeclaration') continue;
      for (const d of n.declarations) if (d.id.name === 'DUMP_JS' && d.init.type === 'TemplateLiteral' && d.init.expressions.length === 0) dumpJs = d.init.quasis[0].value.cooked;
    }
    const fn = topFns(src).get('bootedTableRefusal') ?? [];
    if (dumpJs === null || fn.length !== 1) throw new Error('the fence source lost DUMP_JS or bootedTableRefusal');
    return { dumpJs, refusal: vm.runInContext(`(${fn[0]})`, vm.createContext({ JSON, REQUIRE_BEACON })) };
  };
  // The beacon: Object.defineProperty(<x>.userData, 'tableId', ...) or <x>.userData.tableId = ... in buildTable.
  const publishesIdentity = (tableJs) => {
    const userData = (n) => n?.type === 'MemberExpression' && !n.computed && n.property.name === 'userData';
    let hits = 0;
    const walk = (n) => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'Object' && n.callee.property.name === 'defineProperty'
        && userData(n.arguments[0]) && n.arguments[1]?.value === 'tableId') hits++;
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed && n.left.property.name === 'tableId' && userData(n.left.object)) hits++;
      for (const v of Object.values(n)) (Array.isArray(v) ? v : [v]).forEach((c) => { if (c && typeof c === 'object') walk(c); });
    };
    const build = parse(tableJs, { ecmaVersion: 'latest', sourceType: 'module' }).body
      .map((n) => (n.type === 'ExportNamedDeclaration' ? n.declaration : n)).filter((d) => d?.type === 'FunctionDeclaration' && d.id.name === 'buildTable');
    if (build.length !== 1) throw new Error(`web/scene/table.js declares buildTable ${build.length} time(s)`);
    walk(build[0].body);
    return hits > 0;
  };
  const dumpIdentity = (dumpJs, builtId, beacon) => {
    const obTable = { userData: beacon ? { tableId: builtId } : {}, traverse: () => {} };
    const window = { __dbg: { scene: { getObjectByName: (n) => (n === 'obTable' ? obTable : null), children: [] } }, __test: { equipment: () => null } };
    return vm.runInContext(dumpJs, vm.createContext({ window, document: {}, TextEncoder }));
  };
  const engine = await import(new URL('../../web/dist/pool-sdk/engine.js', import.meta.url).href);
  const eng = await engine.init(path.join(repo, 'web/dist/pool-wasm/pool_wasm.js'));
  const newKernel = new Set(JSON.parse(eng.kernel.catalog_json()).tables.map((t) => t.id));
  const trees = [{ label: 'base', ids: baseIds, leaf: bootLeaf(baseJs, null), beacon: publishesIdentity(baseJs) },
    { label: 'new', ids: newIds, leaf: bootLeaf(newJs, newKernel), beacon: publishesIdentity(newJs) }];
  for (const t of trees) {
    if (!t.beacon) bad++;
    console.log(`[ballreturn-fence] identity ${t.label} tree (${t.label === 'base' ? BASE : 'working tree'}): buildTable ${t.beacon ? 'publishes obTable.userData.tableId' : (t.label === 'base' ? 'FAIL: ' + REQUIRE_BEACON : 'FAIL: does not publish obTable.userData.tableId')}`);
  }
  const legs = (src, over = trees) => {
    const { dumpJs, refusal } = fenceParts(src);
    return over.flatMap((t) => TABLES.map((key) => {
      const id = t.ids[key], built = t.leaf(id), d = dumpIdentity(dumpJs, built, t.beacon);
      return { leg: `${t.label}:${key}`, id, built, scene: d.sceneTableId ?? null, why: refusal(t.label, key, id, d) };
    }));
  };
  const selfSrc = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  for (const r of legs(selfSrc)) {
    if (r.why && trees.every((t) => t.beacon)) bad++;
    console.log(`[ballreturn-fence] identity ${r.leg}: boots ${r.id}, scene built ${r.built}, dump reads ${r.scene}${r.why ? ' FAIL: ' + r.why : ' ok'}`);
  }
  // Plants on this file's own text: each anchor must occur once, and the refused legs must be exactly the expected set.
  // An anchor is written split at '+' so the table below never matches itself.
  const allLegs = trees.flatMap((t) => TABLES.map((key) => `${t.label}:${key}`)).sort().join(',');
  // the pre-fix verdict judged only a renamed or aliased id: it refuses exactly the legs whose id is not the key
  const renamedLegs = trees.flatMap((t) => TABLES.filter((key) => t.ids[key] !== key).map((key) => `${t.label}:${key}`)).sort().join(',');
  const plants = [
    ['dump-reads-rack-equipment', 'sceneTableId: (table && table.userData' + ' && table.userData.tableId) || null',
      "sceneTableId: ((window.__test && window.__test.equipment && window.__test.equipment()) || {}).table_id || null", allLegs],
    ['verdict-reads-rack-equipment', 'const built = d.sceneTableId' + ' ?? null;', 'const built = d.tableId?.table_id ?? null;', allLegs],
    // the pre-fix verdict (review b19tJ7 P2): only a renamed or aliased id judged, by the rack equipment
    ['verdict-pre-fix', '  if (built === id)' + ' return null;', "  if (id === key || (d.tableId && d.tableId.table_id) === id) return null;", renamedLegs],
  ];
  // and one plant on the NEW tree's table.js: buildTable without the beacon refuses every NEW leg
  const beaconLine = "  Object.defineProperty(group.userData, 'tableId', { get: () => built.id, enumerable: true, configurable: true });\n";
  const newLegs = TABLES.map((key) => `new:${key}`).sort().join(',');
  if (renamedLegs === '') { bad++; console.log('[ballreturn-fence] identity plant verdict-pre-fix: FAIL: no leg boots a renamed id, the plant cannot fire (choose --tables with one)'); }
  if (trees.some((t) => !t.beacon)) { bad++; console.log('[ballreturn-fence] identity plants skipped: a tree publishes no identity, every leg is refused already'); plants.length = 0; }
  for (const [name, anchor, replacement, expected, over] of [...plants, ...(plants.length ? [['new-tree-without-beacon', null, null, newLegs, 'beacon']] : [])]) {
    const hits = over ? newJs.split(beaconLine).length - 1 : selfSrc.split(anchor).length - 1;
    let got = `anchor found ${hits} time(s)`;
    if (hits === 1) {
      try {
        const run = over ? legs(selfSrc, [trees[0], { ...trees[1], beacon: publishesIdentity(newJs.replace(beaconLine, '')) }]) : legs(selfSrc.replace(anchor, replacement));
        got = run.filter((r) => r.why).map((r) => r.leg).sort().join(',');
      } catch (e) { got = `threw ${e.message}`; }
    }
    const caught = got === expected;
    if (!caught) bad++;
    console.log(`[ballreturn-fence] identity plant ${name}: ${caught ? 'CAUGHT' : 'NOT CAUGHT'} (refused ${got === expected ? `${expected.split(',').length} leg(s), the expected set` : got})`);
  }
  console.log(`[ballreturn-fence] selftest-ids ${bad ? 'FAIL' : 'OK'}: ${TABLES.length} key(s), base ${BASE}`);
  process.exit(bad ? 1 : 0);
}
fs.mkdirSync(OUT, { recursive: true });

// COVERAGE TOKEN (review r9 CLASS Q, and the correction it forces on the arm): this tool has two modes
// and the quiet one does LESS WORK for the same exit 0, so a verdict alone cannot say which one ran —
// an arm that measures only the verdict cannot catch a bypass that changes the work. Every run past
// the first effect says what it actually censused and under which mode, on every exit path: the
// IDENTICAL / DRIFT exit, a crash, a caller's early exit. Written with fs.writeSync, not console.log:
// stdout is asynchronous when it is a pipe, and an exit handler's buffered write is then dropped.
const CENSUS = { tables: 0, mesh: 0, material: 0, camera: 0 };
process.on('exit', (code) => fs.writeSync(1, `[ballreturn-fence] census: tables ${CENSUS.tables} mesh ${CENSUS.mesh} `
  + `material ${CENSUS.material} camera-rows ${CENSUS.camera} (mode ${CAMERA_ONLY ? 'camera-only' : 'full'}`
  + `${RED_ARM ? ' +red-arm' : ''}, tables asked ${CAMERA_ONLY ? 0 : TABLES.length}, exit ${code})\n`));

// ---- the in-page inventory (identical for BASE and NEW) --------------------------
// NOTE-OCCL-FLUSH (2026-09-09, the lighting lane's finding): the snooker pocket furniture's transport attribute aOccl is attached
// ASYNCHRONOUSLY (table.js's _snkOcclPending drain in ≤12 ms idle slices, a corrective env re-bake debounced behind it). Under load
// the settle predicate below can hold still while the drain is parked, and a dump photographs whichever traces have landed (three
// captures of ONE tree: 0 / 144 / 154 meshes). The app's own seam — window.__snkOccl.flush() — drains it to completion: called
// before the settle predicate and again before every dump, the call recorded on the dump (`flushed`), and a NEW dump without the
// record refused by name. A BASE tree older than the seam (c3b6c10b) has nothing to flush: stated on its dump, and the async
// attribute is then judged only where BOTH sides carry the record (compare() drops attr:aOccl from the geometry key and says so).
const FLUSH_JS = `(async () => { const s = window.__snkOccl; if (!s || typeof s.flush !== 'function') return { seam: false };
  const t0 = performance.now(); await s.flush(); return { seam: true, ms: Math.round(performance.now() - t0) }; })()`;
const SETTLE_JS = `(() => { const scene = window.__dbg && window.__dbg.scene; if (!scene) return 'no-scene'; let n = 0; const v = [];
  scene.traverse((o) => { if (!o.isMesh || !o.geometry) return; n++; const g = o.geometry; for (const k of Object.keys(g.attributes).sort()) v.push(g.attributes[k].version); if (g.index) v.push(g.index.version); });
  return n + ':' + v.join(','); })()`;
const DUMP_JS = `(() => {
  const scene = window.__dbg && window.__dbg.scene; if (!scene) return { error: 'no scene' };
  const fnv = (arr) => { let h = 0x811c9dc5 >>> 0; for (let i = 0; i < arr.length; i++) { h ^= arr[i] & 255; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
  const f = (v) => (v == null ? null : (typeof v === 'number' ? Number(v.toFixed(7)) : v));
  const texId = (tex) => {
    if (!tex) return null;
    const rec = { kind: tex.constructor ? tex.constructor.name : 'Texture', name: tex.name || '', w: null, h: null, hash: null,
      repeat: tex.repeat ? [f(tex.repeat.x), f(tex.repeat.y)] : null, wrap: [tex.wrapS, tex.wrapT], cs: tex.colorSpace || null, flipY: !!tex.flipY };
    try {
      const img = tex.image;
      if (img && img.data && img.width) { rec.w = img.width; rec.h = img.height; const d = img.data; const step = Math.max(1, Math.floor(d.length / 4096)); const sub = new Uint8Array(Math.ceil(d.length / step)); for (let i = 0, k = 0; i < d.length; i += step, k++) sub[k] = d[i] & 255; rec.hash = fnv(sub); }
      else if (img && (img.width || img.videoWidth)) { rec.w = img.width || img.videoWidth; rec.h = img.height || img.videoHeight; const c = document.createElement('canvas'); c.width = 32; c.height = 32; const cx = c.getContext('2d'); cx.drawImage(img, 0, 0, 32, 32); rec.hash = fnv(cx.getImageData(0, 0, 32, 32).data); }
      else if (Array.isArray(img)) { rec.kind = 'CubeTexture'; rec.hash = 'cube:' + img.length; }
    } catch (e) { rec.hash = 'err:' + String(e && e.message).slice(0, 40); }
    return rec;
  };
  const matId = (mat) => {
    if (!mat) return null;
    const hex = (c) => (c && c.getHexString ? c.getHexString() : null);
    return { cls: mat.type, color: hex(mat.color), emissive: hex(mat.emissive), emissiveIntensity: f(mat.emissiveIntensity),
      roughness: f(mat.roughness), metalness: f(mat.metalness), envMapIntensity: f(mat.envMapIntensity),
      clearcoat: f(mat.clearcoat), clearcoatRoughness: f(mat.clearcoatRoughness), sheen: f(mat.sheen), sheenRoughness: f(mat.sheenRoughness), sheenColor: hex(mat.sheenColor),
      transmission: f(mat.transmission), ior: f(mat.ior), specularIntensity: f(mat.specularIntensity), specularColor: hex(mat.specularColor),
      normalScale: mat.normalScale ? [f(mat.normalScale.x), f(mat.normalScale.y)] : null, bumpScale: f(mat.bumpScale),
      side: mat.side, transparent: !!mat.transparent, opacity: f(mat.opacity), alphaTest: f(mat.alphaTest), depthWrite: !!mat.depthWrite, depthTest: !!mat.depthTest,
      flatShading: !!mat.flatShading, vertexColors: !!mat.vertexColors, wireframe: !!mat.wireframe, toneMapped: !!mat.toneMapped,
      obc: typeof mat.onBeforeCompile === 'function' && mat.onBeforeCompile.toString().length > 60 ? 'custom' : 'default',
      defines: mat.defines ? Object.keys(mat.defines).sort().join(',') : '',
      maps: Object.fromEntries(['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap', 'alphaMap', 'clearcoatNormalMap', 'sheenColorMap', 'envMap', 'lightMap'].map((k) => [k, texId(mat[k])])) };
  };
  const table = scene.getObjectByName('obTable');
  const inv = []; let order = 0;
  const walk = (root) => root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry; const pos = g.getAttribute('position'); if (!pos) return;
    o.updateWorldMatrix(true, false);
    const mw = Array.from(o.matrixWorld.elements).map((v) => Number(v.toFixed(7)));
    const pa = pos.array; const ia = g.index ? g.index.array : null;
    // NOTE-FENCE-NORMALS (fence law, 2026-09-09): the geometry identity hashes EVERY attribute the renderer reads — each entry of
    // g.attributes (positions, normals, uvs, uv1/uv2, tangents, colors, skin weights, whatever the mesh carries), by name, over
    // the attribute's OWN bytes (byteOffset / byteLength: an interleaved or shared buffer is never hashed past the attribute) with
    // its itemSize and normalized flag; the index; the draw groups (start / count / materialIndex). A normals-only, uv-only or
    // groups-only change moves the hash. geomAttrs keeps the per-attribute hashes for the red arms; geom is their joined string.
    const bytes = (a) => new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength);
    const geomAttrs = {};
    for (const nm of Object.keys(g.attributes).sort()) { const a = g.getAttribute(nm); geomAttrs['attr:' + nm] = fnv(bytes(a)) + '/' + a.itemSize + (a.normalized ? 'n' : ''); }
    geomAttrs.index = ia ? fnv(new Uint8Array(ia.buffer, ia.byteOffset, ia.byteLength)) : 'noidx';
    geomAttrs.groups = (g.groups && g.groups.length) ? fnv(new TextEncoder().encode(JSON.stringify(g.groups.map((gr) => [gr.start, gr.count, gr.materialIndex ?? 0])))) : 'nogroups';
    const geomHash = Object.keys(geomAttrs).sort().map((k) => k + '=' + geomAttrs[k]).join(';');
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    inv.push({ order: order++, name: o.name || '', type: g.type, visible: !!o.visible, renderOrder: o.renderOrder, castShadow: !!o.castShadow, receiveShadow: !!o.receiveShadow,
      verts: pos.count, tris: ia ? ia.length / 3 : pos.count / 3, matrixWorld: mw, geom: geomHash, geomAttrs, material: mats.map(matId) });
  });
  if (table) walk(table);
  const roots = scene.children.map((c) => (c.name || c.type) + ':' + c.children.length);
  return { table: !!table, meshes: inv, roots, sceneTableId: (table && table.userData && table.userData.tableId) || null,
    tableId: (window.__test && window.__test.equipment && window.__test.equipment()) || null };
})()`;

async function dumpTree(webDir, label) {
  const treeIds = treeTableIds(fs.readFileSync(path.join(webDir, 'scene/table.js'), 'utf8'), label);
  const server = spawnStaticServer(webDir, HTTP);
  await assertServedTree(webDir, HTTP, label);
  await sleep(800);
  const out = {};
  try {
    for (const key of TABLES) {
      const id = treeIds[key];
      const chrome = await launchChrome(bootUrl(id), { port: CDP, width: 960, height: 540, preflight: false });
      try {
        let ready = false;
        for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
        if (!ready) throw new Error(`${label} ${id}: app never became ready`);
        // GI / lazy leaves settle (the extension's install is async too); then the census waits for the SCENE to hold still:
        // every geometry attribute's version (and the mesh count) unchanged over three reads 500 ms apart, cap 30 s — the snooker
        // pocket cap's aOccl bake lands in three asynchronous stages 1–3.6 s after ready (NOTE-FENCE-NORMALS experiment: settled
        // 19e72ed9 on every load; a read inside the window gave a different hash per run). The wait is stated in the dump.
        await sleep(2500);
        const flushA = await chrome.eval(FLUSH_JS); // NOTE-OCCL-FLUSH: the parked attribute work drained BEFORE the predicate reads
        let settled = null, prev = null, still = 0; const t0 = Date.now();
        while (Date.now() - t0 < 30000) { const dig = await chrome.eval(SETTLE_JS); if (dig === prev) still += 1; else { still = 0; prev = dig; } if (still >= 2) { settled = Date.now() - t0; break; } await sleep(500); }
        const flushB = await chrome.eval(FLUSH_JS); // …and again before the photograph: nothing queued between the last read and the dump
        const d = await chrome.eval(DUMP_JS);
        d.settle = { ms: settled ?? null, capped: settled === null };
        d.flushed = { seam: flushA?.seam === true && flushB?.seam === true, beforeSettle: flushA ?? null, beforeDump: flushB ?? null };
        if (label === 'new' && !d.flushed.seam) throw new Error(`${label} ${id}: identity dump REFUSED — window.__snkOccl.flush is not on this tree (NOTE-OCCL-FLUSH: a new dump without the flush record is inadmissible)`);
        if (!d.flushed.seam) log(label, id, 'no __snkOccl seam on this tree: aOccl is judged only where both sides carry the flush record');
        if (settled === null) log(label, id, 'WARNING: the scene did not hold still within 30 s (attribute versions kept moving) — census read anyway');
        if (d.error) throw new Error(`${label} ${id}: ${d.error}`);
        const refusal = bootedTableRefusal(label, key, id, d);
        if (refusal) throw new Error(refusal);
        d.key = key; d.requested = id;
        const errs = await chrome.eval('__test.errors');
        d.appErrors = errs;
        out[key] = d;
        fs.writeFileSync(path.join(OUT, `${label}-${key}.json`), JSON.stringify(d));
        log(label, id, 'meshes', d.meshes.length, 'roots', d.roots.length, errs.length ? 'ERRORS ' + errs.join('|') : '');
      } finally { chrome.close(); await sleep(300); }
    }
  } finally { await stopStaticServer(server); }
  return out;
}

// ---- the CAMERA row: __track rig across a netted pot, per-frame numeric trace -------
// A straight-in pot along the diagonal into the +x/+y CORNER pocket (kernel frame:
// x across the 1.27 m width, y along the 2.54 m length; phi in radians, 0 = +x).
// Corner, not middle: the cn8 middle pocket carries a plate, the corners carry the
// knitted socks whose settle() retention is the net class under test.
const CAM_LAYOUT = [{ id: 0, x: 0.30, y: 0.935 }, { id: 1, x: 0.50, y: 1.135 }, { id: 9, x: -0.3, y: -0.9 }];
const CAM_SHOT = { v0: 2.4, phi: Math.PI / 4, theta: 0, a: 0, b: 0 };
async function cameraTrace(webDir, label) {
  const server = spawnStaticServer(webDir, HTTP);
  await assertServedTree(webDir, HTTP, label);
  await sleep(800);
  const chrome = await launchChrome(`http://127.0.0.1:${HTTP}/app.html?seed=1&norec=1&table=${CAMERA_TABLE}`, { port: CDP, width: 960, height: 540, preflight: false });
  try {
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
    if (!ready) throw new Error(`${label} camera row: app never became ready`);
    await sleep(2500);
    await chrome.eval(`__settings.changeEquipment('table_id', '${CAMERA_TABLE}', { skipConfirm: true })`);
    await sleep(700);
    await chrome.eval(`__test.layout(${JSON.stringify(CAM_LAYOUT)})`);
    await sleep(200);
    const err = await chrome.eval(`__test.shoot(${JSON.stringify(CAM_SHOT)})`);
    if (err) throw new Error(`${label} camera row: shoot refused: ${JSON.stringify(err)}`);
    await sleep(400);
    await chrome.eval('__test.pause(true)');
    await chrome.eval('__test.setManual(true)');
    const pots = await chrome.eval("__test.events().filter((e) => e.kind && e.kind.BallPocket).map((e) => ({ t: e.t, ball: e.kind.BallPocket.ball, pocket: e.kind.BallPocket.pocket }))");
    if (!pots.length) throw new Error(`${label} camera row: the combination potted nothing on ${CAMERA_TABLE}`);
    const target = pots[0];
    const started = await chrome.eval(`__track.start({ target: 'ball:${target.ball}', cam: [0.4, -0.5, 0.8], damp: 0.35 })`);
    if (!started) throw new Error(`${label} camera row: __track.start refused`);
    const frames = [];
    const t0 = Math.max(0, target.t - 0.3), t1 = target.t + 1.2;
    for (let t = t0; t <= t1 + 1e-9; t += 1 / 30) {
      const f = await chrome.eval(`(() => { __test.renderAt(${t}, 1 / 60); const c = window.__dbg.camera; const b = __test.balls().find((x) => x.id === ${target.ball});
        return { phase: 'A', t: ${t.toFixed(6)}, cam: [c.position.x, c.position.y, c.position.z, c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w], ball: b ? [b.visible ? 1 : 0, b.pocketed ? 1 : 0, ...b.pos] : null }; })()`);
      frames.push(f);
    }
    await chrome.eval('__track.stop()');
    // Phase B — the net class proper. game.js settle() keeps a NETTED ball
    // `pocketed = true` AND `mesh.visible = true` at its rest pose in the sock
    // (game.js settle(): nettedRetained) — during playback it is either still
    // dropping (pocketed false) or parked (invisible), so phase A alone is blind
    // (measured: 0 net frames). Let the shot settle in realtime, then start the
    // rig on the netted ball and framestep in AIM: main FOLLOWS the retained
    // ball, the seal-1 `!ball.pocketed` hold does not — the trace differs there.
    await chrome.eval('__test.setManual(false)');
    await chrome.eval('__test.pause(false)');
    let state = await chrome.eval('__test.state()');
    for (let i = 0; i < 80 && state === 'PLAYBACK'; i++) { await sleep(250); state = await chrome.eval('__test.state()'); }
    await sleep(600); // the settle → AIM transition + the socks' settled deformation
    state = await chrome.eval('__test.state()');
    await chrome.eval('__test.setManual(true)');
    const started2 = await chrome.eval(`__track.start({ target: 'ball:${target.ball}', cam: [0.4, -0.5, 0.8], damp: 0.35 })`);
    if (!started2) throw new Error(`${label} camera row: __track.start (phase B) refused`);
    const tEnd = await chrome.eval('__test.duration()');
    for (let k = 0; k < 40; k++) {
      const t = tEnd + 0.5 + k / 30;
      const f = await chrome.eval(`(() => { __test.renderAt(${t}, 1 / 60); const c = window.__dbg.camera; const b = __test.balls().find((x) => x.id === ${target.ball});
        return { phase: 'B', state: __test.state(), t: ${t.toFixed(6)}, cam: [c.position.x, c.position.y, c.position.z, c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w], ball: b ? [b.visible ? 1 : 0, b.pocketed ? 1 : 0, ...b.pos] : null }; })()`);
      frames.push(f);
    }
    await chrome.eval('__track.stop()');
    const errs = await chrome.eval('__test.errors');
    const netFrames = frames.filter((f) => f.ball && f.ball[0] === 1 && f.ball[1] === 1).length; // visible AND pocketed = the net class in play
    const out = { table: CAMERA_TABLE, target, frames, netFrames, appErrors: errs };
    fs.writeFileSync(path.join(OUT, `camera-${label}.json`), JSON.stringify(out));
    log(label, 'camera row', CAMERA_TABLE, 'target ball', target.ball, 'pot t', target.t.toFixed(3), 'frames', frames.length, 'net frames', netFrames, errs.length ? 'ERRORS ' + errs.join('|') : '');
    return out;
  } finally { chrome.close(); await sleep(300); await stopStaticServer(server); }
}
/** Seek-back row (seal 3, review r1 P2-3): FLAG ON where a module exists. The e2e's
 * combination pots ball 1; the __track rig starts on it live (t = 0), then frames
 * live → posed (t 1.613; main: parked → hold, NEW: posed → hold via the marker) →
 * posed + 1 → revived by a backward seek (t 0.05) → 0.10. On the revived frame the
 * camera hook runs BEFORE the extension clears its marker, so a predicate that reads
 * the marker alone HOLDS for one frame (the seal-2 tree — the red) while main and
 * the fixed predicate FOLLOW. Compared bit-for-bit against main. */
async function cameraTraceSeekBack(webDir, label) {
  const server = spawnStaticServer(webDir, HTTP);
  await assertServedTree(webDir, HTTP, label);
  await sleep(800);
  const chrome = await launchChrome(`http://127.0.0.1:${HTTP}/app.html?seed=1&norec=1&table=${SEEK_TABLE}&ballreturn=TEST-synthetic-wire-slide`, { port: CDP, width: 960, height: 540, preflight: false });
  try {
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
    if (!ready) throw new Error(`${label} seek row: app never became ready`);
    await sleep(2500);
    await chrome.eval(`__settings.changeEquipment('table_id', '${SEEK_TABLE}', { skipConfirm: true })`);
    await sleep(700);
    const armed = await chrome.eval('!!(window.__ballreturn && window.__ballreturn.enabled)');
    await chrome.eval('__test.layout([{ id: 0, x: 0.05, y: 0.0 }, { id: 1, x: 0.30, y: 0.0 }, { id: 2, x: 0.50, y: 0.0 }, { id: 9, x: 0.3, y: -0.9 }])');
    await sleep(200);
    await chrome.eval('__test.setSlowmo(true)');
    const err = await chrome.eval('__test.shoot({ v0: 3.2, phi: 0, theta: 0, a: 0, b: 0.25 })');
    if (err) throw new Error(`${label} seek row: shoot refused: ${JSON.stringify(err)}`);
    await sleep(400);
    await chrome.eval('__test.pause(true)');
    await chrome.eval('__test.setManual(true)');
    await chrome.eval('__test.renderAt(0, 1 / 60)');
    const started = await chrome.eval("__track.start({ target: 'ball:1', cam: [0.4, -0.5, 0.8], damp: 0.35 })");
    if (!started) throw new Error(`${label} seek row: __track.start refused`);
    const frames = [];
    for (const t of [0.05, 1.613, 1.613 + 1 / 30, 0.05, 0.10, 0.15]) {
      const f = await chrome.eval(`(() => { __test.renderAt(${t}, 1 / 60); const c = window.__dbg.camera; const b = __test.balls().find((x) => x.id === 1);
        return { t: ${t.toFixed(6)}, cam: [c.position.x, c.position.y, c.position.z, c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w], ball: b ? [b.visible ? 1 : 0, b.pocketed ? 1 : 0, ...b.pos] : null }; })()`);
      frames.push(f);
    }
    await chrome.eval('__track.stop()');
    const errs = await chrome.eval('__test.errors');
    const out = { table: SEEK_TABLE, armed, frames, appErrors: errs };
    fs.writeFileSync(path.join(OUT, `camera-seek-${label}.json`), JSON.stringify(out));
    log(label, 'seek row', SEEK_TABLE, 'extension armed', armed, 'frames', frames.length, 'posed at 1.613', frames[1]?.ball?.[0] === 1 && frames[1]?.ball?.[1] === 1, errs.length ? 'ERRORS ' + errs.join('|') : '');
    return out;
  } finally { chrome.close(); await sleep(300); await stopStaticServer(server); }
}
/** Camera-only trace compare (the seek row: the BALL state legitimately differs
 * between main — no module, parked — and the flag-on tree — posed; the claim is
 * about the CAMERA). */
function compareCamera(a, b) {
  let first = -1;
  const n = Math.min(a.frames.length, b.frames.length);
  for (let i = 0; i < n && first < 0; i++) if (JSON.stringify(a.frames[i].cam) !== JSON.stringify(b.frames[i].cam)) first = i;
  if (first < 0 && a.frames.length !== b.frames.length) first = n;
  return { identical: first < 0, firstDiff: first, frames: [a.frames.length, b.frames.length] };
}
function compareTrace(a, b) {
  let first = -1;
  const n = Math.min(a.frames.length, b.frames.length);
  for (let i = 0; i < n && first < 0; i++) if (JSON.stringify(a.frames[i]) !== JSON.stringify(b.frames[i])) first = i;
  if (first < 0 && a.frames.length !== b.frames.length) first = n;
  return { identical: first < 0, firstDiff: first, frames: [a.frames.length, b.frames.length] };
}

const joinGeom = (attrs) => Object.keys(attrs).sort().map((k) => k + '=' + attrs[k]).join(';');   // the page's join, verbatim
const geomKey = (m) => createHash('sha256').update(m.name + JSON.stringify(m.matrixWorld) + m.geom + m.type + m.visible + m.renderOrder).digest('hex').slice(0, 16);
function* diffPaths(a, b, p = '') {
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) yield* diffPaths(a[k], b[k], p ? `${p}.${k}` : k);
  } else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (let i = 0; i < a.length; i++) yield* diffPaths(a[i], b[i], `${p}[${i}]`);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) yield [p, a, b];
}
function compare(base, neu) {
  // NOTE-OCCL-FLUSH: the async attribute is judged only where BOTH dumps carry the flush record; else attr:aOccl leaves the key
  const flushedBoth = base.flushed?.seam === true && neu.flushed?.seam === true;
  const keyOf = flushedBoth ? geomKey : (m) => geomKey({ ...m, geom: joinGeom(Object.fromEntries(Object.entries(m.geomAttrs ?? {}).filter(([k]) => k !== 'attr:aOccl'))) });
  const gb = new Set(base.meshes.map(keyOf)), gn = new Set(neu.meshes.map(keyOf));
  const symdiff = [...gb].filter((k) => !gn.has(k)).length + [...gn].filter((k) => !gb.has(k)).length;
  const mb = new Map(base.meshes.map((m) => [`${m.order}|${m.name}`, m.material]));
  const mn = new Map(neu.meshes.map((m) => [`${m.order}|${m.name}`, m.material]));
  const missing = [...new Set([...mb.keys(), ...mn.keys()])].filter((k) => mb.has(k) !== mn.has(k));
  const matDiffs = [];
  for (const k of mb.keys()) if (mn.has(k)) for (const d of diffPaths(mb.get(k), mn.get(k))) matDiffs.push([k, ...d]);
  const rootsSame = JSON.stringify(base.roots) === JSON.stringify(neu.roots);
  const flushed = flushedBoth ? `both flushed (base ${base.flushed.beforeSettle?.ms ?? '?'}+${base.flushed.beforeDump?.ms ?? '?'} ms, new ${neu.flushed.beforeSettle?.ms ?? '?'}+${neu.flushed.beforeDump?.ms ?? '?'} ms)` : `NOT both (base ${base.flushed?.seam ? 'flushed' : 'no seam'}, new ${neu.flushed?.seam ? 'flushed' : 'no seam'}): aOccl excluded from the key`;
  return { meshes: [base.meshes.length, neu.meshes.length], matsJudged: [...mb.keys()].filter((k) => mn.has(k)).length, geomIdentical: symdiff === 0, symdiff, matIdentical: matDiffs.length === 0 && missing.length === 0, flushed, flushedBoth,
    matDiffs: matDiffs.slice(0, 12), missing: missing.slice(0, 6), rootsSame, rootsBase: base.roots, rootsNew: neu.roots,
    debugGroupNew: neu.roots.some((r) => /^obBallReturnDebug/.test(r)), appErrorsNew: neu.appErrors };
}
function redArm(dump) {
  const fails = [];
  const pick = dump.meshes.find((m) => m.material?.[0] && m.material[0].roughness != null);
  if (!pick) return ['no mesh with a material record to arm'];
  // NOTE-FENCE-NORMALS: a negative test PER geometry attribute — normals first — on a mesh of the census that carries it; an
  // attribute no census mesh carries (tangents, colors on a plain table) is stated absent, not counted as a failure to fire
  const attrNames = [...new Set(dump.meshes.flatMap((m) => Object.keys(m.geomAttrs ?? {})))];
  const ordered = ['attr:normal', ...attrNames.filter((k) => k !== 'attr:normal').sort()];
  redArm.absent = ['attr:tangent', 'attr:color'].filter((k) => !attrNames.includes(k));
  const geomCases = {};
  for (const k of ordered) {
    const host = dump.meshes.find((m) => m.geomAttrs && m.geomAttrs[k] != null) ?? null; if (!host) continue;
    geomCases[`geometry:${k.replace(/^attr:/, '')}`] = { order: host.order, mut: (d) => { d.geomAttrs[k] = 'deadbeef/x'; d.geom = joinGeom(d.geomAttrs); } };
  }
  const cases = {
    color: (d) => { d.material[0].color = 'deadbe'; }, roughness: (d) => { d.material[0].roughness += 0.01; }, metalness: (d) => { d.material[0].metalness = (d.material[0].metalness ?? 0) + 0.01; },
    envMapIntensity: (d) => { d.material[0].envMapIntensity = (d.material[0].envMapIntensity ?? 1) + 0.1; }, clearcoat: (d) => { d.material[0].clearcoat = (d.material[0].clearcoat ?? 0) + 0.1; },
    normalScale: (d) => { d.material[0].normalScale = [9, 9]; }, mapHash: (d) => { d.material[0].maps.map = { hash: 'deadbeef' }; }, materialClass: (d) => { d.material[0].cls = 'MeshBasicMaterial'; },
    matrixWorld: (d) => { d.matrixWorld = d.matrixWorld.map((v, i) => (i === 12 ? v + 0.001 : v)); }, rootGroup: null,
  };
  const all = { ...Object.fromEntries(Object.entries(geomCases)), ...cases };
  redArm.fired = [];
  for (const [name, spec] of Object.entries(all)) {
    const copy = JSON.parse(JSON.stringify(dump));
    const mut = typeof spec === 'function' ? spec : spec && spec.mut; const ord = spec && spec.order != null ? spec.order : pick.order;
    if (name === 'rootGroup') copy.roots.push('obBallReturnDebug:9');
    else mut(copy.meshes[copy.meshes.indexOf(copy.meshes.find((m) => m.order === ord))]);
    const r = compare(dump, copy);
    const fired = name.startsWith('geometry') || name === 'matrixWorld' ? !r.geomIdentical : name === 'rootGroup' ? (!r.rootsSame && r.debugGroupNew) : !r.matIdentical;
    if (!fired) fails.push(name); else redArm.fired.push(name);
  }
  return fails;
}

// ---- run --------------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ballreturn-base-'));
log('base', BASE, '→', tmp);
execFileSync('sh', ['-c', `git -C "${GIT}" archive ${BASE} web tools/render | tar -x -C "${tmp}"`]);
// web/tools/render is a symlink to ../../tools/render — the archive carries both
const baseDump = CAMERA_ONLY ? null : await dumpTree(path.join(tmp, 'web'), 'base');
const newDump = CAMERA_ONLY ? null : await dumpTree(path.join(repo, 'web'), 'new');
const camBase = await cameraTrace(path.join(tmp, 'web'), 'base');
const camNew = await cameraTrace(path.join(repo, 'web'), 'new');
const seekBase = await cameraTraceSeekBack(path.join(tmp, 'web'), 'base');
const seekNew = await cameraTraceSeekBack(path.join(repo, 'web'), 'new');
let seekRed = null;
if (RED_TREE_SEEK) {
  const tmpS = fs.mkdtempSync(path.join(os.tmpdir(), 'ballreturn-redseek-'));
  execFileSync('sh', ['-c', `git -C "${GIT}" archive ${RED_TREE_SEEK} web tools/render | tar -x -C "${tmpS}"`]);
  seekRed = await cameraTraceSeekBack(path.join(tmpS, 'web'), 'red');
  fs.rmSync(tmpS, { recursive: true, force: true });
}
let camRed = null;
if (RED_TREE) {
  const tmpRed = fs.mkdtempSync(path.join(os.tmpdir(), 'ballreturn-red-'));
  execFileSync('sh', ['-c', `git -C "${GIT}" archive ${RED_TREE} web tools/render | tar -x -C "${tmpRed}"`]);
  camRed = await cameraTrace(path.join(tmpRed, 'web'), 'red');
  fs.rmSync(tmpRed, { recursive: true, force: true });
}
const rows = [];
let allOk = true;
for (const id of CAMERA_ONLY ? [] : TABLES) {
  const r = compare(baseDump[id], newDump[id]);
  const ok = r.geomIdentical && r.matIdentical && r.rootsSame && !r.debugGroupNew && (r.appErrorsNew?.length ?? 0) === 0;
  allOk = allOk && ok;
  CENSUS.tables++; CENSUS.mesh += r.meshes[1]; CENSUS.material += r.matsJudged; // the coverage token counts WORK, never intent
  const pair = baseDump[id].requested === newDump[id].requested ? id : `${id} (base ${baseDump[id].requested} / new ${newDump[id].requested})`;
  rows.push(`| ${pair} | ${r.meshes[0]} / ${r.meshes[1]} | ${r.geomIdentical ? 'identical' : `DRIFT (${r.symdiff})`} | ${r.matIdentical ? 'identical' : `DRIFT (${r.matDiffs.length} fields, ${r.missing.length} missing)`} | ${r.rootsSame ? 'identical' : 'DRIFT'} | ${r.debugGroupNew ? 'PRESENT (red)' : 'absent'} | ${r.flushed} | ${ok ? 'PASS' : 'FAIL'} |`);
  if (!ok) log('DRIFT', id, JSON.stringify({ symdiff: r.symdiff, matDiffs: r.matDiffs, missing: r.missing, rootsBase: r.rootsBase, rootsNew: r.rootsNew, appErrorsNew: r.appErrorsNew }));
}
// camera row verdict: identical to BASE, the net class actually exercised, no errors, and (if asked) the red tree differs
const camCmp = compareTrace(camBase, camNew); CENSUS.camera++;
const camRedCmp = camRed ? compareTrace(camBase, camRed) : null;
const camOk = camCmp.identical && camBase.netFrames > 0 && camNew.netFrames > 0 && camNew.appErrors.length === 0 && camBase.appErrors.length === 0 && (!camRed || !camRedCmp.identical);
allOk = allOk && camOk;
const camLine = `| ${camBase.table} · netted pot (ball ${camBase.target.ball} at t ${camBase.target.t.toFixed(3)} s), \`__track\` target \`ball:${camBase.target.ball}\` | ${camCmp.frames[0]} / ${camCmp.frames[1]} frames (A: 1/30 s across the pot −0.3 … +1.2 s in PLAYBACK; B: 40 framesteps after settle, state ${camNew.frames.at(-1)?.state}) | ${camCmp.identical ? 'identical (camera pose + target visible/pocketed/position, every frame)' : `DRIFT at frame ${camCmp.firstDiff}`} | net class in play on ${camBase.netFrames} / ${camNew.netFrames} frames (visible AND pocketed) | ${camRed ? (camRedCmp.identical ? `red tree ${RED_TREE} NOT rejected (arm blind)` : `red tree ${RED_TREE} differs from frame ${camRedCmp.firstDiff} (arm fires)`) : 'red tree not run (pass --red-tree)'} | ${camOk ? 'PASS' : 'FAIL'} |`;
if (!camCmp.identical) log('CAMERA DRIFT', JSON.stringify({ first: camCmp.firstDiff, base: camBase.frames[camCmp.firstDiff], neu: camNew.frames[camCmp.firstDiff] }));
const seekCmp = compareCamera(seekBase, seekNew); CENSUS.camera++;
const seekRedCmp = seekRed ? compareCamera(seekBase, seekRed) : null;
// the red must differ ON OR AFTER the revived frame (index 3) — a stale-marker hold —
// not before it (frames 0–2 are live / posed-hold on every tree)
const seekRedRight = !seekRed || (!seekRedCmp.identical && seekRedCmp.firstDiff >= 3);
const seekPosed = seekNew.frames[1]?.ball?.[0] === 1 && seekNew.frames[1]?.ball?.[1] === 1; // NEW really posed ball 1 on the track at 1.613
const seekRevived = seekNew.frames[3]?.ball?.[0] === 1 && seekNew.frames[3]?.ball?.[1] === 0;  // and the seek back revived it
const seekOk = seekCmp.identical && seekNew.armed === true && seekPosed && seekRevived && seekNew.appErrors.length === 0 && seekBase.appErrors.length === 0 && seekRedRight;
allOk = allOk && seekOk;
const seekLine = `| ${SEEK_TABLE} · FLAG ON (TEST track armed on NEW, main has no module) · \`__track\` on \`ball:1\`: live → posed (1.613) → +1 frame → seek back to 0.05 (revived) → 0.10 → 0.15 | ${seekCmp.frames[0]} / ${seekCmp.frames[1]} frames | ${seekCmp.identical ? 'CAMERA identical to main on every frame (a stale marker never holds a revived ball)' : `CAMERA DRIFT at frame ${seekCmp.firstDiff}`} | posed on NEW at 1.613: ${seekPosed}; revived at the seek back: ${seekRevived} | ${seekRed ? (seekRedCmp.identical ? `red tree ${RED_TREE_SEEK} NOT rejected (arm blind)` : `red tree ${RED_TREE_SEEK} camera differs from frame ${seekRedCmp.firstDiff}${seekRedRight ? ' = the revived frame (arm fires)' : ' — BEFORE the revived frame (wrong reason)'}`) : 'red tree not run'} | ${seekOk ? 'PASS' : 'FAIL'} |`;
if (!seekCmp.identical) log('SEEK DRIFT', JSON.stringify({ first: seekCmp.firstDiff, base: seekBase.frames[seekCmp.firstDiff], neu: seekNew.frames[seekCmp.firstDiff] }));
let armLine = 'not run (pass --red-arm)';
if (RED_ARM && !CAMERA_ONLY) {
  const fails = redArm(newDump[TABLES[0]]);
  armLine = fails.length ? `FAILED to fire on: ${fails.join(', ')}` : `fired on every field class (${(redArm.fired ?? []).join(', ')})${redArm.absent?.length ? `; absent on this census (no mesh carries it, no arm): ${redArm.absent.join(', ')}` : ''}`;
  allOk = allOk && fails.length === 0;
}
const md = `# ballreturn fence — mesh + material identity census (flag off)

BASE \`${BASE}\` (git archive, served on :${HTTP}) vs NEW working tree (served on :${HTTP}), chrome-headless-shell via cdp.mjs on :${CDP}. ${new Date().toISOString()}

| table | meshes base / new | geometry | material identity | scene roots | obBallReturnDebug on NEW | aOccl flush (NOTE-OCCL-FLUSH) | verdict |
|---|---|---|---|---|---|---|---|
${CAMERA_ONLY ? '| (census skipped: --camera-only — an iteration run, never a seal run) | | | | | | | |' : rows.join('\n')}

Red arm: ${armLine}

## Camera row (flag off, the one edit outside the module — web/app/cameratrack.js)

| scene | frames base / new | camera + target trace | net class exercised | red arm | verdict |
|---|---|---|---|---|---|
${camLine}
${seekLine}

Verdict: **${allOk ? 'IDENTICAL' : 'DRIFT'}**
`;
fs.writeFileSync(path.join(OUT, 'fence.md'), md);
console.log(md);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(allOk ? 0 : 3);
