// Copyright (c) Meta Platforms, Inc. and affiliates.

// O22 supplementary byte fence: every geometry attribute/index/instance buffer
// and world matrix, SHA256 with no rounding. Material identity remains the
// standing meshident-488d instrument's separate, unchanged responsibility.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from '../../../../web/tools/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--web', '--out', '--tables'].includes(args[i]) || !args[i + 1]) throw new Error('usage: --web DIR --out FILE --tables comma,list');
  options[args[i]] = args[i + 1];
}
if (!options['--web'] || !options['--out'] || !options['--tables']) throw new Error('all three arguments are required');
if (fs.existsSync(path.join(ROOT, '.git'))) throw new Error('run from a git archive');
const web = path.resolve(options['--web']);
const http = Number(process.env.OB_E2E_PORT), cdp = Number(process.env.OB_E2E_CDP_PORT);
if (!http || !cdp) throw new Error('pin the lane HTTP and CDP ports explicitly');

const READ = `(async () => {
  const tableModule = await import('./scene/table.js');
  const active = tableModule.activeTableId();
  const scene = window.__dbg.scene;
  scene.updateMatrixWorld(true);
  let table;
  scene.traverse((o) => { if (o.name === 'obTable') table = o; });
  if (!table) throw new Error('no obTable');
  const hash = async (array) => {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
  };
  const attr = async (a) => {
    const buffer = a.isInterleavedBufferAttribute ? a.data.array : a.array;
    return { type: buffer.constructor.name, count: a.count, itemSize: a.itemSize,
      normalized: a.normalized, stride: a.data?.stride ?? null, offset: a.offset ?? null,
      bytes: buffer.byteLength, sha256: await hash(buffer) };
  };
  const objects = [];
  table.traverse((o) => { if (o.isMesh && o.geometry) objects.push(o); });
  const meshes = [];
  for (const o of objects) {
    const g = o.geometry, attributes = {}, morph = {};
    for (const key of Object.keys(g.attributes).sort()) attributes[key] = await attr(g.attributes[key]);
    for (const key of Object.keys(g.morphAttributes).sort()) morph[key] = await Promise.all(g.morphAttributes[key].map(attr));
    meshes.push({ name: o.name, parent: o.parent?.name ?? '', attributes, morph,
      index: g.index ? await attr(g.index) : null,
      matrix_world_sha256: await hash(new Float64Array(o.matrixWorld.elements)),
      instances: o.isInstancedMesh ? { count: o.count, matrix: await attr(o.instanceMatrix),
        color: o.instanceColor ? await attr(o.instanceColor) : null } : null,
      groups: g.groups, draw_range: { start: g.drawRange.start, count: String(g.drawRange.count) },
      morph_relative: g.morphTargetsRelative, morph_influences: o.morphTargetInfluences ?? null });
  }
  return JSON.stringify({ active, meshes });
})()`;

const records = [];
const server = spawnStaticServer(web, http);
await sleep(800); // TESSELLATION: existing lane-tool server warm-up, not a geometry value.
try {
  for (const id of options['--tables'].split(',')) {
    let chrome;
    const loadBefore = os.loadavg();
    try {
      chrome = await launchChrome(`http://127.0.0.1:${http}/app.html?table=${id}&cinema=1&seed=7&look=default`,
        { port: cdp, width: 900, height: 600 }); // TESSELLATION: match the standing identity viewport.
      let ready = false;
      for (let poll = 0; poll < 300 && !ready; poll++) {
        await sleep(200);
        ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
      }
      if (!ready) throw new Error('app not ready');
      // DERIVED: use the existing offline-render drain seam. Cold snooker
      // transport attaches aOccl asynchronously after __test.ready; hashing
      // before that drain compares different boot phases, not two tables.
      await chrome.eval('(window.__snkOccl?.flush?.(), true)');
      let settled = false;
      for (let poll = 0; poll < 200 && !settled; poll++) {
        await sleep(200);
        settled = await chrome.eval('!!(window.__gi?.state?.ready && window.__gi?.state?.baked)');
      }
      if (!settled) throw new Error('GI did not settle after the transport drain');
      // NOTE-CENSUS-SETTLE (2026-09-09): attribute + index versions still for >= 3 reads (cap 30 s, refuse by name)
      const SETTLE_SIG = "(() => {\n  const scene = window.__dbg && window.__dbg.scene; if (!scene) return 'noscene';\n  const sig = [];\n  scene.traverse((o) => {\n    if (!o.isMesh || !o.geometry) return; const g = o.geometry;\n    for (const k of Object.keys(g.attributes).sort()) { const a = g.attributes[k]; sig.push((o.name || '(anon)') + ':' + k + ':' + a.version + ':' + a.count); }\n    if (g.index) sig.push((o.name || '(anon)') + ':index:' + g.index.version + ':' + g.index.count);\n    sig.push((o.name || '(anon)') + ':attrs:' + Object.keys(g.attributes).sort().join(','));\n  });\n  return sig.join('|');\n})()";
      const attrSettle = await (async () => {
        const t0 = Date.now(); let prev = null, still = 0, reads = 0, changes = 0, lastDiff = [];
        while (Date.now() - t0 < 30000) {
          const sig = await chrome.eval(SETTLE_SIG); reads++;
          if (sig === prev) still++; else { if (prev !== null) { changes++; const A = new Set(prev.split('|')), B = new Set(sig.split('|')); lastDiff = [...B].filter((x) => !A.has(x)).slice(0, 8); } still = 0; prev = sig; }
          if (still >= 2) return { reads, seconds: Math.round((Date.now() - t0) / 100) / 10, changes, entries: prev.split('|').length };
          await sleep(250);
        }
        throw new Error(`attribute census did not settle within 30 s (${changes} changes; last movers: ${lastDiff.join(', ') || '?'})`);
      })();
      const record = JSON.parse(await chrome.eval(READ));
      if (record.active !== id || !record.meshes.length) throw new Error(`capture starved or wrong table ${id}`);
      const digest = createHash('sha256').update(JSON.stringify(record.meshes)).digest('hex');
      records.push({ id, ...record, sha256: digest, transport_drain: 'existing __snkOccl.flush seam', gi_settled: settled, attr_settle: attrSettle,
        load_average: { before: loadBefore, after: os.loadavg() } });
      console.log(`[bytes] ${id} ${record.meshes.length} meshes ${digest}; load=${JSON.stringify(os.loadavg())}`);
    } finally {
      if (chrome && await chrome.closeAndWait() === false) throw new Error('Chrome teardown unconfirmed');
    }
  }
} finally {
  await stopStaticServer(server);
}
fs.mkdirSync(path.dirname(path.resolve(options['--out'])), { recursive: true });
fs.writeFileSync(options['--out'], JSON.stringify({ tool: 'mesh_bytes_621',
  table_js_sha256: createHash('sha256').update(fs.readFileSync(path.join(web, 'scene/table.js'))).digest('hex'),
  web, tables: records }, null, 2) + '\n'); // TESSELLATION: evidence JSON formatting.
