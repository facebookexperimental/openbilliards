// Copyright (c) Meta Platforms, Inc. and affiliates.

// ORDER-ROX-A4 §7: one lane-owned Chrome at a time, ports from the shared registry,
// exact-PID cleanup (including a python3 launcher's interpreter child), capture load recorded.
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import { assertPortOutsideForeignBands, claimPortBand } from '../../../web/tools/cdp.mjs';
import { declaredBands, loadCiBands, loadLaneBands, pinRefusal } from '../../../web/tools/lib/ci-bands.mjs';
import { holdRoxPortHome } from './lib/ports_rox.mjs';

export const PORT_INVENTORY = { http: 0, cdp: 0 };
const claims = [];

export async function checkRoxPorts(http, cdp) {
  if (http === cdp || [http, cdp].some((p) => !Number.isInteger(p) || p < 1024 || p > 65535)) {
    throw new Error(`ROX_PORT_REFUSED: distinct unprivileged TCP ports required: ${http}/${cdp}`);
  }
  const ci = loadCiBands(), lanes = loadLaneBands(undefined, ci), declared = declaredBands(ci, lanes);
  const acquired = [], homes = [];
  try {
    // Shared pending holds prove ownership and bridge validation to reservation.
    // Bare defaults use undeclared space; another lane fails in the shared law.
    for (const [role, port] of [['http', http], ['cdp', cdp]]) {
      assertPortOutsideForeignBands(port, `rox ${role}`);
      const home = holdRoxPortHome(port, declared); homes.push(home);
      const reason = pinRefusal(ci, lanes, { key: `--${role}`, value: port, role,
        range: { start: port, end: port } }, home);
      if (reason) throw new Error(`ROX_PORT_REFUSED: ${reason}`);
    }
    for (const port of [http, cdp]) {
      acquired.push(await claimPortBand(port, port, { layout: false }));
      await new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', reject);
        probe.listen(port, '127.0.0.1', () => probe.close(resolve));
      });
    }
    claims.push(...acquired);
  } catch (error) {
    for (const claim of acquired) claim.release();
    throw error;
  } finally {
    for (const home of homes) home.release();
  }
}

export function roxLoad(label) {
  const sample = { label, at: new Date().toISOString(), loadavg: os.loadavg() };
  console.error('[rox-load]', JSON.stringify(sample));
  return sample;
}

export async function waitRoxHttp(server, http, { fetcher = fetch, delay = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  // One fixed 800-ms sleep was not a readiness test under concurrent lane load.
  // Poll only our already port-checked server; no Chrome is launched before success.
  const started = Date.now(); let probe = null, lastError = null;
  for (let attempt = 0; attempt < 100 && !probe; attempt++) {
    if (server.exitCode !== null) throw new Error('owned static server exited ' + server.exitCode);
    try { probe = await fetcher(`http://127.0.0.1:${http}/app.html`, { signal: AbortSignal.timeout(1000) }); }
    catch (error) { lastError = error; await delay(100); }
    if (Date.now() - started > 10000) break;
  }
  if (!probe?.ok) throw new Error('static server probe failed: ' + (probe?.status ?? lastError?.message));
  console.error('[rox-http] owned server ready', Date.now() - started, 'ms');
}

export function stopRoxProcesses(children) {
  try { stopOwnedProcesses(children); }
  finally { for (const claim of claims.splice(0)) claim.release(); }
}

function stopOwnedProcesses(children) {
  const roots = children.filter((p) => p && p.pid && p.exitCode === null).map((p) => p.pid);
  if (!roots.length) return;
  // Snapshot ancestry BEFORE terminating the launched parents. No name-based or process-group kill.
  const processes = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' })
    .trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number));
  const owned = new Set(roots);
  let added;
  do {
    added = false;
    for (const [pid, parent] of processes) {
      if (owned.has(parent) && !owned.has(pid)) { owned.add(pid); added = true; }
    }
  } while (added);
  for (const pid of owned) {
    try { process.kill(pid, 'SIGKILL'); console.error('[rox-cleanup] owned pid', pid); }
    catch (e) { if (e.code !== 'ESRCH') throw e; }
  }
}
