#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// analyze-bugreport.mjs — triage analyzer for the feature-025 diagnostic
// bundle (`openbilliards-bugreport-<timestamp>.json`, schema v3 — authority:
// feature 025 (internal spec) incl. Amendment v2; playbook:
// the bug-report triage guide, internal). Zero npm deps, node >= 22.
//
//   node tools/analyze-bugreport.mjs <bundle.json>
//       human summary: versions (+ SAME/DIFFERENT verdict vs the committed
//       dist wasm stamp), app/platform, errors verbatim, judgment ledger
//       table (judgeError rows flagged loudly), per-scenario one-liners,
//       ball state incl. min pairwise surface gap (the #44 overlap class),
//       replay_url gate prediction.
//   node tools/analyze-bugreport.mjs <bundle.json> --extract-scenario N [--out f.json]
//       write scenarios[N] VERBATIM (already a self-contained
//       {system, shot, options} scenario) — ready for:
//       cargo +stable run -q -p pool-cli -- run --scenario f.json --out rec.json --events
//   node tools/analyze-bugreport.mjs <bundle.json> --verify
//       re-simulate every scenario on the COMMITTED canonical wasm
//       (web/dist/pool-wasm — constitution P-III) and print per-shot
//       ok/error + event count + duration.
//
// Hygiene: the bundle is UNTRUSTED data — parsed with JSON.parse only, never
// eval'd, never dynamically imported, file read capped at 64 MB, and every
// bundle-derived string is control-char-escaped before printing (a hostile
// bundle must not repaint/spoof the analyst's terminal via ANSI/OSC escapes).
// Every section may legitimately be {error: "..."}, null (hand-redacted), or
// absent (the FR-003 best-effort law: a half-broken bundle is the NORMAL
// case) — degradations are reported, never crashed on. Exit is non-zero ONLY
// for unusable input (missing/oversized/unparseable file, wrong top-level
// type, bad flag, unwritable --out path).
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SIZE_CAP = 64 * 1024 * 1024; // untrusted input: refuse absurd files
const EPS_KISS = 1e-6;             // kernel Eps::KISS [m] (consts.rs)
const DEFAULT_R = 0.028575;        // BallParams::default r [m]
// the CI dist-freshness regex (.github/workflows/ci.yml: grep -aoE over the
// committed wasm binary) — the embedded KERNEL_VERSION build stamp
const STAMP_RE = /[0-9]+\.[0-9]+\.[0-9]+\+[0-9a-f]+(?:-dirty)?/;
const WASM_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist', 'pool-wasm');

const die = (msg) => { console.error('analyze-bugreport: ' + msg); process.exit(2); };

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
let bundlePath = null;
let extractN = null;
let outPath = null;
let verify = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--extract-scenario') {
    extractN = Number(argv[++i]);
    if (!Number.isInteger(extractN) || extractN < 0) die('--extract-scenario needs a non-negative integer index');
  } else if (a === '--out') {
    outPath = argv[++i];
    if (outPath === undefined) die('--out needs a file path');
  } else if (a === '--verify') {
    verify = true;
  } else if (a.startsWith('--')) {
    die(`unknown flag ${a}`);
  } else if (bundlePath === null) {
    bundlePath = a;
  } else {
    die(`unexpected argument ${a}`);
  }
}
if (bundlePath === null) {
  die('usage: node tools/analyze-bugreport.mjs <bundle.json> '
    + '[--extract-scenario N [--out f.json]] [--verify]');
}
if (extractN !== null && verify) {
  die('--extract-scenario and --verify are mutually exclusive (extraction'
    + ' writes one scenario and exits — the verify pass would be silently'
    + ' skipped); run them as two invocations');
}

// ---- load (untrusted; hard exits ONLY here) ----------------------------------
let bundle;
try {
  const size = statSync(bundlePath).size;
  if (size > SIZE_CAP) die(`${bundlePath} is ${size} bytes (> ${SIZE_CAP} cap) — not a bundle`);
  bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
} catch (e) {
  die(`cannot read/parse ${bundlePath}: ${e.message ?? e}`);
}
if (bundle === null || typeof bundle !== 'object' || Array.isArray(bundle)) {
  die(`${bundlePath}: top level is not a JSON object (a bundle is one {} document)`);
}

