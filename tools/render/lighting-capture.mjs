// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-capture.mjs — the venue-lighting lane's multi-table register
// capture on the LIVE app (SPIKE-BRIEF-LIGHTING.md). For every table × look
// it boots app.html (cinema pin, seed 7), waits for the GI/rig settle, hides
// the interactive chrome, derives the register poses from the LIVE table spec
// (lib/lighting-page.mjs POSE_DERIVE_SRC) and, per pose, writes
//   <out>/<look>/<table>/<pose>.png        the displayed frame (ACES, look exposure)
//   <out>/<look>/<table>/<pose>.hdr.f32    scene-linear RGB float32 LE, 2× box-
//                                          downsampled, top-down rows (+ .json)
// plus, once per table × look,
//   <out>/<look>/<table>/census.json       every light + rig/GI/tone state
//   <out>/<look>/<table>/identity.json     mesh + material identity census (settle.flush = the occlusion-trace flush record, §L31)
// and <out>/manifest.json (git sha, flags, chrome UA, timings).
//
//   node tools/render/lighting-capture.mjs --out DIR [--tables a,b] [--look
//     default|sp|both] [--poses p1,p2] [--flags "k=v&k2=v2"] [--w 1280 --h 800]
//     [--no-hdr] [--no-identity] [--ds 2]
//
// `--flags` are appended to the boot URL verbatim — the lane's rig terms are
// flag-gated (?venue=off etc.), so a BEFORE/AFTER pair is one build shot
// twice. Ports: the lane's own band (plan 9490–9519 from the driver's environment; tracked defaults in undeclared space), ONE Chrome at a time, own PIDs
// only (web/tools/cdp.mjs claimPortBand + tracked teardown). Read-only against
// web/; writes only under --out.
import path from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
} from '../../web/tools/cdp.mjs';
import {
  POSE_DERIVE_SRC, HIDE_UI_SRC, SETTLE_SRC, hdrReadSrc, LIGHT_CENSUS_SRC,
  IDENTITY_SRC, ATTR_VERSION_SRC, SNK_OCCL_FLUSH_SRC,
} from './lib/lighting-page.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');
const webDir = process.env.OB_LIGHTING_WEB ?? path.join(REPO, 'web');
// ORDER-LIGHT-C2 (chain14 attempt 1, capture-studiopre): web/tools/cdp.mjs's served-tree preflight (GH-248) byte-compares the served
// app.html / grade.json / gate script with THIS CHECKOUT's web/ — right for every gate that serves its own checkout, wrong by construction
// for the negative-control sets, which deliberately serve ANOTHER tree (OB_LIGHTING_WEB = a pristine export: prefix8 / prefix10 / prefix11).
// Those passed only while the control's app.html happened to be byte-identical to the checkout's (land13); the merge of main 0120202e made
// the checkout's app.html differ from prefix11's and every studiopre run was refused as "answering from ANOTHER tree". So: when webDir is
// foreign, the capture runs its OWN served-root preflight against the tree it serves (same probes, same fail-closed intent: a port collision
// or an incomplete export still throws by name) and passes `preflight: false` to launchChrome; a checkout-served run keeps cdp.mjs's.
const FOREIGN_WEB = path.resolve(webDir) !== path.resolve(REPO, 'web');
// ORDER-LIGHT-C2-FIX1 §L31 (land15 attempt 2: the aOccl race — see SNK_OCCL_FLUSH_SRC): before the settle predicate and before every dump the
// capture flushes table.js's pending occlusion traces through the app's own render-determinism seam (window.__snkOccl.flush()), reads the
// attribute-version signature around it and records the flush on the run, the census (settle.flush + contract.settleFlush*) and the identity dump
// (settle.flush). OB_SETTLE_FLUSH=off = the seal arm `settleflushoff`: nothing is flushed and the record says so — the fence refuses such a dump
// by name. A seam that throws fails the run by name (no dump is written); a tree without the seam is recorded as 'seam-absent' (the fence
// refuses it too: a dump whose transport attributes may still be landing is not identity evidence).
const SETTLE_FLUSH = (process.env.OB_SETTLE_FLUSH || 'on').toLowerCase();
if (!['on', 'off'].includes(SETTLE_FLUSH)) { console.error(`[capture] OB_SETTLE_FLUSH must be on|off (got ${JSON.stringify(process.env.OB_SETTLE_FLUSH)})`); process.exit(2); }
async function flushTraces(chrome, phase) {
  const before = await chrome.eval(ATTR_VERSION_SRC);
  if (SETTLE_FLUSH === 'off') {
    return { phase, mode: 'off', seam: null, ms: 0, attrsBefore: before.attrs, attrsAfter: before.attrs, attrsDelta: 0, sigBefore: before.sig, sigAfter: before.sig, sigMoved: false,
      rebakeFired: false, note: 'OB_SETTLE_FLUSH=off (seal arm settleflushoff): the pending traces were NOT flushed — a dump written this way is refused by the fence' };
  }
  const f = await chrome.eval(SNK_OCCL_FLUSH_SRC);
  if (!f || f.err) throw new Error(`occlusion-trace flush (${phase}): ${f ? f.err : 'no result from the page'} — the run fails by name (no dump is written)`);
  const after = await chrome.eval(ATTR_VERSION_SRC);
  return { phase, mode: f.seam ? 'flushed' : 'seam-absent', seam: !!f.seam, ms: f.ms, attrsBefore: before.attrs, attrsAfter: after.attrs, attrsDelta: after.attrs - before.attrs,
    sigBefore: before.sig, sigAfter: after.sig, sigMoved: before.sig !== after.sig, bakeBefore: f.bakeBefore, bakeAfter: f.bakeAfter, rebakeFired: !!f.rebakeFired };
}
function flushSummary(recs) {
  const modes = recs.map((r) => r.mode);
  return { mode: modes.every((m) => m === 'flushed') ? 'flushed' : (modes.includes('off') ? 'off' : 'seam-absent'), seam: recs.length > 0 && recs.every((r) => r.seam === true),
    flushes: recs.length, phases: recs.map((r) => r.phase), attrsDelta: recs.reduce((t, r) => t + (r.attrsDelta || 0), 0), sigMoved: recs.some((r) => r.sigMoved),
    ms: recs.reduce((t, r) => t + (r.ms || 0), 0), rebakeFired: recs.some((r) => r.rebakeFired),
    rule: 'table.js pending occlusion traces (aOccl) flushed through window.__snkOccl.flush() at boot and after every poke, before the settle predicate and every dump (ORDER-LIGHT-C2-FIX1 §L31)' };
}
/** NOTE-CENSUS-SETTLE: read the scene's attribute-version signature until it holds still for `need` consecutive reads (`every` ms apart);
 * cap `capMs` — on the cap the run is refused by name. Returns the record the census and the identity dump carry. */
