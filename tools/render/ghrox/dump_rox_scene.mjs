// Copyright (c) Meta Platforms, Inc. and affiliates.

// dump_rox_scene.mjs — Rasson OX A2 instrument: boot the REAL app on a served
// web tree, build `rasson_ox_9ft` (or any TABLE_SPECS id), and export the
// LIVE scene table as world-space triangle meshes + a few register frames.
//
// This is the "runtime mesh extracted from the live scene" the A2 alignment
// gate (A2-PLAN §4a, amendment ii) and the letters gate consume — never an
// exported intermediate. Method = the Diamond lane's d621-align Task A
// (/tmp/d621-align/dump-ours.mjs): minimal CDP client on Node's global
// WebSocket, chrome-headless-shell only, own profile, tracked pids.
//
// Usage:
//   node tools/render/ghrox/dump_rox_scene.mjs --web /tmp/ox-a2/tree/web \
//     --table rasson_ox_9ft --out /tmp/ox-a2/dump/ours.json [--http 52100 --cdp 52101]
//     [--shots overhead,hero] [--width 1600 --height 1000]
// The served tree may be a SCRATCH copy of web/ carrying a locally rebaked
// wasm (this branch never rebakes the committed canonical wasm): the dump
// records the served dir, the kernel banner and the app's error rows so a
// mismatch is visible, not silent.
import fs from 'node:fs';
import { isRoxMain } from './lib/cli_rox.mjs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { checkRoxPorts, roxLoad, stopRoxProcesses, waitRoxHttp } from './runtime_rox.mjs';
import { censusTableAttributes } from './geometry_attributes_rox.mjs';
import { materialSlots } from './material_slots_rox.mjs';
import { benchmarkPocketCut } from './benchmark_pocket_cut_rox.mjs';
import { profileDirForPort } from '../../../web/tools/cdp.mjs';
// Ports: explicit argv, then the shared run-gate environment, then undeclared defaults.
import { normalizeRoxArgs } from './lib/ports_rox.mjs';
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http', '--cdp': 'cdp' };

