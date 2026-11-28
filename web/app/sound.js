// Copyright (c) Meta Platforms, Inc. and affiliates.

// sound.js — live playback of a shot's sound: ball-ball click, cushion
// thump, pocket drop and return track, cue strike, bed landings, rolling.
// Sounds are NOT detected per frame — they are pre-derived from the kernel
// ShotRecord (deriveCues: the impact cue list, which the haptics share;
// deriveVoices: the voice plan built on it, synth.js planVoices) and then
// scheduled sample-accurately against the AudioContext clock: an event at
// shot-time e.t plays at ctx.currentTime + (e.t − playbackClock) / rate,
// using a short lookahead window from the 'frame' hook so pause/slow-mo
// stay in sync.
//
// OWNERSHIP (see the ownership ledger (internal)): STREAM-C (share/sound/settings).
// Allowed surface: additive machine.on registrations and read-only
// game.{record, clock} (plus game.{slowmo, paused, duration} reads for the
// clock-rate mapping — reported as a deviation note; and, since the
// impact-realism wave, game.record for the listener's place: the shooter's
// seat. createSound also takes an optional camera for a camera-following pan;
// no caller hands one in yet).
import { ctx as streamCtx } from './settings.js';
// NAMESPACE import on purpose (the ownership ledger rule 5 corollary): sound.js is
// in main.js's static boot graph, and the audio-calibration wave added NEW
// exports to synth.js (acousticProfile, loadSfxBank). A named import of a
// new name dies as a SyntaxError when a returning user's browser pairs this
// fresh module with a heuristically-fresh STALE synth.js (no Cache-Control)
// — before any error handler exists. A namespace binding always links; the
// new names are feature-detected below (synth.acousticProfile?., synth
// .loadSfxBank?.) and a stale synth.js degrades to its own modal voices.
// Do NOT convert to named imports of post-2026-07 synth.js exports.
import * as synth from './synth.js';

const LOOKAHEAD = 0.15;  // wall-clock seconds scheduled ahead
const STALE = 0.05;      // events older than this (shot seconds) are skipped
// impulse audibility gate (m/s of velocity change): kernel settling
// micro-contacts stay silent, deliberate soft touches stay audible
// (audio-calibration 2026-07; the FMOD "min collision volume" pattern)
const MIN_DV = 0.04;

const vec = (v) => ({ x: v.x, y: v.y, z: v.z });
const speed = (v) => Math.hypot(v.x, v.y, v.z);

/** Walk the record's event list tracking per-ball velocity (post-states of
 * earlier events = pre-states of later ones) and derive audible cues:
 * [{ t, type: 'click'|'cushion'|'pocket'|'cue', gain 0..1 }].
 * Impact loudness comes from the struck ball's velocity CHANGE across the
 * event — the normal impulse — so thin grazing cuts and glancing rail
 * touches are quiet even at high ball speed (audio-calibration 2026-07;
 * the middleware "graze factor" technique, kernel-exact here).
 * `evIdx` (optional array, filled in step with the result): evIdx[i] is the
 * index in record.events of the event cue i came from. The voice plan
 * (synth.js planVoices) uses it to read each impact's physical detail from
 * the record; the cue list itself is the same with or without it. */
