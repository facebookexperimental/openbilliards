// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-lighting-matrix.mjs — GH-975 lighting matrix gate: every user table x every fixture setting (auto + the five
// explicit ids) x brightness, each cell a FRESH real-user boot in one pinned state (lib/lighting-matrix.mjs), judged
// against the table's reference rig: the canopy at the same brightness (the #117 canopy-truth law), and on the 12-ft
// snooker table its approved photo-fit default. The ranges and their sources are recorded in the GH-975 evidence.
//
// Legs (default: both):
//   factory  b {0.6, 1.0, 1.4}, factory cloth (what the player sees; the gains are solved per table on it):
//            N1  |centre / reference at the same b - 1| <= 5 % at 1.0, <= 10 % at 0.6 / 1.4
//            N3  bed clipping (any channel >= 250): 0 at b <= 1.0, <= 0.5 % at 1.4
//            N4  bed crushing (max channel <= 12): 0
//            N5  overhead corner/centre >= min(0.35, 0.85 x the reference rig's)
//            N8  overhead cushion strip / open bed in [min(0.6, 0.85 x the reference rig's), 1.07]
//            (N5/N8 not judged on the table's own venue rig)
//   neutral  b 1.0, neutral cloth (steel_gray): the cloth-colour override's residual, judged only against 20 %
//   every cell N9 (state integrity): live rect intensities == __lighting.profile(), hall closed, exposure 0.85, the
//            env tail settled, and GI honesty: uGiOn == the served gi-manifest's committed bake for the rig, the bake
//            class and the look (a dropped bake stays off, every committed one still binds)
//            C1 (GH-996, card 45): the cue-ball clip cams.player.ballClip <= the owner's bar for the table's class at b
//            (web/tools/fixtures/lighting-census-bars.json: 0.07 / 0.10 at b <= 1 / 1.4, snooker 0.09 / 0.15), and the
//            row's disc pixel count == the fixture's (the bars are pixel-derived); a missing read or bar fails by name
//   env arms (one fresh pool canopy boot): E1 one more bake moves no env-cube face > 3 % (GH-971: the cube is at its
//   fixed point after the boot tail); E2 a bake under a camera-script overhead pose (canopy hidden) moves no face
//   > 3 % (GH-972: the bake still photographs the lamp). A cube read the readback never wrote, or with a non-finite
//   or non-positive face, FAILS by name before the tolerance (review r3 P2: six zeros / six zeros passed as NaN); so
//   does a bake whose tail FAILED (review r4: an aborted tail reads left 0 and is never "drained")
//   live-switch arm (one boot, an explicit pendant then auto, switched across footprints and between same-footprint
//   tables): live rect intensities == the destination's profile AND a fresh entry of the destination (an empty or
//   non-finite emitter list on either side is a named failure, never "equal"; a switch whose env tail failed FAILS)
//   every cell also records the env tail census after its measurement (the judge's N9: a tail that failed while the
//   cell was measured is a named failure)
//   every cell drains the snooker occlusion transport (window.__snkOccl.flush(), GH-1131) before the settle. At each
//   camera's render, N9 then requires 0 pending traces. A missing seam, a flush that threw, or a missing census fails
//   by name. The census also records the rendered aOccl readers without the attribute; some read the (0, 0) default by
//   design.
// Every read passes lib/lighting-guard.mjs before a tolerance applies. A cell whose pinned state does not match
// REFUSES (STATE MISMATCH): the run then exits 2 (unjudgeable), never 0; so does a run that judged no cell.
// An instrument error in a worker prints ONE named line and exits 2, no cell retried (#1221): a CDP protocol-error reply
// to a command the worker does not tolerate (the navigations, the settings write, the measurement), a lost browser (its
// client poisoned, read after the boot and after the record step too), or any other throw while it launches, boots or
// measures. The polls and the single reads that record their own failure (the occlusion drain, the light census, the table
// id, the record step's env tail) keep their handling: a reply there is a refusal or a row field, judged as before.
//   MATRIX UNJUDGEABLE instrument error: worker <i> (cdp :<port>, chrome pid <pid>) cell <n>/<N> <leg> <table>
//   <fixture> b=<b>[ cloth=<c>], phase <launch|boot|measure|record>[ cam=<cam>], <k> row(s) done (rows: <file>):
//   [<request> -> ]<text>
// <request> is the CDP request a protocol-error reply answered (cdp.mjs cdpReplyDetail); <text> is the error's own,
// Chrome's verbatim for a reply.
//   node web/tools/e2e-lighting-matrix.mjs [--leg neutral|factory|both] [--tables a,b] [--fixtures auto,...]
//     [--b 0.6,1,1.4] [--workers 1|2] [--out <dir>] [--png] [--subset pr|full]
// Ports: OB_E2E_PORT / OB_E2E_CDP_PORT when pinned (CDP + 1 for the second worker), otherwise an own band.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, spawnStaticServer, stopStaticServer, claimPortBand, assertDerivedEndpoint } from './cdp.mjs';
import { USER_TABLES, FIXTURE_SETTINGS, bootCell, measureCell, instrumentLine, ENV_FACES_SRC, ENV_TAIL_SRC, bakeAndSettle, switchTable } from './lib/lighting-matrix.mjs';
import { judgeMatrix, refFixture, whyBadBars } from './lib/lighting-judge.mjs';
import { whyInvalid, whyListsDiffer, envDrift } from './lib/lighting-guard.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 2 };
export const PORT_FLAGS = {};

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '..');
// the served GI manifest: the judge's N9 GI-honesty read compares every cell's uGiOn with it
const MANIFEST = JSON.parse(fs.readFileSync(path.join(webDir, 'assets', 'gi', 'gi-manifest.json'), 'utf8'));
// GH-996 C1: the card-45 cue-ball clipping bars (every MEASURED row's cams.player.ballClip, both legs)
const BARS = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'lighting-census-bars.json'), 'utf8'));
const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
// --subset pr: the per-PR slice — the factory leg at b 1.0 on one representative table per class (every fixture
// setting); the full matrix is the nightly's
const SUBSET = argOf('--subset', 'full');
const CLASS_REPS = ['pool_pro_9ft', 'pool_pro_9ft_metal_rim', 'pool_pro_8ft', 'pool_pro_7ft', 'chinese8_pro_9ft',
  'wpbsa_snooker_12ft', 'umb_carom_284'];
