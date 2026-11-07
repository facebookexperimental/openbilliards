// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-pbcoarse.mjs — #1180 (from #1011): the replay player's coarse-pointer
// hit areas. Standalone (`node web/tools/e2e-pbcoarse.mjs` under run-gate).
//
// Every cell: two fired shots at the table (the real-user boot opens the hall a
//   few frames after the ready stamp; every cell waits for it, bounded, and
//   leaves it through Quick Play, the exit a replay launched from the wall
//   takes), the session opened straight into the player
//   (__archive.sessions()[0].id → __playback.openSession); the player never
//   stands over the open hall; no app error (__test.errors).
// PB-STRIP (844x390 and 667x375 coarse with the e2e-ui insets; 1180x820, a
//   coarse tablet, where the shelf pad is sp-4): a director-strip block's own box runs from the
//   scrub track's bottom edge down to TOUCH_REACH + 1 px above the player
//   shelf's edge (TOUCH_REACH: how far the browser's touch adjustment snaps a
//   touch onto a tappable edge, measured in 1 px steps; ruling 2026-10-29,
//   option (b), as amended). The PAINT stays the lane band: the fill is
//   clipped to the content box, which is the lane's band (its top and
//   height), the fill's corners keep 3 px (each vertical radius adds its
//   padding) and the outline / selected ring (::after) sits on the band. A point 1 px
//   above the track's edge hits the track, never a block; points 1 px below
//   the track's edge and 1 px above the box's bottom hit the block; the point
//   2 px under the box does not. A REAL tap halfway between the lane's bottom
//   and the box's bottom reaches the block and flips its selection. A
//   REAL drag starting 1 px below the shelf's edge reaches the scene canvas,
//   never the strip. Each touch's target is read by a window capture listener
//   installed before the app boots, so no app listener can hide it. Drags
//   starting TOUCH_REACH - 1 .. TOUCH_REACH + 2 px under the box are recorded
//   (the touch-adjustment profile).
// PB-TILES (844x390 and 667x375 coarse; the 1280x800 fine control): the save
//   card opens in SETUP (the destination tiles disabled), renderDrill is
//   stubbed with a 64-byte clip (the e2e-playback arm-3 stub), and a REAL
//   press on the Export CTA renders it. On the phones a tile stands outside
//   the card body's visible window at rest (the pinned foot covers it; else
//   the reveal is not exercised at that size and the cell fails); once the
//   tiles arm, they stand whole inside it and a tile's centre hit-tests to
//   the tile. The reveal never scrolls the page, and on the tall control
//   (the tiles already in view) not the card body either; its marker on the
//   destination row is a non-owning id, never the rendered clip.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, setPhoneMetrics, setSafeAreaInsets, tap, touchStart, touchMove, touchEnd } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// px: Chrome's touch adjustment snaps a touch whose contact is 20 px or less (CDP's default touch) up to this far from a
// tappable edge onto it (measured 2026-10-29 in 1 px steps at both phones; a wider contact reaches up to 15 px, the
// browser's cap); playback.css --ob-pb-touch-reach carries the same number
const TOUCH_REACH = 9;

const J = (o) => JSON.stringify(o);
const SA = { top: 0, left: 47, right: 47, bottom: 21 }; // the e2e-ui coarse insets
const SA_TABLET = { top: 0, left: 0, right: 0, bottom: 20 }; // a tablet's home-indicator inset
let failCount = 0;
const fail = (m) => { failCount += 1; console.error('E2E-PBCOARSE FAIL:', m); process.exitCode = 1; };
const ok = (m) => console.log('E2E-PBCOARSE OK:', m);

