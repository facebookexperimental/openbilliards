// Copyright (c) Meta Platforms, Inc. and affiliates.

// audio/plan.js — the pure part of the club look's audio service (CONTRACT.md 12): seeds, levels, and the two plans.
// Nothing here touches WebAudio, the DOM, a clock or the game: every export is a pure function of its arguments (the node
// arm web/tools/club/test-club-audio.mjs pins that), so the same seed gives the same room on every device.
//
//   chalkPlan(seed, shotIndex)      whether chalking is heard before shot `shotIndex`, and which take of it
//   farEvents(seed, t0, t1, opts)   the room's sparse far sounds whose room time lies in [t0, t1)
//   chalkEarliest(...)              the first instant chalk may start, given what the app's own voices are doing
//   bankProof(entries)              whether the page's resource entries establish that the app's recorded bank is loaded
//   sessionSeed(clockMs)            the room's seed for one page load
//
// Room time is the audio clock of the service's context counted from the start of the bed: it stands still while the
// context is suspended and never runs backwards, so the far sounds need no history beyond "scheduled up to".

/** The base seed of the room (a look value). `set({ seed })` and `?clubaudioseed=` give a seed for tools and proofs. */
export const AUDIO_SEED = 0x0b22c1ab;

/** mulberry32: a small seeded generator, uniform in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix any number of integers into one 32-bit seed (order matters). Numbers past 2^32 keep their high part. */
export function mix(...ints) {
  let h = 0x811c9dc5;
  const eat = (v) => {
    h ^= v >>> 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  };
  for (const raw of ints) {
    const v = Number.isFinite(raw) ? Math.floor(raw) : 0;
    eat(v % 4294967296);
    eat(Math.floor(v / 4294967296));
  }
  // a last avalanche, so that cells whose indices differ in one low bit share no bit pattern
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A generator for one (seed, tag, index ...) cell. Neighbouring cells share nothing (the seed is mixed, then stepped). */
export function rngFor(...ints) {
  const r = mulberry32(mix(...ints));
  r();
  return r;
}

/**
 * The seed of one page load, from the wall clock read ONCE when the service starts (milliseconds). The lead's ruling for
 * round 4: the ambience is live-only and never exported, so it may differ from session to session; this is the one clock
 * read of the audio plan, and nothing a picture depends on may take it. Pure in its argument.
 */
export function sessionSeed(clockMs) {
  return mix(AUDIO_SEED, 0x5e55, Number.isFinite(clockMs) ? Math.floor(clockMs) : 0);
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, u) => a + (b - a) * u;
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity);

/**
 * Levels, in dBFS at app volume 1 (the service multiplies everything by the app's own volume, as the app does with its
 * voices). ALL OF THESE ARE LOOK VALUES: they were set from numbers (the dev page measures them against the app's medium
 * ball-ball voice), nobody has listened to them. `set({ levels })` changes them at run time.
 * These are the levels of the HIGH step: what plays once the app's recorded bank is established (bankProof below). Until
 * then, and for good where it cannot be established, everything plays LOW_TRIM lower.
 *   bedRmsDb     RMS of each output channel of the room tone (two decorrelated loops and the hum)
 *   bedDuckDb    how far the room (tone and far sounds) goes down under a playback (0 = it does not)
 *   humRmsDb     RMS of the electrical hum alone (part of the bed)
 *   farPeakDb    sample peak of a far sound at its loudest take, before the panner (a plan event sits 0 to 6 dB under it)
 *   chalkPeakDb  sample peak of a chalk take at its loudest, before the panner (a plan take sits 0 to 4 dB under it)
 * The panner is equal-power: in the louder output channel a take peaks 0.2 dB (at the widest pan) to 3 dB (in the centre,
 * where chalk sits) under these two. The dev page's table states what comes out of the graph.
 * Measured references (web/tools/club/dev-audio.html, 2026-11; a medium ball-ball hit, impact gain 0.34):
 *   the app's recorded bank    peak -10.7 dBFS, loudest 50 ms -31.2 dBFS RMS
 *   the app's modal fallback   peak -35.0 dBFS, loudest 50 ms -51.8 dBFS RMS (no bank loaded: 24 dB quieter)
 */
