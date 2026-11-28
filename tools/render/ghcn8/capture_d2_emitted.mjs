// Copyright (c) Meta Platforms, Inc. and affiliates.

// Actual scene emission for the D2 contract check. Run only through run-gate.
// The private triangle dump is this project's generated geometry, not purchased input.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launchChrome, spawnStaticServer, stopStaticServer, sleep } from '../../../web/tools/cdp.mjs';
import { capturePorts } from './d2_capture_options.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = {};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  if (!process.argv[i + 1]?.trim() || process.argv[i + 1].startsWith('--')) throw new Error(`${name} requires a value`);
  return process.argv[i + 1];
};
const web = path.resolve(arg('--web', path.join(root, 'web')));
const out = arg('--out', null);
if (!out) throw new Error('--out is required');
const { http, cdp } = capturePorts(process.env);
fs.mkdirSync(out, { recursive: true });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const tableSha = sha(fs.readFileSync(path.join(web, 'scene/table.js')));
const origin = `http://127.0.0.1:${http}`;
let server, chrome, cleaning;
async function cleanup() {
  if (cleaning) return cleaning;
  cleaning = (async () => {
    const browserGone = !chrome || await chrome.closeAndWait();
    const serverGone = !server || await stopStaticServer(server);
    fs.writeFileSync(path.join(out, 'cleanup.json'), JSON.stringify({ browserGone, serverGone, http, cdp }, null, 2) + '\n');
    if (!browserGone || !serverGone) process.exitCode = 2;
  })();
  return cleaning;
}
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.on(signal, async () => { await cleanup(); process.exit(code); });
try {
  server = spawnStaticServer(web, http);
  await sleep(500);
  const served = Buffer.from(await (await fetch(`${origin}/scene/table.js`)).arrayBuffer());
  if (sha(served) !== tableSha) throw new Error('Served table.js differs from the selected tree');
  chrome = await launchChrome(`${origin}/app.html?table=chinese8_pro_9ft&cinema=1&seed=7&look=default&obtool=1`, { port: cdp });
  const tables = [];
  for (const table of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    await chrome.send('Page.navigate', { url: `${origin}/app.html?table=${table}&cinema=1&seed=7&look=default&obtool=1` });
    const deadline = Date.now() + 60000; // Harness deadline, not a model dimension.
    let ready = false;
    while (Date.now() < deadline) {
      ready = await chrome.eval(`(async () => window.__test?.ready === true &&
        (window.__dbg?.scene?.getObjectByName('obTable')?.userData.tableId ??
          (await import('/scene/table.js')).activeTableId()) === ${JSON.stringify(table)})()`).catch(() => false);
      if (ready) break;
      await sleep(200);
    }
    if (!ready) throw new Error(`Table did not become ready: ${table}`);
    console.log(`[cn8-d2-emitted] ${table}: ready; reading mesh metadata`);
    const result = await chrome.eval(`(async () => {
      const scene = window.__dbg.scene; scene.updateMatrixWorld(true);
      const group = scene.getObjectByName('obTable');
      if (!group) throw new Error('No emitted obTable');
      // A URL-selected renderer can precede the rack equipment template.
      // Read its public table identity, not the kernel's default rack ID.
      const built = group.userData.tableId ?? (await import('/scene/table.js')).activeTableId();
      const hash = async (a) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(a.buffer, a.byteOffset, a.byteLength)))).map((x) => x.toString(16).padStart(2, '0')).join('');
      const objects = []; group.traverse((o) => { if (o.isMesh) objects.push(o); });
      // Keep references in this page, not a single expanded triangle payload.
      // D3 has more samples; transferring all triangles together can close
      // the CDP socket before the caller receives its first table receipt.
      window.__cn8EmissionObjects = objects;
      const meshes = [], dumpMeshIndices = [];
      for (let ordinal = 0; ordinal < objects.length; ordinal++) {
        const o = objects[ordinal];
        const g = o.geometry, p = g.getAttribute('position');
        if (!p) continue;
        const attrs = {};
        for (const [name, attr] of Object.entries(g.attributes)) attrs[name] = { count: attr.count, itemSize: attr.itemSize, sha256: await hash(attr.array) };
        const userData = {};
        for (const key of ['cn8D3', 'cn8D2', 'cn8Fillet']) if (o.userData[key] !== undefined) userData[key] = o.userData[key];
        meshes.push({ name: o.name, userData, attributes: attrs, index_sha256: g.index ? await hash(g.index.array) : null });
        if (o.name.startsWith('cn8')) dumpMeshIndices.push(ordinal);
      }
      return { built_table: built, identity_source: group.userData.tableId ? 'emitted obTable beacon' : 'renderer activeTableId() (pre-731)', meshes, dumpMeshIndices };
    })()`);
    if (result.built_table !== table) throw new Error(`Requested ${table}; emitted ${result.built_table}`);
    const dump = [];
    for (const ordinal of result.dumpMeshIndices) {
      const row = await chrome.eval(`(() => {
        const o = window.__cn8EmissionObjects[${ordinal}];
        const g = o.geometry, p = g.getAttribute('position');
        const m = o.matrixWorld.elements, positions = [], indices = g.index ? Array.from(g.index.array) : [];
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          positions.push(m[0]*x + m[4]*y + m[8]*z + m[12], m[1]*x + m[5]*y + m[9]*z + m[13], m[2]*x + m[6]*y + m[10]*z + m[14]);
        }
        return { name: o.name, positions, indices, indexed: g.index !== null };
      })()`);
      // Expand the exact captured indices on the host; geometry values are
      // neither sampled nor regenerated here. Non-indexed meshes retain order.
      const tris = [];
      for (let j = 0; j < (row.indexed ? row.indices.length : row.positions.length / 3); j++) {
        const i = (row.indexed ? row.indices[j] : j) * 3;
        tris.push(row.positions[i], row.positions[i + 1], row.positions[i + 2]);
      }
      dump.push({ name: row.name, positions: row.positions, indices: row.indices, tris });
    }
    await chrome.eval('delete window.__cn8EmissionObjects');
    fs.writeFileSync(path.join(out, `${table}-triangles.json`), JSON.stringify({ table, table_sha256: tableSha,
      meshes: dump.map(({ name, tris }) => ({ name, tris })) }));
    fs.writeFileSync(path.join(out, `${table}-positions.json`), JSON.stringify({ table, table_sha256: tableSha,
      meshes: dump.map(({ name, positions, indices }) => ({ name, positions, indices })) }));
    delete result.dumpMeshIndices;
    tables.push({ table, ...result });
    console.log(`[cn8-d2-emitted] ${table}: ${result.meshes.length} meshes, served table.js ${tableSha}`);
  }
  if (sha(fs.readFileSync(path.join(web, 'scene/table.js'))) !== tableSha) throw new Error('Source changed during capture');
  fs.writeFileSync(path.join(out, 'emitted.json'), JSON.stringify({ table_sha256: tableSha, tables }, null, 2) + '\n');
} finally { await cleanup(); }
