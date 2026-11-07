// Copyright (c) Meta Platforms, Inc. and affiliates.

// gen-legacy-corpus.mjs — capture the PRE-FEATURE legacy share-link corpus
// (feature 011 T002, SC-003 oracle). Runs against the CURRENT committed
// build (web/dist/pool-sdk + web/dist/pool-wasm) and MUST be run (and its
// output committed) BEFORE any share-codec edit.
//
// For each corpus entry it:
//   1. authors a real hot-seat session in the live app (headless Chrome,
//      hermetic profile) on the exact equipment the legacy wire decodes to,
//      collecting the actual shot params + ball-in-hand placements;
//   2. hand-wires the v1/v2 tuple (deflate-raw + base64url, the codec's own
//      pipeline) or encodes v3 with the current SDK codec;
//   3. reloads the app with the #r= link and captures the REPLAY: the exact
//      scenario JSONs submitted to the kernel, the re-simulated ShotRecord
//      hashes (asserted byte-identical to the authored session), and the
//      9-ball adjudications (judgeShot over each record, flow.js's exact
//      call shape);
//   4. pins everything into web/tools/fixtures/legacy-links.json.
//
// Consumers: sdk/ts/test/share.test.ts (G1 decode identity + G2 wasm
// re-simulation byte-identity) and web/tools/e2e-share.mjs (app-level
// legacy replay arm).
//
//   node web/tools/gen-legacy-corpus.mjs   (needs Chrome + node >= 22)
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = path.resolve(webDir, '..');
const OUT = path.join(webDir, 'tools', 'fixtures', 'legacy-links.json');
const PORT = 8353;       // own static server — never touch :8000/:8080
const CDP_PORT = 23120;   // own headless Chrome debug port

// current committed SDK build (the pre-feature decoder/encoder + referee)
const sdk = (m) => import(path.join(webDir, 'dist', 'pool-sdk', m));
const { decodeShare, encodeShare } = await sdk('share.js');
const { judgeShot, deriveOnTable } = await sdk('rules/nineball.js');

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Hand-build a legacy share string from a raw wire tuple, the encoder's
 * way (deflate-raw + base64url) — encodeShare only writes the current
 * version, so v1/v2 wires are built here (share.test.ts precedent). */
async function encodeWire(wire) {
  const cs = new CompressionStream('deflate-raw');
  const deflated = new Uint8Array(await new Response(
    new Blob([new TextEncoder().encode(JSON.stringify(wire))]).stream()
      .pipeThrough(cs)).arrayBuffer());
  return Buffer.from(deflated).toString('base64url');
}

const LEGACY_TABLE = 'wpa_generic_9ft'; // frozen v1/v2 replay fill (share.ts)
const DEFAULTS = {
  table_id: LEGACY_TABLE, cloth_id: 'simonis_860_tournament',
  ballset_id: 'aramith_pool', cue_id: 'standard',
  cushion_model_id: 'han2005_default',
};
const PRESET_TO_CUSHION = {
  default: 'han2005_default', realistic: 'stronge_realistic',
  'mathavan-fitted': 'mathavan_fitted', 'grip-fitted': 'grip_fitted',
};
const legacyEquipment = (preset, cloth = 'default') => ({
  ...DEFAULTS,
  cloth_id: cloth === 'default' ? DEFAULTS.cloth_id : cloth,
  cushion_model_id: PRESET_TO_CUSHION[preset],
});

/** Corpus plan: representative pre-feature games — every legacy wire
 * version, multiple presets/cloths, fouls + ball-in-hand placements, a
 * plain no-foul run, and a v3 full-equipment composition. Shots are
 * scripted; outcomes are whatever the kernel adjudicates (pinned, not
 * predicted). `place` applies only if the previous shot left BALL_IN_HAND. */
