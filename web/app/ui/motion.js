// Copyright (c) Meta Platforms, Inc. and affiliates.

// motion.js — self-contained micro-motion helpers for the UI kit (contract:
// the ui-kit contract (feature 006, internal)). Leaf module: imports no app modules and carries its
// own ~90-line rAF tween engine — no external animation dependency.
// Transforms/opacity ONLY (compositor-friendly; no layout thrash).
//
// Duration/ease constants MIRROR web/app/ui/tokens.css --ob-t-*/--ob-ease
// (change BOTH or CSS transitions and JS choreography desync):
//   T_FAST = --ob-t-fast (120ms)   T_MED = --ob-t-med (200ms)
//   T_SLOW = --ob-t-slow (320ms)   quart-out ≈ --ob-ease (0.22,1,0.36,1)
// Mount law (GH-668 B-K22): mount()/unmount() at the end of this file — a
// panel's `hidden` flips go through the kit; see the block comment there.
export const T_FAST = 0.12;
export const T_MED = 0.2;
export const T_SLOW = 0.32;
const easeOut = (t) => 1 - (1 - t) ** 4; // decisive-out ≈ --ob-ease
const easeIn = (t) => t ** 3;            // ≈ --ob-ease-in for exits

// live reduced-motion flag (ES module live binding — importers see updates)
const mq = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export let reduced = !!(mq && mq.matches);
mq?.addEventListener?.('change', (e) => { reduced = e.matches; });

// ---- tween engine ---------------------------------------------------------
// Two independent channels per element — 'move' (opacity + translateY) and
// 'scale' — so press/pulse never interrupt an enter/exit and vice versa
// (the killTweensOf(el, 'scale') semantics the helpers were written
// against). Each frame composes ONE transform write from the live channel
// values; when the last channel completes, the inline transform is removed
// entirely so a resting element computes 'none' (the resting-identity law,
// e2e-ui geometry contract J7 — identity RESIDUE like matrix(1,0,0,1,0,0)
// is a contract violation, not a cosmetic detail).
const channels = new WeakMap(); // el -> { move: Tween|null, scale: Tween|null }
let raf = 0;
const live = new Set(); // running tweens

function chans(el) {
  let c = channels.get(el);
  if (!c) { c = { move: null, scale: null }; channels.set(el, c); }
  return c;
}

function writeTransform(el) {
  const c = chans(el);
  const parts = [];
  if (c.move && c.move.y !== 0) parts.push(`translateY(${c.move.y}px)`);
  if (c.scale && c.scale.s !== 1) parts.push(`scale(${c.scale.s})`);
  if (parts.length) el.style.transform = parts.join(' ');
  else el.style.removeProperty('transform');
}

function kill(el, kind) {
  const c = channels.get(el);
  if (!c) return;
  for (const k of kind ? [kind] : ['move', 'scale']) {
    const t = c[k];
    if (t) { c[k] = null; live.delete(t); t.resolve(); }
  }
}

function tick(now) {
  for (const t of live) t.step(now);
  if (live.size) raf = requestAnimationFrame(tick);
  else raf = 0;
}

/** start a tween on one channel; returns a promise resolving on
 *  complete OR interruption (a successor tween owns cleanup then). */
function tween(el, kind, spec) {
  kill(el, kind);
  return new Promise((resolve) => {
    const t = {
      el, start: 0, resolve,
      y: spec.y0 ?? 0, s: spec.s0 ?? 1,
      o: spec.opacity ? spec.opacity[0] : null,
      step(now) {
        if (!this.start) this.start = now;
        const wait = (spec.delay ?? 0) * 1000;
        if (now - this.start < wait) return; // cancelable pre-delay hold
        let p = Math.min(1,
          (now - this.start - wait) / (spec.duration * 1000));
        // yoyo: mirror the timeline around its midpoint (1 → peak → 1)
        const q = spec.yoyo ? 1 - Math.abs(2 * p - 1) : p;
        const e = spec.ease(q);
        if (spec.opacity) {
          this.o = spec.opacity[0] + (spec.opacity[1] - spec.opacity[0]) * e;
          el.style.opacity = String(this.o);
        }
        if (spec.y) this.y = spec.y[0] + (spec.y[1] - spec.y[0]) * e;
        if (spec.s) this.s = spec.s[0] + (spec.s[1] - spec.s[0]) * e;
        writeTransform(el);
        if (p >= 1) {
          chans(el)[kind] = null;
          live.delete(this);
          spec.done?.();
          this.resolve();
        }
      },
    };
    chans(el)[kind] = t;
    live.add(t);
    // apply the from-state SYNCHRONOUSLY (hard from-state semantics): an
    // enter() scheduled from inside a rAF must never paint one fully
    // visible frame before its first step, and staggered items must sit
    // in their hidden entrance pose for the whole (cancelable) delay.
    if (spec.opacity) el.style.opacity = String(spec.opacity[0]);
    writeTransform(el);
    if (!raf) raf = requestAnimationFrame(tick);
  });
}

