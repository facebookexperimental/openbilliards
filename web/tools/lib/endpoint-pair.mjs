// Copyright (c) Meta Platforms, Inc. and affiliates.

// Endpoint reservations for tools that pick their own ports (GH-725 review r10 P2 (a) / (b)).
//
// ONE allocator for every tool that reserves an endpoint from a window (scenario-batch's slot pairs and its gate
// pair, scenario-titlecard's blank-server and card-session ports): a candidate is CLAIMED in the GH-338 registry
// (single-port, layout:false), fenced by an atomic mkdir lock dir against concurrent runs of the same tool, and
// probed free (an http answer = occupied). Two rules this module owns:
//   (a) a PAIR is allocated, leased and released as ONE unit — reserveEndpointPair returns both endpoints or
//       nothing: a failure after the first reservation releases it (claim + lock dir) before the error propagates;
//       spawnLeased pends holds for BOTH endpoints across the spawn gap and leases the child into BOTH claims;
//       process-exit cleanup removes every lock dir this process created (SIGINT/SIGTERM/SIGHUP → exit via the
//       cdp.mjs signal reaper). Before r10 scenario-batch reserved cdp then http and leaked the cdp claim + its
//       lock dir when the http scan failed; runChild leased only the cdp port.
//   (b) a candidate scan SKIPS every endpoint this process already holds — its live reservations, the layout /
//       override pins in the env, and anything a caller registers with noteHeld (an owned http server, a rotation
//       window) — and continues; the exhaustion error names the window and the held ports. Before r10 the http
//       scan hit the reserved cdp port and the derived-endpoint assertion (≠ base) aborted the batch.
// The lock-dir root is OB_CDP_LOCK_DIR (default /tmp) so the battery can run this module against a fake lock dir
// and a private registry (OB_PORT_BANDS_DIR); lock names keep their historic forms (`ob-cdp-port-<p>.lock`,
// `ob-titlecard-port-<p>.lock`) so a checkout on main and one on this branch still exclude each other.
import fs from 'node:fs';
import path from 'node:path';
import {
  assertDerivedEndpoint, claimPortBand, installSignalReaper, leaseEndpointIntoOwnClaims, pendIntoOwnClaims,
} from '../cdp.mjs';

export const DEFAULT_TRIES = 40; // the lint's base-pin span reader models reserveEndpoint / reserveEndpointPair with this window (ci-bands.mjs)
export const lockRoot = () => process.env.OB_CDP_LOCK_DIR ?? '/tmp';
export const lockDirFor = (port, family = 'cdp') => path.join(lockRoot(), `ob-${family}-port-${port}.lock`);

const createdLocks = new Set();   // lock dirs this process created and still owns
const reservations = new Map();   // port → { family, base }: this process's live reservations
const noted = new Map();          // key → { start, end, why }: endpoints a caller registered as held
let exitHookInstalled = false;
function installExitCleanup() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  installSignalReaper(); // SIGINT / SIGTERM / SIGHUP → process.exit → the 'exit' hook below
  process.on('exit', () => { for (const d of createdLocks) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* gone */ } } });
}
/** Register an endpoint (or a range) this process owns outside the allocator — an owned http server, a claimed
 * rotation window — so every later scan skips it. Returns a function that forgets it. */
export function noteHeld(portOrRange, why = 'held') {
  const r = typeof portOrRange === 'number' ? { start: portOrRange, end: portOrRange } : { start: Number(portOrRange.start), end: Number(portOrRange.end) };
  const key = `${r.start}-${r.end}:${why}`;
  noted.set(key, { ...r, why });
  return () => { noted.delete(key); };
}
/** Why `port` is held by this process right now, or null: a live reservation, a noted endpoint, or a pin in the
 * env (OB_E2E_PORT / OB_E2E_CDP_PORT layout pins, the OB_CDP_PORT override). */