export function deriveCues(record, evIdx) {
  const vel = new Map(record.initial.balls.map((b) => [b.id, vec(b.state.vel)]));
  const pre = (id) => vel.get(id) ?? { x: 0, y: 0, z: 0 };
  const cues = [];
  for (let ei = 0; ei < record.events.length; ei++) {
    const e = record.events[ei];
    const n0 = cues.length;
    const k = e.kind;
    if (typeof k === 'object') {
      const dv = (id) => {
        const post = e.post.find((p) => p[0] === id);
        if (!post) return 0;
        const b = pre(id), a = post[1].vel;
        return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      };
      if (k.Strike) {
        // cue tick: intensity from the cue ball's velocity change
        cues.push({ t: e.t, type: 'cue', gain: clamp01(dv(k.Strike.ball) / 8) });
      } else if (k.BallBall) {
        // transferred normal impulse — classified by the MAX Δv across the
        // event's participants. b1/b2 are canonical BY ID (events.rs:
        // b1 < b2), not striker/struck, and a compliant-cluster resolution
        // (the break, feature 018) folds every moved ball into ONE BallBall
        // event whose post spans the cluster: b2 alone reads a fraction of
        // the true impact (verified on an 8.5 m/s compliant break: cluster
        // event dv(b2) 3.4 m/s vs 9.6 m/s max — the break classified mid).
        // For plain two-ball events post = [b1, b2] with |Δv| equal by
        // Newton's third law, so non-cluster gains are unchanged.
        let v = 0;
        for (const [pid] of e.post) { const d = dv(pid); if (d > v) v = d; }
        if (v >= MIN_DV) cues.push({ t: e.t, type: 'click', gain: clamp01(v / 7) });
      } else if (k.BallLinearCushion || k.BallCircularCushion) {
        const id = (k.BallLinearCushion ?? k.BallCircularCushion).ball;
        const v = dv(id); // ~(1+e_n)·v_normal: grazing touches stay soft
        if (v >= MIN_DV) cues.push({ t: e.t, type: 'cushion', gain: clamp01(v / 9) });
      } else if (k.BallPocket) {
        cues.push({ t: e.t, type: 'pocket', gain: clamp01(0.3 + speed(pre(k.BallPocket.ball)) / 5) });
      }
    }
    if (evIdx && cues.length > n0) evIdx.push(ei);
    for (const [id, state] of e.post) vel.set(id, vec(state.vel));
  }
  return cues;
}

/** The voices one record's playback sounds: the voice plan when this module
 * is paired with a synth.js that has one (planVoices: the impacts with their
 * physical detail, plus rolling, bed landings and the return track), else the
 * bare cue list in the plan's shape ({ t, type, gain, seed }; seed = the
 * cue's index, the pre-plan seeding law). Shared with the export render
 * (export-audio.js), so live playback and an export voice the same list. */
export function deriveVoices(record, profile) {
  const evIdx = [];
  const cues = deriveCues(record, evIdx);
  if (typeof synth.planVoices === 'function') {
    // The plan reads far more of a record than the cue list does. A record it
    // cannot read (a foreign or damaged one) keeps its sound as the bare cue
    // list, and nothing is thrown into the state machine's emit (state.js
    // runs its listeners unguarded: a throw here would stop the ones after).
    try {
      return synth.planVoices(record, cues, evIdx, { profile });
    } catch { /* the bare list below */ }
  }
  return cues.map((c, i) => ({ t: c.t, type: c.type, gain: c.gain, seed: i }));
}

/** Voice one entry of deriveVoices() (synth.js scheduleVoice; a stale
 * synth.js only knows the four cue classes and scheduleCue). */
export function voiceOne(ac, dest, noise, v, when, opts) {
  if (typeof synth.scheduleVoice === 'function') {
    synth.scheduleVoice(ac, dest, noise, v, when, opts);
  } else {
    synth.scheduleCue(ac, dest, noise, v.type, v.gain, when,
      { profile: opts.profile, seed: v.seed, bank: opts.bank });
  }
}

const clamp01 = (x) => Math.max(0.05, Math.min(1, x));

// The listener's space (live only; the export bed stays dry and centred): pan
// buckets a voice connects to by where it happens as the camera sees it, and a
// short quiet room on a send. A fixed handful of nodes built once with the
// context; nothing here runs on the main thread after that.
const PAN_BUCKETS = 9;
const ROOM_SEND = 0.09;    // wet level: about -21 dB under the dry mix
// An equal-power panner plays a centred voice 3 dB down in each channel. The
// bus gives 1.6 dB of that back: a centred voice sits 1.4 dB under the dry
// mix per channel and the hot channel of a full-width voice 1.1 dB over it,
// which the plan's staged ceiling (0.9 of full scale) still holds.
const SPACE_GAIN = 1.2;