// ---- tolerant accessors -------------------------------------------------------
/** Untrusted-string print hygiene: visibly escape EVERY control char (C0 incl.
 * \n/\t, DEL, and the C1 range JSON.stringify leaves raw) so a hostile bundle
 * cannot repaint/spoof the analyst's terminal via ANSI/OSC escapes or inject
 * fake analyzer lines via embedded newlines. */
const clean = (v) => String(v).replace(/[\u0000-\u001f\u007f-\u009f]/g,
  (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
/** FR-003 degradation shape: a failed section is exactly {error: string}. */
const secError = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v)
  && typeof v.error === 'string' ? v.error : null);
const show = (v) => {
  if (v === undefined) return '<absent>';
  const err = secError(v);
  return clean(err !== null ? `{error: ${JSON.stringify(err)}}`
    : typeof v === 'string' ? v : JSON.stringify(v));
};
const num = (v, digits = 3) => (typeof v === 'number' && Number.isFinite(v)
  ? v.toFixed(digits) : clean(String(v)));

/** Committed dist stamp, read the CI way (grep the wasm bytes). */
function distStamp() {
  try {
    const bytes = readFileSync(path.join(WASM_DIR, 'pool_wasm_bg.wasm'));
    return bytes.toString('latin1').match(STAMP_RE)?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Parse one scenario-log entry (an exact scenario JSON string). */
function parseScenario(s) {
  if (typeof s !== 'string') return null;
  try {
    const sc = JSON.parse(s);
    return sc !== null && typeof sc === 'object' ? sc : null;
  } catch {
    return null;
  }
}

// ---- --extract-scenario -------------------------------------------------------
if (extractN !== null) {
  const scenarios = bundle.scenarios;
  if (!Array.isArray(scenarios)) {
    die(`scenarios section is not an array (${show(scenarios)}) — nothing to extract`);
  }
  const s = scenarios[extractN];
  if (typeof s !== 'string') {
    die(`scenarios[${extractN}] is ${s === undefined
      ? `absent (${scenarios.length} entries)` : 'not a string'} — cannot extract`);
  }
  const out = outPath ?? `bugreport-scenario-${extractN}.json`;
  try {
    writeFileSync(out, s); // VERBATIM — the exact bytes submitted to simulate
  } catch (e) {
    die(`cannot write ${out}: ${e.message ?? e}`);
  }
  console.log(`wrote scenarios[${extractN}] verbatim (${Buffer.byteLength(s)} bytes) -> ${out}`);
  console.log('reproduce with:');
  console.log(`  cargo +stable run -q -p pool-cli -- run --scenario ${out} --out rec.json --events`);
  process.exit(0);
}

// ---- --verify -----------------------------------------------------------------
if (verify) {
  const scenarios = bundle.scenarios;
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    die(`scenarios section is ${show(scenarios)} — nothing to verify`);
  }
  // committed canonical wasm, loaded the way the SDK boots it in node
  // (sdk/ts engine.ts init: import the glue, feed it the sibling .wasm
  // bytes through the default-export initializer, then call the exports)
  let glue;
  try {
    glue = await import(pathToFileURL(path.join(WASM_DIR, 'pool_wasm.js')).href);
    await glue.default({
      module_or_path: readFileSync(path.join(WASM_DIR, 'pool_wasm_bg.wasm')),
    });
  } catch (e) {
    die(`cannot load the committed wasm from ${WASM_DIR}: ${e.message ?? e}`);
  }
  const wasmV = String(glue.kernel_version());
  console.log(`verify: committed wasm ${wasmV}`);
  if (bundle.kernel_version !== wasmV) {
    console.log(`CAVEAT: bundle kernel_version ${show(bundle.kernel_version)} != committed`
      + ` wasm ${wasmV} — running anyway; event-stream DIVERGENCE IS EXPECTED`
      + ' and byte-determinism claims are void (constitution P-III).');
  }
  let ok = 0;
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    if (typeof s !== 'string') {
      console.log(`  #${i}: SKIP — entry is not a scenario JSON string (${show(s)})`);
      continue;
    }
    const t0 = performance.now();
    let outJson = null;
    let err = null;
    try {
      outJson = glue.simulate_json(s);
    } catch (e) {
      err = e.message ?? String(e);
    }
    const wall = (performance.now() - t0).toFixed(1);
    if (err === null && typeof outJson === 'string') {
      // kernel rejection payload is exactly {"error": "..."} (pool-wasm
      // error_json); a ShotRecord starts with {"kernel_version"
      try {
        const rec = JSON.parse(outJson);
        if (typeof rec.error === 'string') err = rec.error;
        else {
          const events = Array.isArray(rec.events) ? rec.events : [];
          const dur = events.length ? events[events.length - 1].t : 0;
          console.log(`  #${i}: ok — ${events.length} events, `
            + `${num(dur)} s simulated (${wall} ms wall)`);
          ok += 1;
        }
      } catch (e) {
        err = `record unparseable: ${e.message ?? e}`;
      }
    }
    if (err !== null) console.log(`  #${i}: ERROR — ${clean(err)} (${wall} ms wall)`);
  }
  console.log(`verify: ${ok}/${scenarios.length} scenarios simulated cleanly`);
  process.exit(0);
}

