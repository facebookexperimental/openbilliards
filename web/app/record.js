// Copyright (c) Meta Platforms, Inc. and affiliates.

// record.js — in-app video capture: canvas.captureStream(60) muxed with the
// WebAudio master mix (sound.js captureStream tap, when available) into a
// MediaRecorder (webm vp9 preferred, vp8/webm fallback; mp4/h264 on WebKits
// that negotiate no webm — GH-157 measured that real device WebKit DOES
// negotiate webm too). Stopping hands the file over —
// `openbilliards-<timestamp>.<ext>` via anchor
// download in browsers (the macOS shell routes anchors through its
// WKDownloadDelegate), or the native share sheet through the obShare bridge
// inside the iOS shell (issue #51). Feature-detected: no MediaRecorder /
// captureStream / usable mime → window.__record.supported = false.
//
// GH-225 Phase D (030 the design charter DVR amendment clause 4): this module ships
// NO CHROME. The toolbar Record pill, the phone record dock and the phone
// settings-sheet Record row are RETIRED — the DVR (playback.js) is the
// recording surface, "always recording" by construction.
//
// GH-251 (2026-07-31, the removal wave the owner's device verdict elected):
// the KEPT-BUT-PRODUCERLESS legs recorded by the Phase D census are now
// DELETED, leg by leg, after GH-250/GH-252 settled which of them regained
// producers. GONE: deliver()'s obPhotos branch (shellPhotosFile) + the
// pendingSaves/rescuePendingSave map + the ob:photos-result listener +
// record.savedPhotos; the GH-157 transcode trio (wantsTranscode/
// transcodeThenDeliver/runTranscodeJob) + the #ob-prepare/#ob-prepare-shield
// progress surface + record.prepareFailed; routeSave's opts.ui branch →
// offerQuality → record-quality.js (file deleted) → runHdSave +
// record.hdFailed; and the transcoding()/lastTranscode()/preparing()/
// hdSaving() seam members that only observed that machinery. transcode.js
// itself is NOT gone — the DVR save card is its production producer since
// GH-252 (guarded dynamic import + probe, delivery owned by the card).
//
// WHAT REMAINS is exactly the produced machinery: mime negotiation
// (webm-first law), start/stop, the pause/resume machine (kept by ruling —
// frozen GH-139 seam shape, e2e-record drives it), elapsedMs banking, the
// ADDITIVE lastRecording() getter (GH-250 — the DVR card's blob handoff),
// the ADDITIVE lastFinalize()/captureStats() evidence seams (GH-1125,
// numbers only — e2e-record tells an empty capture from a slow one),
// deliver()'s obShare + anchor legs with the record.savedDownload toast
// (export.js's realtime tier, desktop), and transcodeProbe (capability
// evidence over the LIVE transcode.js — the iOS capabilities scenario reads
// it). Production callers: export.js runRealtime (start/stop(false)/
// stop(!noDownload, { photos:false }) — the photos hint is vacuous now and
// accepted for seam-shape compatibility) and playback.js startRealtime
// (start(false)/stop(false)/lastRecording() — video-only: the DVR bed
// replays silent by design, so start(true) would mux a silence track;
// review round-1 P2).
//
// Post-freeze module (the the ownership ledger parallel-wave freeze has ended):
// wired from main.js like the stream modules; coordinates through the
// settings ctx only (no machine hooks needed — capture is state-agnostic).
import { t } from './i18n.js';
import { ctx } from './settings.js';

// webm stays FIRST so Chrome-family artifacts are byte-shape unchanged
// (e2e-record.mjs asserts a webm blob); the mp4 candidates light the path
// up on WebKits whose MediaRecorder speaks only mp4/h264. Issue GH-157
// measured that BOTH simulator and device WKWebView negotiate webm too
// (the #51 "device records no webm" QA claim is falsified on hardware) —
// the ordering stays FROZEN webm-first (Chrome byte-shape law); the shell
// Photos path is the DVR save card's (GH-252 probed transcode + the
// obSaveVideo wire), never a mime reorder here.
const MIMES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];

/** Shell share-sheet handoff (feature 016 obShare bridge, issue #51):
 * WKWebView has no download/UI delegate, so an anchor blob click silently
 * dead-ends in the shell. When the bridge is present the bytes go to the
 * native share sheet instead (bridge-CAPABILITY detection, never UA
 * sniffing — haptics.js precedent); browsers keep the anchor path.
 * Returns true when the bridge took the file.
 * MODULE-PRIVATE by law: exporting it for export.js would add a new named
 * import edge between boot-graph modules (the ownership ledger rule 5 corollary —
 * a stale importer/dependency pairing dies as a SyntaxError before any
 * error handler exists), so export.js carries its own copy. */
