// Copyright (c) Meta Platforms, Inc. and affiliates.

// liveswitch-628.mjs — GH-628 (2): the boot-flange env-tint capability must
// follow the ACTIVE table across live equipment switches.
//
// WHY. web/scene/table.js builds collarMat / linerRimMat once (build-scope
// singletons in sharedMats) and styleMaterials() decides per rebuild whether
// they carry the Pro-Am achromatic env tint (userData.spikeEnvTint). shading.js
// reads that holder at COMPILE time and keys its program cache on presence
// ('tnt'), but the vendored three only re-links a material's program when
// material.version moved — customProgramCacheKey is never polled. Before
// GH-628 the else-path cleared apronMat only and nothing bumped the flange
// pair, so Pro-Am -> Red Label rendered the Red Label collar with the tinted
// Pro-Am program and a Red Label boot -> Pro-Am kept the untinted one.
//
// WHAT THIS PROVES, on the running app (never by reading the source): after
// every switch, the program the renderer holds for the collar and the liner
// rim carries the 'tnt' leg iff the active entry is pool_pro_9ft, the
// holder is present iff Pro-Am, and the material objects are the SAME across
// the switch (the singleton claim is measured, not assumed — a fresh material
// per build would make the whole class moot). Two arms, both directions:
//   A  boot Pro-Am  -> Red Label -> Pro-Am
//   B  boot Red Label -> Pro-Am
// Materials are located by mesh name on the Pro-Am (dmNames: dm-bootcollar-*,
// dm-bootrim-*) and by material signature on the Red Label (0x161617 physical
// with roughnessMap = collarMat; 0x161617 physical, clearcoat 0.12, no
// roughnessMap = linerRimMat); arm B cross-checks the signature pick against
// the name pick after the switch (same uuid or the arm is void).
//
// Red arm: on the pre-628 tree this FAILS (tinted key persists after
// Pro-Am -> Red Label; untinted key persists after Red Label -> Pro-Am).
//
// Usage:
//   node tools/render/liveswitch-628.mjs [--web DIR] [--out DIR] [--red-arm]
//   --web DIR  serve a candidate/baseline web tree instead of ./web (the
//              meshident-488d.mjs idiom; how the red arm is run).
//   OB_E2E_PORT / OB_E2E_CDP_PORT pin ports; else the 488d band 24920-9929.
// Exit: 0 every assertion holds / 1 harness failure / 2 usage / 3 assertion
//       failed (report still written).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
} from '../../web/tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const USAGE = 'usage: liveswitch-628.mjs [--web DIR] [--out DIR] [--red-arm]';
const argv = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2));
const FLAGS = new Set(['--web', '--out']);
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — the strict parser of this tool IS this call (unknown flags refused, every value checked, help exits 0) — BEFORE any effect; destinations, selections and the mode come from the PARSED result
const __P = __parseArgv({ tag: 'liveswitch-628', usage: USAGE, value: [...FLAGS], bool: ['--red-arm'], unknown: 'refuse', positionals: 'none' }, argv); // D621: --red-arm is a declared boolean (a strict parser would otherwise REFUSE the card's liveswitch red arm)
const opt = {}; for (const f of FLAGS) if (__P.has(f)) opt[f.slice(2)] = __P.value(f); opt['red-arm'] = __P.has('--red-arm');
{ const { invalidatePrior: __inv } = await import('./lib/serve-check.mjs'); __inv([path.join(path.resolve(String(opt.out ?? '/tmp/ob628-liveswitch')), 'liveswitch-628.json')], 'liveswitch-628'); } // the first effect, after the parse, from the parsed destination
if (opt.web !== undefined && !(fs.existsSync(opt.web) && fs.statSync(opt.web).isDirectory())) { console.error(`[liveswitch-628] REFUSED — --web ${JSON.stringify(opt.web)}: not a directory`); process.exit(2); } // FIX3 sweep: a given --web must exist (the strict parser accepted any string)
const webDir = opt.web ? path.resolve(opt.web) : path.join(REPO, 'web');
const OUT = path.resolve(opt.out || '/tmp/ob628-liveswitch');
fs.mkdirSync(OUT, { recursive: true });