// ---- default: human summary ----------------------------------------------------
const stamp = distStamp();
console.log(`== bundle: ${bundlePath}`);
console.log(`   generated_at: ${show(bundle.generated_at)}`);

console.log('\n-- versions');
console.log(`   bundle_version: ${show(bundle.bundle_version)}`
  + (bundle.bundle_version === 3 ? '' : '  (schema v3 is current — see spec Amendment v3)'));
console.log(`   kernel_version: ${show(bundle.kernel_version)}`);
console.log(`   rules_version:  ${show(bundle.rules_version)}`);
// v3 (spec Amendment v3): the storage quota-degrade ledger — a session
// whose persists were failing is a DIFFERENT diagnosis (stale settings
// blob served all session) and must never read like a healthy one.
if (bundle.bundle_version >= 3 && bundle.storage === undefined) {
  // v3 REQUIRES the section (spec Amendment v3 closed list) — its absence
  // is itself a finding, never silence (GH-557 review r3 P2)
  console.log('   storage:        MISSING (required at v3) — no storage verdict');
} else if (bundle.storage !== undefined) {
  const st = bundle.storage;
  if (typeof st?.error === 'string') {
    console.log(`   storage:        {error: ${show(st.error)}} (section failed best-effort)`);
  } else if (typeof st?.persistFailed !== 'number'
    || !(st.firstKey === null || typeof st.firstKey === 'string')) {
    // FULL shape validated before any healthy verdict (GH-557 review r2+r3
    // P2s): a null/redacted/partial section must never read as a clean
    // session — stale settings are exactly what this field diagnoses
    console.log(`   storage:        MALFORMED/redacted section (${show(st)}) — `
      + 'no storage verdict');
  } else if (st.persistFailed > 0) {
    console.log(`   storage:        QUOTA-DEGRADED — ${st.persistFailed} failed persist(s), `
      + `first key ${show(st.firstKey)} (settings/shell state in this bundle may be STALE)`);
  } else {
    console.log('   storage:        healthy (0 failed persists)');
  }
}
console.log(`   committed dist stamp: ${stamp ?? '<unreadable — run from a repo checkout>'}`);
if (stamp === null || typeof bundle.kernel_version !== 'string') {
  console.log('   verdict: UNKNOWN — cannot compare kernel_version to the dist stamp');
} else if (bundle.kernel_version === stamp) {
  console.log('   verdict: SAME — byte-determinism claims are valid on this checkout'
    + ' (strict replay + pool-cli/--verify re-simulation are faithful)');
} else {
  console.log('   verdict: DIFFERENT — bundle came from another kernel build;'
    + ' byte-determinism claims are VOID here (re-simulation may diverge;'
    + ' replay link needs view-anyway)');
}