async function waitAttrStable(chrome, { need = 3, every = 250, capMs = 30000 } = {}) {
  const t0 = Date.now(); let last = null, held = 0, reads = 0, changes = 0, lastChangeMs = 0; const sigs = [];
  let matLast = null; const matChurn = new Map(); let matChanges = 0;
  while (Date.now() - t0 < capMs) {
    const r = await chrome.eval(ATTR_VERSION_SRC); reads++;
    // material / map versions are OBSERVED, never a stability criterion: a per-frame needsUpdate bumps a version without moving any
    // identity field (the snooker table churns 118/119 reads that way); every churning entry is named in the record
    if (r && Array.isArray(r.mat)) {
      if (matLast) { const prev = new Map(matLast.map((x) => [x.slice(0, x.lastIndexOf(':')), x])); let moved = false; for (const x of r.mat) { const k = x.slice(0, x.lastIndexOf(':')); if (prev.get(k) !== x) { matChurn.set(k, (matChurn.get(k) || 0) + 1); moved = true; } } if (moved) matChanges++; }
      matLast = r.mat;
    }
    if (r && r.sig === last) held++; else { if (last !== null) { changes++; lastChangeMs = Date.now() - t0; } held = 1; last = r ? r.sig : null; sigs.push(r ? r.sig : 'null'); }
    if (held >= need) {
      const churn = [...matChurn.entries()].sort((a, b) => b[1] - a[1]);
      return { reads, held, changes, waitedMs: Date.now() - t0, lastChangeMs, meshes: r.meshes, attrs: r.attrs, sig: r.sig,
        matChanges, matChurn: churn.slice(0, 12).map(([k, n]) => `${k}×${n}`), matChurnCount: churn.length,
        rule: `geometry attribute versions (+ index, groups) held for >= ${need} consecutive reads ${every} ms apart, cap ${capMs} ms; material / map versions observed, not required` };
    }
    await sleep(every);
  }
  throw new Error(`identity settle: geometry attribute versions still moving after ${capMs} ms (${changes} change(s), last at +${lastChangeMs} ms, ${reads} reads; sigs ${sigs.slice(-4).join(' -> ')}) — refusing to dump`);
}
async function servedRootPreflight(url) {
  const u = new URL(url); const origin = u.origin;
  for (const rel of ['app.html', 'tools/render/grade.json']) {
    const local = path.join(webDir, rel);
    if (!existsSync(local)) throw new Error(`served-root preflight: ${local} missing — the served tree ${webDir} is not a complete web/ export`);
    let body = null;
    for (let i = 0; i < 25 && body === null; i++) {
      try { const r = await fetch(`${origin}/${rel}`); if (r.ok) body = Buffer.from(await r.arrayBuffer()); } catch { /* not up yet */ }
      if (body === null) await sleep(200);
    }
    if (body === null) throw new Error(`served-root preflight: nothing answers ${origin}/${rel} — the static server for ${webDir} never bound :${u.port}`);
    const mine = readFileSync(local);
    if (!body.equals(mine)) throw new Error(`served-root preflight: ${origin}/${rel} differs from ${local} (served ${body.length} B, local ${mine.length} B) — :${u.port} is answering from ANOTHER tree than the one this capture serves (${webDir})`);
  }
  return { servedRoot: webDir, preflight: 'own-root' };
}
const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);

