// Copyright (c) Meta Platforms, Inc. and affiliates.

// overlay-490-gate.mjs — GH-630 ORDER-nameable runner for the sanctioned
// chinese8 overlay instrument (tools/audit/overlay-490-corner.py).
//
// Why a runner: the instrument was live-but-unsanctioned — the 08-22..08-27
// rounds' gate lists (PR #500 comments 5379243997 / 5383628474 /
// 5435145137) never named it, so main carried 14 undispositioned reds for
// ten days while the instrument still reproduced its own 08-21 PASS
// (6cd246ff: 35 PASS / 3 ADJ, exit 0).  A round order now names THIS file;
// "off-gate-set" cannot recur.  Ledger section: docs/fidelity/
// 490-internal-amendment-ledger.md "overlay-490-corner — instrument-of-
// record status (GH-630)".
//
// Modes:
//   --gate [--rev N] [--out DIR] [--pack DIR] [--web DIR]
//       (--out defaults to a per-run mkdtemp directory, echoed on stdout;
//       two lanes gating the same rev never share artifacts)
//       capture the 24-frame register pack (web/tools/capture-490-
//       chinese8.mjs — the REAL app on the committed artifacts) unless
//       --pack points at an existing pack, then judge it with the
//       instrument at --rev (default: the current letter, 45 = the
//       registry-standing era).  Exit 0 green / 3 red (any NEW red or
//       RE-PIN REQUIRED) / 2 refusal (OB_490_REFS unset, refs drift,
//       registry invalid) / 1 capture failure.
//   --red-arm [--rev N | --revs 42,43,44,45]
//       replay the pinned red basis (tools/render/fixtures/overlay-490-
//       red-basis.json) through the instrument's own letter_of()/
//       live_verdict() path at each rev: every expected row must fire and
//       every green control must stay silent, else exit 4 (the pass2/
//       orbitsweep law: a window/judge/registry regression can never pass
//       silently); the era-live bar list must equal the fixture's pinned
//       judged_bars[rev], else exit 2 (a bar deleted from the table is a
//       named identity refusal, never a silent shrink).  No browser, no
//       refs.
// Refs: OB_490_REFS must point at the Drive folder that holds
// tpt_q8_Pocket.jpg + joy147_q8_pocket_macro.png (preview-490-chinese8-
// 2026-08-09/refs); the instrument pins their sha256 at rev >= 45 (photo
// bytes are never committed).
// Ports: OB_E2E_PORT / OB_E2E_CDP_PORT pin (run-gate --band); otherwise
// the tool claims the 490 band 26850-26879 via claimPortBand (the
// cammatch-490 / jawrake-490 pattern).
// Era table (instrument header): 44 = JAW-COVER-1 letter (closure record),
// 45 = registry-standing era (current for main), 46 = post-#620 letter
// (PENDING until PR #620 merges).
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const args = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2)); // FIX10 (Fable pass 1): the run's view of the argv is the =-expanded view the parse consumed
const argOf = (k, d) => { const i = args.lastIndexOf(k); return i >= 0 ? args[i + 1] : d; };
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value
// FIX3 (P2 (a)): the load-time --pack existence check moved back INTO the judge path, after the stale report is
// removed — a refusal must never come before the prior verdict is invalidated (the in-function read keeps mustExist)

