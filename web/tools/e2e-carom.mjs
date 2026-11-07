// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-carom.mjs — headless scripted three-cushion carom adjudication suite
// (feature 012 US3, T047): drives the UMB World Rules (1 Jan 1989) flows of
// data-model.md §3.2 through the REAL app — discipline activation on the
// pocketless 2.84 m table, the break-spot decision 10 (Art 23.1(c)) with the
// start-spot placement clamp, the break red-first constraint (Art
// 23.3/41.12), a VALID three-cushion point (Art 83 — shooter continues), a
// two-cushion no-point + turn pass, the Art 24.5 miss, innings tracking,
// and the race-to-target win (Art 29.1/29.2) with points + innings on the
// result banner — asserting HUD state, the `[flow]` console hook wire, and
// CITE PARITY with the T042 SDK suite (identical strings on identical
// outcomes). Zero-pocket scene assertions ride every stage: no pocket
// geometry, no pocket markers/aim affordances, no BallPocket event, no
// ball ever enters the drop-cup path.
//
// Physics recipes are planned OFFLINE against the committed canonical wasm
// (web/tools/find-carom-recipes.mjs): a thin first-ball contact, the cue
// banks the long/short rails, and the second object ball sits on the
// sampled post-3rd-cushion (resp. post-2nd) path — deterministic kernel,
// baked constants below.
//
// The carom entry is PLAYABLE since the US4 readiness flip (T048) landed
// with the story-lane merge: S1 gates the production game.setGame path
// first, then the suite drives scripted racks through the flow adapter's
// headless seam window.__rules.caromActivate (seeded re-racks).
//
//   node web/tools/e2e-carom.mjs      (needs Chrome + node ≥22)
//   OB_E2E_PORT / OB_E2E_CDP_PORT override the server/CDP ports (concurrent
//   lanes must run on verified-free ports).
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import {
  PROBE_SRC, CAROM_OWNER_POSES, runCornerProbe, judgeCornerProbe,
  MAT_PROBE_SRC, frameMatPins, judgeFrameMats,
} from './lib/cornerprobe.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 8181);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16381);
// GH-440 S1-hue runs in its OWN real-user browser (sp look / LIVE tier —
// the scripted main session pins obtool green/CINEMA, which is NOT the
// configuration the corner-wash defect was evidenced in; review GH-440 r1).
// Declared so run-gate sizes the band claim (GH-410 law).
export const PORT_INVENTORY = { http: 1, cdp: 2 };
const CDP_PORT2 = CDP_PORT + 1;
const fail = (msg) => { console.error('E2E-CAROM FAIL:', msg); process.exitCode = 1; };