const PLAN = [
  {
    name: 'v1-realistic-foul-bih', formatV: 1, seed: 11,
    preset: 'realistic',
    steps: [
      { shot: { v0: 2.4, phi: 1.45, theta: 0, a: 0, b: 0 } },
      { shot: { v0: 0.22, phi: -2.2, theta: 0, a: 0, b: 0 } }, // designed foul
      { place: { x: 0.15, y: -0.5 },
        shot: { v0: 2.0, phi: 1.35, theta: 0, a: 0, b: -0.1 } },
    ],
  },
  {
    name: 'v1-default-two-shots', formatV: 1, seed: 5,
    preset: 'default',
    steps: [
      // straight full break: legal first contact, cushions, likely pots
      { shot: { v0: 5.5, phi: 1.5707963267948966, theta: 0, a: 0, b: 0 } },
      { shot: { v0: 1.4, phi: 1.9, theta: 0, a: 0.05, b: 0 } },
    ],
  },
  {
    name: 'v2-grip-worn-foul-bih', formatV: 2, seed: 21,
    preset: 'grip-fitted', cloth: 'worn_slow',
    steps: [
      { shot: { v0: 2.6, phi: 1.5, theta: 0, a: 0, b: 0 } },
      { shot: { v0: 0.2, phi: 0.6, theta: 0, a: 0, b: 0 } },  // designed foul
      { place: { x: -0.2, y: -0.45 },
        shot: { v0: 1.8, phi: 1.6, theta: 0, a: 0, b: 0 } },
    ],
  },
  {
    name: 'v2-mathavan-default-cloth', formatV: 2, seed: 33,
    preset: 'mathavan-fitted', cloth: 'default',
    steps: [
      // straight draw break: legal first contact under the Mathavan model
      { shot: { v0: 4.5, phi: 1.5707963267948966, theta: 0, a: 0, b: -0.2 } },
      { shot: { v0: 1.0, phi: 2.6, theta: 0, a: 0, b: 0.1 } },
    ],
  },
  {
    name: 'v3-full-equipment-foul-bih', formatV: 3, seed: 42,
    equipment: {
      table_id: 'diamond_proam_9ft', cloth_id: 'simonis_760_fast',
      ballset_id: 'aramith_pool_worn', cue_id: 'low_deflection',
      cushion_model_id: 'stronge_realistic',
    },
    steps: [
      { shot: { v0: 2.8, phi: 1.5, theta: 0, a: 0, b: 0 } },
      { shot: { v0: 0.2, phi: -0.4, theta: 0, a: 0, b: 0 } }, // designed foul
      { place: { x: 0.1, y: -0.55 },
        shot: { v0: 2.1, phi: 1.45, theta: 0, a: 0, b: 0 } },
    ],
  },
];

// ---- kernel-corpus mode (feature 012 T003 — Gate G-KERNEL old side) --------
// `node web/tools/gen-legacy-corpus.mjs --kernel-corpus` re-simulates every
// pinned legacy-corpus scenario (the exact scenario JSON bytes above) plus
// the committed break fixture on the CURRENT committed canonical wasm
// (web/dist/pool-wasm) — no Chrome, no server — and pins the EVENT-STREAM
// bytes (sha256 over JSON.stringify(record.events)) into
// web/tools/fixtures/kernel-corpus.json. It also archives the wasm binary +
// glue at web/tools/fixtures/pre012-wasm/ so the Gate G-KERNEL arm
// (`node web/tools/e2e-share.mjs --corpus`) can re-simulate the OLD side of
// the byte-identity diff forever (contracts/equipment-additions.md §4.3).
// MUST run — and its output be committed — BEFORE any crates/ edit.
if (process.argv.includes('--kernel-corpus')) {
  const { readFileSync, copyFileSync } = await import('node:fs');
  const { init } = await sdk('engine.js');
  const engine = await init(path.join(webDir, 'dist', 'pool-wasm', 'pool_wasm.js'));
  const corpus = JSON.parse(readFileSync(OUT, 'utf8'));
  const scenarios = [];
  for (const entry of corpus.entries) {
    entry.scenarios.forEach((scenario, i) => {
      scenarios.push({ name: `${entry.name}#${i}`, scenario });
    });
  }
  scenarios.push({
    name: 'pool-wasm-break-fixture',
    scenario: readFileSync(path.join(repoDir, 'crates', 'pool-wasm', 'tests',
      'fixtures', 'break_scenario.json'), 'utf8').trim(),
  });
  const pins = scenarios.map(({ name, scenario }) => {
    const out = engine.simulateJson(scenario);
    const record = JSON.parse(out);
    const events = JSON.stringify(record.events);
    console.log(`${name}: ${record.events.length} events, `
      + `events sha256 ${sha256(events).slice(0, 12)}…`);
    return {
      name,
      scenario_sha256: sha256(scenario),
      events_sha256: sha256(events),
      n_events: record.events.length,
    };
  });
  const commit = execSync('git rev-parse HEAD', { cwd: repoDir }).toString().trim();
  const outPath = path.join(webDir, 'tools', 'fixtures', 'kernel-corpus.json');
  writeFileSync(outPath, JSON.stringify({
    _readme: [
      'Gate G-KERNEL old-side capture (feature 012 T003, SC-003/FR-009).',
      `Event-stream byte pins of every legacy-links.json scenario + the`,
      'committed pool-wasm break fixture, re-simulated on the pre-012',
      `canonical wasm (${engine.version()}) at commit ${commit}.`,
      'events_sha256 = sha256 over JSON.stringify(record.events) — the',
      'ECMAScript-normalized event-stream serialization (version-free, so',
      'it must stay BYTE-IDENTICAL across the additive-only 012 kernel',
      'rebuild). The pre-012 wasm binary + glue are archived at',
      'web/tools/fixtures/pre012-wasm/ so e2e-share.mjs --corpus can',
      're-simulate the old side directly. DO NOT regenerate — this file is',
      'the oracle for the 012 determinism cascade.',
    ],
    captured_commit: commit,
    captured_at: new Date().toISOString(),
    kernel_version: engine.version(),
    scenarios: pins,
  }, null, 1));
  const archDir = path.join(webDir, 'tools', 'fixtures', 'pre012-wasm');
  mkdirSync(archDir, { recursive: true });
  for (const f of ['pool_wasm.js', 'pool_wasm_bg.wasm']) {
    copyFileSync(path.join(webDir, 'dist', 'pool-wasm', f),
      path.join(archDir, f));
  }
  console.log(`\nwrote ${outPath} (${pins.length} scenario pins)`);
  console.log(`archived pre-012 wasm at ${archDir}`);
  process.exit(0);
}