function show(el, display) {
  if (getComputedStyle(el).display === 'none') {
    el.style.display = display ?? 'block';
  }
}

/** fade+rise entrance. Ensures el is visible; kills in-flight tweens. */
export function enter(el, opts = {}) {
  if (!el) return Promise.resolve();
  show(el, opts.display);
  if (reduced) {
    kill(el);
    el.style.opacity = '';
    el.style.transform = '';
    return Promise.resolve();
  }
  kill(el, 'scale');
  return tween(el, 'move', {
    opacity: [0, 1], y: [8, 0], y0: 8,
    duration: opts.duration ?? T_MED, ease: easeOut,
    done: () => { el.style.removeProperty('opacity'); writeTransform(el); },
  });
}

/** fade+drop exit; resolves after display:none is applied. */
export function exit(el, opts = {}) {
  if (!el) return Promise.resolve();
  const hide = () => {
    el.style.display = 'none';
    el.style.opacity = '';
    el.style.transform = '';
  };
  if (reduced) { kill(el); hide(); return Promise.resolve(); }
  kill(el, 'scale');
  // continue from the CURRENT pose (continue-from-current semantics): interrupting an
  // in-flight entrance must not flash back to opacity 1 / y 0 first.
  const cur = channels.get(el)?.move;
  const o0 = cur && cur.o != null ? cur.o
    : (parseFloat(getComputedStyle(el).opacity) || 1);
  const y0 = cur ? cur.y : 0;
  return tween(el, 'move', {
    opacity: [o0, 0], y: [y0, 6], y0,
    duration: opts.duration ?? T_FAST, ease: easeIn,
    done: hide, // superseded by a new enter(): it owns visibility then
  });
}

/** micro press feedback (scale dip), safe to spam. */
export function press(el) {
  if (!el || reduced) return Promise.resolve();
  return tween(el, 'scale', { // scale channel only: never kills enter/exit
    s: [0.97, 1], s0: 0.97, duration: 0.08, ease: easeOut,
    done: () => writeTransform(el), // drops the identity residue at rest
  });
}

// value-change pulse, throttled per element (≤1 per 150ms)
const lastPulse = new WeakMap();

/** brief scale pulse (1 → 1.04 → 1) marking a value change. */
export function pulse(el) {
  if (!el) return Promise.resolve();
  const now = Date.now();
  if (now - (lastPulse.get(el) ?? -Infinity) < 150) return Promise.resolve();
  lastPulse.set(el, now);
  if (reduced) return Promise.resolve();
  return tween(el, 'scale', {
    s: [1, 1.04], duration: T_FAST, ease: easeOut, yoyo: true,
    // full removal on complete keeps once-pulsed leaves computing
    // transform 'none' like virgin ones (resting-identity law); an
    // interrupted pulse hands cleanup to the tween that killed it.
    done: () => writeTransform(el),
  });
}

/** list entrance: enter() across els with a small stagger. */
export function stagger(els, opts = {}) {
  const list = Array.from(els ?? []);
  if (!list.length) return Promise.resolve();
  list.forEach((el) => show(el, opts.display));
  if (reduced) {
    list.forEach((el) => {
      kill(el);
      el.style.opacity = '';
      el.style.transform = '';
    });
    return Promise.resolve();
  }
  const gap = opts.stagger ?? 0.03;
  return Promise.all(list.map((el, i) => {
    kill(el, 'scale');
    return tween(el, 'move', {
      opacity: [0, 1], y: [8, 0], y0: 8, delay: i * gap,
      duration: opts.duration ?? T_MED, ease: easeOut,
      done: () => { el.style.removeProperty('opacity'); writeTransform(el); },
    });
  })).then(() => {});
}

