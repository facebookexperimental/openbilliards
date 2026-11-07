// Copyright (c) Meta Platforms, Inc. and affiliates.

// foldsnap-press-lab.mjs — GH-1168: a press on a fold-snap port stops a settle that is ALREADY running, and the lift
// lands it. The kit fold-snap (ui/foldsnap.js) settles a scroll onto the nearest stop with a smooth scrollTo; its law
// "never settle under a finger" used to hold only when a settle STARTED, so a settle already moving when a finger
// landed kept moving under it: on the practice column the column's own motion cancelled the shell's card hold, and the
// release clicked whatever had slid under the still finger.
//
// The lab (in-page, deterministic): a lab fold (four 60 px cards, budget 160, stops by trace [0, 60, 68, 128]) gets a
// STRETCHED smooth scroll. Its scrollTo answers a smooth call with an 800 ms linear animation stepped by native instant
// scrolls (a smooth call during one retargets it), cancels the animation on ANY non-smooth call before applying it
// natively (the CSSOM View abort the fix relies on), and keeps the native contract of one scrollend at the end: the
// steps' own scrollend events never reach the leaf. The port is scrolled to 45 % of its first interior stop; its landing
// starts the stretched settle back to 0; 120 ms in, a synthetic touch pointerdown lands on the port; scrollTop is
// sampled every frame for 400 ms, then a pointerup lifts.
//   (1) the press holds the port: the drift from the second frame after the press is <= 0.5 px, and the leaf issues no
//       smooth scrollTo while the pointer is down;
//   (2) the lift lands it: within 2.5 s of the pointerup the port rests on a stop of the set, and the first scrollTo
//       after the lift comes at least 140 ms after it (never under the release's own click);
//   (3) a second press before that landing keeps the debt: the same stretched settle stopped by a 40 ms press, then a
//       second press 60 ms after its release held 300 ms (the first landing's timer fires under it); within 2.5 s of
//       the second release the port rests on a stop;
//   (4) a cancelled press lands nothing under the finger and keeps the debt: the settle stopped and released (its
//       150 ms landing timer armed), then at once, in the same task, a second press and its pointercancel (the browser
//       took the gesture, the finger stays 300 ms); no smooth scrollTo while it stays, and within 2.5 s of the next
//       tap's release the port rests on a stop. The race is timed from before the release's dispatch to after the
//       cancel's, so a stall inside either counts against it: 140 ms or more did not stage the race, a named
//       UNJUDGEABLE, never a pass. The calls are counted from before the cancel's dispatch, so a settle the cancel
//       handler starts synchronously is seen. Row (1) counts only the calls up to its own release.
// UNJUDGEABLE (a named red, never a skip) when the settle never starts, or when less than 3 px of travel is left at the
// drift baseline (the press came too late to tell a held port from an arrived one).
// A data module (no browser of its own): e2e-ui runs it in its B-K18 fold lab (CI e2e-ui-audit).

