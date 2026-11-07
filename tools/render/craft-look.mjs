// Copyright (c) Meta Platforms, Inc. and affiliates.

// craft-look.mjs — the CRAFT-UPLIFT look-loop capture instrument.
//
//   node tools/render/craft-look.mjs --table <id> --out DIR
//        [--poses a,b,c | all] [--look default|sp] [--clothcolor <id>]
//        [--balls] [--band 9940-9969] [--tag <label>] [--web DIR]
//        [--raypick "x,y;x,y;..."] [--raydepth 4] [--ablate a,b]
//
// WHY THIS EXISTS, and why it is not capture-490-pose.mjs
// ------------------------------------------------------
// The look loop needs the SAME nine poses on every table, shot at the same
// 1600x1000 as the purchased-model comparison study's own bank (Drive
// 3dmodels-study-2026-08/ours/<table>/*.png), so that "before" and "after"
// and "theirs" are all pixel-comparable frames of the same camera. The
// per-table capture instruments (capture-490-pose.mjs, capture-488p-pose.mjs,
// capture-488d-registers.mjs) each carry their own register list, their own
// port band and their own frame size — none of them is that camera.
//
// The study lane's own throwaway clone of this (a /tmp script, repo untouched
// by design) has two properties that make it unfit to gate craft work with:
//
//   1. It hardcodes the 490 band (26760-26789 today) — which is orbitsweep-490's and
//      asmodeled-drawings-490's band. A look-loop capture running beside its
//      own table's gate collides.
//   2. It asserts NOTHING about which table it actually photographed. An
//      unknown or typo'd table id does not throw: table.js falls back to
//      SCRIPTED_PIN_TABLE_ID ('wpa_generic_9ft') and the run produces nine
//      confident PNGs of the wrong table. A look-line written off those
//      frames is worse than no look-line.
//
// So: identity is ASSERTED here, from the running app, before any shutter
// fires — playfield dims + GI bake class + the lighting FIXTURE (which also
// makes the GH-490/#625 rim-firefly repro deterministic rather than a rig
// lottery; the shared settle predicates do not all pin the fixture). A
// mismatch is exit 2, refusal, no frames.
//
// EXIT CODES (the hydrate_490 convention)
//   0  frames captured, identity asserted
//   2  input refusal: bad args, unknown table, IDENTITY MISMATCH, pose
//      rejected, app never ready, settle predicate never true
//
// --raypick: FORENSICS, not decoration. A look-line that names a defect must
// name the MESH that owns it, and eyeballing a cream pixel cannot tell
// cn8r82-ring from cn8r82-tongue from a cap-family leftover. Each listed
// pixel is converted to NDC and raycast against the live scene at the SAME
// pinned pose as the frame, and the first --raydepth hits are reported (not
// just the front one) — because half the questions are "what is BEHIND this
// surface", e.g. whether a bright wing has air or wood under it. Hits carry
// the kernel-frame point (kx = three.z, ky = three.x, h = three.y) in mm so
// they can be read against the drawing letters directly.
//
// Every run writes manifest.json beside the frames: the exact URL, the tree
// sha, the harness identity (chrome-shell pin + cdp.mjs hash), the pose set
// hash, and a sha256 per frame. A frame with no manifest line is not
// evidence.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
// GH-489 SNK-R35 (review r9 P2 B): the table the app BUILT must be the requested one — `?table=<misspelled>` boots the
// scripted pin (wpa_generic_9ft) under the requested label; the assertion is the lane's one reader (lib/table-ids.mjs)
import { builtTableIdExpr, assertBuiltTable } from './lib/table-ids.mjs';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const WEB = path.join(REPO, 'web');
const {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
  preflightServedTree, sweepStaleProfiles, chromeShellPin,
} = await import(pathToFileURL(path.join(WEB, 'tools', 'cdp.mjs')).href);

const argv = process.argv.slice(2);
const argOf = (flag, dflt = null) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')
    ? argv[i + 1] : dflt;
};
const has = (flag) => argv.includes(flag);
// A refusal AFTER the band is claimed must still tear down: process.exit()
// skips finally blocks, which would leak the port-band claim into the
// host-global registry and hand a stale claim to the next lane. So refusals
// throw, the finally releases, and the exit code is set on the way out.
class Refusal extends Error {}
let banded = false;
const die = (msg) => {
  if (banded) throw new Refusal(msg);
  console.error(`craft-look: ${msg}`);
  process.exit(2);
};