export function heldReason(port, env = process.env) {
  const p = Number(port);
  const r = reservations.get(p);
  if (r) return `reserved ${r.family} endpoint of this process`;
  for (const n of noted.values()) if (p >= n.start && p <= n.end) return n.why;
  for (const name of ['OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT']) {
    if (env[name] !== undefined && env[name] !== '' && Number(env[name]) === p) return `the ${name} pin`;
  }
  return null;
}
export const isHeld = (port, env = process.env) => heldReason(port, env) !== null;
/** Every endpoint this process holds right now (for messages and the exhaustion error). */
export function heldEndpoints(env = process.env) {
  const out = new Map();
  for (const [p, r] of reservations) out.set(p, `reserved ${r.family}`);
  for (const n of noted.values()) for (let p = n.start; p <= n.end; p++) if (!out.has(p)) out.set(p, n.why);
  for (const name of ['OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT']) {
    const v = Number(env[name]); if (env[name] !== undefined && env[name] !== '' && Number.isFinite(v) && !out.has(v)) out.set(v, name);
  }
  return out;
}
// #763: a candidate is free ONLY on ECONNREFUSED. fetch initialises lazily on its first call, and that cost used to run
// inside the first candidate's 400 ms timer: under load a FREE port timed out, was skipped as unresponsive and the pair
// shifted by one (hygiene 8o; measured 2026-10-15: 38 of 41 probes over 100 ms were a process's first fetch). The
// default probe now warms fetch once per process (one request to the first claimed and locked candidate, its result
// ignored) right before the first timed probe, and a probe that times out gets one longer look before the candidate
// is skipped.
export const PROBE_MS = 400;
export const PROBE_RETRY_MS = 2000;
const httpProbe = async (p, ms = PROBE_MS) => { await fetch(`http://127.0.0.1:${p}/`, { signal: AbortSignal.timeout(ms) }); };
let fetchWarm = null;
const warmFetch = (p) => (fetchWarm ??= fetch(`http://127.0.0.1:${p}/`, { signal: AbortSignal.timeout(PROBE_RETRY_MS) }).then(() => {}, () => {}));
const timedOut = (e) => e?.name === 'TimeoutError' || e?.name === 'AbortError';
/** 'free' (ECONNREFUSED) | 'occupied' (an http answer) | 'unresponsive' (a timeout twice, or any other error) */
async function probeVerdict(probe, p) {
  for (const ms of [PROBE_MS, PROBE_RETRY_MS]) {
    try { await probe(p, ms); return 'occupied'; } catch (e) {
      if (e?.cause?.code === 'ECONNREFUSED') return 'free';
      if (!(timedOut(e) && ms === PROBE_MS)) return 'unresponsive'; // one longer look after a first timeout, no more
    }
  }
  return 'unresponsive';
}

/** Reserve ONE endpoint from [base, base + tries): held candidates are skipped, every other candidate is validated
 * (spec → assertDerivedEndpoint, cdp.mjs), claimed, lock-fenced and probed. Returns { port, release, lock }; throws
 * only when the window is exhausted, naming the window and the held endpoints skipped. */
