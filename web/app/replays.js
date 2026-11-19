// Copyright (c) Meta Platforms, Inc. and affiliates.

// replays.js — the replays PLACE content module (feature 035, program 525
// S4; sub-slice 035a). Contract of record:
// the replays contract (feature 035, internal) (content sub-registry §2 —
// the REGISTRY constant below is its code truth; chrome DOM + __replays
// surface §3; content laws §4).
//
// ALTITUDE LAW: the latest-session body, the session rail and the launch
// are CONTENT of the S1 `replays` place — never places, never a player.
// The frozen shell contract (the shell contract (feature 031, internal)) is
// inherited by reference: the place makes NO camera/orbit/mover writes in
// 035a (contract §4 law 2), entry states and input isolation are the
// shell's (§7), and the place changes NO boot shape (§4 — default scripted
// boots never construct the shell, so they never construct this).
//
// Reached ONLY via the R0 generic host in shell.js: ONE row in
// CONTENT_MODULES → mountContent('replays') performs the guarded dynamic
// import at the place's FIRST arrival (cache-poison contract: an absent /
// stale module leaves the S1 stub card standing — `shell.card.replaysOpen`
// → exitToTable(); __playback.open()). Do NOT add this module to any static
// import graph.
//
// Launcher, never a player (contract §4 law 1): the DVR is reached through
// `window.__playback` (feature-detected per call — the `arch()` idiom of
// playback.js), never imported, so an old playback.js and a new replays.js
// pair coherently (plan §4.5 degrade ladder: rung 3 = no `mountList` seam →
// latest body from `__archive` meta alone, rail never mounted; rung 3' = no
// `__playback` at all → read-only body, `Open latest` hidden, the card
// primary raises `shell.place.replays.notice.noPlayer`).
//
// One row renderer (contract §4 law 3): `.ob-pb-row` markup is produced
// ONLY by playback.js — the rail is a `__playback.mountList` HOST (variant
// 'rail', controls off, tier-keyed cap, lazy markers); this module owns the
// roving tab stop OVER those rows and never builds one.
//
// Static import: ONLY ./i18n.js (plan §4.1 packaging law 1). The kit motion
// leaf is reached by a guarded dynamic import (press() on activation; a
// failed import is the instant register).
import { t, has, getLocale, onLocaleChange, applyDom } from './i18n.js';

// ui/replays.css version — bump on EVERY change to that sheet (?v= law;
// protocol R8 — the SHELL_CSS_V three-digit idiom).
const REPLAYS_CSS_V = '018';

// Content sub-registry (contract §2 — FROZEN ids, order). 035b parts are
// present from 035a as `mounted: false` so e2e can assert the ladder
// without a contract bump.
const REGISTRY_IDS = ['latest', 'rail', 'clips', 'export'];

// D7 tier row caps for the rail (contract §4 law 13; spec R-22).
const RAIL_CAP = 24;
const RAIL_CAP_LOW = 12;

// roving keys handled in-container (contract §4 law 8; R0's gateKeyDown
// exempts exactly these + Enter/Space for KEY_GATE_EXEMPT containers)
const ROVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

// ---- archive SNAPSHOT (module level; GH-525 integrator 2026-09-05, combined
// review visual audit r3 finding 1). The arrival paint is SYNCHRONOUS from
// this snapshot when it is FRESH; otherwise the first sweep awaits the read
// and the card stays in its PENDING register (no empty sentence, no rail)
// under the shell's LAW 2 hold (`ready`). Freshness = the hall-open EPOCH:
// the archive changes only through play, outside the hall, so a snapshot
// read while the hall is open stays true until `onShellExit` (which bumps
// the epoch); a seam-driven mutation while open (e2e `__test.shoot`) is
// caught by the revalidation every sweep runs behind its synchronous paint
// (re-render only on a signature change — the existing law). The shell's
// LAW 1 prefetch hook calls `prefetch()` once the module import settles;
// both seams stay feature-detected per call — a DVR / archive that publishes
// after the prefetch gets ONE bounded retry when it appears. --------------
const archSnap = {
  metas: null,      // the archive index, newest first (null = never read)
  summary: null,    // the DVR summary of metas[0] (null = meta-only / none)
  summaryId: null,  // …the id that summary belongs to
  marks: null,      // the DVR's own `.ob-pb-marks` node for metas[0] (G2 seam; null = degrade)
  fresh: false,     // read inside the CURRENT hall-open epoch
  inflight: null,   // the ONE read in flight (joined, never doubled)
};
let hallEpoch = 0; // bumped by onShellExit: play may have changed the archive
/** The snapshot goes STALE: a hall exit (play may change the archive) or a
 * locale change (the DVR summary's strings are composed at read time). */
function invalidateSnapshot() { hallEpoch += 1; archSnap.fresh = false; }
/** A read that is guaranteed to START after now (a forced sweep re-reads the
 * seams as they are NOW — never joins a read begun before the caller's change). */