async function waitPortFree(port, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const busy = await new Promise((res) => { const s = net.connect({ port, host: '127.0.0.1' }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
    if (!busy) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(250);
  }
}
async function waitExpr(c, expr, tries = 60, ms = 150) {
  for (let i = 0; i < tries; i++) { try { if (await c.eval(expr)) return true; } catch { /* navigating */ } await sleep(ms); }
  return false;
}
async function fire(c, shot) {
  let err = null;
  for (let i = 0; i < 20; i++) {
    err = await c.eval(`__test.shoot(${J(shot)})`);
    if (!err || !/aiming state/.test(String(err))) break;
    await sleep(500);
  }
  if (err) return `rejected: ${err}`;
  let state = 'PLAYBACK';
  for (let i = 0; i < 200 && (state === 'PLAYBACK' || state === 'SIMULATING'); i++) { await sleep(300); state = await c.eval('__test.state()'); }
  return state;
}
async function mouseClick(c, x, y) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(40);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
/** boot, two shots, the archive flushed, the session straight into the player */
async function openPlayer(c, tag) {
  if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: boot never ready`); return false; }
  // the real-user boot opens the hall a few frames after the ready stamp (the boot overlay's fade; later when shell.js
  // lands late): wait for it, bounded (e2e-aim.mjs crossShell), then leave it through Quick Play (exitToTable, the wall
  // launch's own exit), so the player opens over the table and never over the hall's window-capture input gate
  if (await waitExpr(c, 'window.__shell?.isOpen?.() === true', 50, 200)) {
    if (await c.eval('window.__shell.quickPlay()') !== true) { fail(`${tag}: the hall refused Quick Play`); return false; }
    if (!(await waitExpr(c, 'window.__shell.isOpen() === false', 25, 200))) { fail(`${tag}: the hall never closed`); return false; }
    await sleep(400);
  }
  for (const shot of [{ v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 }, { v0: 1.4, phi: -0.9, theta: 0, a: 0, b: 0 }]) {
    const st = await fire(c, shot);
    if (/rejected|PLAYBACK|SIMULATING/.test(st)) { fail(`${tag}: a shot did not settle (${st})`); return false; }
  }
  await c.eval('window.__archive.flush()');
  const sid = await c.eval('(async () => (await window.__archive.sessions())[0]?.id ?? null)()').catch(() => null);
  if (sid === null) { fail(`${tag}: no archived session`); return false; }
  await c.eval(`window.__playback.openSession(${J(sid)})`);
  if (!(await waitExpr(c, 'window.__playback.playerOpen() === true', 60, 200))) { fail(`${tag}: the player never opened`); return false; }
  if (await c.eval('window.__playback.state()?.playing === true')) await c.eval(`document.querySelector('.ob-pb-play')?.click(), true`);
  await c.eval('window.__playback.seek(0), true');
  await sleep(600);
  return true;
}
const NAME = `(h) => (h ? (h.id ? '#' + h.id : h.tagName.toLowerCase() + '.' + String(h.className && h.className.baseVal !== undefined ? h.className.baseVal : h.className || '').trim().split(/\\s+/).join('.')) : null)`;
// the first window capture listener of every touch (installed before the app's own scripts): the pointerdown target
// after the browser's touch adjustment, which no app listener can hide
const REC = `(() => { const N = ${NAME}; window.__pbDown = [];
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') window.__pbDown.push(N(e.target)
    + (e.target.closest?.('.ob-pb-strip') ? ' [strip]' : '')); }, { capture: true }); })()`;
async function launchRecPhone(appUrl, cdpPort, width, height, deviceScaleFactor = 3) {
  const client = await launchChrome(new URL(appUrl).origin + '/', { port: cdpPort, tool: false });
  await setPhoneMetrics(client, { width, height, deviceScaleFactor });
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: REC });
  await client.send('Page.navigate', { url: appUrl });
  return client;
}
const GEO = `(() => { const N = ${NAME};
  const R = (el) => { if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const block = document.querySelector('.ob-pb-strip .ob-pb-strip-block'), track = document.querySelector('.ob-pb-track'), lane = document.querySelector('.ob-pb-strip');
  const shelf = lane ? lane.closest('.ob-pb-shelf') : null;
  const br = R(block), tr = R(track), sr = R(shelf);
  const x = br ? br.l + Math.min(br.w / 2, 60) : null;
  const at = (y) => { const h = document.elementFromPoint(x, y); return { y: +y.toFixed(1), hit: N(h), block: !!h && !!block && (h === block || block.contains(h)), track: !!h && !!track && (h === track || track.contains(h)), strip: !!h && !!lane && lane.contains(h) }; };
  return { block: br, track: tr, lane: R(lane), shelf: sr, x, sel: !!block?.classList.contains('ob-pb-strip--sel'), hall: window.__shell?.isOpen?.() ?? null,
    probes: br && tr && sr ? { above: at(tr.b - 1), top: at(tr.b + 1), deep: at(br.b - 1), under: at(br.b + 2), scene: at(sr.b + 1) } : null }; })()`;

// the block's paint: the fill's clip, its band against the lane, its corners, the ::after outline / ring
const PAINT = `(() => { const b = document.querySelector('.ob-pb-strip .ob-pb-strip-block'), lane = document.querySelector('.ob-pb-strip');
  if (!b || !lane) return null; const cs = getComputedStyle(b), ca = getComputedStyle(b, '::after');
  const px = (v) => parseFloat(v) || 0; const rad = (v) => { const p = String(v).split(/\\s+/).map(px); return { h: p[0], v: p[1] ?? p[0] }; };
  const br = b.getBoundingClientRect(), lr = lane.getBoundingClientRect(), pt = px(cs.paddingTop), pb = px(cs.paddingBottom);
  return { clip: cs.backgroundClip, bandT: br.top + pt, bandH: br.height - pt - pb, laneT: lr.top, laneH: lr.height, pt, pb,
    tl: rad(cs.borderTopLeftRadius), bl: rad(cs.borderBottomLeftRadius), after: { content: ca.content, top: px(ca.top), h: px(ca.height) } }; })()`;
function paintFaults(p) {
  if (!p) return ['unreadable'];
  const f = [], near = (a, b) => Math.abs(a - b) <= 0.75;
  if (p.clip !== 'content-box') f.push(`the fill is clipped to ${p.clip}, not the content box`);
  if (!near(p.bandT, p.laneT) || !near(p.bandH, p.laneH)) f.push(`the band ${p.bandT}+${p.bandH} is not the lane ${p.laneT}+${p.laneH}`);
  if (!near(p.tl.h, 3) || !near(p.tl.v - p.pt, 3) || !near(p.bl.h, 3) || !near(p.bl.v - p.pb, 3)) f.push(`the fill's corners are not 3 px (${p.tl.h}/${p.tl.v} over ${p.pt}, ${p.bl.h}/${p.bl.v} over ${p.pb})`);
  if (p.after.content === 'none' || !near(p.after.top, p.pt) || !near(p.after.h, p.laneH)) f.push(`the outline is not on the band (::after ${p.after.content} top ${p.after.top} height ${p.after.h})`);
  return f;
}