const OUT = argOf('--out', null);
if (!OUT) throw new Error('usage: lighting-capture.mjs --out DIR [...]');
const ALL_TABLES = [
  'wpa_generic_9ft', 'wpa_spec_9ft', 'diamond_redlabel_9ft', 'diamond_proam_9ft',
  'predator_apex_9ft', 'wpbsa_snooker_12ft', 'umb_carom_284', 'chinese8_pro_9ft',
  'joy_q8_9ft', 'pool_pro_9ft_measured',
];
const TABLES = (argOf('--tables', ALL_TABLES.join(','))).split(',').filter(Boolean);
const LOOKS = { default: ['default'], sp: ['sp'], both: ['default', 'sp'] }[argOf('--look', 'both')];
if (!LOOKS) throw new Error('--look default|sp|both');
const POSE_FILTER = argOf('--poses', null)?.split(',').filter(Boolean) ?? null;
const FLAGS = argOf('--flags', '');
const W = Number(argOf('--w', 1280)), H = Number(argOf('--h', 800));
const DO_HDR = !has('--no-hdr');
const DO_ID = !has('--no-identity');
// land8 attempt 6 (2026-09-07): the clean below is per-RUN, but two runs can share one directory when a NARROW capture
// writes into a set a WIDER one owns. `capture-beforeconv` (--poses full34,cueball_level) writes main's converged pair
// into the shared main baseline `output/lighting/before`, so every seal run since 874ed7a9 silently cut
// predator_apex_9ft and wpa_spec_9ft from 14 poses to 2 and took the arm reads of P638-rack-* / P638-shadow-* with them
// (4 of attempt 6's 13 silent arms). --no-clean lets a run ADD to a directory it does not own; the seal passes it for
// that step only, and `--check-arms` fails closed if an armed row's pose goes missing anyway.
const DO_CLEAN = !has('--no-clean');
// ORDER-LIGHT-C1 (chain13 attempt 2): `--no-base` captures ONLY the poke sub-runs — for a set whose poses exist only after its poke (cup_rest after the
// cup drive) the base run used to be recorded EMPTY (0 poses: the silently-shorter run review named); under the fail-closed pose rule it is refused
// instead, so a poke-only set says so and records no base run at all
const NO_BASE = has('--no-base');
if (NO_BASE && !has('--poke') && !has('--poke-raw')) { console.error('[capture] --no-base needs at least one --poke / --poke-raw (a set with no runs at all is not a capture)'); process.exit(2); }
// ORDER-LIGHT-C1 (review r1 P2, lighting-capture.mjs:324-326): a run that MERGES poses of an earlier run (--no-clean) must say so — the carried
// files' run ids ride in priorRunIds, the carried cells are listed by name (manifest.carriedCells), and lighting-check-runs.py refuses the mix
// unless the caller declared the carry here (why the old evidence is admissible in this set)
const CARRY_DECLARED = argOf('--declare-carry', null);
const DS = Number(argOf('--ds', 2));
// --poke label=JS (repeatable): DIAGNOSTIC variants. Each label boots the page
// afresh, applies the JS after the settle + UI hide, nudges the brightness by
// +5e-4 through the public seam so the env cubemap re-bakes under the poked
// rig (a bare poke would measure a scene that never ships — the gh626 lane's
// recorded trap), and writes under <look>/<table>/<label>/. The un-poked
// pass ('base') always runs first. Poked frames are ablation evidence only.
const POKES = [];
// --poke-raw label=JS: the same, WITHOUT the brightness nudge / env re-bake — for pokes that are themselves a rig or
// table change (ORDER-LIGHT-7 arms: a live table switch, a fixture change during capture); the tool then waits on
// the settle predicate (GI idle + venue fill written) before the poses
for (let i = 0; i < argv.length; i++) if (argv[i] === '--poke-raw') { const [label, ...js] = argv[i + 1].split('='); POKES.push({ label, js: js.join('='), raw: true }); }
for (let i = 0; i < argv.length; i++) if (argv[i] === '--poke') { const [label, ...js] = argv[i + 1].split('='); POKES.push({ label, js: js.join('=') }); }
mkdirSync(OUT, { recursive: true });
// ORDER-LAND-638-FIX2 (review r6): ONE run id per process, stamped on the manifest, every run record, every HDR
// sidecar (*.hdr.f32.json) and census.json, so artefacts of a resumed / re-captured tree are fenced by the process
// that wrote them (a downstream check can refuse a mixed-run manifest via `priorRunIds`; that refusal lives in the
// seal script, not here)
const RUN_ID = Date.now().toString(36) + '-' + process.pid;

const sha = (() => { try { return execSync('git rev-parse HEAD', { cwd: REPO }).toString().trim(); } catch { return null; } })();
const dirty = (() => { try { return execSync('git status --porcelain', { cwd: REPO }).toString().trim().split('\n').filter(Boolean); } catch { return null; } })();

// the lane's band is 10 wide (brief: 9710–9719) — narrower than the GH-338
// suite layout minimum (30), so the band is claimed RAW and the pair is
// fixed: http 9710 / CDP 9711 (one Chrome at a time in this lane).
// NOTE-705-LANDED (GH-687/#705, 2026-09-08): the lane's PLAN band is 9490-9519 (web/tools/lane-bands.json); the legacy 9710-9719 expires
// 2026-09-10. main's ci-bands-lint reads every tracked tool: a DEFAULT inside ANY declared band (the lane's own included) is red, so the
// tracked defaults sit in UNDECLARED space (16940-16969, no lane / CI row) and the lane's plan band arrives from the untracked chain driver's
// environment (OB_LIGHTING_BAND_START/END = 9490/9519, OB_LIGHTING_PORT/CDP = 9490/9491) — the same shape as main's own migrated tools.
// NOTE-725-LANDED (ci-bands-lint tool-default-overlap): lighting-capture.mjs and lighting-eval.mjs share the lane's default window ON PURPOSE
// (lighting-eval is a hand-run diagnostic on the lane's band, never launched by the seal beside a capture; the band is one lane's) — declared,
// so the lint judges the sharing as intended, never as a collision
export const SHARED_DEFAULT_WINDOW = 'lighting';
// NOTE-725-LANDED (ci-bands-lint override-undeclared): the exact-width pins REPLACE the role endpoints inside the claimed band — declared so run-gate knows the derived endpoints
export const PORT_OVERRIDES = { http: 'OB_LIGHTING_PORT', cdp: 'OB_LIGHTING_CDP' };
const band = await claimPortBand(Number(process.env.OB_LIGHTING_BAND_START ?? 16940), Number(process.env.OB_LIGHTING_BAND_END ?? 16969), { layout: false });
const PORT = Number(process.env.OB_LIGHTING_PORT ?? 16940);
const CDPP = Number(process.env.OB_LIGHTING_CDP ?? 16941);
if (PORT < band.start || PORT > band.end || CDPP < band.start || CDPP > band.end) throw new Error(`lighting-capture: the bound ports http ${PORT} / CDP ${CDPP} lie outside the claimed band ${band.start}-${band.end} (OB_LIGHTING_PORT / OB_LIGHTING_CDP must sit inside OB_LIGHTING_BAND_START/END)`);
const server = spawnStaticServer(webDir, PORT);
await sleep(700);