// FIX8 (review round 8 on #731 P2 A + B): ONE mode resolver (lib/mode-outputs.mjs); the removal below is MODE-SCOPED — only
// `--gate` (re)produces overlay-r<rev>.json, `--red-arm` writes nothing under --out (it used to remove the gate's report); and
// the rev selection is validated BEFORE the deletion path is built from it (a non-integer --rev refuses with nothing removed).
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'overlay-490-gate', value: ['--out', '--pack', '--web', '--refs', '--rev', '--revs'], bool: ['--gate', '--red-arm'] });
const { resolveMode: __resolveMode, invalidateForMode: __invalidateForMode, validateSelection: __validateSelection } = await import('./lib/mode-outputs.mjs');
const MODE = __resolveMode(__P.args, [['--red-arm', 'red-arm'], ['--gate', 'gate']]);
const CURRENT_REV = 45;
const __isRev = (v) => /^[0-9]{1,4}$/.test(v) && Number(v) > 0;
// the rev selection is read by ONE reader (stringOpt: last occurrence, `=` form, blank refused) for the validation AND the run —
// `--rev=4x` used to fall through argOf to rev 45 and remove overlay-r45.json (Fable pass 1 on FIX8)
const __REV_RAW = __P.value('--rev') ?? String(CURRENT_REV); // FIX10: from the parsed result
const __REVS_RAW = __P.value('--revs');
__validateSelection({ values: [__REV_RAW], validate: __isRev, what: 'rev', tag: 'overlay-490-gate' });
if (__REVS_RAW !== null) __validateSelection({ values: __REVS_RAW, validate: __isRev, what: 'rev', tag: 'overlay-490-gate' });
const INSTRUMENT = path.join(REPO, 'tools', 'audit', 'overlay-490-corner.py');
const FIXTURE = path.join(HERE, 'fixtures', 'overlay-490-red-basis.json');
// FIX3 (P2 (a)): the pinned report's destination is resolved and the prior overlay-r<rev>.json removed BEFORE the
// --web existence check (a refusal never precedes the invalidation)
const REV = Number(__REV_RAW);
const OUT_ARG = __P.value('--out');
const OUT_PINNED = OUT_ARG ? path.resolve(OUT_ARG) : null;
if (OUT_PINNED) {
  __invalidateForMode({ OUT: OUT_PINNED, mode: MODE, outputs: { gate: [`overlay-r${REV}.json`], 'red-arm': [] }, tag: 'overlay-490-gate' }); // the removal first — nothing (not even the mkdir) precedes it; red-arm owns nothing here
  fs.mkdirSync(OUT_PINNED, { recursive: true });
}
const webDir = __pathOpt('--web', { tag: 'overlay-490-gate', mustExist: 'dir' }) ? path.resolve(__pathOpt('--web', { tag: 'overlay-490-gate', mustExist: 'dir' }))
  : path.join(REPO, 'web');

if (!MODE) {
  console.error('usage: node tools/render/overlay-490-gate.mjs --gate [--rev N] '
    + '[--out DIR] [--pack DIR] [--web DIR] | --red-arm [--rev N | --revs a,b]');
  process.exit(2);
}

const runInstrument = (argv) => {
  const r = execFileSync('python3', [INSTRUMENT, ...argv], {
    stdio: ['ignore', 'inherit', 'inherit'], cwd: REPO,
  });
  return r;
};
const statusOf = (err) => (err && typeof err.status === 'number' ? err.status : 1);

// ---------------------------------------------------------------------------
// --red-arm: replay the pinned basis at every listed rev
// ---------------------------------------------------------------------------
if (MODE === 'red-arm') {
  if (!fs.existsSync(FIXTURE)) {
    console.error(`[overlay-490-gate] red basis missing: ${FIXTURE}`);
    process.exit(2);
  }
  const revs = __REVS_RAW !== null
    ? __REVS_RAW.split(',').map((s) => Number(s.trim()))
    : (args.includes('--rev') || args.some((a) => a.startsWith('--rev='))) ? [REV] : [42, 43, 44, 45];
  let worst = 0;
  for (const rev of revs) {
    try {
      runInstrument(['--red-arm', FIXTURE, '--rev', String(rev)]);
      console.log(`[overlay-490-gate] red-arm rev ${rev}: ARMED`);
    } catch (err) {
      const st = statusOf(err);
      console.error(`[overlay-490-gate] red-arm rev ${rev}: exit ${st}`);
      worst = Math.max(worst, st);
    }
  }
  process.exit(worst);
}

