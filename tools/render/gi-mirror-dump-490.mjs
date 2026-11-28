#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// gi-mirror-dump-490.mjs — BUILD-3 (review round 12 P1-b): dump the LIVE chinese-8 cushion and
// plank meshes (world-space positions through CDP) for gi-mirror-census-490.mjs, which compares
// them with the GI bake mirror's occluder polygons.  Minimal CDP client on Node's global
// WebSocket; chrome-headless-shell only (the lane's pinned shell).  Ports: OB_E2E_PORT /
// OB_E2E_CDP_PORT (the battery's pinned pair), else HTTP / CDP, else 24220 / 9783.
//
//   node tools/render/gi-mirror-dump-490.mjs [--table chinese8_pro_9ft] [--web <dir>] [--out <json>]
//                                             [--names <regex>]   (default ^cn8-(cushion|plank)-)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2)); // FIX10 (Fable pass 1): the run's view of the argv is the =-expanded view the parse consumed
const argOf = (k, d) => { const i = argv.lastIndexOf(k); return i >= 0 ? argv[i + 1] : d; };
const { stringOpt: sOpt, pathOpt: pOpt } = await import('./lib/argv.mjs');
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'gi-mirror-dump', value: ['--out', '--web', '--table', '--names'] });
// FIX3 (P2 (a)) → FIX10: the prior dump at the parsed destination is the first effect after the parse
const OUTJSON = __P.value('--out') ?? '/tmp/ob-gi-mirror-490-dump.json';
invalidatePrior([OUTJSON], 'gi-mirror-dump');
const TABLE = (await (await import('./lib/table-ids.mjs')).requireTableIds([sOpt('--table', { default: 'chinese8_pro_9ft', tag: 'gi-mirror-dump' })], 'gi-mirror-dump'))[0]; // FAIL CLOSED (FIX1/FIX2)
const WEB = pOpt('--web', { default: path.resolve(HERE, '..', '..', 'web'), tag: 'gi-mirror-dump', mustExist: 'dir' });
const NAMES = new RegExp(sOpt('--names', { default: '^cn8-(cushion|plank)-', tag: 'gi-mirror-dump' })); // FIX2: a trailing --names used to become /(?:)/ (everything)
import { createHash } from 'node:crypto';
import { builtTableIdExpr, assertBuiltTable } from './lib/table-ids.mjs';
import { invalidatePrior, awaitOwnedServer, refusal } from './lib/serve-check.mjs';
import { pollEval } from './lib/cdp-lite.mjs';
import { pathToFileURL } from 'node:url';
let __cdp = null; // COMPANION-1c L1: the shared launcher + static server are imported from the REQUESTED --web tree (its tools/cdp.mjs), as FIX11's awaitOwnedServer does — the harness comes from the tree under test, and its preflight judges THAT tree
const HTTP = +(process.env.OB_E2E_PORT || process.env.HTTP || 24220), CDP = +(process.env.OB_E2E_CDP_PORT || process.env.CDP || 24221), W = 1600, H = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL_ = `http://127.0.0.1:${HTTP}/app.html?table=${TABLE}&cinema=1&seed=7&look=default&obtool=1`;

const log = (...a) => console.error('[gi-mirror-dump]', ...a);
let server = null, chrome = null;
const cleanup = async () => {
  // COMPANION-1b: the shared launcher owns the browser (profile dir, helpers, the GH-665 same-port lifecycle) and the shared server
  // helper owns the python — closeAndWait() / stopStaticServer(), never a process.kill on a pid this file spawned itself
  if (chrome) { const c = chrome; chrome = null; try { await c.closeAndWait(); } catch {} }
  if (server) { const s = server; server = null; try { if (__cdp) await __cdp.stopStaticServer(s); } catch {} }
};
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(143); });
for (const ev of ['unhandledRejection', 'uncaughtException']) process.on(ev, async (e) => { console.error(`[gi-mirror-dump] FATAL (${ev}):`, e && e.stack || e); await cleanup(); process.exit(2); }); // never a leak past cleanup

