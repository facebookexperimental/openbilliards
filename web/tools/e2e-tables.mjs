// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-tables.mjs — kernel-mirror boot drift gate across EVERY catalog table
// (feature 012, contracts/render-capacity.md §3/§4). Boots the app once per
// table id via ?table= (scene builds that entry; main.js's active-table
// drift gate compares it against the kernel's own table_geometry_json_for +
// rack-builder output and reports any mismatch through the #err surface),
// and asserts the page built the requested id (the obTable beacon, not the
// fallback pin),
// then exercises the discipline rack probes on the default boot:
// __test.rerackKind('snooker') must put all 22 balls on the table (24-cap
// sphere uniforms) and rerackKind('carom') must land a pocketless 3-ball
// scene — zero app/console errors everywhere.
//
//   node web/tools/e2e-tables.mjs
//   OB_E2E_PORT / OB_E2E_CDP_PORT override the server/CDP ports (concurrent
//   lanes: pick VERIFIED-FREE ports).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { builtTableIdExpr } from './render/lib/table-ids.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 8153);
const CDP0 = Number(process.env.OB_E2E_CDP_PORT ?? 9253);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
let failures = 0;
const fail = (msg) => { failures++; console.error('E2E-TABLES FAIL:', msg); process.exitCode = 1; };

// catalog table ids (crates/pool-core/src/catalog.rs / scene TABLE_SPECS
// — the boot drift gate itself verifies the two stay in lockstep per id;
// joy_q8_9ft is the catalog v15 GH-490 resolve-only alias, scene-aliased to
// chinese8_pro_9ft — legacy replay boots must keep rendering, so BOTH ids
// stay in the sweep)
const TABLE_IDS = [
  'wpa_generic_9ft', 'wpa_spec_9ft', 'diamond_redlabel_9ft',
  'diamond_proam_9ft', 'predator_apex_9ft',
  'wpbsa_snooker_12ft', 'umb_carom_284', 'chinese8_pro_9ft', 'joy_q8_9ft',
  // catalog v18 (GH-621): the Diamond Pro-Am 8-ft / 7-ft size variants —
  // scene entries DERIVED from the diamond_proam_9ft spec (table.js
  // diamondProAmSize), kernel entries by struct update; the boot drift
  // gate proves the two derivations agree per id. NOTE: these two ids
  // resolve only on a canonical wasm at catalog >= 18 — until the GH-621
  // landing ceremony rebakes web/dist/pool-wasm this sweep reports them
  // as kernel-unknown, which is the honest state of the tree.
  'diamond_proam_8ft', 'diamond_proam_7ft',
  // catalog v19 (Rasson lane OX-A1, GH-641): the Rasson OX, appended last at the ceremony
  // (#644 landed first); resolves on the rebaked canonical wasm at catalog 19.
  'rasson_ox_9ft',
  // catalog v20 (#789): the seven neutral table twins, appended last at the
  // ceremony; they resolve on the rebaked canonical wasm at catalog 20.
  'pool_pro_9ft_older_gen', 'pool_pro_9ft', 'pool_pro_9ft_metal_rim',
  'pool_pro_9ft_measured', 'pool_pro_8ft', 'pool_pro_7ft', 'pool_pro_9ft_k55',
];

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