// an existing manifest in --out is EXTENDED (runs appended; same flags
// required) so sequential invocations into one tree never lose a run's
// camera matrices (the coef/ loss of 2026-09-04, recorded in the report)
// land8 attempt 6: with --no-clean a run ADDS to a directory it does not own, so the prior entry for the same
// (table, look, poke) still describes pose FILES that are still on disk. Kept here so those poses can be carried
// into the new entry (tagged with the run that actually produced them) instead of vanishing from the provenance.
let PREV_RUNS = [];
const manifestPath = path.join(OUT, 'manifest.json');
let manifest = {
  runId: RUN_ID, sha, dirty, webDir, flags: FLAGS, w: W, h: H, ds: DS, hdr: DO_HDR, identity: DO_ID,
  started: new Date().toISOString(), runs: [],
};
if (existsSync(manifestPath)) {
  try {
    const prev = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (prev.flags !== FLAGS || prev.w !== W || prev.h !== H || prev.ds !== DS) {
      throw new Error(`--out ${OUT} holds a manifest with different flags/size (${prev.flags} ${prev.w}x${prev.h} ds ${prev.ds}); use another --out`);
    }
    manifest = { ...prev, runs: prev.runs.filter((r) => !(TABLES.includes(r.table) && LOOKS.includes(r.look) && (r.poke ?? null) === null && POKES.length === 0) || r.failed === undefined && false), resumed: true, resumedAt: [...(prev.resumedAt ?? (Array.isArray(prev.resumed) ? prev.resumed : [])), new Date().toISOString()] };
    // a re-capture of the same (table, look, poke) REPLACES the earlier run
    // ORDER-LIGHT-C2-FIX2 class C (review r4 P2): a baseline record is removed ONLY by the invocation that recaptures it — under --no-base the
    // baseline (poke null) is not captured, so it must not be filtered out (before: `null` was always in the set; the files stayed on disk
    // but manifest.runs lost the record and lighting-render-reads.py silently stopped processing that baseline). OB_CAPTURE_NOBASE_FILTER=legacy
    // = the pre-fix rule (the arm nobasekeep).
    const REPLACED = [...((NO_BASE && process.env.OB_CAPTURE_NOBASE_FILTER !== 'legacy') ? [] : [null]), ...POKES.map((p) => p.label)];
    manifest.runs = manifest.runs.filter((r) => !(TABLES.includes(r.table) && LOOKS.includes(r.look) && REPLACED.includes(r.poke ?? null)));
    // ORDER-LAND-638-FIX2 (review r6): the OTHER cells' runs are kept (merge behaviour unchanged); this process's id
    // becomes the manifest's runId and the kept runs' distinct ids (null = written before run ids existed) are
    // recorded so a downstream check can refuse a mixed-run manifest
    PREV_RUNS = prev.runs ?? [];
    // land8 attempt 6: `{...prev}` carried the FIRST run's sha / webDir / started into every later manifest, so an arm set
    // re-captured from another tree still named the old one (the two mis-based arm sets read sha 81e0e0c4 while the seal log
    // and the pixels showed 2b415aa7). The header now describes THIS process; the ones it replaces are kept, not dropped.
    manifest.priorHeaders = [...(prev.priorHeaders ?? []), { runId: prev.runId ?? null, sha: prev.sha, dirty: prev.dirty, webDir: prev.webDir, started: prev.started, hdr: prev.hdr, identity: prev.identity }];
    manifest.sha = sha; manifest.dirty = dirty; manifest.webDir = webDir; manifest.started = manifest.priorHeaders[0].started; manifest.startedThisRun = new Date().toISOString();
    manifest.hdr = DO_HDR; manifest.identity = DO_ID; manifest.clean = DO_CLEAN;
    manifest.runId = RUN_ID;
    manifest.priorRunIds = [...new Set(manifest.runs.map((r) => r.runId ?? null))];
  } catch (e) { throw e; }
}
const saveManifest = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

/** ORDER-LIGHT-7 R-B: `settled` is a level, not an edge — a poke that changes the fixture twice (canopy → auto)
 * passes through a settled state with no venue term (no capture pending) before the state we mean to shoot. Poll
 * until the venue + GI signature has not moved for `need` consecutive polls, then return that still state. */
async function waitSettleStable(chrome, { tries = 400, everyMs = 100, need = 4 } = {}) {
  let last = null, sig = null, hits = 0;
  for (let i = 0; i < tries; i++) {
    const st = await chrome.eval(SETTLE_SRC).catch(() => null);
    const nsig = st?.settled ? JSON.stringify([st.venue, st.gi]) : null;
    if (nsig && nsig === sig) { if (++hits >= need) return { state: st, stable: true, polls: i + 1 }; }
    else hits = nsig ? 1 : 0;
    sig = nsig; last = st;
    await sleep(everyMs);
  }
  return { state: last, stable: false, polls: tries };
}