async function main() {
  { const cdpPath = path.join(WEB, 'tools', 'cdp.mjs'); if (!fs.existsSync(cdpPath)) throw refusal('gi-mirror-dump', `the requested --web ${WEB} carries no tools/cdp.mjs — the harness comes from the tree under test; a web tree without the shared launcher cannot be booted by this tool (COMPANION-1c L1)`); __cdp = await import(pathToFileURL(cdpPath).href); }
  server = __cdp.spawnStaticServer(WEB, HTTP); // COMPANION-1b: the shared static server (band checks, the GH-557 failure watchdog, the marker reapOwnServer reads) — from the requested tree's cdp.mjs
  await awaitOwnedServer(server, HTTP, WEB, 'gi-mirror-dump'); // FIX11: the shared preflight IS the wait, then FIX3's ownership + served-tree identity checks
  // COMPANION-1b: the shared launcher — its profile dir (no rmSync here), the foreign-holder / foreign-band refusals, Runtime / Page /
  // Log enabled; the window is sized by the launcher (no metrics override). COMPANION-1c L2: the browser is launched on a script-free page of our own server
  // (/sw.js as text; tool:false — URL_ already carries obtool=1), the diagnostic listeners are registered, THEN the app page is navigated — so the boot-time
  // console lines / exceptions ('[app] kernel …') reach a listener, as before the migration; the launcher's own served-tree preflight runs against the requested
  // tree's origin (L1) after awaitOwnedServer already validated it
  chrome = await __cdp.launchChrome(`http://127.0.0.1:${HTTP}/sw.js`, { port: CDP, width: W, height: H, tool: false }); // a script-free page of OUR server (the launcher resolves only http page targets, never about:blank); its preflight runs against the requested tree's origin
  log('chrome pid', chrome.pid, '| server pid', server.pid, 'serving', WEB, 'on', HTTP);
  const consoleLines = []; globalThis.__consoleLines = consoleLines;
  let cdpGone = null; let bootContextObserved = false; let bootContexts = 0; // COMPANION-1c L2 witness: the app document's execution context is created by the navigation BELOW — a listener registered before it sees Runtime.executionContextCreated for the app origin; one registered after a launch on the app URL (the pre-fix order) cannot on this first navigation (a later reload of the app document would create a fresh context — the record carries the count; FIX2c, the FIX2b Fable lens)
  const __appOrigin = new URL(URL_).origin;
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.executionContextCreated' && params && params.context && params.context.origin === __appOrigin) { bootContextObserved = true; bootContexts += 1; } // the shared launcher dispatches (method, params) — cdp.mjs eventHandlers.forEach((h) => h(msg.method, msg.params)); not a message object (COMPANION-1b, Fable landing lens)
    if (method === 'Runtime.exceptionThrown') consoleLines.push('EXCEPTION ' + JSON.stringify(params && params.exceptionDetails).slice(0, 1500));
    else if (method === 'Runtime.consoleAPICalled') consoleLines.push(((params && params.args) || []).map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' '));
    else if (method === 'Inspector.detached' || method === 'Inspector.targetCrashed') cdpGone = method + (params && params.reason ? ' ' + params.reason : '');
  });
  const evalJ = async (expr) => { try { return await chrome.eval(expr); } catch (e) { if (!cdpGone && /closed|disconnect|poison|deadline|wedged/i.test(String(e && e.message))) cdpGone = String(e.message).slice(0, 120); throw e; } };
  const closedGuard = (what) => { const p = chrome.poisoned ? chrome.poisoned() : null; if (cdpGone || p) throw refusal('gi-mirror-dump', `CDP session gone (${cdpGone || p}) while ${what} — the renderer is gone; the run stops here and its cleanup closes this run's browser and server`); };
  log('navigate', URL_); await chrome.send('Page.navigate', { url: URL_ }); // COMPANION-1c L2: navigation AFTER the listeners are registered

  let ready = false;
  for (let i = 0; i < 300 && !ready; i++) {
    await sleep(200); closedGuard('waiting for the app');
    ready = await pollEval(evalJ, 'window.__test?.ready === true', { tag: 'gi-mirror-dump', what: 'waiting for the app', fallback: false }); // FIX7 (P2 B)
  }
  if (!ready) throw new Error('app never became ready');
  log('ready');
  // GI settle (mirrors capture-488d-registers.mjs; geometry does not depend on it,
  // but we wait so the boot is at the same state the registers were shot in)
  let rig = null;
  for (let i = 0; i < 200; i++) {
    closedGuard('waiting for the GI bake');
    const st = await pollEval(evalJ, `(() => { const s = window.__gi && window.__gi.state; const lg = window.__lighting && window.__lighting.state && window.__lighting.state();
      return JSON.stringify({ giReady: s ? !!s.ready : null, baked: s ? !!s.baked : null, fits: s ? s.fits : null, fixture: s ? s.fixture : null, bakeClass: s ? s.bakeClass : null,
        exposure: window.__dbg && window.__dbg.renderer && window.__dbg.renderer.toneMappingExposure, toneMapping: window.__dbg && window.__dbg.renderer && window.__dbg.renderer.toneMapping }); })()`, { tag: 'gi-mirror-dump', what: 'waiting for the GI bake', fallback: null });
    if (st) { rig = JSON.parse(st); if (rig.giReady && (rig.baked || rig.fits === false)) break; }
    await sleep(200);
  }
  log('rig', JSON.stringify(rig));
  await sleep(1000);

  { const { awaitGeometrySettle } = await import('./lib/settle.mjs'); const st = await awaitGeometrySettle(evalJ, { tag: 'gi-mirror-dump', guard: closedGuard }); console.error(`[gi-mirror-dump] geometry settled: ${st.meshes} meshes, ${st.reads} reads, ${st.changes} change(s) after the GI bake (last at +${st.lastChangeMs} ms), ${st.ms} ms`); } // NOTE-CENSUS-SETTLE
  assertBuiltTable(TABLE, await evalJ(builtTableIdExpr), 'gi-mirror-dump'); // FAIL CLOSED (ORDER-CN8-731-FIX1): the page built the requested table
  const info = await evalJ(`(() => {
    const scene = window.__dbg.scene; scene.updateMatrixWorld(true);
    let table = null; scene.traverse((o) => { if (!table && o.name === 'obTable') table = o; });
    const inTable = new Set(); if (table) table.traverse((o) => inTable.add(o));
    const list = []; const objs = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const nm = o.name || '';
      const inT = inTable.has(o);
      if (!(nm.startsWith('dm-') || inT)) return;
      const g = o.geometry; const pos = g.getAttribute('position'); if (!pos) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      // parent chain (nearest named ancestor)
      let p = o.parent, anc = ''; while (p && p !== scene) { if (p.name) { anc = p.name; break; } p = p.parent; }
      objs.push(o);
      list.push({ i: objs.length - 1, name: nm, parent: (o.parent && o.parent.name) || '', ancestor: anc, inTable: inT,
        geomType: g.type, verts: pos.count, indexed: !!g.index, idxCount: g.index ? g.index.count : 0,
        instanced: !!o.isInstancedMesh, instances: o.isInstancedMesh ? o.count : 1,
        visible: o.visible, matVisible: mat ? mat.visible !== false : true, matName: (mat && mat.name) || '', matType: (mat && mat.type) || '',
        hex: (mat && mat.color && mat.color.getHexString) ? mat.color.getHexString() : '',
        drawRange: g.drawRange ? [g.drawRange.start, g.drawRange.count === Infinity ? -1 : g.drawRange.count] : null,
        groups: (g.groups || []).length });
    });
    window.__dumpObjs = objs;
    const tablePos = table ? [table.position.x, table.position.y, table.position.z] : null;
    const tableScale = table ? [table.scale.x, table.scale.y, table.scale.z] : null;
    const tableMW = table ? Array.from(table.matrixWorld.elements) : null;
    return JSON.stringify({ tableFound: !!table, tablePos, tableScale, tableMW, up: scene.up ? [scene.up.x, scene.up.y, scene.up.z] : null,
      camUp: window.__dbg.camera ? [window.__dbg.camera.up.x, window.__dbg.camera.up.y, window.__dbg.camera.up.z] : null,
      tableId: (window.__test.equipment && window.__test.equipment()) || null, list });
  })()`);
  const meta = JSON.parse(info);
  log('table found', meta.tableFound, 'meshes selected', meta.list.length, 'tableId', JSON.stringify(meta.tableId));

  const meshes = [];
  let totalTris = 0;
  meta.list = meta.list.filter((e) => NAMES.test(e.name || ''));
  log('meshes matching', String(NAMES), meta.list.length);
  for (const e of meta.list) {
    const s = await evalJ(`(() => {
      const o = window.__dumpObjs[${e.i}]; const g = o.geometry; const pos = g.getAttribute('position');
      const M = o.matrixWorld.elements; const out = []; const idx = [];
      const applyM = (m, lx, ly, lz) => [m[0]*lx + m[4]*ly + m[8]*lz + m[12], m[1]*lx + m[5]*ly + m[9]*lz + m[13], m[2]*lx + m[6]*ly + m[10]*lz + m[14]];
      const mul = (a, b) => { // a*b, column-major 4x4
        const r = new Array(16);
        for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) { let s = 0; for (let k = 0; k < 4; k++) s += a[rr + 4*k] * b[k + 4*c]; r[rr + 4*c] = s; }
        return r; };
      const n = pos.count;
      const inst = o.isInstancedMesh ? o.count : 1;
      const tmp = new Float32Array(16);
      for (let t = 0; t < inst; t++) {
        let m = M;
        if (o.isInstancedMesh) { const im = o.instanceMatrix.array.subarray(t*16, t*16+16); m = mul(M, Array.from(im)); }
        for (let i = 0; i < n; i++) { const w = applyM(m, pos.getX(i), pos.getY(i), pos.getZ(i)); out.push(w[0], w[1], w[2]); }
        if (g.index) { const base = t * n; const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx.push(ia[i] + base); }
      }
      return JSON.stringify({ positions: out, indices: idx });
    })()`);
    const d = JSON.parse(s);
    const sha = createHash('sha256').update(Float32Array.from(d.positions).buffer ? Buffer.from(Float32Array.from(d.positions).buffer) : '').update(Buffer.from(Int32Array.from(d.indices).buffer)).digest('hex').slice(0, 16);
    e.sha = sha; let bb = null; { const P = d.positions; if (P.length) { bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (let i = 0; i < P.length; i += 3) { bb[0] = Math.min(bb[0], P[i]); bb[1] = Math.min(bb[1], P[i+1]); bb[2] = Math.min(bb[2], P[i+2]); bb[3] = Math.max(bb[3], P[i]); bb[4] = Math.max(bb[4], P[i+1]); bb[5] = Math.max(bb[5], P[i+2]); } } } e.bb = bb;
    const tris = (d.indices.length ? d.indices.length : d.positions.length / 3) / 3;
    totalTris += tris;
    meshes.push({ name: e.name, parent: e.parent, ancestor: e.ancestor, inTable: e.inTable, mat: e.matName, matType: e.matType, hex: e.hex,
      geomType: e.geomType, visible: e.visible, matVisible: e.matVisible, instanced: e.instanced, instances: e.instances,
      verts: d.positions.length / 3, tris, sha: e.sha, bb: e.bb, positions: d.positions, indices: d.indices });
  }
  const kernelLine = consoleLines.find((l) => l.startsWith('[app] kernel')) || null;
  const out = { units: 'm', up: 'Y', frame: 'three.js world (x along the table length, y up with the bed cloth at y = 0, z across the width; origin = the table centre)', tool: 'tools/render/gi-mirror-dump-490.mjs', names: String(NAMES),
    table: TABLE, served_web_dir: WEB, url: URL_, kernel_console: kernelLine, boot_context_observed: bootContextObserved, boot_contexts_observed: bootContexts, when: new Date().toISOString(), tableGroup: { position: meta.tablePos, scale: meta.tableScale, matrixWorld: meta.tableMW },
    equipment: meta.tableId, rig, meshCount: meshes.length, totalTris, meshes };
  fs.writeFileSync(OUTJSON, JSON.stringify(out));
  log('wrote', OUTJSON, 'meshes', meshes.length, 'tris', totalTris, 'kernel', kernelLine);
  fs.writeFileSync(OUTJSON.replace(/\.json$/, '.console.txt'), consoleLines.join('\n'));
  const errs = consoleLines.filter((l) => /error|Error|REFUSE|throw/.test(l)); log('console error lines', errs.length); for (const l of errs.slice(0, 20)) log('  ', l.slice(0, 300));
  // the browser and the server are closed by cleanup() — launchChrome's closeAndWait() and stopStaticServer() (COMPANION-1b)
}
try { await main(); } catch (e) { if (e && !e.refused && (e.cdpDeadline || e.cdpClosed)) { console.error(`[gi-mirror-dump] REFUSED — CDP ${e.cdpDeadline ? 'command deadline' : 'socket closed'} outside a readiness poll: ${e.message} — the renderer stopped answering; the run stops here and its cleanup kills the browser and the server`); process.exitCode = 2; } /* FIX7 (Fable pass 2): a deadline on a non-poll evaluate is the same named refusal */ else if (e && e.refused) { console.error(e.message); process.exitCode = 2; } else { log('FAILED', e && e.stack || e); process.exitCode = 1; } try { const fs2 = await import('node:fs'); fs2.writeFileSync(OUTJSON.replace(/\.json$/, '.console.txt'), (globalThis.__consoleLines || []).join('\n')); } catch {} } finally { await cleanup(); process.exit(process.exitCode ?? 0); }