const PROAM = 'pool_pro_9ft';
const RL = 'pool_pro_9ft_older_gen';

// In-page probe. Locates the flange pair, stashes the references on
// window.__ls628 (so a later probe on a table WITHOUT dm names still reads the
// same objects), and reports the renderer's CURRENT program key for each.
// `key` is the tail element of three's program cache key = our
// customProgramCacheKey string, so the 'tnt' test is on our own token list.
const PROBE = `(() => {
  const scene = window.__dbg.scene, renderer = window.__dbg.renderer;
  const byName = { collar: null, liner: null };
  const bySig = { collar: null, liner: null };
  const used = new Map();
  scene.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      used.set(m, (used.get(m) || 0) + (o.visible ? 1 : 0));
      if (m.isMeshPhysicalMaterial && m.color
        && m.color.getHexString() === '161617') {
        if (m.roughnessMap && m.normalMap) bySig.collar = m;
        else if (!m.roughnessMap && m.clearcoat === 0.12) bySig.liner = m;
      }
    }
    if (/^dm-bootcollar-/.test(o.name || '')) byName.collar = o.material;
    if (/^dm-bootrim-/.test(o.name || '')) byName.liner = o.material;
  });
  const S = window.__ls628 || (window.__ls628 = {});
  const how = {};
  for (const k of ['collar', 'liner']) {
    const pick = byName[k] || bySig[k];
    if (!S[k] && pick) { S[k] = pick; how[k] = byName[k] ? 'names' : 'signature'; }
    else if (S[k]) how[k] = 'stash';
    // cross-check: a name pick must be the stashed object
    if (S[k] && byName[k] && byName[k] !== S[k]) how[k] = 'MISMATCH';
  }
  const read = (m) => {
    if (!m) return null;
    const p = renderer.properties.get(m);
    const full = p && p.currentProgram ? String(p.currentProgram.cacheKey) : null;
    const key = full ? full.split(',').pop() : null;
    return {
      uuid: m.uuid, version: m.version,
      holder: !!(m.userData.spikeEnvTint && typeof m.userData.spikeEnvTint === 'object'),
      key, tnt: key ? /tnt/.test(key) : null,
      usedBy: used.get(m) || 0,
    };
  };
  // GH-621 r6: a Pro-Am state built from the purchased-model boot
  // (render.bootSection) carries no dm-bootrim at all — the rim rows below
  // are N/A there, and a boot INTO such a state cannot even find the rim
  // material (no mesh holds it), which is not a miss
  let rimless = false;
  scene.traverse((o) => { if (/^dm-bootcollar-/.test(o.name || '')) rimless = true; });
  scene.traverse((o) => { if (/^dm-bootrim-/.test(o.name || '')) rimless = false; });
  if (window.__ls628RedArm) rimless = false; // --red-arm: pretend the state builds a rim
  // D621-PLAN-3 (review r4 P2): per-pocket collar census — each boot's material
  // and roughness-map identity, so the gate can prove the side boots keep
  // their own zoning map instead of the last pocket's
  const collars = [];
  scene.traverse((o) => {
    if (!o.isMesh || !/^dm-bootcollar-/.test(o.name || '')) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    collars.push({ name: o.name, mat: m.uuid, rm: m.roughnessMap ? m.roughnessMap.uuid : null,
      rmSize: m.roughnessMap && m.roughnessMap.image ? [m.roughnessMap.image.width, m.roughnessMap.image.height] : null });
  });
  // D621-PLAN-3 (review r4 P3): the Pro-Am leg material's lifetime — stash the
  // first-seen leg material and its map, listen for their 'dispose' events,
  // and report whether the CURRENT leg meshes still hold that same live object
  const legs = [];
  scene.traverse((o) => {
    if (!o.isMesh || !/^dm-(leg|leveler)-/.test(o.name || '') || /bolt/.test(o.name)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    legs.push({ name: o.name, mat: m.uuid, map: m.map ? m.map.uuid : null });
  });
  const legNow = legs.length ? legs[0] : null;
  if (legNow && !S.legMat) {
    let lm = null; scene.traverse((o) => { if (!lm && o.isMesh && o.name === legNow.name) lm = Array.isArray(o.material) ? o.material[0] : o.material; });
    if (lm) {
      S.legMat = lm; S.legMap = lm.map || null; S.legMatDisposed = 0; S.legMapDisposed = 0;
      lm.addEventListener('dispose', () => { S.legMatDisposed++; });
      if (lm.map) lm.map.addEventListener('dispose', () => { S.legMapDisposed++; });
    }
  }
  // the CURRENT leg map is tracked too: the apron texture is style-scoped
  // (styleMaterials rebuilds it per entry and disposes the previous one), so
  // the stashed map may legitimately be disposed ONCE per style change — what
  // must never happen is a live leg mesh holding a disposed texture
  if (legNow) {
    let lm = null; scene.traverse((o) => { if (!lm && o.isMesh && o.name === legNow.name) lm = Array.isArray(o.material) ? o.material[0] : o.material; });
    if (lm && lm.map && !lm.map.userData.__ls628Tracked) {
      lm.map.userData.__ls628Tracked = true; lm.map.userData.__ls628Disposed = 0;
      lm.map.addEventListener('dispose', () => { lm.map.userData.__ls628Disposed++; });
    }
  }
  let nowMapDisposed = null;
  if (legNow) { let lm = null; scene.traverse((o) => { if (!lm && o.isMesh && o.name === legNow.name) lm = Array.isArray(o.material) ? o.material[0] : o.material; }); nowMapDisposed = lm && lm.map ? (lm.map.userData.__ls628Disposed || 0) : null; }
  const leg = S.legMat ? { stashUuid: S.legMat.uuid, stashMapUuid: S.legMap ? S.legMap.uuid : null,
    matDisposed: S.legMatDisposed, mapDisposed: S.legMapDisposed, nowMapDisposed,
    nowUuid: legNow ? legNow.mat : null, nowMapUuid: legNow ? legNow.map : null, nLegMeshes: legs.length,
    nowMapIsApron: (() => { let a = null; scene.traverse((o) => { if (!a && o.isMesh && /^dm-apronband/.test(o.name || '')) a = Array.isArray(o.material) ? o.material[0] : o.material; }); return a && legNow ? (a.map ? a.map.uuid : null) === legNow.map : null; })() } : null;
  return JSON.stringify({ how, rimless, collar: read(S.collar), liner: read(S.liner), collars, leg });
})()`;

