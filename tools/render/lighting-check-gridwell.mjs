#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-check-gridwell.mjs — ORDER-LIGHT-C2-FIX7 class L (refuter code F1, P2): the grid-well (h) splice witness binds to the splice-failure branch.
// L1: DEFAULT boots (no cinema / obtool) of the two venue-term tables in both looks print ZERO `[shading] grid-well (h) splice` warnings and compile
//     the (h) block on every ball program (the programs census reads it: gridWell = the ball count). L2: a scripted boot with the (h) anchor made
//     unmatchable (`?gridWellAnchor=broken`) prints the witness WITH and WITHOUT `?venueGridDebug=split` and compiles NO (h) block.
// Exit 14 on any violation. Arm (OB_GRIDWELL_ARM=legacy): the L1 boots are made SCRIPTED with `?gridWellWitness=legacy` (the 85f77c16 binding put
// back, the splice intact) — the check must read one warning per boot and FAIL (exit 14): a check that cannot red is not a gate. The look is selected the
// way lighting-capture.mjs selects it (`look=<default|sp>` on the boot URL); a DEFAULT boot registers the service worker and reloads once.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand } from '../../web/tools/cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');
const webDir = process.env.OB_LIGHTING_WEB ?? path.join(REPO, 'web');
// ci-bands-lint: this class-D step boots the SAME lane window as lighting-capture.mjs ON PURPOSE (the seal runs it on the lane band, one Chrome at a time)
export const SHARED_DEFAULT_WINDOW = 'lighting';
export const PORT_OVERRIDES = { http: 'OB_LIGHTING_PORT', cdp: 'OB_LIGHTING_CDP' };
const band = await claimPortBand(Number(process.env.OB_LIGHTING_BAND_START ?? 16940), Number(process.env.OB_LIGHTING_BAND_END ?? 16969), { layout: false });
const PORT = Number(process.env.OB_LIGHTING_PORT ?? 16940);
const CDPP = Number(process.env.OB_LIGHTING_CDP ?? 16941);
const ARM = process.env.OB_GRIDWELL_ARM === 'legacy';
// ORDER-LIGHT-C2-FIX10 class C (review r10 P3): main.js recognises only look=green and look=sp; a boot asked for look=default falls back to SP, so the
// two-look L1 coverage was one look twice. The query maps 'default' → 'green' exactly as lighting-capture.mjs does (bootLook = look === 'sp' ? 'sp' : 'green'),
// the RESOLVED look is read back from the page (window.__lighting.state().look: 'default' for green, 'sp' for sp) and the two L1 cases must resolve
// DIFFERENTLY — a coverage claim inherits the resolution of its own query string. Arm OB_GRIDWELL_ARM=look: both cases requested as look=default (the
// pre-FIX10 query) → both resolve sp → identical → exit 14.
const LOOK_ARM = process.env.OB_GRIDWELL_ARM === 'look';
const lookQuery = (lk) => (LOOK_ARM ? 'default' : (lk === 'sp' ? 'sp' : 'green'));
const TABLES = ['predator_apex_9ft', 'wpa_spec_9ft']; const LOOKS = ['default', 'sp'];
const WITNESS = '[shading] grid-well (h) splice';
// the programs census of the ball materials: how many ball programs carry the (h) block (its GLSL comment marker) and how many balls there are
const PROGS_SRC = `(async () => {
  for (let i = 0; i < 600; i++) { if (window.__test && window.__test.ready) break; await new Promise((r) => setTimeout(r, 100)); }
  const d = window.__dbg; if (!d) return { error: 'no __dbg' };
  const gl = d.renderer.getContext(), props = d.renderer.properties; let balls = 0, withH = 0, noProg = 0;
  d.scene.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.userData || !o.material.userData.giSH) return; balls++;
    const mp = props.get(o.material); const prog = mp && mp.currentProgram; if (!prog) { noProg++; return; }
    let src = ''; try { src = gl.getShaderSource(prog.fragmentShader) || ''; } catch (e) { src = ''; }
    if (src.indexOf('OB-C2F5 grid-well (h)') >= 0 || src.indexOf('OB-C2F6 grid-well (h)') >= 0) withH++;
  });
  return { ready: !!(window.__test && window.__test.ready), balls, withH, noProg, scripted: (() => { try { return sessionStorage.getItem('ob-scripted') === '1'; } catch (e) { return null; } })() };
})()`;
const server = spawnStaticServer(webDir, PORT); await sleep(700);
let rc = 0; const rows = [];
try {
  const boot = async (label, qs, scripted) => {
    const warns = [];
    const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?${qs}`, { port: CDPP, width: 960, height: 540, tool: scripted });
    try {
      chrome.onEvent((method, params) => {
        if (method === 'Runtime.consoleAPICalled') { const txt = (params.args || []).map((a) => a.value ?? a.description ?? '').join(' '); if (txt.indexOf(WITNESS) >= 0) warns.push(txt.slice(0, 160)); }
      });
      let ready = false;
      for (let i = 0; i < 180 && !ready; i++) { try { ready = await chrome.eval('!!(window.__test && window.__test.ready && window.__dbg)'); } catch (e) { ready = false; } if (!ready) await sleep(500); }
      await sleep(1500); // the ball programs compile on the first frames after readiness; a late witness would land here
      const r = await chrome.eval(PROGS_SRC);
      try { r.look = await chrome.eval("(window.__lighting && typeof window.__lighting.state === 'function') ? String(window.__lighting.state().look) : null"); } catch (e) { r.look = null; }
      const row = { label, qs, ready: r.ready, scripted: r.scripted, balls: r.balls, withH: r.withH, noProg: r.noProg, warnings: warns.length, first: warns[0] || '', look: r.look };
      rows.push(row);
      console.log(`[check-gridwell] ${label}: resolved look ${row.look} ready ${row.ready} scripted-pin ${row.scripted} balls ${row.balls} withH ${row.withH} noProg ${row.noProg} warnings ${row.warnings}${row.first ? ' first: ' + JSON.stringify(row.first) : ''}`);
      return row;
    } finally { await chrome.closeAndWait(); }
  };
  // L1 (or the arm: the same boots made scripted with the legacy binding)
  const resolvedByTable = {};
  for (const t of TABLES) for (const lk of LOOKS) {
    const qs = `table=${t}&seed=7&look=${lookQuery(lk)}` + (ARM ? '&cinema=1&gridWellWitness=legacy' : '');
    const r = await boot(ARM ? `L3 ARM scripted boot ${t}/${lk} (gridWellWitness=legacy)` : `L1 default boot ${t}/${lk}`, qs, ARM);
    if (!r.ready || r.noProg) { console.log(`[check-gridwell] VIOLATION: ${t}/${lk} did not publish a ready ball program set`); rc = 14; }
    if (r.warnings !== 0) { console.log(`[check-gridwell] VIOLATION: ${t}/${lk} printed ${r.warnings} grid-well witness(es) with the splice intact`); rc = 14; }
    (resolvedByTable[t] = resolvedByTable[t] || {})[lk] = r.look;
    if (r.balls === 0 || r.withH !== r.balls) { console.log(`[check-gridwell] VIOLATION: ${t}/${lk} compiled the (h) block on ${r.withH} of ${r.balls} ball programs`); rc = 14; }
  }
  // C2-FIX10 class C: the two L1 cases of each table must have RESOLVED to two different looks (requested 'default' → green resolves 'default'; 'sp' resolves 'sp')
  for (const t of TABLES) {
    const looks = resolvedByTable[t] || {}; const vals = LOOKS.map((lk) => looks[lk]);
    if (vals.some((v) => v == null)) { console.log(`[check-gridwell] VIOLATION: ${t}: a resolved look could not be read (${JSON.stringify(looks)}) — coverage unproven`); rc = 14; }
    else if (new Set(vals).size !== LOOKS.length) { console.log(`[check-gridwell] VIOLATION: ${t}: the ${LOOKS.length} L1 look cases resolved to the SAME look ${JSON.stringify(looks)} — one look tested twice (the query '${LOOK_ARM ? 'look=default' : 'look=green'}' resolution)`); rc = 14; }
    else console.log(`[check-gridwell] ${t}: L1 looks resolved ${JSON.stringify(looks)} — two distinct looks covered`);
  }
  if (!ARM) {
    // L2: the planted splice failure must print the witness in BOTH modes and compile no (h) block
    for (const [label, extra] of [['L2 broken anchor (no debug flag)', ''], ['L2 broken anchor + venueGridDebug=split', '&venueGridDebug=split']]) {
      const r = await boot(`${label} predator_apex_9ft/default`, `table=predator_apex_9ft&seed=7&look=default&cinema=1&gridWellAnchor=broken${extra}`, true);
      if (r.warnings < 1) { console.log(`[check-gridwell] VIOLATION: ${label}: the witness did not fire on a failed splice`); rc = 14; }
      if (r.withH !== 0) { console.log(`[check-gridwell] VIOLATION: ${label}: the (h) block still compiled on ${r.withH} programs under the broken anchor`); rc = 14; }
    }
  }
  if (LOOK_ARM) console.log(rc === 0 ? '[check-gridwell] ARM look DEAD: both L1 cases requested as look=default resolved to two different looks (exit 0 — a failed proof)' : '[check-gridwell] ARM look FIRED: both L1 cases requested as look=default resolved to the same look — exit 14');
  else if (rc === 0) console.log(ARM ? '[check-gridwell] ARM DEAD: the legacy binding printed no witness on the intact splice (exit 0 — a failed proof)' : '[check-gridwell] PASS — L1: zero grid-well witnesses on 4 default boots with the (h) block on every ball program; L2: the planted failure prints the witness with and without the debug flag and compiles no (h) block');
  else console.log(ARM ? '[check-gridwell] ARM FIRED: the 85f77c16 binding printed the witness on boots whose splice is intact — exit 14' : '[check-gridwell] FAIL — exit 14');
} catch (e) { console.log('[check-gridwell] ERROR ' + (e && e.stack || e)); rc = 14; }
finally { await stopStaticServer(server); band.release(); }
process.exit(rc);
