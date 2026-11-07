// Copyright (c) Meta Platforms, Inc. and affiliates.

// probe-488p-tree.mjs — dump the LIVE predator_apex_9ft scene-graph mesh
// inventory (name, material class/color, triangle count, world AABB) so the
// A2 modeling loop reasons about the mesh that actually renders, not about
// what the source *looks* like it builds. Fork-local to the 488P lane.
//
//   node tools/render/probe-488p-tree.mjs [> /tmp/ob488p/tree.json]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
} from '../../web/tools/cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '../../web');
const band = await claimPortBand(23760, 23789);
const PORT = band.http(0); const CDPP = band.cdp(0);
const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?table=predator_apex_9ft&cinema=1&seed=7&look=default`,
  { port: CDPP, width: 900, height: 600 });
try {
  let ready = false;
  for (let i = 0; i < 220 && !ready; i++) {
    await sleep(200);
    ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
  }
  if (!ready) throw new Error('app never ready');
  await sleep(2500);
  const json = await chrome.eval(`(() => {
    const rows = [];
    // world AABB computed by hand: the page module namespace is not exposed,
    // so THREE.Box3 is out of reach from a CDP eval
    const worldBB = (o, pos) => {
      const e = o.matrixWorld.elements;
      const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
        const w = e[3] * x + e[7] * y + e[11] * z + e[15] || 1;
        const v = [
          (e[0] * x + e[4] * y + e[8] * z + e[12]) / w,
          (e[1] * x + e[5] * y + e[9] * z + e[13]) / w,
          (e[2] * x + e[6] * y + e[10] * z + e[14]) / w,
        ];
        for (let k = 0; k < 3; k++) {
          if (v[k] < bb[k]) bb[k] = v[k];
          if (v[k] > bb[k + 3]) bb[k + 3] = v[k];
        }
      }
      return bb;
    };
    window.__dbg.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry;
      const pos = g.getAttribute('position');
      if (!pos) return;
      o.updateWorldMatrix(true, false);
      const B = worldBB(o, pos);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const idx = g.getIndex();
      rows.push({
        name: o.name || '(anon)',
        parent: (o.parent && o.parent.name) || '',
        tris: Math.round((idx ? idx.count : pos.count) / 3),
        geo: g.type,
        mat: mats.map((m) => (m ? [
          m.type,
          m.color && m.color.getHexString ? m.color.getHexString() : '',
          m.userData && m.userData.obClass ? m.userData.obClass : '',
        ].join('|') : 'null')),
        bb: B.map((v) => Number(v.toFixed(5))),
        vis: o.visible,
      });
    });
    return JSON.stringify(rows);
  })()`);
  process.stdout.write(`${json}\n`);
} finally {
  const gone = await chrome.closeAndWait();
  if (gone === false) throw new Error('chrome teardown unconfirmed');
  await stopStaticServer(server);
  band.release();
}