const { stringOpt: sOpt2, pathOpt: pOpt2 } = await import('./lib/argv.mjs');
const TABLE = (await (await import('./lib/table-ids.mjs')).requireTableIds([sOpt2('--table', { tag: 'craft-look', required: true })], 'craft-look'))[0]; // FIX1/FIX2: required, validated, the RETURN is the id used
const OUT = pOpt2('--out', { tag: 'craft-look' }); // FIX2: blank / trailing refused by name
const LOOK = argOf('--look', 'default');
const CLOTH = argOf('--clothcolor', null);
const TAG = argOf('--tag', null);
const KEEP_BALLS = has('--balls');
// GH-687: --band A-B is the range this tool claims itself (PORT_FLAGS role 'band')
export const PORT_FLAGS = { '--band': 'band' };
// GH-687 (SNK-R30): one static server + one CDP port from the claimed band or the pinned pair
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const BAND = argOf('--band', '9940-9969');
// --ablate: the look loop's A/B switch. shading.js reads ?ablate=<list> and
// skips the named layer, so the SAME camera, build and lamp solve photographs
// with and without one shading term — which is the only honest way to attribute
// a look-line to a layer. The list is stamped into the URL the manifest
// records, so an ablated frame can never be mistaken for a shipped one.
const ABLATE = argOf('--ablate', null);
const RAYPICK = argOf('--raypick', null);
const RAYDEPTH = Number(argOf('--raydepth', '4'));
// --web serves a DIFFERENT tree than this instrument lives in, so the
// "before" half of a before/after pair is shot by the same camera, same
// build, same lamp solve as the "after" half — the only difference being
// the tree under test.  The instrument's own machinery (cdp.mjs, the pin,
// the tools hash stamped into the manifest) always comes from THIS repo,
// so a stale copy of cdp.mjs inside a baseline tree cannot silently change
// what the camera does.  Note web/tools/render is a RELATIVE symlink and
// dangles in a copied tree: give the copy an absolute one or
// preflightServedTree will correctly refuse it as "some OTHER tree".
const SERVE = (() => { const w = pOpt2('--web', { tag: 'craft-look', mustExist: 'dir' }); return w ? path.resolve(w) : WEB; })();
if (!TABLE) die('--table <id> is required');
if (!OUT) die('--out DIR is required');
const RAYPX = RAYPICK ? RAYPICK.split(';').map((s) => {
  const [x, y] = s.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    die(`--raypick '${s.trim()}' is not x,y`);
  }
  return [x, y];
}) : [];
if (RAYPICK && !(RAYDEPTH >= 1 && RAYDEPTH <= 16)) {
  die(`--raydepth ${RAYDEPTH} out of range 1..16`);
}
// R1-FIX12: a lane assigned a band NARROWER than the 30-port layout law (the
// craft lane owns 9780-9789) pins BOTH ports — OB_E2E_PORT / OB_E2E_CDP_PORT,
// the standalone tools' convention.  The pinned pair is still CLAIMED in the
// registry (layout: false — the claim is the cross-lane collision guard, the
// layout only derives ports), so a foreign claim over them refuses this run
// and this run refuses theirs.  Without both pins the --band path stands.
const PIN_HTTP = Number(process.env.OB_E2E_PORT);
// (GH-687 lint: the CDP pin's binding name must be one the declared-vs-used reader follows — CDP0)
const CDP0 = Number(process.env.OB_E2E_CDP_PORT);
const PINNED = Number.isInteger(PIN_HTTP) && Number.isInteger(CDP0)
  && PIN_HTTP !== CDP0;
const [bandLo, bandHi] = PINNED
  ? [Math.min(PIN_HTTP, CDP0), Math.max(PIN_HTTP, CDP0)]
  : BAND.split('-').map(Number);
if (!PINNED && (!bandLo || !bandHi || bandHi - bandLo < 29)) {
  die(`--band ${BAND} is not a >=30-port band`);
}

// ---- the frozen pose set + the identity contract -------------------------
const POSE_FILE = path.join(REPO, 'tools', 'render', 'fixtures',
  'craft-look-poses.json');