export const LEVELS = Object.freeze({
  bedRmsDb: -50,
  // While a playback runs and until the app's voices are over, the room sits this much lower. Two reasons, both measured:
  // the app's rolling layer is faint and low, as the room tone is (a medium shot at app volume 0.8: -53 dBFS RMS after the
  // hit, -67 after the rail); and some of the app's voices are modal whatever the bank (a snooker net pocket, a landing on
  // the bed): with 14 dB the room tone's loudest 50 ms stays 6 dB under every modal impact voice of the medium shot.
  bedDuckDb: -14,
  humRmsDb: -68,
  farPeakDb: Object.freeze({ balls: -36, glass: -40, butt: -31 }),
  chalkPeakDb: -22,
});

/**
 * The LOW step (the default): how far under LEVELS the room and the chalk play while the app's recorded bank is not
 * established. Set so that each is at least 6 dB under the app's MODAL FALLBACK click, in its loudest 50 ms and in its
 * peak (the dev page's table, smallest margins over channels and takes: room tone 7.8 dB at 50 ms and 15.1 dB at the peak,
 * chalk 8.3 and 13.0, the loudest far take 8.2 and 11.8), and 6.5 dB or more under the fallback's cue strike and pocket.
 */
export const LOW_TRIM = Object.freeze({ roomDb: -14, chalkDb: -23 });

/** Times, in seconds. */
export const TIMING = Object.freeze({
  bedFadeIn: 4.0,          // the room tone comes up this slowly after the first gesture (and after a mode change)
  bedFadeOut: 1.2,
  firstFarAfter: 6.0,      // no far sound while the bed is still coming up
  farLookahead: 1.6,       // far sounds are handed to the audio clock this far ahead
  farScheduleStep: 0.25,   // ... and the plan is asked at most this often
  followTau: 0.03,         // time constant of the ramp that follows the app's mute and volume
  duckIn: 0.05,            // time constant of the room tone going down at a strike (or a replay)
  duckOut: 0.6,            // ... and of its way back up once the app's voices are over
  bankPollStep: 2.0,       // the page's resource entries are read at most this often, and never again once the bank is established
  bankPollFor: 30.0,       // ... for this long after the context starts; after that only when a shot has ended
  bankHold: 1.0,           // the bank must have been established this long before the level steps up (the app builds it after the last response)
  levelTau: 0.5,           // time constant of the step from the low level to the high one
  silentSuspend: 3.0,      // muted or volume 0 for this long: the context is suspended
  chalkCut: 0.008,         // a chalk take still sounding when the player shoots is ramped out this fast
  chalkExpire: 20.0,       // a chalk take that could not start this long after its time is dropped
  // The app's own voices (web/app/synth.js, read-only facts): a voice is silent again within 2.0 s of its start (the law
  // the export bed relies on) and is scheduled at most 0.15 s ahead during playback: 2.2 s after the last one was
  // scheduled, nothing of it sounds. At the end of a playback the app schedules the return track's remaining voices in
  // one pass, up to one track run ahead (0.09 + 0.55 + 0.52 x table length: 1.96 s on a 2.54 m bed, 2.5 s on a 3.57 m one):
  // 4.5 s after such a pass nothing of it sounds.
  appQuietPlayback: 2.2,
  appQuietTail: 4.5,
});

// ---------------------------------------------------------------------------------------------------------------------
// chalk
// ---------------------------------------------------------------------------------------------------------------------

/** Takes of the chalk sound (audio/render.js renders this many). */
export const CHALK_VARIANTS = 4;
// Shots are taken in blocks of four; each block has chalk before exactly two of its shots. With these four patterns no
// more than two shots in a row have it and no more than two in a row lack it, whatever blocks meet.
const CHALK_PATTERNS = Object.freeze([[1, 0, 1, 0], [0, 1, 0, 1], [1, 0, 0, 1], [0, 1, 1, 0]]);
const CHALK_DELAY = Object.freeze([0.9, 2.6]); // s after the player gets the table back

