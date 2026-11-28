// Copyright (c) Meta Platforms, Inc. and affiliates.

// census-490-tables.mjs — the per-table MESH + MATERIAL identity census (the seal's
// fence).  Boots one table in chrome-headless-shell, walks the table group and
// the dm-* meshes, and writes one record per mesh: its name, a hash of its
// world-space positions + indices (geometry identity) and, per material (or per
// group material), the material's class, colour, emissive, roughness,
// metalness, envMapIntensity, clearcoat (+ roughness), sheen, normalScale,
// bumpScale, side/transparent/opacity and every map's identity (image source
// URL + size, or a sampled pixel hash for data / canvas textures) — so a
// global material edit that leaks into another table is caught even when every
// mesh hash is unchanged (maintainer fence law, Diamond review round 4 P1).
//
// Census schema v2 (review round 12 P2-c — the fence must cover the WHOLE mesh, not
// just positions + index + material scalars):
//   mesh.geo   FNV over world-space positions + index (unchanged from v1)
//   mesh.attr  FNV over EVERY other geometry attribute (normal, uv, uv1, uv2, color,
//              tangent, skinIndex, skinWeight, ... — sorted key order; name + itemSize
//              + normalized + values, floats toFixed(6), ints raw), the morph
//              attributes (sorted keys, each target array), morphTargetsRelative,
//              drawRange and the 16 world-matrix elements (toFixed(6))
//   mesh.flags {visible, renderOrder, castShadow, receiveShadow, frustumCulled,
//              layers (mask), matrixAutoUpdate}
//   map.pix    for URL-backed images: {w, h, hash} — the image drawn into a canvas at
//              min(w,128) x min(h,128) and its RGBA bytes FNV-hashed, so a re-authored
//              texture that keeps its URL and size is still caught ({err} when the
//              canvas is tainted / the image is not decodable)
//   doc.schema 2
//
//   node tools/render/census-490-tables.mjs --table <id> --web <dir> --out <json>
//        [--switch-to <id>]   (FIX5 arm: after the boot table is certified, the page switches to <id> through
//          __settings.changeEquipment('table_id', …); the built-id beacon must then certify <id> and REFUSE the
//          boot id by name — a beacon that stays at its boot value fails the arm; the census written is <id>'s,
//          with switched_from recorded, at --out or the default <id>.switched.json — NEVER the fence's <id>.json:
//          a switched census is arm evidence under the boot table's environment, and fence-judge-490 refuses it)
//        [--perturb material|normal|flag|uv|tangent|color|groups]   (the red arms — the judge must go RED on
//          uv/tangent/color: the first census mesh's attribute is nudged (or added when absent) — arms mesh.attr;
//          groups: the first census mesh's first group shrinks (or a group is added) — arms the groups row;
//                                            every non-target table under each one)
//          material: every standard/physical material's roughness is nudged by +0.01
//                    in the page before the read            (arms the material record)
//          normal:   the sign of ONE vertex normal is flipped (needsUpdate) on the first
//                    census mesh that carries a normal attribute   (arms mesh.attr)
//          flag:     castShadow is toggled on the first census mesh (arms mesh.flags)
// Ports: OB_E2E_PORT / OB_E2E_CDP_PORT (pinned pair) or HTTP / CDP env.
// The judge is tools/render/fence-judge-490.py (base export vs a live census).
import fs from 'node:fs';
import { requireTableIds, builtTableIdExpr, assertBuiltTable } from './lib/table-ids.mjs';
import { stringOpt, pathOpt } from './lib/argv.mjs';
import path from 'node:path';
import { resolveModeByValue as __resolveModeByValue, invalidateForMode as __invalidateForMode } from './lib/mode-outputs.mjs'; // FIX8 (Fable pass 1): the census is on the shared resolver too
import { awaitOwnedServer, refusal } from './lib/serve-check.mjs';
import { pollEval } from './lib/cdp-lite.mjs';
import { pathToFileURL } from 'node:url';
import { pageExpression as fix24PageExpression } from './lib/cn8-fix24-page.mjs';
let __cdp = null; // COMPANION-1c L1: the shared launcher + static server are imported from the REQUESTED --web tree (its tools/cdp.mjs), as FIX11's awaitOwnedServer does — the harness comes from the tree under test, and its preflight judges THAT tree

