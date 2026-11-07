// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-xw101-look — the XW101 track's FIRST Chrome look in the app (order 19 item 5, feature 037 / GH-650).
// Boots the app on the WPBSA 12 ft table with the XW101 slides track armed by URL (a scripted boot), lays a cue ball and a
// red on the line into the right middle pocket, shoots, and captures a frame sequence around the pocket-drop OWNERSHIP
// hand-off (game.js's poseSink guard → the module's pose) with the module's own readout (hand-off, ownership, poses).
// Not a gate: a look, storm disclosed. One Chrome, ports from OB_E2E_PORT / OB_E2E_CDP_PORT (defaults 8464 / 16464 in undeclared space; the ballreturn plan band 9460–9489 is applied by env / run-gate --band, #705).
//   node web/tools/e2e-xw101-look.mjs [--out <dir>] [--cam "x,y,z,tx,ty,tz,fov"] [--table <id>] [--track <id>]   (--out defaults to the lane's scratch, laneArtifactDir('obw-xw101-look', OB_E2E_CDP_PORT))   (order 20: any table / track; the snooker rules are activated on a snooker bed)
export const PORT_INVENTORY = { http: 1, cdp: 1 };
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { laneArtifactDir, launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const PORT = Number(process.env.OB_E2E_PORT ?? 8464);
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 16464);
// the artifact scratch rides the lane axis the ports do (GH-410 third leg / hygiene arm 8e (c), the #408 cross-lane wipe class): a
// fixed shared /tmp path let a foreign lane's suite-start wipe reach this look's frames; the default is now the lane's own dir
const OUT = arg('--out', laneArtifactDir('obw-xw101-look', CDP)); fs.mkdirSync(OUT, { recursive: true });
const TABLE = arg('--table', 'wpbsa_snooker_12ft'); const TRACKID = arg('--track', 'wpbsa_snooker_12ft-xw101-slides');
const CAM = arg('--cam', '2.35,0.30,1.40,1.82,-0.05,0.92,40').split(',').map(Number);
const TRACK = 'wpbsa_snooker_12ft-xw101-slides';
const log = (...a) => { const line = a.join(' '); console.log(line); fs.appendFileSync(path.join(OUT, 'look.log'), line + '\n'); };
log(`# xw101-look ${new Date().toISOString()} load1 ${os.loadavg()[0].toFixed(2)} (storm disclosed if > 12)`);