// ORDER-LIGHT-CALM (land8): the host's load at every boot — 1 min loadavg, CPU idle % (top's second sample), the number of
// chrome-headless-shell processes on the box (ours included while we run) — written into each run's manifest record
// (run.load at boot start, run.loadEnd after the poses) so a boot-state row under load is a RECORD with its cause on file
function sampleLoad() {
  const out = { at: new Date().toISOString(), load1: null, idle: null, chrome: null };
  try { out.load1 = Number(execSync('sysctl -n vm.loadavg', { encoding: 'utf8' }).split(/\s+/)[1]); } catch { /* recorded as null */ }
  try { const t = execSync('top -l 2 -n 0 -s 1 | grep "CPU usage" | tail -1', { encoding: 'utf8' }); const m = /([\d.]+)% idle/.exec(t); out.idle = m ? Number(m[1]) : null; } catch { /* null */ }
  try { out.chrome = Number(execSync('pgrep -f chrome-headless-shell | wc -l', { encoding: 'utf8' }).trim()); } catch { /* null */ }
  return out;
}

async function captureOne(table, look, poke = null) {
  const t0 = Date.now();
  const loadAtBoot = sampleLoad();
  const bootLook = look === 'sp' ? 'sp' : 'green';
  const url = `http://127.0.0.1:${PORT}/app.html?table=${table}&cinema=1&seed=7&look=${bootLook}`
    + (FLAGS ? `&${FLAGS}` : '');
  const dir = poke ? path.join(OUT, look, table, poke.label) : path.join(OUT, look, table);
  mkdirSync(dir, { recursive: true });
  // ORDER-LAND-638-FIX2 (review r6): a re-capture of the same (table, look, poke) REPLACES the manifest run entry
  // (see the manifest.runs filter above) but used to leave the earlier files in place, so a failed re-capture could
  // hand downstream tools stale PNG / HDR / census evidence. Clear the FILES directly inside this run's own dir
  // (pose PNGs, *.hdr.f32 + .json, census.json, identity.json) before the run; never anything outside `dir`, and
  // never the poke sub-directories of a base run (they are separate runs with their own manifest entries).
  if (DO_CLEAN) {
    if (!path.resolve(dir).startsWith(path.resolve(OUT) + path.sep)) throw new Error(`refusing to clear ${dir}: outside --out ${OUT}`);
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.isFile()) rmSync(path.join(dir, ent.name), { force: true });
    }
  }
  const rootCheck = FOREIGN_WEB ? await servedRootPreflight(url) : { servedRoot: webDir, preflight: 'cdp' };
  const chrome = await launchChrome(url, { port: CDPP, width: W, height: H, ...(FOREIGN_WEB ? { preflight: false } : {}) });
  const run = { runId: RUN_ID, table, look, url, poke: poke ? poke.label : null, pokeJs: poke ? poke.js : null, poses: [], warnings: [], load: loadAtBoot, servedRoot: rootCheck.servedRoot, preflight: rootCheck.preflight };
  try {
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    // ORDER-LIGHT-C2-FIX4 class C: the settled predicate requires the CURRENT GI apply to have completed (lighting-page.mjs SETTLE_SRC);
    // OB_SETTLE_APPLYSEQ=legacy restores the pre-fix rule in the page (the arm) and is recorded on the run
    const settleLegacy = process.env.OB_SETTLE_APPLYSEQ === 'legacy';
    if (settleLegacy) await chrome.eval('window.__settleLegacyApplySeq = true').catch(() => {});
    run.settleRule = settleLegacy ? 'legacy' : 'apply-complete';
    let st = null;
    for (let i = 0; i < 300; i++) {
      st = await chrome.eval(SETTLE_SRC).catch(() => null);
      if (st?.settled) break;
      await sleep(200);
    }
    if (!st?.settled) throw new Error(`${table}/${look}: never settled: ${JSON.stringify(st)}`);
    // ORDER-LIGHT-C2-FIX1 §L31: flush the pending occlusion traces NOW (the table is built, the first settle passed), then settle AGAIN — the
    // flush may fire the corrective env re-bake table.js debounces after its last trace lands
    run.occlFlush = [await flushTraces(chrome, 'boot')];
    for (let i = 0; i < 300; i++) {
      st = await chrome.eval(SETTLE_SRC).catch(() => null);
      if (st?.settled) break;
      await sleep(200);
    }
    if (!st?.settled) throw new Error(`${table}/${look}: never settled after the trace flush: ${JSON.stringify(st)}`);
    await chrome.eval('window.__settleSnapshot = (() => { const s = window.__gi && window.__gi.state; return { applySeq: s ? (s.applySeq ?? null) : null, appliedSeq: s ? (s.appliedSeq ?? null) : null, at: performance.now(), rule: (window.__settleLegacyApplySeq === true) ? "legacy" : "apply-complete" }; })()').catch(() => {}); // C2-FIX4 class C: the boot settle's snapshot (a poke overwrites it with its own)
    // ORDER-LIGHT-C1 (chain13 attempt 1): the table-selection FALLBACK is judged at BOOT, before any poke — the companion's rule (below) had read the
    // post-poke selection and refused the `switch` poke's intended table change (predator → joy inside the run); that set had been reused from land10
    // in every targeted regate and was first re-captured by the full chain. The boot selection is recorded on the run (bootTable).
    const bootDerived = await chrome.eval(POSE_DERIVE_SRC);
    if (bootDerived.table !== table && !(table === 'joy_q8_9ft' && bootDerived.table === 'chinese8_pro_9ft')
      && !(table === 'pool_pro_9ft_measured' && bootDerived.table === 'diamond_proam_9ft')) {
      throw new Error(`table fallback refused: the app selected ${bootDerived.table} at boot for the requested ${table} — no frames written under the requested key`);
    }
    run.bootTable = bootDerived.table;
    await sleep(1500); // env cubemap rebake + lampfade ramps
    await chrome.eval(HIDE_UI_SRC);
    await sleep(300);
    if (poke && poke.raw) {
      const r = await chrome.eval(`(() => { ${poke.js}; return true; })()`);
      if (r !== true) throw new Error(`poke-raw ${poke.label} did not evaluate`);
      await sleep(400);
      // ORDER-LAND-638 (d): a poke that drives the KERNEL (a staged pot, a seek into the record) is asynchronous —
      // it sets window.__pokePending = true and clears it when its state is reached; the capture waits for that
      // (<= 90 s) before the settle predicate, so the poses shoot the state the poke meant, never a half-driven one
      const wasPending = await chrome.eval('window.__pokePending === true').catch(() => false);
      if (wasPending) {
        let pend = true;
        for (let i = 0; i < 450 && pend; i++) { await sleep(200); pend = await chrome.eval('window.__pokePending === true').catch(() => true); }
        if (pend) throw new Error(`poke-raw ${poke.label}: still pending after 90 s`);
      }
      // ORDER-LIGHT-C2-FIX3 class C (review r5 P2, lighting-capture.mjs:320-325): the poke's result is read and validated AFTER the optional wait
      // REGARDLESS of the pending flag. Before, the inspection lived inside the pending branch: an async poke that failed during the 400 ms
      // sleep above (STUDIO_FN's import / installation rejecting at once) had already written __pokeResult.error and cleared __pokePending,
      // nothing was inspected, and the run captured gameplay frames as studio evidence with pokeApplied = true. An error is a refusal by
      // name, never a capture. OB_CAPTURE_POKERESULT=legacy = the pre-fix rule (the arm, tools/render/lighting-check-pokefail.sh).
      const pokeResultLegacy = process.env.OB_CAPTURE_POKERESULT === 'legacy';
      run.pokeWasPending = !!wasPending; run.pokeResultChecked = !!wasPending || !pokeResultLegacy;
      if (run.pokeResultChecked) {
        run.pokeResult = await chrome.eval('(() => { try { return JSON.parse(JSON.stringify(window.__cupRest ?? window.__pokeResult ?? null)); } catch (e) { return String(e); } })()').catch(() => null);
        if (run.pokeResult && run.pokeResult.error) throw new Error(`poke-raw ${poke.label}: ${run.pokeResult.error}`);
      }
      run.occlFlush.push(await flushTraces(chrome, 'poke-raw')); // ORDER-LIGHT-C2-FIX1 §L31: a poke may rebuild the table (new traces)
      const w2 = await waitSettleStable(chrome);
      const s2 = w2.state;
      if (!s2?.settled) throw new Error(`poke-raw ${poke.label}: never settled: ${JSON.stringify(s2).slice(0, 300)}`);
      // ORDER-LIGHT-C2-FIX4 class C: the GI sequence fields AT THE MOMENT the tool declared settled — read by the census (giSeqOpenAtSettle), so the
      // judgement does not depend on how long the poses take after settle (a hold that ends before the dump would hide an early certification)
      await chrome.eval('window.__settleSnapshot = (() => { const s = window.__gi && window.__gi.state; return { applySeq: s ? (s.applySeq ?? null) : null, appliedSeq: s ? (s.appliedSeq ?? null) : null, at: performance.now(), rule: (window.__settleLegacyApplySeq === true) ? "legacy" : "apply-complete" }; })()').catch(() => {});
      if (!w2.stable) run.warnings.push(`poke-raw ${poke.label}: venue/GI state still moving after ${w2.polls} polls`);
      await sleep(1500); // the rebuilt table's env re-bake + ramps
      await chrome.eval(HIDE_UI_SRC);
      run.settleAfterPoke = s2.venue ?? null; run.pokeApplied = true; run.pokeRaw = true;
      run.pokeStable = { stable: w2.stable, polls: w2.polls };
    } else if (poke) {
      const r = await chrome.eval(`(() => { ${poke.js}; return true; })()`);
      if (r !== true) throw new Error(`poke ${poke.label} did not evaluate`);
      // re-bake the env cubemap under the poked rig (public seam, +5e-4 brightness)
      await chrome.eval(`(() => { const L = window.__lighting; if (!L) return false; const s = L.state(); return L.apply(s.auto ? 'auto' : s.fixture, s.brightness + 5e-4); })()`);
      await sleep(1800);
      // re-apply (idempotent pokes): the nudge re-writes the rig values + GI gain
      await chrome.eval(`(() => { ${poke.js}; return true; })()`);
      await sleep(400);
      // ORDER-LIGHT-6 Q4: the nudge re-applies the rig → the derived fill re-captures (venue.pending); wait on the
      // settle predicate again rather than on the sleeps above
      run.occlFlush.push(await flushTraces(chrome, 'poke')); // ORDER-LIGHT-C2-FIX1 §L31: a poke may rebuild the table (new traces)
      const w2 = await waitSettleStable(chrome, { tries: 200 });
      // ORDER-LIGHT-FIX6 (review r10 P2, lighting-capture.mjs:227-230): a non-raw poke that is not (settled AND stable) after the poll
      // budget is a FAILED run — it throws here, before any screenshot, so the attempt loop retries and then records the run as
      // `failed` (exit 2, the cell named); no manifest entry ever reads "success" over transitional evidence. The raw-poke branch
      // above keeps its documented exception (settled required, stability a warning: the conv poke's own convergence loop is its
      // stability proof). Seal arm `pokestuck` = a poke that never settles, on this tool (must fail) and on the pre-FIX6 tool (which
      // wrote a successful manifest — the finding).
      if (!w2.state?.settled || !w2.stable) {
        throw new Error(`poke ${poke.label}: ${!w2.state?.settled ? 'never settled' : 'venue/GI state still moving'} after ${w2.polls} polls: ${JSON.stringify(w2.state).slice(0, 300)}`);
      }
      await chrome.eval('window.__settleSnapshot = (() => { const s = window.__gi && window.__gi.state; return { applySeq: s ? (s.applySeq ?? null) : null, appliedSeq: s ? (s.appliedSeq ?? null) : null, at: performance.now(), rule: (window.__settleLegacyApplySeq === true) ? "legacy" : "apply-complete" }; })()').catch(() => {}); // C2-FIX4 class C: the settle snapshot (see the raw-poke branch)
      run.settleAfterPoke = w2.state.venue ?? null;
      run.pokeStable = { stable: true, polls: w2.polls };
      run.pokeApplied = true;
    }
    const derived = await chrome.eval(POSE_DERIVE_SRC);
    // ORDER-LIGHT-COMPANION (review r12 P2, lighting-capture.mjs:242-244): a table-selection FALLBACK (an invalid id, a stale served app) used to
    // warn and write the ACTUAL table's frames under the REQUESTED table's directory and manifest key — evidence filed under the wrong name.
    // It is a failed run, judged at BOOT above (before the poke); after a poke the live table may differ by design (the switch pokes) and is
    // recorded here (tableAfterPoke) — never silently, never as a fallback.
    run.derived = derived;
    if (derived.table !== run.bootTable) { run.tableAfterPoke = derived.table; console.log(`[capture] ${look}/${table}${poke ? '/' + poke.label : ''}: the poke moved the live table to ${derived.table} (recorded; the boot selection was ${run.bootTable})`); }
    run.settle = st;
    // live ball set (three-frame positions + radius) for derived ball ROIs
    run.balls = await chrome.eval(`(() => { try { const R = (window.__gi && window.__gi.uniforms && window.__gi.uniforms.uSpheres)
      ? window.__gi.uniforms.uSpheres.value.map((v) => v.w) : null;
      return (window.__test.balls() || []).map((b, i) => ({ id: b.id, pocketed: b.pocketed, visible: b.visible, pos: b.pos, r: R && R[i] > 0.002 ? R[i] : null })); }
      catch (e) { return String(e); } })()`);
    // refuter round (COMPANION): the census and the identity dump are READ here (the settled state, before any camera move) but WRITTEN only
    // after every requested pose landed — a run that fails on a pose leaves no census / identity / frame under the requested key (the
    // fence reads identity.json by path, outside the manifest); this attempt's pose files are removed on the way out
    // NOTE-CENSUS-SETTLE: neither the census nor the identity dump is read until every geometry attribute's version (and every material's)
    // has held still for >= 3 consecutive reads 250 ms apart — cap 30 s, refused by name on the cap (the run fails; no dump is written)
    const attrSettle = await waitAttrStable(chrome);
    attrSettle.flush = flushSummary(run.occlFlush); // ORDER-LIGHT-C2-FIX1 §L31: the dumps carry the flush record (the fence judges it)
    run.identitySettle = attrSettle;
    const census = await chrome.eval(LIGHT_CENSUS_SRC);
    census.settle = attrSettle;
    census.contract = { ...(census.contract || {}), settleFlushed: attrSettle.flush.mode === 'flushed' ? 1 : 0, settleFlushSeam: attrSettle.flush.seam ? 1 : 0,
      settleFlushCount: attrSettle.flush.flushes, settleFlushAttrsDelta: attrSettle.flush.attrsDelta, settleFlushMs: attrSettle.flush.ms, settleFlushRebake: attrSettle.flush.rebakeFired ? 1 : 0 };
    let ident = null;
    if (DO_ID) {
      ident = await chrome.eval(IDENTITY_SRC);
      ident.settle = attrSettle;
      run.identity = { roots: ident.roots, meshes: ident.meshes.length, settle: attrSettle };
    }
    const poses = derived.poses.filter((p) => !POSE_FILTER || POSE_FILTER.includes(p.name));
    // ORDER-LIGHT-COMPANION: every REQUESTED pose must exist in the app's derived pose list — a name the app does not know used to yield a
    // silently shorter run (0 poses = a 'successful' empty run); it is a failed run, named
    if (POSE_FILTER) {
      const unknown = POSE_FILTER.filter((n) => !derived.poses.some((p) => p.name === n));
      if (unknown.length) throw new Error(`requested pose(s) not offered by the app: ${unknown.join(', ')} (offered: ${derived.poses.map((p) => p.name).join(', ')})`);
    }
    const written = [];
    try {
    for (const p of poses) {
      let ok = false;
      for (let i = 0; i < 25 && !ok; i++) {
        ok = await chrome.eval(`__test.cameraPose(${JSON.stringify({ cam: p.cam, look: p.look, fov: p.fov })})`);
        if (!ok) await sleep(200);
      }
      if (!ok) throw new Error(`pose ${p.name}: rejected by __test.cameraPose after 25 tries — the run fails rather than recording a partial pose set (ORDER-LIGHT-COMPANION, review r12 P2 lighting-capture.mjs:267)`);
      await sleep(500);
      const png = path.join(dir, `${p.name}.png`);
      written.push(png); await chrome.screenshot(png);
      // camera matrices of the shot frame so kernel-space points can be
      // projected to px offline (derived ROIs, never hand-picked boxes)
      const camRec = await chrome.eval(`(() => { const c = window.__dbg.camera; c.updateMatrixWorld(true);
        return { V: Array.from(c.matrixWorldInverse.elements), P: Array.from(c.projectionMatrix.elements),
          fov: c.fov, aspect: c.aspect, near: c.near, far: c.far, pos: [c.position.x, c.position.y, c.position.z] }; })()`);
      const rec = { name: p.name, cam: p.cam, look: p.look, fov: p.fov, png: path.relative(OUT, png), camera: camRec };
      if (DO_HDR) {
        const h = await chrome.eval(hdrReadSrc(DS));
        const raw = Buffer.from(h.b64, 'base64');
        const f32 = path.join(dir, `${p.name}.hdr.f32`);
        written.push(f32, `${f32}.json`); writeFileSync(f32, raw);
        writeFileSync(`${f32}.json`, JSON.stringify({ w: h.w, h: h.h, ds: h.ds, W: h.W, H: h.H, channels: 3,
          dtype: 'float32le', rows: 'top-down', nan: h.nan, neg: h.neg, max: h.max, runId: RUN_ID })); // ORDER-LAND-638-FIX2 (review r6): run-id stamp
        rec.hdr = { w: h.w, h: h.h, nan: h.nan, neg: h.neg, max: Number(h.max.toFixed(4)) };
      }
      run.poses.push(rec);
      console.log(`[capture] ${look}/${table}/${p.name}${rec.hdr ? ` hdrmax ${rec.hdr.max}` : ''}`);
    }
    } catch (e) {
      for (const f of written) rmSync(f, { force: true }); // no partial evidence under the requested key
      throw e;
    }
    writeFileSync(path.join(dir, 'census.json'), JSON.stringify({ ...census, runId: RUN_ID }, null, 1)); // ORDER-LAND-638-FIX2 (review r6): run-id stamp
    if (ident) writeFileSync(path.join(dir, 'identity.json'), JSON.stringify(ident));
  } finally {
    const gone = await chrome.closeAndWait();
    if (gone === false) run.warnings.push('chrome teardown unconfirmed');
  }
  run.ms = Date.now() - t0;
  run.loadEnd = sampleLoad(); // ORDER-LIGHT-CALM
  if (!DO_CLEAN) {
    // this run captured a SUBSET of the poses the cell holds; the files it did not touch are still there, so their
    // records are carried over and stamped with the run id that produced them (never silently re-attributed to this one)
    const prior = PREV_RUNS.find((r) => r.table === table && r.look === look && (r.poke ?? null) === (poke ? poke.label : null));
    const fresh = new Set(run.poses.map((q) => q.name));
    const carried = (prior && Array.isArray(prior.poses) ? prior.poses : []).filter((q) => !fresh.has(q.name))
      .map((q) => ({ ...q, carriedFromRunId: q.carriedFromRunId ?? prior.runId ?? null }));
    if (carried.length) {
      run.poses = [...run.poses, ...carried]; run.carriedPoses = carried.length;
      // C1: the carried files' origin rides in the manifest — their run ids join priorRunIds and the cell is listed by name
      const ids = [...new Set(carried.map((q) => q.carriedFromRunId).filter(Boolean))];
      manifest.priorRunIds = [...new Set([...(manifest.priorRunIds || []), ...ids])];
      manifest.carriedCells = [...(manifest.carriedCells || []), { look, table, poke: poke ? poke.label : null, poses: carried.map((q) => q.name), fromRunIds: ids, intoRunId: RUN_ID }];
      manifest.carryDeclared = CARRY_DECLARED; // null = undeclared: the checker refuses the set
      console.log(`[capture] ${look}/${table}${poke ? '/' + poke.label : ''}: carried ${carried.length} pose file(s) from run(s) ${ids.join(', ')}${CARRY_DECLARED ? ' (declared: ' + CARRY_DECLARED + ')' : ' — UNDECLARED (lighting-check-runs.py will refuse this set; pass --declare-carry <why>)'}`);
    }
  }
  manifest.runs.push(run);
  saveManifest();
}