export function createSound({ machine, game, camera }) {
  let audio = null;        // { ctx, master, noise } (+ pans: the space graph, built at a playback entry)
  let muted = false;
  let volume = 0.8;
  let cues = [];           // the current record's voices (deriveVoices)
  // equipment overlay for the current record (undefined against a stale
  // synth.js — feature-detected, see the import note; scheduleCue defaults)
  let profile = synth.acousticProfile?.();
  let idx = 0;             // next cue to schedule
  let lastT = Infinity;    // detect clock rewinds (replay restart / seek back)
  // The rolling layer's own time anchor: { at, rate }, `at` = the audio time of
  // shot time 0. Rolling segments crossfade into one another and read the noise
  // by the shot clock, so they must also START on one clock. A start time taken
  // afresh from each frame's clock pair moves by a millisecond between frames,
  // which is enough to decorrelate the two reads under a crossfade (a dip every
  // segment). Impacts keep the per-frame time: they stand alone.
  let rollAnchor = null;
  // { at, t }: the audio time and the shot time at which the rolling layer's next segment is due (where the last
  // scheduled one ends). The trailing pass at playback end takes its timeline from it.
  let rollNext = null;
  // The same pair for EVERY rolling stream still running (the cloth rumble, and one stream per ball on the return
  // track), keyed by the seed of the stream's last scheduled segment: a stream's voices carry consecutive seeds, so
  // the voice that continues a segment looks under its own seed minus one. At most one entry per stream.
  const rollEnds = new Map();
  let endT = 0;            // the current record's last event time
  let scheduled = 0;       // e2e counter: nodes actually scheduled
  let bank = null;         // real-recording SFX bank (null until resolved)
  // PER-SHOT voicing latch: a shot voices from the bank iff the bank was
  // ready when its PLAYBACK started — the async load must not swap timbre
  // MID-shot (live would then diverge from the export, which awaits the
  // bank and voices the whole clip one way).
  let shotBank = null;
  synth.loadSfxBank?.().then((b) => { bank = b ?? null; });

  function ensureAudio() {
    if (audio || typeof AudioContext === 'undefined') return audio;
    const ac = new AudioContext();
    const master = ac.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ac.destination);
    // seeded noise (synth.js): reproducible across sessions AND identical
    // to the exporter's OfflineAudioContext render (export determinism
    // ruling — Math.random here made every boot sound statistically alike
    // but never byte-close)
    const noise = synth.makeNoiseBuffer(ac);
    // RE-ARM the gesture-resume whenever the context leaves 'running'
    // again LATER (audio interruption, phone call, OS media reclaim): the
    // pointerdown hook removes itself after a successful resume, so
    // without this a post-boot suspension would never get another retry.
    // ('interrupted' is iOS Safari's non-standard suspension state;
    // addEventListener dedupes by function identity, so re-adding is safe.)
    ac.onstatechange = () => {
      if (ac.state === 'suspended' || ac.state === 'interrupted') {
        armGestureResume();
      }
    };
    audio = { ctx: ac, master, noise };
    return audio;
  }
  /** The live space graph: PAN_BUCKETS fixed stereo panners -> one bus ->
   * master, plus bus -> send -> convolver (the room) -> master. Returns the
   * panners (null when this engine or a stale synth.js cannot build it: the
   * voices then go straight to the master, as before). */
  function buildSpace(ac, master) {
    if (typeof ac.createStereoPanner !== 'function' || typeof synth.listenerPan !== 'function') return null;
    try {
      const bus = ac.createGain();
      bus.gain.value = SPACE_GAIN;
      bus.connect(master);
      const width = synth.PAN_WIDTH ?? 0.6;
      const pans = [];
      for (let i = 0; i < PAN_BUCKETS; i++) {
        const p = ac.createStereoPanner();
        p.pan.value = width * (2 * i / (PAN_BUCKETS - 1) - 1);
        p.connect(bus);
        pans.push(p);
      }
      if (typeof ac.createConvolver === 'function' && typeof synth.makeRoomImpulse === 'function') {
        const [l, r] = synth.makeRoomImpulse(ac.sampleRate);
        const ir = ac.createBuffer(2, l.length, ac.sampleRate);
        ir.getChannelData(0).set(l);
        ir.getChannelData(1).set(r);
        const room = ac.createConvolver();
        room.normalize = false; // the impulse is already at unit energy
        room.buffer = ir;
        const send = ac.createGain();
        send.gain.value = ROOM_SEND;
        bus.connect(send);
        send.connect(room);
        room.connect(master);
      }
      return pans;
    } catch { return null; }
  }
  /** Where a voice goes: the pan bucket nearest its place on the table as
   * the listener sees it: from the shooter's seat, read from the record (or from
   * the camera, when one was handed in), or the master when there is no space
   * graph. */
  function destFor(v) {
    const { master, pans } = audio;
    if (!pans || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return master;
    const view = camera?.matrixWorldInverse?.elements;
    const pan = view ? synth.listenerPan(view, v.x, v.y)
      : (synth.shooterPan?.(game.record, v.x, v.y) ?? 0);
    const width = synth.PAN_WIDTH ?? 0.6;
    const i = Math.round((pan / width + 1) / 2 * (PAN_BUCKETS - 1));
    return pans[Math.max(0, Math.min(PAN_BUCKETS - 1, i))] ?? master;
  }
  // browsers gate audio on a user gesture — create/resume ONLY on input
  // that actually granted user activation, and keep retrying on every
  // gesture until the context actually RUNS. A once-only listener bricked
  // iOS WKWebView audio: the first resume can silently fail (or an
  // interruption re-suspends the context) and no later tap would ever
  // retry (owner device report, 2026-07-20).
  //
  // GH-326 (console hygiene, journey-QA wave 1): pre-fix this created the
  // context on ANY pointerdown AND on every PLAYBACK entry — both are
  // pre-activation surfaces. On touch devices pointerdown does NOT grant
  // user activation (the activation-triggering set is keydown, mouse-class
  // pointerdown, non-mouse pointerup/touchend — the sticky-activation
  // spec), and a share-link autoplay's PLAYBACK entry carries no gesture
  // at all, so Chrome warned 'The AudioContext was not allowed to start…'
  // on phone boots and share autoplays, and the suspended context could
  // leave the first shot silent. Now creation is LATCHED to activation:
  //   • gestureOk() gates the PLAYBACK-entry create/resume below — a
  //     share-replay autoplay before any gesture renders SILENT-BY-DESIGN
  //     (the 'frame' scheduler no-ops while audio is null) and audio joins
  //     mid-playback on the first real gesture;
  //   • grantsActivation() gates the window listeners — browser truth
  //     (navigator.userActivation, set BEFORE handlers run on the granting
  //     event) where available, the spec's event-type table as fallback;
  //     synthetic (isTrusted false) re-dispatches never latch.
  let gestureSeen = false;
  const gestureOk = () => gestureSeen
    || navigator.userActivation?.hasBeenActive === true;
  const grantsActivation = (e) => {
    if (!e || e.isTrusted === false) return false;
    const ua = navigator.userActivation;
    // TRANSIENT activation (isActive), not sticky (review r2 P2):
    // hasBeenActive stays true for the document's lifetime, so after a
    // post-boot suspension (phone call / OS reclaim) re-arms the
    // listeners, a sticky check would resume() from a NON-granting event
    // (touch pointerdown, Escape) — exactly the pre-gesture class again
    // on strict engines. Inside a granting event's own handler isActive
    // is true by construction (activation is set before dispatch).
    if (ua) return ua.isActive === true;
    if (e.type === 'pointerdown') return e.pointerType === 'mouse';
    if (e.type === 'keydown') return e.key !== 'Escape';
    // pointerup grants only for NON-mouse pointers (spec table; review r4
    // P3): a stray mouse release with no page press must not create
    return e.type === 'pointerup' && e.pointerType !== 'mouse';
  };
  // pointerdown (mouse) keeps the pre-326 first-sound latency; pointerup
  // covers touch/pen (their pointerdown grants nothing yet); keydown
  // covers keyboard-only sessions. All three retry until running.
  const GESTURES = ['pointerdown', 'pointerup', 'keydown'];
  const armGestureResume = () => {
    // addEventListener dedupes by function identity, so re-arming is safe
    for (const ev of GESTURES) window.addEventListener(ev, resumeOnGesture);
  };
  const resumeOnGesture = (e) => {
    if (!grantsActivation(e)) return; // wait for a granting event
    gestureSeen = true;
    ensureAudio();
    audio?.ctx.resume().then(() => {
      if (audio.ctx.state === 'running') {
        for (const ev of GESTURES) {
          window.removeEventListener(ev, resumeOnGesture);
        }
      }
    }).catch(() => {});
  };
  armGestureResume();

  machine.on('stateChange', (next, prev, info) => {
    if (next !== 'PLAYBACK') {
      // Playback ran to its end: schedule what the shot still owes the ear.
      // A ball pocketed late is still rolling down the return track when the
      // last ball on the table stops, and the frame hook below goes quiet
      // with PLAYBACK. One pass here, at the transition (an event, not a
      // poll): the remaining voices, each at its own time on the audio clock.
      // Only a playback that COMPLETED owes them: completion is the one
      // transition PLAYBACK -> SETTLED (game.js settles the shot there), with
      // the clock within 0.3 s of the record's last event. A skip to the end
      // from inside that window counts as completion. A playback abandoned
      // (a rerack to AIM), skipped from further back, borrowed by the DVR or
      // sought away owes nothing.
      if (next === 'SETTLED' && prev === 'PLAYBACK' && audio && !game.paused && idx < cues.length
          && Number.isFinite(lastT) && lastT >= endT - 0.3) {
        // The tail plays at normal speed whatever the playback's rate was (nothing on screen is left to stay in step
        // with). A voice that continues a rolling stream (the next segment of a ball's track, or the stop at its end)
        // starts where its OWN stream's last segment ends, so every stream joins exactly. After slow motion those
        // segments are still stretched, each by its own remainder, and each stream waits for its own: two balls on
        // the track can then reach the tray closer together or further apart than the plan spaced them (by under
        // three segment lengths). A voice that continues nothing sits on one timeline, shot time t at at0 + t, taken
        // from the segment scheduled last.
        const now = audio.ctx.currentTime;
        const at0 = rollNext && rollNext.at >= now - STALE ? rollNext.at - rollNext.t : now - lastT;
        for (; idx < cues.length; idx++) {
          const c = cues[idx];
          if (c.t < lastT - STALE) continue;
          const own = rollEnds.get(c.seed - 1);
          const when = Math.max(now, own && Math.abs(own.t - c.t) < 1e-6 ? own.at : at0 + c.t);
          if (c.type === 'roll') {
            rollEnds.delete(c.seed - 1);
            rollEnds.set(c.seed, { at: when + c.dur, t: c.t + c.dur });
          }
          play(c, when, 1);
        }
      }
      return;
    }
    // the DVR borrow is a SILENT surface (GH-257 review round-7 P2): its
    // entry emission fires with g.record already pointing at the ARCHIVED
    // record, so binding here cached foreign cues that the close settle
    // (a quiet re-stage, no transition) could then fire over the live
    // record's tail. The player renders visually; export audio has its
    // own offline path. Cleared, not kept: the previous shot's cues at
    // DVR clocks would be just as wrong.
    if (info?.dvr) { cues = []; idx = 0; lastT = -1; endT = 0; return; }
    if (gestureOk()) {
      ensureAudio();
      audio?.ctx.resume().catch(() => {});
      // the space graph is built here, once, AFTER the resume and outside the unlock gesture: ensureAudio (the gesture
      // path) stays what it was. A context that joins mid-playback plays that shot dry and centred.
      if (audio && audio.pans === undefined) audio.pans = buildSpace(audio.ctx, audio.master);
    }
    // no gesture yet: leave audio null (silent-by-design, GH-326) — the
    // cue list below still binds so the first gesture joins mid-playback
    // equipment-aware voicing from the record's own catalog ids (provenance
    // metadata already in the allowed game.record read surface) — shared
    // replays sound like THEIR equipment, not the viewer's settings
    profile = synth.acousticProfile?.(game.record?.initial?.equipment);
    cues = game.record ? deriveVoices(game.record, profile) : [];
    endT = game.record?.events?.length ? game.record.events[game.record.events.length - 1].t : 0;
    // latch the bank decision for THIS shot (see shotBank above), and if
    // the load came back empty (loadSfxBank retries after a null result),
    // kick another attempt for FUTURE shots — this one stays synth-voiced
    if (!bank) synth.loadSfxBank?.().then((b) => { if (b) bank = b; });
    shotBank = bank;
    idx = 0;
    lastT = -1;
    rollAnchor = null;
    rollNext = null;
    rollEnds.clear();
  });

  machine.on('frame', (t) => {
    if (!audio || game.state !== 'PLAYBACK' || game.paused) return;
    if (t < lastT) { idx = 0; rollAnchor = null; rollNext = null; rollEnds.clear(); } // clock rewound (replay restart)
    lastT = t;
    const rate = game.slowmo ? 0.25 : 1.0;
    while (idx < cues.length) {
      const c = cues[idx];
      if (c.t < t - STALE) { idx++; continue; }       // seeked past: skip
      if (c.t > t + LOOKAHEAD * rate) break;          // beyond the window
      let when = audio.ctx.currentTime + Math.max(0, (c.t - t) / rate);
      if (c.type === 'roll') {
        // re-anchored when the rate changes or the clocks have moved apart (a pause, a seek, drift past 30 ms)
        if (!rollAnchor || rollAnchor.rate !== rate || Math.abs(rollAnchor.at + c.t / rate - when) > 0.03) {
          rollAnchor = { at: when - c.t / rate, rate };
        }
        when = Math.max(audio.ctx.currentTime, rollAnchor.at + c.t / rate);
        rollNext = { at: when + c.dur / rate, t: c.t + c.dur };
        rollEnds.delete(c.seed - 1);
        rollEnds.set(c.seed, rollNext);
      }
      play(c, when, rate);
      idx++;
    }
  });

  // voicing lives in synth.js (shared verbatim with the export audio
  // render, web/app/export-audio.js — one synth, two contexts); each voice
  // carries its own seed, so per-event variation is identical in both
  function play(v, when, rate) {
    const { ctx: ac, noise } = audio;
    scheduled += 1;
    // A voice the engine refuses (a parameter out of its range) is dropped.
    // Nothing may throw into the frame emit: it would stop the listeners
    // after this one, and the same voice would be retried every frame.
    try {
      voiceOne(ac, destFor(v), noise, v, when, { profile, bank: shotBank, rate });
    } catch { /* this voice stays silent */ }
  }

  function applyMaster() {
    if (audio) audio.master.gain.value = muted ? 0 : volume;
  }

  const api = {
    setMuted(m) { muted = !!m; applyMaster(); },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); applyMaster(); },
    get muted() { return muted; },
    get volume() { return volume; },
    get scheduled() { return scheduled; },
    /** Recording tap (record.js): the master mix as a MediaStream, or null
     * when WebAudio is unavailable OR still suspended — a suspended context
     * emits no samples and the webm muxer would stall on the silent track
     * (recordings would be 0 bytes, e.g. headless). Any prior pointerdown
     * (aiming a shot) resumes the context, so real sessions get audio. One
     * destination node is cached; callers clone() tracks before stop()ing. */
    captureStream() {
      gestureSeen = true; // record click IS a user gesture (record.js)
      const a = ensureAudio();
      if (!a) return null;
      a.ctx.resume().catch(() => {});
      if (a.ctx.state !== 'running') return null;
      if (!a.tap) { a.tap = a.ctx.createMediaStreamDestination(); a.master.connect(a.tap); }
      return a.tap.stream;
    },
  };
  streamCtx.sound = api;
  window.__sound = api; // e2e read surface
  return api;
}