// ---------------------------------------------------------------------------
// --gate: capture (unless --pack) + judge
// ---------------------------------------------------------------------------
// review GH-630 r5 P2: a PINNED --out is cleared of its report before ANY
// preflight can exit.  The earlier placement (after the refs checks) still
// let an unset/short OB_490_REFS refuse while a reused directory kept the
// previous green overlay-r<rev>.json, which a reader could mistake for
// this refused run.  An UNPINNED run has nothing to clear — its mkdtemp
// directory does not exist yet, and creating one here would litter a temp
// directory on every refusal.
// review GH-630 r1 P2: resolve against the CALLER's cwd before the
// instrument runs with cwd = REPO (a relative OB_490_REFS must mean the
// same folder to the preflight and to python).
const REFS = process.env.OB_490_REFS
  ? path.resolve(process.env.OB_490_REFS) : null;
if (!REFS) {
  console.error('[overlay-490-gate] OB_490_REFS is unset — point it at the Drive '
    + 'preview-490-chinese8-2026-08-09/refs folder (tpt_q8_Pocket.jpg + '
    + 'joy147_q8_pocket_macro.png); the instrument pins their sha256 and '
    + 'photo bytes are never committed');
  process.exit(2);
}
for (const fn of ['tpt_q8_Pocket.jpg', 'joy147_q8_pocket_macro.png']) {
  if (!fs.existsSync(path.join(REFS, fn))) {
    console.error(`[overlay-490-gate] OB_490_REFS lacks ${fn}: ${REFS}`);
    process.exit(2);
  }
}
// review GH-630 r3 P1: the default artifact directory used to be the
// shared `/tmp/ob-overlay-490-gate-r<REV>`, so two lanes gating the same
// rev at the same time wrote one another's frames and reports — the port
// band isolates the browser, not the filesystem, and the loser measured a
// mixed-tree pack or printed a path holding the other run's report.  An
// unpinned run now gets its own mkdtemp directory (unique by construction,
// echoed so the artifacts stay findable); a pinned `--out` is the caller's
// declared, serialized choice.
// review GH-630 r4 P2: the report is already gone for a pinned --out (see
// above, before the refs preflight); the capture and the consumed-frame
// preflight below also exit early, so nothing may write between here and
// the judge.  Same law as the instrument's --verify-basis (review r4 P1):
// the report in this directory can only ever be this run's.
const OUT = OUT_PINNED
  ?? fs.mkdtempSync(path.join(os.tmpdir(), `ob-overlay-490-gate-r${REV}-`));
fs.mkdirSync(OUT, { recursive: true });
console.log(`[overlay-490-gate] rev ${REV} artifacts -> ${OUT}`);