// ---- app plumbing ----------------------------------------------------------

const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?seed=1`, { port: CDP_PORT });

async function waitReady() {
  for (let i = 0; i < 200; i++) {
    if (await chrome.eval('window.__test?.ready === true')) return;
    await sleep(200);
  }
  throw new Error('app never became ready');
}

async function waitSettled(maxTicks = 300) {
  let s = 'PLAYBACK';
  for (let i = 0; i < maxTicks && (s === 'PLAYBACK' || s === 'SIMULATING'); i++) {
    await sleep(300);
    s = await chrome.eval('__test.state()');
  }
  if (s === 'PLAYBACK' || s === 'SIMULATING') throw new Error('shot never settled');
  return s;
}

/** Author one live session on `equipment`; returns { shots, placements,
 * records } from the app's own recorder (actual fired params/doubles). */
async function authorSession(entry, equipment) {
  await chrome.eval(
    `__settings.setTransientEquipment(${JSON.stringify(equipment)})`);
  await chrome.eval(`__test.rerack(${entry.seed})`);
  await sleep(400);
  const records = [];
  for (const step of entry.steps) {
    const state = await chrome.eval('__test.state()');
    if (state === 'WIN') break; // rack over — remaining steps are moot
    if (step.place && state === 'BALL_IN_HAND') {
      await chrome.eval(`__test.placeCue(${step.place.x}, ${step.place.y})`);
      await sleep(150);
    }
    const err = await chrome.eval(`__test.shoot(${JSON.stringify(step.shot)})`);
    if (err) throw new Error(`${entry.name}: shot rejected: ${err}`);
    await waitSettled();
    // read the log promptly: flow.js WIN auto re-rack (2.6 s) resets it
    records.length = 0;
    records.push(...await chrome.eval('__share.records()'));
  }
  const log = await chrome.eval('__share.log()');
  if (log.seed !== entry.seed) {
    throw new Error(`${entry.name}: recorder seed ${log.seed} != ${entry.seed}`);
  }
  const shots = records.map((j) => {
    const { v0, phi, theta, a, b } = JSON.parse(j).shot;
    return { v0, phi, theta, a, b };
  });
  return { shots, placements: log.placements, records };
}

/** Load a #r= link fresh and capture the replay: submitted scenario JSONs +
 * re-simulated records. `cap` busts same-document hash navigation. */
async function captureReplay(share, nShots, cap) {
  await chrome.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/app.html?obtool=1&cap=${cap}#r=${share}` });
  await waitReady();
  for (let i = 0; i < 600; i++) {
    const rep = await chrome.eval('window.__share ? __share.replay() : null');
    if (rep?.done) break;
    if (i === 599) throw new Error('replay never finished');
    await sleep(400);
  }
  const rep = await chrome.eval('__share.replay()');
  if (rep.n !== nShots) throw new Error(`replay advertises ${rep.n}, want ${nShots}`);
  const scenarios = await chrome.eval('__test.scenarios()');
  const records = await chrome.eval('__share.records()');
  if (records.length !== nShots || scenarios.length !== nShots) {
    throw new Error(`captured ${records.length} records / ${scenarios.length} ` +
      `scenarios, want ${nShots}`);
  }
  return { scenarios, records };
}

