// Copyright (c) Meta Platforms, Inc. and affiliates.

// DERIVED: execute the existing GH-628(3) assertion block verbatim, in the
// real app for each ordered size. No duplicate thresholds or weakened copy.
// This is the requested focused block, not a claim that all e2e-lighting passes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from '../../../../web/tools/cdp.mjs';

// DERIVED: one server and one serially reused CDP port, not one per table.
export const PORT_INVENTORY = { http: 1, cdp: 1 };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const args = process.argv.slice(2); // DERIVED: executable and script.
const arg = (key) => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
const web = path.resolve(arg('--web') || path.join(root, 'web'));
const out = arg('--out');
assert(out, '--out is required');
const http = Number(process.env.OB_E2E_PORT), cdp = Number(process.env.OB_E2E_CDP_PORT);
assert(Number.isInteger(http) && Number.isInteger(cdp), 'both lane ports must be explicitly pinned');
console.log(`PORT_INVENTORY e2e_cushion_628_3.mjs http=${PORT_INVENTORY.http} cdp=${PORT_INVENTORY.cdp}; OB_E2E_PORT=${http} OB_E2E_CDP_PORT=${cdp}`);
const sourcePath = path.join(root, 'web/tools/e2e-lighting.mjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const first = '      const mirror = await chrome.eval(`(async () => {';
const last = '      // T5 (round-6):';
const start = source.indexOf(first), end = source.indexOf(last, start);
assert(start >= 0 && end > start && source.indexOf(first, start + 1) < 0,
  'the original GH-628(3) block must be present exactly once');
const block = source.slice(start, end);
const AsyncFunction = Object.getPrototypeOf(async function run() {}).constructor;
const runOriginal = new AsyncFunction('chrome', 'fail', 'console', block + '\nreturn mirror;');
const report = { tool: 'e2e_cushion_628_3', scope: 'original GH-628(3) block only', web,
  port_inventory: PORT_INVENTORY, ports: { http, cdp },
  source: 'web/tools/e2e-lighting.mjs', source_sha256: createHash('sha256').update(source).digest('hex'),
  executed_block_sha256: createHash('sha256').update(block).digest('hex'), tables: [], teardowns: [] };
const server = spawnStaticServer(web, http);
try {
  await sleep(700); // CLEARANCE: the existing lighting harness's server startup allowance.
  for (const size of ['9ft', '8ft', '7ft']) {
    const table = `diamond_proam_${size}`;
    const errors = [], messages = [], loadBefore = os.loadavg();
    const chrome = await launchChrome(`http://127.0.0.1:${http}/app.html?table=${table}&cinema=1&seed=7`, { port: cdp });
    try {
      let ready = false;
      for (let attempt = 0; attempt < 300 && !ready; attempt++) { // CLEARANCE: existing table gate readiness budget.
        await sleep(200); // CLEARANCE: existing readiness polling interval, not a geometry tolerance.
        ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
      }
      assert(ready, `${table}: app not ready`);
      await sleep(1800); // CLEARANCE: unchanged e2e-lighting asynchronous import settle.
      const mirror = await runOriginal(chrome, (message) => errors.push(message),
        { log: (...parts) => messages.push(parts.join(' ')) });
      assert.equal(mirror?.id, table, 'the live scene must actually be the requested table');
      assert(mirror.ring, 'the ordered ring entry must exercise its ring assertions');
      report.tables.push({ table, pass: errors.length === 0, errors, messages, mirror,
        load_average: { before: loadBefore, after: os.loadavg() } });
      console.log(JSON.stringify(report.tables.at(-1)));
    } finally {
      // DERIVED: the tracked PID must release its port and profile before
      // the next size boots; a signal alone is not confirmed teardown.
      const teardown = { table, pid: chrome.pid, confirmed: false };
      report.teardowns.push(teardown);
      try {
        teardown.confirmed = await chrome.closeAndWait() === true;
      } catch (error) {
        teardown.error = error.message;
      }
      if (!teardown.confirmed) {
        const message = `CHROME_TEARDOWN_UNCONFIRMED ${table} pid=${chrome.pid}; REFUSE next size`
          + (teardown.error ? `: ${teardown.error}` : '');
        console.error(message);
        throw new Error(message);
      }
      console.log(`CHROME_TEARDOWN_CONFIRMED ${table} pid=${chrome.pid}`);
    }
  }
} finally {
  await stopStaticServer(server);
  report.pass = report.tables.length === 3 && report.tables.every((table) => table.pass)
    && report.teardowns.length === report.tables.length
    && report.teardowns.every((teardown) => teardown.confirmed); // DERIVED: all ordered sizes and teardowns required.
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); // TESSELLATION: JSON layout.
}
process.exitCode = report.pass ? 0 : 3; // DERIVED: standing assertion-failure exit code.
