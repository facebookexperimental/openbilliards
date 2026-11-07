// Copyright (c) Meta Platforms, Inc. and affiliates.

// serve-check.mjs — A CENSUS OWNS ITS LISTENER AND KNOWS ITS TREE (ORDER-CN8-731-FIX3, review round 3 on
// #731 P2 (b)). The in-page tools used to probe `http://127.0.0.1:<port>/app.html` after spawning their
// static server and take ANY 200 as "up" — a foreign server already bound on the port answered for a
// different tree and the census ran under the requested label. Two guards, both fatal by name:
//   assertOwnListener(server, port, tag)   the spawned python http.server must still be alive after the
//                                          probe window; if it died (EADDRINUSE) the port's holder is named
//                                          (lsof -t) and the run stops (exit 2 via a thrown refusal).
//   assertServedTree(port, webDir, tag)    the bytes the listener serves for /sw.js and /app.html must
//                                          equal the requested WEB dir's files — the served-tree identity
//                                          (the fence's sw VERSION lives in sw.js) — before any census.
// Also invalidatePrior(paths, tag): remove a previous run's verdict artefacts as the FIRST effect of a run,
// before any input guard can exit (P2 (a)) — a reused --out must never keep a stale PASS.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, execFile, spawn } from 'node:child_process';

export function refusal(tag, msg) { const e = new Error(`[${tag}] REFUSED — ${msg}`); e.refused = true; return e; }

export function invalidatePrior(paths, tag = 'serve-check') {
  const gone = [];
  for (const p of paths) { if (!p) continue; try { if (fs.existsSync(p)) { fs.rmSync(p, { force: true }); gone.push(p); } } catch (e) { throw refusal(tag, `could not invalidate the prior artefact ${p}: ${e.message}`); } }
  if (gone.length) console.error(`[${tag}] prior artefact(s) invalidated before any guard: ${gone.join(', ')}`);
  return gone;
}

/** every JSON file under `dir` whose `tool` field names this tool — the artefacts a reused --out may hold */
export function priorArtefactsOf(dir, toolName) {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f))
      .filter((p) => { try { const j = JSON.parse(fs.readFileSync(p, 'utf8')); return j && j.tool === toolName; } catch { return false; } });
  } catch { return []; }
}

function portHolder(port) {
  try { return execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8', timeout: 5000 }).trim().split(/\s+/).filter(Boolean).join(','); } catch { return ''; }
}
/** the same question asked ASYNCHRONOUSLY and truthfully: resolves { ok: true, holders } when lsof ran (exit 0 = holders, exit 1 = none),
 *  { ok: false } when lsof itself did not work (absent, timed out, killed) — a negative fact must never be manufactured from a failed tool */
function portHolderAsync(port) {
  return new Promise((resolve) => { execFile('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8', timeout: 5000 }, (err, out) => {
    if (!err) return resolve({ ok: true, holders: String(out).trim().split(/\s+/).filter(Boolean).map(Number) });
    if (err.code === 1 && !err.killed) return resolve({ ok: true, holders: [] }); // lsof exit 1 = nothing matched
    resolve({ ok: false, holders: [] }); }); });
}

function ancestors(pid, depth = 4) {
  const out = []; let cur = pid;
  for (let i = 0; i < depth; i++) {
    let pp = ''; try { pp = execFileSync('ps', ['-o', 'ppid=', '-p', String(cur)], { encoding: 'utf8', timeout: 3000 }).trim(); } catch { break; }
    if (!pp || pp === '0' || pp === '1') break; out.push(Number(pp)); cur = Number(pp);
  }
  return out;
}

/** The listener on `port` must be OUR spawn: the process that holds the LISTEN socket (lsof) is server.pid or
 *  a descendant of it (the python3 wrapper forks python3.12). Judged by lineage, not by timing — a foreign
 *  server that answers 200 on /app.html within the first probe window would otherwise pass while our python
 *  had not yet died of EADDRINUSE (refuter pass on FIX3). Falls back to the exit-code check when lsof yields
 *  nothing, after a 1.5 s settle so a late EADDRINUSE exit is observed. */
