// Copyright (c) Meta Platforms, Inc. and affiliates.

// shell.js — UI shell controller (feature 031, program 525 S1).
// Contract of record: the shell contract (feature 031, internal) (places
// registry §2, mover law §3, boot split §4, ob-shell-v1 storage §5, chrome
// DOM + __shell surface §6, entry-state + input-isolation laws §7).
//
// Reached ONLY via the guarded dynamic import in main.js (the playback.js
// seam shape — cache-poison contract): an absent/stale module boots today's
// app unchanged, never a black page. Do NOT add this module to any static
// import graph.
//
// Scripted-boot law (§4): on a scripted boot (obtool/ob-scripted) WITHOUT
// the reserved `obshell=1` opt-in, createShell no-ops ENTIRELY — no DOM, no
// window surface, no storage read — so every committed fixture and capture
// stays byte-identical (SC-002) and e2e-settings sees the pre-shell app.
import * as THREE from 'three';
import { t, has, onLocaleChange } from './i18n.js';
import * as i18nNs from './i18n.js'; // namespace: post-freeze exports (hasLocal) are feature-detected
import { createShellMover } from './shellmover.js';
import * as stampNs from './inputclock.js'; // the one stamp helper (#1130): a namespace, feature-detected (rule 5)
// room handle for the shell-open visual state (§7.1): the live emitter set
// (lightRefs.rectLights). room.js sits in the boot module graph (main.js),
// so this import resolves without a fetch. NAMESPACE import + optional
// chaining (the ownership ledger rule 5 / review fix-round review P1): a heuristic
// cache can pair this shell.js with a pre-#89 room.js lacking activeRoom —
// a named-export link would reject the whole module (the guarded importers
// catch it and the shell silently disappears without tripping self-heal);
// the namespace form degrades to a glare-dim no-op instead.
import * as roomMod from '../scene/room.js';
// GH-715 review r4 P1: the arrival-protocol CLAIM, synchronous at module
// evaluation — app.html's #ob-boot holds unbounded ONLY for a shell that
// claimed it (a legacy cached shell.js never does; main.js then marks
// 'legacy' and the driver releases on the old bound).
// GH-715 review r5 P2: the claim is guarded by the SAME scripted predicate
// createShell() applies below (§4 scripted-boot law — a scripted boot
// without the reserved `obshell=1` opt-in is an ENTIRE no-op: no window
// surface, so no claim either). Computed here, at module evaluation, with
// main.js's one convention verbatim (bare `?obtool`/`?cinema` count, only
// `obtool=0` opts out, the flag is carried across same-tab navigations via
// sessionStorage) and ORDER-INDEPENDENT of main.js's own stamp: the boot
// prefetch import evaluates this module before main.js reaches its
// convention, so the head reads the query + the carried flag exactly as
// main.js is about to. A scripted boot therefore never claims; main.js's
// legacy marking cannot fire there either (`__obShellArrival` is
// 'pending' on real-user boots only), and a scripted `obshell=1` boot (the
// shell DOES run) claims like a real boot.
const SCRIPTED_NO_CLAIM = (() => {
  try {
    const q = new URLSearchParams(location.search);
    const on = (k) => q.has(k) && q.get(k) !== '0';
    let scripted = on('obtool') || on('cinema');
    if (!scripted && q.get('obtool') !== '0') {
      try { scripted = sessionStorage.getItem('ob-scripted') === '1'; } catch { /* storage unavailable */ }
    }
    return scripted && !on('obshell');
  } catch { return false; } // no window/location: nothing to claim on
})();
if (!SCRIPTED_NO_CLAIM) { try { window.__obShellProtocol = 1; } catch { /* no window */ } }

// ui/shell.css version — bump on EVERY change to that sheet (?v= cache-bust
// law; the playback.js PB_CSS_V precedent).
const SHELL_CSS_V = '027';

// GH-668 S5 slice 2 (B-K22 mount law, A11): the place cards ENTER and LEAVE
// through the kit — ui/motion.js by guarded import (the hud.js / share.js
// idiom; cache-poison contract: a missing or stale leaf degrades to the
// plain `hidden` flip presentPlace always carried, never a black card).
let motion = null; // ui/motion.js namespace once it lands, else null
import('./ui/motion.js').then((m) => { motion = m; }).catch(() => { motion = null; });
// Review r1 (slice 2) P2: the NEW copy keys are picked against the ACTIVE
// locale's OWN dictionary — has() consults the en fallback, so a fresh
// shell.js over a stale non-English dictionary would paint the new ENGLISH
// verb / label into a localized UI instead of the retained legacy key.
// hasLocal is a post-freeze i18n export: reached through the namespace and
// feature-detected (OWNERSHIP rule 5) — a stale i18n.js degrades to has().
const hasLocal = (k) => (typeof i18nNs.hasLocal === 'function' ? i18nNs.hasLocal(k) : has(k));
// Review r1 (slice 2) P2: the decision prompt's wrapping DEGRADE — the answers
// wrap through the kit's auto-row law (ui/controls.js); when that leaf is
// absent or stale (no armAutoRow export) the options take the kit --row
// register outright so long translated answers never clip on 667 x 375.
// PENDING = DEGRADED (the ownership ledger cache-poison contract; review r1 P2 on
// PR #726): an option built while the leaf is still loading wears the
// shell's own BELT — `.ob-btn--row` + data-ob-shell-belt — when its label
// cannot fit one line by the shell's cheap measure on the mounted pill
// (beltPendingOptions below). When the leaf settles OK the belts are handed
// to the kit: marker + class come off in the settle microtask and the kit's
// document MutationObserver re-judges each pill in the same frame (rAF
// before paint), stamping data-ob-autorow where the copy still overflows.
// A failed (null) or stale (no armAutoRow) leaf never upgrades: the belt
// stays. REACHABILITY (disclosed): main.js boot() awaits this same module
// (try/catch) before __test.ready, and the shell builds prompts only after
// ready — so on today's boot order the leaf has always SETTLED at build and
// the belt never fires; it is the contract-correct guard should the boot
// stop awaiting the kit. e2e-shell G4 P3 fences both facts (held → ready
// stays false, no prompt; released → the kit judges; failed → --row).
const SHELL_BELT = 'data-ob-shell-belt';
let controlsLeaf; // undefined while pending, the namespace once it lands, null when it cannot
function upgradeShellBelts() {
  if (!controlsLeaf || typeof controlsLeaf.armAutoRow !== 'function') return; // null / stale: the belt stays
  for (const b of document.querySelectorAll(`.ob-btn[${SHELL_BELT}]`)) {
    b.removeAttribute(SHELL_BELT);
    b.classList.remove('ob-btn--row'); // the class mutation queues the kit's judge
  }
}
/** the shell's cheap one-line measure on a MOUNTED pill: the nowrap label
 * overflows its box, or the text paints more than one line box */
function shellLabelOverflows(b) {
  if (b.scrollWidth > b.clientWidth + 1) return true;
  const rg = document.createRange(); rg.selectNodeContents(b);
  const tops = new Set();
  for (const r of rg.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top));
  return tops.size > 1;
}
/** belt every mounted default pill in `row` whose label cannot fit (measure
 * all, then apply — one layout, the kit judge's own batching idiom) */
function beltPendingOptions(row) {
  if (!row) return;
  const pills = [...row.querySelectorAll('.ob-btn:not(.ob-btn--row)')];
  const need = pills.map(shellLabelOverflows);
  pills.forEach((b, i) => { if (need[i]) { b.classList.add('ob-btn--row'); b.setAttribute(SHELL_BELT, ''); } });
}
import('./ui/controls.js').then((m) => { controlsLeaf = m; upgradeShellBelts(); }).catch(() => { controlsLeaf = null; });

// GH-668 S5 slice 2 (B-SH05, ruling R3): the rail's settings segment wears
// the SAME gear mark as the toolbar #ob-gear, INLINED like every primary
// chrome pill (GH-246 defect 1: the owner rejected the '⚙' text degrade the
// guarded ui/icons.js import falls back to — no import edge, no async,
// nothing to fail). The copy is gated BYTE-IDENTICAL to ui/icons.js by
// web/tools/glyph-audit.mjs (marker grammar + the canonical emitter below).
const GEAR_GLYPH = /* OB-GLYPH:gear */
  '<path d="M8.72 5.06L8.95 2.98A7.1 7.1 0 0 1 11.05 2.98L11.28 5.06'
  + 'A5.1 5.1 0 0 1 12.59 5.61L14.22 4.29A7.1 7.1 0 0 1 15.71 5.78'
  + 'L14.39 7.41A5.1 5.1 0 0 1 14.94 8.72L17.02 8.95A7.1 7.1 0 0 1 '
  + '17.02 11.05L14.94 11.28A5.1 5.1 0 0 1 14.39 12.59L15.71 14.22'
  + 'A7.1 7.1 0 0 1 14.22 15.71L12.59 14.39A5.1 5.1 0 0 1 11.28 14.94'
  + 'L11.05 17.02A7.1 7.1 0 0 1 8.95 17.02L8.72 14.94A5.1 5.1 0 0 1 '
  + '7.41 14.39L5.78 15.71A7.1 7.1 0 0 1 4.29 14.22L5.61 12.59'
  + 'A5.1 5.1 0 0 1 5.06 11.28L2.98 11.05A7.1 7.1 0 0 1 2.98 8.95'
  + 'L5.06 8.72A5.1 5.1 0 0 1 5.61 7.41L4.29 5.78A7.1 7.1 0 0 1 '
  + '5.78 4.29L7.41 5.61Z"/><circle cx="10" cy="10" r="1.9"/>';
/** Inline-SVG markup for inlined path data — byte-identical to what
 * ui/icons.js `iconHtml(name, { size })` emits (glyph-audit.mjs compares the
 * reconstructed <svg> statically). Decorative graphic: the OWNING control
 * keeps the localized title/aria-label. */
const inlineGlyph = (paths, name, size = 20) => `<svg viewBox="0 0 20 20"`
  + ` width="${size}" height="${size}"`
  + ` fill="none" stroke="currentColor" stroke-width="1.5"`
  + ` stroke-linecap="round" stroke-linejoin="round"`
  + ` aria-hidden="true" focusable="false" data-icon="${name}">${paths}</svg>`;

const SHELL_KEY = 'ob-shell-v1';
const PLACE_IDS = ['play', 'practice', 'equipment', 'replays'];
// byte-equal to playback.js QUIET_STAGES (contract §7 / research R1)
const QUIET_STAGES = ['AIM', 'BALL_IN_HAND', 'WIN'];
const TABLE_LEN_DEFAULT = 2.54; // scene/table.js TABLE.length (dup-literal law)

// Places registry (contract §2 — FROZEN ids, order, ownership). Anchor
// tuples are the S1 implementation output; the capture pack validates them
// and the signed values get recorded back into contract §2. The two hero-
// table anchors scale with the ACTIVE bed like camerapresets 'default';
// the wall anchors target fixed room dressing (web/scene/room.js:262-330).
const PLACES = [
  // play (also the fresh-boot settle target): widened + lowered per the
  // owner fix round 2026-08-14 — the frame itself must say "billiard hall":
  // the +x cue-rack wall enters frame right, the -z bench/plaque wall frame
  // left, the table sits lower-center as the hero, not the whole frame.
  // Radius bed-scaling is DAMPED (0.35, not linear): the walls are fixed
  // room dressing, so a bigger bed needs proportionally less pull-back —
  // and a linear pull-back sank the dark-cloth 12ft snooker profile under
  // the lum-40 boot floor (measured 35.4; damped: 46.6). Pixel floors
  // re-verified per profile with the §7.1 lighting state applied: 9ft
  // tournament_blue lum 55 / blue 0.104, snooker_12ft lum 46.6 /
  // olive 0.32 (floors 40 / 0.07).
  { id: 'play', labelKey: 'shell.place.play', props: ['table'],
    anchor: (s) => ({ tx: 0.3, ty: 0.12, tz: -0.3, radius: 3.3 * (1 + 0.35 * (s - 1)), theta: -0.72, phi: 1.12, fov: 42 }) },
  { id: 'practice', labelKey: 'shell.place.practice', props: ['table'],
    anchor: (s) => ({ tx: 0, ty: 0.05, tz: 0, radius: 2.6 * s, theta: 0.7, phi: 1.0, fov: 40 }) },
  { id: 'equipment', labelKey: 'shell.place.equipment', props: ['obCueRack'],
    anchor: () => ({ tx: 4.44, ty: 0.2, tz: -0.53, radius: 2.7, theta: -1.3, phi: 1.3, fov: 40 }) },
  { id: 'replays', labelKey: 'shell.place.replays', props: ['obBench', 'obScorePlaque'],
    anchor: () => ({ tx: 1.35, ty: 0.3, tz: -2.78, radius: 2.9, theta: 0.3, phi: 1.28, fov: 40 }) },
];

// Place-content modules (GH-525 S4 prep R0 — the integrator-assigned §9
// entry): a place presents its rich content as its card-section CONTENT
// through a LEAF module riding a guarded dynamic import at the place's
// FIRST arrival (the S2 atelier seam, generalised — cache-poison contract:
// an absent/stale module leaves the S1 stub cards standing). Seeded with
// equipment ONLY: pre-registering an absent module would 404 on its first
// arrival and trip the zero-console-error gates. Each place lane adds ONE
// row, in registry order, with the PR that lands its module.
const CONTENT_MODULES = {
  play: ['./play.js', 'createPlay'], // 034a-front (feature 034)
  practice: ['./practice.js', 'createPractice'],
  equipment: ['./atelier.js', 'createAtelier'],
  replays: ['./replays.js', 'createReplays'],
};
// gateKeyDown exemption (FR-017; the law is at the gate): containers whose
// OWN listeners are keyboard-complete for arrows/Home/End. One entry per
// place lane, in registry order.
const KEY_GATE_EXEMPT = ['#ob-atelier-carousel', '#ob-atelier-rail',
  '#ob-shell-rail[data-ob-roving]', '[data-ob="atelier-cloth-colors"]',
  '[data-ob="play-games"], [data-ob="play-variants"]', // 034a-front
  '[data-ob="practice-assist-strip"][data-ob-roving]', // 036a
  '#ob-replays-rail[data-ob-roving]', // 035a (appended LAST — R0 order law)
];