async function bootAndCheck(url, cdpPort, label, exercise) {
  const failuresBefore = failures;
  const consoleErrors = [];
  const chrome = await launchChrome(url, { port: cdpPort });
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      consoleErrors.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
  try {
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) {
      await sleep(200);
      ready = await chrome.eval('window.__test?.ready === true');
    }
    if (!ready) { fail(`${label}: app never became ready`); return; }
    await sleep(800); // a few frames + async settles
    if (exercise) await exercise(chrome);
    const appErrors = await chrome.eval('__test.errors');
    if (appErrors.length) fail(`${label}: app errors: ${appErrors.join(' | ')}`);
    if (consoleErrors.length) fail(`${label}: console errors: ${consoleErrors.join(' | ')}`);
    if (failures === failuresBefore) console.log(`${label}: OK`);
  } finally {
    // CONFIRMED teardown (GH-665): this loop relaunches on the SAME CDP port
    // ~100 ms later; a bare close() only signals, and the shell kept writing
    // its profile past launchChrome's pre-launch wipe budget on the loaded
    // nightly runner (ENOTEMPTY thrown after every assertion had passed).
    // launchChrome now waits for its own previous session either way; the
    // suite still says so explicitly, and a session that will not die is an
    // honest red, never a leaked profile.
    // closeAndWait's false has TWO causes and only one is this suite's
    // (review r3 P2): the root still alive is a red, while a root that is
    // gone with its profile cleanup RETAINED (a verdictless ps, a helper
    // not yet confirmed dead) is not a boot defect — launchChrome's own
    // retained-ownership pass clears it before the next boot or refuses the
    // port outright, so it is reported and not turned into a false red.
    if (!(await chrome.closeAndWait())) {
      let gone = false;
      try { process.kill(chrome.pid, 0); } catch (e) { gone = e.code === 'ESRCH'; }
      if (gone) {
        console.error(`${label}: session pid ${chrome.pid} exited but its `
          + 'profile cleanup was not confirmed — the next launch on '
          + `:${cdpPort} must clear or refuse it (GH-665/GH-294)`);
      } else {
        fail(`${label}: session on :${cdpPort} not confirmed gone at teardown`);
      }
    }
  }
}

try {
  // ---- per-entry boots: the active-table drift gate runs inside the app, and
  // the scene must have BUILT the requested id. An id with no TABLE_SPECS key
  // boots the scripted pin table without an error (resolveBootTableId), and
  // the drift gate then compares the pin against itself and passes.
  for (let i = 0; i < TABLE_IDS.length; i++) {
    const id = TABLE_IDS[i];
    await bootAndCheck(
      `http://127.0.0.1:${PORT}/app.html?seed=1&table=${id}`,
      CDP0, `table ${id}`, async (chrome) => {
        const built = await chrome.eval(builtTableIdExpr);
        if (built !== id) fail(`table ${id}: the page built '${built}' for the requested '${id}'`);
      });
  }

  // ---- discipline rack probes on a default boot (render-capacity.md §7)
  await bootAndCheck(
    `http://127.0.0.1:${PORT}/app.html?seed=1`,
    CDP0, 'rack probes', async (chrome) => {
      if (await chrome.eval("__test.rerackKind('snooker', 1)") !== true) {
        fail('rerackKind snooker rejected');
      }
      await sleep(600);
      const n = await chrome.eval('__test.balls().length');
      if (n !== 22) fail(`snooker probe: expected 22 balls, got ${n}`);
      { // GH-370: the fresh probe rack may grant the opening BALL_IN_HAND
        const stP = await chrome.eval('__test.state()');
        if (stP !== 'AIM' && stP !== 'BALL_IN_HAND') fail(`snooker probe not aiming (${stP})`);
      }
      if (await chrome.eval("__test.rerackKind('carom', 1)") !== true) {
        fail('rerackKind carom rejected');
      }
      await sleep(600);
      const balls = await chrome.eval('__test.balls()');
      if (balls.length !== 3) fail(`carom probe: expected 3 balls, got ${balls.length}`);
      // back to pool: the probe must not wedge the app
      if (await chrome.eval("__test.rerackKind('nine', 1)") !== true) {
        fail('rerackKind nine rejected');
      }
      await sleep(400);
      if (await chrome.eval('__test.balls().length') !== 10) fail('pool restore failed');
    });

  if (!process.exitCode) console.log('E2E-TABLES PASS');
} catch (e) {
  fail(e.stack ?? e);
} finally {
  await stopStaticServer(server);
}