console.log('\n-- app');
const app = bundle.app;
// null-check FIRST: typeof null === 'object' (hand-redacted bundles carry
// null sections; the collector itself only ever emits values or {error})
if (app === null || app === undefined || typeof app !== 'object' || secError(app) !== null) {
  console.log(`   ${show(app)}`);
} else {
  // mode lives ONLY in the raw settings blob (bundle.settings is the raw
  // localStorage['ob-settings-v1'] string — byte truth, never re-parsed at
  // capture time); parse it here, best-effort
  let mode = '<unknown>';
  const rawSettings = bundle.settings;
  if (typeof rawSettings === 'string') {
    try { mode = JSON.parse(rawSettings)?.mode ?? '<unset (defaults to play)>'; }
    catch { mode = '<settings blob unparseable>'; }
  } else if (rawSettings === null) {
    mode = '<virgin profile (defaults to play)>';
  } else {
    mode = `<settings section ${show(rawSettings)}>`;
  }
  // match_state: the machine state at capture (a WIN hold, a PLAYBACK capture)
  console.log(`   game=${show(app.game)} mode=${clean(mode)} match_state=${show(bundle.match_state)}`
    + ` seed=${show(app.seed)}`
    + ` shotIndex=${show(app.shotIndex)} locale=${show(app.locale)}`
    + ` scripted=${show(app.scripted)} look=${show(app.look === 'sp' ? 'tournament' : app.look)}`
    + (app.look === 'sp' ? ' (recorded under the legacy look id sp, GH-973)' : ''));
  if (mode === 'playground') {
    console.log('   NOTE: playground mode — judgment is SUPPRESSED by design'
      + ' (flow.js issue #68): judgments rows for sandbox shots are absent,'
      + ' physics history in scenarios is still complete.');
  }
}
const plat = bundle.platform;
if (plat === null || plat === undefined || typeof plat !== 'object' || secError(plat) !== null) {
  console.log(`   platform: ${show(plat)}`);
} else {
  console.log(`   platform: dpr=${show(plat.devicePixelRatio)}`
    + ` viewport=${show(plat.viewport)}`);
  console.log(`   userAgent: ${show(plat.userAgent)}`);
}

console.log('\n-- errors');
const errors = bundle.errors;
if (!Array.isArray(errors)) {
  console.log(`   ${show(errors)}`);
} else if (errors.length === 0) {
  console.log('   0 entries');
} else {
  console.log(`   ${errors.length} entries (verbatim, control chars escaped):`);
  errors.forEach((e, i) => console.log(`   [${i}] ${clean(typeof e === 'string' ? e : JSON.stringify(e))}`));
}

console.log('\n-- judgments (per-shot verdict ledger, ring cap 128)');
const judgments = bundle.judgments;
if (!Array.isArray(judgments)) {
  console.log(`   ${show(judgments)}`);
} else if (judgments.length === 0) {
  console.log('   0 rows (fresh boot, playground session, or pre-v2 bundle)');
} else {
  let legal = 0;
  let fouled = 0;
  let crashed = 0;
  const cols = ['rack', 'seed', 'shot', 'shooter', 'legal', 'fouls',
    'pocketed', 'ballInHand', 'terminal'];
  const rows = judgments.map((j) => {
    if (j === null || typeof j !== 'object') { crashed += 1; return { crash: clean(String(j)) }; }
    if (typeof j.judgeError === 'string') {
      crashed += 1;
      return { crash: `rack=${show(j.rack)} seed=${show(j.seed)} shot=${show(j.shot)}`
        + ` judgeError=${clean(JSON.stringify(j.judgeError))}` };
    }
    if (j.legal === true) legal += 1; else fouled += 1;
    // legacy 9-ball rows carry gameOver (bool) instead of terminal (obj|null)
    const terminal = 'terminal' in j ? j.terminal
      : 'gameOver' in j ? (j.gameOver ? { gameOver: true } : null) : undefined;
    return Object.fromEntries(cols.map((c) => [c,
      c === 'terminal' ? clean(terminal ? JSON.stringify(terminal) : String(terminal))
        : Array.isArray(j[c]) ? (j[c].length ? clean(j[c].join('+')) : '-')
          : show(j[c])]));
  });
  const width = Object.fromEntries(cols.map((c) => [c,
    Math.max(c.length, ...rows.map((r) => (r.crash ? 0 : r[c].length)))]));
  console.log('   ' + cols.map((c) => c.padEnd(width[c])).join('  '));
  for (const r of rows) {
    if (r.crash) console.log(`   !! JUDGE ERROR !!  ${r.crash}`);
    else console.log('   ' + cols.map((c) => r[c].padEnd(width[c])).join('  '));
  }
  console.log(`   totals: ${judgments.length} rows — ${legal} legal, ${fouled} fouls`
    + (crashed ? `, ${crashed} JUDGE-ERROR ROWS` : ''));
  if (crashed > 0) {
    console.log(`   !! ${crashed} judgeError row(s): the rules engine CRASHED on those`
      + ' shots (the #44 swallow-point class) — extract the matching scenario'
      + ' (--extract-scenario) and reproduce via pool-cli; fix lands in'
      + ' crates/pool-rules with a corpus pin.');
  }
}