// ShareMessage.maxBytes mirror (share-bridge.md §3) — the native gate
// silently drops anything bigger, so the page pre-flights BEFORE the
// main-thread FileReader read + base64 encode (issue #51 review F1).
const SHARE_MAX_BYTES = 384 * 1024 * 1024;

function shellShareFile(blob, name) {
  const bridge = window.webkit?.messageHandlers?.obShare;
  if (!bridge) return false;
  if (blob.size > SHARE_MAX_BYTES) {
    // Oversize: never post (the bridge would drop it silently after a
    // hundreds-of-MB read+encode). The bridge existing means we are in the
    // iOS shell, where the anchor path is dead (no download delegate) — so
    // surface the existing visible failure state: the throw escapes
    // rec.onstop to the window error listener → reportError → #err box.
    throw new Error(`recording too large for the share bridge `
      + `(${(blob.size / 1e6).toFixed(0)} MB > `
      + `${(SHARE_MAX_BYTES / 1e6).toFixed(0)} MB cap)`);
  }
  const r = new FileReader();
  r.onload = () => {
    try {
      const b64 = String(r.result).split(',')[1] ?? '';
      bridge.postMessage({ v: 1, name, mime: blob.type, b64 });
    } catch { /* a throwing bridge drops the handoff; nothing to fall back to */ }
  };
  r.onerror = () => {
    // blob read failed inside the shell: fall back to the anchor path so
    // the handoff never silently drops (review 2026-07)
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  r.readAsDataURL(blob);
  return true;
}

export function createRecord({ canvas }) {
  const supported = typeof MediaRecorder !== 'undefined'
    && typeof canvas.captureStream === 'function';
  const mime = supported
    ? MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null : null;
  // container/extension follow the NEGOTIATED mime (webm on Chrome-family,
  // mp4 on WebKit) — every consumer (blob type, download name, export.js
  // realtime tier) derives from this instead of hardcoding webm
  const ext = mime?.startsWith('video/mp4') ? 'mp4' : 'webm';

  let rec = null;      // active MediaRecorder
  let recordingStarted = false; // native start event, not just start() accepted
  let chunks = [];     // the ACTIVE recording's own array — start() makes a
  // fresh one per run and stop()'s onstop closes over ITS array, so a LATE
  // finalize can never consume or clear a newer run's chunks (review
  // round-4 P1)
  let stopGen = 0;     // finalize generation: bumped by every start() AND
  // every stop(), so a superseded onstop (a newer recording exists) never
  // clobbers the lastBlob read surface — its DELIVERY still runs (bytes
  // are never stranded), only the seam read is gated (review round-4 P1)
  let lastBlob = null; // most recently finished recording (e2e read surface)
  let audioTracks = 0; // audio tracks muxed into the ACTIVE/last recording
  let paused = false;  // MediaRecorder.pause() latched (issue GH-139)
  let elapsedBase = 0; // recorded ms accumulated across finished live segments
  let segStart = 0;    // performance.now() at the current live segment start
  let lastSaveTarget = null; // 'photos' | 'share' | 'anchor' (e2e save seam)
  let stats = null;     // GH-1125: the ACTIVE (else the last) recording's capture counters — fresh per start(), the chunks precedent
  let lastFinal = null; // GH-1125: the most recent CURRENT finalize, as numbers (pins no capture)

  /** Save-feedback toast with a TTL (build-4 QA: the savedDownload toast
   * had NO auto-clear and parked at full banner voice over the felt until
   * the next pointerdown or writer — the app's own transient-surface
   * convention is that nothing on #banner/#hud-hint is ever parked:
   * flow.js 1800/2600 ms, HINT_MS 3500). The surviving record.js banner
   * (record.savedDownload — GH-251 removed the photos/prepare toasts) rides
   * this helper: ~4 s to read, tap-dismiss (the #71 window listener) keeps
   * working, and the timer clear is SELECTIVE — it only wipes the surface
   * if it still shows the exact string this toast painted (the drills.js /
   * touch.js GH-145 DOM read-back precedent), so a newer writer (foul
   * banner, next toast) is never clobbered by a stale timer. */
  const TOAST_MS = 4000;
  let toastTimer = 0;
  function toast(text) {
    if (!ctx.hud?.setBanner) return; // main.js-wired; absent on stale graphs
    ctx.hud.setBanner(text);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      const b = document.getElementById('banner');
      if (b && b.textContent === text) ctx.hud.setBanner('');
    }, TOAST_MS);
  }

  /** Recorded wall-clock ms EXCLUDING paused time (issue GH-139): pause()/
   * stop() bank the live segment into elapsedBase; the elapsed chip and the
   * e2e seam read the bank plus the running segment. Stays readable (final
   * total) after stop(). */
  function elapsedMs() {
    return Math.round(elapsedBase
      + (rec && !paused ? performance.now() - segStart : 0));
  }

  // GH-225 Phase D: syncSurfaces() is GONE with the surfaces it painted.
  // It was the GH-81d single-sync choke point (pill .rec class, phone
  // settings-row .rec + data-i18n flip, dock register, GH-156 pill face) for
  // a module that now owns zero chrome. start/pause/resume/stop no longer
  // call it; recording state is read through the window.__record seam
  // (recording()/paused()/elapsedMs()), which is unchanged and frozen.

  /** `withAudio = false` skips the WebAudio tap entirely (the export
   * dialog's un-checked sound toggle — realtime tier). */
  function start(withAudio = true) {
    if (rec || !mime) return false;
    // TRANSACTIONAL (GH-250 review round-3 P2): the module recorder is
    // assigned only once MediaRecorder.start() succeeded — pre-fix, a
    // constructor that succeeded followed by a throwing start() left `rec`
    // set with dead tracks, so recording() read true forever and every
    // retry answered busy until a reload. Any failure stops the tracks and
    // returns false (the seam's refusal shape), never a throw.
    let stream = null;
    try {
      stream = canvas.captureStream(60);
      // Mux the WebAudio master mix when sound.js can tap it. Tracks are
      // CLONED: the tap destination is shared/cached, and stop() below kills
      // our tracks — a clone keeps the original alive for the next recording.
      const audio = withAudio ? ctx.sound?.captureStream?.() : null;
      audioTracks = 0;
      for (const t of audio?.getAudioTracks() ?? []) {
        stream.addTrack(t.clone());
        audioTracks++;
      }
      // GH-197 (fault b, realtime floor): the live-capture bitrate scales
      // with the canvas pixel count (the export.js bitrateFor curve, 12 Mbps
      // at 1080p-equivalent) instead of the flat 8 Mbps that starved retina
      // phone canvases (~3 Mpx). Floor 8 Mbps (today's behavior at ≤1080p),
      // cap 40 Mbps (the 4K export rate); the 384 MiB bridge pre-flights
      // stay the oversize guard.
      const videoBitsPerSecond = Math.max(8_000_000, Math.min(40_000_000,
        Math.round(12_000_000 * (canvas.width * canvas.height) / (1920 * 1080))));
      const r = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond });
      const myChunks = []; // per-recording (round-4 P1) — never shared
      // GH-1125: this recording's own counters (an empty capture is told apart by evidence, never guessed)
      const myStats = { t0: performance.now(), events: 0, emptyEvents: 0, nonEmpty: 0, onstartMs: null, firstDataMs: null, error: null };
      r.ondataavailable = (e) => {
        myStats.events += 1;
        if (!e.data.size) { myStats.emptyEvents += 1; return; }
        myChunks.push(e.data);
        myStats.nonEmpty += 1;
        if (myStats.firstDataMs === null) myStats.firstDataMs = Math.round(performance.now() - myStats.t0);
        // GH-1099 belt: encoded bytes prove frames are flowing, so the first
        // non-empty chunk arms readiness too — on an engine that never fires
        // 'start' the capture begins one timeslice late instead of never
        if (rec === r && r.state !== 'inactive') recordingStarted = true;
      };
      // GH-1099: start() accepts before the first video frame arrives. A
      // superseded/cancelled recorder's late start event cannot arm a new run.
      r.onstart = () => {
        if (myStats.onstartMs === null) myStats.onstartMs = Math.round(performance.now() - myStats.t0);
        if (rec === r && r.state !== 'inactive') recordingStarted = true;
      };
      // GH-1125: evidence only — an errored recorder stops on its own; stop() already handles the inactive case
      r.onerror = (e) => { myStats.error = String(e?.error?.name ?? e?.type ?? 'error'); };
      r.start(1000); // 1 s timeslice: chunks survive even an abrupt tab death
      rec = r; // committed only past the last throw site
      recordingStarted = false;
      chunks = myChunks;
      stats = myStats;
      stopGen += 1; // any pending previous finalize is superseded NOW
    } catch {
      try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* dead */ }
      return false;
    }
    paused = false;
    elapsedBase = 0;
    segStart = performance.now();
    return true;
  }

  /** Pause the live recording (issue GH-139): MediaRecorder.pause() keeps the
   * session (and its 1 s-timeslice chunks) alive while the elapsed clock
   * freezes. Refused when idle or already paused. */
  function pause() {
    if (!rec || paused || rec.state !== 'recording') return false;
    try { rec.pause(); } catch { return false; }
    elapsedBase += performance.now() - segStart;
    paused = true;
    return true;
  }

  /** Resume a paused recording (issue GH-139). Refused unless paused. */
  function resume() {
    if (!rec || !paused) return false;
    try { rec.resume(); } catch { return false; }
    segStart = performance.now();
    paused = false;
    return true;
  }

  /** Hand a FINISHED file over — the surviving GH-139 ladder after the
   * GH-251 removal wave: obShare share sheet (iOS/macOS shells — anchors
   * dead-end there, no download delegate) → anchor download (browsers).
   * Returns the routed target. The obPhotos leg is GONE with its rescue
   * machinery: the DVR save card owns the Photos route now (GH-252
   * transcode + the GH-255/256 obSaveVideo wire), and no shipped surface
   * could reach this ladder's Photos branch since Phase D. Production
   * caller: stop() below (export.js's realtime tier). Exposed on __record
   * as the e2e save-path seam. */
  function deliver(blob, name) {
    if (shellShareFile(blob, name)) {
      lastSaveTarget = 'share';  // the native share sheet is its own feedback
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      lastSaveTarget = 'anchor';
      // web/desktop saved toast (issue GH-139 item 4): TTL'd + tap-dismiss
      toast(t('record.savedDownload'));
    }
    return lastSaveTarget;
  }

  /** Stop and (by default) hand the file over — native share sheet in the
   * shell, anchor download in browsers. e2e passes download=false.
   * A second argument is still ACCEPTED for seam-shape compatibility
   * (export.js's realtime tier passes `{ photos: false }`) but is vacuous
   * since GH-251: the ladder below has no Photos leg to opt out of, so
   * every delivering stop routes share/anchor identically. */
  function stop(download = true) {
    if (!rec) return false;
    recordingStarted = false;
    if (!paused) elapsedBase += performance.now() - segStart; // bank the tail
    paused = false; // a paused session stops clean (export.js stop(false) too)
    const stream = rec.stream;
    const myChunks = chunks; // THIS recording's array (round-4 P1)
    const myStats = stats;   // GH-1125: THIS recording's counters
    const myElapsed = Math.round(elapsedBase); // banked above
    const gen = ++stopGen;   // this finalize's identity
    rec.onstop = () => {
      const nChunks = myChunks.length;
      const blob = new Blob(myChunks, { type: `video/${ext}` });
      myChunks.length = 0;
      stream.getTracks().forEach((t) => t.stop());
      // GH-1125: the finalize's evidence; an EMPTY one reads size 0, delivered false (never a silent skip to the seam)
      const fin = { gen, size: blob.size, chunks: nChunks, events: myStats?.events ?? null, emptyEvents: myStats?.emptyEvents ?? null,
        onstartMs: myStats?.onstartMs ?? null, firstDataMs: myStats?.firstDataMs ?? null, error: myStats?.error ?? null,
        elapsedMs: myElapsed, delivered: false };
      // a SUPERSEDED finalize (a newer recording started meanwhile — the
      // measured multi-second onstop on long captures) must not clobber
      // the newer run's read surface (review round-4 P1)…
      if (gen === stopGen) { lastBlob = blob; lastFinal = fin; }
      // …but its delivery is NEVER suppressed (bytes are never stranded)
      if (download && blob.size > 0) {
        const name = `openbilliards-${new Date().toISOString()
          .slice(0, 19).replace(/[T:]/g, '-')}.${ext}`;
        deliver(blob, name);
        fin.delivered = true;
      }
    };
    // an ALREADY-inactive recorder (encoder error, ended track) throws on
    // stop() — the machine must still return to idle or recording() reads
    // true forever and every later capture is refused as busy (review
    // round-9 P2). onstop may never fire on that path (the caller's
    // bounded polls fail honestly), so the capture RESOURCES release HERE
    // too — live tracks + retained chunks would otherwise accumulate
    // across retries (review round-10 P2).
    try { rec.stop(); } catch {
      try { stream.getTracks().forEach((t) => t.stop()); } catch { /* dead */ }
      myChunks.length = 0;
      rec = null;
      // no onstop will EVER fire on this path — nothing was finalized or
      // delivered, so the caller must hear failure, not success (review
      // round-11 P2: export.js marked a realtime export done over a dead
      // stop; playback.js's bounded no-file poll already failed honestly)
      return false;
    }
    rec = null;
    return true;
  }

  // e2e / debug surface (e2e-record.mjs drives start/stop through this).
  // FROZEN shapes stay: supported/mime/ext/recording/lastSize/audioTracks/
  // start/stop; issue GH-139 extends ADDITIVELY (pause/resume machine + the
  // save-path seam).
  window.__record = {
    supported: !!mime,
    mime, // negotiated MediaRecorder mime (null when unsupported)
    ext,  // container extension the negotiated mime produces (webm | mp4)
    recording: () => !!rec,
    // ADDITIVE GH-1099: a short DVR capture must not advance before the
    // backend starts accepting frames. The synchronous start() shape stays.
    started: () => !!rec && recordingStarted && rec.state !== 'inactive',
    paused: () => paused,      // GH-139: pause/resume machine state
    elapsedMs,                 // GH-139: recorded ms EXCLUDING paused time
    lastSize: () => lastBlob?.size ?? 0,
    // GH-250 (ADDITIVE — frozen shapes untouched): the finished capture's
    // Blob itself, for a caller that owns its OWN delivery (the DVR save
    // card's realtime tier routes the capability-gated destination card,
    // never this module's ladder). stop(false) + poll this until it flips
    // to a NEW blob (rec.onstop is asynchronous — lastSize() precedent).
    lastRecording: () => lastBlob,
    // GH-250 review round-1 P2 (ADDITIVE): drop this module's retaining root
    // of the last capture. A DVR realtime clip is otherwise pinned THREE
    // ways (card lastBlob + export lastResult + here) — the card's
    // releaseBlob() calls all three, so closing the card really frees a
    // phone-sized capture. lastSize() reads 0 after; the next start()
    // repopulates. The release also SUPERSEDES any still-pending finalize
    // (review round-5 P2: a >5 s cancelled onstop landing after this would
    // otherwise repopulate the released blob and re-pin it).
    releaseRecording: () => { lastBlob = null; stopGen += 1; },
    // GH-1125 (ADDITIVE): the latest CURRENT finalize as numbers — { gen, size, chunks, events, emptyEvents, onstartMs,
    // firstDataMs, error, elapsedMs, delivered }. gen is new per stop(), so a caller waits for a NEW gen, not size > 0:
    // an EMPTY finalize (size 0, delivered false) is told apart from one that has not landed. releaseRecording() drops
    // the blob, not this record. Numbers only — pins no capture.
    lastFinalize: () => (lastFinal ? { ...lastFinal } : null),
    // GH-1125 (ADDITIVE): the finalize generation. Read right after stop(), it is THIS stop's gen — the one its
    // lastFinalize() record will carry — so a caller matches on equality (start() and releaseRecording() bump it too).
    finalizeGen: () => stopGen,
    // GH-1125 / #1128 (ADDITIVE): the ACTIVE (else the last) recording's counters — dataavailable events, empty events,
    // non-empty chunks, ms from start() to the native start event and to the first non-empty chunk, the last recorder
    // error — and whether a recording is live: evidence for the empty-capture classes and the first-chunk latency.
    captureStats: () => (stats ? { events: stats.events, emptyEvents: stats.emptyEvents, nonEmpty: stats.nonEmpty,
      onstartMs: stats.onstartMs, firstDataMs: stats.firstDataMs, error: stats.error, live: !!rec } : null),
    lastSaveTarget: () => lastSaveTarget, // GH-139: 'share' | 'anchor' (the
    // 'photos' value left with the obPhotos leg — GH-251)
    audioTracks: () => audioTracks, // 0 = video-only (tap unavailable/off)
    start, stop, pause, resume,
    deliver, // GH-139 save-path seam: route a blob through the delivery ladder
    // Capability evidence over the LIVE transcode.js (GH-157; producered by
    // the DVR card since GH-252 — the iOS capabilities scenario reads this):
    transcodeProbe: () => import('./transcode.js')
      .then((m) => m.probeTranscodeSupport?.() ?? null).catch(() => null),
    // (GH-251: transcoding()/lastTranscode()/preparing()/hdSaving() left
    // with the machinery they observed — see the module header.)
  };
  // GH-251: the module style block left with #ob-prepare/#ob-prepare-shield
  // (its only rules), and the ob:photos-result listener left with the
  // pendingSaves rescue machinery. record.js paints no DOM of its own now.

  return { start, stop };
}
