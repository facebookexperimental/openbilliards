// Copyright (c) Meta Platforms, Inc. and affiliates.

// page-press.mjs — a synthesized mouse press judged the way the PAGE saw it
// (#928 e2e-play P-HOLD; the #878 e2e-shell D pattern, switchux 8d4a7065).
//
// A CDP press is two round trips (mousePressed … mouseReleased) with a node
// sleep between them. On a loaded box the release can arrive late (a short
// press becomes a hold — #878) or after the target moved under a resting
// pointer (the fold-snap re-settle: the release lands beside the label —
// e2e-play's P-HOLD(a) class). Neither is a verdict on the app. Capture
// listeners stamp the next pointerdown and pointerup — time and whether each
// target sits inside `sel` — so an arm judges only presses the page actually
// saw as intended, presses again (bounded) otherwise, and names a run-out as
// UNJUDGEABLE instead of reading it as a product red.
// NULL MEANS UNSEEN, NEVER A PASS: the stamps are window-capture listeners
// registered at runtime, so a boot-time window-capture listener that calls
// stopImmediatePropagation (shell.js gatePointerDown on a canvas press while
// the hall is open — switchux #1121) runs first and the stamps never fire.
// Callers must treat down/up/ms/downOn/upOn === null as UNJUDGEABLE (red).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Page expression arming the stamps for the next pointerdown/pointerup. */
export const armPagePress = (sel) => `(() => {
  const P = window.__obPress = { down: null, up: null, downOn: null, upOn: null };
  const sel = ${JSON.stringify(sel ?? null)};
  const on = (e) => (sel === null ? null : !!(e.target instanceof Element && e.target.closest(sel)));
  window.addEventListener('pointerdown', (e) => { P.down = performance.now(); P.downOn = on(e); }, { capture: true, once: true });
  window.addEventListener('pointerup', (e) => { P.up = performance.now(); P.upOn = on(e); }, { capture: true, once: true });
  return true; })()`;

/**
 * Press at viewport point `pt` for `holdMs` (node-timed) and return the page's
 * own facts: { down, up, ms, downOn, upOn } (ms = up - down as the page timed
 * it; downOn/upOn = the target was inside `sel`, null without a selector).
 * down/up stay null when the page never saw the event.
 */
export async function pagePress(c, pt, holdMs, { sel = null, settleMs = 2000 } = {}) {
  await c.eval(armPagePress(sel));
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(holdMs);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  const end = Date.now() + settleMs;
  let r = null;
  for (;;) {
    r = await c.eval('({ ...window.__obPress })').catch(() => null);
    if ((r && r.up !== null) || Date.now() >= end) break;
    await sleep(50);
  }
  const f = r ?? { down: null, up: null, downOn: null, upOn: null };
  return { ...f, ms: f.down !== null && f.up !== null ? f.up - f.down : null };
}