export function createShell({ machine, game, orbit, camera, scene, scripted, hallKeys }) {
  // ---- boot stamps (§4) -----------------------------------------------------
  const q = new URLSearchParams(location.search);
  const qOn = (k) => q.has(k) && q.get(k) !== '0';
  // `scripted` arrives from main.js's one computed convention; recompute the
  // same way if an older integrator hunk did not pass it (rule-5 tolerance).
  let scriptedStamp = scripted;
  if (scriptedStamp === undefined) {
    scriptedStamp = qOn('obtool') || qOn('cinema');
    try {
      scriptedStamp = scriptedStamp || sessionStorage.getItem('ob-scripted') === '1';
    } catch { /* storage unavailable */ }
  }
  const obshell = qOn('obshell'); // the RESERVED scripted opt-in (ruling 3)
  if (scriptedStamp && !obshell) return null; // byte-identical scripted boot

  // ---- shell state (§5: ob-shell-v1; parse-validate-else-fresh) -------------
  function readState() {
    try {
      const raw = localStorage.getItem(SHELL_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || typeof s !== 'object' || s.v !== 1) return null;
      if (!PLACE_IDS.includes(s.lastPlace)) return null;
      if (typeof s.startAtTable !== 'boolean') return null;
      return { v: 1, lastPlace: s.lastPlace, startAtTable: s.startAtTable };
    } catch { return null; } // degrade-to-fresh: NEVER a boot error
  }
  let stored = readState();
  let startAtTable = stored?.startAtTable === true;
  let writeWarned = false; // GH-534 G5: once-per-session breadcrumb
  function writeState(patch = {}) {
    // #1019: another tab on the profile may have written since this one
    // read, so a field this write does not set keeps the STORED value (a
    // lastPlace write never reverts the other tab's startAtTable choice);
    // the in-memory toggle state moves only with an explicit patch
    const now = readState() ?? stored;
    const next = {
      v: 1,
      lastPlace: PLACE_IDS.includes(patch.lastPlace) ? patch.lastPlace
        : (now?.lastPlace ?? active),
      startAtTable: typeof patch.startAtTable === 'boolean'
        ? patch.startAtTable : (now?.startAtTable ?? startAtTable),
    };
    stored = next;
    if (typeof patch.startAtTable === 'boolean') startAtTable = next.startAtTable;
    try { localStorage.setItem(SHELL_KEY, JSON.stringify(next)); } catch {
      // GH-534 G5 (round-2 QA): storage-degrade honesty — one breadcrumb
      // per session + the shared bugreport ledger marker (settings.js owns
      // the user-facing hint; navigation memory just doesn't stick)
      const slot = (window.__obStorage ??= { persistFailed: 0, firstKey: null });
      slot.persistFailed += 1;
      slot.firstKey ??= SHELL_KEY;
      if (!writeWarned) {
        writeWarned = true;
        console.warn('[shell] state persist failed — navigation memory is '
          + 'session-only');
      }
    }
  }

  // ---- D7 perf-tier glass gate (owner ruling 2026-08-15) ---------------------
  // Smoked glass joins the D7 degrade ladder between rungs 1 and 2: a LOW
  // perf tier forces the solid-panel fallback (body.ob-glass-off — shell.css
  // material section). The tier signal is the D7 seam, feature-detected on
  // window.__obPerfTier (value or getter; ABSENT = glass on) and re-read on
  // its ob:perftier announce event — the phone perf spot-check drives this
  // exact seam to prove the fallback path.
  const glassGate = () => {
    let low = false;
    try {
      const tier = window.__obPerfTier;
      low = (typeof tier === 'function' ? tier() : tier) === 'low';
    } catch { /* seam absent/throwing = glass on */ }
    document.body.classList.toggle('ob-glass-off', low);
  };
  glassGate();
  window.addEventListener('ob:perftier', glassGate);

  // ---- mover + registry helpers ---------------------------------------------
  const mover = createShellMover({ orbit, camera, machine });
  const bedScale = () => {
    const len = game.template?.system?.table?.length;
    return Number.isFinite(len) ? Math.max(1, len / TABLE_LEN_DEFAULT) : 1;
  };
  const placeOf = (id) => PLACES.find((p) => p.id === id);
  const anchorOf = (id) => placeOf(id).anchor(bedScale());
  // GH-1025: the game + bed this hall session was entered from. A commit
  // that changes either (play.js commitGame re-racks while the hall is
  // open, then exits) must not restore a pose framed for the previous bed.
  // Value key, not template identity: every rerack parses a fresh template.
  const bedKey = () => {
    const t = game?.template?.system?.table;
    return JSON.stringify([game?.gameId ?? null, t?.length ?? null, t?.width ?? null]);
  };
  let entryBed = null;

  // ---- entry-state law (§7 / FR-016; research R1) ----------------------------
  const sharedReplayLive = () => {
    try {
      const r = window.__share?.replay?.();
      return !!r?.active && r.done !== true;
    } catch { return false; }
  };
  const pendingShareIntent = () => {
    try {
      // preferred: the share.js boot-intent seam (contract §9 deviation 1)
      if (typeof window.__share?.pending === 'function') {
        return window.__share.pending() === true;
      }
      // stale-share.js degrade: live composite — a completed replay clears
      // via active/done, a dismissed gate banner clears via the hash wipe;
      // ONLY a rejected link over-locks (the recorded R1 residual risk)
      const r = window.__share?.replay?.();
      return /[#&]r=/.test(location.hash)
        && r?.active !== true && r?.done !== true;
    } catch { return false; }
  };
  // GH-711: the rules lock as flow.js reads it (replayLocked = ctx.replay
  // Active() = share.js replay.active — true for a FINISHED replay too,
  // until the viewer resolves it); the finished-state read above
  // (sharedReplayLive) is the ENTRY law, not the lock.
  const sharedReplayLocked = () => {
    try { return window.__share?.replay?.()?.active === true; } catch { return false; }
  };
  /** Resolve a finished shared replay KEEPING the shared position — the
   * finished bar's own GH-451 "Continue from here" path (replay.active
   * false, hash wiped, ctx.replayHandoff re-drives the table's decision
   * dialog). share.js exports no seam for it; the bar's button is live DOM
   * while the replay is done (hidden under the hall by #696 — visibility,
   * not removal), so its activation IS the seam. False when unavailable
   * (a stale share.js / a replay still running): the caller keeps the
   * hall — never the exit-and-rerack fallback. */
  const continueSharedReplay = () => {
    const r = (() => { try { return window.__share?.replay?.(); } catch { return null; } })();
    if (!r?.active || r.done !== true) return false;
    const btn = document.getElementById('ob-rp-continue');
    if (!(btn instanceof HTMLButtonElement) || btn.disabled) return false;
    btn.click();
    return sharedReplayLocked() === false;
  };
  const decisionPending = () => {
    try {
      if ((window.__rules?.matchState?.()?.pendingDecision ?? null) !== null) {
        return true;
      }
    } catch { /* seam absent */ }
    // the settings gear-inert mirror (015 §2): the decision dialog's own DOM
    const d = document.getElementById('hud-decision');
    return !!d && d.getClientRects().length > 0;
  };
  // GH-541 (shell.md §9 deviation 10 — the FR-016(d) amendment): a pending
  // rules decision no longer refuses ENTRY. The decision is a soft prompt
  // with a physics-truth fallback (flow.js caromPreJudge auto-resolves
  // break_spot from the first stroke) and browsing places/equipment mutates
  // nothing it protects — it blocks only the CONFLICTING COMMITS (the
  // atelier swap Keep and try-it, gated atelier-side on the decisionPending
  // seam below) and surfaces as an answerable prompt within the shell
  // (syncDecisionPrompt). The shot-in-flight / replay refusals — the
  // PLAYBACK honest-refusal register — are unchanged.
  // R0 amendment R0(h) (035 plan P-16; carried by the 035a lane as the
  // protocol fallback — names no place): a PLAYBACK open is async after
  // its caller's exit (archive read, settle wait, player build) while the
  // machine still reads a QUIET stage, so a pill tap in that window would
  // re-open the hall and the borrow would start UNDER an open shell. The
  // DVR publishes `__playback.opening()` for exactly that window (its own
  // modal row path and the S1 stub action share it); the gate refuses
  // entry with the existing busy register meanwhile. Feature-detected: an
  // old playback.js has no seam → the pre-amendment law.
  const playbackOpening = () => {
    try { return window.__playback?.opening?.() === true; } catch { return false; }
  };
  const entryAllowed = () => machine.is(...QUIET_STAGES)
    && !sharedReplayLive() && !pendingShareIntent() && !playbackOpening();
  const refusalNote = () => {
    // B-SH08: the copy names the EXIT (has()-guarded: a stale locale
    // dictionary without the slice-2 key keeps the condition line; the
    // want / legacy pair is re-picked on every locale broadcast — review r2)
    if (sharedReplayLive() || pendingShareIntent()) note('shell.notice.replayExit', undefined, 'shell.notice.replay');
    else note('shell.notice.busy');
  };

  // ---- transient notice (the honest refusal register, §6) --------------------
  // GH-668 S5 slice 2 (B-SH08): the notice is the kit NOTICE register —
  // div.ob-prompt.ob-prompt--notice (kit.css owns its placement 84 / 88 +
  // safe-area, the --ob-info-line register cue, balanced wrapping, the
  // coarse 56vw bound; the shell contributes ONLY --ob-prompt-lift through
  // body.ob-shell-stacked in ui/shell.css). It stores the i18n KEY, not the
  // rendered string, so a locale flip while the notice is up re-composes it
  // (onLocaleChange below); a caller that still passes a raw string renders
  // it once (has() guard — the cache-poison contract's stale-module rung).
  // review r2 P2-2: a guarded key travels as a want / legacy PAIR and is
  // re-selected against the ACTIVE dictionary at every compose — a locale
  // flip onto a stale cached dictionary while the notice is up lands the
  // localized legacy line, never the en fallback of the new key.
  // review r3 P2: a key with NO localized legacy composition travels with
  // `strictKeys` — every key of the set must be in the ACTIVE dictionary
  // (hasLocal) or the notice is OMITTED (the coarse Remember pair: the only
  // pre-slice-2 string is the row's imperative label, which names no state
  // and would read as a confirmation on the OFF toggle). Re-selected at
  // every compose: a locale flip onto a stale dictionary while it is up
  // withdraws it; noteText() returns null for "omit".
  let noteEl = null, noteTimer = 0, noteKey = null, noteParams, noteLegacy = null, noteStrict = null;
  const noteText = () => {
    if (noteStrict && !noteStrict.every((sk) => hasLocal(sk))) return null;
    const k = noteLegacy && !hasLocal(noteKey) ? noteLegacy : noteKey;
    return k && has(k) ? t(k, noteParams) : k;
  };
  const dropNote = () => { clearTimeout(noteTimer); noteEl?.remove(); noteKey = null; };
  function note(key, params, legacy, strictKeys) {
    if (!noteEl) {
      noteEl = document.createElement('div');
      noteEl.id = 'ob-shell-note';
      noteEl.className = 'ob-prompt ob-prompt--notice';
      noteEl.setAttribute('role', 'status');
      noteEl.setAttribute('aria-live', 'polite');
    }
    noteKey = key; noteParams = params; noteLegacy = legacy || null; noteStrict = strictKeys || null;
    const text = noteText();
    if (text === null) { dropNote(); return false; } // omitted: no localized composition
    noteEl.textContent = text;
    document.body.appendChild(noteEl);
    syncNoteLift();
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { noteEl?.remove(); noteKey = null; }, 4000);
    return true;
  }
  onLocaleChange(() => {
    if (!(noteEl && noteEl.isConnected && noteKey)) return;
    const text = noteText();
    if (text === null) { dropNote(); return; }
    noteEl.textContent = text; syncNoteLift();
  });
  // B-SH08 lift: the notice rises over the quick-play stack ONLY when the
  // two share columns — the fine-pointer <= 700 px stack (quick-play + the
  // remember row, right-anchored ABOVE the rail) meets a centred notice;
  // the folded coarse stack sits beside it, and lifting there would float
  // the notice off its rail register (58 px at 667 x 375). Live rects from
  // the B-K05 seam, never a guessed width; #ob-shell-note.ob-shell-note--lift
  // keys the --ob-prompt-lift rule in ui/shell.css. Re-read on every band
  // write, on show and on a locale re-compose (the width changes).
  function syncNoteLift(b) {
    if (!noteEl || !noteEl.isConnected) return;
    try {
      const s = b || bands();
      const q = s.quickPlay;
      const nr = noteEl.getBoundingClientRect();
      const meets = !!(s.stacked && q && nr.width > 0 && nr.left < q.right && q.left < nr.right);
      noteEl.classList.toggle('ob-shell-note--lift', meets);
    } catch { /* pre-build call: no bands yet */ }
  }

  // ---- stylesheet: critical block + ?v= leaf (playback.js precedent) --------
  if (!document.getElementById('ob-shell-crit')) {
    const crit = document.createElement('style');
    crit.id = 'ob-shell-crit';
    crit.textContent = `
      #ob-shell { position: fixed; inset: 0; z-index: 8;
        pointer-events: none; font-family: var(--ob-font); }
      #ob-shell[hidden] { display: none; }
      /* OPERABILITY floor (review review r2 P1): with the leaf sheet slow or
         missing, the chrome must still take input and the gameplay HUD must
         still yield — the root is pointer-inert by design, so the children's
         re-enable and the FR-017 inertness rules ride the critical block. */
      #ob-shell-rail, #ob-shell-quickplay-wrap, #ob-shell-cards,
      #ob-shell-decision {
        pointer-events: auto; }
      /* B-K05 band-T probe: an inert body-level box whose rect IS band T's
         corner slot edge on html.ob-touch (touch.css tokens resolve through
         layout, env() included); padding-left carries sp-2 for the reserve
         gap. Fine pointers: every token absent → a 0-height box at 0. */
      #ob-shell-bands-probe { position: fixed; top: var(--ob-band-t, 0px);
        left: calc(var(--ob-safe-l, 0px) + max(var(--ob-corner-l, 0px), var(--ob-corner-l-live, -16px) + 2 * var(--ob-sp-2, 8px)));
        width: 0; height: var(--ob-band-t-h, 0px);
        padding-left: var(--ob-sp-2, 8px); visibility: hidden;
        pointer-events: none; }
      /* GH-541 (shell.md §9 dev 10): while the shell is OPEN the hud
         decision dialog stands down (the html.ob-pb-live playback
         precedent — panelHidden() inerts its kit trap, the root observer
         fires the reveal handoff on exit) and the shell's own answerable
         prompt carries the decision. !important: renderDecision flips the
         inline style. Rides the critical block — the stand-down pair is
         operability, not skin. */
      html.ob-shell-open #hud-decision { display: none !important; }
      /* GH-668 S5 slice 2 (B-PL05): #ob-shell-decision IS the kit ROUTED
         prompt (div.ob-prompt.ob-prompt--routed): kit.css owns its box,
         the top-centre law, the <= 1180 px right-band placement (12 px
         band, 560 px bound, both safe-area insets), the coarse 44 answers
         and the equal-neutral-pill anatomy (R6). The shell keeps ONLY two
         placement voices here: the equipment-place anchor (GH-698) and the
         quick-play yield while a prompt is up — both marker-keyed on
         #ob-shell (.ob-shell-at-<place> / .ob-shell-decision-up).
         GH-711 LOCKED face (a shared replay holds the rules lock): the
         one-line reason is the kit's __body part (.ob-prompt__body, alias
         .osd-lock for e2e-shell-qa3) between the hint and the actions; the
         answers are absent, one primary Continue rides the actions row. */
      @media (max-width: 1180px) {
        /* GH-698 (S4 journey QA round 2): the band right of the PLAY card
           is not the band right of the EQUIPMENT host — the atelier host
           is min(430px, 100vw - 28px) wide (atelier.css) with the pinned
           station strip across its top (host 14..78 at inset 0), so the
           top-right prompt (left edge 306 at every width <= 878) painted
           over the 4th/5th station pills: Lighting was untappable while a
           decision pended (GH-541's browse-freely intent). At the
           equipment place the prompt anchors BELOW the strip row instead:
           top = the cards datum (14 + inset) + the strip-only host height
           (64) + the 12px band. The right law is the kit's; every station
           pill stays hit-testable (e2e-atelier Q698 census). #ob-shell
           carries .ob-shell-at-<place> (presentPlace). Same numbers as
           the pre-slice-2 rule, now a voice on the kit part. */
        #ob-shell.ob-shell-at-equipment .ob-prompt--routed {
          top: calc(14px + 64px + var(--ob-sp-3)
            + env(safe-area-inset-top, 0px));
          /* below the strip there is no card column to clear, so the
             bound is the safe width (12px bands, side insets), still
             capped at 560px: at 667x375 the 349px bound stacked the
             three de answers 270px tall (90..360) into the place rail
             (top 297) — at the full bound the prompt stays above it */
          max-width: min(100vw - 2 * var(--ob-sp-3)
            - env(safe-area-inset-left, 0px)
            - env(safe-area-inset-right, 0px), 560px); }
        /* ...and on SHORT viewports (390/375/428 tall) the dropped prompt
           (a two-row prompt is 202px tall: 90..292) reaches the quick-play
           stack (top 206 at 844x390, 244 at 926x428): the quick-play
           YIELD of the <= 700px coarse clause below applies at the
           equipment place too, under the same .ob-shell-decision-up
           marker (the decision precedes play; the stack returns with the
           prompt's removal). */
        @media (max-height: 520px) {
          /* the vertical budget between the strip (78) and the place rail
             (top 297 at 667x375, 312 at 844x390) is ~195-210px; the 560px
             cap stacked the longest three-answer copies (de
             eight_break_foul) 235px tall. On these viewports the cap
             lifts to the safe width (92vw is the centred law's own
             phone reading width) so the answers fit in fewer rows and
             the prompt ends above the rail. */
          #ob-shell.ob-shell-at-equipment .ob-prompt--routed {
            max-width: calc(100vw - 2 * var(--ob-sp-3)
              - env(safe-area-inset-left, 0px)
              - env(safe-area-inset-right, 0px)); }
          #ob-shell.ob-shell-at-equipment #ob-shell-quickplay-wrap {
            transition: opacity var(--ob-t-fast) var(--ob-ease); }
          #ob-shell.ob-shell-at-equipment.ob-shell-decision-up
            #ob-shell-quickplay-wrap {
            opacity: 0; visibility: hidden; pointer-events: none;
            transition: opacity var(--ob-t-fast) var(--ob-ease),
                        visibility 0s linear var(--ob-t-fast); }
          @media (prefers-reduced-motion: reduce) {
            #ob-shell.ob-shell-at-equipment #ob-shell-quickplay-wrap,
            #ob-shell.ob-shell-at-equipment.ob-shell-decision-up
              #ob-shell-quickplay-wrap { transition: none; } } } }
      @media (pointer: coarse) and (max-width: 700px) {
        /* quick-play YIELDS while the prompt is up (integrator ruling on
           lane question 34, 2026-09-05): the decision precedes play, and a
           two-row prompt (de's native break_spot copies; any locale's
           longest option) is 202px tall against the 179px band above the
           stack (158px under the 21px bottom inset) — it reached 23-44px
           into the quick-play pill. While #ob-shell carries
           .ob-shell-decision-up (set by syncDecisionPrompt with the
           prompt's mount, cleared by clearDecisionPrompt with its removal)
           the stack is hidden and pointer-inert; it returns the moment the
           prompt closes. The fade rides --ob-t-fast (visibility flips
           after the fade on the way out, at once on the way back); reduced
           motion: instant. No layout change — the stack keeps its box, the
           prompt its placement; 844x390 sits outside this clause. The
           answers' wrap on this narrow bound is the kit's auto-row law
           (ui/controls.js: a pill whose copy cannot fit becomes --row). */
        #ob-shell-quickplay-wrap {
          transition: opacity var(--ob-t-fast) var(--ob-ease); }
        #ob-shell.ob-shell-decision-up #ob-shell-quickplay-wrap {
          opacity: 0; visibility: hidden; pointer-events: none;
          transition: opacity var(--ob-t-fast) var(--ob-ease),
                      visibility 0s linear var(--ob-t-fast); }
        @media (prefers-reduced-motion: reduce) {
          #ob-shell-quickplay-wrap,
          #ob-shell.ob-shell-decision-up #ob-shell-quickplay-wrap {
            transition: none; } } }
      body.ob-shell-open #hud, body.ob-shell-open #ob-toolbar,
      body.ob-shell-open #help, body.ob-shell-open #aimw,
      body.ob-shell-open #banner, body.ob-shell-open #ob-push-btn,
      body.ob-shell-open #ob-power-gauge, body.ob-shell-open #ob-spin-btn,
      body.ob-shell-open #ob-fine-cluster,
      body.ob-shell-open #ob-touch-ghost,
      body.ob-shell-open #ob-replay, /* GH-696: the shared-replay transport bar */
      body.ob-shell-open #ob-drill-dock {
        opacity: 0; pointer-events: none; visibility: hidden; }
      /* GH-668 B-SH06 (S5 slice 2): the hall re-entry is the app's HOME —
         the LEADING toolbar slot (toolbar family "leading primary"
         exception, the design charter / e2e-ui J3-J4 note); tbOrder -1 below keeps
         TAB order = visual order */
      #ob-toolbar > #ob-shell-open { order: -1; }
      /* B-SH06 registers: fine pointers = the kit toolbar part's TEXT
         register (glyph + the shell.hall label); coarse = the 44 icon-only
         circle (.ob-btn--icon, synced in syncRegister) with the label
         folded. A stale locale cache with no shell.hall key leaves the
         label EMPTY -> folded too, never an 8 px gap beside the glyph. */
      html.ob-touch #ob-shell-open > .ob-btn__label,
      #ob-shell-open > .ob-btn__label:empty { display: none; }
      /* GH-668 B-K16: fixed offset = the stale-app.html fallback ONLY
         (#ob-toolbar > * { position: static !important } neutralises it
         once containered); everything else is the kit's toolbar part */
      #ob-shell-open { position: fixed; top: 54px; right: 10px; }
    `;
    document.head.appendChild(crit);
  }
  if (!document.getElementById('ob-shell-css')) {
    const link = document.createElement('link');
    link.id = 'ob-shell-css';
    link.rel = 'stylesheet';
    link.href = new URL(`./ui/shell.css?v=${SHELL_CSS_V}`, import.meta.url);
    document.head.appendChild(link);
  }

  // ---- chrome DOM (§6 — ALL present from build; hidden toggles) -------------
  const root = document.createElement('div');
  root.id = 'ob-shell';
  root.hidden = true;
  root.setAttribute('aria-label', t('shell.aria.shell'));
  root.dataset.i18nAria = 'shell.aria.shell';
  // GH-541 (shell.md §9 deviation 10): the shell is a dialog-kit EXTERNAL
  // LAYER — a visible [data-ob-layer] node stands yieldToOpen panels down
  // (dialog.js externalCover: trap inert, aria-hidden, autofocus deferred).
  // The hud decision prompt opens with yieldToOpen and must never fight the
  // open shell for keyboard/AT ownership: while the shell covers it, the
  // decision is answered through the shell's OWN prompt (see
  // syncDecisionPrompt) and the hud dialog stands down exactly like it does
  // under the settings/help/playback chrome (the GH-465 precedent).
  root.setAttribute('data-ob-layer', '');

  const rail = document.createElement('nav');
  rail.id = 'ob-shell-rail';
  // GH-534 round 7 (owner directive 2026-08-19): the rail is a consumer of
  // the ONE kit segmented-strip control. Geometry = kit.css .ob-strip
  // (stamped HERE so the class holds from first paint and in every degrade
  // register); behavior = ui/strip.js (guarded dynamic import below).
  // ob-strip--place (GH-668 B-K09, ruling R1): the PLACE rail is the one
  // strip whose current pill wears --ob-glass-glow; kit.css keys the glow on
  // this modifier so station strips / assist segments select with the plain
  // G9 register (dim-3 fill + accent hairline + accent ink, no halo).
  rail.classList.add('ob-strip', 'ob-strip--place');
  rail.setAttribute('aria-label', t('shell.aria.rail'));
  // SYNC BASE (§6 — ALL chrome present from build, so e2e/boot captures
  // never see an empty rail while the leaf module is in flight; this is
  // also the cache-poison degrade register): plain kit-anatomy pills the
  // strip leaf REBUILDS in place when it lands.
  const buildRailPills = () => {
    for (const p of PLACES) {
      const b = document.createElement('button');
      b.type = 'button';
      // ob-btn: kit-part membership (the e2e-ui rolled-own ratchet law);
      // ob-strip__seg: the kit strip pill geometry; ob-shell-place: the
      // frozen §6 selector (voice hook + e2e surface)
      b.className = 'ob-btn ob-strip__seg ob-shell-place';
      b.dataset.place = p.id;
      b.setAttribute('aria-current', 'false');
      const lab = document.createElement('span');
      lab.dataset.i18n = p.labelKey;
      lab.textContent = t(p.labelKey);
      b.appendChild(lab);
      b.addEventListener('click', () => goTo(p.id));
      rail.appendChild(b);
    }
  };
  buildRailPills();
  // the settings gear affordance on the rail (US1): routes through the SAME
  // dialog.js opener path the toolbar gear uses (show-then-open law, §6).
  // It carries NO data-place, so it sits outside the strip's roving set
  // (natural tab stop) while .ob-strip__seg keeps it on the pill geometry.
  // GH-668 B-SH05 (ruling R3): an ICON segment — one glyph for one verb,
  // the SAME inlined gear the toolbar #ob-gear wears, in the kit icon slot;
  // the localized word moves to aria-label + title (tooltip on pointer).
  // Fine pointers add .ob-btn--icon (a 44 square on the strip rung); on
  // coarse the segment keeps the strip's own 48 rung instead (the kit's
  // html.ob-touch .ob-btn--icon rule pins 44, which would sit a 44 square
  // inside a 48 row — the square coarse segment awaits the kit
  // .ob-strip__seg--icon micro-part, GH-668 follow-up; syncRegister below).
  // The 1 px divider before it is a kit gap too (.ob-strip__divider) —
  // NOT drawn locally; the strip gap is the separation until it lands.
  const railGear = document.createElement('button');
  railGear.type = 'button';
  railGear.id = 'ob-shell-settings';
  railGear.className = 'ob-btn ob-strip__seg';
  {
    const slot = document.createElement('span');
    slot.className = 'ob-btn__icon';
    slot.setAttribute('aria-hidden', 'true');
    slot.innerHTML = inlineGlyph(GEAR_GLYPH, 'gear');
    railGear.appendChild(slot);
  }
  railGear.title = t('shell.settings');
  railGear.setAttribute('aria-label', t('shell.settings'));
  railGear.addEventListener('click', () => showThenOpen(null));
  rail.appendChild(railGear);
  root.appendChild(rail);
  // ---- strip leaf upgrade (guarded dynamic import; cache-poison law) ------
  // On success the leaf rebuilds the pills (identical DOM surface) and owns
  // roving tab + radiogroup keyboard; the gear re-appends after the rebuild.
  // On failure the sync base stays and a degrade keydown handler supplies
  // the SAME radiogroup grammar (the review r1 P1 law: every key the shell
  // gate exempts for this container must be consumed IN it). Either way the
  // container is marked data-ob-roving — the gateKeyDown exemption keys on
  // that marker, so during the import window (handlers not yet attached)
  // arrows on a focused pill stay GATED exactly as shipped (FR-017).
  let railStrip = null;
  import('./ui/strip.js').then((m) => {
    if (typeof m.createStrip !== 'function') throw new Error('stale strip.js');
    railStrip = m.createStrip(rail,
      PLACES.map((p) => ({
        id: p.id, labelKey: p.labelKey, label: () => t(p.labelKey),
      })),
      (id) => goTo(id), { dataKey: 'place', segClass: 'ob-shell-place' });
    rail.appendChild(railGear); // rebuild emptied the mount; gear returns last
    rail.dataset.obRoving = '';
    if (open) railStrip.set(active); // re-sync a selection made pre-upgrade
    // the rail pans when a long locale outgrows a phone (de 844 x 390 clipped
    // 51 px at rest with no affordance — A4, uiaudit GH-1012): the kit's inline
    // scroll-edge fade paints a truthful band while it clips (the station
    // strip precedent, atelier.js); degrade = no fade, the rail still pans
    import('./ui/scrollfade.js').then((f) => f.attachScrollFade?.(rail, { axis: 'inline' })).catch(() => {});
  }).catch(() => {
    rail.dataset.obRoving = '';
    rail.addEventListener('keydown', (e) => {
      const at = e.target?.closest?.('[data-place]')?.dataset.place;
      if (at === undefined) return;
      const i = PLACE_IDS.indexOf(at);
      let next = null;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        next = PLACE_IDS[(i - 1 + PLACE_IDS.length) % PLACE_IDS.length];
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        next = PLACE_IDS[(i + 1) % PLACE_IDS.length];
      } else if (e.key === 'Home') next = PLACE_IDS[0];
      else if (e.key === 'End') next = PLACE_IDS[PLACE_IDS.length - 1];
      if (next === null) return;
      e.preventDefault();
      e.stopPropagation();
      rail.querySelector(`[data-place="${next}"]`)?.focus();
      goTo(next);
    });
  });

  // quick-play (persistent, keyboard-activatable — FR-007(1)) + remember
  // GH-668 S5 slice 2 (B-SH04 / R4 / R16): quick-play is the kit PRIMARY on
  // the 48 rung (.ob-btn--primary.ob-btn--lg — rest / hover / active / focus
  // rungs are the kit's; shell.css keeps only placement + the glass
  // material). Remember is a quiet switch row (the kit switch track + label,
  // aria-pressed; release ruling D1 replaced R4's tick row) under it on fine
  // pointers; on coarse pointers it FOLDS into quick-play
  // as its long-press secondary (armQuickPlayHold below) — the row stays in
  // the DOM, collapsed to the sr-only box until keyboard focus reveals it
  // (review r4 P2), so the frozen §6 selector [data-ob="shell-remember"]
  // still resolves and the tab order still reaches the writer (shell.md §9
  // DRAFT entry in the PR body).
  const qpWrap = document.createElement('div');
  qpWrap.id = 'ob-shell-quickplay-wrap';
  const qp = document.createElement('button');
  qp.type = 'button';
  qp.className = 'ob-btn ob-btn--primary ob-btn--lg';
  qp.id = 'ob-shell-quickplay';
  const qpLab = document.createElement('span');
  qpLab.className = 'ob-btn__label';
  qp.appendChild(qpLab);
  // R16 verb (B-SH09): the hall's own vocabulary — "To the table" at a fresh
  // rack, "Back to the table" while a match is LIVE (a shot has been taken
  // and the rack is not won). Re-read at build, on every openShell, on the
  // machine's stateChange and in relabel(); the data-i18n key flips with it
  // so the locale walk follows. `shell.quickPlay` stays for a stale locale.
  const qpVerb = () => {
    const live = (game?.shotIndex ?? 0) > 0 && !machine.is('WIN');
    const want = live ? 'shell.backToTable' : 'shell.toTable';
    const key = hasLocal(want) ? want : 'shell.quickPlay';
    if (qpLab.dataset.i18n !== key) qpLab.dataset.i18n = key;
    qpLab.textContent = t(key);
  };
  qpVerb();
  qp.addEventListener('click', () => quickPlay({ activated: true })); // a gesture exit (GH-682 r2)
  const remember = document.createElement('button');
  remember.type = 'button';
  // release ruling D1 (uiaudit F3/F58, supersedes R4's tick row): a quiet
  // SETTING row — the kit switch track + its label on the solid rung, no
  // border — so the stack reads as one primary action over one preference
  // instead of a 48 px pill over a 44 px boxed row with a radio-like mark
  remember.className = 'ob-btn ob-shell-remember';
  const remTrack = document.createElement('span');
  remTrack.className = 'ob-toggle__track';
  remTrack.setAttribute('aria-hidden', 'true');
  remember.appendChild(remTrack);
  remember.dataset.ob = 'shell-remember';
  // review r4 P2: on coarse pointers the row is focus-revealed (shell.css —
  // the sr-only skip-link idiom at rest, the kit row while focused) so the
  // tab order keeps a path to startAtTable; the attribute names the idiom
  // for the audits (a collapsed focus-reveal row is never a 1 px control)
  remember.dataset.obFocusReveal = '';
  remember.setAttribute('aria-pressed', String(startAtTable));
  const remLab = document.createElement('span');
  remLab.className = 'ob-btn__label';
  // the key is re-picked against the ACTIVE dictionary at build AND on every
  // relabel (a locale flip onto a stale dictionary must land the legacy
  // localized label, not the en fallback of the new key — review r1 P2)
  const rememberLabel = () => {
    const rk = hasLocal('shell.rememberNext') ? 'shell.rememberNext' : 'shell.remember';
    if (remLab.dataset.i18n !== rk) remLab.dataset.i18n = rk;
    remLab.textContent = t(rk);
  };
  rememberLabel();
  remember.appendChild(remLab);
  // the ONLY writer of startAtTable (§5 — explicit, opt-in, never inferred);
  // shared by the row's click and the coarse long-press fold
  const toggleRemember = () => {
    writeState({ startAtTable: !(startAtTable === true), lastPlace: active });
    remember.setAttribute('aria-pressed', String(startAtTable));
    return startAtTable;
  };
  remember.addEventListener('click', () => { toggleRemember(); });
  qpWrap.append(qp, remember);
  root.appendChild(qpWrap);

  // ---- B-K05 shell seam (GH-668 S5 slice 2, the shell half) -----------------
  // Modules used to GUESS where the place rail and the quick-play stack sit
  // (atelier.css / play.css hard-code the quick-play edge) and painted
  // controls under them (BACKLOG B-K05: txbar off-screen, sheet actions
  // under the rail band, drill badge under band T). The shell now PUBLISHES
  // its band geometry — one truth, read-only, computed from live rects:
  //   window.__shell.bands() → { rail, quickPlay, reserve, bandT, stacked }
  //   five px custom properties on #ob-shell AND :root —
  //     --ob-shell-rail-top / --ob-shell-rail-h (the rail band),
  //     --ob-shell-reserve-b (px from the bottom the place content keeps
  //       clear of: viewport − min(rail.top, quickPlay.top) + sp-2),
  //     --ob-shell-reserve-r (px from the right the quick-play stack owns
  //       on the side-by-side register — and under the GH-989 fine-pointer
  //       lift above 700 px, where it rides WITH the stacked bottom band; 0
  //       while stacked by the <= 700 px / coarse escape),
  //     --ob-shell-bandt-r (band T's corner-slot right edge = safe-left +
  //       --ob-corner-l on html.ob-touch; 0 on fine pointers);
  //   body.ob-shell-stacked while quick-play sits ABOVE the rail (coarse /
  //   ≤ 700 px); `ob:shell-bands` (window, non-bubbling) after each write.
  // Band T is measured through an inert body-level probe so the touch.css
  // tokens (calc + env) resolve through layout — never parseFloat of a calc
  // string. Writes are rAF-coalesced (a ResizeObserver callback that mutates
  // consumers' layout would report the undelivered-notifications error).
  // A closed shell reserves nothing (rail/quickPlay null, reserve 0).
  const bandsProbe = document.createElement('div');
  bandsProbe.id = 'ob-shell-bands-probe';
  bandsProbe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bandsProbe);
  const bandRect = (el) => {
    if (!el || root.hidden || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return null;
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom,
      width: r.width, height: r.height };
  };
  function bands() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const pr = bandsProbe.getBoundingClientRect();
    const sp2 = parseFloat(getComputedStyle(bandsProbe).paddingLeft) || 8;
    const touch = document.documentElement.classList.contains('ob-touch');
    const bandT = touch ? { top: pr.top, height: pr.height, right: pr.left }
      : { top: 0, height: 0, right: 0 };
    const railR = bandRect(rail);
    // the stack is null while hidden (shell closed) or YIELDED (decision-up
    // keeps the box but flips visibility — read the computed truth)
    let qpR = bandRect(qpWrap);
    if (qpR && getComputedStyle(qpWrap).visibility === 'hidden') qpR = null;
    const stacked = !!(railR && qpR && qpR.bottom <= railR.top + 0.5);
    // GH-989's measured lift (fine pointers, wider than the <= 700 px stacking
    // escape) raises the stack above the rail but leaves it a RIGHT column:
    // it reserves that column (reserve.right) ON TOP OF the stacked bottom
    // band — a consumer reading either reserve stays clear of it. A zero
    // right reserve let the atelier go full width until its keep bar covered
    // the cards (e2e-atelier S5-X2 800x600); a rail-only bottom band let its
    // cue card's Try-it slide under the lifted stack (S5-Q)
    const sideLift = stacked && root.classList.contains('ob-shell-qp-lift') && vw > 700;
    const tops = [railR?.top, qpR?.top].filter((v) => Number.isFinite(v));
    const reserve = {
      bottom: tops.length ? Math.max(0, vh - Math.min(...tops) + sp2) : 0,
      right: qpR && (!stacked || sideLift) ? Math.max(0, vw - qpR.left + sp2) : 0,
    };
    return { rail: railR, quickPlay: qpR, reserve, bandT, stacked,
      viewport: { width: vw, height: vh } };
  }
  let bandsKey = '', bandsRaf = 0;
  const px2 = (v) => `${Math.round(v * 100) / 100}px`;
  // GH-989: on fine pointers the quick-play stack and the centred rail share
  // the bottom baseline; the stack used to lift only under a GUESSED 700 px
  // media query while the real collision width moves with the locale (en
  // ~957 px, de ~1058 px), so in between the remember row covered the rail's
  // Settings gear. Decide the lift from the MEASURED horizontal boxes — the
  // rail's painted right edge (+ sp-2) against the stack's left edge. The
  // lift moves the stack's `bottom` only, never either box horizontally, so
  // the decision cannot oscillate; measured, an env(safe-area-inset-right)
  // or a locale's width counts exactly as it renders (a derived 14 px inset
  // missed the safe area: the e2e-ui GH-989 sweep caught it).
  const syncQpLift = () => {
    const touch = document.documentElement.classList.contains('ob-touch');
    let lift = false;
    if (!touch && !root.hidden && rail.getClientRects().length && qpWrap.getClientRects().length) {
      const sp2 = parseFloat(getComputedStyle(bandsProbe).paddingLeft) || 8;
      lift = rail.getBoundingClientRect().right + sp2 > qpWrap.getBoundingClientRect().left;
    }
    root.classList.toggle('ob-shell-qp-lift', lift);
  };
  let hookToolbar = () => {}; // armed by the band ResizeObserver below
  const writeBands = () => {
    hookToolbar(); // a toolbar built after the shell joins the observer
    syncQpLift();
    const b = bands();
    const railTop = px2(b.rail ? b.rail.top : b.viewport.height);
    const railH = px2(b.rail ? b.rail.height : 0);
    const reserveB = px2(b.reserve.bottom);
    const reserveR = px2(b.reserve.right);
    const bandTR = px2(b.bandT.right);
    // change-only: the vars AND the rects (a stacked rail re-centred by a
    // locale flip moves no var, yet a bands() consumer must hear it)
    const sig = (r) => (r ? [r.top, r.left, r.right, r.bottom].map((v) => Math.round(v * 100)).join(',') : '-');
    const key = `${[railTop, railH, reserveB, reserveR, bandTR].join(',')}|${sig(b.rail)}|${sig(b.quickPlay)}|${b.stacked ? 's' : '-'}`;
    if (key === bandsKey) return;
    bandsKey = key;
    // the five band vars, written to the shell root AND :root (each name on
    // its setProperty line: the GH-687 ci-bands lint reads a quoted `--…serve…`
    // / `--…band…` literal as a port-like argv flag unless the line is a CSS
    // custom-property API call)
    for (const st of [root.style, document.documentElement.style]) {
      st.setProperty('--ob-shell-rail-top', railTop);
      st.setProperty('--ob-shell-rail-h', railH);
      st.setProperty('--ob-shell-reserve-b', reserveB);
      st.setProperty('--ob-shell-reserve-r', reserveR);
      st.setProperty('--ob-shell-bandt-r', bandTR);
    }
    document.body.classList.toggle('ob-shell-stacked', b.stacked);
    syncNoteLift(b);
    window.dispatchEvent(new CustomEvent('ob:shell-bands', { detail: b }));
  };
  const scheduleBands = () => {
    if (bandsRaf) return;
    bandsRaf = requestAnimationFrame(() => { bandsRaf = 0; writeBands(); });
  };
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(scheduleBands);
    ro.observe(rail);
    ro.observe(qpWrap);
    ro.observe(document.documentElement); // viewport + zoom
    // band T follows the LIVE toolbar width (touch.js writes
    // --ob-corner-l-live on <html> from the same resize): a pill appearing or
    // hiding resizes no rail / stack / html box, so the toolbar itself is
    // observed — K05 read a stale --ob-shell-bandt-r without it
    let toolbarSeen = null;
    hookToolbar = () => {
      const tb = document.getElementById('ob-toolbar');
      if (tb && tb !== toolbarSeen) { toolbarSeen = tb; ro.observe(tb); }
    };
    hookToolbar();
  }
  window.addEventListener('resize', scheduleBands);
  window.addEventListener('ob:perftier', scheduleBands);
  // position-only moves (the ≤ 700 px decision yield, the equipment-place
  // shift) change no box size — their transitions report the settled truth
  qpWrap.addEventListener('transitionend', scheduleBands);
  onLocaleChange(scheduleBands);
  scheduleBands();

  // place cards (stubs fronting existing surfaces only — FR-008/US5)
  const HOLD_MS = 550, HOLD_SLOP = 8, HOLD_JITTER = 1.5, HOLD_CLICK_MS = 500;
  const HOLD_EXEMPT = 'button, input, select, textarea, a, label, summary, '
    + '[contenteditable], [tabindex], [role="button"], [role="radio"], '
    + '[role="radiogroup"], [role="slider"], [role="tab"], [role="tablist"], '
    + '[role="checkbox"], [role="switch"], [role="option"], [role="listbox"], '
    + '[role="menuitem"], [role="link"], .ob-segmented, .ob-strip, .ob-cardrail';
  // the committed hold's trailing click is swallowed ONCE (capture phase,
  // pointer clicks only — keyboard clicks carry detail 0 — inside a short
  // window); touch releases also preventDefault their touchend so the
  // gesture never synthesizes the click at all
  let holdClickUntil = -Infinity; // -Infinity, or { input, handled }: see inputClock (#1130)
  window.addEventListener('click', (e) => {
    if (!(inputClock(e.timeStamp) < holdClickUntil.input || performance.now() < holdClickUntil.handled) || !((e.detail ?? 0) > 0)) return;
    holdClickUntil = -Infinity;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
  window.addEventListener('pointerdown', () => { holdClickUntil = -Infinity; }, true);
  // ---- the CONTINUATION GUARD (build 20: #987 #988 #1044 #1068; amends
  // GH-713, shell.md §9 entry 31). An activation that removes or moves its
  // own element, presents a surface under the pointer, or hands focus on
  // exposes whatever lands there to the SECOND half of the same gesture:
  // the second click of a double-click, the second tap of a double-tap,
  // the OS auto-repeat of a held Enter, a second Enter pressed a moment
  // later. ONE window-capture guard, registered HERE: after main.js's
  // switch shield (which eats everything while html[data-ob-switching]
  // stands — the guard never sees or records what it eats) and BEFORE every
  // installGate (re-appended at each openShell), so it sees every hall and
  // table press and key ahead of every gate, content module and target
  // handler. One timebase: the EVENT's timeStamp — a press queued behind a
  // long task (the switch build) keeps the time it was made, never the
  // handler's clock.
  // POINTER HALF (armed): an arm opens a CONT_MS window at its activation
  // point; inside it a trusted pointerdown / mousedown / click is swallowed
  // when it carries a click count (detail > 1), or lands within CONT_SLOP
  // of the point (the GH-534 F6 form), or falls inside the arm's own
  // time-only clause (GH-713: a phone double-tap can drift past the slop).
  // The arming control itself, releases, moves and detail-0 clicks
  // (keyboard / assistive tech) pass; mousedown's default is cancelled, so
  // focus stays where the activation put it. Arms: exitToTable inside a
  // trusted pointer activation (#988), a kit panel or list presented or left
  // after the last trusted click (ui/dialog.js 'ob:presented' / 'ob:dismissed',
  // #987; ui/select.js 'ob:popover' / 'ob:dismissed', #1152 — up to 30 s late;
  // a press made before it was shown never acts on it), the GH-713 sites.
  // KEY HALF (self-arming): unmodified Enter / Space only. An auto-repeat
  // whose target is not the target of the press being repeated — the hold
  // crossed a focus handoff — or whose press the guard never saw (eaten by
  // the switch shield) is swallowed; a fresh press on a DIFFERENT target
  // within CONT_MS of the last Enter / Space that acted is swallowed.
  // Same-target repeats pass (the nudge steps; hud.js heldGuard owns a held
  // Enter on a restored #shoot), a modifier keydown changes nothing, any
  // other key resets, text entry is exempt, keyup never clears state (the
  // switch shield eats keyups; Space's keyup only moves its window's anchor)
  // and no window starts from a focus move.
  const CONT_MS = 500;       // the platform double-click interval (HOLD_CLICK_MS)
  const CONT_SLOP = 24;      // px — the GH-534 F6 slop
  const TAP_SHIELD_MS = 350; // GH-713's time-only clause
  // the event's stamp through the one stamp helper (inputClock, #1130): no
  // stamp, 0 or a foreign timebase (epoch ms) falls back to now
  const contStamp = (e) => inputClock(e?.timeStamp);
  const contSwallow = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
  const CONT_CONTROL = 'button, a[href], input, select, textarea, label, summary, [role="button"], '
    + '[role="option"], [role="radio"], [role="tab"], [role="menuitem"], [tabindex]';
  const contControl = (n) => (n instanceof Element ? (n.closest(CONT_CONTROL) ?? n) : null);
  let contArms = []; // { t, x, y, src, timeOnlyMs, timeOnlyIn, exempt }
  let lastDown = null; // the last trusted primary pointerdown and its verdict: { t, tgt, swallow }
  let lastClick = null; // the last trusted pointer click that passed: { t, x, y, src }
  let keyAct = null; // { target, t }: the last Enter / Space press that acted
  let keyHold = null; // { key, target, dead }: the press the OS may be repeating
  const contPush = (a) => { contArms.push(a); if (contArms.length > 8) contArms.shift(); };
  const sameControl = (a, b) => {
    const ca = contControl(a), cb = contControl(b);
    return !!ca && !!cb && (ca === cb || ca.contains(cb) || cb.contains(ca));
  };
  /** A trusted click is a POINTER activation when it carries a click count,
   * or when it is its own press's click (a trusted pointerdown on the same
   * control, not yet claimed by an earlier click) — a WebKit tap's click may
   * carry detail 0. Keyboard and assistive-tech clicks (detail 0, no press)
   * belong to the key half: a press's verdict is claimed by its own click,
   * and an Enter / Space keydown after the press marks a detail-0 click as
   * the keyboard's — a modifier pressed mid-hold keeps the verdict (review
   * r1, r2). */
  const pressOf = (e, t) => (lastDown && t - lastDown.t >= 0 && t - lastDown.t < 5000 ? lastDown : null);
  const pointerClick = (e, t) => e.type === 'click' && e.isTrusted === true
    && (e.detail > 0 || (!!pressOf(e, t) && !lastDown.keyed && (lastDown.click ? lastDown.click === e : sameControl(lastDown.tgt, e.target))));
  /** Arm the pointer half at the activation dispatching right now: a
   * trusted pointer click, or a hold's pointerup. Keyboard, assistive-tech
   * and scripted activations arm nothing (the key half). */
  function armContinuation({ timeOnlyMs = 0, timeOnlyIn = null, exempt = null } = {}) {
    const ev = window.event;
    if (!ev || ev.isTrusted !== true) return false;
    const t = contStamp(ev);
    if (!(pointerClick(ev, t) || ev.type === 'pointerup')) return false;
    contPush({ t, x: ev.clientX, y: ev.clientY, src: contControl(ev.target), timeOnlyMs, timeOnlyIn, exempt });
    return true;
  }
  // GH-713 (S4 journey QA round 3; ledger #686 L1): a decision answer clears
  // the prompt, the GH-711 locked face's Continue tears the hall down — the
  // second tap must not resolve the table-bed prop behind it. Shell chrome
  // stays live (a deliberate next tap on a pill or a rail segment acts).
  const armTapShield = () => armContinuation({ timeOnlyMs: TAP_SHIELD_MS, exempt: (n) => root.contains(n) });
  const fromLastClick = (timeOnlyMs, timeOnlyIn, extra = null) => {
    const c = lastClick;
    if (!c || !(performance.now() - c.t < 30000)) return; // a LATE surface (a loaded device) still arms: presses are judged on their own stamps
    contPush({ t: c.t, x: c.x, y: c.y, src: c.src, timeOnlyMs, timeOnlyIn, exempt: null, ...extra });
  };
  const onPresented = (e) => { // ui/dialog.js openPanel: a panel opened on top
    const bd = e.detail?.backdrop instanceof Element ? e.detail.backdrop : null;
    const panel = e.detail?.panel instanceof Element ? e.detail.panel : null;
    // the time-only clause covers the backdrop alone: the panel's own
    // controls answer a deliberate press at once; a press made BEFORE the
    // panel was shown (queued behind a slow presentation) never acts on it
    fromLastClick(bd ? TAP_SHIELD_MS : 0, bd ? (n) => bd.contains(n) : null,
      { before: performance.now(), on: (n) => !!(panel?.contains(n) || bd?.contains(n)) });
  };
  window.addEventListener('ob:presented', onPresented);
  window.addEventListener('ob:popover', onPresented); // ui/select.js: a kit list opened by a click (no backdrop)
  // ui/dialog.js closePanel: a panel left under the pointer (an answer — the
  // table's decision prompt, a Cancel, a backdrop dismissal); ui/select.js:
  // a kit list closed by a click on one of its options
  window.addEventListener('ob:dismissed', () => { fromLastClick(0, null); });
  const contJudge = (e, t, tgt) => {
    contArms = contArms.filter((a) => t - a.t < CONT_MS || t < (a.before ?? -Infinity));
    for (const a of contArms) {
      const dt = t - a.t;
      if (dt < 0 || (tgt && ((a.src && a.src.contains(tgt)) || a.exempt?.(tgt)))) continue;
      if (t < (a.before ?? -Infinity) && !!tgt && a.on?.(tgt)) return true; // made before its surface was shown
      if (!(dt < CONT_MS)) continue;
      const timed = dt < a.timeOnlyMs && (!a.timeOnlyIn || (!!tgt && a.timeOnlyIn(tgt)));
      const multi = e.detail > 1;
      const near = Math.hypot(e.clientX - a.x, e.clientY - a.y) < CONT_SLOP;
      if (timed || multi || near) return true;
    }
    return false;
  };
  // ONE verdict per press: a swallowed pointerdown swallows its own
  // mousedown and click (a slow second click's click must not escape after
  // the window its pointerdown was swallowed in); a passed press's mousedown
  // and click are judged again only to ESCALATE — they carry the click count
  // the pointerdown lacks (Chromium dispatches pointerdown with detail 0)
  const contPointer = (e) => {
    if (!e.isTrusted || e.button > 0) return; // free orbit (secondary buttons) stays live
    const t = contStamp(e);
    const tgt = e.target instanceof Element ? e.target : null;
    if (e.type === 'pointerdown') {
      keyAct = null; keyHold = null; // a press is a new intent
      lastDown = { t, tgt, swallow: contJudge(e, t, tgt) };
      if (lastDown.swallow) contSwallow(e);
      return;
    }
    if (e.type === 'click' && !pointerClick(e, t)) return; // keyboard / AT clicks: the key half
    const press = pressOf(e, t);
    if (press && e.type === 'click') press.click ??= e; // the press's own click claims its verdict
    if (press?.swallow || contJudge(e, t, tgt)) { contSwallow(e); return; }
    if (e.type === 'click') lastClick = { t, x: e.clientX, y: e.clientY, src: contControl(tgt) };
  };
  for (const ev of ['pointerdown', 'mousedown', 'click']) window.addEventListener(ev, contPointer, true);
  window.addEventListener('pointercancel', (e) => { if (e.isTrusted) lastDown = null; }, true); // a cancelled press claims nothing
  const CONT_MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Fn', 'OS']);
  const CONT_TEXT = 'textarea, select, [contenteditable]:not([contenteditable="false"]), input:not([type="button"])'
    + ':not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"])'
    + ':not([type="color"]):not([type="file"]):not([type="image"])';
  window.addEventListener('keydown', (e) => {
    if (e.isTrusted && lastDown && (e.key === 'Enter' || e.key === ' ')) lastDown.keyed = true; // an activation key's click is the keyboard's (review r1/r2)
    if (!e.isTrusted || e.isComposing || CONT_MODIFIERS.has(e.key)) return; // a Shift mid-hold changes nothing
    lastClick = null; contArms = []; // any other key ends the pointer continuation: a click after a keyboard dismissal is deliberate
    const tgt = e.target;
    const act = (e.key === 'Enter' || e.key === ' ') && !e.altKey && !e.ctrlKey && !e.metaKey;
    if (!act || (tgt instanceof Element && tgt.closest(CONT_TEXT))) { keyAct = null; keyHold = null; return; }
    if (e.repeat) {
      if (!keyHold) { contSwallow(e); return; } // ORPHAN: its press was never seen (shielded)
      if (keyHold.key === e.key && !keyHold.dead && keyHold.target === tgt) return; // same target: native
      contSwallow(e); return; // REPEAT-HOP: the hold crossed a focus handoff (or repeats a swallowed press)
    }
    const t = contStamp(e);
    if (keyAct && keyAct.target !== tgt && t - keyAct.t >= 0 && t - keyAct.t < CONT_MS) { // KEY-WINDOW
      keyHold = { key: e.key, target: tgt, dead: true };
      contSwallow(e); return;
    }
    keyHold = { key: e.key, target: tgt, dead: false };
    keyAct = { target: tgt, t };
  }, true);
  // Space activates on its keyup: the window runs from there (a keyup only
  // moves the anchor, never clears state — the switch shield eats keyups)
  window.addEventListener('keyup', (e) => {
    if (e.isTrusted && e.key === ' ' && keyAct && keyAct.target === e.target && keyHold && !keyHold.dead) keyAct.t = contStamp(e);
  }, true);
  function armCardHold(sec, id, primary) {
    let hold = null; // { id, x0, y0, xa, ya, timer, ripe, touch, tgt }
    let touchFired = false;
    // GH-1168: the pointer whose hold a scroll of the document, or of a
    // scroller containing the pressed element, disarmed while it stayed
    // down (null = none). The column's own motion (a fold-snap settle or
    // landing) carried the card away under the still finger, so the
    // release would click whatever slid under it ("Free practice" exited
    // to the table): that release clicks nothing, as a commit's release
    // does. Any other scroll (a rail list settling beside the card) only
    // disarms the hold, so the tap still lands. A move past the slop
    // before any scroll disarms the hold first, so no mark is set; once
    // set, the mark outlives later moves, and only a pointercancel, a
    // pointerleave or the next press on the card drops it.
    let moved = null;
    const disarm = () => {
      if (!hold) return;
      clearTimeout(hold.timer);
      hold = null;
      document.removeEventListener('scroll', onScroll, true);
    };
    const onScroll = (e) => {
      const t = e.target;
      if (hold && (t === document || (t instanceof Node && t.contains(hold.tgt)))) moved = hold.id;
      disarm();
    };
    const ripen = () => {
      clearTimeout(hold.timer);
      hold.ripe = false;
      hold.timer = setTimeout(() => { if (hold) hold.ripe = true; }, HOLD_MS);
    };
    sec.addEventListener('pointerdown', (e) => {
      disarm();
      moved = null;
      touchFired = false;
      if (!e.isPrimary || (e.button ?? 0) !== 0) return;
      const tgt = e.target instanceof Element ? e.target : null;
      if (!tgt || tgt.closest(HOLD_EXEMPT)) return; // controls act on their own
      // the card's own chrome (the h2, the S1 lines/actions, the hold hint,
      // the section padding) always holds; a mounted content module's OWN
      // DOM (its root is a direct child of the section) holds only when
      // the module declares a primary — R0 (f)'s S1 fallback stays
      // reachable from the chrome (the play h2 quick-play, arm D), never
      // from inside a module that owns its surface (the atelier's slider /
      // lux note fired the stale S1 stub)
      const top = tgt === sec ? null : [...sec.children].find((ch) => ch.contains(tgt));
      const chrome = !top
        || top.matches('h2, p.ob-shell-line, div.ob-shell-actions, p.ob-shell-hold');
      if (!chrome && content.has(id) && typeof content.get(id)?.primary !== 'function') return;
      hold = { id: e.pointerId, x0: e.clientX, y0: e.clientY, xa: e.clientX,
        ya: e.clientY, timer: 0, ripe: false, touch: e.pointerType === 'touch', tgt };
      ripen();
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    });
    sec.addEventListener('pointermove', (e) => {
      if (!hold || e.pointerId !== hold.id) return;
      if (Math.hypot(e.clientX - hold.x0, e.clientY - hold.y0) > HOLD_SLOP) {
        disarm();
        return;
      }
      if (Math.hypot(e.clientX - hold.xa, e.clientY - hold.ya) > HOLD_JITTER) {
        hold.xa = e.clientX; // still creeping inside the slop: the
        hold.ya = e.clientY; // stillness clock restarts from here
        ripen();
      }
    });
    sec.addEventListener('pointerup', (e) => {
      if (moved !== null && e.pointerId === moved) {
        moved = null;
        holdClickUntil = { input: inputClock(e.timeStamp) + HOLD_CLICK_MS, handled: performance.now() + HOLD_CLICK_MS };
        touchFired = e.pointerType === 'touch';
        return;
      }
      if (!hold || e.pointerId !== hold.id) return;
      const commit = hold.ripe;
      const touch = hold.touch;
      disarm();
      if (!commit) return;
      holdClickUntil = { input: inputClock(e.timeStamp) + HOLD_CLICK_MS, handled: performance.now() + HOLD_CLICK_MS };
      touchFired = touch;
      primary();
    });
    for (const ev of ['pointercancel', 'pointerleave']) sec.addEventListener(ev, () => { disarm(); moved = null; });
    sec.addEventListener('touchend', (e) => {
      if (!touchFired) return;
      touchFired = false;
      if (e.cancelable) e.preventDefault(); // no synthesized click for this touch
    }, { passive: false });
  }
  // R4 coarse fold (GH-668 S5 slice 2, B-SH04): under a finger the quick-play
  // pill carries the remember toggle as its long-press SECONDARY — the same
  // hold law as the cards (HOLD_MS stillness inside HOLD_SLOP, commit on the
  // release, the trailing click swallowed so the hold never also exits the
  // hall). Touch / pen only: a mouse has the visible row. The commit speaks
  // through the notice (shell.rememberOn / shell.rememberOff) — the toggle's
  // only visible state on coarse. review r3 P2: the pair is hasLocal()-gated
  // as a SET (note()'s strictKeys) — under a cached pre-slice dictionary the
  // notice is OMITTED (the commit still lands), never the en fallback or a
  // raw key; a fresh dictionary restores the copy; a flip while it is up
  // re-selects.
  const REMEMBER_NOTICE_KEYS = ['shell.rememberOn', 'shell.rememberOff'];
  function armQuickPlayHold(btn) {
    let hold = null; // { id, x0, y0, timer, ripe }
    let touchFired = false;
    const disarm = () => { if (!hold) return; clearTimeout(hold.timer); hold = null; };
    btn.addEventListener('pointerdown', (e) => {
      disarm();
      if (!e.isPrimary || (e.button ?? 0) !== 0) return;
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      hold = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ripe: false,
        timer: setTimeout(() => { if (hold) hold.ripe = true; }, HOLD_MS) };
    });
    btn.addEventListener('pointermove', (e) => {
      if (!hold || e.pointerId !== hold.id) return;
      if (Math.hypot(e.clientX - hold.x0, e.clientY - hold.y0) > HOLD_SLOP) disarm();
    });
    btn.addEventListener('pointerup', (e) => {
      if (!hold || e.pointerId !== hold.id) return;
      const commit = hold.ripe;
      disarm();
      if (!commit) return;
      holdClickUntil = { input: inputClock(e.timeStamp) + HOLD_CLICK_MS, handled: performance.now() + HOLD_CLICK_MS };
      touchFired = true;
      note(toggleRemember() ? 'shell.rememberOn' : 'shell.rememberOff', undefined, null, REMEMBER_NOTICE_KEYS);
    });
    for (const ev of ['pointercancel', 'pointerleave']) btn.addEventListener(ev, disarm);
    // the platform long-press menu (Android fires it ~500 ms in, BEFORE the
    // hold ripens, and its pointercancel would disarm the hold)
    btn.addEventListener('contextmenu', (e) => { if (hold || touchFired) e.preventDefault(); });
    btn.addEventListener('touchend', (e) => {
      if (!touchFired) return;
      touchFired = false;
      if (e.cancelable) e.preventDefault(); // no synthesized click for this touch
    }, { passive: false });
  }
  armQuickPlayHold(qp);
  const cards = document.createElement('div');
  cards.id = 'ob-shell-cards';
  const cardSections = new Map();
  const stubNodes = new Map(); // place id → its S1 stub CONTENT nodes (arrival-hold law)
  const holdHints = new Map(); // place id → its p.ob-shell-hold (B-SH02: hidden where no hold acts)
  // review r2 P2-2: a has()-guarded label key is chosen against the ACTIVE
  // dictionary at build AND on every relabel() (the rememberLabel idiom) —
  // a locale flip onto a stale cached dictionary (the ownership ledger: dictionaries
  // are cached independently of the modules) must land the LOCALIZED legacy
  // label, never the en fallback of the new key or a raw key; the next
  // fresh dictionary re-selects the new key. Every guarded key the shell
  // paints goes through a relabel-time picker: qpVerb (shell.toTable /
  // backToTable), rememberLabel, hallLabel, this pickKey registry, the
  // notice's want / legacy pair, and the decision prompt's per-render qKey /
  // citeKey (its sig carries the translated title, so a flip re-renders).
  const guardedPicks = [];
  const pickKey = (lab, want, legacy) => {
    const run = () => {
      const k = hasLocal(want) ? want : legacy;
      if (lab.dataset.i18n !== k) lab.dataset.i18n = k;
      lab.textContent = t(k);
    };
    guardedPicks.push(run);
    run();
  };
  const mkAction = (i18nKey, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    // the card action row (kit .ob-btn--row, GH-668 B-K01): mid pole, 44
    // floor, start-aligned, wraps ≤ 2 lines — shell.css sets nothing on it
    b.className = 'ob-btn ob-btn--row';
    const lab = document.createElement('span');
    lab.className = 'ob-btn__label';
    lab.dataset.i18n = i18nKey;
    lab.textContent = t(i18nKey);
    b.appendChild(lab);
    b.addEventListener('click', fn);
    return b;
  };
  const mkLine = (labelKey) => {
    const p = document.createElement('p');
    p.className = 'ob-shell-line';
    const b = document.createElement('b');
    b.dataset.i18n = labelKey;
    b.textContent = t(labelKey);
    const v = document.createElement('span');
    p.append(b, document.createTextNode(': '), v);
    return { p, v };
  };
  // A place's healthy content-mount host class (the S2 atelier's is
  // `ob-atelier-host`); the stub guard below and contentPainted share it.
  const HOST_CLASS = (id) => (id === 'equipment' ? 'ob-atelier-host'
    : 'ob-' + id + '-host');
  const summaries = []; // refreshed on open/place change/locale change
  for (const p of PLACES) {
    const sec = document.createElement('section');
    sec.dataset.place = p.id;
    sec.hidden = true;
    const h = document.createElement('h2');
    h.dataset.i18n = p.labelKey;
    h.textContent = t(p.labelKey);
    sec.appendChild(h);
    const actions = document.createElement('div');
    actions.className = 'ob-shell-actions';
    let primary = null;
    const stubFrom = summaries.length; // this place's stub closures (R0 (g))
    if (p.id === 'play') {
      const g = mkLine('shell.card.game');
      const r = mkLine('shell.card.rules');
      sec.append(g.p, r.p);
      summaries.push(() => {
        const gid = window.__settings?.get?.().game ?? game.gameId ?? null;
        g.v.textContent = gid && has(`game.${gid}`) ? t(`game.${gid}`) : (gid ?? '—');
        const vid = gid ? (window.__settings?.variantFor?.(gid) ?? null) : null;
        // FR-004 (feature 034): the line is ALWAYS rendered — the
        // `settings.variant.<preset>` namespace is the one that exists ×7,
        // and an unpinned default (variantFor null — fresh nine_ball /
        // eight_ball profiles) reads as the pane's own default-row label
        r.p.hidden = false;
        r.v.textContent = vid
          ? (has(`settings.variant.${vid}`) ? t(`settings.variant.${vid}`) : vid)
          : t('settings.variantDefault');
      });
      primary = () => quickPlay({ activated: true }); // release / click / key: a gesture exit
      actions.appendChild(mkAction('shell.card.gameSettings',
        () => showThenOpen('game')));
    } else if (p.id === 'practice') {
      // existing mode entries (settings.js precedent: sequential hand-off —
      // the shell exits through its OWN path first, THEN the surface opens)
      primary = () => { exitToTable(); window.__drills?.open?.(); };
      const drills = mkAction('shell.card.drills', primary);
      actions.appendChild(drills);
      const pg = mkAction('shell.card.playground', () => {
        exitToTable();
        window.__settings?.changeMode?.('playground');
      });
      actions.appendChild(pg);
      summaries.push(() => {
        drills.hidden = !window.__drills?.open;
        pg.hidden = typeof window.__settings?.changeMode !== 'function';
      });
    } else if (p.id === 'equipment') {
      const c = mkLine('shell.card.cue');
      const tb = mkLine('shell.card.table');
      sec.append(c.p, tb.p);
      summaries.push(() => {
        const eq = window.__settings?.get?.().equipment ?? {};
        // the settings api's display-name law (a retired digest-row id
        // shows its twin's name, never the raw id); a stale settings.js
        // without it keeps the locale name or '—'
        const nm = (axis, id) => {
          const dn = window.__settings?.equipmentDisplayName;
          if (typeof dn === 'function') return dn(axis, id);
          return id && has(`equipment.${id}`) ? t(`equipment.${id}`) : '—';
        };
        c.v.textContent = nm('cue_id', eq.cue_id ?? eq.cue);
        tb.v.textContent = nm('table_id', eq.table_id);
      });
      primary = () => showThenOpen('equipment');
      actions.appendChild(mkAction('shell.card.equipmentSettings', primary));
      // GH-534 G4 (round-2 QA): the DEGRADE equipment surface. With the
      // atelier module poisoned the stubs stand — and the coarse register
      // hides the HUD cue row (the §3.9 phone-hud law), leaving NO working
      // equipment control at all there. This native select rides the SAME
      // settings cueSwap seam (the fast path — no confirm, no re-rack,
      // binds at the next shot; guarded import, hidden while the seam is
      // absent) and lives in the STUB content, so a healthy atelier mount
      // retires it with the rest of the stub (the atelier owns the
      // section then). Native control on purpose: the degrade posture
      // must not depend on further kit leaves.
      const swapWrap = document.createElement('div');
      swapWrap.className = 'ob-shell-actions';
      // GH-525 S2.5 review visual-audit round 1 (finding 5, the boot
      // flash): [hidden] alone cannot retire this wrap — shell.css's own
      // `.ob-shell-actions { display: flex }` outranks the UA [hidden]
      // rule (the GH-534 F1 ghost class), so the stub select PAINTED from
      // the equipment arrival until ui/atelier.css (whose host kill rule
      // used to retire it) finished loading (~0.5 s on the flagship boot
      // clip). Paint truth rides an inline display pair from birth.
      const swapShow = (on) => {
        swapWrap.hidden = !on;
        swapWrap.style.display = on ? '' : 'none';
      };
      swapShow(false);
      const swapSel = document.createElement('select');
      swapSel.dataset.ob = 'shell-cue-swap';
      swapSel.style.minHeight = '44px';
      swapWrap.appendChild(swapSel);
      sec.appendChild(swapWrap);
      let swapCtx = null;
      import('./settings.js').then((m) => { swapCtx = m.ctx ?? null; })
        .catch(() => { /* seam absent: the control stays hidden */ });
      swapSel.addEventListener('change', () => {
        swapCtx?.cueSwap?.change?.(swapSel.value);
      });
      summaries.push(() => {
        // a HEALTHY atelier mount owns the section (ob-atelier-host) and
        // retired the stub content — this tick must never un-hide it
        if (sec.classList.contains('ob-atelier-host')) {
          swapShow(false);
          return;
        }
        // GH-525 S2.5 review visual-audit round 1 (finding 5, the boot
        // flash): the select stays RETIRED until the atelier healthy-vs-
        // degrade decision RESOLVES — it arms ONLY on a resolved degrade
        // (mountContent's stale-module/catch branches flip contentDegraded
        // and re-tick), never during the pending import window. The B4/G4
        // degrade posture is unchanged: a failed import still presents it.
        if (!atelierDegraded()) {
          swapShow(false);
          return;
        }
        const cs = swapCtx?.cueSwap;
        const opts = cs?.options?.() ?? null;
        swapShow(!!opts?.length);
        if (!opts?.length) return;
        swapSel.setAttribute('aria-label', t('shell.card.cue'));
        // ids AND names in the signature: a locale flip re-renders the
        // option labels through the same rebuild (relabel → summaries)
        const want = opts.map((o) => `${o.id}\t${o.name}`).join('\n');
        if ([...swapSel.options]
          .map((o) => `${o.value}\t${o.textContent}`).join('\n') !== want) {
          swapSel.textContent = '';
          for (const o of opts) {
            const el = document.createElement('option');
            el.value = o.id;
            el.textContent = o.name;
            swapSel.appendChild(el);
          }
        }
        const cur = cs.current?.();
        if (cur && swapSel.value !== cur) swapSel.value = cur;
      });
    } else if (p.id === 'replays') {
      primary = () => { exitToTable(); window.__playback?.open?.(); };
      const openPb = mkAction('shell.card.replaysOpen', primary);
      // B-SH02: a verb, like every card action; re-picked at every relabel
      // (stale locale: the localized legacy key — review r2 P2-2)
      pickKey(openPb.querySelector('.ob-btn__label'), 'shell.card.replaysOpenVerb', 'shell.card.replaysOpen');
      actions.appendChild(openPb);
      summaries.push(() => { openPb.hidden = !window.__playback?.open; });
    }
    // R0 (g): a HEALTHY content mount owns the section (`ob-<place>-host`)
    // and retired the stub content — this place's stub closures return
    // early there, so no lane hand-edits its closure for the guard. (The
    // equipment closure keeps its own `ob-atelier-host` check: it also
    // retires the degrade cue-swap select.)
    const hostClass = HOST_CLASS(p.id);
    for (let i = stubFrom; i < summaries.length; i++) {
      const tick = summaries[i];
      summaries[i] = () => { if (!sec.classList.contains(hostClass)) tick(); };
    }
    // R0 (f): the S1 primary is the FALLBACK — a mounted content module
    // MAY own the card's primary action (`primary` on its handle); a
    // module without one keeps S1 by construction.
    const s1Primary = primary;
    if (s1Primary) primary = () => (content.get(p.id)?.primary ?? s1Primary)();
    sec.appendChild(actions);
    const hold = document.createElement('p');
    hold.className = 'ob-shell-hold';
    hold.dataset.i18n = 'shell.card.holdHint';
    hold.textContent = t('shell.card.holdHint');
    // B-SH02 (GH-668 S5 slice 2): the hint stands only where a hold can ACT
    // — an S1 primary at build; once a content module mounts, only if its
    // handle owns a `primary` (a module without one takes the card's
    // surface, a hold on its DOM is a no-op, and the hint would lie)
    hold.hidden = !primary;
    holdHints.set(p.id, hold);
    sec.appendChild(hold);
    // long-press/act-now (FR-007(2)): press-and-hold the card fires its
    // primary action; the visible action buttons are the a11y alternative.
    // GH-676 hold law: the hold ARMS on a still, non-control press, RIPENS
    // after HOLD_MS of stillness and COMMITS on the release — never while
    // the pointer is still down (the release's synthesized click landed in
    // whatever the primary had just opened: a drill started under the
    // finger; a Settings pane swallowed the next click). Movement past
    // HOLD_SLOP, any ancestor scroll, pointercancel/leave, a form control
    // / kit strip / segmented / role'd target, or a mounted content module
    // that declares no primary of its own all disarm it. Under touch the
    // browser's own pan slop (~15 px) only cancels late, so the shell's
    // slop + stillness clock are what keep a creep or a rest-then-flick
    // from ever firing.
    if (primary) armCardHold(sec, p.id, primary);
    cards.appendChild(sec);
    cardSections.set(p.id, sec);
    // arrival-hold law (the mount block below): this card's S1 stub CONTENT
    // = its direct summary lines + action wraps. The H2 and the hold hint
    // are shell chrome (replays keeps the hint, re-keyed) — never held on.
    stubNodes.set(p.id, [...sec.children]
      .filter((el) => el.matches('p.ob-shell-line, div.ob-shell-actions')));
  }
  root.appendChild(cards);
  document.body.appendChild(root);

  // toolbar pill — the chrome affordance that re-opens the shell from
  // gameplay (US2 straight-to-AIM; after every quick-play/place exit)
  const pill = document.createElement('button');
  pill.id = 'ob-shell-open';
  pill.type = 'button';
  // GH-668 B-K16: the toolbar family part (kit.css .ob-btn--glass voice +
  // .ob-toolbar-pill) — the id block below keeps ONLY the stale-app.html
  // position fallback; material / rungs / coarse 44 / reduced motion are
  // the kit's.
  // GH-668 B-SH06 (S5 slice 2): the LEADING, LABELLED pill — the kit
  // toolbar part's TEXT register (the #ob-share precedent: 34 tall, pill
  // radius, fs-2 label) with the shell's own mark in the kit icon slot and
  // the hall's name (shell.hall) in the label slot on fine pointers; coarse
  // = .ob-btn--icon (44 circle, label folded — syncRegister below). The
  // accessible name stays shell.open (GH-678 / arm Q1); a `hall` glyph on
  // the 20-grid is a kit follow-up (GH-668) — the inline mark stays.
  pill.className = 'ob-btn ob-btn--glass ob-toolbar-pill';
  pill.dataset.i18nTitle = 'shell.open';
  // GH-678: the accessible name is a BUILD-time property — main.js's
  // applyDom walk ran before this module was imported, and i18n's applyDom
  // only REFRESHES an existing aria-label; relabel() below (a locale
  // subscriber) re-fires only on a register flip, so a desktop boot
  // shipped the pill with an EMPTY name (WCAG 4.1.2). Named from first
  // paint here; relabel() keeps both attributes following the locale.
  pill.title = t('shell.open');
  pill.setAttribute('aria-label', t('shell.open'));
  {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    g.setAttribute('viewBox', '0 0 24 24');
    g.setAttribute('width', '16');
    g.setAttribute('height', '16');
    g.setAttribute('aria-hidden', 'true');
    g.dataset.icon = 'shell-places';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linejoin', 'round');
    g.appendChild(path);
    const slot = document.createElement('span');
    slot.className = 'ob-btn__icon';
    slot.setAttribute('aria-hidden', 'true');
    slot.appendChild(g);
    pill.appendChild(slot);
    const lab = document.createElement('span');
    lab.className = 'ob-btn__label';
    pill.appendChild(lab);
  }
  // shell.hall has()-guarded: a stale locale cache leaves the label EMPTY
  // and the critical block folds it (the pre-slice-2 icon-only shape)
  const hallLabel = () => {
    const lab = pill.querySelector(':scope > .ob-btn__label');
    if (lab) lab.textContent = hasLocal('shell.hall') ? t('shell.hall') : '';
  };
  hallLabel();
  // B-SH05 / B-SH06 register sync: --icon on the hall pill under a finger
  // (44 circle), on the rail gear on fine pointers (44 square on the strip
  // rung); re-run on every locale/register broadcast (i18n fires its
  // subscribers on the html.ob-touch flip)
  const syncRegister = () => {
    const touch = document.documentElement.classList.contains('ob-touch');
    pill.classList.toggle('ob-btn--icon', touch);
    railGear.classList.toggle('ob-btn--icon', !touch);
  };
  syncRegister();
  // GH-534 F6: only a POINTER activation arms the double-click debounce
  // (review fix-round review r1 P2 — keyboard clicks carry detail 0, and
  // boot/API opens must never swallow the first canvas press; FR-009)
  pill.addEventListener('click', (e) => openShell({ animate: true,
    pointerOpen: (e?.detail ?? 0) > 0,
    pointerAt: { x: e?.clientX ?? -1e9, y: e?.clientY ?? -1e9 }, pointerTs: e?.timeStamp }));
  {
    // insert sorted by toolbar order (the playback.js/help.js shape)
    const tb = document.getElementById('ob-toolbar');
    if (!tb) document.body.appendChild(pill);
    else {
      // B-SH06: the leading slot (order -1 in the critical block) — TAB
      // order follows the visual order, so it is inserted FIRST too
      pill.dataset.tbOrder = '-1';
      const next = [...tb.children].find((c) => +(c.dataset.tbOrder || 99) > -1);
      tb.insertBefore(pill, next || null);
    }
  }
  const relabel = () => {
    pill.title = t('shell.open');
    pill.setAttribute('aria-label', t('shell.open'));
    hallLabel();
    railGear.title = t('shell.settings');
    railGear.setAttribute('aria-label', t('shell.settings'));
    syncRegister();
    root.setAttribute('aria-label', t('shell.aria.shell'));
    rail.setAttribute('aria-label', t('shell.aria.rail'));
    qpVerb(); // R16: the verb key follows the match state; the walk re-paints it
    rememberLabel(); // the remember row's key follows the active dictionary (review r1 P2)
    for (const run of guardedPicks) run(); // every other guarded key (review r2 P2-2)
    for (const el of root.querySelectorAll('[data-i18n]')) {
      el.textContent = t(el.dataset.i18n);
    }
    refreshSummaries();
  };
  onLocaleChange(relabel);

  // ---- shell open/close + place navigation ----------------------------------
  let open = false;
  // Every session opens at Play (owner ruling 2026-08-15 — contract §4):
  // stored.lastPlace is DEMOTED to write-only navigation memory (§5, kept
  // for future in-shell affordances); it never seeds the opening pose.
  let active = 'play';
  let pendingPose = null; // __shell.go while closed poses for next open
  let arrived = false;    // first landing recorded (first-arrival write law)
  let openedAt = -Infinity; // GH-534 F6: the open-activation stamp (gate): -Infinity, or { input, handled }
  /** #1130: a press's own stamp on the page's clock (Event.timeStamp, when
   * the press was made), else the handler's clock (no stamp, 0, or a foreign
   * timebase). The continuation windows — the card-hold trailing click, the
   * F6 activation window, practice's hold echo — keep two bounds and act
   * while either holds: the input bound survives a long task between the
   * arming event and the follow-up (the hold's own primary, the hall's build),
   * the handler bound keeps a late-stamped click (WebKit's synthetic tap
   * click) inside the old window. The body is inputclock.js's, the one stamp
   * helper (the continuation guard's contStamp uses it too, and practice.js
   * through shellCtx); a module without it leaves the handler's clock.
   * Hoisted: the hold windows above read it. */
  function inputClock(ts) {
    return typeof stampNs.inputClock === 'function' ? stampNs.inputClock(ts) : performance.now();
  }
  let openedPt = { x: -1e9, y: -1e9 }; // …and the opener's screen point

  function refreshSummaries() {
    for (const fn of summaries) { try { fn(); } catch { /* seam absent */ } }
  }
  function presentPlace(id) {
    active = id;
    // GH-698: #ob-shell carries the presented place as .ob-shell-at-<id>
    // (the .ob-shell-decision-up precedent — a marker, no other behaviour)
    // so the critical block can place the decision prompt per place
    for (const p of PLACE_IDS) root.classList.toggle('ob-shell-at-' + p, p === id);
    // the strip leaf reflects the selection (aria-current + roving tab stop
    // + pan-into-view); the querySelector loop is the degrade register
    if (railStrip) railStrip.set(id);
    for (const p of PLACES) {
      if (!railStrip) {
        rail.querySelector(`[data-place="${p.id}"]`)
          ?.setAttribute('aria-current', String(p.id === id));
      }
      const sec = cardSections.get(p.id);
      if (!sec) continue;
      // B-K22 mount law (GH-668 A11): the arriving card ENTERS through the
      // kit — motion.mount clears `hidden` synchronously and runs the enter
      // (opacity 0 -> 1 + 8 px rise on --ob-t-med; its first painted frame
      // is the hidden pose), instant under reduced motion; an absent kit =
      // the plain flip. The LEAVING card cuts (hidden now, as before): a
      // kit exit keeps painting for --ob-t-fast, and the cards share one
      // in-flow column, so a fading predecessor would sit over the arriving
      // card's controls (e2e-ui A3 reachability samples the frame 100 ms
      // after the flip — the mover's pan covers the cut anyway).
      if (p.id !== id) { sec.hidden = true; continue; }
      if (typeof motion?.mount === 'function') motion.mount(sec);
      else sec.hidden = false;
    }
    armArrivalHold(id); // LAW 2 (below): the card lands WHOLE, never a stub frame
    mountContent(id); // the place's FIRST arrival mounts its content (if any)
    for (const m of content.values()) m.setPlace?.(id);
    // GH-712 review r1 P2: the prompt's placement is PER PLACE (the
    // .ob-shell-at-<id> rules above move it 12 -> 90 px at the equipment
    // place) — a position-only move never fires its ResizeObserver, so the
    // published bottom edge is re-read from the live rect on every place
    // change (a no-op while no prompt is mounted).
    publishDecisionBottom();
  }

  // ---- place content (GH-525 S2 atelier seam; S4 prep R0 generalised it) ---
  // The equipment place presents the FIVE-STATION ATELIER as its card-section
  // CONTENT (the atelier contract (feature 032, internal) — stations are
  // content of this place, never places; the §2 places registry is
  // untouched; shell.md §9 deviation 9). The module CONTENT_MODULES names
  // for a place rides a guarded dynamic import at that place's FIRST
  // arrival (cache-poison contract: an absent/stale module leaves the S1
  // stub cards standing — never a black page); content drives the SAME
  // mover (one camera owner) and window.__settings for every swap.
  const content = new Map();       // place id → mounted content handle
  const contentTried = new Set();  // place ids whose first arrival imported
  // GH-525 S2.5 review visual-audit round 1 (finding 5): a place joins only
  // once its healthy-vs-degrade decision RESOLVED as degrade — the stub
  // cue-swap select keys on it (see the equipment summaries tick) so it
  // never paints during the pending import window on a healthy boot.
  const contentDegraded = new Set();
  // the S2 names live on as getters over the map/set (the equipment
  // summaries tick and the rack→cues prop-tap forward keep their semantics)
  const atelier = () => content.get('equipment') ?? null;
  const atelierDegraded = () => contentDegraded.has('equipment');
  /** The ONE content ctx factory (R0 (d)): the UNION every content module
   * receives — each consumer feature-detects the members it needs. */
  function shellCtx(section) {
    return {
      scene, camera, orbit, machine, game, mover, section, bedScale,
      shell: {
        isOpen: () => open,
        place: () => active,
        goTo,
        exitToTable,
        instant: () => scriptedStamp && obshell,
        // GH-541 (atelier.md §7 entry 17): the CONFLICTING-COMMIT gate
        // pair — a pending rules decision blocks the swap Keep and
        // try-it (never entry/browsing); the refusal presents through
        // the shell's honest notice register. Feature-detected by the
        // consumers (a stale shell.js refuses ENTRY under the old law,
        // so the gate is unreachable there — coherent either way).
        decisionPending: () => decisionPending(),
        notice: (key) => note(key),
        // pose-then-open of the settings modal (a place-card member —
        // 036 P-R1, delivered here; the atelier ignores it)
        showThenOpen,
        // the one input-clock stamp helper (#1130) for practice.js's hold
        // echo; feature-detected (a stale shell.js leaves the handler clock)
        inputClock,
        // GH-1001 #1191: the count of inputs the open shell's gates saw
        // (every gated press, wheel and key, trusted or not) — the
        // atelier's same-table re-judge yields its table framing only
        // when it rose since the verification and the camera moved
        inputs: () => inputSeq,
      },
    };
  }
  // GH-525 integrator 2026-09-05 (combined review visual audit r1, finding 4:
  // the S1 stub content PAINTED for 2–3 frames at every first arrival — J2
  // reduced-motion Practice f194–196 / Replays f346–347; J1/J3/J4 too). The
  // R0 mount started the guarded import AT the arrival, so the stub stood
  // for the import latency. Two laws cure it, both inside this block:
  //  LAW 1 — PREFETCH. Every CONTENT_MODULES import starts in IDLE time once
  //    the shell has opened and its opening move has settled (the fresh
  //    boot's settle landing/cut; at once on the returning boot's, the
  //    pill's and the obshell instant poses) — one module per idle slot, in
  //    sequence, never inside a camera move. The promise is kept per id in
  //    `contentReady`, so a first arrival finds its module evaluated (or
  //    already refused). ONE import per id, ever — `mountContent` reuses the
  //    in-flight/settled promise (the A3 poison legs still log exactly one
  //    refused fetch; a refused prefetch is JUDGED at the arrival, so the
  //    healthy-vs-degrade decision still resolves there — S2.5 finding 5).
  //  LAW 2 — AWAIT-READY ARRIVAL. `presentPlace` HOLDS the arriving card —
  //    its whole section, `visibility:hidden` inline (never `hidden`: the
  //    §6 test surface keeps "exactly the active section un-hidden"; no
  //    bare heading either — practice SC-004 / T035 r1 P1-a) — while the
  //    place has a content row, is not degraded and its content is not yet
  //    PAINTED. Release: `contentPainted(id)` turns true (a MutationObserver
  //    on the section + a rAF loop — see the predicate's own block below;
  //    play/practice retire their stubs in a SHEET-GATED step after their
  //    factory and the atelier's stub kill rides its sheet, so neither the
  //    import promise nor the stubs' `hidden` attribute is the ready
  //    signal — audit r2 finding 1), a resolved degrade (the stub stands,
  //    exactly as today — cache-poison contract unchanged), or
  //    ARRIVAL_HOLD_MS, the cap the ruling names (D6's ≤ ~1.0 s move is the
  //    outer bound; shellmover MOVE_MS 900).
  //    Under reduced motion the mover snaps and, with the prefetch complete,
  //    the card lands WHOLE inside the click's own frame; under a race the
  //    column stays empty ≤ the cap and fills without a stub frame.
  const ARRIVAL_HOLD_MS = 250;
  const contentReady = new Map();   // place id → its ONE import promise
  const contentSettled = new Set(); // …ids whose promise has settled (readout)
  const importContent = (id) => {
    let p = contentReady.get(id);
    if (!p) {
      p = import(CONTENT_MODULES[id][0]);
      contentReady.set(id, p);
      const settle = () => contentSettled.add(id);
      p.then(settle, settle); // a refused prefetch is judged at the arrival
      // LAW 1 PREFETCH HOOK (GH-525 integrator 2026-09-05; combined review
      // visual audit r3 finding 1): a module that exports `prefetch()` has
      // it called ONCE, in this same idle step, as soon as its import
      // settles — replays pre-reads its archive snapshot there, so its
      // arrival paints synchronously. Optional (feature-detected on the
      // namespace); a throwing / rejecting hook is the module's own affair.
      p.then((m) => {
        if (typeof m?.prefetch !== 'function') return;
        try { Promise.resolve(m.prefetch()).catch(() => {}); } catch { /* module's */ }
      }, () => {});
    }
    return p;
  };
  let prefetched = false;
  function prefetchContent() {
    if (prefetched) return;
    prefetched = true;
    preloadSheets(); // #811: the place sheets ride their own idle chain (below)
    // ONE module per idle slot, in registry order, each started only after
    // the previous settled and never while the camera is moving — a move is
    // not idle time (the D6 frame budget: perf-shell's move rows). The
    // opening place's own import (mountContent) is already in flight.
    const queue = Object.keys(CONTENT_MODULES).filter((id) => !contentReady.has(id));
    const idle = (fn) => (typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(fn, { timeout: 2000 })
      : setTimeout(fn, 50));
    const step = () => {
      if (!queue.length) return;
      if (mover.moving()) { idle(step); return; }
      const next = () => idle(step);
      importContent(queue.shift()).then(next, next);
    };
    idle(step);
  }
  // #811 (the A3 motion recurrence): the LAW 1 hook links a place's sheet
  // only once its module import settles, so a rail click right after that
  // settle could beat the sheet past LAW 2's ARRIVAL_HOLD_MS cap and paint the
  // S1 stub. So the content places' sheets are ALSO linked here, at boot idle:
  // one per idle callback (requestIdleCallback, NO timeout), never before boot
  // ready (a RETURNING or scripted boot opens the shell inside the boot's own
  // hold), inside a camera move (LAW 1's D6 rule) only when the NEXT sheet is
  // the destination's, and never once the module linked its own. Each link
  // carries its module's versioned href under a PRELOAD id (<module id>-pre,
  // data-optional): a current module's ensureSheet() adopts it under its own
  // id when the href is its own and unlinks another href (a stale shell's
  // older ?v=); an older module never sees it and links its own beside it,
  // and the cleanup in preloadSheets() unlinks the preload once that own link
  // settles (load or error), leaving only the older module's own sheet.
  // A preload that fails before adoption is unlinked. Play's sheet comes with
  // its mount; no requestIdleCallback (WebKit) = no preload. PLACE_SHEETS
  // duplicates each *_CSS_V; web/tools/test-place-sheets.mjs holds them equal
  // and runs this chain and its cleanup.
  const PLACE_SHEETS = [
    ['practice', 'ob-practice-css', './ui/practice.css?v=015'],
    ['equipment', 'ob-atelier-css', './ui/atelier.css?v=059'],
    ['replays', 'ob-replays-css', './ui/replays.css?v=018'],
  ];
  function preloadSheets() {
    if (typeof window.requestIdleCallback !== 'function') return;
    const queue = PLACE_SHEETS.filter(([id]) => CONTENT_MODULES[id]);
    // The cleanup (shell.md §9 entry 34): a link ADDED under a place's own id
    // while that place's preload is still unadopted can only be an older
    // module's own link (a current module adopts by renaming, adding nothing).
    // Once it settles (its load or error event, a task that always follows
    // this microtask) the preload is unlinked, and only while it still
    // carries the preload id, so an adopted link is never touched.
    // The observer starts with the first preload and disconnects once the
    // chain is done and no preload is left.
    let watch = null;
    const tidy = () => {
      if (watch && !queue.length && !PLACE_SHEETS.some(([, id]) => document.getElementById(`${id}-pre`))) {
        watch.disconnect();
        watch = null;
      }
    };
    const cleanup = (records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          const row = n.nodeName === 'LINK' && PLACE_SHEETS.find(([, id]) => id === n.id);
          const pre = row && document.getElementById(`${row[1]}-pre`);
          if (!pre) continue;
          const drop = () => { if (pre.id === `${row[1]}-pre`) pre.remove(); };
          n.addEventListener('load', drop, { once: true });
          n.addEventListener('error', drop, { once: true });
        }
      }
      tidy();
    };
    const step = () => {
      if (!queue.length) { tidy(); return; }
      if (window.__test?.ready !== true || (mover.moving() && queue[0][0] !== active)) {
        window.requestIdleCallback(step);
        return;
      }
      const [, linkId, rel] = queue.shift();
      const preId = `${linkId}-pre`;
      if (!document.getElementById(linkId) && !document.getElementById(preId)) {
        if (!watch && typeof MutationObserver === 'function') {
          watch = new MutationObserver(cleanup);
          watch.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] });
        }
        const link = document.createElement('link');
        link.id = preId;
        link.rel = 'stylesheet';
        link.setAttribute('data-optional', '');
        link.href = new URL(rel, import.meta.url).href;
        link.addEventListener('error', () => { if (link.id === preId) link.remove(); }, { once: true });
        document.head.appendChild(link);
      }
      window.requestIdleCallback(step);
    };
    window.requestIdleCallback(step);
  }
  // GH-525 integrator 2026-09-05 (combined review visual audit r2, finding 1:
  // the equipment S1 card still PAINTED for 3 frames at its first arrival
  // under normal motion — J1 desktop f343–345, J3 desktop f307–309, J4 phone
  // glass-off f355–357; reduced motion J2 was clean). LAW 2's release keyed
  // on the stubs' `hidden` ATTRIBUTE — attribute truth is not paint truth:
  // the atelier flips it synchronously in its factory but links
  // ui/atelier.css in that same call, and shell.css's own
  // `.ob-shell-actions { display: flex }` outranks the UA [hidden] rule (the
  // GH-534 F1 ghost class) until that sheet's host kill rule arrives, so the
  // hold released 1–3 frames BEFORE the card was whole (probe, pre-fix:
  // frame 0 = stub attr hidden, stub PAINTED, sheet not loaded, #ob-atelier
  // unstyled; frame 1 = sheet loaded, whole card). play gates its mount on
  // play.css; practice/replays retire with an inline display pair — hence
  // only equipment flashed. RULING: readiness = CONTENT PAINTED, per place,
  // ONE predicate for all four, evaluated on the MutationObserver AND a rAF
  // loop until the cap (degrade / rejection release as before — the stubs
  // stand):
  //   contentPainted(id) ⇔ the section carries the module's host class
  //     (`ob-<id>-host`; the S2 atelier's is `ob-atelier-host`) ∧ no S1 stub
  //     node PAINTS (computed display none, or no client rect) ∧ some
  //     module-owned direct child (not the H2 / hold hint / stub nodes) is
  //     laid out: not [hidden], display not none, no inline
  //     visibility:hidden of its own (the held section's inherited
  //     visibility IS the hold) and a non-zero box.
  //   The atelier exposes no ready signal (handle = go/setPlace/onShellExit/
  //   propTap), so DOM paint truth is the signal there; its stub kill rides
  //   its sheet, which is exactly what the predicate now waits on.
  const laidOut = (el) => {
    if (el.hidden || el.style.visibility === 'hidden') return false;
    if (getComputedStyle(el).display === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const stubPaints = (el) => getComputedStyle(el).display !== 'none'
    && el.getClientRects().length > 0;
  // LAW 2 `ready` (GH-525 integrator 2026-09-05; combined review visual audit
  // r3 finding 1): a mounted handle that exposes `ready` (a thenable) is
  // painted only once it settled — replays' is its FIRST archive sweep, so
  // a cold-snapshot arrival never shows the pending register (no empty
  // sentence, no bare heading) while the read runs; the cap still bounds
  // the hold. Handles without `ready` (play / practice / equipment) keep
  // the DOM paint-truth predicate alone — today's behaviour.
  const contentReadyDone = new Set(); // ids whose handle.ready settled
  const contentReadyPending = (id) => {
    const h = content.get(id);
    return !!h && h.ready != null && typeof h.ready.then === 'function'
      && !contentReadyDone.has(id);
  };
  function contentPainted(id) {
    const sec = cardSections.get(id);
    if (!sec || !sec.classList.contains(HOST_CLASS(id))) return false;
    if (contentReadyPending(id)) return false;
    const stubs = stubNodes.get(id) ?? [];
    if (stubs.some(stubPaints)) return false;
    const stubSet = new Set(stubs);
    return [...sec.children].some((el) => el.tagName !== 'H2'
      && !el.classList.contains('ob-shell-hold') && !stubSet.has(el)
      && laidOut(el));
  }
  // ONE arrival observer for LAW 2 / 2b, created WITH the shell: a
  // MutationObserver's callback runs in observer-creation order, so the
  // enter this one starts (the hold's release, the late arrival's enter)
  // lands in the SAME microtask checkpoint as the paint mutation and before
  // any watcher installed later (an audit's A11 reveal judge) samples the
  // pose — no rest frame between a content paint and its kit enter.
  const arrivalMo = typeof MutationObserver === 'function'
    ? new MutationObserver(() => arrivalCheck()) : null;
  const ARRIVAL_WATCH = { childList: true, subtree: true, attributes: true,
    attributeFilter: ['hidden', 'class', 'style'] };
  function arrivalCheck() {
    if (hold) { if (contentPainted(hold.id)) releaseHold(); return; }
    if (late && contentPainted(late.id)) {
      const sec = cardSections.get(late.id);
      endLate();
      if (sec && !sec.hidden && typeof motion?.enter === 'function') motion.enter(sec);
    }
  }
  let hold = null; // { id, timer, raf } — the ONE arrival hold in flight
  function releaseHold(reason) {
    if (!hold) return;
    const { id, timer, raf } = hold;
    hold = null;
    arrivalMo?.disconnect();
    clearTimeout(timer);
    cancelAnimationFrame(raf.id);
    const sec = cardSections.get(id);
    if (!sec) return;
    sec.style.visibility = '';
    // B-K22: the card that was HELD lands WHOLE with its kit enter (the
    // mount's own enter ran under the hold's visibility) — only while it is
    // still the presented card (a flip away mid-hold releases the old hold
    // after that card was hidden: it stays hidden)
    if (!sec.hidden && typeof motion?.enter === 'function') motion.enter(sec);
    // the CAP released an EMPTY card: its content, when it lands, enters too
    if (reason === 'cap' && !sec.hidden && !contentPainted(id)) armLateEnter(id);
  }
  //  LAW 2b — THE LATE ARRIVAL ENTERS TOO (S5 slice 4 round 2 P2-a; e2e-ui
  //    --audit A11 '[phone practice] #ob-practice revealed at the rest pose,
  //    no kit enter', intermittent under box load, deterministic with the
  //    module's arrival delayed ≥ ~250 ms — gates/r2/lab-a11-arrival-*.log):
  //    content that lands AFTER the cap released its section (the empty
  //    column at rest, the law above) used to FILL it at the rest pose —
  //    the one reveal path that bypassed B-K22. It now enters through the
  //    kit as well: ONE motion.enter(sec) in the SAME task as its content's
  //    paint mutation (arrivalMo above; a rAF sweep backs the observer as in
  //    the hold), while that card is still the presented one (a flip away
  //    ends the watch; LATE_ENTER_MS bounds it). The module never reveals
  //    itself.
  const LATE_ENTER_MS = 5000;
  let late = null; // { id, raf, t0 } — the ONE late-arrival watch
  function endLate() {
    if (!late) return;
    cancelAnimationFrame(late.raf);
    late = null;
    arrivalMo?.disconnect();
  }
  function armLateEnter(id) {
    endLate();
    const sec = cardSections.get(id);
    if (!sec || sec.hidden || typeof motion?.enter !== 'function') return;
    const t0 = performance.now();
    arrivalMo?.observe(sec, ARRIVAL_WATCH);
    const loop = () => {
      if (!late || late.id !== id) return;
      const s = cardSections.get(id);
      if (!s || s.hidden || performance.now() - t0 > LATE_ENTER_MS) { endLate(); return; }
      arrivalCheck();
      if (late) late.raf = requestAnimationFrame(loop);
    };
    late = { id, raf: requestAnimationFrame(loop), t0 };
  }
  function armArrivalHold(id) {
    releaseHold();
    endLate(); // a new presentation ends any late watch
    const sec = cardSections.get(id);
    if (!sec || !CONTENT_MODULES[id] || contentDegraded.has(id)
      || contentPainted(id)) return;
    sec.style.visibility = 'hidden';
    arrivalMo?.observe(sec, ARRIVAL_WATCH);
    const raf = { id: 0 };
    const loop = () => { arrivalCheck(); if (hold?.id === id) raf.id = requestAnimationFrame(loop); };
    raf.id = requestAnimationFrame(loop);
    hold = { id, timer: setTimeout(() => releaseHold('cap'), ARRIVAL_HOLD_MS), raf };
  }
  function mountContent(id) {
    const entry = CONTENT_MODULES[id];
    if (!entry || contentTried.has(id)) return;
    contentTried.add(id);
    const factory = entry[1];
    const degrade = () => {
      contentDegraded.add(id);
      if (hold?.id === id) releaseHold(); // LAW 2: the stub stands, as today
      refreshSummaries();
    };
    importContent(id).then((m) => {
      if (typeof m[factory] !== 'function') {
        degrade(); // stale module: the stubs are the surface
        return;
      }
      const handle = m[factory](shellCtx(cardSections.get(id))) ?? null;
      if (!handle) { degrade(); return; }
      content.set(id, handle);
      { // B-SH02: a module that reports NO primary took the card's surface —
        // a hold there is a no-op, so the hint is retired (hide-only: the
        // module owns its surface and may have retired the S1 nodes itself)
        const hh = holdHints.get(id);
        if (hh && typeof handle.primary !== 'function') hh.hidden = true;
      }
      // LAW 2 `ready`: the hold's third release path (with the paint
      // predicate and the cap) — armed BEFORE setPlace so a synchronous
      // first sweep settles it in this same task (no extra frame)
      if (handle.ready != null && typeof handle.ready.then === 'function') {
        const done = () => {
          contentReadyDone.add(id);
          if (hold?.id === id && contentPainted(id)) releaseHold();
        };
        handle.ready.then(done, done);
      }
      if (open) handle.setPlace?.(active);
    }).catch(() => {
      // degrade: the S1 stub cards stand — arm their cue-swap surface now
      degrade();
    });
  }

  /** Navigate to a place while open (rail button, card, prop tap, __shell). */
  function goTo(id, { instant = false } = {}) {
    if (!PLACE_IDS.includes(id)) return active;
    if (!open) { pendingPose = id; return active; }
    presentPlace(id);
    refreshSummaries();
    // landing updates lastPlace (navigation memory — §5; interrupt storms
    // are last-pick-wins because the write follows the REQUEST, and the
    // mover guarantees the final pose is this request's end pose)
    writeState({ lastPlace: id });
    arrived = true;
    mover.moveTo(anchorOf(id), { instant: instant || (scriptedStamp && obshell) });
    return active;
  }

  /** Open the shell (boot arrival or the chrome affordance).
   * `animate`: one bounded mover move to the opening place (the FRESH
   * settle and the pill's mid-session open); otherwise instant pose (the
   * RETURNING boot and every `obshell=1` scripted pose).
   * `bootPose`: a FORCED opening pose (the returning boot's always-Play
   * law) — never a navigation, so it must not overwrite the stored
   * lastPlace memory (review review r2 P2: §5 retains the value for
   * future in-shell affordances; the boot-pose write defeated it).
   * `autoFocus`: script-focus the quick-play control (the chrome-affordance
   * default; post-interaction script focus only rings for keyboard users).
   * Boot opens pass FALSE (owner nit, PR 531 round 3): pre-interaction
   * script focus MATCHES Chrome's :focus-visible heuristic and painted a
   * boot focus ring on Play — FR-007(1) Enter-on-arrival rides the keydown
   * gate's root routing instead. */
  function openShell({ animate = false, place = null, bootPose = false,
    autoFocus = true, pointerOpen = false, pointerAt = null, pointerTs } = {}) {
    if (open) return true;
    if (!entryAllowed()) { refusalNote(); return false; }
    disarmOrphanWatch(); // GH-682: a new hall session owns focus again
    mover.captureEntry();
    entryBed = bedKey();
    // cancel any in-flight aim/touch gesture through the modules' OWN
    // swallowed-release recovery lanes (aim.js:2079 / touch.js:1082)
    try { window.dispatchEvent(new Event('blur')); } catch { /* ok */ }
    open = true;
    qpVerb(); // R16: "To the table" / "Back to the table" per the live match
    // GH-534 F6: the double-click continuation window arms ONLY on a
    // pointer-activated open (review fix-round review r1 P2: boot/keyboard/
    // API opens must not swallow a legitimate first canvas press — FR-009)
    openedAt = pointerOpen ? { input: inputClock(pointerTs), handled: performance.now() } : -Infinity; // #1130
    openedPt = pointerOpen && pointerAt ? pointerAt : { x: -1e9, y: -1e9 };
    cover = false; // the open state supersedes the boot cover (§9 dev 6)
    document.body.classList.add('ob-shell-open');
    // GH-541: the ROOT class twin (the html.ob-pb-live playback idiom) —
    // dialog.js's rootObserver watches documentElement class flips, so the
    // hud decision panel's cover sync + reveal handoff fire even when the
    // panel opened before this module built #ob-shell (armRootObserver
    // collects [data-ob-layer] nodes only at openPanel time).
    document.documentElement.classList.add('ob-shell-open');
    hudInert(true);
    root.hidden = false;
    pill.hidden = true;
    scheduleBands(); // B-K05: the chrome has layout again
    installGate();
    // shell-open visual state (§7.1): instant on the pose-instant branches
    // (returning boots, scripted obshell fixtures, reduced motion); the
    // animated arrivals ramp it in alongside the settle
    visualsOn({ instant: !animate || (scriptedStamp && obshell) || reducedMotion() });
    // opening place: never stored.lastPlace (demoted — owner ruling
    // 2026-08-15); an explicit place / a closed-state go() pose still wins
    const id = place ?? pendingPose ?? active ?? 'play';
    pendingPose = null;
    presentPlace(id);
    refreshSummaries();
    // LAW 1 (the mount block): the content prefetch starts once this
    // opening move has settled — the fresh settle's landing (or its cut),
    // at once on the instant poses (returning boot, obshell, reduced motion)
    Promise.resolve(mover.moveTo(anchorOf(id),
      { instant: !animate || (scriptedStamp && obshell) })).then(prefetchContent);
    // GH-984: seed the D15 re-assert's pose from the LIVE rig now (the
    // instant poses have just landed; an animated arrival is skipped by the
    // re-assert while it moves and the frame hook takes over). The frame
    // hook was its only writer, and a returning boot opens before the first
    // delivered frame — a persisted non-default game's async boot re-rack
    // then re-asserted the all-zero placeholder (the orbit clamps put the
    // camera 0.7 m over the bed centre: the blue-spot close-up).
    snapLastPose();
    // opening lands a place: navigation memory (§5) + the first-arrival
    // write law (FR-006/review r2 — no later than the first shell exit).
    // A bootPose open SKIPS the write (forced pose, not a navigation —
    // the stored errand memory survives the returning boot).
    if (!bootPose) {
      writeState({ lastPlace: id });
      arrived = true;
    }
    if (autoFocus) {
      try { qp.focus({ preventScroll: true }); } catch { /* ok */ }
    }
    // GH-541: a decision pending AT entry surfaces synchronously (the frame
    // hook maintains it from here; e2e reads the prompt right after open)
    syncDecisionPrompt();
    return true;
  }

  /** Exit to the LIVE table state (quick-play and every card exit).
   * `opts.activated`: the exit arrived from a user gesture path (the
   * quick-play handlers thread it — GH-682 review r2 P2, captureFocusAtExit). */
  function exitToTable(opts) {
    if (!open) return;
    // GH-682 review r2 P2: the focus-ownership read happens HERE — before
    // the teardown below hides #ob-shell and the body-level surfaces
    // (onShellExit), which is what left r1's read looking at <body>
    const focusAtExit = captureFocusAtExit(opts);
    // #988: the exit hides its own control and hands focus on — the second
    // click of a double-click (or a drifted second tap: the time-only clause,
    // the table canvas only — chrome answers a deliberate press) must not
    // land on the table it exposes (a keyboard exit is the key half's)
    armContinuation({ timeOnlyMs: TAP_SHIELD_MS, timeOnlyIn: (n) => n === sceneCanvas() }); // a canvas inside chrome (a chip swatch, the spin face) is chrome
    // GH-697 review r1 P2 (PR #706): a FINISHED shared replay is resolved
    // SYNCHRONOUSLY here — before onShellExit and before the caller's own
    // exit action runs in this same task (the Practice card's fallback
    // changeMode('playground') follows exitToTable(); share.js's body-class
    // observer is a microtask, so the replay lock still refused it and the
    // mode never applied). Feature-detected: an older share.js keeps its
    // observer path. A replay still RUNNING is left alone (the seam's law).
    window.__share?.exitFinishedReplay?.();
    // float/deep surface never survives an exit (032) — every mounted
    // content module hears the exit
    for (const m of content.values()) m.onShellExit?.();
    theaterClear(); // theater dim never survives a shell exit
    mover.cutToEnd();
    uninstallGate();
    open = false;
    document.body.classList.remove('ob-shell-open');
    // GH-541: reveal the hud decision panel (rootObserver fires exposeTop —
    // a still-pending decision re-presents at the table with its focus
    // handoff); the shell's own prompt never survives an exit
    document.documentElement.classList.remove('ob-shell-open');
    clearDecisionPrompt();
    hudInert(false);
    root.hidden = true;
    pill.hidden = false;
    scheduleBands(); // B-K05: a closed shell reserves nothing
    // first-arrival write no later than the first shell exit — including
    // the immediate-quick-play path (FR-006). A returning bootPose session
    // with ZERO user navigation exits WITHOUT writing (review review r2 P2:
    // the stored errand memory survives an open-and-quick-play session);
    // any real landing (goTo / non-boot open) has set `arrived`, and a
    // fresh profile (stored === null) must write regardless — the
    // key-presence classification law.
    if (arrived || stored === null) {
      writeState({ lastPlace: active });
      arrived = true;
    }
    // shell-open visual state OFF (§7.1): instant, on the same frame as
    // the instant camera cut — gameplay lighting + visuals restored exactly
    visualsOff();
    // instant gameplay pose restore (FR-007(5) / contract §3(9)); the LIVE
    // machine state is preserved untouched: AIM stays AIM, BALL_IN_HAND
    // keeps its placement rights, WIN's flow.js continuation timer keeps
    // running (flow.js:2796-2808) — the shell never routes the machine.
    // GH-1025: a session that changed the game or the bed exits on the
    // fresh-entry pose; a round trip that kept both keeps the user's pose.
    // A stale cached shellmover.js without the seam drops the pose instead
    // (its table-scaled fallback), never the previous table's framing.
    if (bedKey() !== entryBed) {
      if (typeof mover.freshEntry === 'function') mover.freshEntry();
      else mover.clearEntry();
    }
    mover.restoreGameplayPose({ game });
    mover.clearEntry();
    handoffFocusOnExit(focusAtExit);
  }
  // ---- GH-682: focus successor law (hall→table exits) -----------------------
  // Hiding #ob-shell hid the focused control with no successor: the first
  // Tab after a keyboard exit was the document wrap (a dead press), and a
  // dialog opened FROM the hall (the switch-game confirm) restored into the
  // hidden card → <body>. Every exit that owned focus hands it to a VISIBLE
  // table-register successor: the HUD primary (#shoot), else the first
  // usable HUD control, else the scene canvas (tabindex -1), else the
  // reopen pill — never <body>. Pre-interaction exits (no user activation,
  // focus never in the shell) leave focus alone: the boot focus-ring nit
  // (PR 531 round 3) stays honored.
  // GH-682 review r1 P2: the visibility read never rides
  // Element.checkVisibility — absent on iOS 16–17.3 WKWebView (a supported
  // floor), where the bare `typeof` guard accepted #power behind the phone
  // layout's display:none HUD row (touch.css), focus() was a no-op on it
  // and no canvas/pill fallback ran (focus stayed in the hidden hall or
  // fell to <body>). The dialog.js panelHidden idiom instead: a zero-box
  // element is display:none somewhere up the tree and `visibility`
  // inherits, so the element's own computed value carries any ancestor
  // stand-down; the display walk up the chain is the explicit form of the
  // same law (a display:contents parent — the phone FIRE row — has no box
  // of its own, so the walk asks each ancestor, never the box).
  const visibleInTree = (el) => {
    if (!el?.isConnected || el.getClientRects().length === 0) return false;
    if (getComputedStyle(el).visibility !== 'visible') return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (getComputedStyle(n).display === 'none') return false;
    }
    return true;
  };
  const usableFocus = (el) => !!el && el !== document.body && !el.hidden
    && el.disabled !== true && typeof el.focus === 'function'
    && !el.closest?.('[inert]') && visibleInTree(el);
  function focusSuccessor() {
    const cands = [document.getElementById('shoot'),
      ...(hudEl()?.querySelectorAll('button, input, select') ?? [])];
    const cv = sceneCanvas();
    if (cv) { if (!cv.hasAttribute('tabindex')) cv.tabIndex = -1; cands.push(cv); }
    if (!pill.hidden) cands.push(pill);
    // walk the successors in law order until one ACTUALLY holds focus —
    // a refused focus() (a control the predicate could not see through, a
    // focus-stealing layer) falls through to the next, never returns a
    // successor that does not own document.activeElement
    const seen = new Set();
    for (const el of cands) {
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (!usableFocus(el)) continue;
      try { el.focus({ preventScroll: true }); } catch { continue; }
      if (document.activeElement === el) return el;
    }
    return null;
  }
  let orphanWatch = null; // one-shot: a hall-opened dialog closing into body
  function disarmOrphanWatch() { orphanWatch?.(); orphanWatch = null; }
  function armOrphanWatch(layer) {
    disarmOrphanWatch();
    const onOut = (e) => {
      if (!layer.contains(e.target)) return;
      // the layer is already GONE (display:none / detached — dialog.js's
      // exit) and focus is falling to <body> (no relatedTarget): hand off
      // SYNCHRONOUSLY inside this focusout, so no task ever samples <body>
      // (the acceptance's 50 ms sampler is a real screen reader's cadence)
      const gone = !layer.isConnected || !visibleInTree(layer); // same API-free read
      if (e.relatedTarget == null && gone) {
        disarmOrphanWatch();
        if (focusSuccessor()) return;
        // the synchronous move was refused: fall through to the task check
        armOrphanWatch(layer);
      }
      setTimeout(() => {
        if (!orphanWatch) return;
        const now = document.activeElement;
        if (!now || now === document.body || root.contains(now)) {
          disarmOrphanWatch();
          focusSuccessor();
        } else if (!layer.contains(now)) disarmOrphanWatch(); // moved lawfully
      }, 0);
    };
    document.addEventListener('focusout', onOut, true);
    orphanWatch = () => document.removeEventListener('focusout', onOut, true);
  }
  // GH-682 review r2 P2: the 'did the shell own focus / was this a
  // user-activated exit' decision is CAPTURED at the top of exitToTable.
  // r1 read document.activeElement AFTER root.hidden = true, when it could
  // already be <body>, and its only rescue for that state was
  // navigator.userActivation.hasBeenActive — absent on iOS 16.0–16.3
  // WKWebView (feature 016 (internal spec): the 16.0 support floor), where a
  // button tap never moves focus in the first place (the WebKit tap law),
  // so a Play now tap exited with focus stranded on <body>. The API is
  // OPTIONAL now: an exit counts as activated when a gesture call site
  // threads `activated` (the quick-play handlers: the Play now click, the
  // play card primary on release, Enter/Space at the root), when it runs
  // inside a trusted event dispatch (window.event — every card action
  // click, the practice/replays/atelier handlers that call the seam
  // synchronously), or when the API exists and says so (the scripted
  // e2e hook after a real gesture). Pre-interaction exits (boot, no
  // gesture, focus never in the shell) still leave focus alone: the boot
  // focus-ring nit (PR 531 round 3) stays honored.
  function captureFocusAtExit(opts) {
    const ae = document.activeElement;
    const owned = !!ae && ae !== document.body && root.contains(ae);
    const ev = window.event; // the event being dispatched right now, if any
    const activated = opts?.activated === true
      || (typeof ev === 'object' && ev !== null && ev.isTrusted === true)
      || navigator.userActivation?.hasBeenActive === true;
    // a dialog opened FROM the hall (switch-game confirm → Continue commits
    // + exits 17 ms before the dialog closes) owns focus outside the root
    const layer = owned ? null : (ae?.closest?.('[role="dialog"], [role="alertdialog"], '
      + '.ob-modal, #ob-settings, dialog') ?? null);
    return { ae, owned, activated, layer };
  }
  function handoffFocusOnExit(f) {
    const now = document.activeElement;
    const idle = !now || now === document.body;
    // the teardown itself orphaned focus: the captured element sits in a
    // body-level shell surface onShellExit hid (Blink's focus fixup for a
    // display:none focused element is a later task, so `now` may still
    // report it) — no successor would ever come from there
    const orphaned = !!f.ae && f.ae !== document.body && !f.layer && !usableFocus(f.ae);
    if (f.owned || root.contains(now) || orphaned || (idle && f.activated)) {
      focusSuccessor();
      return;
    }
    if (!f.layer) return;
    // the dialog's prevFocus is now a hidden card, so its close lands on
    // <body> — hand off at that moment (one-shot; the next open disarms
    // it); a layer already gone by now (its focusout preceded this arm)
    // hands off directly
    if (!f.layer.isConnected || !visibleInTree(f.layer)) {
      if (idle || root.contains(now)) focusSuccessor();
      return;
    }
    armOrphanWatch(f.layer);
  }
  function quickPlay(opts) {
    if (!open) return false;
    exitToTable(opts);
    return true;
  }

  // ---- input isolation (§7 / FR-017; research R4) ----------------------------
  const sceneCanvas = () => document.querySelector('body > canvas');
  const hudEl = () => document.getElementById('hud');
  let hudMo = null;
  function hudInert(on) {
    const h = hudEl();
    if (!h) return;
    h.inert = on;
    if (on && !hudMo) {
      // settings.js's own hudVis(true) un-inerts the HUD when the modal
      // closes over an OPEN shell — re-assert while the shell owns it
      hudMo = new MutationObserver(() => {
        if ((open || cover) && hudEl() && !hudEl().inert) hudEl().inert = true;
      });
      hudMo.observe(h, { attributes: true, attributeFilter: ['inert', 'style'] });
    } else if (!on && hudMo) {
      hudMo.disconnect();
      hudMo = null;
    }
  }

  // every input the open shell's gates see, counted (ctx.shell.inputs)
  let inputSeq = 0;
  function gatePointerDown(e) {
    if (!open) return;
    inputSeq += 1;
    // ANY input interrupts to the end pose (§3(3)); a cut commits that END
    // pose as the shell's last-frame pose in the same task (GH-679)
    if (mover.cutToEnd()) snapLastPose();
    if (e.target !== sceneCanvas()) return; // chrome/dialog input untouched
    if (e.button === 1 || e.button === 2) return; // free orbit stays live (§3(6))
    // GH-534 F6 (QA): a MULTI-CLICK CONTINUATION of a chrome activation
    // must never re-enter the scene raycast — the reopen pill hides itself
    // and installs this gate synchronously on click 1 of a double-click,
    // so click 2 hit-tests to the canvas at the same coords and
    // prop-navigated (pill → wall-rack raycast → equipment deep-land).
    // TWO guards, both gate-but-ignore (still swallowed — aim/place/touch
    // must never see the press, FR-017; never resolved as a prop tap):
    // (1) e.detail > 1 — real platform double-clicks carry the click count
    //     on pointerdown in Chromium;
    // (2) the ACTIVATION-WINDOW debounce — synthesized/driver input (CDP
    //     dispatches detail 1 on the continuation press; red-proven by the
    //     e2e-shell F6 arm) and any pointer stack that zeroes pointer-event
    //     detail: a canvas press landing within the double-click window of
    //     THIS open() can only be the continuation of the click that
    //     opened the shell (the pill was the only chrome at those coords).
    // (review fix-round review r2 P2: the window guard is scoped to a
    // CONTINUATION of the opener — same spot within the double-click
    // window; a deliberate press elsewhere right after opening is a
    // legitimate FR-009 prop navigation and passes through)
    if (e.detail > 1 || ((inputClock(e.timeStamp) - openedAt.input < 400 || performance.now() - openedAt.handled < 400)
      && Math.hypot(e.clientX - openedPt.x, e.clientY - openedPt.y) < 24)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    // primary press on the scene: the shell's own prop-tap resolves through
    // the places registry (FR-009/research R7), then the press is gated —
    // aim/place/touch handlers must never see it (FR-017)
    e.stopImmediatePropagation();
    e.preventDefault();
    const id = propPlaceAt(e.clientX, e.clientY);
    // rack→cues delegation (contract §9 deviation 9; 032 FR-001 — the ONE
    // station prop delegation): a rack tap while open AT the equipment
    // place selects the cues STATION (a place-internal hit the atelier
    // sub-registry owns). Every other resolution keeps the frozen §2 place
    // mapping — table-bed taps stay 'play', a lawful atelier exit.
    if (id === 'equipment' && active === 'equipment'
      && atelier()?.propTap?.()) return;
    if (id) goTo(id);
  }
  function gateWheel(e) {
    if (!open) return;
    inputSeq += 1;
    if (mover.cutToEnd()) snapLastPose(); // GH-679: the cut's END pose
    if (e.target !== sceneCanvas()) return;
    // the wheel serves the SHELL: zoom through the rig (orbit.js's own wheel
    // math, duplicated-literal law) — never shot power (FR-017)
    e.stopImmediatePropagation();
    e.preventDefault();
    orbit.state.radius *= Math.exp(e.deltaY * 0.001);
    orbit.apply();
  }
  // keygate.js (GH-990): the dialog-surface selector and the
  // gameplay key family below are shared with aim.js — guarded dynamic
  // import per the cache-poison contract: a missing/stale leaf leaves
  // keygate null and the gate keeps its own literals (identical today)
  let keygate = null;
  import('./ui/keygate.js')
    .then((m) => { keygate = typeof m.DIALOG_SURFACE_SELECTOR === 'string' && Array.isArray(m.GAMEPLAY_KEYS) ? m : null; })
    .catch(() => { /* leaf absent: the literals below */ });
  const gameplayKeys = () => keygate?.GAMEPLAY_KEYS ?? ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'v', 'V'];
  function gateKeyDown(e) {
    if (!open) return;
    inputSeq += 1;
    // ANY input interrupts to the end pose (§3(3)); a cut commits that END
    // pose as the shell's last-frame pose in the same task (GH-679)
    if (mover.cutToEnd()) snapLastPose();
    if (e.key === 'Tab') return; // focus navigation is never gated
    const tgt = e.target;
    // 032 atelier chrome (contract §9 deviation 9): the station carousel
    // and the cloth-color radiogroup are keyboard-complete (arrows/Home/
    // End) through their OWN container listeners, which stopPropagation
    // BEFORE the gameplay window-bubble handlers — a capture-phase
    // stopImmediatePropagation here would starve them (window capture runs
    // first), so the gate defers exactly those keys to exactly those
    // containers (KEY_GATE_EXEMPT, one entry per place lane). Every other
    // key/target keeps the FR-017 gate below.
    // #ob-shell-rail joins the exemption ONLY once its roving handler is
    // armed (data-ob-roving — set by the strip-leaf upgrade AND the degrade
    // register, GH-534 round 7): during the import window the arrows stay
    // gated below, so they can never fall through to aim.js (FR-017).
    // R0 amendment R0(i) (035 plan P-17; carried by the 035a lane as the
    // protocol fallback — names no place): Enter/Space join the exempt
    // keys for exempt containers ONLY — a container that hosts non-native
    // activation targets (the DVR's `div.ob-pb-row[role=button]` rows,
    // whose own keydown handler is the ONE activation path) would
    // otherwise never see them (window capture runs first). Gameplay-safe:
    // no window keydown handler in aim.js / hud.js / touch.js / flow.js
    // acts on Enter or Space; the exempt containers stopPropagation them
    // in-container after their row handler ran.
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' ']
      .includes(e.key)
      && tgt instanceof Element && tgt.closest
      && tgt.closest(KEY_GATE_EXEMPT.join(', ')) !== null) {
      return;
    }
    // dialog-class surfaces keep their OWN key handling (focus trap,
    // Escape layering — dialog.js); everything else is gated: NATIVE
    // default actions survive stopImmediatePropagation (Enter/Space still
    // activate the focused shell button; Tab still moves focus), while the
    // gameplay keyboard families (aim.js window keydown: arrows = aim/
    // power steps, V = aim view; HUD hotkeys) never see the event —
    // pre-fix red: an arrow key on the focused quick-play control stepped
    // game.phi 0.05° and #power 0.1 through aim.js (FR-017 probe).
    // GH-534 F3 (QA, found by three journeys independently): the kit
    // confirm (dialog.js confirmDialog — body-appended .ob-panel.ob-confirm
    // with role="alertdialog") matched NOTHING in this selector, so Escape
    // fell through to the unconditional stopImmediatePropagation below and
    // dialog.js's document-capture Escape layering (window capture runs
    // first) never saw it — keyboard decline was dead on EVERY kit confirm
    // raised over the shell (all four re-racking swap confirms included).
    // [role="alertdialog"] + .ob-confirm join the exemption; the arrow/V
    // sub-gate below keeps FR-017 intact inside the dialog.
    const inDialog = tgt instanceof Element && tgt.closest
      && tgt.closest(keygate?.DIALOG_SURFACE_SELECTOR ?? ('#ob-settings, .ob-modal, [role="dialog"], '
        + '[role="alertdialog"], .ob-confirm, dialog, #err')) !== null;
    if (inDialog) {
      // dialog-owned handling (Escape layering, focus trap, kit popovers)
      // keeps the event — EXCEPT the gameplay hotkey family, which aim.js's
      // window handler would still consume behind the modal (review review
      // r1 P2: a focused plain modal button + ArrowLeft stepped phi 0.05°).
      // Interactive consumers aim.js itself defers to (its own guard
      // selector) keep their arrows: kit listboxes/comboboxes, inputs.
      if (gameplayKeys().includes(e.key)
        && !tgt.closest(
          'select,input,textarea,[role="combobox"],[role="listbox"]')) {
        e.stopImmediatePropagation();
      }
      return;
    }
    // GH-534 G3 (round-2 QA): focus can legitimately rest on <body> while
    // the settings modal is open (an option-press blur — the kit-side
    // cause is fixed in select.js, but ANY future blur path lands here).
    // The 015 §2 seam (#ob-gear[aria-expanded]) already carries modal
    // truth for the FR-007 branch below — a body-target key while the
    // modal is open gets the inDialog treatment: swallow only the
    // gameplay families, return otherwise so dialog.js keeps its Escape
    // layering (pre-fix: Escape was silently eaten and the modal wedged
    // until a blind Tab). Covers the GH-536 item-2 family (body-focus
    // keys over shell-fronted dialog surfaces).
    if ((tgt === document.body || tgt === document.documentElement)
      && document.getElementById('ob-gear')
        ?.getAttribute('aria-expanded') === 'true') {
      if (gameplayKeys().includes(e.key)) {
        e.stopImmediatePropagation();
      }
      return;
    }
    // FR-007(1) Enter-on-arrival WITHOUT the boot auto-focus (owner nit,
    // PR 531 round 3): while NOTHING has focus — boot opens no longer
    // script-focus quick-play, the source of the boot focus ring —
    // Enter/Space at the root activate the default Play action directly.
    // Guarded on the 015 §2 modal seam (#ob-gear[aria-expanded]): a
    // show-then-open settings modal owns the keys even if focus fell to
    // <body>. Once any control is focused, native activation owns them.
    if ((e.key === 'Enter' || e.key === ' ')
      && (tgt === document.body || tgt === document.documentElement)
      && document.getElementById('ob-gear')
        ?.getAttribute('aria-expanded') !== 'true') {
      e.stopImmediatePropagation();
      e.preventDefault();
      quickPlay({ activated: true }); // Enter/Space at the root: a gesture exit
      return;
    }
    e.stopImmediatePropagation();
  }
  // settings commits while the shell is open (review review r1 P2 pair):
  // (a) a Display 'Default camera' commit routes through __camhome.apply
  //     BEFORE the broadcast (settings.js set() order) and would leave the
  //     camera on a gameplay pose while the shell reports a place — the D15
  //     suppress-while-open law re-asserts the shell's own last-frame pose
  //     in the same tick (the preference is honored at the NEXT AIM entry,
  //     exactly the ruled composition);
  // (b) any commit refreshes the active card's summary lines (game/variant/
  //     cue/table changed through a shell-fronted settings modal).
  function onSettingsCommit(e) {
    if (!open) return;
    if (e.detail?.key === 'camera') mover.applyPose(lastPose);
    refreshSummaries();
    // §7.1 glare re-seed: a lighting fixture/brightness/look commit rewrote
    // the live emitters (settings applies BEFORE broadcasting) — adopt the
    // new values as the base and re-apply the shell dim, so exit restores
    // the USER's lighting, never the pre-open snapshot. Lighting-provenance
    // keys force the rebase only on a lighting leaf without state() — the
    // numeric-collision edge (review r2 P2) rides the rig signature
    // otherwise (GH-970: a no-op commit must never adopt our dim).
    glareSeed(['fixture', 'brightness', 'look'].includes(e.detail?.key));
  }
  const gateOpts = { capture: true };
  const wheelOpts = { capture: true, passive: false };
  // D15 suppression, seamless leg (review review r2 P2): main.js's
  // settings-flip route goes through __camhome.apply — while the shell owns
  // the camera the seam answers false and applies nothing (contract §3: "the
  // D15 re-home is suppressed while the shell is open"); the wrapper restores
  // on exit BEFORE restoreGameplayPose, which then honors the preference
  // through the ORIGINAL seam during the exit itself. main.js's DELAYED
  // bootCamHome (the lampfade import settle re-drives a persisted overhead
  // desire) calls its own camHome, not this seam; since #1192 it checks
  // window.__shell?.isOpen?.() itself and stands down while the shell is
  // open, and the exit's restoreGameplayPose covers it.
  let camhomeOrig = null;
  // capability refresh (review review r2 P2): drills/playback are their own
  // guarded imports — a returning boot can open before they resolve, and
  // nothing broadcasts their arrival, so the capability-gated card actions
  // re-evaluate on a slow tick while the shell is open.
  let capTimer = 0;
  let savedPanBounds = null;
  // async relight reseed (review fix-round review P2): the lighting layer's
  // ASYNC apply (persisted non-default fixture, slow module land) swaps the
  // rectLights array and announces on the dedicated ob:relight wire — NO
  // ob:settings event fires, so without this listener the glare dim keeps
  // tracking the torn-down canopy while the live emitters run undimmed.
  function onRelight() {
    if (open) glareSeed(true); // relight rewrites every emitter (provenance)
  }
  function installGate() {
    window.addEventListener('pointerdown', gatePointerDown, gateOpts);
    window.addEventListener('wheel', gateWheel, wheelOpts);
    window.addEventListener('keydown', gateKeyDown, gateOpts);
    window.addEventListener('ob:settings', onSettingsCommit);
    window.addEventListener('ob:relight', onRelight);
    if (window.__camhome?.apply && !camhomeOrig) {
      camhomeOrig = window.__camhome.apply;
      window.__camhome.apply = (m) => (open ? false : camhomeOrig(m));
    }
    clearInterval(capTimer);
    capTimer = setInterval(refreshSummaries, 2000);
    // wall-pose pan law (review review r2 P2): orbit.pan clamps USER pans to
    // the table bounds — from a wall anchor (target x 4.44) the first pan
    // move would snap the target multi-meters back onto the bed. The shell
    // suspends the clamp while it owns the camera; the saved bounds return
    // at exit (aim.js re-publishes them on template changes anyway).
    savedPanBounds = orbit.state.bounds;
    orbit.state.bounds = null;
  }
  function uninstallGate() {
    window.removeEventListener('pointerdown', gatePointerDown, gateOpts);
    window.removeEventListener('wheel', gateWheel, wheelOpts);
    window.removeEventListener('keydown', gateKeyDown, gateOpts);
    window.removeEventListener('ob:settings', onSettingsCommit);
    window.removeEventListener('ob:relight', onRelight);
    if (camhomeOrig) {
      window.__camhome.apply = camhomeOrig;
      camhomeOrig = null;
    }
    clearInterval(capTimer);
    capTimer = 0;
    if (savedPanBounds !== null) {
      orbit.state.bounds = savedPanBounds;
      savedPanBounds = null;
    }
  }

  // ---- prop hit targets (research R7: raycast + 44 pt projected floor) ------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const corner = new THREE.Vector3();
  function propGroups() {
    const out = [];
    for (const p of PLACES) {
      for (const name of p.props) {
        if (name === 'table') continue; // the bed plane test below
        const g = scene?.getObjectByName?.(name);
        if (g) out.push({ id: p.id, group: g });
      }
    }
    return out;
  }
  /** Screen point → owning place id (shell-open only), or null. */
  function propPlaceAt(cx, cy) {
    const c = sceneCanvas();
    if (!c) return null;
    const r = c.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1,
      -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    // exact mesh hit first
    const groups = propGroups();
    for (const { id, group } of groups) {
      if (raycaster.intersectObject(group, true).length) return id;
    }
    // table bed: ray ∩ y=0 plane inside the ACTIVE bed rect → play (or the
    // practice claim stays card-only in S1 — contract §2 row 2)
    const dims = game.template?.system?.table;
    if (dims) {
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      if (Math.abs(d.y) > 1e-9) {
        const s = -o.y / d.y;
        if (s > 0) {
          const px = o.x + d.x * s, pz = o.z + d.z * s;
          if (Math.abs(px) <= dims.length / 2 && Math.abs(pz) <= dims.width / 2) {
            return 'play';
          }
        }
      }
    }
    // 44 pt coarse floor: inflate each prop's screen-projected bounds to at
    // least 44×44 CSS px and accept the nearest containing target
    let best = null, bestD = Infinity;
    for (const { id, group } of groups) {
      const box = new THREE.Box3().setFromObject(group);
      if (box.isEmpty()) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let unusable = false;
      for (let i = 0; i < 8 && !unusable; i++) {
        corner.set(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z);
        // any corner at/behind the camera plane poisons the projected bbox
        // (perspective divide flips sign — the garbage rect can swallow the
        // whole screen); the exact-raycast leg above still covers the prop
        corner.applyMatrix4(camera.matrixWorldInverse);
        if (corner.z > -0.01) { unusable = true; break; }
        corner.applyMatrix4(camera.projectionMatrix);
        const sx = r.left + (corner.x + 1) / 2 * r.width;
        const sy = r.top + (1 - corner.y) / 2 * r.height;
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      }
      if (unusable) continue;
      const padX = Math.max(0, (44 - (maxX - minX)) / 2) + 6;
      const padY = Math.max(0, (44 - (maxY - minY)) / 2) + 6;
      if (cx >= minX - padX && cx <= maxX + padX
        && cy >= minY - padY && cy <= maxY + padY) {
        const dcx = (minX + maxX) / 2 - cx, dcy = (minY + maxY) / 2 - cy;
        const d2 = dcx * dcx + dcy * dcy;
        if (d2 < bestD) { bestD = d2; best = id; }
      }
    }
    return best;
  }

  // ---- shell-open visual state (contract §7.1 — owner fix round 2026-08-14) --
  // While the shell is OPEN the hall must READ as a hall: two warm key
  // lights raise the +x cue-rack wall and the -z bench/scoreboard wall out
  // of darkness, the table's live lamp emitters dim slightly (the table
  // stops dominating the frame), and the gameplay-only visuals (cue rod
  // 'obCueStick', aim-line/ghost/preview family 'obAimPreview') hide.
  // Restore-exactness laws (gameplay lighting byte-untouched while closed):
  // - the key lights live on camera LAYER 1: the main camera enables the
  //   layer only while the shell is open; the env-probe cube cameras stay
  //   on layer 0 and NEVER collect them — a mid-open rebake cannot poison
  //   gameplay reflections by construction;
  // - the glare dim is pair-tracked {light, base} against the LIVE emitter
  //   set (room lightRefs.rectLights — lightingvisuals.js swaps the array
  //   contents on fixture changes) and re-seeds on every ob:settings
  //   commit, so a brightness/fixture edit through shell-fronted settings
  //   is adopted as the new base — never clobbered at exit; exit restores
  //   a pair only while the emitter still holds OUR write;
  // - main.js's rebakeEnv brackets EVERY cube bake through the
  //   window.__lampfade.suspendForBake seam — the shell wraps it while
  //   open so any mid-open bake sees the AUTHORED emitter levels and the
  //   gameplay visual visibilities (a stale lampfade.js without the seam
  //   degrades to the recorded mid-open-bake dim; never an error);
  // - close restores INSTANTLY everywhere (it rides the same frame as the
  //   instant exit camera cut); open ramps the state in over SHELL_RAMP_MS
  //   unless reduced-motion or a scripted obshell boot (deterministic
  //   first frames for fixtures — the mover's own instant law).
  const SHELL_GLARE = 0.85;  // slight table-glare dim while open
  const SHELL_RAMP_MS = 450; // open-side ramp only; close is instant
  // warm wall keys (world coords — the props are FIXED room dressing per
  // the room.js placement law; values tuned against the boot pixel floors)
  const SHELL_KEYS = [
    { i: 44, pos: [2.0, 2.15, -0.5], tgt: [4.45, 0.35, -0.53], angle: 0.58, pen: 0.8 },
    { i: 34, pos: [1.35, 2.15, -0.7], tgt: [1.35, 0.45, -2.95], angle: 0.88, pen: 0.85 },
  ];
  const SHELL_KEY_COLOR = 0xffd2a0; // warm hall key (the fill-light family)
  const reducedMotion = () => {
    try {
      return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    } catch { return false; }
  };
  let lightGroup = null, keySpots = [];
  let glarePairs = []; // [{ l, base }] — our dims on the live emitters
  let glareK = 0;      // applied visual-state progress [0..1]
  let glareSig = null; // GH-970: rig signature at the last glareSeed
  // the rig room.js builds before the lighting leaf lands: the canopy at
  // brightness 1, untrimmed, no one-table gain
  const IDENTITY_SIG = JSON.stringify(['canopy_panel', 1, 1, 1]);
  /** GH-970: the __lighting.state() inputs that scale the emitters
   * (fixture, brightness, class key trim, one-table gain). The leaf not
   * landed yet (a returning boot opens the hall before it; its landing
   * fires ob:relight even when its boot apply is the identity no-op) reads
   * as the identity rig; a leaf without state() reads null. The auto flag
   * stays out: flipping it on the untouched identity rig rewrites nothing. */
  const lightingSig = () => {
    try {
      const L = window.__lighting;
      if (L === undefined) return IDENTITY_SIG;
      const s = L?.state?.();
      return s ? JSON.stringify([s.fixture, s.brightness, s.keyTrim, s.oneTableGain]) : null;
    } catch { return null; }
  };
  let camMaskSaved = null;
  let ramp = null;     // { t0 } while the open-side ramp runs
  let lfWrap = null;   // wrapped __lampfade.suspendForBake while open
  let cueRef = null, pgRef = null;
  // GH-967: the gameplay rod is aim.js's OWN live binding (__aim.cueGroup,
  // feature-detected). Every buildCue() group carries the 'obCueStick'
  // beacon name — cuepost.js's post-strike whip rod stays in the scene,
  // hidden, after the first live stroke, and an aim rebuildCue (cue or game
  // switch) appends the new gameplay rod AFTER it — so the first-match name
  // lookup resolved the whip rod: the hide list missed the real cue in the
  // hall and visualsOff re-showed the whip rod at its withdrawn pose. The
  // fallback (a stale aim.js without the seam) walks the same depth-first
  // order as getObjectByName but skips every rod another rig claims
  // (userData.obCueRole 'post' / 'strike').
  const isGameplayRod = (o) => o.name === 'obCueStick'
    && (o.userData?.obCueRole ?? 'aim') === 'aim';
  const findGameplayRod = (o) => {
    if (!o) return null;
    if (isGameplayRod(o)) return o;
    for (const c of o.children ?? []) {
      const hit = findGameplayRod(c);
      if (hit) return hit;
    }
    return null;
  };
  const cueGroup = () => {
    let live = null;
    try { live = window.__aim?.cueGroup?.() ?? null; } catch { live = null; }
    if (live) return live;
    if (!cueRef || !cueRef.parent) cueRef = findGameplayRod(scene);
    return cueRef; // re-resolve after equipment rebuilds (parent nulled)
  };
  const previewGroup = () => {
    if (!pgRef || !pgRef.parent) pgRef = scene?.getObjectByName?.('obAimPreview') ?? null;
    return pgRef;
  };
  // aim-assist families (review visual-audit round 2 P1: the BIH kitchen
  // tint + head-string boundary read as gameplay chrome over the hall):
  // aim.js re-asserts their visibility on aiming frames, so the same
  // hide-wins-the-frame law applies; restore is aim.js's own next-frame
  // re-assert (frame hooks run before render — no wrong frame ever paints)
  const ASSIST_NAMES = ['obAimZone', 'obAimSnap', 'obAimRest', 'obAimCall'];
  const assistRefs = new Map();
  const assistGroups = () => {
    const out = [];
    for (const n of ASSIST_NAMES) {
      let g = assistRefs.get(n);
      if (!g || !g.parent) {
        g = scene?.getObjectByName?.(n) ?? null;
        if (g) assistRefs.set(n, g);
      }
      if (g) out.push(g);
    }
    return out;
  };
  function hideGameplayVisuals() {
    // per-frame re-assert: aim.js writes cue.group.visible every frame and
    // this module's frame hook registers AFTER aim's, so the hide wins the
    // frame; preview.js never writes its group node, so the hide holds.
    const cue = cueGroup();
    if (cue && cue.visible) cue.visible = false;
    const pg = previewGroup();
    if (pg && pg.visible) pg.visible = false;
    for (const g of assistGroups()) {
      if (g.visible) g.visible = false;
    }
  }
  function applyGlare(k) {
    glareK = k;
    for (const p of glarePairs) {
      p.l.intensity = p.base * (1 - (1 - SHELL_GLARE) * k);
    }
  }
  function applyVisual(k) {
    for (let i = 0; i < keySpots.length; i++) {
      keySpots[i].intensity = SHELL_KEYS[i].i * k;
    }
    applyGlare(k);
  }
  /** Seed/adopt the emitter dim pairs. `rebase` = commit-provenance force
   * (review fix-round review r2 P2): a lighting apply that lands EXACTLY on
   * the current dimmed value (brightness 1.0 → 0.85 collides with our
   * ×0.85 to float precision) is invisible to the numeric heuristic — the
   * lighting-provenance paths (fixture/brightness/look commits, the
   * ob:relight wire) rewrite EVERY active emitter before we run, so they
   * force-adopt the live values as the new bases. */
  function glareSeed(rebase = false) {
    const live = (() => {
      try { return roomMod.activeRoom?.instance?.lightRefs?.rectLights ?? []; }
      catch { return []; }
    })();
    // GH-970: a lighting commit only rewrites the emitters when the rig
    // VALUES move — __lighting.apply() no-ops an unchanged fixture +
    // brightness (the atelier's Keep after a live preview, a re-tapped
    // fixture, a slider jiggle inside the 1.0 detent) while settings still
    // broadcasts, and the leaf's boot landing fires ob:relight after a
    // returning boot already opened the hall. Forcing the re-base on those
    // adopted OUR dimmed value as the base (exit then restored 0.85^n). The
    // rig signature disambiguates the one case the numeric test cannot
    // see — a rewrite landing exactly on our dim (brightness 1.0 → 0.85,
    // review r2 P2): adopt when the emitter left our write OR the rig
    // moved since the last reconcile. A stale lighting leaf without
    // state() keeps the forced re-base on provenance keys.
    const sig = lightingSig();
    const rigMoved = sig === null ? rebase : glareSig !== null && sig !== glareSig;
    glareSig = sig;
    const next = [];
    for (const l of live) {
      const prev = glarePairs.find((p) => p.l === l);
      if (prev) {
        const expected = prev.base * (1 - (1 - SHELL_GLARE) * glareK);
        // a foreign rewrite since our write (brightness/fixture commit)
        // owns the value — adopt it as the new base
        if (rigMoved || Math.abs(l.intensity - expected) > 1e-6) {
          prev.base = l.intensity;
        }
        next.push(prev);
      } else {
        next.push({ l, base: l.intensity });
      }
    }
    for (const p of glarePairs) {
      if (!next.includes(p)) p.l.intensity = p.base; // torn-down emitters
    }
    glarePairs = next;
    applyGlare(glareK);
  }
  /** Bake bracket: authored emitter levels + gameplay visibilities for the
   * duration of a cube bake; returns the undo (re-applies the shell state). */
  function bakeSuspend() {
    // adopt-first (review fix-round review P2): a look/lighting apply can
    // rewrite the emitters and rebake SYNCHRONOUSLY before its ob:settings
    // broadcast (main.js applyLook) — restoring stale bases here would
    // overwrite the foreign write and the later reseed would never see it.
    // glareSeed adopts foreign values as the new base (and tracks any
    // swapped emitter set) before we present authored levels for the bake.
    glareSeed();
    for (const p of glarePairs) p.l.intensity = p.base;
    const cue = cueGroup(), pg = previewGroup();
    const cueWas = cue?.visible, pgWas = pg?.visible;
    if (cue) cue.visible = machine.is('AIM', 'BALL_IN_HAND'); // aim.js's law
    if (pg) pg.visible = true;
    return () => {
      applyGlare(glareK);
      if (cue) cue.visible = cueWas;
      if (pg) pg.visible = pgWas;
    };
  }
  function wrapBake() {
    const lf = window.__lampfade;
    if (!lf?.suspendForBake || lfWrap) return;
    const orig = lf.suspendForBake;
    lfWrap = { lf, orig };
    lf.suspendForBake = (...a) => {
      const undo = bakeSuspend();
      const r = orig(...a);
      return () => { r?.(); undo(); };
    };
  }
  function unwrapBake() {
    if (lfWrap) { lfWrap.lf.suspendForBake = lfWrap.orig; lfWrap = null; }
  }
  // GH-910: the key group's build + scene join, split out of visualsOn so
  // main.js can warm the keys' program variants inside its GH-785 hold
  // (the hallKeys handle, boot split below). Idempotent: builds once, joins
  // if unparented; intensities stay as built (0 on a closed shell); never
  // touches the camera mask, glare, bake or DOM.
  function buildKeys() {
    if (lightGroup) return;
    lightGroup = new THREE.Group();
    lightGroup.name = 'obShellLight';
    keySpots = SHELL_KEYS.map((k) => {
      const s = new THREE.SpotLight(SHELL_KEY_COLOR, 0, 0, k.angle, k.pen, 2);
      s.position.set(...k.pos);
      s.target.position.set(...k.tgt);
      s.layers.set(1); // bake-immune: cube cams collect layer 0 only
      lightGroup.add(s, s.target);
      return s;
    });
  }
  function joinKeys() {
    if (!scene || !camera) return;
    buildKeys();
    if (!lightGroup.parent) scene.add(lightGroup);
  }
  // GH-910: the handle's removal — the group leaves ONLY while the shell is
  // closed (an open shell keeps its keys, §7.1); nothing else moves (the
  // intensities are already 0 on a closed shell, camMaskSaved is the open
  // state's own register)
  function leaveKeys() {
    if (!open && !keysCovered && lightGroup?.parent) lightGroup.parent.remove(lightGroup);
  }
  // #1202: the keys' light-set change (the group in or out of the scene,
  // camera layer 1 on or restored) goes through main.js's window.__obStage
  // when main publishes it: main compiles the next draw set ahead and applies
  // the change once its programs have linked or its bound has passed, and
  // the loop keeps rendering meanwhile instead of holding for the re-key.
  // Without the seam the change applies at once (the pre-#1202 path). On its
  // first apply a change records what it moves (the group's parent, the
  // camera mask, the open state's saved mask) and revert puts exactly that
  // back; both are synchronous and idempotent. Intensities, glare, the bake
  // wrap and the hides never ride it: the close zeroes the keys at once, so
  // nothing they light outlives the exit frame (the atelier float, the only
  // other layer-1 node, leaves in the exit's onShellExit before this runs).
  let keysPending = 0;  // changes handed to the seam, not settled yet
  let keysStage = null; // the last landing: 'direct' (no seam) or lightSet's
  let keysGen = 0;
  // #1202 build 21: true from a covered FRESH boot's pre-join (below) until
  // the fade-start open adopts the keys or a refusal there takes them out
  let keysCovered = false;
  let keysChanges = 0; // light-set changes handed over (seam or direct)
  // #1202 batch 2 (maintainer records dbed84ae, cb904a26): no keys change lands
  // inside cinelight's studio window (window.__cinelight, set by
  // installCineLight() before the export's first frame and cleared as
  // revert()'s first act). One the seam lands there moves nothing and parks,
  // and that submission stays inert from then on: when it parked at its
  // compile pass, main compiled the unchanged light set for it. In the
  // microtask after cinelight's revert restored its rig, the newest parked
  // change goes to the seam again, so it compiles and lands after the window,
  // as it would have with no export. A change handed over since supersedes it
  // (the seam keeps order). With the window closed this is one read of the
  // flag per landing.
  let keysParked = null; // { on, why, gen } of the newest change parked in a window
  function stageKeys(on, why = on ? 'shell:hall-keys-join' : 'shell:hall-keys-leave') {
    if (!scene || !camera) return;
    keysChanges += 1;
    let pre = null;
    const apply = () => {
      if (pre === null) {
        pre = { parent: lightGroup?.parent ?? null, mask: camera.layers.mask, saved: camMaskSaved };
      }
      if (on) {
        joinKeys();
        if (camMaskSaved === null) camMaskSaved = camera.layers.mask;
        camera.layers.enable(1);
      } else {
        if (lightGroup?.parent) lightGroup.parent.remove(lightGroup);
        if (camMaskSaved !== null) {
          camera.layers.mask = camMaskSaved;
          camMaskSaved = null;
        }
      }
    };
    const revert = () => {
      if (pre === null) return;
      if (lightGroup && lightGroup.parent !== pre.parent) {
        lightGroup.parent?.remove(lightGroup);
        pre.parent?.add(lightGroup);
      }
      camera.layers.mask = pre.mask;
      camMaskSaved = pre.saved;
      pre = null;
    };
    const seam = window.__obStage;
    if (typeof seam?.lightSet !== 'function') {
      apply();
      keysStage = 'direct';
      return;
    }
    const gen = ++keysGen;
    // the seam's landing (its compile pass, then the real apply): inside the
    // studio window it parks instead, and revert finds nothing to put back;
    // once parked, this submission's later landings (its real apply after the
    // window) move nothing, and the change handed over again lands instead
    let parked = false;
    const land = () => {
      if (parked) return;
      if (window.__cinelight === true) {
        parked = true;
        if (keysParked === null || keysParked.gen <= gen) keysParked = { on, why, gen };
        return;
      }
      apply();
    };
    keysPending += 1;
    let done;
    try {
      done = seam.lightSet({ apply: land, revert, why });
    } catch { land(); done = 'threw'; } // a throwing seam never strands it
    // v1 always resolves; a rejection still lands the latest change
    Promise.resolve(done).then((r) => { keysStage = String(r); },
      () => { if (gen === keysGen) land(); keysStage = 'rejected'; })
      .finally(() => { keysPending -= 1; });
  }
  // the window's close: cinelight's revert announces it BEFORE it restores
  // its rig, so the parked change goes back to the seam in a microtask, after
  // that synchronous restore (gi.js resumes its room the same way)
  window.addEventListener('ob:cinelight', () => {
    if (window.__cinelight === true || keysParked === null) return;
    queueMicrotask(() => {
      const p = keysParked;
      if (window.__cinelight === true || p === null) return;
      keysParked = null;
      if (p.gen === keysGen) stageKeys(p.on, p.why);
    });
  });
  // #1202 build 21 (covered boot): a FRESH boot whose entry is allowed joins
  // the keys, dark (intensity 0), while #ob-boot is still opaque. Main applies
  // the change at once there and draws it before it lets the fade start, so
  // the variants the opening flight draws have already been drawn once out of
  // sight (a cold first draw after the fade froze 2.6 s in the #1202 v3d
  // campaign). The fade-start open then adopts the joined keys and only ramps
  // their intensity, which re-keys nothing.
  function prejoinKeys() {
    if (!scene || !camera) return;
    buildKeys();
    stageKeys(true, 'shell:hall-keys-prejoin');
    keysCovered = true;
  }
  // #1202 build 21 (review P1 on PR-A, maintainer ruling c3ba6da8): the covered
  // FRESH arrival releases the overlay only after a delivered frame drew the
  // pre-joined keys and a GPU fence behind that frame signalled. main's warm
  // tick draws them for a shell that lands inside its hold, but a shell that
  // lands after the hold capped (ready already true) gets no warm tick: main
  // ignores the handle, and releasing at once let the fade start before the
  // keys' first draw. 'frame' is emitted right before main's render, so the
  // first 'frame' with the keys joined and no change pending precedes a
  // render that draws them; a fence put at the next 'frame' sits behind that
  // render. The fence is read once per frame (getSyncParameter never
  // blocks). Without a WebGL 2 context or fences the drawn frame alone
  // releases it ('drawn'). KEYS_DRAW_CAP_MS bounds the wait in visible time
  // (keysDrawClock below), so a hidden tab (no frames, and no fade either) or
  // one long synchronous draw cannot spend it.
  // Every outcome releases the arrival. The record is visualState().keysDraw.
  const KEYS_DRAW_CAP_MS = 8000;
  // >>> keys-draw visible clock (lifted verbatim by web/tools/test-keysdraw-clock.mjs: keep it self-contained — it may
  // reach only its arguments)
  // The budget KEYS_DRAW_CAP_MS spends: visible time only. tick(t, visible)
  // runs on a 250 ms clock and charges the gap since the mark, clamped to
  // 1 s (one long synchronous draw adds at most 1 s), when the mark and the
  // tick both saw the document visible. vis(t, visible) runs on every
  // visibilitychange and charges nothing: a hide's time is uncertain (a
  // synchronous draw can hold its delivery: review P1 on 62a1db8a), and a
  // return's gap was hidden. Both move the mark and its visibility to now.
  // So a hidden interval never reaches the budget, however long its timers
  // stood still, in either order of a tab's return: Blink dispatches
  // visibilitychange with the state change, but WebKit (Safari, the app's
  // WKWebView) queues it, so an overdue tick can read 'visible' first (review
  // P2 on 24c194cb). Under-charging only makes the cap later. seenVisible is
  // the visibility at t0. Each call returns true once the budget is spent.
  const keysDrawClock = (capMs, t0, seenVisible) => {
    let spent = 0;
    let mark = t0;
    let markVisible = seenVisible === true;
    const step = (t, visible) => {
      if (visible && markVisible) spent += Math.min(1000, Math.max(0, t - mark));
      mark = t;
      markVisible = visible;
      return spent >= capMs;
    };
    return {
      tick: (t, visible) => step(t, visible),
      vis: (t, visible) => { mark = t; markVisible = visible; return spent >= capMs; },
      spent: () => spent,
    };
  };
  // <<< keys-draw visible clock
  let keysDraw = null;
  function keysDrawn() {
    const rec = keysDraw = { at: Math.round(performance.now()), drawnAt: null, fenceAt: null, fencedAt: null,
      how: 'waiting', spentMs: 0 };
    if (!scene || !camera) { rec.how = 'no-scene'; return Promise.resolve(); }
    return new Promise((resolve) => {
      let step = 'join';
      let gl = null;
      let fence = null;
      let off = null;
      let clock = null;
      let onVis = null;
      const visible = () => document.visibilityState === 'visible';
      const budget = keysDrawClock(KEYS_DRAW_CAP_MS, performance.now(), visible());
      const finish = (how) => {
        if (step === 'done') return;
        step = 'done';
        rec.how = how;
        rec.spentMs = Math.round(budget.spent());
        clearInterval(clock);
        if (onVis) document.removeEventListener('visibilitychange', onVis);
        if (fence) { try { gl.deleteSync(fence); } catch { /* gone with its context */ } fence = null; }
        if (typeof off === 'function') off();
        resolve();
      };
      onVis = () => { if (budget.vis(performance.now(), visible())) finish('capped'); };
      document.addEventListener('visibilitychange', onVis);
      clock = setInterval(() => { if (budget.tick(performance.now(), visible())) finish('capped'); }, 250);
      off = machine.on('frame', () => {
        if (step === 'done') return;
        const now = Math.round(performance.now());
        if (step === 'join') {
          // this step's render draws them
          if (keysPending === 0 && !!lightGroup?.parent && camera.layers.isEnabled(1)) {
            step = 'draw';
            rec.drawnAt = now;
          }
          return;
        }
        if (step === 'draw') {
          // that render is behind us now: the fence goes behind it
          try {
            gl = sceneCanvas()?.getContext('webgl2') ?? null;
            fence = gl && typeof gl.fenceSync === 'function'
              ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
            if (fence) gl.flush();
          } catch { fence = null; }
          if (!fence) { finish('drawn'); return; }
          rec.fenceAt = now;
          step = 'fence';
          return;
        }
        let st = null;
        try { st = gl.getSyncParameter(fence, gl.SYNC_STATUS); } catch { /* an invalid status below */ }
        if (st === gl.SIGNALED) { rec.fencedAt = now; finish('fenced'); }
        else if (st !== gl.UNSIGNALED) finish('lost'); // a lost or restored context retired it
      });
    });
  }
  function visualsOn({ instant = false } = {}) {
    if (!scene || !camera) return;
    buildKeys(); // the ramp below writes the spots before a staged join lands
    // a covered boot's pre-join already landed: no second change, so the
    // seam compiles nothing in the fade-start task (keysStage keeps the
    // pre-join's landing)
    const adopted = keysCovered && !!lightGroup.parent && camera.layers.isEnabled(1);
    keysCovered = false;
    if (!adopted) stageKeys(true);
    glarePairs = [];
    glareK = 0;
    glareSeed();
    wrapBake();
    if (instant) { ramp = null; applyVisual(1); }
    else { ramp = { t0: performance.now() }; applyVisual(0); }
    hideGameplayVisuals();
  }
  // ---- boot cover (§9 deviation 6, with the app.html shell-arrival hold) --
  // A FRESH arrival opens at the overlay's fade-start, but the overlay only
  // holds its fade (bounded) until THIS module lands — the cover is what it
  // waits for: gameplay chrome hidden + HUD inert the moment createShell
  // runs, so no fade frame can expose the pre-shell gameplay scene. The
  // cover carries no glare and no camera move (those ride openShell's ramp
  // under the thinning fade); since #1202 build 21 it carries the keys'
  // dark pre-join (prejoinKeys above). A fade-start entry refusal lifts it
  // (uncoverBoot — the silent-degrade boot shows today's table, deviation
  // 2) and takes the dark keys out again.
  let cover = false;
  function coverBoot() {
    cover = true;
    document.body.classList.add('ob-shell-open');
    hudInert(true);
    hideGameplayVisuals();
  }
  function uncoverBoot() {
    if (!cover) return;
    cover = false;
    if (keysCovered) { keysCovered = false; stageKeys(false, 'shell:hall-keys-uncover'); } // already dark
    document.body.classList.remove('ob-shell-open');
    hudInert(false);
    const pg = previewGroup();
    if (pg) pg.visible = true;
    const cue = cueGroup();
    if (cue) cue.visible = machine.is('AIM', 'BALL_IN_HAND');
  }
  /** Release the boot-overlay shell-arrival hold (§9 dev 6). The shell-open
   * reveal branches (fresh/returning) ALSO wait — bounded — for the
   * lampfade leaf: its own dynamic import can land after this module, and
   * until it runs the canopy renders AUTHORED-opaque over the hall pose
   * (review visual-audit round 2 P1: a reduced-motion boot showed ~117 ms of
   * the lamp blocking the frame before lampfade's first-update snap).
   * lampfade's first update snaps (fade === null), so presence is enough.
   * GH-715: the overlay driver holds UNBOUNDED while the arrival is
   * pending (its HOLD-law registers are the only caps), so every branch
   * MUST reach this resolution — the 700 ms lampfade wait is the one
   * bound left on this side. */
  const arrivalDone = (waitLampfade = false) => {
    const t0 = performance.now();
    const tick = () => {
      if (!waitLampfade || window.__lampfade
        || performance.now() - t0 > 700) {
        try { window.__obShellArrival = 'done'; } catch { /* ok */ }
        return;
      }
      setTimeout(tick, 40);
    };
    tick();
  };

  function visualsOff() {
    ramp = null;
    if (keySpots.length) for (const s of keySpots) s.intensity = 0;
    stageKeys(false); // the group's leave + the mask restore (#1202)
    for (const p of glarePairs) {
      const ours = p.base * (1 - (1 - SHELL_GLARE) * glareK);
      if (Math.abs(p.l.intensity - ours) < 1e-6) p.l.intensity = p.base;
    }
    glarePairs = [];
    glareK = 0;
    unwrapBake();
    const pg = previewGroup();
    if (pg) pg.visible = true; // children encode the real preview state
    const cue = cueGroup();
    if (cue) cue.visible = machine.is('AIM', 'BALL_IN_HAND'); // aim re-asserts next frame
  }

  // ---- in-shell decision prompt (GH-541; shell.md §9 deviation 10) -----------
  // While the shell is open and a rules decision pends, the shell carries an
  // ANSWERABLE prompt (title + chooser + the option buttons) resolving
  // through the shipped window.__rules.decide(kind, choice) seam — the hud
  // decision dialog stands down for the duration (the [data-ob-layer] cover
  // + the html.ob-shell-open crit rule) and re-presents on exit. Choice
  // lists mirror hud.js DECISION_CHOICES — the frozen share-codec wire
  // enums (the aim.js EXPLICIT_DECISION_CHOICES mirrored-literal law);
  // change them together. An UNKNOWN kind falls back to the pre-amendment
  // §9 dev 3 yield (state-preserving exitToTable — the hud dialog, which
  // may know the kind, presents at the table): fail-safe, never a dead
  // un-answerable prompt under shell ownership.
  const SHELL_DECISION_CHOICES = {
    dry_break: [1, 2, 3], eight_legal_break: [1, 2], eight_foul_break: [1, 2],
    break_foul: [1, 2], stalemate: [1],
    break_pocket: [1, 2], stalemate_lag: [1, 2],
    break_spot: [1, 2],
    play_again: [1, 2], respotted_black_toss: [1, 2],
    break_violation: [1, 2],
    pushout_response: [1, 2], wrongful_pot: [1, 2],
    foul_and_a_miss: [1, 2, 3],
    illegal_break: [1, 2, 3], heyball_break_foul: [1, 2, 3],
    eight_break_pot: [1, 2], eight_break_foul: [1, 2, 3],
    break_miscue: [1, 2],
  };
  // the heyball projection signature — duplicated BY HAND from aim.js /
  // hud.js isHeyballMs (the SETTINGS_KEY duplicated-literal law); the
  // heyball 'break_foul' KIND collides with the 8-ball kind name and rides
  // the 'heyball_break_foul' UI alias for title/opt keys while decide()
  // gets the REAL kind (the GH-491 alias law).
  const isHeyballMs = (ms) => !!ms && typeof ms === 'object'
    && typeof ms.kitchenBih === 'boolean' && typeof ms.openClaim === 'boolean'
    && typeof ms.phase === 'string';
  let decPromptEl = null, decPromptSig = '';
  // GH-712 (S4 journey QA round 3): the prompt's yield signal for BODY-level
  // place content. The atelier's showroom card rail (#ob-atelier-rail,
  // atelier.js — a body-level fixed element, not a #ob-shell descendant)
  // lived in exactly the 90..221 band the GH-698 equipment placement gave
  // the phone prompt; a card-centre tap answered the decision. While the
  // prompt is mounted the ROOT carries html.ob-shell-decision-up (the
  // html.ob-shell-open twin) and --ob-shell-decision-bottom = the prompt's
  // measured bottom edge (viewport px, ResizeObserver-maintained — wrap,
  // locale and lock-face re-renders change its height), so a body-level
  // consumer can yield below it (atelier.css's coarse rail rule). The
  // prompt's own placement is unchanged (#698 law).
  let decPromptRo = null;
  // hoisted (a function declaration): presentPlace above republishes the
  // edge on every place change (GH-712 review r1 P2)
  function publishDecisionBottom() {
    if (!decPromptEl) return;
    const b = decPromptEl.getBoundingClientRect().bottom;
    document.documentElement.style.setProperty(
      '--ob-shell-decision-bottom', Math.ceil(b) + 'px');
  }
  // GH-712 review r1 P2: viewport changes (resize / orientation) move the
  // prompt without resizing it (the top offsets are viewport-anchored) —
  // listened only while a prompt is mounted, from the LIVE rect
  const onDecViewport = () => publishDecisionBottom();
  function clearDecisionPrompt() {
    if (!decPromptEl) return;
    const hadFocus = decPromptEl.contains(document.activeElement);
    decPromptRo?.disconnect();
    decPromptRo = null;
    window.removeEventListener('resize', onDecViewport);
    window.removeEventListener('orientationchange', onDecViewport);
    decPromptEl.remove();
    // the routed phone rule's quick-play yield ends with the prompt
    root.classList.remove('ob-shell-decision-up');
    scheduleBands(); // B-K05: the stack returns (transitionend re-reads too)
    // GH-712: the root twin + the measured bottom edge end with the prompt
    document.documentElement.classList.remove('ob-shell-decision-up');
    document.documentElement.style.removeProperty('--ob-shell-decision-bottom');
    decPromptEl = null;
    decPromptSig = '';
    // keyboard repair: a resolution consumed the focused option — land on
    // quick-play (the shell's default action), never on <body>
    if (hadFocus && open) {
      try { qp.focus({ preventScroll: true }); } catch { /* ok */ }
    }
  }
  function syncDecisionPrompt() {
    let ms = null;
    try { ms = window.__rules?.matchState?.() ?? null; } catch { ms = null; }
    const pend = ms?.pendingDecision ?? null;
    if (!open || !pend || typeof pend.kind !== 'string'
      || typeof window.__rules?.decide !== 'function') {
      clearDecisionPrompt();
      return;
    }
    const uiKind = pend.kind === 'break_foul' && isHeyballMs(ms)
      ? 'heyball_break_foul' : pend.kind;
    const choices = SHELL_DECISION_CHOICES[uiKind];
    // GH-711 (S4 journey QA round 3): the rules lock. Under a shared replay
    // (a FINISHED one included — share.js keeps replay.active until the
    // viewer resolves it) flow.js's __rules.decide refuses every answer
    // (replayLocked), so the answer buttons were a DEAD prompt: enabled,
    // hit-testable, silently refused. The prompt renders its LOCKED face
    // instead — the question, no answers, one line of reason and ONE
    // primary "Continue from here" that resolves the replay KEEPING the
    // shared position (share.js's own GH-451 Continue path, never the
    // exit-and-rerack path), closes the hall and hands the decision to
    // the table's own hud dialog. Nothing in the hall discards the shared
    // position. An unknown kind under the lock keeps the locked face too
    // (the state-preserving yield below would run exitToTable's finished-
    // replay resolution — a fresh rack, the position gone).
    const locked = sharedReplayLocked();
    if (!choices && !locked) { clearDecisionPrompt(); exitToTable(); return; }
    // B-PL05 copy: the title is the QUESTION (decision.q.<kind>, <= 40 ch in
    // en) and the hint row is "who decides · the citation"
    // (decision.cite.<kind>); both has()-guarded so a stale locale
    // dictionary (cache-poison contract) falls back to the shared
    // decision.title.<kind> the table-register #hud-decision still reads.
    const qKey = hasLocal('decision.q.' + uiKind) ? 'decision.q.' + uiKind : 'decision.title.' + uiKind;
    const citeKey = 'decision.cite.' + uiKind;
    // sig carries the TRANSLATED title: locale flips re-render on the
    // next frame (the renderCarom signature idiom); the lock flag too —
    // the face flips the frame the lock resolves
    const sig = uiKind + '|' + pend.chooser + '|' + (locked ? 'L' : 'A')
      + '|' + t(qKey) + '|' + t('shell.decision.replayLocked');
    if (decPromptEl && sig === decPromptSig) return;
    if (!decPromptEl) {
      // GH-668 S5 slice 2 (B-PL05): the kit ROUTED prompt — kit.css owns
      // the box, the placement law and the R6 anatomy: h2 __title (the
      // question) / span __hint (caps: chooser · citation) / __actions
      // (equal NEUTRAL pills). `.osd-btns` stays as an ALIAS class on the
      // actions row: e2e-play.mjs (slice 3) pins
      // `#ob-shell-decision .osd-btns button` twelve times.
      decPromptEl = document.createElement('div');
      decPromptEl.id = 'ob-shell-decision';
      decPromptEl.className = 'ob-prompt ob-prompt--routed';
      // NON-modal by design: the table decision must never trap the shell's
      // keyboard (the hud dialog's modal law belongs to the table register;
      // here browsing stays free and the group announces politely)
      decPromptEl.setAttribute('role', 'group');
      decPromptEl.setAttribute('aria-labelledby', 'ob-shell-decision-title');
      decPromptEl.innerHTML =
        '<h2 class="ob-prompt__title" id="ob-shell-decision-title"></h2>'
        + '<span class="ob-prompt__hint"></span>'
        + '<div class="ob-prompt__actions osd-btns"></div>';
      root.appendChild(decPromptEl);
      // prompt-up marker (integrator-routed phone placement rule: the
      // quick-play stack yields at <= 700px coarse while this class rides
      // #ob-shell; the class carries no other behaviour)
      root.classList.add('ob-shell-decision-up');
      scheduleBands(); // B-K05: the stack yields
      // GH-712: the root twin + the measured bottom edge for body-level
      // consumers (feature-detected observer; a first publish either way)
      document.documentElement.classList.add('ob-shell-decision-up');
      if (typeof ResizeObserver === 'function') {
        decPromptRo = new ResizeObserver(publishDecisionBottom);
        decPromptRo.observe(decPromptEl);
      }
      window.addEventListener('resize', onDecViewport);
      window.addEventListener('orientationchange', onDecViewport);
    }
    decPromptSig = sig;
    decPromptEl.querySelector('.ob-prompt__title').textContent = t(qKey);
    const chooser = pend.chooser === 'both'
      ? t('decision.chooserBoth')
      : t('decision.chooser', { player: pend.chooser });
    const hintEl = decPromptEl.querySelector('.ob-prompt__hint');
    hintEl.textContent = chooser; // stale locale: chooser alone (review r1 P2)
    if (hasLocal(citeKey)) { // the citation keeps its case inside the caps hint (uiaudit GH-1013)
      const cite = document.createElement('span');
      cite.className = 'ob-cite';
      cite.textContent = t(citeKey);
      hintEl.append(' \u00b7 ', cite);
    }
    const realKind = pend.kind;
    const btns = decPromptEl.querySelector('.ob-prompt__actions');
    decPromptEl.querySelector('.osd-lock')?.remove();
    if (locked) {
      // GH-711 LOCKED face: the reason line is the kit's __body part
      // (.osd-lock alias: e2e-shell-qa3 reads it) + the one primary
      // (GH-451 copy) — the single action IS the focus target
      const why = document.createElement('div');
      why.className = 'ob-prompt__body osd-lock';
      why.textContent = t('shell.decision.replayLocked');
      btns.before(why);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ob-btn ob-btn--primary';
      b.dataset.ob = 'shell-decision-continue';
      b.setAttribute('data-ob-present-focus', '');
      b.textContent = t('share.continue');
      b.addEventListener('click', () => {
        if (!continueSharedReplay()) { note(t('shell.notice.replay')); return; }
        armTapShield(); // GH-713: the hall leaves under the finger
        exitToTable({ activated: true });
      });
      btns.replaceChildren(b);
    } else {
      btns.replaceChildren(
        ...choices.map((n, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          // R6: equal rule-mandated choices are equal NEUTRAL pills; the
          // first is the FOCUS target (the kit's focus-on-present anchor,
          // data-ob-present-focus — never the accent target). --primary only
          // when a kind names a default: none of the 20 kinds do.
          b.className = 'ob-btn';
          // wrapping degrade (review r1 P2): no kit auto-row law (failed or
          // stale leaf) → the row register outright; a PENDING leaf is belted
          // after mount (beltPendingOptions — measured, never left to a promise)
          if (controlsLeaf === null || (controlsLeaf && typeof controlsLeaf.armAutoRow !== 'function')) b.classList.add('ob-btn--row');
          if (i === 0) b.setAttribute('data-ob-present-focus', '');
          b.dataset.choice = String(n);
          b.textContent = t(`decision.opt.${uiKind}.${n}`);
          b.addEventListener('click', () => {
            try { window.__rules.decide(realKind, n); } catch { /* refused */ }
            armTapShield(); // GH-713: the prompt leaves under the finger
            syncDecisionPrompt(); // synchronous resolve read (e2e reads it)
          });
          return b;
        }));
    }
    if (controlsLeaf === undefined) beltPendingOptions(btns); // pending = degraded
    publishDecisionBottom(); // GH-712: the first edge, before any resize tick
  }

  // ---- shell ownership guards (frame + stateChange hooks) --------------------
  // scalar last-frame pose (allocation-free) — consumed by the D15
  // suppression re-assert below so a WIN-continuation rerack under an open
  // shell keeps the player's actual view (free orbit included)
  const lastPose = { tx: 0, ty: 0, tz: 0, radius: 0, theta: 0, phi: 0, fov: 40 };
  /** Copy the LIVE rig pose into lastPose (allocation-free). Called by the
   * frame hook AND — GH-679 — right after any gate `cutToEnd()` that cut:
   * a re-racking pick that runs in the SAME input task as the cut (Enter
   * on a focused rail card activates on keydown; a sub-frame mouse click)
   * has no frame between the cut and its fresh-rack AIM{seed} emission, so
   * the D15 re-assert below read the stale MID-FLIGHT pose and stranded the
   * camera there. The committed END pose is the pose the suppression must
   * keep. */
  function snapLastPose() {
    lastPose.tx = orbit.state.target.x;
    lastPose.ty = orbit.state.target.y;
    lastPose.tz = orbit.state.target.z;
    lastPose.radius = orbit.state.radius;
    lastPose.theta = orbit.state.theta;
    lastPose.phi = orbit.state.phi;
    lastPose.fov = camera.fov;
  }
  machine.on('frame', () => {
    if (!open) {
      // boot cover (§9 dev 6): keep the gameplay visuals hidden between
      // module land and the fade-start arrival (aim.js re-writes the cue's
      // visibility every frame)
      if (cover) hideGameplayVisuals();
      return;
    }
    // in-shell decision prompt (GH-541; supersedes the §9 dev 3 yield): a
    // rules decision that pends under an open shell — carried in from entry
    // (the amended FR-016(d)) or LANDING mid-open (the carom/heyball boot
    // chains raise theirs asynchronously after the rules registry import —
    // a boot arrival can lawfully precede them) — surfaces as the shell's
    // own answerable prompt; the hud dialog stands down for the duration.
    // Unknown kinds keep the old state-preserving yield (inside the sync).
    syncDecisionPrompt();
    if (!open) return; // the unknown-kind yield just exited
    // aim-view re-engage is blocked while the shell owns the camera (§3(7))
    if (window.__aim?.getAimView?.() === true) {
      try { window.__aim.setAimView(false); } catch { /* seam absent */ }
    }
    // shell-open visual state (§7.1): per-frame re-assert of the gameplay-
    // visual hides (aim.js re-writes the cue's visibility every frame; this
    // hook registers after aim's, so the hide wins the frame) + the
    // open-side ramp step. The bake-bracket wrap retries here: the lampfade
    // leaf is its own later dynamic import (main.js:716), so a fresh-boot
    // arrival can open BEFORE the seam exists.
    if (!lfWrap) wrapBake();
    hideGameplayVisuals();
    if (ramp) {
      const k = Math.min(1, (performance.now() - ramp.t0) / SHELL_RAMP_MS);
      applyVisual(k);
      if (k >= 1) ramp = null;
    }
    snapLastPose();
  });
  machine.on('stateChange', (next, prev, info) => {
    qpVerb(); // R16: the quick-play verb tracks shot / WIN transitions
    if (!open) return;
    // D15 composition law (coordinator ruling 1): main.js's fresh-rack
    // re-home (camHome) runs FIRST in registration order — while the shell
    // owns the camera the re-home is SUPPRESSED by re-asserting the shell's
    // own last-frame pose in the same synchronous emission (no frame ever
    // renders the re-homed pose). Honored again at every AIM entry via the
    // exit path's restoreGameplayPose.
    if (next === 'AIM' && info?.seed !== undefined && !mover.moving()) {
      mover.applyPose(lastPose);
    }
  });

  // ---- settings-fronting cards: SHOW-THEN-OPEN (review r2 law) ----------------
  // Theater dim (owner ruling 2026-08-15 — contract §7.1 material note): a
  // card expansion dims the live scene behind the chrome via the CSS-only
  // body.ob-shell-theater overlay (shell.css; never a renderer change).
  // The modal's open state rides #ob-gear[aria-expanded] (015 §2 law); the
  // watch lives only while the theater does and clears on collapse, on a
  // gear that never opens (decision-locked), and on every shell exit.
  let theaterTimer = null;
  function theaterClear() {
    if (theaterTimer) { clearInterval(theaterTimer); theaterTimer = null; }
    document.body.classList.remove('ob-shell-theater');
  }
  function theaterWatch() {
    theaterClear();
    document.body.classList.add('ob-shell-theater');
    const expanded = () => document.getElementById('ob-gear')
      ?.getAttribute('aria-expanded') === 'true';
    // sample NOW (review review r1 P2): the gear click opens the modal
    // synchronously, so an immediate Escape can land BEFORE the first
    // poll — without this seed the collapse branch never fires and the
    // vignette overstays to the failsafe
    let seenOpen = expanded();
    theaterTimer = setInterval(() => {
      if (expanded()) seenOpen = true;
      else if (seenOpen) theaterClear(); // modal collapsed → dim off
    }, 150);
    const tt = theaterTimer; // failsafe: refused/never-opened gear
    setTimeout(() => { if (!seenOpen && theaterTimer === tt) theaterClear(); },
      2000);
  }
  function showThenOpen(sectionId) {
    if (sectionId) window.__settings?.show?.(sectionId); // pose only — §3 law
    // GH-534 G2 (round-2 QA): the poisoned-atelier degrade — the show()
    // above just landed the shim's HONEST RELOAD HINT (its predicate:
    // shell open at equipment with __atelier absent; settings.js r2
    // branch). A gear click here would open the modal at 'game' (the
    // equipment pane migrated to the atelier in S2) ON TOP of the hint —
    // the wrong destination, burying the remedy the same click it
    // appears. Skip the modal + theater on exactly that branch (only
    // reachable on the degrade: healthy mounts hide the stub action).
    if (sectionId === 'equipment' && open && active === 'equipment'
      && typeof window.__atelier === 'undefined') {
      return;
    }
    // feature 034 (525 S4a-mig, protocol R1 — the ONLY 034a-mig hunk here):
    // the `play` twin. The S1 play stub's action still calls
    // showThenOpen('game') — the `game` origin is what tells the poisoned
    // stub from the rail gear's showThenOpen(null) (review round 3 P2-1).
    // On the degrade rung (shell open at play, play.js never published
    // `window.__play` — it does so only inside its stylesheet-gated
    // mount(), so the css-failed rung reads poisoned too) the settings shim
    // just landed the HUD hint, which shell.js:247 hides while the shell is
    // open — surface the SAME key through the shell notice and skip the
    // gear + theater: no modal opens on top of the remedy.
    if (sectionId === 'game' && open && active === 'play'
      && typeof window.__play === 'undefined') {
      note('shell.place.play.shim.stale');
      return;
    }
    // the same dialog.js opener path the gear uses (settings.js gear click);
    // the gear itself enforces the decision-lock — semantics untouched
    document.getElementById('ob-gear')?.click();
    theaterWatch();
  }

  // ---- boot split (§4; research R6) ------------------------------------------
  function waitOverlayHandoff() {
    return new Promise((resolve) => {
      const el = document.getElementById('ob-boot');
      if (!el) { resolve(); return; }
      // hand off at FADE-START (`ob-boot--out`), not removal: the 0.6 s
      // fade is translucent, and waiting for removal exposed the naked
      // gameplay HUD between fade-end and shell-open (review visual audit
      // round-2 P0, 08-boot-settle-phone 1.25-1.75 s). Opening under the
      // overlay's own cover means the first uncovered frame is already
      // the shell. Reduced-motion overlays remove instantly (no fade) —
      // the childList leg resolves there.
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        mo.disconnect();
        resolve();
      };
      const check = () => {
        const boot = document.getElementById('ob-boot');
        if (!boot || boot.classList.contains('ob-boot--out')) finish();
      };
      const mo = new MutationObserver(check);
      mo.observe(document.body, { childList: true });
      mo.observe(el, { attributes: true, attributeFilter: ['class'] });
      setTimeout(finish, 35000); // failsafe echo (the overlay's own 30 s)
      check();
    });
  }
  // GH-910 hall-key handle: main.js's GH-785 hold warms the keys' programs
  // behind #ob-boot, so the first open normally finds them compiled (a
  // capped or ?obholdlight boot compiles them there as before; a material
  // dispose after the warm that evicts a variant recompiles that variant
  // there). Handed ONCE, synchronously, on every non-scripted branch below:
  // { join, remove } where the shell is closed at the first frame
  // (STRAIGHT-TO-AIM, refused at boot, FRESH refused at createShell — when
  // main warms, it joins, draws once with layer 1 enabled and removes before
  // the first delivered frame), { open: true } after RETURNING's synchronous
  // openShell (visualsOn already joined + lit the keys with layer 1 on:
  // nothing to join or remove), and { open: true, join, remove } after a
  // covered FRESH boot's dark pre-join (#1202 build 21: the warm draw takes
  // the keys as they stand; main keeps join/remove for its hall-other
  // compile once an exit has taken them out). Guarded: a main.js without the
  // parameter, or a throwing callback, never breaks the split.
  let keysHanded = false;
  const handKeys = (h) => {
    if (keysHanded || typeof hallKeys !== 'function') return;
    keysHanded = true;
    try { hallKeys(h); } catch { /* main's callback never breaks the boot split */ }
  };
  const keyHandle = { join: joinKeys, remove: leaveKeys };
  let bootClass = 'blocked'; // e2e classification readout (__shell.state)
  if (scriptedStamp && obshell) {
    // SCRIPTED SHELL (ruling 3): deterministic instant pose for fixtures
    bootClass = 'scripted-shell';
    openShell({ autoFocus: false }); // boot open: no script focus (ring)
    arrivalDone();
  } else if (stored === null) {
    // FRESH: hall arrival after the #ob-boot handoff (never before ready —
    // the handoff follows ready; GH-910: createShell normally runs inside
    // the GH-785 hold — without ?obholdlight, ready waits for its hall-key
    // handle unless the HOLD_CAP_TICKS cap released the loop first). Entry
    // refusal at boot (e.g. a rules decision waiting at the break address)
    // degrades to today's boot silently — the notice register is for
    // user-initiated entries; the shell stays one pill away.
    // Boot cover FIRST (§9 dev 6): the overlay held its fade for this
    // module — cover the gameplay chrome before releasing the hold, so
    // the fade can never expose the pre-shell scene; a refusal at the
    // fade-start arm lifts the cover (silent degrade, deviation 2).
    bootClass = 'fresh';
    if (entryAllowed()) {
      coverBoot();
      prejoinKeys(); // #1202 build 21: dark keys under the opaque overlay
      // the warm tick draws them as they stand, like RETURNING; join/remove
      // stay on the handle for main's hall-other compile after an exit
      handKeys({ open: true, join: joinKeys, remove: leaveKeys });
      // the arrival waits for a covered draw with them, fenced (keysDrawn)
      keysDrawn().then(() => arrivalDone(true));
    } else {
      handKeys(keyHandle); // GH-910: refused at boot, warmed and removed
      arrivalDone(true);
    }
    waitOverlayHandoff().then(() => {
      if (entryAllowed()) {
        openShell({ animate: true, place: 'play', autoFocus: false });
      } else uncoverBoot();
    });
  } else if (startAtTable) {
    // STRAIGHT-TO-AIM: today's boot, byte-for-byte after the first delivered
    // frame (the hall-key warm tick runs inside the hold, GH-910); the pill
    // is the way in.
    bootClass = 'table';
    handKeys(keyHandle);
    arrivalDone();
  } else if (entryAllowed()) {
    // RETURNING: instant pose at the PLAY place, no settle move. Owner
    // ruling 2026-08-15 (contract §4): the returning opening pose is ALWAYS
    // Play — home is the table; equipment/replays are errands and never
    // become a boot pose. stored.lastPlace is navigation memory only (§5),
    // never a boot-read.
    bootClass = 'returning';
    openShell({ place: 'play', bootPose: true, autoFocus: false });
    handKeys({ open: true }); // GH-910: after openShell — no join, no removal
    arrivalDone(true);
  } else {
    // refused at boot: today's boot is the reveal, byte-for-byte after the
    // first delivered frame (the hall-key warm tick runs inside the hold,
    // GH-910)
    handKeys(keyHandle);
    arrivalDone();
  }

  // ---- test/deep-link surface (§6 — the __settings grammar) ------------------
  window.__shell = {
    /** Navigate (open) or pose for next open (closed); no-op-on-unknown,
     * returns the active place id. */
    go: (id) => {
      if (!PLACE_IDS.includes(id)) return active;
      if (open) return goTo(id);
      pendingPose = id;
      active = id;
      return active;
    },
    place: () => active,
    /** Pose-assertion hook: the LIVE orbit tuple (+fov). */
    pose: () => {
      const p = mover.pose();
      return { target: [p.tx, p.ty, p.tz], radius: p.radius,
        theta: p.theta, phi: p.phi, fov: p.fov };
    },
    // additive e2e hooks (contract §6; read-only except quickPlay/openShell,
    // which ride the exact user paths)
    registry: () => PLACES.map((p) => ({ id: p.id, anchor: anchorOf(p.id) })),
    isOpen: () => open,
    moving: () => mover.moving(),
    propAt: (x, y) => (open ? propPlaceAt(x, y) : null),
    quickPlay: () => quickPlay(),
    openShell: (o) => openShell(o || {}),
    state: () => ({ open, active, arrived, boot: bootClass,
      stored: stored ? { ...stored } : null }),
    /** GH-668 B-K05 shell seam (additive, read-only): the LIVE band
     * geometry modules dock to — rail / quickPlay rects (null while the
     * shell is closed or the stack yields), reserve {bottom,right} px,
     * bandT {top,height,right}, stacked. Same truth as the five
     * --ob-shell-* custom properties on #ob-shell / :root. */
    bands: () => bands(),
    /** GH-525 arrival laws readout (additive, read-only): which content
     * imports have started/settled, which modules mounted or degraded,
     * and the arrival hold in flight (place id or null). */
    contentState: () => ({
      started: [...contentReady.keys()], settled: [...contentSettled],
      mounted: [...content.keys()], degraded: [...contentDegraded],
      ready: [...contentReadyDone], // handles whose `ready` settled (LAW 2)
      hold: hold?.id ?? null,
      // audit r2 finding 1: the shell's OWN paint-truth verdict per mounted
      // place (the arrival-hold release predicate, read-only)
      painted: [...content.keys()].filter((id) => contentPainted(id)) }),
    /** §7.1 shell-open visual state readout (additive, read-only). */
    visualState: () => ({
      keys: lightGroup?.parent ? keySpots.length : 0,
      keyIntensities: keySpots.map((s) => s.intensity),
      glare: glarePairs.map((p) => ({ base: p.base, now: p.l.intensity })),
      glareK,
      ramping: !!ramp,
      camLayer1: (camera.layers.mask & 2) !== 0,
      cueHidden: cueGroup() ? cueGroup().visible === false : null,
      previewHidden: previewGroup() ? previewGroup().visible === false : null,
      bakeWrapped: !!lfWrap,
      // #1202: the keys' light-set changes still unsettled at main's seam,
      // and how the last one landed ('direct' without the seam)
      keysPending,
      keysStage,
      // #1202 batch 2: the change parked inside a studio window ('join' or
      // 'leave'), handed to the seam again once the window closes
      keysParked: keysParked ? (keysParked.on ? 'join' : 'leave') : null,
      // #1202 build 21: a covered FRESH boot's dark pre-join, not yet adopted
      // by the fade-start open (or taken out by a refusal there), and the
      // count of the keys' light-set changes (an adopting open adds none)
      keysCovered,
      keysChanges,
      // the covered arrival's draw record (keysDrawn): when the keys stood
      // joined at a 'frame' (drawnAt), when the fence went behind that
      // render (fenceAt) and signalled (fencedAt), how it ended, and the
      // visible-time budget it spent (spentMs, set at the end)
      keysDraw: keysDraw ? { ...keysDraw } : null,
    }),
  };

  console.log('[shell] ready (031 S1)');
  return { openShell, quickPlay, goTo };
}