const server = spawnStaticServer(webDir, PORT);
await sleep(700);
let chrome = null;
try {
  const consoleErrors = [];
  chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1&norec=1&table=${TABLE}&ballreturn=${TRACKID}`, { port: CDP, width: 1280, height: 720 });
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
    else if (method === 'Runtime.exceptionThrown') consoleErrors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  });
  let ready = false;
  for (let i = 0; i < 250 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true').catch(() => false); }
  if (!ready) throw new Error('app never became ready');
  let ctl = null;
  for (let i = 0; i < 80 && !(ctl && ctl.reason !== 'pending'); i++) { await sleep(250); ctl = await chrome.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, armedBy: __ballreturn.armedBy, reason: __ballreturn.reason, tableId: __ballreturn.tableId, ownership: __ballreturn.track ? (__ballreturn.track.ownershipRequired ?? null) : undefined }) : null').catch(() => null); }
  log('ctl:', JSON.stringify(ctl));
  const hostHook = await chrome.eval('({ supported: __dbg?.game?.ballReturnOwnsSupported ?? null, hookSet: typeof (__dbg?.game?.ballReturnOwns) === "function", poseAt: typeof (__dbg?.game?.sinkPoseAt) === "function" })').catch(() => null);
  log('host hook:', JSON.stringify(hostHook));
  const snap = async (name) => { const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data, 'base64')); return name; };
  // The snooker RULES must be active: the default 9-ball set carries the 2.25 in ball (r 28.575 mm) and
  // the XW101 track is built for the 52.5 mm snooker ball (r 26.25) — the schema's V8 refuses the
  // 9-ball radius on the snooker table (first run, 2026-09-07: "the active ball radius 28.575 mm is not
  // the track's reference 26.250 mm"). e2e-snooker.mjs's boot: activateSnooker + the table rebuild.
  if (/snooker/.test(TABLE)) { const act = await chrome.eval("window.__rules && window.__rules.activateSnooker ? window.__rules.activateSnooker('wpbsa-snooker') : 'no __rules'"); if (act !== true) throw new Error('activateSnooker failed: ' + JSON.stringify(act)); }
  await sleep(800);
  ctl = null;
  for (let i = 0; i < 80 && !(ctl && ctl.reason !== 'pending' && ctl.enabled); i++) { await sleep(250); ctl = await chrome.eval('window.__ballreturn ? ({ enabled: __ballreturn.enabled, trackId: __ballreturn.trackId, reason: __ballreturn.reason, tableId: __ballreturn.tableId }) : null').catch(() => null); }
  log('ctl (snooker rules):', JSON.stringify(ctl));
  const furn = await chrome.eval(`(() => { const f = window.__ballreturn && __ballreturn.furniture; if (!f) return null; const ident = (name) => { const out = []; __dbg.scene.traverse((o) => { if (!o.isMesh) return; const n = o.name || (o.parent && o.parent.name) || o.type; if (n !== name || out.length >= 3) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); const sz = bb.getSize(bb.min.clone()); const c = bb.getCenter(bb.min.clone()); out.push({ geom: o.geometry.type, tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3, size: [sz.x, sz.y, sz.z].map((v) => +v.toFixed(3)), center: [c.x, c.y, c.z].map((v) => +v.toFixed(3)), chain: (() => { const ch = []; for (let q = o; q; q = q.parent) ch.push(q.name || q.type); return ch.slice(0, 4).join(' < '); })() }); }); return out; };
    return JSON.stringify({ evaluated: f.evaluated, why: f.why ?? null, stations: f.stations, meshes: f.meshes, n: f.violations.length, culled: f.culled ? f.culled.length : null, assemblyDeclared: f.assemblyDeclared ?? null, entrySegments: (f.entrySegments ?? []).map((e) => ({ route: e.route, runway: e.runway, sEnd: e.sEnd === null ? null : +(e.sEnd * 1e3).toFixed(1), whole: e.wholeRoute })), assemblyPass: (f.assemblyPass ?? []).length, assemblyPassByMesh: Object.entries((f.assemblyPass ?? []).reduce((a, v) => { a[v.mesh] = (a[v.mesh] ?? 0) + 1; return a; }, {})), byMesh: f.byMesh.map((m) => ({ mesh: m.mesh, hits: m.hits, inside: m.inside, worst: +(m.worstDepth * 1e3).toFixed(1), spans: m.spans.map((sp) => [sp.runway, +(sp.sMin * 1e3).toFixed(1), +(sp.sMax * 1e3).toFixed(1)]), ident: ident(m.mesh) })), evals: __ballreturn.stats.furnitureEvals, ms: +(f.ms ?? -1).toFixed(0), cost: f.cost ?? null }); })()`).catch((e) => 'ERR ' + e);
  log('V16 furniture read:', furn);
  // report-only (order 20, SNK-R28): the same read with the track's OWN hardware declared by name (--hardware a,b,c; V17 — the XW101
  // definition's block is the snooker lane's to add, so the controller's verdict above stands): what V16 names once the slide's
  // own wires, ring and straps are read apart
  const HW = (arg('--hardware', '') || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (HW.length) {
    const rep = await chrome.eval(`(async () => { const f = await import('./scene/ballreturn/furniture.js'); const t = window.__ballreturn && (__ballreturn.track || (__ballreturn.furniture && __ballreturn.furniture.__track)); const def = await (await fetch('./scene/ballreturn/tracks/${TRACKID}.json')).json(); const sch = await import('./scene/ballreturn/schema.js'); const tbl = await import('./scene/table.js'); const id = tbl.activeTableId(); const Gm = tbl.makeGeom(id); const cups = (Gm.pockets ?? []).map((p) => ({ x: p.x, z: p.z, r: p.r })); const falls = tbl.pocketVisualFalls ? tbl.pocketVisualFalls(id) : null; const built = sch.validateTrack(def, { pockets: cups, falls }); const r = built.refR; const read = await f.furnitureClearance({ track: built, r, scene: __dbg.scene, tableId: id + '#look', trackId: '${TRACKID}#hw', hardwareNames: ${JSON.stringify(HW)} }); return JSON.stringify({ n: read.violations.length, stations: read.stations, ms: +read.ms.toFixed(0), byMesh: read.byMesh.map((m) => ({ mesh: m.mesh, hits: m.hits, inside: m.inside, worst: +(m.worstDepth * 1e3).toFixed(1), spans: m.spans.map((sp) => [sp.runway, +(sp.sMin * 1e3).toFixed(1), +(sp.sMax * 1e3).toFixed(1)]) })), ownHardware: read.ownHardware.map((h) => ({ mesh: h.mesh, tris: h.triangles, dMin: +(h.dMin * 1e3).toFixed(2), at: h.at && { runway: h.at.runway, D: +(h.at.D * 1e3).toFixed(1) }, below: h.stationsBelowR })), reason: read.reason }); })()`).catch((e) => 'ERR ' + e);
    log('V16 report-only read with the hardware declared (' + HW.join(', ') + '):', rep);
  }
  if (!ctl || !ctl.enabled) {
    if (ctl && /\[V16\]/.test(ctl.reason ?? '')) { log('the track is REFUSED by V16 (order 20 item 0) — the look ends here: no ball is drawn through furniture'); await snap('00-refused-v16'); throw new Error('V16 refusal (expected until the re-route): ' + ctl.reason.slice(0, 200)); }
    throw new Error('track not enabled under the snooker rules: ' + JSON.stringify(ctl));
  }
  const ballR = await chrome.eval('__dbg?.game?.template?.system?.balls?.[0]?.params?.r ?? null');
  log('active ball r:', ballR);
  // the baked snooker pot lane (e2e-snooker.mjs, found offline against the committed wasm on the rack's
  // own options): the pocket-5 capture centre entered from a flat angle; cue 0.95 m out, object ball
  // 0.35 m short of the centre. Layout takes kernel (x, y).
  const CTR = { x: 0.9209965818486914, y: 1.8164965818486913 };
  const ANCHOR = { x: 0.25, y: 1.0 };
  const U = (() => { const dx = CTR.x - ANCHOR.x, dy = CTR.y - ANCHOR.y, n = Math.hypot(dx, dy); return { x: dx / n, y: dy / n }; })();
  const LANE = (t) => ({ x: CTR.x - U.x * t, y: CTR.y - U.y * t });
  const SPHI = Math.atan2(U.y, U.x);
  const LAYOUT = [{ id: 0, ...LANE(0.95) }, { id: 1, ...LANE(0.35) }];
  const SHOT = { v0: 2.5, phi: SPHI, theta: 0, a: 0, b: 0 };
  const lay = await chrome.eval(`__test.layout(${JSON.stringify(LAYOUT)})`).catch((e) => String(e));
  log('layout:', JSON.stringify(lay ?? 'ok'));
  await chrome.eval(`__test.camera(${CAM.join(',')})`).catch(() => {});
  await sleep(400); await snap('00-layout');
  const err = await chrome.eval(`__test.shoot(${JSON.stringify(SHOT)})`);
  if (err) throw new Error('shoot rejected: ' + err);
  await chrome.eval('__test.setManual(true)');
  const render = (t) => chrome.eval(`(__test.camera(${CAM.join(',')}), __test.renderAt(${t}, 1 / 60), 1)`);
  // drive the record by hand until the module reports a hand-off for ball 1 (or the record ends)
  let hand = null, t = 0;
  for (let k = 0; k < 400 && !hand; k++) { t = k * 0.02; await render(t); const hs = await chrome.eval('__ballreturn.handoffs()').catch(() => []); hand = (hs || []).find((h) => h.id === 1) ?? null; }
  const own = await chrome.eval('__ballreturn.ownership ? __ballreturn.ownership() : null').catch(() => null);
  const state = await chrome.eval('__test.state()').catch(() => null);
  log('handoff ball 1:', JSON.stringify(hand), '| ownership:', JSON.stringify(own), '| state:', state);
  if (!hand) { await snap('09-no-handoff'); log('no hand-off for ball 1 within 8 s of record time — layout / shot to adjust'); }
  else {
    const a1 = own?.arrivals?.find((a) => a.id === 1); const tOwn = a1?.own?.t ?? null; const tH = a1?.tH ?? hand.tH; const tLand = hand.tLand;
    const instants = [['01-pre', tH - 0.12], ['02-tOwn-minus', (tOwn ?? tH) - 0.02], ['03-tOwn', tOwn ?? tH], ['04-tH', tH + 0.001], ['05-tLand', tLand], ['06-plus300', tLand + 0.30], ['07-plus1000', tLand + 1.0], ['08-plus2500', tLand + 2.5]];
    const readout = [];
    for (const [name, tt] of instants) {
      await render(tt); await sleep(60);
      const balls = await chrome.eval('__test.balls().filter((b) => b.id <= 1).map((b) => ({ id: b.id, pocketed: b.pocketed, visible: b.visible, pos: b.pos.map((v) => +v.toFixed(4)), posed: !!b.marker, scale: +((__dbg?.game?.ballSet?.balls ?? []).find((x) => x.id === b.id)?.mesh?.scale?.x ?? -1).toFixed(3) }))').catch(() => null);
      const pose = await chrome.eval(`(() => { const p = __ballreturn.poseAt(1, ${tt}); return p ? { x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4), kind: p.kind, D: +(p.D * 1e3).toFixed(1) } : null; })()`).catch(() => null);
      await snap(name);
      readout.push({ name, t: +tt.toFixed(4), balls, modulePose: pose });
      log(name, tt.toFixed(4), JSON.stringify(balls), 'module', JSON.stringify(pose));
    }
    fs.writeFileSync(path.join(OUT, 'readout.json'), JSON.stringify({ ctl, hostHook, hand, own, tOwn, tH, tLand, instants: readout, consoleErrors, load1: os.loadavg()[0], when: new Date().toISOString() }, null, 2));
  }
  // where the module's ball IS on screen (order 19 item 5: the first frames showed no ball — occluded or off-frame?):
  // every mesh the module marked, its world position / scale / visibility chain, and its NDC through the app's camera
  const where = await chrome.eval(`(() => { const out = []; const cam = __dbg.camera; cam.updateMatrixWorld(true);
    __dbg.scene.updateMatrixWorld(true);
    __dbg.scene.traverse((o) => { if (!o.userData || !o.userData.obReturnPosed) return; const p = o.getWorldPosition(o.position.clone()); const n = p.clone().project(cam);
      let vis = true, chain = []; for (let q = o; q; q = q.parent) { chain.push((q.name || q.type) + (q.visible ? '' : '(hidden)')); if (!q.visible) vis = false; }
      out.push({ name: o.name || o.type, pos: [p.x, p.y, p.z].map((v) => +v.toFixed(4)), scale: +o.scale.x.toFixed(3), visibleChain: vis, chain: chain.slice(0, 4).join(' < '), ndc: [n.x, n.y, n.z].map((v) => +v.toFixed(3)), inFrustum: Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1 && n.z < 1 }); });
    return JSON.stringify(out); })()`).catch((e) => 'ERR ' + e);
  log('module balls on screen:', where);
  // what stands between the camera and the module's ball: every other mesh whose world AABB the camera→ball segment crosses
  // (a slab test on the boxes — a coarse occluder census, enough to name a leg or an apron)
  const occl = await chrome.eval(`(() => { const cam = __dbg.camera; const balls = []; __dbg.scene.traverse((o) => { if (o.userData && o.userData.obReturnPosed) balls.push(o); }); if (!balls.length) return 'no module ball';
    const b = balls[0]; const P = b.getWorldPosition(b.position.clone()); const C = cam.getWorldPosition(cam.position.clone()); const d = P.clone().sub(C); const L = d.length(); d.normalize();
    const hits = []; __dbg.scene.traverse((o) => { if (!o.isMesh || o === b || !o.visible || !o.geometry) return; let q = o; for (; q; q = q.parent) if (!q.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      let t0 = 0, t1 = L; for (const ax of ['x', 'y', 'z']) { const inv = 1 / d[ax]; let ta = (bb.min[ax] - C[ax]) * inv, tb = (bb.max[ax] - C[ax]) * inv; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return; }
      const size = bb.getSize(bb.min.clone()); hits.push({ name: o.name || o.parent?.name || o.type, at: +t0.toFixed(3), size: [size.x, size.y, size.z].map((v) => +v.toFixed(3)), center: bb.getCenter(bb.min.clone()).toArray().map((v) => +v.toFixed(3)), mat: o.material?.name || o.material?.type }); });
    hits.sort((a, b) => a.at - b.at); return JSON.stringify({ cam: C.toArray().map((v) => +v.toFixed(3)), ball: P.toArray().map((v) => +v.toFixed(4)), dist: +L.toFixed(3), hits: hits.slice(0, 12) }); })()`).catch((e) => 'ERR ' + e);
  log('occluders on the camera→ball segment:', occl);
  // the chutes against the table's legs (the first look found the p5 ball at rest INSIDE obSnkLeg's box): every leg's
  // world AABB vs every chute's centre path from the track definition (three frame: x = X/1000, y = Y/1000, z = Z/1000),
  // sampled every 5 mm — the overlapped span per chute, in mm along the chute
  const legs = await chrome.eval(`(() => { const out = []; __dbg.scene.traverse((o) => { if (!o.isMesh || !/leg/i.test(o.name || '')) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); out.push({ name: o.name, min: bb.min.toArray().map((v) => +v.toFixed(4)), max: bb.max.toArray().map((v) => +v.toFixed(4)) }); }); return JSON.stringify(out); })()`).catch((e) => 'ERR ' + e);
  const legBoxes = (() => { try { return JSON.parse(legs); } catch { return []; } })();
  const def = JSON.parse(fs.readFileSync(path.join(webDir, 'scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json'), 'utf8'));
  const overlaps = [];
  for (const rw of def.runways) {
    const pts = rw.points_mm.map((p) => p.map((v) => v / 1000)); let sAcc = 0; const hit = new Map();
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const n = Math.max(1, Math.round(L / 0.005));
      for (let k = 0; k <= n; k++) { const f = k / n; const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f; const s = sAcc + L * f;
        for (const lb of legBoxes) if (x >= lb.min[0] && x <= lb.max[0] && y >= lb.min[1] && y <= lb.max[1] && z >= lb.min[2] && z <= lb.max[2]) { const h = hit.get(lb.name) ?? { from: s, to: s }; h.to = s; if (s < h.from) h.from = s; hit.set(lb.name, h); } }
      sAcc += L; }
    for (const [name, h] of hit) overlaps.push({ chute: rw.id, leg: name, from_mm: +(h.from * 1e3).toFixed(1), to_mm: +(h.to * 1e3).toFixed(1), total_mm: +(sAcc * 1e3).toFixed(1) });
  }
  log('legs:', legBoxes.length, JSON.stringify(legBoxes.map((l) => ({ n: l.name, c: [0, 1, 2].map((i) => +((l.min[i] + l.max[i]) / 2).toFixed(3)), s: [0, 1, 2].map((i) => +(l.max[i] - l.min[i]).toFixed(3)) }))));
  log('chute × leg overlaps (wire centre path inside a leg box):', JSON.stringify(overlaps));
  fs.writeFileSync(path.join(OUT, 'leg-census.json'), JSON.stringify({ legs: legBoxes, overlaps }, null, 1));
  // e2e-ballreturn arm 13c's sweep, run on the XW101 track as a REPORT line (not a gate here): 26 rays of length r from every
  // 5 mm station of every route (and the fall leg) against every visible mesh but the debug visual, the aim overlay, the cue and the balls
  const sweep = await chrome.eval(`(async () => {
    const THREE = await import('three'); const tr = await import('./scene/ballreturn/track.js');
    const t = __ballreturn.track; const r = 0.02625; const scene = window.__dbg.scene; const meshes = [];
    scene.traverse((o) => { if (!o.isMesh || !o.visible) return; let p = o; let skip = false; while (p) { if (/^obBallReturnDebug/.test(p.name || '') || /^obAim|^obCueStick/.test(p.name || '')) skip = true; p = p.parent; } if (skip) return; if (o.geometry?.type === 'SphereGeometry') return; meshes.push(o); });
    const dirs = []; for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) { if (!x && !y && !z) continue; dirs.push(new THREE.Vector3(x, y, z).normalize()); }
    const rc = new THREE.Raycaster(); rc.far = r; rc.near = 0; let hits = 0, stations = 0; const byMesh = new Map(); const spans = new Map();
    const probe = (x, y, z, route, D) => { stations++; let hit = false; for (const d of dirs) { rc.set(new THREE.Vector3(x, y, z), d); const h = rc.intersectObjects(meshes, false); if (h.length) { hit = true; const n = h[0].object.name || h[0].object.parent?.name || 'mesh'; byMesh.set(n, (byMesh.get(n) ?? 0) + 1); } } if (hit) { hits++; const sp = spans.get(route) ?? { from: D, to: D }; sp.to = D; spans.set(route, sp); } };
    for (const [idx, route] of t.routes) { for (let D = 0; D <= route.total; D += 0.005) { const st = tr.stationAt(route, D, r, {}); probe(st.x, st.y, st.z, idx, D); } }
    return { hits, stations, meshes: meshes.length, byMesh: [...byMesh], spans: [...spans].map(([k, v]) => [k, +(v.from * 1e3).toFixed(1), +(v.to * 1e3).toFixed(1)]) };
  })()`).catch((e) => 'ERR ' + e);
  log('arm-13c sweep on the XW101 (stations with any ray hit):', JSON.stringify(sweep));
  log('console errors:', consoleErrors.length, JSON.stringify(consoleErrors.slice(0, 3)));
} catch (e) { log('ERROR', e.message); } finally { if (chrome) await chrome.closeAndWait(); await stopStaticServer(server); }
log('done');