let pack = __pathOpt('--pack', { tag: 'overlay-490-gate', mustExist: 'dir' }) ? path.resolve(__pathOpt('--pack', { tag: 'overlay-490-gate', mustExist: 'dir' })) : null;
if (!pack) {
  const capture = path.join(webDir, 'tools', 'capture-490-chinese8.mjs');
  if (!fs.existsSync(capture)) {
    console.error(`[overlay-490-gate] capture tool missing: ${capture} (--web?)`);
    process.exit(2);
  }
  // port discipline: honor a driving lane's pinned ports, else claim the
  // 490 band via the registry (cammatch-490 / jawrake-490 pattern).
  let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
  let CDP = process.env.OB_E2E_CDP_PORT
    ? Number(process.env.OB_E2E_CDP_PORT) : null;
  let band = null;
  let cdpMod = null;
  if (!PORT || !CDP) {
    cdpMod = await import(
      pathToFileURL(path.join(webDir, 'tools', 'cdp.mjs')).href);
    band = await cdpMod.claimPortBand(26850, 26879);
    PORT = band.http(0);
    CDP = band.cdp(0);
    console.log(`[overlay-490-gate] claimed band 26850-26879: http ${PORT} cdp ${CDP}`);
  }
  pack = path.join(OUT, 'pack');
  // a reused `--out` must not let an earlier tree's frames survive under a
  // new capture: the capture writes per-frame, so a partial overwrite
  // would hand the instrument a mixed-tree pack that still passes the
  // consumed-frame census below.
  fs.rmSync(pack, { recursive: true, force: true });
  fs.mkdirSync(pack, { recursive: true });
  const t0 = Date.now();
  // review GH-630 r7 P2: bracket the capture spawn with the registry's
  // pending hold and lease the child as a HOLDER of the band claim — the
  // web/tools/run-gate.mjs GH-389 form.  Between spawn() and the capture's
  // first registry scan only this process held the claim; a kill in that
  // window left the band holder-less under the live capture, and a reaper
  // could hand it to a foreign lane mid-capture.  Best-effort like
  // run-gate: a failed hold/lease falls back to the child's own first-scan
  // self-lease (cdp.mjs lineage law); the hold is released only once the
  // lease provably published, else it self-expires.  Pinned-port runs
  // (band null) are unchanged; band.release() drops the lease with the
  // claim dir on every non-crash path.
  let spawnHold = null;
  if (band) { try { spawnHold = cdpMod.pendPortClaim(band); } catch { /* grace only */ } }
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [capture], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: {
        ...process.env, OB_490_OUT: pack,
        OB_E2E_PORT: String(PORT), OB_E2E_CDP_PORT: String(CDP),
      },
    });
    if (band && child.pid) {
      try {
        cdpMod.leasePortClaim(band, child.pid);
        if (spawnHold) spawnHold.release();
      } catch { /* self-lease covers; the hold stays armed and self-expires */ }
    }
    child.on('exit', (c) => resolve(c ?? 1));
    child.on('error', () => resolve(1));
  });
  // the child is gone either way: an armed hold has nothing left to bridge
  // to and would keep the released band refusing an immediate rerun
  if (spawnHold) spawnHold.release();
  if (band) band.release();
  console.log(`[overlay-490-gate] capture exit ${code} in `
    + `${((Date.now() - t0) / 1000).toFixed(0)} s -> ${pack}`);
  if (code !== 0) process.exit(1);
}
// review GH-630 r1 P1: preflight EVERY frame the instrument consumes (r1 /
// r2 / r3 / c1s x default / sp) — the per-tier readers skip a missing tier
// silently, so an incomplete --pack could judge green on half the
// evidence.  (The instrument repeats this census at rev >= 45 as a hard
// red; the preflight refuses earlier with the missing names.)
const CONSUMED_FRAMES = [];
for (const tier of ['default', 'sp']) {
  for (const pose of ['r1_c1t', 'r2_c1o', 'r3_c2t_arena', 'c1s_side_ring_macro']) {
    CONSUMED_FRAMES.push(`chinese8_pro_9ft-${tier}-${pose}.png`);
  }
}
const missingFrames = CONSUMED_FRAMES.filter((f) => !fs.existsSync(path.join(pack, f)));
if (missingFrames.length) {
  console.error(`[overlay-490-gate] pack lacks ${missingFrames.length} consumed `
    + `frame(s): ${missingFrames.join(', ')} (${pack}) — capture the full `
    + '24-frame register pack; a partial pack is never judged');
  process.exit(2);
}
try {
  runInstrument(['--pack', pack, '--refs', REFS, '--out', OUT, '--rev', String(REV)]);
  console.log(`[overlay-490-gate] rev ${REV} GREEN -> ${OUT}/overlay-r${REV}.json`);
  process.exit(0);
} catch (err) {
  const st = statusOf(err);
  console.error(`[overlay-490-gate] rev ${REV} exit ${st} -> ${OUT}/overlay-r${REV}.json`);
  process.exit(st);
}