const ACTIVE = "import('./scene/table.js').then((t) => t.activeTableId())";
// --red-arm (D621-ALIGN-2 C4): a synthetic rim-building Pro-Am state — the probe reports rimless=false — must
// print FAIL on the rim rows, never N/A. The run's exit code is then EXPECTED to be 3; the arm passes iff every
// rim row that would have been N/A reads FAIL instead.
const RED_ARM = process.argv.includes('--red-arm');
const GI_STATE = '(() => { const s = window.__gi && window.__gi.state; '
  + 'return s ? JSON.stringify({ r: !!s.ready, b: !!s.baked }) : null; })()';
const waitFrame = (chrome) => chrome.eval(
  'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');

async function waitReady(chrome) {
  let ready = false;
  for (let i = 0; i < 300 && !ready; i++) {
    await sleep(200);
    ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
  }
  if (!ready) throw new Error('__test.ready never went true');
  await waitGi(chrome);
}
async function waitGi(chrome) {
  for (let i = 0; i < 200; i++) {
    const st = await chrome.eval(GI_STATE).catch(() => null);
    if (st) { const j = JSON.parse(st); if (j.r && j.b) return; }
    await sleep(200);
  }
  throw new Error('GI never settled');
}
async function settleFrames(chrome) {
  await waitFrame(chrome); await sleep(600); await waitFrame(chrome);
}
async function switchTo(chrome, id) {
  const ok = await chrome.eval(
    `__settings.changeEquipment('table_id', '${id}', { skipConfirm: true })`);
  if (ok !== true) throw new Error(`changeEquipment(table_id, ${id}) returned ${ok}`);
  let active = null;
  for (let i = 0; i < 100 && active !== id; i++) {
    await sleep(200);
    active = await chrome.eval(ACTIVE).catch(() => null);
  }
  if (active !== id) throw new Error(`switch to ${id}: app built '${active}'`);
  await waitGi(chrome);
  await settleFrames(chrome);
}
let naCount = 0; // rows recorded N/A (rim rows on rim-less Pro-Am states)
const na = (name, detail) => { naCount++; console.log(`n/a   ${name}  ${detail}`); };
async function probe(chrome) {
  await settleFrames(chrome);
  if (RED_ARM) await chrome.eval('window.__ls628RedArm = true');
  return JSON.parse(await chrome.eval(PROBE));
}