const poseRaw = readFileSync(POSE_FILE);
const POSE_SHA = createHash('sha256').update(poseRaw).digest('hex');
const poseDoc = JSON.parse(poseRaw);
// SNK-R31: a table's `poses_extra` (the snooker owner poses side_elev / end_elev / owner_mid_inside, added in
// R3-SNK-11) ride the pose set too; tables without an extra list are unchanged.
const ALL = [...(poseDoc.poses[TABLE] ?? []), ...((poseDoc.poses_extra && poseDoc.poses_extra[TABLE]) || [])];
const IDENT = poseDoc.identity[TABLE];
if (!ALL.length || !IDENT) {
  die(`no pose set / identity contract for table '${TABLE}' in `
    + `${path.relative(REPO, POSE_FILE)} `
    + `(have: ${Object.keys(poseDoc.poses).join(', ')})`);
}
const want = argOf('--poses', 'all');
const POSES = want === 'all' ? ALL
  : want.split(',').map((n) => {
    const p = ALL.find((q) => q.name === n.trim());
    if (!p) die(`unknown pose '${n.trim()}' for ${TABLE}`);
    return p;
  });

// Settle predicates. Each one pins bakeClass AND the lighting fixture: the
// look loop compares specular behaviour, and specular behaviour is a
// property of the rig, so an unpinned rig is an unpinned measurement.
const settlePredicate = (ident) => `(() => {
  const s = window.__gi && window.__gi.state;
  const rig = window.__lighting && window.__lighting.state
    && window.__lighting.state().fixture;
  if (!(s && s.ready && s.baked)) return false;
  if (s.bakeClass !== ${JSON.stringify(ident.bakeClass)}) return false;
  if (s.fixture !== ${JSON.stringify(ident.fixture)}) return false;
  if (rig !== ${JSON.stringify(ident.fixture)}) return false;
  return true;
})()`;

const W = 1600, H = 1000;
for (const [x, y] of RAYPX) {
  if (x < 0 || x >= W || y < 0 || y >= H) {
    die(`--raypick ${x},${y} is outside the ${W}x${H} frame`);
  }
}
mkdirSync(OUT, { recursive: true });
sweepStaleProfiles();
const band = PINNED
  ? await claimPortBand(bandLo, bandHi, { layout: false })
  : await claimPortBand(bandLo, bandHi);
banded = true;
const PORT = PINNED ? PIN_HTTP : band.http(0);
const CDPP = PINNED ? CDP0 : band.cdp(0);
const url = `http://127.0.0.1:${PORT}/app.html?table=${TABLE}&cinema=1`
  + `&seed=7&look=${LOOK}${CLOTH ? `&clothcolor=${CLOTH}` : ''}`
  + `${ABLATE ? `&ablate=${ABLATE}` : ''}`;