console.log('\n-- scenarios (exact per-shot kernel inputs, ring cap 128)');
const scenarios = bundle.scenarios;
if (!Array.isArray(scenarios)) {
  console.log(`   ${show(scenarios)}`);
} else if (scenarios.length === 0) {
  console.log('   0 entries (no shot fired since the page loaded; the ring spans re-racks and game switches)');
} else {
  console.log(`   ${scenarios.length} entries:`);
  scenarios.forEach((s, i) => {
    const sc = parseScenario(s);
    if (sc === null) {
      console.log(`   #${i}: UNPARSEABLE entry (${typeof s === 'string'
        ? Buffer.byteLength(s) + ' bytes' : typeof s})`);
      return;
    }
    const shot = sc.shot ?? {};
    const balls = Array.isArray(sc.system?.balls) ? sc.system.balls.length : '?';
    console.log(`   #${i}: v0=${num(shot.v0, 2)} phi=${num(shot.phi, 4)}`
      + ` theta=${num(shot.theta, 2)} a=${num(shot.a, 2)} b=${num(shot.b, 2)}`
      + ` seed=${show(shot.seed)} balls=${balls} bytes=${Buffer.byteLength(s)}`);
  });
}

console.log('\n-- balls (rendered state at capture time)');
const balls = bundle.balls;
if (!Array.isArray(balls)) {
  console.log(`   ${show(balls)}`);
} else if (balls.length === 0) {
  console.log('   0 entries');
} else {
  const pocketed = balls.filter((b) => b?.pocketed === true).map((b) => b.id);
  const usablePos = (b) => Array.isArray(b.pos) && b.pos.length === 3
    && b.pos.every((x) => typeof x === 'number' && Number.isFinite(x));
  const onTable = balls.filter((b) => b?.pocketed === false && usablePos(b));
  const corruptPos = balls.filter((b) => b?.pocketed === false && !usablePos(b)).length;
  console.log(`   ${onTable.length} on table, pocketed: `
    + (pocketed.length ? `[${clean(pocketed.join(', '))}]` : 'none'));
  if (corruptPos > 0) {
    console.log(`   (${corruptPos} on-table entr${corruptPos === 1 ? 'y' : 'ies'}`
      + ' with non-finite/malformed pos excluded from the gap scan)');
  }
  // radii: the ball set ON THE TABLE at capture time (GH-1055). The scenario
  // ring never resets — it spans re-racks and game switches (game.js
  // scenarioLog) — so its last entry can be ANOTHER rack's kernel input
  // (pool ids 0-15 also exist in snooker and carom), and in PLAYBACK the
  // archive player can show another game's session than app.game. A ball's
  // rendered centre height pos[1] on the cloth IS its radius (the kernel's
  // resting z). At rest every ball's own height counts. In PLAYBACK, or with
  // no match_state, a ball may be in the air or dropping into a pocket, so
  // the rack's radius is the height most on-table balls share. The last
  // scenario's params.r is used only when it covers every on-table id and
  // agrees with those heights, or, at rest with no usable height, with the
  // game's catalog ballset. In PLAYBACK app.game need not name the displayed
  // rack, so a scenario that no height can judge stays and is marked
  // unconfirmed. Otherwise per ball: a ball-entry r if a future schema
  // carries one, the height, else the DISCIPLINE-AWARE catalog fallback —
  // snooker (52.5 mm) and carom (61.5 mm) sets differ from the pool default
  // by enough (±2-3 mm/ball) to both false-fire and false-clear the #44
  // verdict (catalog.rs ballsets; game ids per the SDK game catalog).
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const GAME_R = new Map([['snooker', 0.02625], ['carom_3cushion', 0.03075]]);
  let gameId = (app !== null && typeof app === 'object'
    && typeof app.game === 'string') ? app.game : null;
  if (gameId === null && typeof bundle.settings === 'string') {
    try {
      const g = JSON.parse(bundle.settings)?.game;
      if (typeof g === 'string') gameId = g;
    } catch { /* settings blob unparseable — keep the pool default */ }
  }
  const fallbackR = GAME_R.get(gameId) ?? DEFAULT_R;
  // every machine state but PLAYBACK leaves the meshes at rest (state.js STATES)
  const matchState = typeof bundle.match_state === 'string' ? bundle.match_state : null;
  const atRest = matchState !== null && matchState !== 'PLAYBACK';
  const plausible = (h) => h > 0.005 && h < 0.1;
  const shared = new Map(); // height to the µm -> { n, h }
  for (const b of onTable) {
    if (!plausible(b.pos[1])) continue;
    const k = Math.round(b.pos[1] * 1e6);
    const s = shared.get(k) ?? { n: 0, h: b.pos[1] };
    s.n += 1;
    shared.set(k, s);
  }
  let commonH = null;
  for (const s of shared.values()) if (s.n >= 2 && s.n * 2 > onTable.length) commonH = s.h;
  const heightOf = (b) => (atRest ? (plausible(b.pos[1]) ? b.pos[1] : null) : commonH);
  const heightName = atRest ? 'resting height' : "the rack's common height";
  const anyHeight = onTable.some((b) => heightOf(b) !== null);
  // the live game's catalog judges a rack only at rest: in PLAYBACK the
  // archive player may show another game's session (a sparse one can leave
  // no common height), and app.game names the live game
  const catalogJudges = atRest && gameId !== null && !anyHeight;
  let lastSc = null;
  let lastIdx = -1;
  const scList = Array.isArray(scenarios) ? scenarios : [];
  for (let i = scList.length - 1; i >= 0; i--) {
    const sc = parseScenario(scList[i]);
    if (sc !== null && Array.isArray(sc.system?.balls)) { lastSc = sc; lastIdx = i; break; }
  }
  const scR = new Map();
  for (const b of lastSc?.system.balls ?? []) {
    if (finite(b?.params?.r)) scR.set(b.id, b.params.r);
  }
  // why the last scenario is NOT this rack's (null = it is)
  let foreign = null;
  if (lastSc !== null) {
    const missing = onTable.filter((b) => !scR.has(b.id)).map((b) => b.id);
    const off = onTable.find((b) => scR.has(b.id) && heightOf(b) !== null
      && Math.abs(heightOf(b) - scR.get(b.id)) > EPS_KISS);
    const offCatalog = catalogJudges
      ? onTable.find((b) => scR.has(b.id) && Math.abs(scR.get(b.id) - fallbackR) > EPS_KISS) : undefined;
    if (missing.length) {
      foreign = `no params for on-table id(s) ${clean(missing.join(', '))}`;
    } else if (off !== undefined) {
      foreign = `params.r ${scR.get(off.id)} m vs ${heightName} ${heightOf(off)} m (ball ${clean(off.id)})`;
    } else if (offCatalog !== undefined) {
      foreign = `params.r ${scR.get(offCatalog.id)} m vs the '${clean(gameId)}' catalog`
        + ` ballset ${fallbackR} m (ball ${clean(offCatalog.id)})`;
    }
  }
  const useSc = lastSc !== null && foreign === null;
  let assumed = false;
  let rested = false;
  const rOf = (b) => {
    if (finite(b.r)) return b.r;
    if (useSc) return scR.get(b.id);
    const h = heightOf(b);
    if (h !== null) { rested = true; return h; }
    assumed = true;
    return fallbackR;
  };
  let minGap = null;
  let skippedPairs = 0;
  for (let i = 0; i < onTable.length; i++) {
    for (let j = i + 1; j < onTable.length; j++) {
      const a = onTable[i];
      const b = onTable[j];
      const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
      const gap = d - rOf(a) - rOf(b);
      // a single NaN pair must not pin the scan (NaN comparisons are all
      // false — it would silently disable the #44 detector below)
      if (!Number.isFinite(gap)) { skippedPairs += 1; continue; }
      if (minGap === null || gap < minGap.gap) minGap = { gap, a: a.id, b: b.id };
    }
  }
  if (skippedPairs > 0) {
    console.log(`   (${skippedPairs} pair${skippedPairs === 1 ? '' : 's'}`
      + ' with non-finite gap skipped)');
  }
  if (minGap === null) {
    console.log('   min pairwise surface gap: n/a (< 2 usable on-table balls)');
  } else {
    console.log(`   min pairwise surface gap: ${minGap.gap.toExponential(3)} m`
      + ` (balls ${clean(minGap.a)}/${clean(minGap.b)})`);
    const notUsed = lastSc === null ? 'no parseable scenario params in this bundle'
      : `scenario #${lastIdx} is another rack's (${foreign})`;
    if (useSc) {
      console.log(`   radii: scenario #${lastIdx} params (${anyHeight || catalogJudges
        ? 'it matches the rack on the table'
        : `unconfirmed: no usable ball height (match_state ${matchState === null ? 'unknown' : clean(matchState)}),`
          + ' and app.game need not name the rack a PLAYBACK capture shows'})`);
    } else if (rested) {
      console.log(`   radii: ${atRest ? 'resting heights pos[1]' : `the rack's common height pos[1] = ${commonH} m`}`
        + ` (match_state ${matchState === null ? 'unknown' : clean(matchState)}) — ${notUsed}`);
    }
    if (assumed) {
      console.log(`   CAVEAT: some radii ASSUMED ${fallbackR} m — `
        + (GAME_R.has(gameId) ? `the '${clean(gameId)}' catalog ballset`
          : 'the pool catalog default'
            + (gameId !== null ? ` (game '${clean(gameId)}')` : ' (game unknown)'))
        + `; ${notUsed} and no usable ball height (match_state `
        + `${matchState === null ? 'unknown' : clean(matchState)}), so the gap verdict is approximate.`);
    }
    if (minGap.gap < -EPS_KISS) {
      console.log(`   !! WARNING: gap < -Eps::KISS (-1e-6 m) — resting overlap, the`
        + ` #44 validator-rejection class: the next submission fails with`
        + ` 'balls ${clean(minGap.a)}/${clean(minGap.b)} overlap'. See`
        + ' the rest-projection compat note (internal) + issue #67.');
    }
  }
}

console.log('\n-- replay_url');
const replay = bundle.replay_url;
if (typeof replay === 'string' && replay.length > 0) {
  console.log(`   present (${replay.length} chars) — OPAQUE here, open it in the app.`);
  if (stamp !== null && bundle.kernel_version === stamp) {
    console.log('   kernel gate prediction: SAME version -> strict replay OK (faithful');
    console.log('   byte re-simulation of the whole recorded game — the share log');
    console.log('   survives rulebook re-racks, so this can span multiple racks).');
  } else {
    console.log('   kernel gate prediction: version DIFFERENT/unknown -> the app will');
    console.log('   offer view-anyway (re-simulates on the CURRENT kernel; divergence');
    console.log('   possible — not byte-faithful).');
  }
} else {
  console.log(`   ${show(replay)}`
    + (secError(replay) !== null ? '  (fresh boots legitimately carry the'
      + ' share.noShots error — see spec US2)' : ''));
}
console.log('');