// ---- mount law (GH-668 S5 kit B-K22) --------------------------------------
// A panel that becomes visible ENTERS through the kit and leaves through it;
// `hidden` stays the one visibility truth a consumer keeps, the kit owns the
// frames in between. mount(el) clears `hidden` SYNCHRONOUSLY (a consumer
// reading el.hidden right after sees the new state) and runs the enter —
// T_MED opacity 0 → 1 + 8 px rise, instant under reduced motion; its first
// painted frame is the hidden pose (hard from-state semantics above).
// unmount(el) sets `hidden` SYNCHRONOUSLY and keeps the element painted
// through the T_FAST exit with an inline display of its resting value; the
// exit's last frame removes that inline display so the attribute lands
// display:none with NO inline residue (a later `el.hidden = false` by anyone
// still shows it). Flips mid-flight continue from the current pose (no
// flash to 1 / 0). mount on a mounted resting element and unmount on a
// hidden one are no-ops: a mounted panel never blinks. Consumers replace
// `el.hidden = false` / `= true` with mount(el) / unmount(el); the e2e-ui
// motion lab (J13) and the arrival-clip A11 predicate judge the frames.
const bridged = new WeakSet(); // els whose inline display unmount() set

function moveState(el) {
  const c = channels.get(el)?.move;
  return {
    inFlight: !!c,
    o: c && c.o != null ? c.o : null,
    y: c ? c.y : null,
  };
}

/** mount law enter: clears `hidden` now, enters through the kit. */
export function mount(el, opts = {}) {
  if (!el) return Promise.resolve();
  const cur = moveState(el);
  const wasHidden = el.hidden || getComputedStyle(el).display === 'none';
  if (!wasHidden && !cur.inFlight) return Promise.resolve(); // at rest, mounted
  el.hidden = false;
  if (bridged.has(el)) { el.style.removeProperty('display'); bridged.delete(el); }
  if (el.style.display === 'none') el.style.removeProperty('display');
  show(el, opts.display);
  if (reduced) {
    kill(el);
    el.style.opacity = '';
    el.style.transform = '';
    return Promise.resolve();
  }
  kill(el, 'scale');
  // continue-from-current over an in-flight exit; fresh mounts start hidden
  const o0 = cur.inFlight && cur.o != null ? cur.o : 0;
  const y0 = cur.inFlight ? cur.y : 8;
  return tween(el, 'move', {
    opacity: [o0, 1], y: [y0, 0], y0,
    duration: opts.duration ?? T_MED, ease: easeOut,
    done: () => { el.style.removeProperty('opacity'); writeTransform(el); },
  });
}

/** mount law exit: sets `hidden` now, keeps painting through the exit. */
export function unmount(el, opts = {}) {
  if (!el) return Promise.resolve();
  const cur = moveState(el);
  if (el.hidden && !cur.inFlight) return Promise.resolve(); // already hidden
  const settle = () => {
    el.style.removeProperty('display');
    bridged.delete(el);
    el.style.opacity = '';
    el.style.transform = '';
  };
  if (reduced) { kill(el); el.hidden = true; settle(); return Promise.resolve(); }
  const disp = getComputedStyle(el).display; // resting display, read visible
  el.hidden = true;
  if (disp !== 'none') { el.style.display = disp; bridged.add(el); }
  kill(el, 'scale');
  const o0 = cur.inFlight && cur.o != null ? cur.o
    : (parseFloat(getComputedStyle(el).opacity) || 1);
  const y0 = cur.inFlight ? cur.y : 0;
  return tween(el, 'move', {
    opacity: [o0, 0], y: [y0, 6], y0,
    duration: opts.duration ?? T_FAST, ease: easeIn,
    done: settle, // superseded by a mount(): it owns visibility then
  });
}