// ORDER-LAND-638-FIX2 (review r6): a run that fails ALL its attempts is recorded in the manifest (`failed`) AND
// counted here; the process exits 2 once the manifest is saved and the server is down, so the seal script's
// fail-fast `step` wrapper sees the exhausted capture instead of a clean exit 0 with a hole in the evidence; the
// failing cells are NAMED on that line (look/table[@poke]).
let exhausted = 0; const exhaustedKeys = [];
try {
  for (const look of LOOKS) {
    for (const table of TABLES) {
      for (const poke of [...(NO_BASE ? [] : [null]), ...POKES]) {
        let attempt = 0, done = false, lastErr = null;
        while (!done && attempt < 2) {
          attempt++;
          try { await captureOne(table, look, poke); done = true; }
          catch (e) { lastErr = e; console.error(`[capture] ${look}/${table}${poke ? '/' + poke.label : ''} attempt ${attempt} failed: ${e.message}`); await sleep(1500); }
        }
        if (!done) {
          exhausted++; exhaustedKeys.push(`${look}/${table}${poke ? '@' + poke.label : ''}`);
          manifest.runs.push({ runId: RUN_ID, table, look, poke: poke?.label ?? null, failed: String(lastErr?.message ?? lastErr) }); saveManifest();
        }
      }
    }
  }
  manifest.finished = new Date().toISOString();
  manifest.exhausted = exhausted;
  saveManifest();
  console.log(`[capture] done: ${manifest.runs.length} runs → ${OUT}`);
} finally {
  await stopStaticServer(server);
  band.release();
}
if (exhausted > 0) {
  console.error(`[capture] FAILED: ${exhausted} run(s) exhausted their attempts: ${exhaustedKeys.join(', ')}`);
  process.exitCode = 2;
}
