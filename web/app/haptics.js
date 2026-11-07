// Copyright (c) Meta Platforms, Inc. and affiliates.

// haptics.js — iOS shell haptics leaf (feature 016,
// the haptics-bridge contract §1). Cues are NOT detected
// per frame — they are pre-derived from the kernel ShotRecord via sound.js's
// exported deriveCues (FR-004: the exact derivation class that drives
// sound), coalesced per class (§5), and posted fire-and-forget to the
// WKScriptMessageHandler bridge window.webkit.messageHandlers.obHaptics
// (wire schema §3: { v: 1, type, gain, t }). Native (HapticsController)
// fires transient CoreHaptics events immediately on receipt and NEVER
// schedules from t — t is diagnostic ordering only.
//
// Inertness law (FR-016/SC-004): non-shell boots never even REQUEST this
// module (the main.js seam of §2 gates the dynamic import on bridge
// capability). Defense in depth: if loaded anyway with no bridge,
// createHaptics registers nothing and returns an inert stub — zero DOM,
// zero behavior, zero requests, zero console output.
//
// OWNERSHIP: leaf module (cache-poison dynamic-import contract,
// the module-ownership contract). Allowed surface: additive machine.on
// registrations and read-only game.{record, paused, slowmo, state} — the
// same read set as sound.js. No DOM, no window globals, no other imports
// from the app graph.
import { deriveCues } from './sound.js';

// Same LOOKAHEAD/STALE discipline as sound.js (values mirrored — the two
// modules must agree on which cues a playback clock position covers).
const LOOKAHEAD = 0.15;  // wall-clock seconds posted ahead
const STALE = 0.05;      // cues older than this (shot seconds) are skipped

// §5 rate bound (JS side): per cue class at most one message per
// COALESCE_MS window; the survivor of a coalesced group carries the group's
// max gain. Swift bounds independently (minGap/globalMinGap) — a stale web
// bundle can never flood the engine.
const COALESCE_MS = 50;

/** Coalesce derived cues per class (§5). Pure function of the cue list —
 * windows anchor at each group's first cue in shot time, so the result is
 * deterministic from the record alone (the e2e-haptics --seam probe
 * recomputes it independently and asserts 1:1 correspondence, SC-005). The
 * survivor keeps the group-opening t and the group's max gain. */
function coalesce(cues) {
  const open = new Map(); // class → open group's surviving cue
  const out = [];
  for (const c of cues) {
    const g = open.get(c.type);
    if (g && c.t - g.t <= COALESCE_MS / 1000) {
      g.gain = Math.max(g.gain, c.gain);
      continue;
    }
    const survivor = { t: c.t, type: c.type, gain: c.gain };
    open.set(c.type, survivor);
    out.push(survivor);
  }
  return out;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function createHaptics({ machine, game }) {
  // Defense-in-depth inertness (§1): bridge absent → register nothing,
  // return an inert stub. The seam already gates the import; this guards a
  // cached/forced load.
  const bridge = window.webkit?.messageHandlers?.obHaptics;
  if (!bridge || typeof bridge.postMessage !== 'function') {
    return { active: false, posted: 0 };
  }

  let cues = [];           // coalesced cue list for the current record
  let idx = 0;             // next cue to post
  let lastT = Infinity;    // detect clock rewinds (replay restart / seek back)
  let posted = 0;
  let disabled = false;    // a throwing bridge disables for the session

  function disable() {
    disabled = true;
    offState();
    offFrame();
    cues = [];
  }

  function post(c) {
    // Fire-and-forget (FR-005): the frame loop never blocks on the bridge.
    // One message per cue, no batching (§3); gain defensively clamped to
    // the wire law's [0, 1] (deriveCues already emits 0.05..1).
    try {
      bridge.postMessage({ v: 1, type: c.type, gain: clamp01(c.gain), t: c.t });
      posted += 1;
    } catch {
      disable();
    }
  }

  const offState = machine.on('stateChange', (next, prev, info) => {
    if (next !== 'PLAYBACK') return;
    // the DVR borrow is a SILENT surface (GH-257 review round-7 P2; the
    // sound.js twin): its entry fires with g.record already the ARCHIVED
    // record — binding here cached foreign cues the close settle could
    // vibrate over the live record's tail.
    if (info?.dvr) { cues = []; idx = 0; lastT = -1; return; }
    cues = game.record ? coalesce(deriveCues(game.record)) : [];
    idx = 0;
    lastT = -1;
  });

  const offFrame = machine.on('frame', (t) => {
    if (disabled || game.state !== 'PLAYBACK' || game.paused) return;
    if (t < lastT) idx = 0; // clock rewound (replay restart)
    lastT = t;
    const rate = game.slowmo ? 0.25 : 1.0;
    while (idx < cues.length && !disabled) {
      const c = cues[idx];
      if (c.t < t - STALE) { idx++; continue; }       // seeked past: skip
      if (c.t > t + LOOKAHEAD * rate) break;          // beyond the window
      post(c);
      idx++;
    }
  });

  return {
    get active() { return !disabled; },
    get posted() { return posted; },
  };
}