async function stripCell(PORT, CDP_PORT, w, h, insets = SA, dsf = 3) {
  const tag = `PB-STRIP ${w}x${h}`;
  if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port busy`); return; }
  const c = await launchRecPhone(`http://127.0.0.1:${PORT}/app.html?seed=1&archive=1&u=pbstrip_${w}`, CDP_PORT, w, h, dsf);
  try {
    await setSafeAreaInsets(c, insets);
    if (!(await openPlayer(c, tag))) return;
    if (!(await waitExpr(c, '!!document.querySelector(".ob-pb-strip .ob-pb-strip-block")', 60, 200))) { fail(`${tag}: no strip block`); return; }
    await sleep(400);
    const g = await c.eval(GEO);
    const paint = await c.eval(PAINT);
    console.log(`${tag}: block ${J(g.block)} track ${J(g.track)} lane ${J(g.lane)} shelf ${J(g.shelf)} probes ${J(g.probes)} paint ${J(paint)}`);
    if (!g.block || !g.track || !g.shelf || !g.probes) { fail(`${tag}: geometry unreadable`); return; }
    const bad = [];
    if (g.hall === true) bad.push('the player stands over the open hall (its input gate claims scene presses)');
    if (Math.abs(g.block.t - g.track.b) > 0.75) bad.push(`the block's top ${g.block.t} is not the track's edge ${g.track.b}`);
    if (Math.abs(g.block.b - (g.shelf.b - (TOUCH_REACH + 1))) > 0.75) bad.push(`the block's bottom ${g.block.b} is not ${TOUCH_REACH + 1} px above the shelf's edge ${g.shelf.b}`);
    if (g.lane && g.lane.h > 15) bad.push(`the painted lane grew to ${g.lane.h} px`);
    const pf = paintFaults(paint);
    if (pf.length) bad.push(`the block's paint is not the lane band: ${pf.join('; ')}`);
    if (g.probes.above.block || !g.probes.above.track) bad.push(`1 px above the track's edge hits ${g.probes.above.hit}, not the track`);
    if (!g.probes.top.block) bad.push(`1 px below the track's edge hits ${g.probes.top.hit}, not the block`);
    if (!g.probes.deep.block) bad.push(`1 px above the box's bottom hits ${g.probes.deep.hit}, not the block`);
    if (g.probes.under.block || g.probes.under.strip) bad.push(`2 px under the box hits ${g.probes.under.hit} (the strip)`);
    if (g.probes.scene.strip || !/^canvas/.test(String(g.probes.scene.hit))) bad.push(`1 px below the shelf's edge is ${g.probes.scene.hit}, not the scene canvas`);
    // REAL touches, judged by the pointerdown target the recorder reads: a tap halfway between the lane's bottom and the
    // box's bottom (under the painted lane, inside the box) reaches the block and selects it
    const ARM = 'window.__pbDown.length = 0, true';
    const firstDown = () => c.eval('window.__pbDown[0] ?? null');
    const selected = () => c.eval(`document.querySelector('.ob-pb-strip-block')?.classList.contains('ob-pb-strip--sel') === true`);
    const sel0 = await selected();
    const tapY = Math.round((g.lane.b + g.block.b) / 2);
    await c.eval(ARM);
    await tap(c, g.x, tapY);
    await sleep(300);
    const inTap = await firstDown();
    const sel1 = await selected();
    if (!/\[strip\]/.test(String(inTap)) || !/ob-pb-strip-block/.test(String(inTap))) bad.push(`a real tap at y ${tapY} (halfway between the lane's bottom and the box's bottom) reached ${inTap}, not the block`);
    if (sel1 === sel0) bad.push(`a real tap at y ${tapY} did not change the block's selection (${sel0} → ${sel1})`);
    // REAL drags (touchStart, 20 px down in 5 moves, touchEnd), judged by the pointerdown target: the one starting 1 px
    // below the shelf's edge reaches the scene canvas, never the strip (the law: an aim drag starting there is the
    // scene's); the ones starting TOUCH_REACH - 1 .. TOUCH_REACH + 2 px under the box are recorded
    const drag = async (y0) => {
      await c.eval(ARM);
      await touchStart(c, [{ x: g.x, y: y0, id: 1 }]);
      for (let k = 1; k <= 5; k++) { await touchMove(c, [{ x: g.x, y: y0 + 4 * k, id: 1 }]); await sleep(16); }
      await touchEnd(c);
      await sleep(250);
      return firstDown();
    };
    const sceneDrag = await drag(g.shelf.b + 1);
    if (/\[strip\]/.test(String(sceneDrag)) || !/^canvas/.test(String(sceneDrag))) bad.push(`a real drag starting 1 px below the shelf's edge reached ${sceneDrag}, not the scene canvas`);
    const profile = [];
    for (const off of [TOUCH_REACH - 1, TOUCH_REACH, TOUCH_REACH + 1, TOUCH_REACH + 2]) profile.push({ off, target: await drag(g.block.b + off) });
    console.log(`${tag}: drag 1 px below the shelf's edge -> ${sceneDrag}; profile under the box (bottom ${g.block.b}): ${profile.map((p) => `+${p.off} ${p.target}`).join(' | ')}`);
    g.taps = { inTap, sceneDrag, profile };
    const errs = await c.eval('window.__test?.errors ?? []').catch(() => ['(unreadable)']);
    if (errs.length) bad.push(`app errors ${J(errs).slice(0, 300)}`);
    if (bad.length) for (const b of bad) fail(`${tag}: ${b}`);
    else ok(`${tag}: the block's box is ${g.block.t.toFixed(1)}–${g.block.b.toFixed(1)} (${g.block.h.toFixed(1)} px from the track's edge to ${TOUCH_REACH + 1} px above the shelf's edge ${g.shelf.b}; the lane ${g.lane.t}–${g.lane.b}); the track keeps its edge; a real tap under the lane reaches ${g.taps.inTap} and flips the selection; a real drag 1 px below the shelf's edge reaches ${g.taps.sceneDrag}`);
  } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
}

