#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// tools/render/probe-s2-drop-489.mjs — GH-489 SNK-R36/R37: the S2p 2.5 corner pot + the S2m-slow middle pot through the REAL app
// (a scripted boot on the given tree), read through the seams: sinkInfo (pivot / roll / ttl / tEnd) + sinkClearance. Used by the
// battery's mixed-cache rows (B1: a hybrid tree with an older sinkpivot.js). usage: --web <tree>/web [--arm <name>] under run-gate.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { launchChrome, spawnStaticServer, stopStaticServer, sleep } = await import(new URL('../../web/tools/cdp.mjs', import.meta.url).href);
const argv = process.argv.slice(2); const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const HTTP = +process.env.OB_E2E_PORT, CDP = +process.env.OB_E2E_CDP_PORT; const WEB = path.resolve(opt('--web', path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web'))); const ARM = opt('--arm', null);
if (!Number.isFinite(HTTP) || !Number.isFinite(CDP)) { console.error('[s2-drop] REFUSED — run under run-gate (OB_E2E_PORT / OB_E2E_CDP_PORT unset)'); process.exit(2); }
const server = spawnStaticServer(WEB, HTTP, { bind: '127.0.0.1' }); let ok = false; for (let i = 0; i < 50 && !ok; i++) { await sleep(200); try { ok = (await fetch(`http://127.0.0.1:${HTTP}/app.html`)).ok; } catch {} }
const chrome = await launchChrome(`http://127.0.0.1:${HTTP}/app.html?seed=1${ARM ? '&obArm=' + ARM : ''}`, { port: CDP, preflightWebDir: WEB });
try {
  let ready = false; for (let i = 0; i < 300 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true').catch(() => false); }
  if (!ready) throw new Error('app never ready');
  let gid = await chrome.eval("window.__rules && window.__rules.game ? window.__rules.game() : null").catch(() => null);
  if (gid !== 'snooker') {
    const r = await chrome.eval("window.__settings.changeGame('snooker', { skipConfirm: true })").catch((e) => String(e));
    await sleep(1500); let rd = false; for (let i = 0; i < 300 && !rd; i++) { await sleep(200); rd = (await chrome.eval("window.__test?.ready === true && window.__rules?.game?.() === 'snooker' && __test.balls().length >= 22").catch(() => false)) === true; }
    if (!rd) throw new Error('snooker never ready (ready flag / game id / 22 balls)');
    gid = await chrome.eval("window.__rules.game()").catch(() => null);
    console.log('game switch → snooker:', r, 'now', gid); await sleep(2500);
  } else console.log('game already snooker');
  const CTR = { x: 0.9209965818486914, y: 1.8164965818486913 }, ANCHOR = { x: 0.25, y: 1.0 };
  const dx = CTR.x - ANCHOR.x, dy = CTR.y - ANCHOR.y, n = Math.hypot(dx, dy), U = { x: dx / n, y: dy / n };
  const LANE = (t) => ({ x: CTR.x - U.x * t, y: CTR.y - U.y * t }); const SPHI = Math.atan2(U.y, U.x);
  const SPOT = { 16: { x: 0.292, y: -1.0475 }, 17: { x: -0.292, y: -1.0475 }, 18: { x: 0, y: -1.0475 }, 19: { x: 0, y: 0 }, 20: { x: 0, y: 0.89225 }, 21: { x: 0, y: 1.4605 } };
  const colours = [16, 17, 18, 19, 20, 21].map((id) => ({ id, ...SPOT[id] }));
  const settle = async () => { let st = 'PLAYBACK'; for (let i = 0; i < 220 && st === 'PLAYBACK'; i++) { await sleep(350); st = await chrome.eval('__test.state()'); } return st; };
  const runShot = async (tag, layout, params, ids) => {
    { let took = false; for (let k = 0; k < 8 && !took; k++) { await chrome.eval(`__test.layout(${JSON.stringify(layout)})`); await sleep(500); const b = JSON.parse(await chrome.eval('JSON.stringify(__test.balls().filter(b => b.id < 2).map(b => [b.id, b.pos[2], b.pos[0]]))')); took = b.length === 2 && b.every(([id, x, y]) => Math.hypot(x - layout.find((l) => l.id === id).x, y - layout.find((l) => l.id === id).y) < 0.002); if (!took) console.log(tag, 'layout retry', k, JSON.stringify(b)); } if (!took) { console.log(tag, 'layout never took'); return; } }
    console.log(tag, 'balls', await chrome.eval('JSON.stringify(__test.balls().filter(b => [0,1].includes(b.id)).map(b => ({ id: b.id, kx: +b.pos[2].toFixed(3), ky: +b.pos[0].toFixed(3), pocketed: b.pocketed })))').catch((e) => 'balls() failed: ' + e.message));
    await chrome.eval(`window.__rules.setMatchState(${JSON.stringify({ phase: 'reds', shooter: 1 })})`);
    const err = await chrome.eval(`__test.shoot(${JSON.stringify(params)})`); if (err) { console.log(tag, 'shoot rejected', err); return; }
    const st = await settle(); console.log(tag, 'settled', st);
    const si = JSON.parse(await chrome.eval('JSON.stringify(__test.sinkInfo())'));
    for (const id of ids) {
      const e = si.find((x) => x.id === id); console.log(tag, 'ball', id, 'sinkInfo', JSON.stringify({ pivot: e?.pivot, roll: e?.roll, ttl: e?.ttl, tEnd: e?.tEnd, glide: e?.glide, tFall: e?.tFall }));
      const t0 = Date.now(); const c = JSON.parse(await chrome.eval(`JSON.stringify(__test.sinkClearance(${id}))`)); if (c && c.refused) { console.log(tag, 'ball', id, 'clearance UNJUDGEABLE —', c.refused); process.exitCode = 2; continue; } console.log(tag, 'ball', id, 'clearance', JSON.stringify({ min: c.minClearanceMm, atMs: c.atMs, atMesh: c.atMesh, meshes: c.meshes, vertices: c.vertices, samples: c.samples, lastVisibleMs: c.lastVisibleMs, perMesh: c.perMeshMm, landing: c.landing, error: c.error }), `(${Date.now() - t0} ms)`);
    }
  };
  await runShot('S2p', [{ id: 0, ...LANE(0.95) }, { id: 1, ...LANE(0.35) }, ...colours], { v0: 2.5, phi: SPHI, theta: 0, a: 0, b: 0 }, [1]);
  const MIDC = { x: 0.9405874, y: 0 };
  await runShot('S2m-slow', [{ id: 0, x: MIDC.x - 0.85, y: 0 }, { id: 1, x: MIDC.x - 0.25, y: 0 }, ...colours], { v0: 0.9, phi: 0, theta: 0, a: 0, b: 0 }, [1]);
} catch (e) { console.log('PROBE ERROR', e.message); process.exitCode = 1; } finally { await chrome.closeAndWait(); await stopStaticServer(server); }