/** A seeded order of 0..n-1 for block `b` whose first entry differs from the last entry of block b-1 (n >= 3). */
function blockOrder(seed, tag, b, n) {
  const order = (blk) => {
    const r = rngFor(seed, tag, blk);
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    return p;
  };
  const p = order(b);
  // the swap below never moves a block's LAST entry (n >= 3), so the block before is read unadjusted
  if (b > 0 && p[0] === order(b - 1)[n - 1]) { const t = p[0]; p[0] = p[1]; p[1] = t; }
  return p;
}

/**
 * Chalk before shot `shotIndex` (0 = the first shot of a rack): { play, variant, delay, gainDb, rate, pan }.
 * A pure function of (seed, shotIndex). Half of the shots have it; two takes in a row are never the same take.
 */
export function chalkPlan(seed, shotIndex) {
  const k = Number.isFinite(shotIndex) && shotIndex > 0 ? Math.floor(shotIndex) : 0;
  const b = Math.floor(k / 4), pos = k % 4;
  const pattern = CHALK_PATTERNS[Math.floor(rngFor(seed, 0xc4a1, b)() * CHALK_PATTERNS.length)];
  const play = pattern[pos] === 1;
  // the block's two takes: the first and second entries of its order (the order's first never repeats the block before's
  // LAST entry; a block plays entries 0 and 1 only, so the take before this block's first is entry 1 of the block before)
  let ordinal = 0;
  for (let i = 0; i < pos; i++) ordinal += pattern[i];
  const cur = blockOrder(seed, 0xc4a2, b, CHALK_VARIANTS);
  let variant = cur[ordinal % CHALK_VARIANTS];
  if (ordinal === 0 && b > 0 && variant === blockOrder(seed, 0xc4a2, b - 1, CHALK_VARIANTS)[1]) variant = cur[2];
  const r = rngFor(seed, 0xc4a3, k);
  return {
    play,
    variant,
    delay: lerp(CHALK_DELAY[0], CHALK_DELAY[1], r()),
    gainDb: -4 * r(),
    rate: lerp(0.96, 1.04, r()),
    pan: lerp(-0.15, 0.15, r()),
  };
}

/**
 * The first audio-clock instant a chalk take may start. Pure.
 *   due          its own time (the player got the table back, plus the take's delay)
 *   appVoiceAt   when the app last scheduled a voice of its own (-Infinity = never seen)
 *   appVoiceTail true when that happened outside PLAYBACK (the end-of-playback pass: voices up to one track run ahead)
 *   leftPlayback when the machine last left PLAYBACK (-Infinity = never seen)
 */
export function chalkEarliest({ due, appVoiceAt = -Infinity, appVoiceTail = false, leftPlayback = -Infinity }) {
  const guard = appVoiceTail ? TIMING.appQuietTail : TIMING.appQuietPlayback;
  return Math.max(due, appVoiceAt + guard, leftPlayback + TIMING.appQuietPlayback);
}