export async function assertOwnListener(server, port, tag = 'serve-check') {
  const fail = (why) => { const holder = portHolder(port); return refusal(tag, `static server failed to start on port ${port} (${why})${holder ? ` — the port is held by pid ${holder}` : ''}; a foreign listener's answer is not this census's tree`); };
  if (!server || server.exitCode !== null || server.signalCode) throw fail(`exit ${server ? server.exitCode : 'n/a'}`);
  const holders = portHolder(port).split(',').filter(Boolean).map(Number);
  if (holders.length) {
    const ours = holders.every((h) => h === server.pid || ancestors(h).includes(server.pid));
    if (!ours) throw fail(`the LISTEN socket belongs to pid ${holders.join(',')}, not to this run's server pid ${server.pid} or its children`);
    return;
  }
  await new Promise((r) => setTimeout(r, 1500));
  if (server.exitCode !== null || server.signalCode) throw fail(`exit ${server.exitCode} after a 1.5 s settle`);
}

export async function assertServedTree(port, webDir, tag = 'serve-check') {
  for (const f of ['sw.js', 'app.html']) {
    const local = path.join(webDir, f);
    if (!fs.existsSync(local)) throw refusal(tag, `requested WEB ${webDir} has no ${f}; cannot establish the served-tree identity`);
    let served;
    try { const r = await fetch(`http://127.0.0.1:${port}/${f}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); served = Buffer.from(await r.arrayBuffer()); }
    catch (e) { throw refusal(tag, `served-tree identity: /${f} not readable from the listener on ${port} (${e.message})`); }
    const mine = fs.readFileSync(local);
    if (!served.equals(mine)) {
      const ver = (b) => (String(b).match(/VERSION[^'"\n]*['"]([^'"]+)['"]/) || [])[1] || '(no VERSION line)';
      throw refusal(tag, `served-tree identity: the listener on ${port} serves a different /${f} than the requested WEB ${webDir} (served ${served.length} bytes ${f === 'sw.js' ? 'VERSION ' + ver(served) : ''} vs local ${mine.length} bytes ${f === 'sw.js' ? 'VERSION ' + ver(mine) : ''}); another tree is on this port`);
    }
  }
}

/** FIX11 (ORDER-CN8-731-FIX11, review round 11 on #731 P2 A): ONE READINESS LAW FOR OWNED SERVERS. The three in-page tools used to
 *  probe their freshly spawned static server after a fixed sleep — on a slow start assertServedTree's one-shot fetch ran before
 *  the bind, assertOwnListener saw no listener, and the tool exited 2 before the shared client's retrying preflight ever ran
 *  (a 4 s-delayed server reproduces it). The wait is now the SHARED preflight itself — cdp.mjs preflightServedTree, imported from
 *  the REQUESTED web tree: its wall-clock budget, storm-aware attempt ladder and starvation ceiling (OB_CDP_PREFLIGHT_MS) are the
 *  one bound; nothing is re-stated here — then the FIX3 checks run exactly as written: the listener must be OURS (lineage) and the
 *  served bytes must be the requested tree's. A server that never binds inside the bound is refused BY NAME with exit code 78
 *  (spawnStaticServer's EX_CONFIG code, `e.exitCode`); a starved host or a wrong tree carries the preflight's own diagnosis (exit 2).
 *  OB_SKIP_TREE_PREFLIGHT=1 (the shared law's own switch for a deliberately foreign tree) skips the wait as it skips the preflight. */
export async function awaitOwnedServer(server, port, webDir, tag = 'serve-check') {
  const { preflightServedTree } = await import(pathToFileURL(path.join(webDir, 'tools', 'cdp.mjs')).href);
  const t0 = Date.now();
  // the owned-server law has NO skip: OB_SKIP_TREE_PREFLIGHT=1 (the shared switch for a deliberately foreign tree) would remove the WAIT
  // as well as the tree judgement and reopen the race — the identity is asserted by assertServedTree regardless (Fable pass 1 on FIX11)
  const skip = process.env.OB_SKIP_TREE_PREFLIGHT; if (skip !== undefined) delete process.env.OB_SKIP_TREE_PREFLIGHT;
  // the PORT FACT is sampled WHILE the preflight runs (Fable passes 2 / 3 on FIX11): the shared preflight's failure path REAPS this run's own
  // http.server (reapOwnServer matches 'http.server <port>' on a descendant's argv — bound or not) BEFORE it throws, so a fact read after the
  // failure finds no holder and a SIGKILLed handle; the last snapshot taken while the listener stood is the fact, the sampler is asynchronous
  // (lsof ~0.5 s under load must not block the preflight's own windows), and a sampler that never WORKED is recorded as such — a negative
  // fact is never manufactured from a failed lsof. The handle's state BEFORE the preflight is recorded: a SIGKILL that appears only after a
  // preflight failure is the preflight's reap, not the server's own death.
  const wasDead = !!server && (server.exitCode !== null || !!server.signalCode);
  const seen = { holder: '', ours: false, at: 0, worked: false }; let polling = true;
  const sample = async () => { const r = await portHolderAsync(port); if (r.ok) seen.worked = true; if (r.ok && r.holders.length) { seen.holder = r.holders.join(','); seen.ours = !!server && r.holders.every((h) => h === server.pid || ancestors(h).includes(server.pid)); seen.at = Date.now(); } };
  const poller = (async () => { while (polling) { await sample(); if (polling) await new Promise((r) => setTimeout(r, 200)); } })();
  let failure = null;
  try { await preflightServedTree(`http://127.0.0.1:${port}/app.html`); }
  catch (e) { failure = String((e && e.message) || e).split('\n')[0]; }
  finally { polling = false; await poller; if (skip !== undefined) process.env.OB_SKIP_TREE_PREFLIGHT = skip; }
  if (failure !== null) {
    await new Promise((r) => setTimeout(r, 60)); // let a reap's SIGCHLD land before the handle's state is read (the 'died' race, pass 3)
    await sample();
    const state = server ? (server.signalCode || (server.exitCode !== null ? `exit ${server.exitCode}` : 'alive')) : 'n/a';
    // a death that PREDATES the preflight, or an exit code (EADDRINUSE = exit 1) / a non-KILL signal, is the server's own; a SIGKILL that
    // appeared only now (or a handle still alive) is the shared preflight's reap of an unbound / wedged own server
    const ownDeath = !!server && (wasDead || (server.exitCode !== null && server.exitCode !== 0) || (server.signalCode && server.signalCode !== 'SIGKILL'));
    const ever = seen.holder !== '';
    const who = ever ? ` — the port was held by pid ${seen.holder}${seen.ours ? " (this run's server)" : ''}` : '';
    const reaped = !ownDeath && server && server.signalCode === 'SIGKILL' ? '; the shared preflight reaped it on its verdict' : '';
    const neverBoundText = /never bound|nothing answers/.test(failure);
    const starvedText = /nothing answered|no HTTP answer arrived/.test(failure);
    if (ever) {
      // a listener stood on the port at some point of the wait: never a bind failure
      if (neverBoundText || starvedText) throw refusal(tag, `the listener on :${port} accepted connections but never answered inside the shared preflight's bound (${Date.now() - t0} ms; ${failure})${who}${reaped}; a starved host or a wedged server, not a bind failure`);
      if (seen.ours && /NOT serving an app tree|-> 404/.test(failure)) throw refusal(tag, `this run's own server bound :${port} inside the shared preflight's last window and was reaped on its verdict before its bytes could be judged (${Date.now() - t0} ms; ${failure})${who}; not a foreign tree — rerun`);
      throw refusal(tag, `served-tree preflight on the owned server :${port}: ${failure}${who}${reaped}`);
    }
    if (!ownDeath) {
      if (!seen.worked) throw refusal(tag, `the owned static server's readiness could not be judged: lsof never answered during the shared preflight's bound (${Date.now() - t0} ms; ${failure}; handle ${state}); no verdict on the bind is possible from a failed sampler`);
      const r = refusal(tag, `the owned static server never bound :${port} inside the shared preflight's bound (${Date.now() - t0} ms; ${failure}; handle ${state}${reaped}); nothing was measured`); r.exitCode = neverBoundText ? 78 : 2; throw r;
    }
    // the server's own death (EADDRINUSE under a foreign holder lsof did not surface in time): the ownership check below names the holder
  }
  await assertOwnListener(server, port, tag);
  await assertServedTree(port, webDir, tag);
}

/** FIX11 arm hook (`--perturb=slow-server`): the SAME python http.server the tools own, bound `delayMs` late — a plain detached
 *  spawn (no cdp.mjs marker / lease: an arm-only path, refused for any other use by the tools), stopped by the caller through
 *  stopStaticServer (which kills an unregistered handle by pid) or by pid. `exec` keeps the shell's pid, so the LISTEN holder is
 *  the handle's own pid and the lineage rule judges it exactly as a normal spawn. */
export function spawnOwnedServerDelayed(webDir, port, delayMs = 4000) {
  const delay = Math.max(0, Number(delayMs) || 0) / 1000;
  const proc = spawn('sh', ['-c', `sleep ${delay}; exec python3 -m http.server -d "$0" "$1"`, String(webDir), String(port)], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  let tail = ''; proc.stderr.on('data', (c) => { tail = (tail + c).slice(-2000); }); proc.errTail = () => tail;
  // the handle lives outside cdp.mjs's LIVE_SERVERS / marker / signal reaper (it is not a spawnStaticServer spawn), so it carries its own
  // reaper (Fable pass 1 on FIX11): killed by pid on process exit and on SIGINT / SIGTERM / SIGHUP — a tool killed mid-run leaves no python
  // bound on the band port; the exit code follows the signal only when no other handler owns the exit
  const reap = () => { if (proc.exitCode === null && !proc.signalCode) { try { process.kill(-proc.pid, 'SIGTERM'); } catch { try { proc.kill('SIGTERM'); } catch { /* gone */ } } } };
  process.once('exit', reap);
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.once(sig, () => { reap(); if (process.listenerCount(sig) === 0) process.exit(code); });
  return proc;
}

/** FIX6 (review round 6 on #731 P2 A): attach only to the browser THIS run spawned. A foreign Chrome that already holds
 *  the band's CDP port answers /json/list too, and the freshly spawned Chrome (which could not bind the port) is not
 *  the one behind that answer — the tool would drive a stranger's session. Ownership is judged by two facts, never by
 *  timing: (1) the spawned process is alive and has written `<profile>/DevToolsActivePort` naming THIS port (Chrome
 *  writes it only for the DevTools server it actually opened); (2) the LISTEN holder of the port is the spawned pid or
 *  a descendant (the same lsof lineage rule as assertOwnListener). Refuses by name (port, foreign holder pid, the port
 *  our Chrome opened instead, or the exit code) — the caller's cleanup then kills what it spawned. */
export async function assertOwnCdp(chrome, port, profileDir, tag = 'serve-check', { waitMs = 20000 } = {}) {
  const marker = path.join(profileDir, 'DevToolsActivePort');
  const holderNote = () => { const h = portHolder(port); return h ? ` — the port is held by pid ${h}` : ''; };
  const t0 = Date.now(); let lines = null;
  while (Date.now() - t0 < waitMs) {
    if (!chrome || chrome.exitCode !== null || chrome.signalCode) throw refusal(tag, `the spawned Chrome (pid ${chrome && chrome.pid}) exited (${chrome && (chrome.exitCode ?? chrome.signalCode)}) before opening DevTools on ${port}${holderNote()}; a foreign browser's endpoint is never attached to`);
    try { const t = fs.readFileSync(marker, 'utf8'); if (t.trim()) { lines = t.split(/\r?\n/); break; } } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!lines) throw refusal(tag, `the spawned Chrome (pid ${chrome.pid}) opened no DevTools endpoint within ${waitMs} ms (no ${marker})${holderNote()}; a foreign browser's endpoint is never attached to`);
  const opened = Number(lines[0]);
  if (opened !== Number(port)) throw refusal(tag, `the spawned Chrome (pid ${chrome.pid}) opened DevTools on ${opened}, not on the requested ${port}${holderNote()}; the endpoint on ${port} is not this run's browser`);
  // the lineage fact is REQUIRED: a DevTools server that wrote its marker is listening, so an empty lsof answer means lsof
  // failed or timed out — re-read a few times, then refuse rather than attach on the marker alone (refuter pass on FIX6: a
  // same-profile foreign Chrome inside the rm→spawn window could write a marker naming our port)
  let holders = [];
  for (let i = 0; i < 5 && !holders.length; i++) { holders = portHolder(port).split(',').filter(Boolean).map(Number); if (!holders.length) await new Promise((r) => setTimeout(r, 400)); }
  if (!holders.length) throw refusal(tag, `the LISTEN holder of the CDP port ${port} could not be established (lsof answered nothing) although a DevTools marker exists; ownership unproven, nothing is attached to`);
  const ours = holders.every((h) => h === chrome.pid || ancestors(h).includes(chrome.pid));
  if (!ours) throw refusal(tag, `the CDP LISTEN socket on ${port} belongs to pid ${holders.join(',')}, not to this run's Chrome pid ${chrome.pid} or its children; a foreign browser's endpoint is never attached to`);
  return { port: opened, browserPath: (lines[1] || '').trim() };
}