// FAIL CLOSED (ORDER-CN8-731-FIX1): the id is validated against the catalog before boot (a typo used
// to boot the scripted pin through resolveBootTableId under the requested label); after boot the
// page's built id must equal it
// FIX3 (P2 (a)): the destination is resolved and the prior census at it invalidated as the FIRST effect —
// before any input guard can exit — so a reused --out never keeps a stale census after a refused run.
// The default destination names the requested table as given (trimmed), the id itself is validated next.
// FIX4 (review round 4 on #731 P2 (c)): an EXPLICIT --out is resolved and its prior census invalidated as the LITERAL first
// statement — before the --table guard (stringOpt exits on a blank / `=` / trailing --table) or any other guard can exit
// FIX8 (review round 8 on #731; Fable pass 1): the mode is the value of --perturb through the ONE shared resolver (last occurrence,
// `=` form — the reading stringOpt uses below): a known perturb → `perturb`, none → `census` (a --switch-to run is a census taken
// after a switch), an UNKNOWN perturb → null, which owns nothing — so `--perturb bogus` removes nothing, not even an explicit --out,
// and the allow-list refusal below follows. The tiers: an explicit --out is the tool's own fixed destination (tier 1, first
// effect); a default destination derived from --table / --switch-to (tier 2) is built only after the ids are validated.
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'census-490', value: ['--out', '--web', '--table', '--switch-to', '--perturb'], bool: ['--allow-unexposed-built-id', '--fix24'] });
const PERTURB_NAMES = ['material', 'normal', 'flag', 'uv', 'tangent', 'color', 'groups'];
const __MODE = __resolveModeByValue(__P.args, '--perturb', { perturb: PERTURB_NAMES }, { defaultMode: 'census' });
const OUT_EXPLICIT = __P.value('--out'); // FIX10: from the parsed result (a blank / trailing / repeated-blank --out was refused by the parse)
// FIX9 (review round 9 on #731 P2 A): every VALUE that a deletion target is derived from is read by the writer's own reader BEFORE
// the first effect — a blank / whitespace / `=`-empty / trailing --table, --switch-to or --perturb is refused by name with
// NOTHING removed (a value the writer would refuse owns nothing); FIX4's "explicit --out goes before the --table guard" holds for
// a well-formed table id refused later (an unknown id, a missing --web), never for a malformed value.
const SWITCH_TO_RAW = __P.value('--switch-to');
const SWITCH_TOKEN = SWITCH_TO_RAW === null || /^[A-Za-z0-9_]+$/.test(SWITCH_TO_RAW);
const TABLE_RAW = __P.value('--table') ?? 'chinese8_pro_9ft';
const TABLE_TOKEN = /^[A-Za-z0-9_]+$/.test(TABLE_RAW);
const PERTURB = __P.value('--perturb'); // FIX10: every value from the one parse
if (!TABLE_TOKEN) { console.error(`[census-490] REFUSED — table id ${JSON.stringify(TABLE_RAW)} is not a plain token; no destination is derived from it`); process.exit(2); }
if (!SWITCH_TOKEN) { console.error(`[census-490] REFUSED — --switch-to ${JSON.stringify(SWITCH_TO_RAW)} is not a plain token; no destination is derived from it`); process.exit(2); }
if (OUT_EXPLICIT) __invalidateForMode({ OUT: null, mode: __MODE, outputs: { census: [path.resolve(OUT_EXPLICIT)], perturb: [path.resolve(OUT_EXPLICIT)] }, tag: 'census-490' }); // tier 1: the literal destination as given (absolute entry — a bracket or a trailing space in the filename is lawful, FIX4)
// FIX5: a --switch-to run writes the SWITCHED table's census — its default destination is derived from the switch target
// ALONE and invalidated before the --table guard can exit (first-effect law), and it is a distinct filename
// `<B>.switched.json`: never the fence's default `<B>.json` (the fence judge loads by filename and a switched census is
// arm evidence taken under the boot table's environment, not a fence census — fence-judge-490 refuses a doc that carries
// switched_from; a Fable refuter pass caught the collision). A blank `--switch-to=` is refused with no destination touched.
// FIX8 (review round 8 on #731 P2 B): a DEFAULT destination is derived from the selection (`<table>.json`, `<B>.switched.json`),
// so the selection is validated against the catalog BEFORE that path exists — `--table nosuch` / `--switch-to nosuch` refuse
// with nothing removed (they used to remove `<nosuch>.json` first, then refuse). An explicit --out is the tool's own literal
// destination and stays the first effect above (FIX4).
let TABLE = (await requireTableIds([TABLE_RAW], 'census-490'))[0];
const SWITCH_TO = SWITCH_TO_RAW ? (await requireTableIds([SWITCH_TO_RAW], 'census-490'))[0] : null;
if (SWITCH_TO && SWITCH_TO === TABLE) { console.error(`[census-490] REFUSED — --switch-to ${SWITCH_TO} names the boot table itself; the arm needs a different table`); process.exit(2); }
const SWITCH_DEFAULT = SWITCH_TO ? `/tmp/ob-census-490/${SWITCH_TO}.switched.json` : undefined;
const OUTJSON = OUT_EXPLICIT ?? (SWITCH_DEFAULT !== undefined ? SWITCH_DEFAULT : `/tmp/ob-census-490/${TABLE}.json`);
if (!OUT_EXPLICIT) __invalidateForMode({ OUT: null, mode: __MODE, outputs: { census: [OUTJSON], perturb: [OUTJSON] }, tag: 'census-490' }); // tier 2: the validated default destination (absolute)
let SWITCHED_FROM = null; // FIX5: set when --switch-to ran (recorded in the census doc)
const WEB = pathOpt('--web', { default: process.cwd() + '/web', tag: 'census-490', mustExist: 'dir' }); // FIX2: present-but-blank refused, dir must exist
// FIX5 (review round 5 on #731 P2): --switch-to <id> — validated above like the boot table, and must differ from it (FIX8 moved both ahead of the derived-destination removal)
if (PERTURB && !PERTURB_NAMES.includes(PERTURB)) { console.error('[census-490] unknown --perturb', PERTURB, '(material|normal|flag|uv|tangent|color|groups)'); process.exit(2); } // NOTE-FENCE-NORMALS: one negative per attribute class
const HTTP = +(process.env.OB_E2E_PORT || process.env.HTTP || 24150);
const CDP = +(process.env.OB_E2E_CDP_PORT || process.env.CDP || 24151);
const W = 1600, H = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL_ = `http://127.0.0.1:${HTTP}/app.html?table=${TABLE}&cinema=1&seed=7&look=default&obtool=1`;
const log = (...a) => console.error('[census-490]', ...a);
fs.mkdirSync(OUTJSON.replace(/[^/]*$/, ''), { recursive: true });
let server = null, chrome = null;
const cleanup = async () => {
  // COMPANION-1b: the shared launcher owns the browser (profile dir, helpers, the GH-665 same-port lifecycle) and the shared server
  // helper owns the python — closeAndWait() / stopStaticServer(), never a process.kill on a pid this file spawned itself
  if (chrome) { const c = chrome; chrome = null; try { await c.closeAndWait(); } catch {} }
  if (server) { const s = server; server = null; try { if (__cdp) await __cdp.stopStaticServer(s); } catch {} }
};
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(143); });
for (const ev of ['unhandledRejection', 'uncaughtException']) process.on(ev, async (e) => { console.error(`[census-490] FATAL (${ev}):`, e && e.stack || e); await cleanup(); process.exit(2); }); // never a leak past cleanup

