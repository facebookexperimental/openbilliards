// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-export.mjs — export-quality gate (the video-export design note (internal)):
//   fresh boot: no stroke yet → "play a shot first" note + Export disabled
//     (the GH-158 counter-leg: last-shot retention must never manufacture
//     eligibility before any stroke exists);
//   dialog: Export video… button + modal, tier rows, sane probed ETA;
//   offline High tier: small-settings export → mp4 with EXACT frame count
//     (framestep.js planPlayback — the same module the app stepped),
//     h264 + aac streams, ffprobe-decodable, duration = frames/60;
//   determinism: two exports of the same record/tier/size produce
//     IDENTICAL pre-encode frame hashes (container bytes may differ across
//     encoder versions — the hashes are the ruled assertion surface);
//   cancel: mid-export cancel → no file, state restored;
//   GH-332: a REAL double-click on Cancel — first click cancels, Start/Close
//     rects byte-unmoved across the reflow, the second click lands on dead
//     row space and the dialog STANDS (pre-fix Close packed left under the
//     pointer and the second click dismissed the whole dialog);
//   realtime tier: drives the record.js MediaRecorder path;
//   GH-335: backgrounding the tab mid-realtime-capture FAIL-FASTS (ruled
//     over pause-with-notice; DVR onHide precedent) — state 'error', the
//     localized export.hiddenStopped paint, recorder stopped with NO file,
//     and a start attempted while hidden refuses before frame one;
//   drill (issue GH-158): a sandbox-drill stroke stays exportable AFTER the
//     drills attempt re-lay (game.layout used to free the sampler there —
//     "play a shot first" on a table with a just-played kernel record); a
//     real offline export runs from the drill context and the run survives
//     the replay re-settle;
//   fallback: WebCodecs mocked away → offline tiers unavailable + message.
//   #258 encoder liveness: a stubbed VideoEncoder going silent after ~8
//     chunks (both stall modes: pinned queue / silent drain) → the k-loop
//     watchdog aborts honestly in [14, 32] s with the localized
//     export.encoderStalled card paint, no file, state restored, feed
//     bounded by the in-flight ceiling; then a pass-through render proves
//     recovery + peak fed−delivered ≤ 35 (the memory bound); a tail-
//     swallowing encoder (last 10 frames eaten, flush resolves) is refused
//     by the videoChunks==totalFrames wall, never shipped as success.
//   drill stitch (issue #225 Phase B, F1-F5): three playground shots in ONE
//     rack → __export.renderDrill —
//     F1 decoded multi-shot PTS continuity across segment boundaries
//        (nb_read_frames == Σ segment frames, every delta 1/60, boundary
//        indices explicitly checked, keyframe at each cut);
//     F2 camera-switch lands at EXACT boundary frames (preset-diff run:
//        pre-encode hashes diverge precisely on the switched segment);
//     F3 two renderDrill runs → identical pre-encode frame hashes;
//     F4 audio seam: cue onsets at their global offsets, no click at seams;
//     F5 abort mid-drill → no file + live state restored (share log length,
//        machine back in AIM — the identity-restore integrity wall);
//     F6 montage cap: a 20-segment trimmed drill (uncapped ≈ 117 s) must
//        CONVERGE under the ruled 60 s ceiling (the old fixed-4-pass loop
//        parked it at 3601 frames) and the onMontage cap-policy note must
//        surface through the __export.renderDrill seam;
//     F7 scripted diagnostic record (__test.loadRecord
//        allowVersionMismatch): the post-render restore must not re-check
//        STRICTER than the original acceptance — live record identity back,
//        no restore console.error, no phantom share-log adjudication.
//   byte-derived budget (GH-304, B1-B5): exportBudgetSec pinned per
//     destination class with fixture rates (mp4/wire, webm/transcode,
//     webm/wire, 4K), honest-floor red-proofs (absent/corrupt/insane store
//     → exactly 60 s), the __export.exportBudget seam over the negotiated
//     container, renderDrill consuming opts.budgetSec in the cap loop
//     (REAL over-budget render converges to the derived ceiling), the
//     calibration write (a successful render records its own bytes/clipSec)
//     + the MAX-aggregation law; [B-realtime] in the fallback arm pins the
//     60 s floor on a no-WebCodecs boot even over a seeded store.
//   streaming full-length sink (GH-305, FULL1-FULL3):
//     FULL1 budget-exemption red/green (B4 is the red: the SAME plan class
//       compresses under budgetSec on the montage path; the streamed path
//       must ignore it BY DESIGN — montage rate pinned 1, onMontage never
//       fires) + wire completeness: pieces post DURING the encode (the
//       interleaving proof), lastResult carries streamedBytes with NO
//       page-side container (keepBytes/keepBlob structurally inert), and
//       the positioned pieces (muxer finalize backpatches ride
//       onData(data, position)) assemble node-side into an ffprobe-clean
//       mp4 — h264+aac, decoded frames == frames, duration == frames/60;
//     FULL2 memory red/green at the SINK level (the accumulation point
//       itself): the same noise-fed encode twice — the ArrayBufferTarget
//       sink materializes the WHOLE file page-side (usedSize +
//       backingStorageSize delta ≥ 70% of the file, released with it),
//       the streamed sink stays flat within a constant bound;
//     FULL3 a refused wire write fails the render HONESTLY (the shell's
//       machine token surfaces, no truncated success) and the engine
//       recovers for the next render;
//   windowed audio bed (GH-373, FULL4-FULL6) — the v1 with-sound wall
//   (FULLSTREAM_AUDIO_CAP_SEC 390 s: the whole-session bed was the one
//   remaining length-proportional allocation) is LIFTED for capable
//   pairings; the old plan-time refusal remains only for a cached pre-373
//   export-audio.js (untestable here — ES module namespaces are frozen —
//   recorded in the OWNERSHIP ledger):
//     FULL4 seam proof: renderDrillAudioWindowed vs renderDrillAudio over
//       ONE timeline with a loud cue ringing ACROSS a window join — whole-
//       PCM max|Δ| ≤ 1e-6 (the documented ≤1.5 ulp float-summing class;
//       sub-audible by ~20 dB against the -120 dBFS line) and per-join
//       neighborhoods equally clean; RED: preRollFrames 0 (the naive
//       butt-join) shows an audible-class join delta, proving the metric
//       catches bad windowing and the derived pre-roll is load-bearing;
//     FULL5 bed memory red/green (the GH-256/FULL2 style): a 390 s
//       one-piece bed materializes ~150 MB page-side (released with it);
//       the windowed generator holds ONE ~30.7 s window at a time —
//       sampled per window, the heap stays O(window), never O(session);
//     FULL6 the lift end-to-end: a ~392 s with-sound streamed plan (past
//       the retired wall) renders 1:1 — montage rate pinned 1, positioned
//       pieces assemble node-side, ffprobe proves h264+aac with decoded
//       frames == frames > 390·60 and the audio track spanning the video.
//   export robustness (GH-362, R1-R2):
//     R1 graceful background pause/resume red/green: a mid-encode
//       document.hidden PARKS the k-loop (frames frozen — the red: the
//       pre-362 loop kept rendering into a hidden document), the parked
//       run survives 17 s hidden WITHOUT the 15 s stall watchdog firing
//       (hidden time never charges encoder-liveness deadlines — the
//       wedge's abort half), the onPause hook fires true/false, and the
//       resumed render completes with frame hashes IDENTICAL to an
//       uninterrupted control run (pausing is byte-free by determinism);
//     R2 keep-awake latch red-proofed per terminal path: with the
//       obKeepAwake mock + hint installed, a completed drill render posts
//       {on:true}…{on:false}, a failed one releases too, and a cancelled
//       dialog run releases through start()'s finally.
//   strike-point plate (GH-364, S1-S4 — the engine half; e2e-playback arm
//     27 gates the card/preview half):
//     S1 the pure leaf's params→glyph mapping pinned on fixtures
//        (rest / a-extreme / b-extreme / masse + the per-cue 0.58 miscue
//        ring): dot at (a,b)/S in face-radius units, paint confined to
//        plateRect, alpha-0 draws nothing, the HUD readout grammar;
//     S2 overlay on/off LOCALIZED in time (hash diffs only inside the
//        leaf-derived [segment start, impact + one settle beat] windows)
//        and space (decoded mid-window frame: strong pixel diffs confined
//        to plateRect + a one-macroblock apron — the issue's acceptance);
//     S3 the burned caption localizes (en vs zh-CN differ exactly in the
//        plate's title band — pixel truth for the i18n arm);
//     S4 armed A/A determinism on the ruled pre-encode-hash surface + an
//        OFF re-render byte-identical to the baseline (zero residue);
//     S5 (GH-475) the annotation halves at the leaf: fmtElev/fmtPower
//        grammar + capability surface, plateRect row accounting (a knob
//        row costs exactly the legacy readout row), paint containment,
//        legacy fmtReadout == the joined halves.
//   pre-strike lead-in (GH-363, LEAD1-LEAD3 — engine truth over
//     renderDrill's opts.leads; the planner schedule arms ride
//     e2e-playback):
//     LEAD1 head arithmetic (frames == control + round(sec·60) per
//       segment), v1 static-hold frozen + stroke present, v2 feather
//       motion, and the OPTION-OFF CLEAN LAW: play/tail frames
//       byte-identical to the lead-less render after the head shift;
//     LEAD2 determinism ×2 (two lead renders byte-identical pre-encode
//       hashes) + the FNV-1a seed law on the probe surface (repeat
//       agrees, shot index stirs, v1 = count 0 @ 1.8 s, amps inside the
//       envelope);
//     LEAD3 montage cap: the budget compresses PLAY frames while lead
//       heads stay rate-1 byte-identical to the unbudgeted render;
//     LEAD4 (GH-433, rides the CR shell twin) the lead-only trim journey:
//       the pre-363 literal setTrim(0, 1.2) ASSOCIATES to shot 0 (one
//       full lead-bearing slice; RED pre-433: empty plan + silently dead
//       starter tiles), the full-mode Files tile arms, and the assembled
//       v3 delivery ffprobes to EXACTLY lead head + play + tail frames —
//       the clip opens at the lead and includes the strike.
//   crash-grade resume (GH-362 layer 3, CR1-CR4; WIDENED by GH-435,
//     CR5-CR6): a sessionStorage-backed
//     in-page v3 shell twin (positioned writes, sidecar manifest on
//     plan-carrying chunks, truncate-to-extent + prefix-hash resume reply,
//     __obResume documentStart hint — the ShellCore laws, mirrored). The
//     "crash" is a same-URL navigation the mock fires mid-transfer without
//     ever answering the in-flight op — WebContent death, headless
//     analogue. ONE equivalence law over the MEASURED determinism class
//     (2026-08-06 probes; widened 2026-08-09 by the GH-435 exact bed): the
//     render, the AAC/Opus encoders and software AVC/VP9 are
//     bit-reproducible, HARDWARE video encoders are not, the plain
//     OfflineAudioContext bed is not (±ulp float-summing jitter) but the
//     GH-435 windowed-EXACT bed is (per-cue isolated renders + canonical
//     float32 composition — FULL7 gates it) — so mp4 streamed plans, sound
//     ON or OFF, pin the software encoder and fast-forward byte-safely,
//     while non-mp4 plans (and any stale pre-435 pairing, where
//     __export.fullAudioExact reads false) take the honest RESTART flow.
//     CR1 with-sound JOURNEY (the real card: full mode, Files tile,
//       boundary kill after 2 chunks): relaunch offers the localized
//       banner (persisted plan matched to the hint by planHash + kernel +
//       UA pins); Continue FAST-FORWARDS (GH-435: the resume op, first
//       append AT the preserved extent, posted bytes strictly fewer than
//       the file — pre-435 this class restarted) and delivers EXACTLY the
//       persisted plan's plannedFullFrames frames, h264+aac, duration and
//       container stamp exact; resumed chunks keep riding plan/frame so a
//       second crash checkpoints too;
//     CR2 sound-off SEAM (the fast path): an A/A byte-identity foundation
//       check, then a fabricated mid-piece crash state — Continue posts
//       the resume op, fast-forwards (first append AT the extent, posted
//       bytes strictly fewer than the file) and the delivered file is
//       BYTE-IDENTICAL to the uninterrupted control — the strong
//       equivalence law, proved not assumed;
//     CR3 CORRUPT prefix (one flipped byte inside the extent): the
//       re-render's boundary hash refuses (resume-mismatch), the partial
//       aborts, NOTHING is delivered, the banner degrades to the honest
//       restart offer, and Start over delivers the byte-identical control
//       file — never a silently broken one;
//     CR4 TRUNCATED file (below the manifest extent): the resume op
//       refuses (no-stream) → the honest restart offer; Discard clears
//       the persisted plan, the shell debt and the banner;
//     CR5 sound-on SEAM (GH-435, the CR2 shape on a withAudio plan): the
//       A/A byte-identity foundation now holds WITH an aac track (exact
//       bed + software AVC), a fabricated mid-piece crash fast-forwards
//       through the REAL banner and the delivered file is BYTE-IDENTICAL
//       to the uninterrupted sound-on control; CR5b (review r1 P1) masks
//       the gate-time prefer-software probe false — Continue restarts UP
//       FRONT (no resume op, no wasted catch-up render) and still
//       delivers the byte-identical control;
//     CR6 the RESTART class post-widening (non-mp4): a fabricated webm
//       sound-off plan's Continue takes the restart flow — fresh begin
//       superseding the partial, NO resume op, complete clean delivery.
//       (The other restart-class member — sound-on under a stale pre-435
//       module pairing — is untestable live: ES module namespaces are
//       frozen; recorded in the OWNERSHIP ledger. The e2e-playback
//       ffEligible arm pins that leg on the predicate instead.)
//   pause-seam frame exactness (GH-472, PS0-PS4) — the owner's build-17
//     one-brief-flip loss (5804/5806 delivered → session discarded). A
//     VideoEncoder wrapper surrenders outputs at the platform boundary
//     (consumed input, no output, NO error — the VideoToolbox background
//     drop signature; headless Chrome never drops on a flip alone):
//     PS1 one 250 ms hidden→visible flip surrendering 2 in-flight outputs
//       → the hidden-edge drain + contig-watermark rewind repair IN PLACE:
//       repairs ≥ 1, delivery frame-exact (ffprobe), pre-encode hashes
//       identical to the uninterrupted control (byte-free repair);
//     PS2 the flip lands while the feed is PARKED at the in-flight
//       ceiling (withheld outputs): the backpressure hold hands the
//       settled drain to the frame-top barrier instead of riding the
//       deficit into the 15 s stall deadline — frame-exact delivery;
//     PS3 three RAPID flips (surrenders on two): drain latching is
//       idempotent under superseding flips — frame-exact, hashes ==
//       control;
//     PS4 (rides the CR shell twin — the REAL card journey; GH-997
//       rewrite) two adjacent frames surrendered on EVERY attempt defeat
//       the in-place repair and would stutter if held: the wall REFUSES the
//       file (never weakened) but the card KEEPS the persisted plan AND
//       holds the complete file's stream open — the 'truncated' banner
//       offers Save anyway (the held `end` ships it minus two frames),
//       Start over (abort the held stream, frame-exact restart) and
//       Discard (abort + clear); a stream-less kept draft still re-offers
//       at boot. RED pre-472: plan cleared + abort + nothing to resume;
//       RED pre-997: aborted at once, no Save anyway;
//     PS5 (GH-997 law) a chase-rig flip loss REPAIRS in place — the
//       follower state ring restores frame W's exact state (hashes == a
//       track control). RED pre-997: stood down to the wall.
//   no near-complete render is thrown away (GH-997, L1-L9, [985], [991]) —
//     the owner's phone report "video encoder dropped frames (7334 of
//     7335 delivered) — no file written":
//     L1 a forced single-frame drop with NO visibility edge, L2 a flip
//       whose surrender lands before its edges, L3 a double flip, L4 the
//       LAST frame's output lost, L5 a flip near the end with the last two
//       outputs surrendered — each repaired in place, frame-exact (the
//       sink's auto-guard + the mandatory end drain);
//     L6 one frame surrendered on every attempt → the retry budget spends
//       and ONE isolated frame is HELD (silent, recorded, duration kept);
//     L7 a 2-frame persistent hole → refused WITH the file (obSalvage);
//     L8 the Export dialog's Save anyway / Export again offer (real click);
//     L9 the clip card's Save anyway (the owner's path) → shipped through
//       the Files tile minus the two frames;
//     [985] overlapping first opens (seam + a real double-click while the
//       probe is pending) build ONE modal; after Escape nothing covers the
//       HUD; [991] a stubbed macOS wrapper: the dialog waits on the save
//       sheet (saving), a Cancel reads "not saved" + Save again (same
//       bytes, no re-render), saved → done.
//
//   node web/tools/e2e-export.mjs   (needs Chrome + node ≥ 22 + ffmpeg)
//   node web/tools/e2e-export.mjs --selftest-ps3
//     (GH-881: node-only, synthetic ledgers, no browser — the PS3 ledger
//     accounting below as a pure verdict: positive three-show cases with
//     the existing numbers, plant short-ledger cases judged UNJUDGEABLE)
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  laneArtifactDir, launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { decodePng } from './kit-laws.mjs'; // GH-1046 CR7: the banner pixel leg
import { planPlayback, TAIL_SEC, sinkCompletionSec } from '../app/framestep.js'; // LAND-16 Z2: the frame-count law plans to the last pocket drop's end, as runExport does

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// suite-unique verified-free ports (OB_E2E_PORT/OB_E2E_CDP_PORT overrides —
// the e2e-touch.mjs convention) so parallel lanes never collide
const PORT = Number(process.env.OB_E2E_PORT ?? 20910);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 22760);
// GH-410 third leg (the #408 landing incident): lane-parameterized on the
// same axis as the ports — see e2e-record.mjs.
const OUTDIR = laneArtifactDir('obexport-e2e', CDP_PORT);
let failCount = 0; // per-arm OK logs snapshot this (never process.exitCode:
// an unrelated earlier arm's failure must not suppress a later arm's OK line)
const fail = (msg) => {
  failCount++;
  console.error('E2E-EXPORT FAIL:', msg);
  process.exitCode = 1;
};
let unjudgeableCount = 0; // GH-881: UNJUDGEABLE is an outcome kind of its
// own (the e2e-snooker.mjs convention, exit 2): the arm ran but cannot
// decide its question — never PASS, never FAIL, and the word never
// appears inside a fail() reason string.
const unjudgeable = (msg) => {
  unjudgeableCount++;
  console.error('E2E-EXPORT UNJUDGEABLE:', msg);
  if (!process.exitCode) process.exitCode = 2;
};

/** GH-997: a held frame must leave every MUXED sample decodable — a
 * released successor that references the surrendered picture is silently
 * discarded by the decoder (measured: ffmpeg -v error stays quiet, the
 * decoded count drops below the packet count). Returns '' when every
 * video packet decodes to a frame, else the mismatch (or ffprobe error). */
function decodeErrors(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-count_packets',
    '-count_frames', '-select_streams', 'v:0', '-show_entries',
    'stream=nb_read_packets,nb_read_frames', '-of', 'json', file],
  { encoding: 'utf8' });
  if (r.status !== 0) return `ffprobe rc ${r.status}: ${`${r.stderr ?? ''}`.trim()}`;
  const st = JSON.parse(r.stdout).streams?.[0] ?? {};
  const pk = Number(st.nb_read_packets);
  const fr = Number(st.nb_read_frames);
  return pk === fr && pk > 0 ? '' : `${fr} decoded frames from ${pk} packets`;
}

/** GH-997 (review r1): decoded-frame comparison, never counts — decode both
 * files onto the 60 fps timeline (a HELD slot repeats its predecessor) as
 * 8-bit luma and return the per-slot PSNR of `file` against `control`;
 * slots inside `holes` compare against the control frame the hold
 * repeats. Missing-reference damage reads far below encoder noise. */
function decodedPsnr(file, control, w, h, holes = []) {
  const dec = (f) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-vf', 'fps=60',
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 30 });
  const a = dec(file);
  const b = dec(control);
  const fsz = w * h;
  const n = Math.min(a.length, b.length) / fsz;
  const heldAt = new Map();
  for (const hl of holes) for (let i = 0; i < hl.n; i++) heldAt.set(hl.at + i, hl.at - 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = heldAt.has(i) ? heldAt.get(i) : i;
    let se = 0;
    for (let p = 0; p < fsz; p++) {
      const d = a[i * fsz + p] - b[j * fsz + p];
      se += d * d;
    }
    const mse = se / fsz;
    out.push(mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse));
  }
  return { frames: a.length / fsz, controlFrames: b.length / fsz, psnr: out };
}

/** GH-997 (review r1): the structural half of "no unsafe delta after a hole"
 * — the FIRST muxed sample after every held run must be a keyframe (a
 * delta there was encoded against a picture the decoder never sees;
 * concealment can hide it from a PSNR read, the packet flag cannot).
 * Returns '' or the offending hole + the sample's flags. */
function keyAfterHoles(file, holes = []) {
  const rows = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', file])
    .toString().trim().split('\n').map((l) => {
      const [pts, flags] = l.split(',');
      return { i: Math.round(Number(pts) * 60), flags: flags ?? '' };
    }).filter((r) => Number.isFinite(r.i)).sort((a, b) => a.i - b.i);
  for (const hl of holes) {
    const next = rows.find((r) => r.i >= hl.at + hl.n);
    if (next && !next.flags.includes('K')) {
      return `hole ${JSON.stringify(hl)} is followed by frame ${next.i} flags "${next.flags}" (not a keyframe)`;
    }
  }
  return '';
}

/** GH-881: the PS3 ledger accounting as ONE pure verdict, shared by the
 * live PS3 arm and the node-only --selftest-ps3. Inputs are the rig's own
 * numbers: `budgets` (one drop budget per flip), `unconsumedLedger` (one
 * entry per flip SHOW that fired), `dropped` and `repairs` (measured).
 * A SHORT ledger (fewer entries than flips) never resolves: no consumed
 * value is computed from it (the pre-881 code formed NaN there and the
 * repair clause below then fired its zero-consumption branch on
 * NaN > 0 === false, printing an untrue phantom-repair line after the
 * staging line). The verdict is UNJUDGEABLE with the count seen. An
 * OVER-LONG ledger (more entries than flips — the rig ledgered shows
 * that never happened) is not short: it keeps the pre-881 FAIL kind
 * (STEER-1 item 6). The judged branch computes consumed exactly as
 * before and every failure line in it is printed only from measured
 * values. */
function ps3Accounting({ budgets, unconsumedLedger, dropped, repairs }) {
  if (!Array.isArray(unconsumedLedger)
    || unconsumedLedger.length !== budgets.length) {
    const got = Array.isArray(unconsumedLedger) ? unconsumedLedger.length : 0;
    if (Array.isArray(unconsumedLedger) && got > budgets.length) {
      return {
        kind: 'fail',
        got,
        consumed: null,
        failures: [`[PS3] staging: wanted ${budgets.length} flip shows, got ${got}`],
        line: null,
      };
    }
    return {
      kind: 'unjudgeable',
      got,
      consumed: null,
      failures: [],
      line: `[PS3] staging: wanted ${budgets.length} flip shows, got ${got}`
        + ' — the ledger did not resolve, so consumed and repairs are'
        + ' not judged',
    };
  }
  const consumed = budgets.reduce((a, b) => a + b, 0)
    - unconsumedLedger.reduce((a, b) => a + b, 0);
  const failures = [];
  if (dropped !== consumed) {
    failures.push(`[PS3] staging: surrendered ${dropped} != budget consumed `
      + `inside the windows ${consumed} (unconsumed per flip `
      + `${unconsumedLedger.join('/')})`);
  }
  // GH-881: this clause exists only on the resolved branch, where
  // consumed is finite by construction (the live arm additionally holds
  // the Number.isFinite law by never calling the clause elsewhere).
  if (consumed > 0 ? !(repairs >= 1) : repairs !== 0) {
    failures.push(consumed > 0
      ? `[PS3] no repair engaged across rapid flips (${repairs}; `
        + `${consumed} surrendered inside the windows)`
      : `[PS3] phantom repair: ${repairs} repairs with nothing `
        + 'surrendered inside the windows');
  }
  return { kind: 'judged', got: budgets.length, consumed, failures, line: null };
}

/** GH-881 node-only selftest (`--selftest-ps3`): synthetic ledgers through
 * ps3Accounting — the POSITIVE control is the three-show ledgers producing
 * the existing numbers unchanged; the PLANT is the short ledgers, which
 * must come back UNJUDGEABLE with the count seen, exactly one line, no
 * phantom line; the over-long ledger keeps the FAIL kind (STEER-1 item 6);
 * and check 11 counts a not-a-number token across EVERY line the selftest
 * prints, the consumed= field included (STEER-1 item 4). Exits before any
 * server or browser side effect. */
function ps3Selftest() {
  const B = [2, 0, 2];
  const printed = [];
  const print = (s) => { printed.push(s); console.log(s); };
  let bad = 0;
  const check = (name, input, want) => {
    const v = ps3Accounting({ budgets: B, ...input });
    const rendered = v.kind === 'unjudgeable'
      ? [`E2E-EXPORT UNJUDGEABLE: ${v.line}`]
      : v.failures.map((f) => `E2E-EXPORT FAIL: ${f}`);
    const ok = want(v, rendered);
    if (!ok) bad++;
    print(`[ps3-selftest] ${ok ? 'PASS' : 'FAIL'} — ${name}: kind=${v.kind} `
      + `consumed=${v.consumed === null ? 'not-judged' : v.consumed} `
      + `lines=${rendered.length}${rendered.length ? ' — ' + rendered.join(' | ') : ''}`);
  };
  // POSITIVE control: three shows ledgered, existing numbers unchanged.
  check('positive full ledger', { unconsumedLedger: [0, 0, 0], dropped: 4, repairs: 2 },
    (v) => v.kind === 'judged' && v.consumed === 4 && v.failures.length === 0);
  check('positive partial ledger', { unconsumedLedger: [1, 0, 1], dropped: 2, repairs: 1 },
    (v) => v.kind === 'judged' && v.consumed === 2 && v.failures.length === 0);
  check('positive zero-consumed ledger', { unconsumedLedger: [2, 0, 2], dropped: 0, repairs: 0 },
    (v) => v.kind === 'judged' && v.consumed === 0 && v.failures.length === 0);
  // Judged second lines, printed only from measured values.
  check('judged phantom line', { unconsumedLedger: [2, 0, 2], dropped: 0, repairs: 3 },
    (v) => v.kind === 'judged' && v.failures.length === 1
      && v.failures[0].includes('[PS3] phantom repair: 3 repairs'));
  check('judged no-repair line', { unconsumedLedger: [0, 0, 0], dropped: 4, repairs: 0 },
    (v) => v.kind === 'judged' && v.failures.length === 1
      && v.failures[0].includes('[PS3] no repair engaged across rapid flips (0; 4'));
  check('judged surrendered mismatch line', { unconsumedLedger: [0, 0, 0], dropped: 3, repairs: 2 },
    (v) => v.kind === 'judged' && v.failures.length === 1
      && v.failures[0].includes('[PS3] staging: surrendered 3 != budget consumed'));
  // PLANT (negative control): fewer than three shows ledgered — the
  // pre-881 logic printed the staging line AND the phantom line here.
  check('plant two-show ledger', { unconsumedLedger: [0, 0], dropped: 4, repairs: 2 },
    (v, rendered) => v.kind === 'unjudgeable' && v.consumed === null
      && v.failures.length === 0 && rendered.length === 1
      && rendered[0].includes('wanted 3 flip shows, got 2')
      && !rendered[0].includes('phantom'));
  check('plant one-show ledger', { unconsumedLedger: [0], dropped: 2, repairs: 1 },
    (v, rendered) => v.kind === 'unjudgeable' && rendered.length === 1
      && rendered[0].includes('wanted 3 flip shows, got 1'));
  check('plant empty ledger', { unconsumedLedger: [], dropped: 0, repairs: 1 },
    (v, rendered) => v.kind === 'unjudgeable' && rendered.length === 1
      && rendered[0].includes('wanted 3 flip shows, got 0'));
  check('plant over-long ledger', { unconsumedLedger: [0, 0, 0, 0], dropped: 4, repairs: 2 },
    (v, rendered) => v.kind === 'fail' && v.consumed === null
      && rendered.length === 1
      && rendered[0].includes('wanted 3 flip shows, got 4')
      && !rendered[0].includes('phantom'));
  // Check 11 (STEER-1 item 4): count across EVERY printed line so far,
  // consumed= fields included — a verdict that carried NaN in its
  // consumed field prints it on its check line and is caught here.
  const nanHits = printed.filter((l) => l.includes('NaN')).length;
  if (nanHits) bad++;
  print(`[ps3-selftest] ${nanHits ? 'FAIL' : 'PASS'} — check 11: `
    + `not-a-number tokens in printed lines: ${nanHits}`);
  const total = 11;
  const passed = total - bad;
  print(bad === 0
    ? `PS3-SELFTEST PASS (${passed}/${total} checks)`
    : `PS3-SELFTEST FAIL (${passed}/${total} checks)`);
  return bad === 0 ? 0 : 1;
}
if (process.argv.includes('--selftest-ps3')) {
  process.exit(ps3Selftest());
}

fs.rmSync(OUTDIR, { recursive: true, force: true });
fs.mkdirSync(OUTDIR, { recursive: true });
const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [];
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`,
  { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

async function waitReady() {
  for (let i = 0; i < 200; i++) {
    if (await chrome.eval('window.__test?.ready === true')) return;
    await sleep(200);
  }
  throw new Error('app never became ready');
}

/** Tier wall (recording-QA wave): with a settled stroke on the table, EVERY
 * tier row must be present, AVAILABLE (this Chrome probes mp4+webm+
 * MediaRecorder green) and carry a sane ETA — in whichever MODE the dialog
 * was opened from (play / drill LIVE / playground). Call with the dialog
 * open or openable; leaves it open.
 * RECORDED DEVIATION (issue #259, additive-lane): the pinned tier-key list
 * grows 'cinematic' between high and ultra4k — headless Chrome (Metal
 * ANGLE) probes EXT_float_blend green, so the row must be OFFERED here;
 * the gated-GPU shape is asserted in the [#259 cinematic] arm below. */
async function tierWall(tag) {
  const wall = await chrome.eval(`__export.open().then(() => {
    const out = [];
    for (const k of ['realtime', 'standard', 'high', 'cinematic', 'ultra4k',
      'cinema4k']) {
      const row = document.getElementById('ob-x-tier-' + k);
      out.push({ k, present: !!row,
        dis: row ? row.classList.contains('dis') : true,
        eta: row?.querySelector('.eta')?.textContent ?? null });
    }
    return out;
  })`);
  for (const r of wall) {
    if (!r.present) fail(`[${tag}] tier row ${r.k} missing from the dialog`);
    else if (r.dis) {
      fail(`[${tag}] tier ${r.k} unavailable (probed support exists on this Chrome)`);
    } else if (!/^~/.test(r.eta ?? '')) {
      fail(`[${tag}] tier ${r.k} ETA not sane: "${r.eta}"`);
    }
  }
  if (!process.exitCode) {
    console.log(`[${tag}] OK — all 6 tiers offered with sane ETAs`);
  }
}

try {
  await waitReady();
  await sleep(800);

  // ---- #985: overlapping first opens build ONE modal; closing leaves none --
  // The first open of a page session awaits the kit + four
  // isConfigSupported probes before the modal exists; pre-fix a second open
  // inside that window built a SECOND modal and orphaned the first as an
  // invisible full-viewport layer (z 60, pointer-events auto) that ate
  // every click once both cards closed. Seam leg: two open() calls in ONE
  // task. Real-input leg (fresh page session): a REAL double-click on the
  // toolbar Export pill while the probe is pending (stretched to 400 ms so
  // the second press lands inside it). Both close with REAL Escape presses,
  // then nothing may cover the HUD. RED pre-fix: 2 modals, the orphan
  // under every control.
  {
    const c = failCount;
    const esc = async () => {
      for (const type of ['keyDown', 'keyUp']) {
        await chrome.send('Input.dispatchKeyEvent', { type, key: 'Escape',
          code: 'Escape', windowsVirtualKeyCode: 27 });
      }
      await sleep(450); // the kit exit tween
    };
    const probe985 = () => chrome.eval(`(() => {
      const hits = {};
      for (const id of ['shoot', 'ob-export-btn']) {
        const el = document.getElementById(id);
        const b = el?.getBoundingClientRect();
        if (!b || !(b.width > 0)) { hits[id] = 'hidden'; continue; }
        const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        hits[id] = at === el || el.contains(at) ? 'ok' : (at?.id || at?.tagName || 'none');
      }
      return { modals: document.querySelectorAll('#ob-export-modal').length, hits };
    })()`);
    const n1 = await chrome.eval(`Promise.all([__export.open(), __export.open()])
      .then(() => document.querySelectorAll('#ob-export-modal').length)`);
    if (n1 !== 1) fail(`[985] two overlapping opens built ${n1} modals (want 1)`);
    await esc();
    await esc();
    const a1 = await probe985();
    if (a1.modals !== 0 || Object.values(a1.hits).some((h) => h !== 'ok' && h !== 'hidden')
      || a1.hits['ob-export-btn'] !== 'ok') {
      fail(`[985] seam leg left a layer over the table: ${JSON.stringify(a1)}`);
    }
    // real-input leg on a FRESH page session (support is probed once)
    await chrome.send('Page.reload', {});
    await sleep(600);
    await waitReady();
    await sleep(800);
    const pill = await chrome.eval(`(() => {
      const V = window.VideoEncoder;
      const orig = V.isConfigSupported.bind(V);
      window.__p985 = orig;
      V.isConfigSupported = (cfg) => new Promise((r) => setTimeout(r, 400))
        .then(() => orig(cfg));
      const b = document.getElementById('ob-export-btn').getBoundingClientRect();
      return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
    })()`);
    for (const clickCount of [1, 2]) {
      await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
        x: pill.x, y: pill.y, button: 'left', clickCount });
      await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
        x: pill.x, y: pill.y, button: 'left', clickCount });
    }
    // the stretched probes settle and the dialog builds: wait for the first
    // modal (bounded — a fixed 2.5 s read 0 modals under load), then past
    // one more probe window so a SECOND build racing the first (the
    // pre-#985 defect) has landed too before the count is judged
    let n2 = 0;
    for (let i = 0; i < 60 && n2 < 1; i++) {
      await sleep(250);
      n2 = await chrome.eval(`document.querySelectorAll('#ob-export-modal').length`);
    }
    await sleep(2000);
    n2 = await chrome.eval(`document.querySelectorAll('#ob-export-modal').length`);
    if (n2 !== 1) fail(`[985] a real double-click on Export built ${n2} modals (want 1)`);
    await esc();
    await esc();
    const a2 = await probe985();
    await chrome.eval(`(() => { VideoEncoder.isConfigSupported = window.__p985;
      delete window.__p985; return true; })()`);
    if (a2.modals !== 0 || a2.hits['ob-export-btn'] !== 'ok'
      || Object.values(a2.hits).some((h) => h !== 'ok' && h !== 'hidden')) {
      fail(`[985] real-input leg left a layer over the table: ${JSON.stringify(a2)}`);
    }
    if (failCount === c) {
      console.log(`[985] OK — overlapping opens (seam + real double-click) built `
        + `one modal; after Escape nothing covers the HUD (${JSON.stringify(a2.hits)})`);
    }
  }

  // ---- fresh boot: no shot yet → gated (issue GH-158 counter-leg) -----------
  // the "play a shot first" note + disabled Export must hold on a virgin
  // boot — the GH-158 fix retains the LAST shot across drill re-lays; it
  // must never manufacture eligibility before any stroke exists
  await chrome.eval('__export.open()');
  await sleep(200);
  const bootNote = await chrome.eval(
    'document.getElementById("ob-x-note")?.textContent ?? ""');
  const playFirstMsg = await chrome.eval('__i18n.t("export.playFirst")');
  if (bootNote !== playFirstMsg) {
    fail(`fresh-boot note "${bootNote}" is not export.playFirst`);
  }
  if (!(await chrome.eval(
    'document.getElementById("ob-x-start")?.disabled === true'))) {
    fail('fresh boot: Export start enabled before any stroke');
  }
  await chrome.eval('__export.close()'); // the dialog arm below re-opens
  await sleep(400);                      // fresh (machine-factor probe runs)
  if (!process.exitCode) {
    console.log('[fresh-boot] OK — dialog gated (play a shot first) before any stroke');
  }

  // ---- a short settled shot to export --------------------------------------
  const err = await chrome.eval(
    '__test.shoot({ v0: 1.2, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (err) throw new Error('shot rejected: ' + err);
  const dur = await chrome.eval('__test.duration()');
  await chrome.eval('__test.seek(__test.duration() + 1)');
  await sleep(1200); // settle → shotComplete → AIM
  console.log(`[setup] shot settled, kernel duration ${dur.toFixed(2)} s`);

  // ---- dialog flow ----------------------------------------------------------
  const support = await chrome.eval('__export.open().then(() => __export.support())');
  await sleep(200);
  if (!support.webcodecs) throw new Error('this Chrome has no WebCodecs — cannot gate');
  if (!(await chrome.eval('document.getElementById("ob-export-modal") !== null'))) {
    fail('no export modal after open()');
  }
  if ((await chrome.eval('document.querySelectorAll("#ob-export-card .tier").length')) !== 6) {
    fail('expected 6 tier rows in the dialog'); // #259: +cinematic
  }
  const eta = await chrome.eval('__export.etaText("high")');
  if (!/^~\d+(\.\d+)? ?(s|min)/.test(eta ?? '')) fail(`ETA text not sane: "${eta}"`);
  else console.log(`[dialog] OK — high tier shows "${eta}"`);
  const factor = await chrome.eval('__export.factor()');
  if (!(factor >= 0.5 && factor <= 8)) fail(`probe factor ${factor} outside [0.5, 8]`);
  await tierWall('play-tiers'); // the play-mode column of the mode matrix

  // ---- High tier, small settings + keepBytes --------------------------------
  const W = 640, H = 360;
  const res1 = await chrome.eval(`__export.start('high',
    { width: ${W}, height: ${H}, noDownload: true, hashFrames: true, keepBytes: true })`);
  // LAND-16 Z2 (review round 3 P2): the law is the export's own plan — max(duration + cueTail, sinkCompletionSec(duration, sink index)) with ONE
  // TAIL_SEC (cueTail 0 in this boot: the cue seam is not armed); a record whose drops end inside the record plans exactly as before. The
  // slow-scratch record (S2p v0 0.935) and the runExport call-site plant are the e2e-export-z2.mjs suite's rows.
  const sinksForLaw = await chrome.eval('JSON.stringify(window.__test.sinkInfo ? __test.sinkInfo() : [])');
  const completionForLaw = sinkCompletionSec(dur, JSON.parse(sinksForLaw).map((e) => ({ t: e.t, pivot: { tEnd: e.tEnd } })));
  const want = planPlayback({ duration: Math.max(dur, completionForLaw), slowmo: 1, tailSec: TAIL_SEC, maxSec: 60 }).frames;
  if (completionForLaw > dur) console.log(`[setup] the record's last drop ends at ${completionForLaw.toFixed(4)} s (> duration ${dur.toFixed(4)}) — the plan covers it`);
  if (!res1) fail('high-tier export returned null');
  else {
    if (res1.frames !== want) fail(`frames ${res1.frames}, want ${want} (planPlayback)`);
    if (res1.ext !== 'mp4') fail(`ext ${res1.ext}, want mp4 (support says avc+aac ok)`);
    if (!(res1.size > 50_000)) fail(`file only ${res1.size} bytes`);
    if (res1.hashes?.length !== res1.frames) fail('hash count != frame count');
    const file = path.join(OUTDIR, 'high.mp4');
    fs.writeFileSync(file, Buffer.from(res1.b64, 'base64'));
    const probe = (args) => execFileSync('ffprobe',
      ['-v', 'error', ...args, file]).toString().trim();
    const vcodec = probe(['-select_streams', 'v:0', '-show_entries',
      'stream=codec_name', '-of', 'default=nw=1:nk=1']);
    const acodec = probe(['-select_streams', 'a:0', '-show_entries',
      'stream=codec_name', '-of', 'default=nw=1:nk=1']);
    const nframes = Number(probe(['-select_streams', 'v:0', '-count_frames',
      '-show_entries', 'stream=nb_read_frames', '-of', 'default=nw=1:nk=1']));
    const fdur = Number(probe(['-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1']));
    if (vcodec !== 'h264') fail(`video codec ${vcodec}, want h264`);
    if (acodec !== 'aac') fail(`audio codec ${acodec}, want aac`);
    if (nframes !== res1.frames) fail(`mp4 has ${nframes} frames, app reported ${res1.frames}`);
    if (Math.abs(fdur - res1.frames / 60) > 0.15) {
      fail(`mp4 duration ${fdur}, want ≈ ${(res1.frames / 60).toFixed(2)}`);
    }
    // a/v sync: the cue-strike tick scheduled at t=0 must SOUND at t≈0 —
    // the AAC priming delay is compensated via a measured edts/elst
    // (offline-render.js measureAacEncoderDelay + vendored-muxer patch);
    // ffmpeg honors the edit list, so the decoded onset is the user's.
    const rawAudio = path.join(OUTDIR, 'high-audio.f32');
    execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', 'a:0',
      '-ac', '1', '-ar', '48000', '-f', 'f32le', rawAudio]);
    const rawBuf = fs.readFileSync(rawAudio);
    const pcm = new Float32Array(rawBuf.buffer, rawBuf.byteOffset,
      Math.floor(rawBuf.length / 4));
    let onset = -1;
    for (let i = 0; i < pcm.length; i++) {
      if (Math.abs(pcm[i]) > 0.01) { onset = i; break; }
    }
    if (onset < 0) fail('exported audio is silent — no cue-strike onset found');
    else if (onset / 48000 > 0.006) {
      fail(`t=0 cue tick sounds at ${(onset / 48000 * 1000).toFixed(1)} ms — `
        + 'AAC priming delay not compensated (want ≤ 6 ms)');
    } else {
      console.log(`[audio] OK — cue-strike onset at `
        + `${(onset / 48000 * 1000).toFixed(2)} ms (priming compensated)`);
    }
    // ---- #197 (d) decoded cadence, OFFLINE leg: the actual DECODED frame
    // timeline must be strictly monotonic and EXACTLY even (offline frames
    // carry timestamps k/60 by construction — planPlayback is the one
    // cadence source, so any dup/drop/gap here is a muxer/encoder defect,
    // the class the owner reported as stutter).
    const ptsOff = probe(['-select_streams', 'v:0', '-show_entries',
      'frame=pts_time', '-of', 'default=nw=1:nk=1'])
      .split('\n').map(Number).filter((x) => Number.isFinite(x));
    if (ptsOff.length !== res1.frames) {
      fail(`[#197 cadence] offline mp4 decoded ${ptsOff.length} PTS entries, `
        + `want ${res1.frames}`);
    }
    let offNonMono = 0;
    let offMaxDev = 0;
    for (let i = 1; i < ptsOff.length; i++) {
      const d = ptsOff[i] - ptsOff[i - 1];
      if (d <= 0) offNonMono++;
      offMaxDev = Math.max(offMaxDev, Math.abs(d - 1 / 60));
    }
    if (offNonMono > 0) {
      fail(`[#197 cadence] offline mp4 has ${offNonMono} non-increasing PTS `
        + 'steps (dup/reordered frames)');
    }
    if (offMaxDev > 0.001) {
      fail(`[#197 cadence] offline mp4 PTS deltas deviate up to `
        + `${(offMaxDev * 1000).toFixed(2)} ms from 1/60 s (want ≤ 1 ms — `
        + 'even by construction)');
    }
    if (offNonMono === 0 && offMaxDev <= 0.001) {
      console.log(`[#197 cadence] OK — offline leg: ${ptsOff.length} decoded `
        + `frames, strictly monotonic, max |delta - 1/60| = `
        + `${(offMaxDev * 1000).toFixed(3)} ms`);
    }
    if (!process.exitCode) {
      console.log(`[high] OK — ${file}: ${res1.frames} frames, `
        + `${(res1.size / 1024).toFixed(0)} KB, ${vcodec}+${acodec}, ${fdur.toFixed(2)} s `
        + `(rendered in ${res1.wallSec.toFixed(1)} s)`);
    }
  }
  // ---- determinism: same record/tier/size ⇒ identical pre-encode hashes ----
  const res2 = await chrome.eval(`__export.start('high',
    { width: ${W}, height: ${H}, noDownload: true, hashFrames: true })`);
  if (!res2?.hashes) fail('second export produced no hashes');
  else if (JSON.stringify(res2.hashes) !== JSON.stringify(res1?.hashes ?? [])) {
    const diff = res2.hashes.findIndex((h, i) => h !== res1.hashes[i]);
    fail(`frame hashes differ between identical exports (first at frame ${diff})`);
  } else console.log(`[determinism] OK — ${res2.hashes.length} frame hashes identical across runs`);

  // ==== GH-329: WYSIWYG exposure — delivered pixels match the live bed ========
  // journey-QA measured exported clips ~21% uniformly darker than the live
  // player bed. Pixel-truth root cause: EXPORT_TIERS carried grade:'sp' (the
  // SP film grade whose curve was measured OURS→SP for the node marketing
  // replica) on every offline tier while the live bed and the realtime tier
  // never grade — graded/live luma fit 0.736·x + 2.5. The encode legs and
  // color metadata were CLEAN (decoded mp4/webm = pre-encode frame ±1 LSB;
  // limited-range bt709 tagged in container AND bitstream, honored on
  // decode), so the fix zeroes the tier grade knob and this arm stands as
  // the permanent WYSIWYG fingerprint. RED pre-fix: flat cloth cells decode
  // ~25 LSB dark (23.6% mean-luma drop).
  //   (a) a mid-shot frame exported through the REAL path (standard tier,
  //       mp4 AND webm) matches a live-bed readback of the SAME frame at
  //       export geometry within encoder noise: flat 40×40 cells ≤ 4 LSB
  //       per channel (measured encode noise ≤ 1.9) and whole-frame mean
  //       luma within 3% (the QA gap was ~24%);
  //   (b) ffprobe tag wall per delivered container: color_range=tv +
  //       bt709 space/transfer/primaries on the stream AND the first
  //       decoded frame — the tag/data pairing that makes (a)'s decode
  //       honest; any future encoder/muxer colorSpace drift reddens here.
  {
    const c329 = failCount;
    const W3 = 640, H3 = 360, K3 = 30;
    // REPLAY the settled setup shot (never a fresh stroke: downstream arms
    // pin `want`/`dur` against the setup record) — the HUD button is the
    // real user path into PLAYBACK, where renderAt(t) seeks the sampler.
    // The determinism arm's export hands the RAF loop a REPLAY settle
    // (main.js manual-mode contract), so the bed is still in PLAYBACK for
    // ~dur seconds here — wait for AIM + the armed button before clicking.
    let rep3 = 'replay button never armed';
    for (let i = 0; i < 120; i++) {
      const armed = await chrome.eval(`__test.state() === 'AIM'
        && document.getElementById('replay')?.disabled === false`);
      if (armed) {
        rep3 = null;
        await chrome.eval('document.getElementById("replay").click()');
        break;
      }
      await sleep(300);
    }
    if (rep3) fail(`[GH-329 wysiwyg] ${rep3}`);
    await sleep(300); // playback is rolling — freeze it mid-shot
    await chrome.eval('__test.pause(true); __test.setManual(true); true');
    const t3 = planPlayback({ duration: dur, slowmo: 1,
      tailSec: TAIL_SEC, maxSec: 60 }).timeAt(K3);
    // live-bed truth at export geometry (the renderTimeline pins: DPR 1,
    // composer ratio 1, output-sized buffer, spec aspect) — the pixels the
    // user's live player bed shows for this frame, grade-less
    const liveUrl = await chrome.eval(`(() => {
      const r = window.__dbg.renderer, comp = window.__dbg.composer,
        cam = window.__dbg.camera;
      const pr0 = r.getPixelRatio();
      const cw0 = r.domElement.width / pr0, ch0 = r.domElement.height / pr0;
      const prC0 = comp.__obCine?.pixelRatio ?? 1;
      const aspect0 = cam.aspect;
      r.setPixelRatio(1); comp.setPixelRatio(1);
      r.setSize(${W3}, ${H3}, false); comp.setSize(${W3}, ${H3});
      cam.aspect = ${W3} / ${H3}; cam.updateProjectionMatrix();
      __test.renderAt(${t3});
      const c2d = document.createElement('canvas');
      c2d.width = ${W3}; c2d.height = ${H3};
      const ctx = c2d.getContext('2d');
      ctx.drawImage(r.domElement, 0, 0, ${W3}, ${H3});
      const url = c2d.toDataURL('image/png');
      r.setPixelRatio(pr0); r.setSize(cw0, ch0, false);
      comp.setPixelRatio(prC0); comp.setSize(cw0, ch0);
      cam.aspect = aspect0; cam.updateProjectionMatrix();
      return url;
    })()`);
    const livePng = path.join(OUTDIR, 'wysiwyg-live.png');
    fs.writeFileSync(livePng, Buffer.from(liveUrl.split(',')[1], 'base64'));
    const rgbOf = (input, out, frame) => {
      const p = path.join(OUTDIR, out);
      execFileSync('ffmpeg', ['-v', 'error', '-i', input,
        ...(frame !== undefined ? ['-vf', `select=eq(n\\,${frame})`] : []),
        '-vsync', '0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-y', p]);
      return fs.readFileSync(p);
    };
    // 16×9 grid of 40×40 cells: per-channel means + live-luma variance
    // (flat cells only — edges/balls carry legitimate resample noise)
    const cellMeans = (buf) => {
      const out = [];
      for (let cy = 0; cy < 9; cy++) {
        for (let cx = 0; cx < 16; cx++) {
          let sr = 0, sg = 0, sb = 0, sy = 0, syy = 0, n = 0;
          for (let y = cy * 40; y < cy * 40 + 40; y++) {
            for (let x = cx * 40; x < cx * 40 + 40; x++) {
              const i = (y * W3 + x) * 3;
              const Y = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
              sr += buf[i]; sg += buf[i + 1]; sb += buf[i + 2];
              sy += Y; syy += Y * Y; n++;
            }
          }
          out.push({ r: sr / n, g: sg / n, b: sb / n,
            y: sy / n, v: syy / n - (sy / n) ** 2 });
        }
      }
      return out;
    };
    const live3 = rgbOf(livePng, 'wysiwyg-live.rgb');
    const liveCells = cellMeans(live3);
    const meanLuma = (cells) => cells.reduce((s, c) => s + c.y, 0) / cells.length;
    await chrome.eval('__export.open()');
    await sleep(200);
    for (const fmt of ['mp4', 'webm']) {
      const r3 = await chrome.eval(`__export.start('standard',
        { width: ${W3}, height: ${H3}, noDownload: true, keepBytes: true,
          withAudio: false, format: '${fmt}' })`);
      if (!r3?.b64) {
        fail(`[GH-329 wysiwyg] ${fmt} export produced no bytes`);
        continue;
      }
      const file = path.join(OUTDIR, `wysiwyg.${fmt}`);
      fs.writeFileSync(file, Buffer.from(r3.b64, 'base64'));
      // (b) the tag wall — stream AND first decoded frame
      const tagWall = (args, what) => {
        const got = execFileSync('ffprobe', ['-v', 'error',
          '-select_streams', 'v:0', ...args,
          '-of', 'default=nw=1', file]).toString();
        for (const [k, want] of [['color_range', 'tv'],
          ['color_space', 'bt709'], ['color_transfer', 'bt709'],
          ['color_primaries', 'bt709']]) {
          const m = new RegExp(`${k}=(\\S+)`).exec(got);
          if (m?.[1] !== want) {
            fail(`[GH-329 wysiwyg] ${fmt} ${what} ${k}=${m?.[1] ?? 'MISSING'}, `
              + `want ${want}`);
          }
        }
      };
      tagWall(['-show_entries',
        'stream=color_range,color_space,color_transfer,color_primaries'],
      'stream');
      tagWall(['-read_intervals', '%+#1', '-show_entries',
        'frame=color_range,color_space,color_transfer,color_primaries'],
      'frame');
      // (a) the pixel fingerprint at frame K3
      const dec = rgbOf(file, `wysiwyg-${fmt}.rgb`, K3);
      if (dec.length !== live3.length) {
        fail(`[GH-329 wysiwyg] ${fmt} decoded frame size ${dec.length}, `
          + `want ${live3.length}`);
        continue;
      }
      const decCells = cellMeans(dec);
      let worst = 0, flats = 0;
      for (let i = 0; i < liveCells.length; i++) {
        if (liveCells[i].v >= 12) continue; // flat cells only
        flats++;
        worst = Math.max(worst,
          Math.abs(liveCells[i].r - decCells[i].r),
          Math.abs(liveCells[i].g - decCells[i].g),
          Math.abs(liveCells[i].b - decCells[i].b));
      }
      const gap = 1 - meanLuma(decCells) / meanLuma(liveCells);
      if (!(flats >= 10)) {
        fail(`[GH-329 wysiwyg] only ${flats} flat cells — probe frame lost `
          + 'its flat patches (framing drift?)');
      }
      if (!(worst <= 4)) {
        fail(`[GH-329 wysiwyg] ${fmt} flat-cell channel delta ${worst.toFixed(2)} `
          + 'LSB vs the live bed (want ≤ 4 — encode noise measures ≤ 1.9; '
          + 'the pre-fix film grade measured ~25)');
      }
      if (!(Math.abs(gap) <= 0.03)) {
        fail(`[GH-329 wysiwyg] ${fmt} mean-luma gap ${(gap * 100).toFixed(1)}% `
          + 'vs the live bed (want ≤ 3% — the QA-measured pre-fix gap was ~24%)');
      }
      if (worst <= 4 && Math.abs(gap) <= 0.03) {
        console.log(`[GH-329 wysiwyg] ${fmt}: flat-cell worst delta `
          + `${worst.toFixed(2)} LSB, mean-luma gap ${(gap * 100).toFixed(2)}% `
          + `over ${flats} flat cells; tags tv/bt709 ✓`);
      }
    }
    // hand the table back settled (the [setup] discipline) for later arms
    await chrome.eval('__test.setManual(false); __test.pause(false); '
      + '__test.seek(__test.duration() + 1); true');
    await sleep(1200);
    let st3 = null;
    for (let i = 0; i < 100 && st3 !== 'AIM'; i++) {
      await sleep(300);
      st3 = await chrome.eval('__test.state()');
    }
    if (st3 !== 'AIM') fail(`[GH-329 wysiwyg] table never settled back (${st3})`);
    if (failCount === c329) {
      console.log('[GH-329 wysiwyg] OK — delivered mp4+webm match the live '
        + 'bed within encoder noise; limited-range bt709 tags pinned');
    }
  }

  // ==== issue #259: cinematic tier — knobs, gate, A/A determinism =============
  // NEW-numbered arm (additive-lane convention): every assertion here claims
  // a #259 surface; no pre-existing arm changes meaning.
  // Settle-to-AIM discipline for every dof-tier export in these arms (the
  // F-drill waitAim law): frame 0's DOF focus reads the cue mesh's LAST
  // LIVE-RENDERED pose (the record.mjs previous-frame convention), so an
  // export started mid-settle inherits ambient state into frame 0 — a
  // PRE-EXISTING engine convention (standard, dof 0, is immune; the
  // untouched [determinism] arm's back-to-back runs share their prev-state
  // by construction). The arms settle so the EXACT full-clip assertions
  // stay the ruled surface.
  const waitAim259 = async (tag) => {
    let st = null;
    for (let i = 0; i < 100 && st !== 'AIM'; i++) {
      await sleep(300);
      st = await chrome.eval('__test.state()');
    }
    if (st !== 'AIM') fail(`${tag} table never settled to AIM (${st})`);
  };
  {
    const c259 = failCount;
    // (a) knob truth + effectiveKnobs resolution: the tier row carries the
    // designed knobs; on this fine-pointer session effectiveKnobs is the
    // IDENTITY for every tier, and under a coarse matchMedia it resolves the
    // mobile override (ssaa 1 / shutter 4) for cinematic ONLY.
    const kn = await chrome.eval(`(async () => {
      const m = await import('/app/export.js');
      const t = m.EXPORT_TIERS.cinematic;
      const desk = m.effectiveKnobs(t);
      const stdIdent = m.effectiveKnobs(m.EXPORT_TIERS.standard)
        === m.EXPORT_TIERS.standard;
      const orig = window.matchMedia;
      window.matchMedia = (q) => (q === '(pointer: coarse)'
        ? { matches: true } : orig.call(window, q));
      const mob = m.effectiveKnobs(t);
      const mobStdIdent = m.effectiveKnobs(m.EXPORT_TIERS.standard)
        === m.EXPORT_TIERS.standard;
      window.matchMedia = orig;
      return {
        row: { ssaa: t.ssaa, shutter: t.shutter, shutterdeg: t.shutterdeg,
          grade: t.grade, dof: t.dof, res: t.resolutions, def: t.defaultRes },
        deskIdent: desk === t, stdIdent, mobStdIdent,
        mob: { ssaa: mob.ssaa, shutter: mob.shutter, grade: mob.grade,
          shutterdeg: mob.shutterdeg },
      };
    })()`);
    // grade 0 (GH-329 WYSIWYG law): NO in-app tier grades — the SP curve
    // darkened deliveries ~23% against the live bed; node-pipeline-only now
    const wantRow = { ssaa: 2, shutter: 8, shutterdeg: 310, grade: 0,
      // dof 0 (owner A/B defect): static-frame sharpness must BEAT default
      // — the ssaa2 point of the tier; see the EXPORT_TIERS.cinematic note
      dof: 0, res: [[1280, 720], [1920, 1080]], def: [1920, 1080] };
    if (JSON.stringify(kn.row) !== JSON.stringify(wantRow)) {
      fail('[#259] cinematic tier knobs drifted: ' + JSON.stringify(kn.row));
    }
    if (!kn.deskIdent || !kn.stdIdent || !kn.mobStdIdent) {
      fail('[#259] effectiveKnobs must be the IDENTITY for fine-pointer '
        + 'cinematic and for mobile-less tiers in EITHER register: '
        + JSON.stringify(kn));
    }
    if (!(kn.mob.ssaa === 1 && kn.mob.shutter === 4 && kn.mob.grade === 0
      && kn.mob.shutterdeg === 310)) {
      // grade must resolve 0 on BOTH device classes (GH-329: the mobile
      // override inherits the tier's grade — a coarse-pointer export must
      // never re-grow the film grade the WYSIWYG law removed)
      fail('[#259] coarse-pointer cinematic knobs must resolve the mobile '
        + 'override (ssaa 1 / shutter 4, grade+shutterdeg inherited): '
        + JSON.stringify(kn.mob));
    }
    // (b) offer gate: headless Chrome float-blends, so tiers() must OFFER
    // cinematic at mp4 and the support probe must mirror it
    const t259 = await chrome.eval('__export.tiers()');
    if (t259.cinematic !== 'mp4') {
      fail(`[#259] tiers().cinematic = ${JSON.stringify(t259.cinematic)}, `
        + 'want mp4 (float-blend-capable Chrome must offer it)');
    }
    if ((await chrome.eval('__export.support()'))?.floatBlend !== true) {
      fail('[#259] detectExportSupport().floatBlend not true on this Chrome');
    }
    // (b3) review r2: the estimate prices the studio-lighting variant ABOVE
    // plain cinematic (never plain pricing under a cinelight label)
    const estCl = await chrome.eval(`(() => ({
      plain: window.__export.estimateDrill({ tier: 'cinematic', sec: 10 }).etaSec,
      lit: window.__export.estimateDrill({ tier: 'cinematic', sec: 10,
        cinelight: true }).etaSec }))()`);
    if (!(estCl.lit > estCl.plain)) {
      fail('[#259] cinelight estimate does not price the studio-lighting '
        + 'cost: ' + JSON.stringify(estCl));
    }
    // (b4) review r2: the 710 MB ruling holds at the ENTRY point — a 4K
    // cinematic request is REFUSED, never a 7680×4320 allocation
    const ceil = await chrome.eval(`__export.start('cinematic',
      { width: 3840, height: 2160, noDownload: true })
      .then(() => 'rendered').catch((e) => String(e?.message ?? e))`);
    if (!/1080p|node-pipeline/.test(ceil)) {
      fail(`[#259] cinematic 4K request not refused: "${ceil}"`);
    }
    // (c) A/A determinism at the tier's own knobs (ssaa 2 → 1280×720
    // rendered for a 640×360 output): two runs, exact identical pre-encode
    // hashes — the ruled assertion surface, same-boot EXACT equality
    await waitAim259('[#259 cinematic pre-A]');
    const cRes1 = await chrome.eval(`__export.start('cinematic',
      { width: ${W}, height: ${H}, noDownload: true, hashFrames: true })`);
    if (!cRes1) fail('[#259] first cinematic export returned null');
    else {
      if (cRes1.frames !== want) {
        fail(`[#259] cinematic frames ${cRes1.frames}, want ${want} (planPlayback)`);
      }
      if (cRes1.ext !== 'mp4') fail(`[#259] ext ${cRes1.ext}, want mp4`);
      if (cRes1.hashes?.length !== cRes1.frames) {
        fail('[#259] hash count != frame count');
      }
    }
    await waitAim259('[#259 cinematic pre-B]');
    const cRes2 = await chrome.eval(`__export.start('cinematic',
      { width: ${W}, height: ${H}, noDownload: true, hashFrames: true })`);
    if (!cRes2?.hashes) fail('[#259] second cinematic export produced no hashes');
    else if (JSON.stringify(cRes2.hashes) !== JSON.stringify(cRes1?.hashes ?? [])) {
      const diff = cRes2.hashes.findIndex((h, i) => h !== cRes1.hashes[i]);
      fail(`[#259] cinematic frame hashes differ between identical exports `
        + `(first at frame ${diff})`);
    }
    // (d) gated-GPU shape: with the float-blend gate FORCED closed (fresh
    // export instance over a renderer whose extensions probe false),
    // tiers() omits cinematic entirely and the dialog row falls back to the
    // export.unavailable disabled pattern — asserted UNIT-style on the live
    // module state via a scratch renderer facade is impossible here (the
    // gate caches per createExport), so the arm pins the OFFER side the
    // playback picker consumes: cinematic present ⇔ gate green.
    if (!('cinematic' in t259)) {
      fail('[#259] tiers() must carry cinematic on a float-blend Chrome');
    }
    if (failCount === c259) {
      console.log(`[#259 cinematic] OK — knobs pinned (desktop ssaa2/shutter8, `
        + `mobile ssaa1/shutter4), offered at mp4, floatBlend probed, `
        + `${cRes2.hashes.length} A/A frame hashes identical`);
    }
  }

  // ==== issue #259 slice 2: cinelight — revert proof, A/A, abort ==============
  // NEW-numbered arms. (a) REVERT PROOF is THE gameplay-look-untouched pinned
  // proof: standard-tier hashes H1, then a cinematic+cinelight export, then
  // standard again H2 — H1 === H2 EXACTLY (same boot, the ruled #243
  // assertion surface) AND the scene invariants (toneMappingExposure,
  // full-precision material colors, light census/intensities, far-group
  // visibility, scene.environment identity) equal their pre-values.
  {
    const cl0 = failCount;
    // one full-precision scene snapshot expression, reused pre/post
    await chrome.eval('window.__envRef = window.__dbg.scene.environment; true');
    const sceneSnap = `(() => {
      const s = window.__dbg.scene;
      const out = { exposure: window.__dbg.renderer.toneMappingExposure,
        pointLights: 0, rects: [], hemis: [], far: [], mats: [],
        envSame: s.environment === window.__envRef };
      const seen = new Set();
      s.traverse((o) => {
        if (o.isPointLight) { out.pointLights++; }
        if (o.isRectAreaLight) out.rects.push(o.intensity);
        if (o.isHemisphereLight) out.hemis.push(o.intensity);
        if (o.isGroup && o.name === 'obFarPropTable') out.far.push(o.visible);
        if (o.isMesh && o.material?.color && !seen.has(o.material)) {
          seen.add(o.material);
          out.mats.push([o.material.color.r, o.material.color.g,
            o.material.color.b]);
        }
      });
      return out;
    })()`;
    const preSnap = await chrome.eval(sceneSnap);
    await waitAim259('[#259 revert pre-H1]');
    const clH1 = await chrome.eval(`__export.start('standard',
      { width: ${W}, height: ${H}, noDownload: true, hashFrames: true,
        withAudio: false })`);
    if (!clH1?.hashes?.length) fail('[#259 revert] H1 standard export produced no hashes');
    await waitAim259('[#259 revert pre-cine]');
    const clCine = await chrome.eval(`__export.start('cinematic',
      { width: ${W}, height: ${H}, noDownload: true, hashFrames: true,
        withAudio: false, cinelight: true })`);
    if (!clCine?.hashes?.length) {
      fail('[#259 revert] cinematic+cinelight export produced no hashes');
    } else if (JSON.stringify(clCine.hashes) === JSON.stringify(clH1?.hashes)) {
      fail('[#259 revert] cinelight export hashed IDENTICAL to standard — '
        + 'the studio rig changed nothing (install did not run?)');
    }
    await waitAim259('[#259 revert pre-H2]');
    const clH2 = await chrome.eval(`__export.start('standard',
      { width: ${W}, height: ${H}, noDownload: true, hashFrames: true,
        withAudio: false })`);
    if (!clH2?.hashes) fail('[#259 revert] H2 standard export produced no hashes');
    else if (JSON.stringify(clH2.hashes) !== JSON.stringify(clH1?.hashes ?? [])) {
      const diff = clH2.hashes.findIndex((h, i) => h !== clH1.hashes[i]);
      fail(`[#259 revert] standard hashes DIFFER around the cinelight export `
        + `(first at frame ${diff}) — the revert is lossy (#243-class drift)`);
    }
    const postSnap = await chrome.eval(sceneSnap);
    if (JSON.stringify(postSnap) !== JSON.stringify(preSnap)) {
      fail('[#259 revert] scene invariants drifted across install+revert: '
        + `pre ${JSON.stringify(preSnap).slice(0, 400)} != post `
        + JSON.stringify(postSnap).slice(0, 400));
    }
    if (failCount === cl0) {
      console.log(`[#259 revert] OK — ${clH1.hashes.length} standard hashes `
        + 'EXACTLY equal around a cinelight export (which itself diverged), '
        + 'scene invariants byte-equal (exposure/lights/colors/far/env)');
    }

    // ---- (b) cinelight A/A determinism ---------------------------------------
    await waitAim259('[#259 cinelight-AA pre-B]');
    const clB = await chrome.eval(`__export.start('cinematic',
      { width: ${W}, height: ${H}, noDownload: true, hashFrames: true,
        withAudio: false, cinelight: true })`);
    if (!clB?.hashes) fail('[#259 cinelight-AA] second cinelight export no hashes');
    else if (JSON.stringify(clB.hashes) !== JSON.stringify(clCine?.hashes ?? [])) {
      const diff = clB.hashes.findIndex((h, i) => h !== clCine.hashes[i]);
      fail(`[#259 cinelight-AA] cinelight frame hashes differ between `
        + `identical exports (first at frame ${diff})`);
    } else {
      console.log(`[#259 cinelight-AA] OK — ${clB.hashes.length} cinelight `
        + 'frame hashes identical across runs');
    }

    // ---- (b2) camera independence (review round-1 P1) --------------------------
    // A drill cinelight export with its OWN segment camera must light
    // identically no matter where the LIVE camera happened to be when the
    // export started — the rims are posed from the camera frame, so the
    // install must follow the segment-0 directive, never the ambient view
    // (RED on the pre-fix tree: the STATIC rims moved with the live pose,
    // so EVERY frame differed). Frame 0 is deliberately outside the
    // assertion: a preset-camera drill render carries a pre-existing
    // ONE-FRAME warm-up transient seeded from the last live RAF frame —
    // measured identically on the cinelight-OFF control and on the
    // unmodified engine path (this wave changes nothing about it); the
    // camera pose/fov/exposure at frame 0 are already byte-equal, and
    // frames 1..N are the lit-by-the-rig surface this arm pins.
    {
      const ci0 = failCount;
      const camPose = await chrome.eval(`(() => {
        const c = window.__dbg.camera;
        return { p: c.position.toArray(), fov: c.fov };
      })()`);
      const drillCine = () => chrome.eval(`__export.renderDrill(
        [__share.records()[0]], { tier: 'cinematic', cinelight: true,
          width: 320, height: 180, noDownload: true, withAudio: false,
          hashFrames: true, perShotCamera: ['top'] })`);
      // settle to AIM before EACH run (the F-drill waitAim discipline): the
      // private env bake photographs the CURRENT scene — a run started
      // mid-settle bakes a mid-transition cue/table into the reflections
      // and the comparison stops isolating the camera variable
      await waitAim259('[#259 cam-independence pre-A]');
      await chrome.eval('__test.camera(1.4, 0.9, 1.1, 0, 0.05, 0, 40)');
      const ciA = await drillCine();
      await waitAim259('[#259 cam-independence pre-B]');
      await chrome.eval('__test.camera(-1.8, 0.3, -0.4, 0, 0.05, 0, 24)');
      const ciB = await drillCine();
      await waitAim259('[#259 cam-independence post]');
      if (!ciA?.hashes?.length || ciA.hashes.length !== ciB?.hashes?.length) {
        fail('[#259 cam-independence] drill cinelight renders produced no '
          + 'comparable hashes');
      } else {
        const litDiffs = [];
        for (let i = 1; i < ciA.hashes.length; i++) {
          if (ciA.hashes[i] !== ciB.hashes[i]) litDiffs.push(i);
        }
        if (litDiffs.length) {
          fail('[#259 cam-independence] the ambient live camera leaked into '
            + `the studio lighting (${litDiffs.length} lit frames differ, `
            + `first at ${litDiffs[0]}) — the install must follow the `
            + 'segment-0 camera');
        } else if (failCount === ci0) {
          console.log(`[#259 cam-independence] OK — frames 1..`
            + `${ciA.hashes.length - 1} identical across two live camera `
            + 'poses (static rims posed from the segment camera)');
        }
      }
      // put the live camera back where the arm found it
      await chrome.eval(`__test.camera(${camPose.p[0]}, ${camPose.p[1]}, `
        + `${camPose.p[2]}, 0, 0.05, 0, ${camPose.fov})`);
    }

    // ---- (b3) GH-1103: the studio bake keeps the gameplay visuals out ----------
    // From AIM with assist on, the live rod and the preview are VISIBLE when the
    // export installs cinelight (renderTimeline goes manual + PLAYBACK with no
    // frame before the install). Census every visible obCueStick / obAim* node
    // during the private cube's face renders (a cube target other than the
    // gameplay __dbg.cubeRT): it must be empty — after the census saw the bake
    // (>= 6 faces) and the precondition held (rod + preview content visible).
    {
      const b30 = failCount;
      await waitAim259('[#1103 bake census pre]');
      const SHOWN = 'const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };';
      const pre = await chrome.eval(`(() => { ${SHOWN}
        let rod = 0, prev = 0;
        window.__dbg.scene.traverse((o) => {
          const nm = o.name || '';
          if (nm === 'obCueStick' && shown(o)) rod++;
          if (nm.startsWith('obAimPreview') && shown(o)) o.traverse((c) => { if (c !== o && shown(c) && (c.isMesh || c.isLine || c.isSprite)) prev++; });
        });
        return { assist: window.__aim?.getAssist?.() ?? null, rod, prev }; })()`);
      await chrome.eval(`(() => { ${SHOWN}
        const r = window.__dbg.renderer, gameCube = window.__dbg.cubeRT, orig = r.render;
        window.__c1103 = { faces: 0, leaks: [] }; r.__c1103orig = orig;
        r.render = function (scene, camera) {
          const rt = r.getRenderTarget();
          if (rt && rt.isWebGLCubeRenderTarget && rt !== gameCube) {
            window.__c1103.faces++;
            scene.traverse((o) => { const nm = o.name || '';
              if ((nm === 'obCueStick' || nm.startsWith('obAim')) && shown(o) && o.layers.test(camera.layers)) window.__c1103.leaks.push(nm); });
          }
          return orig.call(this, scene, camera);
        };
        return true; })()`);
      let res = null, cen = null;
      try {
        res = await chrome.eval(`__export.start('cinematic',
          { width: ${W}, height: ${H}, noDownload: true, withAudio: false,
            cinelight: true })`);
      } finally { // the census wrapper never outlives the arm, even on a throwing export
        cen = await chrome.eval(`(() => { const r = window.__dbg.renderer;
          if (r.__c1103orig) { r.render = r.__c1103orig; delete r.__c1103orig; }
          return window.__c1103; })()`);
      }
      if (!pre || pre.assist === 'off' || !(pre.rod >= 1) || !(pre.prev >= 1)) {
        fail('[#1103] precondition: from AIM with assist on, the live rod and the '
          + `preview must be visible before the export: ${JSON.stringify(pre)}`);
      } else if (!res) {
        fail('[#1103] the cinelight export returned null');
      } else if (!cen || !(cen.faces >= 6)) {
        fail(`[#1103] the census never saw the studio bake (faces ${cen?.faces})`);
      } else if (cen.leaks.length) {
        fail(`[#1103] the studio bake photographed gameplay visuals: `
          + `${[...new Set(cen.leaks)].join(', ')} (${cen.leaks.length} node-faces)`);
      } else if (failCount === b30) {
        console.log(`[#1103 bake census] OK — ${cen.faces} private-cube face renders `
          + `from AIM (assist ${pre.assist}, rod ${pre.rod}, preview parts ${pre.prev}), `
          + 'no obCueStick / obAim* node visible in any');
      }
    }

    // ---- (c) abort mid-cinelight-export: revert still ran, no partial file ---
    const clA0 = failCount;
    const lastBeforeCl = JSON.stringify(await chrome.eval(
      '(({ b64, hashes, ...r }) => r)(__export.lastResult())'));
    await chrome.eval(`window.__clAbortRun = __export.start('cinematic',
      { width: 1280, height: 720, noDownload: true, withAudio: false,
        cinelight: true }); undefined`);
    await sleep(900); // a few frames in (ssaa2 → 2560×1440 render)
    if ((await chrome.eval('__export.state()')) !== 'exporting') {
      fail('[#259 abort] cinelight export not running 0.9 s after start');
    }
    await chrome.eval('__export.cancel()');
    if ((await chrome.eval('window.__clAbortRun')) !== null) {
      fail('[#259 abort] cancelled cinelight export still returned a result');
    }
    if (JSON.stringify(await chrome.eval(
      '(({ b64, hashes, ...r }) => r)(__export.lastResult())')) !== lastBeforeCl) {
      fail('[#259 abort] aborted cinelight export mutated lastResult');
    }
    const abortSnap = await chrome.eval(sceneSnap);
    if (JSON.stringify(abortSnap) !== JSON.stringify(preSnap)) {
      fail('[#259 abort] scene invariants NOT restored after the mid-export '
        + 'abort — the finally revert did not run: '
        + JSON.stringify(abortSnap).slice(0, 400));
    }
    if (failCount === clA0) {
      console.log('[#259 abort] OK — mid-cinelight abort: no file, lastResult '
        + 'untouched, studio rig fully reverted');
    }
  }

  // ---- cancel mid-export -----------------------------------------------------
  const size0 = await chrome.eval(
    'JSON.stringify([document.querySelector("canvas").width, document.querySelector("canvas").height])');
  await chrome.eval(`window.__cancelRun = __export.start('cinema4k',
    { width: 1280, height: 720, noDownload: true }); undefined`);
  await sleep(900); // a few frames in
  if ((await chrome.eval('__export.state()')) !== 'exporting') {
    fail('cinema export not running 0.9 s after start');
  }
  await chrome.eval('__export.cancel()');
  const cancelled = await chrome.eval('window.__cancelRun');
  if (cancelled !== null) fail('cancelled export still returned a result');
  if ((await chrome.eval('__export.state()')) !== 'cancelled') {
    fail(`state ${await chrome.eval('__export.state()')} after cancel, want cancelled`);
  }
  if ((await chrome.eval('__export.lastResult()'))?.tier === 'cinema4k') {
    fail('cancelled export left a lastResult file');
  }
  const size1 = await chrome.eval(
    'JSON.stringify([document.querySelector("canvas").width, document.querySelector("canvas").height])');
  if (size0 !== size1) fail(`canvas not restored after cancel: ${size0} → ${size1}`);
  // stale-progress sliver (#81 QA lane D): the cancelled state must clear
  // the bar — a part-filled sliver must not survive under the message
  const progAfterCancel = await chrome.eval(`(() => {
    const wrap = document.getElementById('ob-x-barwrap');
    if (!wrap) return { missing: true };
    return { display: getComputedStyle(wrap).display,
      valuenow: wrap.getAttribute('aria-valuenow') };
  })()`);
  if (progAfterCancel.display !== 'none') {
    fail('cancelled export leaves the progress bar painted: '
      + JSON.stringify(progAfterCancel));
  }
  if (!process.exitCode) console.log('[cancel] OK — aborted cleanly, no file, canvas restored, progress cleared');

  // ---- GH-332: a double-clicked Cancel must not dismiss the dialog ----------
  // REAL pointer input at Cancel's own center. The first click cancels and
  // setUiState reflows the button row; pre-fix the flex row packed Close
  // left INTO Cancel's vacated spot (display:none removes the box), so the
  // second click of a double-click landed on Close and dismissed the whole
  // dialog. The row now keeps Start/Close geometry BYTE-CONSTANT across the
  // state change (Cancel sits last), so the second click hits dead row space.
  {
    const dbl0 = failCount;
    await chrome.eval(`window.__cancelRun2 = __export.start('cinema4k',
      { width: 1280, height: 720, noDownload: true }); undefined`);
    await sleep(900); // a few frames in
    if ((await chrome.eval('__export.state()')) !== 'exporting') {
      fail('[332] cinema export not running 0.9 s after start');
    }
    const g0 = await chrome.eval(`(() => {
      const r = (id) => {
        const b = document.getElementById(id).getBoundingClientRect();
        return [b.x, b.width].map((v) => +v.toFixed(2));
      };
      const c = document.getElementById('ob-x-cancel').getBoundingClientRect();
      return { x: Math.round(c.x + c.width / 2),
        y: Math.round(c.y + c.height / 2), cancelW: c.width,
        start: r('ob-x-start'), close: r('ob-x-close') };
    })()`);
    if (!(g0.cancelW > 0)) fail('[332] Cancel not visible mid-export');
    const click332 = async () => {
      await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
        x: g0.x, y: g0.y, button: 'left', clickCount: 1 });
      await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
        x: g0.x, y: g0.y, button: 'left', clickCount: 1 });
    };
    await click332(); // first click: the REAL cancel
    await sleep(150); // inside the double-click window, pointer unmoved
    if ((await chrome.eval('__export.state()')) !== 'cancelled') {
      fail('[332] first Cancel click did not cancel: '
        + await chrome.eval('__export.state()'));
    }
    // HORIZONTAL geometry is the ruled surface: x/width byte-equal across
    // the state change (the fix's guarantee). The card also shrinks ~7px
    // vertically when the cancelled state hides the progress bar (#81 QA
    // law, out of scope here) — that shift can never park a button under
    // the pointer (Close's x-range excludes Cancel's center by
    // construction), and the elementFromPoint probe below rules on the
    // hazard itself: NOTHING interactive may land under the unmoved pointer.
    const g1 = await chrome.eval(`(() => {
      const r = (id) => {
        const b = document.getElementById(id).getBoundingClientRect();
        return [b.x, b.width].map((v) => +v.toFixed(2));
      };
      const el = document.elementFromPoint(${g0.x}, ${g0.y});
      return { under: el?.id || el?.tagName || 'none',
        underTag: el?.tagName ?? 'none',
        start: r('ob-x-start'), close: r('ob-x-close') };
    })()`);
    if (JSON.stringify(g1.start) !== JSON.stringify(g0.start)
      || JSON.stringify(g1.close) !== JSON.stringify(g0.close)) {
      fail('[332] the cancel reflow MOVED Start/Close horizontally: '
        + JSON.stringify({ before: g0, after: g1 }));
    }
    if (g1.underTag === 'BUTTON') {
      fail(`[332] post-cancel reflow parked ${g1.under} under the pointer`);
    }
    await click332(); // the second click of the double-click
    await sleep(600); // past the exit tween a pre-fix dismissal would start
    const after = await chrome.eval(`(() => ({
      state: __export.state(),
      modal: !!document.getElementById('ob-export-modal'),
      pe: document.getElementById('ob-export-modal')?.style.pointerEvents
        ?? 'gone' }))()`);
    if (after.state !== 'cancelled' || !after.modal || after.pe === 'none') {
      fail('[332] double-clicked Cancel dismissed the whole dialog: '
        + JSON.stringify(after));
    }
    if ((await chrome.eval('window.__cancelRun2')) !== null) {
      fail('[332] the double-clicked cancel still returned a result');
    }
    if (failCount === dbl0) {
      console.log('[332] OK — double-clicked Cancel: run aborted, Start/Close '
        + 'byte-unmoved, second click lands on dead row space, dialog stands');
    }
  }

  // ---- realtime tier (record.js path) ---------------------------------------
  if (!(await chrome.eval('window.__record?.supported === true'))) {
    console.log('[realtime] SOFT-SKIP: MediaRecorder unsupported in this headless build');
  } else {
    // share-leg pin (issue #139 review finding 1, recorded scope): the
    // realtime tier's stop() must carry the photos OPT-OUT hint — the
    // export dialog's downloads keep the obShare share sheet; only the
    // record-control flow routes obPhotos. The behavioral proof (photos
    // seam NOT invoked in a WebKit-shaped boot) is e2e-record.mjs's
    // routing-split arm; this spy pins export.js's side of the contract.
    await chrome.eval(`(() => {
      const orig = window.__record.stop;
      window.__stopCalls = [];
      window.__record.stop = (dl, opts) => {
        window.__stopCalls.push({ photosOptOut: opts?.photos === false });
        return orig(dl, opts);
      };
      return true; })()`);
    // a refused run is a fail LINE, never a suite abort (GH-1125: an empty
    // capture under load now rejects honestly instead of reading 'done')
    const rt = await chrome.eval(`__export.start('realtime', { noDownload: true }).catch((e) => ({ threw: String(e?.message ?? e) }))`);
    if (rt?.threw) fail(`[realtime] the live capture failed: ${rt.threw}`);
    else if (rt?.tier !== 'realtime') fail('realtime tier did not run');
    const stopCalls = await chrome.eval('window.__stopCalls');
    if (!stopCalls?.length || !stopCalls.every((c) => c.photosOptOut)) {
      fail('realtime stop() missing the { photos: false } share-leg hint: '
        + JSON.stringify(stopCalls));
    }
    let size = 0;
    for (let i = 0; i < 40 && !(size > 0); i++) { // record.js assembles async
      await sleep(250);
      size = await chrome.eval('__record.lastSize()');
    }
    if (!(size > 50_000)) fail(`realtime webm only ${size} bytes`);
    else console.log(`[realtime] OK — live-captured webm ${(size / 1024).toFixed(0)} KB, `
      + 'stop() carried the { photos: false } share-leg hint');
  }

  // ---- GH-335: realtime capture FAIL-FASTS when the tab hides ---------------
  // The replay rides the app rAF loop, which browsers suspend for hidden
  // documents: pre-fix the run sat 'exporting' forever (Escape/backdrop
  // pinned by dismissable()) while MediaRecorder ate wall clock into a
  // silently stalled file. Ruled FAIL-FAST (the DVR startRealtime onHide
  // precedent, the ownership ledger GH-250 P1 — record.js pause()/resume() exists
  // but the rAF-freeze/recorder-pause seam is unprovable and a hidden tab
  // paints no notice): on visibilitychange-hidden the run ends NOW, the
  // recorder stops delivering NOTHING, the honest localized
  // export.hiddenStopped message paints. The hide is simulated with the
  // suite's mock idiom (instance-property override + synthetic event) — the
  // handler CONTRACT is the ruled surface, not Chrome's rAF throttling.
  if (!(await chrome.eval('window.__record?.supported === true'))) {
    console.log('[335] SOFT-SKIP: MediaRecorder unsupported in this headless build');
  } else {
    const v0 = failCount;
    await chrome.eval(`(() => {
      window.__stop335orig = window.__record.stop;
      window.__stop335 = [];
      window.__record.stop = (dl, opts) => {
        window.__stop335.push({ dl: dl !== false });
        return window.__stop335orig(dl, opts);
      };
      return true; })()`);
    await chrome.eval(`window.__hideRun = __export.start('realtime',
      { noDownload: true }).then((r) => ({ ok: r }),
      (e) => ({ threw: String(e?.message ?? e) })); undefined`);
    await sleep(700); // a few frames into the live capture
    if ((await chrome.eval('__export.state()')) !== 'exporting') {
      fail('[335] realtime capture not running 0.7 s after start');
    }
    await chrome.eval(`(() => {
      Object.defineProperty(document, 'hidden',
        { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState',
        { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      return true; })()`);
    let st335 = null;
    for (let i = 0; i < 20 && st335 !== 'error'; i++) { // fail-FAST: ~2 s max
      await sleep(100);
      st335 = await chrome.eval('__export.state()');
    }
    if (st335 !== 'error') {
      fail(`[335] hidden tab left the capture in state '${st335}' `
        + '(want the honest error) — the pre-fix silent stall');
    }
    const run335 = await chrome.eval('window.__hideRun');
    const wantMsg = await chrome.eval('__i18n.t("export.hiddenStopped")');
    if (!run335?.threw || !run335.threw.includes(wantMsg)) {
      fail('[335] the run did not reject with export.hiddenStopped: '
        + JSON.stringify(run335));
    }
    const ptext335 = await chrome.eval(
      'document.getElementById("ob-x-ptext")?.textContent ?? ""');
    const wantPaint = await chrome.eval(
      '__i18n.t("export.failed", { message: __i18n.t("export.hiddenStopped") })');
    if (ptext335 !== wantPaint) {
      fail(`[335] card paints "${ptext335}", want "${wantPaint}"`);
    }
    const stops = await chrome.eval('window.__stop335');
    if (!stops?.length || stops.some((c) => c.dl)) {
      fail('[335] recorder not stopped with the download suppressed: '
        + JSON.stringify(stops));
    }
    // a capture STARTED hidden refuses before frame one (same message)
    const startHidden = await chrome.eval(`__export.start('realtime',
      { noDownload: true }).then((r) => ({ ok: r }),
      (e) => ({ threw: String(e?.message ?? e) }))`);
    if (!startHidden?.threw || !startHidden.threw.includes(wantMsg)) {
      fail('[335] a start while hidden was not refused: '
        + JSON.stringify(startHidden));
    }
    const stops2 = await chrome.eval('window.__stop335');
    if (stops2.length !== stops.length) {
      fail('[335] the hidden start still spun the recorder up');
    }
    // restore the boot visibility + the stop seam; let the orphaned replay
    // settle so the next arm's stroke fires from a clean machine
    await chrome.eval(`(() => {
      delete document.hidden;
      delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
      window.__record.stop = window.__stop335orig;
      return document.hidden === false; })()`);
    for (let i = 0; i < 60; i++) {
      const st = await chrome.eval('__test.state()');
      if (st !== 'PLAYBACK' && st !== 'SIMULATING') break;
      await sleep(300);
    }
    if (failCount === v0) {
      console.log('[335] OK — mid-capture hide fail-fasts to the honest '
        + 'export.hiddenStopped error (recorder stopped, no file), and a '
        + 'start while hidden refuses before frame one');
    }
  }

  // ---- GH-1125: an EMPTY live capture fails honestly -------------------------
  // Under heavy load MediaRecorder can deliver no data for a whole capture
  // (two nightly e2e-record reds: a 0-byte webm). record.js finalizes in its
  // ASYNCHRONOUS onstop and skips delivering a 0-byte blob, and the realtime
  // tier returned 'done' as soon as stop() said true — a no-file run sold as
  // finished. The plant is page-side: a MediaRecorder whose dataavailable
  // never reaches record.js (start/stop/onstop stay the real recorder's), so
  // the capture finalizes EMPTY, deterministically. The run must reject with
  // the localized playback.realtimeNoFile message, paint export.failed, keep
  // the previous lastResult and never reach 'done'.
  if (!(await chrome.eval('window.__record?.supported === true'))) {
    console.log('[1125] SOFT-SKIP: MediaRecorder unsupported in this headless build');
  } else {
    const v0 = failCount;
    await chrome.eval(`(() => {
      window.__lr1125 = window.__export.lastResult(); // identity, not JSON: the previous
      // realtime arm's result can serialize identically to a fresh one
      window.__rec1125 = window.__record.lastRecording(); // identity: onstop is ASYNC
      const Native = window.MediaRecorder;
      class EmptyRecorder extends Native {
        get ondataavailable() { return super.ondataavailable; }
        set ondataavailable(fn) { super.ondataavailable = () => {}; } // the data never arrives
      }
      window.__mr1125 = Native;
      window.MediaRecorder = EmptyRecorder;
      return true; })()`);
    // the native recorder comes back IN the page as the run settles, so no
    // later arm can inherit the plant even if this arm's CDP side throws
    const run1125 = await chrome.eval(`__export.start('realtime', { noDownload: true })
      .then((r) => ({ ok: r }), (e) => ({ threw: String(e?.message ?? e) }))
      .finally(() => { window.MediaRecorder = window.__mr1125; delete window.__mr1125; })`);
    if (!(await chrome.eval('window.MediaRecorder?.name !== "EmptyRecorder" && !("__mr1125" in window)'))) {
      fail('[1125] the native MediaRecorder was not restored after the run');
    }
    const st1125 = await chrome.eval('__export.state()');
    let empty1125 = null; // THIS capture's finalized size, read off record.js itself
    for (let i = 0; i < 50 && empty1125 === null; i++) {
      empty1125 = await chrome.eval(
        '__record.lastRecording() !== window.__rec1125 ? __record.lastSize() : null');
      if (empty1125 === null) await sleep(100);
    }
    const want1125 = await chrome.eval('__i18n.t("playback.realtimeNoFile")');
    const paint1125 = await chrome.eval(
      'document.getElementById("ob-x-ptext")?.textContent ?? ""');
    const wantPaint1125 = await chrome.eval(
      '__i18n.t("export.failed", { message: __i18n.t("playback.realtimeNoFile") })');
    const kept1125 = await chrome.eval('__export.lastResult() === window.__lr1125');
    if (empty1125 !== 0) {
      fail(`[1125] the plant did not take: the capture finalized ${empty1125 ?? 'nothing within 5 s'} `
        + '(want a 0-byte blob)');
    } else if (!run1125?.threw || !run1125.threw.includes(want1125)) {
      fail('[1125] an empty capture did not reject with playback.realtimeNoFile: '
        + `${JSON.stringify(run1125)} (state '${st1125}')`);
    }
    if (st1125 !== 'error') fail(`[1125] an empty capture left the dialog in '${st1125}' (want 'error')`);
    if (paint1125 !== wantPaint1125) fail(`[1125] card paints "${paint1125}", want "${wantPaint1125}"`);
    if (!kept1125) {
      fail('[1125] lastResult moved over an empty capture: '
        + JSON.stringify(await chrome.eval('__export.lastResult()')));
    }
    for (let i = 0; i < 60; i++) { // the replay settles before the next arm strokes
      const st = await chrome.eval('__test.state()');
      if (st !== 'PLAYBACK' && st !== 'SIMULATING') break;
      await sleep(300);
    }
    // (b) delivery is export.js's, AFTER verification (the DVR law): a
    // DOWNLOADING run stops the recorder with download=false and reaches the
    // delivery ladder only with a verified non-empty file — never with the
    // empty capture. Page-side spies: __record.deliver records instead of
    // delivering, and anchor clicks are swallowed (record.js's own internal
    // delivery, the pre-fix path), so no file ever lands on disk.
    await chrome.eval(`(() => {
      const L = window.__dl1125 = { stops: [], delivers: [], anchors: 0 };
      const R = window.__record;
      window.__dl1125orig = { stop: R.stop, deliver: R.deliver, click: HTMLAnchorElement.prototype.click };
      R.stop = (dl, o) => { L.stops.push(dl !== false); return window.__dl1125orig.stop(dl, o); };
      // routes like a cached GH-250 record.js: obPhotos unless the caller opts out
      R.deliver = (blob, name, o) => { L.delivers.push({ size: blob.size, name, route: o?.photos === false ? 'share' : 'photos' }); return 'spy'; };
      HTMLAnchorElement.prototype.click = function () { if (this.download) { L.anchors += 1; return; } return window.__dl1125orig.click.call(this); };
      return true; })()`);
    const restore1125 = `(() => { const o = window.__dl1125orig; if (o) { window.__record.stop = o.stop;
      window.__record.deliver = o.deliver; HTMLAnchorElement.prototype.click = o.click; delete window.__dl1125orig; }
      return true; })()`;
    try {
      // the downloading EMPTY run: rejects, delivers nothing
      await chrome.eval(`(() => { const N = window.MediaRecorder; window.__mr1125 = N;
        window.MediaRecorder = class EmptyRecorder extends N {
          get ondataavailable() { return super.ondataavailable; }
          set ondataavailable(fn) { super.ondataavailable = () => {}; } }; return true; })()`);
      const dlEmpty = await chrome.eval(`__export.start('realtime', {})
        .then((r) => ({ ok: r }), (e) => ({ threw: String(e?.message ?? e) }))
        .finally(() => { window.MediaRecorder = window.__mr1125; delete window.__mr1125; })`);
      const e1 = await chrome.eval('JSON.parse(JSON.stringify(window.__dl1125))');
      if (!dlEmpty?.threw?.includes(want1125)) fail(`[1125b] a downloading empty capture did not reject: ${JSON.stringify(dlEmpty)}`);
      if (JSON.stringify(e1.stops) !== '[false]' || e1.delivers.length || e1.anchors) {
        fail(`[1125b] a downloading empty capture must stop with download=false and deliver nothing: ${JSON.stringify(e1)}`);
      }
      for (let i = 0; i < 60; i++) { // the replay settles before the next run strokes
        const st = await chrome.eval('__test.state()');
        if (st !== 'PLAYBACK' && st !== 'SIMULATING') break;
        await sleep(300);
      }
      // the downloading NORMAL run (the real recorder): delivered ONCE, by
      // export.js, after the blob verified non-empty
      await chrome.eval('(window.__dl1125.stops = [], window.__dl1125.delivers = [], window.__dl1125.anchors = 0, true)');
      const dlOk = await chrome.eval(`__export.start('realtime', {})
        .then((r) => ({ ok: r }), (e) => ({ threw: String(e?.message ?? e) }))`);
      const e2 = await chrome.eval('JSON.parse(JSON.stringify(window.__dl1125))');
      const ext1125 = await chrome.eval('__record.ext');
      if (dlOk?.threw || dlOk?.ok?.tier !== 'realtime') fail(`[1125b] a downloading live capture did not finish: ${JSON.stringify(dlOk)}`);
      else if (JSON.stringify(e2.stops) !== '[false]' || e2.anchors || e2.delivers.length !== 1
        || !(e2.delivers[0].size > 50_000) || !new RegExp(`^openbilliards-[0-9-]+\\.${ext1125}$`).test(e2.delivers[0].name)) {
        fail(`[1125b] a downloading live capture must stop with download=false and be delivered ONCE by export.js: ${JSON.stringify(e2)}`);
      } else if (e2.delivers[0].route !== 'share') {
        fail('[1125b] the export\'s delivery must carry the { photos: false } opt-out — a cached GH-250 record.js '
          + `routes it to Photos otherwise: ${JSON.stringify(e2.delivers[0])}`);
      } else {
        console.log(`[1125b] OK — downloading runs: the empty capture delivered nothing; the live one was delivered once `
          + `after verification (${(e2.delivers[0].size / 1024).toFixed(0)} KB "${e2.delivers[0].name}")`);
      }
      for (let i = 0; i < 60; i++) {
        const st = await chrome.eval('__test.state()');
        if (st !== 'PLAYBACK' && st !== 'SIMULATING') break;
        await sleep(300);
      }
      // (c) the settle-lock and another owner's capture (review P2): capture
      // A's recorder holds its onstop 3 s. During that finalize the dialog
      // must not dismiss (the real Close button and the close() seam both
      // refuse), and a capture B started meanwhile — the DVR's own moves,
      // releaseRecording() + start(false) … stop(false) — must never be
      // delivered as export A: A's finalize is superseded, so A fails honestly.
      const c0 = failCount;
      await chrome.eval('(window.__dl1125.stops = [], window.__dl1125.delivers = [], window.__dl1125.anchors = 0, true)');
      await chrome.eval(`(() => { const N = window.MediaRecorder; window.__mr1125c = N;
        window.MediaRecorder = class SlowStopRecorder extends N {
          get onstop() { return super.onstop; }
          set onstop(fn) { super.onstop = (...a) => setTimeout(() => fn.apply(this, a), 3000); } };
        window.__lr1125c = window.__export.lastResult();
        window.__run1125c = window.__export.start('realtime', {})
          .then((r) => ({ ok: r }), (e) => ({ threw: String(e?.message ?? e) }));
        window.MediaRecorder = N; // only capture A is slow to finalize
        return true; })()`);
      let locked = false;
      for (let i = 0; i < 80 && !locked; i++) { // the replay plays; the finalize starts at its end
        await sleep(250);
        locked = await chrome.eval(`document.getElementById('ob-x-close')?.disabled === true`);
      }
      if (!locked) fail('[1125c] the finalize never locked the dialog (Close never disabled)');
      else {
        await chrome.eval(`(document.getElementById('ob-x-close').click(), window.__export.close(), true)`);
        const lock = await chrome.eval(`({ modal: !!document.getElementById('ob-export-modal'),
          state: window.__export.state(), closeDisabled: document.getElementById('ob-x-close')?.disabled === true })`);
        if (!lock.modal || lock.state !== 'exporting' || !lock.closeDisabled) {
          fail(`[1125c] Close during the finalize dismissed the dialog (the settle-lock): ${JSON.stringify(lock)}`);
        }
        // capture B: the DVR's own record.js moves while A still finalizes
        const bStarted = await chrome.eval('(window.__record.releaseRecording(), window.__record.start(false))');
        if (!bStarted) fail('[1125c] capture B could not start (the recorder refused)');
        await sleep(1500);
        await chrome.eval('window.__record.stop(false)');
      }
      const runC = await chrome.eval('window.__run1125c'); // settles {ok}|{threw}; bounded by the 60 s poll
      const e3 = await chrome.eval('JSON.parse(JSON.stringify(window.__dl1125))');
      const keptC = await chrome.eval('__export.lastResult() === window.__lr1125c');
      if (!runC) fail('[1125c] export A never settled');
      else if (!runC.threw?.includes(want1125) || e3.delivers.length || !keptC) {
        fail('[1125c] a capture another owner started during the finalize was taken as export A: '
          + `${JSON.stringify(runC)} delivers ${JSON.stringify(e3.delivers)} lastResult kept ${keptC}`);
      }
      await sleep(3500); // A's held onstop lands (superseded: no lastBlob, no delivery)
      const late = await chrome.eval('window.__dl1125.delivers.length');
      if (late) fail(`[1125c] a late delivery landed after export A failed: ${late}`);
      if (failCount === c0) {
        console.log('[1125c] OK — the dialog stayed up through the finalize (Close refused), and a capture '
          + 'another owner started meanwhile was never delivered as the export (A failed honestly, nothing delivered)');
      }
    } finally {
      await chrome.eval(restore1125).catch(() => {});
      await chrome.eval('(window.__mr1125c && (window.MediaRecorder = window.__mr1125c), delete window.__mr1125c, true)').catch(() => {});
    }
    for (let i = 0; i < 60; i++) {
      const st = await chrome.eval('__test.state()');
      if (st !== 'PLAYBACK' && st !== 'SIMULATING') break;
      await sleep(300);
    }
    if (failCount === v0) {
      console.log(`[1125] OK — an empty live capture (${empty1125} bytes) rejects with `
        + `"${want1125}", paints export.failed and keeps the previous lastResult`);
    }
  }

  // ---- GH-158: a sandbox-drill stroke stays exportable after the re-lay -----
  // drills re-lay the next attempt ~1.4 s after every settle (drills.js
  // NEXT_MS) — pre-fix, game.layout() freed the sampler there, so the
  // dialog fell back to "play a shot first" even though the stroke
  // produced a kernel record like any other (the owner's build7 repro).
  // Legs: eligibility AFTER the re-lay landed (red on the pre-fix tree),
  // a REAL offline export from the drill context, and the run surviving
  // the export's replay re-settle (drills reschedule the attempt re-lay).
  let drillsUp = false;
  for (let i = 0; i < 50 && !drillsUp; i++) {
    await sleep(200);
    drillsUp = await chrome.eval('typeof window.__drills?.start === "function"');
  }
  if (!drillsUp) fail('__drills seam never installed — drill arm inconclusive');
  else {
    if (!(await chrome.eval('window.__drills.start("bu-f2")'))) {
      fail('bu-f2 start refused');
    }
    await sleep(400);
    const dErr = await chrome.eval(
      '__test.shoot({ v0: 0.45, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
    if (dErr) fail('drill stroke rejected: ' + dErr);
    let dState = 'PLAYBACK';
    for (let i = 0; i < 100 && (dState === 'PLAYBACK' || dState === 'SIMULATING'); i++) {
      await sleep(300);
      dState = await chrome.eval('__test.state()');
    }
    if (dState === 'PLAYBACK') fail('drill stroke never settled');
    await sleep(2600); // NEXT_MS + margin: the attempt re-lay HAS landed
    const relaid = await chrome.eval('window.__drills.state()');
    if (!relaid || relaid.done !== false) {
      fail('drill run not alive after the re-lay: ' + JSON.stringify(relaid));
    }
    await chrome.eval('__export.open()');
    await sleep(300);
    const dNote = await chrome.eval(
      'document.getElementById("ob-x-note")?.textContent ?? ""');
    const playFirst = await chrome.eval('__i18n.t("export.playFirst")');
    if (dNote === playFirst) {
      fail('GH-158 red: drill stroke not exportable after the attempt '
        + 're-lay — dialog says "play a shot first"');
    }
    if (await chrome.eval(
      'document.getElementById("ob-x-start")?.disabled === true')) {
      fail('GH-158: Export start disabled after a drill stroke');
    }
    const dEta = await chrome.eval('__export.etaText("standard")');
    if (!/^~\d/.test(dEta ?? '')) fail(`drill-mode ETA not sane: "${dEta}"`);
    await tierWall('drill-tiers'); // the drill-LIVE column of the mode matrix
    // eligibility must be REAL: a small offline export from the drill
    // context produces a decodable-sized file…
    const dRes = await chrome.eval(`__export.start('standard',
      { width: 640, height: 360, noDownload: true })`);
    if (!dRes || !(dRes.frames > 0) || !(dRes.size > 20_000)) {
      fail('drill-context export produced no file: ' + JSON.stringify(dRes));
    }
    // …and the export's replay re-settle must NOT kill the run: flow's
    // replay-identity routing + drills' rescheduled attempt re-lay land
    await sleep(4000);
    const after = await chrome.eval('window.__drills.state()');
    if (!after || after.done !== false) {
      fail('export replay killed the drill run: ' + JSON.stringify(after));
    }
    if (!(await chrome.eval('!!document.getElementById("ob-drill-stop")'))) {
      fail('drill chrome gone after the drill-context export');
    }
    if (await chrome.eval('__test.state()') === 'PLAYBACK') {
      fail('table never re-settled after the drill-context export');
    }
    // realtime tier FROM the live drill (recording-QA wave): the MediaRecorder
    // capture replays the stroke live while the run is up — the replay-
    // identity routing must keep the run alive through THIS lane too
    if (await chrome.eval('window.__record?.supported === true')) {
      const dRt = await chrome.eval(
        `__export.start('realtime', { noDownload: true, withAudio: false }).catch((e) => ({ threw: String(e?.message ?? e) }))`);
      if (dRt?.threw) fail(`[drill] the live capture failed: ${dRt.threw}`);
      else if (dRt?.tier !== 'realtime') fail('[drill] realtime tier did not run from the drill context');
      await sleep(3500);
      const afterRt = await chrome.eval('window.__drills.state()');
      if (!afterRt || afterRt.done !== false) {
        fail('[drill] realtime export killed the drill run: ' + JSON.stringify(afterRt));
      }
      if (await chrome.eval('__test.state()') === 'PLAYBACK') {
        fail('[drill] table never re-settled after the realtime drill export');
      }
    } else {
      console.log('[drill] realtime leg SOFT-SKIP: MediaRecorder unsupported');
    }
    await chrome.eval('__export.close()');
    await chrome.eval('window.__drills.stop()');
    // restore play mode (drill start pinned 'practice'): the arms below —
    // and the persisted-mode reload boots — stay on the pre-arm register
    await chrome.eval(`window.__settings?.changeMode?.('play')`);
    await sleep(500);
    if (!process.exitCode) {
      console.log(`[drill] OK — stroke exportable after the attempt re-lay `
        + `(${dRes.frames} frames offline), run survived the replay re-settle`);
    }
  }

  // ---- playground column: sandbox strokes export like any other --------------
  // (recording-QA wave; the GH-158 root cause named flow.js's pgClear as a
  // sharer of the layout() seam): a playground stroke must light the full
  // tier wall, run a REAL offline export AND the realtime lane, with the
  // sandbox (no-judgment) machine back in AIM afterwards.
  // mode switch VERIFIED (review review P2): changeMode returns a boolean
  // and a refused/absent seam would silently run this column in play mode
  if (!(await chrome.eval(`window.__settings?.changeMode?.('playground') === true
    && window.__settings.get().mode === 'playground'`))) {
    fail('[playground] mode switch refused — the sandbox column cannot run');
  }
  await sleep(600);
  {
    const pgErr = await chrome.eval(
      '__test.shoot({ v0: 1.2, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
    if (pgErr) fail('[playground] stroke rejected: ' + pgErr);
    // the sandbox contract routes every settle back to EXACT AIM (no
    // judgment prompts, no BALL_IN_HAND/WIN parks — review review P2)
    let pgState = 'PLAYBACK';
    for (let i = 0; i < 100 && pgState !== 'AIM'; i++) {
      await sleep(300);
      pgState = await chrome.eval('__test.state()');
    }
    if (pgState !== 'AIM') {
      fail(`[playground] stroke did not settle to AIM (state ${pgState})`);
    }
    await sleep(2000); // any post-settle sandbox re-lay scheduling lands
    await tierWall('playground-tiers');
    const pgNote = await chrome.eval(
      'document.getElementById("ob-x-note")?.textContent ?? ""');
    if (pgNote === (await chrome.eval('__i18n.t("export.playFirst")'))) {
      fail('[playground] stroke not exportable — dialog says play a shot first');
    }
    if (await chrome.eval(
      'document.getElementById("ob-x-start")?.disabled === true')) {
      fail('[playground] Export start disabled after a sandbox stroke');
    }
    const pgRes = await chrome.eval(`__export.start('standard',
      { width: 640, height: 360, noDownload: true })`);
    if (!pgRes || !(pgRes.frames > 0) || !(pgRes.size > 20_000)) {
      fail('[playground] offline export produced no file: ' + JSON.stringify(pgRes));
    }
    if (await chrome.eval('window.__record?.supported === true')) {
      const pgRt = await chrome.eval(
        `__export.start('realtime', { noDownload: true, withAudio: false }).catch((e) => ({ threw: String(e?.message ?? e) }))`);
      if (pgRt?.threw) fail(`[playground] the live capture failed: ${pgRt.threw}`);
      else if (pgRt?.tier !== 'realtime') fail('[playground] realtime tier did not run');
    } else {
      console.log('[playground] realtime leg SOFT-SKIP: MediaRecorder unsupported');
    }
    // exact-AIM re-settle after the exports too (review review P2): a
    // SETTLED/BALL_IN_HAND/WIN park would violate the no-judgment contract
    let pgAfter = null;
    for (let i = 0; i < 60 && pgAfter !== 'AIM'; i++) {
      await sleep(300);
      pgAfter = await chrome.eval('__test.state()');
    }
    if (pgAfter !== 'AIM') {
      fail(`[playground] sandbox not back in AIM after the exports (state ${pgAfter})`);
    }
    await chrome.eval('__export.close()');
    if (!process.exitCode) {
      console.log(`[playground] OK — sandbox stroke ran the full tier wall + `
        + `${pgRes.frames} frames offline + realtime lane, back in AIM`);
    }
  }
  if (!(await chrome.eval(`window.__settings?.changeMode?.('play') === true`))) {
    fail('[playground] mode restore to play refused');
  }
  await sleep(600);

  // ==== issue #225 Phase B: drill stitch F1-F5 =================================
  // Records source: three playground shots in ONE rack — __share.records()
  // is the ordered per-rack accumulation (resetLog fires only on seeded AIM,
  // so a single-rack sandbox session keeps all three). The Phase-A archive
  // lane is deliberately NOT built here (issue #225 phasing).
  {
    if (!(await chrome.eval(`window.__settings?.changeMode?.('playground') === true
      && window.__settings.get().mode === 'playground'`))) {
      fail('[F-drill] playground mode switch refused');
    }
    await sleep(600);
    const waitAim = async (tag, polls = 100) => {
      let st = null;
      for (let i = 0; i < polls && st !== 'AIM'; i++) {
        await sleep(300);
        st = await chrome.eval('__test.state()');
      }
      if (st !== 'AIM') fail(`${tag} table never settled to AIM (state ${st})`);
      return st === 'AIM';
    };
    const shootDrill = async (tag, v0, phi) => {
      let err = null;
      for (let i = 0; i < 20; i++) { // aiming-state retry (the #197 law)
        err = await chrome.eval(`__test.shoot({ v0: ${v0}, phi: ${phi},
          theta: 0, a: 0, b: 0 })`);
        if (!err || !/aiming state/.test(String(err))) break;
        await sleep(500);
      }
      if (err) fail(`${tag} shot rejected: ${err}`);
      await waitAim(tag);
    };
    await shootDrill('[F-drill shot1]', 1.2, 'Math.PI / 2');
    await shootDrill('[F-drill shot2]', 0.8, '0.4');
    await shootDrill('[F-drill shot3]', 0.9, '2.1');
    await sleep(800);
    const nRecords = await chrome.eval('__share.records().length');
    if (nRecords !== 3) {
      fail(`[F-drill] expected 3 records in the rack log, got ${nRecords}`);
    }
    const shotsBefore = await chrome.eval('__share.log().shots');
    const drill = (cams, extra = '') => chrome.eval(
      `__export.renderDrill(__share.records(), { width: 640, height: 360,
        noDownload: true, hashFrames: true,
        perShotCamera: ${JSON.stringify(cams)}${extra} })`);

    // ---- run 1: the reference render (F1 + F4 source) -----------------------
    const f1c0 = failCount; // arm-local OK gate (this arm's failures only)
    const run1 = await drill(['top', 'side', 'closeup'], ', keepBytes: true');
    if (!run1 || run1.segments?.length !== 3) {
      fail('[F-drill] renderDrill returned no 3-segment result: '
        + JSON.stringify(run1 && { frames: run1.frames, segments: run1.segments }));
    }
    await waitAim('[F-drill run1 settle]');
    const segs = run1.segments;
    const b1 = segs[0], b2 = segs[0] + segs[1];
    const total = segs[0] + segs[1] + segs[2];
    if (run1.frames !== total) {
      fail(`[F1] frames ${run1.frames} != Σ segment frames ${total}`);
    }
    if (run1.montageRate !== 1) {
      fail(`[F1] short drill reported montage rate ${run1.montageRate}, want 1`);
    }
    if (run1.hashes?.length !== total) fail('[F1] hash count != frame count');
    const dFile = path.join(OUTDIR, 'drill.mp4');
    fs.writeFileSync(dFile, Buffer.from(run1.b64, 'base64'));
    const dProbe = (args) => execFileSync('ffprobe',
      ['-v', 'error', ...args, dFile]).toString().trim();
    const dv = dProbe(['-select_streams', 'v:0', '-show_entries',
      'stream=codec_name', '-of', 'default=nw=1:nk=1']);
    const da = dProbe(['-select_streams', 'a:0', '-show_entries',
      'stream=codec_name', '-of', 'default=nw=1:nk=1']);
    if (dv !== 'h264' || da !== 'aac') {
      fail(`[F1] drill codecs ${dv}+${da}, want h264+aac`);
    }
    const dFrames = Number(dProbe(['-select_streams', 'v:0', '-count_frames',
      '-show_entries', 'stream=nb_read_frames', '-of', 'default=nw=1:nk=1']));
    if (dFrames !== total) {
      fail(`[F1] decoded ${dFrames} frames, want Σ segment frames ${total}`);
    }
    const dDur = Number(dProbe(['-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1']));
    if (Math.abs(dDur - total / 60) > 0.15) {
      fail(`[F1] duration ${dDur}, want ≈ ${(total / 60).toFixed(2)}`);
    }
    // decoded frame timeline: pts + keyframe flag per frame, in order
    const rows = dProbe(['-select_streams', 'v:0', '-show_entries',
      'frame=pts_time,key_frame', '-of', 'csv=p=0'])
      .split('\n').filter(Boolean).map((l) => {
        const [kf, pts] = l.split(',');
        return { key: Number(kf), pts: Number(pts) };
      }).filter((r) => Number.isFinite(r.pts));
    if (rows.length !== total) {
      fail(`[F1] decoded ${rows.length} PTS entries, want ${total}`);
    }
    let nonMono = 0, maxDev = 0;
    for (let i = 1; i < rows.length; i++) {
      const d = rows[i].pts - rows[i - 1].pts;
      if (d <= 0) nonMono++;
      maxDev = Math.max(maxDev, Math.abs(d - 1 / 60));
    }
    if (nonMono > 0) {
      fail(`[F1] ${nonMono} non-increasing PTS steps across the stitched clip`);
    }
    if (maxDev > 0.001) {
      fail(`[F1] PTS deltas deviate up to ${(maxDev * 1000).toFixed(2)} ms `
        + 'from 1/60 s (want ≤ 1 ms — gap/dup at a seam)');
    }
    for (const b of [b1, b2]) { // the seams, explicitly
      const d = rows[b].pts - rows[b - 1].pts;
      if (Math.abs(d - 1 / 60) > 0.001) {
        fail(`[F1] boundary frame ${b}: PTS delta ${(d * 1000).toFixed(2)} ms `
          + '(gap/dup at the segment seam)');
      }
      if (rows[b].key !== 1) {
        fail(`[F1] boundary frame ${b} is not a keyframe (localK===0 law)`);
      }
    }
    if (failCount === f1c0) {
      console.log(`[F1] OK — stitched ${segs.join('+')} = ${total} frames `
        + `decode continuously (max dev ${(maxDev * 1000).toFixed(3)} ms), `
        + 'keyframes at both seams');
    }

    // ---- F3 determinism: identical timeline → identical pre-encode hashes ---
    const run2 = await drill(['top', 'side', 'closeup']);
    await waitAim('[F-drill run2 settle]');
    if (!run2?.hashes) fail('[F3] second drill render produced no hashes');
    else if (JSON.stringify(run2.hashes) !== JSON.stringify(run1.hashes)) {
      const diff = run2.hashes.findIndex((h, i) => h !== run1.hashes[i]);
      fail(`[F3] drill frame hashes differ between identical runs (first at `
        + `frame ${diff}, boundaries at ${b1}/${b2})`);
    } else {
      console.log(`[F3] OK — ${run2.hashes.length} drill frame hashes `
        + 'identical across runs');
    }

    // ---- F2 camera-switch at EXACT boundary frames ---------------------------
    // Same records, segment 1's camera flipped side→top: hashes must match
    // run 1 everywhere OUTSIDE segment 1 and diverge from EXACTLY frame b1
    // through b2-1 — the cut lands on the boundary frame, no bleed either way.
    const f2c0 = failCount;
    const run3 = await drill(['top', 'top', 'closeup']);
    await waitAim('[F-drill run3 settle]');
    if (!run3?.hashes || run3.hashes.length !== total) {
      fail('[F2] camera-diff render produced no comparable hashes');
    } else {
      const diffs = [];
      for (let i = 0; i < total; i++) {
        if (run3.hashes[i] !== run1.hashes[i]) diffs.push(i);
      }
      const inside = diffs.filter((i) => i >= b1 && i < b2);
      const outside = diffs.filter((i) => i < b1 || i >= b2);
      if (outside.length) {
        fail(`[F2] camera switch bled outside its segment: frames `
          + `${outside.slice(0, 5).join(',')} differ (segment = [${b1}, ${b2}))`);
      }
      if (diffs[0] !== b1) {
        fail(`[F2] camera cut did not land on the boundary frame: first diff `
          + `at ${diffs[0]}, want ${b1}`);
      }
      if (diffs[diffs.length - 1] !== b2 - 1) {
        fail(`[F2] switched segment did not hold its camera to the next cut: `
          + `last diff at ${diffs[diffs.length - 1]}, want ${b2 - 1}`);
      }
      if (failCount === f2c0) {
        console.log(`[F2] OK — side→top flip changed exactly frames `
          + `[${b1}, ${b2}) (${inside.length} frames), zero bleed`);
      }
    }

    // ---- F4 audio seam: onsets at global offsets, no click -------------------
    const f4c0 = failCount;
    const dAudio = path.join(OUTDIR, 'drill-audio.f32');
    execFileSync('ffmpeg', ['-v', 'error', '-i', dFile, '-map', 'a:0',
      '-ac', '1', '-ar', '48000', '-f', 'f32le', dAudio]);
    const dBuf = fs.readFileSync(dAudio);
    const pcm = new Float32Array(dBuf.buffer, dBuf.byteOffset,
      Math.floor(dBuf.length / 4));
    let onset0 = -1;
    for (let i = 0; i < pcm.length; i++) {
      if (Math.abs(pcm[i]) > 0.01) { onset0 = i; break; }
    }
    if (onset0 < 0) fail('[F4] drill audio is silent');
    else if (onset0 / 48000 > 0.006) {
      fail(`[F4] segment 0 cue tick sounds at ${(onset0 / 48000 * 1000).toFixed(1)} ms `
        + '(want ≤ 6 ms — priming compensated)');
    }
    const rms = (a, b) => {
      let s = 0, n = 0;
      for (let i = Math.max(0, a); i < Math.min(pcm.length, b); i++) {
        s += pcm[i] * pcm[i]; n++;
      }
      return n ? Math.sqrt(s / n) : 0;
    };
    for (const [si, b] of [[1, b1], [2, b2]]) {
      const at = Math.round(b / 60 * 48000);
      // each segment opens on its record's cue strike: energy must STEP UP
      // at the segment's global offset (the cue-alignment law)
      const pre = rms(at - 1680, at - 240);
      const post = rms(at, at + 1440);
      if (!(post > 0.003 && post > 1.8 * pre)) {
        fail(`[F4] segment ${si} cue onset not at its global offset `
          + `${(b / 60).toFixed(3)} s (rms ${pre.toFixed(4)} -> ${post.toFixed(4)})`);
      }
      // no click: a per-segment AudioBuffer concat truncates decay tails
      // into a hard step — the single-context render must stay smooth
      let maxStep = 0;
      for (let i = Math.max(1, at - 480); i < Math.min(pcm.length, at + 480); i++) {
        maxStep = Math.max(maxStep, Math.abs(pcm[i] - pcm[i - 1]));
      }
      if (maxStep > 0.35) {
        fail(`[F4] click at the segment ${si} seam: sample step ${maxStep.toFixed(3)}`);
      }
    }
    if (failCount === f4c0) {
      console.log('[F4] OK — cue onsets land at their global offsets '
        + `(t=0 at ${(onset0 / 48000 * 1000).toFixed(2)} ms), no seam click`);
    }

    // ==== GH-364 strike-point plate: S1-S4 =====================================
    // The engine half of the teaching overlay (playback's card/preview half
    // is e2e-playback arm 27): the pure leaf's params→glyph mapping pinned
    // on fixtures, the on/off byte difference LOCALIZED in time (hashes)
    // and space (decoded pixels vs the leaf's own plateRect — the issue's
    // acceptance), zero perturbation + zero residue when OFF, i18n of the
    // burned caption at the pixel level, and armed A/A determinism on the
    // ruled pre-encode-hash surface.

    // ---- S1: params→glyph mapping pinned on fixtures --------------------------
    {
      const s1c0 = failCount;
      const s1 = await chrome.eval(`(async () => {
        const sg = await import('/app/strikeglyph.js');
        const W = 1280, H = 720;
        const mk = (shot, cue) => ({ shot,
          initial: { balls: [{ id: 0, params: { r: 0.028575 } }] },
          options: cue ? { cue } : {}, events: [] });
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        const cases = [ // rest / a-extreme / b-extreme / masse (issue arms)
          { tag: 'rest', shot: { a: 0, b: 0, theta: 0, v0: 2 } },
          { tag: 'right', shot: { a: 0.65, b: 0, theta: 0, v0: 2 } },
          { tag: 'draw', shot: { a: 0, b: -0.65, theta: 0, v0: 2 } },
          { tag: 'masse', shot: { a: 0.2, b: 0.35, theta: 1.0, v0: 3 },
            cue: { tip_radius: 0.0106, miscue_contact_cap_r: 0.58 } },
        ];
        const out = { cases: [], zeroAlphaPixels: -1 };
        for (const c of cases) {
          ctx.clearRect(0, 0, W, H);
          const glyph = sg.glyphFor(mk(c.shot, c.cue));
          sg.drawStrikePlate(ctx,
            { W, H, alpha: 1, glyph, title: 'Strike point' });
          const img = ctx.getImageData(0, 0, W, H).data;
          let n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
          // painted bbox + accent-dot centroid (the tip contact dot is the
          // only saturated-blue paint on the plate)
          let dn = 0, dx = 0, dy = 0;
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const i = (y * W + x) * 4;
              if (img[i + 3] === 0) continue;
              n++;
              if (x < x0) x0 = x; if (x > x1) x1 = x;
              if (y < y0) y0 = y; if (y > y1) y1 = y;
              if (img[i + 2] > 200 && img[i + 2] - img[i] > 70
                && img[i + 1] > 120 && img[i + 1] < 220) {
                dn++; dx += x; dy += y;
              }
            }
          }
          out.cases.push({ tag: c.tag, glyph, n, box: [x0, y0, x1, y1],
            rect: sg.plateRect({ W, H, title: 'Strike point' }),
            dot: dn ? [dx / dn, dy / dn] : null, dotPx: dn,
            readout: sg.fmtReadout(glyph) });
        }
        // alpha 0 draws NOTHING (the zero-perturbation contract at the leaf)
        ctx.clearRect(0, 0, W, H);
        sg.drawStrikePlate(ctx, { W, H, alpha: 0,
          glyph: sg.glyphFor(mk(cases[0].shot)), title: 'Strike point' });
        const z = ctx.getImageData(0, 0, W, H).data;
        let zn = 0;
        for (let i = 3; i < z.length; i += 4) if (z[i] > 0) zn++;
        out.zeroAlphaPixels = zn;
        // seat-2 carom record (GH-383, review final-rebase round): the leaf
        // derives the STRUCK ball from the record's own Strike event —
        // radius (glyph scale) AND impact anchor, never a literal ball 0.
        // The t=1.25 ball-0 contact is a DECOY a ball-0-pinned ladder
        // would anchor on (the red).
        const rec2 = { shot: { a: 0.1, b: 0.2, theta: 0.2, v0: 2.5 },
          initial: { balls: [{ id: 0, params: { r: 0.028575 } },
            { id: 1, params: { r: 0.0305 } },
            { id: 2, params: { r: 0.0305 } }] },
          options: {},
          events: [
            { t: 0, kind: { Strike: { ball: 1 } } },
            { t: 1.25, kind: { BallBall: { b1: 0, b2: 2 } } },
            { t: 2.5, kind: { BallBall: { b1: 2, b2: 1 } } },
          ] };
        out.seat2 = { s: sg.glyphFor(rec2).s,
          tOff: sg.impactTimeFor(rec2, 9.9) };
        return out;
      })()`);
      const u1 = 720 / 1080, faceR = 52 * u1;
      const byTag = Object.fromEntries(s1.cases.map((c) => [c.tag, c]));
      for (const c of s1.cases) {
        const r = c.rect;
        if (!(c.n > 400 && c.box[0] >= r.x - 2 && c.box[1] >= r.y - 2
          && c.box[2] <= r.x + r.w + 2 && c.box[3] <= r.y + r.h + 2)) {
          fail(`[S1] ${c.tag}: paint escaped plateRect — box `
            + `${c.box.join(',')} vs rect ${JSON.stringify(r)}`);
        }
        if (!c.dot) fail(`[S1] ${c.tag}: no contact dot found`);
      }
      // the GH-146 mapping pinned: dot displacement from the REST fixture
      // equals (Δcommanded / S) · faceR px — +a right, +b up (screen -y)
      const pin = (tag, wantDx, wantDy) => {
        const d = byTag[tag].dot, r0 = byTag.rest.dot;
        const s = byTag[tag].glyph.s;
        const ex = (wantDx / s) * faceR, ey = (wantDy / s) * faceR;
        if (Math.abs(d[0] - r0[0] - ex) > 1.5
          || Math.abs(d[1] - r0[1] - (-ey)) > 1.5) {
          fail(`[S1] ${tag}: dot at Δ(${(d[0] - r0[0]).toFixed(1)}, `
            + `${(d[1] - r0[1]).toFixed(1)}) px, want (${ex.toFixed(1)}, `
            + `${(-ey).toFixed(1)})`);
        }
      };
      pin('right', 0.65, 0);
      pin('draw', 0, -0.65);
      pin('masse', 0.2, 0.35);
      if (byTag.masse.glyph.cap !== 0.58) {
        fail(`[S1] masse cue cap ${byTag.masse.glyph.cap}, want the record's own 0.58`);
      }
      if (byTag.masse.readout !== 'θ 57.3° · 3 m/s'
        && byTag.masse.readout !== 'θ 57.3° · 3.0 m/s') {
        fail(`[S1] masse readout "${byTag.masse.readout}" — the HUD grammar drifted`);
      }
      if (s1.zeroAlphaPixels !== 0) {
        fail(`[S1] alpha-0 draw painted ${s1.zeroAlphaPixels} pixels (want 0)`);
      }
      // seat-2 carom: Strike-event truth for scale AND anchor (GH-383 law)
      if (Math.abs(s1.seat2.s - (1 + 0.0106 / 0.0305)) > 1e-9) {
        fail(`[S1] seat-2 glyph scale ${s1.seat2.s} — want the STRUCK ball's `
          + `radius (1 + 0.0106/0.0305), not ball 0's`);
      }
      if (s1.seat2.tOff !== 2.5) {
        fail(`[S1] seat-2 impact anchor ${s1.seat2.tOff} — want 2.5 (the `
          + "struck ball's first contact; 1.25 is the ball-0 decoy)");
      }
      if (failCount === s1c0) {
        console.log('[S1] OK — glyph fixtures pinned (rest/right/draw/masse'
          + '/seat-2 carom): dot at (a,b)/S, per-cue 0.58 ring, Strike-event '
          + 'struck ball, paint confined to plateRect');
      }
    }

    // ---- S5 (GH-475): the annotation halves at the leaf ------------------------
    // fmtElev/fmtPower ARE the capability surface renderDrill probes; the
    // knob-selected readout row appears iff any knob is on (plateRect roH),
    // paints inside plateRect, and carries the RECORDED values in the HUD
    // grammar. Legacy `readout: true` keeps the combined line verbatim.
    {
      const s5c0 = failCount;
      const s5 = await chrome.eval(`(async () => {
        const sg = await import('/app/strikeglyph.js');
        if (typeof sg.fmtElev !== 'function'
          || typeof sg.fmtPower !== 'function') return { stale: true };
        const g = { a: 0.2, b: 0.35, theta: 1, v0: 3, s: 1.37, cap: 0.58 };
        const W = 1280, H = 720;
        const px = (opts) => {
          const c = document.createElement('canvas');
          c.width = W; c.height = H;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          sg.drawStrikePlate(ctx, { W, H, glyph: g,
            title: 'Strike point', ...opts });
          const img = ctx.getImageData(0, 0, W, H).data;
          // content hash BESIDE the alpha count: the plate scrim already
          // covers the readout band, so text changes the PIXELS, never
          // the alpha footprint (the S5 landing lesson)
          let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, h = 0x811c9dc5;
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const i = (y * W + x) * 4;
              if (img[i + 3] === 0) continue;
              n++;
              h ^= img[i] ^ (img[i + 1] << 8) ^ (img[i + 2] << 16)
                ^ (i & 0xffff);
              h = Math.imul(h, 0x01000193);
              if (x < x0) x0 = x; if (x > x1) x1 = x;
              if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
          return { n, box: [x0, y0, x1, y1], hash: h >>> 0 };
        };
        return {
          elevTxt: sg.fmtElev(g), powerTxt: sg.fmtPower(g),
          both: sg.fmtElev(g) + ' \\u00b7 ' + sg.fmtPower(g),
          legacy: sg.fmtReadout(g),
          rectOff: sg.plateRect({ W, H, title: 'Strike point',
            readout: false }),
          rectElev: sg.plateRect({ W, H, title: 'Strike point',
            readout: false, elev: true }),
          rectLegacy: sg.plateRect({ W, H, title: 'Strike point' }),
          clean: px({ readout: false }),
          elevOn: px({ readout: false, elev: true }),
          bothOn: px({ readout: false, elev: true, power: true }),
        };
      })()`);
      if (s5.stale) {
        fail('[S5] leaf lacks fmtElev/fmtPower (capability surface missing)');
      } else {
        if (s5.elevTxt !== 'θ 57.3°'
          || (s5.powerTxt !== '3 m/s' && s5.powerTxt !== '3.0 m/s')) {
          fail(`[S5] annotation grammar drifted: "${s5.elevTxt}" / `
            + `"${s5.powerTxt}"`);
        }
        if (s5.legacy !== s5.both) {
          fail(`[S5] legacy readout must equal the joined halves: `
            + `"${s5.legacy}" vs "${s5.both}"`);
        }
        // the knob row costs exactly the legacy readout row's height, and
        // a knobs-off plate is the row-less geometry
        if (!(s5.rectElev.h > s5.rectOff.h + 1)
          || Math.abs(s5.rectElev.h - s5.rectLegacy.h) > 1e-6) {
          fail(`[S5] plateRect row accounting drifted: off ${s5.rectOff.h} `
            + `elev ${s5.rectElev.h} legacy ${s5.rectLegacy.h}`);
        }
        // knob paint stays inside ITS OWN plateRect; a knob row EXTENDS
        // the plate (alpha footprint grows) and the second knob CHANGES
        // the row's pixels (content hash — the scrim saturates the alpha
        // count, so text is only visible to content)
        const r = s5.rectElev;
        if (!(s5.elevOn.n > s5.clean.n
          && s5.elevOn.box[0] >= r.x - 2 && s5.elevOn.box[1] >= r.y - 2
          && s5.elevOn.box[2] <= r.x + r.w + 2
          && s5.elevOn.box[3] <= r.y + r.h + 2
          && s5.bothOn.hash !== s5.elevOn.hash
          && s5.elevOn.hash !== s5.clean.hash)) {
          fail(`[S5] knob paint wrong: clean ${s5.clean.n}/${s5.clean.hash} `
            + `elev ${s5.elevOn.n}/${s5.elevOn.hash} both `
            + `${s5.bothOn.n}/${s5.bothOn.hash} box ${s5.elevOn.box} `
            + `rect ${JSON.stringify(r)}`);
        }
        if (failCount === s5c0) {
          console.log('[S5] OK — annotation halves pinned (grammar, row '
            + 'geometry, containment, legacy identity)');
        }
      }
    }

    // ---- S2: overlay on/off — localized in time AND space ---------------------
    // OFF baseline = run1 (the F1 reference render). ON = the same plan +
    // opts.strike. Hash diffs must lie INSIDE the leaf-derived per-segment
    // windows [segment start, impact frame + one settle beat]; a decoded
    // mid-window frame's strong pixel diffs must lie inside plateRect plus
    // a one-macroblock encoder apron (the issue's own acceptance: the byte
    // difference is localized to the overlay region).
    const s2c0 = failCount;
    const sOn = await drill(['top', 'side', 'closeup'],
      `, keepBytes: true, strike: { title: 'Strike point' }`);
    await waitAim('[S2 strike render settle]');
    if (!sOn?.hashes || sOn.hashes.length !== total) {
      fail('[S2] strike render produced no comparable hashes: '
        + JSON.stringify(sOn && { frames: sOn.frames }));
    } else {
      const wins = await chrome.eval(`(async () => {
        const sg = await import('/app/strikeglyph.js');
        const segs = ${JSON.stringify(run1.segments)};
        const starts = [0, segs[0], segs[0] + segs[1]];
        return __share.records().map((r, i) => {
          const rec = typeof r === 'string' ? JSON.parse(r) : r;
          const dur = rec.events.length
            ? rec.events[rec.events.length - 1].t : 0;
          const tOff = sg.impactTimeFor(rec, dur);
          const kImp = Math.max(0, Math.ceil(tOff * 60 - 1e-9));
          return { start: starts[i], kImp,
            end: Math.min(starts[i] + kImp + 15, starts[i] + segs[i] - 1) };
        });
      })()`);
      const diffs = [];
      for (let i = 0; i < total; i++) {
        if (sOn.hashes[i] !== run1.hashes[i]) diffs.push(i);
      }
      const inWin = (i) => wins.some((w) => i >= w.start && i <= w.end);
      const outliers = diffs.filter((i) => !inWin(i));
      if (outliers.length) {
        fail(`[S2] plate bled outside its windows: frames `
          + `${outliers.slice(0, 6).join(',')} differ (windows `
          + `${JSON.stringify(wins)})`);
      }
      for (const [i, w] of wins.entries()) {
        for (const k of [w.start, w.start + Math.floor(w.kImp / 2)]) {
          if (!diffs.includes(k)) {
            fail(`[S2] segment ${i}: expected the plate at frame ${k} `
              + '(inside [segment start, impact]) — hash unchanged');
          }
        }
      }
      // space axis: decoded mid-window frame, strong diffs confined to the
      // leaf's plateRect + a 16 px (one-macroblock) encoder apron
      const sFile = path.join(OUTDIR, 'strike-on.mp4');
      fs.writeFileSync(sFile, Buffer.from(sOn.b64, 'base64'));
      const rgbOf364 = (input, out, frame) => {
        const p = path.join(OUTDIR, out);
        execFileSync('ffmpeg', ['-v', 'error', '-i', input,
          '-vf', `select=eq(n\\,${frame})`, '-vsync', '0',
          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-y', p]);
        return fs.readFileSync(p);
      };
      const fProbe = wins[0].start + Math.max(1, Math.floor(wins[0].kImp / 2));
      const offRgb = rgbOf364(dFile, 's2-off.rgb', fProbe);
      const onRgb = rgbOf364(sFile, 's2-on.rgb', fProbe);
      if (offRgb.length !== onRgb.length || offRgb.length !== 640 * 360 * 3) {
        fail(`[S2] decoded frame size mismatch: ${offRgb.length} vs ${onRgb.length}`);
      } else {
        const rect = await chrome.eval(`(async () => (await import(
          '/app/strikeglyph.js')).plateRect({ W: 640, H: 360,
          title: 'Strike point' }))()`);
        // the plate is the only PRE-ENCODE change (S1 pins the draw's own
        // bbox; S4 pins zero residue) — but the DECODED comparison sees the
        // encoder's rate control re-quantize distant macroblocks once any
        // pixel changes (measured: isolated ~28-LSB ripple mid-table). So
        // the space law on delivered bytes is COMPONENT-based: inside the
        // plate region (+one 16 px macroblock apron) a real plate shows as
        // >50 strong diffs; OUTSIDE it, isolated ripple is tolerated but
        // any COHERENT structure (an 8-connected strong-diff component
        // > 16 px, or > 0.05% of the frame in total) is a bleed and fails.
        const APRON = 16, W2 = 640, H2 = 360;
        let strongIn = 0;
        const out = new Set();
        for (let y = 0; y < H2; y++) {
          for (let x = 0; x < W2; x++) {
            const i = (y * W2 + x) * 3;
            const d = Math.max(Math.abs(offRgb[i] - onRgb[i]),
              Math.abs(offRgb[i + 1] - onRgb[i + 1]),
              Math.abs(offRgb[i + 2] - onRgb[i + 2]));
            if (d <= 24) continue;
            const inside = x >= rect.x - APRON && x <= rect.x + rect.w + APRON
              && y >= rect.y - APRON && y <= rect.y + rect.h + APRON;
            if (inside) strongIn++;
            else out.add(y * W2 + x);
          }
        }
        let maxComp = 0;
        {
          const seen = new Set();
          for (const p0 of out) {
            if (seen.has(p0)) continue;
            let size = 0;
            const stack = [p0];
            seen.add(p0);
            while (stack.length) {
              const p = stack.pop();
              size++;
              const px = p % W2, py = (p / W2) | 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  const nx = px + dx, ny = py + dy;
                  if (nx < 0 || ny < 0 || nx >= W2 || ny >= H2) continue;
                  const np = ny * W2 + nx;
                  if (out.has(np) && !seen.has(np)) {
                    seen.add(np);
                    stack.push(np);
                  }
                }
              }
            }
            maxComp = Math.max(maxComp, size);
          }
        }
        if (maxComp > 16 || out.size > W2 * H2 * 0.0005) {
          fail(`[S2] coherent pixel diffs OUTSIDE the plate region at frame `
            + `${fProbe}: ${out.size} strong px, largest component ${maxComp} `
            + `(rect ${JSON.stringify(rect)})`);
        }
        if (!(strongIn > 50)) {
          fail(`[S2] no plate visible in the decoded frame ${fProbe} `
            + `(${strongIn} strong diffs inside the region)`);
        }
      }
      if (failCount === s2c0) {
        console.log(`[S2] OK — ${diffs.length} differing frames all inside `
          + 'the leaf-derived windows; decoded diff confined to plateRect '
          + `+${16}px at frame ${fProbe}`);
      }
    }

    // ---- S3: the burned caption is localized (pixel truth) --------------------
    {
      const s3c0 = failCount;
      const s3 = await chrome.eval(`(async () => {
        const sg = await import('/app/strikeglyph.js');
        const W = 1920, H = 1080;
        const glyph = sg.glyphFor({ shot: { a: 0.2, b: 0.1, theta: 0.3, v0: 2 },
          initial: { balls: [{ id: 0, params: { r: 0.028575 } }] },
          options: {}, events: [] });
        const draw = (title) => {
          const cv = document.createElement('canvas');
          cv.width = W; cv.height = H;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          sg.drawStrikePlate(ctx, { W, H, alpha: 1, glyph, title });
          return ctx.getImageData(0, 0, W, H).data;
        };
        const en = draw('Strike point');
        const zh = draw('击球点');
        const rect = sg.plateRect({ W, H, title: '击球点' });
        let diff = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W; x += 1) {
            const i = (y * W + x) * 4;
            if (Math.abs(en[i] - zh[i]) > 8 || Math.abs(en[i + 1] - zh[i + 1]) > 8
              || Math.abs(en[i + 3] - zh[i + 3]) > 8) {
              diff++;
              if (x < x0) x0 = x; if (x > x1) x1 = x;
              if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
        }
        return { diff, box: [x0, y0, x1, y1], rect };
      })()`);
      const capBand = s3.rect.y + 40; // caption row: the plate's top band
      if (!(s3.diff > 100)) {
        fail(`[S3] zh-CN caption did not change the plate (${s3.diff} px)`);
      } else if (!(s3.box[1] >= s3.rect.y && s3.box[3] <= capBand)) {
        fail(`[S3] caption diff escaped the title band: box ${s3.box.join(',')} `
          + `(band [${s3.rect.y}, ${capBand}])`);
      }
      if (failCount === s3c0) {
        console.log('[S3] OK — the burned caption localizes (en vs zh-CN '
          + `differ on ${s3.diff} px, all inside the title band)`);
      }
    }

    // ---- S4: armed determinism + zero residue when OFF ------------------------
    {
      const s4c0 = failCount;
      const sOn2 = await drill(['top', 'side', 'closeup'],
        `, strike: { title: 'Strike point' }`);
      await waitAim('[S4 strike A/A settle]');
      if (!sOn2?.hashes
        || JSON.stringify(sOn2.hashes) !== JSON.stringify(sOn.hashes)) {
        const di = sOn2?.hashes?.findIndex((h, i) => h !== sOn.hashes[i]);
        fail(`[S4] armed renders diverge (first at frame ${di}) — the ruled `
          + 'determinism surface (pre-encode hashes) broke under the plate');
      }
      const off2 = await drill(['top', 'side', 'closeup']);
      await waitAim('[S4 off re-render settle]');
      if (!off2?.hashes
        || JSON.stringify(off2.hashes) !== JSON.stringify(run1.hashes)) {
        const di = off2?.hashes?.findIndex((h, i) => h !== run1.hashes[i]);
        fail(`[S4] an OFF render after the armed ones is not byte-identical `
          + `to the baseline (first at frame ${di}) — the plate left residue`);
      }
      if (failCount === s4c0) {
        console.log('[S4] OK — armed A/A identical; OFF re-render '
          + 'byte-identical to the pre-364 baseline (zero residue)');
      }
    }

    // ---- F5 abort mid-drill: no file, live state restored ---------------------
    const f5c0 = failCount;
    const size0d = await chrome.eval(
      'JSON.stringify([document.querySelector("canvas").width, document.querySelector("canvas").height])');
    const lastBefore = JSON.stringify(await chrome.eval(
      '(({ b64, hashes, ...r }) => r)(__export.lastResult())'));
    await chrome.eval(`window.__drillRun = __export.renderDrill(__share.records(),
      { width: 640, height: 360, noDownload: true }); undefined`);
    let prog = null; // cancel INSIDE segment >= 1 (past the first seam)
    for (let i = 0; i < 600; i++) {
      prog = await chrome.eval('__export.drillProgress()');
      if (prog && prog.done > b1) break;
      await sleep(100);
    }
    if (!(prog?.done > b1)) {
      fail('[F5] drill render never progressed past the first seam: '
        + JSON.stringify(prog));
    }
    await chrome.eval('__export.cancel()');
    const aborted = await chrome.eval('window.__drillRun');
    if (aborted !== null) fail('[F5] aborted drill render still returned a result');
    const lastAfter = JSON.stringify(await chrome.eval(
      '(({ b64, hashes, ...r }) => r)(__export.lastResult())'));
    if (lastAfter !== lastBefore) {
      fail('[F5] aborted drill render mutated lastResult');
    }
    const size1d = await chrome.eval(
      'JSON.stringify([document.querySelector("canvas").width, document.querySelector("canvas").height])');
    if (size0d !== size1d) {
      fail(`[F5] canvas not restored after the drill abort: ${size0d} -> ${size1d}`);
    }
    await waitAim('[F5 abort settle]');
    // the live-state integrity wall (the identity-preserving restore):
    // neither three FULL drill renders nor the abort may re-adjudicate the
    // restored shot — no phantom share-log rows, sandbox back in AIM
    const shotsAfter = await chrome.eval('__share.log().shots');
    if (shotsAfter !== shotsBefore) {
      fail(`[F5] share log grew across drill renders: ${shotsBefore} -> `
        + `${shotsAfter} (the restored settle re-logged as a fresh shot)`);
    }
    if ((await chrome.eval('__share.records().length')) !== 3) {
      fail('[F5] rack record list changed across drill renders');
    }
    if (failCount === f5c0) {
      console.log('[F5] OK — mid-drill abort: no file, lastResult/canvas '
        + `untouched, back in AIM, share log still ${shotsAfter} shots`);
    }

    // ---- F6 montage cap: many-segment convergence under the ruled ceiling ----
    // 20 identical trimmed copies of record 0 (endT 2.267 s, slowmo 0.4,
    // inner tail 0.15 s) plan 7021 frames uncapped — chosen so per-segment
    // ceil() rounding parks the re-plan at 3601 frames for ~11 passes (the
    // old fixed-4-pass loop shipped that ceiling violation; verified
    // red-on-tip against framestep.js planPlayback). The cap must CONVERGE
    // under CLIP_CAP_SEC*60 = 3600 and the onMontage cap-policy note must
    // arrive through the exposed __export.renderDrill seam.
    const f6c0 = failCount;
    const f6Shots = await chrome.eval('__share.log().shots');
    const f6 = await chrome.eval(`__export.renderDrill(
      Array(20).fill(__share.records()[0]),
      { width: 320, height: 180, noDownload: true, withAudio: false,
        slowmo: 0.4, tailSec: 0.15,
        trims: Array(20).fill({ startT: 0, endT: 2.267 }),
        onMontage: (r) => { window.__f6Montage = r; } })`);
    await waitAim('[F6 cap settle]');
    if (!f6 || f6.segments?.length !== 20) {
      fail('[F6] capped drill render returned no 20-segment result: '
        + JSON.stringify(f6 && { frames: f6.frames, segments: f6.segments }));
    } else {
      const f6Total = f6.segments.reduce((a, b) => a + b, 0);
      if (f6.frames !== f6Total) {
        fail(`[F6] frames ${f6.frames} != Σ segment frames ${f6Total}`);
      }
      if (f6.frames > 3600) {
        fail(`[F6] capped drill emitted ${f6.frames} frames — ABOVE the `
          + 'ruled 60 s ceiling (3600): the montage cap did not converge');
      }
      if (f6.frames <= 3540) {
        fail(`[F6] capped drill emitted only ${f6.frames} frames — the cap `
          + 'must target the ceiling, not over-compress the drill');
      }
      if (!(f6.montageRate > 1.5 && f6.montageRate < 3)) {
        fail(`[F6] montage rate ${f6.montageRate} outside the expected band `
          + '(uncapped ≈ 117 s over a 60 s cap → ≈ 2.01)');
      }
      const f6Note = await chrome.eval('window.__f6Montage');
      if (!(Math.abs((f6Note ?? 0) - f6.montageRate) < 1e-9)) {
        fail(`[F6] onMontage note ${f6Note} != montageRate ${f6.montageRate} `
          + '(cap-policy callback not plumbed through __export.renderDrill)');
      }
      if ((await chrome.eval('__share.log().shots')) !== f6Shots) {
        fail('[F6] share log changed across the capped drill render');
      }
      if (failCount === f6c0) {
        console.log(`[F6] OK — 20-segment drill converged to ${f6.frames} `
          + `frames ≤ 3600 (montage rate ${f6.montageRate.toFixed(4)}, `
          + 'onMontage note surfaced)');
      }
    }

    // ---- F7 diagnostic-record restore: never stricter than the acceptance ----
    // Stage a CROSS-VERSION record via the scripted diagnostic path
    // (__test.loadRecord { allowVersionMismatch: true } — the Venom-style
    // harness route), then run a drill render over a same-version record.
    // The post-render restore re-stages the pre-export record from its
    // JSON; on the tip code that re-stage re-checked the STRICT version
    // policy, failed, and left g.record on the segment's record — the
    // post-export settle then adjudicated a phantom fresh shot (red:
    // restore console.error + share-log growth + wrong live record).
    const f7c0 = failCount;
    const diagErr = await chrome.eval(`(() => {
      const r = JSON.parse(__share.records()[0]);
      r.kernel_version = 'e2e-foreign-0.0.0';
      return window.__test.loadRecord(JSON.stringify(r),
        { allowVersionMismatch: true });
    })()`);
    if (diagErr !== null) {
      fail(`[F7] diagnostic loadRecord rejected: ${diagErr}`);
    } else {
      await waitAim('[F7 diagnostic settle]');
      const f7Shots = await chrome.eval('__share.log().shots');
      const f7Errs0 = consoleErrors.length;
      const f7 = await chrome.eval(`__export.renderDrill(
        [__share.records()[1]],
        { width: 640, height: 360, noDownload: true, withAudio: false })`);
      await waitAim('[F7 render settle]');
      if (!(f7?.frames > 0)) {
        fail('[F7] 1-segment drill render over the diagnostic table produced '
          + 'no frames: ' + JSON.stringify(f7));
      }
      const restoreErrs = consoleErrors.slice(f7Errs0)
        .filter((e) => /drill state restore failed/.test(e));
      if (restoreErrs.length) {
        fail(`[F7] restore re-checked stricter than the original acceptance: `
          + restoreErrs[0]);
      }
      // the live record must be the DIAGNOSTIC record again (identity
      // restore), not the rendered segment's record — distinguish by the
      // records' event streams
      const f7Live = await chrome.eval(`(() => ({
        want: JSON.parse(__share.records()[0]).events.length,
        other: JSON.parse(__share.records()[1]).events.length,
        got: __test.events().length }))()`);
      if (f7Live.want === f7Live.other) {
        console.log('[F7] note: records 0/1 have equal event counts — the '
          + 'live-record check cannot distinguish them this run');
      } else if (f7Live.got !== f7Live.want) {
        fail(`[F7] live record after the render has ${f7Live.got} events, `
          + `want the diagnostic record's ${f7Live.want} (restore left the `
          + `segment's record staged)`);
      }
      const f7ShotsAfter = await chrome.eval('__share.log().shots');
      if (f7ShotsAfter !== f7Shots) {
        fail(`[F7] share log grew ${f7Shots} -> ${f7ShotsAfter} across the `
          + 'render (failed restore → phantom fresh-shot adjudication)');
      }
      if (failCount === f7c0) {
        console.log('[F7] OK — diagnostic-accepted record restored after the '
          + `drill render (share log still ${f7ShotsAfter} shots, live record `
          + 'identity intact)');
      }
    }

    // ==== GH-304 byte-derived export budget: B1-B5 ============================
    // The ONE derivation (offline-render.js exportBudgetSec) pinned with
    // fixture rates per destination class, the honest-floor red-proofs, the
    // calibration write from a REAL render, and renderDrill consuming the
    // plan-time opts.budgetSec in its cap-convergence loop.
    {
      const bc0 = failCount;
      const WALL_WIRE = 384 * 1024 * 1024;
      const WALL_TRANSCODE = 192 * 1024 * 1024;
      const SAFETY = 0.85;
      const OUT_BPS = (8e6 + 128e3) / 8 * 1.02; // the transcode re-encode rate
      // the documented derivation, replicated (offline-render.js
      // exportBudgetSec): wall / worst-of(measured, CONFIGURED nominal)
      // rates, and the webm→Photos path additionally bounded by the
      // combined 2×source + 3×output allocation (transcode holds the input
      // Blob AND its ArrayBuffer beside the output's pow2+slice finalize
      // transient), and files never past the ruled 300 MB acceptance
      const budgetOf = (format, height, photos, Bps) => {
        const nominal = (({ 720: 8e6, 1080: 12e6, 1440: 24e6,
          2160: 40e6 })[height]
          ?? Math.round(12e6 * (height / 1080) ** 2)) / 8 + 16000;
        const worst = Math.max(Bps, nominal);
        const transcoded = format === 'webm' && photos === true;
        const wall = transcoded ? WALL_TRANSCODE : WALL_WIRE;
        // 300e6 = the ruled file-size acceptance (the finalize pow2+slice
        // transient the shipped design already carries)
        let sec = Math.min(wall * SAFETY, 300e6) / worst;
        if (transcoded) {
          sec = Math.min(sec,
            WALL_WIRE * SAFETY / (2 * worst + 3 * OUT_BPS));
        }
        return { sec: Math.max(1, Math.floor(sec)), wall };
      };
      const bud = (args) => chrome.eval(
        `import('/app/offline-render.js').then((m) => m.exportBudgetSec(${args}))`);
      // ---- B1: arithmetic pinned per destination class (fixture rates) ------
      await chrome.eval(`localStorage.setItem('ob-export-bps-v1',
        JSON.stringify({ 'mp4:1080': { Bps: 3e6, n: 2 },
          'webm:1080': { Bps: 4e6, n: 1 }, 'mp4:2160': { Bps: 5.5e6, n: 3 } }))`);
      const b1 = [
        // native-capable mp4 → the 384 MiB save-wire envelope
        [await bud(`{ format: 'mp4', height: 1080, photos: false }`),
          budgetOf('mp4', 1080, false, 3e6)],
        // mp4 to Photos posts DIRECTLY — photos must NOT tighten mp4
        [await bud(`{ format: 'mp4', height: 1080, photos: true }`),
          budgetOf('mp4', 1080, false, 3e6)],
        // webm with a reachable Photos → the transcode + combined walls
        [await bud(`{ format: 'webm', height: 1080, photos: true }`),
          budgetOf('webm', 1080, true, 4e6)],
        // webm without Photos → back on the wire envelope
        [await bud(`{ format: 'webm', height: 1080, photos: false }`),
          budgetOf('webm', 1080, false, 4e6)],
        // 4K native (nominal 40 Mbps — the measured 5.5 MB/s overshoots it)
        [await bud(`{ format: 'mp4', height: 2160, photos: false }`),
          budgetOf('mp4', 2160, false, 5.5e6)],
      ];
      for (const [got, want] of b1) {
        if (!(got?.derived === true && got.sec === want.sec
          && got.wall === want.wall)) {
          fail(`[B1] derived budget mismatch: want ${JSON.stringify(want)} `
            + `(derived: true), got ${JSON.stringify(got)}`);
        }
      }
      // the NOMINAL-rate bound (review round-5 P1): a LOW-rate sample must
      // not loosen a wall past what the CONFIGURED 12 Mbps + audio rate
      // could produce — the worst-of law prices this webm at nominal, and
      // the combined transcode allocation (2×source + output) governs
      await chrome.eval(`localStorage.setItem('ob-export-bps-v1',
        JSON.stringify({ 'webm:1080': { Bps: 3e5, n: 1 } }))`);
      const bOut = await bud(`{ format: 'webm', height: 1080, photos: true }`);
      const wantOut = budgetOf('webm', 1080, true, 3e5);
      const measuredOnly = Math.floor(WALL_TRANSCODE * SAFETY / 3e5);
      if (!(bOut?.derived === true && bOut.sec === wantOut.sec
        && wantOut.sec < measuredOnly)) {
        fail(`[B1] nominal-rate + combined-allocation wall: want `
          + `${wantOut.sec}s (< measured-only ${measuredOnly}s), got `
          + JSON.stringify(bOut));
      }
      if (failCount === bc0) {
        console.log('[B1] OK — derivation pinned per class: mp4@1080 '
          + `${b1[0][0].sec}s (photos-insensitive), webm@1080 ${b1[2][0].sec}s `
          + `transcode-walled / ${b1[3][0].sec}s wire-walled, mp4@4K `
          + `${b1[4][0].sec}s, low-rate webm→Photos capped at ${bOut.sec}s by `
          + 'the nominal rate + combined 2×source+3×output allocation');
      }
      // ---- B2: the honest floor, red-proofed ---------------------------------
      const bc2 = failCount;
      const floorCases = [
        ['absent store', `localStorage.removeItem('ob-export-bps-v1')`],
        ['corrupt JSON', `localStorage.setItem('ob-export-bps-v1', '{oops')`],
        ['zero rate', `localStorage.setItem('ob-export-bps-v1',
          JSON.stringify({ 'mp4:1080': { Bps: 0 } }))`],
        ['negative rate', `localStorage.setItem('ob-export-bps-v1',
          JSON.stringify({ 'mp4:1080': { Bps: -5e6 } }))`],
        ['insane-high rate', `localStorage.setItem('ob-export-bps-v1',
          JSON.stringify({ 'mp4:1080': { Bps: 1e12 } }))`],
        ['below the sanity floor', `localStorage.setItem('ob-export-bps-v1',
          JSON.stringify({ 'mp4:1080': { Bps: 15999 } }))`],
        ['other key only', `localStorage.setItem('ob-export-bps-v1',
          JSON.stringify({ 'webm:720': { Bps: 3e6 } }))`],
      ];
      for (const [what, setup] of floorCases) {
        await chrome.eval(setup);
        const got = await bud(`{ format: 'mp4', height: 1080, photos: false }`);
        if (!(got?.sec === 60 && got.derived === false)) {
          fail(`[B2] ${what}: want the EXACT 60 s floor (derived:false), got `
            + JSON.stringify(got));
        }
      }
      if (failCount === bc2) {
        console.log('[B2] OK — honest floor: absent/corrupt/insane stores all '
          + 'answer exactly 60 s, derived:false');
      }
      // ---- B3: the __export.exportBudget seam resolves the REAL container ---
      const bc3 = failCount;
      if (await chrome.eval('window.__export.byteBudgetCapable') !== true) {
        fail('[B3] byteBudgetCapable !== true on a fresh pairing');
      }
      const negFmt = (await chrome.eval('__export.tiers()')).standard;
      if (negFmt !== 'mp4' && negFmt !== 'webm') {
        fail(`[B3] no negotiated standard-tier container (${negFmt})`);
      } else {
        await chrome.eval(`localStorage.setItem('ob-export-bps-v1',
          JSON.stringify({ '${negFmt}:1080': { Bps: 2.5e6, n: 1 } }))`);
        const viaSeam = await chrome.eval(
          `__export.exportBudget({ tier: 'standard', height: 1080, photos: false })`);
        const wantSeam = budgetOf(negFmt, 1080, false, 2.5e6).sec;
        if (!(viaSeam?.derived === true && viaSeam.sec === wantSeam)) {
          fail(`[B3] seam budget over the negotiated ${negFmt} container: want `
            + `${wantSeam}s derived, got ${JSON.stringify(viaSeam)}`);
        }
        // the estimateDrill parity law: a non-offline tier resolves standard
        const viaRt = await chrome.eval(
          `__export.exportBudget({ tier: 'realtime', height: 1080, photos: false })`);
        if (!(viaRt?.sec === viaSeam?.sec)) {
          fail(`[B3] realtime-tier seam call must resolve the standard tier `
            + `(estimateDrill parity): ${JSON.stringify(viaRt)} vs `
            + JSON.stringify(viaSeam));
        }
      }
      if (failCount === bc3) {
        console.log(`[B3] OK — seam derives over the negotiated ${negFmt} `
          + 'container, byteBudgetCapable true, realtime resolves standard');
      }
      // ---- B4: renderDrill consumes the plan-time budgetSec -----------------
      // A REAL over-budget render: 3 records at ¼× plan far over 12 s;
      // the cap loop must converge to the DERIVED ceiling (720 frames),
      // never the 60 s floor. Fresh store first — this render is also B5's
      // fresh calibration-write source.
      const bc4 = failCount;
      await chrome.eval(`localStorage.removeItem('ob-export-bps-v1')`);
      // slice(0, 3): the three playground shots — F7 appended a FOREIGN
      // diagnostic record to the rack log, which strict staging refuses
      const b4 = await chrome.eval(`__export.renderDrill(
        __share.records().slice(0, 3),
        { width: 320, height: 180, noDownload: true, withAudio: false,
          slowmo: 0.25, budgetSec: 12,
          onMontage: (r) => { window.__b4Montage = r; } })`);
      await waitAim('[B4 budget settle]');
      if (!b4 || b4.segments?.length !== 3) {
        fail('[B4] budgeted drill render returned no 3-segment result: '
          + JSON.stringify(b4 && { frames: b4.frames, segments: b4.segments }));
      } else {
        if (b4.frames > 12 * 60) {
          fail(`[B4] budgeted render emitted ${b4.frames} frames — ABOVE the `
            + 'derived 12 s ceiling (720): renderDrill did not consume '
            + 'opts.budgetSec');
        }
        if (b4.frames <= 12 * 60 - 60) {
          fail(`[B4] budgeted render emitted only ${b4.frames} frames — the `
            + 'cap must target the derived ceiling, not over-compress');
        }
        if (!(b4.montageRate > 1)
          || !(Math.abs((await chrome.eval('window.__b4Montage') ?? 0)
            - b4.montageRate) < 1e-9)) {
          fail(`[B4] montage rate ${b4.montageRate} not engaged/surfaced for `
            + 'the budgeted render');
        }
      }
      if (failCount === bc4) {
        console.log(`[B4] OK — renderDrill converged to ${b4.frames} frames `
          + `≤ 720 under opts.budgetSec 12 (montage rate `
          + `${b4.montageRate.toFixed(4)})`);
      }
      // ---- B5: the calibration write + MAX aggregation -----------------------
      const bc5 = failCount;
      const cal = await chrome.eval(`(() => {
        const m = JSON.parse(localStorage.getItem('ob-export-bps-v1') ?? '{}');
        return m[Object.keys(m)[0]] ? { key: Object.keys(m)[0],
          ...m[Object.keys(m)[0]] } : null; })()`);
      const wantBps = b4?.size > 0 ? Math.round(b4.size / b4.clipSec) : 0;
      if (!b4?.size || !cal || !/^(mp4|webm):180$/.test(cal.key)) {
        fail('[B5] the successful B4 render wrote no calibration sample: '
          + JSON.stringify(cal));
      } else if (!(Math.abs(cal.Bps - wantBps) <= 1)) {
        fail(`[B5] calibration Bps ${cal.Bps} != the render's own whole-file `
          + `rate ${wantBps} (size ${b4.size} / clipSec ${b4.clipSec})`);
      } else {
        // MAX law: a seeded HIGHER rate must survive a lower-rate render
        await chrome.eval(`localStorage.setItem('ob-export-bps-v1',
          JSON.stringify({ '${cal.key}': { Bps: 5e7, n: 9 } }))`);
        const b5 = await chrome.eval(`__export.renderDrill(
          [__share.records()[0]], { width: 320, height: 180,
            noDownload: true, withAudio: false,
            trims: [{ startT: 0, endT: 3.5 }] })`);
        await waitAim('[B5 max-law settle]');
        const cal2 = await chrome.eval(`JSON.parse(
          localStorage.getItem('ob-export-bps-v1'))['${cal.key}']`);
        if (!(b5?.frames > 0) || !cal2 || cal2.Bps !== 5e7 || cal2.n !== 10) {
          fail(`[B5] MAX aggregation broken: seeded 5e7/n:9, rendered `
            + `${b5?.frames} frames, store now ${JSON.stringify(cal2)}`);
        }
      }
      await chrome.eval(`localStorage.removeItem('ob-export-bps-v1')`);
      if (failCount === bc5) {
        console.log(`[B5] OK — real render calibrated ${cal.key} at `
          + `${cal.Bps} B/s (its own bytes/clipSec), MAX law holds against `
          + 'a conservative-higher prior');
      }
    }

    // ==== GH-305: the STREAMING full-length sink (FULL1-FULL3) ================
    {
      // ---- FULL1: budget exemption + wire completeness (REAL render) --------
      // B4 above is the RED: this exact plan class (3 records, slowed)
      // converges under opts.budgetSec 12 on the montage path. The streamed
      // path must ignore the budget BY DESIGN.
      const fc1 = failCount;
      const full1 = await chrome.eval(`(async () => {
        window.__fullPieces = [];
        window.__fullProgDone = 0;
        window.__fullFirstPieceAtFrame = null;
        window.__fullMontage = undefined;
        let r;
        try {
          r = await __export.renderDrill(__share.records().slice(0, 3), {
            width: 320, height: 180, noDownload: true, withAudio: true,
            slowmo: 0.5, budgetSec: 12, keepBytes: true, keepBlob: true,
            onMontage: (x) => { window.__fullMontage = x; },
            onProgress: (done) => { window.__fullProgDone = done; },
            stream: { post: async (data, at) => {
              if (window.__fullFirstPieceAtFrame === null) {
                window.__fullFirstPieceAtFrame = window.__fullProgDone;
              }
              let b = '';
              for (let i = 0; i < data.length; i += 0x8000) {
                b += String.fromCharCode.apply(null,
                  data.subarray(i, i + 0x8000));
              }
              window.__fullPieces.push({ at, b64: btoa(b) });
            } },
          });
        } catch (e) { return { err: String(e?.message ?? e) }; }
        if (!r) return { err: 'null result' };
        return { frames: r.frames, size: r.size, clipSec: r.clipSec,
          ext: r.ext, montageRate: r.montageRate, segments: r.segments,
          streamedBytes: r.streamedBytes ?? null,
          hasB64: r.b64 != null, hasBlob: r.blob != null,
          montageCb: window.__fullMontage ?? null,
          firstPieceAtFrame: window.__fullFirstPieceAtFrame,
          pieces: window.__fullPieces.length };
      })()`);
      await waitAim('[FULL1 settle]');
      if (!full1 || full1.err) {
        fail(`[FULL1] streamed drill render failed: ${full1?.err}`);
      } else {
        if (full1.frames <= 12 * 60) {
          fail(`[FULL1] streamed render emitted ${full1.frames} frames — the `
            + 'plan was supposed to exceed the 12 s budget the mode is '
            + 'exempt from (B4 red-proved the montage path compresses here)');
        }
        if (full1.montageRate !== 1 || full1.montageCb !== null) {
          fail(`[FULL1] full render montaged (rate ${full1.montageRate}, `
            + `onMontage ${full1.montageCb}) — the stream mode must pin 1`);
        }
        if (!(full1.streamedBytes > 0) || full1.size !== full1.streamedBytes) {
          fail(`[FULL1] streamedBytes ${full1.streamedBytes} / size `
            + `${full1.size} disagree or are empty`);
        }
        if (full1.hasB64 || full1.hasBlob) {
          fail('[FULL1] a streamed render returned page-side container bytes '
            + '(keepBytes/keepBlob must be structurally inert — the whole '
            + 'point is that the file never exists in WebContent)');
        }
        if (!(full1.pieces >= 2)
          || !(full1.firstPieceAtFrame !== null
            && full1.firstPieceAtFrame < full1.frames)) {
          fail(`[FULL1] no interleaving: first piece at frame `
            + `${full1.firstPieceAtFrame} of ${full1.frames} `
            + `(${full1.pieces} pieces) — chunks must cross the wire DURING `
            + 'the encode, not at finalize');
        }
        // assemble the positioned pieces node-side (the shell's disk law:
        // append or backpatch, never a hole) and ffprobe the REAL file
        const pieces = await chrome.eval('window.__fullPieces');
        await chrome.eval('window.__fullPieces = null');
        const bufs = pieces.map((p) => ({ at: p.at,
          data: Buffer.from(p.b64, 'base64') }));
        let extent = 0;
        for (const p of bufs) extent = Math.max(extent, p.at + p.data.length);
        const assembled = Buffer.alloc(extent);
        let holes = 0;
        let covered = 0;
        for (const p of bufs) {
          if (p.at > covered) holes++;
          p.data.copy(assembled, p.at);
          covered = Math.max(covered, p.at + p.data.length);
        }
        if (holes) fail(`[FULL1] ${holes} positioned pieces left holes`);
        if (extent !== full1.streamedBytes) {
          fail(`[FULL1] assembled extent ${extent} != streamedBytes `
            + `${full1.streamedBytes}`);
        }
        const fFile = path.join(OUTDIR, 'full-stream.mp4');
        fs.writeFileSync(fFile, assembled);
        const fProbe = (args) => execFileSync('ffprobe',
          ['-v', 'error', ...args, fFile]).toString().trim();
        const fv = fProbe(['-select_streams', 'v:0', '-show_entries',
          'stream=codec_name', '-of', 'csv=p=0']);
        const fa = fProbe(['-select_streams', 'a:0', '-show_entries',
          'stream=codec_name', '-of', 'csv=p=0']);
        if (fv !== 'h264' || fa !== 'aac') {
          fail(`[FULL1] assembled codecs ${fv}+${fa}, want h264+aac`);
        }
        const fFrames = Number(fProbe(['-count_frames', '-select_streams',
          'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0']));
        if (fFrames !== full1.frames) {
          fail(`[FULL1] decoded ${fFrames} frames from the assembled file, `
            + `want ${full1.frames} — the positioned writes (mdat/moov `
            + 'backpatches included) did not reconstruct the render');
        }
        const fDur = Number(fProbe(['-select_streams', 'v:0', '-show_entries',
          'stream=duration', '-of', 'csv=p=0']));
        if (!(Math.abs(fDur - full1.frames / 60) < 0.05)) {
          fail(`[FULL1] assembled duration ${fDur}, want ≈ `
            + `${(full1.frames / 60).toFixed(2)} (the 1:1 promise)`);
        }
        if (failCount === fc1) {
          console.log(`[FULL1] OK — ${full1.frames} frames streamed as `
            + `${full1.pieces} positioned pieces (${extent} B, first piece `
            + `at frame ${full1.firstPieceAtFrame}) past a 12 s budget the `
            + 'mode is exempt from; assembled file decodes h264+aac at '
            + `${fDur.toFixed(2)} s`);
        }
      }
      await chrome.eval(`localStorage.removeItem('ob-export-bps-v1')`);

      // ---- FULL2: memory red/green at the sink (the accumulation point) -----
      const fc2 = failCount;
      await chrome.send('HeapProfiler.enable');
      const gcHeap = async () => {
        await chrome.send('HeapProfiler.collectGarbage');
        await sleep(150);
        await chrome.send('HeapProfiler.collectGarbage');
        const h = await chrome.send('Runtime.getHeapUsage');
        // ArrayBuffer backing stores live OUTSIDE usedSize (probed on the
        // pinned shell: a 50 MB Uint8Array moves backingStorageSize by
        // ~54 MB and usedSize by ~3 MB) — the file buffer is the thing
        // this arm measures, so sum both.
        return h.usedSize + (h.backingStorageSize ?? 0);
      };
      await chrome.eval(`window.__memRun = async (stream) => {
        const m = await import('/app/offline-render.js');
        const W = 640, H = 360, N = 1500;
        // incompressible MOVING noise → the encoder pins to its bitrate
        // budget (flat synthetic frames would compress to ~nothing and the
        // file would be too small to measure against heap noise)
        const noise = document.createElement('canvas');
        noise.width = W * 2; noise.height = H;
        const ng = noise.getContext('2d');
        const nd = ng.createImageData(W * 2, H);
        for (let o = 0; o < nd.data.length; o += 65536) {
          crypto.getRandomValues(
            nd.data.subarray(o, Math.min(o + 65536, nd.data.length)));
        }
        ng.putImageData(nd, 0, 0);
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d');
        const sink = m.createSink({ format: 'mp4', width: W, height: H,
          bitrate: 8e6, withAudio: false, stream });
        for (let k = 0; k < N; k++) {
          const dx = (k * 7) % W;
          g.drawImage(noise, -dx, 0);
          const f = new VideoFrame(c, { timestamp: Math.round(k * 1e6 / 60),
            duration: Math.round(1e6 / 60) });
          try { sink.video.encode(f, { keyFrame: k % 120 === 0 }); }
          finally { f.close(); }
          if (sink.error) throw sink.error;
          while (sink.video.encodeQueueSize > 4) {
            await new Promise((r) => setTimeout(r, 2));
            if (sink.error) throw sink.error;
          }
          if (sink.drainWire) await sink.drainWire();
        }
        return sink.finalize(); // number (streamed) | Uint8Array (buffered)
      }`);
      const h0 = await gcHeap();
      const green = await chrome.eval(`(async () => {
        let posted = 0;
        const out = await window.__memRun(
          { post: async (d) => { posted += d.length; } });
        return { out, posted };
      })()`);
      const h1 = await gcHeap();
      const redLen = await chrome.eval(
        'window.__memRun(undefined).then((b) => { window.__memRed = b; return b.length; })');
      const h2 = await gcHeap();
      await chrome.eval('window.__memRed = null');
      const h3 = await gcHeap();
      await chrome.eval('window.__memRun = null');
      const greenDelta = h1 - h0;
      const redDelta = h2 - h1;
      const redReleased = h2 - h3;
      // posted ≥ extent: finalize BACKPATCHES re-post small already-counted
      // regions (the mp4 mdat size field — measured exactly +8 B), so the
      // sum of posted lengths exceeds the extent by the backpatch bytes,
      // never by retained payload.
      if (!(green?.out > 8e6) || !(green.posted >= green.out)
        || !(green.posted - green.out < 65536)) {
        fail(`[FULL2] streamed sink extent ${green?.out} / posted `
          + `${green?.posted} — want posted == extent + small backpatches `
          + '(every byte left the page, none retained)');
      }
      if (!(redLen > 8e6)) {
        fail(`[FULL2] buffered sink produced only ${redLen} B — too small `
          + 'to measure the accumulation against heap noise');
      }
      if (!(redDelta >= 0.7 * redLen)) {
        fail(`[FULL2] RED broke: the ArrayBufferTarget sink grew the heap by `
          + `${(redDelta / 1e6).toFixed(1)} MB for a ${(redLen / 1e6).toFixed(1)} MB `
          + 'file — the accumulation this mode kills is no longer measurable '
          + '(metric drift?)');
      }
      if (!(redReleased >= 0.6 * redLen)) {
        fail(`[FULL2] RED release broke: dropping the buffer returned only `
          + `${(redReleased / 1e6).toFixed(1)} MB of ${(redLen / 1e6).toFixed(1)} MB`);
      }
      if (!(greenDelta < 8e6)) {
        fail(`[FULL2] GREEN broke: the STREAMED sink retained `
          + `${(greenDelta / 1e6).toFixed(1)} MB after a `
          + `${(green?.out / 1e6).toFixed(1)} MB export — WebContent memory `
          + 'must stay flat (the build-13 jetsam class)');
      }
      if (failCount === fc2) {
        console.log(`[FULL2] OK — memory red/green at the sink: buffered `
          + `+${(redDelta / 1e6).toFixed(1)} MB for a `
          + `${(redLen / 1e6).toFixed(1)} MB file (released `
          + `${(redReleased / 1e6).toFixed(1)} MB); streamed `
          + `+${(greenDelta / 1e6).toFixed(1)} MB for `
          + `${(green.out / 1e6).toFixed(1)} MB posted`);
      }
      await chrome.eval(`localStorage.removeItem('ob-export-bps-v1')`);

      // ---- FULL3: a refused wire write fails the render honestly ------------
      const fc3 = failCount;
      const f3 = await chrome.eval(`(async () => {
        try {
          await __export.renderDrill([__share.records()[0]], {
            width: 320, height: 180, noDownload: true, withAudio: false,
            stream: { post: async () => { throw new Error('write-failed'); } },
          });
          return { threw: false };
        } catch (e) { return { threw: true, msg: String(e?.message ?? e) }; }
      })()`);
      await waitAim('[FULL3 settle]');
      if (!f3?.threw || !/write-failed/.test(f3.msg ?? '')) {
        fail('[FULL3] refused wire write did not fail the render with the '
          + `shell's token: ${JSON.stringify(f3)}`);
      }
      // recovery: the engine renders again after the refused stream
      const f3b = await chrome.eval(`__export.renderDrill(
        [__share.records()[0]], { width: 320, height: 180,
          noDownload: true, withAudio: false,
          trims: [{ startT: 0, endT: 3.5 }] })`);
      await waitAim('[FULL3 recovery settle]');
      if (!(f3b?.frames > 0)) {
        fail('[FULL3] engine did not recover after the refused stream: '
          + JSON.stringify(f3b && { frames: f3b.frames }));
      }
      await chrome.eval(`localStorage.removeItem('ob-export-bps-v1')`);
      if (failCount === fc3) {
        console.log(`[FULL3] OK — refused write surfaced "${f3.msg}", next `
          + `render delivered ${f3b.frames} frames`);
      }

      // ---- FULL4: windowed-bed seam proof (GH-373) ---------------------------
      // renderDrillAudioWindowed against renderDrillAudio over ONE shared
      // timeline that plants the record's LOUDEST cue 30 ms before window
      // join 1 (its ring MUST cross the join — the exact class the derived
      // pre-roll exists to reconstruct). GREEN: whole-PCM max|Δ| and every
      // ±0.1 s join neighborhood ≤ 1e-6 (−120 dBFS — the documented
      // ≤1.5 ulp float-summing class rides well under it; no crossfade
      // colored the mix because there IS no crossfade). RED: the same
      // windows with preRollFrames 0 (the naive butt-join) show an
      // audible-class delta at the armed join — the metric catches bad
      // windowing and the pre-roll is load-bearing.
      const fc4 = failCount;
      const f4 = await chrome.eval(`(async () => {
        const ea = await import('/app/export-audio.js');
        const snd = await import('/app/sound.js');
        if (typeof ea.renderDrillAudioWindowed !== 'function') {
          return { err: 'renderDrillAudioWindowed missing' };
        }
        const rec = JSON.parse(__share.records()[0]);
        const dur = rec.events?.length
          ? rec.events[rec.events.length - 1].t : 5;
        const RATE = ea.AUDIO_RATE;
        const joins = [ea.AUDIO_WINDOW_FRAMES / RATE,
          2 * ea.AUDIO_WINDOW_FRAMES / RATE];
        const cues = snd.deriveCues(rec);
        if (!cues.length) return { err: 'record has no cues' };
        let loud = cues[0];
        for (const c of cues) if (c.gain > loud.gain) loud = c;
        const seg = (offsetSec) => ({ record: rec, rate: 1, startT: 0,
          endT: null, offsetSec, windowSec: dur + 2 });
        const segs = [seg(0),
          seg(Math.max(0, joins[0] - 0.03 - loud.t)),
          seg(Math.max(0, joins[1] - 0.5))];
        const totalSec = Math.max(
          ...segs.map((s) => s.offsetSec + s.windowSec)) + 1;
        const one = await ea.renderDrillAudio(segs, { totalSec });
        const n = one.length;
        const assemble = async (opts) => {
          const out = [new Float32Array(n), new Float32Array(n)];
          let covered = 0, windows = 0;
          for await (const w of ea.renderDrillAudioWindowed(segs,
            { totalSec, ...opts })) {
            if (w.baseFrames !== covered) {
              return { err: 'window gap at frame ' + w.baseFrames };
            }
            for (let c = 0; c < 2; c++) {
              out[c].set(w.buffer.getChannelData(c)
                .subarray(w.skipFrames, w.skipFrames + w.frames),
              w.baseFrames);
            }
            covered = w.baseFrames + w.frames;
            windows++;
          }
          if (covered !== n) {
            return { err: 'coverage ' + covered + ' != ' + n };
          }
          return { out, windows };
        };
        const cmp = (out) => {
          let maxDiff = 0;
          for (let c = 0; c < 2; c++) {
            const a = one.getChannelData(c), b = out[c];
            for (let i = 0; i < n; i++) {
              const d = Math.abs(a[i] - b[i]);
              if (d > maxDiff) maxDiff = d;
            }
          }
          const joinDiffs = joins.map((j) => {
            const at = Math.round(j * RATE);
            let m = 0;
            for (let c = 0; c < 2; c++) {
              const a = one.getChannelData(c), b = out[c];
              for (let i = Math.max(0, at - 4800);
                i < Math.min(n, at + 4800); i++) {
                const d = Math.abs(a[i] - b[i]);
                if (d > m) m = d;
              }
            }
            return m;
          });
          return { maxDiff, joinDiffs };
        };
        const green = await assemble({});
        if (green.err) return { err: green.err };
        const red = await assemble({ preRollFrames: 0 });
        if (red.err) return { err: 'red: ' + red.err };
        // signal level around the armed join — the RED delta is judged
        // audible-class against real signal, not digital silence
        const at1 = Math.round(joins[0] * RATE);
        let rms = 0;
        {
          const a = one.getChannelData(0);
          for (let i = at1 - 2400; i < at1 + 2400; i++) rms += a[i] * a[i];
          rms = Math.sqrt(rms / 4800);
        }
        return { n, totalSec, windows: green.windows, loudGain: loud.gain,
          joinRms: rms, ...cmp(green.out), red: cmp(red.out) };
      })()`);
      if (!f4 || f4.err) {
        fail(`[FULL4] seam-proof render failed: ${f4?.err}`);
      } else {
        if (!(f4.windows >= 3)) {
          fail(`[FULL4] timeline spanned only ${f4.windows} windows — the `
            + 'joins under test do not exist');
        }
        if (!(f4.maxDiff <= 1e-6)) {
          fail(`[FULL4] windowed bed diverges from the one-context bed: `
            + `max|Δ| ${f4.maxDiff} > 1e-6 over ${f4.n} frames`);
        }
        if (!f4.joinDiffs.every((d) => d <= 1e-6)) {
          fail(`[FULL4] join neighborhoods not clean: max|Δ| `
            + `[${f4.joinDiffs.join(', ')}] — a seam exists`);
        }
        if (!(f4.red.joinDiffs[0] > 1e-3)) {
          fail(`[FULL4] RED broke: the naive butt-join (preRoll 0) showed `
            + `only ${f4.red.joinDiffs[0]} at the armed join (signal rms `
            + `${f4.joinRms}) — the metric can no longer catch bad `
            + 'windowing (did the timeline stop planting a ringing cue?)');
        }
        if (failCount === fc4) {
          console.log(`[FULL4] OK — ${f4.windows} windows over `
            + `${f4.totalSec.toFixed(1)} s: green max|Δ| ${f4.maxDiff} `
            + `(joins [${f4.joinDiffs.join(', ')}]), red butt-join `
            + `${f4.red.joinDiffs[0].toFixed(4)} at the armed join `
            + `(rms ${f4.joinRms.toFixed(4)}, loudest cue gain `
            + `${f4.loudGain.toFixed(2)})`);
        }
      }

      // ---- FULL5: bed memory red/green (GH-373; the FULL2 discipline) --------
      // The transient the wall priced: a 390 s one-piece bed materializes
      // ~150 MB page-side (2 ch × 4 B × 48 kHz × 390 s) and is only
      // reclaimable as a whole; the windowed generator holds ONE ~30.7 s
      // window at a time — the per-window heap samples stay O(window).
      const fc5 = failCount;
      await chrome.eval(`window.__bed = (() => {
        const mk = () => {
          const rec = JSON.parse(__share.records()[0]);
          const segs = [];
          for (let o = 0; o < 390; o += 30) {
            segs.push({ record: rec, rate: 1, startT: 0, endT: null,
              offsetSec: o, windowSec: 30 });
          }
          return segs;
        };
        return {
          async red() {
            const ea = await import('/app/export-audio.js');
            window.__bedBuf = await ea.renderDrillAudio(mk(),
              { totalSec: 390 });
            // touch both planes — what the encoder feed materializes
            let s = 0;
            for (let c = 0; c < 2; c++) {
              s += window.__bedBuf.getChannelData(c)[0];
            }
            return { frames: window.__bedBuf.length, s };
          },
          async greenStart() {
            const ea = await import('/app/export-audio.js');
            window.__bedGen = ea.renderDrillAudioWindowed(mk(),
              { totalSec: 390 });
            return true;
          },
          async greenStep() {
            const { value, done } = await window.__bedGen.next();
            if (done) {
              window.__bedWin = null;
              window.__bedGen = null;
              return { done: true };
            }
            let s = 0;
            for (let c = 0; c < 2; c++) {
              s += value.buffer.getChannelData(c)[0];
            }
            // hold exactly ONE window live across the heap sample — the
            // bounded transient this arm asserts
            window.__bedWin = value.buffer;
            return { done: false, frames: value.frames, s };
          },
        };
      })()`);
      const b0 = await gcHeap();
      const bedRed = await chrome.eval('window.__bed.red()');
      const b1 = await gcHeap();
      await chrome.eval('window.__bedBuf = null');
      const b2 = await gcHeap();
      const bedBytes = bedRed.frames * 2 * 4;
      const redDelta5 = b1 - b0;
      const redReleased5 = b1 - b2;
      if (bedRed.frames !== Math.ceil(390 * 48000)) {
        fail(`[FULL5] one-piece bed rendered ${bedRed.frames} frames, want `
          + `${Math.ceil(390 * 48000)}`);
      }
      if (!(redDelta5 >= 0.7 * bedBytes)) {
        fail(`[FULL5] RED broke: the 390 s one-piece bed grew the heap by `
          + `${(redDelta5 / 1e6).toFixed(1)} MB for a `
          + `${(bedBytes / 1e6).toFixed(1)} MB bed — the transient the wall `
          + 'priced is no longer measurable (metric drift?)');
      }
      if (!(redReleased5 >= 0.6 * bedBytes)) {
        fail(`[FULL5] RED release broke: dropping the bed returned only `
          + `${(redReleased5 / 1e6).toFixed(1)} MB of `
          + `${(bedBytes / 1e6).toFixed(1)} MB`);
      }
      await chrome.eval('window.__bed.greenStart()');
      let bedPeak = 0;
      let bedSteps = 0;
      for (;;) {
        const st = await chrome.eval('window.__bed.greenStep()');
        if (!st || st.done) break;
        bedSteps++;
        const h = await gcHeap();
        bedPeak = Math.max(bedPeak, h - b2);
        if (bedSteps > 64) {
          fail('[FULL5] windowed generator never finished (tripwire)');
          break;
        }
      }
      const b3 = await gcHeap();
      const wantSteps = Math.ceil(Math.ceil(390 * 48000) / (1024 * 1440));
      if (bedSteps !== wantSteps) {
        fail(`[FULL5] windowed bed yielded ${bedSteps} windows, want `
          + `${wantSteps}`);
      }
      if (!(bedPeak < 48e6 && bedPeak < 0.35 * redDelta5)) {
        fail(`[FULL5] GREEN broke: windowed bed peaked at `
          + `+${(bedPeak / 1e6).toFixed(1)} MB (one live window ≈ 12.6 MB) `
          + `against a ${(redDelta5 / 1e6).toFixed(1)} MB one-piece RED — `
          + 'the transient is no longer O(window)');
      }
      if (!(b3 - b2 < 8e6)) {
        fail(`[FULL5] windowed bed retained ${((b3 - b2) / 1e6).toFixed(1)} MB `
          + 'after the run');
      }
      await chrome.eval('window.__bed = null');
      if (failCount === fc5) {
        console.log(`[FULL5] OK — bed memory red/green: one-piece `
          + `+${(redDelta5 / 1e6).toFixed(1)} MB for a `
          + `${(bedBytes / 1e6).toFixed(1)} MB bed (released `
          + `${(redReleased5 / 1e6).toFixed(1)} MB); windowed peak `
          + `+${(bedPeak / 1e6).toFixed(1)} MB across ${bedSteps} windows`);
      }

      // ---- FULL6: the with-sound wall LIFTED end-to-end (GH-373) -------------
      // The plan class v1 refused at 390 s renders 1:1 WITH sound: one
      // record slowed past the retired wall streams ~392 s of output
      // through the v3-wire sink; the positioned pieces assemble
      // node-side and ffprobe proves the delivered file — h264+aac,
      // decoded frames == frames > 390·60, audio spanning the video.
      const fc6 = failCount;
      // start-then-poll (GH-248 discipline): a ~24k-frame render on a loaded
      // box can legitimately exceed the 600 s CDP eval-answer watchdog — one
      // blocking eval would be declared "stalled, not slow". The render runs
      // detached in-page; the harness polls cheap evals and bounds the run
      // by PROGRESS (no new frame for 120 s = a real stall), never by total
      // wall clock.
      await chrome.eval(`(() => {
        window.__f6pieces = [];
        window.__f6 = { done: false, err: null, r: null, prog: 0 };
        (async () => {
          const rec = JSON.parse(__share.records()[0]);
          const dur = rec.events?.length
            ? rec.events[rec.events.length - 1].t : 5;
          try {
            const r = await __export.renderDrill([__share.records()[0]], {
              width: 320, height: 180, noDownload: true, withAudio: true,
              cueOff: true, slowmo: dur / 392,
              onProgress: (done) => { window.__f6.prog = done; },
              stream: { post: async (data, at) => {
                window.__f6pieces.push({ at, data: data.slice() });
              } },
            });
            window.__f6.r = { frames: r.frames, clipSec: r.clipSec,
              ext: r.ext, montageRate: r.montageRate,
              streamedBytes: r.streamedBytes ?? null };
          } catch (e) {
            window.__f6pieces = null;
            window.__f6.err = String(e?.message ?? e);
          }
          window.__f6.done = true;
        })();
        return true;
      })()`);
      let f6st = null;
      {
        let lastProg = -1;
        let lastMove = Date.now();
        for (;;) {
          await sleep(2000);
          f6st = await chrome.eval(`({ done: window.__f6.done,
            err: window.__f6.err, prog: window.__f6.prog })`);
          if (f6st.done) break;
          if (f6st.prog > lastProg) {
            lastProg = f6st.prog;
            lastMove = Date.now();
          } else if (Date.now() - lastMove > 120_000) {
            break; // no frame progress for 2 min — a real stall
          }
        }
      }
      const f6 = !f6st?.done
        ? { err: `render stalled at frame ${f6st?.prog} (no progress for 120 s)` }
        : f6st.err ? { err: f6st.err }
          : await chrome.eval(`(() => {
            let extent = 0;
            for (const p of window.__f6pieces) {
              extent = Math.max(extent, p.at + p.data.length);
            }
            const buf = new Uint8Array(extent);
            for (const p of window.__f6pieces) buf.set(p.data, p.at);
            window.__f6pieces = null;
            window.__f6buf = buf;
            const r = window.__f6.r;
            window.__f6 = null;
            return { ...r, extent,
              seam: window.__export?.fullAudioWindowed === true };
          })()`);
      await waitAim('[FULL6 settle]');
      if (!f6 || f6.err) {
        fail(`[FULL6] over-wall with-sound streamed render failed: ${f6?.err}`);
      } else {
        if (f6.seam !== true) {
          fail('[FULL6] __export.fullAudioWindowed is not true on a fresh '
            + 'boot — playback.js would keep the retired 390 s wall on the '
            + 'card (two-layer honesty broken)');
        }
        if (!(f6.frames > 390 * 60)) {
          fail(`[FULL6] rendered only ${f6.frames} frames — the plan was `
            + `supposed to exceed the retired 390 s wall (${390 * 60})`);
        }
        if (f6.montageRate !== 1) {
          fail(`[FULL6] full render montaged (rate ${f6.montageRate})`);
        }
        if (!(f6.streamedBytes > 0) || f6.extent !== f6.streamedBytes) {
          fail(`[FULL6] extent ${f6.extent} != streamedBytes `
            + `${f6.streamedBytes}`);
        }
        // pull the assembled bytes out in bounded slices (a single eval
        // return of a ~25 MB base64 string is CDP-fragile at this size)
        const SLICE = 4 << 20;
        const parts = [];
        for (let at = 0; at < f6.extent; at += SLICE) {
          const b64 = await chrome.eval(`(() => {
            let b = '';
            const s = window.__f6buf.subarray(${at},
              ${Math.min(at + SLICE, f6.extent)});
            for (let i = 0; i < s.length; i += 0x8000) {
              b += String.fromCharCode.apply(null, s.subarray(i, i + 0x8000));
            }
            return btoa(b);
          })()`);
          parts.push(Buffer.from(b64, 'base64'));
        }
        await chrome.eval('window.__f6buf = null');
        const f6File = path.join(OUTDIR, 'full-373.mp4');
        fs.writeFileSync(f6File, Buffer.concat(parts));
        const f6Probe = (args) => execFileSync('ffprobe',
          ['-v', 'error', ...args, f6File]).toString().trim();
        const v6 = f6Probe(['-select_streams', 'v:0', '-show_entries',
          'stream=codec_name', '-of', 'csv=p=0']);
        const a6 = f6Probe(['-select_streams', 'a:0', '-show_entries',
          'stream=codec_name', '-of', 'csv=p=0']);
        if (v6 !== 'h264' || a6 !== 'aac') {
          fail(`[FULL6] delivered codecs ${v6}+${a6}, want h264+aac — the `
            + 'windowed bed must still mux a sound track');
        }
        const f6Frames = Number(f6Probe(['-count_frames', '-select_streams',
          'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0']));
        if (f6Frames !== f6.frames) {
          fail(`[FULL6] decoded ${f6Frames} frames, want ${f6.frames}`);
        }
        const v6Dur = Number(f6Probe(['-select_streams', 'v:0',
          '-show_entries', 'stream=duration', '-of', 'csv=p=0']));
        const a6Dur = Number(f6Probe(['-select_streams', 'a:0',
          '-show_entries', 'stream=duration', '-of', 'csv=p=0']));
        if (!(v6Dur > 390) || !(Math.abs(v6Dur - f6.frames / 60) < 0.05)) {
          fail(`[FULL6] video duration ${v6Dur}, want ≈ `
            + `${(f6.frames / 60).toFixed(2)} (> 390 s)`);
        }
        if (!(Math.abs(a6Dur - v6Dur) < 0.35)) {
          fail(`[FULL6] audio track ${a6Dur} s does not span the `
            + `${v6Dur.toFixed(2)} s video — the windowed bed dropped or `
            + 'duplicated frames at a window join');
        }
        if (failCount === fc6) {
          console.log(`[FULL6] OK — ${f6.frames} frames `
            + `(${v6Dur.toFixed(1)} s > 390 s) WITH sound streamed as `
            + `${(f6.extent / 1e6).toFixed(1)} MB; delivered file decodes `
            + `h264+aac, audio spans ${a6Dur.toFixed(2)} s`);
        }
      }
      await chrome.eval(`localStorage.removeItem('ob-export-bps-v1')`);
    }

    // ---- FULL7: the windowed-EXACT bed (GH-435) ----------------------------
    // The deterministic-class expansion's audio leg, both halves:
    //   (a) BYTE-STABILITY — two renders of renderDrillAudioWindowedExact
    //       over one timeline are byte-IDENTICAL per window (the property
    //       the plain windowed bed measurably lacks: its many-source
    //       summing junction jitters ±ulp across renders — probe-435,
    //       2026-08-09 — which is exactly why with-sound plans were locked
    //       out of the crash-resume fast-forward class);
    //   (b) PARITY — the exact bed is byte-CLOSE to the one-piece bed
    //       (FULL4's ≤1e-6 whole-PCM bound: only the float32 summation
    //       GROUPING differs, so it sits inside the same ±1.5 ulp class)
    //       and dual-mono like it, so joining the deterministic class
    //       never recolors the delivered soundtrack.
    //   RED half of (a): the plain windowed bed over the SAME dense
    //   timeline shows a byte DIFFERENCE across two renders — proving the
    //   stability assertion is load-bearing, not vacuously green. (A calm
    //   platform could legitimately render twice identically, so the red
    //   is advisory-logged, never a fail — the gate rides (a) and (b).)
    {
      const fc7 = failCount;
      const f7 = await chrome.eval(`(async () => {
        const ea = await import('/app/export-audio.js');
        if (typeof ea.renderDrillAudioWindowedExact !== 'function') {
          return { err: 'renderDrillAudioWindowedExact missing' };
        }
        const fnv = (h0, f32) => {
          const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
          let h = h0 >>> 0;
          for (let i = 0; i < u8.length; i++) {
            h ^= u8[i];
            h = Math.imul(h, 0x01000193);
          }
          return (h >>> 0).toString(16).padStart(8, '0');
        };
        const rec = JSON.parse(__share.records()[0]);
        // a DENSE multi-segment timeline (the jitter class needs many
        // concurrent voices), windows shrunk so joins exist without a
        // minutes-long bed
        const seg = (offsetSec) => ({ record: rec, rate: 1, startT: 0,
          endT: null, offsetSec, windowSec: 4 });
        const segs = [seg(0), seg(0.4), seg(0.9), seg(1.7), seg(2.6)];
        const totalSec = 8;
        const wf = 1024 * 120;
        const run = async () => {
          const hs = [];
          const n = Math.ceil(totalSec * 48000);
          const pcm = [new Float32Array(n), new Float32Array(n)];
          for await (const w of ea.renderDrillAudioWindowedExact(segs,
            { totalSec, windowFrames: wf })) {
            if (w.skipFrames !== 0) return { err: 'exact bed yielded pre-roll' };
            for (let c = 0; c < 2; c++) {
              pcm[c].set(w.buffer.getChannelData(c).subarray(0, w.frames),
                w.baseFrames);
            }
            hs.push(fnv(0x811c9dc5, w.buffer.getChannelData(0)));
          }
          return { hs, pcm };
        };
        const A = await run();
        if (A.err) return A;
        const B = await run();
        // (b) parity vs the one-piece bed + dual-mono
        const one = await ea.renderDrillAudio(segs, { totalSec });
        let maxD = 0;
        for (let c = 0; c < 2; c++) {
          const a = one.getChannelData(c), b = A.pcm[c];
          for (let i = 0; i < b.length; i++) {
            const d = Math.abs(a[i] - b[i]);
            if (d > maxD) maxD = d;
          }
        }
        const mono = fnv(0x811c9dc5, A.pcm[0]) === fnv(0x811c9dc5, A.pcm[1]);
        // RED (advisory): the plain windowed bed A/A over the same timeline
        const plain = async () => {
          const hs = [];
          for await (const w of ea.renderDrillAudioWindowed(segs,
            { totalSec, windowFrames: wf })) {
            hs.push(fnv(0x811c9dc5,
              w.buffer.getChannelData(0).subarray(w.skipFrames)));
          }
          return hs.join(',');
        };
        const plainJitters = (await plain()) !== (await plain());
        return { windows: A.hs.length,
          aa: JSON.stringify(A.hs) === JSON.stringify(B.hs),
          hs: A.hs, maxD, mono, plainJitters };
      })()`);
      if (!f7 || f7.err) {
        fail(`[FULL7] exact-bed render failed: ${f7?.err}`);
      } else {
        if (!(f7.windows >= 3)) {
          fail(`[FULL7] timeline spanned only ${f7.windows} windows — no `
            + 'joins under test');
        }
        if (!f7.aa) {
          fail('[FULL7] two exact-bed renders are NOT byte-identical — '
            + 'the deterministic class lost its audio leg (per-cue render '
            + 'stability broke on this shell?)');
        }
        if (!(f7.maxD <= 1e-6)) {
          fail(`[FULL7] exact bed diverges from the one-piece bed: max|Δ| `
            + `${f7.maxD} > 1e-6 — the class expansion recolored the mix`);
        }
        if (!f7.mono) {
          fail('[FULL7] exact bed is not dual-mono (production bed is)');
        }
        if (!f7.plainJitters) {
          console.log('[FULL7] note — the plain windowed bed rendered A/A '
            + 'identically this time (jitter is a race, not a law; the '
            + 'exact bed remains the only bed with a byte GUARANTEE)');
        }
        if (failCount === fc7) {
          console.log(`[FULL7] OK — exact bed over ${f7.windows} windows: `
            + `A/A byte-identical, max|Δ| vs one-piece ${f7.maxD} (≤1e-6), `
            + `dual-mono; plain-bed A/A jitter observed=${f7.plainJitters}`);
        }
      }
    }

    // ==== GH-362: export robustness (R1-R2) ==================================
    {
      // ---- R1: background pause/resume — park, no watchdog, byte parity -----
      const rc1 = failCount;
      const r1opts = `{ width: 320, height: 180, noDownload: true,
        withAudio: false, hashFrames: true,
        trims: [{ startT: 0, endT: 3.5 }] }`;
      // control: the uninterrupted render's hashes
      const ctl = await chrome.eval(
        `__export.renderDrill([__share.records()[0]], ${r1opts})
          .then((r) => ({ frames: r.frames, hashes: r.hashes }))`);
      await waitAim('[R1 control settle]');
      if (!(ctl?.frames > 0) || !Array.isArray(ctl.hashes)) {
        fail('[R1] control render failed: ' + JSON.stringify(ctl?.frames));
      }
      // hidden override: the pause gate POLLS document.hidden, so a
      // property shadow is the whole harness (no event dependency)
      await chrome.eval(`(() => {
        window.__hiddenOverride = false;
        Object.defineProperty(document, 'hidden',
          { configurable: true, get: () => window.__hiddenOverride });
      })()`);
      await chrome.eval(`(() => {
        window.__r1 = { done: null, paused: [] };
        __export.renderDrill([__share.records()[0]], Object.assign(${r1opts},
          { onPause: (p) => window.__r1.paused.push(p) }))
          .then((r) => { window.__r1.done = { frames: r.frames, hashes: r.hashes }; },
            (e) => { window.__r1.done = { err: String(e?.message ?? e) }; });
      })()`);
      // let it render partway, then hide
      let mid = 0;
      for (let i = 0; i < 200; i++) {
        mid = (await chrome.eval('__export.drillProgress()'))?.done ?? 0;
        if (mid >= 40) break;
        await sleep(100);
      }
      if (!(mid >= 40)) fail(`[R1] render never reached frame 40 (${mid})`);
      await chrome.eval('window.__hiddenOverride = true');
      await sleep(1200); // the park latches (≤ ~300 ms poll + frame tail)
      const atHide = (await chrome.eval('__export.drillProgress()'))?.done ?? -1;
      // 17 s hidden: past the 15 s stall watchdog — the render must PARK
      // (frames frozen) and must NOT abort (hidden time never charges the
      // encoder-liveness deadline; pre-362 this window fired stallError)
      await sleep(17_000);
      const parked = await chrome.eval(`({
        done: __export.drillProgress()?.done ?? -1,
        settled: window.__r1.done,
        paused: window.__r1.paused.slice() })`);
      if (parked.done !== atHide || parked.settled !== null) {
        fail(`[R1] hidden render did not PARK: frames ${atHide} -> `
          + `${parked.done}, settled ${JSON.stringify(parked.settled)} `
          + '(want frozen frames, still-pending promise, no stall abort)');
      }
      if (parked.paused[0] !== true || parked.paused.length !== 1) {
        fail(`[R1] onPause hook wrong while hidden: `
          + JSON.stringify(parked.paused));
      }
      await chrome.eval('window.__hiddenOverride = false');
      let r1done = null;
      for (let i = 0; i < 600 && !r1done; i++) {
        await sleep(200);
        r1done = await chrome.eval('window.__r1.done');
      }
      await waitAim('[R1 resumed settle]');
      const r1paused = await chrome.eval('window.__r1.paused.slice()');
      if (!r1done || r1done.err) {
        fail(`[R1] resumed render did not complete: ${JSON.stringify(r1done?.err)}`);
      } else {
        if (r1done.frames !== ctl.frames) {
          fail(`[R1] resumed frames ${r1done.frames} != control ${ctl.frames}`);
        }
        if (JSON.stringify(r1done.hashes) !== JSON.stringify(ctl.hashes)) {
          fail('[R1] resumed frame hashes differ from the uninterrupted '
            + 'control — pausing must be byte-free (determinism)');
        }
        if (JSON.stringify(r1paused) !== JSON.stringify([true, false])) {
          fail(`[R1] onPause sequence ${JSON.stringify(r1paused)}, want `
            + '[true, false]');
        }
      }
      await chrome.eval('delete document.hidden; delete window.__hiddenOverride');
      if (failCount === rc1) {
        console.log(`[R1] OK — parked at frame ${atHide} through 17 s hidden `
          + '(no stall abort), resumed to completion with hashes identical '
          + `to the control (${ctl.frames} frames), onPause [true, false]`);
      }

      // ---- R1b: a REAL JS suspension (review r10 P2) -------------------------
      // Debugger.pause freezes ALL page JS mid-render — timers, the render
      // loop, encoder callbacks — while performance.now() keeps advancing
      // (probed on the pinned shell; Page.setWebLifecycleState was
      // rejected there: its 'active' never thaws the task queues). This is
      // the faithful headless analogue of an iOS suspension: the loops
      // never OBSERVE hidden, so only the r4 own-cadence gap detection can
      // save the run. Pre-fix red: the thawed 15 s stall deadline had the
      // whole frozen interval charged and aborted the export; post-fix the
      // render resumes and delivers output byte-identical to the control.
      const rb1 = failCount;
      await chrome.eval(`(() => {
        window.__r1b = { done: null };
        __export.renderDrill([__share.records()[0]], ${r1opts})
          .then((r) => { window.__r1b.done = { frames: r.frames, hashes: r.hashes }; },
            (e) => { window.__r1b.done = { err: String(e?.message ?? e) }; });
      })()`);
      let midb = 0;
      for (let i = 0; i < 200; i++) {
        midb = (await chrome.eval('__export.drillProgress()'))?.done ?? 0;
        if (midb >= 40) break;
        await sleep(100);
      }
      if (!(midb >= 40)) fail(`[R1b] render never reached frame 40 (${midb})`);
      await chrome.send('Debugger.enable');
      await chrome.send('Debugger.pause');
      await sleep(17_000); // past the 15 s stall deadline, page JS frozen
      await chrome.send('Debugger.resume');
      await chrome.send('Debugger.disable');
      let rbDone = null;
      for (let i = 0; i < 600 && !rbDone; i++) {
        await sleep(200);
        rbDone = await chrome.eval('window.__r1b.done');
      }
      await waitAim('[R1b settle]');
      if (!rbDone || rbDone.err) {
        fail('[R1b] frozen render did not resume to completion: '
          + `${JSON.stringify(rbDone?.err ?? rbDone)}`);
      } else if (rbDone.frames !== ctl.frames
        || JSON.stringify(rbDone.hashes) !== JSON.stringify(ctl.hashes)) {
        fail(`[R1b] resumed-from-freeze output differs from the control `
          + `(${rbDone.frames} vs ${ctl.frames} frames)`);
      }
      if (failCount === rb1) {
        console.log('[R1b] OK — a REAL 17 s lifecycle freeze mid-encode '
          + 'resumed to completion (no stall abort), output byte-identical '
          + 'to the control');
      }

      // ---- R2: the keep-awake latch, red-proofed per terminal path ----------
      const rc2 = failCount;
      await chrome.eval(`(() => {
        window.__wakeOps = [];
        window.__obKeepAwake = { v: 1 };
        window.webkit = window.webkit ?? {};
        window.webkit.messageHandlers = Object.assign(
          {}, window.webkit.messageHandlers,
          { obKeepAwake: { postMessage: (m) => window.__wakeOps.push(m) } });
      })()`);
      // (a) completed drill render → held then released
      await chrome.eval(`__export.renderDrill([__share.records()[0]],
        { width: 320, height: 180, noDownload: true, withAudio: false,
          trims: [{ startT: 0, endT: 3.5 }] })`);
      await waitAim('[R2a settle]');
      const r2a = await chrome.eval('window.__wakeOps.splice(0)');
      if (JSON.stringify(r2a) !== JSON.stringify([
        { v: 1, on: true }, { v: 1, on: false }])) {
        fail(`[R2] completed render wake ops ${JSON.stringify(r2a)}, want `
          + 'held-then-released');
      }
      // (b) FAILED render (refused stream write) → released too
      await chrome.eval(`__export.renderDrill([__share.records()[0]],
        { width: 320, height: 180, noDownload: true, withAudio: false,
          stream: { post: async () => { throw new Error('write-failed'); } },
        }).catch(() => 'failed')`);
      await waitAim('[R2b settle]');
      const r2b = await chrome.eval('window.__wakeOps.splice(0)');
      if (JSON.stringify(r2b) !== JSON.stringify([
        { v: 1, on: true }, { v: 1, on: false }])) {
        fail(`[R2] failed render wake ops ${JSON.stringify(r2b)}, want `
          + 'held-then-released');
      }
      // (c) CANCELLED dialog run → released through start()'s finally
      await chrome.eval(`(() => {
        window.__r2c = __export.start('standard', { width: 320, height: 180,
          noDownload: true, withAudio: false });
      })()`);
      let held = false;
      for (let i = 0; i < 100 && !held; i++) {
        await sleep(100);
        held = (await chrome.eval('window.__wakeOps.length')) >= 1;
      }
      await chrome.eval('__export.cancel()');
      await chrome.eval('window.__r2c'); // resolves null on AbortError
      await waitAim('[R2c settle]');
      const r2c = await chrome.eval('window.__wakeOps.splice(0)');
      if (JSON.stringify(r2c) !== JSON.stringify([
        { v: 1, on: true }, { v: 1, on: false }])) {
        fail(`[R2] cancelled run wake ops ${JSON.stringify(r2c)}, want `
          + 'held-then-released');
      }
      await chrome.eval(`(() => {
        delete window.__obKeepAwake;
        delete window.webkit.messageHandlers.obKeepAwake;
      })()`);
      if (failCount === rc2) {
        console.log('[R2] OK — keep-awake held-then-released on the '
          + 'completed, failed and cancelled paths');
      }
    }

    // ==== GH-472: pause-seam frame exactness (PS1-PS3) ========================
    // The owner's build-17 report: ONE brief background/foreground flip
    // mid-full-game-export → the platform encoder silently surrendered 2
    // in-flight frames (input consumed, output never delivered, no error —
    // the VideoToolbox background-drop signature) → the delivery wall
    // refused 5804/5806 and the WHOLE session was discarded. The engine
    // law now: the hidden EDGE drains the encoder to the muxer (sink drain
    // guard parking post-gap chunks), and a deficit REWINDS the feed to
    // the muxed contig watermark — the surrendered frames re-render in
    // place (first re-fed frame keyframed) and the delivered file stays
    // frame-exact. These arms inject the drop at the exact platform API
    // boundary (a VideoEncoder wrapper swallowing output callbacks — the
    // strongest headless analogue; headless Chrome's software encoders
    // never drop on a flip alone, measured on the repro driver).
    // RED pre-fix (measured 2026-08-08, worktree @ c789bcc4): every arm
    // below failed terminally with export.encoderTruncated.
    {
      const psRig = String.raw`(() => {
        if (window.__ps472) return 'already';
        const Native = window.VideoEncoder;
        const st = { encodes: 0, outputs: 0, delivered: 0, armDrop: 0,
          dropAt: {}, dropped: [], hold: false, held: [], unconsumed: [] };
        window.__ps472 = { st, Native };
        window.__psRelease = () => {
          st.hold = false;
          for (const h of st.held.splice(0)) {
            if (st.armDrop > 0) {
              // the surrendered in-flight frames ARE the held window's
              // oldest — the truest platform-drop analogue (PS2): a
              // bypassing release would leave armDrop to eat post-rewind
              // outputs instead, a drop with no transition edge
              st.armDrop--;
              st.dropped.push(h.chunk.timestamp);
              continue;
            }
            st.delivered++;
            h.out(h.chunk, h.meta);
          }
        };
        const Wrapped = function (init) {
          const inner = new Native({
            error: init.error,
            output: (chunk, meta) => {
              st.outputs++;
              // GH-997: a PER-FRAME surrender budget (frame index → how
              // many of its outputs the platform eats) — the persistent-
              // loss staging the retry budget and the hold policy answer to
              const fi = Math.round(chunk.timestamp * 60 / 1e6);
              if (st.dropAt[fi] > 0) {
                st.dropAt[fi]--;
                st.dropped.push(chunk.timestamp);
                return;
              }
              if (st.armDrop > 0) { // the platform surrenders this frame:
                st.armDrop--;       // consumed input, no output, NO error
                st.dropped.push(chunk.timestamp);
                return;
              }
              if (st.hold) { // stall staging (PS2): delivery withheld
                st.held.push({ chunk, meta, out: init.output });
                return;
              }
              st.delivered++;
              init.output(chunk, meta);
            },
          });
          const self = Object.create(Wrapped.prototype);
          self.__inner = inner;
          return self;
        };
        Wrapped.prototype = {
          configure(c) { return this.__inner.configure(c); },
          encode(f, o) { st.encodes++; return this.__inner.encode(f, o); },
          flush() {
            // spec-conformant hold: a flush() barrier delivers everything
            // the codec holds — release the staged hold BEFORE resolving
            window.__psRelease();
            return this.__inner.flush();
          },
          close() { return this.__inner.close(); },
          reset() { return this.__inner.reset(); },
          get encodeQueueSize() { return this.__inner.encodeQueueSize; },
          get state() { return this.__inner.state; },
        };
        Wrapped.isConfigSupported = (c) => Native.isConfigSupported(c);
        window.VideoEncoder = Wrapped;
        // visibility staging: the R1 property shadow + REAL events (the
        // engine's drain latch rides the visibilitychange edge)
        window.__hiddenOverride = false;
        Object.defineProperty(document, 'hidden',
          { configurable: true, get: () => window.__hiddenOverride });
        window.__psFlip = (hiddenMs, dropAtHide) => new Promise((res) => {
          if (dropAtHide > 0) st.armDrop += dropAtHide; // the transition
          // surrenders the next in-flight outputs
          window.__hiddenOverride = true;
          document.dispatchEvent(new Event('visibilitychange'));
          setTimeout(() => {
            // GH-872: the budget dies at its own show — an unconsumed
            // remainder would surrender outputs OUTSIDE any seam (a drop no
            // repair can see; the delivery wall refuses it honestly)
            const unconsumed = st.armDrop;
            st.armDrop = 0;
            st.unconsumed.push(unconsumed);
            console.log('[ps] show: budget unconsumed ' + unconsumed);
            window.__hiddenOverride = false;
            document.dispatchEvent(new Event('visibilitychange'));
            res({ inflight: st.encodes - st.outputs, unconsumed });
          }, hiddenMs);
        });
        return 'armed';
      })()`;
      const psCleanup = `(() => {
        window.VideoEncoder = window.__ps472.Native;
        delete document.hidden;
        delete window.__ps472;
        delete window.__psFlip;
        delete window.__psRelease;
        delete window.__hiddenOverride;
        delete window.__psPieces;
        return document.hidden === false;
      })()`;
      const psOpts = `{ width: 320, height: 180, noDownload: true,
        withAudio: false, hashFrames: true,
        trims: [{ startT: 0, endT: 3.5 }],
        stream: { post: async (data, at) => {
          let b = '';
          for (let i = 0; i < data.length; i += 0x8000) {
            b += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
          }
          window.__psPieces.push({ b64: btoa(b), at });
        } } }`;
      const psRun = (extra = '', dropAt = {}) => chrome.eval(`(() => {
        window.__psPieces = [];
        window.__ps472.st.encodes = 0;
        window.__ps472.st.outputs = 0;
        window.__ps472.st.delivered = 0;
        window.__ps472.st.dropAt = ${JSON.stringify(dropAt)};
        window.__ps472.st.dropped.length = 0;
        window.__ps472.st.unconsumed.length = 0;
        window.__psDone = null;
        __export.renderDrill([__share.records()[0]], Object.assign(${psOpts}${extra}))
          .then((r) => { window.__psDone = { frames: r.frames,
            hashes: r.hashes, repairs: r.repairs ?? 0,
            held: r.held ?? null, holes: r.holes ?? null,
            streamedBytes: r.streamedBytes ?? null }; },
            (e) => { window.__psDone = { err: String(e?.message ?? e),
              truncated: e?.obTruncated ? { got: e.obTruncated.got,
                want: e.obTruncated.want } : null,
              salvage: e?.obSalvage ? { lost: e.obSalvage.lost,
                frames: e.obSalvage.frames, held: e.obSalvage.held,
                holes: e.obSalvage.holes ?? null,
                streamedBytes: e.obSalvage.streamedBytes ?? null } : null }; });
        return true;
      })()`);
      const psWaitFrame = async (tag, n) => {
        let done = 0;
        for (let i = 0; i < 400; i++) {
          done = (await chrome.eval('__export.drillProgress()?.done')) ?? 0;
          if (done >= n) return done;
          await sleep(50);
        }
        fail(`${tag} render never reached frame ${n} (${done})`);
        return done;
      };
      const psSettle = async (tag) => {
        for (let i = 0; i < 600; i++) {
          const d = await chrome.eval('window.__psDone');
          if (d) return d;
          await sleep(200);
        }
        fail(`${tag} render never settled`);
        return null;
      };
      const psAssemble = async (tag, name) => {
        const pieces = await chrome.eval('window.__psPieces.length');
        let extent = 0;
        const chunks = [];
        for (let i = 0; i < pieces; i++) {
          const p = await chrome.eval(`window.__psPieces[${i}]`);
          const buf = Buffer.from(p.b64, 'base64');
          chunks.push({ at: p.at, buf });
          extent = Math.max(extent, p.at + buf.length);
        }
        const out = Buffer.alloc(extent);
        for (const c of chunks) c.buf.copy(out, c.at);
        const file = path.join(OUTDIR, name);
        fs.writeFileSync(file, out);
        return file;
      };
      const psProbeFrames = (file) => Number(execFileSync('ffprobe',
        ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
          '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file])
        .toString().trim());
      if (await chrome.eval(psRig) !== 'armed') fail('[PS] rig install failed');

      // ---- PS0: streamed control (the frame-exact truth the repairs must
      // reproduce — hashes are the ruled pre-encode surface) ----------------
      await psRun();
      const psCtl = await psSettle('[PS0]');
      await waitAim('[PS0 settle]');
      if (!psCtl || psCtl.err || !(psCtl.frames > 100) || !psCtl.hashes) {
        fail('[PS0] control render failed: ' + JSON.stringify(psCtl));
      }

      // ---- PS1: the owner repro — ONE brief flip, 2 in-flight outputs
      // surrendered at the hidden edge → drained, rewound, frame-exact ------
      {
        const c = failCount;
        await psRun();
        await psWaitFrame('[PS1]', 40);
        const flip = await chrome.eval('window.__psFlip(250, 2)');
        const r = await psSettle('[PS1]');
        await waitAim('[PS1 settle]');
        const st = await chrome.eval(`({ encodes: window.__ps472.st.encodes,
          dropped: window.__ps472.st.dropped.slice() })`);
        if (!r || r.err) {
          fail(`[PS1] flip+drop render FAILED (${r?.err}) — the pre-472 `
            + 'scorched-earth terminal (RED: the owner report verbatim)');
        } else {
          if (st.dropped.length !== 2) {
            fail(`[PS1] staging: wanted 2 surrendered outputs, got `
              + `${st.dropped.length}`);
          }
          if (!(r.repairs >= 1)) {
            fail(`[PS1] no pause-seam repair engaged (repairs ${r.repairs}) `
              + '— the deficit must be caught at the drain barrier, not '
              + 'the delivery wall');
          }
          if (!(st.encodes >= psCtl.frames + 2)) {
            fail(`[PS1] no re-feed happened (encodes ${st.encodes} vs `
              + `${psCtl.frames} frames)`);
          }
          if (r.frames !== psCtl.frames
            || JSON.stringify(r.hashes) !== JSON.stringify(psCtl.hashes)) {
            fail('[PS1] repaired render diverges from the uninterrupted '
              + `control (${r.frames} vs ${psCtl.frames} frames) — the `
              + 'rewind must be byte-free on the pre-encode surface');
          }
          const file = await psAssemble('[PS1]', 'ps1-flipdrop.mp4');
          const frames = psProbeFrames(file);
          if (frames !== psCtl.frames) {
            fail(`[PS1] delivered file decodes ${frames} frames, want `
              + `${psCtl.frames} — frame-exact delivery is the law`);
          }
          if (failCount === c) {
            console.log(`[PS1] OK — a 250 ms flip surrendering 2 in-flight `
              + `outputs (inflight ${flip.inflight} at show) was drained, `
              + `rewound (${r.repairs} repair) and delivered frame-exact `
              + `(${frames} frames, hashes == control)`);
          }
        }
      }

      // ---- PS1b: the THAW-ONLY visibility edge (review r3 P1) --------------
      // WKWebView can freeze JS for the entire hidden interval and deliver
      // the ONE queued visibilitychange on thaw with document.hidden
      // already false — the drain latch must ride EVERY edge, not just
      // hidden ones. Staged as: outputs surrendered AT the edge, the event
      // dispatched while hidden reads false. RED pre-fix: the listener
      // skipped the latch, the hole reached the wall.
      {
        const c = failCount;
        await psRun();
        await psWaitFrame('[PS1b]', 40);
        await chrome.eval(`(() => {
          window.__ps472.st.armDrop = 2; // the frozen window's surrender
          document.dispatchEvent(new Event('visibilitychange')); // thaw:
          // hidden is FALSE at delivery — the pre-472/r3 skip shape
          return document.hidden === false;
        })()`);
        const r = await psSettle('[PS1b]');
        await waitAim('[PS1b settle]');
        if (!r || r.err) {
          fail(`[PS1b] thaw-only edge render FAILED (${r?.err}) — the drain `
            + 'latch must ride a visible-edge event too');
        } else {
          if (!(r.repairs >= 1)) {
            fail(`[PS1b] no repair engaged off the thaw-only edge `
              + `(repairs ${r.repairs})`);
          }
          if (r.frames !== psCtl.frames
            || JSON.stringify(r.hashes) !== JSON.stringify(psCtl.hashes)) {
            fail('[PS1b] thaw-only repair diverges from the control');
          }
          const file = await psAssemble('[PS1b]', 'ps1b-thawonly.mp4');
          const frames = psProbeFrames(file);
          if (frames !== psCtl.frames) {
            fail(`[PS1b] delivered file decodes ${frames} frames, want `
              + `${psCtl.frames}`);
          }
          if (failCount === c) {
            console.log(`[PS1b] OK — a thaw-only visibilitychange (hidden `
              + `false at delivery) still drained and repaired the `
              + `surrendered window (${r.repairs} repair, ${frames} frames, `
              + 'hashes == control)');
          }
        }
      }

      // ---- PS2: the flip lands while the feed is PARKED at the in-flight
      // ceiling (outputs withheld) — the backpressure hold must hand the
      // deficit to the barrier, never ride it into the stall deadline ------
      {
        const c = failCount;
        await psRun();
        await psWaitFrame('[PS2]', 40);
        await chrome.eval('window.__ps472.st.hold = true; true');
        // the feed pauses when fed − muxed exceeds inflightMax (30 at this
        // size) — flip PROMPTLY at that boundary: the engine's own widening
        // walk (+4/s) and flush nudge would otherwise release the staged
        // hold and push the flip into the finalize window (measured: a
        // 100 ms-cadence detector raced the nudge and the arm judged the
        // WALL class instead of the seam)
        let parked = null;
        for (let i = 0; i < 200; i++) {
          await sleep(50);
          const s = await chrome.eval(`({ e: window.__ps472.st.encodes,
            d: window.__ps472.st.delivered, hold: window.__ps472.st.hold })`);
          if (!s.hold) break; // a flush nudge already released the stage
          if (s.e - s.d > 30) { parked = s; break; }
        }
        if (!parked) {
          fail('[PS2] hold staging never loaded the in-flight window to '
            + 'the inflightMax boundary');
        }
        const flip = await chrome.eval('window.__psFlip(250, 2)');
        // the engine's own drain flush releases the hold (wrapper flush());
        // belt: release explicitly in case the drain settled early
        await sleep(400);
        await chrome.eval('window.__psRelease(); true');
        const r = await psSettle('[PS2]');
        await waitAim('[PS2 settle]');
        const st = await chrome.eval(`({ dropped: window.__ps472.st.dropped.slice() })`);
        if (!r || r.err) {
          fail(`[PS2] boundary-flip render FAILED (${r?.err})`);
        } else {
          if (!(r.repairs >= 1)) {
            fail(`[PS2] no repair engaged at the in-flight boundary `
              + `(repairs ${r.repairs}, parked at `
              + `${parked ? parked.e - parked.d : '?'} in flight)`);
          }
          if (r.frames !== psCtl.frames) {
            fail(`[PS2] frames ${r.frames} != control ${psCtl.frames}`);
          }
          const file = await psAssemble('[PS2]', 'ps2-boundary.mp4');
          const frames = psProbeFrames(file);
          if (frames !== psCtl.frames) {
            fail(`[PS2] delivered file decodes ${frames} frames, want `
              + `${psCtl.frames}`);
          }
          if (failCount === c) {
            console.log(`[PS2] OK — a flip at the in-flight ceiling `
              + `(fed−muxed ${parked.e - parked.d}, 2 outputs surrendered, `
              + `${st.dropped.length} dropped) repaired to a frame-exact `
              + `delivery (${frames} frames, ${r.repairs} repair)`);
          }
        }
      }

      // ---- PS3: RAPID multi-flip idempotency — three quick flips, drops on
      // two of them; one drain owns each window and the output stays exact --
      {
        const c = failCount;
        const cu = unjudgeableCount;
        await psRun();
        await psWaitFrame('[PS3]', 40);
        await chrome.eval('window.__psFlip(120, 2)');
        await sleep(250);
        await chrome.eval('window.__psFlip(60, 0)');
        await sleep(250);
        await chrome.eval('window.__psFlip(90, 2)');
        const r = await psSettle('[PS3]');
        await waitAim('[PS3 settle]');
        const st = await chrome.eval(`({ dropped: window.__ps472.st.dropped.length,
          unconsumed: window.__ps472.st.unconsumed.slice() })`);
        // GH-872: each flip's budget dies at its own show, so the surrendered
        // count is the rig's own accounting (budget − unconsumed per flip),
        // not a constant — a window that caught nothing is NAMED, never
        // charged to the engine; a repair is owed only for in-window drops.
        // GH-881: the accounting is ps3Accounting's one verdict — a short
        // ledger never resolves (no consumed is computed, the repair
        // clause never runs on it) and the arm reports the count it saw
        // as UNJUDGEABLE; on a resolved ledger the repair clause holds
        // Number.isFinite(consumed) by construction and prints only from
        // measured values. STEER-1 item 3: only the ledger accounting is
        // gated — the ledger-INDEPENDENT checks below (divergence vs the
        // control, delivered-file frames) run whenever r is present, on
        // every verdict kind, wording and thresholds unchanged. So a
        // short ledger with diverging output yields the divergence FAIL
        // (exit 1) plus the one UNJUDGEABLE line; the OK log stays gated
        // on a judged verdict with both counters unmoved.
        const budgets = [2, 0, 2];
        const verdict = ps3Accounting({ budgets,
          unconsumedLedger: st.unconsumed, dropped: st.dropped,
          repairs: r?.repairs ?? 0 });
        if (!r || r.err) {
          fail(`[PS3] multi-flip render FAILED (${r?.err})`);
        } else {
          if (verdict.kind === 'unjudgeable') unjudgeable(verdict.line);
          else for (const line of verdict.failures) fail(line);
          if (r.frames !== psCtl.frames
            || JSON.stringify(r.hashes) !== JSON.stringify(psCtl.hashes)) {
            fail('[PS3] rapid-flip output diverges from the control — '
              + 'drain/rewind must be idempotent under superseding flips');
          }
          const file = await psAssemble('[PS3]', 'ps3-rapid.mp4');
          const frames = psProbeFrames(file);
          if (frames !== psCtl.frames) {
            fail(`[PS3] delivered file decodes ${frames} frames, want `
              + `${psCtl.frames}`);
          }
          if (verdict.kind === 'judged' && failCount === c && unjudgeableCount === cu) {
            const per = budgets.map((d, i) => d - st.unconsumed[i]).join('+');
            const misses = st.unconsumed
              .map((u, i) => (u > 0 ? `${u} unconsumed at flip ${i + 1}` : null))
              .filter(Boolean);
            console.log(`[PS3] OK — three rapid flips (${per} surrendered`
              + `${misses.length ? ', ' + misses.join(', ') : ''}) repaired to `
              + `frame-exact delivery (${frames} frames, ${r.repairs} repairs, `
              + 'hashes == control)');
          }
        }
      }

      // ---- PS5 (GH-997 law): the chase rig REPAIRS in place ----------------
      // cameratrack.js is an IMPURE damped follower (state integrates per
      // emitted frame), so pre-997 a track-camera flip loss stood down to
      // the delivery wall (review GH-472 r1 P1: replayed poses would splice).
      // GH-997: the render keeps the follower state ENTERING each frame on
      // the rewind ring (window.__track snapshot/restore) and re-renders the
      // surrendered frames under exactly that state — repairs >= 1, hashes
      // == a track-camera CONTROL, frame-exact file. RED pre-997: the wall
      // refused (want-2 of want delivered).
      {
        const c = failCount;
        const trackOpt = `, { perShotCamera: [{ track: { target: 'cue' } }] }`;
        await psRun(trackOpt);
        const ctl5 = await psSettle('[PS5 control]');
        await waitAim('[PS5 control settle]');
        if (!ctl5 || ctl5.err || !ctl5.hashes) {
          fail('[PS5] track-camera control render failed: ' + JSON.stringify(ctl5));
        } else {
          await psRun(trackOpt);
          await psWaitFrame('[PS5]', 40);
          await chrome.eval('window.__psFlip(250, 2)');
          const r = await psSettle('[PS5]');
          await waitAim('[PS5 settle]');
          if (!r || r.err) {
            fail(`[PS5] a track-camera flip loss must repair in place (got `
              + `${r?.err}) — RED pre-997: the chase rig stood down to the wall`);
          } else {
            if (!(r.repairs >= 1)) {
              fail(`[PS5] no in-place repair on the track span (repairs ${r.repairs})`);
            }
            if (r.frames !== ctl5.frames
              || JSON.stringify(r.hashes) !== JSON.stringify(ctl5.hashes)) {
              fail('[PS5] repaired track render diverges from the track control '
                + '— the follower restore must be exact (a splice otherwise)');
            }
            const file = await psAssemble('[PS5]', 'ps5-track.mp4');
            const frames = psProbeFrames(file);
            if (frames !== ctl5.frames) {
              fail(`[PS5] delivered file decodes ${frames} frames, want ${ctl5.frames}`);
            }
            if (failCount === c) {
              console.log(`[PS5] OK — a chase-rig flip loss repaired in place `
                + `(${r.repairs} repair, follower restored from the ring; `
                + `${frames} frames, hashes == track control)`);
            }
          }
        }
      }

      // ==== GH-997: no near-complete render is thrown away (L1-L7) ==========
      // The owner's phone report: "video encoder dropped frames (7334 of 7335
      // delivered) — no file written". The GH-472 seam only judged losses
      // bracketed by a visibility edge; a drop with no edge, one whose
      // post-gap outputs reached the muxer before the edge's task (the
      // WKWebView thaw order), or one inside the final flush went straight
      // to the delivery wall, and one lost frame discarded the whole file.
      // The law now: the sink AUTO-GUARDS the first gap (post-gap chunks
      // park), the next frame top drains + judges it, the end of the feed
      // is a mandatory drain, and every repairable loss re-encodes in place
      // (frame-exact). A loss the retry budget cannot cure is HELD (the
      // previous frame stays up across it) — silently only when isolated
      // and rare (offline-render.js HOLD_RUN_MAX / holdCap); anything more
      // is refused WITH the file attached (obSalvage) so every surface can
      // offer "Save anyway" / "Export again". RED pre-997 (measured on main
      // 2ea472e5 with this rig): L1-L6 refused at the wall, L7 carried no
      // salvage.
      const lossTotal = () => chrome.eval('__export.drillProgress()?.total ?? 0');
      const exactArm = async (tag, what, stage, dropAt = {}) => {
        const c = failCount;
        await psRun('', dropAt);
        await stage();
        const r = await psSettle(tag);
        await waitAim(`${tag} settle`);
        const dropped = await chrome.eval('window.__ps472.st.dropped.length');
        if (!r || r.err) {
          fail(`${tag} ${what}: render FAILED (${r?.err}) — RED pre-997: one `
            + 'lost frame discarded the whole render');
          return;
        }
        if (!(dropped >= 1)) fail(`${tag} staging: no output was surrendered`);
        if (!(r.repairs >= 1)) fail(`${tag} no in-place repair (repairs ${r.repairs})`);
        if (r.held) fail(`${tag} held ${r.held} frame(s) — a repairable loss re-encodes`);
        if (r.frames !== psCtl.frames
          || JSON.stringify(r.hashes) !== JSON.stringify(psCtl.hashes)) {
          fail(`${tag} repaired output diverges from the control`);
        }
        const file = await psAssemble(tag, `l997-${tag.replace(/\W/g, '')}.mp4`);
        const frames = psProbeFrames(file);
        if (frames !== psCtl.frames) {
          fail(`${tag} delivered file decodes ${frames} frames, want ${psCtl.frames}`);
        }
        if (failCount === c) {
          console.log(`${tag} OK — ${what}: ${dropped} output(s) surrendered, `
            + `${r.repairs} repair(s), ${frames} frames, hashes == control`);
        }
      };
      await exactArm('[L1]', 'a forced single-frame drop with NO visibility edge',
        async () => {
          await psWaitFrame('[L1]', 40);
          await chrome.eval('window.__ps472.st.armDrop = 1; true');
        });
      await exactArm('[L2]', 'a flip whose surrender lands before its edges',
        async () => {
          await psWaitFrame('[L2]', 40);
          await chrome.eval('window.__ps472.st.armDrop = 2; true');
          await sleep(200); // the post-gap outputs reach the sink first
          await chrome.eval('window.__psFlip(120, 0)');
        });
      await exactArm('[L3]', 'a double flip surrendering an output at each',
        async () => {
          await psWaitFrame('[L3]', 40);
          await chrome.eval('window.__psFlip(80, 1)');
          await sleep(200);
          await chrome.eval('window.__psFlip(80, 1)');
        });
      {
        // L4/L5 stage on frame indices from the plan's own total (the
        // control's frame count — same record, same options)
        const T = psCtl.frames;
        await exactArm('[L4]', `the LAST frame's output lost (${T - 1} of ${T}), no edge`,
          async () => {}, { [T - 1]: 1 });
        await exactArm('[L5]', 'a flip near the end with the last two outputs surrendered',
          async () => {
            await psWaitFrame('[L5]', T - 40);
            await chrome.eval('window.__psFlip(100, 0)');
          }, { [T - 2]: 1, [T - 1]: 1 });
      }
      // ---- L6: one frame the platform surrenders on EVERY attempt → the
      // retry budget is spent and the hole is HELD: isolated (one frame) and
      // within holdCap, so it ships silently and is recorded ---------------
      {
        const c = failCount;
        await psRun('', { 120: 9 });
        const r = await psSettle('[L6]');
        await waitAim('[L6 settle]');
        if (!r || r.err) {
          fail(`[L6] an isolated persistent loss must ship held (got ${r?.err}) `
            + '— RED pre-997: refused at the wall');
        } else {
          if (r.held !== 1 || JSON.stringify(r.holes) !== '[{"at":120,"n":1}]') {
            fail(`[L6] hold accounting wrong: held ${r.held} holes ${JSON.stringify(r.holes)}`);
          }
          if (!(r.repairs >= 1)) fail(`[L6] no re-encode attempted before holding (${r.repairs})`);
          if (JSON.stringify(r.hashes) !== JSON.stringify(psCtl.hashes)) {
            fail('[L6] the pre-encode surface diverged — a hold is encode-side only');
          }
          const file = await psAssemble('[L6]', 'l997-L6-held.mp4');
          const frames = psProbeFrames(file);
          const dur = Number(execFileSync('ffprobe', ['-v', 'error',
            '-select_streams', 'v:0', '-show_entries', 'stream=duration',
            '-of', 'csv=p=0', file]).toString().trim());
          if (frames !== psCtl.frames - 1) {
            fail(`[L6] held file decodes ${frames} samples, want ${psCtl.frames - 1}`);
          }
          const derr6 = decodeErrors(file);
          if (derr6) fail(`[L6] the held file does not decode clean: ${derr6.slice(0, 300)}`);
          const kErr6 = keyAfterHoles(file, r.holes ?? []);
          if (kErr6) fail(`[L6] an unsafe delta follows the held frame: ${kErr6}`);
          if (!(Math.abs(dur - psCtl.frames / 60) < 0.5 / 60)) {
            fail(`[L6] held file duration ${dur} s != ${psCtl.frames / 60} s — `
              + 'the held frame must keep the timeline (stts delta), not shorten it');
          }
          if (failCount === c) {
            console.log(`[L6] OK — frame 120 surrendered on every attempt: `
              + `${r.repairs} re-encode(s), then ONE held frame (holes `
              + `${JSON.stringify(r.holes)}), ${frames} samples over the full `
              + `${dur.toFixed(3)} s, no error`);
          }
        }
      }
      // ---- L7: two ADJACENT frames surrendered on every attempt — a 2-frame
      // hold would visibly stutter, so the wall refuses — WITH the file ----
      {
        const c = failCount;
        await psRun('', { 120: 9, 121: 9 });
        const r = await psSettle('[L7]');
        await waitAim('[L7 settle]');
        const T = psCtl.frames;
        if (!r || !r.err) {
          fail(`[L7] a 2-frame persistent hole must be refused (got ${JSON.stringify(r)})`);
        } else {
          if (r.truncated?.got !== T - 2 || r.truncated?.want !== T) {
            fail(`[L7] truncation marker wrong: ${JSON.stringify(r.truncated)}`);
          }
          const pieces = await chrome.eval('window.__psPieces.length');
          const file = await psAssemble('[L7]', 'l997-L7-salvage.mp4');
          const size = fs.statSync(file).size;
          if (!r.salvage || r.salvage.lost !== 2 || r.salvage.held !== 2
            || r.salvage.streamedBytes !== size) {
            fail(`[L7] salvage marker wrong (RED pre-997: none): `
              + `${JSON.stringify(r.salvage)} vs streamed ${size} B in ${pieces} pieces`);
          }
          const frames = psProbeFrames(file);
          if (frames !== T - 2) {
            fail(`[L7] the salvaged file decodes ${frames} samples, want ${T - 2}`);
          }
          const derr7 = decodeErrors(file);
          if (derr7) fail(`[L7] the salvaged file does not decode clean: ${derr7.slice(0, 300)}`);
          const kErr7 = keyAfterHoles(file, [{ at: 120, n: 2 }]);
          if (kErr7) fail(`[L7] an unsafe delta follows the held run: ${kErr7}`);
          if (failCount === c) {
            console.log(`[L7] OK — a 2-frame persistent hole refused as visibly `
              + `broken WITH its file attached (${size} B, ${frames} samples, `
              + 'lost 2) for the Save anyway offer');
          }
        }
      }

      // ---- L10 (review GH-997 r1): an unrepaired hole with recovery STOOD
      // DOWN — a cached cameratrack.js without snapshot/restore makes the
      // chase span impure, so the rewind is refused. Parked successors may
      // reference the surrendered picture: the engine now releases only
      // from the first parked KEYFRAME (the rest is held) — the result is
      // either a clean resumed-keyframe stream or a refusal with the file
      // attached, and either way every decoded frame matches the control
      // (decoded-frame comparison: per-slot luma PSNR, holds against the
      // frame they repeat — counts cannot see concealed damage). VP9 (webm)
      // on purpose — the codec of review's repro: Chrome's software H.264
      // decode conceals a missing P-frame reference above the PSNR floor at
      // this size (measured 36.6-36.8 dB pre-fix), VP9 does not (measured
      // 16.8 dB at slots 64-65 pre-fix). RED pre-fix: the unsafe deltas
      // shipped as an accepted 1-frame hold over damaged successors.
      {
        const c = failCount;
        const trackOpt = `, { perShotCamera: [{ track: { target: 'cue' } }],
          format: 'webm' }`;
        await chrome.eval(`(() => { const t = window.__track;
          window.__l10 = { snapshot: t.snapshot, restore: t.restore };
          delete t.snapshot; delete t.restore; return true; })()`);
        await psRun(trackOpt);
        const ctl10 = await psSettle('[L10 control]');
        await waitAim('[L10 control settle]');
        const ctlFile = await psAssemble('[L10]', 'l10-control.webm');
        await psRun(trackOpt, { 60: 1 }); // frame 60's output surrendered once
        const r = await psSettle('[L10]');
        await waitAim('[L10 settle]');
        await chrome.eval(`(() => { Object.assign(window.__track, window.__l10);
          delete window.__l10; return true; })()`);
        const dropped10 = await chrome.eval('window.__ps472.st.dropped.length');
        const file = await psAssemble('[L10]', 'l10-stooddown.webm');
        if (!ctl10 || ctl10.err) {
          fail('[L10] control render failed: ' + JSON.stringify(ctl10));
        } else if (!(dropped10 >= 1)) {
          fail('[L10] staging: no output was surrendered');
        } else if (r?.err && !r?.salvage) {
          fail(`[L10] a refusal must carry the file (obSalvage): ${r.err}`);
        } else {
          const holes = (r?.err ? r.salvage?.holes : r?.holes) ?? [];
          const cmp = decodedPsnr(file, ctlFile, 320, 180, holes);
          const minP = Math.min(...cmp.psnr);
          const worst = cmp.psnr.indexOf(minP);
          if (cmp.frames !== cmp.controlFrames) {
            fail(`[L10] decoded timeline ${cmp.frames} slots != control ${cmp.controlFrames}`);
          }
          if (!(minP >= 33)) {
            fail(`[L10] decoded frame ${worst} departs from the control (PSNR `
              + `${minP.toFixed(1)} dB < 33) — a successor decoded against the `
              + `missing picture (RED pre-fix); holes ${JSON.stringify(holes)}`);
          }
          const kErr = keyAfterHoles(file, holes);
          if (kErr) {
            fail(`[L10] an unsafe delta follows the hole (RED pre-fix: released `
              + `parked successors as-is): ${kErr}`);
          }
          if (failCount === c) {
            console.log(`[L10] OK — a stood-down hole (stale cameratrack) ${r?.err
              ? 'was refused with its file attached' : 'shipped held'} (holes `
              + `${JSON.stringify(holes)}); every decoded slot matches the `
              + `control (min PSNR ${minP.toFixed(1)} dB)`);
          }
        }
      }
      // ---- L11 (review GH-997 r1): held frames are never "in flight" — 13
      // isolated persistent holes at 4K (hard in-flight cap 12) must reach
      // the delivery wall (refused: 13 > holdCap for this clip), never the
      // 15 s stall watchdog. RED pre-fix: the stall error.
      {
        const c = failCount;
        const dropAt = {};
        for (let j = 0; j < 13; j++) dropAt[20 + 12 * j] = 9;
        await psRun(`, { width: 3840, height: 2160, hashFrames: false }`, dropAt);
        let r = null;
        for (let i = 0; i < 1800 && !r; i++) {
          r = await chrome.eval('window.__psDone');
          if (!r) await sleep(500);
        }
        await waitAim('[L11 settle]');
        if (!r) {
          fail('[L11] the 4K render never settled');
        } else if (!r.err) {
          fail(`[L11] 13 holds in a short clip must be refused (cap 1): ${JSON.stringify({ held: r.held })}`);
        } else if (/stalled/i.test(r.err) || !r.salvage) {
          fail(`[L11] 13 held frames at 4K hit the stall watchdog instead of the `
            + `delivery wall (RED pre-fix): ${r.err}`);
        } else if (r.salvage.held !== 13) {
          fail(`[L11] the refusal must carry exactly the 13 holds: ${JSON.stringify(r.salvage)}`);
        } else if (failCount === c) {
          console.log('[L11] OK — 13 isolated holds at 4K (hard in-flight cap 12) '
            + 'reached the delivery wall (refused with the file attached, held '
            + `${r.salvage.held}), no stall`);
        }
      }
      // ---- L12 (review GH-997 r1): a TRAILING hold has no successor sample to
      // extend over it, so it is refused with the file attached — never an
      // accepted file whose container ends a frame early. RED pre-fix: an
      // accepted hold over a short container.
      {
        const c = failCount;
        const T = psCtl.frames;
        await psRun('', { [T - 1]: 9 });
        const r = await psSettle('[L12]');
        await waitAim('[L12 settle]');
        if (!r || !r.err || !r.salvage) {
          fail(`[L12] a persistently lost LAST frame must be refused with the file `
            + `attached (RED pre-fix: accepted short): ${JSON.stringify(r && { err: r.err, held: r.held, holes: r.holes })}`);
        } else if (!(r.salvage.holes ?? []).some((h) => h.at + h.n >= T)) {
          fail(`[L12] the refusal is not the trailing hold: ${JSON.stringify(r.salvage)}`);
        } else if (failCount === c) {
          console.log(`[L12] OK — a persistently lost last frame was refused with `
            + `its file attached (holes ${JSON.stringify(r.salvage.holes)}), never `
            + 'shipped as a short container');
        }
      }

      // ---- L8 (GH-997): the Export DIALOG's salvage offer (buffered) ------
      // The same over-policy hole through the toolbar dialog: the wall
      // refuses, the dialog reads the salvage prompt with a visible,
      // hit-testable "Save anyway" and Start relabelled "Export again"; a
      // REAL click on Save anyway keeps the bytes as the delivered result
      // (export.salvage.kept). RED pre-997: "export failed: …" and nothing
      // kept.
      {
        const c = failCount;
        await chrome.eval(`window.__ps472.st.dropAt = { 30: 9, 31: 9 };`
          + ` window.__ps472.st.dropped.length = 0; true`);
        await chrome.eval('__export.open()');
        await sleep(300);
        const r8 = await chrome.eval(`__export.start('standard', { width: 320,
          height: 180, withAudio: false, noDownload: true }).then(() => ({ ok: true }),
          (e) => ({ err: String(e?.message ?? e), salvage: !!e?.obSalvage }))`);
        await sleep(200);
        const ui8 = await chrome.eval(`(() => {
          const sv = document.getElementById('ob-x-save');
          if (!sv) {
            return { missing: 'no #ob-x-save control', state: __export.state(),
              ptext: document.getElementById('ob-x-ptext')?.textContent ?? null };
          }
          const b = sv.getBoundingClientRect();
          const hit = b.width > 0 && document.elementFromPoint(b.x + b.width / 2,
            b.y + b.height / 2) === sv;
          const so = __export.salvage?.();
          return { state: __export.state(),
            ptext: document.getElementById('ob-x-ptext').textContent,
            save: sv.style.display !== 'none' && b.width > 0, saveText: sv.textContent,
            hit, x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2),
            start: document.getElementById('ob-x-start').textContent,
            want: so?.want ?? null, lost: so?.lost ?? null,
            prevFrames: __export.lastResult()?.frames ?? null };
        })()`);
        const want8 = await chrome.eval(`({
          prompt: __i18n.t('export.salvage.prompt', { lost: 2, want: ${ui8.want ?? 0} }),
          save: __i18n.t('export.salvage.save'),
          retry: __i18n.t('export.salvage.retry') })`);
        if (!r8.err || !r8.salvage) {
          fail(`[L8] the dialog run must be refused WITH salvage: ${JSON.stringify(r8)}`);
        }
        if (ui8.state !== 'salvage' || ui8.ptext !== want8.prompt || !ui8.save
          || ui8.saveText !== want8.save || !ui8.hit || ui8.start !== want8.retry
          || ui8.lost !== 2) {
          fail(`[L8] dialog salvage offer wrong: ${JSON.stringify(ui8)} want `
            + JSON.stringify(want8));
        } else {
          await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
            x: ui8.x, y: ui8.y, button: 'left', clickCount: 1 });
          await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
            x: ui8.x, y: ui8.y, button: 'left', clickCount: 1 });
          await sleep(300);
          const after8 = await chrome.eval(`(() => {
            const lr = __export.lastResult();
            const mb = (n) => (n / 1e6).toFixed(n < 3e6 ? 1 : 0) + ' MB';
            return { state: __export.state(),
              ptext: document.getElementById('ob-x-ptext').textContent,
              want: __i18n.t('export.salvage.kept', { size: mb(lr.size),
                ext: lr.ext, lost: 2, want: lr.salvaged?.want }),
              frames: lr.frames,
              save: document.getElementById('ob-x-save')?.style.display ?? 'none' };
          })()`);
          if (after8.state !== 'done' || after8.ptext !== after8.want
            || after8.save !== 'none' || after8.frames !== ui8.want) {
            fail(`[L8] Save anyway did not keep the render: ${JSON.stringify(after8)}`);
          }
        }
        await chrome.eval(`window.__ps472.st.dropAt = {}; __export.close(); true`);
        await sleep(500);
        if (failCount === c) {
          console.log(`[L8] OK — the dialog refused a 2-frame hole with a `
            + `hit-testable "Save anyway" beside "Export again"; a real click `
            + `kept the ${ui8.want}-frame render (export.salvage.kept)`);
        }
      }

      // ---- [991] the macOS wrapper's save sheet reports its OUTCOME -------
      // A stubbed wrapper (no obShare; obSaveVideoStream + the files-dest
      // hint — the mac shell's shape). The dialog hands the finished render
      // to the sheet through the chunked bridge, reads "rendered — choose
      // where to save" (NOT done) while it is up, a Cancel result reads
      // "not saved" with a hit-testable "Save again", and Save again posts
      // the SAME bytes with NO new render; a saved result reads done.
      // RED pre-fix: done painted at once, the anchor route reported
      // nothing, the bytes were gone.
      {
        const c = failCount;
        await chrome.eval(`(() => {
          window.__s991 = { ops: [] };
          window.webkit = { messageHandlers: { obSaveVideoStream: {
            postMessage: async (m) => {
              window.__s991.ops.push({ op: m.op, name: m.name, dest: m.dest,
                bytes: m.bytes, chunks: m.chunks, seq: m.seq });
              return { ok: true };
            } } } };
          window.__obSaveVideo = { v: 1, chunk: 786432, dests: ['files'] };
          return true;
        })()`);
        await chrome.eval('__export.open()');
        await sleep(300);
        await chrome.eval(`__export.start('standard', { width: 320, height: 180,
          withAudio: false }).catch(() => null)`);
        await sleep(400);
        const s1 = await chrome.eval(`({ state: __export.state(),
          ptext: document.getElementById('ob-x-ptext').textContent,
          saving: __i18n.t('export.saving'),
          begins: window.__s991.ops.filter((o) => o.op === 'begin'),
          ends: window.__s991.ops.filter((o) => o.op === 'end').length,
          encodes: window.__ps472.st.encodes })`);
        if (s1.state !== 'saving' || s1.ptext !== s1.saving
          || s1.begins.length !== 1 || s1.begins[0].dest !== 'files' || s1.ends !== 1) {
          fail(`[991] the finished render must wait on the sheet (saving, one `
            + `begin/end over the bridge — RED: done at once): ${JSON.stringify(s1)}`);
        }
        const name1 = s1.begins[0]?.name;
        await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:save-video-result',`
          + ` { detail: { ok: false, name: ${JSON.stringify(name1)}, dest: 'files',`
          + ` error: 'cancelled' } })); true`);
        await sleep(200);
        const s2 = await chrome.eval(`(() => {
          const sv = document.getElementById('ob-x-save');
          if (!sv) {
            return { missing: 'no #ob-x-save control', state: __export.state(),
              ptext: document.getElementById('ob-x-ptext')?.textContent ?? null };
          }
          const b = sv.getBoundingClientRect();
          return { state: __export.state(),
            ptext: document.getElementById('ob-x-ptext').textContent,
            want: __i18n.t('export.notSaved'), saveText: sv.textContent,
            wantSave: __i18n.t('export.saveAgain'),
            hit: b.width > 0 && document.elementFromPoint(b.x + b.width / 2,
              b.y + b.height / 2) === sv,
            x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
        })()`);
        if (s2.state !== 'notSaved' || s2.ptext !== s2.want || !s2.hit
          || s2.saveText !== s2.wantSave) {
          fail(`[991] a cancelled sheet must read "not saved" with a hit-testable `
            + `Save again: ${JSON.stringify(s2)}`);
        } else {
          await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
            x: s2.x, y: s2.y, button: 'left', clickCount: 1 });
          await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
            x: s2.x, y: s2.y, button: 'left', clickCount: 1 });
          await sleep(400);
          const s3 = await chrome.eval(`({ state: __export.state(),
            begins: window.__s991.ops.filter((o) => o.op === 'begin'),
            encodes: window.__ps472.st.encodes })`);
          if (s3.begins.length !== 2 || s3.begins[1].bytes !== s1.begins[0].bytes
            || s3.encodes !== s1.encodes || s3.state !== 'saving') {
            fail(`[991] Save again must re-post the SAME bytes with no new render: `
              + JSON.stringify({ s1, s3 }));
          } else {
            await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:save-video-result',`
              + ` { detail: { ok: true, name: ${JSON.stringify(s3.begins[1].name)},`
              + ` dest: 'files' } })); true`);
            await sleep(200);
            const s4 = await chrome.eval(`({ state: __export.state(),
              ptext: document.getElementById('ob-x-ptext').textContent,
              saving: __i18n.t('export.saving'),
              save: document.getElementById('ob-x-save')?.style.display ?? 'none' })`);
            if (s4.state !== 'done' || s4.ptext === s4.saving || s4.save !== 'none') {
              fail(`[991] a saved result must read done: ${JSON.stringify(s4)}`);
            }
          }
        }
        await chrome.eval(`(() => { __export.close(); delete window.webkit;
          delete window.__obSaveVideo; delete window.__s991; return true; })()`);
        await sleep(500);
        if (failCount === c) {
          console.log(`[991] OK — the wrapper sheet's outcome drives the dialog: `
            + `saving while up, Cancel → not saved + Save again (same `
            + `${s1.begins[0]?.bytes} B, no re-render), saved → done`);
        }
      }

      if (await chrome.eval(psCleanup) !== true) {
        fail('[PS] rig cleanup failed (document.hidden still shadowed)');
      }
      const psErrs = await chrome.eval('__test.errors.slice()');
      if (psErrs.length) fail('[PS] app errors: ' + psErrs.join(' | '));
    }

    // ==== GH-363: pre-strike lead-in (LEAD1-LEAD3) ============================
    // Engine truth over renderDrill's opts.leads (the planner's own schedule
    // arms ride e2e-playback): head frames are FIXED rate-1 output frames
    // the ball clock never enters, the v1 tier is a static address hold, the
    // v2 tier feathers, the play/tail frames are BYTE-IDENTICAL to a
    // lead-less render after the head shift (the option-off clean law), the
    // jittered schedule is deterministic, and the montage cap compresses
    // play while heads stay rate 1.
    {
      // ---- LEAD1: head arithmetic + presence + the option-off shift law -----
      const lc1 = failCount;
      // sec values are ENGINE-arm choices (the planner picks real T_pre):
      // 1.0 on the v1 tier puts the early head inside the 1.8 s address
      // hold (static frames); 2.5 on the v2 tier reaches past the front
      // hold + final stroke (~1.1 s) into the feather cycles (motion).
      const LEADS = [{ sec: 1.0, tier: 'v1', fuse: false },
        { sec: 2.5, tier: 'v2', fuse: false }];
      const H = LEADS.map((l) => Math.round(l.sec * 60));
      const leadDrill = (extra) => chrome.eval(
        `__export.renderDrill(__share.records().slice(0, 2), {
          width: 640, height: 360, noDownload: true, hashFrames: true,
          withAudio: false, perShotCamera: ['top', 'side']${extra} })`);
      const ctl = await leadDrill('');
      await waitAim('[LEAD1 ctl settle]');
      const lr = await leadDrill(`, leads: ${JSON.stringify(LEADS)}`);
      await waitAim('[LEAD1 settle]');
      if (!ctl?.segments || ctl.segments.length !== 2 || !lr?.segments
        || !ctl.hashes || !lr.hashes) {
        fail('[LEAD1] renders failed: '
          + JSON.stringify({ ctl: ctl?.segments, lr: lr?.segments }));
      } else {
        if (!(lr.segments[0] === ctl.segments[0] + H[0]
          && lr.segments[1] === ctl.segments[1] + H[1]
          && lr.frames === ctl.frames + H[0] + H[1])) {
          fail(`[LEAD1] segment frames ${JSON.stringify(lr.segments)} != `
            + `control ${JSON.stringify(ctl.segments)} + heads `
            + `${JSON.stringify(H)} (planPlayback headSec law)`);
        }
        // the option-off clean law: every play/tail frame byte-equal to the
        // lead-less render after the per-segment head shift — a lead
        // perturbs NOTHING downstream (same cue plan post-contact, same
        // tails, same ball clocks)
        let shiftBad = -1;
        for (let k = 0; k < ctl.segments[0] && shiftBad < 0; k++) {
          if (lr.hashes[H[0] + k] !== ctl.hashes[k]) shiftBad = k;
        }
        for (let k = 0; k < ctl.segments[1] && shiftBad < 0; k++) {
          if (lr.hashes[H[0] + ctl.segments[0] + H[1] + k]
            !== ctl.hashes[ctl.segments[0] + k]) {
            shiftBad = ctl.segments[0] + k;
          }
        }
        if (shiftBad >= 0) {
          fail(`[LEAD1] play/tail frames diverge from the lead-less render `
            + `at control frame ${shiftBad} — leads must only PREPEND`);
        }
        // v1 static address hold: early head frames pixel-frozen (cue at
        // address, balls resting, static preset camera)…
        if (lr.hashes[0] !== lr.hashes[10]) {
          fail('[LEAD1] v1 hold head frames 0/10 differ — the static '
            + 'address hold must freeze');
        }
        // …and the head's tail is the REAL stroke (backswing/thrust motion)
        if (lr.hashes[H[0] - 3] === lr.hashes[0]) {
          fail('[LEAD1] v1 head end equals the address frame — the final '
            + 'stroke never rendered in the head window');
        }
        // v2 feathers: motion inside the practice window (head frames 10
        // and 40 sit ~0.5 s apart inside the feather cycles)
        const h1 = H[0] + ctl.segments[0];
        if (lr.hashes[h1 + 10] === lr.hashes[h1 + 40]) {
          fail('[LEAD1] v2 head frames 10/40 identical — no feather motion '
            + 'in the practice window');
        }
        if (failCount === lc1) {
          console.log(`[LEAD1] OK — heads ${JSON.stringify(H)} prepended `
            + `(${ctl.frames} → ${lr.frames} frames), v1 hold frozen + `
            + 'stroke present, v2 feathers moving, play/tail frames '
            + 'byte-equal to the lead-less render after the shift');
        }
      }

      // ---- LEAD2: determinism ×2 + the seed law ------------------------------
      const lc2 = failCount;
      const lr2 = await leadDrill(`, leads: ${JSON.stringify(LEADS)}`);
      await waitAim('[LEAD2 settle]');
      if (!lr2?.hashes || lr2.hashes.length !== lr.hashes.length) {
        fail(`[LEAD2] second lead render hash count ${lr2?.hashes?.length} `
          + `!= ${lr.hashes.length}`);
      } else {
        const firstDiff = lr2.hashes.findIndex((h, i) => h !== lr.hashes[i]);
        if (firstDiff !== -1) {
          fail(`[LEAD2] lead render not deterministic — hashes diverge at `
            + `frame ${firstDiff}`);
        }
      }
      // the FNV-1a(record|shot|index|tier) seed law on the probe surface:
      // same (record, index) byte-agrees; a different index stirs the
      // jittered schedule; the v1 tier is count-0 with the 1.8 s hold
      const seedLaw = await chrome.eval(`(() => {
        const tp = window.__test;
        const rec = JSON.parse(__share.records()[0]);
        const probe = (lead) => {
          const spec = tp.cuePostLive.specFor(rec, lead);
          const plan = spec ? tp.cuePost(spec) : false;
          if (plan) tp.cuePost(null);
          return plan ? { practice: plan.practice, from: plan.from,
            tc: plan.t_contact } : null;
        };
        const a1 = probe({ tier: 'v2', index: 0 });
        const a2 = probe({ tier: 'v2', index: 0 });
        const b = probe({ tier: 'v2', index: 1 });
        const v1 = probe({ tier: 'v1', index: 0 });
        return { a1, a2, b, v1 };
      })()`);
      if (!seedLaw?.a1?.practice || !seedLaw.b?.practice
        || !seedLaw.v1?.practice) {
        fail('[LEAD2] lead probes did not arm: ' + JSON.stringify(seedLaw));
      } else {
        if (JSON.stringify(seedLaw.a1) !== JSON.stringify(seedLaw.a2)) {
          fail('[LEAD2] same (record, index, tier) probes disagree — the '
            + 'jitter seed law is broken');
        }
        if (JSON.stringify(seedLaw.a1.practice.feathers)
          === JSON.stringify(seedLaw.b.practice.feathers)) {
          fail('[LEAD2] index 0 and 1 produced identical feather schedules '
            + '— the shot index must stir the seed');
        }
        const v1p = seedLaw.v1.practice;
        if (v1p.feathers.length !== 0
          || Math.abs((seedLaw.v1.from - v1p.start) - 1.8) > 1e-9) {
          fail(`[LEAD2] v1 tier shape wrong (feathers `
            + `${v1p.feathers.length}, hold ${seedLaw.v1.from - v1p.start})`
            + ' — want count 0 + the 1.8 s address hold');
        }
        // the feather clearance law: every jittered amp stays inside the
        // certified backswing envelope (amp <= pullback — design 363 §2)
        const amps = seedLaw.a1.practice.feathers.map((f) => f.amp);
        if (!amps.every((a) => a > 0 && a <= 0.6)) {
          fail(`[LEAD2] feather amps out of the envelope: ${amps}`);
        }
        if (failCount === lc2) {
          console.log(`[LEAD2] OK — two lead renders byte-identical `
            + `(${lr.hashes.length} hashes); probe seed law holds (index `
            + 'stirs, repeat agrees, v1 = count 0 @ 1.8 s hold)');
        }
      }

      // ---- LEAD3: montage cap — heads stay rate 1 ----------------------------
      const lc3 = failCount;
      // slice(0, 3): the F7 arm appended a foreign-kernel diagnostic record
      // to the share log after the F-drill trio — the budget class needs
      // exactly the three stageable playground shots
      const lr3 = await chrome.eval(
        `__export.renderDrill(__share.records().slice(0, 3), {
          width: 640, height: 360, noDownload: true, hashFrames: true,
          withAudio: false, perShotCamera: ['top', 'side', 'closeup'],
          slowmo: 0.5, budgetSec: 12,
          leads: ${JSON.stringify([...LEADS, null])} })`);
      await waitAim('[LEAD3 settle]');
      if (!lr3?.hashes) {
        fail('[LEAD3] budgeted lead render failed');
      } else {
        if (!(lr3.montageRate > 1) || lr3.frames > 12 * 60) {
          fail(`[LEAD3] budget did not bind (rate ${lr3.montageRate}, `
            + `frames ${lr3.frames}) — the B4 plan class must compress`);
        }
        // heads are FIXED rate-1 frames: segment 0's head under the budget
        // is byte-identical to LEAD1's unbudgeted render (same record,
        // camera, lead — the montage rate touches play frames only)
        let headBad = -1;
        for (let k = 0; k < H[0]; k++) {
          if (lr3.hashes[k] !== lr.hashes[k]) { headBad = k; break; }
        }
        if (headBad >= 0) {
          fail(`[LEAD3] head frame ${headBad} differs under the montage `
            + 'budget — lead heads must never compress');
        }
        if (failCount === lc3) {
          console.log(`[LEAD3] OK — budget bound (rate `
            + `${lr3.montageRate.toFixed(2)}, ${lr3.frames} ≤ 720 frames) `
            + `while all ${H[0]} head frames stayed byte-equal to the `
            + 'unbudgeted render (rate-1 law)');
        }
      }
    }

    if (!(await chrome.eval(`window.__settings?.changeMode?.('play') === true`))) {
      fail('[F-drill] mode restore to play refused');
    }
    await sleep(600);
  }

  // ---- error gates -----------------------------------------------------------
  const appErrors = await chrome.eval('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));

  // ---- fallback: WebCodecs missing → Realtime only ---------------------------
  const { identifier: noWcMock } = await chrome.send(
    'Page.addScriptToEvaluateOnNewDocument', { source: `
    Object.defineProperty(window, 'VideoEncoder', { value: undefined });
    Object.defineProperty(window, 'AudioEncoder', { value: undefined });` });
  await chrome.send('Page.reload');
  await waitReady();
  await sleep(800);
  await chrome.eval(
    '__test.shoot({ v0: 1.2, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
  await chrome.eval('__test.seek(__test.duration() + 1)');
  await sleep(1200);
  await chrome.eval('__export.open()');
  await sleep(200);
  const tiers = await chrome.eval('__export.tiers()');
  if (tiers.standard !== null || tiers.high !== null || tiers.ultra4k !== null
    || tiers.cinema4k !== null || (tiers.cinematic ?? null) !== null) {
    // #259: cinematic must be null (no WebCodecs) or absent (gate closed) —
    // never a live offer without an encoder
    fail('offline tiers still offered without WebCodecs: ' + JSON.stringify(tiers));
  }
  const note = await chrome.eval(
    'document.getElementById("ob-x-note")?.textContent ?? ""');
  // honesty ladder (issue #51): with MediaRecorder present the note keeps
  // the 'needs WebCodecs — realtime only' promise; with NEITHER path it
  // must be the export.noneAvailable copy, never a dead-tier promise
  const recSupported = await chrome.eval('window.__record?.supported === true');
  if (recSupported) {
    if (!note.includes('WebCodecs')) fail(`no WebCodecs fallback message ("${note}")`);
  } else if (!note.includes('not available')) {
    fail(`no capture path at all but the note is not export.noneAvailable ("${note}")`);
  }
  const startDisabled = await chrome.eval(
    'document.getElementById("ob-x-start")?.disabled === true');
  if (!startDisabled) fail('Export button enabled for an unavailable offline tier');
  // GH-304 [B-realtime]: a realtime-capable-only device (no WebCodecs → no
  // resolvable offline container) FLOORS the budget — even over a seeded
  // calibration store, exportBudget answers exactly 60 s, derived:false
  await chrome.eval(`localStorage.setItem('ob-export-bps-v1',
    JSON.stringify({ 'mp4:1080': { Bps: 3e6, n: 1 },
      'webm:1080': { Bps: 3e6, n: 1 } }))`);
  const noWcBudget = await chrome.eval(
    `__export.exportBudget({ tier: 'standard', height: 1080, photos: false })`);
  if (!(noWcBudget?.sec === 60 && noWcBudget.derived === false)) {
    fail('[B-realtime] no-WebCodecs boot must floor the budget at exactly '
      + `60 s (derived:false), got ${JSON.stringify(noWcBudget)}`);
  }
  await chrome.eval(`localStorage.removeItem('ob-export-bps-v1')`);
  if (!process.exitCode) {
    console.log('[fallback] OK — offline tiers unavailable, message shown, '
      + '60 s budget floor pinned (no resolvable container), realtime '
      + (tiers.realtime ? 'offered' : 'hidden (no MediaRecorder)'));
  }

  // ---- honesty ladder: interfaces present, EVERY probe false ----------------
  // (issue #51 review F4): webcodecs:true only means the interface triple
  // exists — when every isConfigSupported probe says no AND MediaRecorder
  // is gone, the dialog must show export.noneAvailable, never a blank
  // dead-end (the old `!support.webcodecs` computation missed this class).
  await chrome.send('Page.removeScriptToEvaluateOnNewDocument',
    { identifier: noWcMock });
  const { identifier: probeMock } = await chrome.send(
    'Page.addScriptToEvaluateOnNewDocument', { source: `
    Object.defineProperty(window, 'MediaRecorder', { value: undefined });
    window.VideoEncoder = class {
      static async isConfigSupported() { return { supported: false }; } };
    window.AudioEncoder = class {
      static async isConfigSupported() { return { supported: false }; } };` });
  await chrome.send('Page.reload');
  await waitReady();
  await sleep(800);
  await chrome.eval('__export.open()');
  await sleep(200);
  const support2 = await chrome.eval('__export.support()');
  if (!(support2?.webcodecs === true && !support2.mp4 && !support2.webm)) {
    fail('probe mock did not yield interfaces-present/all-probes-false: '
      + JSON.stringify(support2));
  }
  if (await chrome.eval('window.__record?.supported === true')) {
    fail('MediaRecorder mock did not take — noneAvailable arm inconclusive');
  }
  const note2 = await chrome.eval(
    'document.getElementById("ob-x-note")?.textContent ?? ""');
  if (!note2.includes('not available')) {
    fail('all probes false + no MediaRecorder must show export.noneAvailable, '
      + `got "${note2}"`);
  } else if (!process.exitCode) {
    console.log('[honesty] OK — all-probes-false + no MediaRecorder shows '
      + 'the noneAvailable message');
  }

  // ---- #81 QA lane D: coarse floors + de register + phone record state ------
  // Phone-emulated reboot (touch-cdp.mjs frozen recipe): metrics + touch
  // emulation applied BEFORE the reload so main.js's boot-time
  // matchMedia('(pointer: coarse)') sees coarse and installs the phone
  // surfaces (settings-sheet dispatch rows). The honesty mocks come off
  // first — this arm needs the real MediaRecorder/WebCodecs back.
  await chrome.send('Page.removeScriptToEvaluateOnNewDocument',
    { identifier: probeMock });
  await chrome.send('Emulation.setDeviceMetricsOverride',
    { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
  await chrome.send('Emulation.setTouchEmulationEnabled',
    { enabled: true, maxTouchPoints: 5 });
  await chrome.send('Page.reload');
  await waitReady();
  await sleep(800);
  if (!(await chrome.eval(`matchMedia('(pointer: coarse)').matches`))) {
    throw new Error('coarse-pointer emulation did not propagate — phone arm '
      + 'inconclusive (see touch-cdp.mjs header for the recorded fallback)');
  }

  // coarse 44pt tap floor on the export dialog: tier rows, footer buttons,
  // option controls (#81 QA measured tier rows ~29px @844x390 / 926x428)
  await chrome.eval('__export.open()');
  await sleep(300);
  const floors = await chrome.eval(`(() => {
    const bad = [];
    for (const el of document.querySelectorAll(
      '#ob-export-card .tier, #ob-export-card .row button,'
      + ' #ob-export-card .opts label')) {
      if (!el.getClientRects().length) continue; // hidden (e.g. Cancel)
      const h = el.getBoundingClientRect().height;
      if (h < 43.5) bad.push((el.id || el.className) + ': ' + h.toFixed(1) + 'px');
    }
    return bad;
  })()`);
  if (floors.length) {
    fail('coarse tap targets under the 44pt floor: ' + floors.join(' | '));
  } else console.log('[coarse] OK — tier rows / buttons / option labels >= 44pt');

  // de register: the options row stays inside the card, and the phone flex
  // clamp must not crush the note/progress text out of its box (#81 QA)
  await chrome.eval(`__i18n.setLocale('de')`);
  await sleep(500);
  const deBad = await chrome.eval(`(() => {
    const card = document.getElementById('ob-export-card');
    const cr = card.getBoundingClientRect();
    const bad = [];
    const opts = card.querySelector('.opts');
    if (opts.scrollWidth > opts.clientWidth + 1) {
      bad.push('opts row overflows: scrollWidth ' + opts.scrollWidth
        + ' > clientWidth ' + opts.clientWidth);
    }
    for (const el of opts.querySelectorAll('label')) {
      const r = el.getBoundingClientRect();
      if (r.right > cr.right + 0.5) bad.push('opts label past the card edge');
    }
    for (const sel of ['#ob-export-card .note', '#ob-x-ptext']) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight + 1) {
        bad.push(sel + ' crushed: scrollHeight ' + el.scrollHeight
          + ' > clientHeight ' + el.clientHeight);
      }
    }
    return bad;
  })()`);
  if (deBad.length) fail('de register export card: ' + deBad.join(' | '));
  else console.log('[de] OK — options row contained, note/progress text uncrushed');

  // ---- #157 vertical containment: wrapped option labels stay in their rows -
  // Owner device repro (de/ja phone): under the touch.css §3.10 column-flex
  // card clamp, WEBKIT computes a WRAPPED flex container's automatic
  // minimum as a SINGLE line (Chrome floors it at the full wrapped height),
  // so the crushed .opts box let its second row of option labels paint over
  // the note/footer — outside its row, outside the card. Two legs per
  // register/locale: (a) the natural walk pins containment as rendered;
  // (b) the FORCED leg zeroes min-height on the fixed members — removing
  // the automatic-minimum protection exactly like WebKit does — and the
  // ruled fix (flex-shrink:0 in export.js's style block) must hold
  // containment anyway. Pre-#157 the forced leg goes RED with DOM numbers.
  for (const [vw, vh] of [[844, 390], [667, 375]]) {
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: vw, height: vh, deviceScaleFactor: 3, mobile: true });
    await sleep(300);
    for (const loc of ['de', 'ja']) {
      await chrome.eval(`__i18n.setLocale(${JSON.stringify(loc)})`);
      await sleep(500);
      const vBad = await chrome.eval(`(() => {
        const bad = [];
        const card = document.getElementById('ob-export-card');
        const walk = (tag) => {
          const cr = card.getBoundingClientRect();
          const opts = card.querySelector('.opts');
          const or = opts.getBoundingClientRect();
          if (opts.scrollHeight > opts.clientHeight + 1) {
            bad.push(tag + ' .opts crushed: scrollHeight ' + opts.scrollHeight
              + ' > clientHeight ' + opts.clientHeight);
          }
          for (const el of opts.querySelectorAll('label')) {
            const r = el.getBoundingClientRect();
            if (r.bottom > or.bottom + 0.5) {
              bad.push(tag + ' option label out of its row: label bottom '
                + r.bottom.toFixed(1) + ' > .opts bottom ' + or.bottom.toFixed(1));
            }
            if (r.bottom > cr.bottom + 0.5 || r.top < cr.top - 0.5) {
              bad.push(tag + ' option label outside the card: '
                + r.top.toFixed(1) + '..' + r.bottom.toFixed(1) + ' vs card '
                + cr.top.toFixed(1) + '..' + cr.bottom.toFixed(1));
            }
          }
          const h3 = card.querySelector('h3');
          if (h3 && h3.scrollHeight > h3.clientHeight + 1) {
            bad.push(tag + ' title crushed: ' + h3.scrollHeight
              + ' > ' + h3.clientHeight);
          }
          const rr = card.querySelector('.row').getBoundingClientRect();
          if (rr.bottom > cr.bottom + 0.5) {
            bad.push(tag + ' footer row past the card bottom: '
              + rr.bottom.toFixed(1) + ' > ' + cr.bottom.toFixed(1));
          }
        };
        walk('natural');
        const forced = [...card.querySelectorAll('.opts, .row')]
          .concat(card.querySelector('h3') ?? []);
        for (const el of forced) el.style.minHeight = '0';
        void card.offsetHeight; // reflow
        walk('forced-min0');
        for (const el of forced) el.style.minHeight = '';
        return bad;
      })()`);
      if (vBad.length) {
        fail(`[#157 overflow] ${vw}x${vh} ${loc}: ` + vBad.join(' | '));
      } else {
        console.log(`[#157 overflow] OK — ${vw}x${vh} ${loc}: option rows `
          + 'grow with wrapped labels, nothing paints outside the card');
      }
    }
  }
  // restore the register the surrounding arms expect
  await chrome.send('Emulation.setDeviceMetricsOverride',
    { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
  await sleep(300);
  await chrome.eval(`__i18n.setLocale('en')`);
  await chrome.eval('__export.close()');
  await sleep(300);

  // [phone-rec] RETIRED (GH-225 Phase D). This arm asserted the #81-QA fix
  // on the phone settings-sheet Record dispatch row: .rec class flip,
  // record.button <-> record.stop key flip, and a visibly different
  // border/background while recording. 030 the design charter DVR amendment clause 4
  // retires that row (and the Export row beside it), so every assertion
  // named a surface that cannot exist. It is DELETED, not retargeted: the
  // claim was "the phone shows recording state", and the DVR has no manual
  // recording state to show — it is always recording. The phone's REPLACEMENT
  // entry is covered elsewhere (e2e-touch S13 taps #ob-playback for real;
  // e2e-record's [phone] arm proves capture still works on the coarse
  // register). A negative check stays here so the row cannot silently return
  // while this suite still boots the phone register.
  const phGhost = await chrome.eval(`(() => ({
    recRow: !!document.querySelector('.ob-touch-row[data-i18n="record.button"]'),
    exportRow: !!document.querySelector('.ob-touch-row[data-i18n="export.button"]'),
  }))()`);
  if (phGhost.recRow || phGhost.exportRow) {
    fail('[phone-rec] retired settings rows present: ' + JSON.stringify(phGhost));
  } else console.log('[phone-rec] OK — retired Export/Record sheet rows absent');

  // replay-bar slow-mo toggle coarse floor (#81 QA: 76x21 on phone) — a
  // real #r= replay boot on the SAME phone-emulated session
  await chrome.eval(
    '__test.shoot({ v0: 1.2, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
  await chrome.eval('__test.seek(__test.duration() + 1)');
  await sleep(1500);
  const shareUrl = await chrome.eval('__share.encode()');
  const hash = shareUrl.slice(shareUrl.indexOf('#'));
  await chrome.send('Page.navigate', // different query → full navigation
    { url: `http://127.0.0.1:${PORT}/app.html${hash}` });
  await sleep(500);
  await waitReady();
  let slowmo = null;
  for (let i = 0; i < 40 && !slowmo; i++) {
    await sleep(250);
    slowmo = await chrome.eval(`(() => {
      const el = document.querySelector('#ob-replay label');
      if (!el || !el.getClientRects().length) return null;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    })()`);
  }
  if (!slowmo) fail('replay bar slow-mo toggle never appeared on the #r= boot');
  else if (slowmo.h < 43.5 || slowmo.w < 43.5) {
    fail(`replay slow-mo toggle ${slowmo.w.toFixed(1)}x${slowmo.h.toFixed(1)} `
      + 'under the 44pt coarse floor');
  } else {
    console.log(`[replay] OK — slow-mo toggle ${slowmo.w.toFixed(0)}x`
      + `${slowmo.h.toFixed(0)} on phone`);
  }

  // ==== GH-1024: an Export opened during the WIN hold keeps the winning shot ==
  // A frame end shows the WIN banner for 2.6 s and then re-racks (flow.js);
  // the re-rack frees the sampler + record the toolbar export re-renders.
  // Pre-1024 the re-rack ran under an open (or still-building) Export dialog:
  // stale ETAs + an enabled Export that failed "no shot to export yet". The
  // law now: while the export HOLDS the shot (dialog building / open / a run
  // in flight) the WIN continuation is deferred, and it resumes EXACTLY ONCE
  // when the export lets go ('ob:export-idle'). Staging: the e2e-8ball S12
  // geometry (called 8 into pocket 5 → WIN) on a fresh normal boot; the
  // dialog opens through the toolbar button's own click handler on the WIN
  // edge (an in-page 20 ms watcher — CDP latency under load would miss the
  // 2.6 s window); every later step is real input or the dialog's own seam.
  // An in-page 50 ms state recorder counts WIN→re-rack transitions.
  // W1 warm open → no re-rack under the dialog, the winning shot exports,
  //    Close → exactly one re-rack. W2 Cancel mid-render inside the hold →
  //    still held, Close → exactly one re-rack. W3 a background/foreground
  //    flip across the 2.6 s beat with an export running → the run completes,
  //    no re-rack while held, exactly one after Close. W4 the FIRST open of a
  //    page session (encoder probes stretched past the hold) → the dialog
  //    builds over the still-WIN table with the shot exportable, one re-rack
  //    after Close. RED pre-1024 (fix reverted): the re-rack lands at 2.6 s
  //    under the dialog in every leg.
  {
    const cw = failCount;
    await chrome.send('Emulation.clearDeviceMetricsOverride');
    await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    const W_URL = `http://127.0.0.1:${PORT}/app.html?seed=1&w=1024`;
    const POT = { x: 0.38903252247502133, y: 0.7780650449500427 };
    const PHI = 1.1071487177940904;
    const wBoot = async (stretchProbeMs = 0) => {
      await chrome.send('Page.navigate', { url: W_URL });
      await sleep(500);
      await waitReady();
      await sleep(800);
      await chrome.eval(`(() => {
        window.__w1024 = { log: [], last: null, opened: 0 };
        setInterval(() => {
          const s = __test.state();
          if (s !== window.__w1024.last) {
            window.__w1024.log.push(s);
            window.__w1024.last = s;
          }
        }, 50);
        if (${stretchProbeMs} > 0) {
          const V = window.VideoEncoder;
          const orig = V.isConfigSupported.bind(V);
          V.isConfigSupported = (c) => new Promise((r) => setTimeout(r,
            ${stretchProbeMs})).then(() => orig(c));
        }
        return true;
      })()`);
      if (await chrome.eval('window.__rules?.setGame?.("eight_ball")') !== true) {
        fail('[1024] setGame(eight_ball) refused');
      }
      await sleep(600);
    };
    /** Stage the called-8 WIN; the toolbar Export opens on the WIN edge. */
    const wFire = async (tag) => {
      await chrome.eval(`__test.layout(${JSON.stringify([{ id: 0, x: 0, y: 0 },
        { id: 8, x: POT.x, y: POT.y }, { id: 9, x: -0.5, y: -1.0 },
        { id: 12, x: 0.5, y: -1.0 }])})`);
      const okMs = await chrome.eval(`window.__rules.setMatchState({ phase: 'grouped',
        groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 })`);
      if (!okMs) fail(`${tag}: setMatchState refused`);
      await chrome.eval('window.__rules.call(8, 5)');
      // per-leg ledger: each leg's re-rack count starts from this shot
      await chrome.eval(`(() => { window.__w1024.log = [__test.state()];
        window.__w1024.last = __test.state(); return true; })()`);
      const opened0 = await chrome.eval('window.__w1024.opened');
      await chrome.eval(`(() => {
        let left = false; // the shot must LEAVE the table first (a leg can
        // start on the previous leg's WIN — it must not open on that one)
        const iv = setInterval(() => {
          const st = __test.state();
          if (st !== 'WIN') { left = true; return; }
          if (!left) return;
          clearInterval(iv);
          window.__w1024.opened += 1;
          document.getElementById('ob-export-btn').click();
        }, 20);
        return true;
      })()`);
      const err = await chrome.eval(`__test.shoot(${JSON.stringify({ v0: 2.5,
        phi: PHI, theta: 0, a: 0, b: 0 })})`);
      if (err) { fail(`${tag}: shot rejected: ${err}`); return false; }
      for (let i = 0; i < 200; i++) {
        if ((await chrome.eval('window.__w1024.opened')) > opened0) return true;
        await sleep(100);
      }
      fail(`${tag}: the shot never reached WIN`);
      return false;
    };
    const wState = () => chrome.eval(`({ state: __test.state(),
      log: window.__w1024.log.slice(),
      modal: !!document.getElementById('ob-export-modal'),
      dlg: __export.state(), holds: __export.holdsShot?.() ?? null,
      note: document.getElementById('ob-x-note')?.textContent ?? null,
      start: document.getElementById('ob-x-start')?.disabled ?? null,
      playFirst: __i18n.t('export.playFirst') })`);
    // a re-rack = WIN → a fresh rack's opening state. WIN → PLAYBACK is NOT
    // one: every export ends with game.seek(duration) + the RAF settle
    // path, which re-plays the settle and re-presents WIN (re-arming the
    // 2.6 s beat — deferred again while the dialog stands)
    const FRESH = ['BALL_IN_HAND', 'AIM'];
    const reracks = (log) => {
      let n = 0;
      let lastTerminal = null;
      for (const st of log) {
        if (st === 'WIN') lastTerminal = 'WIN';
        else if (FRESH.includes(st) && lastTerminal === 'WIN') { n++; lastTerminal = null; }
      }
      return n;
    };
    const wClose = async () => {
      await chrome.eval('__export.close()');
      // the settle re-play (≤ the shot) + a re-armed 2.6 s beat bound this
      for (let i = 0; i < 150; i++) {
        const st = await chrome.eval('__test.state()');
        if (FRESH.includes(st)) break;
        await sleep(100);
      }
      await sleep(1500); // a second (double) re-rack would land inside this window
    };
    const wHeld = (tag, st, want = 'held') => {
      if (!['WIN', 'PLAYBACK'].includes(st.state) || reracks(st.log) !== 0) {
        fail(`${tag}: the WIN hold re-racked under the ${want} Export `
          + `(RED pre-1024): ${JSON.stringify(st)}`);
        return false;
      }
      return true;
    };
    const wOnce = (tag, st) => {
      if (reracks(st.log) !== 1 || !FRESH.includes(st.state)) {
        fail(`${tag}: closing the Export must resume the hold EXACTLY once: `
          + JSON.stringify(st));
      }
    };
    /** Every export ends with game.seek(duration) + the RAF settle, which
     * re-plays the settle and RE-PRESENTS WIN — re-arming the 2.6 s beat.
     * Wait for that re-presentation, then past a full beat, so the held
     * check judges the re-armed beat too (pre-1024 it re-racks under the
     * still-open dialog right there). */
    const wPastRearmedBeat = async (tag) => {
      for (let i = 0; i < 150; i++) {
        const log = await chrome.eval('window.__w1024.log.slice()');
        const k = log.lastIndexOf('PLAYBACK');
        if (k > 0 && log.indexOf('WIN', k) > k) break;
        if (FRESH.includes(log[log.length - 1])) break; // already re-racked
        await sleep(100);
      }
      await sleep(4000);
    };
    // ---- W1: warm module — open during the hold, export the winning shot
    await wBoot();
    await chrome.eval('__export.open().then(() => __export.close())'); // warm the module
    await sleep(600);
    if (await wFire('[W1]')) {
      await sleep(4000); // well past the 2.6 s beat
      const s1 = await wState();
      if (wHeld('[W1]', s1, 'open') && (s1.note === s1.playFirst || s1.start !== false)) {
        fail(`[W1] the dialog lost the winning shot: ${JSON.stringify(s1)}`);
      }
      const r1 = await chrome.eval(`__export.start('standard', { width: 320,
        height: 180, withAudio: false, noDownload: true })
        .then((r) => ({ frames: r?.frames ?? null }), (e) => ({ err: String(e?.message ?? e) }))`);
      if (!(r1?.frames > 0)) fail(`[W1] the winning shot did not export: ${JSON.stringify(r1)}`);
      await wPastRearmedBeat('[W1]');
      wHeld('[W1 after export]', await wState(), 'done');
      await wClose();
      wOnce('[W1]', await wState());
    }
    // ---- W2: Cancel mid-render inside the hold
    if (await wFire('[W2]')) {
      await sleep(400);
      await chrome.eval(`window.__w2run = __export.start('cinema4k', { width: 1280,
        height: 720, noDownload: true }).catch(() => null); true`);
      await sleep(1500);
      await chrome.eval('__export.cancel(); true');
      await wPastRearmedBeat('[W2]');
      const s2 = await wState();
      if (wHeld('[W2]', s2, 'cancelled') && s2.dlg !== 'cancelled') {
        fail(`[W2] staging: the run did not cancel (${s2.dlg})`);
      }
      await wClose();
      wOnce('[W2]', await wState());
    }
    // ---- W3: a background/foreground flip across the beat, export running
    if (await wFire('[W3]')) {
      await chrome.eval(`(() => {
        window.__w3hidden = false;
        Object.defineProperty(document, 'hidden', { configurable: true,
          get: () => window.__w3hidden });
        window.__w3run = __export.start('standard', { width: 320, height: 180,
          withAudio: false, noDownload: true })
          .then((r) => ({ frames: r?.frames ?? null }), (e) => ({ err: String(e?.message ?? e) }));
        setTimeout(() => {
          window.__w3hidden = true;
          document.dispatchEvent(new Event('visibilitychange'));
          setTimeout(() => {
            window.__w3hidden = false;
            document.dispatchEvent(new Event('visibilitychange'));
          }, 3000);
        }, 300);
        return true;
      })()`);
      const r3 = await chrome.eval('window.__w3run');
      await chrome.eval('delete document.hidden; true');
      await wPastRearmedBeat('[W3]');
      const s3 = await wState();
      if (!(r3?.frames > 0)) fail(`[W3] the paused-and-resumed export did not complete: ${JSON.stringify(r3)}`);
      wHeld('[W3]', s3, 'flipped');
      await wClose();
      wOnce('[W3]', await wState());
    }
    // ---- W4: the FIRST open of a page session — probes stretched past the hold
    await wBoot(4000); // the (parallel) encoder probes take 4 s — the dialog
    // cannot exist before the 2.6 s beat
    if (await wFire('[W4]')) {
      const hb = await chrome.eval('__export.holdsShot?.() === true');
      await sleep(3200); // past the 2.6 s beat, the dialog still building
      const s4a = await wState();
      wHeld('[W4 building]', s4a, 'building');
      if (s4a.modal) {
        unjudgeable(`[W4] staging: the dialog existed before the beat (the probe `
          + 'stretch did not hold) — the building-dialog half is not judged');
      }
      if (!hb) fail('[W4] holdsShot() false while the dialog was building');
      for (let i = 0; i < 100 && !(await chrome.eval(
        'document.getElementById("ob-export-modal") !== null')); i++) await sleep(100);
      await sleep(400);
      const s4 = await wState();
      if (wHeld('[W4 built]', s4, 'first-open')
        && (s4.note === s4.playFirst || s4.start !== false)) {
        fail(`[W4] the first-open dialog lost the winning shot: ${JSON.stringify(s4)}`);
      }
      await wClose();
      wOnce('[W4]', await wState());
    }
    const errsW = await chrome.eval('__test.errors.slice()');
    if (errsW.length) fail('[1024] app errors: ' + errsW.join(' | '));
    if (failCount === cw) {
      console.log('[1024] OK — W1 warm open held the WIN beat and exported the '
        + 'winning shot; W2 a mid-render Cancel kept the hold; W3 a 3 s '
        + 'background flip across the beat paused+completed the run with the '
        + 'hold intact; W4 the first open (probes stretched) built over the '
        + 'still-WIN table — every leg re-racked exactly once on Close');
    }
  }

  // ==== issue #197 arms (GH-251: the cadence legs are what remains) ===========
  // Fresh desktop-register boot with pre-boot bridge mocks (the e2e-record
  // recipe); the cadence leg needs a clean AIM table. The quality-picker /
  // HD / shield / dup-prepare legs are deleted with their machinery — see
  // the recorded rationale where they used to stand.
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__obPhotosPosts = [];
    window.__obSharePosts = [];
    window.webkit = { messageHandlers: {
      obPhotos: { postMessage: (m) => window.__obPhotosPosts.push(m) },
      obShare: { postMessage: (m) => window.__obSharePosts.push(m) },
    } };` });
  await chrome.send('Page.navigate',
    { url: `http://127.0.0.1:${PORT}/app.html?seed=1&arm=197` });
  await sleep(500);
  await waitReady();
  await sleep(800);
  if (!(await chrome.eval('window.__record?.supported === true'))) {
    console.log('[#197] SOFT-SKIP: MediaRecorder unsupported in this headless build');
  } else {
    // playground mode for the whole block (the recording-QA precedent):
    // judgment suppressed, every settle returns to EXACT AIM — the four
    // record/stop legs below never park on a decision prompt
    if (!(await chrome.eval(`window.__settings?.changeMode?.('playground') === true
      && window.__settings.get().mode === 'playground'`))) {
      fail('[#197] playground mode switch refused');
    }
    await sleep(600);
    // shots may land while a previous leg's roll is still settling — retry
    // on the aiming-state refusal only (the e2e-record [two-track] law)
    const shoot197 = async (tag, v0) => {
      let err = null;
      for (let i = 0; i < 20; i++) {
        err = await chrome.eval(`__test.shoot({ v0: ${v0}, phi: Math.PI / 2,
          theta: 0, a: 0, b: 0 })`);
        if (!err || !/aiming state/.test(String(err))) break;
        await sleep(500);
      }
      if (err) fail(`${tag} shot rejected: ${err}`);
      return !err;
    };
    // ---- (d) decoded cadence, TRANSCODE leg -------------------------------
    // The pinned stutter root cause: the mp4 sink's frameRate-derived
    // 60-tick timescale re-gridded every VFR realtime-capture timestamp to
    // 1/60 s (RED evidence 2026-07-25: 52 duplicate-PTS frames + 141/192
    // re-gridded deltas on a 193-frame capture). The fix (µs video
    // timescale on the transcode path) must PRESERVE the source cadence:
    // a transcode cannot invent evenness a RAF-jittered capture never had,
    // so the honest gate is source-timing preservation + strict
    // monotonicity, while EXACT evenness is gated on the offline legs.
    const pair = await chrome.eval(`(async () => {
      const src = [...document.querySelectorAll('body > canvas')][0];
      const err = window.__test.shoot(
        { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
      if (err) return { err };
      const stream = src.captureStream(60);
      const rec = new MediaRecorder(stream,
        { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8_000_000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise((res) => { rec.onstop = res; });
      rec.start(500);
      await new Promise((r) => setTimeout(r, 3500));
      rec.stop();
      await stopped;
      stream.getTracks().forEach((t) => t.stop());
      const webm = new Blob(chunks, { type: 'video/webm' });
      const m = await import('/app/transcode.js');
      const mp4 = await m.transcodeWebmToMp4(webm);
      const b64 = async (blob) => {
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) {
          s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        }
        return btoa(s);
      };
      return { webm: await b64(webm), mp4: await b64(mp4) };
    })()`);
    if (pair.err) fail('[#197 cadence] transcode-leg shot rejected: ' + pair.err);
    else {
      const webmFile = path.join(OUTDIR, 'cadence-src.webm');
      const mp4File = path.join(OUTDIR, 'cadence-out.mp4');
      fs.writeFileSync(webmFile, Buffer.from(pair.webm, 'base64'));
      fs.writeFileSync(mp4File, Buffer.from(pair.mp4, 'base64'));
      const ptsOf = (file) => execFileSync('ffprobe', ['-v', 'error',
        '-select_streams', 'v:0', '-show_entries', 'frame=pts_time',
        '-of', 'default=nw=1:nk=1', file]).toString().trim()
        .split('\n').map(Number).filter((x) => Number.isFinite(x));
      const srcPts = ptsOf(webmFile);
      const outPts = ptsOf(mp4File);
      if (!(srcPts.length > 60)) {
        fail(`[#197 cadence] capture too short (${srcPts.length} frames)`);
      }
      if (outPts.length !== srcPts.length) {
        fail(`[#197 cadence] transcode changed the frame count: webm `
          + `${srcPts.length} → mp4 ${outPts.length} (dropped/dup frames)`);
      }
      const n = Math.min(srcPts.length, outPts.length);
      let dups = 0;
      let maxErr = 0;
      for (let i = 0; i < n; i++) {
        maxErr = Math.max(maxErr,
          Math.abs((outPts[i] - outPts[0]) - (srcPts[i] - srcPts[0])));
        if (i > 0 && outPts[i] - outPts[i - 1] <= 0) dups++;
      }
      if (dups > 0) {
        fail(`[#197 cadence] transcoded mp4 has ${dups} non-increasing PTS `
          + 'steps — the 60-tick re-grid stutter class (RED pre-fix: 52)');
      }
      if (maxErr > 0.0015) {
        fail(`[#197 cadence] transcoded PTS deviate up to `
          + `${(maxErr * 1000).toFixed(2)} ms from the source webm timeline `
          + '(want ≤ 1.5 ms — the 60-tick re-grid measured up to 8.3 ms)');
      }
      if (!dups && maxErr <= 0.0015) {
        console.log(`[#197 cadence] OK — transcode leg: ${outPts.length} `
          + 'frames, count preserved, strictly monotonic, max source-timing '
          + `error ${(maxErr * 1000).toFixed(3)} ms`);
      }
      // GH-329 tag wall, Photos-transcode format: the delivered mp4 must
      // carry the limited-range bt709 tags the sink's encoder actually
      // produced (stream AND first decoded frame). Measured truth: the
      // MediaRecorder source webm is tv/smpte170m (Chrome's canvas-capture
      // choice — its own tags, not asserted here) and the transcode's
      // decode→re-encode CONVERTS the matrix (decoded output sits on the
      // source's 601 interpretation within generation loss, ~0.9 LSB, not
      // on a retag of the coded planes, ~1.8) — so tv/bt709 here is a
      // true tag/data pairing, the property that keeps Photos/players
      // rendering the DVR clip at live-bed brightness.
      {
        let tagFails = 0;
        for (const [what, args] of [
          ['stream', ['-show_entries',
            'stream=color_range,color_space,color_transfer,color_primaries']],
          ['frame', ['-read_intervals', '%+#1', '-show_entries',
            'frame=color_range,color_space,color_transfer,color_primaries']],
        ]) {
          const got = execFileSync('ffprobe', ['-v', 'error',
            '-select_streams', 'v:0', ...args,
            '-of', 'default=nw=1', mp4File]).toString();
          for (const [k, want] of [['color_range', 'tv'],
            ['color_space', 'bt709'], ['color_transfer', 'bt709'],
            ['color_primaries', 'bt709']]) {
            const m = new RegExp(`${k}=(\\S+)`).exec(got);
            if (m?.[1] !== want) {
              tagFails++;
              fail(`[GH-329 wysiwyg] transcoded mp4 ${what} `
                + `${k}=${m?.[1] ?? 'MISSING'}, want ${want}`);
            }
          }
        }
        if (tagFails === 0) {
          console.log('[GH-329 wysiwyg] OK — Photos-transcode mp4 tagged '
            + 'tv/bt709 (stream + frame), matrix genuinely converted from '
            + 'the tv/601 MediaRecorder source');
        }
      }
    }

    // (GH-251: the [#197 progress] / [#197 picker] / [#197 hd] /
    //  [#197 shield] / [#197 dup-prepare] arms are DELETED with the
    //  machinery they proved — record.js's transcode trio + the #ob-prepare
    //  bar + shield, routeSave's opts.ui branch → record-quality.js, and
    //  runHdSave → __export.hdSave (removed with its last caller). What
    //  survives of their subject matter is gated elsewhere: the transcode
    //  cadence law by the DIRECT [#197 cadence] leg above (transcode.js is
    //  produced by the DVR card since GH-252, gated by e2e-playback 4f2/4f3),
    //  the two-track/never-strip law by e2e-record [two-track]/
    //  [audio-fallback] (also direct), and the offline HD render engine by
    //  the offline cadence leg + the tier arms — offline-render.js is
    //  untouched by the removal wave.)
    const arm197Errors = await chrome.eval('__test.errors');
    if (arm197Errors.length) {
      fail('[#197] app-captured errors: ' + arm197Errors.join(' | '));
    }
  }

  // ==== issue #258 arms: encoder-liveness watchdog + in-flight ceiling ========
  // A stubbed VideoEncoder reproduces the measured iOS-sim WebKit wedge
  // (GH-256 harness: avc1 accepts configure+encode, delivers ~8 outputs,
  // then goes silent — 7/7 renders) in BOTH stall modes:
  //   pinned — input stops being CONSUMED: encodeQueueSize pins > 4 (the
  //            harness-observed mode; pre-#258 the backpressure loop spins
  //            for ever, progress frozen at ~frame 8);
  //   drain  — input keeps being consumed silently: queue stays ~0 (pre-#258
  //            the k-loop then feeds EVERY remaining frame into the encoder
  //            — the unbounded WebContent balloon).
  // RED-PROOF (recorded 2026-07-29 against the pre-#258 offline-render.js —
  // see GH-258): pinned → state still 'exporting' at the 40 s deadline;
  // drain → the encoder swallowed all frames and finalize returned a
  // TRUNCATED 8-frame file as 'done'. Both legs below fail red there.
  {
    const { identifier: stallMock } = await chrome.send(
      'Page.addScriptToEvaluateOnNewDocument', { source: `
      (() => {
        const Real = window.VideoEncoder;
        const S = window.__stall = { mode: 'pinned', limit: 8,
          encodes: 0, outputs: 0, fakeQueue: 0, peak: 0 };
        window.VideoEncoder = class {
          constructor(init) {
            this._real = new Real({
              output: (chunk, meta) => {
                if (S.outputs >= S.limit) return; // silent after ~8 chunks
                S.outputs++;
                init.output(chunk, meta);
              },
              error: (e) => init.error(e),
            });
          }
          configure(c) { this._real.configure(c); }
          encode(frame, opts) {
            S.encodes++;
            S.peak = Math.max(S.peak, S.encodes - S.outputs);
            if (S.outputs >= S.limit) {
              if (S.mode === 'pinned') S.fakeQueue++; // accepted, never eaten
              return; // drain mode: eaten silently, no output ever
            }
            this._real.encode(frame, opts);
          }
          get encodeQueueSize() { return S.fakeQueue + this._real.encodeQueueSize; }
          flush() { return this._real.flush(); }
          close() { this._real.close(); }
          reset() { this._real.reset(); }
          static isConfigSupported(c) { return Real.isConfigSupported(c); }
        };
      })();` });
    await chrome.send('Page.reload');
    await waitReady();
    await sleep(800);
    await chrome.eval(
      '__test.shoot({ v0: 1.2, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
    await chrome.eval('__test.seek(__test.duration() + 1)');
    await sleep(1200);
    await chrome.eval('__export.open()'); // probes support; card = paint surface
    await sleep(300);
    // the exact localized failure the card must paint (i18n law: the stall
    // message arrives translated, wrapped in the existing export.failed)
    const wantStall = await chrome.eval(`__i18n.t('export.failed',
      { message: __i18n.t('export.encoderStalled', { s: 15 }) })`);
    const stallCanvas0 = await chrome.eval(
      'JSON.stringify([document.querySelector("canvas").width, document.querySelector("canvas").height])');
    const runStallLeg = async (tag, feedCeiling) => {
      const t0 = Date.now();
      await chrome.eval(`window.__stallRun = __export.start('standard',
        { width: 640, height: 360, noDownload: true })
        .then((r) => ({ ok: r !== null }), (e) => ({ err: String(e?.message ?? e) }));
        undefined`);
      let state = null;
      while (Date.now() - t0 < 40_000) {
        state = await chrome.eval('__export.state()');
        if (state === 'error' || state === 'done' || state === 'cancelled') break;
        await sleep(500);
      }
      const elapsed = (Date.now() - t0) / 1000;
      if (state !== 'error') {
        fail(`[#258 ${tag}] state '${state}' ${elapsed.toFixed(0)} s after start `
          + `— watchdog never fired (the pre-#258 wedge/truncation)`);
        await chrome.eval('__export.cancel()'); // un-wedge for the next leg
        await sleep(1000);
        return;
      }
      // N respected, and honest within its bound: the 15 s output-silence
      // clock plus the short feed must land in [14, 32] s
      if (elapsed < 14 || elapsed > 32) {
        fail(`[#258 ${tag}] watchdog fired at ${elapsed.toFixed(1)} s — `
          + 'outside the [14, 32] s bound for N = 15 s');
      }
      const run = await chrome.eval('window.__stallRun');
      if (!run?.err) fail(`[#258 ${tag}] start() resolved ${JSON.stringify(run)}, want a throw`);
      const ptext = await chrome.eval(
        'document.getElementById("ob-x-ptext")?.textContent ?? ""');
      if (ptext !== wantStall) {
        fail(`[#258 ${tag}] card paints "${ptext}", want the localized `
          + `"${wantStall}"`);
      }
      if ((await chrome.eval('__export.lastResult()')) !== null) {
        fail(`[#258 ${tag}] stalled export left a lastResult (partial file)`);
      }
      const c1 = await chrome.eval(
        'JSON.stringify([document.querySelector("canvas").width, document.querySelector("canvas").height])');
      if (c1 !== stallCanvas0) {
        fail(`[#258 ${tag}] canvas not restored: ${stallCanvas0} → ${c1}`);
      }
      const st = await chrome.eval('JSON.stringify(window.__stall)');
      const S = JSON.parse(st);
      if (S.encodes > feedCeiling) {
        fail(`[#258 ${tag}] ${S.encodes} frames fed into a silent encoder `
          + `(ceiling ${feedCeiling}) — the in-flight bound leaked`);
      }
      if (!process.exitCode) {
        console.log(`[#258 ${tag}] OK — honest localized abort at `
          + `${elapsed.toFixed(1)} s, ${S.encodes} frames fed (≤ ${feedCeiling}), `
          + 'no file, canvas restored');
      }
    };
    // pinned: queue > 4 for ever — fed stops at ~8 muxed + queue window
    await runStallLeg('stall-pinned', 25);
    // drain: queue ~0 — ONLY the fed−muxed ceiling stops the feed: 8 muxed
    // + the soft cap (30 at this size), quiet-widened stepwise to the hard
    // ceiling (60 — the review-r2 lookahead escape) + slack, all well under
    // the clip. Pre-#258 this leg red-proves the memory balloon
    // (encodes == total, every frame cloned into a dead encoder).
    await chrome.eval(`Object.assign(window.__stall, { mode: 'drain',
      encodes: 0, outputs: 0, fakeQueue: 0, peak: 0 }); undefined`);
    await runStallLeg('stall-drain', 80);
    // recovery + real-render memory bound: with the stub pass-through
    // (limit ∞) the SAME session must export cleanly after two watchdog
    // aborts, and the peak fed−delivered in-flight window during a real
    // render stays under queue(4) + INFLIGHT_MAX(30) + 1
    await chrome.eval(`Object.assign(window.__stall, { mode: 'pinned',
      limit: Infinity, encodes: 0, outputs: 0, fakeQueue: 0, peak: 0 }); undefined`);
    const recov = await chrome.eval(`__export.start('standard',
      { width: 640, height: 360, noDownload: true })
      .then((r) => ({ frames: r?.frames ?? null }), (e) => ({ err: String(e?.message ?? e) }))`);
    if (!(recov?.frames > 0)) {
      fail('[#258 recovery] post-stall export failed: ' + JSON.stringify(recov));
    }
    const peak = await chrome.eval('window.__stall.peak');
    const encodes = await chrome.eval('window.__stall.encodes');
    if (!(peak > 0) || peak > 35) {
      fail(`[#258 memory] real-render peak in-flight ${peak} outside (0, 35] `
        + `— encoder-retained frames unbounded (fed ${encodes})`);
    }
    if (!process.exitCode) {
      console.log(`[#258 recovery+memory] OK — ${recov.frames}-frame export `
        + `succeeded after two stall aborts; peak in-flight ${peak} ≤ 35 `
        + `across ${encodes} fed frames`);
    }
    // truncation wall (review r1 P1): the encoder swallows only its LAST 10
    // frames — fed−muxed never exceeds the in-flight ceiling, the k-loop
    // completes, flush() resolves, and pre-wall code shipped the SHORT file
    // as 'done'. The videoChunks==totalFrames wall must refuse it with the
    // localized truncation paint and leave lastResult untouched.
    if (recov?.frames > 20) {
      const wantShort = recov.frames - 10;
      await chrome.eval(`Object.assign(window.__stall, { mode: 'drain',
        limit: ${wantShort}, encodes: 0, outputs: 0, fakeQueue: 0, peak: 0 });
        undefined`);
      // GH-997: the wall still refuses the short file; the dialog now
      // surfaces the refusal as the salvage OFFER (the file exists — Save
      // anyway is the user's call), never as success. The ten tail frames
      // are re-encoded twice each before they are held, so the refusal
      // lands later than the pre-997 immediate wall (the window widens).
      const wantTrunc = await chrome.eval(`__i18n.t('export.salvage.prompt',
        { lost: 10, want: ${recov.frames} })`);
      const t0 = Date.now();
      await chrome.eval(`window.__truncRun = __export.start('standard',
        { width: 640, height: 360, noDownload: true })
        .then((r) => ({ ok: r !== null }), (e) => ({ err: String(e?.message ?? e) }));
        undefined`);
      let state = null;
      while (Date.now() - t0 < 180_000) {
        state = await chrome.eval('__export.state()');
        if (state === 'error' || state === 'done' || state === 'cancelled'
          || state === 'salvage') break;
        await sleep(500);
      }
      const elapsed = (Date.now() - t0) / 1000;
      if (state !== 'salvage') {
        fail(`[#258 truncated] state '${state}' after ${elapsed.toFixed(1)} s — `
          + 'a tail-swallowing encoder shipped a truncated file as success');
        await chrome.eval('__export.cancel()');
        await sleep(1000);
      } else {
        const ptext = await chrome.eval(
          'document.getElementById("ob-x-ptext")?.textContent ?? ""');
        if (ptext !== wantTrunc) {
          fail(`[#258 truncated] card paints "${ptext}", want "${wantTrunc}"`);
        }
        if ((await chrome.eval('__export.lastResult()'))?.frames !== recov.frames) {
          fail('[#258 truncated] refused run overwrote lastResult');
        }
        if (!process.exitCode) {
          console.log(`[#258 truncated] OK — tail-swallowed render refused at `
            + `${elapsed.toFixed(1)} s with the localized salvage paint `
            + `(${wantShort}/${recov.frames} muxed), lastResult intact`);
        }
      }
    } else {
      fail('[#258 truncated] no healthy recovery render to derive the leg from');
    }
    await chrome.eval('__export.close()');
    await chrome.send('Page.removeScriptToEvaluateOnNewDocument',
      { identifier: stallMock });
  }

  // ==== GH-256: scripted-boot container pin (?exportformat=) =================
  // The iOS sim acceptance harness taps the REAL Export CTA, so its container
  // choice rides the app's own negotiation: the boot-query pin RE-RANKS
  // formatFor()'s ruled chain and must NEVER fabricate support (the sim's
  // VideoToolbox mp4 probe lies — GH-258). Three arms:
  //   re-rank      — pin=webm + mp4 genuinely green ⇒ webm wins every tier
  //                  whose OWN webm probe passed (4K honors webmUhd);
  //   no-fabricate — pin=webm + vp9 probes forced false ⇒ the unpinned
  //                  chain rules (mp4), never a fabricated webm;
  //   honest null  — pin=webm + ALL video probes false ⇒ offline tiers null.
  {
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?seed=1&exportformat=webm` });
    // review r1 P2: let the navigation COMMIT before waitReady() — polled too
    // early it can observe the OLD document's already-true __test.ready (or
    // throw as that context dies) and the arms would assert against the
    // unpinned page. sleep-then-wait is the file's navigation idiom; the
    // location guard proves the pinned document is the one under test.
    await sleep(500);
    await waitReady();
    await sleep(800);
    if (!(await chrome.eval('location.search.includes("exportformat=webm")'))) {
      fail('[#256 format-pin] pinned navigation never committed — assertions '
        + 'would run against the unpinned document');
    }
    const s = await chrome.eval('__export.open().then(() => __export.support())');
    await sleep(200);
    if (!(s?.mp4 === true && s?.webm === true)) {
      fail('[#256 format-pin] re-rank arm needs mp4 AND webm probed green on '
        + 'this Chrome: ' + JSON.stringify(s));
    }
    const tiers = await chrome.eval('__export.tiers()');
    const want4k = s.webmUhd ? 'webm' : s.uhd ? 'mp4' : null;
    if (tiers.standard !== 'webm' || tiers.high !== 'webm') {
      fail('[#256 format-pin] pin set + mp4 genuinely supported: webm must '
        + 'win the 1080p tiers, got ' + JSON.stringify(tiers));
    }
    if (tiers.ultra4k !== want4k || tiers.cinema4k !== want4k) {
      fail(`[#256 format-pin] 4K tiers [${tiers.ultra4k}, ${tiers.cinema4k}], `
        + `want ${want4k} (pin must honor the dedicated 4K probes)`);
    }
    await chrome.eval('__export.close()');
    // no-fabricate arm: vp9 probes forced false, avc/aac left real
    const { identifier: noVp9Mock } = await chrome.send(
      'Page.addScriptToEvaluateOnNewDocument', { source: `
      const vProbe = VideoEncoder.isConfigSupported.bind(VideoEncoder);
      VideoEncoder.isConfigSupported = (cfg) => /^vp/.test(cfg?.codec ?? '')
        ? Promise.resolve({ supported: false }) : vProbe(cfg);` });
    await chrome.send('Page.reload');
    await waitReady();
    await sleep(800);
    const s2 = await chrome.eval('__export.open().then(() => __export.support())');
    await sleep(200);
    if (!(s2?.mp4 === true && s2?.webm === false)) {
      fail('[#256 format-pin] vp9-off mock did not take: ' + JSON.stringify(s2));
    }
    const tiers2 = await chrome.eval('__export.tiers()');
    if (tiers2.standard !== 'mp4' || tiers2.high !== 'mp4') {
      fail('[#256 format-pin] pin=webm with webm UNSUPPORTED must fall to the '
        + 'unpinned chain (mp4), got ' + JSON.stringify(tiers2));
    }
    await chrome.eval('__export.close()');
    await chrome.send('Page.removeScriptToEvaluateOnNewDocument',
      { identifier: noVp9Mock });
    // honest-null arm: every video probe false — the pin must not resurrect
    const { identifier: noVideoMock } = await chrome.send(
      'Page.addScriptToEvaluateOnNewDocument', { source: `
      VideoEncoder.isConfigSupported =
        () => Promise.resolve({ supported: false });` });
    await chrome.send('Page.reload');
    await waitReady();
    await sleep(800);
    await chrome.eval('__export.open()');
    await sleep(200);
    const tiers3 = await chrome.eval('__export.tiers()');
    if (tiers3.standard !== null || tiers3.high !== null
      || tiers3.ultra4k !== null || tiers3.cinema4k !== null) {
      fail('[#256 format-pin] all probes false: the pin fabricated a tier — '
        + JSON.stringify(tiers3));
    }
    await chrome.eval('__export.close()');
    await chrome.send('Page.removeScriptToEvaluateOnNewDocument',
      { identifier: noVideoMock });
    if (!process.exitCode) {
      console.log('[#256 format-pin] OK — pin re-ranks (webm wins with mp4 '
        + `green, 4K ${want4k}), never fabricates (vp9-off → mp4; all-off → `
        + 'null tiers)');
    }
  }

  // ==== GH-362 layer 3: crash-grade resume (CR1-CR4) ==========================
  // The REAL card journey (full mode, Files starter tile) over an in-page
  // v3 shell twin whose "disk" is sessionStorage — it survives the
  // same-URL navigation the mock fires mid-transfer WITHOUT answering the
  // in-flight op (WebContent death, headless analogue). The mock mirrors
  // the ShellCore laws the unit suite pins: positioned writes, the sidecar
  // manifest on plan-carrying chunks (updated AFTER the write), the launch
  // sweep's __obResume hint, the resume op's truncate-to-extent +
  // prefix-hash reply, begin-supersede and abort-discard.
  {
    const CR_URL = `http://127.0.0.1:${PORT}/app.html?seed=1&archive=1`
      + '&exportresume=1&u=cr362';
    const CR_SHELL = String.raw`(() => {
      if (window.__crShell) return;
      try {
        sessionStorage.setItem('cr-boots',
          String(1 + Number(sessionStorage.getItem('cr-boots') ?? '0')));
      } catch { /* storage gone — the arm will fail loudly */ }
      const b64e = (u8) => {
        let s = '';
        for (let i = 0; i < u8.length; i += 0x8000) {
          s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        }
        return btoa(s);
      };
      const b64d = (b) => {
        const bin = atob(b);
        const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return u;
      };
      const fnv = (h0, u8) => {
        let h = h0;
        for (let i = 0; i < u8.length; i++) {
          h ^= u8[i];
          h = Math.imul(h, 0x01000193);
        }
        return h;
      };
      const hex = (h) => (h >>> 0).toString(16).padStart(8, '0');
      const loadS = () => {
        try { return JSON.parse(sessionStorage.getItem('cr-shell') ?? 'null'); }
        catch { return null; }
      };
      const cr = { ops: [], live: null, chunkOps: 0, dead: false };
      window.__crShell = cr;
      const S0 = loadS();
      if (S0?.manifest) {
        // the launch "sweep": a stored manifest names the candidate; file
        // size is re-judged at the RESUME op (the shell validates there
        // too — CR4 exercises exactly that seam)
        window.__obResume = { v: 1, name: S0.manifest.name,
          mime: S0.manifest.mime, dest: S0.manifest.dest,
          extent: S0.manifest.extent, chunks: S0.manifest.chunks,
          planHash: S0.manifest.plan, frame: S0.manifest.frame };
      }
      const persist = (fileU8, manifest) => {
        sessionStorage.setItem('cr-shell',
          JSON.stringify({ fileB64: b64e(fileU8), manifest }));
      };
      const die = () => {
        cr.dead = true; // this document never answers another op
        setTimeout(() => { location.href = location.href; }, 30);
        return new Promise(() => {});
      };
      const reply = (v) => new Promise((res) => { setTimeout(() => res(v), 2); });
      const refuse = (tok) => new Promise((_, rej) => {
        setTimeout(() => rej(new Error(tok)), 2);
      });
      window.webkit = window.webkit ?? {};
      window.webkit.messageHandlers = Object.assign(
        {}, window.webkit.messageHandlers, {
          obSaveVideoStream: { postMessage: (m) => {
            cr.ops.push({ op: m.op, name: m.name, seq: m.seq, at: m.at,
              plan: m.plan ?? null, frame: m.frame ?? null,
              chunks: m.chunks, bytes: m.bytes, dest: m.dest, mime: m.mime,
              len: m.b64 ? atob(m.b64).length : 0 });
            if (cr.dead) return new Promise(() => {});
            if (m.op === 'begin') {
              if (cr.live) return refuse('busy');
              sessionStorage.removeItem('cr-shell'); // begin supersedes
              delete window.__obResume;
              cr.live = { name: m.name, mime: m.mime, dest: m.dest,
                file: new Uint8Array(0), total: 0, seq: 0, manifest: null };
              return reply({ ok: true });
            }
            if (m.op === 'resume') {
              if (cr.live) return refuse('busy');
              const D = loadS();
              if (!D?.manifest || D.manifest.name !== m.name) {
                return refuse('no-stream');
              }
              const file = b64d(D.fileB64);
              if (file.length < D.manifest.extent) {
                // unreopenable debt: refused AND swept (the shell law)
                sessionStorage.removeItem('cr-shell');
                return refuse('no-stream');
              }
              cr.live = { name: m.name, mime: D.manifest.mime,
                dest: D.manifest.dest,
                file: file.slice(0, D.manifest.extent), // truncate law
                total: D.manifest.extent, seq: 0, manifest: D.manifest,
                resumed: true };
              return reply({ ok: true, extent: D.manifest.extent,
                hash: hex(fnv(0x811c9dc5, cr.live.file)) });
            }
            if (m.op === 'abort') {
              if (cr.live?.name === m.name) {
                // the live stream's dir is deleted with it (discardStream)
                // — a RESUMED live stream's preserved state goes too
                cr.live = null;
                sessionStorage.removeItem('cr-shell');
                delete window.__obResume;
              } else if (loadS()?.manifest?.name === m.name) {
                sessionStorage.removeItem('cr-shell');
                delete window.__obResume;
              }
              return reply({ ok: true });
            }
            const L = cr.live;
            if (!L || L.name !== m.name) return refuse('no-stream');
            if (m.op === 'chunk') {
              if (m.seq !== L.seq) return refuse('malformed');
              const data = b64d(m.b64);
              // GH-997 L9: the v2 clip transfer (positionless appends — the
              // card's Files tile) rides the same twin
              const at = m.v === 2 ? L.total : m.at;
              if (at > L.total) return refuse('malformed'); // no holes
              const end = at + data.length;
              if (end > L.file.length) {
                const g = new Uint8Array(end);
                g.set(L.file);
                L.file = g;
              }
              L.file.set(data, at);
              L.total = Math.max(L.total, end);
              L.seq += 1;
              cr.chunkOps += 1;
              const killAt = Number(sessionStorage.getItem('cr-kill') ?? '-1');
              const killMode = sessionStorage.getItem('cr-kill-mode')
                ?? 'boundary';
              if (killAt >= 0 && cr.chunkOps >= killAt) {
                sessionStorage.removeItem('cr-kill');
                if (m.plan && killMode !== 'midchunk') {
                  L.manifest = { name: L.name, mime: L.mime, dest: L.dest,
                    extent: L.total, chunks: L.seq, plan: m.plan,
                    frame: m.frame };
                }
                // midchunk: the disk carries this chunk, the manifest still
                // names the PREVIOUS extent (killed between write and
                // sidecar update — the truncate-to-extent class)
                persist(L.file.subarray(0, L.total), L.manifest);
                return die();
              }
              if (m.plan) {
                L.manifest = { name: L.name, mime: L.mime, dest: L.dest,
                  extent: L.total, chunks: L.seq, plan: m.plan,
                  frame: m.frame };
                persist(L.file.subarray(0, L.total), L.manifest);
              }
              return reply({ ok: true });
            }
            if (m.op === 'end') {
              if (m.chunks !== L.seq || (m.v !== 2 && m.bytes !== L.total)) {
                cr.live = null;
                return refuse('malformed');
              }
              // delivered artifact: PAGE-GLOBAL, not sessionStorage (train
              // battery fix): a lead-bearing full plan's delivered file
              // (~2.6 MB -> ~3.5M b64 chars) lands on top of the persisted
              // partial and blows the ~5M-char sessionStorage quota — the
              // QuotaExceededError thrown INSIDE this reply read as a
              // save-failed refusal (proven by probe). Every assertion
              // reads the delivery on the delivering document (no crash
              // navigation between end and the read), so window state is
              // the honest vehicle; cr-boots/cr-shell stay in
              // sessionStorage — they alone must cross the navigations.
              cr.delivered = b64e(L.file.subarray(0, L.total));
              sessionStorage.removeItem('cr-shell'); // finish drops debt
              const detail = { ok: true, name: L.name, dest: L.dest };
              cr.live = null;
              setTimeout(() => window.dispatchEvent(new CustomEvent(
                'ob:save-video-result', { detail })), 60);
              return reply({ ok: true });
            }
            return refuse('malformed');
          } },
        });
      window.__obSaveVideo = { v: 1, chunk: 786432, full: 4294967296,
        dests: ['photos', 'files'] };
    })();`;
    const { identifier: crMock } = await chrome.send(
      'Page.addScriptToEvaluateOnNewDocument', { source: CR_SHELL });
    const crGoto = async (url) => {
      await chrome.send('Page.navigate', { url });
      await sleep(500);
      await waitReady();
      await sleep(800);
    };
    const crWait = async (expr, what, tries = 100, ms = 200) => {
      for (let i = 0; i < tries; i++) {
        if (await chrome.eval(expr).catch(() => false)) return true;
        await sleep(ms);
      }
      fail(`${what} never came true (${expr})`);
      return false;
    };
    const crFire = async (tag, shot) => {
      const err = await chrome.eval(`__test.shoot(${JSON.stringify(shot)})`);
      if (err) fail(`${tag}: shot rejected: ${err}`);
      let state = 'PLAYBACK';
      for (let i = 0; i < 200 && (state === 'PLAYBACK' || state === 'SIMULATING'); i++) {
        await sleep(300);
        state = await chrome.eval('__test.state()');
      }
      if (state === 'PLAYBACK') fail(`${tag}: shot never settled`);
    };
    /** Wait out a mock-fired crash navigation: boots increments at the new
     * document's documentStart, then the app re-boots. Generous window —
     * the kill point sits behind a real (trimmed) render. */
    const crAwaitCrash = async (bootsBefore, tag) => {
      await crWait(`Number(sessionStorage.getItem('cr-boots')) > ${bootsBefore}`,
        `${tag}: the crash navigation`, 900, 300);
      await waitReady();
      await sleep(800);
    };
    const crBoots = () => chrome.eval(
      `Number(sessionStorage.getItem('cr-boots') ?? '0')`);
    /** Drive the REAL journey to a running full export: open the archived
     * session, trim it small (wall-clock bound), switch the card to full
     * mode, tap the Files starter tile. */
    const crStartFull = async (tag) => {
      const sid = (await chrome.eval('window.__archive.flush()'
        + '.then(() => window.__archive.sessions())'))[0]?.id;
      if (!Number.isFinite(sid)) { fail(`${tag}: no archived session`); return; }
      if (await chrome.eval(`window.__playback.openSession(${sid})`) !== true) {
        fail(`${tag}: session open refused`);
        return;
      }
      await crWait('window.__playback.playerOpen() === true', `${tag}: player`);
      // GH-363 x GH-362L3 composition (train fix): the DVR timeline is
      // lead-inclusive — segment 0's PLAY span starts AFTER its practice-
      // stroke lead (pb.cum[0] == pb.leads[0]), so the pre-363 literal
      // (0, 1.2) selected a lead-only window, planned NOTHING
      // (includedSegments honestly empty: a lead is prologue to a strike,
      // not content on its own) and the full-mode starter tiles never
      // armed. Trim to lead + 1.2 s of play: the same wall-clock-bound
      // intent, now WITH the lead the full tier renders 1:1 — the
      // restarted plan carries opts.leads through the crash journey too.
      // (The lead-only-trim silent disarm was filed as GH-433 at the train
      // landing and is FIXED by the ASSOCIATE rule — LEAD4 below is its
      // journey arm; this trim keeps CR1's own intent: a wall-clock-bound
      // window that contains real play content.)
      const lead0 = await chrome.eval(
        'window.__playback.leads()?.leads?.[0] ?? 0');
      await chrome.eval(
        `window.__playback.setTrim(0, ${(lead0 + 1.2).toFixed(4)})`);
      await chrome.eval('window.__playback.save()');
      await crWait('window.__playback.cardOpen() === true', `${tag}: card`);
      await crWait(`window.__playback.setExportMode('full') === true`,
        `${tag}: full mode switch`, 60, 300);
      // the starter tile must be ARMED before the click (renderDests runs
      // async of the mode switch)
      await crWait(`(() => {
        const b = document.querySelector('.ob-pb-dest[data-dest=files]');
        return !!b && !b.disabled;
      })()`, `${tag}: files starter tile armed`, 60, 200);
      await chrome.eval(
        'document.querySelector(".ob-pb-dest[data-dest=files]").click()');
      // proof the attempt started before anyone waits on the crash
      await crWait(`window.__crShell.ops.some((o) => o.op === 'begin')`,
        `${tag}: begin crossed the wire`, 100, 200);
    };
    const crAssemble = (b64) => Buffer.from(b64, 'base64');
    const crProbe = (file, args) => execFileSync('ffprobe',
      ['-v', 'error', ...args, file]).toString().trim();

    // ---- CR1: with-sound JOURNEY — crash → offer → FAST-FORWARD finish -----
    // The card's full plan always muxes sound. Pre-435 this class took
    // the restart flow (the plain OfflineAudioContext bed measured
    // non-reproducible — ±ulp float-summing jitter); the GH-435
    // windowed-EXACT bed restores byte-reproducibility, so Continue now
    // takes the SAME fast-forward the sound-off class proved: the resume
    // op, the byte-drop below the preserved extent, the boundary hash
    // verifying the regenerated prefix before one tail byte posts.
    // Equivalence law for the journey shape: the delivered file is
    // EXACTLY the persisted plan — plannedFullFrames frame count, exact
    // duration, both tracks decode, the plan-pinned container stamp —
    // and the wire posted strictly fewer bytes than the whole file (the
    // byte-drop is real). RED pre-435: the wire showed begin,...,end
    // with zero resume ops (the restart law this arm used to gate).
    {
      const cc1 = failCount;
      await crGoto(CR_URL);
      await crFire('[CR1 shot A]', { v0: 1.6, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
      await crFire('[CR1 shot B]', { v0: 0.9, phi: 0.4, theta: 0, a: 0, b: 0 });
      const boots1 = await crBoots();
      await chrome.eval(`sessionStorage.setItem('cr-kill', '2');`
        + `sessionStorage.setItem('cr-kill-mode', 'boundary')`);
      await crStartFull('[CR1]');
      await crAwaitCrash(boots1, '[CR1]');
      // the relaunch: hint + persisted plan matched → the banner offers
      await crWait(`window.__playback?.resumeState?.() === 'offer'`,
        '[CR1] resume offer', 150, 200);
      const offer1 = await chrome.eval(`(() => {
        const el = document.getElementById('ob-resume-banner');
        const off = window.__playback.resumeOffer();
        return { there: !!el,
          notice: el?.querySelector('.ob-pb-resume-text')?.textContent ?? '',
          goLabel: el?.querySelector('.ob-pb-resume-go')?.textContent,
          discardLabel: el?.querySelector('.ob-pb-resume-discard')?.textContent,
          wantGo: window.__i18n.t('export.resume.continue'),
          wantDiscard: window.__i18n.t('export.resume.discard'),
          wantNotice: window.__i18n.t('export.resume.notice', {
            pct: off.frames > 0 ? Math.max(0, Math.min(99,
              Math.round(100 * off.frame / off.frames))) : 0 }),
          extent: off.extent, frames: off.frames };
      })()`);
      if (!offer1.there || offer1.notice !== offer1.wantNotice
        || offer1.goLabel !== offer1.wantGo
        || offer1.discardLabel !== offer1.wantDiscard
        || !(offer1.extent > 0) || !(offer1.frames > 0)) {
        fail('[CR1] banner offer wrong: ' + JSON.stringify(offer1));
      }
      // the plan-pinned container stamp (review r8/r9 P2): captured once at
      // the ORIGINAL begin, must survive into the delivered mp4's metadata
      const planCreated = await chrome.eval(`(async () => {
        const p = await (await import('/app/export-resume.js')).loadPlan();
        return p ? (JSON.parse(p.json).opts.creationTime ?? null) : null;
      })()`);
      if (!(planCreated > 0)) {
        fail(`[CR1] persisted plan carries no creationTime (${planCreated})`);
      }
      // Continue → the GH-435 with-sound FAST-FORWARD: the resume op
      // (whose reply carries the preserved extent + prefix hash), then
      // tail chunks only — never a fresh begin
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-go').click()`);
      await crWait(`window.__playback.resumeState() === 'saved'`,
        '[CR1] fast-forward export delivered', 600, 500);
      const wire1 = await chrome.eval(`(() => {
        const ops = window.__crShell.ops;
        const chunks = ops.filter((o) => o.op === 'chunk');
        const E = ${offer1.extent};
        return { seq: ops.map((o) => o.op).join(','),
          begins: ops.filter((o) => o.op === 'begin').length,
          // the byte-drop law splits the posted chunks in two: APPENDS at
          // or past the preserved extent (the tail; in arrival order), and
          // positioned PREFIX REWRITES — the finalize backpatch class (the
          // mdat size patch: the original run never finalized, so the disk
          // holds a placeholder there). The journey's kill lands the
          // boundary piece-ALIGNED with a small media tail, so the tail
          // rides the FINALIZE drain — whose chunked-target flush emits
          // the chunk-0 backpatch region (position ~28) BEFORE the tail
          // chunk. Arrival order across the two classes is therefore the
          // muxer's business, not the law's; what the law demands is that
          // no prefix APPEND posts (appends[0] lands AT the extent) and
          // that prefix rewrites stay in the tiny backpatch class.
          appends: chunks.filter((o) => o.at >= E)
            .map((o) => ({ at: o.at, len: o.len })),
          patches: chunks.filter((o) => o.at < E)
            .map((o) => ({ at: o.at, len: o.len })),
          postedBytes: chunks.reduce((n, o) => n + o.len, 0),
          plans: chunks.every((o) => typeof o.plan === 'string' && o.frame >= 0),
          end: ops.find((o) => o.op === 'end') ?? null,
          shellDebt: sessionStorage.getItem('cr-shell') };
      })()`);
      if (!/^resume(,chunk)+,end$/.test(wire1.seq) || wire1.begins !== 0) {
        fail(`[CR1] with-sound Continue must fast-forward (GH-435: `
          + `resume,chunk...,end; no begin op), got "${wire1.seq}"`);
      }
      if (!wire1.appends.length || wire1.appends[0].at !== offer1.extent) {
        fail(`[CR1] first resumed APPEND at ${wire1.appends[0]?.at}, want `
          + `the preserved extent ${offer1.extent} (the byte-drop law)`);
      }
      const patchBytes1 = wire1.patches.reduce((n, c) => n + c.len, 0);
      if (!wire1.patches.every((c) => c.at + c.len <= offer1.extent)
        || patchBytes1 > 4096) {
        fail(`[CR1] prefix rewrites outside the finalize-backpatch class: `
          + `${JSON.stringify(wire1.patches)} (${patchBytes1} B) — an `
          + 'append below the extent would mean the byte-drop leaked');
      }
      if (!(wire1.end?.bytes > offer1.extent)
        || !(wire1.postedBytes < wire1.end?.bytes)) {
        fail(`[CR1] posted ${wire1.postedBytes} B of a ${wire1.end?.bytes} B `
          + 'file — the fast-forward dropped nothing');
      }
      if (!wire1.plans) {
        fail('[CR1] resumed chunks dropped the plan/frame fields — a '
          + 'SECOND crash would lose its checkpoint');
      }
      if (wire1.shellDebt !== null) {
        fail('[CR1] the delivered transfer left shell debt behind');
      }
      const dlv1 = crAssemble(String(await chrome.eval(
        `(window.__crShell.delivered ?? null)`)));
      const f1 = path.join(OUTDIR, 'cr1-ffresumed.mp4');
      fs.writeFileSync(f1, dlv1);
      const fv1 = crProbe(f1, ['-select_streams', 'v:0', '-show_entries',
        'stream=codec_name', '-of', 'csv=p=0']);
      const fa1 = crProbe(f1, ['-select_streams', 'a:0', '-show_entries',
        'stream=codec_name', '-of', 'csv=p=0']);
      const frames1 = Number(crProbe(f1, ['-count_frames', '-select_streams',
        'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0']));
      const dur1 = Number(crProbe(f1, ['-select_streams', 'v:0',
        '-show_entries', 'stream=duration', '-of', 'csv=p=0']));
      if (fv1 !== 'h264' || fa1 !== 'aac' || frames1 !== offer1.frames
        || !(Math.abs(dur1 - frames1 / 60) < 0.05)) {
        fail(`[CR1] delivered file ${fv1}+${fa1}, ${frames1} frames @ `
          + `${dur1}s — want h264+aac, EXACTLY the persisted plan's `
          + `${offer1.frames} frames (the complete-render law)`);
      }
      const stamp1 = crProbe(f1, ['-show_entries',
        'format_tags=creation_time', '-of', 'csv=p=0']);
      const stampSec1 = Math.floor(Date.parse(stamp1) / 1000);
      if (stampSec1 !== planCreated) {
        fail(`[CR1] container creation stamp ${stamp1} (${stampSec1}) != `
          + `the plan's begin time ${planCreated} — metadata consumers `
          + 'would see the wrong (or epoch-0) date');
      }
      if (failCount === cc1) {
        console.log(`[CR1] OK — with-sound journey: crash at ${offer1.extent} `
          + 'B, localized offer, Continue FAST-FORWARDED (GH-435: '
          + `resume,chunk...,end, first append AT the extent, `
          + `${wire1.postedBytes}/${wire1.end.bytes} B posted, plan/frame `
          + `riding) and delivered a clean ${frames1}-frame h264+aac file `
          + 'matching the persisted plan');
      }
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-discard')?.click()`);
      await sleep(200);
    }

    // ---- CR2: sound-off SEAM — the fast-forward byte-identity law ----------
    // The deterministic class end to end through the REAL resume machinery:
    // a sound-off streamed render (software-pinned video — measured
    // bit-reproducible) is the control AND fabricates the crash state (its
    // prefix on the mock disk + the manifest + the persisted plan); the
    // REAL banner Continue then resume-ops, fast-forwards (drop below the
    // extent, hash the regenerated prefix, verify at the boundary) and
    // streams the tail — the delivered file must be BYTE-IDENTICAL to the
    // control render.
    let crFFPlanJson = null; // CR3/CR4 refabricate from this
    let crFFControlB64 = null;
    {
      const cc2 = failCount;
      // the seam render needs a live record on this fresh boot (renderDrill
      // precondition); the settle also lands a session CR2 can read
      await crFire('[CR2 seed shot]', { v0: 1.1, phi: 1.2, theta: 0, a: 0, b: 0 });
      const fab = await chrome.eval(`(async () => {
        const leaf = await import('/app/export-resume.js');
        const sid = (await window.__archive.sessions())[0]?.id;
        const records = (await window.__archive.records(sid)).slice(0, 2);
        if (!records.length) return { err: 'no archived records' };
        const kv = String((await import('/dist/pool-wasm/pool_wasm.js'))
          .kernel_version());
        const payload = { v: 1, name: 'cr-ff-clip.mp4', mime: 'video/mp4',
          dest: 'files', kernel: kv, ua: navigator.userAgent, game: null,
          frames: 0,
          records,
          opts: { width: 320, height: 180, noDownload: true,
            withAudio: false, creationTime: 1754500000, // plan-pinned stamp
            trims: records.map(() => ({ startT: 0, endT: 1.2 })) } };
        const json = JSON.stringify(payload);
        const hash = leaf.planHashOf(json);
        // the control render (also the disk-prefix source)
        window.__crCtl = [];
        const r = await __export.renderDrill(payload.records,
          Object.assign({}, payload.opts, { stream: { post: async (d, at) => {
            let s = '';
            for (let i = 0; i < d.length; i += 0x8000) {
              s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
            }
            window.__crCtl.push({ at, b64: btoa(s) });
          } } }));
        payload.frames = r.frames;
        const json2 = JSON.stringify(payload);
        const hash2 = leaf.planHashOf(json2);
        await leaf.persistPlan(json2, hash2);
        return { json: json2, hash: hash2, frames: r.frames,
          streamed: r.streamedBytes };
      })()`);
      if (!fab || fab.err || !(fab.streamed > 0)) {
        fail('[CR2] fabrication render failed: ' + JSON.stringify(fab));
      }
      crFFPlanJson = fab;
      const pieces2 = await chrome.eval('window.__crCtl');
      await chrome.eval('window.__crCtl = null');
      let ext2 = 0;
      for (const p of pieces2) {
        ext2 = Math.max(ext2, p.at + crAssemble(p.b64).length);
      }
      const ctl2 = Buffer.alloc(ext2);
      for (const p of pieces2) crAssemble(p.b64).copy(ctl2, p.at);
      crFFControlB64 = ctl2.toString('base64');
      // A/A determinism sanity — the fast path's very foundation: render
      // the same plan once more and require BYTE-IDENTICAL output (the
      // sound-off class with the software-pinned encoder)
      const aa = await chrome.eval(`(async () => {
        const plan = JSON.parse(${JSON.stringify('__jsonhole__')});
        window.__crCtl = [];
        const r = await __export.renderDrill(plan.records,
          Object.assign({}, plan.opts, { stream: { post: async (d, at) => {
            let s = '';
            for (let i = 0; i < d.length; i += 0x8000) {
              s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
            }
            window.__crCtl.push({ at, b64: btoa(s) });
          } } }));
        return { streamed: r.streamedBytes };
      })()`.replace('"__jsonhole__"', JSON.stringify(fab.json)));
      const piecesAA = await chrome.eval('window.__crCtl');
      await chrome.eval('window.__crCtl = null');
      // sized by the second render's OWN pieces (review GH-435 r2 P2 — a
      // control-extent buffer silently truncates a longer second render)
      let extAA = 0;
      for (const p of piecesAA) {
        extAA = Math.max(extAA, p.at + crAssemble(p.b64).length);
      }
      const aaBuf = Buffer.alloc(extAA);
      for (const p of piecesAA) crAssemble(p.b64).copy(aaBuf, p.at);
      if (extAA !== ext2 || !aaBuf.equals(ctl2)) {
        fail(`[CR2] A/A sound-off streamed renders are NOT byte-identical `
          + `(${extAA} vs ${ext2} B) — the deterministic class broke and `
          + 'the fast-forward law has no foundation');
      }
      // fabricate the crash state: prefix at ~60% (piece-agnostic, so the
      // boundary usually lands MID-piece — the straddle law) + manifest
      const E0 = Math.max(1, Math.floor(ext2 * 0.6));
      const prefixB64 = ctl2.subarray(0, E0).toString('base64');
      await chrome.eval(`(() => {
        sessionStorage.setItem('cr-shell', JSON.stringify({
          fileB64: ${JSON.stringify('__p__')},
          manifest: { name: 'cr-ff-clip.mp4', mime: 'video/mp4',
            dest: 'files', extent: ${E0}, chunks: 3,
            plan: '${fab.hash}', frame: 42 } }));
        window.__obResume = { v: 1, name: 'cr-ff-clip.mp4',
          mime: 'video/mp4', dest: 'files', extent: ${E0}, chunks: 3,
          planHash: '${fab.hash}', frame: 42 };
        window.__crShell.ops.length = 0;
        delete window.__crShell.delivered; // CR1's artifact
      })()`.replace('"__p__"', JSON.stringify(prefixB64)));
      await chrome.eval('window.__playback.resumeCheck()');
      await crWait(`window.__playback?.resumeState?.() === 'offer'`,
        '[CR2] fabricated offer', 60, 200);
      // ---- CR2-cancel (review r1 P2): the RUNNING banner's one button is
      // Cancel, wired to the exporter abort — the run unwinds through the
      // cancelled path (abort on the wire, plan cleared, honest paint)
      // review r22 P1 pin, part 1: the judgment ledger before any resume
      // attempt — the whole journey (cancel + fast-forward) must add ZERO
      // (the round-6 no-re-adjudication invariant: staged archive footage
      // is never a live stroke).
      const jled0 = await chrome.eval(
        '(window.__rules?.judgments?.() ?? []).length');
      // review r22 P1 pin, part 2 (the deterministic red): the staged bed
      // must already be FROZEN when the first setup await runs. Wrap the
      // hdInfo probe seam (a plain namespace object) and record paused AT
      // ITS ENTRY — renderTimeline freezes at its own entry, so any later
      // sample would be tautologically green; this one reads the exact
      // window the finding names (staging → renderDrill), where pre-fix
      // the boot-time table was unpaused and the staged record free to
      // settle and adjudicate under the RAF loop.
      await chrome.eval(`(() => {
        const orig = window.__export.hdInfo;
        window.__crProbeFrozen = null;
        window.__export.hdInfo = async function (...a) {
          if (window.__crProbeFrozen === null) {
            window.__crProbeFrozen = !!window.__test.bed().paused;
          }
          return orig.apply(this, a);
        };
        return true; })()`);
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-go').click()`);
      await crWait(`(() => {
        const t = document.querySelector('#ob-resume-banner .ob-pb-resume-prog')
          ?.textContent ?? '';
        return /%/.test(t); })()`, '[CR2-cancel] re-render in flight', 600, 100);
      if ((await chrome.eval('window.__crProbeFrozen')) !== true) {
        fail('[CR2] the resume attempt must freeze the staged bed '
          + '(game.paused) BEFORE its setup awaits — review r22 P1: sampled '
          + 'unfrozen at the hdInfo probe entry, where an unfrozen staged '
          + 'record settles and is adjudicated as a live stroke');
      }
      const cancelBtn = await chrome.eval(`(() => {
        const b = document.querySelector('#ob-resume-banner .ob-pb-resume-discard');
        const label = b?.textContent;
        const vis = !!b && b.style.display !== 'none';
        if (vis) b.click();
        return { label, vis, want: window.__i18n.t('export.cancel') };
      })()`);
      if (!cancelBtn.vis || cancelBtn.label !== cancelBtn.want) {
        fail('[CR2-cancel] running banner must offer a localized Cancel: '
          + JSON.stringify(cancelBtn));
      }
      await crWait(`window.__playback.resumeState() === 'cancelled'`,
        '[CR2-cancel] the cancelled paint landed', 300, 300);
      const cw = await chrome.eval(`(() => ({
        aborted: window.__crShell.ops.some((o) => o.op === 'abort'),
        delivered: (window.__crShell.delivered ?? null),
        shell: sessionStorage.getItem('cr-shell') }))()`);
      if (!cw.aborted || cw.delivered !== null || cw.shell !== null) {
        fail('[CR2-cancel] cancel must abort the wire and delete the partial '
          + '(nothing delivered): ' + JSON.stringify({ aborted: cw.aborted,
          delivered: !!cw.delivered, shell: !!cw.shell }));
      }
      if ((await chrome.eval(`(async () => (await (await import(
        '/app/export-resume.js')).loadPlan()) === null)()`)) !== true) {
        fail('[CR2-cancel] a cancelled resume must clear the persisted plan');
      }
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-discard')?.click()`);
      await sleep(200);
      // re-fabricate the crash state (the cancel consumed it) and run the
      // REAL fast-forward to delivery
      await chrome.eval(`(async () => {
        const leaf = await import('/app/export-resume.js');
        await leaf.persistPlan(${JSON.stringify('__json2__')},
          '${fab.hash}');
        sessionStorage.setItem('cr-shell', JSON.stringify({
          fileB64: ${JSON.stringify(prefixB64)},
          manifest: { name: 'cr-ff-clip.mp4', mime: 'video/mp4',
            dest: 'files', extent: ${E0}, chunks: 3,
            plan: '${fab.hash}', frame: 42 } }));
        window.__obResume = { v: 1, name: 'cr-ff-clip.mp4',
          mime: 'video/mp4', dest: 'files', extent: ${E0}, chunks: 3,
          planHash: '${fab.hash}', frame: 42 };
        window.__crShell.ops.length = 0;
        window.__crProbeFrozen = null; // r22 P1: re-arm the probe-entry pin
      })()`.replace('"__json2__"', JSON.stringify(fab.json)));
      await chrome.eval('window.__playback.resumeCheck()');
      await crWait(`window.__playback?.resumeState?.() === 'offer'`,
        '[CR2] re-fabricated offer', 60, 200);
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-go').click()`);
      await crWait(`window.__playback.resumeState() === 'saved'`,
        '[CR2] fast-forward resume delivered', 600, 500);
      // r22 P1: the delivered attempt held the freeze law too
      if ((await chrome.eval('window.__crProbeFrozen')) !== true) {
        fail('[CR2] the DELIVERED resume attempt ran its setup awaits over '
          + 'an unfrozen staged bed (r22 P1 — sampled at hdInfo entry)');
      }
      const wire2 = await chrome.eval(`(() => {
        const ops = window.__crShell.ops;
        const chunks = ops.filter((o) => o.op === 'chunk');
        return { seq: ops.map((o) => o.op).join(','),
          firstChunkAt: chunks[0]?.at ?? null,
          postedBytes: chunks.reduce((n, o) => n + o.len, 0),
          end: ops.find((o) => o.op === 'end') ?? null };
      })()`);
      if (!/^resume(,chunk)+,end$/.test(wire2.seq)) {
        fail(`[CR2] wire shape "${wire2.seq}", want resume,chunk...,end`);
      }
      if (wire2.firstChunkAt !== E0) {
        fail(`[CR2] first resumed append at ${wire2.firstChunkAt}, want the `
          + `flushed extent ${E0} (the byte-drop law)`);
      }
      if (!(wire2.postedBytes < ext2)) {
        fail(`[CR2] resumed session posted ${wire2.postedBytes} B of a `
          + `${ext2} B file — the fast-forward dropped nothing`);
      }
      if (wire2.end?.bytes !== ext2) {
        fail(`[CR2] end.bytes ${wire2.end?.bytes} != control extent ${ext2}`);
      }
      const dlv2 = crAssemble(String(await chrome.eval(
        `(window.__crShell.delivered ?? null)`)));
      if (!dlv2.equals(ctl2)) {
        fail(`[CR2] resumed file (${dlv2.length} B) is NOT byte-identical `
          + `to the uninterrupted control (${ctl2.length} B) — the `
          + 'equivalence law broke');
      }
      const f2 = path.join(OUTDIR, 'cr2-ff-resumed.mp4');
      fs.writeFileSync(f2, dlv2);
      const frames2 = Number(crProbe(f2, ['-count_frames', '-select_streams',
        'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0']));
      if (frames2 !== fab.frames) {
        fail(`[CR2] resumed file decodes ${frames2} frames, want ${fab.frames}`);
      }
      // review r22 P1 pin, part 3: zero re-adjudication across the whole
      // journey — the cancelled attempt and the delivered fast-forward
      // both staged the archived record; neither may have mutated match
      // state (judgment-ledger delta 0, the arm 10l-2 law).
      const jled1 = await chrome.eval(
        '(window.__rules?.judgments?.() ?? []).length');
      if (jled1 !== jled0) {
        fail(`[CR2] the resume journey adjudicated staged archive footage `
          + `as live strokes (judgment ledger ${jled0} -> ${jled1}, want `
          + 'unchanged — the no-re-adjudication invariant)');
      }
      if (failCount === cc2) {
        console.log(`[CR2] OK — sound-off fast path: A/A byte-identical `
          + `foundation held; resume from ${E0}/${ext2} B posted only `
          + `${wire2.postedBytes} B (first append AT the extent) and the `
          + `delivered ${frames2}-frame file is byte-identical to the `
          + 'control');
      }
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-discard')?.click()`);
      await sleep(200);
    }

    // ---- CR3: corrupt prefix → boundary refusal → honest restart -----------
    {
      const cc3 = failCount;
      const ctl3 = Buffer.from(crFFControlB64, 'base64');
      const E0 = Math.max(1, Math.floor(ctl3.length * 0.6));
      const bad = Buffer.from(ctl3.subarray(0, E0));
      bad[Math.min(100, E0 - 1)] ^= 0xff; // one flipped byte in the prefix
      await chrome.eval(`(async () => {
        const leaf = await import('/app/export-resume.js');
        await leaf.persistPlan(${JSON.stringify(crFFPlanJson.json)},
          '${crFFPlanJson.hash}');
        sessionStorage.setItem('cr-shell', JSON.stringify({
          fileB64: ${JSON.stringify(bad.toString('base64'))},
          manifest: { name: 'cr-ff-clip.mp4', mime: 'video/mp4',
            dest: 'files', extent: ${E0}, chunks: 3,
            plan: '${crFFPlanJson.hash}', frame: 42 } }));
        window.__obResume = { v: 1, name: 'cr-ff-clip.mp4',
          mime: 'video/mp4', dest: 'files', extent: ${E0}, chunks: 3,
          planHash: '${crFFPlanJson.hash}', frame: 42 };
        window.__crShell.ops.length = 0;
        delete window.__crShell.delivered;
      })()`);
      await chrome.eval('window.__playback.resumeCheck()');
      await crWait(`window.__playback?.resumeState?.() === 'offer'`,
        '[CR3] fabricated offer', 60, 200);
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-go').click()`);
      await crWait(`window.__playback.resumeState() === 'resumeFailed'`,
        '[CR3] boundary mismatch refused the resume', 600, 500);
      const r3 = await chrome.eval(`(() => {
        const el = document.getElementById('ob-resume-banner');
        return { text: el?.querySelector('.ob-pb-resume-text')?.textContent,
          want: window.__i18n.t('export.resume.failed'),
          goLabel: el?.querySelector('.ob-pb-resume-go')?.textContent,
          wantGo: window.__i18n.t('export.resume.restart'),
          aborted: window.__crShell.ops.some((o) => o.op === 'abort'),
          swept: sessionStorage.getItem('cr-shell') === null,
          delivered: (window.__crShell.delivered ?? null) };
      })()`);
      if (r3.text !== r3.want || r3.goLabel !== r3.wantGo || !r3.aborted
        || !r3.swept || r3.delivered !== null) {
        fail('[CR3] refusal shape wrong (want localized restart offer, '
          + 'aborted+swept partial, NOTHING delivered): '
          + JSON.stringify({ ...r3, delivered: !!r3.delivered }));
      }
      // Start over: a fresh begin, the same persisted plan — and in the
      // sound-off class the restart file must STILL byte-match the control
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-go').click()`);
      await crWait(`window.__playback.resumeState() === 'saved'`,
        '[CR3] restart delivered', 600, 500);
      const dlv3 = crAssemble(String(await chrome.eval(
        `(window.__crShell.delivered ?? null)`)));
      if (!dlv3.equals(ctl3)) {
        fail(`[CR3] restarted file (${dlv3.length} B) is NOT byte-identical `
          + `to the control (${ctl3.length} B)`);
      }
      if (failCount === cc3) {
        console.log('[CR3] OK — one flipped prefix byte refused the resume '
          + 'at the boundary (localized restart offer, partial aborted, '
          + 'nothing delivered), Start over delivered the byte-identical '
          + 'control file');
      }
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-discard')?.click()`);
      await sleep(200);
    }

    // ---- CR4: truncated file → resume-op refusal → discard clears all ------
    {
      const cc4 = failCount;
      const ctl4 = Buffer.from(crFFControlB64, 'base64');
      const E0 = Math.max(20, Math.floor(ctl4.length * 0.6));
      const shortB64 = ctl4.subarray(0, E0 - 10).toString('base64');
      await chrome.eval(`(async () => {
        const leaf = await import('/app/export-resume.js');
        await leaf.persistPlan(${JSON.stringify(crFFPlanJson.json)},
          '${crFFPlanJson.hash}');
        sessionStorage.setItem('cr-shell', JSON.stringify({
          fileB64: ${JSON.stringify('__s__')},
          manifest: { name: 'cr-ff-clip.mp4', mime: 'video/mp4',
            dest: 'files', extent: ${E0}, chunks: 3,
            plan: '${crFFPlanJson.hash}', frame: 42 } }));
        window.__obResume = { v: 1, name: 'cr-ff-clip.mp4',
          mime: 'video/mp4', dest: 'files', extent: ${E0}, chunks: 3,
          planHash: '${crFFPlanJson.hash}', frame: 42 };
        window.__crShell.ops.length = 0;
        delete window.__crShell.delivered;
      })()`.replace('"__s__"', JSON.stringify(shortB64)));
      await chrome.eval('window.__playback.resumeCheck()');
      await crWait(`window.__playback?.resumeState?.() === 'offer'`,
        '[CR4] fabricated offer', 60, 200);
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-go').click()`);
      await crWait(`window.__playback.resumeState() === 'resumeFailed'`,
        '[CR4] short file refused at the resume op', 300, 300);
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-discard').click()`);
      await sleep(400);
      const r4 = await chrome.eval(`(async () => ({
        banner: !!document.getElementById('ob-resume-banner'),
        state: window.__playback.resumeState(),
        shell: sessionStorage.getItem('cr-shell'),
        delivered: (window.__crShell.delivered ?? null),
        plan: await (await import('/app/export-resume.js')).loadPlan(),
      }))()`);
      if (r4.banner || r4.state !== null || r4.shell !== null
        || r4.plan !== null || r4.delivered !== null) {
        fail('[CR4] discard left debt behind: ' + JSON.stringify({
          banner: r4.banner, state: r4.state, shell: !!r4.shell,
          plan: !!r4.plan, delivered: !!r4.delivered }));
      }
      if (failCount === cc4) {
        console.log('[CR4] OK — a truncated partial refused at the resume '
          + 'op (honest restart offer, nothing delivered), Discard cleared '
          + 'banner + plan + shell debt');
      }
      const crErrs = await chrome.eval('__test.errors.slice()');
      if (crErrs.length) fail('[CR] app-captured errors: ' + crErrs.join(' | '));
    }

    // ---- CR5: sound-ON SEAM — the GH-435 fast-forward byte-identity law ----
    // The CR2 shape on a withAudio plan: the deterministic class now
    // includes the audio chain (windowed-EXACT bed + measured-deterministic
    // AAC + software-pinned AVC — offline-render's widened preferSw gate),
    // so the SAME strong equivalence law must hold: A/A byte-identical
    // foundation WITH an aac track, then a fabricated mid-piece crash whose
    // REAL banner Continue posts only the tail and delivers a file
    // byte-identical to the uninterrupted sound-on control. RED pre-435:
    // ffEligible refused withAudio plans and Continue restarted (a begin op
    // on the wire, whole file re-posted).
    {
      const cc5s = failCount;
      const fab5 = await chrome.eval(`(async () => {
        const leaf = await import('/app/export-resume.js');
        const sid = (await window.__archive.sessions())[0]?.id;
        const records = (await window.__archive.records(sid)).slice(0, 2);
        if (!records.length) return { err: 'no archived records' };
        const kv = String((await import('/dist/pool-wasm/pool_wasm.js'))
          .kernel_version());
        const payload = { v: 1, name: 'cr-ffs-clip.mp4', mime: 'video/mp4',
          dest: 'files', kernel: kv, ua: navigator.userAgent, game: null,
          frames: 0,
          records,
          opts: { width: 320, height: 180, noDownload: true,
            withAudio: true, creationTime: 1754500001,
            trims: records.map(() => ({ startT: 0, endT: 1.2 })) } };
        window.__crCtl = [];
        const r = await __export.renderDrill(payload.records,
          Object.assign({}, payload.opts, { stream: { post: async (d, at) => {
            let s = '';
            for (let i = 0; i < d.length; i += 0x8000) {
              s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
            }
            window.__crCtl.push({ at, b64: btoa(s) });
          } } }));
        payload.frames = r.frames;
        const json = JSON.stringify(payload);
        const hash = leaf.planHashOf(json);
        await leaf.persistPlan(json, hash);
        return { json, hash, frames: r.frames, streamed: r.streamedBytes };
      })()`);
      if (!fab5 || fab5.err || !(fab5.streamed > 0)) {
        fail('[CR5] sound-on fabrication render failed: '
          + JSON.stringify(fab5));
      }
      const pieces5 = await chrome.eval('window.__crCtl');
      await chrome.eval('window.__crCtl = null');
      let ext5 = 0;
      for (const p of pieces5) {
        ext5 = Math.max(ext5, p.at + crAssemble(p.b64).length);
      }
      const ctl5 = Buffer.alloc(ext5);
      for (const p of pieces5) crAssemble(p.b64).copy(ctl5, p.at);
      // A/A foundation — the widened class's own proof, sound ON (the
      // exact bed and the software encoder must BOTH hold the line)
      const aa5 = await chrome.eval(`(async () => {
        const plan = JSON.parse(${JSON.stringify('__jsonhole__')});
        window.__crCtl = [];
        const r = await __export.renderDrill(plan.records,
          Object.assign({}, plan.opts, { stream: { post: async (d, at) => {
            let s = '';
            for (let i = 0; i < d.length; i += 0x8000) {
              s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
            }
            window.__crCtl.push({ at, b64: btoa(s) });
          } } }));
        return { streamed: r.streamedBytes };
      })()`.replace('"__jsonhole__"', JSON.stringify(fab5.json)));
      const piecesAA5 = await chrome.eval('window.__crCtl');
      await chrome.eval('window.__crCtl = null');
      // review r2 P2: size the second file by ITS OWN pieces — a buffer
      // allocated at the control extent would silently truncate a LONGER
      // second render (an extra AAC/muxer tail is exactly the
      // output-length nondeterminism this foundation must catch)
      let extAA5 = 0;
      for (const p of piecesAA5) {
        extAA5 = Math.max(extAA5, p.at + crAssemble(p.b64).length);
      }
      const aaBuf5 = Buffer.alloc(extAA5);
      for (const p of piecesAA5) crAssemble(p.b64).copy(aaBuf5, p.at);
      if (extAA5 !== ext5 || !aaBuf5.equals(ctl5)) {
        fail(`[CR5] A/A sound-on streamed renders are NOT byte-identical `
          + `(${extAA5} vs ${ext5} B) — the widened deterministic class `
          + 'has no foundation (exact bed or encoder pin broke)');
      }
      // fabricate the crash state at ~60% (mid-piece straddle, CR2 idiom)
      const E5 = Math.max(1, Math.floor(ext5 * 0.6));
      await chrome.eval(`(() => {
        sessionStorage.setItem('cr-shell', JSON.stringify({
          fileB64: ${JSON.stringify(ctl5.subarray(0, E5).toString('base64'))},
          manifest: { name: 'cr-ffs-clip.mp4', mime: 'video/mp4',
            dest: 'files', extent: ${E5}, chunks: 3,
            plan: '${fab5.hash}', frame: 42 } }));
        window.__obResume = { v: 1, name: 'cr-ffs-clip.mp4',
          mime: 'video/mp4', dest: 'files', extent: ${E5}, chunks: 3,
          planHash: '${fab5.hash}', frame: 42 };
        window.__crShell.ops.length = 0;
        delete window.__crShell.delivered;
      })()`);
      await chrome.eval('window.__playback.resumeCheck()');
      await crWait(`window.__playback?.resumeState?.() === 'offer'`,
        '[CR5] fabricated sound-on offer', 60, 200);
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-go').click()`);
      await crWait(`window.__playback.resumeState() === 'saved'`,
        '[CR5] sound-on fast-forward delivered', 600, 500);
      const wire5 = await chrome.eval(`(() => {
        const ops = window.__crShell.ops;
        const chunks = ops.filter((o) => o.op === 'chunk');
        return { seq: ops.map((o) => o.op).join(','),
          // appends vs the finalize-backpatch class (the CR1 split: a
          // boundary riding the finalize drain may see the mdat patch
          // flush before the tail chunk — arrival order is the muxer's)
          appends: chunks.filter((o) => o.at >= ${E5})
            .map((o) => ({ at: o.at, len: o.len })),
          patches: chunks.filter((o) => o.at < ${E5})
            .map((o) => ({ at: o.at, len: o.len })),
          postedBytes: chunks.reduce((n, o) => n + o.len, 0),
          end: ops.find((o) => o.op === 'end') ?? null };
      })()`);
      if (!/^resume(,chunk)+,end$/.test(wire5.seq)) {
        fail(`[CR5] wire shape "${wire5.seq}", want resume,chunk...,end `
          + '(RED pre-435: begin,... — the restart flow)');
      }
      if (!wire5.appends.length || wire5.appends[0].at !== E5) {
        fail(`[CR5] first resumed APPEND at ${wire5.appends[0]?.at}, want `
          + `the flushed extent ${E5} (the byte-drop law)`);
      }
      const patchBytes5 = wire5.patches.reduce((n, c) => n + c.len, 0);
      if (!wire5.patches.every((c) => c.at + c.len <= E5)
        || patchBytes5 > 4096) {
        fail(`[CR5] prefix rewrites outside the finalize-backpatch class: `
          + `${JSON.stringify(wire5.patches)} (${patchBytes5} B)`);
      }
      if (!(wire5.postedBytes < ext5)) {
        fail(`[CR5] resumed session posted ${wire5.postedBytes} B of a `
          + `${ext5} B file — the fast-forward dropped nothing`);
      }
      if (wire5.end?.bytes !== ext5) {
        fail(`[CR5] end.bytes ${wire5.end?.bytes} != control extent ${ext5}`);
      }
      const dlv5 = crAssemble(String(await chrome.eval(
        `(window.__crShell.delivered ?? null)`)));
      if (!dlv5.equals(ctl5)) {
        fail(`[CR5] resumed sound-on file (${dlv5.length} B) is NOT `
          + `byte-identical to the uninterrupted control (${ctl5.length} B) `
          + '— the widened equivalence law broke');
      }
      const f5s = path.join(OUTDIR, 'cr5-ffs-resumed.mp4');
      fs.writeFileSync(f5s, dlv5);
      const fv5 = crProbe(f5s, ['-select_streams', 'v:0', '-show_entries',
        'stream=codec_name', '-of', 'csv=p=0']);
      const fa5 = crProbe(f5s, ['-select_streams', 'a:0', '-show_entries',
        'stream=codec_name', '-of', 'csv=p=0']);
      const frames5 = Number(crProbe(f5s, ['-count_frames', '-select_streams',
        'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0']));
      if (fv5 !== 'h264' || fa5 !== 'aac' || frames5 !== fab5.frames) {
        fail(`[CR5] delivered file ${fv5}+${fa5}, ${frames5} frames — want `
          + `h264+aac with EXACTLY ${fab5.frames} frames (the plan)`);
      }
      if (failCount === cc5s) {
        console.log(`[CR5] OK — sound-on fast path (GH-435): A/A `
          + `byte-identical WITH an aac track; resume from ${E5}/${ext5} B `
          + `posted only ${wire5.postedBytes} B (first append AT the `
          + `extent) and the delivered ${frames5}-frame h264+aac file is `
          + 'byte-identical to the control');
      }
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-discard')?.click()`);
      await sleep(200);

      // ---- CR5b: the VIDEO-ENCODER leg of the gate (review GH-435 r1 P1) ----
      // A platform whose prefer-software probe answers false keeps the
      // nondeterministic hardware encoder — the gate must take the honest
      // restart UP FRONT (never spend a catch-up render on a boundary hash
      // that cannot verify). Mask the seam probe to false (the RF-c
      // mutation idiom), re-fabricate the same crash, Continue → the
      // restart flow — and the delivered file STILL byte-matches the
      // control (the restart is a clean full render of the same plan).
      const cc5b = failCount;
      await chrome.eval(`(async () => {
        const leaf = await import('/app/export-resume.js');
        await leaf.persistPlan(${JSON.stringify('__json5b__')},
          '${fab5.hash}');
        sessionStorage.setItem('cr-shell', JSON.stringify({
          fileB64: ${JSON.stringify(ctl5.subarray(0, E5).toString('base64'))},
          manifest: { name: 'cr-ffs-clip.mp4', mime: 'video/mp4',
            dest: 'files', extent: ${E5}, chunks: 3,
            plan: '${fab5.hash}', frame: 42 } }));
        window.__obResume = { v: 1, name: 'cr-ffs-clip.mp4',
          mime: 'video/mp4', dest: 'files', extent: ${E5}, chunks: 3,
          planHash: '${fab5.hash}', frame: 42 };
        window.__crShell.ops.length = 0;
        delete window.__crShell.delivered;
        window.__crSwProbe0 = window.__export.swVideoSupported;
        window.__export.swVideoSupported = async () => false;
      })()`.replace('"__json5b__"', JSON.stringify(fab5.json)));
      await chrome.eval('window.__playback.resumeCheck()');
      await crWait(`window.__playback?.resumeState?.() === 'offer'`,
        '[CR5b] re-fabricated offer', 60, 200);
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-go').click()`);
      await crWait(`window.__playback.resumeState() === 'saved'`,
        '[CR5b] probe-refused Continue delivered via restart', 600, 500);
      await chrome.eval( // restore the real probe before any assertion can throw
        'window.__export.swVideoSupported = window.__crSwProbe0');
      const wire5b = await chrome.eval(`(() => {
        const ops = window.__crShell.ops;
        return { seq: ops.map((o) => o.op).join(','),
          resumes: ops.filter((o) => o.op === 'resume').length };
      })()`);
      if (!/^begin(,chunk)+,end$/.test(wire5b.seq) || wire5b.resumes !== 0) {
        fail(`[CR5b] a probe-refused platform must restart up front `
          + `(begin,chunk...,end; no resume op), got "${wire5b.seq}"`);
      }
      const dlv5b = crAssemble(String(await chrome.eval(
        `(window.__crShell.delivered ?? null)`)));
      if (!dlv5b.equals(ctl5)) {
        fail(`[CR5b] restarted sound-on file (${dlv5b.length} B) is NOT `
          + `byte-identical to the control (${ctl5.length} B)`);
      }
      if (failCount === cc5b) {
        console.log('[CR5b] OK — prefer-software probe masked false: '
          + 'Continue took the restart flow up front (no resume op, no '
          + 'wasted catch-up render) and still delivered the byte-identical '
          + 'control file');
      }
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-discard')?.click()`);
      await sleep(200);
    }

    // ---- CR6: the RESTART class post-widening — non-mp4 plans --------------
    // GH-435 widened the fast-forward to sound-on mp4; the restart flow
    // must still own everything OUTSIDE the class. webm is the testable
    // member (webm-muxer rewrites cluster sizes mid-stream — positioned
    // overwrites the append-order hash cannot fold; ffEligible refuses on
    // mime): a fabricated webm sound-off plan's Continue takes a fresh
    // begin (superseding the partial), NO resume op, and posts the WHOLE
    // clean render. (The stale-pairing sound-on member is untestable live
    // — frozen ES namespaces; the e2e-playback ffEligible arm pins it on
    // the predicate.)
    {
      const cc6 = failCount;
      const fab6 = await chrome.eval(`(async () => {
        const leaf = await import('/app/export-resume.js');
        const sid = (await window.__archive.sessions())[0]?.id;
        const records = (await window.__archive.records(sid)).slice(0, 1);
        if (!records.length) return { err: 'no archived records' };
        const kv = String((await import('/dist/pool-wasm/pool_wasm.js'))
          .kernel_version());
        const payload = { v: 1, name: 'cr-webm-clip.webm', mime: 'video/webm',
          dest: 'files', kernel: kv, ua: navigator.userAgent, game: null,
          frames: 0,
          records,
          opts: { width: 320, height: 180, noDownload: true,
            withAudio: false, format: 'webm',
            trims: records.map(() => ({ startT: 0, endT: 1.2 })) } };
        window.__crCtl = [];
        const r = await __export.renderDrill(payload.records,
          Object.assign({}, payload.opts, { stream: { post: async (d, at) => {
            let s = '';
            for (let i = 0; i < d.length; i += 0x8000) {
              s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
            }
            window.__crCtl.push({ at, b64: btoa(s) });
          } } }));
        payload.frames = r.frames;
        const json = JSON.stringify(payload);
        const hash = leaf.planHashOf(json);
        await leaf.persistPlan(json, hash);
        return { json, hash, frames: r.frames, streamed: r.streamedBytes };
      })()`);
      if (!fab6 || fab6.err || !(fab6.streamed > 0)) {
        fail('[CR6] webm fabrication render failed: ' + JSON.stringify(fab6));
      }
      const pieces6 = await chrome.eval('window.__crCtl');
      await chrome.eval('window.__crCtl = null');
      let ext6 = 0;
      for (const p of pieces6) {
        ext6 = Math.max(ext6, p.at + crAssemble(p.b64).length);
      }
      const E6 = Math.max(1, Math.floor(ext6 * 0.6));
      const ctl6 = Buffer.alloc(ext6);
      for (const p of pieces6) crAssemble(p.b64).copy(ctl6, p.at);
      await chrome.eval(`(() => {
        sessionStorage.setItem('cr-shell', JSON.stringify({
          fileB64: ${JSON.stringify(ctl6.subarray(0, E6).toString('base64'))},
          manifest: { name: 'cr-webm-clip.webm', mime: 'video/webm',
            dest: 'files', extent: ${E6}, chunks: 3,
            plan: '${fab6.hash}', frame: 42 } }));
        window.__obResume = { v: 1, name: 'cr-webm-clip.webm',
          mime: 'video/webm', dest: 'files', extent: ${E6}, chunks: 3,
          planHash: '${fab6.hash}', frame: 42 };
        window.__crShell.ops.length = 0;
        delete window.__crShell.delivered;
      })()`);
      await chrome.eval('window.__playback.resumeCheck()');
      await crWait(`window.__playback?.resumeState?.() === 'offer'`,
        '[CR6] fabricated webm offer', 60, 200);
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-go').click()`);
      await crWait(`window.__playback.resumeState() === 'saved'`,
        '[CR6] restart-flow webm export delivered', 600, 500);
      const wire6 = await chrome.eval(`(() => {
        const ops = window.__crShell.ops;
        const chunks = ops.filter((o) => o.op === 'chunk');
        return { seq: ops.map((o) => o.op).join(','),
          resumes: ops.filter((o) => o.op === 'resume').length,
          postedBytes: chunks.reduce((n, o) => n + o.len, 0),
          end: ops.find((o) => o.op === 'end') ?? null,
          shellDebt: sessionStorage.getItem('cr-shell') };
      })()`);
      if (!/^begin(,chunk)+,end$/.test(wire6.seq) || wire6.resumes !== 0) {
        fail(`[CR6] a webm plan's Continue must take the restart flow `
          + `(begin,chunk...,end; no resume op), got "${wire6.seq}"`);
      }
      if (!(wire6.postedBytes >= wire6.end?.bytes)) {
        fail(`[CR6] restart posted ${wire6.postedBytes} B of a `
          + `${wire6.end?.bytes} B file — a restart never byte-drops`);
      }
      if (wire6.shellDebt !== null) {
        fail('[CR6] the delivered webm transfer left shell debt behind');
      }
      const dlv6 = crAssemble(String(await chrome.eval(
        `(window.__crShell.delivered ?? null)`)));
      const f6w = path.join(OUTDIR, 'cr6-webm-restarted.webm');
      fs.writeFileSync(f6w, dlv6);
      const fv6 = crProbe(f6w, ['-select_streams', 'v:0', '-show_entries',
        'stream=codec_name', '-of', 'csv=p=0']);
      const frames6 = Number(crProbe(f6w, ['-count_frames', '-select_streams',
        'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0']));
      if (fv6 !== 'vp9' || frames6 !== fab6.frames) {
        fail(`[CR6] delivered webm ${fv6}, ${frames6} frames — want vp9 `
          + `with EXACTLY ${fab6.frames} frames (the complete-render law)`);
      }
      if (failCount === cc6) {
        console.log(`[CR6] OK — restart class held post-widening: webm `
          + `Continue took begin,chunk...,end (no resume op, whole `
          + `${wire6.end.bytes} B posted) and delivered a clean `
          + `${frames6}-frame vp9 file`);
      }
      await chrome.eval(
        `document.querySelector('#ob-resume-banner .ob-pb-resume-discard')?.click()`);
      await sleep(200);
      const cr56Errs = await chrome.eval('__test.errors.slice()');
      if (cr56Errs.length) {
        fail('[CR5/CR6] app-captured errors: ' + cr56Errs.join(' | '));
      }
    }

    // ---- CR7 (GH-1046): the resume banner's progress copy ------------------
    // "Continue export" after "interrupted at P %" re-renders from frame 0
    // by design (the fast-forward hashes and drops the flushed prefix).
    // Pre-1046 the banner painted that as a bar restarting at 0 % with the
    // whole render's time left under "Finishing the interrupted export…",
    // after an empty setup line, and a restart-class Continue said
    // "Finishing" too. Sampled on EVERY paint of the banner's text and
    // progress lines (an in-page MutationObserver — each textContent write
    // is one record) until the run leaves 'running': setup paints
    // "Preparing…"; below the checkpoint frame every progress paint is the
    // re-check copy ("Checking the saved part… n %"); no main-progress
    // paint reads below P and the first one is >= P; a plan outside
    // ffEligible (webm) runs under "Starting the export over…", never
    // export.resume.resuming. Pixel leg: the FIRST progress paint is held
    // on screen (a renderDrill hook wrapper swallows the later onProgress
    // calls and the encoder's outputs are withheld — the PS2 stall
    // staging; it ends at the engine's own stall flush, measured ~8 s
    // here, or at a 12 s timer, both inside the 15 s stall watchdog — a
    // flush delivers the held outputs first, so the bytes stay identical),
    // the progress line is captured, and it must be pixel-identical to the same line
    // repainted with the expected re-check copy and differ from the
    // pre-fix "n % · … left" copy (the banner is made opaque for the
    // capture: its glass backdrop would bleed the canvas into the
    // comparison). CR7c reads the anchor-less fallback's byte step from the
    // leaf itself (createFastForward().progress()). RED pre-1046 (fix
    // reverted): the first progress paint reads "1 % · … left" under
    // "Finishing…", setup is an empty line, the webm Continue says
    // "Finishing", and the leaf has no progress().
    {
      const cc7 = failCount;
      const errs7 = (await chrome.eval('__test.errors.slice()')).length;
      const L7 = await chrome.eval(`({
        resuming: __i18n.t('export.resume.resuming'),
        restarting: __i18n.t('export.resume.restarting'),
        preparing: __i18n.t('export.resume.preparing'),
        check: __i18n.t('export.resume.checking'),
        prog: __i18n.t('export.progress'),
        paused: __i18n.t('export.paused') })`);
      // a raw template ("{pct}% · {eta} left · …") → its params, or null
      const tplParse = (tpl, s) => {
        const names = [];
        const re = new RegExp('^' + tpl.replace(/[.*+?^$()|[\]\\]/g, '\\$&')
          .replace(/\{(\w+)\}/g, (m, k) => {
            names.push(k);
            return k === 'eta' ? '(.+?)' : '(\\d+)';
          }) + '$');
        const m = re.exec(s);
        if (!m) return null;
        return Object.fromEntries(names.map((k, i) => [k, k === 'eta' ? m[i + 1] : Number(m[i + 1])]));
      };
      // the paint recorder (+ for the pixel leg the first-paint hold); the
      // pixel leg's own repaints never reach the log (c.paintAs)
      const cr7Rig = (freeze) => `(() => {
        const banner = document.getElementById('ob-resume-banner');
        const textEl = banner?.querySelector('.ob-pb-resume-text');
        const progEl = banner?.querySelector('.ob-pb-resume-prog');
        if (!textEl || !progEl) return 'no banner';
        const c = { paints: [], first: null, released: ${!freeze}, auto: false,
          hold: false, held: [], swallowed: 0,
          Native: window.VideoEncoder, rd0: window.__export.renderDrill };
        window.__cr7 = c;
        c.log = (recs) => {
          for (const r of recs) {
            const el = r.target.nodeType === 3 ? r.target.parentNode : r.target;
            const which = el === textEl ? 'text' : el === progEl ? 'prog' : null;
            if (!which) continue;
            const s = r.type === 'characterData' ? r.target.data
              : [...r.addedNodes].map((n) => n.textContent).join('');
            c.paints.push({ which, s, state: window.__playback.resumeState() });
          }
        };
        c.mo = new MutationObserver(c.log);
        c.mo.observe(banner, { subtree: true, childList: true, characterData: true });
        // the pixel leg's own repaint: product records pending so far are
        // logged first, the test's write is taken and dropped in the same
        // task — no flag window in which a product paint could be lost
        c.paintAs = (s) => {
          c.log(c.mo.takeRecords());
          progEl.textContent = s;
          c.mo.takeRecords();
          return { s: progEl.textContent, released: c.released,
            state: window.__playback.resumeState() };
        };
        c.release = (by) => {
          if (c.released) return;
          c.released = true;
          c.by = by;
          clearTimeout(c.timer);
          c.hold = false;
          for (const h of c.held.splice(0)) h.out(h.chunk, h.meta);
        };
        window.__export.renderDrill = function (records, opts) {
          const o = Object.assign({}, opts);
          const p0 = opts?.onProgress;
          o.onProgress = (done, total, ema) => {
            if (c.first && !c.released) { c.swallowed++; return; }
            p0?.(done, total, ema);
            if (!c.first) {
              c.first = { done, total, prog: progEl.textContent,
                text: textEl.textContent };
              if (!c.released) {
                c.hold = true;
                c.timer = setTimeout(() => { c.auto = true; c.release('timer'); }, 12000);
              }
            }
          };
          return c.rd0.call(this, records, o);
        };
        if (${freeze}) {
          const Native = c.Native;
          const W = function (init) {
            const inner = new Native({ error: init.error, output: (chunk, meta) => {
              if (c.hold) { c.held.push({ chunk, meta, out: init.output }); return; }
              init.output(chunk, meta);
            } });
            const self = Object.create(W.prototype);
            self.__inner = inner;
            return self;
          };
          W.prototype = {
            configure(x) { return this.__inner.configure(x); },
            encode(f, o) { return this.__inner.encode(f, o); },
            flush() { c.release('flush'); return this.__inner.flush(); },
            close() { return this.__inner.close(); },
            reset() { return this.__inner.reset(); },
            get encodeQueueSize() { return this.__inner.encodeQueueSize; },
            get state() { return this.__inner.state; },
          };
          W.isConfigSupported = (x) => Native.isConfigSupported(x);
          window.VideoEncoder = W;
          const st = document.createElement('style');
          st.id = 'cr7-opaque';
          st.textContent = '#ob-resume-banner { background: #10141a !important;'
            + ' backdrop-filter: none !important; -webkit-backdrop-filter: none !important;'
            + ' box-shadow: none !important; }';
          document.head.appendChild(st);
        }
        return 'armed';
      })()`;
      const cr7Unrig = `(() => {
        const c = window.__cr7;
        if (!c) return true;
        c.release('unrig');
        c.mo.disconnect();
        window.VideoEncoder = c.Native;
        window.__export.renderDrill = c.rd0;
        document.getElementById('cr7-opaque')?.remove();
        delete window.__cr7;
        return true;
      })()`;
      // fabricate an offer at ~60 %: plan + mock-disk prefix + manifest
      const cr7Offer = async (plan, ctl, name, mime) => {
        const F = Math.round(plan.frames * 0.6);
        const E = Math.max(1, Math.floor(ctl.length * 0.6));
        await chrome.eval(`(async () => {
          const leaf = await import('/app/export-resume.js');
          await leaf.persistPlan(${JSON.stringify(plan.json)}, '${plan.hash}');
          sessionStorage.setItem('cr-shell', JSON.stringify({
            fileB64: ${JSON.stringify(ctl.subarray(0, E).toString('base64'))},
            manifest: { name: '${name}', mime: '${mime}',
              dest: 'files', extent: ${E}, chunks: 3,
              plan: '${plan.hash}', frame: ${F} } }));
          window.__obResume = { v: 1, name: '${name}',
            mime: '${mime}', dest: 'files', extent: ${E}, chunks: 3,
            planHash: '${plan.hash}', frame: ${F} };
          window.__crShell.ops.length = 0;
          delete window.__crShell.delivered;
        })()`);
        await chrome.eval('window.__playback.resumeCheck()');
        if (!(await crWait(`window.__playback?.resumeState?.() === 'offer'`,
          `[CR7] fabricated ${mime} offer`, 60, 200))) return null;
        const P = Math.max(0, Math.min(99, Math.round(100 * F / plan.frames)));
        const offer = await chrome.eval(`({
          text: document.querySelector('#ob-resume-banner .ob-pb-resume-text')?.textContent ?? '',
          want: __i18n.t('export.resume.notice', { pct: ${P} }) })`);
        if (offer.text !== offer.want) {
          fail(`[CR7] the ${mime} offer must name the checkpoint (${P} %): `
            + JSON.stringify(offer));
        }
        return { F, E, P };
      };
      const cr7Click = async () => {
        const b = await chrome.eval(`(() => {
          const el = document.querySelector('#ob-resume-banner .ob-pb-resume-go');
          if (!el || el.style.display === 'none') return null;
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        })()`);
        if (!b) return false;
        await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
          x: b.x, y: b.y, button: 'left', clickCount: 1 });
        await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
          x: b.x, y: b.y, button: 'left', clickCount: 1 });
        return true;
      };
      // ---- CR7a: the fast-forward (the class the offer promises) ----
      const ctl7 = crFFControlB64 ? Buffer.from(crFFControlB64, 'base64') : null;
      const o7 = crFFPlanJson?.json && ctl7
        ? await cr7Offer(crFFPlanJson, ctl7, 'cr-ff-clip.mp4', 'video/mp4') : null;
      const box7 = !o7 ? null : (await chrome.eval(cr7Rig(true))) !== 'armed' ? 'rig'
        : !(await cr7Click()) ? 'click'
          : !(await crWait('!!window.__cr7?.first', '[CR7a] the first progress paint',
            900, 100)) ? 'paint'
            : await chrome.eval(`(() => {
              const el = document.querySelector('#ob-resume-banner .ob-pb-resume-prog');
              const b = el.getBoundingClientRect();
              return { x: Math.floor(b.x), y: Math.floor(b.y), w: Math.ceil(b.width),
                h: Math.ceil(b.height), prog: el.textContent,
                first: window.__cr7.first, released: window.__cr7.released };
            })()`);
      if (!crFFPlanJson?.json || !ctl7) {
        fail('[CR7a] no CR2 fast-forward fabrication to resume from');
      } else if (!o7) {
        // cr7Offer already failed by name
      } else if (typeof box7 === 'string') {
        if (box7 !== 'paint') fail(`[CR7a] could not start the resume (${box7})`);
        await chrome.eval(cr7Unrig);
        // a stuck attempt must not leak into the next arm: Cancel, then close
        await chrome.eval(
          `document.querySelector('#ob-resume-banner .ob-pb-resume-discard')?.click()`);
        await crWait(`window.__playback.resumeState() !== 'running'`,
          '[CR7a] the stuck attempt cancelled', 100, 300);
        await chrome.eval(
          `document.querySelector('#ob-resume-banner .ob-pb-resume-discard')?.click()`);
      } else {
        const { F: F7, P: P7 } = o7;
        // ---- pixel leg (inside the hold) ----
        const shot7 = async () => decodePng(Buffer.from((await chrome.send(
          'Page.captureScreenshot', { format: 'png', clip: { x: box7.x, y: box7.y,
            width: box7.w, height: box7.h, scale: 1 } })).data, 'base64'));
        const paintAs = (s) => chrome.eval(`window.__cr7.paintAs(${JSON.stringify(s)})`);
        const first7 = box7.first;
        const ckPct = Math.max(0, Math.min(99, Math.floor(100 * first7.done / F7)));
        const want7 = await chrome.eval(`({
          check: __i18n.t('export.resume.checking', { pct: ${ckPct} }),
          bad: __i18n.t('export.progress', { pct: ${Math.round(100 * first7.done / first7.total)},
            eta: '1 s', done: ${first7.done}, total: ${first7.total} }) })`);
        let pix7 = null;
        if (box7.released || !(box7.w > 0 && box7.h > 0) || box7.prog !== first7.prog) {
          unjudgeable(`[CR7a] pixel leg: the first progress paint was not held `
            + `on screen (${JSON.stringify(box7)}) — load, not a verdict`);
        } else {
          const S = await shot7();
          const a = await paintAs(want7.check);
          const Sgood = await shot7();
          const b = await paintAs(want7.bad);
          const Sbad = await shot7();
          const z = await paintAs(first7.prog);
          if (a.released || b.released || z.released || z.state !== 'running') {
            unjudgeable('[CR7a] pixel leg: the hold auto-released mid-capture '
              + '— load, not a verdict');
          } else {
            const diff = (p, q) => {
              if (p.w !== q.w || p.h !== q.h) return -1;
              let n = 0;
              for (let i = 0; i < p.px.length; i += p.bpp) {
                if (p.px[i] !== q.px[i] || p.px[i + 1] !== q.px[i + 1]
                  || p.px[i + 2] !== q.px[i + 2]) n++;
              }
              return n;
            };
            pix7 = { good: diff(S, Sgood), bad: diff(S, Sbad), w: S.w, h: S.h };
            if (pix7.good !== 0 || !(pix7.bad > 0)) {
              fail(`[CR7a] the banner's first progress paint must SHOW the `
                + `re-check copy ${JSON.stringify(want7.check)} (pixel-identical) and `
                + `not the pre-fix copy: differing px vs re-check ${pix7.good}, vs `
                + `pre-fix ${pix7.bad} (${pix7.w}x${pix7.h}); DOM had `
                + JSON.stringify(first7.prog));
            }
          }
        }
        await chrome.eval("window.__cr7.release('test'); true");
        await crWait(`window.__playback.resumeState() === 'saved'`,
          '[CR7a] fast-forward resume delivered', 600, 500);
        const rec7 = await chrome.eval(`({ paints: window.__cr7.paints,
          swallowed: window.__cr7.swallowed, by: window.__cr7.by ?? null,
          seq: window.__crShell.ops.map((o) => o.op).join(','),
          delivered: window.__crShell.delivered ?? null })`);
        await chrome.eval(cr7Unrig);
        const run7 = rec7.paints.filter((p) => p.state === 'running');
        const progs7 = run7.filter((p) => p.which === 'prog').map((p) => p.s);
        const texts7 = run7.filter((p) => p.which === 'text').map((p) => p.s);
        if (progs7[0] !== L7.preparing || progs7.includes('')) {
          fail(`[CR7a] setup must paint ${JSON.stringify(L7.preparing)}, never an `
            + `empty line (RED pre-1046): first running paints `
            + JSON.stringify(progs7.slice(0, 3)));
        }
        if (!texts7.length || texts7.some((s) => s !== L7.resuming)) {
          fail(`[CR7a] a fast-forward runs under ${JSON.stringify(L7.resuming)}: `
            + JSON.stringify([...new Set(texts7)]));
        }
        let checks7 = 0;
        let firstMain7 = null;
        let firstMainAt7 = null;
        const bad7 = [];
        for (const s of progs7) {
          if (s === L7.preparing || s === L7.paused) continue;
          const ck = tplParse(L7.check, s);
          if (ck) {
            if (firstMain7 !== null) bad7.push(`re-check after the main bar: ${s}`);
            else checks7++;
            continue;
          }
          const m = tplParse(L7.prog, s);
          if (m) {
            if (firstMain7 === null) { firstMain7 = m.pct; firstMainAt7 = m.done; }
            if (m.pct < P7) bad7.push(s);
            continue;
          }
          bad7.push(`unknown copy: ${s}`);
        }
        if (!checks7 || firstMain7 === null || firstMain7 < P7 || bad7.length) {
          fail(`[CR7a] below the checkpoint every paint must carry the re-check `
            + `copy and the main bar must pick up at >= ${P7} % (RED pre-1046: `
            + `"0 %"-"${P7 - 1} %" under "Finishing…"): re-check paints ${checks7}, `
            + `first main ${firstMain7}, offending ${JSON.stringify(bad7.slice(0, 4))}`);
        }
        // the main bar takes over AT the checkpoint frame (not later: a
        // re-check step that outlives the saved part is the same lie, inverted)
        if (firstMainAt7 !== F7) {
          fail(`[CR7a] the main bar must take over at the checkpoint frame ${F7}, `
            + `first main paint at frame ${firstMainAt7}`);
        }
        if (first7.prog !== want7.check) {
          fail(`[CR7a] the first progress paint must be the re-check copy `
            + `${JSON.stringify(want7.check)}, got ${JSON.stringify(first7.prog)}`);
        }
        const dlv7 = rec7.delivered ? crAssemble(String(rec7.delivered)) : null;
        if (!/^resume(,chunk)+,end$/.test(rec7.seq) || !dlv7?.equals(ctl7)) {
          fail(`[CR7a] the Continue must fast-forward to a byte-identical file `
            + `(wire "${rec7.seq}", ${dlv7?.length ?? 0}/${ctl7.length} B)`);
        }
        if (failCount === cc7) {
          console.log(`[CR7a] OK — the ${P7} % offer's Continue painted `
            + `${JSON.stringify(L7.preparing)} through setup, ${checks7} re-check `
            + `paints below frame ${F7}, the main bar from ${firstMain7} % on `
            + `(never below), and the held first paint is pixel-identical to the `
            + `re-check copy (${pix7 ? `${pix7.w}x${pix7.h}, ${pix7.bad} px off the `
              + 'pre-fix copy' : 'pixel leg unjudgeable'}; hold ended by ${rec7.by}, `
            + `${rec7.swallowed} onProgress calls held back); delivered byte-identical`);
        }
        await chrome.eval(
          `document.querySelector('#ob-resume-banner .ob-pb-resume-discard')?.click()`);
        await sleep(200);
      }
      // ---- CR7b: the restart class (webm — outside ffEligible) ----
      {
        const cc7b = failCount;
        const fab7 = await chrome.eval(`(async () => { try {
          const leaf = await import('/app/export-resume.js');
          const sid = (await window.__archive.sessions())[0]?.id;
          const records = (await window.__archive.records(sid)).slice(0, 1);
          if (!records.length) return { err: 'no archived records' };
          const kv = String((await import('/dist/pool-wasm/pool_wasm.js'))
            .kernel_version());
          const payload = { v: 1, name: 'cr7-webm-clip.webm', mime: 'video/webm',
            dest: 'files', kernel: kv, ua: navigator.userAgent, game: null,
            frames: 0, records,
            opts: { width: 320, height: 180, noDownload: true,
              withAudio: false, format: 'webm',
              trims: records.map(() => ({ startT: 0, endT: 1.2 })) } };
          window.__crCtl = [];
          const r = await __export.renderDrill(payload.records,
            Object.assign({}, payload.opts, { stream: { post: async (d, at) => {
              let s = '';
              for (let i = 0; i < d.length; i += 0x8000) {
                s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
              }
              window.__crCtl.push({ at, b64: btoa(s) });
            } } }));
          payload.frames = r.frames;
          const json = JSON.stringify(payload);
          return { json, hash: leaf.planHashOf(json), frames: r.frames };
        } catch (e) { return { err: String(e?.message ?? e) }; } })()`);
        const pieces7 = (await chrome.eval('window.__crCtl')) ?? [];
        await chrome.eval('window.__crCtl = null');
        let ext7 = 0;
        for (const p of pieces7) ext7 = Math.max(ext7, p.at + crAssemble(p.b64).length);
        const ctl7b = Buffer.alloc(ext7);
        for (const p of pieces7) crAssemble(p.b64).copy(ctl7b, p.at);
        if (!fab7 || fab7.err || !(ext7 > 0)) {
          fail('[CR7b] webm fabrication render failed: ' + JSON.stringify(fab7));
        } else if (!(await cr7Offer(fab7, ctl7b, 'cr7-webm-clip.webm', 'video/webm'))) {
          // cr7Offer already failed by name
        } else if ((await chrome.eval(cr7Rig(false))) !== 'armed' || !(await cr7Click())) {
          fail('[CR7b] could not start the resume (rig or Continue button)');
          await chrome.eval(cr7Unrig);
        } else {
          await crWait(`window.__playback.resumeState() === 'saved'`,
            '[CR7b] restart-flow webm export delivered', 600, 500);
          const rec7b = await chrome.eval(`({ paints: window.__cr7.paints,
            seq: window.__crShell.ops.map((o) => o.op).join(',') })`);
          await chrome.eval(cr7Unrig);
          const live = rec7b.paints;
          const texts = live.filter((p) => p.which === 'text' && p.state === 'running')
            .map((p) => p.s);
          const progs = live.filter((p) => p.which === 'prog' && p.state === 'running')
            .map((p) => p.s);
          const saving = live.filter((p) => p.which === 'text' && p.state === 'saving')
            .map((p) => p.s);
          if (!texts.length || texts.some((s) => s !== L7.restarting)) {
            fail(`[CR7b] a restart-class Continue must say ${JSON.stringify(L7.restarting)}`
              + `, never ${JSON.stringify(L7.resuming)} (RED pre-1046): `
              + JSON.stringify([...new Set(texts)]));
          }
          if (progs[0] !== L7.preparing || progs.includes('')) {
            fail(`[CR7b] setup must paint ${JSON.stringify(L7.preparing)}: `
              + JSON.stringify(progs.slice(0, 3)));
          }
          if (saving.some((s) => s === L7.resuming)) {
            fail(`[CR7b] the restart's saving paint must not say "Finishing": `
              + JSON.stringify(saving));
          }
          if (!/^begin(,chunk)+,end$/.test(rec7b.seq)) {
            fail(`[CR7b] a webm Continue must take the restart flow, got "${rec7b.seq}"`);
          }
          if (failCount === cc7b) {
            console.log(`[CR7b] OK — the webm Continue ran under `
              + `${JSON.stringify(L7.restarting)} (${texts.length} paints, none `
              + `"Finishing"), setup painted ${JSON.stringify(L7.preparing)}, and the `
              + 'restart flow delivered');
          }
          await chrome.eval(
            `document.querySelector('#ob-resume-banner .ob-pb-resume-discard')?.click()`);
          await sleep(200);
        }
      }
      // ---- CR7c: the re-check step's byte reading (no frame anchor) ----
      // Without a usable manifest frame the step lasts until the boundary
      // verifies and n reads createFastForward().progress(); the fixture's
      // small files post one piece at finalize, so the journey legs cannot
      // see it move — read the leaf directly: 0 before a byte, the hashed
      // share mid-prefix, 1 at the verified boundary.
      {
        const r7c = await chrome.eval(`(async () => { try {
          const leaf = await import('/app/export-resume.js');
          const bytes = new Uint8Array([3, 1, 4, 1, 5, 9, 2, 6]);
          let h = 0x811c9dc5;
          for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193); }
          const ff = leaf.createFastForward({ extent: 8,
            hash: (h >>> 0).toString(16).padStart(8, '0') });
          if (typeof ff.progress !== 'function') return { err: 'no progress()' };
          const out = [ff.progress()];
          ff.take(bytes.subarray(0, 3), 0);
          out.push(ff.progress(), ff.verified());
          ff.take(bytes.subarray(3, 8), 3);
          out.push(ff.progress(), ff.verified());
          return { out };
        } catch (e) { return { err: String(e?.message ?? e) }; } })()`);
        if (r7c?.err || JSON.stringify(r7c?.out) !== JSON.stringify([0, 0.375, false, 1, true])) {
          fail('[CR7c] createFastForward().progress() must read the hashed share '
            + `of the prefix (want [0, 0.375, false, 1, true]): ${JSON.stringify(r7c)}`);
        } else {
          console.log('[CR7c] OK — the byte reading behind the anchor-less re-check '
            + 'step: 0 → 0.375 mid-prefix → 1 at the verified boundary');
        }
      }
      const errs7b = await chrome.eval('__test.errors.slice()');
      if (errs7b.length > errs7) {
        fail('[CR7] app-captured errors: ' + errs7b.slice(errs7).join(' | '));
      }
    }

    // ---- LEAD4 (GH-433): the lead-only trim journey — ASSOCIATE ------------
    // The train's own tripwire, promoted to the product's red/green: with
    // leads ON (the shipped default) the DVR timeline is lead-inclusive,
    // and the pre-363 literal setTrim(0, 1.2) selects a window entirely
    // inside shot 0's practice-stroke lead. Pre-433 includedSegments()
    // planned NOTHING there and every save/export tile disarmed with no
    // note anywhere (issue #433). The ASSOCIATE ruling: a lead is prologue
    // to its parent shot — the window means shot 0, the full-mode starter
    // tile ARMS, and the delivered file is the parent shot's export: the
    // lead head frames first (tIn 0 sits at the choreography start, so the
    // exportLeads r5 P2 grammar keeps the FULL v2 lead), then the strike
    // and the whole play span 1:1 — verified by ffprobe frame count
    // against the engine's own planPlayback arithmetic on the assembled
    // v3 delivery. Runs on the CR shell twin (still installed): the full
    // mode needs a v3 wire, and the twin's disk is the assembly source.
    {
      const cc5 = failCount;
      await crGoto(CR_URL);
      // a SHORT soft shot on purpose: the associated plan is the FULL shot
      // (endT null — that is the design), and the twin checkpoints the
      // whole file prefix into sessionStorage on plan-carrying chunks
      // (persist() does NOT swallow QuotaExceededError — the refusal fails
      // the render and the wire aborts), so the delivery must stay in
      // CR1's proven ~2.6 MB size class. Measured: the first cut of this
      // arm shot v0 1.4 at the card default res → 8.1 s clip → the
      // checkpoint blew the twin's ~5M-char quota mid-render (16 chunks
      // then abort) while the ENGINE rendered the same plan clean (488
      // frames, 3.34 MB at 720p) — a TWIN disk limit, not a product law.
      // Angled away from the rack: the cue ball rolls out alone and the
      // record stays short.
      await crFire('[LEAD4 shot]',
        { v0: 0.5, phi: Math.PI / 2 + 0.9, theta: 0, a: 0, b: 0 });
      const sid5 = (await chrome.eval('window.__archive.flush()'
        + '.then(() => window.__archive.sessions())'))[0]?.id;
      if (!Number.isFinite(sid5)) fail('[LEAD4] no archived session');
      if (await chrome.eval(`window.__playback.openSession(${sid5})`) !== true) {
        fail('[LEAD4] session open refused');
      }
      await crWait('window.__playback.playerOpen() === true', '[LEAD4] player');
      const st5 = await chrome.eval(
        'JSON.parse(JSON.stringify(window.__playback.state()))');
      if (!(st5.leads[0] > 1.25) || Math.abs(st5.cum[0] - st5.leads[0]) > 1e-9) {
        fail(`[LEAD4] precondition: lead 0 (${st5.leads[0]}) must own the `
          + `(0, 1.2) window (cum0 ${st5.cum[0]})`);
      }
      await chrome.eval('window.__playback.setTrim(0, 1.2)'); // the pre-363 literal
      const plan5 = await chrome.eval(
        'JSON.parse(JSON.stringify(window.__playback.plan()))');
      if (plan5.records.length !== 1
        || plan5.opts.trims[0].startT !== 0
        || plan5.opts.trims[0].endT !== null
        || plan5.opts.leads?.[0]?.tier !== 'v2'
        || plan5.opts.leads[0].fuse !== false
        || Math.abs(plan5.opts.leads[0].sec - st5.leads[0]) > 1e-9) {
        fail('[LEAD4] a lead-only window must plan the parent shot as ONE '
          + 'full lead-bearing slice (RED pre-433: an empty plan): '
          + JSON.stringify({ records: plan5.records.length,
            trims: plan5.opts.trims, leads: plan5.opts.leads ?? null }));
      }
      await chrome.eval(`(() => {
        window.__crShell.ops.length = 0;
        delete window.__crShell.delivered;
        sessionStorage.removeItem('cr-kill');
        sessionStorage.removeItem('cr-shell');
      })()`);
      await chrome.eval('window.__playback.save()');
      await crWait('window.__playback.cardOpen() === true', '[LEAD4] card');
      // 720p (the arm-3d idiom): the twin-quota belt above — resolution is
      // irrelevant to the association truth this arm gates, and want5's
      // frame arithmetic is resolution-independent
      await chrome.eval(`(() => {
        const s = document.querySelector('#ob-pb-card select');
        s.value = '720';
        s.dispatchEvent(new Event('change'));
      })()`);
      await crWait(`window.__playback.setExportMode('full') === true`,
        '[LEAD4] full mode switch', 60, 300);
      await crWait(`(() => {
        const b = document.querySelector('.ob-pb-dest[data-dest=files]');
        return !!b && !b.disabled;
      })()`, '[LEAD4] files starter tile ARMED (RED pre-433: dead tiles, '
        + 'no note)', 60, 200);
      await chrome.eval(
        'document.querySelector(".ob-pb-dest[data-dest=files]").click()');
      await crWait(`document.querySelector('.ob-pb-ptext .ob-nums')
        ?.textContent === window.__i18n.t('playback.saved')`,
      '[LEAD4] delivery painted Saved', 600, 500);
      const wire5 = await chrome.eval(`(() => ({
        seq: window.__crShell.ops.map((o) => o.op).join(','),
        debt: sessionStorage.getItem('cr-shell') }))()`);
      if (!/^begin(,chunk)+,end$/.test(wire5.seq) || wire5.debt !== null) {
        fail(`[LEAD4] wire shape wrong: ${JSON.stringify(wire5)}`);
      }
      const dlv5 = crAssemble(String(await chrome.eval(
        `(window.__crShell.delivered ?? null)`)));
      const f5 = path.join(OUTDIR, 'lead4-leadonly.mp4');
      fs.writeFileSync(f5, dlv5);
      // the engine's own frame arithmetic (the plannedFullFrames mirror,
      // one lead-bearing slice, no beat): head + play(+cue tail) + tail —
      // GH-489 #637 LAND-17 PM: the play term is max(kernel + cue tail, the
      // record's sink completion), the engine's per-segment law (a late-drop
      // record would otherwise make this row lie); st5.completions is the
      // DVR's per-record term read at its own staging
      const want5 = planPlayback({
        duration: Math.max(st5.durs[0] + st5.tails[0], st5.completions?.[0] ?? st5.durs[0]), slowmo: 1,
        startT: 0, endT: null, tailSec: TAIL_SEC,
        headSec: plan5.opts.leads[0].sec, maxSec: Infinity }).frames;
      const fv5 = crProbe(f5, ['-select_streams', 'v:0', '-show_entries',
        'stream=codec_name', '-of', 'csv=p=0']);
      const fa5 = crProbe(f5, ['-select_streams', 'a:0', '-show_entries',
        'stream=codec_name', '-of', 'csv=p=0']);
      const frames5 = Number(crProbe(f5, ['-count_frames', '-select_streams',
        'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0']));
      if (fv5 !== 'h264' || fa5 !== 'aac' || frames5 !== want5) {
        fail(`[LEAD4] delivered ${fv5}+${fa5}, ${frames5} frames — want `
          + `h264+aac with EXACTLY ${want5} (lead head `
          + `${Math.round(plan5.opts.leads[0].sec * 60)} + play + tail: the `
          + 'delivered clip opens at the lead and includes the strike)');
      }
      const errs5 = await chrome.eval('__test.errors.slice()');
      if (errs5.length) fail('[LEAD4] app errors: ' + errs5.join(' | '));
      if (failCount === cc5) {
        console.log('[LEAD4] OK — the pre-363 literal (0, 1.2) lead-only '
          + 'window ASSOCIATES: starter tile armed, v3 delivery complete '
          + `(${frames5} frames == lead head + full shot — the clip opens `
          + 'at the lead and includes the strike)');
      }
    }

    // ---- PS4 (GH-472 + GH-997): an over-policy loss at the DELIVERY wall ---
    // in FULL mode. Two ADJACENT frames the platform surrenders on EVERY
    // attempt defeat the in-place repair (the retry budget spends) and a
    // 2-frame hold would visibly stutter, so the wall refuses the file —
    // the honesty wall never weakens. But nothing is thrown away: the card
    // KEEPS the persisted plan (the GH-472 draft) AND, since GH-997, holds
    // the COMPLETE file's v3 stream open, so the 'truncated' banner offers
    // Save anyway (the held stream's `end` — the file ships minus the two
    // frames) beside Start over (abort the held stream, restart the plan
    // frame-exact) and Discard (abort + clear). A kept draft whose stream
    // was NOT held (released by a superseding event) still re-offers at
    // boot from the plan row's own marker — the GH-472 reload law, staged
    // here by re-persisting the captured draft row before a reload.
    // RED pre-472: plan cleared, no banner; RED pre-997: the stream was
    // aborted at once and no Save anyway existed.
    {
      const cp4 = failCount;
      await crGoto(CR_URL + '&u=ps472');
      await crFire('[PS4 shot A]', { v0: 1.6, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
      await crFire('[PS4 shot B]', { v0: 0.9, phi: 0.4, theta: 0, a: 0, b: 0 });
      // the platform-boundary drop rig: per-frame surrender budgets
      // (outputs eaten, NO error, NO visibility event); re-evaluated after
      // every reload (a fresh document boots unwrapped)
      const ps4Rig = `(() => {
        if (window.__ps4) return true;
        const Native = window.VideoEncoder;
        const st = { dropAt: {}, dropped: 0 };
        window.__ps4 = { st, Native };
        const Wrapped = function (init) {
          const inner = new Native({
            error: init.error,
            output: (chunk, meta) => {
              const fi = Math.round(chunk.timestamp * 60 / 1e6);
              if (st.dropAt[fi] > 0) { st.dropAt[fi]--; st.dropped++; return; }
              init.output(chunk, meta);
            },
          });
          const self = Object.create(Wrapped.prototype);
          self.__inner = inner;
          return self;
        };
        Wrapped.prototype = {
          configure(c) { return this.__inner.configure(c); },
          encode(f, o) { return this.__inner.encode(f, o); },
          flush() { return this.__inner.flush(); },
          close() { return this.__inner.close(); },
          reset() { return this.__inner.reset(); },
          get encodeQueueSize() { return this.__inner.encodeQueueSize; },
          get state() { return this.__inner.state; },
        };
        Wrapped.isConfigSupported = (c) => Native.isConfigSupported(c);
        window.VideoEncoder = Wrapped;
        return true;
      })()`;
      const ps4Banner = () => chrome.eval(`(() => {
        const q = (c) => document.querySelector('#ob-resume-banner ' + c);
        const vis = (el) => !!el && el.style.display !== 'none'
          && el.getBoundingClientRect().width > 0;
        const save = q('.ob-pb-resume-save');
        let hit = false;
        if (vis(save)) {
          const b = save.getBoundingClientRect();
          hit = document.elementFromPoint(b.x + b.width / 2,
            b.y + b.height / 2) === save;
        }
        return { state: window.__playback.resumeState(),
          text: q('.ob-pb-resume-text')?.textContent ?? null,
          go: vis(q('.ob-pb-resume-go')), discard: vis(q('.ob-pb-resume-discard')),
          save: vis(save), saveText: save?.textContent ?? null, saveHit: hit };
      })()`);
      const ps4Plan = () => chrome.eval(`import('./app/export-resume.js')`
        + `.then((m) => m.loadPlan()).then((p) => (p ? { json: p.json, `
        + `hash: p.hash, draft: p.draft ?? null } : null)).catch(() => 'err')`);
      // drive a full export into the over-policy wall: the surrender budget
      // targets two adjacent frames well AHEAD of the running feed
      const ps4Truncate = async (tag) => {
        await chrome.eval(ps4Rig);
        await chrome.eval(`window.__ps4.st.dropAt = {}; window.__ps4.st.dropped = 0;`
          + ` window.__crShell.ops.length = 0; delete window.__crShell.delivered; true`);
        await crStartFull(tag);
        let done = 0;
        let want = 0;
        for (let i = 0; i < 400; i++) {
          const pr = await chrome.eval('__export.drillProgress()');
          done = pr?.done ?? 0;
          want = pr?.total ?? 0;
          if (want > 0) break;
          await sleep(25);
        }
        const K = Math.floor(want * 0.7);
        await chrome.eval(`window.__ps4.st.dropAt = { ${K}: 9, ${K + 1}: 9 }; true`);
        const late = (await chrome.eval('__export.drillProgress()?.done')) ?? want;
        if (!(want > 40) || late >= K - 2) {
          fail(`${tag} staging: the surrender budget at ${K} landed behind the `
            + `feed (done ${late} of ${want})`);
        }
        for (let i = 0; i < 900; i++) {
          const st = await chrome.eval(`({ state: window.__playback.resumeState(),
            prog: __export.drillProgress() })`);
          if (st.state === 'truncated' && st.prog === null) break;
          await sleep(200);
        }
        return { want, K };
      };

      // ---- leg 1: the refusal shape + Save anyway -------------------------
      const { want: want4 } = await ps4Truncate('[PS4]');
      const ops4 = await chrome.eval(`window.__crShell.ops.map((o) => o.op)`);
      if (ops4.includes('abort') || ops4.includes('end')) {
        fail(`[PS4] the refused file's stream must be HELD for the offer (no `
          + `abort, no end yet — RED pre-997: aborted at once): ${ops4.join(',')}`);
      }
      const paint4 = await chrome.eval(
        'document.querySelector(".ob-pb-ptext span")?.textContent ?? null');
      const wantPaint4 = await chrome.eval(`__i18n.t('export.failed', {`
        + ` message: __i18n.t('export.encoderTruncated',`
        + ` { got: ${want4 - 2}, want: ${want4} }) })`);
      if (paint4 !== wantPaint4) {
        fail(`[PS4] card paint "${paint4}" != the honest truncation "${wantPaint4}"`);
      }
      const b4 = await ps4Banner();
      const wantSalv4 = await chrome.eval(`__i18n.t('export.resume.salvage',`
        + ` { lost: 2, want: ${want4} })`);
      const wantSave4 = await chrome.eval(`__i18n.t('export.salvage.save')`);
      if (b4.state !== 'truncated' || b4.text !== wantSalv4 || !b4.go
        || !b4.discard || !b4.save || b4.saveText !== wantSave4 || !b4.saveHit) {
        fail(`[PS4] salvage offer wrong: ${JSON.stringify(b4)} want text `
          + `"${wantSalv4}" + a visible, hit-testable "${wantSave4}"`);
      }
      const plan4 = await ps4Plan();
      if (!plan4 || plan4 === 'err') {
        fail('[PS4] persisted plan did not survive the truncation failure');
      } else if (!(plan4.draft?.got === want4 - 2 && plan4.draft?.want === want4)) {
        fail(`[PS4] kept row lacks the RESTART-ONLY draft marker `
          + `(${JSON.stringify(plan4.draft)})`);
      }
      const seq4 = await chrome.eval(
        `window.__crShell.ops.filter((o) => o.op === 'chunk').length`);
      await chrome.eval('document.querySelector("#ob-resume-banner .ob-pb-resume-save")?.click(); true');
      let sv4 = null;
      for (let i = 0; i < 300; i++) {
        await sleep(200);
        sv4 = await chrome.eval(`({ state: window.__playback.resumeState(),
          end: window.__crShell.ops.find((o) => o.op === 'end') ?? null })`);
        if (sv4.state === 'saved' || sv4.state === 'failed'
          || sv4.state === 'cancelled') break;
      }
      if (sv4?.state !== 'saved' || !sv4?.end || sv4.end.chunks !== seq4) {
        fail(`[PS4] Save anyway did not deliver the held file: ${JSON.stringify(sv4)} `
          + `(want end with chunks ${seq4})`);
      } else {
        const f4s = path.join(OUTDIR, 'ps4-salvage.mp4');
        fs.writeFileSync(f4s, crAssemble(String(await chrome.eval(
          '(window.__crShell.delivered ?? null)'))));
        const fr4s = Number(crProbe(f4s, ['-count_frames', '-select_streams',
          'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0']));
        if (fr4s !== want4 - 2) {
          fail(`[PS4] the salvaged delivery decodes ${fr4s} samples, want ${want4 - 2}`);
        }
        const derr4 = decodeErrors(f4s);
        if (derr4) fail(`[PS4] the salvaged delivery does not decode clean: ${derr4.slice(0, 300)}`);
        if (sv4.end.bytes !== fs.statSync(f4s).size) {
          fail(`[PS4] end.bytes ${sv4.end.bytes} != delivered ${fs.statSync(f4s).size}`);
        }
      }
      if ((await ps4Plan()) !== null) fail('[PS4] plan not cleared after Save anyway');
      await chrome.eval(`document.querySelector('#ob-resume-banner`
        + ` .ob-pb-resume-discard')?.click(); true`); // saved → Close

      // ---- leg 2: Start over releases the held stream, restarts exact ----
      await ps4Truncate('[PS4b]');
      if ((await chrome.eval('window.__playback.resumeState()')) !== 'truncated') {
        fail('[PS4b] second truncation did not re-offer the draft');
      }
      await chrome.eval(`window.__ps4.st.dropAt = {}; window.__crShell.ops.length = 0;`
        + ` delete window.__crShell.delivered; true`);
      await chrome.eval('document.querySelector("#ob-resume-banner .ob-pb-resume-go")?.click(); true');
      let run4 = null;
      for (let i = 0; i < 900; i++) {
        await sleep(300);
        run4 = await chrome.eval(`({ state: window.__playback.resumeState(),
          ops: window.__crShell.ops.map((o) => o.op) })`);
        if (run4.state === 'saved' || run4.state === 'failed'
          || run4.state === 'resumeFailed' || run4.state === 'cancelled') break;
      }
      const ia = run4?.ops?.indexOf('abort') ?? -1;
      const ib = run4?.ops?.indexOf('begin') ?? -1;
      if (run4?.state !== 'saved' || !(ia >= 0 && ia < ib)) {
        fail(`[PS4b] Start over must abort the held stream BEFORE its begin and `
          + `finish: ${JSON.stringify(run4)}`);
      } else {
        const f4 = path.join(OUTDIR, 'ps4-restart.mp4');
        fs.writeFileSync(f4, crAssemble(String(await chrome.eval(
          '(window.__crShell.delivered ?? null)'))));
        const frames4 = Number(crProbe(f4, ['-count_frames', '-select_streams',
          'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0']));
        if (frames4 !== want4) {
          fail(`[PS4b] restart delivery decodes ${frames4} frames, want EXACTLY ${want4}`);
        }
        if ((await ps4Plan()) !== null) fail('[PS4b] plan not cleared after the restart');
      }
      await chrome.eval(`document.querySelector('#ob-resume-banner`
        + ` .ob-pb-resume-discard')?.click(); true`);

      // ---- leg 3: Discard aborts the held stream and clears the draft ----
      await ps4Truncate('[PS4c]');
      await chrome.eval(`window.__crShell.ops.length = 0; true`);
      await chrome.eval(`document.querySelector('#ob-resume-banner`
        + ` .ob-pb-resume-discard')?.click(); true`);
      await sleep(800);
      const disc4 = await chrome.eval(`({
        state: window.__playback.resumeState(),
        banner: !!document.getElementById('ob-resume-banner'),
        abort: window.__crShell.ops.some((o) => o.op === 'abort'),
        debt: sessionStorage.getItem('cr-shell') })`);
      const planDisc4 = await ps4Plan();
      if (disc4.state !== null || disc4.banner || !disc4.abort
        || disc4.debt !== null || planDisc4 !== null) {
        fail(`[PS4c] Discard must abort the held stream and clear banner + plan: `
          + JSON.stringify({ ...disc4, plan: planDisc4 }));
      }

      // ---- leg 4: a kept draft with NO held stream re-offers at BOOT -----
      // (the GH-472 reload law — the plan row's own marker is the warrant)
      if (plan4 && plan4 !== 'err') {
        await chrome.eval(`import('./app/export-resume.js').then((m) => `
          + `m.persistPlan(${JSON.stringify(plan4.json)}, ${JSON.stringify(plan4.hash)},`
          + ` { draft: ${JSON.stringify(plan4.draft)} })).then(() => true)`);
        await crGoto(CR_URL + '&u=ps472');
        await crWait(`window.__playback?.resumeState?.() === 'truncated'`,
          '[PS4d] kept-draft BOOT re-offer', 100, 300);
        const boot4 = await ps4Banner();
        const wantBanner4 = await chrome.eval(`__i18n.t('export.resume.truncated',`
          + ` { got: ${want4 - 2}, want: ${want4} })`);
        if (boot4.text !== wantBanner4 || boot4.save) {
          fail(`[PS4d] boot re-offer wrong (no stream is held, so no Save anyway): `
            + `${JSON.stringify(boot4)} want "${wantBanner4}"`);
        }
        await chrome.eval(`window.__crShell.ops.length = 0;`
          + ` delete window.__crShell.delivered; true`);
        await chrome.eval(
          'document.querySelector("#ob-resume-banner .ob-pb-resume-go")?.click(); true');
        let runD = null;
        for (let i = 0; i < 900; i++) {
          await sleep(300);
          runD = await chrome.eval('window.__playback.resumeState()');
          if (['saved', 'failed', 'resumeFailed', 'cancelled'].includes(runD)) break;
        }
        if (runD !== 'saved') fail(`[PS4d] Continue did not finish the draft: ${runD}`);
        await chrome.eval(`document.querySelector('#ob-resume-banner`
          + ` .ob-pb-resume-discard')?.click(); true`);
      }
      // ---- L9 (GH-997): the CLIP card's salvage offer — the owner's path --
      // The playback Save-video card in its default montage mode (buffered
      // mp4, the likely route of the phone report): the same over-policy
      // hole reads the salvage prompt with a hit-testable "Save anyway"
      // beside the CTA relabelled "Export again"; Save anyway installs the
      // render as the card's delivered clip (destination tiles armed) and
      // the Files tile ships it minus the two frames. RED pre-997: "export
      // failed: video encoder dropped frames (…) — no file written".
      {
        const c9 = failCount;
        await crGoto(CR_URL + '&u=l997');
        await crFire('[L9 shot]', { v0: 1.6, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
        await chrome.eval(ps4Rig);
        const sid9 = (await chrome.eval('window.__archive.flush()'
          + '.then(() => window.__archive.sessions())'))[0]?.id;
        await chrome.eval(`window.__playback.openSession(${sid9})`);
        await crWait('window.__playback.playerOpen() === true', '[L9] player');
        const lead9 = await chrome.eval('window.__playback.leads()?.leads?.[0] ?? 0');
        await chrome.eval(`window.__playback.setTrim(0, ${(lead9 + 1.2).toFixed(4)})`);
        await chrome.eval('window.__playback.save()');
        await crWait('window.__playback.cardOpen() === true', '[L9] card');
        await crWait(`window.__playback.setExportMode('montage') === true`,
          '[L9] montage mode', 60, 300);
        await crWait(`(() => { const b = document.querySelector('.ob-pb-go');
          return !!b && !b.disabled && b.style.display !== 'none'; })()`,
        '[L9] Export CTA armed', 60, 200);
        await chrome.eval(`window.__ps4.st.dropAt = {}; window.__crShell.ops.length = 0;`
          + ` delete window.__crShell.delivered; document.querySelector('.ob-pb-go').click(); true`);
        let want9 = 0;
        for (let i = 0; i < 400 && !want9; i++) {
          want9 = (await chrome.eval('__export.drillProgress()?.total')) ?? 0;
          if (!want9) await sleep(25);
        }
        const K9 = Math.floor(want9 * 0.7);
        await chrome.eval(`window.__ps4.st.dropAt = { ${K9}: 9, ${K9 + 1}: 9 }; true`);
        const late9 = (await chrome.eval('__export.drillProgress()?.done')) ?? want9;
        if (!(want9 > 40) || late9 >= K9 - 2) {
          fail(`[L9] staging: the surrender budget at ${K9} landed behind the `
            + `feed (done ${late9} of ${want9})`);
        }
        await crWait(`(() => { const b = document.querySelector('.ob-pb-salvage');
          return !!b && b.style.display !== 'none'; })()`, '[L9] salvage offer', 300, 200);
        const ui9 = await chrome.eval(`(() => {
          const sv = document.querySelector('.ob-pb-salvage');
          if (!sv) {
            return { missing: 'no .ob-pb-salvage control', ptext: document
              .querySelector('.ob-pb-ptext span')?.textContent ?? null };
          }
          const b = sv.getBoundingClientRect();
          return { ptext: document.querySelector('.ob-pb-ptext span')?.textContent ?? null,
            saveText: sv.textContent,
            hit: b.width > 0 && document.elementFromPoint(b.x + b.width / 2,
              b.y + b.height / 2) === sv,
            go: document.querySelector('.ob-pb-go').textContent,
            prompt: __i18n.t('export.salvage.prompt', { lost: 2, want: ${want9} }),
            save: __i18n.t('export.salvage.save'),
            retry: __i18n.t('export.salvage.retry') };
        })()`);
        if (ui9.ptext !== ui9.prompt || ui9.saveText !== ui9.save || !ui9.hit
          || ui9.go !== ui9.retry) {
          fail(`[L9] clip-card salvage offer wrong: ${JSON.stringify(ui9)}`);
        } else {
          await chrome.eval(`document.querySelector('.ob-pb-salvage').click(); true`);
          await crWait(`(() => { const b = document.querySelector('.ob-pb-dest[data-dest=files]');
            return !!b && !b.disabled; })()`, '[L9] files tile armed after Save anyway', 60, 200);
          const kept9 = await chrome.eval(`(() => ({
            ptext: document.querySelector('.ob-pb-ptext span')?.textContent ?? '',
            salvage: document.querySelector('.ob-pb-salvage').style.display,
            go: document.querySelector('.ob-pb-go').textContent,
            start: __i18n.t('export.start') }))()`);
          if (!/\S/.test(kept9.ptext) || kept9.salvage !== 'none' || kept9.go !== kept9.start) {
            fail(`[L9] Save anyway did not install the clip: ${JSON.stringify(kept9)}`);
          }
          await chrome.eval(
            'document.querySelector(".ob-pb-dest[data-dest=files]").click(); true');
          await crWait('typeof window.__crShell.delivered === "string"',
            '[L9] the kept clip reached the shell', 150, 200);
          const f9 = path.join(OUTDIR, 'l9-clip-salvage.mp4');
          fs.writeFileSync(f9, crAssemble(String(await chrome.eval(
            '(window.__crShell.delivered ?? null)'))));
          const fr9 = Number(crProbe(f9, ['-count_frames', '-select_streams',
            'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0']));
          if (fr9 !== want9 - 2) {
            fail(`[L9] the kept clip decodes ${fr9} samples, want ${want9 - 2}`);
          }
          const derr9 = decodeErrors(f9);
          if (derr9) fail(`[L9] the kept clip does not decode clean: ${derr9.slice(0, 300)}`);
        }
        if (failCount === c9) {
          console.log(`[L9] OK — the clip card refused a 2-frame hole with a `
            + `hit-testable "Save anyway" beside "Export again"; the kept clip `
            + `shipped through the Files tile (${want9 - 2} of ${want9} samples)`);
        }
      }
      // ---- leg 5 (review GH-997 r1): the restart latch is taken BEFORE the
      // held-stream release is awaited. The twin's abort reply is delayed
      // 2.5 s: (e1) a double Start over must run ONE restart; (e2) a
      // Discard press inside the release await is the running state's
      // Cancel — the attempt cancels with its banner intact, never a banner
      // removed under a still-rendering run. RED pre-fix: the second press
      // re-entered the run / Discard removed the banner mid-attempt.
      {
        const slowAbort = `(() => {
          const h = window.webkit.messageHandlers.obSaveVideoStream;
          if (!h.__fast) {
            h.__fast = h.postMessage;
            h.postMessage = (m) => (m?.op === 'abort'
              ? new Promise((res) => setTimeout(res, 2500)).then(() => h.__fast(m))
              : h.__fast(m));
          }
          return true;
        })()`;
        const fastAbort = `(() => {
          const h = window.webkit.messageHandlers.obSaveVideoStream;
          if (h.__fast) { h.postMessage = h.__fast; delete h.__fast; }
          return true;
        })()`;
        // e1: double Start over
        await ps4Truncate('[PS4e1]');
        await chrome.eval(slowAbort);
        await chrome.eval(`window.__ps4.st.dropAt = {}; window.__crShell.ops.length = 0;`
          + ` delete window.__crShell.delivered; true`);
        await chrome.eval(`(() => {
          const go = () => document.querySelector('#ob-resume-banner .ob-pb-resume-go')?.click();
          go();
          setTimeout(go, 150);
          return true;
        })()`);
        let e1 = null;
        for (let i = 0; i < 900; i++) {
          await sleep(300);
          e1 = await chrome.eval(`({ state: window.__playback.resumeState(),
            ops: window.__crShell.ops.map((o) => o.op) })`);
          if (['saved', 'failed', 'resumeFailed', 'cancelled'].includes(e1.state)) break;
        }
        const begins1 = (e1?.ops ?? []).filter((o) => o === 'begin').length;
        if (e1?.state !== 'saved' || begins1 !== 1) {
          fail(`[PS4e1] a double Start over must run ONE restart (RED pre-fix: `
            + `re-entered): ${JSON.stringify(e1)}`);
        }
        await chrome.eval(`document.querySelector('#ob-resume-banner`
          + ` .ob-pb-resume-discard')?.click(); true`);
        // e2: Discard pressed inside the release await
        await chrome.eval(fastAbort);
        await ps4Truncate('[PS4e2]');
        await chrome.eval(slowAbort);
        await chrome.eval(`window.__ps4.st.dropAt = {}; window.__crShell.ops.length = 0;`
          + ` delete window.__crShell.delivered; true`);
        await chrome.eval(`(() => {
          document.querySelector('#ob-resume-banner .ob-pb-resume-go')?.click();
          setTimeout(() => document.querySelector('#ob-resume-banner'
            + ' .ob-pb-resume-discard')?.click(), 300);
          return true;
        })()`);
        let e2 = null;
        for (let i = 0; i < 300; i++) {
          await sleep(300);
          e2 = await chrome.eval(`({ state: window.__playback.resumeState(),
            banner: !!document.getElementById('ob-resume-banner'),
            ops: window.__crShell.ops.map((o) => o.op),
            prog: __export.drillProgress() })`);
          if (['saved', 'failed', 'resumeFailed', 'cancelled'].includes(e2.state)
            || (!e2.banner && e2.prog === null)) break;
        }
        await sleep(3000); // an orphaned run would start rendering inside this
        const e2b = await chrome.eval(`({ state: window.__playback.resumeState(),
          banner: !!document.getElementById('ob-resume-banner'),
          ops: window.__crShell.ops.map((o) => o.op),
          prog: __export.drillProgress() })`);
        if (e2b.state !== 'cancelled' || !e2b.banner || e2b.prog !== null
          || e2b.ops.includes('begin')) {
          fail(`[PS4e2] Discard inside the release await must cancel the attempt `
            + `with its banner intact (RED pre-fix: banner removed, run orphaned): `
            + JSON.stringify(e2b));
        }
        await chrome.eval(`document.querySelector('#ob-resume-banner`
          + ` .ob-pb-resume-discard')?.click(); true`);
        await chrome.eval(fastAbort);
      }
      await chrome.eval(`(() => {
        if (window.__ps4) { window.VideoEncoder = window.__ps4.Native; delete window.__ps4; }
        return true;
      })()`);
      const errs4 = await chrome.eval('__test.errors.slice()');
      if (errs4.length) fail('[PS4] app errors: ' + errs4.join(' | '));
      if (failCount === cp4) {
        console.log(`[PS4] OK — a 2-frame persistent hole was refused (honest `
          + `${want4 - 2}/${want4} paint) with the plan kept AND the complete `
          + `file's stream held: Save anyway delivered it (${want4 - 2} samples), `
          + `Start over aborted the held stream before a frame-exact restart, `
          + `Discard aborted + cleared, and a stream-less kept draft re-offered `
          + 'at boot');
      }
    }
    await chrome.send('Page.removeScriptToEvaluateOnNewDocument',
      { identifier: crMock });
  }

  if (!process.exitCode) console.log('E2E-EXPORT PASS');
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