const LEG = SUBSET === 'pr' ? 'factory' : argOf('--leg', 'both');
const TABLES = (argOf('--tables', '') || (SUBSET === 'pr' ? CLASS_REPS : USER_TABLES).join(',')).split(',').filter(Boolean);
const FIXES = (argOf('--fixtures', '') || FIXTURE_SETTINGS.join(',')).split(',').filter(Boolean);
const BS = (argOf('--b', '') || (SUBSET === 'pr' ? '1' : '0.6,1,1.4')).split(',').filter((s) => s !== '').map(Number);
const WORKERS = Number(argOf('--workers', 1));
const OUT = path.resolve(argOf('--out', `/tmp/ob-lighting-matrix-${process.pid}`));
const PNG = argv.includes('--png');
// --rejudge <rows.jsonl>: judge a saved run's rows again (pure post-processing — no port, no browser)
const REJUDGE = argOf('--rejudge', null);
// an unusable bars fixture makes every cell unjudgeable: refused before any port opens (exit 2)
const BARS_WHY = whyBadBars(BARS, USER_TABLES);
if (BARS_WHY) { console.log(`MATRIX UNJUDGEABLE ${BARS_WHY}`); process.exit(2); }
if (REJUDGE) {
  const rows = fs.readFileSync(path.resolve(REJUDGE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const j = judgeMatrix(rows, { manifest: MANIFEST, bars: BARS });
  for (const l of j.lines) console.log(l);
  console.log(`MATRIX ${j.refused || !j.judged ? 'UNJUDGEABLE' : j.out ? 'FAIL' : 'PASS'} ${j.judged - j.out}/${j.judged} in range, ${j.out} out, ${j.refused} refused (rejudged: ${REJUDGE}; ENV/LIVE arms are browser legs, not re-run)`);
  process.exit(j.refused || !j.judged ? 2 : j.out ? 1 : 0);
}
// the options are validated before any port or browser: a NaN or zero brightness, an unknown fixture setting or an
// empty table list is a usage error (exit 2), never a cell measured under a label it does not hold
{
  const usage = [];
  if (!['pr', 'full'].includes(SUBSET)) usage.push(`--subset ${SUBSET}`);
  if (!['neutral', 'factory', 'both'].includes(LEG)) usage.push(`--leg ${LEG}`);
  if (!TABLES.length) usage.push('--tables names no table');
  for (const f of FIXES) if (!FIXTURE_SETTINGS.includes(f)) usage.push(`--fixtures ${f} is not one of ${FIXTURE_SETTINGS.join(', ')}`);
  if (!BS.length) usage.push('--b names no brightness');
  for (const b of BS) { const why = whyInvalid('--b', b, { positive: true }); if (why) usage.push(why); }
  const w = whyInvalid('--workers', WORKERS, { int: true, min: 1 }) ?? (WORKERS > 2 ? `--workers ${WORKERS} > 2` : null);
  if (w) usage.push(w);
  if (usage.length) { console.error(`[e2e-lighting-matrix] usage: ${usage.join('; ')}`); process.exit(2); }
}

const cells = [];
for (const t of TABLES) {
  const fx = FIXES.includes(refFixture(t)) ? FIXES : [refFixture(t), ...FIXES];
  if (LEG !== 'factory') for (const f of fx) cells.push({ leg: 'neutral', table: t, fixture: f, b: 1, cloth: 'steel_gray' });
  if (LEG !== 'neutral') for (const f of fx) for (const b of BS) cells.push({ leg: 'factory', table: t, fixture: f, b, cloth: '' });
}
fs.mkdirSync(path.join(OUT, 'png'), { recursive: true });
const ROWS = path.join(OUT, 'rows.jsonl');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const pinned = process.env.OB_E2E_PORT !== undefined
  && process.env.OB_E2E_CDP_PORT !== undefined;
const band = pinned ? null : await claimPortBand(
  Number(process.env.OB_E2E_BAND_START ?? 17240),
  Number(process.env.OB_E2E_BAND_END ?? 17269));
const PORT = pinned ? Number(process.env.OB_E2E_PORT) : band.http(0);
const CDP0 = pinned ? Number(process.env.OB_E2E_CDP_PORT) : band.cdp(0);
const cdpPorts = [CDP0];
if (WORKERS > 1) cdpPorts.push(assertDerivedEndpoint(CDP0 + 1, { role: 'cdp', base: CDP0, expr: 'CDP + 1' }));
const server = spawnStaticServer(webDir, PORT);
const base = `http://127.0.0.1:${PORT}`;
const results = [];
let code = 0;
let instrument = null; // #1221: the first failing worker, named by the catch below
const clients = [];
try {
  let next = 0;
  // #1221: where each worker is, so an instrument error names its worker, cell, phase and camera
  const where = cdpPorts.map((port) => ({ port, pid: null, n: null, phase: 'launch', cam: null }));
  const worker = async (wi) => {
    const at = where[wi];
    const c = await launchChrome(`${base}/README.md`, { port: cdpPorts[wi], width: 1280, height: 800, tool: false });
    clients.push(c);
    at.pid = c.pid;
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    while (next < cells.length) {
      const n = next++; // `next` is shared by the workers: this worker's cell is n
      const cell = cells[n];
      Object.assign(at, { n, phase: 'boot', cam: null });
      const bc = await bootCell(c, base, cell);
      if (c.poisoned()) throw new Error(c.poisoned()); // the browser was lost while this cell booted: name this cell, not a later one
      const row = { ...cell, bootMs: bc.bootMs, light: bc.light, occl: bc.occl };
      if (!bc.ok) { at.phase = 'record'; row.verdict = 'STATE MISMATCH'; row.mismatch = bc.mismatch; log('REFUSE', cell.leg, cell.table, cell.fixture, cell.b, bc.mismatch.join('; ')); }
      else {
        at.phase = 'measure';
        const m = await measureCell(c, ['player', 'overhead'], PNG && cell.leg === 'factory' && cell.b === 1, at);
        Object.assign(at, { phase: 'record', cam: null });
        row.verdict = 'MEASURED'; row.cams = m.cams;
        row.envTailAfter = await c.eval(ENV_TAIL_SRC).catch(() => null);
        if (c.poisoned()) throw new Error(c.poisoned());
        for (const [cam, uri] of Object.entries(m.pngs)) fs.writeFileSync(path.join(OUT, 'png', `${cell.table}__${cell.fixture}__${cam}.png`), Buffer.from(uri.split(',')[1], 'base64'));
        log('ROW', cell.leg, cell.table, cell.fixture, `b=${cell.b}`, 'centre', m.cams.player.bed.centre, 'u', m.cams.overhead.bed.uniformity);
      }
      results.push(row);
      fs.appendFileSync(ROWS, JSON.stringify(row) + '\n');
    }
  };
  await Promise.all(cdpPorts.map((_, i) => worker(i).catch((e) => {
    instrument ??= { wi: i, ...where[i], done: results.length, e };
    throw e;
  })));

  // ---- env arms on a fresh pool canopy boot (GH-971 / GH-972)
  const envLines = []; let envFail = 0, envRefused = 0;
  {
    const c = clients[0];
    const bc = await bootCell(c, base, { table: 'pool_pro_9ft', fixture: 'canopy_panel', b: 1, cloth: '' });
    if (!bc.ok) { envRefused++; envLines.push(`ENV REFUSED boot: ${bc.mismatch.join('; ')}`); }
    else {
      // E1 history: the boot cube is already at its fixed point — one more bake (and its tail) moves no face > 3 %
      const m0 = await c.eval(ENV_FACES_SRC);
      const t1 = await bakeAndSettle(c);
      const m1 = await c.eval(ENV_FACES_SRC);
      const d1 = envDrift('boot cube', m0, 'one more bake', m1);
      if (t1.failed) { envFail++; envLines.push(`ENV OUT E1 ${t1.why}`); }
      else if (!t1.ok) { envRefused++; envLines.push(`ENV REFUSED E1: ${t1.why}`); }
      else if (d1.why) { envFail++; envLines.push(`ENV OUT E1 N0 invalid read: ${d1.why}`); }
      else if (!(d1.value <= 0.03)) { envFail++; envLines.push(`ENV OUT E1 one more bake moved a face ${(100 * d1.value).toFixed(2)} % (> 3 %): boot ${JSON.stringify(m0.faces)} -> ${JSON.stringify(m1.faces)}`); }
      else envLines.push(`ENV OK E1 one more bake moved the faces at most ${(100 * d1.value).toFixed(2)} %`);
      // E2 overhead bake: a bake while a camera-script overhead pose hides the canopy still photographs the lamp
      await c.eval('(__test.cameraPose({ overhead: true, height: 6, margin: 1.06 }), true)'); // live frames keep running: the tail drains
      const hidden = await c.eval(`import('./scene/room.js').then((m) => m.activeRoom?.instance?.lightRefs?.lampFace?.visible === false)`);
      const t2 = await bakeAndSettle(c);
      await c.eval('(__test.cameraPose({ cam: [1.85, -2.45, 1.55], look: [0, 0, 0], fov: 40 }), true)'); // non-overhead: restores the canopy
      const m2 = await c.eval(ENV_FACES_SRC);
      const d2 = envDrift('one more bake', m1, 'overhead-pose bake', m2);
      // a failed bake is a FAIL whatever the pose: it is named before the precondition (review P3: when both held, the
      // precondition refusal used to hide the latched tail failure)
      if (t2.failed) { envFail++; envLines.push(`ENV OUT E2 ${t2.why}`); }
      else if (!hidden) { envRefused++; envLines.push('ENV REFUSED E2: the overhead pose did not hide the canopy (precondition)'); }
      else if (!t2.ok) { envRefused++; envLines.push(`ENV REFUSED E2: ${t2.why}`); }
      else if (d2.why) { envFail++; envLines.push(`ENV OUT E2 N0 invalid read: ${d2.why}`); }
      else if (!(d2.value <= 0.03)) { envFail++; envLines.push(`ENV OUT E2 the overhead-pose bake moved a face ${(100 * d2.value).toFixed(2)} % (> 3 %): ${JSON.stringify(m1.faces)} -> ${JSON.stringify(m2.faces)}`); }
      else envLines.push(`ENV OK E2 the overhead-pose bake moved the faces at most ${(100 * d2.value).toFixed(2)} %`);
    }
  }

  // ---- live-switch arm (review r1 P2): in ONE boot, switch tables live with an explicit fixture and with auto, and
  // require the live emitters to equal both the profile for the destination and a FRESH entry of the destination —
  // across footprints and between tables that share a footprint but not a match gain (pool_pro_9ft <-> wpa_spec_9ft)
  const liveLines = []; let liveFail = 0, liveRefused = 0;
  {
    const c = clients[0];
    const seqs = [
      { fixture: 'pendant_bar', path: ['pool_pro_9ft', 'wpa_spec_9ft', 'pool_pro_9ft', 'pool_pro_9ft_metal_rim', 'pool_pro_7ft', 'chinese8_pro_9ft'] },
      { fixture: 'auto', path: ['pool_pro_9ft', 'pool_pro_9ft_metal_rim', 'chinese8_pro_9ft', 'pool_pro_8ft', 'pool_pro_9ft'] },
    ];
    const fresh = new Map();
    for (const q of seqs) {
      const bc = await bootCell(c, base, { table: q.path[0], fixture: q.fixture, b: 1, cloth: '' });
      if (!bc.ok) { liveRefused++; liveLines.push(`LIVE REFUSED ${q.fixture} boot ${q.path[0]}: ${bc.mismatch.join('; ')}`); continue; }
      for (const t of q.path.slice(1)) {
        const sw = await switchTable(c, t);
        const tag = `${q.fixture} -> ${t}`;
        // a failed env tail is latched for this boot: the switch fails by name and the sequence stops
        if (sw.failed) { liveFail++; liveLines.push(`LIVE OUT ${tag}: ${sw.why}`); break; }
        if (sw.why) { liveRefused++; liveLines.push(`LIVE REFUSED ${tag}: ${sw.why}`); break; }
        const lc = sw.light;
        const why = whyListsDiffer('live rects', lc.visRects, 'profile', lc.expected, 1e-4);
        if (why) { liveFail++; liveLines.push(`LIVE OUT ${tag}: ${why} (match ${lc.lighting?.matchKey} x${lc.lighting?.matchGain})`); }
        else liveLines.push(`LIVE OK ${tag}: rects ${JSON.stringify(lc.visRects)} == profile`);
        fresh.set(`${q.fixture}|${t}`, lc.visRects);
      }
    }
    // fresh entries of every destination: the live switch must land on the fresh boot's emitters
    for (const [k, live] of fresh) {
      const [fixture, table] = k.split('|');
      const bc = await bootCell(c, base, { table, fixture, b: 1, cloth: '' });
      if (!bc.ok) { liveRefused++; liveLines.push(`LIVE REFUSED fresh ${k}: ${bc.mismatch.join('; ')}`); continue; }
      const why = whyListsDiffer('live', live, 'fresh entry', bc.light.visRects, 1e-4);
      if (why) { liveFail++; liveLines.push(`LIVE OUT ${k}: ${why}`); }
      else liveLines.push(`LIVE OK ${k}: live == fresh entry`);
    }
  }

  // ---- judge (lib/lighting-judge.mjs — the same function --rejudge and the node selftest run)
  const { lines, out, refused } = judgeMatrix(results, { manifest: MANIFEST, bars: BARS });
  for (const l of lines) console.log(l);
  for (const l of envLines) console.log(l);
  for (const l of liveLines) console.log(l);
  const judged = results.length - refused;
  console.log(`MATRIX ${refused || !judged ? 'UNJUDGEABLE' : out ? 'FAIL' : 'PASS'} ${judged - out}/${judged} in range, ${out} out, ${refused} refused (rows: ${ROWS})`);
  console.log(`ENV ${envRefused ? 'UNJUDGEABLE' : envFail ? 'FAIL' : 'PASS'} ${envFail} out, ${envRefused} refused`);
  console.log(`LIVE ${liveRefused ? 'UNJUDGEABLE' : liveFail ? 'FAIL' : 'PASS'} ${liveFail} out, ${liveRefused} refused`);
  code = (refused || !judged || envRefused || liveRefused) ? 2 : (out || envFail || liveFail) ? 1 : 0;
} catch (e) {
  // #1221: a worker's error is an instrument error: ONE named line (worker, CDP port, Chrome pid, cell, phase, camera,
  // the CDP request) and the run is UNJUDGEABLE (exit 2: it judged no cell). No cell is retried.
  if (instrument) { console.log(instrumentLine(instrument, { cells, rows: ROWS })); code = 2; } else code = 1;
  console.error('[e2e-lighting-matrix] ' + (e?.stack ?? e));
}
finally {
  for (const c of clients) { try { await c.closeAndWait(); } catch { /* ok */ } }
  await stopStaticServer(server); await band?.release?.();
}
process.exit(code);