/** The page-side lab: an async expression that builds its own fold, runs the press, and returns plain data. */
export const FOLD_PRESS_LAB = `(async () => {
  const fs = await import(location.origin + '/app/ui/foldsnap.js');
  const frame = () => new Promise((r) => requestAnimationFrame(() => r(performance.now())));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:8px;top:8px;z-index:2147483000;max-height:160px;display:flex;flex-direction:column;width:300px;background:#222';
  const s = document.createElement('div');
  s.style.cssText = 'overflow-y:auto;min-height:0;max-height:var(--fs-h, none);padding-bottom:var(--fs-pad, 0px);display:flex;flex-direction:column;gap:8px;scroll-behavior:auto';
  for (let i = 0; i < 4; i++) {
    const c = document.createElement('div'); c.className = 'lab-card';
    c.style.cssText = 'display:block;flex:0 0 auto;height:60px;box-sizing:border-box;padding:10px;margin:0;border:0;font:14px/20px sans-serif;color:#eee;background:#333';
    c.innerHTML = '<div style="height:20px">line a' + i + '</div><div style="height:20px">line b' + i + '</div>'; s.appendChild(c);
  }
  host.appendChild(s); document.body.appendChild(host);
  // the stretched smooth scroll (installed before the leaf attaches; capture at the target runs before the leaf's own
  // scrollend listener)
  const native = Element.prototype.scrollTo;
  const calls = [];
  let down = false, firstSmooth = null, anim = null;
  const stop = () => { if (anim) { cancelAnimationFrame(anim.id); anim = null; } };
  s.addEventListener('scrollend', (e) => { if (anim) e.stopImmediatePropagation(); }, { capture: true });
  s.scrollTo = function (o) {
    const smooth = !!o && typeof o === 'object' && o.behavior === 'smooth' && typeof o.top === 'number';
    calls.push({ smooth, top: o && typeof o === 'object' ? o.top : null, at: performance.now(), down });
    if (!smooth) { stop(); return native.call(this, o); }
    if (firstSmooth === null) firstSmooth = { at: performance.now(), from: this.scrollTop, to: o.top };
    stop();
    const from = this.scrollTop, to = o.top, t0 = performance.now(), el = this;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 800);
      native.call(el, { top: from + (to - from) * k, behavior: 'instant' });
      if (k < 1) anim.id = requestAnimationFrame(step);
      else anim = null; // the last step's scrollend reaches the leaf: the settle ended
    };
    anim = { id: requestAnimationFrame(step) };
  };
  const h = fs.attachFoldSnap(s, { host, atoms: '.lab-card, ' + fs.DEFAULT_ATOMS });
  await frame(); await frame(); await wait(300);
  const stops = h.stops();
  const out = { stops, scrollend: 'onscrollend' in window };
  const s1 = stops.find((v) => v > 0.5);
  const done = () => { stop(); delete s.scrollTo; h.detach(); host.remove(); };
  if (!(s1 > 0)) { done(); return { ...out, err: 'no interior stop' }; }
  const y = Math.floor(s1 * 0.45);
  native.call(s, { top: y, behavior: 'instant' });
  // the leaf lands on the scrollend (or its 150 ms scroll debounce): wait for its smooth settle to start
  const t0 = performance.now();
  while (firstSmooth === null && performance.now() - t0 < 1500) await frame();
  if (firstSmooth === null) { done(); return { ...out, y, err: 'the fold-snap never started a smooth settle', calls }; }
  await wait(120); // well inside the 800 ms settle
  const pressTop = s.scrollTop, pressAt = performance.now();
  down = true;
  s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, pointerId: 7 }));
  const samples = [];
  while (performance.now() - pressAt < 400) { await frame(); samples.push(Math.round(s.scrollTop * 100) / 100); }
  const liftAt = performance.now();
  const callsAtLift = calls.length; // row (1) judges only the calls up to its own release
  down = false;
  s.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, pointerId: 7 }));
  let rest = null;
  const t1 = performance.now();
  while (performance.now() - t1 < 2500) {
    await wait(100);
    const a = s.scrollTop; await frame(); await frame();
    if (!anim && Math.abs(s.scrollTop - a) <= 0.01 && performance.now() - liftAt > 400) { rest = s.scrollTop; break; }
  }
  const after = calls.filter((c) => c.at > liftAt);
  // (3) the double press: the port back off its stop, the settle restarted, stopped, a second press under the timer
  const restAfterSecond = await (async () => {
    if (rest === null) return { skipped: 'no rest after the first lift' };
    const sm0 = calls.filter((c) => c.smooth).length;
    native.call(s, { top: y, behavior: 'instant' });
    const t2 = performance.now();
    while (calls.filter((c) => c.smooth).length === sm0 && performance.now() - t2 < 1500) await frame();
    if (calls.filter((c) => c.smooth).length === sm0) return { skipped: 'the second settle never started' };
    await wait(120);
    const p = (type) => s.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, pointerId: 8 }));
    down = true; p('pointerdown'); await wait(40); down = false; p('pointerup');
    const offAt = s.scrollTop;
    await wait(60); down = true; p('pointerdown'); await wait(300); down = false; p('pointerup');
    const lift2 = performance.now();
    while (performance.now() - lift2 < 2500) {
      await wait(100);
      const a = s.scrollTop; await frame(); await frame();
      if (!anim && Math.abs(s.scrollTop - a) <= 0.01 && performance.now() - lift2 > 400) {
        return { offAt: Math.round(offAt * 100) / 100, rest: s.scrollTop, onStop: h.stops().some((v) => Math.abs(v - s.scrollTop) <= 0.5) };
      }
    }
    return { offAt: Math.round(offAt * 100) / 100, rest: null, onStop: false };
  })();
  // (4) a cancelled press (review P2): the landing timer armed by a release must not fire after a later press's cancel
  const cancelled = await (async () => {
    if (restAfterSecond?.onStop !== true) return { skipped: 'no rest after the double press' };
    const sm0 = calls.filter((c) => c.smooth).length;
    native.call(s, { top: y, behavior: 'instant' });
    const t3 = performance.now();
    while (calls.filter((c) => c.smooth).length === sm0 && performance.now() - t3 < 1500) await frame();
    if (calls.filter((c) => c.smooth).length === sm0) return { skipped: 'the third settle never started' };
    await wait(120);
    const p = (type) => s.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, pointerId: 9 }));
    down = true; p('pointerdown'); await wait(40); down = false;
    // the release, the second press and its cancel run in one task, so the leaf's 150 ms landing timer armed at the
    // release is still pending at the cancel however late this page's timers fire (they ran ~100 ms late under load);
    // a stall inside a dispatch still counts against the race below
    const lift4 = performance.now(); // before the release's dispatch
    p('pointerup');
    down = true; p('pointerdown');
    const c0 = calls.length; // before the cancel's dispatch: a settle its own handler starts counts
    p('pointercancel'); // the finger stays: down remains true
    const raceMs = Math.round(performance.now() - lift4);
    // the leaf's landing timer runs 150 ms from the release: a cancel at or past 140 ms did not stage the race
    if (raceMs >= 140) { down = false; return { skipped: 'the cancel came ' + raceMs + ' ms after the release, too late for the 150 ms landing timer' }; }
    await wait(300);
    const underFinger = calls.slice(c0).filter((c) => c.smooth).length;
    down = false;
    await wait(50); down = true; p('pointerdown'); await wait(40); down = false; p('pointerup');
    const lift3 = performance.now();
    while (performance.now() - lift3 < 2500) {
      await wait(100);
      const a = s.scrollTop; await frame(); await frame();
      if (!anim && Math.abs(s.scrollTop - a) <= 0.01 && performance.now() - lift3 > 400) {
        return { underFinger, raceMs, rest: s.scrollTop, onStop: h.stops().some((v) => Math.abs(v - s.scrollTop) <= 0.5) };
      }
    }
    return { underFinger, raceMs, rest: null, onStop: false };
  })();
  const res = { ...out, y, firstSmooth, pressTop, samples, settleTarget: firstSmooth.to, second: restAfterSecond, cancelled,
    travelLeft: samples.length > 1 ? Math.round(Math.abs(samples[1] - firstSmooth.to) * 100) / 100 : null,
    drift: samples.length > 1 ? Math.round(Math.max(...samples.slice(1).map((v) => Math.abs(v - samples[1]))) * 100) / 100 : null,
    smoothWhileDown: calls.slice(0, callsAtLift).filter((c) => c.smooth && c.down).length,
    rest, restOnStop: rest === null ? null : h.stops().some((v) => Math.abs(v - rest) <= 0.5),
    firstCallAfterLiftMs: after.length ? Math.round(after[0].at - liftAt) : null, callsAfterLift: after.length };
  done();
  return res;
})()`;