// Imported by integration tools: one producer and one owned endpoint pair.
export async function dumpRoxScene(args) {
  const argv = normalizeRoxArgs(args, PORT_FLAGS, PORT_INVENTORY);
  const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const TABLE = argOf('--table', 'rasson_ox_9ft');
  const WEB = path.resolve(argOf('--web', 'web'));
  const OUT = path.resolve(argOf('--out', '/tmp/ox-a2/dump/ours.json'));
  const REPLAY_OUT = argOf('--replay-out', null);
  const FRAMES_FROM = argOf('--frames-from', null), FRAMES_OUT = argOf('--frames-out', null);
  const HTTP = Number(argOf('--port', process.env.OB_E2E_PORT || 52100));
  const CDP = Number(argOf('--cdp', process.env.OB_E2E_CDP_PORT || 52101));
  const W = Number(argOf('--width', 1600)), H = Number(argOf('--height', 1000));
  const SHOTS = String(argOf('--shots', 'overhead,hero')).split(',').filter(Boolean);
  const SHELL = process.env.HOME + '/.cache/puppeteer/chrome-headless-shell/mac_arm-151.0.7922.71/chrome-headless-shell-mac-arm64/chrome-headless-shell';
  const PROFILE = profileDirForPort(CDP); // the harness path for this port: its sweep and claim-time reap attribute it
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const URL_ = `http://127.0.0.1:${HTTP}/app.html?table=${TABLE}&cinema=1&seed=7&look=default&obtool=1`;
  const log = (...a) => console.error('[dump-rox]', ...a);
  let server = null, chrome = null, socket = null, profileOwned = false;
  const chromeStderr = [];
  const cleanup = async () => {
    if (socket) { try { socket.close(); } catch { /* closed by the child exit */ } socket = null; }
    stopRoxProcesses([chrome, server]);
    for (const [nm, p] of [['chrome', chrome], ['server', server]]) {
      log('cleanup', nm, 'pid', p && p.pid, 'exit', p && p.exitCode);
    }
    await sleep(300);
    if (profileOwned) fs.rmSync(PROFILE, { recursive: true, force: true });
    profileOwned = false;
  };
  const onSigint = async () => { await cleanup(); process.exit(130); };
  const onSigterm = async () => { await cleanup(); process.exit(143); };
  process.once('SIGINT', onSigint); process.once('SIGTERM', onSigterm);

  async function main() {
    await checkRoxPorts(HTTP, CDP);
    profileOwned = true; // Never clean a profile after a refused/occupied port check.
    const load = roxLoad('scene dump start');
    // Non-OX controls may serve main, which has no OX constructor to time.
    const buildTime = TABLE === 'rasson_ox_9ft'
      ? benchmarkPocketCut({ source: fs.readFileSync(path.join(WEB, 'scene/table.js'), 'utf8') }) : null;
    if (buildTime) log('POCKET_BUILD_TIME', JSON.stringify({ ...buildTime.row, cold: buildTime.cold }));
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.rmSync(PROFILE, { recursive: true, force: true });
    if (!fs.existsSync(path.join(WEB, 'app.html'))) throw new Error(`no app.html under ${WEB}`);
    server = spawn('python3', ['-m', 'http.server', '-d', WEB, '--bind', '127.0.0.1', String(HTTP)],
      { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
    server.stderr.on('data', () => {});
    await waitRoxHttp(server, HTTP);
    chrome = spawn(SHELL, [
      '--use-angle=metal', '--enable-features=WebShare', `--remote-debugging-port=${CDP}`,
      `--window-size=${W},${H}`, '--no-first-run', '--hide-scrollbars', '--disable-extensions', '--mute-audio',
      `--user-data-dir=${PROFILE}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
    chrome.stderr.on('data', chunk => chromeStderr.push(String(chunk)));
    log('server', server.pid, 'chrome', chrome.pid, 'web', WEB);
    let target = null;
    for (let i = 0; i < 100 && !target; i++) {
      await sleep(200);
      try { const j = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json(); target = j.find((t) => t.type === 'page'); } catch {}
    }
    if (!target) throw new Error('no CDP page target');
    const ws = new WebSocket(target.webSocketDebuggerUrl); socket = ws;
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map(); const consoleLines = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method === 'Runtime.consoleAPICalled') {
        consoleLines.push((m.params.args || []).map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' '));
      } else if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails || {}; const ex = d.exception || {};
        consoleLines.push('EXCEPTION ' + (ex.description || d.text || '') + ' @' + (d.url || '') + ':' + (d.lineNumber ?? '') + ':' + (d.columnNumber ?? ''));
      }
    };
    const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
    const evalJ = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval exception: ' + JSON.stringify(r.exceptionDetails).slice(0, 800));
      return r.result.value;
    };
    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    log('navigate', URL_);
    await send('Page.navigate', { url: URL_ });
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) { await sleep(200); ready = await evalJ('window.__test?.ready === true').catch(() => false); }
    if (!ready) { console.error('[dump-rox] console tail:\n' + consoleLines.slice(-25).join('\n')); throw new Error('app never became ready'); }
    let rig = null;
    for (let i = 0; i < 200; i++) {
      const st = await evalJ(`(() => { const s = window.__gi && window.__gi.state; return JSON.stringify({ giReady: s ? !!s.ready : null, baked: s ? !!s.baked : null, fits: s ? s.fits : null, fixture: s ? s.fixture : null, bakeClass: s ? s.bakeClass : null,
        exposure: window.__dbg && window.__dbg.renderer && window.__dbg.renderer.toneMappingExposure, toneMapping: window.__dbg && window.__dbg.renderer && window.__dbg.renderer.toneMapping }); })()`).catch(() => null);
      if (st) { rig = JSON.parse(st); if (rig.giReady && (rig.baked || rig.fits === false)) break; }
      await sleep(200);
    }
    log('rig', JSON.stringify(rig));
    await sleep(800);
    const errors = await evalJ(`(() => { const rows = Array.from(document.querySelectorAll('.err-msg')).map((e) => e.textContent); return JSON.stringify(rows); })()`);
    const kernel = consoleLines.find((l) => /kernel 0\\./.test(l)) || consoleLines.find((l) => /kernel/.test(l)) || '';
    async function exportScene(replay) {
      const info = JSON.parse(await evalJ(`(async () => {
        // Read the same shipping makeGeom().kernel object as the constructor replay.
        // activeTableId binds it to the rendered table, not the kernel-default TABLE mirror.
        const { makeGeom, activeTableId, buildTable } = await import('/scene/table.js');
        const geom = makeGeom(activeTableId());
        if (geom.id !== ${JSON.stringify(TABLE)}) throw new Error('KERNEL_EXPORT_REFUSED: rendered table ' + geom.id);
        let scene = window.__dbg.scene, table = null;
        if (${replay}) {
          const { createShared } = await import('/scene/shading.js');
          const room = await import('/scene/room.js');
          const shared = createShared({ lightPos: room.LIGHT_POS, roomMin: room.ROOM.min, roomMax: room.ROOM.max });
          // A new complete shipping construction, with no baseline meshes or metadata.
          table = buildTable({ shared, tableId: geom.id }).group;
          scene = table;
        } else scene.traverse((o) => { if (!table && o.name === 'obTable') table = o; });
        scene.updateMatrixWorld(true);
        const inTable = new Set(); if (table) table.traverse((o) => inTable.add(o));
        const list = []; const objs = [];
        scene.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          const nm = o.name || ''; const inT = inTable.has(o);
          if (!(nm.startsWith('dm-') || inT)) return;
          const g = o.geometry; const pos = g.getAttribute('position'); if (!pos) return;
          const mat = Array.isArray(o.material) ? o.material[0] : o.material;
          const slots = (${materialSlots.toString()})(o.material);
          let p = o.parent, anc = ''; while (p && p !== scene) { if (p.name) { anc = p.name; break; } p = p.parent; }
          objs.push(o);
          list.push({ i: objs.length - 1, name: nm, parent: (o.parent && o.parent.name) || '', ancestor: anc, inTable: inT,
            geomType: g.type, verts: pos.count, indexed: !!g.index, instanced: !!o.isInstancedMesh, instances: o.isInstancedMesh ? o.count : 1,
            visible: o.visible, matVisible: slots.every(m => m.visible), material_slots: slots,
            matName: (mat && mat.name) || '', matType: (mat && mat.type) || '',
            hex: (mat && mat.color && mat.color.getHexString) ? mat.color.getHexString() : '' });
        });
        window.__dumpObjs = objs;
        return JSON.stringify({ tableFound: !!table, tablePos: table ? [table.position.x, table.position.y, table.position.z] : null,
          tableId: (window.__test.equipment && window.__test.equipment()) || null, kernel: geom.kernel,
          attributeGate: (${censusTableAttributes.toString()})(table), list });
      })()`));
      log('table found', info.tableFound, 'meshes', info.list.length, 'errors', errors);
      log('ATTRIBUTE_GATE', info.attributeGate.passed ? 'PASS' : 'REFUSED',
        'meshes', info.attributeGate.meshCount, 'failed', info.attributeGate.failedMeshCount);
      for (const row of info.attributeGate.failures) log('ATTRIBUTE_REFUSED', row.name, JSON.stringify(row));
      const meshes = []; let totalTris = 0;
      for (const e of info.list) {
        const s = await evalJ(`(() => {
          const o = window.__dumpObjs[${e.i}]; const g = o.geometry; const pos = g.getAttribute('position');
          const out = []; const raw = []; const idx = [];
          const push = (M) => { for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            const world = [M[0]*x + M[4]*y + M[8]*z + M[12], M[1]*x + M[5]*y + M[9]*z + M[13], M[2]*x + M[6]*y + M[10]*z + M[14]];
            raw.push(...world); out.push(...world.map(v => +v.toFixed(6))); } };
          if (o.isInstancedMesh) { const tmp = new o.matrixWorld.constructor(); const im = new o.matrixWorld.constructor();
            for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, im); tmp.multiplyMatrices(o.matrixWorld, im); push(tmp.elements);
              if (g.index) { const off = k * pos.count; for (let j = 0; j < g.index.count; j++) idx.push(g.index.getX(j) + off); } } }
          else { push(o.matrixWorld.elements); if (g.index) for (let j = 0; j < g.index.count; j++) idx.push(g.index.getX(j)); }
          return JSON.stringify({ positions: out, raw_positions: raw, indices: idx });
        })()`);
        const d = JSON.parse(s);
        const tris = d.indices.length ? d.indices.length / 3 : d.positions.length / 9;
        totalTris += tris;
        meshes.push({ ...e, tris, positions: d.positions, raw_positions: d.raw_positions, indices: d.indices });
      }
      return { info, meshes, totalTris };
    }
    const { info, meshes, totalTris } = await exportScene(false);
    const frames = {};
    const poses = { overhead: { overhead: true }, hero: { cam: [1.95, -2.72, 1.18], look: [0, 0.10, -0.05], fov: 42 } };
    await evalJ(`(() => { const st = document.createElement('style'); st.textContent = 'body > :not(canvas) { display: none !important; }'; document.head.appendChild(st); return true; })()`).catch(() => {});
    for (const name of SHOTS) {
      const pose = poses[name]; if (!pose) continue;
      let ok = false; for (let i = 0; i < 30 && !ok; i++) { ok = await evalJ(`__test.cameraPose(${JSON.stringify(pose)})`).catch(() => false); if (!ok) await sleep(200); }
      await evalJ('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))'); await sleep(500);
      const captureLoad = roxLoad(name);
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      const file = OUT.replace(/\.json$/, '') + `-${name}.png`; fs.writeFileSync(file, Buffer.from(data, 'base64')); frames[name] = { pose, file, ok, load: captureLoad };
    }
    const doc = { units: 'm', up: 'Y', frame: 'three.js world of the app: x = kernel ky (along the LENGTH), y = height (bed cloth top = 0), z = kernel kx (across the WIDTH)',
      table: TABLE, served_web_dir: WEB, url: URL_, kernel: info.kernel, kernel_console: kernel, app_error_rows: JSON.parse(errors), rig, tableFound: info.tableFound, tableId: info.tableId,
      meshCount: meshes.length, totalTris, frames, meshes, load,
      source_sha256: createHash('sha256').update(fs.readFileSync(path.join(WEB, 'scene/table.js'))).digest('hex'),
      attribute_gate: info.attributeGate, build_time_benchmark: buildTime,
      webgl_draw_errors: chromeStderr.join('').split('\n').filter(line => /GL_INVALID_OPERATION|glDrawElements|Vertex buffer is not big enough/.test(line)) };
    const txt = JSON.stringify(doc); fs.writeFileSync(OUT, txt);
    log('wrote', OUT, 'meshes', meshes.length, 'tris', totalTris, 'sha256', createHash('sha256').update(txt).digest('hex').slice(0, 16), kernel);
    // Retain the refused dump and its full census as evidence, but never report
    // a successful dump when WebGL cannot address the table's vertex buffers.
    if (!info.attributeGate.passed) throw new Error('ATTRIBUTE_GATE_REFUSED: ' +
      (info.attributeGate.failures.map(row => row.name).join(', ') || 'missing/empty built table'));
    if (FRAMES_FROM || FRAMES_OUT) {
      if (!FRAMES_FROM || !FRAMES_OUT) throw new Error('both --frames-from and --frames-out required');
      if (fs.existsSync(FRAMES_OUT)) throw new Error('refuse frames overwrite');
      const template = JSON.parse(fs.readFileSync(FRAMES_FROM, 'utf8')), captures = [];
      if (template.viewport.width !== W || template.viewport.height !== H) throw new Error('frame viewport mismatch');
      const registered = template.captures.filter(f => /^[1-6]$/.test(f.preset));
      if (registered.length !== 6 || new Set(registered.map(f => f.preset)).size !== 6) throw new Error('six camera presets required');
      for (const entry of registered) {
        const pose = { cam: [entry.pose.pos[2], entry.pose.pos[0], entry.pose.pos[1]],
          look: [entry.pose.target[2], entry.pose.target[0], entry.pose.target[1]],
          fov: 2 * Math.atan(1 / entry.projection[5]) * 180 / Math.PI };
        let applied = false;
        for (let i = 0; i < 30 && !applied; i++) {
          applied = await evalJ(`__test.cameraPose(${JSON.stringify(pose)})`); if (!applied) await sleep(200);
        }
        if (!applied) throw new Error('camera pose refused');
        const actual = await evalJ(`(() => { const c = window.__dbg.camera; c.updateMatrixWorld(true);
          return { matrixWorld: c.matrixWorld.toArray(), projection: c.projectionMatrix.toArray() }; })()`);
        captures.push({ preset: entry.preset, pose: { pos: actual.matrixWorld.slice(12, 15),
          target: [pose.look[1], pose.look[2], pose.look[0]], fov: pose.fov }, ...actual });
      }
      fs.writeFileSync(FRAMES_OUT, JSON.stringify({ source_sha256: doc.source_sha256, viewport: { width: W, height: H },
        camera_template: path.resolve(FRAMES_FROM), captures }, null, 2) + '\n');
    }
    if (REPLAY_OUT) {
      if (fs.existsSync(REPLAY_OUT)) throw new Error('refuse replay overwrite');
      const replay = await exportScene(true);
      if (!replay.info.attributeGate.passed) throw new Error('REPLAY_ATTRIBUTE_GATE_REFUSED');
      fs.writeFileSync(REPLAY_OUT, JSON.stringify({ units: doc.units, up: doc.up, frame: doc.frame,
        table: TABLE, kernel: replay.info.kernel, meshes: replay.meshes, meshCount: replay.meshes.length,
        totalTris: replay.totalTris, source_sha256: doc.source_sha256, attribute_gate: replay.info.attributeGate,
        constructor_replay: { full_scene: true, source: 'served scene/table.js buildTable', inherited_meshes: 0 } }));
    }
    if (buildTime && !buildTime.passed) throw new Error('POCKET_BUILD_TIME_REFUSED: ' + JSON.stringify(buildTime.row));
    return doc;
  }
  try { return await main(); } finally {
    process.removeListener('SIGINT', onSigint); process.removeListener('SIGTERM', onSigterm);
    await cleanup();
  }
}

if (isRoxMain(import.meta.url)) {
  dumpRoxScene(process.argv.slice(2)).then(() => process.exit(0)).catch(error => {
    console.error('[dump-rox] FAILED', error.message); process.exit(1);
  });
}