export async function reserveEndpoint(base, tries = DEFAULT_TRIES, spec = null, { family = 'cdp', probe = httpProbe } = {}) {
  installExitCleanup();
  try { fs.mkdirSync(lockRoot(), { recursive: true }); } catch { /* exists */ }
  const skipped = [];
  for (let p = base; p < base + tries; p++) {
    const why = heldReason(p);
    if (why !== null) { skipped.push(`${p} (${why})`); continue; } // (b): a held endpoint is skipped, never asserted against
    if (spec) assertDerivedEndpoint(p, { ...spec, expr: `${spec.expr} + ${p - base}` }); // GH-725 review r9 P2-1: validated or refused by name
    let bandClaim;
    try { bandClaim = await claimPortBand(p, p, { layout: false }); } catch (e) {
      if (!/overlaps the LIVE foreign claim|lost the claim race/.test(e.message)) throw e; // only a genuine range conflict advances the scan
      continue;
    }
    const lock = lockDirFor(p, family);
    try { fs.mkdirSync(lock); } catch { bandClaim.release(); continue; } // EEXIST: another run of this tool holds it
    createdLocks.add(lock);
    reservations.set(p, { family, base });
    let released = false;
    const release = () => {
      if (released) return; released = true;
      fs.rmSync(lock, { recursive: true, force: true }); createdLocks.delete(lock); reservations.delete(p);
      bandClaim.release();
    };
    if (probe === httpProbe) await warmFetch(p); // #763: fetch's first-call cost lands outside every timed probe (a held or foreign endpoint is never touched)
    const verdict = await probeVerdict(probe, p);
    if (verdict === 'free') return { port: p, release, lock, family };
    release(); // an http answer (occupied), or unresponsive after the longer look (a stall / reset): skip
  }
  const held = [...heldEndpoints().entries()].filter(([p]) => p >= base && p < base + tries).map(([p, w]) => `${p} (${w})`);
  throw new Error(`no reservable ${family} endpoint in ${base}..${base + tries - 1}: ${tries} candidates exhausted`
    + `${skipped.length ? `; held endpoints skipped: ${skipped.join(', ')}` : ''}${held.length && !skipped.length ? `; held in the window: ${held.join(', ')}` : ''}`);
}

/** Reserve a cdp + http PAIR as one unit (a) — both or nothing. `specs = { cdp, http }` are the derived-endpoint
 * specs per side (the http spec gets `base: <the cdp port>`). Returns { cdp, http, release, locks }. */
export async function reserveEndpointPair(cdpBase, httpBase, tries = DEFAULT_TRIES, specs = {}, opts = {}) {
  const cdp = await reserveEndpoint(cdpBase, tries, specs.cdp ?? null, { ...opts, family: opts.family ?? 'cdp' });
  let http;
  try {
    http = await reserveEndpoint(httpBase, tries, specs.http ? { ...specs.http, base: cdp.port } : null, { ...opts, family: opts.family ?? 'cdp' });
  } catch (e) {
    cdp.release(); // RAII: the cdp claim and its lock dir go BEFORE the error propagates — a retry starts from zero
    throw e;
  }
  let released = false;
  return {
    cdp: cdp.port, http: http.port, locks: [cdp.lock, http.lock],
    release: () => { if (released) return; released = true; http.release(); cdp.release(); },
  };
}

/** Pend holds on every own claim covering each port (the spawn → lease gap; GH-389). */
export function pendEndpoints(ports) {
  return ports.filter((p) => Number.isFinite(p)).flatMap((p) => pendIntoOwnClaims(Number(p)).map((h) => ({ port: Number(p), hold: h })));
}
/** Lease `pid` into every own claim covering each port; releases the holds whose claim dir provably published the
 * lease. Returns the holds still armed (the caller releases them when the child exits). */
export function leaseEndpointsToChild(ports, pid, holds) {
  const remaining = [...holds];
  for (const p of ports.filter((x) => Number.isFinite(x))) {
    const leased = leaseEndpointIntoOwnClaims(Number(p), pid, null);
    for (let i = remaining.length - 1; i >= 0; i--) if (remaining[i].port === Number(p) && leased.has(remaining[i].hold.dir)) { remaining[i].hold.release(); remaining.splice(i, 1); }
  }
  return remaining;
}
/** Spawn a child that owns `ports` (a pair or a single endpoint): holds bracket the spawn, the child is leased into
 * every covering claim at spawn, the holds still armed are released when the child exits. `spawnFn` performs the
 * spawn and returns the ChildProcess. */
export function spawnLeased(ports, spawnFn) {
  const holds = pendEndpoints(ports);
  const child = spawnFn();
  let armed = holds;
  if (child && child.pid) armed = leaseEndpointsToChild(ports, child.pid, holds);
  const releaseAll = () => { for (const h of armed) { try { h.hold.release(); } catch { /* gone */ } } armed = []; };
  if (child) { child.once('exit', releaseAll); child.once('error', releaseAll); } else releaseAll();
  return child;
}
/** The lock dirs this process currently owns (tests / diagnostics). */
export const ownedLockDirs = () => [...createdLocks];