/** Judge the lab's data: [name, ok, detail] rows (UNJUDGEABLE is a red row, never a skip). */
export function judgeFoldPress(L) {
  const d = JSON.stringify(L);
  if (!L || L.err) return [['fold GH-1168: UNJUDGEABLE — the press lab did not run', false, d]];
  if (!(L.travelLeft >= 3)) return [['fold GH-1168: UNJUDGEABLE — under 3 px of travel left at the drift baseline (the press came too late)', false, d]];
  return [
    ['fold GH-1168: a press stops a settle already running — the port holds still under the pointer (drift <= 0.5 px from the second frame) and no settle starts while it is down',
      L.drift !== null && L.drift <= 0.5 && L.smoothWhileDown === 0, d],
    ['fold GH-1168: the lift lands a stopped settle — the port rests on a stop within 2.5 s, and the landing starts at least 140 ms after the release',
      L.restOnStop === true && (L.firstCallAfterLiftMs === null || L.firstCallAfterLiftMs >= 140), d],
    ['fold GH-1168: a second press before the landing keeps the debt — after the second release the port rests on a stop within 2.5 s',
      L.second?.onStop === true, d],
    L.cancelled?.skipped
      ? [`fold GH-1168: UNJUDGEABLE — row (4) did not stage its race: ${L.cancelled.skipped}`, false, d]
      : ['fold GH-1168: a cancelled press lands nothing under the finger and keeps the debt — no settle starts in the 300 ms the finger stays after a pointercancel, and the next tap\'s release lands the port on a stop within 2.5 s',
        L.cancelled?.underFinger === 0 && L.cancelled?.onStop === true, d],
  ];
}