async function main() {
  { const cdpPath = path.join(WEB, 'tools', 'cdp.mjs'); if (!fs.existsSync(cdpPath)) throw refusal('census-490', `the requested --web ${WEB} carries no tools/cdp.mjs — the harness comes from the tree under test; a web tree without the shared launcher cannot be booted by this tool (COMPANION-1c L1)`); __cdp = await import(pathToFileURL(cdpPath).href); }
  server = __cdp.spawnStaticServer(WEB, HTTP); // COMPANION-1b: the shared static server (band checks, the GH-557 failure watchdog, the marker reapOwnServer reads) — from the requested tree's cdp.mjs
  await awaitOwnedServer(server, HTTP, WEB, 'census-490'); // FIX11: the shared preflight IS the wait, then FIX3's ownership + served-tree identity checks
  // COMPANION-1b: the shared launcher — its profile dir (no rmSync here), the foreign-holder / foreign-band refusals, Runtime / Page /
  // Log enabled; the window is sized by the launcher (no metrics override). COMPANION-1c L2: the browser is launched on a script-free page of our own server
  // (/sw.js as text; tool:false — URL_ already carries obtool=1), the diagnostic listeners are registered, THEN the app page is navigated — so the boot-time
  // console lines / exceptions ('[app] kernel …') reach a listener, as before the migration; the launcher's own served-tree preflight runs against the requested
  // tree's origin (L1) after awaitOwnedServer already validated it
  chrome = await __cdp.launchChrome(`http://127.0.0.1:${HTTP}/sw.js`, { port: CDP, width: W, height: H, tool: false }); // a script-free page of OUR server (the launcher resolves only http page targets, never about:blank); its preflight runs against the requested tree's origin
  log('chrome pid', chrome.pid, '| server pid', server.pid, 'serving', WEB, 'on', HTTP);
  const consoleLines = [];
  let cdpGone = null; let bootContextObserved = false; let bootContexts = 0; // COMPANION-1c L2 witness: the app document's execution context is created by the navigation BELOW — a listener registered before it sees Runtime.executionContextCreated for the app origin; one registered after a launch on the app URL (the pre-fix order) cannot on this first navigation (a later reload of the app document would create a fresh context — the record carries the count; FIX2c, the FIX2b Fable lens)
  const __appOrigin = new URL(URL_).origin;
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.executionContextCreated' && params && params.context && params.context.origin === __appOrigin) { bootContextObserved = true; bootContexts += 1; } // the shared launcher dispatches (method, params) — cdp.mjs eventHandlers.forEach((h) => h(msg.method, msg.params)); not a message object (COMPANION-1b, Fable landing lens)
    if (method === 'Runtime.exceptionThrown') consoleLines.push('EXCEPTION ' + JSON.stringify(params && params.exceptionDetails).slice(0, 600));
    else if (method === 'Runtime.consoleAPICalled') consoleLines.push(((params && params.args) || []).map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' '));
    else if (method === 'Inspector.detached' || method === 'Inspector.targetCrashed') cdpGone = method + (params && params.reason ? ' ' + params.reason : '');
  });
  const evalJ = async (expr) => { try { return await chrome.eval(expr); } catch (e) { if (!cdpGone && /closed|disconnect|poison|deadline|wedged/i.test(String(e && e.message))) cdpGone = String(e.message).slice(0, 120); throw e; } };
  const closedGuard = (what) => { const p = chrome.poisoned ? chrome.poisoned() : null; if (cdpGone || p) throw refusal('census-490', `CDP session gone (${cdpGone || p}) while ${what} — the renderer is gone; the run stops here and its cleanup closes this run's browser and server`); };
  await chrome.send('Page.navigate', { url: URL_ }); // COMPANION-1c L2: navigation AFTER the listeners are registered
  let ready = false;
  for (let i = 0; i < 300 && !ready; i++) { await sleep(200); closedGuard('waiting for the app'); ready = await pollEval(evalJ, 'window.__test?.ready === true', { tag: 'census-490', what: 'waiting for the app', fallback: false }); } // FIX7 (P2 B): a deadline / closed socket is a named refusal, never polled again
  if (!ready) throw new Error('app never became ready: ' + consoleLines.filter((l) => /EXCEPTION/.test(l)).slice(0, 2).join(' | '));
  for (let i = 0; i < 200; i++) {
    closedGuard('waiting for the GI bake');
    const st = await pollEval(evalJ, `(() => { const s = window.__gi && window.__gi.state; return JSON.stringify({ ready: s ? !!s.ready : null, baked: s ? !!s.baked : null, fits: s ? s.fits : null }); })()`, { tag: 'census-490', what: 'waiting for the GI bake', fallback: null });
    if (st) { const r = JSON.parse(st); if (r.ready && (r.baked || r.fits === false)) break; }
    await sleep(200);
  }
  await sleep(800);
  { const { awaitGeometrySettle } = await import('./lib/settle.mjs'); const st = await awaitGeometrySettle(evalJ, { tag: 'census-490', guard: closedGuard }); log(`geometry settled: ${st.meshes} meshes, ${st.reads} reads, ${st.changes} change(s) after the GI bake (last at +${st.lastChangeMs} ms), ${st.ms} ms`); } // NOTE-CENSUS-SETTLE: no hash from a scene still being written
  let builtIdVerified = assertBuiltTable(TABLE, await evalJ(builtTableIdExpr), 'census-490', __P.has('--allow-unexposed-built-id'));
  if (SWITCH_TO) {
    // FIX5 (review round 5 on #731 P2): the beacon must FOLLOW a rebuild. The boot table is certified above; now the page
    // switches to SWITCH_TO (the app's own equipment axis), the run waits for the rebuild, the GI bake and the settle,
    // then the beacon must certify SWITCH_TO and REFUSE the boot id by name — a beacon stored at boot certified the boot
    // table for a census of the switched one (the served-tree identity arm undermined). The census written is SWITCH_TO's.
    const BOOT = TABLE;
    const meshCountExpr = `(() => { const scene = window.__dbg && window.__dbg.scene; let t = null, n = 0; if (scene) scene.traverse((o) => { if (!t && o.name === 'obTable') t = o; }); if (t) t.traverse((o) => { if (o.isMesh) n++; }); return n; })()`;
    const meshesBefore = await evalJ(meshCountExpr);
    const ok = await evalJ(`__settings.changeEquipment('table_id', ${JSON.stringify(SWITCH_TO)}, { skipConfirm: true })`);
    if (ok !== true) throw refusal('census-490', `arm beacon-switch: changeEquipment('table_id', ${SWITCH_TO}) returned ${JSON.stringify(ok)}`);
    let active = null;
    for (let i = 0; i < 150 && active !== SWITCH_TO; i++) { await sleep(200); closedGuard('waiting for the rebuild'); active = await pollEval(evalJ, "import('./scene/table.js').then((t) => t.activeTableId())", { tag: 'census-490', what: 'waiting for the rebuild', fallback: null }); }
    if (active !== SWITCH_TO) throw refusal('census-490', `arm beacon-switch: activeTableId() reads ${JSON.stringify(active)} 30 s after the switch to ${SWITCH_TO}`);
    // (no GI-state wait here: gi.js keeps ready/baked true across a same-class switch, so that loop would be vacuous — a Fable
    // refuter pass; the geometry settle below is the real wait, and it observes the rebuild's attribute churn)
    await sleep(800);
    { const { awaitGeometrySettle } = await import('./lib/settle.mjs'); const st = await awaitGeometrySettle(evalJ, { tag: 'census-490', guard: closedGuard }); log(`geometry settled after the switch: ${st.meshes} meshes, ${st.reads} reads, ${st.changes} change(s), ${st.ms} ms`); }
    const beacon = await evalJ(builtTableIdExpr);
    builtIdVerified = assertBuiltTable(SWITCH_TO, beacon, 'census-490'); // the switched id must certify (a stale beacon refuses here, naming the boot id)
    let bootRefused = false;
    try { assertBuiltTable(BOOT, beacon, 'census-490'); } catch (e) { if (e && e.refused) bootRefused = true; else throw e; }
    if (!bootRefused) throw refusal('census-490', `arm beacon-switch: the boot id ${BOOT} still certifies after the switch to ${SWITCH_TO} (beacon reads ${JSON.stringify(beacon)})`);
    const meshesAfter = await evalJ(meshCountExpr);
    console.log(`[census-490] ARMED — beacon follows the rebuild: boot ${BOOT} → switch ${SWITCH_TO}: the built id reads ${beacon}; assertBuiltTable(${BOOT}) refuses by name; obTable meshes ${meshesBefore} → ${meshesAfter}`);
    SWITCHED_FROM = BOOT; TABLE = SWITCH_TO; // the census below is the switched table's, labelled as such, with the switch recorded
  }
  const out = JSON.parse(await evalJ(`(() => {
    const scene = window.__dbg.scene; scene.updateMatrixWorld(true);
    // BUILD-3 (review round 12 P2-c): the COMPILED program source per material is the
    // material identity that matters for pixels — the JS text of a shared onBeforeCompile
    // hook (shaderHook) changes whenever any class gains a gated branch; the emitted
    // GLSL does not unless the branch is taken.  Compile everything the scene holds, then
    // read each material's current program's vertex + fragment source through the GL
    // context (three r170: renderer.properties.get(material).currentProgram).
    const renderer = window.__dbg.renderer; const camera = window.__dbg.camera;
    try { if (renderer && camera) renderer.compile(scene, camera); } catch (e) {}
    const gl = renderer && renderer.getContext ? renderer.getContext() : null;
    const glslOf = (m) => {
      try {
        const props = renderer.properties.get(m); const prog = props && (props.currentProgram || (props.programs && [...props.programs.values()][0]));
        if (!prog || !gl) return { glsl: null, programKey: null, note: 'uncompiled' };
        const vs = gl.getShaderSource(prog.vertexShader) || ''; const fs2 = gl.getShaderSource(prog.fragmentShader) || '';
        return { glsl: fnv(vs + '|' + fs2), glslLen: [vs.length, fs2.length], programKey: prog.cacheKey ? fnv(String(prog.cacheKey)) : null };
      } catch (e) { return { glsl: null, programKey: null, note: 'err ' + String(e).slice(0, 60) }; }
    };
    ${PERTURB === 'material' ? `{ const seen = new Set(); scene.traverse((o) => { if (!o.isMesh) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (m && !seen.has(m) && typeof m.roughness === 'number') { seen.add(m); m.roughness += 0.01; } } }); }` : ''}
    let table = null; scene.traverse((o) => { if (!table && o.name === 'obTable') table = o; });
    const inTable = new Set(); if (table) table.traverse((o) => inTable.add(o));
    const eligible = (o) => !!(o.isMesh && o.geometry && ((o.name || '').startsWith('dm-') || inTable.has(o)));
    ${PERTURB === 'normal' ? `{ let done = false; scene.traverse((o) => { if (done || !eligible(o)) return; const n = o.geometry.getAttribute('normal'); if (!n || !n.count) return; n.setXYZ(0, -n.getX(0), -n.getY(0), -n.getZ(0)); n.needsUpdate = true; done = true; }); if (!done) throw new Error('perturb normal: no census mesh carries a normal attribute'); }` : ''}
    ${PERTURB === 'flag' ? `{ let done = false; scene.traverse((o) => { if (done || !eligible(o)) return; o.castShadow = !o.castShadow; done = true; }); if (!done) throw new Error('perturb flag: no census mesh'); }` : ''}
    ${['uv', 'tangent', 'color'].includes(PERTURB) ? `{ let done = false; scene.traverse((o) => { if (done || !eligible(o)) return; const g = o.geometry; const pos = g.getAttribute('position'); if (!pos || !pos.count) return; const a = g.getAttribute('${PERTURB}'); if (a && a.count) { a.setX(0, a.getX(0) + 0.001); a.needsUpdate = true; } else { const size = '${PERTURB}' === 'uv' ? 2 : ('${PERTURB}' === 'color' ? 3 : 4); g.setAttribute('${PERTURB}', new pos.constructor(new Float32Array(pos.count * size), size)); } done = true; }); if (!done) throw new Error('perturb ${PERTURB}: no census mesh'); }` : ''}
    ${PERTURB === 'groups' ? `{ let done = false; scene.traverse((o) => { if (done || !eligible(o)) return; const g = o.geometry; const pos = g.getAttribute('position'); if (!pos || !pos.count) return; if (g.groups && g.groups.length) { const c = g.groups[0].count; g.groups[0].count = (Number.isFinite(c) && c > 3) ? c - 3 : 3 + (Number.isFinite(c) ? c : 0); } else { g.addGroup(0, 3, 0); } done = true; }); if (!done) throw new Error('perturb groups: no census mesh'); }` : ''}
    const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
    const texCache = new Map();
    const texId = (t) => {
      if (!t) return null;
      if (texCache.has(t)) return texCache.get(t);
      let rec;
      try {
        const img = t.image;
        if (!img) rec = { kind: t.isCubeTexture ? 'cube' : 'none' };
        else if (Array.isArray(img)) {
          // LAND-629 follow-up 2: cube maps are CONTENT-hashed too — each face drawn to a
          // 64² canvas (images / bitmaps) or its data array sampled (data textures)
          rec = { kind: 'cube', n: img.length, w: img[0] && img[0].width, h: img[0] && img[0].height };
          try {
            let s = '';
            for (const face of img) {
              if (!face) { s += 'null,'; continue; }
              if (face.data) { const px = face.data; const n = px.length; const step = Math.max(1, Math.floor(n / 16384)); for (let i = 0; i < n; i += step) s += px[i] + ','; s += '|'; continue; }
              const fw = face.naturalWidth || face.width || 0, fh = face.naturalHeight || face.height || 0;
              if (!fw || !fh) throw new Error('cube face not decoded');
              const pw = Math.min(fw, 64), ph = Math.min(fh, 64);
              const c = document.createElement('canvas'); c.width = pw; c.height = ph;
              const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(face, 0, 0, pw, ph);
              const px = ctx.getImageData(0, 0, pw, ph).data; for (let i = 0; i < px.length; i += 4) s += px[i] + ',' + px[i + 1] + ',' + px[i + 2] + ',';
              s += '|';
            }
            rec.pix = { faces: img.length, hash: fnv(s) };
          } catch (e) { rec.pix = { err: String(e).slice(0, 80) }; }
        }
        else if (img.src) {
          const nw = img.naturalWidth || img.width || 0, nh = img.naturalHeight || img.height || 0;
          rec = { kind: 'img', src: String(img.src).replace(/^https?:\\/\\/[^/]+/, ''), w: nw, h: nh };
          try {
            if (!nw || !nh) throw new Error('image not decoded');
            const pw = Math.min(nw, 128), ph = Math.min(nh, 128);
            const c = document.createElement('canvas'); c.width = pw; c.height = ph;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, pw, ph);
            const px = ctx.getImageData(0, 0, pw, ph).data;
            let s = ''; for (let i = 0; i < px.length; i++) s += px[i] + ',';
            rec.pix = { w: pw, h: ph, hash: fnv(s) };
          } catch (e) { rec.pix = { err: String(e).slice(0, 80) }; }
        }
        else {
          const w = img.width, h = img.height; let px = null;
          if (img.data) px = img.data;
          else if (typeof img.getContext === 'function') px = img.getContext('2d').getImageData(0, 0, w, h).data;
          else if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0); px = c.getContext('2d').getImageData(0, 0, w, h).data; }
          if (px) { const n = px.length; const step = Math.max(1, Math.floor(n / 65536)); let s = ''; for (let i = 0; i < n; i += step) s += px[i] + ','; rec = { kind: 'data', w, h, hash: fnv(s), len: n }; }
          else rec = { kind: 'opaque', w, h };
        }
        rec.wrap = [t.wrapS, t.wrapT]; rec.repeat = [+t.repeat.x.toFixed(5), +t.repeat.y.toFixed(5)]; rec.cs = t.colorSpace || null;
      } catch (e) { rec = { kind: 'err', err: String(e).slice(0, 80) }; }
      texCache.set(t, rec); return rec;
    };
    const matRec = (m) => {
      if (!m) return null;
      const c = (x) => (x && x.getHexString ? x.getHexString() : null);
      const f = (x) => (typeof x === 'number' ? +x.toFixed(6) : (x === undefined ? undefined : x));
      const r = { type: m.type, name: m.name || '', color: c(m.color), emissive: c(m.emissive), emissiveIntensity: f(m.emissiveIntensity),
        roughness: f(m.roughness), metalness: f(m.metalness), envMapIntensity: f(m.envMapIntensity),
        clearcoat: f(m.clearcoat), clearcoatRoughness: f(m.clearcoatRoughness), sheen: f(m.sheen), sheenRoughness: f(m.sheenRoughness), sheenColor: c(m.sheenColor),
        specularIntensity: f(m.specularIntensity), ior: f(m.ior), transmission: f(m.transmission), reflectivity: f(m.reflectivity),
        normalScale: m.normalScale ? [+m.normalScale.x.toFixed(5), +m.normalScale.y.toFixed(5)] : null, bumpScale: f(m.bumpScale),
        side: m.side, transparent: !!m.transparent, opacity: f(m.opacity), vertexColors: !!m.vertexColors, flatShading: !!m.flatShading,
        depthWrite: m.depthWrite, alphaTest: f(m.alphaTest), toneMapped: m.toneMapped,
        maps: {} };
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'bumpMap', 'emissiveMap', 'alphaMap', 'aoMap', 'envMap', 'clearcoatNormalMap', 'sheenColorMap']) { if (m[k]) r.maps[k] = texId(m[k]); }
      if (m.onBeforeCompile && m.onBeforeCompile.toString().length > 40) r.shaderHook = fnv(m.onBeforeCompile.toString()); // informational: the hook's JS text
      Object.assign(r, glslOf(m)); // judged: the compiled program source
      if (m.defines) r.defines = Object.keys(m.defines).sort().join(',');
      return r;
    };
    const arrStr = (a) => {
      const isF = (x) => x instanceof Float32Array || x instanceof Float64Array;
      let s = '';
      if (a.isInterleavedBufferAttribute && typeof a.getComponent === 'function') { const fl = isF(a.data && a.data.array); for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) { const v = a.getComponent(i, c); s += (fl ? v.toFixed(6) : v) + ','; } return s; }
      const arr = a.array || []; const fl = isF(arr);
      for (let i = 0; i < arr.length; i++) s += (fl ? arr[i].toFixed(6) : arr[i]) + ',';
      return s;
    };
    const attrHash = (g, M) => {
      const parts = [];
      const attrs = g.attributes || {};
      for (const k of Object.keys(attrs).sort()) { if (k === 'position') continue; const a = attrs[k]; if (!a) continue; parts.push('a.' + k + ':' + a.itemSize + ':' + (a.normalized ? 1 : 0) + ':' + arrStr(a)); }
      const morphs = g.morphAttributes || {};
      for (const k of Object.keys(morphs).sort()) { const ts = morphs[k] || []; parts.push('m.' + k + ':' + ts.length); for (const a of ts) parts.push((a.itemSize || 0) + ':' + arrStr(a)); }
      parts.push('rel:' + (g.morphTargetsRelative ? 1 : 0));
      const dr = g.drawRange || {}; parts.push('dr:' + dr.start + ':' + dr.count);
      parts.push('M:' + Array.from(M, (v) => (+v).toFixed(6)).join(','));
      return fnv(parts.join('|'));
    };
    const list = [];
    scene.traverse((o) => {
      if (!eligible(o)) return;
      const nm = o.name || '';
      const pos = o.geometry.getAttribute('position'); if (!pos) return;
      const M = o.matrixWorld.elements; const parts = [];
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); parts.push((M[0]*x+M[4]*y+M[8]*z+M[12]).toFixed(6), (M[1]*x+M[5]*y+M[9]*z+M[13]).toFixed(6), (M[2]*x+M[6]*y+M[10]*z+M[14]).toFixed(6)); }
      const idx = o.geometry.index ? Array.from(o.geometry.index.array).join(',') : '';
      const geo = fnv(parts.join(',') + '|' + idx);
      const attr = attrHash(o.geometry, M);
      const mats = Array.isArray(o.material) ? o.material.map(matRec) : [matRec(o.material)];
      const flags = { visible: !!o.visible, renderOrder: o.renderOrder, castShadow: !!o.castShadow, receiveShadow: !!o.receiveShadow, frustumCulled: !!o.frustumCulled, layers: o.layers ? o.layers.mask : null, matrixAutoUpdate: !!o.matrixAutoUpdate };
      list.push({ name: nm, verts: pos.count, geo, attr, groups: (o.geometry.groups || []).map((g) => [g.start, g.count, g.materialIndex]), mats, flags, visible: o.visible, renderOrder: o.renderOrder, castShadow: !!o.castShadow, receiveShadow: !!o.receiveShadow });
    });
    return JSON.stringify({ table: (window.__test.equipment && window.__test.equipment()) || null, n: list.length, meshes: list });
  })()`));
  const doc = { tool: 'tools/render/census-490-tables.mjs', schema: 2, table: TABLE, switched_from: SWITCHED_FROM, builtIdVerified, served_web_dir: WEB, url: URL_, perturb: PERTURB, boot_context_observed: bootContextObserved, boot_contexts_observed: bootContexts, when: new Date().toISOString(), meshCount: out.n, meshes: out.meshes };
  // FIX24 is opt-in: capture-local texture UUIDs and full GLSL are not stable
  // cross-boot identities and must not enter the existing schema-2 fence rows.
  if (__P.has('--fix24')) doc.fix24 = await evalJ(fix24PageExpression('census'));
  fs.writeFileSync(OUTJSON, JSON.stringify(Object.assign({ tool: doc.tool, mode: PERTURB ? 'perturb' : 'census' }, doc))); // FIX8: tool + mode first
  log('wrote', OUTJSON, 'meshes', out.n, PERTURB ? `(perturb ${PERTURB})` : '');
  // the browser and the server are closed by cleanup() — launchChrome's closeAndWait() and stopStaticServer() (COMPANION-1b)
}
try { await main(); } catch (e) { if (e && !e.refused && (e.cdpDeadline || e.cdpClosed)) { console.error(`[census-490] REFUSED — CDP ${e.cdpDeadline ? 'command deadline' : 'socket closed'} outside a readiness poll: ${e.message} — the renderer stopped answering; the run stops here and its cleanup kills the browser and the server`); process.exitCode = 2; } /* FIX7 (Fable pass 2): a deadline on a non-poll evaluate is the same named refusal */ else if (e && e.refused) { console.error(e.message); process.exitCode = 2; } else { log('FAILED', e && e.stack || e); process.exitCode = 1; } } finally { await cleanup(); process.exit(process.exitCode ?? 0); }