/** Refuse to squat on a busy port (concurrent lanes / live :8000 doctrine). */
async function assertFree(port) {
  await new Promise((res, rej) => {
    const s = createServer();
    s.once('error', (e) => rej(new Error(`port ${port} is not free: ${e.code}`)));
    s.listen(port, '127.0.0.1', () => s.close(res));
  });
}
await assertFree(PORT);
await assertFree(CDP_PORT);
await assertFree(CDP_PORT2);

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [], consoleLogs = [];
const chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?seed=1`, { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled') {
    const line = params.args.map((a) => a.value ?? a.description).join(' ');
    if (params.type === 'error') consoleErrors.push(line);
    else consoleLogs.push(line);
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

const sawLog = (s) => consoleLogs.some((l) => l.includes(s));
const ev = (js) => chrome.eval(js);
// the settle poll snapshots state + judgment + banner in ONE page eval:
// a WIN's 2.6 s auto re-rack nulls the judgment surface (fresh match), and
// under load a separate post-settle read can land after that beat (GH-344;
// the e2e-10ball df4d5134 law)
let settled = null; // { state, judgment, banner } at the settle edge
async function settle(tag) {
  settled = { state: 'PLAYBACK' };
  for (let i = 0; i < 220 && settled.state === 'PLAYBACK'; i++) {
    await sleep(350);
    settled = await ev(`({ state: __test.state(),
      judgment: window.__rules.judgment(),
      banner: document.getElementById('banner').textContent })`);
  }
  if (settled.state === 'PLAYBACK') fail(tag + ': shot never settled');
  return settled.state;
}
/** Fire a scripted shot and wait for adjudication routing. */
async function shot(tag, params) {
  const err = await ev(`__test.shoot(${JSON.stringify(params)})`);
  if (err) { fail(`${tag}: shoot rejected: ${err}`); return 'REJECTED'; }
  return settle(tag);
}
const judgment = () => ev('window.__rules.judgment()');
const match = () => ev('window.__rules.matchState()');
const player = () => ev('window.__rules.player()');
// GH-1050: the inning chip text (carom.innings in the live dictionary) — the
// chip renders from the per-frame hudState hook, so poll for it
const chipHas = async (innings) => {
  const want = await ev(`window.__i18n.t('carom.innings', { innings: ${innings} })`);
  for (let i = 0; i < 20; i++) {
    const txt = await ev(`document.getElementById('hud-carom-chips')?.textContent ?? ''`);
    if (txt.includes(want)) return { ok: true, txt, want };
    await sleep(150);
  }
  return { ok: false, want,
    txt: await ev(`document.getElementById('hud-carom-chips')?.textContent ?? ''`) };
};
/** Scripted scene + carom match-state shaping (layout first — it resets
 * the match fold — then the discipline-keyed test seam). */
async function scene(specs, ms) {
  await ev(`__test.layout(${JSON.stringify(specs)})`);
  if (ms && !(await ev(`window.__rules.caromSetMatchState(${JSON.stringify(ms)})`))) {
    fail('caromSetMatchState rejected: ' + JSON.stringify(ms));
  }
}

// ---- baked recipes (find-carom-recipes.mjs, committed canonical wasm) ------
// thin hit on ball 1 from (0.2, -0.9) at phi ≈ 95°, v0 3.2; the cue banks
// the rails; ball 2 on the sampled path after the 3rd (POINT) or the 2nd
// (TWO) cushion; parked at PARK the cue never reaches it (MISS).
const PHI = 1.6580627893946132;
const V0 = 3.2;
const CUE = { id: 0, x: 0.2, y: -0.9 };
const B1 = { id: 1, x: 0.13070423911435947, y: -0.7253750227500942 };
const B2_POINT = { id: 2, x: -0.6107226957441679, y: -1.1481975963088205 };
const B2_TWO = { id: 2, x: -0.08452834356660371, y: 0.30027874000112664 };
const B2_PARK = { id: 2, x: 0.55, y: -1.28 };
const PLAY = { phase: 'play', shooter: 1, breaker: 1, pendingDecision: null, points: { 1: 0, 2: 0 }, innings: 0, target: 15 };

// pinned cite strings — parity with the T042 SDK suite
const CITE_BREAK = 'UMB Art 23.3/41.12';
const CITE_ART83 = 'UMB Art 83';
const CITE_MISS = 'UMB Art 24.5';
const CITE_WIN = 'UMB Art 29.1/29.2';

try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await ev('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');

  // ---- S1: discipline activation on the pocketless UMB table ---------------
  // production gate first (while nine_ball is active): the carom entry is
  // PLAYABLE since the T048 readiness flip landed with the story-lane
  // merge (research.md R12) — game.setGame is the production path and
  // must now accept it
  const gateErr = await ev(
    'window.__rules.setGame("carom_3cushion").then((ok) => (ok === true ? null : "setGame returned " + ok), (e) => String(e))');
  if (gateErr !== null) {
    fail('S1: game.setGame must accept the playable carom entry (T048 flip): ' + gateErr);
  }
  await sleep(500);
  // GH-383 owner decision: a FRESH profile now seeds umb-carom-2cue —
  // the S-blocks below pin the CLASSIC v1 behavior, so select the family
  // default explicitly (the '' picker option; the two-cue presets get
  // their own V-blocks). e2e-userboot arm 8 owns the seed itself.
  if (await ev('window.__settings.changeVariant("carom_3cushion", null)') !== true) {
    fail('S1: classic-preset pin (changeVariant null) rejected');
  }
  await sleep(600); // in-place same-seed re-rack + fold reset
  if (await ev('window.__rules.caromActivate(5)') !== true) {
    throw new Error('caromActivate failed — rules/games modules missing?');
  }
  await sleep(500); // rack + staged break-address routing (macrotask)
  if (await ev('window.__rules.game()') !== 'carom_3cushion') fail('S1: active game not carom_3cushion');
  const balls1 = await ev('__test.balls()');
  if (balls1.length !== 3) fail(`S1: expected 3 balls, got ${balls1.length}`);
  const pockets1 = await ev('window.__rules.pockets()');
  if (pockets1.length !== 0) fail(`S1: kernel pocket list must be EMPTY on the carom table (got ${pockets1.length})`);
  let m = await match();
  if (m?.stage !== 'break') fail('S1: fresh match stage wrong: ' + JSON.stringify(m));
  if (m?.pendingDecision?.kind !== 'break_spot' || m?.pendingDecision?.chooser !== 1) {
    fail('S1: break-spot option (UMB Art 23.1(c)) not pending: ' + JSON.stringify(m?.pendingDecision));
  }
  if (m?.target !== 15) fail('S1: default race target must be 15');

  // ---- S1-gi (GH-337 per-table-class bakes): the pocketless 2.84 m carom
  // table resolves its OWN committed bake class (manifest.tables.carom_284)
  // instead of the #52 pre-GI fallback — baked GI must be ON with the class
  // plan bounds and the 12×6 probe grid at the 61.5 mm ball radius, the
  // manifest entry must carry the pocketless truth, and the footprint-
  // fallback console line must never fire on this suite.
  {
    let cls = null;
    for (let i = 0; i < 50 && cls !== 'carom_284'; i++) {
      await sleep(200);
      cls = await ev('window.__gi?.state?.bakeClass ?? null');
    }
    if (cls !== 'carom_284') {
      fail(`S1-gi: carom bake class never resolved (bakeClass ${cls})`);
    }
    // GH-386 venue default: the carom activation must ALSO hang the carom
    // luminaire (2.60×0.35 @ the UMB-pinned 1.02) and resolve its class ×
    // fixture bake — red-proof vs the pre-386 renderer (pool canopy over
    // the carom bed, fixture 'canopy_panel').
    let fx = null;
    for (let i = 0; i < 50 && fx !== 'carom_luminaire'; i++) {
      await sleep(200);
      fx = await ev('window.__gi?.state?.fixture ?? null');
    }
    if (fx !== 'carom_luminaire') {
      fail(`S1-gi: venue-default fixture never resolved (gi fixture ${fx})`);
    }
    const lt = await ev('window.__lighting?.state?.() ?? null');
    if (!lt || lt.fixture !== 'carom_luminaire' || lt.auto !== true
      || Math.abs(lt.clearanceY - 1.02) > 1e-6) {
      fail('S1-gi: lighting state is not the auto carom luminaire at the '
        + 'UMB-pinned 1.02 hang: ' + JSON.stringify(lt));
    }
    const halves = await ev('([__gi.uniforms.uLightHalf.value.x, '
      + '__gi.uniforms.uLightHalf.value.y])');
    if (Math.abs(halves[0] - 1.30) > 1e-4 || Math.abs(halves[1] - 0.175) > 1e-4) {
      fail(`S1-gi: derived-penumbra footprint ${JSON.stringify(halves)}, want `
        + '[1.30, 0.175] (GH-385/386 setEmitters)');
    }
    const st = await ev(`({ fits: __gi.state.fits,
      on: __gi.uniforms.uGiOn.value,
      b: [__gi.uniforms.uGiBounds.value.x, __gi.uniforms.uGiBounds.value.y,
        __gi.uniforms.uGiBounds.value.z, __gi.uniforms.uGiBounds.value.w],
      grid: __gi.state.probes && { nx: __gi.state.probes.grid.nx,
        nz: __gi.state.probes.grid.nz, y: __gi.state.probes.grid.y },
      pocketless: __gi.state.manifest?.tables?.carom_284?.pocketless })`);
    if (st.fits !== true || st.on !== 1) {
      fail(`S1-gi: class bake not applied (fits ${st.fits}, uGiOn ${st.on})`);
    }
    if (JSON.stringify(st.b) !== '[-1.7,-0.99,1.7,0.99]') {
      fail('S1-gi: uGiBounds is not the carom_284 plan bounds: '
        + JSON.stringify(st.b));
    }
    if (!st.grid || st.grid.nx !== 12 || st.grid.nz !== 6 || st.grid.y !== 0.03075) {
      fail('S1-gi: carom probe grid wrong: ' + JSON.stringify(st.grid));
    }
    if (st.pocketless !== true) {
      fail('S1-gi: manifest carom_284 entry lost the pocketless truth');
    }
    if (consoleLogs.some((l) => l.includes('[gi] bake footprint'))) {
      fail('S1-gi: footprint-fallback line fired on carom (GH-337: the '
        + 'class bake must resolve)');
    }
    console.log('S1-gi OK (GH-337 + GH-386): carom_284 × carom_luminaire '
      + 'venue-default bake on (uGiOn 1, class bounds + 12x6 probes, '
      + 'pocketless, 2.60×0.35 emitter @ 1.02), zero footprint-fallback lines');
  }

  // ---- S1-corner (GH-387): frame-corner watertightness. The wood ring's
  // four corners must be CLOSED — raycast probes aimed into the corner wood
  // volume from all approach angles (grazing to overhead), plus the owner's
  // reproduced sight lines and a straight-down wood-top pin per corner,
  // must hit table furniture, never the room floor / far wall through the
  // table. Red on the pre-fix tree (C0 pocket-mitred planks with no corner
  // casting left all four frame-corner squares as open shafts — the tan
  // wedge in the owner's screenshots). Provenance: lib/cornerprobe.mjs.
  {
    await ev(PROBE_SRC);
    // strict: pocketless — every probe target sits inside solid wood, so
    // past-target hits are holes too (review GH-387 r1)
    const spec = { L: 2.84, W: 1.42, CW: 0.050, FW: 0.135, topPin: true,
      strict: true, poses: CAROM_OWNER_POSES };
    const res = await runCornerProbe(ev, spec);
    // split parity: the per-corner evaluates + merge must reproduce the
    // one-call sweep byte for byte (carom's sweep takes ~1 s, so running
    // both is cheap; snooker's takes minutes, which is why suites split)
    const one = await ev(`window.__obCornerProbe(${JSON.stringify(spec)})`);
    if (JSON.stringify(one) !== JSON.stringify(res)) {
      fail('S1-corner (GH-387): the per-corner split differs from the '
        + 'one-call sweep: ' + JSON.stringify({
          one: [one?.probes, one?.failCount, one?.exempts],
          split: [res?.probes, res?.failCount, res?.exempts] }));
    }
    judgeCornerProbe('S1-corner (GH-387)', res, fail);
  }

  // ---- S1-mat (GH-387 material-identity guard): the picture-frame ring
  // must be ONE material — pins on each plank body and on both flanks of
  // every 45-deg miter seam first-hit meshes sharing a single material
  // uuid (table.js's shared woodMat). A corner piece rendered from its own
  // material (clone/re-seed) would pass every geometry probe while showing
  // a tone break at the joint. Provenance: lib/cornerprobe.mjs.
  {
    await ev(MAT_PROBE_SRC);
    const res = await ev(`window.__obFrameMatProbe(${JSON.stringify(
      frameMatPins({ L: 2.84, W: 1.42, CW: 0.050, FW: 0.135, style: 'miter' }))})`);
    judgeFrameMats('S1-mat (GH-387)', res, fail);
  }

  // ---- S1-height (GH-730): frame-top height repin. The UMB 750-800 mm
  // window (UMB World Rules of Carom Billiard (ed. 1 Jan 1989), Chapter
  // II, Art. 11 §8: "The hight of the billiard measured from the ground
  // to the surface which reframes the billiard must be between 75 and 80
  // cm") pins the FRAME TOP, not the bed — but the entry carried
  // bedAboveFloor 0.79 with no roomFloor seat, so the room floor sat at
  // -0.79 and the stack read 790 + 47 = 837 mm on the legacy floor,
  // 37 mm over the 800 upper bound the clamp rule selects (the 775
  // midpoint is unpublished and FORBIDDEN — b18 RULING). Expected bed is
  // DERIVED: 0.800 - 0.047, never a bare 0.753. Mirrored from
  // e2e-snooker S1-body (floorY = the 9 m PlaneGeometry with rotation.x
  // < -1.5; feet from bbox min + position): the wood-ring top is the
  // bbox max over the meshes sharing the woodMat uuid — populateCarom's
  // planks are UNNAMED, so the arm takes the shared uuid from the
  // S1-mat cornerprobe pins (never a name, never a scene max: the
  // CircleGeometry sight inlays float 0.6 mm ABOVE the plank top); the
  // sole is the min bbox y over the below-bed CylinderGeometry leg/foot
  // meshes.
  //   (a) the room floor sits at -(0.800 - 0.047) = -0.753;
  //   (b) the measured stack frameTop_y - floorY == the CITED 0.800;
  //   (c) the foot sole lands on the drawn floor (sole == floorY).
  // RED on the pre-fix tree: (a) floor -0.79, (b) stack 0.837.
  // Expected RED values: 0.760 plant (a) -0.760 / (b) 0.807; 0.775
  // plant (a) -0.775 / (b) 0.822; (c) sole == floorY (green on all).
  {
    // settle: carom active and the room floor plane stable over two polls
    // (the populate() seat lands behind the __rebakeEnv seam)
    let stable = null;
    for (let i = 0; i < 50 && stable === null; i++) {
      const q = await ev(`(async () => {
        const id = (await import('/scene/table.js')).activeTableId();
        let y = null;
        window.__dbg.scene.traverse((o) => {
          if (o.geometry?.type === 'PlaneGeometry'
              && o.geometry.parameters?.width === 9
              && o.rotation.x < -1.5) y = o.position.y;
        });
        return JSON.stringify({ id, y });
      })()`).then(JSON.parse);
      if (q.id === 'umb_carom_284' && q.y !== null) {
        const q2 = await ev(`(async () => {
          let y = null;
          window.__dbg.scene.traverse((o) => {
            if (o.geometry?.type === 'PlaneGeometry'
                && o.geometry.parameters?.width === 9
                && o.rotation.x < -1.5) y = o.position.y;
          });
          return y;
        })()`);
        if (q2 === q.y) stable = q.y;
      }
      if (stable === null) await sleep(200);
    }
    if (stable === null) fail('S1-height: carom floor plane never settled');
    // the shared woodMat uuid from the S1-mat probe contract (the planks
    // are unnamed — lib/cornerprobe.mjs; same miter pins S1-mat judges)
    await ev(MAT_PROBE_SRC);
    const matRes = await ev(`window.__obFrameMatProbe(${JSON.stringify(
      frameMatPins({ L: 2.84, W: 1.42, CW: 0.050, FW: 0.135, style: 'miter' }))})`);
    const woodIds = [...new Set((matRes ?? []).filter((p) => !p.miss && p.inTable)
      .map((p) => p.mat))];
    if (woodIds.length !== 1) {
      fail(`S1-height: ring pins split across ${woodIds.length} materials, `
        + 'want the one shared woodMat');
    }
    const h = await ev(`((woodUuid) => {
      const T = window.__dbg.scene.children.find((g) => g.name === 'obTable');
      let floorY = null, ringMax = -Infinity, ringN = 0;
      let soleMin = Infinity, legN = 0;
      window.__dbg.scene.traverse((o) => {
        if (o.geometry?.type === 'PlaneGeometry'
            && o.geometry.parameters?.width === 9
            && o.rotation.x < -1.5) floorY = o.position.y;
      });
      for (const o of T?.children ?? []) {
        if (!o.isMesh) continue;
        if (o.material?.uuid === woodUuid) {
          o.geometry.computeBoundingBox();
          ringN++;
          ringMax = Math.max(ringMax,
            o.geometry.boundingBox.max.y + o.position.y);
        }
        if (o.geometry?.type === 'CylinderGeometry') {
          o.geometry.computeBoundingBox();
          const lo = o.geometry.boundingBox.min.y + o.position.y;
          if (lo < -0.1) { // below-bed furniture: 4 legs + 4 feet
            legN++;
            soleMin = Math.min(soleMin, lo);
          }
        }
      }
      return JSON.stringify({ floorY, ringN, ringMax, legN, soleMin });
    })(${JSON.stringify(woodIds[0] ?? null)})`).then(JSON.parse);
    const entry = await ev(`(async () => (await import('/scene/table.js'))
      .TABLE_SPECS.umb_carom_284.render.bedAboveFloor)()`);
    // CITED bound (GH-730 RULING): Art. 11 §8's 800 upper bound via the
    // clamp rule; the bed expectation is DERIVED from it, never a bare
    // 0.753. The ring top is MEASURED (ringMax), never assumed.
    const UMB_FRAME_TOP = 0.800;
    const WANT_FLOOR = -(0.800 - 0.047);
    const stack = h.ringMax - h.floorY;
    console.log(`S1-height (GH-730): entryBed ${entry} floorY ${h.floorY} `
      + `ringN ${h.ringN} ringMax ${h.ringMax} stack ${stack} `
      + `legN ${h.legN} sole ${h.soleMin}`);
    if (h.ringN !== 4) {
      fail(`S1-height: expected the 4 rail planks, measured ${h.ringN}`);
    }
    if (h.legN !== 8) {
      fail(`S1-height: expected 4 legs + 4 feet, measured ${h.legN}`);
    }
    if (!(Math.abs(h.floorY - WANT_FLOOR) <= 1e-6)) {
      fail(`S1-height (a): room floor ${h.floorY} != ${WANT_FLOOR} `
        + `(entry bedAboveFloor ${entry})`);
    }
    if (!(Math.abs(stack - UMB_FRAME_TOP) <= 1e-6)) {
      fail(`S1-height (b): frame-top stack ${stack} != the cited `
        + `${UMB_FRAME_TOP} (UMB Art. 11 §8)`);
    }
    if (!(Math.abs(h.soleMin - h.floorY) <= 5e-4)) {
      fail(`S1-height (c): foot sole ${h.soleMin} does not land on the `
        + `drawn floor ${h.floorY}`);
    }
    if (process.exitCode !== 1) {
      console.log('S1-height OK (GH-730): floor on the derived pin, stack '
        + 'reads the cited 800, feet land on the drawn plane');
    }
  }

  // ---- S1-hue (GH-440): RENDERED-PIXEL corner-wash gate. Raycasts cannot
  // see this defect (GH-387's probes were honestly green while every corner
  // read blue): under the default sp look the env cubemap's whole
  // below-horizon image is the table's own blue cloth, and at the owner's
  // close/low poses the miter V-grooves, plank outer faces and the apron
  // were lit almost exclusively by that invalid content (issue #440
  // derivation record — env-ablation zeroed those pixels while lamp/hemi/GI
  // moved them <1%). The fix is the derived env-probe visibility
  // (shading.js SPIKE_ENV_CHUNK_OCC + table.js aGroove seam frames), so the
  // gate is a HUE check on real screenshots at the reproduced poses:
  //   - the NE miter seam band must carry no blue-dominant pixels,
  //   - apron / plank-outer-face crops must sit inside the warm wood band
  //     (blueness B − max(R, G) below threshold; pre-fix +32..+63),
  //   - a ring-top crop anchors the arm (must stay warm: a black screen or
  //     a repainted look cannot silently green this).
  // Poses: 170-family = real-user orbit-reachable; 180c sits below the zoom
  // clamp (camera seam only) — the definitive closeup from the QA round.
  // RED on the pre-fix tree at every pose (counts in the issue record).
  //
  // OWN REAL-USER SESSION (review GH-440 r1): this suite's main browser is a
  // scripted obtool boot — green look, CINEMA tier — which is NOT the
  // configuration the defect was evidenced in. The hue gate boots its own
  // plain-URL browser (sp look, LIVE tier, the e2e-userboot path), drives
  // the PRODUCTION carom switch, resolves the break-spot decision through
  // the real flow (no DOM styling), and pins the configuration before
  // grading a single pixel.
  {
    let hueRed = false;
    const hueFail = (msg) => { hueRed = true; fail(msg); };
    const hueErrors = [];
    const chromeH = await launchChrome(
      `http://127.0.0.1:${PORT}/app.html?seed=1`,
      { port: CDP_PORT2, width: 1440, height: 900, tool: false });
    chromeH.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        hueErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
      } else if (method === 'Runtime.exceptionThrown') {
        hueErrors.push(params.exceptionDetails.exception?.description
          ?? params.exceptionDetails.text);
      }
    });
    const evH = (js) => chromeH.eval(js);
    try {
    let readyH = false;
    for (let i = 0; i < 220 && !readyH; i++) { await sleep(200); readyH = await evH('window.__test?.ready === true').catch(() => false); }
    if (!readyH) throw new Error('S1-hue: real-user session never became ready');
    // configuration pins: the arm must exercise the EVIDENCED config —
    // tournament look on a non-scripted (LIVE-tier) boot
    const cfg = await evH(`({ look: __test.bootLook,
      scripted: sessionStorage.getItem('ob-scripted') === '1' })`);
    if (cfg.look !== 'tournament' || cfg.scripted) {
      hueFail('S1-hue: session config is not the evidenced tournament/LIVE real-user '
        + 'boot: ' + JSON.stringify(cfg));
    }
    // production carom switch + the real break-spot resolution (the dialog
    // would otherwise float over the corner at the evidence poses)
    if (await evH(`window.__settings.changeGame('carom_3cushion', { skipConfirm: true }).then(() => true, () => false)`) !== true) {
      throw new Error('S1-hue: changeGame(carom_3cushion) failed');
    }
    await sleep(3000);
    const tid = await evH(`(async () => (await import('/scene/table.js')).activeTableId())()`);
    if (tid !== 'umb_carom_284') {
      hueFail(`S1-hue: active table ${tid}, want umb_carom_284`);
    }
    await evH('window.__rules.decide("break_spot", 1)');
    await sleep(800);
    const L = 2.84, W = 1.42, CW = 0.050, FW = 0.135;
    const crk = (0.045 + 0.003) * (1 - Math.SQRT1_2); // caromCorner45 mirror
    const seamA = [L / 2 + CW - 0.002, 0.047, W / 2 + CW - 0.002];
    const seamB = [L / 2 + CW + FW - crk, 0.047, W / 2 + CW + FW - crk];
    // per-pose sample plan: seam scan + classified point crops (ring = the
    // warm-anchor point, picked per pose where the lamp lights the top)
    const POSES = [
      { tag: '170-ne-low', cam: [2.10, 0.26, 1.38, 1.48, 0.05, 0.80],
        pts: { apron: [L / 2 + CW + FW - 0.003, -0.12, 0.40],
          outer: [L / 2 + CW + FW, 0.025, 0.30], ring: [1.53, 0.047, 0.40] } },
      { tag: '171-ne-grazing', cam: [1.78, 0.14, 1.05, 1.5, 0.045, 0.79],
        pts: { apron: [L / 2 + CW + FW - 0.003, -0.10, 0.55],
          outer: [L / 2 + CW + FW, 0.025, 0.45], ring: [1.52, 0.047, 0.68] } },
      { tag: '180c-topdown', cam: [1.62, 0.45, 0.98, 1.49, 0.09, 0.84],
        pts: { apron: [1.35, -0.05, W / 2 + CW + FW - 0.003], ring: [1.50, 0.047, 0.60] } },
    ];
    for (const { tag, cam, pts } of POSES) {
      await evH(`__test.camera(${cam.join(',')})`);
      await sleep(500);
      // project the sample points + seam stations, ray-classify each point
      // (precondition: the pixel really shows the surface class we grade —
      // resolution/pose drift fails loudly, never silently greens)
      const plan = await evH(`(async () => {
        const THREE = await import('./vendor/three.module.min.js');
        const cam = window.__dbg.camera;
        const rc = new THREE.Raycaster();
        const visible = (o) => { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true; };
        const cls = (nx, ny) => {
          rc.setFromCamera(new THREE.Vector2(nx, ny), cam);
          const hits = rc.intersectObjects(window.__dbg.scene.children, true)
            .filter((h) => h.object.isMesh && visible(h.object)
              && !(() => { for (let n = h.object; n; n = n.parent) if (n.name === 'obCueStick') return true; return false; })());
          return hits[0]?.object.material?.color?.getHexString?.() ?? null;
        };
        const px = (p) => {
          const v = new THREE.Vector3(...p).project(cam);
          return { x: (v.x + 1) / 2, y: (1 - v.y) / 2, nx: v.x, ny: v.y, z: v.z };
        };
        const seam = [];
        for (let i = 0; i <= 12; i++) {
          const f = 0.12 + (0.76 * i) / 12;
          const p = [${seamA[0]} + f * (${seamB[0]} - ${seamA[0]}), 0.0455,
            ${seamA[2]} + f * (${seamB[2]} - ${seamA[2]})];
          const q = px(p);
          seam.push({ ...q, cls: cls(q.nx, q.ny) });
        }
        const pts = {};
        for (const [tag, p] of Object.entries(${JSON.stringify(pts)})) {
          const q = px(p);
          pts[tag] = { ...q, cls: cls(q.nx, q.ny) };
        }
        return { seam, pts };
      })()`);
      const woodSeam = plan.seam.filter((s) => s.cls === 'a89486');
      if (woodSeam.length < 8) {
        hueFail(`S1-hue ${tag}: only ${woodSeam.length}/13 seam stations `
          + 'ray-hit the wood ring (pose precondition lost): '
          + JSON.stringify(plan.seam.map((s) => s.cls)));
      }
      for (const [ptag, q] of Object.entries(plan.pts)) {
        const want = ptag === 'apron' ? '97837a' : 'a89486';
        if (q.cls !== want) {
          hueFail(`S1-hue ${tag}: ${ptag} sample ray-hit ${q.cls}, want ${want} `
            + '(pose precondition lost)');
        }
      }
      // one screenshot, decoded in-page (the e2e-lighting cropStats anatomy)
      const { data } = await chromeH.send('Page.captureScreenshot', { format: 'png' });
      const m = await evH(`(async () => {
        const img = new Image(); img.src = 'data:image/png;base64,${data}';
        await img.decode();
        const o = document.createElement('canvas');
        o.width = img.width; o.height = img.height;
        const g = o.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, img.width, img.height).data;
        const Wp = img.width, Hp = img.height;
        const rgb = (x, y) => { const i = (y * Wp + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const isBlue = (r, gg, b) => b > 55 && b > r + 25 && b > gg + 12;
        const plan = ${JSON.stringify({ seam: woodSeam, pts: plan.pts })};
        const blueSet = new Set(); const bluePx = [];
        // EVERY candidate is kept for classification (review GH-440 r2: a
        // truncated list could fill up with legitimate cloth/AA blue from
        // the early stations and silently drop wood-wash pixels behind
        // them); the classifier below fails CLOSED past its ray budget.
        for (const s of plan.seam) {
          const cx = Math.round(s.x * Wp), cy = Math.round(s.y * Hp);
          for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
            const x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x >= Wp || y >= Hp) continue;
            const key = y * Wp + x;
            if (blueSet.has(key)) continue;
            const [r, gg, b] = rgb(x, y);
            if (isBlue(r, gg, b)) {
              blueSet.add(key);
              bluePx.push([x, y, r, gg, b]);
            }
          }
        }
        const crops = {};
        for (const [tag, q] of Object.entries(plan.pts)) {
          const cx = Math.round(q.x * Wp), cy = Math.round(q.y * Hp);
          let r = 0, gg = 0, b = 0, n = 0;
          for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
            const x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x >= Wp || y >= Hp) continue;
            const p = rgb(x, y); r += p[0]; gg += p[1]; b += p[2]; n++;
          }
          crops[tag] = [r / n, gg / n, b / n].map((v) => +v.toFixed(1));
        }
        return { bluePx, crops };
      })()`);
      // per-pixel adversarial classification (the GH-440 verifier's own
      // mechanism): a blue pixel is DEFECT blue only when the camera rays
      // through it AND a ±2 px context cross all first-hit the wood ring —
      // the seam's inner mouth legitimately shows a sliver of cushion cloth
      // (plus its AA edge), and those rays hit cloth within 2 px
      // fail CLOSED past the classification ray budget: a frame so washed
      // that it exceeds it IS the defect (never silently under-classified)
      if (m.bluePx.length > 4000) {
        hueFail(`S1-hue ${tag}: ${m.bluePx.length} blue candidates in the `
          + 'seam band exceed the classification budget — treating as wash');
      }
      const seamJudge = m.bluePx.length === 0 || m.bluePx.length > 4000
        ? { blueOnWood: 0, hits: [] }
        : await evH(`(async () => {
          const THREE = await import('./vendor/three.module.min.js');
          const cam = window.__dbg.camera;
          const rc = new THREE.Raycaster();
          const visible = (o) => { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true; };
          const W = window.innerWidth, H = window.innerHeight;
          const cls = (x, y) => {
            rc.setFromCamera(new THREE.Vector2((x + 0.5) / W * 2 - 1,
              -((y + 0.5) / H * 2 - 1)), cam);
            const hits = rc.intersectObjects(window.__dbg.scene.children, true)
              .filter((h) => h.object.isMesh && visible(h.object));
            return hits[0]?.object.material?.color?.getHexString?.() ?? null;
          };
          let blueOnWood = 0; const hits = [];
          for (const [x, y, r, gg, b] of ${JSON.stringify(m.bluePx)}) {
            const allWood = [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]]
              .every(([dx, dy]) => cls(x + dx, y + dy) === 'a89486');
            if (allWood) {
              blueOnWood++;
              if (hits.length < 5) hits.push([x, y, r, gg, b]);
            }
          }
          return { blueOnWood, hits };
        })()`);
      if (seamJudge.blueOnWood > 2) {
        hueFail(`S1-hue ${tag}: ${seamJudge.blueOnWood} blue-dominant pixels `
          + 'ON SOLID WOOD in the miter seam band (env wash — GH-440; '
          + `first: ${JSON.stringify(seamJudge.hits)})`);
      }
      const blueness = (c) => +(c[2] - Math.max(c[0], c[1])).toFixed(1);
      for (const [ptag, c] of Object.entries(m.crops)) {
        if (ptag === 'ring') {
          if (!(c[0] - c[2] >= 5)) {
            hueFail(`S1-hue ${tag}: ring-top anchor lost its warm wood band `
              + `(${JSON.stringify(c)} — the arm cannot vouch for this frame)`);
          }
        } else if (blueness(c) > 10) {
          hueFail(`S1-hue ${tag}: ${ptag} crop ${JSON.stringify(c)} reads blue `
            + `(B − max(R,G) = ${blueness(c)} > 10) against the deep-red ring `
            + '(env wash — GH-440)');
        }
      }
      console.log(`S1-hue ${tag}: seam blue-on-wood ${seamJudge.blueOnWood} `
        + `(raw blue ${m.bluePx.length}), crops ${JSON.stringify(m.crops)}`);
    }
    // structural pins: the derived-visibility legs are actually armed (the
    // shader flag + the per-vertex seam frames — a future refactor that
    // drops either would leave the hue gate to catch the regression alone)
    const st = await evH(`(() => {
      const t = window.__dbg.scene.getObjectByName('obTable');
      let planks = 0, marked = 0, woodOcc = null, apronOcc = null;
      t.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const hex = mesh.material?.color?.getHexString?.();
        if (hex === 'a89486' && mesh.geometry?.type === 'ExtrudeGeometry') {
          planks++;
          woodOcc = mesh.material.userData.spikeEnvOcc === true;
          const a = mesh.geometry.attributes.aGroove;
          if (a) { for (let i = 3; i < a.array.length; i += 4) {
            if (a.array[i] > 0) { marked++; break; } } }
        }
        if (hex === '97837a') apronOcc = mesh.material.userData.spikeEnvOcc === true;
      });
      return { planks, marked, woodOcc, apronOcc };
    })()`);
    if (st.planks !== 4 || st.marked !== 4 || st.woodOcc !== true || st.apronOcc !== true) {
      hueFail('S1-hue: derived-visibility structure lost (want 4 planks all '
        + 'seam-marked + flagged wood/apron materials): ' + JSON.stringify(st));
    }
    if (!hueRed) {
      console.log('S1-hue OK (GH-440): no blue-dominant seam pixels, apron/outer '
        + 'crops inside the wood band at 170/171/180c, occlusion structure armed '
        + '(real-user sp/LIVE session)');
    }
    const hueAppErrors = await evH('__test.errors');
    if (hueAppErrors.length) {
      hueFail('S1-hue: app-captured errors in the real-user session: '
        + hueAppErrors.join(' | '));
    }
    if (hueErrors.length) {
      hueFail('S1-hue: console errors in the real-user session: '
        + hueErrors.slice(0, 3).join(' | '));
    }
    } finally {
      chromeH.close();
      await sleep(400);
    }
  }

  // ---- S2: break address = BALL_IN_HAND on the start spots; stroke blocked
  // while the option is pending ------------------------------------------------
  if (await ev('__test.state()') !== 'BALL_IN_HAND') fail('S2: break address did not route to BALL_IN_HAND');
  if (await ev('window.__rules.placementRight()') !== 'carom_break') fail('S2: placement right not carom_break');
  const rej = await ev(`__test.shoot({v0:1.0,phi:0,theta:0,a:0,b:0})`);
  if (!rej) fail('S2: stroke with the break-spot option pending was not refused');
  if (await ev('__test.state()') !== 'BALL_IN_HAND') fail('S2: refused stroke changed state');
  // the decision prompt renders (aim lane drives hud.setDecision from the
  // hudState projection)
  await sleep(300);
  if (await ev('document.getElementById("hud-decision").style.display') !== 'block') {
    fail('S2: break-spot decision prompt not shown');
  }
  // the cite rides the chooser row (decision.cite.*; GH-668 S5 slice 3 G6)
  const title = await ev('document.querySelector("#hud-decision .hd-chooser").textContent');
  if (!title.includes('23.1(c)')) fail('S2: decision prompt cite row lacks the Art 23.1(c) cite: ' + title);

  // ---- S3: decision 10 choice 1 = LEFT start spot (UMB Art 23.1(c)) --------
  if (await ev('window.__rules.decide("break_spot", 1)') !== true) fail('S3: decide(break_spot, 1) rejected');
  if (!sawLog('[flow] decisionMade {"kind":"break_spot","choice":1')) fail('S3: decisionMade hook not printed');
  m = await match();
  if (m?.pendingDecision !== null || m?.breakSpot !== 'left') fail('S3: option did not resolve left: ' + JSON.stringify(m));
  let cue = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
  // three frame: pos[0] = kernel y, pos[2] = kernel x
  if (Math.abs(cue[2] - (-0.1825)) > 1e-6 || Math.abs(cue[0] - (-0.71)) > 1e-6) {
    fail('S3: breaker ball not on the LEFT start spot: ' + cue);
  }
  // placement drag snaps to the start spots only (Art 23.1(c) clamp)
  if (!(await ev('__test.placeCue(0.05, -0.6)'))) fail('S3: start-spot placement rejected');
  cue = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
  if (Math.abs(cue[2] - 0.1825) > 1e-6 || Math.abs(cue[0] - (-0.71)) > 1e-6) {
    fail('S3: placement did not snap to the RIGHT start spot: ' + cue);
  }
  if (!(await ev('__test.placeCue(-0.4, -0.9)'))) fail('S3: snap back left rejected');
  cue = (await ev('__test.balls()')).find((b) => b.id === 0).pos;
  if (Math.abs(cue[2] - (-0.1825)) > 1e-6) fail('S3: placement did not snap back to the LEFT spot: ' + cue);

  // ---- S4 [C2]: break first contact NOT red — wrong-first-ball-break -------
  // from the left start spot, phi 0 plays straight into the opponent ball
  // on the bottom spot (0, -0.71)
  if (await shot('S4', { v0: 1.2, phi: 0, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('S4: fouled break did not route to AIM (carom has no ball-in-hand)');
  }
  let j = await judgment();
  if (j?.legal !== false || j?.fouls?.[0]?.code !== 'wrong-first-ball-break'
    || j?.fouls?.[0]?.cite !== CITE_BREAK) {
    fail('S4: expected wrong-first-ball-break ' + CITE_BREAK + ': ' + JSON.stringify(j?.fouls));
  }
  if (!sawLog('[flow] foulCalled')) fail('S4: foulCalled hook not printed');
  if (await player() !== 2) fail('S4: the fouled break must pass the turn (Art 41.12)');
  m = await match();
  if (m?.stage !== 'play') fail('S4: match must be in play after the break (C2 Next=play)');
  const hint4 = await ev('document.getElementById("hud-hint").textContent');
  if (!hint4.includes('23.3')) fail('S4: foul hint does not carry the Art 23.3 cite: ' + hint4);

  // ---- S5 [C3]: valid three-cushion point — +1, shooter continues ----------
  await scene([CUE, B1, B2_POINT], PLAY);
  if (await shot('S5', { v0: V0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') fail('S5: point shot did not return to AIM');
  j = await judgment();
  m = await match();
  if (j?.legal !== true || j?.turn !== 'continue') fail('S5: valid cannon must continue (Art 24.4): ' + JSON.stringify(j));
  if (m?.points?.[1] !== 1 || m?.points?.[2] !== 0) fail('S5: point not scored: ' + JSON.stringify(m?.points));
  if (m?.cushionsThisShot < 3) fail('S5: cushion count wrong: ' + m?.cushionsThisShot);
  if (await player() !== 1) fail('S5: shooter did not continue after the point');
  if (!sawLog('[flow] pointsScored')) fail('S5: pointsScored hook not printed');
  // HUD scoreboard renders from the hudState projection
  await sleep(300);
  if (await ev('document.getElementById("hud-carom").style.display') !== 'block') {
    fail('S5: carom scoreboard not shown');
  }
  const chips = await ev('[...document.querySelectorAll("#hud-carom-chips .ob-badge")].map((c) => c.textContent)');
  if (!chips.some((c) => c.includes('P1') && c.includes('1'))) fail('S5: P1 points chip wrong: ' + JSON.stringify(chips));
  if (!chips.some((c) => c.includes('15'))) fail('S5: race-target chip wrong: ' + JSON.stringify(chips));

  // ---- S6 [C4]: two cushions — no point, cited reason, turn passes ---------
  await scene([CUE, B1, B2_TWO], PLAY);
  if (await shot('S6', { v0: V0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') fail('S6: two-cushion shot did not return to AIM');
  j = await judgment();
  m = await match();
  if (j?.legal !== true || j?.turn !== 'pass') fail('S6: two-cushion cannon must pass legally (Art 83): ' + JSON.stringify(j));
  if (m?.lastReason?.code !== 'insufficient-cushions' || m?.lastReason?.cite !== CITE_ART83
    || m?.lastReason?.cushions !== 2) {
    fail('S6: expected the cited insufficient-cushions reason: ' + JSON.stringify(m?.lastReason));
  }
  if (m?.points?.[1] !== 0) fail('S6: no point may be scored on two cushions');
  if (await player() !== 2) fail('S6: turn did not pass');
  const hint6 = await ev('document.getElementById("hud-hint").textContent');
  if (!hint6.includes('Art 83')) fail('S6: reason hint does not carry the Art 83 cite: ' + hint6);

  // ---- S7 [C5]: second ball never touched — miss (Art 24.5) ----------------
  await scene([CUE, B1, B2_PARK], PLAY);
  if (await shot('S7', { v0: V0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') fail('S7: missed shot did not return to AIM');
  m = await match();
  if (m?.lastReason?.code !== 'missed' || m?.lastReason?.cite !== CITE_MISS) {
    fail('S7: expected the cited Art 24.5 miss: ' + JSON.stringify(m?.lastReason));
  }
  if (await player() !== 2) fail('S7: miss did not pass the turn');

  // ---- S8: innings rotation — a completed turn pair increments innings -----
  await scene([CUE, B1, B2_PARK], { ...PLAY, shooter: 2, innings: 0 });
  { // GH-1050: the chip names the inning IN PLAY — "inning 1" through the
    // first pair (RED pre-fix: "inning 0", the completed-pair count)
    const c = await chipHas(1);
    if (!c.ok) fail('S8 GH-1050: the first inning must read ' + JSON.stringify(c));
  }
  await shot('S8', { v0: V0, phi: PHI, theta: 0, a: 0, b: 0 }); // P2 misses
  m = await match();
  if (m?.innings !== 1) fail('S8: non-breaker miss must close the inning pair: ' + JSON.stringify(m));
  if (await player() !== 1) fail('S8: turn did not rotate back to P1');
  { // GH-1050: the breaker's 2nd visit is inning 2 (projection still 1)
    const c = await chipHas(2);
    if (!c.ok) fail('S8 GH-1050: the second inning must read ' + JSON.stringify(c));
  }

  // ---- S9 [C8]: race-to-target win — points + innings on the result --------
  await scene([CUE, B1, B2_POINT], { ...PLAY, points: { 1: 14, 2: 3 }, innings: 9 });
  if (await shot('S9', { v0: V0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') fail('S9: target-reaching point did not reach WIN');
  j = settled.judgment; // atomic with the WIN edge (see settle())
  if (j?.terminal?.winner !== 1 || j?.terminal?.reason !== 'carom-target-reached'
    || j?.terminal?.cite !== CITE_WIN) {
    fail('S9: expected the Art 29.1/29.2 terminal: ' + JSON.stringify(j?.terminal));
  }
  if (!sawLog('[flow] gameWon') || !sawLog('"reason":"carom-target-reached"')) fail('S9: gameWon hook/reason not printed');
  const banner = settled.banner; // atomic with the WIN edge
  if (!banner.includes('PLAYER 1 WINS') || !banner.includes('15') || !banner.includes('3')
    || !banner.includes(CITE_WIN)) {
    fail('S9: result banner must show points, innings and the cite: ' + banner);
  }
  // GH-1050 (UMB Art 29): 9 completed pairs + the breaker's own finishing
  // visit = 10 innings played (RED pre-fix: "in 9 innings")
  if (!/\bin 10 innings\b/.test(banner)) {
    fail('S9 GH-1050: the breaker\'s finish must count its inning ("in 10 innings"): ' + banner);
  }
  // GH-458 (the continue-hint class): the terminal stroke IS a scoring
  // stroke, but "…; shoot again" is a CONTINUE instruction and the match
  // is over — the point announces tail-less (carom.pointFinal) under the
  // WIN banner. RED pre-fix: caromPresentJudgment painted carom.point
  // ("…; shoot again") on every legal scoring stroke, terminals included.
  const hintS9 = await ev('document.getElementById("hud-hint").textContent');
  if (hintS9.includes('shoot again')) {
    fail('S9 GH-458: continue-hint under the WIN banner: ' + hintS9);
  }
  if (!hintS9.startsWith('Point')) {
    fail('S9 GH-458: the terminal point must still announce '
      + '(carom.pointFinal, sentence case since uiaudit F18): ' + hintS9);
  }
  // GH-458: the WIN presentation must never compose flow.reason.* for a
  // carom terminal (its reasons live in the carom.* key family) — the old
  // unconditional citedReason compose logged a missing i18n key on every
  // carom win render. RED pre-fix.
  if (sawLog("missing key 'flow.reason.carom-target-reached'")) {
    fail('S9 GH-458: the carom WIN render composed flow.reason.* '
      + '(missing-key log observed)');
  }
  // WIN auto re-racks into a fresh carom match (break-spot pending again)
  await sleep(3400);
  if (await ev('__test.state()') !== 'BALL_IN_HAND') fail('S9: re-rack did not seat the break address');
  m = await match();
  if (m?.stage !== 'break' || m?.pendingDecision?.kind !== 'break_spot') {
    fail('S9: fresh match after the win looks wrong: ' + JSON.stringify(m));
  }

  // ---- S9b [GH-1050]: the classic (v1) preset counts no terminal visit, so
  // the NON-breaker's first-visit finish is still one inning played — and
  // English says "1 inning" (carom.winBannerOne). RED pre-fix: "in 0
  // innings" (v1 increments only on a Pass, and a finish never passes).
  await scene([CUE, B1, B2_POINT], { ...PLAY, shooter: 2, points: { 1: 3, 2: 14 }, innings: 0 });
  if (await shot('S9b', { v0: V0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('S9b GH-1050: the non-breaker\'s target point did not reach WIN');
  } else {
    const b9b = settled.banner;
    if (!b9b.includes('PLAYER 2 WINS') || !/\bin 1 inning\b/.test(b9b) || /\binnings\b/.test(b9b)) {
      fail('S9b GH-1050: a first-visit finish reads "in 1 inning": ' + b9b);
    }
    const one = await ev(`window.__i18n.t('carom.winBannerOne', { player: 2, p1: 3, p2: 15, innings: 1, cite: ${JSON.stringify(CITE_WIN)} })`);
    if (b9b !== one) fail('S9b GH-1050: the banner must be the carom.winBannerOne line: ' + JSON.stringify({ b9b, one }));
  }
  await sleep(3400); // WIN auto re-rack

  // ---- S10: zero-pocket scene invariants across every stage ----------------
  // kernel truth: the simulated scenario carries the carom table id and an
  // empty pocket list; no BallPocket event was ever emitted; no ball ever
  // sank (the drop-cup path never engaged); no pocket markers / aim-pocket
  // affordances exist on the pocketless table.
  const lastScenario = await ev('JSON.parse(__test.scenarios().at(-1)).system');
  if (lastScenario.equipment?.table_id !== 'umb_carom_284') {
    fail('S10: scenario equipment tag wrong: ' + JSON.stringify(lastScenario.equipment));
  }
  if ((lastScenario.table.pockets ?? []).length !== 0) fail('S10: scenario table has pockets');
  const evKinds = await ev('__test.events().map((e) => typeof e.kind === "string" ? e.kind : Object.keys(e.kind)[0])');
  if (evKinds.includes('BallPocket')) fail('S10: BallPocket observed on the pocketless table');
  const balls10 = await ev('__test.balls()');
  if (balls10.some((b) => b.pocketed)) fail('S10: a ball entered the drop-cup path');
  if (await ev('window.__aim.pocketMarks().length') !== 0) fail('S10: pocket markers exist on the pocketless table');
  if (await ev('window.__aim.nominationRequired()') !== false) fail('S10: nomination affordance active in carom');

  // ---- C9 [UMB Art 27.2/41.8, GH-371]: frozen-cushion direct play ------------
  // The cue stands frozen to the bottom rail (centre at r from the
  // plane); playing straight INTO that rail is the balls-in-contact
  // foul; playing AWAY from it stays legal. RED on pre-371 main: both
  // strokes judged with no foul (Art 41.8 was documented OUT).
  const FROZEN_Y = -(2.84 / 2 - 0.03075); // bottom rail, carom 2.84 m table
  await sleep(3200); // let a prior arm's WIN auto re-rack land first
  const PLAY371 = { phase: 'play', shooter: 1, points: { 1: 0, 2: 0 },
    innings: 0, target: 15, breaker: 1, pendingDecision: null,
    lastReason: null, foulContext: null, result: null };
  await scene([{ id: 0, x: 0.2, y: FROZEN_Y }, { id: 1, x: -0.4, y: 0.9 },
    { id: 2, x: 0.5, y: 0.9 }], PLAY371);
  if (await shot('C9', { v0: 0.8, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('C9: the frozen-cushion foul passes the turn in AIM');
  }
  let j9 = settled.judgment;
  if (!j9?.fouls?.some((f) => f.code === 'frozen-cushion-play'
    && f.cite === 'UMB Art 27.2/41.8')) {
    fail('C9: expected the cited frozen-cushion foul: ' + JSON.stringify(j9?.fouls));
  }
  if (j9?.legal !== false) fail('C9: the foul must void the stroke');
  // carom fouls surface on the HINT register (caromPresentJudgment —
  // the shipped 012 convention; the banner stays a win/foul surface for
  // the pocket disciplines)
  let hint9 = '';
  for (let i = 0; i < 20 && hint9.indexOf('27.2') < 0; i++) {
    await sleep(150);
    hint9 = await ev('document.getElementById("hud-hint")?.textContent ?? ""');
  }
  if (hint9.indexOf('27.2') < 0) {
    fail('C9: the foul hint must carry the Art 27.2 cite: ' + hint9);
  }
  // the legal twin: the same frozen address played AWAY from the rail
  await scene([{ id: 0, x: 0.2, y: FROZEN_Y }, { id: 1, x: -0.4, y: 0.9 },
    { id: 2, x: 0.5, y: 0.9 }], PLAY371);
  await shot('C9(b)', { v0: 0.6, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
  j9 = settled.judgment;
  if (j9?.fouls?.some((f) => f.code === 'frozen-cushion-play')) {
    fail('C9(b): playing away from the frozen rail is legal: ' + JSON.stringify(j9?.fouls));
  }

  // ---- C10 [UMB Art 27.1(a), GH-371]: balls-in-contact demand-respot ---------
  // The cue frozen to the other white at address surfaces the
  // respot-frozen affordance (#hud-action); pressing it respots the
  // balls concerned through caromRespotPlan (cue -> bottom start spot,
  // other white -> centre spot), records decision 16 on the calls axis,
  // and self-clears. RED on pre-371 main: caromContact() had zero
  // consumers — no affordance existed.
  await scene([{ id: 0, x: 0.2, y: -0.9 },
    { id: 1, x: 0.2 + 2 * 0.03075 + 1e-9, y: -0.9 },
    { id: 2, x: -0.5, y: 0.9 }], PLAY371);
  const frozen10 = await ev('window.__rules.caromContact()');
  if (!Array.isArray(frozen10) || !frozen10.includes(1)) {
    fail('C10: caromContact must report the frozen pair: ' + JSON.stringify(frozen10));
  }
  let act10 = null;
  for (let i = 0; i < 40 && !act10; i++) {
    await sleep(150);
    act10 = await ev('document.getElementById("hud-action")?.classList'
      + '.contains("on") ? document.getElementById("hud-action")'
      + '.textContent : null');
  }
  if (!act10) fail('C10: the respot-frozen affordance never surfaced');
  await ev('document.getElementById("hud-action").click()');
  await sleep(400);
  const post10 = await ev('__test.balls()');
  const cue10 = post10.find((b) => b.id === 0);
  const white10 = post10.find((b) => b.id === 1);
  // Art 27.3(b) designations: shooter's ball -> bottom start spot
  // (0, -0.71), the other white -> the centre spot (0, 0)
  // pos = [kernelY, height, kernelX]
  if (!cue10 || Math.abs(cue10.pos[2]) > 1e-6
    || Math.abs(cue10.pos[0] - (-0.71)) > 1e-6) {
    fail('C10: the cue must respot on the bottom spot: ' + JSON.stringify(cue10?.pos));
  }
  if (!white10 || Math.abs(white10.pos[2]) > 1e-6
    || Math.abs(white10.pos[0]) > 1e-6) {
    fail('C10: the other white must respot on the centre spot: '
      + JSON.stringify(white10?.pos));
  }
  if (await ev('document.getElementById("hud-action").classList.contains("on")') !== false) {
    fail('C10: the affordance must self-clear after the respot');
  }
  if (!sawLog('[flow] decisionMade {"kind":"contact_respot","choice":1')) {
    fail('C10: the demand must ride the decision liturgy (wire id 16)');
  }

  // ============ GH-383 V-blocks: the carom3c-v2 preset arms ==================
  // Two cue balls with per-seat assignment (UMB Art 22.1/23.2/23.4), the
  // Art 27.3(b) incoming-striker respot, the Art 83 announce fouls, and
  // the Art 29.4 equal-innings regime — driven through the PRODUCTION
  // variant machinery (settings.changeVariant -> the artifact catalog's
  // carom3c-v2 preset rows) on the same baked physics recipes (id
  // permutations of the S-block geometry: the kernel strikes whatever
  // options.cue_ball names — Amendment 026).

  // ---- V1: preset activation + per-seat cue assignment across innings ------
  // The GH-371 C9/C10 arms above FIRE shots, so the current rack is no
  // longer fresh and changeVariant would defer to the next rack (the
  // variantNextRack law). Land a fresh seeded rack first — the V-blocks'
  // original precondition (they used to follow C8's WIN auto re-rack).
  if (await ev('window.__rules.caromActivate(1)') !== true) {
    fail('V1: fresh-rack reset (caromActivate) failed');
  }
  await sleep(700); // staged break-address routing (macrotask)
  if (await ev('window.__settings.changeVariant("carom_3cushion", "umb-carom-2cue")') !== true) {
    fail('V1: changeVariant(umb-carom-2cue) rejected');
  }
  await sleep(600); // in-place same-seed re-rack + fold reset
  m = await match();
  if (m?.stage !== 'break' || m?.pendingDecision?.kind !== 'break_spot') {
    fail('V1: v2 fold did not reach the break address: ' + JSON.stringify(m));
  }
  // seat 1 (the breaker) misses with ITS ball 0 — the turn passes
  await scene([CUE, B1, B2_PARK], PLAY);
  await shot('V1a', { v0: V0, phi: PHI, theta: 0, a: 0, b: 0 });
  let scn = JSON.parse(await ev('__test.scenarios().at(-1)'));
  if (scn.options?.cue_ball !== undefined) {
    fail('V1a: seat 1 strikes ball 0 — options.cue_ball must be ABSENT '
      + '(byte-identical default path): ' + JSON.stringify(scn.options?.cue_ball));
  }
  if (await player() !== 2) fail('V1a: turn did not pass to seat 2');
  // seat 2 scores with ITS ball 1 (same geometry, ids permuted)
  await scene([{ id: 1, x: CUE.x, y: CUE.y }, { id: 0, x: B1.x, y: B1.y },
    { id: 2, x: B2_POINT.x, y: B2_POINT.y }], { ...PLAY, shooter: 2 });
  if (await shot('V1b', { v0: V0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('V1b: seat-2 point did not return to AIM');
  }
  j = await judgment();
  m = await match();
  if (j?.legal !== true || j?.turn !== 'continue') {
    fail('V1b: seat 2 with ball 1 must score legally (Art 22.1/23.4): '
      + JSON.stringify({ legal: j?.legal, fouls: j?.fouls }));
  }
  if (m?.points?.[2] !== 1) fail('V1b: point not scored for seat 2');
  scn = JSON.parse(await ev('__test.scenarios().at(-1)'));
  if (scn.options?.cue_ball !== 1) {
    fail('V1b: the scenario must strike ball 1 (options.cue_ball, '
      + 'Amendment 026): ' + JSON.stringify(scn.options));
  }
  const evKindsV1 = await ev('__test.events()[0]');
  if (evKindsV1?.kind?.Strike?.ball !== 1) {
    fail('V1b: the record Strike event must carry ball 1: '
      + JSON.stringify(evKindsV1));
  }
  // the AIM state line names the seat's ball (carom.aimHint2 — the
  // transient point hint rides #hud-hint separately)
  const stateV1 = await ev('document.getElementById("state").textContent');
  if (!stateV1.includes('yellow')) {
    fail('V1b: the aim state line must name the seat ball (carom.aimHint2): '
      + stateV1);
  }

  // ---- V2: Art 27.3(b) — the INCOMING striker's white takes the bottom
  // spot; the fouler's white goes to the CENTRE (audit F5 red/green: the
  // pre-GH-383 hardcoded shooter-1 mapping would put the fouler's ball 0
  // on the bottom spot) -------------------------------------------------------
  // recipe: v0 6 theta 0.3 at the red near the top rail jumps BOTH the
  // red and the striker off the table (baked against the committed wasm)
  const JUMP = { v0: 6, phi: 1.7078625011050843, theta: 0.3, a: 0, b: 0.3 };
  await scene([{ id: 0, x: 0.2, y: -0.9 }, { id: 1, x: -0.5, y: -1.2 },
    { id: 2, x: 0.0, y: 0.55 }], PLAY);
  await shot('V2a', JUMP);
  j = await judgment();
  if (j?.fouls?.[0]?.code !== 'ball-off-table' || j?.respot?.length !== 2) {
    fail('V2a: expected the two-ball off-table foul: ' + JSON.stringify(
      { fouls: j?.fouls, respot: j?.respot }));
  }
  let balls = await ev('__test.balls()');
  let red = balls.find((b) => b.id === 2), white = balls.find((b) => b.id === 0);
  // three frame: pos[0] = kernel y, pos[2] = kernel x
  if (Math.abs(red.pos[2]) > 1e-6 || Math.abs(red.pos[0] - 0.71) > 1e-6) {
    fail('V2a: red must respot on the TOP spot: ' + red.pos);
  }
  if (Math.abs(white.pos[2]) > 1e-6 || Math.abs(white.pos[0]) > 1e-6) {
    fail('V2a: the FOULER\'s white must respot on the CENTRE spot '
      + '(Art 27.3(b): the bottom spot belongs to the incoming striker\'s '
      + 'ball): ' + white.pos);
  }
  if (await player() !== 2) fail('V2a: turn did not pass');
  // the mirror: seat 2 fouls with ball 1 — ball 1 takes the centre
  await scene([{ id: 1, x: 0.2, y: -0.9 }, { id: 0, x: -0.5, y: -1.2 },
    { id: 2, x: 0.0, y: 0.55 }], { ...PLAY, shooter: 2 });
  await shot('V2b', JUMP);
  j = await judgment();
  if (j?.fouls?.[0]?.code !== 'ball-off-table') {
    fail('V2b: expected the off-table foul: ' + JSON.stringify(j?.fouls));
  }
  balls = await ev('__test.balls()');
  const yellow = balls.find((b) => b.id === 1);
  if (Math.abs(yellow.pos[2]) > 1e-6 || Math.abs(yellow.pos[0]) > 1e-6) {
    fail('V2b: the fouling seat-2 ball must respot on the CENTRE spot: '
      + yellow.pos);
  }

  // ---- V3: Art 83 letter — the announce foul --------------------------------
  await scene([CUE, B1, B2_TWO], PLAY);
  if (await shot('V3', { v0: V0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('V3: the announce foul routes to AIM (no placement right)');
  }
  j = await judgment();
  m = await match();
  if (j?.legal !== false || j?.fouls?.[0]?.code !== 'two-cushions'
    || j?.fouls?.[0]?.cite !== CITE_ART83) {
    fail('V3: expected the "two cushions" Art 83 announce foul: '
      + JSON.stringify(j?.fouls));
  }
  if (m?.points?.[1] !== 0) fail('V3: the foul voids the point');
  if (await player() !== 2) fail('V3: turn did not pass');
  if (!sawLog('[flow] foulCalled') ) fail('V3: foulCalled hook not printed');
  const hint3 = await ev('document.getElementById("hud-hint").textContent');
  if (!hint3.includes('Art 83')) {
    fail('V3: the foul hint must cite Art 83: ' + hint3);
  }

  // ---- V3b/V3c [GH-1050]: the two-cue innings law at the result ------------
  // v2 closes a pair when the NON-breaker ends a visit (a finish included),
  // never on the breaker's own finish. The result quotes innings PLAYED:
  // V3b — the breaker finishes its 12th visit after 11 pairs → 12 (RED
  // pre-fix: "in 11 innings"); V3c — the non-breaker's finish closes pair
  // 12 itself → 12, unchanged (the control the +1 must not touch).
  await scene([CUE, B1, B2_POINT], { ...PLAY, points: { 1: 14, 2: 9 }, innings: 11 });
  if (await shot('V3b', { v0: V0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('V3b GH-1050: the breaker\'s target point did not reach WIN');
  } else if (!settled.banner.includes('PLAYER 1 WINS') || !/\bin 12 innings\b/.test(settled.banner)) {
    fail('V3b GH-1050: the breaker\'s 12th-visit finish reads "in 12 innings": ' + settled.banner);
  }
  await sleep(3400); // WIN auto re-rack
  await scene([{ id: 1, x: CUE.x, y: CUE.y }, { id: 0, x: B1.x, y: B1.y },
    { id: 2, x: B2_POINT.x, y: B2_POINT.y }],
  { ...PLAY, shooter: 2, points: { 1: 9, 2: 14 }, innings: 11 });
  if (await shot('V3c', { v0: V0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('V3c GH-1050: the non-breaker\'s target point did not reach WIN');
  } else if (!settled.banner.includes('PLAYER 2 WINS') || !/\bin 12 innings\b/.test(settled.banner)) {
    fail('V3c GH-1050: the non-breaker\'s finish closes pair 12 — "in 12 innings": ' + settled.banner);
  }
  await sleep(3400); // WIN auto re-rack

  // ---- V4: Art 29.4 equal innings — the leveling inning ---------------------
  if (await ev('window.__rules.caromActivate(7)') !== true) fail('V4: re-activate failed');
  await sleep(400);
  if (await ev('window.__settings.changeVariant("carom_3cushion", "umb-carom-2cue-ei")') !== true) {
    fail('V4: changeVariant(umb-carom-2cue-ei) rejected');
  }
  await sleep(600);
  await scene([CUE, B1, B2_POINT], { ...PLAY,
    points: { 1: 14, 2: 3 }, innings: 9 });
  const endState = await shot('V4', { v0: V0, phi: PHI, theta: 0, a: 0, b: 0 });
  if (endState !== 'BALL_IN_HAND') {
    fail('V4: the breaker\'s target point must open the LEVELING inning '
      + '(BALL_IN_HAND break address), got ' + endState);
  }
  j = await judgment();
  m = await match();
  if (j?.terminal !== null) fail('V4: no terminal before the leveling inning');
  if (m?.stage !== 'leveling_break' || m?.pendingDecision?.chooser !== 2) {
    fail('V4: leveling break address wrong: ' + JSON.stringify(
      { stage: m?.stage, pending: m?.pendingDecision }));
  }
  if (m?.points?.[1] !== 15) fail('V4: the finisher\'s point must count');
  // review r3: the leveling transition is a scoring stroke — the point
  // must ride the hook wire even though the visit passes
  if (!sawLog('"points":{"1":15')) {
    fail('V4: pointsScored hook missing for the leveling-transition point');
  }
  if (await ev('window.__rules.placementRight()') !== 'carom_break') {
    fail('V4: leveling address must carry the carom_break placement right');
  }
  // the initial-position reset: red on top, the finisher's white on the
  // bottom spot, the leveling seat's ball on a start spot (Art 29.4 via 23.1)
  balls = await ev('__test.balls()');
  red = balls.find((b) => b.id === 2); white = balls.find((b) => b.id === 0);
  const lev = balls.find((b) => b.id === 1);
  if (Math.abs(red.pos[0] - 0.71) > 1e-6 || Math.abs(red.pos[2]) > 1e-6) {
    fail('V4: red not on the top spot: ' + red.pos);
  }
  if (Math.abs(white.pos[0] + 0.71) > 1e-6 || Math.abs(white.pos[2]) > 1e-6) {
    fail('V4: the finisher\'s white not on the bottom spot: ' + white.pos);
  }
  if (Math.abs(lev.pos[0] + 0.71) > 1e-6
    || Math.abs(Math.abs(lev.pos[2]) - 0.1825) > 1e-6) {
    fail('V4: the leveling ball not on a start spot: ' + lev.pos);
  }
  // the leveling seat chooses the LEFT spot; its OWN ball moves there
  if (await ev('window.__rules.decide("break_spot", 1)') !== true) {
    fail('V4: leveling break_spot decision rejected');
  }
  let cueV4 = (await ev('__test.balls()')).find((b) => b.id === 1).pos;
  if (Math.abs(cueV4[2] - (-0.1825)) > 1e-6 || Math.abs(cueV4[0] + 0.71) > 1e-6) {
    fail('V4: the leveling ball did not take the LEFT start spot: ' + cueV4);
  }
  // a failed leveling stroke (first contact NOT red — Art 29.4 via 23.3)
  // hands the match to the first finisher
  if (await shot('V4b', { v0: 1.2, phi: 0, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('V4b: the failed leveling stroke must end the match');
  }
  j = settled.judgment;
  if (j?.terminal?.winner !== 1 || j?.terminal?.reason !== 'carom-target-reached') {
    fail('V4b: expected the first finisher\'s terminal: '
      + JSON.stringify(j?.terminal));
  }
  if (j?.fouls?.[0]?.code !== 'wrong-first-ball-break') {
    fail('V4b: the leveling stroke replays the red-first requirement: '
      + JSON.stringify(j?.fouls));
  }
  // GH-1050 control: the failed leveling stroke ENDS the non-breaker's
  // visit and closes pair 10 — the result stays "in 10 innings"
  if (!/\bin 10 innings\b/.test(settled.banner)) {
    fail('V4b GH-1050: the leveling-miss result reads "in 10 innings": ' + settled.banner);
  }
  await sleep(3400); // WIN auto re-rack

  // ---- V5: Art 29.4 — the DRAW ----------------------------------------------
  await scene([{ id: 1, x: CUE.x, y: CUE.y }, { id: 0, x: B1.x, y: B1.y },
    { id: 2, x: B2_POINT.x, y: B2_POINT.y }],
  { ...PLAY, phase: 'leveling', shooter: 2, points: { 1: 15, 2: 14 },
    innings: 10 });
  if (await shot('V5', { v0: V0, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'WIN') {
    fail('V5: the leveling target point must end the match');
  }
  j = settled.judgment;
  if (j?.terminal?.winner !== 0 || j?.terminal?.reason !== 'carom-draw'
    || j?.terminal?.cite !== 'UMB Art 29.4') {
    fail('V5: expected the Art 29.4 draw terminal (winner 0 sentinel): '
      + JSON.stringify(j?.terminal));
  }
  const bannerV5 = settled.banner;
  if (!bannerV5.includes('DRAW') || !bannerV5.includes('15')
    || !bannerV5.includes('Art 29.4')) {
    fail('V5: the draw banner must show the level score + the cite: ' + bannerV5);
  }
  // GH-1050 control: the leveling finish closes pair 11 itself — no +1
  if (!/\blevel in 11\b/.test(bannerV5)) {
    fail('V5 GH-1050: the draw levels in inning 11: ' + bannerV5);
  }
  if (!sawLog('[flow] matchDrawn') || !sawLog('"reason":"carom-draw"')) {
    fail('V5: the matchDrawn hook not printed (the draw sentinel must '
      + 'never ride gameWon.player — review r8)');
  }
  // GH-458: the DRAW presents as a draw EVERYWHERE — the state line must
  // not read the WIN label under the DRAW banner (RED pre-fix: renderText's
  // WIN branch never specialized winner 0 and painted "WIN — re-racking…"),
  // the drawing stroke's point hint carries no continue instruction, and
  // the draw render logs no missing flow.reason key.
  const stateV5 = await ev('document.getElementById("state").textContent');
  const winLabel = await ev('window.__i18n.t("state.win")');
  const drawLabel = await ev('window.__i18n.t("state.draw")');
  if (stateV5.includes(winLabel) || !stateV5.includes(drawLabel)) {
    fail(`V5 GH-458: DRAW terminal state line must present the draw `
      + `(want '${drawLabel}', never '${winLabel}'): "${stateV5}"`);
  }
  const hintV5 = await ev('document.getElementById("hud-hint").textContent');
  if (hintV5.includes('shoot again')) {
    fail('V5 GH-458: continue-hint on the drawing terminal stroke: ' + hintV5);
  }
  if (sawLog("missing key 'flow.reason.carom-draw'")) {
    fail('V5 GH-458: the draw render logged a missing i18n key');
  }
  await sleep(3400); // auto re-rack clears the terminal
  // GH-460 control: the DRAWN rack's breaker (seat 1 — the shaped fold's
  // breaker; the terminal fold adopted j.next.breaker, never the winner-0
  // sentinel) breaks the auto re-rack — a SAME-discipline rules-driven
  // re-rack keeps its own seat law untouched by the discipline-switch
  // cold-boot reseed (whose red/green arm lives in e2e-settings).
  if (await player() !== 1) {
    fail('V5 GH-460 control: the drawn rack\'s breaker must break the '
      + 're-rack, got seat ' + await player());
  }

  // restore the default preset for any later suite reuse of the profile
  await ev('window.__settings.changeVariant("carom_3cushion", null)');
  await sleep(400);

  // ---- C-fork (feature 034 / 525 S4a-mig, plan ruling P4): the GH-383 carom
  // second-ball fork on the PLAY PLACE + the persisted-reload paint law ----
  // (1) `obshell=1` carom page ⇒ `[data-ob="play-carom2b"]` visible; pick
  //     `marked` ⇒ `__settings.get().caromSecondBall === 'marked'` + a same-
  //     seed rerack at shot 0 (ball 1 repainted dot-marked WHITE);
  // (2) after one shot, pick `yellow` ⇒ the SHELL notice register shows
  //     t('settings.variantNextRack') (not the HUD hint — the shell is open)
  //     and the rack is untouched;
  // (3) PERSISTED-RELOAD leg (review round 4 P1-2 — proves the settings.js
  //     sync() application retained by 034a-mig T018 (9)): `caromSecondBall:
  //     'marked'` + `game: 'carom_3cushion'` persisted, a straight-to-AIM
  //     scripted boot WITHOUT obshell (play never mounts, `__play` undefined)
  //     ⇒ the FIRST rack's ball 1 texture reads the dot-marked WHITE paint,
  //     never yellow; then `__settings.set('caromSecondBall','yellow')` (the
  //     broadcast path of the same line) + a shot-0 same-seed rerack repaints
  //     yellow.
  {
    const pollC = async (expr, tries = 120, ms = 150) => {
      for (let i = 0; i < tries; i++) {
        try { if (await ev(expr)) return true; } catch { /* navigating */ }
        await sleep(ms);
      }
      return false;
    };
    // ball 1 body paint: the median of a 5x5 patch OFF the six octahedral
    // measle dots (equator x=384 sits between the x=256 and x=512 dot
    // stations) — yellow #eeb200 has a ~0 blue channel, white #f3eedd ~221
    const PAINT = `(() => {
      const d = __test.ballTexturePixel(1, 384, 256, 2);
      if (!d) return null;
      const n = d.length / 4;
      const ch = (k) => { const v = []; for (let i = 0; i < n; i++) v.push(d[i * 4 + k]); v.sort((a, b) => a - b); return v[Math.floor(n / 2)]; };
      const [r, g, b] = [ch(0), ch(1), ch(2)];
      return { r, g, b, kind: b < 90 && r > 180 ? 'yellow' : (Math.min(r, g, b) > 180 ? 'white' : 'other') }; })()`;
    // a navigation discards the page's __test.errors — gate them first (the
    // node-side consoleErrors sink persists across navigations)
    const errsPre = await ev('__test.errors').catch(() => []);
    if (errsPre.length) fail('app-captured errors (S/V blocks, before the C-fork hop): ' + errsPre.join(' | '));
    await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?seed=1&obshell=1&arm=cfork` });
    if (!(await pollC('window.__test?.ready === true', 300, 200))) fail('C-fork: obshell carom page never became ready');
    if (await ev('window.__settings.changeGame("carom_3cushion", { skipConfirm: true })') !== true) {
      fail('C-fork: changeGame(carom_3cushion) refused');
    }
    const up = await pollC(`window.__shell?.isOpen?.() === true && window.__shell.place() === 'play'
      && typeof window.__play === 'object' && document.querySelector('[data-ob="play-carom2b"]')?.hidden === false`);
    if (!up) fail('C-fork: the play card never showed the carom fork on the obshell carom page');
    await ev('window.__settings.set("caromSecondBall", "yellow"); true');
    await sleep(300);
    const seed0 = await ev('__test.bed().seed');
    if (await ev('__test.bed().shotIndex') !== 0) { await ev(`__test.rerack(${seed0})`); await sleep(500); }
    await ev(`document.querySelector('[data-ob="play-carom2b"] input[value="marked"]').click(); true`);
    const marked = await pollC(`window.__settings.get().caromSecondBall === 'marked' && __test.bed().shotIndex === 0`);
    const paintM = await pollC(`(${PAINT})?.kind === 'white'`, 40, 200) ? await ev(PAINT) : await ev(PAINT);
    const afterM = await ev(`({ c2b: window.__settings.get().caromSecondBall, seed: __test.bed().seed,
      shot: __test.bed().shotIndex, reg: window.__play.registry().carom2b, shell: window.__shell.isOpen(),
      checked: document.querySelector('[data-ob="play-carom2b"] input[value="marked"]').checked })`);
    if (!marked || afterM.c2b !== 'marked' || afterM.seed !== seed0 || afterM.shot !== 0 || afterM.reg !== true
      || afterM.shell !== true || !afterM.checked || paintM?.kind !== 'white') {
      fail('C-fork (1): picking marked must persist + same-seed rerack at shot 0 + repaint ball 1 white: '
        + JSON.stringify({ marked, afterM, paintM }));
    }
    // (2) one shot, then yellow ⇒ deferred (shell notice), rack untouched.
    // The fresh carom rack pends the UMB Art 23.1(c) break-spot option
    // (address-born, S1) — resolve it the S3 way before the staging stroke.
    await ev('window.__shell.quickPlay(); true');
    await pollC('window.__shell.isOpen() === false');
    if (await ev(`window.__rules.matchState()?.pendingDecision?.kind ?? null`) === 'break_spot') {
      if (await ev('window.__rules.decide("break_spot", 1)') !== true) fail('C-fork: decide(break_spot, 1) rejected');
      await sleep(300);
    }
    if (await shot('C-fork staging stroke', { v0: 0.6, phi: 0, theta: 0, a: 0, b: 0 }) === 'REJECTED') {
      fail('C-fork: staging stroke rejected');
    }
    const shot1 = await ev('__test.bed().shotIndex');
    await ev('window.__settings.show("game"); true');
    await pollC(`window.__shell?.isOpen?.() === true && typeof window.__play === 'object'`);
    await ev(`document.querySelector('[data-ob="play-carom2b"] input[value="yellow"]').click(); true`);
    await sleep(500);
    const afterY = await ev(`({ c2b: window.__settings.get().caromSecondBall, shot: __test.bed().shotIndex,
      seed: __test.bed().seed, note: document.getElementById('ob-shell-note')?.textContent ?? null,
      exp: window.__i18n.t('settings.variantNextRack'), paint: (${PAINT})?.kind ?? null })`);
    if (afterY.c2b !== 'yellow' || afterY.shot !== shot1 || shot1 < 1 || afterY.seed !== seed0
      || afterY.note !== afterY.exp || afterY.paint !== 'white') {
      fail('C-fork (2): after a shot the yellow pick must defer (shell notice = settings.variantNextRack), rack + paint untouched: '
        + JSON.stringify({ shot1, afterY }));
    }
    // (3) persisted-reload leg: straight-to-AIM scripted boot, no shell, no play
    await ev(`(() => { const b = JSON.parse(localStorage.getItem('ob-settings-v1') || '{}');
      b.game = 'carom_3cushion'; b.caromSecondBall = 'marked';
      localStorage.setItem('ob-settings-v1', JSON.stringify(b)); return true; })()`);
    const errsFork = await ev('__test.errors').catch(() => []);
    if (errsFork.length) fail('app-captured errors (C-fork obshell page, before the persisted reload): ' + errsFork.join(' | '));
    await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?seed=1&obtool=1&arm=cfork-reload` });
    if (!(await pollC('window.__test?.ready === true', 300, 200))) fail('C-fork (3): the persisted reload never became ready');
    await sleep(800);
    const paintW = (await pollC(`(${PAINT})?.kind === 'white'`, 40, 200)) ? await ev(PAINT) : await ev(PAINT);
    const boot = await ev(`({ play: typeof window.__play, shell: window.__shell?.isOpen?.() ?? null,
      game: window.__rules.game(), c2b: window.__settings.get().caromSecondBall, shot: __test.bed().shotIndex })`);
    if (boot.play !== 'undefined' || boot.shell === true || boot.game !== 'carom_3cushion' || boot.c2b !== 'marked'
      || paintW?.kind !== 'white') {
      fail('C-fork (3): a straight-to-AIM boot with caromSecondBall persisted as marked must paint the FIRST rack white via settings.js sync(): '
        + JSON.stringify({ boot, paintW }));
    }
    await ev('window.__settings.set("caromSecondBall", "yellow"); true');
    await sleep(200);
    await ev(`__test.rerack(${JSON.stringify(await ev('__test.bed().seed'))})`);
    const paintY = (await pollC(`(${PAINT})?.kind === 'yellow'`, 40, 200)) ? await ev(PAINT) : await ev(PAINT);
    if (paintY?.kind !== 'yellow') {
      fail('C-fork (3): set(caromSecondBall, yellow) + a shot-0 same-seed rerack must repaint ball 1 yellow (broadcast path): '
        + JSON.stringify(paintY));
    }
    await ev('window.__settings.changeVariant("carom_3cushion", null); true');
    await sleep(300);
  }

  // ---- hook-wire audit + error gates ----------------------------------------
  for (const hook of ['decisionRequired', 'decisionMade', 'pointsScored',
    'foulCalled', 'gameWon', 'playerChanged']) {
    if (!sawLog(`[flow] ${hook}`)) fail(`hook wire: [flow] ${hook} never printed`);
  }
  const appErrors = await ev('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  if (!process.exitCode) console.log('E2E-CAROM PASS (12 S-blocks: activation + Art 23.1(c) break spots + C2/C3/C4/C5 + innings + C8 race + zero-pocket invariants + GH-371 Art 27.2 frozen-cushion foul + Art 27.1 demand-respot; 5 GH-383 V-blocks: two-cue per-seat assignment + Art 27.3(b) incoming-striker respots + Art 83 announce fouls + Art 29.4 leveling/draw; 1 feature-034 C-fork block: play-place second-ball fork + persisted-reload paint law)');
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
