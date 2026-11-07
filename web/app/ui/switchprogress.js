// Copyright (c) Meta Platforms, Inc. and affiliates.

// ui/switchprogress.js — the kit SWITCH PROGRESS overlay (build 20: "switch
// game 的卡顿也建议改成 user friendly 一些的, 比如显示个进度条或者状态表示正在
// load 什么"). A game switch that changes the table blocks the main thread in
// up to three chunks — the synchronous table build (scene/table.js rebuild),
// the first-frame shader compile/link of the new materials, and (snooker) the
// occlusion bake landing in 12 ms slices — and nothing painted while it ran:
// the confirm dialog froze over the hall for seconds.
//
// THE PAINT LAW: only a PRESENTED frame reaches the screen, and during a
// blocked task no frame is presented. So the overlay is inserted AT REST (no
// entrance tween — the #ob-boot BOOT-FIRSTFRAME precedent; a tween would sit
// frozen at opacity ≈ 0 through the block) and showSwitchProgress() resolves
// only after two rAF ticks plus one task and — where the platform reports it
// (Chromium Element Timing) — after the frame that painted the overlay has
// been presented; the caller starts the blocking work after that (measured
// unclamped on a GPU-saturated box: presented +377 ms, build +401 ms after
// Continue). A phase label changes only at a
// frame boundary, so built() asks the render loop to HOLD its whole step
// (main.js switchFrames.hold — bounded there) until the 'materials' label has
// been presented, then releases it into the compiling frame. The bar's sweep
// is a compositor-run CSS transform animation: it keeps moving while the main
// thread is blocked (and stops under prefers-reduced-motion).
//
// PHASES advance only on real signals, never on timers: table (shown first)
// → fetch (the CN8 transport download is in flight) → materials (the build
// returned; the next frame compiles) → settling (the first post-build frame
// rendered; waits for the caller's settled() predicate plus two delivered
// frames) → done. The fraction never decreases.
//
// INPUT: the root covers the viewport and takes every pointer hit (clicks
// queued during a blocked task hit-test at dispatch — onto the root), and a
// window capture key guard swallows keys until the overlay is removed. It
// raises html[data-ob-switching] (main.js's switch shield acts while it
// stands) set to its own id, and only its own removal clears it. Focus is
// NOT moved: the shell's GH-682 exit handoff keeps owning it.
//
// MINIMUM DISPLAY: once presented, the overlay stays MIN_SHOWN_MS before it
// leaves, so a fast switch never flashes it; it never outlives the caller's
// settled frame by more than two delivered frames, and its whole life is
// capped from the insertion — capMs while the switch waits for its table,
// settleCapMs once it committed (input is released at the cap whatever is
// pending).
//
// Kit leaf (the ownership ledger UI kit rules): imports ui/ siblings only through
// namespaces, callers pass ALREADY-TRANSLATED strings, the skin lives in
// ui/switchprogress.css (linked by the caller — settings.js — with its ?v=).

import * as controls from './controls.js';
import * as motion from './motion.js';

export const PHASES = Object.freeze(['table', 'fetch', 'materials', 'settling', 'done']);
const FRACTION = { table: 0.2, fetch: 0.2, materials: 0.6, settling: 0.85, done: 1 };
export const MIN_SHOWN_MS = 500;
const PRESENT_CAP_MS = 500; // a hidden document runs no rAF: never wedge the switch on it
const LEAVE_CAP_MS = 400; // the leave transition is --ob-t-med; remove even if transitionend never fires

const delay = (ms) => new Promise((r) => { setTimeout(r, ms); });
const frame = () => new Promise((r) => { requestAnimationFrame(() => r()); });
const task = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
// two ticks: the first runs before the frame that paints the current DOM, the
// second after it has been produced — then one task, so the caller's blocking
// work starts AFTER that second frame instead of inside its rAF callback (a
// main frame left in flight there held the compositor's draw of the overlay
// back by ~300 ms in the unclamped trace)
const presented = () => Promise.race([frame().then(frame).then(task), delay(PRESENT_CAP_MS)]);
// paint-truthful where the platform reports it (Chromium Element Timing): the
// entry for the overlay's title is queued once the frame that first painted it
// has been PRESENTED — a busy GPU can display a committed frame ~100-200 ms
// late. Elsewhere (WebKit) it resolves at once and the ticks stand. Every
// overlay carries its OWN identifier and an entry painted before this overlay
// was inserted never counts: the buffered timeline still holds the previous
// switch's entry (review r1 P2 — a second switch in one page released its
// build on the stale paint).
let etSeq = 0;
function watchPaint(id, since) {
  const types = typeof PerformanceObserver === 'function' ? PerformanceObserver.supportedEntryTypes ?? [] : [];
  if (!types.includes('element')) return () => Promise.resolve(null);
  let hit = null, wake = null;
  const po = new PerformanceObserver((list) => {
    const e = list.getEntries().find((x) => x.identifier === id && x.renderTime >= since);
    if (e && !hit) { hit = { id, renderTime: e.renderTime }; po.disconnect(); wake?.(hit); }
  });
  po.observe({ type: 'element', buffered: true });
  return (cap) => (hit ? Promise.resolve(hit) : new Promise((resolve) => {
    wake = resolve;
    setTimeout(() => { po.disconnect(); resolve(hit); }, cap);
  }));
}
const reduced = () => motion.reduced === true;