function rereadSnapshot() {
  const cur = archSnap.inflight;
  if (!cur) return readSnapshot();
  return cur.then(() => readSnapshot(), () => readSnapshot());
}
const snapListeners = new Set(); // factory hooks: a settled read → repaint on change
const seamsUp = () => !!window.__archive && !!window.__playback;
let seamRetry = 0; // bounded late-seam retry budget (ONE retry per appearance)
function readSnapshot() {
  if (archSnap.inflight) return archSnap.inflight;
  const epoch = hallEpoch;
  archSnap.inflight = (async () => {
    const a = window.__archive;
    let metas = [];
    try {
      if (a && a.enabled?.() !== false && typeof a.sessions === 'function') {
        metas = (await a.sessions()) ?? [];
      }
    } catch { metas = []; }
    const newest = metas[0] ?? null;
    const p = window.__playback;
    let summary = null;
    let marks = null;
    if (newest && typeof p?.sessionSummary === 'function') {
      // GH-668 S5 B-RP03: the row renderer's OWN marks node rides the same
      // read as the summary (one snapshot → one synchronous paint); an old
      // DVR without `marks` leaves null → the card paints text faces.
      // vfix1 (verifier P3): ONE archive read per session per snapshot —
      // the summary's own record (`detail`, ADDITIVE) is handed to `marks`;
      // an older DVR without it falls back to the id (its own read).
      const sm = await p.sessionSummary(newest.id).catch(() => null);
      const mk = (sm && typeof p.marks === 'function')
        ? await p.marks(sm.detail && typeof sm.detail === 'object' ? sm.detail : newest.id).catch(() => null)
        : null;
      summary = sm;
      marks = mk instanceof Element ? mk : null;
    }
    archSnap.metas = metas;
    archSnap.summary = summary;
    archSnap.marks = marks;
    archSnap.summaryId = newest?.id ?? null;
    archSnap.fresh = epoch === hallEpoch;
    return archSnap;
  })();
  const done = () => {
    archSnap.inflight = null;
    for (const fn of snapListeners) { try { fn(); } catch { /* factory's */ } }
    // a seam that published AFTER this read (feature-detected loading
    // order): retry once when it appears (bounded poll, idle-paced)
    if (!seamsUp() && seamRetry < 1) {
      seamRetry += 1;
      let tries = 0;
      const poll = () => {
        if (seamsUp()) { readSnapshot(); return; }
        if (++tries < 40) setTimeout(poll, 250);
      };
      setTimeout(poll, 250);
    }
  };
  archSnap.inflight.then(done, done);
  return archSnap.inflight;
}
// ---- stylesheet (?v= leaf law; the ATELIER_CSS_V idiom) — module level so
// the LAW 1 prefetch links it in idle time: the probe of the r3 fix found
// the FIRST arrival's frame 0 painted with the sheet still in flight (rail
// unstyled at the body's end, card 10 px taller) and the whole card only at
// frame 1; a sweep never paints before the sheet settled (load OR error —
// a failed sheet degrades paint truth exactly as before, never blocks). ---
let sheetPromise = null;
let sheetSettled = false;
function ensureSheet() {
  if (sheetPromise) return sheetPromise;
  sheetPromise = new Promise((res) => {
    const settle = () => { sheetSettled = true; res(true); };
    const href = new URL(`./ui/replays.css?v=${REPLAYS_CSS_V}`, import.meta.url).href;
    let link = document.getElementById('ob-replays-css');
    // #811: the shell's boot-idle preload (#ob-replays-css-pre) is adopted under
    // this id when it carries this module's href, loaded or loading; another
    // href (a stale shell's older ?v=) is unlinked
    const pre = link ? null : document.getElementById('ob-replays-css-pre');
    if (pre && pre.href === href) { pre.id = 'ob-replays-css'; link = pre; } else pre?.remove();
    if (link?.sheet) { settle(); return; }
    if (!link) {
      link = document.createElement('link');
      link.id = 'ob-replays-css';
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
    link.addEventListener('load', settle, { once: true });
    link.addEventListener('error', settle, { once: true });
  });
  return sheetPromise;
}
/** LAW 1 prefetch hook (shell.js): link the sheet + pre-read the archive
 * index and the latest session's summary into the snapshot, in idle time.
 * Idempotent per read. */
export function prefetch() {
  ensureSheet();
  return readSnapshot().catch(() => archSnap);
}

export function createReplays(ctx) {
  // ctx = shellCtx(section) (protocol R0(d)) — the UNION every content
  // module receives: { scene, camera, orbit, machine, game, mover, section,
  // bedScale, shell: { isOpen, place, goTo, exitToTable, instant,
  // decisionPending, notice, showThenOpen } }. Replays feature-detects
  // every member and touches no scene/camera/orbit/mover in 035a;
  // showThenOpen is 036's member and is ignored here.
  const section = ctx?.section ?? null;
  const shell = ctx?.shell ?? {};
  if (!section) return null;

  // ---- seams (feature-detected per call; never cached) ------------------
  const pb = () => window.__playback;
  const arch = () => window.__archive;
  const reducedMotion = () => {
    try {
      return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    } catch { return false; }
  };
  // kit motion leaf (press on activation) — guarded, optional
  let motion = null;
  // GH-668 S5 G7 fix 4 (the pack's REAL first arrival): the band's FIRST
  // show waits ONCE for this leaf to settle — bounded to 2 × --ob-t-med
  // — so a cold first read whose data lands before the import resolves
  // (a returning player with recordings, `archive=1`) still ENTERS through
  // the kit instead of the plain flip (the pack's rail sampler caught it
  // born at opacity 1, at rest — a pop; R3's cold path seeds AFTER the
  // import settles and never saw it). A rejected import (poison / absent
  // kit) settles at once → the plain flip; a hung one is cut off by the
  // budget (never block a band on a leaf — OWNERSHIP).
  let motionSettled = false;
  const motionP = import('./ui/motion.js').then((m) => { motion = m; }).catch(() => { motion = null; }).finally(() => { motionSettled = true; });
  // GH-668 S5 vfix1 (verifier P1): the wait is a GATE, not a one-shot
  // latch — the pre-fix `motionWaited` let the first show start the race
  // and return, and any SECOND syncRail() in the same birth task (setPlace
  // → refresh → the host's render callback) found the latch set with the
  // leaf still pending and took the plain flip: the real first arrival of
  // a returning player POPPED (the verifier's probe: `inert` then `hidden`
  // removed with no style write, 0.6 ms after the rail's birth). Now EVERY
  // show attempt defers while the leaf is pending, until the race settles
  // (import resolved / rejected, or the 400 ms budget spent) — ONE reveal
  // seam (syncRail), the plain flip ONLY for an absent / rejected leaf.
  let motionWaitStarted = false;
  let motionWaitOver = false;

  // ---- stylesheet: linked by the LAW 1 prefetch already (module level,
  // above); idempotent here for a factory reached without it -------------
  ensureSheet();

  // ---- healthy-mount takeover (plan §4.2 step 3; contract §4 law 4) -----
  // Every non-H2 S1 child retires EXCEPT the hold hint, which stays VISIBLE
  // and is re-keyed to the place's own verb (review round 2 P2: a hidden
  // node re-keyed is an instruction nobody reads). The shell's `relabel`
  // walk re-applies the swapped data-i18n key on locale change. R0(g)'s
  // generic host-class guard makes the S1 summaries tick return early for
  // `.ob-replays-host`, so no stub closure is edited by this lane.
  let hold = null;
  for (const child of [...section.children]) {
    if (child.tagName === 'H2') continue; // the place heading stays
    if (child.tagName === 'P' && child.classList.contains('ob-shell-hold')) {
      hold = child;
      continue;
    }
    // [hidden] alone cannot retire the S1 actions wrap: shell.css's own
    // `#ob-shell-cards .ob-shell-actions { display: flex }` outranks the
    // UA [hidden] rule (the GH-534 F1 ghost class; the equipment swapWrap
    // carries the same inline pair, shell.js S2.5 finding 5). Paint truth
    // rides an inline display pair from mount — found by the 035a capture
    // pack (contract §7 entry 19); replays.css carries the host belt rule.
    child.hidden = true;
    child.style.display = 'none';
  }
  if (hold) {
    hold.dataset.i18n = 'shell.place.replays.hold';
    hold.textContent = t('shell.place.replays.hold');
  }
  section.classList.add('ob-replays-host');

  // ---- chrome DOM (contract §3.1 — ALL present from mount; hidden
  // toggles). Inserted BEFORE the hold hint so the S1 order heading →
  // content → hint is kept. --------------------------------------------
  const latest = document.createElement('div');
  latest.id = 'ob-replays-latest';
  latest.hidden = true;
  // GH-668 S5 B-RP01 (ruling R15 "the card = the session"; contract §7
  // entry 36): the body is TWO lines under the place h2 — line 1 = day ·
  // game · mode (the control voice), line 2 = the newest row's own
  // when-line (`sessionSummary().when`) with its marks inline. The former
  // "LATEST SESSION" caps eyebrow (B-K13) is gone; its key names the body
  // as a group (`aria-label`, relabelOwn) and, on coarse pointers while
  // seeded, the body IS the tap target (syncTap below).
  const dayEl = document.createElement('div');
  dayEl.className = 'ob-replays-day';
  // GH-668 S5 replays r12 (review r7 P2-2): the three CONTENT nodes the coarse
  // tap target is NAMED by (aria-labelledby in reading order — syncTap)
  // carry ids; no paint keys on them (paint-free hooks, like .ob-replays-badge)
  dayEl.id = 'ob-replays-day';
  const metaEl = document.createElement('div');
  metaEl.className = 'ob-replays-meta';
  const whenEl = document.createElement('span'); // line 2's text (first child; no class by plan)
  whenEl.id = 'ob-replays-when';
  // the marks ride INSIDE line 2 as its second flex item: the row renderer's
  // OWN `.ob-pb-marks` node (`__playback.marks`, GH-668 S5 B-RP03 — one
  // marks renderer for the rows and the card; playback.css paints it, this
  // module never restyles it) or, under an old DVR without the seam, a bare
  // span of the summary's text faces (paintLatest)
  metaEl.append(whenEl);
  // GH-318 old-kernel badge = the kit part (B-K16 `.ob-badge--warn`); the
  // `.ob-replays-badge` name stays as a paint-free structure hook for the
  // owned suites / capture probes
  const badgeEl = document.createElement('span');
  badgeEl.className = 'ob-badge ob-badge--warn ob-replays-badge';
  badgeEl.id = 'ob-replays-badge';
  badgeEl.hidden = true;
  badgeEl.dataset.i18n = 'playback.oldKernel';
  badgeEl.textContent = t('playback.oldKernel');
  latest.append(dayEl, metaEl, badgeEl);
  latest.setAttribute('role', 'group');
  const actions = document.createElement('div');
  actions.id = 'ob-replays-actions';
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  // GH-668 B-K01 / B-RP01 (ruling R15): a DEFAULT kit pill — shrink-to-fit,
  // centred, one word; the kit auto-row law (ui/controls.js) flips it to
  // --row only if a locale's copy overflows the column (none of the 7 does).
  // Fine pointers only: the coarse sheet does not paint it (the body taps).
  openBtn.className = 'ob-btn';
  openBtn.id = 'ob-replays-open-latest'; // r12: the coarse tap target's aria-describedby source (its aria-label = the verb)
  openBtn.dataset.ob = 'replays-open-latest';
  openBtn.dataset.i18n = 'shell.place.replays.open';
  openBtn.textContent = t('shell.place.replays.open');
  openBtn.hidden = true;
  const emptyEl = document.createElement('p');
  emptyEl.className = 'ob-replays-empty';
  emptyEl.dataset.i18n = 'playback.empty';
  emptyEl.textContent = t('playback.empty');
  // PENDING register (audit r3 finding 1): the empty sentence is painted
  // ONLY by a sweep that KNOWS the archive is empty — never by the mount
  // (the pre-fix card painted "No recordings yet" for 3–5 frames at a
  // reduced-motion arrival while the first read was in flight)
  emptyEl.hidden = true;
  actions.append(openBtn, emptyEl);

  // 035b populates the export line; the selector is frozen from 035a
  // (contract §3.1; review round 4 P2) — EMPTY and hidden here.
  const exportEl = document.createElement('div');
  exportEl.id = 'ob-replays-export';
  exportEl.hidden = true;

  if (hold) section.insertBefore(latest, hold);
  else section.appendChild(latest);
  latest.after(actions);
  actions.after(exportEl);

  // ---- rail DOM (contract §3.1; plan §4.2 step 4): BODY level, created
  // ONCE, inserted BEFORE #ob-shell (F5 paint-order law) — the place's ONE
  // body-level band (contract §4 law 9b). The list is the mountList HOST;
  // strip / footer / clips are 035b placeholders (hidden, empty). --------
  const rail = document.createElement('div');
  rail.id = 'ob-replays-rail';
  rail.setAttribute('role', 'region');
  rail.hidden = true;
  rail.inert = true; // mirrors `hidden` (syncRail): a hidden or leaving band takes no input
  // the band's PAINTED title (GH-668 B-RP04 / RP:R-16; contract §7 entry
  // 39): the region's name, spoken ONCE — the region's aria-label already
  // names it to AT, so the painted row is aria-hidden (a second name would
  // double it). Voice = the kit .ob-caps group head (B-K13: caps = badges +
  // group heads only; the CJK arm is the kit's); ink = --ob-text-1, the G7
  // GROUND LAW for a caps / hint role on the 52 % smoke (ui/replays.css).
  // First child of the band = chrome the register budgets like every
  // non-list box (writeRegister: rail rect − list rect); the list stays
  // the scroller (scanAtoms' origin is the list's).
  const railTitle = document.createElement('div');
  railTitle.className = 'ob-replays-rail-title ob-caps';
  railTitle.dataset.i18n = 'shell.place.replays.rail.aria';
  railTitle.textContent = t('shell.place.replays.rail.aria');
  railTitle.setAttribute('aria-hidden', 'true');
  // GH-668 S5 replays r3 (review visual audit r1 F3, integrator ruling (b)):
  // the HEAD slot — the renderer puts the band's FIRST day label here
  // (`mountList` `head`, ADDITIVE; an old DVR ignores it and keeps the label
  // in the flow, the row-42 lattice-minimum law then stands): the group
  // label above the scrollport (the B-RP04 caps-role precedent), so the
  // list content starts ON a row (a filled slot owns the former sp-1 inset,
  // ui/replays.css: O = 0 ≤ 11.5, the row-42 proof) and a flush, top-clean
  // band height exists — at max the top edge lands in the inter-row gap,
  // no wash of the row above peeks under the fade. Band chrome: the
  // register budgets it like the title (rail rect − list rect); the label
  // node, its voice and its text are the renderer's (contract §4 law 3).
  const railDay = document.createElement('div');
  railDay.className = 'ob-replays-rail-day';
  const filtersEl = document.createElement('div');
  filtersEl.id = 'ob-replays-filters';
  filtersEl.hidden = true;
  const list = document.createElement('div');
  list.id = 'ob-replays-list';
  list.setAttribute('role', 'group'); // the renderer's rows are role=button
  // the filtered-empty sentence (rail visible, nothing to list under the
  // DVR's filter) — sibling of the host, since the renderer owns the
  // host's children
  const railEmpty = document.createElement('p');
  railEmpty.className = 'ob-replays-rail-empty';
  railEmpty.dataset.i18n = 'shell.place.replays.rail.empty';
  railEmpty.textContent = t('shell.place.replays.rail.empty');
  railEmpty.hidden = true;
  const footerEl = document.createElement('div');
  footerEl.id = 'ob-replays-footer';
  footerEl.hidden = true;
  const clipsEl = document.createElement('div');
  clipsEl.id = 'ob-replays-clips';
  clipsEl.hidden = true;
  rail.append(railTitle, filtersEl, railDay, list, railEmpty, footerEl, clipsEl);
  {
    const shellRoot = document.getElementById('ob-shell');
    if (shellRoot?.parentElement === document.body) document.body.insertBefore(rail, shellRoot);
    else document.body.appendChild(rail);
  }
  // ---- the kit scroll-edge fade (GH-534 r7 law — a truthful top / bottom
  // band only while content is clipped) on BOTH of the place's scrollers,
  // one guarded import; degrade = affordance-only:
  //  - the card body: the card's internal scrollport under the coarse STACK
  //    register (ui/replays.css, contract §7 entry 20), armed exactly as
  //    practice arms its card group; on desktop it never overflows (no
  //    scroll container), so no band ever paints there;
  //  - the band list (GH-668 B-K04 / B-K18, RP:R-12; contract §7 entry 38):
  //    block axis. Neither box owns paint (no background, no border), so
  //    the kit MASKS them (.ob-scrollfade--mask-y; reduced transparency =
  //    hairlines) instead of compositing a --ob-glass-solid band over the
  //    52 % smoke (the highlight stripe the critique read across the meta
  //    line). The fold law (installSettle / cleanStops, entry 24) is
  //    untouched: the mask paints the fold the settle already lands on.
  // GH-668 S5 G7 (the pack's coarse probe caught tabindex ABSENT on the en
  // phone still and PRESENT on de — write order): the kit fade decides
  // tab-stop OWNERSHIP once, at attach ("consumer-set wins" = a tabindex
  // already on the host), and a fade-owned host carries tabindex 0 ONLY
  // while it clips — so every fade update (a `hidden` flip on the badge, a
  // class toggle) stripped the 0 the coarse TAP register (syncTap:
  // role=button + tabindex 0) had just written. Under `pointer: coarse`
  // the body is a CONTROL and owns its stop: declared before the attach,
  // settled by syncTap in the same task (no paint between). Fine pointers:
  // the fade owns the stop as before (the kit law: a clipping body is the
  // keyboard's scroll stop) and syncTap never removes what it did not set.
  const coarseNow = () => { try { return window.matchMedia?.('(pointer: coarse)').matches === true; } catch { return false; } };
  let bodyStopOwned = false;
  import('./ui/scrollfade.js')
    .then((m) => {
      if (coarseNow()) { bodyStopOwned = true; latest.setAttribute('tabindex', '0'); }
      m.attachScrollFade?.(latest);
      m.attachScrollFade?.(list, { axis: 'block' });
      if (bodyStopOwned) syncTap();
    })
    .catch(() => { /* affordance-only degrade */ });

  // aria-labels are not data-i18n text: refreshed by relabelOwn() below
  const ARIA = [
    [openBtn, 'shell.place.replays.openLatest'],
    [rail, 'shell.place.replays.rail.aria'],
    [list, 'shell.place.replays.rail.aria'],
  ];
  const relabelOwn = () => {
    for (const [el, key] of ARIA) el.setAttribute('aria-label', t(key));
  };
  relabelOwn();

  // ---- D7 tier (contract §4 law 13; the shell.js glassGate idiom) --------
  // ONE readTier() helper: value-or-getter read of window.__obPerfTier,
  // re-read on its ob:perftier announce event; 'low' caps the rail rows at
  // RAIL_CAP_LOW (the 035b clips reuse this same helper — spec R-22).
  const readTier = () => {
    try {
      const v = window.__obPerfTier;
      const tier = typeof v === 'function' ? v() : v;
      return typeof tier === 'string' ? tier : null;
    } catch { return null; }
  };
  let tier = readTier();
  const railCap = () => (readTier() === 'low' ? RAIL_CAP_LOW : RAIL_CAP);
  window.addEventListener('ob:perftier', () => {
    const next = readTier();
    if (next === tier) return;
    tier = next;
    // the cap is a function the renderer re-reads per render (no re-mount)
    if (handle) handle.render();
  });

  // ---- state (session-only memory — contract §4 law 6) -------------------
  let latestId = null;
  let count = 0; // archive session count (last sweep)
  let railCount = 0; // rows the renderer painted into the host (last pass)
  let sig = null; // id+shot-count signature of the last COMPLETED paint
  let sweepGen = 0; // bumped on onShellExit: a stale sweep never paints
  // (review r1 PR #655 P2 — the signature is committed only by a LANDED
  // paint: `paintSweep` computes and commits it in ONE synchronous step, so
  // a sweep the exit made stale, which returns before painting, leaves the
  // register unclaimed and the same archive re-entered repaints)
  let atPlace = false;
  // LAW 2 `ready` (audit r3 finding 1): the FIRST sweep's settle — the shell
  // holds the arriving section on it (≤ its cap), so a cold-snapshot arrival
  // shows neither the empty sentence nor a bare heading while the read runs
  let readyResolve = null;
  const ready = new Promise((res) => { readyResolve = res; });
  const settleReady = () => { if (readyResolve) { readyResolve(); readyResolve = null; } };
  let handle = null; // the mountList handle (null = rung 3 / 3')
  let stopId = null; // data-sid of the ONE roving tab stop
  // String(id) → the archive's OWN key (IndexedDB keys are type-sensitive;
  // rows carry `data-sid` strings, seams/deep-links may pass either)
  let idIndex = new Map();
  let railRendering = false; // refresh()'s own render pass (onChange skips the re-derive)
  const degraded = { mountList: false, playback: false, strip: false, summary: false, marks: false };
  const mounted = { latest: true, rail: false, clips: false, export: false };

  // ---- latest-session body (contract §2 row 1) ----------------------------
  const nameOfGame = (gid) => (gid && has(`game.${gid}`) ? t(`game.${gid}`) : (gid ?? '—'));
  const modeOf = (m) => (m.drill ? 'practice'
    : m.playground || m.mode === 'playground' ? 'playground'
      : m.mode === 'practice' ? 'practice' : 'match');
  /** Meta-only summary for an old DVR without `sessionSummary` (rung 3):
   * day from Intl, count/mode from the index meta through the reused
   * playback.* keys — no glyphs, badge hidden (plan §4.5). */
  function metaSummary(m) {
    let day = '';
    try {
      day = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' })
        .format(new Date(m.startTs ?? m.id));
    } catch { day = ''; }
    const shots = m.shots ?? 0;
    const meta = t(shots === 1 && has('playback.rowMetaOne')
      ? 'playback.rowMetaOne' : 'playback.rowMeta', {
      min: Math.max(1, Math.round(((m.endTs ?? 0) - (m.startTs ?? 0)) / 60000)),
      shots,
    });
    const mode = modeOf(m);
    const modeText = mode === 'playground' ? t('playback.sub.playground')
      : mode === 'practice' ? t('playback.sub.practice', { game: nameOfGame(m.gameId) })
        : t('playback.sub.match');
    return { id: m.id, day, meta, title: '', mode: modeText, glyphs: [], stale: false };
  }
  /** Line 2's marks. `marks` = the DVR's own `.ob-pb-marks` node for this
   * session (`__playback.marks`, GH-668 S5 B-RP03 — the row renderer's
   * strip, appended as-is and never restyled); without it (an old DVR: the
   * mixed-cache rule's honest rung) the summary's glyph DATA renders as
   * PLAIN TEXT faces in line 2's own voice — `●` / `✕` / `✦` — no bespoke
   * glyph rules. */
  // GH-668 S5 replays r4 (review r2 P2, C4): the fallback's glyph list is
  // BOUNDED before the text is built — at the SAME cap the DVR's own row
  // strip uses (playback.js paintMarks: 24 glyphs, "strip stays one line"),
  // the marks vocabulary's one-line law; the G2 form's slice(0, 3) carried
  // no overflow count, so none is invented. Unbounded, a long session's
  // faces grew the desktop card past the viewport with no scroll path
  // (contract §7 row 50; e2e-replays V6).
  const FACES_CAP = 24;
  function paintMarksLine(s, marks) {
    for (const old of metaEl.querySelectorAll(':scope > :not(:first-child)')) old.remove();
    if (marks instanceof Element) { metaEl.appendChild(marks); return; }
    const glyphs = (s.glyphs ?? []).slice(0, FACES_CAP);
    const faces = glyphs.map((g) => (g.kind === 'pot' ? '\u25cf' : (g.glyph || '\u2726')));
    if (!faces.length) return;
    const span = document.createElement('span');
    span.setAttribute('aria-hidden', 'true');
    span.title = glyphs.map((g) => g.title).filter(Boolean).join(', ');
    span.textContent = faces.join(' ');
    metaEl.appendChild(span);
  }
  function paintLatest(s, marks = null) {
    if (!s) {
      latest.hidden = true;
      openBtn.hidden = true;
      emptyEl.hidden = false;
      syncTap();
      return;
    }
    // line 1: day · game · mode ("Today · 9-Ball · match" — B-RP01 R-04)
    dayEl.textContent = [s.day, s.title, s.mode].filter(Boolean).join(' · ');
    // line 2: the newest row's when-line (clock · duration · shots); an old
    // DVR without `when` keeps its `meta` text (no second voice invented)
    whenEl.textContent = s.when ?? s.meta ?? '';
    paintMarksLine(s, marks);
    badgeEl.hidden = !s.stale;
    latest.hidden = false;
    // Open latest needs a player that can open a session (rung 3' hides it)
    openBtn.hidden = typeof pb()?.openSession !== 'function';
    emptyEl.hidden = true;
    syncTap();
  }
  // ---- the coarse TAP TARGET (GH-668 S5 B-RP01, ruling R15; contract §7
  // entry 36). Under `pointer: coarse` the sheet paints neither the Open
  // pill nor the hold hint: the seeded body carries role=button + the
  // "Open latest session" name and a tap on it launches. The role sits on
  // the body while it does not overflow; a body that scrolls (a long de /
  // fr line under a short column) hands the role to line 1 instead (a
  // scroll container is not a button). Fine pointers: the body stays the
  // named group and NO click launches (arm 6's hold law, the A3 sample).
  // The shell's own hold treats a [role=button] as a control (HOLD_EXEMPT)
  // — the hold arms on the card chrome (h2 / padding), the tap is the
  // body's own path: hold + tap can never double-launch. -----------------
  let tapArmed = null; // the element carrying role=button, or null
  function syncTap() {
    const coarse = coarseNow();
    const seeded = coarse && !latest.hidden && latestId != null && typeof pb()?.openSession === 'function';
    const scrolls = seeded && latest.scrollHeight > latest.clientHeight + 0.5;
    const target = seeded ? (scrolls ? dayEl : latest) : null;
    // GH-668 S5 replays r12 (review r7 P2-2): the tap target's accessible
    // NAME is the card's CONTENT — line 1 (day · game · mode), line 2's
    // when-line and the old-kernel badge while it shows — through
    // aria-labelledby in reading order (the former explicit aria-label
    // replaced it with the verb: the session identity was lost, and the
    // overflowing variant lost line 1 as well). The verb rides the
    // DESCRIPTION: aria-describedby → the Open pill (its aria-label =
    // shell.place.replays.openLatest, kept current by relabelOwn; a directly
    // referenced node is read even where the coarse sheet does not paint it
    // — accname step 2A), so the action is still announced. Line 2's marks
    // strip is NOT a label source: its glyphs are named role=img nodes and
    // would enter the name. Both variants — arm R-A11Y-CARD (the COMPUTED
    // name + description over the CDP accessibility tree).
    const named = [dayEl.id, whenEl.id, ...(badgeEl.hidden ? [] : [badgeEl.id])].join(' ');
    for (const el of [latest, dayEl]) {
      if (el === target) {
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.removeAttribute('aria-label');
        el.setAttribute('aria-labelledby', named);
        el.setAttribute('aria-describedby', openBtn.id);
      } else if (el === latest) {
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', t('shell.place.replays.latest'));
        el.removeAttribute('aria-labelledby');
        el.removeAttribute('aria-describedby');
        // only a stop this register owns is removed — a fade-owned stop
        // (fine pointers, a clipping body) is the kit's to keep
        if (bodyStopOwned || tapArmed === latest) el.removeAttribute('tabindex');
      } else {
        el.removeAttribute('role');
        el.removeAttribute('tabindex');
        el.removeAttribute('aria-label');
        el.removeAttribute('aria-labelledby');
        el.removeAttribute('aria-describedby');
      }
    }
    tapArmed = target;
  }
  let pressAt = null; // the last pointerdown inside the body (slop guard)
  latest.addEventListener('pointerdown', (e) => { pressAt = { x: e.clientX, y: e.clientY }; }, { passive: true });
  const tapLaunch = () => {
    if (!tapArmed) return;
    try { motion?.press?.(tapArmed); } catch { /* instant register */ }
    openLatest();
  };
  latest.addEventListener('click', (e) => {
    if (!tapArmed) return;
    // a pan that ended inside the body is a scroll, not a tap (HOLD_SLOP)
    if ((e.detail ?? 0) > 0 && pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 8) return;
    tapLaunch();
  });
  // keyboard activation on keyUP: the shell's window-capture keydown gate
  // stops propagation inside the cards (native buttons keep their default
  // action; a role=button div needs its own path) — keyup is not gated
  latest.addEventListener('keyup', (e) => {
    if (!tapArmed || e.target !== tapArmed) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapLaunch(); }
  });
  // GH-668 S5 replays r7 (review r4 P2-1, the cache-poison contract's
  // FRESH-CSS + STALE-JS pairing — the ownership ledger mixed-freshness law): the
  // coarse sheet hides the Open pill + the hold hint ONLY under this marker,
  // written HERE where the body's tap + key handlers are wired. A cached
  // pre-tap replays.js never writes it, so a fresh replays.css keeps that
  // module's Open pill painted (its only launch path: click + Enter). Arm
  // X1 R-STALE-REPLAYS serves a module DERIVED without this line and the
  // arming (fixtures/replays-stale-pre-tap.mjs) and proves both faces.
  section.dataset.obTap = 'body'; // R-STALE-REPLAYS marker (replays.css coarse hides key on it)

  // ---- rail host (contract §3.2 mountList; plan §4.7) ---------------------
  /** Mount the list host ONCE the seam exists (the DVR may load after the
   * shell; an old DVR never has it — rung 3). */
  function ensureRail() {
    if (handle) return true;
    const p = pb();
    if (typeof p?.mountList !== 'function') return false;
    handle = p.mountList(list, {
      variant: 'rail',
      controls: false, // row 2b (per-row delete) is 035b — spec R-19
      limit: () => railCap(),
      markers: 'meta',
      head: railDay, // r3 F3: the first day label above the scrollport (row 44)
      onOpen: (id) => {
        const row = list.querySelector(`.ob-pb-row[data-sid="${CSS.escape(String(id))}"]`);
        if (row) { try { motion?.press?.(row); } catch { /* instant register */ } }
        return open(id);
      },
      onChange: ({ reason, count: n } = {}) => {
        railCount = n ?? list.querySelectorAll('.ob-pb-row').length;
        armStop();
        syncRail();
        // a mutation made in the retained modal (delete / purge) moves the
        // newest session under us — re-derive the latest body from the
        // archive (never a rail render here: refresh()'s own pass is what
        // fired this callback when railRendering is set)
        if (reason === 'mutation' && !railRendering) refresh({ force: true, rail: false });
      },
    }) ?? null;
    mounted.rail = !!handle;
    return !!handle;
  }
  /** Rail visibility = AT replays, a mounted host, a non-empty archive; the
   * filtered-empty sentence shows when the host painted nothing. Hidden
   * rows carry tabIndex −1 (no tab stop into a hidden band).
   *
   * GH-668 B-K22 / B-RP02 (RP:R-17; contract §7 entry 38): the band ENTERS
   * and EXITS through the kit mount law (ui/motion.js — the shell's own
   * presentPlace idiom). `mount` clears `hidden` SYNCHRONOUSLY, so every
   * `!rail.hidden` reader (scheduleRegister, armStop, state().railVisible,
   * the resize / bands listeners) stays truthful, and its first painted
   * frame is the hidden pose (opacity 0, 8 px low) on --ob-t-med; the
   * sweep runs in the arrival tick presentPlace enters the section with,
   * so the band enters WITH the card (a cold first read: when its data
   * lands — an honest enter, never a pop). Reduced motion = instant (kit);
   * an absent kit = the plain flip. The LEAVING band CUTS — the shell's own
   * leaving-card law (shell.js presentPlace): a kit exit keeps painting for
   * --ob-t-fast, and e2e-ui A3 reachability samples the frame 100 ms after
   * the flip — a fading band reads as controls covered by the canvas (or
   * covering the arriving card's under the coarse STACK); the mover's pan
   * covers the cut. `hidden`, `inert` and the rows' tab stop flip in ONE
   * call (a hidden band takes no tap, no focus; an enter still in flight
   * finishes unpainted and mount() continues from it on a re-show). */
  function syncRail() {
    const show = atPlace && !!handle && count > 0;
    if (show && rail.hidden && !motionSettled && !motionWaitOver) {
      if (!motionWaitStarted) {
        motionWaitStarted = true; // the first show starts the bounded race; every show attempt meanwhile defers to its settle
        Promise.race([motionP, new Promise((r) => setTimeout(r, 400))]).then(() => { motionWaitOver = true; syncRail(); }); // 2 × --ob-t-med: a loaded box's import; a healthy one settled long before
      }
      return;
    }
    if (show && rail.hidden) {
      rail.inert = false;
      try {
        if (typeof motion?.mount === 'function') Promise.resolve(motion.mount(rail)).catch(() => {});
        else rail.hidden = false;
      } catch { rail.hidden = false; }
      if (rail.hidden) rail.hidden = false; // the kit clears it synchronously; belt for a stale leaf
      armStop();
    } else if (!show && !rail.hidden) {
      rail.hidden = true; // the cut (above): state truth and paint in one call
      rail.inert = true;
      for (const r of list.querySelectorAll('.ob-pb-row')) r.tabIndex = -1;
    }
    railEmpty.hidden = !(show && railCount === 0);
    scheduleRegister();
  }
  /** P-12 + the coarse STACK register (Ta18; contract §3.1 phone register,
   * §7 entry 20). The CSS reads three custom properties this writes:
   * `--ob-replays-card-top` (the band's cap never rises above the measured
   * card top — desktop and phone), and under `pointer: coarse` only,
   * `--ob-replays-band-h` (the band's height budget) + `--ob-replays-card-cap`
   * (the host section's max-height) so the card and the band STACK inside
   * the card column instead of the card painting over the band (entry 18).
   * Derivation — every term a measured box or the shell's own offset:
   *   column  = viewport height − card top − the band's bottom offset (the
   *             computed `bottom`, i.e. 88 px + safe-area, never re-declared)
   *   cardNat = the section's laid-out height + its body's hidden overflow
   *   bandNat = the band's laid-out height + its list's hidden overflow
   *             (both cap-INVARIANT, so re-running converges in one pass)
   *   oneRow  = the band's chrome + the list content through the FIRST
   *             row's bottom (a day label may precede it) + list padding
   *   band    = max(oneRow, min(bandNat, column − cardNat − gap, 38.5vh))
   *   card    = column − band − gap
   *   snap    = when the body is capped, its clip edge lands on the
   *             LARGEST block boundary among its children (day / meta /
   *             markers / badge) that fits in its budget PLUS whatever the
   *             band holds beyond one full row (entry 24: a whole body
   *             block outranks a peek that shows no whole line); the band
   *             takes everything else within its caps and its own clip
   *             edge then lands on a clean text-line / block boundary
   *             (lineSnap — never a cut glyph, entry 24); the remainder
   *             stays as breathing between the card and the band: gap =
   *             8 px + remainder, remainder < the tallest body block pitch
   *             + the tallest list block pitch (entries 22 / 24 — the gap
   *             is variable by design)
   * The band always shows one full tappable row; the card takes the rest
   * and its body scrolls when the column is short. Triggered on every
   * syncRail (show / render / relabel), resize, body-content resize and
   * font load — every trigger QUEUES the derivation into the next animation
   * frame (`scheduleRegister`, the kit scrollfade `queue` idiom): ONE write
   * per frame, never from inside an observer callback, and a re-derivation
   * within 0.5 px of the last applied split writes nothing (entry 22).
   * Desktop / hidden band: the budgets are removed (CSS fallbacks). */
  const GAP_PX = 8; // --ob-sp-2 — the breathing between the card and the band
  // GH-668 S5 replays r3 (audit r1 F2 / D-G1-3 restated, contract §7 row 45):
  // the band's viewport cap = 38.5vh — the smallest HALF-vh that holds TWO
  // whole rows at 667×375 with a margin (the two-row need is 143.78 px in
  // every locale; 38vh = 142.50 sat 1.28 px short, 38.4vh = 144.00 would
  // clear it by 0.22 px only — a device text-metric hair — 38.5vh = 144.375
  // clears by 0.60; the session card body keeps its 44 px floor, the safe
  // areas and the shell rail stay whole at 667 and 844 — arm V2 / P). ONE
  // number with ui/replays.css `max-height: min(38.5vh, …)` (the CSS chain
  // resolves it; this is the register's own copy of the same term).
  const BAND_CAP_VH = 0.385;
  const setProp = (el, name, value) => {
    if (value == null) { if (el.style.getPropertyValue(name)) el.style.removeProperty(name); return; }
    if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
  };
  // the last split APPLIED (entry 22 re-entrancy guard): a re-derivation
  // within 0.5 px of it is a no-op — no write, no layout, no observer pass
  let applied = { band: NaN, cap: NaN, padList: NaN, padBody: NaN };
  // GH-668 G5 (B-RP04): the painted title's coarse drop record (state().title)
  let titleDrop = { shown: true, dropped: false, needWith: NaN, needWithout: NaN, avail: NaN };
  // the measured END PADS applied to the two scrollports (entry 24, both
  // edges): padding-bottom px that makes scrollTop = max a clean top edge
  // (null = the port does not overflow: the sheet's own end padding stands;
  // a number = the register OWNS padding-bottom, 0 = flush — audit r1 F3)
  const pads = { list: null, body: null };
  const padOf = (key) => pads[key] ?? 0;
  // audit r1 F3: the band record the arms read (state().band) — the pre-snap
  // budget the joint choice judged, the height chosen, its floor, and the
  // end residual the lattice minimum came to (0 = flush)
  let bandRec = { budget: NaN, band: NaN, floor: NaN, residual: NaN, flush: null };
  let settleOn = true; // the red-prove switch (__replays.settleEnabled)
  function writeRegister() {
    const cards = document.getElementById('ob-shell-cards');
    if (!cards) return;
    const top = Math.max(0, Math.round(cards.getBoundingClientRect().top));
    setProp(rail, '--ob-replays-card-top', `${top}px`);
    setProp(section, '--ob-replays-card-top', `${top}px`);
    let coarse = false;
    try { coarse = window.matchMedia?.('(pointer: coarse)').matches === true; } catch { coarse = false; }
    if (!coarse || rail.hidden || !section.getClientRects().length) {
      setProp(section, '--ob-replays-card-cap', null);
      setProp(rail, '--ob-replays-band-h', null);
      railTitle.hidden = false; // the drop below is the coarse register's only
      titleDrop = { shown: true, dropped: false, needWith: NaN, needWithout: NaN, avail: NaN };
      applied = { band: NaN, cap: NaN, padList: NaN, padBody: NaN };
      bandRec = { budget: NaN, band: NaN, floor: NaN, residual: NaN, flush: null };
      // the desktop list may still overflow its rail: its end pad stays
      // measured (the settle law is register-agnostic); the body's goes
      writeEndPads(true);
      syncTap();
      return;
    }
    // the band's bottom offset = the COMPUTED `bottom` (ui/replays.css
    // coarse block: max(the 88 px + safe-area floor, 100vh − the shell's
    // published `--ob-shell-rail-top` + sp-3) — the B-K05 seam, one number
    // for CSS and JS; never re-declared here)
    const bottomOff = parseFloat(getComputedStyle(rail).bottom) || 88;
    const column = window.innerHeight - top - bottomOff;
    // natural heights WITHOUT the end pads (the pad is padding-bottom, so
    // scrollHeight − pad is exact): the register stays cap-invariant, the
    // pad never counts as content, the 0.5 px guard converges in one pass
    const cardNat = section.offsetHeight + Math.max(0, latest.scrollHeight - padOf('body') - latest.clientHeight);
    // borders, safe-area padding, siblings (the painted title, the empty
    // sentence) — from the rects (fractional), so a band budget lands its
    // scrollport edge exactly (entry 24)
    const measureBand = () => {
      const bandNat = rail.offsetHeight + Math.max(0, list.scrollHeight - padOf('list') - list.clientHeight);
      const listRect = list.getBoundingClientRect();
      const chrome = rail.getBoundingClientRect().height - listRect.height;
      const listOrigin = listRect.top + list.clientTop - list.scrollTop; // content y = viewport y − origin
      const rows = list.querySelectorAll('.ob-pb-row');
      const firstRow = rows[0] ?? null, second = rows[1] ?? null;
      const padB = parseFloat(getComputedStyle(list).paddingBottom) || 0;
      let oneRow = chrome + 44;
      let through = 0; // the first row's bottom in list-content coordinates
      if (firstRow) {
        through = firstRow.getBoundingClientRect().bottom - listOrigin;
        oneRow = chrome + through + padB;
      }
      // the band height that shows the SECOND row whole at rest (scrollTop
      // 0: chrome + its content bottom — the end pad is a scroll-end
      // affordance, not rest content; Infinity: one row)
      const two = second ? chrome + (second.getBoundingClientRect().bottom - listOrigin) : Infinity;
      return { bandNat, chrome, listOrigin, firstRow, through, oneRow, two, second };
    };
    // GH-668 G5 (B-RP04, contract §7 entry 39): the painted title is the
    // FIRST thing the coarse register drops — it stays only while the band
    // still holds TWO whole rows with it inside the budget (38.5 vh, the
    // column, the card's leftover). Measured with the title shown, decided,
    // re-measured — inside this one write, so nothing paints in between;
    // the rule reads only the current geometry (no hysteresis).
    railTitle.hidden = false;
    const avail = Math.min(BAND_CAP_VH * window.innerHeight, column, column - cardNat - GAP_PX);
    const withTitle = measureBand();
    const dropped = !!withTitle.second && withTitle.two > avail + 0.5;
    let m = withTitle;
    if (dropped) { railTitle.hidden = true; m = measureBand(); }
    // the record the arms read: the two-row need with the title (and without
    // it once dropped) against the budget it was judged by
    titleDrop = { shown: !dropped, dropped, needWith: withTitle.two, needWithout: dropped ? m.two : NaN, avail };
    const { bandNat, chrome, listOrigin, firstRow, through, oneRow } = m;
    const bandCap = Math.min(bandNat, BAND_CAP_VH * window.innerHeight, column);
    let band = Math.min(column, Math.max(oneRow, Math.min(bandCap, column - cardNat - GAP_PX)));
    let cap = Math.max(0, column - band - GAP_PX);
    // block snap: the body's visible height ends on a child boundary. The
    // body may also take what the band holds BEYOND one full row (entry 24:
    // a peek that shows no whole line is worth nothing, a whole body block
    // is) — the band's floor is exactly one full row through the first
    // row's bottom, itself a clean boundary.
    const bodyNat = latest.scrollHeight - padOf('body');
    const cardChrome = cardNat - bodyNat; // heading, action, hint, paddings
    const bodyAvail = cap - cardChrome;
    if (bodyNat > bodyAvail + 0.5) {
      const bandMin = firstRow ? chrome + through : oneRow;
      const bodyMax = bodyAvail + Math.max(0, band - bandMin);
      let snap = 0;
      for (const ch of latest.children) {
        if (ch.hidden || !ch.getClientRects().length) continue;
        const b = ch.offsetTop + ch.offsetHeight;
        if (b <= bodyMax + 0.5) snap = Math.max(snap, b);
      }
      if (snap > 0) {
        // audit r1 F2: the body is the coarse tap target — its box never
        // goes under the kit coarse floor the sheet gives it (`min-height:
        // var(--ob-h-coarse)`, read back computed: one number for CSS and JS)
        const floorBody = parseFloat(getComputedStyle(latest).minHeight) || 0;
        cap = cardChrome + Math.max(snap, floorBody);
        // everything else is the band's (its peek of the next rows, within
        // its caps); the text-line snap below trims it to a clean boundary
        // and the remainder is the card ↔ band breathing (entry 22 gap law)
        band = Math.min(bandCap, column - cap - GAP_PX);
      }
    }
    // text-line snap (contract §7 entry 24 — the review visual audit P1: the
    // band's scroll peek cut the next row's title / time line): a band that
    // clips its list ends its scrollport on a CLEAN boundary; the height it
    // gives up is card ↔ band breathing, never card budget (the body's fold
    // stays block-snapped). GH-668 review visual audit r1 F3: the band height
    // and the END residual are chosen TOGETHER — jointSnap() walks every
    // rest-clean height the budget allows (never giving up a whole row the
    // budget shows) and takes the one whose max-top edge needs the SMALLEST
    // lift to a clean boundary (0 = the last row lands flush on the clip).
    const budgetBand = band;
    if (band < bandNat - 0.5) band = jointSnap(band, chrome, listOrigin, through);
    else bandRec = { budget: budgetBand, band, floor: chrome + through, residual: 0, flush: true };
    if (!(Math.abs(band - applied.band) < 0.5 && Math.abs(cap - applied.cap) < 0.5)) { // NaN-safe: the first pass writes
      applied = { ...applied, band, cap };
      setProp(rail, '--ob-replays-band-h', `${band.toFixed(2)}px`);
      setProp(section, '--ob-replays-card-cap', `${Math.floor(cap)}px`);
    }
    // the END PADS (entry 24, both edges): measured from the FINAL
    // scrollport heights the split above gives, so scrollTop = max lands
    // the top edge on a clean boundary by construction
    writeEndPads(false);
    syncTap(); // the tap role follows the body's (now final) overflow state
  }
  /** The measured end pad of one scrollport (entry 24, both edges; audit r1
   * F3): the content end `base` (the last visible block's bottom — the
   * sheet's own end padding never counts) and the pad-less terminal offset
   * baseMax = base − H; the terminal TOP edge becomes the smallest clean
   * boundary at or above baseMax (pad 0 = baseMax is itself a boundary =
   * the last row FLUSH on the clip; r3: a bare clean point is not one):
   * pad = yEnd − baseMax. `null` = the port does not overflow
   * (the sheet's own end padding stands). The bottom edge at max sits in the
   * pad or on the content end — clean either way. */
  function endPad(el) {
    if (!settleOn) return null;
    const H = el.clientHeight;
    if (H <= 0) return null;
    const origin = el.getBoundingClientRect().top + el.clientTop - el.scrollTop;
    const { edges, clean, contentEnd: base } = scanAtoms(el, origin);
    if (base <= H + 0.5) return null;
    const baseMax = base - H;
    // the terminal TOP edge = the smallest clean BOUNDARY at or above baseMax
    // (the pre-round-2 law restated — GH-668 S5 replays r3: round 2 let a
    // bare clean baseMax stand as pad 0; a row's top padding or the inter-row
    // gap is clean but no boundary, and arm P's stop law reads boundaries;
    // flush = baseMax itself IS a boundary)
    let yEnd = Infinity;
    for (const y of edges) if (y >= baseMax - 0.5 && y < yEnd && clean(y)) yEnd = y;
    if (!Number.isFinite(yEnd)) yEnd = base; // unreachable with line-level atoms
    return Math.max(0, yEnd - baseMax);
  }
  function writeEndPads(desktop) {
    const next = { list: endPad(list), body: desktop ? null : endPad(latest) };
    for (const [key, el] of [['list', list], ['body', latest]]) {
      const value = next[key];
      const prev = pads[key];
      if (value == null ? prev == null : (prev != null && Math.abs(value - prev) < 0.5)) continue;
      const oldMax = Math.max(0, el.scrollHeight - el.clientHeight);
      const atEnd = oldMax > 0 && el.scrollTop >= oldMax - 0.5;
      pads[key] = value;
      // the property OWNS padding-bottom while the port overflows (0px =
      // flush); removed = the sheet's own default (the list's sp-1 breathing)
      setProp(el, '--ob-replays-pad-end', value == null ? null : `${value.toFixed(2)}px`);
      // a port resting at its end stays at its (new) end — never a stale
      // terminal offset one pad short of the boundary
      if (atEnd) el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    }
    if (pads.list != null && Number.isFinite(bandRec.band)) bandRec = { ...bandRec, residual: pads.list, flush: pads.list <= 0.5 };
    applied = { ...applied, padList: padOf('list'), padBody: padOf('body') };
  }
  /** The atoms and boundaries of a scrollport's content (contract §7 entry
   * 24): for every visible block child (row / day label / body line) up to
   * `uptoY` its top and bottom, every text line box (Range rects) and every
   * inline glyph box (svg / img / the DVR mode face / the body's marker
   * glyphs) — all in content coordinates (viewport y − origin, origin = the
   * scrollport's padding-box top at scrollTop 0). `contentEnd` is the last
   * visible block's bottom whatever `uptoY`. A boundary y is CLEAN when no
   * atom straddles it (±0.5 px). */
  function scanAtoms(container, origin, uptoY = Infinity) {
    const atoms = []; // [top, bottom]
    const edges = [];
    let contentEnd = 0;
    for (const block of container.children) {
      if (block.hidden || !block.getClientRects().length) continue;
      const br = block.getBoundingClientRect();
      const top = br.top - origin;
      const bottom = br.bottom - origin;
      contentEnd = Math.max(contentEnd, bottom);
      if (top > uptoY + 0.5) continue; // below the budget's edge: counted for the end only
      edges.push(top, bottom);
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.height > 0 && r.width > 0) atoms.push([r.top - origin, r.bottom - origin]);
      }
      // the face atom answers to BOTH names (GH-668 review r2 P2, the mixed-
      // cache rule both ways): a cached playback.js still emits `.ob-pb-mode`
      // rows, a fresh one stamps `.ob-pb-face` + the legacy hook (its comment)
      for (const g of block.querySelectorAll('svg, img, .ob-pb-face, .ob-pb-mode, .ob-pb-pot, .ob-pb-foul, .ob-pb-star')) {
        const r = g.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) atoms.push([r.top - origin, r.bottom - origin]);
      }
    }
    for (const [t, b] of atoms) edges.push(t, b);
    const clean = (y) => atoms.every(([t, b]) => !(t < y - 0.5 && b > y + 0.5));
    return { atoms, edges, contentEnd, clean };
  }
  /** The band's clip edge never cuts a glyph at rest (contract §7 entry
   * 24): the list's visible height ends on a BOUNDARY — a text line box's
   * top or bottom, an inline glyph's (svg / img / the DVR mode face box), a
   * block's (row / day label) top or bottom, or the content end — and only
   * on one no atom straddles: in the DVR row the title line ends while the
   * 40 px mode face is still open, so "the first line whole" is not a clean
   * edge there; the clean edges inside a row are its top padding and its
   * bottom, while a day label's single line IS a clean peek. Never below the
   * FIRST row's bottom (`floorY`, the one-full-row law). Every term is a
   * measured rect. Judged AT REST (list-content coordinates from the list's
   * top, whatever the current scroll — a re-derivation while the user
   * scrolls must not move the band). The rest-0 law; the scrolled rest
   * states are the settle's (cleanStops below). Until the audit r1 F3 round
   * this was lineSnap (the LARGEST clean boundary ≤ the budget's edge, the
   * end pad measured afterwards); jointSnap below keeps that boundary set
   * and chooses among it by the end residual. */
  /** GH-668 review visual audit r1 F3 — the joint choice of band height AND
   * end residual (the coarse register owns both). Candidates = every clean
   * boundary in [floor, edge] (the set above; r3: the bare budget edge is
   * NOT one — it counts only when it coincides with a boundary);
   * floor = the LOWEST row bottom the budget shows (a whole row is never
   * given up for the residual; ≥ the one-full-row law). For each candidate
   * height y the max-top edge is `end − y` (no pad) and its residual is the
   * lift to the nearest clean boundary at or below it (endPad's law, 0 when
   * `end − y` is already clean). The smallest residual wins; within 0.5 px
   * the taller band. The residual is structural when the lattice forbids a
   * common clean height (a 26 px day head + the 4 px inset over a uniform
   * ~57 px row lattice: every rest-clean height puts the max-top edge inside
   * a title line box — measured by arm V3, recorded in contract §7). */
  function jointSnap(band, chrome, origin, floorY) {
    const edge = band - chrome;
    const { edges, clean, contentEnd: end } = scanAtoms(list, origin);
    if (edge >= end - 0.5) { bandRec = { budget: band, band, floor: chrome + floorY, residual: 0, flush: true }; return band; }
    let floor = floorY;
    for (const r of list.querySelectorAll('.ob-pb-row')) {
      const b = r.getBoundingClientRect().bottom - origin;
      if (b <= edge + 0.5 && b > floor) floor = b;
    }
    // candidates are BOUNDARIES only (entry 24: the rest clip edge sits ON a
    // text-line / block / glyph edge; the budget edge counts only when it IS
    // one — it is in `edges` then). GH-668 S5 replays r3: the round-2 form
    // also admitted the bare budget edge, and once the hoisted-head lattice
    // made flush reachable it tied at residual 0 and won as the taller band
    // — a clip edge inside a row's top padding, glyph-clean but on no
    // boundary (arm P's rest law; the pre-round-2 lineSnap law restated)
    const cands = new Set(edges.filter((y) => y <= edge + 0.5 && y >= floor - 0.5));
    cands.add(floor);
    let best = null;
    const judged = []; // the record's candidate table (arm V3 reads it)
    for (const y of cands) {
      if (!clean(y)) continue;
      const baseMax = end - y;
      // the residual = the lift from the pad-less max-top edge to the nearest
      // clean BOUNDARY at or above it (endPad's law) — never a bare clean point
      let yEnd = Infinity;
      for (const e of edges) if (e >= baseMax - 0.5 && e < yEnd && clean(e)) yEnd = e;
      if (!Number.isFinite(yEnd)) yEnd = end;
      const r = Math.max(0, yEnd - baseMax);
      judged.push([+y.toFixed(2), +r.toFixed(2)]);
      if (!best || r < best.r - 0.5 || (Math.abs(r - best.r) <= 0.5 && y > best.y)) best = { y, r };
    }
    judged.sort((a, b) => a[1] - b[1] || b[0] - a[0]);
    if (!best) { bandRec = { budget: band, band, floor: chrome + floor, edge, end, residual: NaN, flush: null, judged }; return band; }
    const chosen = Math.min(band, chrome + best.y);
    bandRec = { budget: band, band: chosen, floor: chrome + floor, edge, end, chrome, residual: best.r, flush: best.r <= 0.5, judged: judged.slice(0, 8) };
    return chosen;
  }
  // ONE write per frame (contract §7 entry 22). A write from INSIDE an
  // observer callback re-laid the body (`#ob-replays-latest`, which the kit
  // scrollfade observes at a shallower depth than the blocks observed here)
  // in the same observer pass — the browser reports that as "ResizeObserver
  // loop completed with undelivered notifications" → window.onerror → the
  // red #err banner (the solid phone pack cells, verifier 2026-09-05).
  // Queued into the next animation frame, the write lands before that
  // frame's own observer pass; the guard above ends the cycle once the
  // (cap-invariant) derivation has converged — one pass.
  let rafId = 0;
  function scheduleRegister() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; writeRegister(); });
  }
  window.addEventListener('resize', () => { if (!rail.hidden) scheduleRegister(); }, { passive: true });
  // the shell's band seam (B-K05, shell.md §9 entry 23): a re-centred /
  // re-heighted place rail, the ≤ 700 px stacking escape, a decision flip —
  // the band's bottom (CSS var) moved, so the split re-derives in the same
  // frame the shell publishes; bands are read once per write (no cache)
  window.addEventListener('ob:shell-bands', () => { if (!rail.hidden) scheduleRegister(); });
  // ---- the SCROLLED rest states (contract §7 entry 24, both edges) -------
  // The fold law holds in EVERY rest state a user can reach, at BOTH clip
  // edges of BOTH scrollports (the band's list and the card body): a rest
  // offset is a STOP when no atom straddles its top edge NOR its bottom
  // edge. 0 is a stop (lineSnap / the block snap), max is a stop (the
  // measured end pad), and every boundary whose window is clean at both
  // ends between them. A scroll that ends elsewhere SETTLES onto the
  // nearest stop (scrollend; a debounced scroll fallback where scrollend
  // is absent), smooth — instant under prefers-reduced-motion. CSS
  // scroll-snap was rejected: it aligns ONE edge, the law names two.
  /** Sorted unique stop offsets of a scrollport, always containing 0 and max. */
  function cleanStops(el) {
    const H = el.clientHeight;
    const max = Math.max(0, el.scrollHeight - H);
    if (max <= 0.5) return [0];
    const origin = el.getBoundingClientRect().top + el.clientTop - el.scrollTop;
    const { edges, clean } = scanAtoms(el, origin);
    const out = [0, max];
    for (const y of edges) {
      if (y <= 0.5 || y >= max - 0.5) continue;
      if (clean(y) && clean(y + H)) out.push(y);
    }
    out.sort((a, b) => a - b);
    return out.filter((y, i) => i === 0 || y - out[i - 1] > 0.5);
  }
  /** The stop nearest to y (tie → the larger y). With `keepEl` (the roving
   * focus row) a stop whose window still holds it whole is preferred. */
  function nearestStop(el, y, keepEl) {
    const stops = cleanStops(el);
    const H = el.clientHeight;
    let pool = stops;
    if (keepEl && el.contains(keepEl)) {
      const origin = el.getBoundingClientRect().top + el.clientTop - el.scrollTop;
      const r = keepEl.getBoundingClientRect();
      const t = r.top - origin;
      const b = r.bottom - origin;
      const holding = stops.filter((s) => s <= t + 0.5 && s + H >= b - 0.5);
      if (holding.length) pool = holding;
    }
    let best = pool[0];
    for (const s of pool) if (Math.abs(s - y) < Math.abs(best - y) - 1e-6 || (Math.abs(Math.abs(s - y) - Math.abs(best - y)) <= 1e-6 && s > best)) best = s;
    return best;
  }
  let settleMode = 'auto'; // 'auto' | 'fallback' (the test surface forces the debounced path)
  const useScrollend = () => settleMode === 'auto' && 'onscrollend' in window;
  // GH-668 S5 replays r3 (review r1 P2 C2 + arm P under the flush lattice):
  // the focus-keeping stop applies to a FOCUS-DRIVEN scroll only — the
  // roving handler's focusRow() (focus + scrollIntoView) or a Tab into the
  // list — judged by a focus move on the port within FOCUS_KEEP_MS of the
  // settle. A pointer / touch / wheel / keyboard scroll while focus merely
  // RESTS on a row (or on the coarse day button) is the user's own
  // destination: keeping the focused element whole pinned the port to the
  // one stop that held it — 0 for row 1 once the hoisted-head lattice took
  // the intermediate day-head stops away — so every gesture snapped back
  // and the end (line 2 + the badge; the oldest rows) was unreachable.
  const FOCUS_KEEP_MS = 800; // covers a smooth scrollIntoView + its scrollend
  const focusMovedAt = new WeakMap(); // port -> performance.now() of its last focusin
  /** Move `el` to its nearest stop; returns { from, to }. */
  function settle(el, behavior) {
    const from = el.scrollTop;
    const ae = document.activeElement;
    // the focus-keeping stop belongs to the ROVING RAIL ROW only (the list's
    // keyboard cursor, nearestStop's law) — never to the day button of a
    // scrolling body (review r1 P2: on coarse a body that scrolls hands the
    // tap role to line 1, entry 36 (c) — the body's only tab stop — and
    // keeping IT snapped every ArrowDown back to the top) — and only for a
    // scroll the focus move itself caused (above). A focused scrollport
    // needs no keeping (its window is its own box).
    const recentFocus = performance.now() - (focusMovedAt.get(el) ?? -Infinity) < FOCUS_KEEP_MS;
    const keep = recentFocus && ae instanceof Element && el.contains(ae) ? ae.closest('.ob-pb-row') : null;
    const to = nearestStop(el, from, keep);
    if (Math.abs(to - from) > 0.5) el.scrollTo({ top: to, behavior: behavior ?? (reducedMotion() ? 'instant' : 'smooth') });
    return { from, to };
  }
  function installSettle(el) {
    el.addEventListener('focusin', () => { focusMovedAt.set(el, performance.now()); });
    let down = false; // a finger / pointer is on the port: never settle under it
    let settling = 0; // our own scrollTo in flight (its scrollend is not a gesture's)
    let timer = 0;
    const land = () => {
      if (!settleOn || down) return;
      const { from, to } = settle(el);
      if (Math.abs(to - from) > 0.5) settling += 1;
    };
    el.addEventListener('scrollend', () => {
      if (!useScrollend()) return;
      if (settling > 0) {
        settling -= 1;
        // a gesture that landed DURING our settle ends here too: re-judge
        // once (a stop reached = no move = no further scrollend)
        if (settling === 0) land();
        return;
      }
      land();
    });
    el.addEventListener('scroll', () => {
      if (useScrollend()) return;
      clearTimeout(timer);
      timer = setTimeout(() => { timer = 0; if (!down) land(); }, 150);
    }, { passive: true });
    const press = () => { down = true; };
    const lift = () => {
      down = false;
      if (!useScrollend()) { clearTimeout(timer); timer = setTimeout(() => { timer = 0; land(); }, 150); }
    };
    el.addEventListener('touchstart', press, { passive: true });
    el.addEventListener('pointerdown', press, { passive: true });
    for (const ev of ['touchend', 'touchcancel', 'pointerup', 'pointercancel']) el.addEventListener(ev, lift, { passive: true });
  }
  installSettle(list);
  installSettle(latest);
  // late layout that fires no resize event: font load, the body's own
  // content (day / meta / markers / badge / hint) growing or shrinking.
  // INPUTS only — never the section, the body or the band, whose heights
  // this register WRITES.
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => { if (!rail.hidden) scheduleRegister(); });
    for (const el of [dayEl, metaEl, badgeEl, hold, railDay]) if (el) ro.observe(el);
  }
  try { document.fonts?.ready?.then(() => { if (!rail.hidden) scheduleRegister(); }); } catch { /* no Font Loading API */ }
  // the list's own late paints (a lazy marker fill, a relabel's text) move
  // the atoms the text-line snap reads (entry 24) — INPUTS again: the
  // register writes the rail's budget, never inside the list
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => { if (!rail.hidden) scheduleRegister(); })
      .observe(list, { childList: true, subtree: true, characterData: true });
  }

  /** YYYY-M-D of NOW in local time — the relative day labels' validity. */
  const dayBucket = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  /** One archive sweep (FR-004): the newest id + shot count (+ the rail
   * host's presence + the local day) is the refresh signature — an
   * identical signature skips the repaint unless `force`
   * (locale change, onChange). Rung 2/2' (archive absent, disarmed or
   * empty) paints the empty register. `rail: false` re-derives the latest
   * body only (the renderer already painted the rows). */
  /** ONE synchronous paint of the snapshot `s` (audit r3 finding 1): the
   * signature is computed, compared and COMMITTED in this same step, so the
   * paint and its claim can never separate (the review r1 pending-claim
   * dance is gone with the await). The rail rows are rendered from the
   * SAME pre-read index (`render({ metas })` — playback.js skips its own
   * archive read), so body + rows land inside the caller's task. */
  function paintSweep(s, { force = false, withRail = true } = {}) {
    const metas = s.metas ?? [];
    idIndex = new Map(metas.map((m) => [String(m.id), m.id]));
    const p = pb();
    degraded.playback = !p;
    degraded.mountList = !!p && typeof p.mountList !== 'function';
    // review r2 PR #655 P2 (1): a host mounted AFTER a cached sweep (the DVR
    // published `mountList` late — the feature-detected loading order the
    // the ownership ledger cache-poison contract allows) must paint NOW, not on the
    // next archive change: "rail mounted?" is part of the signature, and a
    // host that mounted in THIS sweep is rendered whatever `withRail` says
    const hadRail = !!handle;
    ensureRail();
    const railNew = !hadRail && !!handle;
    const newest = metas[0] ?? null;
    // the DVR summary is used only while the seam is PRESENT (rung 3 = meta-only)
    const dvr = !!newest && typeof p?.sessionSummary === 'function' && !!s.summary && s.summaryId === newest.id;
    // review r2 PR #655 P2 (3): the card and the rows carry RELATIVE day
    // labels (Today / Yesterday) — the local-day bucket of NOW rides the
    // signature, so an arrival after midnight recomposes them (no timer:
    // each sweep judges the date); the summary SOURCE rides it too, so a
    // DVR that published after a meta-only paint upgrades the body
    const next = `${newest ? `${newest.id}\t${newest.shots ?? 0}\t${metas.length}` : 'empty'}`
      + `\t${handle ? 'rail' : '-'}\t${dayBucket()}\t${dvr ? 'dvr' : 'meta'}`
      // …and the summary's composed TEXT (day / meta / mode / title / badge):
      // a revalidation that recomposed it (a new locale, the day rolled over
      // behind a snapshot painted before it) repaints the body
      + (dvr ? `\t${s.summary.day ?? ''}\t${s.summary.meta ?? ''}\t${s.summary.when ?? ''}\t${s.summary.mode ?? ''}\t${s.summary.title ?? ''}\t${s.summary.stale ? 1 : 0}` : '');
    latestId = newest?.id ?? null;
    count = metas.length;
    if (!force && next === sig) { syncRail(); return; }
    if (!newest) {
      paintLatest(null); // the archive is KNOWN empty — the only empty paint
      railCount = 0;
      sig = next;
      syncRail();
      return;
    }
    degraded.summary = typeof p?.sessionSummary !== 'function';
    degraded.marks = dvr && !(s.marks instanceof Element);
    paintLatest(dvr ? s.summary : metaSummary(newest), dvr ? s.marks : null);
    if ((withRail || railNew) && handle) {
      railRendering = true;
      let r = null;
      try { r = handle.render({ metas }); } catch { /* renderer's */ }
      railCount = list.querySelectorAll('.ob-pb-row').length;
      Promise.resolve(r).catch(() => {}).finally(() => { railRendering = false; });
    }
    sig = next;
    syncRail();
  }
  async function refresh({ force = false, rail: withRail = true } = {}) {
    const gen = sweepGen;
    // a FORCED sweep (locale change, onChange mutation, the test surface)
    // RE-READS the seams — the arrival alone paints from the snapshot
    if (force) invalidateSnapshot();
    if (!(archSnap.fresh && archSnap.metas) || !sheetSettled) {
      // cold / stale snapshot (or the sheet still in flight): the ONE read
      // (joined with a prefetch in flight) + the sheet; the card stays in
      // its pending register meanwhile
      try { await Promise.all([force ? rereadSnapshot() : readSnapshot(), ensureSheet()]); } catch { /* the snapshot keeps its last read */ }
      if (gen !== sweepGen) { settleReady(); return; } // a stale sweep never paints (D-4)
      paintSweep(archSnap, { force, withRail });
      writeRegister(); // the arrival's geometry lands with its paint (below)
      settleReady();
      return;
    }
    // fresh snapshot: paint NOW (synchronous — the reduced-motion snap
    // lands the whole card in the click's own frame), then revalidate
    paintSweep(archSnap, { force, withRail });
    // the STACK register is written in this same task (not the queued
    // frame): the band's top / budgets are part of the arrival frame, so
    // the reduced-motion snap shows no one-frame geometry step; later
    // triggers keep the rAF coalescing (`scheduleRegister`)
    writeRegister();
    settleReady();
    readSnapshot().catch(() => {}); // a change repaints via the snapshot listener
  }
  // a settled read (prefetch, revalidation, the late-seam retry) repaints
  // the card AT the place when the signature moved — never a stale sweep
  // (never before the sheet settled: the rail is body-level, outside the
  // held section, and must not paint unstyled)
  snapListeners.add(() => { if (atPlace && archSnap.fresh && sheetSettled) paintSweep(archSnap); });

  // ---- launch (contract §3.2 open / §4 law 1) ----------------------------
  /** Presence pre-read while the hall is still open; gone → the honest
   * notice + a fresh sweep, NO exit. Present → exit FIRST, then the DVR
   * opens the session with the no-reopen option (a user-closed wall launch
   * lands on the live table). `openSession` returns false for EVERY
   * non-open, so a false is re-checked against the archive: gone →
   * `notice.gone`, still present → `notice.openFailed` (review round 2 P2;
   * review r1 PR #655 P2 — never silent). */
  async function open(rawId) {
    const id = idIndex.get(String(rawId)) ?? rawId;
    const a = arch();
    let present = null;
    try { present = await a?.session?.(id); } catch { present = null; }
    if (!present) {
      shell.notice?.('shell.place.replays.notice.gone');
      await refresh({ force: true });
      return false;
    }
    const p = pb();
    if (typeof p?.openSession !== 'function') {
      shell.notice?.('shell.place.replays.notice.noPlayer');
      return false;
    }
    // GH-682 review r2: a session row's gesture, but after the archive await
    // (outside any event dispatch) — the exit is told it was user-activated
    shell.exitToTable?.({ activated: true });
    let ok = false;
    try { ok = await p.openSession(id, { reopenList: false }) === true; } catch { ok = false; }
    if (ok) return true;
    let still = null;
    try { still = await arch()?.session?.(id); } catch { still = null; }
    // The hall is closed by now, so the DVR's own list note (playback.notNow
    // / playback.stageFailed, prepended inside the hidden #ob-pb-panel list)
    // reaches nobody on a wall launch (review r1 PR #655 P2) — the place
    // raises ONE honest body-level notice (#ob-shell-note is body-level and
    // stands over the live table): gone, or the generic open failure. The
    // DVR's detailed reason stays its list note for the modal path.
    shell.notice?.(still ? 'shell.place.replays.notice.openFailed'
      : 'shell.place.replays.notice.gone');
    await refresh({ force: true });
    return false;
  }
  /** `undefined` when empty / disarmed / no player (the card primary then
   * performs the S1 action itself). */
  function openLatest() {
    if (latestId == null || typeof pb()?.openSession !== 'function') return undefined;
    return open(latestId);
  }
  /** The card-primary hook consumed by R0(f) `content.get('replays')?.primary`.
   * ORDER (review round 3 P2): player presence FIRST — without a player the
   * hall stays open with the honest notice (rung 3'); otherwise
   * openLatest(), and when that yields undefined the S1 action itself. */
  function primary() {
    const p = pb();
    if (typeof p?.open !== 'function') {
      shell.notice?.('shell.place.replays.notice.noPlayer');
      return undefined;
    }
    // GH-668 B-K24 / ruling R15 (review r1 P2): the DVR is titled by its
    // LAUNCHER — an empty archive opens the panel as "Replays", never
    // "Playback" (the design charter launcher-title contract). A stale playback.js
    // ignores the option and keeps 'playback.title' (mixed-cache degrade).
    return openLatest() ?? (shell.exitToTable?.({ activated: true }),
      p.open({ title: 'shell.place.replays' }));
  }
  openBtn.addEventListener('click', () => { openLatest(); });

  // ---- setFilter (seam present from 035a; the rail strip that calls it is
  // 035b) — forwards to the DVR's ONE filter truth, never a shadow copy --
  function setFilter(f) {
    const p = pb();
    if (typeof p?.setFilter === 'function') p.setFilter(f);
    return typeof p?.filter === 'function' ? p.filter() : f;
  }

  // ---- keyboard: ONE roving tab stop over the renderer's rows (contract
  // §4 law 8; FR-014). Arrow/Home/End move focus in-container and stop
  // there; Enter/Space are the ROW's own activation (playback.js row
  // keydown → this host's onOpen) — never a second handler here; the
  // container only stops them from reaching the window-bubble gameplay
  // handlers AFTER the row handler ran (bubble order target → container).
  // `data-ob-roving` is set on the list AND the rail root only once this
  // handler is armed (the GH-534 round-7 armed-marker rule): R0's
  // KEY_GATE_EXEMPT selector is '#ob-replays-rail[data-ob-roving]'. -------
  const liveRows = () => [...list.querySelectorAll('.ob-pb-row')];
  // focus bookkeeping: a render replaces the rows, and Chrome drops focus
  // to <body> when the focused row is removed (a focusout with a NULL
  // relatedTarget) — the flag is what tells armStop() to hand focus to the
  // same-id row (arm 10b). It clears ONLY on evidence the user moved on: a
  // focus landing on an element outside the rail, or a pointer press
  // outside it (a null-relatedTarget focusout never clears it).
  let focusInside = false;
  /** Re-derive the ONE tab stop: the same-id row, else the first row.
   * Runs after every render (onChange) AND on every rail reveal — an
   * unchanged archive skips the render that would otherwise re-derive it. */
  function armStop() {
    const rows = liveRows();
    if (!rows.length) { stopId = null; return; }
    const target = rows.find((r) => r.dataset.sid === stopId) ?? rows[0];
    for (const r of rows) r.tabIndex = (r === target && !rail.hidden) ? 0 : -1;
    stopId = target.dataset.sid;
    if (focusInside && !rail.hidden && !list.contains(document.activeElement)) {
      target.focus({ preventScroll: true });
    }
  }
  function focusRow(row) {
    if (!row) return;
    for (const r of liveRows()) r.tabIndex = r === row ? 0 : -1;
    stopId = row.dataset.sid;
    row.focus({ preventScroll: true });
    try {
      row.scrollIntoView({ block: 'nearest', inline: 'nearest',
        behavior: reducedMotion() ? 'auto' : 'smooth' });
    } catch { /* older engines */ }
  }
  list.addEventListener('keydown', (e) => {
    const rows = liveRows();
    if (!rows.length) return;
    const from = e.target instanceof Element ? e.target.closest('.ob-pb-row') : null;
    if (e.key === 'Enter' || e.key === ' ') {
      // activation already ran on the row (target phase); keep the key
      // from the window-bubble gameplay handlers
      if (from) e.stopPropagation();
      return;
    }
    if (!ROVE_KEYS.includes(e.key)) return;
    const i = Math.max(0, rows.indexOf(from));
    let j = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = Math.min(rows.length - 1, i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = rows.length - 1;
    e.preventDefault();
    e.stopPropagation();
    focusRow(rows[j]);
  });
  // a pointer/tab focus on any row makes it the stop (selection follows focus)
  list.addEventListener('focusin', (e) => {
    const row = e.target instanceof Element ? e.target.closest('.ob-pb-row') : null;
    if (!row) return;
    focusInside = true;
    for (const r of liveRows()) r.tabIndex = r === row ? 0 : -1;
    stopId = row.dataset.sid;
  });
  list.addEventListener('focusout', (e) => {
    const to = e.relatedTarget;
    if (to instanceof Element && !rail.contains(to)) focusInside = false;
  });
  document.addEventListener('focusin', (e) => {
    if (focusInside && e.target instanceof Element && !rail.contains(e.target)) focusInside = false;
  }, true);
  document.addEventListener('pointerdown', (e) => {
    if (focusInside && e.target instanceof Element && !rail.contains(e.target)) focusInside = false;
  }, true);
  list.dataset.obRoving = '1';
  rail.dataset.obRoving = '1';

  // ---- shell hooks (R0(c)) ----------------------------------------------
  function setPlace(id) {
    atPlace = id === 'replays' && shell.isOpen?.() !== false;
    if (!atPlace) {
      // toggled away inside the hall: the band hides, rows stay (FR-007)
      syncRail();
      // the hall is open elsewhere with a stale snapshot (a re-open after
      // play): pre-read now, so the hop to replays paints synchronously
      if (shell.isOpen?.() !== false && !archSnap.fresh) readSnapshot().catch(() => {});
      return;
    }
    // reveal re-arms the stop BEFORE the sweep (an unchanged archive skips
    // the render — review round 3 P2)
    syncRail();
    refresh();
  }
  function onShellExit() {
    atPlace = false;
    sweepGen += 1; // a sweep still in flight must not paint after exit
    invalidateSnapshot(); // play may change the archive
    stopId = null; // the highlighted row is dropped
    focusInside = false;
    const ae = document.activeElement;
    if (ae instanceof Element && rail.contains(ae)) ae.blur();
    syncRail(); // hide + inert; NO DOM teardown (D-4)
  }
  const propTap = () => false; // 035c

  // ---- locale (contract §4 law 12): the shell's relabel walks #ob-shell
  // only, so the module re-applies its own nodes (section + body-level
  // rail), asks the renderer to re-compose the rows, and re-composes the
  // latest body in the new locale (the signature skip is bypassed) -------
  onLocaleChange(() => {
    applyDom(section);
    applyDom(rail);
    relabelOwn();
    if (handle) {
      railRendering = true;
      Promise.resolve(handle.render()).catch(() => {}).finally(() => { railRendering = false; });
    }
    refresh({ force: true, rail: false }); // force = re-read: the cached summary carries the OLD locale's strings
  });

  // ---- test/deep-link surface (contract §3.2 — the __shell grammar) ------
  window.__replays = {
    registry: () => REGISTRY_IDS.map((id) => ({ id, mounted: mounted[id] })),
    state: () => ({
      place: shell.place?.() ?? null,
      railVisible: !rail.hidden,
      // GH-668 G5: the painted title — shown / dropped by the coarse budget,
      // the two-row need it measured against the budget (`avail`)
      title: { ...titleDrop, h: railTitle.hidden ? 0 : railTitle.getBoundingClientRect().height },
      // audit r1 F3: the joint band-height / end-residual record (coarse)
      // r3 F3: `head` = the hoisted first day label's height (0 = none / an
      // old DVR keeps it in the flow) — chrome the budget counts
      band: { ...bandRec, padList: pads.list, padBody: pads.body, head: railDay.childElementCount ? railDay.getBoundingClientRect().height : 0 },
      railControls: false,
      filter: (() => { try { return pb()?.filter?.() ?? null; } catch { return null; } })(),
      latestId,
      count,
      perfTier: readTier(),
      pendingOpen: (() => { try { return pb()?.opening?.() === true; } catch { return false; } })(),
      clipOrigin: null,
      degraded: { ...degraded },
      // GH-668 B-RP01: which element carries the coarse tap role (null on
      // fine pointers / empty / no player)
      tapTarget: tapArmed === latest ? 'body' : tapArmed === dayEl ? 'day' : null,
    }),
    setFilter,
    open,
    openLatest,
    primary,
    refresh,
    propTap,
    // entry 24 both-edge law (arm P scrolled legs): the stop sets, an
    // instant settle, the red-prove switch (false = no settle AND both end
    // pads pinned to 0) and the fallback-path switch
    stops: (which) => cleanStops(which === 'body' ? latest : list),
    // the measured fold atoms of a scrollport in content coordinates (the
    // e2e-replays K7 legacy-face arm reads them: both face names are atoms)
    atoms: (which) => { const el = which === 'body' ? latest : list;
      return scanAtoms(el, el.getBoundingClientRect().top + el.clientTop - el.scrollTop).atoms; },
    settle: (which) => settle(which === 'body' ? latest : list, 'instant'),
    get settleEnabled() { return settleOn; },
    set settleEnabled(v) { settleOn = v !== false; writeRegister(); },
    settleMode: (mode) => { if (mode === 'auto' || mode === 'fallback') settleMode = mode; return settleMode; },
  };

  console.log('[replays] ready (035a)');
  // `ready` = the first sweep's settle (shell.js LAW 2 awaits it inside its
  // cap; play / practice / equipment expose none — their hold is unchanged)
  return { setPlace, onShellExit, propTap, refresh, primary, ready };
}