const results = [];
const check = (name, cond, detail) => {
  const ok = !!cond;
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  ${detail}`);
};
const fmt = (m) => (m ? `holder=${m.holder} tnt=${m.tnt} v=${m.version} used=${m.usedBy}` : 'null');

// Per state: both materials found, bound to visible meshes, holder + program
// leg both equal to `proam`.
function assertState(tag, p, proam) {
  for (const k of ['collar', 'liner']) {
    const m = p[k];
    if (k === 'liner' && p.rimless && !m) {
      na(`${tag}.${k}.found`, `this entry builds no dm-bootrim (r6 model boot); no mesh holds the rim material`);
      continue;
    }
    check(`${tag}.${k}.found`, m && p.how[k] !== 'MISMATCH', `how=${p.how[k]}`);
    if (!m) continue;
    // GH-621 D621-ALIGN (r6): the Pro-Am's model boot builds no dm-bootrim —
    // the rolled rim (with the SP-11 liner and the CP-10 casting) is retired,
    // so on a Pro-Am state the rim material is a stashed singleton with NO
    // users and no tint pass reaches it. That is not the cache-poison defect
    // this gate guards (a stale program on a live mesh): with nothing bound,
    // there is nothing to poison, and the collar arm still exercises the
    // contract in full. The rim rows are N/A on such a state — recorded,
    // never silently skipped; the name pick must agree (how !== 'name').
    if (k === 'liner' && p.rimless && proam && m.usedBy === 0 && p.how[k] !== 'name') {
      na(`${tag}.${k}.bound`, `usedBy=0 — this entry builds no dm-bootrim (r6 model boot; rim/liner/casting retired)`);
      check(`${tag}.${k}.program`, m.tnt !== null, `key=${m.key}`);
      check(`${tag}.${k}.holder==${proam}`, m.holder === proam, fmt(m));
      na(`${tag}.${k}.tnt==${proam}`, `no user mesh on this entry, no tint pass to read`);
      continue;
    }
    check(`${tag}.${k}.bound`, m.usedBy > 0, `usedBy=${m.usedBy} (singleton bound to this build)`);
    check(`${tag}.${k}.program`, m.tnt !== null, `key=${m.key}`);
    check(`${tag}.${k}.holder==${proam}`, m.holder === proam, fmt(m));
    check(`${tag}.${k}.tnt==${proam}`, m.tnt === proam, fmt(m));
  }
}

// D621-PLAN-3 (review r4 P2): on a Pro-Am state the corner boots share one
// zoning map and the side boots another, and the two DIFFER (the entry's
// per-type landing keys them); every boot mesh must hold its own profile's
// map — the pre-fix build rebound one shared material per pocket and left
// all six on the last (corner) map.
function collarCensus(tag, p) {
  const cs = p.collars || [];
  const corners = cs.filter((c) => /-c\d/.test(c.name)), sides = cs.filter((c) => /-s\d/.test(c.name));
  const uniq = (xs) => [...new Set(xs)];
  const cm = uniq(corners.map((c) => c.rm)), sm = uniq(sides.map((c) => c.rm));
  check(`${tag}.count`, cs.length === 6 && corners.length === 4 && sides.length === 2, `${cs.length} boots (${corners.length} corner / ${sides.length} side)`);
  check(`${tag}.cornersShareOneMap`, cm.length === 1 && cm[0], `corner maps ${cm.map((u) => String(u).slice(0, 8)).join(',')}`);
  check(`${tag}.sidesShareOneMap`, sm.length === 1 && sm[0], `side maps ${sm.map((u) => String(u).slice(0, 8)).join(',')}`);
  check(`${tag}.sideMapIsNotTheCornerMap`, cm.length === 1 && sm.length === 1 && cm[0] !== sm[0], `corner ${String(cm[0]).slice(0, 8)} vs side ${String(sm[0]).slice(0, 8)}`);
  check(`${tag}.twoMaterialInstances`, uniq(cs.map((c) => c.mat)).length === 2 && uniq(corners.map((c) => c.mat)).length === 1 && uniq(sides.map((c) => c.mat)).length === 1,
    `materials ${uniq(cs.map((c) => c.mat)).map((u) => String(u).slice(0, 8)).join(',')}`);
}
// D621-PLAN-3 (review r4 P3): the leg material is build-scope shared — it must
// not be disposed by the teardown, and the rebuilt Pro-Am must hold the same
// live object with a live (apron-aliased) map
function legLifetime(tag, p, proamNow) {
  const l = p.leg;
  check(`${tag}.stashed`, !!l, l ? `stash ${l.stashUuid.slice(0, 8)}` : 'no leg material stashed at A0');
  if (!l) return;
  check(`${tag}.materialNotDisposed`, l.matDisposed === 0, `dispose events on the leg material: ${l.matDisposed} (the pre-fix teardown fired 8)`);
  // the stashed map is the STYLE's texture: styleMaterials disposes the previous apron map when the style changes
  // (prevApronMap), at most once per change away from the Pro-Am — more than that is the teardown's alias disposal
  check(`${tag}.stashMapDisposedAtMostOnce`, l.mapDisposed <= 1, `dispose events on the A0 apron/leg texture: ${l.mapDisposed} (style rebuild = 1; the pre-fix teardown alias = 8)`);
  if (proamNow) {
    check(`${tag}.sameObjectOnRebuild`, l.nowUuid === l.stashUuid, `now ${String(l.nowUuid).slice(0, 8)} vs stash ${l.stashUuid.slice(0, 8)} over ${l.nLegMeshes} leg/foot meshes`);
    check(`${tag}.mapIsTheApronMap`, l.nowMapIsApron === true, `leg map == apronMat.map: ${l.nowMapIsApron}`);
    check(`${tag}.currentMapLive`, l.nowMapDisposed === 0, `dispose events on the CURRENT leg map: ${l.nowMapDisposed} (a live mesh must never hold a disposed texture)`);
  }
}

let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
let CDP = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : null;
let band = null;
if (!PORT || !CDP) {
  band = await claimPortBand(24920, 24949);
  PORT = band.http(0); CDP = band.cdp(0);
}
const server = spawnStaticServer(webDir, PORT);
await sleep(800);
// `--web DIR` serves a tree that is DELIBERATELY not this checkout — that is
// the whole point of the red arm. launchChrome inherits cdp.mjs's served-tree
// preflight (GH-248), which byte-compares ONLY the served `app.html` and
// `tools/render/grade.json` (plus the entry script when it lives under web/)
// against THIS checkout's web/. CORRECTION (GH-628 close-out, skeptic
// finding): that preflight does NOT reject a baseline tree by construction —
// a pristine merge-base tree carries the same app.html and grade.json as this
// branch, so it PASSES (measured: `preflightServedTree` from this checkout
// against a served `git archive ad5d422c web tools/render` tree -> resolves;
// and this instrument's own first red-arm run, 48/54 exit 3, was produced
// under that preflight). The review round-5 text that said the mode "could
// never run" was wrong; what the checkout preflight really fails is a
// candidate tree whose app.html / grade.json DIFFER from this checkout's.
// The preflight is still turned off for `--web` and REPLACED, on two honest
// grounds: (a) it cannot see the MODULES UNDER TEST — a port already owned by
// the current checkout passes it while serving the fixed table.js (review
// round 6 P2, the false red-arm pass); (b) a legitimate candidate tree may
// differ in app.html or grade.json. The replacement compares the served
// files against the tree this run actually asked for, which still catches
// the defect the preflight exists to catch — a concurrent lane owning the
// port answers from neither tree — and still catches the dangling
// web/tools/render symlink, because a foreign tree missing grade.json is
// named here instead of surfacing later as arm FAILs.
const FOREIGN = webDir !== path.join(REPO, 'web');
// The probe list must include the MODULES UNDER TEST, not just the boot files
// (review round 6 P2): `app.html` and `tools/render/grade.json` are typically
// byte-identical between a merge base and the branch, so a port already owned
// by the CURRENT checkout would satisfy an app.html-only identity check and
// the red arm would silently exercise the FIXED table.js while the report
// claimed it ran the baseline — a false red-arm pass, the one outcome this
// instrument must never produce. scene/table.js (styleMaterials + the
// sharedMats singletons) and scene/shading.js (the program cache key that
// reads the tint holder) are the two files the arms actually measure.
const FOREIGN_PROBES = ['app.html', 'tools/render/grade.json',
  'scene/table.js', 'scene/shading.js'];
// Wall-clock bound, mirroring cdp.mjs's preflight (OB_CDP_PREFLIGHT_MS,
// default 15 s) with a per-attempt AbortSignal (review round 6 P2): a stale
// loopback listener that accepts the connection and then stalls its headers
// or body would hang an unbounded fetch forever, and a harness that hangs is
// worse than one that fails — nothing downstream can distinguish it from a
// slow render.
const FOREIGN_BUDGET_MS = Number(process.env.OB_CDP_PREFLIGHT_MS) > 0
  ? Number(process.env.OB_CDP_PREFLIGHT_MS) : 15000;
const FOREIGN_ATTEMPT_MS = 2000;
const foreignPreflight = async () => {
  const deadline = Date.now() + FOREIGN_BUDGET_MS;
  for (const rel of FOREIGN_PROBES) {
    const lp = path.join(webDir, rel);
    if (!fs.existsSync(lp)) {
      throw new Error(`--web tree ${webDir} has no ${rel} — an incomplete tree`
        + " (or a dangling web/tools/render symlink): the app's loadGrade()"
        + ' would throw and every arm would fail for the wrong reason');
    }
    const local = fs.readFileSync(lp);
    let served = null; let why = 'no answer';
    for (let i = 0; !served; i++) {
      if (i) {
        if (Date.now() >= deadline) break;
        await sleep(250);
      }
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/${rel}`,
          { signal: AbortSignal.timeout(FOREIGN_ATTEMPT_MS) });
        if (!r.ok) { why = `HTTP ${r.status}`; continue; }
        served = Buffer.from(await r.arrayBuffer());
      } catch (e) { why = String(e && e.message || e); }
      if (!served && Date.now() >= deadline) break;
    }
    if (!served) {
      throw new Error(`--web preflight: :${PORT} never served ${rel} within `
        + `${FOREIGN_BUDGET_MS} ms (${why})`);
    }
    if (!served.equals(local)) {
      throw new Error(`--web preflight: :${PORT} served ${rel} `
        + `(${served.length} B) but ${lp} is ${local.length} B — the port is`
        + ' answering from ANOTHER tree; pick a free OB_E2E_PORT');
    }
  }
  console.log(`# --web ${webDir}: checkout preflight off, served tree verified`
    + ` against the requested tree instead (${FOREIGN_PROBES.join(', ')})`);
};
const report = { tool: 'liveswitch-628', webDir, foreign: FOREIGN, arms: {}, results: null, pass: null };
let exitCode = 1;
try {
  if (FOREIGN) await foreignPreflight();
  // A COLD boot of `id` from PERSISTED settings — the state a returning user
  // is in, and the only state in which a later changeEquipment() is a real
  // switch. Two boot shapes are deliberately NOT used: a `?table=` URL pin
  // builds the scene for `id` but leaves the persisted table_id at the app
  // default, and a tool-stamped boot (launchChrome's default `obtool`) pins
  // the scene to the scripted wpa_generic entry — in both, the persisted
  // value and the built scene disagree, so changeEquipment(<persisted id>)
  // short-circuits as a same-id no-op and the arm never switches. So this
  // is a REAL-USER boot (`tool: false`, the e2e-lighting GH-488 arm idiom):
  // the scene is whatever settings persist. The first load persists `id`
  // through the real settings seam when needed; the reload is the cold
  // boot: a new document, a new WebGL context, programs compiled from
  // scratch for `id`.
  const bootTable = async (id) => {
    const url = `http://127.0.0.1:${PORT}/app.html?seed=7`;
    const chrome = await launchChrome(url,
      { port: CDP, width: 1280, height: 800, tool: false, preflight: !FOREIGN });
    await waitReady(chrome);
    let active = await chrome.eval(ACTIVE);
    if (active !== id) {
      const ok = await chrome.eval(
        `__settings.changeEquipment('table_id', '${id}', { skipConfirm: true })`);
      if (ok !== true) throw new Error(`persist ${id}: changeEquipment returned ${ok}`);
      for (let i = 0; i < 100 && active !== id; i++) {
        await sleep(200);
        active = await chrome.eval(ACTIVE).catch(() => null);
      }
      if (active !== id) throw new Error(`persist ${id}: app built '${active}'`);
      // pre-reload nonce (the e2e-lighting reload-arm idiom): readiness only
      // counts on the NEW document, where the nonce is gone
      await chrome.eval('window.__ob628PreReload = true');
      await chrome.send('Page.reload');
      let ready = false;
      for (let i = 0; i < 300 && !ready; i++) {
        await sleep(200);
        ready = await chrome.eval(
          'window.__ob628PreReload === undefined && window.__test?.ready === true')
          .catch(() => false);
      }
      if (!ready) throw new Error(`cold boot of ${id}: reload never became ready`);
      await waitGi(chrome);
      active = await chrome.eval(ACTIVE);
      if (active !== id) throw new Error(`cold boot ${id}: app built '${active}'`);
    }
    await sleep(800);
    return chrome;
  };

  // Teardown that is allowed to fail the run. cdp.mjs's closeAndWait() reports
  // whether the process is CONFIRMED gone; a `false` means a browser may still
  // hold the CDP port and the profile directory that the next arm is about to
  // reuse, so it is raised instead of dropped.
  const closeConfirmed = async (chrome, who) => {
    const gone = await chrome.closeAndWait();
    if (gone === false) {
      throw new Error(`${who}: chrome teardown unconfirmed — CDP port ${CDP} `
        + 'and the profile dir may still be held; refusing to reuse them');
    }
  };

  // ---- arm A: Pro-Am boot -> Red Label -> Pro-Am --------------------------
  {
    console.log(`# arm A: boot ${PROAM} -> ${RL} -> ${PROAM}`);
    const chrome = await bootTable(PROAM);
    try {
      const p0 = await probe(chrome);
      report.arms.A_boot_proam = p0;
      assertState('A0.proam-boot', p0, true);
      await switchTo(chrome, RL);
      const p1 = await probe(chrome);
      report.arms.A_after_redlabel = p1;
      assertState('A1.after->redlabel', p1, false);
      await switchTo(chrome, PROAM);
      const p2 = await probe(chrome);
      report.arms.A_after_proam = p2;
      assertState('A2.after->proam', p2, true);
      for (const k of ['collar', 'liner']) {
        if (k === 'liner' && p0.rimless && !p0[k]) {
          na('A.liner.sameObject', 'the Pro-Am boot state holds no rim material (r6 model boot); identity is read on arm B');
          continue;
        }
        check(`A.${k}.sameObject`, p0[k] && p1[k] && p2[k]
          && p0[k].uuid === p1[k].uuid && p1[k].uuid === p2[k].uuid,
        `uuid ${p0[k]?.uuid?.slice(0, 8)} across 3 builds`);
      }
      // D621-PLAN-3 (review r4 P2): per-pocket roughness maps on the Pro-Am
      // boot state and again after the round trip
      collarCensus('A0.collars', p0);
      collarCensus('A2.collars', p2);
      // D621-PLAN-3 (review r4 P3): the leg material stashed at A0 must survive
      // the switch away (A1) and be the SAME live object on the rebuilt Pro-Am
      // (A2), with neither it nor its (apron-aliased) map disposed
      legLifetime('A1.leg', p1, false);
      legLifetime('A2.leg', p2, true);
      // Both arms boot on the SAME CDP port and the SAME profile dir, so arm B
      // must not start until arm A's browser is confirmed gone: a survivor
      // would hand arm B a live page from the previous table and every B
      // assertion would read arm A's scene. closeAndWait() returns false when
      // it could not confirm the exit, so that answer is a harness failure
      // rather than something to discard (review round 4 P2; house pattern from
      // cammatch-489.mjs:392).
    } finally { await closeConfirmed(chrome, 'arm A'); }
  }
  // ---- arm B: Red Label boot -> Pro-Am ------------------------------------
  {
    console.log(`# arm B: boot ${RL} -> ${PROAM}`);
    const chrome = await bootTable(RL);
    try {
      const p3 = await probe(chrome);
      report.arms.B_boot_redlabel = p3;
      assertState('B0.redlabel-boot', p3, false);
      await switchTo(chrome, PROAM);
      const p4 = await probe(chrome);
      report.arms.B_after_proam = p4;
      assertState('B1.after->proam', p4, true);
      for (const k of ['collar', 'liner']) {
        check(`B.${k}.sameObject`, p3[k] && p4[k] && p3[k].uuid === p4[k].uuid
          && p4.how[k] !== 'MISMATCH',
        `signature pick == name pick (${p3.how[k]} -> ${p4.how[k]})`);
      }
      collarCensus('B1.collars', p4);
    } finally { await closeConfirmed(chrome, 'arm B'); }
  }
  report.results = results;
  report.naCount = naCount;
  if (RED_ARM) {
    // armed: the rim rows must have FAILED (not N/A) on the synthetic rim-building Pro-Am states
    const rimFails = results.filter((r) => !r.ok && /\.liner\./.test(r.name)).length;
    report.redArm = { rimFails, naCount, ok: rimFails > 0 && naCount === 0 };
    console.log(`\n[liveswitch-628 --red-arm] rim rows FAIL ${rimFails}, N/A ${naCount} -> ${report.redArm.ok ? 'ARM OK (the N/A clause is gated on rimless)' : 'ARM BROKEN'}`);
    report.pass = report.redArm.ok;
    exitCode = report.pass ? 0 : 3;
  } else {
    report.pass = results.every((r) => r.ok);
    exitCode = report.pass ? 0 : 3;
  }
} catch (e) {
  report.error = String(e && e.stack || e);
  console.error('[liveswitch-628] harness failure:', e);
  exitCode = 1;
} finally {
  await stopStaticServer(server);
  if (band) await band.release?.();
  fs.writeFileSync(path.join(OUT, 'liveswitch-628.json'), JSON.stringify(report, null, 2));
  const n = results.length; const bad = results.filter((r) => !r.ok).length;
  console.log(`\n[liveswitch-628] ${n - bad}/${n} assertions hold (${bad} failed)`
    + ` on ${webDir} -> ${OUT}/liveswitch-628.json  exit ${exitCode}`);
  process.exit(exitCode);
}