// ---- main -------------------------------------------------------------------

try {
  await waitReady();
  await sleep(800);
  await chrome.eval(`__settings.set('soundOn', false)`);
  const kernelVersion = await chrome.eval(
    `import('/dist/pool-wasm/pool_wasm.js').then((m) => m.kernel_version())`);
  console.log(`kernel: ${kernelVersion}`);

  const entries = [];
  let cap = 0;
  for (const entry of PLAN) {
    const equipment = entry.formatV === 3
      ? entry.equipment : legacyEquipment(entry.preset, entry.cloth);
    console.log(`\n=== ${entry.name} (authoring) ===`);
    const authored = await authorSession(entry, equipment);
    console.log(`  authored ${authored.shots.length} shots, ` +
      `${Object.keys(authored.placements).length} placements`);

    // wire the link
    let share;
    if (entry.formatV === 1) {
      share = await encodeWire([1, kernelVersion, 'nine', entry.seed,
        entry.preset,
        authored.shots.map((s) => [s.v0, s.phi, s.theta, s.a, s.b]),
        Object.entries(authored.placements).map(([i, p]) => [+i, p.x, p.y])]);
    } else if (entry.formatV === 2) {
      share = await encodeWire([2, kernelVersion, 'nine', entry.seed,
        entry.preset, entry.cloth,
        authored.shots.map((s) => [s.v0, s.phi, s.theta, s.a, s.b]),
        Object.entries(authored.placements).map(([i, p]) => [+i, p.x, p.y])]);
    } else {
      share = await encodeShare({
        kernelVersion, formatV: 3, rackKind: 'nine', seed: entry.seed,
        equipment, shots: authored.shots, placements: authored.placements,
      });
    }

    // pre-feature decoder truth (G1 baseline)
    const decoded = await decodeShare(share);
    if (JSON.stringify(decoded.equipment) !== JSON.stringify(equipment)) {
      throw new Error(`${entry.name}: decoded equipment != authored equipment`);
    }

    console.log(`=== ${entry.name} (replay capture) ===`);
    const captured = await captureReplay(share, authored.shots.length, cap++);
    captured.records.forEach((r, i) => {
      if (r !== authored.records[i]) {
        throw new Error(`${entry.name}: replay record ${i} diverged from ` +
          'the authored session (byte mismatch)');
      }
    });

    // adjudications: flow.js's exact call shape, per record in order
    const adjudications = captured.records.map((j) => {
      const record = JSON.parse(j);
      return judgeShot({ onTable: deriveOnTable(record) }, record);
    });
    const fouls = adjudications.flatMap((a) => a.fouls);
    console.log(`  records ok; fouls across game: [${fouls.join(', ')}]`);

    entries.push({
      name: entry.name,
      formatV: entry.formatV,
      share,
      decoded,
      scenarios: captured.scenarios,
      record_sha256: captured.records.map(sha256),
      adjudications,
    });
  }

  const nFouls = entries.flatMap((e) => e.adjudications.flatMap((a) => a.fouls));
  const nPlaced = entries.filter(
    (e) => Object.keys(e.decoded.placements).length > 0);
  if (nFouls.length === 0) throw new Error('corpus has no fouls — not representative');
  if (nPlaced.length === 0) throw new Error('corpus has no BIH placements');

  const commit = execSync('git rev-parse HEAD', { cwd: repoDir }).toString().trim();
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    _readme: [
      'Pre-feature legacy share-link corpus (feature 011 T002, SC-003 oracle).',
      `Captured on commit ${commit} from the then-committed web/dist/pool-sdk`,
      `(SHARE_FORMAT_VERSION 3) + canonical wasm (${kernelVersion}) by`,
      'web/tools/gen-legacy-corpus.mjs — BEFORE any share-codec edit.',
      'PINNED: share = the legacy v1/v2/v3 string; decoded = the pre-feature',
      'decoder output (codec-v4 G1: new decoder must match + game:nine_ball,',
      'calls:[]); scenarios = the exact scenario JSON bytes the app submitted',
      'during replay; record_sha256 = sha256 of each re-simulated ShotRecord',
      'JSON (G2: byte-identity on the same canonical wasm); adjudications =',
      'judgeShot per record, flow.js call shape (pre-feature verdicts).',
      'DO NOT regenerate after the codec changes — this file is the oracle.',
    ],
    captured_commit: commit,
    captured_at: new Date().toISOString(),
    kernel_version: kernelVersion,
    share_format_version_at_capture: 3,
    entries,
  }, null, 1));
  console.log(`\nwrote ${OUT} (${entries.length} entries)`);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
