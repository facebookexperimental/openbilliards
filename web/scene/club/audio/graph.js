// Copyright (c) Meta Platforms, Inc. and affiliates.

// audio/graph.js — the playback graph of the club look's audio service, over any BaseAudioContext (the service's own
// AudioContext in the app; an OfflineAudioContext on the dev page, which measures what the same graph puts out).
//
//   bed loop A -> gain -> pan(-0.5) \
//   bed loop B -> gain -> pan(+0.5)  > bedBus (fades in and out) \
//   hum loop   -> gain              /                              > duck (down while the app's voices sound) -> roomTrim \
//   far take   -> gain -> pan(place) -> farBus -------------------/                                                        > out -> destination
//   chalk take -> gain -> pan ------> sfxBus -> chalkTrim ----------------------------------------------------------------/
//   `out` follows the app's mute and volume. The two trims are the level step (plan.js LOW_TRIM): low until the app's
//   recorded bank is established, then 0 dB.
//
// Three looping buffer sources, a handful of gains and two panners while nothing else happens: no script on the main thread
// and no filter in the steady state. Every level is set from what was measured on the rendered buffers (audio/render.js), so
// a level in audio/plan.js LEVELS is what comes out at app volume 1 on the high step.
import { dbToGain, FAR_PAN_WIDTH, LOW_TRIM } from './plan.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * Build the graph. `assets` = audio/render.js renderAssets() (any of its groups may be missing), `levels` = plan.js LEVELS
 * (or a changed copy). `opts.dest`: where `out` goes (default: the context's destination). `opts.trim`: the level step the
 * graph starts on, { roomDb, chalkDb } (default: plan.js LOW_TRIM, the low step).
 * Nothing is started here. Returns the handles the service drives; every method is safe to call with a group missing.
 */
export function buildGraph(ac, assets, levels, opts = {}) {
  const counts = { started: 0, live: 0, ended: 0, bedSources: 0 };
  const live = new Set();
  const track = (src) => {
    counts.started += 1; counts.live += 1; live.add(src);
    src.onended = () => { if (live.delete(src)) { counts.live -= 1; counts.ended += 1; } };
    return src;
  };
  const gainNode = (v) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const canPan = typeof ac.createStereoPanner === 'function';
  const panned = (node, pan, dest) => {
    if (!canPan) { node.connect(dest); return; }
    const p = ac.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    node.connect(p); p.connect(dest);
  };

  const out = gainNode(0); // the service ramps it to the app's volume; silent until then
  out.connect(opts.dest ?? ac.destination);
  const bedBus = gainNode(0), duck = gainNode(1), farBus = gainNode(1), sfxBus = gainNode(1);
  const trim0 = opts.trim ?? LOW_TRIM;
  const roomTrim = gainNode(dbToGain(Math.min(0, trim0.roomDb))), chalkTrim = gainNode(dbToGain(Math.min(0, trim0.chalkDb)));
  bedBus.connect(duck); farBus.connect(duck); duck.connect(roomTrim); roomTrim.connect(out);
  sfxBus.connect(chalkTrim); chalkTrim.connect(out);

  let lv = levels;
  let bed = null; // { sources: [...], gains: {...}, at }

  /** The gains of the bed's three loops for the levels in force (each loop is brought from its measured RMS to the target). */
  function bedGains() {
    const b = assets?.bed;
    if (!b) return null;
    // With the two loops panned to -0.5 and +0.5 (equal power: 0.924 and 0.383), two uncorrelated loops at the same RMS
    // give each output channel that RMS. Without a panner both go to both channels: 3 dB down each keeps the sum there.
    const target = dbToGain(lv.bedRmsDb) * (canPan ? 1 : Math.SQRT1_2);
    const g = (x) => (x.rms > 0 ? target / x.rms : 0);
    return { a: g(b.a), b: g(b.b), hum: b.hum.rms > 0 ? dbToGain(lv.humRmsDb) / b.hum.rms : 0 };
  }

  const api = {
    out, bedBus, duck, farBus, sfxBus, roomTrim, chalkTrim,
    counts: () => ({ ...counts }),
    // read at the call: the service adds a group to `assets` when a later render brings it (a mode change)
    has: () => ({ bed: !!assets?.bed, far: !!assets?.far, chalk: !!assets?.chalk }),
    bedOn: () => bed !== null,

    /** Start the room tone at context time `when`, faded in over `fade` seconds. `offset`: where in the loops (seconds). */
    startBed(when, fade, offset = 0) {
      if (bed || !assets?.bed) return false;
      const g = bedGains();
      const mk = (x, gain, pan) => {
        const src = ac.createBufferSource();
        src.buffer = x.buffer;
        src.loop = true;
        const gn = gainNode(gain);
        src.connect(gn);
        if (pan === null) gn.connect(bedBus); else panned(gn, pan, bedBus);
        src.start(when, offset % x.seconds);
        counts.bedSources += 1;
        return [track(src), gn];
      };
      const [sa, ga] = mk(assets.bed.a, g.a, -0.5), [sb, gb] = mk(assets.bed.b, g.b, 0.5), [sh, gh] = mk(assets.bed.hum, g.hum, null);
      bed = { sources: [sa, sb, sh], gains: { a: ga, b: gb, hum: gh }, at: when };
      bedBus.gain.cancelScheduledValues(when);
      bedBus.gain.setValueAtTime(0, when);
      bedBus.gain.linearRampToValueAtTime(1, when + Math.max(0.01, fade));
      return true;
    },
    /** Fade the room tone out from `when` over `fade` seconds and stop its sources. */
    stopBed(when, fade) {
      if (!bed) return false;
      const end = when + Math.max(0.01, fade);
      bedBus.gain.cancelScheduledValues(when);
      bedBus.gain.setTargetAtTime(0, when, Math.max(0.003, fade / 4));
      for (const s of bed.sources) { try { s.stop(end + 0.05); } catch { /* already stopped */ } }
      counts.bedSources -= bed.sources.length;
      bed = null;
      return true;
    },
    /** The level step: { roomDb, chalkDb } under LEVELS (0 = the high step), reached from `when` with time constant `tau`. */
    setTrim(trim, when, tau) {
      roomTrim.gain.cancelScheduledValues(when);
      roomTrim.gain.setTargetAtTime(dbToGain(Math.min(0, trim.roomDb)), when, Math.max(0.003, tau));
      chalkTrim.gain.cancelScheduledValues(when);
      chalkTrim.gain.setTargetAtTime(dbToGain(Math.min(0, trim.chalkDb)), when, Math.max(0.003, tau));
    },
    /** Bring the room (tone and far sounds) `db` under its level (0 = back up) from `when`, with time constant `tau`. */
    setDuck(db, when, tau) {
      duck.gain.cancelScheduledValues(when);
      duck.gain.setTargetAtTime(dbToGain(Math.min(0, db)), when, Math.max(0.003, tau));
    },
    /** New levels (plan.js LEVELS shape): the bed's gains move there over a tenth of a second; takes use them from now on. */
    setLevels(levels2, when) {
      lv = levels2;
      const g = bedGains();
      if (bed && g) for (const k of ['a', 'b', 'hum']) bed.gains[k].gain.setTargetAtTime(g[k], when, 0.03);
    },

    /** One far sound of the plan (plan.js farEvent) at context time `when`, panned to `pan`. Returns its end time or null. */
    playFar(ev, when, pan) {
      const take = assets?.far?.takes?.[ev.kind]?.[ev.variant];
      if (!take) return null;
      const src = ac.createBufferSource();
      src.buffer = take.buffer;
      src.playbackRate.value = ev.rate;
      const g = gainNode(dbToGain((lv.farPeakDb[ev.kind] ?? -40) + ev.gainDb));
      src.connect(g);
      panned(g, clamp(pan, -FAR_PAN_WIDTH, FAR_PAN_WIDTH), farBus);
      src.start(when);
      track(src);
      return when + take.seconds / ev.rate;
    },

    /**
     * One chalk take of the plan (plan.js chalkPlan) at context time `when`. Returns { start, end, cut(at) } or null;
     * `cut(at)` ramps it out within `cutSec` and stops it (the player shot while it sounded).
     */
    playChalk(plan, when, cutSec = 0.008) {
      const take = assets?.chalk?.takes?.[plan.variant];
      if (!take) return null;
      const src = ac.createBufferSource();
      src.buffer = take.buffer;
      src.playbackRate.value = plan.rate;
      const g = gainNode(dbToGain(lv.chalkPeakDb + plan.gainDb));
      src.connect(g);
      panned(g, plan.pan, sfxBus);
      src.start(when);
      track(src);
      const end = when + take.seconds / plan.rate;
      return {
        start: when, end,
        cut(at) {
          if (at >= end) return false;
          const t = Math.max(at, when);
          g.gain.cancelScheduledValues(t);
          g.gain.setTargetAtTime(0, t, cutSec / 4);
          try { src.stop(t + cutSec); } catch { /* already stopped */ }
          return true;
        },
      };
    },

    /** Stop everything this graph started and take it off the destination. */
    dispose() {
      for (const s of [...live]) { try { s.onended = null; s.stop(); } catch { /* not started or already stopped */ } }
      live.clear(); counts.live = 0; counts.bedSources = 0;
      bed = null;
      try { out.disconnect(); } catch { /* never connected */ }
    },
  };
  return api;
}