const server = spawnStaticServer(SERVE, PORT);
// GH-489 SNK-R35 (review r9 P2 A): the served-tree identity is judged against the tree this run MEANS to serve (--web), never this checkout — one reader, cdp.mjs preflightServedTree
await preflightServedTree(`http://127.0.0.1:${PORT}/app.html`, { webDir: SERVE });
const chrome = await launchChrome(url, { port: CDPP, width: W, height: H, preflightWebDir: SERVE });
const frames = [];
let identity = null;
let refusal = null;
try {
  await chrome.send('Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  let ready = false;
  for (let i = 0; i < 220 && !ready; i++) {
    await sleep(200);
    ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
  }
  if (!ready) die('app never became ready (220 x 200 ms)');
  // SNK-R35 class B: refuse by name when the built table is not the requested id (the app's resolveBootTableId fallback)
  try { assertBuiltTable(TABLE, await chrome.eval(builtTableIdExpr), 'craft-look'); } catch (e) { throw new Refusal(e && e.message || String(e)); }

  const pred = settlePredicate(IDENT);
  let settled = false;
  for (let i = 0; i < 150 && !settled; i++) {
    settled = await chrome.eval(pred).catch(() => false);
    if (!settled) await sleep(200);
  }
  if (!settled) {
    const saw = await chrome.eval(`JSON.stringify({
      gi: window.__gi && window.__gi.state,
      rig: window.__lighting && window.__lighting.state
        && window.__lighting.state().fixture })`).catch(() => '<uneval>');
    die(`settle predicate never true for ${TABLE}; wanted bakeClass=`
      + `${IDENT.bakeClass} fixture=${IDENT.fixture}; saw ${saw}`);
  }

  // ---- IDENTITY ASSERTION (before any shutter) --------------------------
  // Measured signals only (see the _identity_comment in the pose fixture):
  // bakeClass + GI fixture + lighting rig + a census of the table's own
  // mesh-name family. The family is what closes the diamond/wpa_generic
  // ambiguity — both boot as pool/canopy_panel, and the fallback builds
  // none of diamond's dm* meshes.
  identity = JSON.parse(await chrome.eval(`JSON.stringify((() => {
    const s = window.__gi.state;
    let n = 0;
    window.__dbg.scene.traverse((o) => {
      if (o.name && o.name.startsWith(${JSON.stringify(IDENT.meshPrefix)})) n++;
    });
    return { bakeClass: s.bakeClass, fixture: s.fixture,
      rig: window.__lighting.state().fixture,
      meshPrefix: ${JSON.stringify(IDENT.meshPrefix)}, meshCount: n,
      gameTemplate: window.__test.bed().tableLength + 'x'
        + window.__test.bed().tableWidth };
  })())`));
  const bad = [];
  if (identity.bakeClass !== IDENT.bakeClass) {
    bad.push(`bakeClass ${identity.bakeClass} != ${IDENT.bakeClass}`);
  }
  if (identity.fixture !== IDENT.fixture) {
    bad.push(`GI fixture ${identity.fixture} != ${IDENT.fixture}`);
  }
  if (identity.rig !== IDENT.fixture) {
    bad.push(`lighting rig ${identity.rig} != ${IDENT.fixture}`);
  }
  if (identity.meshCount < IDENT.minMeshes) {
    bad.push(`${IDENT.meshPrefix}* mesh census ${identity.meshCount} < `
      + `${IDENT.minMeshes} (wrong table, or the family was renamed)`);
  }
  if (bad.length) die(`IDENTITY MISMATCH for '${TABLE}': ${bad.join('; ')}`);
  console.log(`[craft-look] identity OK: ${TABLE} bake ${identity.bakeClass}, `
    + `rig ${identity.fixture}, ${IDENT.meshPrefix}* x ${identity.meshCount}`);

  if (TABLE === 'wpbsa_snooker_12ft') {
    await chrome.eval('window.__snkOccl && window.__snkOccl.flush(), true')
      .catch(() => false);
  }
  await sleep(2500);

  // EMPTY-TABLE law: park the aim behind the camera, hide the aim ghost and
  // the DOM chrome. Same hex/name predicates the study bank was shot with —
  // changing them would change the picture, not just the code.
  await chrome.eval(`(() => {
    __test.aim(Math.PI * 1.5);
    window.__dbg.scene.traverse((o) => {
      const hex = o.material && o.material.color
        && o.material.color.getHexString && o.material.color.getHexString();
      if (hex === 'dff1ff' || hex === '76afee') o.visible = false;
      if (/^obAim/.test(o.name || '')
        || (o.parent && /^obAim/.test(o.parent.name || ''))) o.visible = false;
    });
    const st = document.createElement('style');
    st.textContent = 'body > :not(canvas) { display: none !important; }';
    document.head.appendChild(st);
    return true;
  })()`);
  if (!KEEP_BALLS) {
    await chrome.eval(`(() => {
      const zero = (o) => { o.scale.setScalar(0); o.updateMatrixWorld(true); };
      const ballGroups = new Set();
      window.__dbg.scene.traverse((o) => {
        if (o.name === 'obCueStick') zero(o);
        if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry'
          && Math.abs(o.position.y) < 0.2 && Math.abs(o.position.x) < 2.0
          && Math.abs(o.position.z) < 1.2) {
          if (o.parent && o.parent !== window.__dbg.scene) ballGroups.add(o.parent);
          else zero(o);
        }
      });
      for (const g of ballGroups) for (const c of g.children) zero(c);
      const gu = window.__gi && window.__gi.uniforms;
      if (gu && gu.uSphereCount) gu.uSphereCount.value = 0;
      return true;
    })()`);
  }

  for (const p of POSES) {
    let ok = false;
    for (let i = 0; i < 25 && !ok; i++) {
      ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(
        { cam: p.cam, look: p.look, fov: p.fov })})`);
      if (!ok) await sleep(200);
    }
    if (!ok) die(`${p.name}: __test.cameraPose rejected the spec`);
    await sleep(450);
    const file = path.join(OUT, `${p.name}.png`);
    await chrome.screenshot(file);
    const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
    let picks = undefined;
    if (RAYPX.length) {
      picks = JSON.parse(await chrome.eval(`(async () => {
        const THREE = await import('./vendor/three.module.min.js');
        const cam = window.__dbg.camera;
        cam.updateMatrixWorld(true);
        const rc = new THREE.Raycaster();
        const out = [];
        for (const [px, py] of ${JSON.stringify(RAYPX)}) {
          rc.setFromCamera(new THREE.Vector2(
            (px / ${W}) * 2 - 1, -((py / ${H}) * 2 - 1)), cam);
          const hits = rc.intersectObjects(window.__dbg.scene.children, true)
            .filter((h) => h.object && h.object.visible
              && h.object.type !== 'Points');
          out.push({ px, py, hits: hits.slice(0, ${RAYDEPTH}).map((h) => {
            const o = h.object;
            const m = Array.isArray(o.material)
              ? (o.material[0] || null) : o.material;
            return {
              mesh: o.name || '<unnamed>',
              parent: (o.parent && o.parent.name) || null,
              dist_mm: +(h.distance * 1000).toFixed(2),
              // kernel frame: kx = three.z, ky = three.x, h = three.y
              k_mm: [+(h.point.z * 1000).toFixed(2),
                +(h.point.x * 1000).toFixed(2),
                +(h.point.y * 1000).toFixed(2)],
              faceNormal: h.face ? [+h.face.normal.x.toFixed(3),
                +h.face.normal.y.toFixed(3), +h.face.normal.z.toFixed(3)] : null,
              mat: m ? (m.name || m.type) : null,
              matColor: m && m.color ? m.color.getHexString() : null,
              rough: m && m.roughness !== undefined ? m.roughness : null,
            };
          }) });
        }
        return JSON.stringify(out);
      })()`));
      for (const q of picks) {
        const top = q.hits[0];
        console.log(`[raypick] ${p.name} (${q.px},${q.py}) -> `
          + (top ? `${top.mesh} @k[${top.k_mm}] ${top.mat}/${top.matColor}`
            + (q.hits[1] ? `  | behind: ${q.hits.slice(1)
              .map((h) => `${h.mesh}@${h.dist_mm}`).join(', ')}` : '  | behind: AIR')
            : 'NO HIT (background)'));
      }
    }
    frames.push({ name: p.name, file: path.basename(file), sha256: sha,
      ...p, ...(picks ? { raypick: picks } : {}) });
    console.log(`[craft-look] ${p.name} -> ${path.basename(file)} `
      + `${sha.slice(0, 12)}`);
  }
} catch (err) {
  refusal = err;
} finally {
  const gone = await chrome.closeAndWait();
  await stopStaticServer(server);
  band.release();
  if (gone === false) {
    console.error('craft-look: chrome teardown unconfirmed');
    process.exitCode = 2;
  }
}
if (refusal) {
  console.error(`craft-look: ${refusal instanceof Refusal
    ? refusal.message : `unexpected: ${refusal.stack || refusal}`}`);
  process.exit(2);
}

let tree = 'unknown'; let head = 'unknown'; let dirty = 'unknown';
try {
  head = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'],
    { encoding: 'utf8' }).trim();
  tree = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD^{tree}'],
    { encoding: 'utf8' }).trim();
  dirty = execFileSync('git', ['-C', REPO, 'status', '--porcelain'],
    { encoding: 'utf8' }).trim().length > 0 ? 'dirty' : 'clean';
} catch { /* provenance is disclosed as unknown, never invented */ }
const cdpSha = createHash('sha256')
  .update(readFileSync(path.join(WEB, 'tools', 'cdp.mjs'))).digest('hex');
// the SERVED tree is the variable under test in a before/after pair, so it
// is stamped separately from the repo provenance below; sha256 of the served
// table.js pins WHICH build the frames are of, independent of git state.
let servedSha = 'unknown';
try {
  servedSha = createHash('sha256')
    .update(readFileSync(path.join(SERVE, 'scene', 'table.js'))).digest('hex');
} catch { /* disclosed as unknown, never invented */ }
writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify({
  instrument: 'tools/render/craft-look.mjs',
  table: TABLE, tag: TAG, look: LOOK, clothcolor: CLOTH, balls: KEEP_BALLS,
  url, width: W, height: H,
  served: { root: SERVE, isRepoWeb: SERVE === WEB, tableJsSha256: servedSha },
  poseFile: path.relative(REPO, POSE_FILE), poseFileSha256: POSE_SHA,
  identityAsserted: identity, identityContract: IDENT,
  harness: { shellPin: chromeShellPin(), cdpSha256: cdpSha,
    node: process.version },
  tree: { head, tree, worktreeState: dirty },
  frames,
}, null, 2)}\n`);
console.log(`[craft-look] ${frames.length} frames + manifest.json -> ${OUT}`);
if (readdirSync(OUT).length === 0) die('no frames written');