let active = null;

/** Show the overlay and resolve once it has been PRESENTED (resolves null
 * when there is no document). opts: { title, labels: { table, fetch,
 * materials, settling }, frames (main.js switchFrames: hold / delivered —
 * optional), settled: () => true | false | 'refused', capMs, settleCapMs }
 * (the lifetime caps, from the insertion: capMs until built(), settleCapMs
 * once it was called). */
export async function showSwitchProgress(opts = {}) {
  if (typeof document === 'undefined' || !document.body) return null;
  active?.remove();
  const etId = `ob-switchprogress-${++etSeq}`;
  const insertedAt = performance.now();
  const paint = watchPaint(etId, insertedAt); // armed before the insertion
  const h = createOverlay({ ...opts, etId, insertedAt });
  active = h;
  await presented();
  h.markPresented(await paint(PRESENT_CAP_MS));
  h.markShown();
  return h.api;
}

/** The live overlay's readout (e2e + capture surface), or null. */
export function switchProgressState() {
  return active ? active.state() : null;
}

function createOverlay({ title = '', labels = {}, frames = null, settled = () => true, capMs = 15000, settleCapMs = 30000, etId = '', insertedAt = performance.now() } = {}) {
  const root = document.createElement('div');
  root.className = 'ob-switchprogress';
  root.dataset.ob = 'switch-progress';
  // critical placement inline (the dialog.js / drills.js fallback law): a
  // sheet that has not landed still yields a viewport-covering, input-
  // absorbing scrim with readable copy — never a click-through
  Object.assign(root.style, {
    position: 'fixed', inset: '0', zIndex: 'var(--ob-z-dialog, 70)',
    display: 'grid', placeItems: 'center',
    background: 'var(--ob-scrim, oklch(13% 0.009 165 / 0.5))',
    color: 'var(--ob-text-0, #efe9d8)',
  });
  const card = document.createElement('div');
  card.className = 'ob-switchprogress__card';
  const head = document.createElement('p');
  head.className = 'ob-switchprogress__title';
  head.id = 'ob-switchprogress-title';
  head.setAttribute('elementtiming', etId);
  head.textContent = title;
  const bar = document.createElement('div');
  bar.className = 'ob-switchprogress__bar';
  const progress = typeof controls.makeProgress === 'function' ? controls.makeProgress(bar) : fallbackProgress(bar);
  bar.setAttribute('aria-labelledby', head.id);
  const sweep = document.createElement('div');
  sweep.className = 'ob-switchprogress__sweep';
  sweep.setAttribute('aria-hidden', 'true');
  bar.appendChild(sweep);
  const line = document.createElement('p');
  line.className = 'ob-switchprogress__phase';
  line.setAttribute('role', 'status');
  line.setAttribute('aria-live', 'polite');
  card.append(head, bar, line);
  root.appendChild(card);

  let phase = null, shownAt = null, ended = false, removed = false, paintedBy = null;
  const trail = [];
  const setPhase = (id) => {
    if (removed || phase === id || !(id in FRACTION)) return;
    if (phase && FRACTION[id] < FRACTION[phase]) return; // the bar never runs backwards
    phase = id;
    trail.push(id);
    root.dataset.phase = id;
    const text = labels[id] ?? labels.settling ?? '';
    if (id !== 'done') line.textContent = text;
    progress.set(FRACTION[id], line.textContent);
  };
  setPhase('table');

  // the user's keys only (a scripted dispatch passes, as main.js's shield
  // lets it); OS / browser shortcuts (reload, quit, devtools: modified keys
  // and the function keys) keep the platform's default
  const guard = (e) => {
    if (!e.isTrusted) return;
    e.stopImmediatePropagation();
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !/^F\d{1,2}$/.test(e.key)) e.preventDefault();
  };
  // THE LIFETIME CAP (review r2 P2): the overlay shields input (and main.js's
  // switch shield swallows every action event while html[data-ob-switching]
  // stands), so its whole life is bounded from the INSERTION, whatever
  // happens inside it: a CN8 transport that never resolves (changeGame never
  // calls built()), a caller that never calls end(), a throw inside the
  // leave. capMs bounds the wait for the table; once built() reports the
  // committed switch, the deadline moves to settleCapMs from the insertion —
  // the first-frame compile is local work that finishes, and on a loaded
  // device it alone outlasted capMs. The timer is armed before the shield
  // goes up and only remove() clears it; at the deadline the overlay releases
  // input and leaves at once. table.js's pending banner (hidden under the
  // overlay only) and the settings / recovery controls take over, as before
  // this overlay existed.
  let timedOut = false, deadline = insertedAt + capMs, lifeTimer = 0;
  const armCap = () => {
    clearTimeout(lifeTimer);
    lifeTimer = setTimeout(() => { timedOut = !ended; remove(); }, Math.max(0, deadline - performance.now()));
  };
  armCap();
  const remove = () => {
    if (removed) return;
    removed = ended = true; // a replaced overlay runs no more of its sequence
    clearTimeout(lifeTimer);
    // the flag names the overlay that raised it: one that replaced this
    // overlay owns it from then on
    const html = document.documentElement;
    if (html.getAttribute('data-ob-switching') === etId) html.removeAttribute('data-ob-switching');
    if (active?.root === root) active = null;
    for (const type of ['keydown', 'keyup', 'keypress']) window.removeEventListener(type, guard, true);
    root.remove();
  };
  for (const type of ['keydown', 'keyup', 'keypress']) window.addEventListener(type, guard, true);
  document.documentElement.setAttribute('data-ob-switching', etId);
  document.body.appendChild(root);

  const finish = async () => {
    if (ended) return;
    ended = true;
    setPhase('done');
    const shown = shownAt === null ? 0 : performance.now() - shownAt;
    if (shown < MIN_SHOWN_MS) await delay(MIN_SHOWN_MS - shown);
    if (removed) return;
    if (reduced()) { remove(); return; }
    root.addEventListener('transitionend', (e) => { if (e.target === root) remove(); });
    root.dataset.leaving = '1';
    setTimeout(remove, LEAVE_CAP_MS);
  };
  const safeSettled = () => {
    try { return settled(); } catch { return 'refused'; }
  };
  const delivered = () => (typeof frames?.delivered === 'function'
    ? Promise.race([frames.delivered(), delay(PRESENT_CAP_MS)]) : presented());
  const expired = () => performance.now() > deadline;
  const settle = async () => {
    setPhase('materials');
    let release = null;
    try { release = frames?.hold?.() ?? null; } catch { release = null; }
    try {
      await presented(); // the 'materials' label reaches the screen before the compiling frame
    } finally {
      if (typeof release === 'function') release();
    }
    await delivered(); // the first post-build frame rendered (its synchronous compile included)
    if (ended) return;
    setPhase('settling');
    while (!ended && !expired()) {
      const s = safeSettled();
      if (s === 'refused') break;
      if (s === true) {
        await delivered();
        await delivered();
        if (safeSettled() === true) break;
      } else await frame();
    }
    finish();
  };

  const api = {
    /** the table request is pending (CN8 transport in flight) */
    pending() { if (!ended && phase === 'table') setPhase('fetch'); },
    /** the table build returned and the switch committed: run the
     * materials → settling → done sequence on its own */
    built() {
      if (ended) return;
      deadline = insertedAt + settleCapMs;
      armCap();
      settle();
    },
    /** dismiss (refusal, failure, superseded); keeps the minimum display */
    end() { finish(); },
    /** the audit / capture seam: show a phase's register without running
     * the sequence (the e2e-ui --audit rows and the capture pack pose each
     * phase in every locale) */
    pose(id) { if (!ended) setPhase(id); },
    get phase() { return phase; },
  };
  return {
    root, api, remove,
    markShown() { if (shownAt === null) shownAt = performance.now(); },
    markPresented(hit) { paintedBy = hit; },
    // paintedBy: the Element Timing entry that released the caller's blocking
    // work (null where the platform has none, or past the cap)
    state: () => ({ phase, trail: [...trail], shownAt, insertedAt, etId, paintedBy, ended, timedOut,
      leaving: root.dataset.leaving === '1', text: line.textContent, valuenow: Number(bar.getAttribute('aria-valuenow')) }),
  };
}

// a stale cached controls.js without makeProgress: the same kit classes and
// ARIA contract, built here
function fallbackProgress(el) {
  el.classList.add('ob-progress');
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '1');
  const fill = document.createElement('div');
  fill.className = 'ob-progress__fill';
  el.appendChild(fill);
  return {
    set(fraction, valuetext) {
      const f = Math.max(0, Math.min(1, Number(fraction) || 0));
      fill.style.transform = `scaleX(${f})`;
      el.setAttribute('aria-valuenow', String(f));
      if (valuetext !== undefined) el.setAttribute('aria-valuetext', String(valuetext));
    },
  };
}