// ---------------------------------------------------------------------------------------------------------------------
// the room's far sounds
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The far sounds. Room time is cut into slots per kind; a slot holds one sound with probability `p`, somewhere inside the
 * slot (never closer than `margin` to its ends, so two sounds of a kind never overlap). The slot lengths are primes, so
 * the kinds drift against each other and the pattern as a whole does not come round. `place` is where it happens in the
 * room, world metres (x along the main table, z across; the table centre is the origin): the second table stands beside
 * the main one on the north side, the bar is on the foot wall (room/props/layout.js plans them; these are nominal places,
 * not read from the plan). `pan0` is the pan when no camera can be read.
 * Three kinds. A fourth, a chair moved on the boards (a scrape of noise in grains), was removed in round 4: it could not
 * be ruled out by measurement that an ear takes a short broadband scrape for a grunt, and the ruling allows nothing that
 * may sound like a voice. What is left has no pitched source in the range of a voice: noise bursts through resonances
 * (balls, the cue butt, the glass's base) and three inharmonic partials above 1.7 kHz (the glass); the dev page checks
 * every take for a stack of harmonics in 300 to 3000 Hz (audio/measure.js harmonicStack).
 */
export const FAR_KINDS = Object.freeze({
  balls: Object.freeze({ slot: 13, p: 0.5, variants: 4, margin: 2.2, places: Object.freeze([[1.2, -3.3]]), pan0: -0.35, needs: 'farTable' }),
  glass: Object.freeze({ slot: 47, p: 0.6, variants: 3, margin: 2.2, places: Object.freeze([[4.7, -1.2], [4.7, 0.6]]), pan0: 0.3 }),
  butt: Object.freeze({ slot: 53, p: 0.6, variants: 3, margin: 2.2, places: Object.freeze([[0.2, -4.4], [2.6, -3.9]]), pan0: -0.2, needs: 'farTable' }),
});
export const FAR_KIND_IDS = Object.freeze(Object.keys(FAR_KINDS));
const FAR_TAG = Object.freeze({ balls: 0xfa01, glass: 0xfa02, butt: 0xfa04 });

/** The sound of `kind` in slot `slot`, or null when the slot is empty. Pure in (seed, kind, slot). */
export function farEvent(seed, kind, slot) {
  const K = FAR_KINDS[kind];
  if (!K || !(slot >= 0) || !Number.isFinite(slot)) return null;
  const s = Math.floor(slot);
  const r = rngFor(seed, FAR_TAG[kind], s);
  if (r() >= K.p) return null;
  const t = s * K.slot + K.margin + r() * (K.slot - 2 * K.margin);
  const order = blockOrder(seed, FAR_TAG[kind] + 0x100, Math.floor(s / K.variants), K.variants);
  const place = K.places[Math.floor(r() * K.places.length)];
  return {
    kind, slot: s, t,
    variant: order[s % K.variants],
    gainDb: -6 * r(),
    rate: lerp(0.95, 1.05, r()),
    place,
    pan0: K.pan0,
  };
}

/**
 * Every far sound with room time in [t0, t1), in time order. Pure in its arguments.
 * opts.farTable === false: the room has no second table (the lite tier), so nothing of it is heard.
 * opts.after: nothing earlier than this room time (default TIMING.firstFarAfter).
 */
export function farEvents(seed, t0, t1, opts = {}) {
  const out = [];
  const from = Math.max(Number.isFinite(t0) ? t0 : 0, opts.after ?? TIMING.firstFarAfter);
  if (!(t1 > from)) return out;
  for (const kind of FAR_KIND_IDS) {
    const K = FAR_KINDS[kind];
    if (K.needs === 'farTable' && opts.farTable === false) continue;
    const s0 = Math.max(0, Math.floor(from / K.slot)), s1 = Math.floor(t1 / K.slot);
    if (s1 - s0 > 4096) continue; // a window of hours is a caller's mistake, not a plan
    for (let s = s0; s <= s1; s++) {
      const ev = farEvent(seed, kind, s);
      if (ev && ev.t >= from && ev.t < t1) out.push(ev);
    }
  }
  out.sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  return out;
}

/** Widest pan a far sound takes (StereoPannerNode units): the room is around the listener, but nothing is hard left or right. */
export const FAR_PAN_WIDTH = 0.7;

/**
 * Left-right place of a room position as the camera sees it. `view` = the 16 column-major elements of the camera's
 * matrixWorldInverse (read-only), `place` = [x, z] world metres at ear height. Returns `fallback` when either is unusable.
 */
export function panFor(place, view, fallback = 0) {
  if (!view || view.length < 16 || !place) return fallback;
  const x = place[0], y = 1.0, z = place[1];
  const cx = view[0] * x + view[4] * y + view[8] * z + view[12];
  const cz = view[2] * x + view[6] * y + view[10] * z + view[14];
  const d = Math.hypot(cx, cz);
  if (!(d > 1e-6) || !Number.isFinite(d)) return fallback;
  return clamp((cx / d) * FAR_PAN_WIDTH, -FAR_PAN_WIDTH, FAR_PAN_WIDTH);
}

/** `off` | `sfx` | `full` from the boot query and the tier knob (the query wins; anything unreadable is the default). */
export function parseMode(queryValue, knobValue, fallback = 'full') {
  const ok = (v) => v === 'off' || v === 'sfx' || v === 'full';
  if (ok(queryValue)) return queryValue;
  if (ok(knobValue)) return knobValue;
  if (knobValue === false) return 'off';
  return fallback;
}

// ---------------------------------------------------------------------------------------------------------------------
// which voicing the app plays: the proof of its recorded bank
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The files of the app's recorded bank, as web/app/synth.js SFX_FILES lists them (read 2026-11; a read-only fact, not an
 * import: no club module imports an app module). The app fetches each from `assets/sfx/` once at boot (synth.js
 * loadSfxBank) and voices its impacts from them; a file that fails is skipped, and a shot voices from the bank only when
 * the bank was built before its playback began. If the app renames or drops a file, the proof below can no longer be
 * made and the service stays at its low level: the list can only err to the quiet side.
 */
