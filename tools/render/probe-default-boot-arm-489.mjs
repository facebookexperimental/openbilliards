#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// tools/render/probe-default-boot-arm-489.mjs — GH-489 SNK-R37 landing rule L3, proof (ii) [+ --seam-inert: LAND-9/10/11, the main.js seam's inertness arm; --seam-diag].
// EXIT PRECEDENCE (the last exit-setting statement decides): a NOT ARMED seam arm → 1; a clearance refusal on the L3 read → 2; else the L3 verdict (0 / 1).
// a DEFAULT boot (no ?obtool / ?cinema) with ?obArm=throat-off must ignore the arm — the S2p clearance reads the
// shipped +0.70 mm (roll present) and the console names the ignored arm. tool:false = a real-user boot (no obtool stamp).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { launchChrome, spawnStaticServer, stopStaticServer, sleep } = await import(new URL('../../web/tools/cdp.mjs', import.meta.url).href);
// usage: node tools/render/probe-default-boot-arm-489.mjs --web <tree>/web [--arm throat-off]  (ports from run-gate's OB_E2E_PORT / OB_E2E_CDP_PORT)
const argv = process.argv.slice(2); const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
let seamFailed = false; const SEAM_INERT = argv.includes('--seam-inert'); const SEAM_DIAG = argv.includes('--seam-diag'); // LAND-10 diag boot: the settled → seek(t0) → one-frame-later rows for the refusing id (no verdict) // LAND-9 P1 (a2): the seam-inert arm (snapshot → sinkClearance(1) → snapshot EQUAL; plant = the seek mutation without the restore → DIFFERS)
const HTTP = +process.env.OB_E2E_PORT, CDP = +process.env.OB_E2E_CDP_PORT; const WEB = path.resolve(opt('--web', path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web'))); const ARM = opt('--arm', 'throat-off');
if (!Number.isFinite(HTTP) || !Number.isFinite(CDP)) { console.error('[default-boot-arm] REFUSED — run under run-gate (OB_E2E_PORT / OB_E2E_CDP_PORT unset)'); process.exit(2); }
const server = spawnStaticServer(WEB, HTTP, { bind: '127.0.0.1' }); let ok = false; for (let i = 0; i < 50 && !ok; i++) { await sleep(200); try { ok = (await fetch(`http://127.0.0.1:${HTTP}/app.html`)).ok; } catch {} }
const chrome = await launchChrome(`http://127.0.0.1:${HTTP}/app.html?seed=1&obArm=${ARM}`, { port: CDP, tool: false, preflightWebDir: WEB });
const lines = []; chrome.onEvent((m, p) => { if (m === 'Runtime.consoleAPICalled') lines.push((p.args || []).map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ')); });
try {
  let ready = false; for (let i = 0; i < 300 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true').catch(() => false); }
  if (!ready) throw new Error('app never ready');
  console.log('boot url has obtool?', await chrome.eval('location.search.includes("obtool")'), '| scripted flag:', await chrome.eval('(() => { try { return sessionStorage.getItem("ob-scripted"); } catch { return "n/a"; } })()'));
  const gid = await chrome.eval("window.__rules && window.__rules.game ? window.__rules.game() : null").catch(() => null);
  if (gid !== 'snooker') { const r = await chrome.eval("window.__settings.changeGame('snooker', { skipConfirm: true })").catch((e) => String(e)); console.log('game switch → snooker:', r); }
  // the switch rebuilds the table and loads the 22-ball set asynchronously (a default boot carries the heavy look): wait for the ready
  // flag AND the ball set, then apply the layout until it verifiably took (refuter 1 / dry run: a layout applied early was ignored → balls at 0,0)
  let rd = false; for (let i = 0; i < 300 && !rd; i++) { await sleep(200); rd = (await chrome.eval("window.__test?.ready === true && window.__rules?.game?.() === 'snooker' && __test.balls().length >= 22").catch(() => false)) === true; }
  if (!rd) throw new Error('snooker never ready (ready flag / game id / 22 balls)');
  await sleep(1500);
  const CTR = { x: 0.9209965818486914, y: 1.8164965818486913 }, ANCHOR = { x: 0.25, y: 1.0 }; const dx = CTR.x - ANCHOR.x, dy = CTR.y - ANCHOR.y, n = Math.hypot(dx, dy), U = { x: dx / n, y: dy / n };
  const LANE = (t) => ({ x: CTR.x - U.x * t, y: CTR.y - U.y * t }); const SPHI = Math.atan2(U.y, U.x);
  const SPOT = { 16: { x: 0.292, y: -1.0475 }, 17: { x: -0.292, y: -1.0475 }, 18: { x: 0, y: -1.0475 }, 19: { x: 0, y: 0 }, 20: { x: 0, y: 0.89225 }, 21: { x: 0, y: 1.4605 } };
  const layout = [{ id: 0, ...LANE(0.95) }, { id: 1, ...LANE(0.35) }, ...[16,17,18,19,20,21].map((id) => ({ id, ...SPOT[id] }))];
  // __test.balls() reports the rendered three.js position [x, y, z] = kernel (ky, kz, kx) (coords.js kPosToThree): kernel x = pos[2], kernel y = pos[0]
  const placed = async () => JSON.parse(await chrome.eval('JSON.stringify(__test.balls().filter(b => b.id < 2).map(b => [b.id, b.pos[2], b.pos[0], b.pocketed]))'));
  let took = false; for (let k = 0; k < 8 && !took; k++) { await chrome.eval(`__test.layout(${JSON.stringify(layout)})`); await sleep(500); const b = await placed(); took = b.length === 2 && b.every(([id, x, y]) => Math.hypot(x - layout.find((l) => l.id === id).x, y - layout.find((l) => l.id === id).y) < 0.002); if (!took) console.log('layout retry', k, JSON.stringify(b)); }
  if (!took) throw new Error('layout never took');
  await chrome.eval(`window.__rules.setMatchState(${JSON.stringify({ phase: 'reds', shooter: 1 })})`);
  const err = await chrome.eval(`__test.shoot(${JSON.stringify({ v0: 2.5, phi: SPHI, theta: 0, a: 0, b: 0 })})`); if (err) throw new Error('shoot rejected: ' + err);
  let st = await chrome.eval('__test.state()'); console.log('state right after shoot:', st);
  for (let i = 0; i < 220 && st === 'PLAYBACK'; i++) { await sleep(350); st = await chrome.eval('__test.state()'); }
  console.log('after shot: state', st, '| game', await chrome.eval('window.__rules.game()').catch(() => '?'), '| balls 0/1', await chrome.eval('JSON.stringify(__test.balls().filter(b => b.id < 2).map(b => ({ id: b.id, pocketed: b.pocketed, kx: +b.pos[2].toFixed(3), ky: +b.pos[0].toFixed(3) })))').catch((e) => 'balls failed ' + e.message), '| errors', await chrome.eval('JSON.stringify(__test.errors)').catch(() => '?'), '| console head', JSON.stringify(lines.slice(0, 6)).slice(0, 400));
  const si = JSON.parse(await chrome.eval('JSON.stringify(__test.sinkInfo())')); const e = si.find((x) => x.id === 1);
  if (SEAM_DIAG) {
    // LAND-10 diag (maintainer, 16:5xZ): ball 1 (the pocketed ball) — settled snapshot → the seam's refusal (with its deltas) → the pose immediately after
    // (seek(t0) applied, nothing written by the seam) → the pose one and two rendered frames later WITHOUT calling the seam again; the sink entry before/after.
    const ROW = `(() => { const b = __test.balls().find((x) => x.id === 1); const e = (__test.sinkInfo() || []).find((x) => x.id === 1); return JSON.stringify({ pos: b.pos, quat: b.quat, scale: b.scale, visible: b.visible, pocketed: b.pocketed, sink: e ? { t: e.t, pivot: e.pivot, ttl: e.ttl, tEnd: e.tEnd, roll: e.roll, glide: e.glide, tFall: e.tFall, tSeat: e.tSeat } : null }); })()`;
    const settled = JSON.parse(await chrome.eval(ROW));
    const r = JSON.parse(await chrome.eval('JSON.stringify(__test.sinkClearance(1))'));
    const after0 = JSON.parse(await chrome.eval(ROW));
    const after1 = JSON.parse(await chrome.eval(`new Promise((res) => requestAnimationFrame(() => res(${ROW})))`));
    const after2 = JSON.parse(await chrome.eval(`new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(${ROW}))))`));
    const mm = (a, b) => a && b ? a.map((v, i) => +((v - b[i]) * 1000).toFixed(4)) : null;
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    console.log('SEAM-DIAG seam result:', r && r.refused ? `REFUSED — ${r.refused} | deltas ${JSON.stringify(r.deltas)}` : `returned ${JSON.stringify(r).slice(0, 160)}`);
    console.log('SEAM-DIAG row settled            :', JSON.stringify({ pos: settled.pos, scale: settled.scale, visible: settled.visible, pocketed: settled.pocketed }));
    console.log('SEAM-DIAG row after seek(t0)     :', JSON.stringify({ pos: after0.pos, scale: after0.scale, visible: after0.visible, pocketed: after0.pocketed }), '| Δ vs settled mm', JSON.stringify(mm(after0.pos, settled.pos)), 'quat equal', same(after0.quat, settled.quat));
    console.log('SEAM-DIAG row one frame later    :', JSON.stringify({ pos: after1.pos, scale: after1.scale, visible: after1.visible, pocketed: after1.pocketed }), '| Δ vs settled mm', JSON.stringify(mm(after1.pos, settled.pos)), 'quat equal', same(after1.quat, settled.quat), '| == settled:', same({ p: after1.pos, q: after1.quat, s: after1.scale, v: after1.visible, k: after1.pocketed }, { p: settled.pos, q: settled.quat, s: settled.scale, v: settled.visible, k: settled.pocketed }));
    console.log('SEAM-DIAG row two frames later   :', JSON.stringify({ pos: after2.pos, scale: after2.scale, visible: after2.visible, pocketed: after2.pocketed }), '| Δ vs settled mm', JSON.stringify(mm(after2.pos, settled.pos)), 'quat equal', same(after2.quat, settled.quat), '| == settled:', same({ p: after2.pos, q: after2.quat, s: after2.scale, v: after2.visible, k: after2.pocketed }, { p: settled.pos, q: settled.quat, s: settled.scale, v: settled.visible, k: settled.pocketed }));
    console.log('SEAM-DIAG sink entry identical before/after:', same(settled.sink, after2.sink), '| entry:', JSON.stringify(settled.sink).slice(0, 220));
    console.log('SEAM-DIAG done (no verdict; diagnostics only)');
    process.exitCode = 0; await chrome.closeAndWait(); await stopStaticServer(server); process.exit(0);
  }
  const c = JSON.parse(await chrome.eval('JSON.stringify(__test.sinkClearance(1))'));
  if (c && c.refused) { console.log('L3 DEFAULT-BOOT: UNJUDGEABLE — sinkClearance refused by name:', c.refused); process.exitCode = 2; }
  if (SEAM_INERT) {
    // LAND-9 P1 (a2) — the seam-inert arm. Observable state reachable from the page (no game/machine handle is exposed): machine.state, game.lastOutcome,
    // the settle budget (clock, state), every ball's pose / quaternion / base quaternion / scale / visibility / pocketed flag, every ball's material
    // env / net-env / GI / scene-env flags, the sink index, the test error list, the HUD's text, plus a MutationObserver over document.body counting DOM
    // mutations while the seam runs. (a1) is static: game.seek(t) and its callees (sampleAt, poseSink, setNetBallEnv, setWellBallOccl, driveNetDress,
    // syncSphereUniforms, sinkIndex) carry no emit / hook / machine / HUD / timer / DOM token — seek is a pure function of t; the finally re-derives that
    // state at the original clock and restores the settled presentation from the snapshot. This arm is the dynamic witness.
    const SNAP = `(() => { const ids = __test.balls().map((b) => b.id); return JSON.stringify({ state: __test.state(), outcome: __test.outcome(), budget: __test.settleBudget(),
      balls: __test.balls(), env: ids.map((i) => [i, __test.ballEnv ? __test.ballEnv(i) : null, __test.netEnvOn ? __test.netEnvOn(i) : null, __test.giBallOn ? __test.giBallOn(i) : null, __test.envIsScene ? __test.envIsScene(i) : null]),
      derived: (window.__test.__ballDerived ? window.__test.__ballDerived() : null), sinks: __test.sinkInfo(), errors: Array.isArray(__test.errors) ? __test.errors.length : (typeof __test.errors === 'function' ? __test.errors().length : null), hud: (document.querySelector('#hud') || document.body).innerText.length }); })()`;
    await chrome.eval(`window.__seamObs = new MutationObserver(() => {}); window.__seamObs.observe(document.body, { attributes: true, childList: true, subtree: true, characterData: true }); true`);
    const s1 = await chrome.eval(SNAP);
    // the machine event counts are read INSIDE one synchronous evaluation around the seam call (no render frame can interleave), through the
    // ARM-ONLY member __test.__eventCounts that the instrumented COPY of the tip's web carries (one added line; the tip's main.js has none —
    // the machine is not reachable from the page otherwise). Absent counters → the arm is NOT ARMED (never a pass by absence).
    // DOM mutations are read SYNCHRONOUSLY: takeRecords() drains the observer before the call and again right after it returns, inside one evaluation
    // (the render loop's own HUD writes cannot interleave); the +120 ms settle window and a same-length CONTROL window without the seam are reported beside it.
    const sync = JSON.parse(await chrome.eval(`(() => { window.__seamObs.takeRecords(); const c0 = window.__test.__eventCounts ? window.__test.__eventCounts() : null; const r = __test.sinkClearance(1); const mutSync = window.__seamObs.takeRecords().length; const c1 = window.__test.__eventCounts ? window.__test.__eventCounts() : null; return JSON.stringify({ c0, c1, r, mutSync }); })()`));
    const c2 = sync.r;
    await sleep(120); // let any asynchronous effect of the seam land before the second read
    const s2 = await chrome.eval(SNAP);
    const cLate = JSON.parse(await chrome.eval('JSON.stringify(window.__test.__eventCounts ? window.__test.__eventCounts() : null)'));
    const mutSettle = await chrome.eval('window.__seamObs.takeRecords().length');
    await sleep(120); const mutControl = await chrome.eval('window.__seamObs.takeRecords().length'); // the same window with NO seam call: the loop's own writes
    const mut = sync.mutSync;
    const equal = s1 === s2;
    const evOk = !!(sync.c0 && sync.c1) && Object.keys(sync.c0).every((k) => sync.c0[k] === sync.c1[k]);
    const evLine = sync.c0 ? Object.keys(sync.c0).map((k) => `${k} ${sync.c1[k] - sync.c0[k]}`).join(' / ') : 'COUNTERS ABSENT';
    const evLate = (cLate && sync.c1) ? Object.keys(cLate).map((k) => `${k} +${cLate[k] - sync.c1[k]}`).join(' / ') : 'n/a';
    const S1 = JSON.parse(s1); const keyClasses = `state 1, outcome 1, budget ${Object.keys(S1.budget || {}).length}, balls ${S1.balls.length}×${Object.keys(S1.balls[0] || {}).length} fields, env ${S1.env.length}×4, derived ${S1.derived ? S1.derived.length + '×' + Object.keys(S1.derived[0] || {}).length + ' (uSpheres slot, envMap uuid, giBallOn, netEnvOn, wellOccl, wellFloor)' : 'ABSENT (tip: no __ballDerived)'}, sinks ${(S1.sinks || []).length}, errors 1, hud 1, events ${sync.c0 ? Object.keys(sync.c0).length : 0}`;
    console.log(`SEAM-INERT compared key classes: ${keyClasses}`);
    console.log(`SEAM-INERT machine events DURING the seam call (synchronous window): ${evLine} | over the +120 ms settle window: ${evLate}`);
    const diffKeys = (a, b) => { try { const A = JSON.parse(a), B = JSON.parse(b); return Object.keys(A).filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k])); } catch { return ['(unparseable)']; } };
    console.log(`SEAM-INERT: snapshot ${equal ? 'EQUAL' : 'DIFFERS in ' + diffKeys(s1, s2).join(',')} after sinkClearance(1) (${c2 && c2.refused ? 'REFUSED — ' + c2.refused : 'min clearance ' + c2.minClearanceMm?.toFixed(3) + ' mm, ' + c2.samples + ' seek steps, orientation restored (hidden, parked): ' + JSON.stringify(c2.quatRestored)}) | DOM mutations DURING the seam call (synchronous, takeRecords): ${mut}; over the +120 ms settle window: ${mutSettle}; control window of 120 ms with no seam: ${mutControl} | balls ${JSON.parse(s1).balls.length}, env fields ${JSON.parse(s1).env.length * 4}, errors ${JSON.parse(s1).errors}`);
    // LAND-10 R1d plants on the instrumented copy (arm-only members; absent on the tip → each reads 'unavailable', the tip is NOT ARMED by name anyway)
    const has = async (n) => chrome.eval(`typeof window.__test.${n} === "function"`);
    // a refusal NAMING the id: both seam refusal forms carry `ids` (the T1 pre-check: 'not measurable — the live scene differs from the kernel
    // sample at t0 for <ids>'; the second guard: 'settled pose ≠ seek(t0) pose for <ids>'); the text is the fallback for a tree without `ids`.
    // (the 19:01Z copy11 boot read the pre-check refusal as NOT refused because this matcher knew only the second guard's prefix — a probe defect)
    // LAND-12 V3(h): a refusing plant's idempotence cell = the SECOND refusal field-wise equal to the first (refused text, preCheck, ids, precondition)
    const sameRefusal = (a, b) => !!(a && b && a.refused === b.refused && !!a.preCheck === !!b.preCheck && JSON.stringify(a.ids) === JSON.stringify(b.ids) && JSON.stringify(a.precondition ?? null) === JSON.stringify(b.precondition ?? null));
    const giOf = async (id) => JSON.parse(await chrome.eval(`JSON.stringify((() => { const d = window.__test.__ballDerived ? __test.__ballDerived() : null; if (!d) return null; const r = Array.isArray(d) ? d.find((x) => x && x.id === ${id}) : d[${id}]; return r && r.giSH ? Array.from(r.giSH) : null; })())`));
    const maxAbsDiff = (a, b) => (Array.isArray(a) && Array.isArray(b) && a.length === b.length) ? Math.max(...a.map((v, k) => Math.abs(v - b[k]))) : null;
    const refusalOf = (o, id) => !!(o && typeof o.refused === 'string' && ((Array.isArray(o.ids) && o.ids.includes(id)) || new RegExp(`(pose|at t0) for [0-9,]*\\b${id}\\b`).test(o.refused)));
    // reset between plants: the clock back (seek + the owner path) AND ball 1's SETTLED orientation back (arm-only __setQuat on the copy) — a refusing
    // plant and the no-write-back variant leave the read loop's last orientation on the hidden ball by design, and every later plant must start from the settled state
    const settledQ1 = JSON.parse(s1).balls.find((b) => b.id === 1)?.quat;
    const reset = async () => { await chrome.eval(`__test.seek(${JSON.parse(s1).budget.clock ?? 0}); window.__test.__syncShadows && window.__test.__syncShadows(); ${settledQ1 ? `window.__test.__setQuat && window.__test.__setQuat(1, ${JSON.stringify(settledQ1)});` : ''} true`).catch(() => null); };
    // plant 5 FIRST (LAND-10 R1d): the quaternion write-back removed → REFUSED naming ball 1 with its orientation delta (the write-back is load-bearing).
    // It must run right after the real seam restored the settled orientation: a REFUSING plant writes nothing, so after plant 3' the hidden ball
    // keeps the read loop's last-step orientation and a later plant 5 would snapshot that very value (observed in the 17:08Z boot: 'NOT refused').
    let p5ok = false;
    if (await has('__sinkClearanceNoQuatRestore')) {
      const p5 = JSON.parse(await chrome.eval('JSON.stringify(window.__test.__sinkClearanceNoQuatRestore(1))'));
      const p5q = p5 && p5.deltas && p5.deltas['1'] ? Number(p5.deltas['1'].quatMaxAbs) : NaN;
      p5ok = refusalOf(p5, 1) && Number.isFinite(p5q) && p5q > 0; // LAND-12 V3(h): the refusal must carry a quaternion delta > 0 for ball 1, not merely name it
      console.log(`SEAM-INERT plant 5 (the quaternion write-back removed): ${p5ok ? 'REFUSED naming ball 1 — quat max |Δ| ' + (p5.deltas && p5.deltas['1'] ? p5.deltas['1'].quatMaxAbs : '?') : 'NOT refused — ' + JSON.stringify(p5).slice(0, 160) + ' — arm NOT ARMED'}`);
      await reset();
    } else console.log('SEAM-INERT plant 5: unavailable on this tree (the tip as shipped)');
    let planted = false, p1keys = [];
    if (await has('__sinkClearanceNoSeek0')) { // plant 1: no seek(t0)
      await chrome.eval('window.__test.__sinkClearanceNoSeek0(1); true'); await sleep(120);
      const s3 = await chrome.eval(SNAP); planted = s3 !== s1; p1keys = diffKeys(s1, s3);
      console.log(`SEAM-INERT plant 1 (the seam without seek(t0)): snapshot ${planted ? 'DIFFERS in ' + p1keys.join(',') + ' — RED' : 'EQUAL — the comparator is BLIND, arm NOT ARMED'}`);
      await reset();
    } else console.log('SEAM-INERT plant 1: unavailable on this tree (the tip as shipped)');
    // plant 2 (LAND-11 T1 form): the cue ball moved before the call → the PRE-CHECK refuses by name BEFORE any write — the snapshot must be byte-identical
    // before and after the refusal (scene-neutral), and a SECOND call must refuse again (idempotent); the refusal names the measured precondition
    const cue = JSON.parse(s1).balls.find((b) => b.id === 0);
    await chrome.eval(`__test.placeCue(${(cue ? cue.pos[2] : 0.7) + 0.03}, ${cue ? cue.pos[0] : 1.6})`).catch(() => null);
    const sBefore2 = await chrome.eval(SNAP);
    const p2 = JSON.parse(await chrome.eval('JSON.stringify(__test.sinkClearance(1))'));
    const sAfter2 = await chrome.eval(SNAP);
    const p2b = JSON.parse(await chrome.eval('JSON.stringify(__test.sinkClearance(1))'));
    const p2neutral = sBefore2 === sAfter2; const p2idem = sameRefusal(p2, p2b); // LAND-12 V3(h): field-wise equal second refusal
    const p2ok = refusalOf(p2, 0) && !!p2.preCheck && p2neutral && p2idem;
    console.log(`SEAM-INERT plant 2 (the cue ball moved before the call): ${refusalOf(p2, 0) ? 'REFUSED by name' + (p2.preCheck ? ' at the PRE-CHECK (nothing written)' : ' by the SECOND guard (the pre-check did not fire)') + ' — ' + p2.refused : 'NOT refused — ' + JSON.stringify(p2).slice(0, 140)} | scene ${p2neutral ? 'UNCHANGED across the refusal (snapshot byte-identical)' : 'CHANGED by the refusal — ' + diffKeys(sBefore2, sAfter2).join(',')} | second call ${p2idem ? 'REFUSED again (idempotent)' : 'returned a VALUE — one-shot, arm NOT ARMED'} | precondition ${JSON.stringify(p2.precondition || null).slice(0, 160)}`);
    await chrome.eval(`__test.placeCue(${cue ? cue.pos[2] : 0.7}, ${cue ? cue.pos[0] : 1.6})`).catch(() => null); await reset();
    // plant 6 (LAND-11 T1): the PRE-CHECK removed (arm-only variant `__sinkClearanceNoPreCheck` on the copy) → the first call refuses by the second guard but
    // moves the scene, and the SECOND call returns a VALUE → RED (proves the pre-check is what makes a refusal scene-neutral and repeatable)
    let p6ok = false;
    if (await has('__sinkClearanceNoPreCheck')) {
      await chrome.eval(`__test.placeCue(${(cue ? cue.pos[2] : 0.7) + 0.03}, ${cue ? cue.pos[0] : 1.6})`).catch(() => null);
      const q1 = JSON.parse(await chrome.eval('JSON.stringify(window.__test.__sinkClearanceNoPreCheck(1))'));
      const q2 = JSON.parse(await chrome.eval('JSON.stringify(window.__test.__sinkClearanceNoPreCheck(1))'));
      p6ok = !!(q1 && q1.refused) && !!(q2 && !q2.refused && Number.isFinite(q2.minClearanceMm));
      console.log(`SEAM-INERT plant 6 (the pre-check removed): first call ${q1 && q1.refused ? 'REFUSED (second guard)' : 'returned a value'}, second call ${q2 && !q2.refused ? 'returned a VALUE (' + q2.minClearanceMm?.toFixed(3) + ' mm) — the one-shot class, RED' : 'refused'} → ${p6ok ? 'RED as required' : 'NOT as required — arm NOT ARMED'}`);
      await chrome.eval(`__test.placeCue(${cue ? cue.pos[2] : 0.7}, ${cue ? cue.pos[0] : 1.6})`).catch(() => null); await reset();
    } else console.log('SEAM-INERT plant 6: unavailable on this tree (the tip as shipped)');
    // plant 3' (LAND-12 V1 form): a HIDDEN ball moved 1 mm off the parking position → the PRE-CHECK refuses by name (preCheck true, precondition.pocketedOffPark
    // = [{ id: 1, dMm ≈ 1 }]), no quatRestored / giRestored key on the refusal, the scene untouched (ball 1's position, quaternion and giSH bit-equal before and
    // after — the three equalities printed), and a second call returns a field-wise equal object
    let p3ok = false;
    if (await has('__nudge')) {
      await chrome.eval('window.__test.__nudge(1, 1); true');
      const b3a = JSON.parse(await chrome.eval('JSON.stringify(__test.balls().find((b) => b.id === 1))')); const g3a = await giOf(1);
      const p3 = JSON.parse(await chrome.eval('JSON.stringify(__test.sinkClearance(1))'));
      const b3b = JSON.parse(await chrome.eval('JSON.stringify(__test.balls().find((b) => b.id === 1))')); const g3b = await giOf(1);
      const p3b = JSON.parse(await chrome.eval('JSON.stringify(__test.sinkClearance(1))'));
      const off = p3 && p3.precondition && Array.isArray(p3.precondition.pocketedOffPark) ? p3.precondition.pocketedOffPark.find((x) => x.id === 1) : null;
      const posEq = JSON.stringify(b3a && b3a.pos) === JSON.stringify(b3b && b3b.pos), quatEq = JSON.stringify(b3a && b3a.quat) === JSON.stringify(b3b && b3b.quat), giEq = JSON.stringify(g3a) === JSON.stringify(g3b);
      const noWb = !!p3 && !('quatRestored' in p3) && !('giRestored' in p3);
      p3ok = refusalOf(p3, 1) && !!p3.preCheck && !!off && Math.abs(off.dMm - 1) < 0.05 && noWb && posEq && quatEq && giEq && sameRefusal(p3, p3b);
      console.log(`SEAM-INERT plant 3' (hidden ball 1 moved 1 mm off parking): ${refusalOf(p3, 1) && p3.preCheck ? 'REFUSED at the PRE-CHECK naming 1' : 'NOT a pre-check refusal naming 1 — ' + JSON.stringify(p3).slice(0, 160)} | pocketedOffPark ${JSON.stringify(p3 && p3.precondition && p3.precondition.pocketedOffPark)} | write-back keys on the refusal: ${noWb ? 'none' : 'PRESENT'} | scene bit-equal before/after: position ${posEq} quaternion ${quatEq} giSH ${giEq} | second call field-wise ${sameRefusal(p3, p3b) ? 'EQUAL' : 'DIFFERENT'} → ${p3ok ? 'as required' : 'NOT as required — arm NOT ARMED'}`);
      await chrome.eval('window.__test.__nudge(1, -1); true'); await reset();
    } else console.log("SEAM-INERT plant 3': unavailable on this tree (the tip as shipped)");
    // plant 3'': a VISIBLE ball's quaternion rotated → REFUSED naming it (the write-back never touches a visible ball); LAND-12 V2 WITNESS: the refusal names
    // giRestored, and giRestored includes 1 iff ball 1's settled giSH ≠ its post-loop giSH — the post-loop value is read through the no-gi-restore variant on
    // the same plant (it leaves the loop's sample on the hidden ball), so max |Δ| and the array are printed; Δ = 0 → NOT WITNESSED here (the scratch scenes below carry a second witness)
    let p33ok = false; let gw = { delta: null, witnessed: null, giHas1: null, consistent: null };
    const visId = JSON.parse(s1).balls.find((b) => b.visible && b.id !== 0 && b.id !== 1)?.id ?? 2;
    if (await has('__rotate')) {
      const gSettled = await giOf(1);
      await chrome.eval(`window.__test.__rotate(${visId}); true`);
      const p33 = JSON.parse(await chrome.eval('JSON.stringify(__test.sinkClearance(1))'));
      const p33restored = Array.isArray(p33 && p33.quatRestored) && p33.quatRestored.includes(1); // R1e: the refusal for ball 16 must not skip ball 1's restore
      const gAfterReal = await giOf(1);
      await reset();
      let delta = null; let gPostLoop = null;
      if (await has('__sinkClearanceNoGiRestore')) { await chrome.eval(`window.__test.__rotate(${visId}); true`); await chrome.eval('JSON.stringify(window.__test.__sinkClearanceNoGiRestore(1))'); gPostLoop = await giOf(1); delta = maxAbsDiff(gSettled, gPostLoop); await reset(); }
      const giNamed = Array.isArray(p33 && p33.giRestored); const giHas1 = giNamed && p33.giRestored.includes(1);
      const witnessed = delta !== null && delta > 0; gw = { delta, witnessed, giHas1, consistent: delta === null ? null : (giHas1 === witnessed) };
      p33ok = refusalOf(p33, visId) && p33restored && giNamed && JSON.stringify(gSettled) === JSON.stringify(gAfterReal) && (delta === null || giHas1 === witnessed);
      const verdictText = delta === null ? 'not measurable on this tree (no variant)' : witnessed ? (giHas1 ? 'WITNESSED (giRestored names 1 and Δ > 0)' : 'INCONSISTENT — Δ > 0 but giRestored lacks 1') : (giHas1 ? 'INCONSISTENT — Δ = 0 but giRestored names 1' : 'NOT WITNESSED here (Δ = 0; the S2p-scratch scene below carries the witness)');
      console.log(`SEAM-INERT plant 3'' (visible ball ${visId} rotated): ${refusalOf(p33, visId) ? 'REFUSED naming it — ' + p33.refused : 'NOT refused — ' + JSON.stringify(p33).slice(0, 120)} | orientation restored (hidden, parked): ${JSON.stringify(p33 && p33.quatRestored)}${p33restored ? '' : ' — ball 1 NOT restored on the refusal path, arm NOT ARMED'} | giRestored on the refusal: ${giNamed ? JSON.stringify(p33.giRestored) : 'KEY ABSENT'} | ball 1 giSH after the real call == settled: ${JSON.stringify(gSettled) === JSON.stringify(gAfterReal)} | WITNESS settled vs post-loop giSH max |Δ| ${delta === null ? 'n/a' : delta.toFixed(4)} (settled ${JSON.stringify(gSettled && gSettled.slice(0, 3))}… post-loop ${JSON.stringify(gPostLoop && gPostLoop.slice(0, 3))}…) → ${verdictText}`);
    } else console.log("SEAM-INERT plant 3'': unavailable on this tree (the tip as shipped)");
    // C2 idempotence: the owner path twice on the settled scene → snapshot EQUAL incl. derived, 0 events, DOM 0
    let idem = false;
    if (await has('__syncShadows')) {
      const i0 = await chrome.eval(SNAP);
      const ev = JSON.parse(await chrome.eval(`(() => { window.__seamObs.takeRecords(); const c0 = __test.__eventCounts(); __test.__syncShadows(); __test.__syncShadows(); const mutSync = window.__seamObs.takeRecords().length; const c1 = __test.__eventCounts(); return JSON.stringify({ c0, c1, mutSync }); })()`));
      const i1 = await chrome.eval(SNAP);
      idem = i0 === i1 && ev.mutSync === 0 && Object.keys(ev.c0).every((k) => ev.c0[k] === ev.c1[k]);
      console.log(`SEAM-INERT C2 idempotence (game.syncShadows() twice on the settled scene): snapshot ${i0 === i1 ? 'EQUAL' : 'DIFFERS in ' + diffKeys(i0, i1).join(',')} | DOM mutations ${ev.mutSync} | machine events ${Object.keys(ev.c0).map((k) => k + ' ' + (ev.c1[k] - ev.c0[k])).join(' / ')}`);
    } else console.log('SEAM-INERT C2 idempotence: unavailable on this tree (the tip as shipped)');
    await reset(); const sEnd = await chrome.eval(SNAP);
    console.log(`SEAM-INERT end-of-sequence: after the plants and a final reset the snapshot is ${sEnd === s1 ? 'EQUAL to the pre-arm snapshot' : 'NOT equal to the pre-arm snapshot (differs in ' + diffKeys(s1, sEnd).join(',') + ') — informational: plant 2 (placeCue) and the reset run on BOTH webs and are the arm\'s own writes'}`);
    // LAND-11 ruling (A) — the scratch scenes, exactly as e2e-snooker runs them (layout + setMatchState {reds, shooter 1} + shoot, DRILL mode):
    // S2p-scratch (v0 1.2 on the SPHI lane: the red then the cue into pocket 5) and S2m-slow (v0 0.9 straight into the +x-across middle cup, the cue
    // follows). The real seam must return a VALUE for call(1) and call(0) with the snapshot EQUAL strictly (incl. the derived state on the copy) and
    // name the balls whose baked-GI probe it restored (giRestored); plant 8 (copy only, `__sinkClearanceNoGiRestore`) must REFUSE naming the cue with
    // a giSH delta (the diag boot of 19:34Z measured 6.417 / 6.074 on these scenes) — the second write-back is load-bearing.
    const MIDC = { x: 0.9405874, y: 0 };
    const applyLayout = async (lay) => { let ok = false; for (let k = 0; k < 8 && !ok; k++) { await chrome.eval(`__test.layout(${JSON.stringify(lay)})`); await sleep(500); const b = JSON.parse(await chrome.eval('JSON.stringify(__test.balls().filter(b => b.id < 2).map(b => [b.id, b.pos[2], b.pos[0]]))')); ok = b.length === 2 && b.every(([id, x, y]) => Math.hypot(x - lay.find((l) => l.id === id).x, y - lay.find((l) => l.id === id).y) < 1e-3); } return ok; };
    const runScene = async (tag, lay, shotP) => {
      const res = { tag, ok: false, p8: null, p8ok: false, note: '' };
      if (!(await applyLayout(lay))) { res.note = 'layout never took'; console.log(`SEAM-INERT scene ${tag}: ${res.note}`); return res; }
      await chrome.eval(`window.__rules.setMatchState(${JSON.stringify({ phase: 'reds', shooter: 1 })})`);
      const er = await chrome.eval(`__test.shoot(${JSON.stringify(shotP)})`); if (er) { res.note = 'shoot rejected: ' + er; console.log(`SEAM-INERT scene ${tag}: ${res.note}`); return res; }
      let stt = 'PLAYBACK'; for (let i = 0; i < 220 && stt === 'PLAYBACK'; i++) { await sleep(350); stt = await chrome.eval('__test.state()'); }
      await sleep(400);
      const pk = JSON.parse(await chrome.eval('JSON.stringify(__test.balls().filter(b => b.id < 2).map(b => [b.id, b.pocketed, b.visible]))'));
      const dec = await chrome.eval('JSON.stringify((() => { const j = window.__rules && window.__rules.judgment ? __rules.judgment() : null; return j ? { decisionRequired: j.decisionRequired || null, ballInHand: j.ballInHand, fouls: (j.fouls || []).map((f) => f.code || f) } : null; })())').catch(() => 'n/a'); // LAND-12 V4(c): the settle's judgment — the pending election is WHY the cue stays down (flow.js:1902-1935)
      const sA = await chrome.eval(SNAP);
      const r1 = JSON.parse(await chrome.eval('JSON.stringify(__test.sinkClearance(1))')); const sB = await chrome.eval(SNAP);
      const r0 = JSON.parse(await chrome.eval('JSON.stringify(__test.sinkClearance(0))')); const sC = await chrome.eval(SNAP);
      const val = (r) => r && !r.refused && !r.error && Number.isFinite(r.minClearanceMm);
      res.ok = val(r1) && val(r0) && sA === sB && sB === sC;
      console.log(`SEAM-INERT scene ${tag} (state ${stt}; balls 0/1 pocketed,visible ${JSON.stringify(pk)}; judgment ${dec}): call(1) ${val(r1) ? 'VALUE ' + r1.minClearanceMm.toFixed(3) + ' mm' : 'NO VALUE — ' + JSON.stringify(r1).slice(0, 160)} | snapshot ${sA === sB ? 'EQUAL' : 'DIFFERS in ' + diffKeys(sA, sB).join(',')} | giRestored ${JSON.stringify(r1 && r1.giRestored)} quatRestored ${JSON.stringify(r1 && r1.quatRestored)} || call(0) ${val(r0) ? 'VALUE ' + r0.minClearanceMm.toFixed(3) + ' mm' : 'NO VALUE — ' + JSON.stringify(r0).slice(0, 160)} | snapshot ${sB === sC ? 'EQUAL' : 'DIFFERS in ' + diffKeys(sB, sC).join(',')} | giRestored ${JSON.stringify(r0 && r0.giRestored)} → ${res.ok ? 'MEASURABLE, scene-neutral' : 'NOT as required'}`);
      res.cueScratched = !!(pk.find((x) => x[0] === 0) && pk.find((x) => x[0] === 0)[1] === true);
      if (tag === 'S2p-scratch' && await has('__rotate')) { // LAND-12 V2 second witness: a second-guard refusal on this scene must name giRestored incl. the cue (Δ 6.4 at prep 11)
        const vis2 = JSON.parse(await chrome.eval('JSON.stringify(__test.balls().find((b) => b.visible && b.id !== 0 && b.id !== 1))'));
        if (vis2) { await chrome.eval(`window.__test.__rotate(${vis2.id}); true`); const w = JSON.parse(await chrome.eval('JSON.stringify(__test.sinkClearance(1))')); res.w2 = { refusedNaming: refusalOf(w, vis2.id), giRestored: w && w.giRestored, quatRestored: w && w.quatRestored }; res.w2ok = refusalOf(w, vis2.id) && Array.isArray(w.giRestored) && w.giRestored.includes(0); console.log(`SEAM-INERT witness on S2p-scratch (visible ball ${vis2.id} rotated): ${res.w2ok ? 'REFUSED naming ' + vis2.id + ' with giRestored ' + JSON.stringify(w.giRestored) + ' (names the cue) — WITNESSED' : 'NOT as required — ' + JSON.stringify(res.w2)}`); await chrome.eval(`window.__test.__rotate(${vis2.id}); true`).catch(() => null); }
      }
      if (await has('__sinkClearanceNoGiRestore')) {
        const p8 = JSON.parse(await chrome.eval('JSON.stringify(__test.__sinkClearanceNoGiRestore(1))')); res.p8 = p8;
        const d0 = p8 && p8.deltas && p8.deltas['0'] && p8.deltas['0'].derived; const gA = d0 && d0.settled && d0.settled.giSH, gB = d0 && d0.now && d0.now.giSH;
        const gmax = Array.isArray(gA) && Array.isArray(gB) ? Math.max(...gA.map((v, k) => Math.abs(v - gB[k]))) : null;
        res.p8ok = refusalOf(p8, 0) && gmax !== null && gmax > 0;
        console.log(`SEAM-INERT plant 8 on ${tag} (the giSH write-back removed): ${refusalOf(p8, 0) ? 'REFUSED naming 0' : 'NOT refused naming 0 — ' + JSON.stringify(p8).slice(0, 160)} | giSH max |Δ| ${gmax === null ? 'n/a (no derived deltas)' : gmax.toFixed(3)} → ${res.p8ok ? 'RED as required' : 'NOT as required'}`);
        // the plant left the read loop's giSH on the hidden cue by design; the real seam's next call restores nothing (its snapshot is now the stale value) — a fresh layout re-presents every ball and gi.js re-samples it, so the next scene starts clean
      } else console.log(`SEAM-INERT plant 8 on ${tag}: unavailable on this tree (the tip as shipped)`);
      return res;
    };
    const lane = (t) => { const CTRs = { x: 0.9209965818486914, y: 1.8164965818486913 }, AN = { x: 0.25, y: 1.0 }; const ddx = CTRs.x - AN.x, ddy = CTRs.y - AN.y, nn = Math.hypot(ddx, ddy); return { x: CTRs.x - ddx / nn * t, y: CTRs.y - ddy / nn * t }; };
    const SPOTS = { 16: { x: 0.292, y: -1.0475 }, 17: { x: -0.292, y: -1.0475 }, 18: { x: 0, y: -1.0475 }, 19: { x: 0, y: 0 }, 20: { x: 0, y: 0.89225 }, 21: { x: 0, y: 1.4605 } };
    const colours = [16, 17, 18, 19, 20, 21].map((id) => ({ id, ...SPOTS[id] }));
    const sc1 = await runScene('S2p-scratch', [{ id: 0, ...lane(0.95) }, { id: 1, ...lane(0.35) }, ...colours], { v0: 1.2, phi: Math.atan2(0.8164965818486913, 0.6709965818486914), theta: 0, a: 0, b: 0 });
    const sc2 = await runScene('S2m-slow', [{ id: 0, x: MIDC.x - 0.85, y: 0 }, { id: 1, x: MIDC.x - 0.25, y: 0 }, ...colours], { v0: 0.9, phi: 0, theta: 0, a: 0, b: 0 });
    const scenesOk = sc1.ok && sc2.ok; const p8ok = sc1.p8ok && sc2.p8ok; const witnessOk = (gw.witnessed === true && gw.consistent === true) || sc1.w2ok === true;
    console.log(`SEAM-INERT S2m premise check (redundant with V3(d)'s FAIL by name): cue kernel-pocketed after the shot — S2p-scratch ${sc1.cueScratched ? 'yes' : 'no'}, S2m-slow ${sc2.cueScratched ? 'yes' : 'no'}`);
    const refusedByName = p2ok; const allPlants = planted && p2ok && p3ok && p33ok && p5ok && p6ok && p8ok && idem && scenesOk && witnessOk;
    const TABLE = [['real seam', 'snapshot EQUAL strictly (incl. derived on the copy) + 0 DOM mutations + 0 machine events', equal && mut === 0 && evOk], ['plant 1', 'no seek(t0) -> snapshot DIFFERS (RED)', planted], ['plant 2', 'cue moved -> PRE-CHECK refusal naming 0, snapshot byte-identical, second refusal field-wise EQUAL', p2ok], ["plant 3'", 'hidden ball 1 moved 1 mm -> PRE-CHECK refusal with pocketedOffPark [{1, ~1 mm}], no write-back key, position/quaternion/giSH bit-equal, second refusal field-wise EQUAL', p3ok], ["plant 3''", 'visible ball rotated -> second-guard refusal naming it, quatRestored incl. 1, giRestored key present and consistent with the measured delta', p33ok], ['plant 5', 'quaternion write-back removed -> refusal naming 1 with quatMaxAbs > 0', p5ok], ['plant 6', 'pre-check removed -> first call refused, second call a VALUE (RED)', p6ok], ['plant 8', 'giSH write-back removed -> refusal naming 0 with giSH |delta| > 0 on both scratch scenes', p8ok], ['C2', 'syncShadows twice -> snapshot EQUAL, 0 DOM, 0 events', idem], ['scenes', 'S2p-scratch + S2m-slow: call(1)/call(0) VALUES with the snapshot EQUAL', scenesOk], ['V2 witness', 'giRestored names 1 iff delta > 0 (default scene) OR the S2p-scratch refusal names the cue', witnessOk]];
    console.log('SEAM-INERT plant table (plant | predicate | cell): ' + TABLE.map(([n, pr, ok]) => `${n} | ${pr} | ${ok ? 'PASS' : 'FAIL'}`).join(' || '));
    await chrome.eval('window.__seamObs && window.__seamObs.disconnect(); true').catch(() => null);
    if (!sync.c0) { console.log('SEAM-INERT NOT ARMED — event counters absent (tip has no __eventCounts' + (JSON.parse(s1).derived ? '' : ' and no __ballDerived') + '; the instrumented copy carries the proof)'); process.exitCode = 1; seamFailed = true; }
    else console.log(equal && mut === 0 && allPlants && evOk && JSON.parse(s1).derived ? 'SEAM-INERT ARMED (snapshot EQUAL strictly incl. the derived state, 0 DOM mutations, 0 machine events during the seam, plant 1 RED, plant 2 scene-neutral + idempotent at the pre-check, plants 3\' / 3\'\' / 5 REFUSED by name, plant 6 RED, syncShadows idempotent, S2p-scratch + S2m-slow MEASURABLE and scene-neutral, plant 8 RED on both)' : `SEAM-INERT NOT ARMED (equal=${equal} mutations=${mut} events-unchanged=${evOk} plant1-red=${planted} plant2=${p2ok} plant3'=${p3ok} plant3''=${p33ok} plant5=${p5ok} plant6=${p6ok} idempotence=${idem} derived-keys=${!!JSON.parse(s1).derived})`);
    if (!(equal && mut === 0 && allPlants && evOk && JSON.parse(s1).derived)) { process.exitCode = 1; seamFailed = true; console.log(`SEAM-INERT cells: equal=${equal} mutations=${mut} events-unchanged=${evOk} plant1-red=${planted} plant2=${p2ok} plant3'=${p3ok} plant3''=${p33ok} plant5=${p5ok} plant6=${p6ok} plant8=${p8ok} idempotence=${idem} scenes=${scenesOk} witness=${witnessOk} derived-keys=${!!JSON.parse(s1).derived}`); }
  }
  const warn = lines.find((l) => new RegExp('\\[arm\\] \\?obArm=' + ARM + ' ignored').test(l)) || null;
  console.log('DEFAULT BOOT + ?obArm=throat-off → pivot', e?.pivot, 'roll', e?.roll ? e.roll.distMm.toFixed(3) + ' mm' : null, '| min clearance', c && c.refused ? 'UNJUDGEABLE (refused by name: ' + (Array.isArray(c.ids) ? c.ids.join(',') : '?') + ')' : (c.minClearanceMm?.toFixed(3) + ' mm (' + c.atMesh + ')'), '| ignored-arm line:', warn ? 'YES — ' + warn.slice(0, 120) : 'NO');
  const l3Unjudgeable = !!(c && c.refused); const okAll = !!(e?.roll && !l3Unjudgeable && c.minClearanceMm > 0 && warn);
  if (l3Unjudgeable) { console.log('L3 DEFAULT-BOOT: UNJUDGEABLE (the clearance seam refused by name — not a verdict)'); process.exitCode = seamFailed ? 1 : 2; }
  else { console.log(okAll ? 'L3 DEFAULT-BOOT: ARM IGNORED (shipped motion, named)' : 'L3 DEFAULT-BOOT: UNEXPECTED'); process.exitCode = (okAll && !seamFailed) ? 0 : 1; } // the LAST exit-setting statement: a NOT ARMED seam keeps 1, a refusal keeps 2 (LAND-9 / LAND-10 K-B1)
} catch (er) { console.log('PROBE ERROR', er.message); process.exitCode = 1; /* LAND-9: a probe that throws must not exit 0 */ } finally { await chrome.closeAndWait(); await stopStaticServer(server); }