const STUB = `(() => {
  window.__export.renderDrill = async (records, opts) => {
    opts.onProgress?.(30, 60, 16); opts.onProgress?.(60, 60, 16);
    return { blob: new Blob([new Uint8Array(64)], { type: 'video/mp4' }), size: 64, frames: 60, clipSec: 1, ext: 'mp4',
      wallSec: 0.1, segments: [30, 30], montageRate: 1 };
  };
  return true;
})()`;
const TILES = `(() => { const N = ${NAME}; const card = document.getElementById('ob-pb-card'); const body = card?.querySelector('.ob-pb-card-body');
  if (!body) return null; const br = body.getBoundingClientRect();
  const tiles = [...card.querySelectorAll('.ob-pb-dest')].map((t) => { const r = t.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const hit = document.elementFromPoint(cx, cy);
    return { t: +r.top.toFixed(1), b: +r.bottom.toFixed(1), whole: r.top >= br.top - 0.5 && r.bottom <= br.bottom + 0.5, self: !!hit && (hit === t || t.contains(hit)), hit: N(hit), disabled: t.disabled }; });
  return { body: { t: +br.top.toFixed(1), b: +br.bottom.toFixed(1) }, scrollTop: body.scrollTop, scrollH: body.scrollHeight, client: body.clientHeight, mode: window.__playback.exportMode?.() ?? null, tiles,
    page: { x: scrollX, y: scrollY, doc: document.scrollingElement ? document.scrollingElement.scrollTop : 0 }, hall: window.__shell?.isOpen?.() ?? null,
    marker: (() => { const m = card.querySelector('.ob-pb-dests')?.obRevealed; return m === undefined ? 'unset' : m !== null && typeof m === 'object' ? (m instanceof Blob ? 'Blob' : 'object') : typeof m; })() }; })()`;