export const BANK_DIR = '/assets/sfx/';
export const BANK_FILES = Object.freeze([
  'click-s1.wav', 'click-s2.wav', 'click-s3.wav', 'click-s4.wav', 'click-m1.wav', 'click-m2.wav', 'click-m3.wav', 'click-m4.wav',
  'click-h1.wav', 'click-h2.wav', 'click-h3.wav', 'click-h4.wav',
  'cue-m1.wav', 'cue-m2.wav', 'cue-m3.wav', 'cue-m4.wav', 'cue-h1.wav', 'cue-h2.wav', 'cue-h3.wav', 'cue-h4.wav',
  'cushion-s1.wav', 'cushion-s2.wav', 'cushion-s3.wav', 'cushion-s4.wav', 'cushion-m1.wav', 'cushion-m2.wav', 'cushion-m3.wav', 'cushion-m4.wav',
  'cushion-h1.wav', 'cushion-h2.wav', 'cushion-h3.wav', 'cushion-h4.wav',
  'pocket-d1.wav', 'pocket-d2.wav', 'pocket-d3.wav', 'pocket-d4.wav', 'pocket-r1.wav', 'pocket-r2.wav', 'pocket-r3.wav',
]);

/** One resource entry shows a bank file that arrived: a finished response with a success status and a body that is not text. */
function entryArrived(e) {
  if (!e || !(e.responseEnd > 0)) return false;
  // the status must be KNOWN: an engine whose entries carry none cannot make the proof (0 = hidden or failed)
  const st = e.responseStatus;
  if (typeof st !== 'number' || !((st >= 200 && st < 300) || st === 304)) return false;
  // a RIFF header alone is 44 bytes; a body the engine reports as empty is no clip
  if (!(e.decodedBodySize > 44)) return false;
  // a host that answers a missing file with a page (status 200, text) must not pass where the engine tells the type
  if (typeof e.contentType === 'string' && /^(text|application\/(json|xhtml|xml))/i.test(e.contentType.trim())) return false;
  return true;
}

/**
 * Whether `entries` (the page's `performance.getEntriesByType('resource')`, or anything of that shape) establish that the
 * app's recorded bank is loaded: EVERY file of BANK_FILES has at least one entry whose URL path ends in
 * `/assets/sfx/<file>` and that arrived (entryArrived). Pure. Returns { proven, wanted, ok, missing, why }.
 * What this does NOT see, said plainly: whether the app parsed the body as a clip (a 200 response that is not a WAV where
 * the engine reports no content type), and entries the browser dropped because its resource buffer was full (then the
 * proof fails and the service stays low).
 */
export function bankProof(entries) {
  const wanted = BANK_FILES.length;
  const have = new Set();
  let seen = 0;
  if (entries && typeof entries.length === 'number') {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const name = typeof e?.name === 'string' ? e.name : '';
      const at = name.indexOf(BANK_DIR);
      if (at < 0) continue;
      let path = name;
      const cut = path.search(/[?#]/);
      if (cut >= 0) path = path.slice(0, cut);
      const slash = path.lastIndexOf('/');
      if (!path.endsWith(BANK_DIR + path.slice(slash + 1))) continue;
      const file = path.slice(slash + 1);
      if (!BANK_FILES.includes(file)) continue;
      seen += 1;
      if (entryArrived(e)) have.add(file);
    }
  }
  const missing = BANK_FILES.filter((f) => !have.has(f));
  const proven = missing.length === 0;
  return {
    proven, wanted, ok: have.size, missing: missing.slice(0, 6),
    why: proven ? `all ${wanted} bank files arrived` : seen === 0 ? 'no bank file among the resource entries' : `${have.size} of ${wanted} bank files arrived`,
  };
}
