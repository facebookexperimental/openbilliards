// Copyright (c) Meta Platforms, Inc. and affiliates.

// sound.js — fully synthesized WebAudio (no assets): ball-ball click,
// cushion thud, pocket drop, cue-strike tick. Sounds are NOT detected per
// frame — they are pre-derived from the kernel ShotRecord event list (pre-
// impact speeds from walking the record's neighbor post-states) and then
// scheduled sample-accurately against the AudioContext clock: an event at
// shot-time e.t plays at ctx.currentTime + (e.t − playbackClock) / rate,
// using a short lookahead window from the 'frame' hook so pause/slow-mo
// stay in sync.
//
// OWNERSHIP (see the module-ownership contract): STREAM-C (share/sound/settings).
// Allowed surface: additive machine.on registrations and read-only
// game.{record, clock} (plus game.{slowmo, paused, duration} reads for the
// clock-rate mapping — reported as a deviation note).
import { ctx as streamCtx } from './settings.js';
// NAMESPACE import on purpose (module-ownership rule 5 corollary): sound.js is
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
 * the middleware "graze factor" technique, kernel-exact here). */
export function deriveCues(record) {
  const vel = new Map(record.initial.balls.map((b) => [b.id, vec(b.state.vel)]));
  const pre = (id) => vel.get(id) ?? { x: 0, y: 0, z: 0 };
  const cues = [];
  for (const e of record.events) {
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
    for (const [id, state] of e.post) vel.set(id, vec(state.vel));
  }
  return cues;
}

const clamp01 = (x) => Math.max(0.05, Math.min(1, x));

export function createSound({ machine, game }) {
  let audio = null;        // { ctx, master, noise }
  let muted = false;
  let volume = 0.8;
  let cues = [];           // derived for the current record
  // equipment overlay for the current record (undefined against a stale
  // synth.js — feature-detected, see the import note; scheduleCue defaults)
  let profile = synth.acousticProfile?.();
  let idx = 0;             // next cue to schedule
  let lastT = Infinity;    // detect clock rewinds (replay restart / seek back)
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
    if (next !== 'PLAYBACK') return;
    // the DVR borrow is a SILENT surface (GH-257 review round-7 P2): its
    // entry emission fires with g.record already pointing at the ARCHIVED
    // record, so binding here cached foreign cues that the close settle
    // (a quiet re-stage, no transition) could then fire over the live
    // record's tail. The player renders visually; export audio has its
    // own offline path. Cleared, not kept: the previous shot's cues at
    // DVR clocks would be just as wrong.
    if (info?.dvr) { cues = []; idx = 0; lastT = -1; return; }
    if (gestureOk()) {
      ensureAudio();
      audio?.ctx.resume().catch(() => {});
    }
    // no gesture yet: leave audio null (silent-by-design, GH-326) — the
    // cue list below still binds so the first gesture joins mid-playback
    cues = game.record ? deriveCues(game.record) : [];
    // equipment-aware voicing from the record's own catalog ids (provenance
    // metadata already in the allowed game.record read surface) — shared
    // replays sound like THEIR equipment, not the viewer's settings
    profile = synth.acousticProfile?.(game.record?.initial?.equipment);
    // latch the bank decision for THIS shot (see shotBank above), and if
    // the load came back empty (loadSfxBank retries after a null result),
    // kick another attempt for FUTURE shots — this one stays synth-voiced
    if (!bank) synth.loadSfxBank?.().then((b) => { if (b) bank = b; });
    shotBank = bank;
    idx = 0;
    lastT = -1;
  });

  machine.on('frame', (t) => {
    if (!audio || game.state !== 'PLAYBACK' || game.paused) return;
    if (t < lastT) idx = 0; // clock rewound (replay restart)
    lastT = t;
    const rate = game.slowmo ? 0.25 : 1.0;
    while (idx < cues.length) {
      const c = cues[idx];
      if (c.t < t - STALE) { idx++; continue; }       // seeked past: skip
      if (c.t > t + LOOKAHEAD * rate) break;          // beyond the window
      const when = audio.ctx.currentTime + Math.max(0, (c.t - t) / rate);
      play(c.type, c.gain, when, idx);
      idx++;
    }
  });

  // voicing lives in synth.js (shared verbatim with the export audio
  // render, web/app/export-audio.js — one synth, two contexts); the cue's
  // list index seeds per-event micro-variation identically in both
  function play(type, gain, when, seed) {
    const { ctx: ac, master, noise } = audio;
    scheduled += 1;
    synth.scheduleCue(ac, master, noise, type, gain, when,
      { profile, seed, bank: shotBank });
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