async function tilesCell(PORT, CDP_PORT, w, h, phone) {
  const tag = `PB-TILES ${w}x${h}${phone ? '' : ' (fine control)'}`;
  if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port busy`); return; }
  const url = `http://127.0.0.1:${PORT}/app.html?seed=1&archive=1&u=pbtiles_${w}`;
  const c = phone ? await launchPhone(url, { cdpPort: CDP_PORT, width: w, height: h, tool: false })
    : await launchChrome(url, { port: CDP_PORT, width: w, height: h, tool: false });
  try {
    if (phone) await setSafeAreaInsets(c, SA);
    if (!(await openPlayer(c, tag))) return;
    await c.eval(STUB);
    await c.eval('window.__playback.save()');
    if (!(await waitExpr(c, 'window.__playback.cardOpen() === true && !!document.querySelector("#ob-pb-card .ob-pb-card-body")', 60, 200))) { fail(`${tag}: the save card never opened`); return; }
    // the Export CTA is disabled while the encoder probe runs (e2e-playback ctaArmed)
    if (!(await waitExpr(c, `(() => { const b = document.querySelector('#ob-pb-card .ob-pb-go'); return !!b && b.disabled === false; })()`, 80, 200))) { fail(`${tag}: the Export CTA never armed`); return; }
    await sleep(400);
    const before = await c.eval(TILES);
    const go = await c.eval(`(() => { const b = document.querySelector('#ob-pb-card .ob-pb-go'); b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { x: r.left + r.width / 2, y: r.top + r.height / 2, self: !!hit && (hit === b || b.contains(hit)) }; })()`);
    if (!go.self) { fail(`${tag}: the Export CTA is not hittable (${J(go)})`); return; }
    const scrollAtPress = await c.eval(`document.querySelector('#ob-pb-card .ob-pb-card-body').scrollTop`);
    if (phone) await tap(c, go.x, go.y); else await mouseClick(c, go.x, go.y);
    const armed = await waitExpr(c, `[...document.querySelectorAll('#ob-pb-card .ob-pb-dest')].some((t) => !t.disabled)`, 80, 200);
    await sleep(600);
    const after = await c.eval(TILES);
    console.log(`${tag}: before ${J(before)} after ${J(after)} (scroll at the press ${scrollAtPress})`);
    const bad = [];
    if (before?.hall === true || after?.hall === true) bad.push('the player stands over the open hall (its input gate claims scene presses)');
    if (phone && !(before?.tiles.length && before.tiles.some((t) => !t.whole))) bad.push('the reveal is not exercised at this size: every tile stood whole in the body\'s window at rest');
    if (before && after && J(before.page) !== J(after.page)) bad.push(`the reveal scrolled the page (${J(before.page)} → ${J(after.page)})`);
    if (!armed) bad.push('the tiles never armed after the render');
    if (after && (after.marker === 'Blob' || after.marker === 'object')) bad.push(`the destination row's reveal marker holds the rendered clip (a ${after.marker}): it must be a non-owning id, so the clip lives only as long as the card's own release keeps it`);
    else if (!after.tiles.length) bad.push('no destination tile');
    else {
      for (const t of after.tiles) {
        if (!t.whole) bad.push(`a tile stands at ${t.t}–${t.b}, not whole inside the body's window ${after.body.t}–${after.body.b}`);
        if (!t.self) bad.push(`a tile's centre hit-tests to ${t.hit}`);
      }
      if (!phone && after.scrollTop !== scrollAtPress) bad.push(`the tall control's body scrolled (${scrollAtPress} → ${after.scrollTop})`);
    }
    if (!phone) console.log(`${tag}: the card body ${after?.scrollH > after?.client ? 'overflows' : 'does not overflow'} (scroll height ${after?.scrollH}, window ${after?.client}); the tiles stood ${before?.tiles.every((t) => t.whole) ? 'whole' : 'not whole'} at rest`);
    const errs = await c.eval('window.__test?.errors ?? []').catch(() => ['(unreadable)']);
    if (errs.length) bad.push(`app errors ${J(errs).slice(0, 300)}`);
    if (bad.length) for (const b of bad) fail(`${tag}: ${b}`);
    else ok(`${tag}: after the render every tile is whole in the body's window (body ${after.body.t}–${after.body.b}, scrollTop ${scrollAtPress} → ${after.scrollTop}) and its centre is the tile; the page did not scroll`);
  } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8361);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 26480);
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try {
    await stripCell(PORT, CDP_PORT, 844, 390);
    await stripCell(PORT, CDP_PORT, 667, 375);
    await stripCell(PORT, CDP_PORT, 1180, 820, SA_TABLET, 2);
    await tilesCell(PORT, CDP_PORT, 844, 390, true);
    await tilesCell(PORT, CDP_PORT, 667, 375, true);
    await tilesCell(PORT, CDP_PORT, 1280, 800, false);
  } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(failCount ? `E2E-PBCOARSE: FAILED (${failCount})` : 'E2E-PBCOARSE: PASS');
}
